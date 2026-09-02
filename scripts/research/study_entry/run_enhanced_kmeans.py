"""Run the frozen enhanced K-Means clustering stage.

SOP 1 supplies the six-dimensional PCA space, SOP 2 supplies ``k``, and SOP 3
supplies observation-based initial centroids. The Lloyd assignment/update loop
is standard sklearn K-Means; only its input space, k selection, and seeds are
the enhanced path. No random-initialization baseline is run in this module.
"""

from __future__ import annotations

import csv
import math
import os
import platform
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Sequence

import numpy as np
import scipy
import sklearn
from sklearn.cluster import KMeans
from sklearn.metrics import (
    calinski_harabasz_score,
    davies_bouldin_score,
    silhouette_score,
)


ROOT = Path(__file__).resolve().parents[3]
INTERIM = ROOT / "data" / "interim"
PCA_PATH = INTERIM / "clustering_pca_scores.csv"
SELECTED_K_PATH = INTERIM / "clustering_selected_k.csv"
DPC_CENTROIDS_PATH = INTERIM / "clustering_dpc_selected_centroids.csv"

ASSIGNMENTS_PATH = INTERIM / "unified_cluster_assignments.csv"
CENTROIDS_PATH = INTERIM / "enhanced_kmeans_centroids.csv"
METRICS_PATH = INTERIM / "enhanced_kmeans_metrics.csv"
RUN_SUMMARY_PATH = INTERIM / "enhanced_kmeans_run_summary.csv"
REPRODUCIBILITY_PATH = INTERIM / "enhanced_kmeans_reproducibility.csv"

IDENTIFIERS = ("PTID", "RID")
FEATURES = tuple(f"PC{number}" for number in range(1, 7))
EXPECTED_SHAPE = (2437, 6)
EXPECTED_CURRENT_K = 2
K_RANGE = range(2, 11)

N_INIT = 1
MAX_ITER = 300
TOLERANCE = 1e-4
ALGORITHM = "lloyd"
REPRODUCIBILITY_RUNS = 3
CENTROID_RTOL = 1e-12
CENTROID_ATOL = 1e-12
INERTIA_RTOL = 1e-12
INERTIA_ATOL = 1e-9
METRIC_RTOL = 1e-12
METRIC_ATOL = 1e-12
NUMERICAL_TOLERANCE_STATEMENT = (
    "Tolerance addresses machine-level floating-point reduction differences, "
    "not algorithmic randomness."
)


@dataclass(frozen=True)
class EnhancedRun:
    selected_k: int
    initial_centroids: np.ndarray
    labels: np.ndarray
    final_centroids: np.ndarray
    inertia: float
    iterations: int
    silhouette: float
    davies_bouldin: float
    calinski_harabasz: float


def _require_finite(name: str, values: np.ndarray) -> None:
    if not np.isfinite(values).all():
        raise AssertionError(f"{name} contains NaN or infinite values")


