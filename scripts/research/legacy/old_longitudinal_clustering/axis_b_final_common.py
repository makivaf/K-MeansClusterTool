"""Shared, frozen utilities for final Axis B research scripts.

Axis B clusters one raw participant-level feature: the ADAS-Cog13 OLS slope.
This module deliberately contains no application integration and never reads raw
ADNI records when fitting or characterizing the final model.
"""

from __future__ import annotations

import csv
import hashlib
import json
import math
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Sequence

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.metrics import (
    calinski_harabasz_score,
    davies_bouldin_score,
    silhouette_score,
)


ROOT = Path(__file__).resolve().parents[4]
INTERIM = ROOT / "data" / "legacy" / "old_longitudinal_clustering"
RAW = ROOT / "data" / "raw"
SLOPES_PATH = INTERIM / "axis_b_adas13_slopes.csv"
COHORT_PATH = ROOT / "data" / "interim" / "unified_longitudinal_cohort.csv"
NBCLUST_PATH = INTERIM / "axis_b_nbclust_k_selection.json"
ORIGINAL_DPC_AUDIT_PATH = INTERIM / "axis_b_dpc_seed_selection.json"
RECONCILIATION_PATH = INTERIM / "axis_b_dpc_methodology_reconciliation.json"
ASSIGNMENTS_PATH = INTERIM / "axis_b_final_cluster_assignments.csv"
PROFILES_PATH = INTERIM / "axis_b_final_cluster_profiles.csv"
FINAL_METRICS_PATH = INTERIM / "axis_b_final_clustering_metrics.json"
RANDOM_RUNS_PATH = INTERIM / "axis_b_random_init_runs.csv"
RANDOM_SUMMARY_PATH = INTERIM / "axis_b_random_init_summary.json"
SENSITIVITY_PATH = INTERIM / "axis_b_sensitivity_analysis.json"
FINAL_SUMMARY_PATH = INTERIM / "axis_b_final_research_summary.json"

FEATURE = "beta1_slope_points_per_year"
EXPECTED_ROWS = 1917
SELECTED_K = 2
PRIMARY_SEED = 0
BASELINE_SEEDS = tuple(range(30))
N_INIT = 1
MAX_ITER = 300
TOLERANCE = 1e-4
ALGORITHM = "lloyd"
EXPECTED_FROZEN_HASHES = {
    "data/interim/axis_b_longitudinal_cohort.csv": "333dabedb1bc948c3b403cdf828d343dc76f74c821a0fdb43db9133588aed8b8",
    "data/interim/axis_b_adas13_slopes.csv": "22cdd55303a873d62889a40190caf061f95c4ed81d7d7c82eb8f454886ed0280",
    "data/interim/axis_b_nbclust_k_selection.json": "f26ebeda169479c64cfa42859f97595ba1c0e9501f33a4631117274724b4943c",
    "data/interim/axis_b_dpc_seed_selection.json": "782afd7dc4759d8875fe6517d6cc03204e9f49929817e5eae1ccdf7390b1c6d3",
}


@dataclass(frozen=True)
class KMeansResult:
    raw_labels: np.ndarray
    ordered_labels: np.ndarray
    raw_centroids: np.ndarray
    ordered_centroids: np.ndarray
    inertia: float
    iterations: int
    silhouette: float
    davies_bouldin: float
    calinski_harabasz: float
    ordered_cluster_sizes: tuple[int, ...]
    partition_hash: str


def file_hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def frozen_hashes() -> dict[str, str]:
    observed: dict[str, str] = {}
    for relative, expected in EXPECTED_FROZEN_HASHES.items():
        path = ROOT / relative
        if not path.is_file():
            raise FileNotFoundError(path)
        digest = file_hash(path)
        if digest != expected:
            raise AssertionError(f"Frozen Axis B input changed: {relative}={digest}")
        observed[relative] = digest
    return observed


