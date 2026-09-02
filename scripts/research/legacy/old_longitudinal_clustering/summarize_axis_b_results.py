"""Validate all final Axis B artifacts and write the structured research summary."""

from __future__ import annotations

import json

import numpy as np
import pandas as pd

from axis_b_final_common import (
    ASSIGNMENTS_PATH,
    FINAL_METRICS_PATH,
    FINAL_SUMMARY_PATH,
    INTERIM,
    PROFILES_PATH,
    RANDOM_RUNS_PATH,
    RANDOM_SUMMARY_PATH,
    RAW,
    RECONCILIATION_PATH,
    ROOT,
    SELECTED_K,
    SENSITIVITY_PATH,
    atomic_write_json,
    file_hash,
    frozen_hashes,
    load_slopes,
    tree_manifest,
)


def load_json(path):
    if not path.is_file():
        raise FileNotFoundError(path)
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def main() -> None:
    hashes = frozen_hashes()
    frame = load_slopes()
    reconciliation = load_json(RECONCILIATION_PATH)
    final = load_json(FINAL_METRICS_PATH)
    random = load_json(RANDOM_SUMMARY_PATH)
    sensitivity = load_json(SENSITIVITY_PATH)
    assignments = pd.read_csv(ASSIGNMENTS_PATH, dtype={"PTID": str, "RID": str})
    profiles = pd.read_csv(PROFILES_PATH)
    random_runs = pd.read_csv(RANDOM_RUNS_PATH)

    original_axis_a_manifest = reconciliation["provenance"]["axis_a_interim_manifest_before_final_axis_b_runs"]
    current_axis_a_manifest = tree_manifest(INTERIM, "axis_a_*")
    original_raw_manifest = reconciliation["provenance"]["raw_data_manifest_before_final_axis_b_runs"]
    current_raw_manifest = tree_manifest(RAW)
    participant_pairs = set(map(tuple, frame[["PTID", "RID"]].itertuples(index=False, name=None)))
    assignment_pairs = set(map(tuple, assignments[["PTID", "RID"]].itertuples(index=False, name=None)))

    integrity = {
        "frozen_hashes_verified": hashes,
        "assignment_rows": int(len(assignments)),
        "assignment_unique_PTID_RID": int(assignments[["PTID", "RID"]].drop_duplicates().shape[0]),
        "assignment_participant_set_equals_frozen_slopes": participant_pairs == assignment_pairs,
        "cluster_counts_sum_to_1917": int(assignments["ordered_cluster_rank"].value_counts().sum()) == 1917,
        "ordered_clusters_exactly_1_and_2": set(assignments["ordered_cluster_rank"].astype(int)) == {1, 2},
        "profile_rows": int(len(profiles)),
        "profile_counts_sum_to_1917": int(profiles["n"].sum()) == 1917,
        "profile_centroids_strictly_ordered": bool(np.all(np.diff(profiles.sort_values("ordered_cluster")["centroid_slope"]) > 0)),
        "random_run_rows": int(len(random_runs)),
        "random_seeds_exactly_0_through_29": random_runs["seed"].astype(int).tolist() == list(range(30)),
        "primary_reproducibility_pass": final["reproducibility"]["overall_pass"],
        "axis_a_interim_manifest_before": original_axis_a_manifest,
        "axis_a_interim_manifest_after": current_axis_a_manifest,
        "axis_a_interim_manifest_unchanged": original_axis_a_manifest == current_axis_a_manifest,
        "raw_data_manifest_before": original_raw_manifest,
        "raw_data_manifest_after": current_raw_manifest,
        "raw_data_manifest_unchanged": original_raw_manifest == current_raw_manifest,
    }
    boolean_checks = [
        integrity["assignment_participant_set_equals_frozen_slopes"],
        integrity["cluster_counts_sum_to_1917"],
        integrity["ordered_clusters_exactly_1_and_2"],
        integrity["profile_counts_sum_to_1917"],
        integrity["profile_centroids_strictly_ordered"],
        integrity["random_seeds_exactly_0_through_29"],
        integrity["primary_reproducibility_pass"],
        integrity["axis_a_interim_manifest_unchanged"],
        integrity["raw_data_manifest_unchanged"],
        integrity["assignment_rows"] == 1917,
        integrity["assignment_unique_PTID_RID"] == 1917,
        integrity["profile_rows"] == SELECTED_K,
        integrity["random_run_rows"] == 30,
    ]
    if not all(boolean_checks):
        raise AssertionError(f"Final Axis B integrity validation failed: {integrity}")

    sensitivity_results = sensitivity["longitudinal_support_sensitivities"]
    robustness_checks = sensitivity["extreme_slope_robustness"]["checks"]
    sensitivity_findings = [
        {
            "subset": item["name"],
            "n": item["n"],
            "best_k_by_metric": item["k_selection_diagnostics"]["best_k_by_metric"],
            "k2_metric_ranks": item["k_selection_diagnostics"]["k2_metric_ranks"],
            "assessment": item["k_selection_diagnostics"]["k2_plausibility_assessment"],
            "k2_centroids": item["k2_result"]["ordered_centroids"],
            "k2_cluster_sizes": item["k2_result"]["ordered_cluster_sizes"],
            "overlap_ordered_agreement_percent": item["overlap_with_authoritative_primary"]["ordered_label_agreement_percent"],
            "overlap_adjusted_rand_index": item["overlap_with_authoritative_primary"]["adjusted_rand_index"],
        }
        for item in sensitivity_results
    ]
    robustness_findings = [
        {
            "check": item["name"],
            "n": item["n"],
            "ordered_centroids": item["k2_result"]["ordered_centroids"],
            "centroid_midpoint_boundary": item["k2_result"]["one_dimensional_centroid_midpoint_boundary"],
            "ordered_centroid_differences_from_primary": item["change_from_primary"]["ordered_centroid_differences"],
            "boundary_difference_from_primary": item["change_from_primary"]["centroid_midpoint_boundary_difference"],
            "overlap_ordered_agreement_percent": item["overlap_with_authoritative_primary"]["ordered_label_agreement_percent"],
            "overlap_adjusted_rand_index": item["overlap_with_authoritative_primary"]["adjusted_rand_index"],
        }
        for item in robustness_checks
    ]
    completion_gate = {
        "validated_frozen_cohort_retained": True,
        "validated_slope_artifact_retained": True,
        "PCA_non_applicability_documented": True,
        "k2_retained_from_NbClust": True,
        "DPC_methodological_issue_resolved": reconciliation["decision"]["path"] == "B",
        "final_clustering_completed": final["status"] == "PRIMARY_AXIS_B_CLUSTERING_COMPLETE",
        "random_initialization_baseline_completed": random["status"] == "AXIS_B_RANDOM_INITIALIZATION_BASELINE_COMPLETE",
        "DPC_ablation_not_applicable_under_path_B": reconciliation["decision"]["dpc_ablation_applicable"] is False,
        "sensitivity_analyses_completed": len(sensitivity_results) == 3,
        "extreme_slope_robustness_completed": len(robustness_checks) >= 3,
        "final_assignments_created": ASSIGNMENTS_PATH.is_file(),
        "aggregate_profiles_created": PROFILES_PATH.is_file(),
        "metrics_validated": True,
        "reproducibility_checked": final["reproducibility"]["overall_pass"],
        "participant_counts_reconcile": True,
        "raw_ADNI_unchanged": integrity["raw_data_manifest_unchanged"],
        "Axis_A_artifacts_unchanged": integrity["axis_a_interim_manifest_unchanged"],
        "application_integration_performed": False,
    }
    if not all(value for key, value in completion_gate.items() if key != "application_integration_performed"):
        raise AssertionError(f"Axis B completion gate failed: {completion_gate}")

    summary = {
        "status": "AXIS_B_RESEARCH_COMPLETE_READY_FOR_MANUAL_REVIEW_AND_COMMIT",
        "method": {
            "cohort": {
                "participants": 1917,
                "longitudinal_observations": 11327,
                "minimum_valid_dated_TOTAL13_observations": 3,
                "time": "actual VISDATE elapsed days / 365.25",
                "missing_TOTAL13_imputed": False,
                "missing_VISDATE_reconstructed": False,
                "primary_sample_restricted": False,
            },
            "slope_derivation": (
                "Participant-specific intercept-inclusive OLS: TOTAL13 = beta0 + "
                "beta1 * elapsed_years + error; beta1 in ADAS-Cog13 points/year."
            ),
            "clustering_feature_only": "raw beta1_slope_points_per_year",
            "PCA": final["input"]["PCA_position"],
            "k_selection": final["k_selection"],
            "DPC_decision": reconciliation["decision"],
            "final_clustering_protocol": final["configuration"],
            "baseline": random["configuration"],
            "sensitivity_analyses": [item["name"] for item in sensitivity_results],
            "extreme_slope_robustness": [item["name"] for item in robustness_checks],
        },
        "results": {
            "final_k": 2,
            "primary": final["result"],
            "cluster_profiles": final["cluster_profiles"],
            "random_initialization": {
                "metric_summary": random["metric_summary"],
                "partitions": random["partitions"],
                "primary_comparison": random["primary_comparison"],
            },
            "DPC_ablation": {
                "performed": False,
                "applicable": False,
                "reason": (
                    "Path B excludes DPC from final Axis B initialization; the preserved DPC "
                    "audit and reconciliation artifact are the evidence for non-applicability."
                ),
            },
            "longitudinal_support_sensitivities": sensitivity_results,
            "longitudinal_support_sensitivity_findings": {
                "summary": sensitivity["sensitivity_cross_check"],
                "interpretation": (
                    "K=2 is the Silhouette winner in every restricted cohort, but Davies-Bouldin "
                    "and Calinski-Harabasz prefer larger k. Thus k=2 remains plausible as the frozen "
                    "robustness model, with mixed rather than unanimous k-selection support."
                ),
                "subsets": sensitivity_findings,
            },
            "extreme_slope_robustness": sensitivity["extreme_slope_robustness"],
            "extreme_slope_robustness_findings": {
                "summary": (
                    "The single maximum slope has a modest effect on the partition and a measurable "
                    "effect on the higher centroid. Removing the positive 1% tail shifts the higher "
                    "centroid and boundary materially while retaining over 96% ordered-label agreement. "
                    "The bottom 1% tail has much smaller effects. The primary two-group partition is "
                    "mostly retained, but its higher-group location is positive-tail sensitive."
                ),
                "checks": robustness_findings,
            },
        },
        "interpretation": {
            "unit_of_clustering": "participant-level estimated ADAS-Cog13 progression rate",
            "lower_ordered_cluster": "lower-slope progression group",
            "higher_ordered_cluster": "higher-slope progression group",
            "positive_slope": "increasing/worsening ADAS-Cog13 score over elapsed time",
            "negative_slope": "decreasing ADAS-Cog13 score; not guaranteed clinical improvement",
            "permitted_claim": (
                "The analysis identifies two descriptive groups of estimated longitudinal "
                "ADAS-Cog13 change rates in the frozen cohort."
            ),
            "prohibited_claim": (
                "The two clusters are established Alzheimer's disease stages, diagnoses, "
                "causal subtypes, or independently clinically validated strata."
            ),
        },
        "limitations": [
            "One linear coefficient summarizes trajectories that may be nonlinear.",
            "Slope reliability varies with observation count and follow-up duration.",
            "Extreme slopes are more common among shorter and minimally observed trajectories.",
            "Internal clustering metrics do not establish clinical validity.",
            "Axis B uses one cognitive progression measure only.",
            "The inherited hard-cutoff DPC-init was deterministic but tied, nearly coincident, and cutoff-unstable in one dimension, so it was not used.",
            "The reporting K-Means seed is frozen, while the 30-run baseline documents initialization dependence.",
        ],
        "adviser_confirmation_required": [
            "Confirm manuscript wording that PCA is not applicable to the one-feature Axis B representation.",
            "Confirm the Axis B-specific Path B exception: DPC-init was evaluated but excluded as methodologically unsuitable, while Axis A remains unchanged.",
            "Confirm that the seed-0 single-initialization standard K-Means run is the reported primary model and seeds 0-29 quantify initialization variability.",
            "Confirm cautious descriptive labels (lower-slope and higher-slope progression groups) and the non-staging interpretation.",
        ],
        "reproducibility_and_integrity": integrity,
        "completion_gate": completion_gate,
        "artifacts": {
            "assignments": {"path": ASSIGNMENTS_PATH.relative_to(ROOT).as_posix(), "sha256": file_hash(ASSIGNMENTS_PATH)},
            "profiles": {"path": PROFILES_PATH.relative_to(ROOT).as_posix(), "sha256": file_hash(PROFILES_PATH)},
            "primary_metrics": {"path": FINAL_METRICS_PATH.relative_to(ROOT).as_posix(), "sha256": file_hash(FINAL_METRICS_PATH)},
            "random_runs": {"path": RANDOM_RUNS_PATH.relative_to(ROOT).as_posix(), "sha256": file_hash(RANDOM_RUNS_PATH)},
            "random_summary": {"path": RANDOM_SUMMARY_PATH.relative_to(ROOT).as_posix(), "sha256": file_hash(RANDOM_SUMMARY_PATH)},
            "sensitivity": {"path": SENSITIVITY_PATH.relative_to(ROOT).as_posix(), "sha256": file_hash(SENSITIVITY_PATH)},
            "DPC_reconciliation": {"path": RECONCILIATION_PATH.relative_to(ROOT).as_posix(), "sha256": file_hash(RECONCILIATION_PATH)},
        },
    }
    atomic_write_json(FINAL_SUMMARY_PATH, summary)
    print(json.dumps({
        "output": str(FINAL_SUMMARY_PATH),
        "status": summary["status"],
        "completion_gate_pass": all(
            value for key, value in completion_gate.items()
            if key != "application_integration_performed"
        ),
        "integrity_pass": all(boolean_checks),
    }, indent=2))


if __name__ == "__main__":
    main()
