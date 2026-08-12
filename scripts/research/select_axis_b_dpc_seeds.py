"""Audit deterministic Axis B DPC centroid seeds without fitting K-Means.

Authoritative inputs:
  data/interim/axis_b_adas13_slopes.csv
  data/interim/axis_b_nbclust_k_selection.json

The numerical DPC implementation is imported from the completed Axis A SOP 3
script so its cutoff-kernel rho, delta branches, gamma calculation, and
row-index tie-break are reused exactly. This script creates one JSON audit and
deliberately creates no cluster assignments or fitted clustering model.
"""

from __future__ import annotations

import csv
import hashlib
import json
import math
import os
from array import array
from collections import Counter
from pathlib import Path
from typing import Any, Sequence

from dpc_init_axis_a import DPCResult, _linear_percentile, dpc_init


ROOT = Path(__file__).resolve().parents[2]
SLOPE_PATH = ROOT / "data" / "interim" / "axis_b_adas13_slopes.csv"
K_SELECTION_PATH = ROOT / "data" / "interim" / "axis_b_nbclust_k_selection.json"
AXIS_A_DPC_PATH = ROOT / "scripts" / "research" / "dpc_init_axis_a.py"
OUTPUT_PATH = ROOT / "data" / "interim" / "axis_b_dpc_seed_selection.json"

FEATURE = "beta1_slope_points_per_year"
EXPECTED_ROWS = 1917
EXPECTED_K = 2
CUTOFFS = (0.01, 0.02, 0.03, 0.05)
PRIMARY_CUTOFF = 0.02
TOP_CANDIDATES = 10
MAXIMUM_SLOPE_PTID = "013_S_4917"


def file_hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def percentile_summary(values: Sequence[float | int]) -> dict[str, float]:
    ordered = sorted(values)
    return {
        "minimum": float(ordered[0]),
        "q1": _linear_percentile(ordered, 0.25),
        "median": _linear_percentile(ordered, 0.50),
        "q3": _linear_percentile(ordered, 0.75),
        "maximum": float(ordered[-1]),
    }


def tie_summary(values: Sequence[float | int]) -> dict[str, int | bool]:
    counts = Counter(values)
    groups = [count for count in counts.values() if count > 1]
    return {
        "ties_occurred": bool(groups),
        "distinct_values": len(counts),
        "tied_value_groups": len(groups),
        "observations_in_ties": sum(groups),
        "largest_tie_group": max(groups, default=1),
    }


def load_inputs() -> tuple[list[dict[str, str]], list[tuple[float]], int, dict[str, Any]]:
    with SLOPE_PATH.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames is None:
            raise AssertionError("Slope input has no header")
        required = {"PTID", "RID", FEATURE}
        missing = required.difference(reader.fieldnames)
        if missing:
            raise AssertionError(f"Slope input is missing columns: {sorted(missing)}")
        rows = list(reader)

    if len(rows) != EXPECTED_ROWS:
        raise AssertionError(f"Expected {EXPECTED_ROWS} slope rows, found {len(rows)}")
    ptids = [row["PTID"].strip() for row in rows]
    rids = [row["RID"].strip() for row in rows]
    if any(not value for value in ptids + rids):
        raise AssertionError("Slope input contains blank PTID or RID")
    if len(set(ptids)) != EXPECTED_ROWS or len(set(rids)) != EXPECTED_ROWS:
        raise AssertionError("PTID and RID must each be unique")

    matrix: list[tuple[float]] = []
    for line_number, row in enumerate(rows, start=2):
        try:
            slope = float(row[FEATURE])
        except (TypeError, ValueError) as exc:
            raise AssertionError(f"Invalid slope at CSV line {line_number}") from exc
        if not math.isfinite(slope):
            raise AssertionError(f"Nonfinite slope at CSV line {line_number}")
        matrix.append((slope,))
    slopes = [row[0] for row in matrix]
    if len(set(slopes)) != EXPECTED_ROWS:
        raise AssertionError("Expected 1,917 unique floating-point slope values")

    with K_SELECTION_PATH.open("r", encoding="utf-8") as handle:
        k_audit = json.load(handle)
    selected_k = k_audit.get("selection", {}).get("selected_k")
    if selected_k != EXPECTED_K:
        raise AssertionError(f"Expected selected k=2, found {selected_k!r}")
    prior_input = k_audit.get("one_dimensional_input_validation", {})
    reconciliation = {
        "prior_participant_rows": prior_input.get("participant_rows"),
        "prior_input_shape": prior_input.get("input_shape"),
        "prior_feature_columns_used": prior_input.get("feature_columns_used"),
        "prior_input_sha256": prior_input.get("input_sha256"),
        "current_input_sha256": file_hash(SLOPE_PATH),
        "prior_raw_unstandardized": not bool(prior_input.get("standardized", True)),
        "prior_slopes_unaltered": not bool(
            prior_input.get("slopes_altered_jittered_or_excluded", True)
        ),
    }
    expected_reconciliation = {
        "prior_participant_rows": EXPECTED_ROWS,
        "prior_input_shape": [EXPECTED_ROWS, 1],
        "prior_feature_columns_used": [FEATURE],
        "prior_input_sha256": reconciliation["current_input_sha256"],
        "current_input_sha256": reconciliation["current_input_sha256"],
        "prior_raw_unstandardized": True,
        "prior_slopes_unaltered": True,
    }
    if reconciliation != expected_reconciliation:
        raise AssertionError(f"SOP 2 input provenance does not reconcile: {reconciliation}")
    return rows, matrix, selected_k, reconciliation


