"""Controlled comparison of random versus DPC initialization in PCA space.

Both conditions use the same 2,437 participants, PC1--PC6, k=2, and sklearn
Lloyd parameters. The 30-run random condition changes only its initialization;
the published DPC-enhanced result is read as the deterministic comparator and
is not recomputed or modified.
"""

from __future__ import annotations

import csv
import os
from dataclasses import dataclass
from itertools import combinations
from pathlib import Path
from typing import Any, Iterable, Sequence

import numpy as np
from sklearn.cluster import KMeans
from sklearn.metrics import (
    adjusted_rand_score,
    calinski_harabasz_score,
    davies_bouldin_score,
    silhouette_score,
)


ROOT = Path(__file__).resolve().parents[3]
INTERIM = ROOT / "data" / "interim"
PCA_PATH = INTERIM / "clustering_pca_scores.csv"
SELECTED_K_PATH = INTERIM / "clustering_selected_k.csv"
ENHANCED_METRICS_PATH = INTERIM / "enhanced_kmeans_metrics.csv"
ENHANCED_SUMMARY_PATH = INTERIM / "enhanced_kmeans_run_summary.csv"
ENHANCED_REPRO_PATH = INTERIM / "enhanced_kmeans_reproducibility.csv"

RUNS_PATH = INTERIM / "dpc_comparison_random_runs.csv"
ASSIGNMENTS_PATH = INTERIM / "dpc_comparison_random_assignments.csv"
SUMMARY_PATH = INTERIM / "dpc_comparison_random_summary.csv"
STABILITY_PATH = INTERIM / "dpc_comparison_random_stability.csv"
COMPARISON_PATH = INTERIM / "dpc_initialization_comparison.csv"

IDENTIFIERS = ("PTID", "RID")
FEATURES = tuple(f"PC{number}" for number in range(1, 7))
EXPECTED_SHAPE = (2437, 6)
EXPECTED_K = 2
SEEDS = tuple(range(30))
N_INIT = 1
MAX_ITER = 300
TOLERANCE = 1e-4
ALGORITHM = "lloyd"


@dataclass(frozen=True)
class RandomPCARun:
    run_number: int
    seed: int
    labels: np.ndarray
    inertia: float
    iterations: int
    cluster_sizes: tuple[int, ...]
    silhouette: float
    davies_bouldin: float
    calinski_harabasz: float


def _require_finite(name: str, values: np.ndarray) -> None:
    if not np.isfinite(values).all():
        raise AssertionError(f"{name} contains NaN or infinite values")


def load_locked_inputs() -> tuple[list[str], list[str], np.ndarray, int, dict[str, float], dict[str, str]]:
    """Validate PCA/k and load the published DPC comparator without rerunning it."""
    if not PCA_PATH.is_file():
        raise FileNotFoundError(PCA_PATH)
    ptids: list[str] = []
    rids: list[str] = []
    rows: list[list[float]] = []
    with PCA_PATH.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        expected_columns = [*IDENTIFIERS, *FEATURES]
        if reader.fieldnames != expected_columns:
            raise AssertionError(
                f"PCA columns are {reader.fieldnames}; expected exactly {expected_columns}"
            )
        for csv_line, row in enumerate(reader, start=2):
            ptid = row["PTID"].strip()
            rid = row["RID"].strip()
            if not ptid or not rid:
                raise AssertionError(f"Blank PCA identifier at CSV line {csv_line}")
            try:
                coordinates = [float(row[feature]) for feature in FEATURES]
            except (TypeError, ValueError) as exc:
                raise AssertionError(f"Invalid PCA score at CSV line {csv_line}") from exc
            ptids.append(ptid)
            rids.append(rid)
            rows.append(coordinates)
    X = np.asarray(rows, dtype=np.float64)
    if X.shape != EXPECTED_SHAPE:
        raise AssertionError(f"PCA matrix shape is {X.shape}; expected {EXPECTED_SHAPE}")
    _require_finite("PCA matrix", X)
    if len(set(ptids)) != len(ptids) or len(set(rids)) != len(rids):
        raise AssertionError("PTID and RID must each be unique")

    with SELECTED_K_PATH.open("r", encoding="utf-8-sig", newline="") as handle:
        k_rows = list(csv.DictReader(handle))
    if len(k_rows) != 1 or "selected_k" not in k_rows[0]:
        raise AssertionError("Selected-k artifact must contain exactly one selected_k row")
    selected_k = int(k_rows[0]["selected_k"])
    if selected_k != EXPECTED_K:
        raise AssertionError(f"SOP 3 ablation requires locked k=2; observed {selected_k}")

    with ENHANCED_METRICS_PATH.open("r", encoding="utf-8-sig", newline="") as handle:
        metric_rows = list(csv.DictReader(handle))
    dpc_metrics = {row["metric"]: float(row["value"]) for row in metric_rows}
    expected_metrics = {
        "silhouette_coefficient",
        "davies_bouldin_index",
        "calinski_harabasz_index",
    }
    if set(dpc_metrics) != expected_metrics:
        raise AssertionError("Enhanced metric artifact has unexpected contents")
    _require_finite("Published DPC metrics", np.asarray(list(dpc_metrics.values())))

    with ENHANCED_SUMMARY_PATH.open("r", encoding="utf-8-sig", newline="") as handle:
        dpc_summary = {row["metric"]: row["value"] for row in csv.DictReader(handle)}
    if (
        dpc_summary.get("selected_k") != "2"
        or dpc_summary.get("input_rows") != "2437"
        or dpc_summary.get("input_features") != "6"
        or dpc_summary.get("iterations") != "12"
        or dpc_summary.get("cluster_0_size") != "1553"
        or dpc_summary.get("cluster_1_size") != "884"
        or dpc_summary.get("reproducibility_passed") != "True"
    ):
        raise AssertionError("Published DPC run summary differs from the locked state")

    with ENHANCED_REPRO_PATH.open("r", encoding="utf-8-sig", newline="") as handle:
        repro_rows = list(csv.DictReader(handle))
    if len(repro_rows) != 3 or any(row["overall_pass"] != "True" for row in repro_rows):
        raise AssertionError("Published DPC reproducibility artifact did not pass three checks")
    return ptids, rids, X, selected_k, dpc_metrics, dpc_summary


