"""Deterministic density-peak centroid initialization for enhanced K-Means.

The selected observations are centroid seeds only. This module deliberately
does not call K-Means, DPC group assignment, or any post-hoc analysis.
"""

from __future__ import annotations

import csv
import math
import os
from array import array
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Sequence


ROOT = Path(__file__).resolve().parents[3]
INTERIM = ROOT / "data" / "interim"
PCA_PATH = INTERIM / "clustering_pca_scores.csv"
SELECTED_K_PATH = INTERIM / "clustering_selected_k.csv"
SCORES_PATH = INTERIM / "clustering_dpc_scores.csv"
CENTROIDS_PATH = INTERIM / "clustering_dpc_selected_centroids.csv"
SUMMARY_PATH = INTERIM / "clustering_dpc_summary.csv"
DETERMINISM_PATH = INTERIM / "clustering_dpc_determinism_check.csv"

IDENTIFIERS = ("PTID", "RID")
FEATURES = tuple(f"PC{number}" for number in range(1, 7))
EXPECTED_SHAPE = (2437, 6)
CANDIDATE_K_RANGE = range(2, 11)

# Current provisional Chapter 3 study parameter; it is not data-optimized.
STUDY_CUTOFF_PERCENTILE = 0.02
DETERMINISM_RUNS = 3


@dataclass(frozen=True)
class DPCResult:
    """All transparent numerical products of one SOP 3 DPC-init call."""

    n_observations: int
    dimensionality: int
    pairwise_distance_count: int
    cutoff_percentile: float
    d_c: float
    minimum_nonzero_distance: float
    median_distance: float
    maximum_distance: float
    rho: tuple[int, ...]
    delta: tuple[float, ...]
    gamma: tuple[float, ...]
    ranked_indices: tuple[int, ...]
    selected_indices: tuple[int, ...]
    centroid_matrix: tuple[tuple[float, ...], ...]


def _linear_percentile(sorted_values: Sequence[float], percentile: float) -> float:
    """Return a linearly interpolated percentile (NumPy/R type-7 convention)."""
    if not sorted_values:
        raise ValueError("Cannot calculate a percentile from no values")
    if not 0.0 <= percentile <= 1.0:
        raise ValueError("percentile must be within [0, 1]")
    position = (len(sorted_values) - 1) * percentile
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return float(sorted_values[lower])
    weight = position - lower
    return float(sorted_values[lower] * (1.0 - weight) + sorted_values[upper] * weight)


def _validate_matrix(X: Sequence[Sequence[float]], k: int) -> None:
    if len(X) < 2:
        raise ValueError("DPC-init requires at least two observations")
    dimensionality = len(X[0])
    if dimensionality < 1:
        raise ValueError("DPC-init requires at least one feature")
    if any(len(row) != dimensionality for row in X):
        raise ValueError("DPC-init input rows have inconsistent dimensionality")
    if any(not math.isfinite(value) for row in X for value in row):
        raise ValueError("DPC-init input contains NaN or infinite values")
    if not 1 <= k <= len(X):
        raise ValueError(f"k must be within [1, {len(X)}]")


