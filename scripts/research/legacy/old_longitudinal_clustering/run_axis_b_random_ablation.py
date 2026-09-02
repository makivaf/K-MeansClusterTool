"""Run the exact 30-seed same-space random-initialization baseline for Axis B."""

from __future__ import annotations

import json
from collections import Counter, defaultdict

import numpy as np
import pandas as pd

from axis_b_final_common import (
    ALGORITHM,
    ASSIGNMENTS_PATH,
    BASELINE_SEEDS,
    FEATURE,
    FINAL_METRICS_PATH,
    MAX_ITER,
    N_INIT,
    RANDOM_RUNS_PATH,
    RANDOM_SUMMARY_PATH,
    TOLERANCE,
    atomic_write_csv,
    atomic_write_json,
    fit_kmeans,
    frozen_hashes,
    load_slopes,
    result_dict,
)


def five_number_summary(values: list[float]) -> dict[str, float]:
    array = np.asarray(values, dtype=np.float64)
    return {
        "mean": float(array.mean()),
        "standard_deviation_sample_ddof_1": float(array.std(ddof=1)),
        "minimum": float(array.min()),
        "median": float(np.median(array)),
        "maximum": float(array.max()),
    }


def main() -> None:
    hashes = frozen_hashes()
    if not ASSIGNMENTS_PATH.is_file() or not FINAL_METRICS_PATH.is_file():
        raise FileNotFoundError("Run run_axis_b_final_clustering.py first")
    frame = load_slopes()
    with FINAL_METRICS_PATH.open("r", encoding="utf-8") as handle:
        primary = json.load(handle)
    primary_hash = primary["result"]["label_invariant_partition_sha256"]

    rows: list[dict[str, object]] = []
    results = []
    seeds_by_partition: dict[str, list[int]] = defaultdict(list)
    for run_number, seed in enumerate(BASELINE_SEEDS, start=1):
        result = fit_kmeans(frame, seed=seed, init="random", n_init=N_INIT)
        results.append(result)
        seeds_by_partition[result.partition_hash].append(seed)
        rows.append({
            "run_number": run_number,
            "seed": seed,
            "iterations": result.iterations,
            "converged_before_max_iter": result.iterations < MAX_ITER,
            "inertia": result.inertia,
            "silhouette": result.silhouette,
            "davies_bouldin": result.davies_bouldin,
            "calinski_harabasz": result.calinski_harabasz,
            "ordered_cluster_1_n": result.ordered_cluster_sizes[0],
            "ordered_cluster_2_n": result.ordered_cluster_sizes[1],
            "ordered_cluster_1_centroid": result.ordered_centroids[0],
            "ordered_cluster_2_centroid": result.ordered_centroids[1],
            "label_invariant_partition_sha256": result.partition_hash,
            "matches_primary_partition": result.partition_hash == primary_hash,
        })
    if [int(row["seed"]) for row in rows] != list(range(30)):
        raise AssertionError("The baseline did not retain exactly seeds 0 through 29")

    atomic_write_csv(RANDOM_RUNS_PATH, list(rows[0]), rows)
    metric_values = {
        "inertia": [result.inertia for result in results],
        "silhouette": [result.silhouette for result in results],
        "davies_bouldin": [result.davies_bouldin for result in results],
        "calinski_harabasz": [result.calinski_harabasz for result in results],
        "iteration_count": [float(result.iterations) for result in results],
    }
    frequencies = Counter(result.partition_hash for result in results)
    ordered_frequencies = sorted(frequencies.items(), key=lambda item: (-item[1], item[0]))
    dominant_hash, dominant_count = ordered_frequencies[0]
    matching_seeds = [seed for seed, result in zip(BASELINE_SEEDS, results) if result.partition_hash == primary_hash]
    summary = {
        "status": "AXIS_B_RANDOM_INITIALIZATION_BASELINE_COMPLETE",
        "configuration": {
            "input": f"raw {FEATURE}",
            "k": 2,
            "init": "random",
            "n_init": N_INIT,
            "seeds": list(BASELINE_SEEDS),
            "runs": len(BASELINE_SEEDS),
            "max_iter": MAX_ITER,
            "tol": TOLERANCE,
            "algorithm": ALGORITHM,
            "same_space_as_primary": True,
            "all_runs_retained_without_best_run_selection": True,
        },
        "metric_summary": {name: five_number_summary(values) for name, values in metric_values.items()},
        "partitions": {
            "distinct_label_invariant_partitions": len(frequencies),
            "frequencies": [
                {
                    "partition_sha256": partition,
                    "frequency": count,
                    "percent_of_runs": 100.0 * count / len(results),
                    "seeds": seeds_by_partition[partition],
                    "representative_result": result_dict(results[seeds_by_partition[partition][0]]),
                }
                for partition, count in ordered_frequencies
            ],
            "dominant_partition_sha256": dominant_hash,
            "dominant_frequency": dominant_count,
            "dominant_percent": 100.0 * dominant_count / len(results),
            "one_partition_dominates": dominant_count > len(results) / 2,
        },
        "primary_comparison": {
            "primary_partition_sha256": primary_hash,
            "matches_any_random_partition": bool(matching_seeds),
            "matching_seeds": matching_seeds,
            "matching_frequency": len(matching_seeds),
            "matching_percent": 100.0 * len(matching_seeds) / len(results),
            "primary_is_seed_0_prespecified_run": 0 in matching_seeds,
            "superiority_claimed": False,
            "interpretation": (
                "The reported primary model is the pre-specified seed-0 standard K-Means run. "
                "The 30-run distribution quantifies initialization variability; tiny floating-point "
                "metric differences are not treated as substantive superiority."
            ),
        },
        "integrity": {
            "frozen_input_hashes": hashes,
            "run_rows": len(rows),
            "all_runs_converged_before_max_iter": all(result.iterations < MAX_ITER for result in results),
        },
    }
    atomic_write_json(RANDOM_SUMMARY_PATH, summary)
    print(json.dumps({
        "runs": str(RANDOM_RUNS_PATH),
        "summary": str(RANDOM_SUMMARY_PATH),
        "distinct_partitions": len(frequencies),
        "dominant_frequency": dominant_count,
        "primary_matching_seeds": matching_seeds,
    }, indent=2))


if __name__ == "__main__":
    main()
