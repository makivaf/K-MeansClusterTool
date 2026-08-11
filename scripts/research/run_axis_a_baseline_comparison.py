"""Run the locked 30-replication Axis A random-initialization baseline.

The baseline uses the same imputed, standardized cohort but deliberately omits
PCA, NbClust, and DPC-init. sklearn's Lloyd implementation is unchanged; the
outer seed loop (0--29) is the experimental replication mechanism, and every
run is retained without best-run selection.
"""

from __future__ import annotations

import csv
import math
import os
from collections import Counter
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


ROOT = Path(__file__).resolve().parents[2]
INTERIM = ROOT / "data" / "interim"
STANDARDIZED_PATH = INTERIM / "axis_a_standardized.csv"
ENHANCED_METRICS_PATH = INTERIM / "axis_a_enhanced_metrics.csv"

K_SELECTION_PATH = INTERIM / "axis_a_baseline_k_selection.csv"
RUNS_PATH = INTERIM / "axis_a_baseline_runs.csv"
ASSIGNMENTS_PATH = INTERIM / "axis_a_baseline_assignments.csv"
SUMMARY_PATH = INTERIM / "axis_a_baseline_summary.csv"
STABILITY_PATH = INTERIM / "axis_a_baseline_stability.csv"
CUMULATIVE_QC_PATH = INTERIM / "axis_a_baseline_cumulative_qc.csv"
COMPARISON_PATH = INTERIM / "axis_a_baseline_vs_enhanced.csv"

IDENTIFIERS = ("PTID", "RID")
FEATURES = (
    "MMSE",
    "ADAS13",
    "LMI",
    "LMD",
    "TMT_A",
    "TMT_B",
    "CATEGORY_FLUENCY_ANIMALS",
    "RAVLT_IMMEDIATE",
    "RAVLT_DELAYED",
    "RAVLT_FORGETTING",
    "CDRSB",
    "FAQ",
    "GDS",
)
EXPECTED_SHAPE = (2437, 13)
K_CANDIDATES = tuple(range(2, 11))
K_SELECTION_SEED = 0
BASELINE_SEEDS = tuple(range(30))
N_INIT = 1
MAX_ITER = 300
TOLERANCE = 1e-4
ALGORITHM = "lloyd"
QC_CHECKPOINTS = (10, 20, 30)


@dataclass(frozen=True)
class BaselineRun:
    run_number: int
    seed: int
    k: int
    labels: np.ndarray
    inertia: float
    iterations: int
    silhouette: float
    davies_bouldin: float
    calinski_harabasz: float
    cluster_sizes: tuple[int, ...]


def _require_finite(name: str, values: np.ndarray) -> None:
    if not np.isfinite(values).all():
        raise AssertionError(f"{name} contains NaN or infinite values")


def load_baseline_input() -> tuple[list[str], list[str], np.ndarray]:
    """Load the locked standardized 13-feature matrix without transforming it."""
    if not STANDARDIZED_PATH.is_file():
        raise FileNotFoundError(STANDARDIZED_PATH)
    ptids: list[str] = []
    rids: list[str] = []
    values: list[list[float]] = []
    with STANDARDIZED_PATH.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        expected_columns = [*IDENTIFIERS, *FEATURES]
        if reader.fieldnames != expected_columns:
            raise AssertionError(
                f"Standardized columns are {reader.fieldnames}; expected {expected_columns}"
            )
        if any(column in reader.fieldnames for column in ("BNT", "NPIQ")):
            raise AssertionError("BNT or NPIQ entered the baseline input")
        if any(column.startswith("PC") for column in reader.fieldnames):
            raise AssertionError("PCA columns entered the baseline input")
        for csv_line, row in enumerate(reader, start=2):
            ptid = row["PTID"].strip()
            rid = row["RID"].strip()
            if not ptid or not rid:
                raise AssertionError(f"Blank identifier at standardized CSV line {csv_line}")
            try:
                feature_values = [float(row[feature]) for feature in FEATURES]
            except (TypeError, ValueError) as exc:
                raise AssertionError(
                    f"Invalid standardized value at CSV line {csv_line}"
                ) from exc
            ptids.append(ptid)
            rids.append(rid)
            values.append(feature_values)

    X = np.asarray(values, dtype=np.float64)
    if X.shape != EXPECTED_SHAPE:
        raise AssertionError(f"Baseline matrix shape is {X.shape}; expected {EXPECTED_SHAPE}")
    _require_finite("Baseline standardized matrix", X)
    if len(set(ptids)) != len(ptids):
        raise AssertionError("PTID is not unique in the standardized baseline input")
    if len(set(rids)) != len(rids):
        raise AssertionError("RID is not unique in the standardized baseline input")
    return ptids, rids, X


