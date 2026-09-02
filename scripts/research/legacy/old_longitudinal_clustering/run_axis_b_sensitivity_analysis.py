"""Run longitudinal-support and extreme-slope robustness checks for Axis B."""

from __future__ import annotations

import json
import math

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.metrics import (
    adjusted_rand_score,
    calinski_harabasz_score,
    davies_bouldin_score,
    silhouette_score,
)

from axis_b_final_common import (
    ALGORITHM,
    ASSIGNMENTS_PATH,
    FEATURE,
    MAX_ITER,
    N_INIT,
    PRIMARY_SEED,
    SELECTED_K,
    SENSITIVITY_PATH,
    TOLERANCE,
    atomic_write_json,
    distribution,
    fit_kmeans,
    frozen_hashes,
    load_slopes,
    result_dict,
)


DIAGNOSTIC_K = tuple(range(2, 11))
DIAGNOSTIC_SEED = 20260812
DIAGNOSTIC_N_INIT = 50


def expanded_distribution(values: pd.Series) -> dict[str, float | int]:
    summary = distribution(values)
    array = values.to_numpy(np.float64)
    summary.update({
        "p01": float(np.quantile(array, 0.01)),
        "p05": float(np.quantile(array, 0.05)),
        "p95": float(np.quantile(array, 0.95)),
        "p99": float(np.quantile(array, 0.99)),
    })
    return summary


def k_diagnostics(frame: pd.DataFrame) -> dict[str, object]:
    X = frame[[FEATURE]].to_numpy(np.float64)
    rows: list[dict[str, float | int]] = []
    for k in DIAGNOSTIC_K:
        model = KMeans(
            n_clusters=k,
            init="k-means++",
            n_init=DIAGNOSTIC_N_INIT,
            random_state=DIAGNOSTIC_SEED,
            max_iter=MAX_ITER,
            tol=TOLERANCE,
            algorithm=ALGORITHM,
        )
        labels = model.fit_predict(X)
        rows.append({
            "k": k,
            "iterations": int(model.n_iter_),
            "inertia": float(model.inertia_),
            "silhouette": float(silhouette_score(X, labels, metric="euclidean")),
            "davies_bouldin": float(davies_bouldin_score(X, labels)),
            "calinski_harabasz": float(calinski_harabasz_score(X, labels)),
        })
    ranks: dict[str, int] = {}
    for metric, reverse in (("silhouette", True), ("davies_bouldin", False), ("calinski_harabasz", True)):
        ordered = sorted(rows, key=lambda row: (-float(row[metric]), int(row["k"])) if reverse else (float(row[metric]), int(row["k"])))
        ranks[metric] = next(index for index, row in enumerate(ordered, start=1) if row["k"] == 2)
    top_three_count = sum(rank <= 3 for rank in ranks.values())
    best_k = {
        "silhouette": int(max(rows, key=lambda row: (float(row["silhouette"]), -int(row["k"])))["k"]),
        "davies_bouldin": int(min(rows, key=lambda row: (float(row["davies_bouldin"]), int(row["k"])))["k"]),
        "calinski_harabasz": int(max(rows, key=lambda row: (float(row["calinski_harabasz"]), -int(row["k"])))["k"]),
    }
    if best_k["silhouette"] == 2 and len(set(best_k.values())) > 1:
        assessment = "MIXED_SUPPORT_K2_IS_SILHOUETTE_WINNER_WITHOUT_MULTI_INDEX_CONSENSUS"
    elif len(set(best_k.values())) == 1 and best_k["silhouette"] == 2:
        assessment = "CONSISTENT_SUPPORT_FOR_K2"
    else:
        assessment = "K2_NOT_SELECTED_BY_ANY_PRIMARY_DIAGNOSTIC"
    return {
        "configuration": {
            "role": "fixed secondary diagnostic only; does not replace frozen full-cohort NbClust k=2",
            "candidate_k": list(DIAGNOSTIC_K),
            "init": "k-means++",
            "n_init": DIAGNOSTIC_N_INIT,
            "random_state": DIAGNOSTIC_SEED,
            "algorithm": ALGORITHM,
            "no_repeated_manipulation_to_favor_k2": True,
        },
        "metrics": rows,
        "best_k_by_metric": best_k,
        "k2_metric_ranks": ranks,
        "conservative_multi_metric_rule": "k=2 ranks in the top three for at least two of Silhouette, Davies-Bouldin, and Calinski-Harabasz",
        "k2_top_three_metric_count": top_three_count,
        "k2_meets_conservative_multi_metric_top_three_rule": top_three_count >= 2,
        "k2_plausibility_assessment": assessment,
        "interpretation": (
            "K=2 remains a plausible fixed-k robustness model when it is the Silhouette winner, "
            "but lack of agreement from Davies-Bouldin and Calinski-Harabasz is reported as "
            "mixed rather than confirmatory evidence."
        ),
    }