def fit_random_pca_kmeans(X: np.ndarray, seed: int, run_number: int) -> RandomPCARun:
    """Fit one retained PCA-space random-initialization comparator run."""
    model = KMeans(
        n_clusters=EXPECTED_K,
        init="random",
        n_init=N_INIT,
        max_iter=MAX_ITER,
        tol=TOLERANCE,
        algorithm=ALGORITHM,
        random_state=seed,
    )
    labels = np.asarray(model.fit_predict(X), dtype=np.int64)
    if labels.shape != (EXPECTED_SHAPE[0],) or set(labels.tolist()) != {0, 1}:
        raise AssertionError(f"Seed {seed} returned invalid cluster assignments")
    cluster_sizes = tuple(int(np.count_nonzero(labels == label)) for label in range(EXPECTED_K))
    if sum(cluster_sizes) != EXPECTED_SHAPE[0]:
        raise AssertionError(f"Seed {seed} cluster sizes do not sum to 2,437")
    silhouette = float(silhouette_score(X, labels, metric="euclidean"))
    davies_bouldin = float(davies_bouldin_score(X, labels))
    calinski_harabasz = float(calinski_harabasz_score(X, labels))
    _require_finite(
        f"Seed {seed} outputs",
        np.asarray(
            [model.inertia_, model.n_iter_, silhouette, davies_bouldin, calinski_harabasz]
        ),
    )
    return RandomPCARun(
        run_number=run_number,
        seed=seed,
        labels=labels,
        inertia=float(model.inertia_),
        iterations=int(model.n_iter_),
        cluster_sizes=cluster_sizes,
        silhouette=silhouette,
        davies_bouldin=davies_bouldin,
        calinski_harabasz=calinski_harabasz,
    )


def canonicalize_partition(labels: Sequence[int]) -> tuple[int, ...]:
    """Map labels by first appearance, making partition identity label-invariant."""
    mapping: dict[int, int] = {}
    canonical: list[int] = []
    for raw_label in labels:
        label = int(raw_label)
        if label not in mapping:
            mapping[label] = len(mapping)
        canonical.append(mapping[label])
    return tuple(canonical)


def _descriptive(values: Sequence[float]) -> dict[str, float]:
    numeric = np.asarray(values, dtype=np.float64)
    q1, median, q3 = np.quantile(numeric, [0.25, 0.5, 0.75], method="linear")
    return {
        "mean": float(np.mean(numeric)),
        "standard_deviation_ddof_1": float(np.std(numeric, ddof=1)),
        "median": float(median),
        "minimum": float(np.min(numeric)),
        "maximum": float(np.max(numeric)),
        "first_quartile": float(q1),
        "third_quartile": float(q3),
        "interquartile_range": float(q3 - q1),
    }