def load_locked_inputs() -> tuple[list[str], list[str], np.ndarray, int, np.ndarray, list[dict[str, str]]]:
    """Validate and load the authoritative SOP 1, SOP 2, and SOP 3 artifacts."""
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
                raise AssertionError(f"Invalid PCA value at CSV line {csv_line}") from exc
            ptids.append(ptid)
            rids.append(rid)
            rows.append(coordinates)

    X_pca = np.asarray(rows, dtype=np.float64)
    if X_pca.shape != EXPECTED_SHAPE:
        raise AssertionError(f"PCA matrix shape is {X_pca.shape}; expected {EXPECTED_SHAPE}")
    _require_finite("PCA matrix", X_pca)
    if len(set(ptids)) != len(ptids):
        raise AssertionError("PTID is not unique in the PCA artifact")
    if len(set(rids)) != len(rids):
        raise AssertionError("RID is not unique in the PCA artifact")

    if not SELECTED_K_PATH.is_file():
        raise FileNotFoundError(SELECTED_K_PATH)
    with SELECTED_K_PATH.open("r", encoding="utf-8-sig", newline="") as handle:
        selected_rows = list(csv.DictReader(handle))
    if len(selected_rows) != 1 or "selected_k" not in selected_rows[0]:
        raise AssertionError("Selected-k artifact must contain one selected_k row")
    try:
        selected_k = int(selected_rows[0]["selected_k"])
    except (TypeError, ValueError) as exc:
        raise AssertionError("selected_k is not an integer") from exc
    if selected_k not in K_RANGE:
        raise AssertionError(f"selected_k={selected_k} is outside 2-10")
    if selected_k != EXPECTED_CURRENT_K:
        raise AssertionError(
            f"Current validated SOP 2 result must be k=2; observed {selected_k}"
        )

    if not DPC_CENTROIDS_PATH.is_file():
        raise FileNotFoundError(DPC_CENTROIDS_PATH)
    with DPC_CENTROIDS_PATH.open("r", encoding="utf-8-sig", newline="") as handle:
        centroid_rows = list(csv.DictReader(handle))
    if len(centroid_rows) != selected_k:
        raise AssertionError(
            f"DPC artifact contains {len(centroid_rows)} centroids; expected {selected_k}"
        )
    try:
        centroid_rows.sort(key=lambda row: int(row["centroid_order"]))
        initial_centroids = np.asarray(
            [[float(row[feature]) for feature in FEATURES] for row in centroid_rows],
            dtype=np.float64,
        )
    except (KeyError, TypeError, ValueError) as exc:
        raise AssertionError("DPC centroid artifact has invalid coordinates or ordering") from exc
    if initial_centroids.shape != (selected_k, len(FEATURES)):
        raise AssertionError(
            f"DPC centroid matrix shape is {initial_centroids.shape}; "
            f"expected {(selected_k, len(FEATURES))}"
        )
    _require_finite("Initial DPC centroid matrix", initial_centroids)

    for order, row in enumerate(centroid_rows):
        try:
            source_index = int(row["analytical_row_index"])
        except (KeyError, TypeError, ValueError) as exc:
            raise AssertionError("DPC centroid analytical_row_index is invalid") from exc
        if not 0 <= source_index < len(X_pca):
            raise AssertionError(f"DPC source index {source_index} is outside PCA rows")
        if row["PTID"] != ptids[source_index] or row["RID"] != rids[source_index]:
            raise AssertionError(f"DPC centroid {order + 1} identifiers do not match PCA source row")
        if not np.array_equal(initial_centroids[order], X_pca[source_index]):
            raise AssertionError(
                f"DPC centroid {order + 1} coordinates do not exactly match PCA source row"
            )
    return ptids, rids, X_pca, selected_k, initial_centroids, centroid_rows


def run_enhanced_kmeans(
    X_pca: np.ndarray,
    initial_centroids: np.ndarray,
    k: int,
) -> EnhancedRun:
    """Fit the enhanced path with fixed DPC seeds and standard Lloyd updates."""
    if X_pca.shape != EXPECTED_SHAPE:
        raise AssertionError(f"Enhanced input shape is {X_pca.shape}; expected {EXPECTED_SHAPE}")
    if initial_centroids.shape != (k, X_pca.shape[1]):
        raise AssertionError("Initial centroid matrix is incompatible with X_pca and k")
    _require_finite("Enhanced K-Means input", X_pca)
    _require_finite("Enhanced K-Means initial centroids", initial_centroids)

    model = KMeans(
        n_clusters=k,
        init=np.array(initial_centroids, dtype=np.float64, copy=True),
        n_init=N_INIT,
        max_iter=MAX_ITER,
        tol=TOLERANCE,
        algorithm=ALGORITHM,
    )
    labels = model.fit_predict(X_pca)
    final_centroids = np.asarray(model.cluster_centers_, dtype=np.float64)
    _require_finite("Final centroids", final_centroids)
    if labels.shape != (len(X_pca),):
        raise AssertionError("Cluster-label vector has an unexpected shape")
    if set(labels.tolist()) != set(range(k)):
        raise AssertionError(f"Expected exactly cluster labels 0..{k - 1}")

    silhouette = float(silhouette_score(X_pca, labels, metric="euclidean"))
    davies_bouldin = float(davies_bouldin_score(X_pca, labels))
    calinski_harabasz = float(calinski_harabasz_score(X_pca, labels))
    metrics = np.asarray([silhouette, davies_bouldin, calinski_harabasz])
    _require_finite("Internal validation metrics", metrics)

    return EnhancedRun(
        selected_k=k,
        initial_centroids=np.array(initial_centroids, dtype=np.float64, copy=True),
        labels=np.asarray(labels, dtype=np.int64),
        final_centroids=final_centroids,
        inertia=float(model.inertia_),
        iterations=int(model.n_iter_),
        silhouette=silhouette,
        davies_bouldin=davies_bouldin,
        calinski_harabasz=calinski_harabasz,
    )