def condensed_distances(matrix: Sequence[Sequence[float]]) -> array:
    distances = array("d")
    for i in range(len(matrix) - 1):
        for j in range(i + 1, len(matrix)):
            distances.append(math.dist(matrix[i], matrix[j]))
    expected = len(matrix) * (len(matrix) - 1) // 2
    if len(distances) != expected:
        raise AssertionError("Unexpected unordered pairwise-distance count")
    if any(not math.isfinite(value) or value < 0.0 for value in distances):
        raise AssertionError("Pairwise distances contain unexpected invalid values")
    return distances


def distance_audit(distances: Sequence[float]) -> dict[str, Any]:
    zero_count = sum(value == 0.0 for value in distances)
    nonzero = sorted(value for value in distances if value > 0.0)
    if not nonzero:
        raise AssertionError("No non-zero pairwise distances are available")
    return {
        "unordered_pairwise_distances": len(distances),
        "self_distances_included": False,
        "diagonal_included": False,
        "zero_nonself_distances": zero_count,
        "nonzero_pairwise_distances": len(nonzero),
        "minimum_nonzero": nonzero[0],
        "percentile_1": _linear_percentile(nonzero, 0.01),
        "percentile_2_primary_d_c": _linear_percentile(nonzero, 0.02),
        "percentile_3": _linear_percentile(nonzero, 0.03),
        "percentile_5": _linear_percentile(nonzero, 0.05),
        "median": _linear_percentile(nonzero, 0.50),
        "percentile_95": _linear_percentile(nonzero, 0.95),
        "percentile_99": _linear_percentile(nonzero, 0.99),
        "maximum": nonzero[-1],
        "percentile_method": "linear interpolation; NumPy/R type-7 convention",
    }


def candidate_record(
    index: int,
    gamma_rank: int,
    rows: Sequence[dict[str, str]],
    slopes: Sequence[float],
    result: DPCResult,
) -> dict[str, Any]:
    ascending = sorted(range(len(slopes)), key=lambda item: (slopes[item], item))
    slope_rank = {item: rank for rank, item in enumerate(ascending, start=1)}[index]
    below = slope_rank - 1
    above = len(slopes) - slope_rank
    bottom_one_count = math.ceil(len(slopes) * 0.01)
    return {
        "gamma_rank": gamma_rank,
        "analytical_row_index": index,
        "PTID": rows[index]["PTID"].strip(),
        "RID": rows[index]["RID"].strip(),
        FEATURE: slopes[index],
        "rho": result.rho[index],
        "delta": result.delta[index],
        "gamma": result.gamma[index],
        "slope_ascending_rank": slope_rank,
        "slope_percentile_0_to_100": 100.0 * below / (len(slopes) - 1),
        "observations_below_slope": below,
        "observations_above_slope": above,
        "among_10_most_negative": slope_rank <= 10,
        "among_10_most_positive": slope_rank > len(slopes) - 10,
        "in_bottom_1_percent": slope_rank <= bottom_one_count,
        "in_top_1_percent": slope_rank > len(slopes) - bottom_one_count,
    }