def dpc_init(
    X: Sequence[Sequence[float]],
    k: int,
    cutoff_percentile: float = STUDY_CUTOFF_PERCENTILE,
) -> DPCResult:
    """Select deterministic centroid observations using Chapter 3 DPC-init.

    Steps are explicit: compute condensed Euclidean distances; derive ``d_c``;
    count neighbors strictly below ``d_c`` for ``rho``; find ``delta`` to a
    strictly higher-density observation; rank ``gamma = rho * delta``; and use
    the top-k observations themselves as the centroid initialization matrix.
    """
    _validate_matrix(X, k)
    if not 0.0 < cutoff_percentile < 1.0:
        raise ValueError("cutoff_percentile must be strictly within (0, 1)")

    n_observations = len(X)
    dimensionality = len(X[0])
    expected_distance_count = n_observations * (n_observations - 1) // 2

    # Condensed storage contains each i<j distance once and no self-distances.
    distances = array("d")
    for i in range(n_observations - 1):
        observation_i = X[i]
        for j in range(i + 1, n_observations):
            distances.append(math.dist(observation_i, X[j]))
    if len(distances) != expected_distance_count:
        raise AssertionError("Condensed pairwise-distance count is incorrect")
    if any(not math.isfinite(distance) for distance in distances):
        raise AssertionError("Pairwise distances contain NaN or infinite values")

    nonzero_distances = sorted(distance for distance in distances if distance > 0.0)
    if not nonzero_distances:
        raise AssertionError("No non-zero pairwise distances are available")
    d_c = _linear_percentile(nonzero_distances, cutoff_percentile)
    if not math.isfinite(d_c) or d_c <= 0.0:
        raise AssertionError(f"DPC cutoff d_c must be positive and finite; observed {d_c}")
    minimum_nonzero_distance = nonzero_distances[0]
    median_distance = _linear_percentile(nonzero_distances, 0.5)
    maximum_distance = nonzero_distances[-1]
    del nonzero_distances

    # Cutoff-kernel density: self-distances are absent, and equality to d_c is
    # excluded by the Chapter 3 strict inequality.
    rho = [0] * n_observations
    cursor = 0
    for i in range(n_observations - 1):
        for j in range(i + 1, n_observations):
            distance = distances[cursor]
            cursor += 1
            if distance < d_c:
                rho[i] += 1
                rho[j] += 1

    # Equal-density observations never count as higher density. Every tied
    # global-density maximum receives its own farthest-neighbor distance,
    # directly applying the maximum-density branch of the definition.
    maximum_rho = max(rho)
    delta = [math.inf] * n_observations
    farthest_distance = [0.0] * n_observations
    cursor = 0
    for i in range(n_observations - 1):
        for j in range(i + 1, n_observations):
            distance = distances[cursor]
            cursor += 1
            if distance > farthest_distance[i]:
                farthest_distance[i] = distance
            if distance > farthest_distance[j]:
                farthest_distance[j] = distance
            if rho[j] > rho[i] and distance < delta[i]:
                delta[i] = distance
            elif rho[i] > rho[j] and distance < delta[j]:
                delta[j] = distance

    for i, density in enumerate(rho):
        if density == maximum_rho:
            delta[i] = farthest_distance[i]
    if any(not math.isfinite(value) for value in delta):
        invalid = [i for i, value in enumerate(delta) if not math.isfinite(value)]
        raise AssertionError(f"Delta is undefined for analytical rows: {invalid[:10]}")

    gamma = [density * separation for density, separation in zip(rho, delta)]
    if any(not math.isfinite(value) for value in gamma):
        raise AssertionError("Gamma contains NaN or infinite values")

    # The original validated zero-based row index is only a reproducibility
    # tie-break; it does not change gamma or any DPC score.
    ranked_indices = tuple(
        sorted(range(n_observations), key=lambda index: (-gamma[index], index))
    )
    selected_indices = ranked_indices[:k]
    centroid_matrix = tuple(tuple(float(value) for value in X[index]) for index in selected_indices)
    if len(centroid_matrix) != k or any(len(row) != dimensionality for row in centroid_matrix):
        raise AssertionError("Selected centroid matrix has the wrong shape")
    if any(centroid_matrix[position] != tuple(X[index]) for position, index in enumerate(selected_indices)):
        raise AssertionError("A selected centroid does not correspond to its source observation")

    return DPCResult(
        n_observations=n_observations,
        dimensionality=dimensionality,
        pairwise_distance_count=len(distances),
        cutoff_percentile=cutoff_percentile,
        d_c=d_c,
        minimum_nonzero_distance=minimum_nonzero_distance,
        median_distance=median_distance,
        maximum_distance=maximum_distance,
        rho=tuple(rho),
        delta=tuple(delta),
        gamma=tuple(gamma),
        ranked_indices=ranked_indices,
        selected_indices=selected_indices,
        centroid_matrix=centroid_matrix,
    )


def load_clustering_inputs() -> tuple[list[str], list[str], list[tuple[float, ...]], int]:
    """Load and validate the locked PCA matrix and SOP 2 selected-k artifact."""
    if not PCA_PATH.is_file():
        raise FileNotFoundError(PCA_PATH)
    ptids: list[str] = []
    rids: list[str] = []
    matrix: list[tuple[float, ...]] = []
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
                raise AssertionError(f"Blank identifier at PCA CSV line {csv_line}")
            try:
                values = tuple(float(row[feature]) for feature in FEATURES)
            except (TypeError, ValueError) as exc:
                raise AssertionError(f"Invalid PCA score at CSV line {csv_line}") from exc
            if len(values) != 6 or not all(math.isfinite(value) for value in values):
                raise AssertionError(f"Invalid six-dimensional PCA row at CSV line {csv_line}")
            ptids.append(ptid)
            rids.append(rid)
            matrix.append(values)

    shape = (len(matrix), len(matrix[0]) if matrix else 0)
    if shape != EXPECTED_SHAPE:
        raise AssertionError(f"PCA input shape is {shape}; expected {EXPECTED_SHAPE}")
    if len(set(ptids)) != len(ptids):
        raise AssertionError("PTID is not unique in the PCA input")
    if len(set(rids)) != len(rids):
        raise AssertionError("RID is not unique in the PCA input")

    if not SELECTED_K_PATH.is_file():
        raise FileNotFoundError(SELECTED_K_PATH)
    with SELECTED_K_PATH.open("r", encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))
    if len(rows) != 1 or "selected_k" not in rows[0]:
        raise AssertionError("Selected-k artifact must contain exactly one selected_k row")
    try:
        selected_k = int(rows[0]["selected_k"])
    except (TypeError, ValueError) as exc:
        raise AssertionError("selected_k is not an integer") from exc
    if selected_k not in CANDIDATE_K_RANGE:
        raise AssertionError(f"selected_k={selected_k} is outside the locked 2-10 range")
    if selected_k != 2:
        raise AssertionError(f"Current SOP 2 artifact must select k=2; observed {selected_k}")
    return ptids, rids, matrix, selected_k