def overlap_comparison(
    subset: pd.DataFrame,
    subset_labels: np.ndarray,
    primary_label_map: dict[tuple[str, str], int],
) -> dict[str, object]:
    primary = np.asarray([
        primary_label_map[(str(row.PTID), str(row.RID))]
        for row in subset[["PTID", "RID"]].itertuples(index=False)
    ], dtype=np.int64)
    current = np.asarray(subset_labels, dtype=np.int64)
    confusion = {
        f"primary_{p}_subset_{s}": int(np.count_nonzero((primary == p) & (current == s)))
        for p in (1, 2) for s in (1, 2)
    }
    return {
        "overlap_n": int(len(subset)),
        "adjusted_rand_index": float(adjusted_rand_score(primary, current)),
        "ordered_label_agreement_n": int(np.count_nonzero(primary == current)),
        "ordered_label_agreement_percent": float(100.0 * np.mean(primary == current)),
        "ordered_confusion": confusion,
    }


def analyze_subset(
    name: str,
    frame: pd.DataFrame,
    primary_label_map: dict[tuple[str, str], int],
    *,
    include_k_diagnostics: bool,
) -> dict[str, object]:
    subset = frame.copy().reset_index(drop=True)
    result = fit_kmeans(subset, seed=PRIMARY_SEED, init="random", n_init=N_INIT)
    value = {
        "name": name,
        "n": int(len(subset)),
        "slope_distribution": expanded_distribution(subset[FEATURE]),
        "same_primary_k2_protocol": {
            "init": "random", "n_init": N_INIT, "random_state": PRIMARY_SEED,
            "max_iter": MAX_ITER, "tol": TOLERANCE, "algorithm": ALGORITHM,
        },
        "k2_result": result_dict(result),
        "overlap_with_authoritative_primary": overlap_comparison(subset, result.ordered_labels, primary_label_map),
    }
    if include_k_diagnostics:
        value["k_selection_diagnostics"] = k_diagnostics(subset)
    return value