def fit_random_kmeans(
    X: np.ndarray,
    k: int,
    seed: int,
    run_number: int,
) -> BaselineRun:
    """Fit one retained baseline run with one random initialization."""
    model = KMeans(
        n_clusters=k,
        init="random",
        n_init=N_INIT,
        random_state=seed,
        max_iter=MAX_ITER,
        tol=TOLERANCE,
        algorithm=ALGORITHM,
    )
    labels = np.asarray(model.fit_predict(X), dtype=np.int64)
    if labels.shape != (EXPECTED_SHAPE[0],):
        raise AssertionError(f"Seed {seed} returned an invalid assignment shape")
    if set(labels.tolist()) != set(range(k)):
        raise AssertionError(f"Seed {seed} did not produce exactly {k} clusters")
    cluster_sizes = tuple(int(np.count_nonzero(labels == label)) for label in range(k))
    if sum(cluster_sizes) != EXPECTED_SHAPE[0]:
        raise AssertionError(f"Seed {seed} cluster sizes do not sum to 2,437")

    silhouette = float(silhouette_score(X, labels, metric="euclidean"))
    davies_bouldin = float(davies_bouldin_score(X, labels))
    calinski_harabasz = float(calinski_harabasz_score(X, labels))
    numeric = np.asarray(
        [model.inertia_, model.n_iter_, silhouette, davies_bouldin, calinski_harabasz],
        dtype=np.float64,
    )
    _require_finite(f"Seed {seed} baseline outputs", numeric)
    if int(model.n_iter_) > MAX_ITER:
        raise AssertionError(f"Seed {seed} exceeded max_iter")
    return BaselineRun(
        run_number=run_number,
        seed=seed,
        k=k,
        labels=labels,
        inertia=float(model.inertia_),
        iterations=int(model.n_iter_),
        silhouette=silhouette,
        davies_bouldin=davies_bouldin,
        calinski_harabasz=calinski_harabasz,
        cluster_sizes=cluster_sizes,
    )


def select_baseline_k(X: np.ndarray) -> tuple[int, list[BaselineRun]]:
    """Select baseline k by maximum fixed-seed Silhouette over exactly 2--10."""
    candidate_runs = [
        fit_random_kmeans(X, k, K_SELECTION_SEED, run_number=0)
        for k in K_CANDIDATES
    ]
    selected = min(candidate_runs, key=lambda run: (-run.silhouette, run.k))
    if selected.k not in K_CANDIDATES:
        raise AssertionError("Baseline k-selection returned an invalid k")
    return selected.k, candidate_runs


def run_baseline_replications(X: np.ndarray, baseline_k: int) -> list[BaselineRun]:
    """Execute and retain exactly 30 random-initialization runs, seeds 0--29."""
    runs = [
        fit_random_kmeans(X, baseline_k, seed, run_number=run_number)
        for run_number, seed in enumerate(BASELINE_SEEDS, start=1)
    ]
    if len(runs) != 30 or tuple(run.seed for run in runs) != BASELINE_SEEDS:
        raise AssertionError("The locked 30-run seed protocol was not followed")
    return runs


def canonicalize_partition(labels: Sequence[int]) -> tuple[int, ...]:
    """Canonicalize labels by first appearance so permutations compare equal."""
    mapping: dict[int, int] = {}
    canonical: list[int] = []
    for label in labels:
        label = int(label)
        if label not in mapping:
            mapping[label] = len(mapping)
        canonical.append(mapping[label])
    return tuple(canonical)


def _descriptive(values: Sequence[float]) -> dict[str, float]:
    numeric = np.asarray(values, dtype=np.float64)
    _require_finite("Descriptive-statistic input", numeric)
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