def _median(values: Sequence[float | int]) -> float:
    ordered = sorted(values)
    return _linear_percentile(ordered, 0.5)


def _write_csv(path: Path, fieldnames: Iterable[str], rows: Iterable[dict[str, Any]]) -> None:
    columns = list(fieldnames)
    temporary = path.with_suffix(path.suffix + ".tmp")
    with temporary.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns, extrasaction="raise")
        writer.writeheader()
        writer.writerows(rows)
    os.replace(temporary, path)


def _density_tie_summary(rho: Sequence[int]) -> dict[str, int | bool]:
    counts = Counter(rho)
    tied_groups = [count for count in counts.values() if count > 1]
    maximum_rho = max(rho)
    return {
        "density_ties_occurred": bool(tied_groups),
        "distinct_density_levels": len(counts),
        "tied_density_groups": len(tied_groups),
        "observations_in_density_ties": sum(tied_groups),
        "maximum_density": maximum_rho,
        "maximum_density_tie_count": counts[maximum_rho],
    }


def _gamma_tie_summary(gamma: Sequence[float], selected_k: int) -> dict[str, int | bool]:
    counts = Counter(gamma)
    tied_groups = [count for count in counts.values() if count > 1]
    ordered = sorted(gamma, reverse=True)
    boundary_gamma = ordered[selected_k - 1]
    return {
        "gamma_ties_occurred": bool(tied_groups),
        "tied_gamma_groups": len(tied_groups),
        "observations_in_gamma_ties": sum(tied_groups),
        "selected_boundary_gamma_tie_count": counts[boundary_gamma],
    }


def validate_repeated_runs(results: Sequence[DPCResult]) -> list[dict[str, Any]]:
    """Require three exact repeats and return an auditable check table."""
    if len(results) != DETERMINISM_RUNS:
        raise AssertionError(f"Expected {DETERMINISM_RUNS} DPC-init calls, found {len(results)}")
    reference = results[0]
    rows: list[dict[str, Any]] = []
    for run_number, result in enumerate(results, start=1):
        checks = {
            "d_c_exact": result.d_c == reference.d_c,
            "rho_exact": result.rho == reference.rho,
            "delta_exact": result.delta == reference.delta,
            "gamma_exact": result.gamma == reference.gamma,
            "ranked_order_exact": result.ranked_indices == reference.ranked_indices,
            "selected_indices_exact": result.selected_indices == reference.selected_indices,
            "centroid_matrix_exact": result.centroid_matrix == reference.centroid_matrix,
        }
        rows.append(
            {
                "run": run_number,
                "comparison": "reference" if run_number == 1 else f"run_{run_number}_vs_run_1",
                **checks,
                "overall_pass": all(checks.values()),
            }
        )
    if not all(row["overall_pass"] for row in rows):
        raise AssertionError("At least one identical DPC-init call produced a different result")
    return rows