def validate_reproducibility(runs: Sequence[EnhancedRun]) -> list[dict[str, Any]]:
    """Apply the documented exact/tolerance equivalence rules to three fits."""
    if len(runs) != REPRODUCIBILITY_RUNS:
        raise AssertionError(
            f"Expected {REPRODUCIBILITY_RUNS} enhanced runs; observed {len(runs)}"
        )
    reference = runs[0]
    rows: list[dict[str, Any]] = []
    for run_number, run in enumerate(runs, start=1):
        assignment_differences = int(np.count_nonzero(run.labels != reference.labels))
        centroid_max_difference = float(
            np.max(np.abs(run.final_centroids - reference.final_centroids))
        )
        inertia_difference = abs(run.inertia - reference.inertia)
        seed_max_difference = float(
            np.max(np.abs(run.initial_centroids - reference.initial_centroids))
        )

        silhouette_exact = run.silhouette == reference.silhouette
        silhouette_pass = silhouette_exact or bool(
            np.isclose(
                run.silhouette,
                reference.silhouette,
                rtol=METRIC_RTOL,
                atol=METRIC_ATOL,
            )
        )
        db_exact = run.davies_bouldin == reference.davies_bouldin
        db_pass = db_exact or bool(
            np.isclose(
                run.davies_bouldin,
                reference.davies_bouldin,
                rtol=METRIC_RTOL,
                atol=METRIC_ATOL,
            )
        )
        ch_exact = run.calinski_harabasz == reference.calinski_harabasz
        ch_pass = ch_exact or bool(
            np.isclose(
                run.calinski_harabasz,
                reference.calinski_harabasz,
                rtol=METRIC_RTOL,
                atol=METRIC_ATOL,
            )
        )

        checks = {
            "assignments_pass": assignment_differences == 0,
            "iterations_pass": run.iterations == reference.iterations,
            "selected_k_pass": run.selected_k == reference.selected_k,
            "dpc_seed_observations_pass": np.array_equal(
                run.initial_centroids, reference.initial_centroids
            ),
            "final_centroids_pass": bool(
                np.allclose(
                    run.final_centroids,
                    reference.final_centroids,
                    rtol=CENTROID_RTOL,
                    atol=CENTROID_ATOL,
                )
            ),
            "inertia_pass": bool(
                np.isclose(
                    run.inertia,
                    reference.inertia,
                    rtol=INERTIA_RTOL,
                    atol=INERTIA_ATOL,
                )
            ),
            "silhouette_pass": silhouette_pass,
            "davies_bouldin_pass": db_pass,
            "calinski_harabasz_pass": ch_pass,
        }
        rows.append(
            {
                "run": run_number,
                "comparison": "reference" if run_number == 1 else f"run_{run_number}_vs_run_1",
                "assignments_rule": "exact_equality",
                "assignment_differences": assignment_differences,
                "iterations_rule": "exact_equality",
                "iteration_difference": run.iterations - reference.iterations,
                "selected_k_rule": "exact_equality",
                "selected_k_difference": run.selected_k - reference.selected_k,
                "dpc_seed_observations_rule": (
                    "exact_ordered_seed_matrix_equality; source observations "
                    "validated against locked DPC artifact"
                ),
                "dpc_seed_max_abs_difference": seed_max_difference,
                "final_centroids_rule": "numpy.allclose(rtol=1e-12,atol=1e-12)",
                "centroid_max_abs_difference": centroid_max_difference,
                "inertia_rule": "numpy.isclose(rtol=1e-12,atol=1e-9)",
                "inertia_abs_difference": inertia_difference,
                "silhouette_rule": (
                    "exact_equality"
                    if silhouette_exact
                    else "numpy.isclose(rtol=1e-12,atol=1e-12)"
                ),
                "silhouette_abs_difference": abs(
                    run.silhouette - reference.silhouette
                ),
                "davies_bouldin_rule": (
                    "exact_equality"
                    if db_exact
                    else "numpy.isclose(rtol=1e-12,atol=1e-12)"
                ),
                "davies_bouldin_abs_difference": abs(
                    run.davies_bouldin - reference.davies_bouldin
                ),
                "calinski_harabasz_rule": (
                    "exact_equality"
                    if ch_exact
                    else "numpy.isclose(rtol=1e-12,atol=1e-12)"
                ),
                "calinski_harabasz_abs_difference": abs(
                    run.calinski_harabasz - reference.calinski_harabasz
                ),
                "metric_tolerance_required": not (
                    silhouette_exact and db_exact and ch_exact
                ),
                **checks,
                "numerical_tolerance_statement": NUMERICAL_TOLERANCE_STATEMENT,
                "overall_pass": all(checks.values()),
            }
        )
    if not all(row["overall_pass"] for row in rows):
        raise AssertionError(
            "Enhanced K-Means failed the documented numerical-tolerance gate: "
            + repr([row for row in rows if not row["overall_pass"]])
        )
    return rows


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
    selected_k: int,
    initial_centroids: np.ndarray,
    centroid_source_rows: Sequence[dict[str, str]],
    run: EnhancedRun,
    reproducibility_rows: Sequence[dict[str, Any]],
) -> None:
    """Write only the five requested enhanced-run artifacts."""
    cluster_sizes = Counter(int(label) for label in run.labels)
    if sum(cluster_sizes.values()) != EXPECTED_SHAPE[0]:
        raise AssertionError("Cluster sizes do not sum to all participants")
    if run.iterations > MAX_ITER:
        raise AssertionError("K-Means exceeded max_iter")
    maximum_centroid_difference = max(
        float(row["centroid_max_abs_difference"]) for row in reproducibility_rows
    )
    maximum_inertia_difference = max(
        float(row["inertia_abs_difference"]) for row in reproducibility_rows
    )
    metric_tolerance_required = any(
        bool(row["metric_tolerance_required"]) for row in reproducibility_rows
    )

    _write_csv(
        ASSIGNMENTS_PATH,
        ("PTID", "RID", "cluster_label"),
        (
            {"PTID": ptid, "RID": rid, "cluster_label": int(label)}
            for ptid, rid, label in zip(ptids, rids, run.labels)
        ),
    )

    centroid_rows: list[dict[str, Any]] = []
    for label in range(selected_k):
        movement = float(np.linalg.norm(run.final_centroids[label] - initial_centroids[label]))
        centroid_rows.append(
            {
                "cluster_label": label,
                "initial_dpc_centroid_order": label + 1,
                "initial_dpc_source_analytical_row_index": centroid_source_rows[label][
                    "analytical_row_index"
                ],
                "initial_dpc_source_PTID": centroid_source_rows[label]["PTID"],
                "initial_dpc_source_RID": centroid_source_rows[label]["RID"],
                **{
                    f"initial_{feature}": initial_centroids[label, position]
                    for position, feature in enumerate(FEATURES)
                },
                **{
                    f"final_{feature}": run.final_centroids[label, position]
                    for position, feature in enumerate(FEATURES)
                },
                "movement_distance": movement,
                "cluster_size": cluster_sizes[label],
            }
        )
    _write_csv(
        CENTROIDS_PATH,
        (
            "cluster_label",
            "initial_dpc_centroid_order",
            "initial_dpc_source_analytical_row_index",
            "initial_dpc_source_PTID",
            "initial_dpc_source_RID",
            *(f"initial_{feature}" for feature in FEATURES),
            *(f"final_{feature}" for feature in FEATURES),
            "movement_distance",
            "cluster_size",
        ),
        centroid_rows,
    )

    _write_csv(
        METRICS_PATH,
        ("metric", "value", "interpretation_direction"),
        (
            {
                "metric": "silhouette_coefficient",
                "value": run.silhouette,
                "interpretation_direction": "higher_is_better",
            },
            {
                "metric": "davies_bouldin_index",
                "value": run.davies_bouldin,
                "interpretation_direction": "lower_is_better",
            },
            {
                "metric": "calinski_harabasz_index",
                "value": run.calinski_harabasz,
                "interpretation_direction": "higher_is_better",
            },
        ),
    )

    summary: list[tuple[str, Any]] = [
        ("pipeline", "unified_enhanced_kmeans"),
        ("input_rows", EXPECTED_SHAPE[0]),
        ("input_features", EXPECTED_SHAPE[1]),
        ("feature_columns", "|".join(FEATURES)),
        ("selected_k", selected_k),
        ("initialization", "explicit_DPC_observation_centroids"),
        ("n_init", N_INIT),
        ("max_iter", MAX_ITER),
        ("tol", TOLERANCE),
        ("algorithm", ALGORITHM),
        ("iterations", run.iterations),
        ("converged_before_max_iter", run.iterations < MAX_ITER),
        ("inertia", run.inertia),
        *(
            (f"cluster_{label}_size", cluster_sizes[label])
            for label in range(selected_k)
        ),
        ("participants_assigned", len(run.labels)),
        ("missing_cluster_labels", 0),
        ("output_cluster_count", len(cluster_sizes)),
        ("reproducibility_runs", len(reproducibility_rows)),
        ("reproducibility_passed", all(row["overall_pass"] for row in reproducibility_rows)),
        ("maximum_observed_centroid_difference", maximum_centroid_difference),
        ("maximum_observed_inertia_difference", maximum_inertia_difference),
        ("metric_tolerance_required", metric_tolerance_required),
        ("numerical_tolerance_statement", NUMERICAL_TOLERANCE_STATEMENT),
        ("python_version", platform.python_version()),
        ("scikit_learn_version", sklearn.__version__),
        ("numpy_version", np.__version__),
        ("scipy_version", scipy.__version__),
        ("random_baseline_executed", False),
    ]
    _write_csv(
        RUN_SUMMARY_PATH,
        ("metric", "value"),
        ({"metric": metric, "value": value} for metric, value in summary),
    )

    _write_csv(
        REPRODUCIBILITY_PATH,
        (
            "run",
            "comparison",
            "assignments_rule",
            "assignment_differences",
            "assignments_pass",
            "iterations_rule",
            "iteration_difference",
            "iterations_pass",
            "selected_k_rule",
            "selected_k_difference",
            "selected_k_pass",
            "dpc_seed_observations_rule",
            "dpc_seed_max_abs_difference",
            "dpc_seed_observations_pass",
            "final_centroids_rule",
            "centroid_max_abs_difference",
            "final_centroids_pass",
            "inertia_rule",
            "inertia_abs_difference",
            "inertia_pass",
            "silhouette_rule",
            "silhouette_abs_difference",
            "silhouette_pass",
            "davies_bouldin_rule",
            "davies_bouldin_abs_difference",
            "davies_bouldin_pass",
            "calinski_harabasz_rule",
            "calinski_harabasz_abs_difference",
            "calinski_harabasz_pass",
            "metric_tolerance_required",
            "numerical_tolerance_statement",
            "overall_pass",
        ),
        reproducibility_rows,
    )