def tree_manifest(directory: Path, pattern: str = "*") -> dict[str, Any]:
    """Return a content-based aggregate manifest without exposing file contents."""
    files = sorted(path for path in directory.rglob(pattern) if path.is_file())
    digest = hashlib.sha256()
    total_bytes = 0
    for path in files:
        relative = path.relative_to(ROOT).as_posix()
        size = path.stat().st_size
        total_bytes += size
        digest.update(relative.encode("utf-8"))
        digest.update(b"\0")
        digest.update(str(size).encode("ascii"))
        digest.update(b"\0")
        digest.update(file_hash(path).encode("ascii"))
        digest.update(b"\n")
    return {
        "directory": directory.relative_to(ROOT).as_posix(),
        "pattern": pattern,
        "file_count": len(files),
        "total_bytes": total_bytes,
        "aggregate_sha256": digest.hexdigest(),
    }


def load_slopes() -> pd.DataFrame:
    frozen_hashes()
    frame = pd.read_csv(SLOPES_PATH, dtype={"PTID": str, "RID": str}, low_memory=False)
    required = {
        "PTID", "RID", "study_entry_phase", FEATURE, "n_observations",
        "followup_years", "r_squared", "RMSE",
    }
    missing = required.difference(frame.columns)
    if missing:
        raise AssertionError(f"Slope artifact is missing columns: {sorted(missing)}")
    if len(frame) != EXPECTED_ROWS:
        raise AssertionError(f"Expected {EXPECTED_ROWS} slopes, found {len(frame)}")
    if frame["PTID"].nunique() != EXPECTED_ROWS or frame["RID"].nunique() != EXPECTED_ROWS:
        raise AssertionError("PTID and RID must each be unique in the slope artifact")
    if frame[["PTID", "RID"]].duplicated().any():
        raise AssertionError("Duplicate PTID/RID pairs found in the slope artifact")
    numeric_columns = [FEATURE, "n_observations", "followup_years", "r_squared", "RMSE"]
    for column in numeric_columns:
        frame[column] = pd.to_numeric(frame[column], errors="raise")
    if not np.isfinite(frame[numeric_columns].to_numpy(np.float64)).all():
        raise AssertionError("Axis B slope/QC fields contain non-finite values")
    with NBCLUST_PATH.open("r", encoding="utf-8") as handle:
        nbclust = json.load(handle)
    if nbclust.get("selection", {}).get("selected_k") != SELECTED_K:
        raise AssertionError("Frozen NbClust artifact no longer selects k=2")
    return frame


def partition_hash(frame: pd.DataFrame, ordered_labels: np.ndarray) -> str:
    if len(frame) != len(ordered_labels):
        raise AssertionError("Partition labels do not align with participant rows")
    rows = pd.DataFrame({
        "PTID": frame["PTID"].astype(str),
        "RID": frame["RID"].astype(str),
        "ordered_cluster_rank": np.asarray(ordered_labels, dtype=np.int64),
    }).sort_values(["PTID", "RID"], kind="stable")
    digest = hashlib.sha256()
    for row in rows.itertuples(index=False):
        digest.update(f"{row.PTID}|{row.RID}|{row.ordered_cluster_rank}\n".encode("utf-8"))
    return digest.hexdigest()