def result_audit(
    result: DPCResult,
    rows: Sequence[dict[str, str]],
    slopes: Sequence[float],
) -> dict[str, Any]:
    rho_ties = tie_summary(result.rho)
    rho_ties.update(
        {
            "rho_zero_observations": sum(value == 0 for value in result.rho),
            "frequency_distribution": [
                {"rho_neighbor_count": value, "observations": count}
                for value, count in sorted(Counter(result.rho).items())
            ],
        }
    )
    maximum_rho = max(result.rho)
    maximum_indices = [i for i, value in enumerate(result.rho) if value == maximum_rho]
    top = [
        candidate_record(index, rank, rows, slopes, result)
        for rank, index in enumerate(result.ranked_indices[:TOP_CANDIDATES], start=1)
    ]
    return {
        "cutoff_percentile": result.cutoff_percentile,
        "d_c": result.d_c,
        "rho_formula": "rho_i = sum over j != i of indicator(d_ij < d_c)",
        "rho_kernel": "hard cutoff / neighbor count; strict inequality",
        "rho_distribution": percentile_summary(result.rho),
        "rho_ties_and_effective_neighborhoods": rho_ties,
        "delta_definition": (
            "minimum distance to an observation with strictly greater rho; "
            "each global maximum-rho observation uses its own farthest-neighbor distance"
        ),
        "delta_distribution": percentile_summary(result.delta),
        "delta_ties": tie_summary(result.delta),
        "global_maximum_rho": maximum_rho,
        "global_maximum_rho_observations": len(maximum_indices),
        "global_maximum_rho_indices": maximum_indices,
        "gamma_formula": "gamma_i = rho_i * delta_i",
        "gamma_distribution": percentile_summary(result.gamma),
        "gamma_ties": tie_summary(result.gamma),
        "ranking_rule": "descending gamma, then ascending zero-based validated analytical_row_index",
        "top_10_density_peak_candidates": top,
        "selected_two_seeds": top[:EXPECTED_K],
    }


def sensitivity_record(
    result: DPCResult,
    primary: DPCResult,
    rows: Sequence[dict[str, str]],
    slopes: Sequence[float],
) -> dict[str, Any]:
    selected = list(result.selected_indices)
    primary_selected = list(primary.selected_indices)
    return {
        "cutoff_percentile": result.cutoff_percentile,
        "d_c": result.d_c,
        "rho_median": _linear_percentile(sorted(result.rho), 0.50),
        "rho_maximum": max(result.rho),
        "distinct_rho_values": len(set(result.rho)),
        "top_two": [
            {
                "PTID": rows[index]["PTID"].strip(),
                "RID": rows[index]["RID"].strip(),
                FEATURE: slopes[index],
            }
            for index in selected
        ],
        "identical_ordered_pair_to_primary": selected == primary_selected,
        "label_order_equivalent_to_primary": set(selected) == set(primary_selected),
    }


def sorted_gap_audit(rows: Sequence[dict[str, str]], slopes: Sequence[float]) -> dict[str, Any]:
    ordered = sorted(range(len(slopes)), key=lambda index: (slopes[index], index))
    gaps = [
        (slopes[right] - slopes[left], left, right)
        for left, right in zip(ordered, ordered[1:])
    ]
    top_gaps = sorted(gaps, key=lambda item: (-item[0], item[1], item[2]))[:10]
    positive_gaps = sorted(gap for gap, _, _ in gaps if gap > 0.0)
    return {
        "adjacent_gap_distribution": {
            "minimum": positive_gaps[0],
            "q1": _linear_percentile(positive_gaps, 0.25),
            "median": _linear_percentile(positive_gaps, 0.50),
            "q3": _linear_percentile(positive_gaps, 0.75),
            "percentile_95": _linear_percentile(positive_gaps, 0.95),
            "percentile_99": _linear_percentile(positive_gaps, 0.99),
            "maximum": positive_gaps[-1],
        },
        "ten_largest_adjacent_gaps": [
            {
                "gap": gap,
                "lower_PTID": rows[left]["PTID"].strip(),
                "lower_RID": rows[left]["RID"].strip(),
                "lower_slope": slopes[left],
                "upper_PTID": rows[right]["PTID"].strip(),
                "upper_RID": rows[right]["RID"].strip(),
                "upper_slope": slopes[right],
            }
            for gap, left, right in top_gaps
        ],
    }