def _write_csv(path: Path, fieldnames: Iterable[str], rows: Iterable[dict[str, Any]]) -> None:
    columns = list(fieldnames)
    temporary = path.with_suffix(path.suffix + ".tmp")
    with temporary.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns, extrasaction="raise")
        writer.writeheader()
        writer.writerows(rows)
    os.replace(temporary, path)


def write_outputs(
    ptids: Sequence[str],
    rids: Sequence[str],
    runs: Sequence[RandomPCARun],
    dpc_metrics: dict[str, float],
    dpc_summary: dict[str, str],
) -> None:
    """Write the five requested same-space ablation artifacts."""
    _write_csv(
        RUNS_PATH,
        (
            "run_number",
            "seed",
            "k",
            "init",
            "n_init",
            "max_iter",
            "tol",
            "algorithm",
            "inertia",
            "iterations",
            "converged_before_max_iter",
            "cluster_sizes",
            "silhouette",
            "davies_bouldin",
            "calinski_harabasz",
        ),
        (
            {
                "run_number": run.run_number,
                "seed": run.seed,
                "k": EXPECTED_K,
                "init": "random",
                "n_init": N_INIT,
                "max_iter": MAX_ITER,
                "tol": TOLERANCE,
                "algorithm": ALGORITHM,
                "inertia": run.inertia,
                "iterations": run.iterations,
                "converged_before_max_iter": run.iterations < MAX_ITER,
                "cluster_sizes": "|".join(
                    f"{label}:{size}" for label, size in enumerate(run.cluster_sizes)
                ),
                "silhouette": run.silhouette,
                "davies_bouldin": run.davies_bouldin,
                "calinski_harabasz": run.calinski_harabasz,
            }
            for run in runs
        ),
    )

    _write_csv(
        ASSIGNMENTS_PATH,
        ("run_number", "seed", "PTID", "RID", "cluster_label"),
        (
            {
                "run_number": run.run_number,
                "seed": run.seed,
                "PTID": ptid,
                "RID": rid,
                "cluster_label": int(label),
            }
            for run in runs
            for ptid, rid, label in zip(ptids, rids, run.labels)
        ),
    )

    values_by_metric = {
        "silhouette": [run.silhouette for run in runs],
        "davies_bouldin": [run.davies_bouldin for run in runs],
        "calinski_harabasz": [run.calinski_harabasz for run in runs],
        "inertia": [run.inertia for run in runs],
        "iterations": [float(run.iterations) for run in runs],
    }
    summaries = {
        metric: _descriptive(values) for metric, values in values_by_metric.items()
    }
    _write_csv(
        SUMMARY_PATH,
        (
            "metric",
            "mean",
            "standard_deviation_ddof_1",
            "median",
            "minimum",
            "maximum",
            "first_quartile",
            "third_quartile",
            "interquartile_range",
            "run_count",
        ),
        (
            {"metric": metric, **statistics, "run_count": len(runs)}
            for metric, statistics in summaries.items()
        ),
    )

    pairwise_rows: list[dict[str, Any]] = []
    for run_a, run_b in combinations(runs, 2):
        pairwise_rows.append(
            {
                "record_type": "pairwise_ari",
                "run_a": run_a.run_number,
                "seed_a": run_a.seed,
                "run_b": run_b.run_number,
                "seed_b": run_b.seed,
                "adjusted_rand_index": float(
                    adjusted_rand_score(run_a.labels, run_b.labels)
                ),
                "statistic": "",
                "value": "",
                "canonicalization_method": "",
            }
        )
    ari_values = np.asarray(
        [row["adjusted_rand_index"] for row in pairwise_rows], dtype=np.float64
    )
    partitions = {canonicalize_partition(run.labels) for run in runs}
    stability_rows = list(pairwise_rows)
    for statistic, value in (
        ("mean_pairwise_ari", float(np.mean(ari_values))),
        ("median_pairwise_ari", float(np.median(ari_values))),
        ("minimum_pairwise_ari", float(np.min(ari_values))),
        ("maximum_pairwise_ari", float(np.max(ari_values))),
        ("distinct_label_invariant_partitions", len(partitions)),
    ):
        stability_rows.append(
            {
                "record_type": "summary",
                "run_a": "",
                "seed_a": "",
                "run_b": "",
                "seed_b": "",
                "adjusted_rand_index": "",
                "statistic": statistic,
                "value": value,
                "canonicalization_method": (
                    "labels remapped to 0,1,... by first participant occurrence; "
                    "label permutations share one canonical tuple"
                    if statistic == "distinct_label_invariant_partitions"
                    else ""
                ),
            }
        )
    _write_csv(
        STABILITY_PATH,
        (
            "record_type",
            "run_a",
            "seed_a",
            "run_b",
            "seed_b",
            "adjusted_rand_index",
            "statistic",
            "value",
            "canonicalization_method",
        ),
        stability_rows,
    )

    dpc_mapping = {
        "silhouette": dpc_metrics["silhouette_coefficient"],
        "davies_bouldin": dpc_metrics["davies_bouldin_index"],
        "calinski_harabasz": dpc_metrics["calinski_harabasz_index"],
    }
    directions = {
        "silhouette": "higher_is_better",
        "davies_bouldin": "lower_is_better",
        "calinski_harabasz": "higher_is_better",
    }
    comparison_rows: list[dict[str, Any]] = []
    for metric, dpc_value in dpc_mapping.items():
        stats = summaries[metric]
        signed_difference = dpc_value - stats["mean"]
        if directions[metric] == "higher_is_better":
            assessment = "better" if signed_difference > 0 else "worse" if signed_difference < 0 else "equal"
        else:
            assessment = "better" if signed_difference < 0 else "worse" if signed_difference > 0 else "equal"
        if dpc_value < stats["minimum"]:
            range_position = "below_random_range"
        elif dpc_value > stats["maximum"]:
            range_position = "above_random_range"
        else:
            range_position = "within_random_range"
        comparison_rows.append(
            {
                "metric": metric,
                "direction": directions[metric],
                "dpc_value": dpc_value,
                "random_mean": stats["mean"],
                "random_standard_deviation_ddof_1": stats[
                    "standard_deviation_ddof_1"
                ],
                "random_median": stats["median"],
                "random_minimum": stats["minimum"],
                "random_maximum": stats["maximum"],
                "signed_difference_from_random_mean": signed_difference,
                "absolute_difference_from_random_mean": abs(signed_difference),
                "percent_difference_from_random_mean": (
                    100.0 * signed_difference / abs(stats["mean"])
                    if stats["mean"] != 0.0
                    else ""
                ),
                "dpc_assessment": assessment,
                "dpc_range_position": range_position,
                "random_distinct_partitions": len(partitions),
                "random_mean_pairwise_ari": float(np.mean(ari_values)),
                "dpc_reproducibility_runs": 3,
                "dpc_assignments_reproduced": True,
                "dpc_metrics_reproduced": True,
                "dpc_iterations": dpc_summary["iterations"],
                "dpc_cluster_sizes": (
                    f"0:{dpc_summary['cluster_0_size']}|1:{dpc_summary['cluster_1_size']}"
                ),
                "ablation_scope": (
                    "same participants, PC1-PC6, k=2, and Lloyd parameters; "
                    "clustering-stage difference is centroid initialization"
                ),
            }
        )
    _write_csv(
        COMPARISON_PATH,
        (
            "metric",
            "direction",
            "dpc_value",
            "random_mean",
            "random_standard_deviation_ddof_1",
            "random_median",
            "random_minimum",
            "random_maximum",
            "signed_difference_from_random_mean",
            "absolute_difference_from_random_mean",
            "percent_difference_from_random_mean",
            "dpc_assessment",
            "dpc_range_position",
            "random_distinct_partitions",
            "random_mean_pairwise_ari",
            "dpc_reproducibility_runs",
            "dpc_assignments_reproduced",
            "dpc_metrics_reproduced",
            "dpc_iterations",
            "dpc_cluster_sizes",
            "ablation_scope",
        ),
        comparison_rows,
    )


def main() -> None:
    ptids, rids, X, selected_k, dpc_metrics, dpc_summary = load_locked_inputs()
    print(f"validated_pca_shape={X.shape}", flush=True)
    print(f"selected_k={selected_k}", flush=True)
    runs = [
        fit_random_pca_kmeans(X, seed, run_number)
        for run_number, seed in enumerate(SEEDS, start=1)
    ]
    if len(runs) != 30 or tuple(run.seed for run in runs) != SEEDS:
        raise AssertionError("The locked 30-run seed protocol was not followed")
    print("pca_random_runs_complete=30", flush=True)
    write_outputs(ptids, rids, runs, dpc_metrics, dpc_summary)
    print("seeds=0-29")
    print("all_runs_retained=True")
    print("best_run_selection_used=False")


if __name__ == "__main__":
    main()