def fit_kmeans(
    frame: pd.DataFrame,
    *,
    seed: int = PRIMARY_SEED,
    init: str | np.ndarray = "random",
    n_init: int = N_INIT,
) -> KMeansResult:
    X = frame[[FEATURE]].to_numpy(np.float64)
    if X.ndim != 2 or X.shape[1] != 1 or len(X) < SELECTED_K:
        raise AssertionError(f"Invalid Axis B matrix shape: {X.shape}")
    if not np.isfinite(X).all():
        raise AssertionError("K-Means input contains non-finite slopes")
    model = KMeans(
        n_clusters=SELECTED_K,
        init=init,
        n_init=n_init,
        random_state=seed if isinstance(init, str) else None,
        max_iter=MAX_ITER,
        tol=TOLERANCE,
        algorithm=ALGORITHM,
    )
    raw_labels = np.asarray(model.fit_predict(X), dtype=np.int64)
    raw_centroids = np.asarray(model.cluster_centers_[:, 0], dtype=np.float64)
    if set(raw_labels.tolist()) != set(range(SELECTED_K)):
        raise AssertionError("K-Means returned an empty or unexpected cluster")
    centroid_order = np.argsort(raw_centroids, kind="stable")
    raw_to_ordered = {int(raw): rank for rank, raw in enumerate(centroid_order, start=1)}
    ordered_labels = np.asarray([raw_to_ordered[int(label)] for label in raw_labels], dtype=np.int64)
    ordered_centroids = raw_centroids[centroid_order]
    sizes = tuple(int(np.count_nonzero(ordered_labels == rank)) for rank in range(1, SELECTED_K + 1))
    if sum(sizes) != len(frame) or any(size == 0 for size in sizes):
        raise AssertionError("Cluster sizes do not reconcile")
    metrics = {
        "silhouette": float(silhouette_score(X, raw_labels, metric="euclidean")),
        "davies_bouldin": float(davies_bouldin_score(X, raw_labels)),
        "calinski_harabasz": float(calinski_harabasz_score(X, raw_labels)),
    }
    numeric = np.asarray([
        *raw_centroids.tolist(), float(model.inertia_), float(model.n_iter_), *metrics.values()
    ])
    if not np.isfinite(numeric).all():
        raise AssertionError("K-Means returned non-finite results")
    return KMeansResult(
        raw_labels=raw_labels,
        ordered_labels=ordered_labels,
        raw_centroids=raw_centroids,
        ordered_centroids=ordered_centroids,
        inertia=float(model.inertia_),
        iterations=int(model.n_iter_),
        silhouette=metrics["silhouette"],
        davies_bouldin=metrics["davies_bouldin"],
        calinski_harabasz=metrics["calinski_harabasz"],
        ordered_cluster_sizes=sizes,
        partition_hash=partition_hash(frame, ordered_labels),
    )


def distribution(values: Sequence[float] | np.ndarray | pd.Series) -> dict[str, float | int]:
    array = np.asarray(values, dtype=np.float64)
    if array.size == 0 or not np.isfinite(array).all():
        raise AssertionError("Cannot summarize empty or non-finite values")
    q1, median, q3 = np.quantile(array, [0.25, 0.5, 0.75])
    return {
        "n": int(array.size),
        "minimum": float(array.min()),
        "q1": float(q1),
        "median": float(median),
        "mean": float(array.mean()),
        "q3": float(q3),
        "maximum": float(array.max()),
        "standard_deviation_sample_ddof_1": float(array.std(ddof=1)) if array.size > 1 else 0.0,
    }


def result_dict(result: KMeansResult) -> dict[str, Any]:
    return {
        "k": SELECTED_K,
        "iterations": result.iterations,
        "converged_before_max_iter": result.iterations < MAX_ITER,
        "inertia": result.inertia,
        "silhouette": result.silhouette,
        "davies_bouldin": result.davies_bouldin,
        "calinski_harabasz": result.calinski_harabasz,
        "ordered_centroids": result.ordered_centroids.tolist(),
        "ordered_cluster_sizes": list(result.ordered_cluster_sizes),
        "ordered_cluster_percentages": [100.0 * size / sum(result.ordered_cluster_sizes) for size in result.ordered_cluster_sizes],
        "one_dimensional_centroid_midpoint_boundary": float(result.ordered_centroids.mean()),
        "label_invariant_partition_sha256": result.partition_hash,
    }


def atomic_write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    os.replace(temporary, path)


def atomic_write_csv(path: Path, fieldnames: Iterable[str], rows: Iterable[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    columns = list(fieldnames)
    temporary = path.with_suffix(path.suffix + ".tmp")
    with temporary.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns, extrasaction="raise")
        writer.writeheader()
        writer.writerows(rows)
    os.replace(temporary, path)


def close_enough(left: float, right: float, *, atol: float = 1e-10) -> bool:
    return math.isclose(left, right, rel_tol=1e-12, abs_tol=atol)