def write_outputs(
    ptids: Sequence[str],
    rids: Sequence[str],
    matrix: Sequence[Sequence[float]],
    selected_k: int,
    result: DPCResult,
    determinism_rows: Sequence[dict[str, Any]],
) -> None:
    rank_by_index = {index: rank for rank, index in enumerate(result.ranked_indices, start=1)}
    selected_order = {
        index: order for order, index in enumerate(result.selected_indices, start=1)
    }
    score_rows: list[dict[str, Any]] = []
    for index, coordinates in enumerate(matrix):
        score_rows.append(
            {
                "analytical_row_index": index,
                "PTID": ptids[index],
                "RID": rids[index],
                **{feature: coordinates[position] for position, feature in enumerate(FEATURES)},
                "rho": result.rho[index],
                "delta": result.delta[index],
                "gamma": result.gamma[index],
                "gamma_rank": rank_by_index[index],
                "selected_as_centroid": index in selected_order,
                "centroid_order": selected_order.get(index, ""),
            }
        )
    _write_csv(
        SCORES_PATH,
        (
            "analytical_row_index",
            "PTID",
            "RID",
            *FEATURES,
            "rho",
            "delta",
            "gamma",
            "gamma_rank",
            "selected_as_centroid",
            "centroid_order",
        ),
        score_rows,
    )

    _write_csv(
        CENTROIDS_PATH,
        (
            "centroid_order",
            "analytical_row_index",
            "PTID",
            "RID",
            "rho",
            "delta",
            "gamma",
            *FEATURES,
        ),
        (
            {
                "centroid_order": order,
                "analytical_row_index": index,
                "PTID": ptids[index],
                "RID": rids[index],
                "rho": result.rho[index],
                "delta": result.delta[index],
                "gamma": result.gamma[index],
                **{
                    feature: matrix[index][position]
                    for position, feature in enumerate(FEATURES)
                },
            }
            for order, index in enumerate(result.selected_indices, start=1)
        ),
    )

    density_tie_summary = _density_tie_summary(result.rho)
    gamma_tie_summary = _gamma_tie_summary(result.gamma, selected_k)
    summary_values: list[tuple[str, Any]] = [
        ("input_rows", result.n_observations),
        ("input_dimensions", result.dimensionality),
        ("selected_k", selected_k),
        ("pairwise_distance_count", result.pairwise_distance_count),
        ("self_distances_included", False),
        ("cutoff_percentile", result.cutoff_percentile),
        ("d_c", result.d_c),
        ("minimum_nonzero_distance", result.minimum_nonzero_distance),
        ("median_nonzero_distance", result.median_distance),
        ("maximum_distance", result.maximum_distance),
        ("rho_minimum", min(result.rho)),
        ("rho_median", _median(result.rho)),
        ("rho_maximum", max(result.rho)),
        ("delta_minimum", min(result.delta)),
        ("delta_median", _median(result.delta)),
        ("delta_maximum", max(result.delta)),
        *density_tie_summary.items(),
        ("density_tie_convention", "strictly greater rho only; every maximum-rho observation uses its own farthest-neighbor distance"),
        *gamma_tie_summary.items(),
        ("gamma_tie_break", "descending gamma, then ascending zero-based validated analytical_row_index"),
        ("centroid_matrix_rows", len(result.centroid_matrix)),
        ("centroid_matrix_columns", len(result.centroid_matrix[0])),
        ("determinism_runs", len(determinism_rows)),
        ("determinism_passed", all(row["overall_pass"] for row in determinism_rows)),
        ("sensitivity_analysis_performed", False),
        ("kmeans_executed", False),
    ]
    _write_csv(
        SUMMARY_PATH,
        ("metric", "value"),
        ({"metric": metric, "value": value} for metric, value in summary_values),
    )

    _write_csv(
        DETERMINISM_PATH,
        (
            "run",
            "comparison",
            "d_c_exact",
            "rho_exact",
            "delta_exact",
            "gamma_exact",
            "ranked_order_exact",
            "selected_indices_exact",
            "centroid_matrix_exact",
            "overall_pass",
        ),
        determinism_rows,
    )


def main() -> None:
    ptids, rids, matrix, selected_k = load_clustering_inputs()
    print(f"validated_input_shape={(len(matrix), len(matrix[0]))}", flush=True)
    print(f"selected_k_from_artifact={selected_k}", flush=True)

    results: list[DPCResult] = []
    for run_number in range(1, DETERMINISM_RUNS + 1):
        result = dpc_init(
            matrix,
            selected_k,
            cutoff_percentile=STUDY_CUTOFF_PERCENTILE,
        )
        results.append(result)
        print(f"dpc_init_run_{run_number}=complete", flush=True)

    determinism_rows = validate_repeated_runs(results)
    result = results[0]
    write_outputs(ptids, rids, matrix, selected_k, result, determinism_rows)
    print(f"pairwise_distance_count={result.pairwise_distance_count}")
    print(f"d_c={result.d_c:.17g}")
    print(f"selected_indices={result.selected_indices}")
    print(f"centroid_matrix_shape={(len(result.centroid_matrix), len(result.centroid_matrix[0]))}")
    print("three_run_determinism=True")


if __name__ == "__main__":
    main()