def _pairwise_ari(runs: Sequence[BaselineRun]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for run_a, run_b in combinations(runs, 2):
        rows.append(
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
    return rows


def load_enhanced_metrics() -> dict[str, float]:
    """Read the already published enhanced metrics without recomputing them."""
    if not ENHANCED_METRICS_PATH.is_file():
        raise FileNotFoundError(ENHANCED_METRICS_PATH)
    with ENHANCED_METRICS_PATH.open("r", encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))
    observed = {row["metric"]: float(row["value"]) for row in rows}
    required = {
        "silhouette_coefficient",
        "davies_bouldin_index",
        "calinski_harabasz_index",
    }
    if set(observed) != required:
        raise AssertionError(f"Enhanced metric artifact has unexpected metrics: {observed}")
    _require_finite("Enhanced metrics", np.asarray(list(observed.values())))
    return observed


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
    baseline_k: int,
    k_selection_runs: Sequence[BaselineRun],
    runs: Sequence[BaselineRun],
    enhanced_metrics: dict[str, float],
) -> None:
    """Write all requested baseline, stability, and comparison artifacts."""
    _write_csv(
        K_SELECTION_PATH,
        (
            "k",
            "selection_seed",
            "silhouette",
            "davies_bouldin",
            "calinski_harabasz",
            "inertia",
            "iterations",
            "cluster_sizes",
            "selected",
        ),
        (
            {
                "k": run.k,
                "selection_seed": run.seed,
                "silhouette": run.silhouette,
                "davies_bouldin": run.davies_bouldin,
                "calinski_harabasz": run.calinski_harabasz,
                "inertia": run.inertia,
                "iterations": run.iterations,
                "cluster_sizes": "|".join(
                    f"{label}:{size}" for label, size in enumerate(run.cluster_sizes)
                ),
                "selected": run.k == baseline_k,
            }
            for run in k_selection_runs
        ),
    )

    _write_csv(
        RUNS_PATH,
        (
            "run_number",
            "seed",
            "baseline_k",
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
                "baseline_k": run.k,
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

    metric_values = {
        "silhouette": [run.silhouette for run in runs],
        "davies_bouldin": [run.davies_bouldin for run in runs],
        "calinski_harabasz": [run.calinski_harabasz for run in runs],
        "inertia": [run.inertia for run in runs],
        "iterations": [float(run.iterations) for run in runs],
    }
    summaries = {metric: _descriptive(values) for metric, values in metric_values.items()}
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

    ari_rows = _pairwise_ari(runs)
    ari_values = [float(row["adjusted_rand_index"]) for row in ari_rows]
    ari_summary = {
        "mean_pairwise_ari": float(np.mean(ari_values)),
        "median_pairwise_ari": float(np.median(ari_values)),
        "minimum_pairwise_ari": float(np.min(ari_values)),
        "maximum_pairwise_ari": float(np.max(ari_values)),
    }
    canonical_partitions = {canonicalize_partition(run.labels) for run in runs}
    stability_rows = list(ari_rows)
    stability_rows.extend(
        {
            "record_type": "summary",
            "run_a": "",
            "seed_a": "",
            "run_b": "",
            "seed_b": "",
            "adjusted_rand_index": "",
            "statistic": statistic,
            "value": value,
            "canonicalization_method": "",
        }
        for statistic, value in ari_summary.items()
    )
    stability_rows.append(
        {
            "record_type": "summary",
            "run_a": "",
            "seed_a": "",
            "run_b": "",
            "seed_b": "",
            "adjusted_rand_index": "",
            "statistic": "distinct_label_invariant_partitions",
            "value": len(canonical_partitions),
            "canonicalization_method": (
                "labels remapped to 0,1,... by first participant occurrence; "
                "label permutations therefore share one canonical tuple"
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

    cumulative_rows: list[dict[str, Any]] = []
    for checkpoint in QC_CHECKPOINTS:
        subset = runs[:checkpoint]
        subset_ari = [
            adjusted_rand_score(run_a.labels, run_b.labels)
            for run_a, run_b in combinations(subset, 2)
        ]
        subset_partitions = {canonicalize_partition(run.labels) for run in subset}
        row: dict[str, Any] = {
            "runs_included": checkpoint,
            "seed_range": f"0-{checkpoint - 1}",
            "distinct_label_invariant_partitions": len(subset_partitions),
            "mean_pairwise_ari": float(np.mean(subset_ari)),
            "purpose": "descriptive_QC_only_not_an_early_stopping_rule",
        }
        for metric in ("silhouette", "davies_bouldin", "calinski_harabasz", "inertia"):
            values = [float(getattr(run, metric)) for run in subset]
            row[f"{metric}_mean"] = float(np.mean(values))
            row[f"{metric}_sd_ddof_1"] = float(np.std(values, ddof=1))
        cumulative_rows.append(row)
    _write_csv(
        CUMULATIVE_QC_PATH,
        (
            "runs_included",
            "seed_range",
            "silhouette_mean",
            "silhouette_sd_ddof_1",
            "davies_bouldin_mean",
            "davies_bouldin_sd_ddof_1",
            "calinski_harabasz_mean",
            "calinski_harabasz_sd_ddof_1",
            "inertia_mean",
            "inertia_sd_ddof_1",
            "distinct_label_invariant_partitions",
            "mean_pairwise_ari",
            "purpose",
        ),
        cumulative_rows,
    )

    enhanced_mapping = {
        "silhouette": enhanced_metrics["silhouette_coefficient"],
        "davies_bouldin": enhanced_metrics["davies_bouldin_index"],
        "calinski_harabasz": enhanced_metrics["calinski_harabasz_index"],
    }
    directions = {
        "silhouette": "higher_is_better",
        "davies_bouldin": "lower_is_better",
        "calinski_harabasz": "higher_is_better",
    }
    comparison_rows: list[dict[str, Any]] = []
    for metric, enhanced_value in enhanced_mapping.items():
        stats = summaries[metric]
        signed_difference = enhanced_value - stats["mean"]
        if directions[metric] == "higher_is_better":
            assessment = "better" if signed_difference > 0 else "worse" if signed_difference < 0 else "equal"
        else:
            assessment = "better" if signed_difference < 0 else "worse" if signed_difference > 0 else "equal"
        if enhanced_value < stats["minimum"]:
            range_position = "below_baseline_range"
        elif enhanced_value > stats["maximum"]:
            range_position = "above_baseline_range"
        else:
            range_position = "within_baseline_range"
        comparison_rows.append(
            {
                "metric": metric,
                "direction": directions[metric],
                "enhanced_value": enhanced_value,
                "baseline_mean": stats["mean"],
                "baseline_standard_deviation_ddof_1": stats[
                    "standard_deviation_ddof_1"
                ],
                "baseline_median": stats["median"],
                "baseline_minimum": stats["minimum"],
                "baseline_maximum": stats["maximum"],
                "signed_difference_from_baseline_mean": signed_difference,
                "absolute_difference_from_baseline_mean": abs(signed_difference),
                "percent_difference_from_baseline_mean": (
                    100.0 * signed_difference / abs(stats["mean"])
                    if stats["mean"] != 0.0
                    else ""
                ),
                "enhanced_assessment": assessment,
                "enhanced_range_position": range_position,
                "comparison_scope": (
                    "algorithmic comparison on one fixed participant dataset; "
                    "not independent participant samples and not a significance test"
                ),
            }
        )
    _write_csv(
        COMPARISON_PATH,
        (
            "metric",
            "direction",
            "enhanced_value",
            "baseline_mean",
            "baseline_standard_deviation_ddof_1",
            "baseline_median",
            "baseline_minimum",
            "baseline_maximum",
            "signed_difference_from_baseline_mean",
            "absolute_difference_from_baseline_mean",
            "percent_difference_from_baseline_mean",
            "enhanced_assessment",
            "enhanced_range_position",
            "comparison_scope",
        ),
        comparison_rows,
    )


def main() -> None:
    ptids, rids, X = load_baseline_input()
    enhanced_metrics = load_enhanced_metrics()
    print(f"validated_baseline_shape={X.shape}", flush=True)

    baseline_k, k_selection_runs = select_baseline_k(X)
    print(f"baseline_k={baseline_k}", flush=True)
    runs = run_baseline_replications(X, baseline_k)
    print("baseline_runs_complete=30", flush=True)
    write_outputs(
        ptids,
        rids,
        baseline_k,
        k_selection_runs,
        runs,
        enhanced_metrics,
    )
    print("seeds=0-29")
    print("all_runs_retained=True")
    print("best_run_selection_used=False")


if __name__ == "__main__":
    main()