def main() -> None:
    hashes = frozen_hashes()
    frame = load_slopes()
    if not ASSIGNMENTS_PATH.is_file():
        raise FileNotFoundError("Run run_axis_b_final_clustering.py first")
    assignments = pd.read_csv(ASSIGNMENTS_PATH, dtype={"PTID": str, "RID": str})
    primary_label_map = {
        (str(row.PTID), str(row.RID)): int(row.ordered_cluster_rank)
        for row in assignments[["PTID", "RID", "ordered_cluster_rank"]].itertuples(index=False)
    }
    if len(primary_label_map) != len(frame):
        raise AssertionError("Primary assignment artifact does not cover the slope cohort")
    primary_result = fit_kmeans(frame, seed=PRIMARY_SEED, init="random", n_init=N_INIT)

    sensitivity_masks = {
        "followup_at_least_1_year": frame["followup_years"].ge(1.0),
        "at_least_4_observations": frame["n_observations"].ge(4),
        "followup_at_least_1_year_and_at_least_4_observations": frame["followup_years"].ge(1.0) & frame["n_observations"].ge(4),
    }
    sensitivities = [
        analyze_subset(name, frame.loc[mask], primary_label_map, include_k_diagnostics=True)
        for name, mask in sensitivity_masks.items()
    ]

    ordered_indices = frame.sort_values([FEATURE, "PTID", "RID"], kind="stable").index.to_list()
    tail_count = math.ceil(0.01 * len(frame))
    bottom_indices = set(ordered_indices[:tail_count])
    top_indices = set(ordered_indices[-tail_count:])
    maximum_index = ordered_indices[-1]
    robustness_masks = {
        "exclude_single_maximum_slope": ~frame.index.to_series().eq(maximum_index),
        "exclude_rank_based_top_1_percent": ~frame.index.to_series().isin(top_indices),
        "exclude_rank_based_bottom_1_percent": ~frame.index.to_series().isin(bottom_indices),
        "exclude_rank_based_top_and_bottom_1_percent": ~frame.index.to_series().isin(top_indices | bottom_indices),
    }
    robustness = []
    primary_boundary = float(primary_result.ordered_centroids.mean())
    for name, mask in robustness_masks.items():
        item = analyze_subset(name, frame.loc[mask.to_numpy()], primary_label_map, include_k_diagnostics=False)
        centroids = np.asarray(item["k2_result"]["ordered_centroids"], dtype=np.float64)
        item["change_from_primary"] = {
            "ordered_centroid_differences": (centroids - primary_result.ordered_centroids).tolist(),
            "absolute_ordered_centroid_differences": np.abs(centroids - primary_result.ordered_centroids).tolist(),
            "centroid_midpoint_boundary_difference": float(centroids.mean() - primary_boundary),
            "absolute_centroid_midpoint_boundary_difference": float(abs(centroids.mean() - primary_boundary)),
        }
        robustness.append(item)

    maximum_row = frame.loc[maximum_index]
    output = {
        "status": "AXIS_B_SENSITIVITY_AND_EXTREME_SLOPE_ROBUSTNESS_COMPLETE",
        "primary_analysis_unchanged": {
            "n": len(frame),
            "all_participants_retained": True,
            "winsorization": False,
            "transformations": [],
            "result": result_dict(primary_result),
        },
        "longitudinal_support_sensitivities": sensitivities,
        "sensitivity_cross_check": {
            "all_three_k2_silhouette_winners": all(
                item["k_selection_diagnostics"]["best_k_by_metric"]["silhouette"] == 2
                for item in sensitivities
            ),
            "all_three_have_multi_index_consensus_for_k2": all(
                len(set(item["k_selection_diagnostics"]["best_k_by_metric"].values())) == 1
                and item["k_selection_diagnostics"]["best_k_by_metric"]["silhouette"] == 2
                for item in sensitivities
            ),
            "at_least_4_and_combined_participant_sets_identical": bool(
                sensitivity_masks["at_least_4_observations"].equals(
                    sensitivity_masks["followup_at_least_1_year_and_at_least_4_observations"]
                )
            ),
        },
        "extreme_slope_robustness": {
            "role": "secondary non-destructive checks; not alternative primary cohorts",
            "tail_definition": {
                "method": "exact rank-based tails after stable sorting by slope, PTID, RID",
                "tail_fraction_target": 0.01,
                "tail_count_each": tail_count,
                "tail_percent_each": 100.0 * tail_count / len(frame),
                "bottom_tail_maximum_slope": float(frame.loc[list(bottom_indices), FEATURE].max()),
                "top_tail_minimum_slope": float(frame.loc[list(top_indices), FEATURE].min()),
            },
            "maximum_slope_participant": {
                "PTID": str(maximum_row["PTID"]),
                "RID": str(maximum_row["RID"]),
                "slope": float(maximum_row[FEATURE]),
                "n_observations": int(maximum_row["n_observations"]),
                "followup_years": float(maximum_row["followup_years"]),
            },
            "checks": robustness,
        },
        "integrity": {
            "frozen_input_hashes": hashes,
            "primary_n": len(frame),
            "sensitivity_names": list(sensitivity_masks),
            "robustness_names": list(robustness_masks),
        },
    }
    atomic_write_json(SENSITIVITY_PATH, output)
    print(json.dumps({
        "output": str(SENSITIVITY_PATH),
        "sensitivity_n": {item["name"]: item["n"] for item in sensitivities},
        "k2_plausibility_assessment": {
            item["name"]: item["k_selection_diagnostics"]["k2_plausibility_assessment"]
            for item in sensitivities
        },
        "robustness_n": {item["name"]: item["n"] for item in robustness},
    }, indent=2))


if __name__ == "__main__":
    main()
