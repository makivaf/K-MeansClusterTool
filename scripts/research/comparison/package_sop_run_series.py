"""Package existing SOP 3 run records only; stdlib-only, never fits a model.

Run this file directly to extend both existing SOP aggregates without invoking
build_sop_evaluation.py or any scientific pipeline. The full builder also calls
attach_random_runs so subsequent intentional regeneration retains this contract.
"""
from __future__ import annotations

import csv
import hashlib
import json
import math
import os
import statistics
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SOURCE = "data/interim/dpc_comparison_random_runs.csv"
OUTPUTS = ("apps/api/artifacts/sop_evaluation_summary.json", "data/interim/sop_evaluation_summary.json")
METRICS = {"silhouette": "silhouette", "daviesBouldin": "davies_bouldin", "calinskiHarabasz": "calinski_harabasz"}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def attach_random_runs(payload, root=ROOT):
    """Validate the existing evidence before adding only run-level allowlisted fields."""
    for source, expected in payload["provenance"]["sourceSha256"].items():
        require(Path(source).parent.as_posix() == "data/interim", "Unexpected source path")
        require(hashlib.sha256((root / source).read_bytes()).hexdigest() == expected, f"Source drift: {source}")
    source_bytes = (root / SOURCE).read_bytes()
    rows = list(csv.DictReader(source_bytes.decode("utf-8-sig").splitlines()))
    require(len(rows) == 30, "Expected exactly 30 random runs")
    sop3 = payload["sop3"]
    settings = sop3["settings"]
    require(settings["representation"] == "PC1-PC6", "Expected PCA input")
    runs = []
    for index, row in enumerate(rows):
        require(int(row["run_number"]) == index + 1 and int(row["seed"]) == index == settings["randomSeeds"][index], "Invalid run/seed order")
        require(row["init"] == "random" and row["algorithm"] == settings["algorithm"], "Initialization or algorithm mismatch")
        for column, setting in (("k", "k"), ("n_init", "nInit"), ("max_iter", "maxIter")):
            require(int(row[column]) == settings[setting], f"Protocol mismatch: {column}")
        require(float(row["tol"]) == settings["tolerance"], "Tolerance mismatch")
        sizes = [part.split(":") for part in row["cluster_sizes"].split("|")]
        require([label for label, _ in sizes] == ["0", "1"], "Unexpected cluster labels")
        run = {"runNumber": index + 1, "seed": int(row["seed"]),
               **{field: float(row[column]) for field, column in METRICS.items()},
               "iterations": int(row["iterations"]), "clusterSizes": [int(size) for _, size in sizes]}
        require(all(math.isfinite(run[field]) for field in METRICS), "Nonfinite metric")
        require(-1 <= run["silhouette"] <= 1 and run["daviesBouldin"] >= 0 and run["calinskiHarabasz"] >= 0, "Invalid metric range")
        require(0 < run["iterations"] <= settings["maxIter"], "Invalid iteration count")
        require(all(size > 0 for size in run["clusterSizes"]) and sum(run["clusterSizes"]) == payload["cohortN"], "Invalid cluster sizes")
        if index < 3:
            first = sop3["firstThreeRandomRuns"][index]
            require(all(math.isclose(run[field], first[field], rel_tol=0, abs_tol=1e-10) for field in METRICS), "First-three metrics differ")
            require(all(run[field] == first[field] for field in ("runNumber", "seed", "iterations", "clusterSizes")), "First-three metadata differs")
        runs.append(run)
    # Check summaries, including inertia, without altering any stored results.
    for column in (*METRICS.values(), "iterations", "inertia"):
        values = [float(row[column]) for row in rows]
        require(all(math.isfinite(value) for value in values), "Nonfinite source value")
        actual = {"mean": statistics.mean(values), "standardDeviation": statistics.stdev(values),
                  "minimum": min(values), "maximum": max(values)}
        expected = sop3["randomRunSummary"][column]
        require(all(math.isclose(value, expected[key], rel_tol=0, abs_tol=1e-10) for key, value in actual.items()), f"Packaged summary differs: {column}")
    sop3["randomRuns"] = runs
    payload["provenance"]["sourceSha256"][SOURCE] = hashlib.sha256(source_bytes).hexdigest()


def main():
    payloads = [json.loads((ROOT / output).read_text(encoding="utf-8")) for output in OUTPUTS]
    require(payloads[0] == payloads[1], "Existing SOP aggregate copies differ")
    payload = payloads[0]
    attach_random_runs(payload)
    serialized = json.dumps(payload, indent=2, allow_nan=False) + "\n"
    for output in OUTPUTS:
        destination = ROOT / output
        temporary = destination.with_suffix(".json.tmp")
        temporary.write_text(serialized, encoding="utf-8")
        os.replace(temporary, destination)
    print("Packaged 30 existing SOP 3 runs; source hashes and summaries verified; no models executed.")


if __name__ == "__main__":
    main()