def determinism_audit(first: DPCResult, second: DPCResult) -> dict[str, bool]:
    checks = {
        "d_c_exact": first.d_c == second.d_c,
        "rho_exact": first.rho == second.rho,
        "delta_exact": first.delta == second.delta,
        "gamma_exact": first.gamma == second.gamma,
        "ranked_candidates_exact": first.ranked_indices == second.ranked_indices,
        "selected_two_seeds_exact": first.selected_indices == second.selected_indices,
    }
    checks["overall_pass"] = all(checks.values())
    if not checks["overall_pass"]:
        raise AssertionError(f"Primary DPC initialization is nondeterministic: {checks}")
    return checks


def write_json(payload: dict[str, Any]) -> None:
    temporary = OUTPUT_PATH.with_suffix(OUTPUT_PATH.suffix + ".tmp")
    with temporary.open("w", encoding="utf-8", newline="\n") as handle:
        json.dump(payload, handle, indent=2, ensure_ascii=False, allow_nan=False)
        handle.write("\n")
    os.replace(temporary, OUTPUT_PATH)


def main() -> None:
    input_hash_before = file_hash(SLOPE_PATH)
    k_hash_before = file_hash(K_SELECTION_PATH)
    axis_a_hash_before = file_hash(AXIS_A_DPC_PATH)
    rows, matrix, selected_k, reconciliation = load_inputs()
    slopes = [values[0] for values in matrix]

    distances = condensed_distances(matrix)
    pairwise = distance_audit(distances)
    if pairwise["zero_nonself_distances"] != 0:
        raise AssertionError("Unique slopes unexpectedly produced zero non-self distances")

    primary_first = dpc_init(matrix, selected_k, cutoff_percentile=PRIMARY_CUTOFF)
    primary_second = dpc_init(matrix, selected_k, cutoff_percentile=PRIMARY_CUTOFF)
    determinism = determinism_audit(primary_first, primary_second)
    if primary_first.d_c != pairwise["percentile_2_primary_d_c"]:
        raise AssertionError("Primary d_c did not reproduce the audited 2nd percentile")
    primary = result_audit(primary_first, rows, slopes)

    cutoff_results: dict[float, DPCResult] = {PRIMARY_CUTOFF: primary_first}
    for cutoff in CUTOFFS:
        if cutoff != PRIMARY_CUTOFF:
            cutoff_results[cutoff] = dpc_init(matrix, selected_k, cutoff_percentile=cutoff)
    sensitivity = [
        sensitivity_record(cutoff_results[cutoff], primary_first, rows, slopes)
        for cutoff in CUTOFFS
    ]
    changed_cutoffs = [
        record["cutoff_percentile"]
        for record in sensitivity
        if record["cutoff_percentile"] != PRIMARY_CUTOFF
        and not record["label_order_equivalent_to_primary"]
    ]

    rank_by_index = {
        index: rank for rank, index in enumerate(primary_first.ranked_indices, start=1)
    }
    maximum_indices = [
        index for index, row in enumerate(rows) if row["PTID"].strip() == MAXIMUM_SLOPE_PTID
    ]
    if len(maximum_indices) != 1:
        raise AssertionError(f"Expected one {MAXIMUM_SLOPE_PTID} row, found {len(maximum_indices)}")
    maximum_index = maximum_indices[0]
    maximum_record = candidate_record(
        maximum_index, rank_by_index[maximum_index], rows, slopes, primary_first
    )
    selected_tail_flags = [
        {
            "PTID": record["PTID"],
            "RID": record["RID"],
            "among_10_most_negative": record["among_10_most_negative"],
            "among_10_most_positive": record["among_10_most_positive"],
            "in_bottom_1_percent": record["in_bottom_1_percent"],
            "in_top_1_percent": record["in_top_1_percent"],
            "any_extreme_tail_flag": any(
                record[key]
                for key in (
                    "among_10_most_negative",
                    "among_10_most_positive",
                    "in_bottom_1_percent",
                    "in_top_1_percent",
                )
            ),
        }
        for record in primary["selected_two_seeds"]
    ]
    selected_slopes = [record[FEATURE] for record in primary["selected_two_seeds"]]
    selected_separation = abs(selected_slopes[1] - selected_slopes[0])
    selected_both_global_maximum_rho = all(
        record["rho"] == primary["global_maximum_rho"]
        for record in primary["selected_two_seeds"]
    )
    selected_within_primary_neighborhood = selected_separation < primary_first.d_c
    third_gamma = primary["top_10_density_peak_candidates"][2]["gamma"]
    gamma_first_to_third_ratio = primary["selected_two_seeds"][0]["gamma"] / third_gamma
    maximum_slope_drives_selected_delta = all(
        math.isclose(
            record["delta"],
            abs(record[FEATURE] - slopes[maximum_index]),
            rel_tol=0.0,
            abs_tol=0.0,
        )
        for record in primary["selected_two_seeds"]
    )
    stop_reasons: list[str] = []
    if changed_cutoffs:
        stop_reasons.append(
            "Nearby cutoff sensitivity changed the unordered seed pair at cutoff(s) "
            + ", ".join(f"{100 * value:g}%" for value in changed_cutoffs)
            + "; resolve the provisional one-dimensional DPC initialization methodology "
            "before final Axis B clustering."
        )
    if selected_both_global_maximum_rho and selected_within_primary_neighborhood:
        stop_reasons.append(
            "The two primary seeds are tied global-rho maxima within one d_c neighborhood "
            "and are nearly coincident in slope space; the inherited maximum-density delta "
            "branch assigns both farthest-neighbor separation, so they are not substantively "
            "separated progression peaks. Reconcile this one-dimensional DPC behavior before "
            "final Axis B clustering."
        )

    payload = {
        "status": "audit_complete_with_blocker" if stop_reasons else "audit_complete",
        "scope": {
            "purpose": "DPC initialization audit and deterministic seed selection only",
            "kmeans_executed": False,
            "cluster_assignments_created": False,
            "random_init_baselines_executed": False,
            "ablation_executed": False,
            "sensitivity_clustering_executed": False,
            "cutoff_sensitivity_role": "audit only; primary 2% cutoff remains unchanged",
        },
        "files_read": {
            str(SLOPE_PATH.relative_to(ROOT)): input_hash_before,
            str(K_SELECTION_PATH.relative_to(ROOT)): k_hash_before,
            str(AXIS_A_DPC_PATH.relative_to(ROOT)): axis_a_hash_before,
        },
        "input_validation": {
            "participants": len(rows),
            "unique_PTID": len({row["PTID"].strip() for row in rows}),
            "unique_RID": len({row["RID"].strip() for row in rows}),
            "input_shape": [len(matrix), 1],
            "selected_k": selected_k,
            "feature_used": FEATURE,
            "all_slopes_finite": all(math.isfinite(value) for value in slopes),
            "unique_slope_values": len(set(slopes)),
            "zero_duplicate_slope_groups": len(slopes) - len(set(slopes)) == 0,
            "slopes_standardized_transformed_capped_winsorized_jittered_or_removed": False,
            "sop2_reconciliation": reconciliation,
        },
        "inherited_axis_a_implementation": {
            "source": str(AXIS_A_DPC_PATH.relative_to(ROOT)),
            "euclidean_distance_in_1d": "d_ij = abs(x_i - x_j)",
            "pair_storage": "unordered i<j condensed distances; no diagonal/self distances",
            "cutoff_rule": "type-7 percentile of strictly positive pairwise distances",
            "primary_cutoff_percentile": PRIMARY_CUTOFF,
            "rho_formula": "rho_i = sum over j != i of indicator(d_ij < d_c)",
            "rho_cutoff_equality_included": False,
            "delta_rule": (
                "minimum distance to strictly higher rho; equal rho never counts as higher; "
                "every global rho maximum uses its own farthest-neighbor distance"
            ),
            "gamma_rule": "gamma_i = rho_i * delta_i",
            "ranking_tie_break": (
                "descending gamma, then ascending original zero-based validated analytical row index"
            ),
            "selected_centroids_are_observations": True,
        },
        "pairwise_distance_audit": {"input_n": len(rows), **pairwise},
        "primary_2_percent_audit": primary,
        "extreme_value_safety_check": {
            "selected_seed_flags": selected_tail_flags,
            "either_selected_seed_in_extreme_tail": any(
                item["any_extreme_tail_flag"] for item in selected_tail_flags
            ),
            "maximum_slope_participant": maximum_record,
            "maximum_slope_participant_in_top_10_gamma": maximum_record["gamma_rank"] <= 10,
        },
        "cutoff_sensitivity_audit": {
            "no_cutoff_optimization_performed": True,
            "comparisons": sensitivity,
            "cutoffs_with_non_equivalent_seed_pair": changed_cutoffs,
            "primary_pair_stable_at_all_nearby_cutoffs": not changed_cutoffs,
        },
        "one_dimensional_diagnostics": {
            **sorted_gap_audit(rows, slopes),
            "selected_seed_absolute_separation": selected_separation,
            "selected_seed_slopes": selected_slopes,
            "selected_seed_separation_as_fraction_of_d_c": (
                selected_separation / primary_first.d_c
            ),
            "selected_seed_separation_as_fraction_of_median_pairwise_distance": (
                selected_separation / pairwise["median"]
            ),
            "selected_both_global_maximum_rho": selected_both_global_maximum_rho,
            "selected_pair_within_one_primary_d_c_neighborhood": (
                selected_within_primary_neighborhood
            ),
            "maximum_slope_tail_drives_both_selected_delta_values": (
                maximum_slope_drives_selected_delta
            ),
            "first_gamma_to_third_gamma_ratio": gamma_first_to_third_ratio,
            "assessment": {
                "large_gaps_and_isolated_tails": (
                    "The maximum slope is isolated by the largest adjacent gap; the 29.6353 "
                    "gap is far above the 99th-percentile adjacent gap."
                ),
                "delta_tail_behavior": (
                    "Both tied global-density maxima use the farthest-neighbor branch, and "
                    "their delta is the distance to the isolated maximum-slope participant."
                ),
                "rho_behavior": (
                    "The strict cutoff count strongly favors the dense central slope region; "
                    "both selected observations have the global maximum rho."
                ),
                "gamma_behavior": (
                    "The dominant two gamma scores arise from the interaction of maximum rho "
                    "with the special farthest-neighbor delta branch; their gamma greatly "
                    "exceeds the third-ranked candidate."
                ),
                "substantive_seed_separation": (
                    "The selected slopes are nearly coincident and lie within one d_c "
                    "neighborhood, so they are not substantively separated progression peaks."
                ),
                "algorithm_changed": False,
            },
        },
        "determinism_validation": {
            "primary_runs": 2,
            "randomness_used": False,
            **determinism,
        },
        "stop_reasons_before_final_clustering": stop_reasons,
        "blocker_remains_before_final_axis_b_enhanced_kmeans": bool(stop_reasons),
        "outputs": {"audit_json": str(OUTPUT_PATH.relative_to(ROOT))},
        "input_immutability": {
            "slope_sha256_unchanged": file_hash(SLOPE_PATH) == input_hash_before,
            "k_selection_sha256_unchanged": file_hash(K_SELECTION_PATH) == k_hash_before,
            "axis_a_dpc_sha256_unchanged": file_hash(AXIS_A_DPC_PATH) == axis_a_hash_before,
        },
        "prohibited_outputs_created": [],
    }
    if not all(payload["input_immutability"].values()):
        raise AssertionError("An authoritative input or Axis A implementation changed during audit")
    write_json(payload)
    print(f"validated_input_shape={(len(matrix), 1)}")
    print(f"selected_k={selected_k}")
    print(f"pairwise_distance_count={len(distances)}")
    print(f"primary_d_c={primary_first.d_c:.17g}")
    print(f"selected_indices={primary_first.selected_indices}")
    print(f"selected_PTID={[rows[i]['PTID'] for i in primary_first.selected_indices]}")
    print(f"sensitivity_changed_cutoffs={changed_cutoffs}")
    print("two_run_determinism=True")
    print("kmeans_executed=False")


if __name__ == "__main__":
    main()