def main() -> None:
    ptids, rids, X_pca, selected_k, initial_centroids, centroid_rows = load_locked_inputs()
    print(f"validated_pca_shape={X_pca.shape}", flush=True)
    print(f"selected_k_from_artifact={selected_k}", flush=True)
    print(f"initial_centroid_shape={initial_centroids.shape}", flush=True)

    runs: list[EnhancedRun] = []
    for run_number in range(1, REPRODUCIBILITY_RUNS + 1):
        run = run_enhanced_kmeans(X_pca, initial_centroids, selected_k)
        runs.append(run)
        print(f"enhanced_fit_{run_number}=complete", flush=True)
    reproducibility_rows = validate_reproducibility(runs)
    result = runs[0]
    write_outputs(
        ptids,
        rids,
        selected_k,
        initial_centroids,
        centroid_rows,
        result,
        reproducibility_rows,
    )

    sizes = Counter(int(label) for label in result.labels)
    print(f"iterations={result.iterations}")
    print(f"inertia={result.inertia:.17g}")
    print("cluster_sizes=" + ",".join(f"{label}:{sizes[label]}" for label in range(selected_k)))
    print(f"silhouette={result.silhouette:.17g}")
    print(f"davies_bouldin={result.davies_bouldin:.17g}")
    print(f"calinski_harabasz={result.calinski_harabasz:.17g}")
    print("three_run_reproducibility=True")


if __name__ == "__main__":
    main()
