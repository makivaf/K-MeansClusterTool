"""Fit, characterize, and reproduce the authoritative Path B Axis B model."""

from __future__ import annotations

import json
import platform

import numpy as np
import pandas as pd
import sklearn

from axis_b_final_common import (
    ALGORITHM,
    ASSIGNMENTS_PATH,
    COHORT_PATH,
    FEATURE,
    FINAL_METRICS_PATH,
    MAX_ITER,
    N_INIT,
    PRIMARY_SEED,
    PROFILES_PATH,
    RECONCILIATION_PATH,
    ROOT,
    SELECTED_K,
    TOLERANCE,
    atomic_write_csv,
    atomic_write_json,
    close_enough,
    distribution,
    file_hash,
    fit_kmeans,
    frozen_hashes,
    load_slopes,
    result_dict,
)


def main() -> None:
    hashes = frozen_hashes()
    if not RECONCILIATION_PATH.is_file():
        raise FileNotFoundError("Run reconcile_axis_b_dpc_methodology.py first")
    with RECONCILIATION_PATH.open("r", encoding="utf-8") as handle:
        reconciliation = json.load(handle)
    if reconciliation.get("decision", {}).get("path") != "B":
        raise AssertionError("This final protocol is authorized only by the frozen Path B decision")

    frame = load_slopes()
    cohort_ids = pd.read_csv(COHORT_PATH, usecols=["PTID", "RID"], dtype=str).drop_duplicates()
    slope_pairs = set(map(tuple, frame[["PTID", "RID"]].itertuples(index=False, name=None)))
    cohort_pairs = set(map(tuple, cohort_ids[["PTID", "RID"]].itertuples(index=False, name=None)))
    if slope_pairs != cohort_pairs:
        raise AssertionError("Slope participants do not exactly match the frozen cohort")

    first = fit_kmeans(frame, seed=PRIMARY_SEED, init="random", n_init=N_INIT)
    second = fit_kmeans(frame, seed=PRIMARY_SEED, init="random", n_init=N_INIT)
    reproducibility = {
        "complete_primary_runs": 2,
        "participant_set_identical": True,
        "configuration_identical": True,
        "raw_assignments_exact": bool(np.array_equal(first.raw_labels, second.raw_labels)),
        "ordered_assignments_exact": bool(np.array_equal(first.ordered_labels, second.ordered_labels)),
        "partition_hash_exact": first.partition_hash == second.partition_hash,
        "ordered_centroids_within_tolerance": bool(np.allclose(first.ordered_centroids, second.ordered_centroids, rtol=1e-12, atol=1e-12)),
        "inertia_within_tolerance": close_enough(first.inertia, second.inertia),
        "metrics_within_tolerance": all([
            close_enough(first.silhouette, second.silhouette),
            close_enough(first.davies_bouldin, second.davies_bouldin),
            close_enough(first.calinski_harabasz, second.calinski_harabasz),
        ]),
    }
    reproducibility["overall_pass"] = all(
        value for key, value in reproducibility.items()
        if key not in {"complete_primary_runs"}
    )
    if not reproducibility["overall_pass"]:
        raise AssertionError(f"Primary model did not reproduce: {reproducibility}")

    assignments = frame[[
        "PTID", "RID", "study_entry_phase", FEATURE, "n_observations",
        "followup_years", "r_squared", "RMSE",
    ]].copy()
    assignments["final_axis_b_cluster"] = first.raw_labels
    assignments["ordered_cluster_rank"] = first.ordered_labels
    assignments["cluster_centroid_slope"] = [
        first.ordered_centroids[rank - 1] for rank in first.ordered_labels
    ]
    assignment_columns = [
        "PTID", "RID", "study_entry_phase", FEATURE, "n_observations",
        "followup_years", "r_squared", "RMSE", "final_axis_b_cluster",
        "ordered_cluster_rank", "cluster_centroid_slope",
    ]
    atomic_write_csv(ASSIGNMENTS_PATH, assignment_columns, assignments[assignment_columns].to_dict("records"))

    profiles: list[dict[str, object]] = []
    full_profiles: list[dict[str, object]] = []
    for rank in range(1, SELECTED_K + 1):
        cluster = assignments.loc[assignments["ordered_cluster_rank"].eq(rank)]
        stats = distribution(cluster[FEATURE])
        centroid = float(first.ordered_centroids[rank - 1])
        profile = {
            "ordered_cluster": rank,
            "n": int(len(cluster)),
            "percent": 100.0 * len(cluster) / len(assignments),
            "centroid_slope": centroid,
            "mean_slope": stats["mean"],
            "centroid_minus_assigned_mean": centroid - float(stats["mean"]),
            "median_slope": stats["median"],
            "q1_slope": stats["q1"],
            "q3_slope": stats["q3"],
            "minimum_slope": stats["minimum"],
            "maximum_slope": stats["maximum"],
            "standard_deviation_slope_sample_ddof_1": stats["standard_deviation_sample_ddof_1"],
            "median_followup_years": float(cluster["followup_years"].median()),
            "median_n_observations": float(cluster["n_observations"].median()),
            "median_r_squared": float(cluster["r_squared"].median()),
            "median_RMSE": float(cluster["RMSE"].median()),
        }
        profiles.append(profile)
        full_profiles.append({
            **profile,
            "descriptive_label": "lower-slope progression group" if rank == 1 else "higher-slope progression group",
        })
    profile_columns = list(profiles[0])
    atomic_write_csv(PROFILES_PATH, profile_columns, profiles)

    validation = {
        "assignment_rows": int(len(assignments)),
        "unique_PTID": int(assignments["PTID"].nunique()),
        "unique_RID": int(assignments["RID"].nunique()),
        "unique_PTID_RID": int(assignments[["PTID", "RID"]].drop_duplicates().shape[0]),
        "every_participant_assigned_once": not assignments[["PTID", "RID"]].duplicated().any(),
        "nonfinite_cluster_features": int((~np.isfinite(assignments[FEATURE].to_numpy(np.float64))).sum()),
        "empty_clusters": 0,
        "cluster_count_sum": int(sum(first.ordered_cluster_sizes)),
        "centroid_order_strictly_increasing": bool(np.all(np.diff(first.ordered_centroids) > 0)),
        "participant_set_exactly_frozen_cohort": slope_pairs == cohort_pairs,
    }
    if validation != {
        "assignment_rows": 1917,
        "unique_PTID": 1917,
        "unique_RID": 1917,
        "unique_PTID_RID": 1917,
        "every_participant_assigned_once": True,
        "nonfinite_cluster_features": 0,
        "empty_clusters": 0,
        "cluster_count_sum": 1917,
        "centroid_order_strictly_increasing": True,
        "participant_set_exactly_frozen_cohort": True,
    }:
        raise AssertionError(f"Final assignment validation failed: {validation}")

    metrics = {
        "status": "PRIMARY_AXIS_B_CLUSTERING_COMPLETE",
        "path": "B",
        "input": {
            "participant_rows": len(frame),
            "feature": FEATURE,
            "feature_unit": "ADAS-Cog13 points per year",
            "raw_unstandardized": True,
            "transformations": [],
            "PCA_applied": False,
            "PCA_position": (
                "PCA was not applied to Axis B because the longitudinal representation "
                "consisted of a single participant-level progression-rate feature and "
                "therefore contained no multivariate dimensionality to reduce."
            ),
        },
        "k_selection": {
            "selected_k": 2,
            "source": "frozen NbClust result",
            "usable_numerical_votes": 23,
            "winning_votes": 8,
            "tie": False,
        },
        "configuration": {
            "implementation": "sklearn.cluster.KMeans",
            "sklearn_version": sklearn.__version__,
            "python_version": platform.python_version(),
            "distance": "Euclidean (implicit squared Euclidean K-Means objective)",
            "init": "random",
            "n_init": N_INIT,
            "random_state": PRIMARY_SEED,
            "max_iter": MAX_ITER,
            "tol": TOLERANCE,
            "algorithm": ALGORITHM,
            "reporting_seed_rationale": (
                "Seed 0 was fixed before fitting as the first member of the existing 0-29 "
                "baseline convention; it was not chosen by inspecting cluster metrics."
            ),
        },
        "result": result_dict(first),
        "cluster_profiles": full_profiles,
        "reproducibility": reproducibility,
        "validation": validation,
        "integrity": {
            "frozen_input_hashes": hashes,
            "reconciliation_sha256": file_hash(RECONCILIATION_PATH),
            "assignments_sha256": file_hash(ASSIGNMENTS_PATH),
            "profiles_sha256": file_hash(PROFILES_PATH),
        },
        "interpretive_guardrails": {
            "positive_slope": "increasing/worsening ADAS-Cog13 score",
            "negative_slope": "decreasing score; not automatically true clinical improvement",
            "clusters_are_clinical_stages": False,
        },
    }
    atomic_write_json(FINAL_METRICS_PATH, metrics)
    print(json.dumps({
        "assignments": str(ASSIGNMENTS_PATH),
        "profiles": str(PROFILES_PATH),
        "metrics": str(FINAL_METRICS_PATH),
        "result": metrics["result"],
        "reproducibility_pass": reproducibility["overall_pass"],
    }, indent=2))


if __name__ == "__main__":
    main()
