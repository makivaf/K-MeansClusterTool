"""Build the unified aggregate research artifact and longitudinal continuation.

This stage deliberately preserves the final enhanced K-Means assignments and
compares those same Cluster 0/Cluster 1 participants over time. It never selects
another k and never clusters participant slopes.

Participant-level outputs remain in the gitignored local data workspace. The
JSON artifacts consumed by TypeScript contain aggregate values only.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from scipy.stats import t as student_t


ROOT = Path(__file__).resolve().parents[3]
INTERIM = ROOT / "data" / "interim"

ASSIGNMENTS_PATH = INTERIM / "unified_cluster_assignments.csv"
STUDY_ENTRY_PATH = INTERIM / "study_entry_cohort_unimputed.csv"
IMPUTED_PATH = INTERIM / "clustering_features_imputed.csv"
EXCLUSIONS_PATH = INTERIM / "study_entry_final_exclusion_preview.csv"
PREPROCESSING_PATH = INTERIM / "clustering_preprocessing_summary.csv"
PCA_PATH = INTERIM / "clustering_pca_explained_variance.csv"
NBCLUST_SUMMARY_PATH = INTERIM / "clustering_nbclust_summary.csv"
NBCLUST_VOTES_PATH = INTERIM / "clustering_nbclust_votes.csv"
SELECTED_K_PATH = INTERIM / "clustering_selected_k.csv"
DPC_SUMMARY_PATH = INTERIM / "clustering_dpc_summary.csv"
DPC_CENTROIDS_PATH = INTERIM / "clustering_dpc_selected_centroids.csv"
ENHANCED_METRICS_PATH = INTERIM / "enhanced_kmeans_metrics.csv"
ENHANCED_SUMMARY_PATH = INTERIM / "enhanced_kmeans_run_summary.csv"
BASELINE_SUMMARY_PATH = INTERIM / "baseline_kmeans_summary.csv"
BASELINE_COMPARISON_PATH = INTERIM / "baseline_vs_enhanced_metrics.csv"
DPC_ABLATION_PATH = INTERIM / "dpc_initialization_comparison.csv"
LONGITUDINAL_COHORT_PATH = INTERIM / "unified_longitudinal_cohort.csv"
LONGITUDINAL_VALIDATION_PATH = INTERIM / "unified_longitudinal_cohort_validation.json"
MIXED_MODEL_JSON_PATH = INTERIM / "unified_longitudinal_mixed_model.json"
MIXED_MODEL_CSV_PATH = INTERIM / "unified_longitudinal_mixed_model.csv"

PARTICIPANT_OUTPUT_PATH = INTERIM / "unified_longitudinal_participant_slopes.csv"
COHORT_AUDIT_OUTPUT_PATH = INTERIM / "unified_longitudinal_cohort_audit.json"
AGGREGATE_OUTPUT_PATH = INTERIM / "unified_research_result.json"

IDENTIFIERS = ["PTID", "RID"]
RETAINED_FEATURES = [
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
]

FROZEN = {
    "parent_n": 2437,
    "phase_counts": {"ADNI1": 819, "ADNIGO": 130, "ADNI2": 789, "ADNI3": 699},
    "cluster_sizes": {0: 1553, 1: 884},
    "pca_components": 6,
    "pca_cumulative_variance": 0.8747945923377831,
    "selected_k": 2,
    "nbclust_votes_for_k2": 9,
    "nbclust_usable_votes": 24,
    "enhanced_metrics": {
        "silhouette": 0.3727004724250328,
        "daviesBouldin": 1.0758850311620256,
        "calinskiHarabasz": 1800.0249578026046,
    },
    "baseline_metrics": {
        "silhouette": 0.33187500971522454,
        "daviesBouldin": 1.2241160774005175,
        "calinskiHarabasz": 1442.0231320417006,
    },
}


def file_hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def relative(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def finite(value: Any, label: str) -> float:
    number = float(value)
    if not np.isfinite(number):
        raise AssertionError(f"{label} is not finite")
    return number


def read_metric_rows(path: Path) -> dict[str, str]:
    frame = pd.read_csv(path, dtype=str, keep_default_na=False)
    return {str(row.metric): str(row.value) for row in frame.itertuples(index=False)}


def metric_triplet(rows: pd.DataFrame, value_column: str) -> dict[str, float]:
    lookup = {str(row.metric): finite(getattr(row, value_column), str(row.metric)) for row in rows.itertuples(index=False)}
    return {
        "silhouette": lookup["silhouette"],
        "daviesBouldin": lookup["davies_bouldin"],
        "calinskiHarabasz": lookup["calinski_harabasz"],
    }


def validate_mixed_model_artifact(document: dict[str, Any]) -> None:
    if document.get("contractVersion") != "unified-longitudinal-mixed-model/v1" or document.get("status") != "converged":
        raise AssertionError("The primary mixed-effects artifact is missing or did not converge")
    if document.get("modelFormula") != "ADAS13 ~ time + cluster + time:cluster + (1 | participant)":
        raise AssertionError("The mixed-effects model identity drifted")
    if document.get("participantCount") != 1845 or document.get("observationCount") != 11111:
        raise AssertionError("The mixed-effects model cohort counts drifted")
    cluster_counts = {
        int(row["clusterId"]): int(row["participantCount"])
        for row in document.get("participantCountsByOriginalCluster", [])
    }
    if cluster_counts != {0: 1233, 1: 612}:
        raise AssertionError(f"The mixed-effects model original-cluster counts drifted: {cluster_counts}")
    if document.get("primaryTerm") != "time_x_cluster" or not document.get("converged"):
        raise AssertionError("The primary Time × Cluster result is unavailable")
    effects = {row.get("term"): row for row in document.get("fixedEffects", [])}
    if set(effects) != {"intercept", "time", "cluster", "time_x_cluster"}:
        raise AssertionError("The mixed-effects coefficient structure is incomplete")
    for term, row in effects.items():
        for field in ("estimate", "standardError", "zStatistic", "pValue"):
            finite(row[field], f"mixed-effects {term} {field}")
        finite(row["confidenceInterval95"]["lower"], f"mixed-effects {term} CI lower")
        finite(row["confidenceInterval95"]["upper"], f"mixed-effects {term} CI upper")
    diagnostics = document.get("diagnostics", {})
    if not diagnostics.get("timeClusterEstimable") or not diagnostics.get("allEstimatesFinite"):
        raise AssertionError("The Time × Cluster coefficient failed estimability diagnostics")
    provenance = document.get("provenance", {})
    if not provenance.get("originalAssignmentsFixed") or not provenance.get("eligibleCohortFrozen"):
        raise AssertionError("The mixed-effects model did not preserve the frozen assignment/cohort contract")
    if provenance.get("participantLevelRowsExported") or provenance.get("longitudinalClusteringInvoked"):
        raise AssertionError("The mixed-effects artifact violates privacy or no-clustering requirements")
    expected_hashes = {
        relative(ASSIGNMENTS_PATH): file_hash(ASSIGNMENTS_PATH),
        relative(LONGITUDINAL_COHORT_PATH): file_hash(LONGITUDINAL_COHORT_PATH),
    }
    if provenance.get("inputSha256") != expected_hashes:
        raise AssertionError("The mixed-effects artifact was fitted from stale or mismatched inputs")


def assert_close(actual: float, expected: float, label: str, tolerance: float = 1e-12) -> None:
    if not np.isclose(actual, expected, rtol=tolerance, atol=tolerance):
        raise AssertionError(f"Frozen result mismatch for {label}: actual={actual}, expected={expected}")


def describe(series: pd.Series) -> dict[str, float | int]:
    values = pd.to_numeric(series, errors="raise").astype(float)
    q1 = float(values.quantile(0.25, interpolation="linear"))
    q3 = float(values.quantile(0.75, interpolation="linear"))
    return {
        "n": int(len(values)),
        "mean": float(values.mean()),
        "median": float(values.median()),
        "standardDeviation": float(values.std(ddof=1)),
        "q1": q1,
        "q3": q3,
        "interquartileRange": q3 - q1,
        "minimum": float(values.min()),
        "maximum": float(values.max()),
    }


def fit_participant(group: pd.DataFrame) -> dict[str, Any]:
    ordered = group.sort_values(["VISDATE", "observation_number"], kind="stable")
    x = ordered["elapsed_years"].to_numpy(dtype=np.float64)
    y = ordered["TOTAL13"].to_numpy(dtype=np.float64)
    n = len(ordered)
    design = np.column_stack([np.ones(n, dtype=np.float64), x])
    parameters, _, rank, _ = np.linalg.lstsq(design, y, rcond=None)
    if rank != 2:
        raise ArithmeticError("OLS design matrix rank is not two")
    intercept, slope = parameters
    fitted = design @ parameters
    residuals = y - fitted
    sse = float(residuals @ residuals)
    centered_y = y - y.mean()
    sst = float(centered_y @ centered_y)
    if sst <= 0:
        raise ArithmeticError("TOTAL13 has zero variance; R-squared is undefined")
    r_squared = 1.0 - sse / sst
    rmse = float(np.sqrt(sse / n))
    degrees_freedom = n - 2
    centered_x = x - x.mean()
    sxx = float(centered_x @ centered_x)
    if sxx <= 0:
        raise ArithmeticError("elapsed_years has zero variance")
    slope_standard_error = float(np.sqrt((sse / degrees_freedom) / sxx))
    margin = float(student_t.ppf(0.975, degrees_freedom)) * slope_standard_error
    first_date = pd.Timestamp(ordered["VISDATE"].iloc[0])
    last_date = pd.Timestamp(ordered["VISDATE"].iloc[-1])
    followup_days = int((last_date - first_date).days)
    result = {
        "PTID": str(ordered["PTID"].iloc[0]),
        "RID": str(ordered["RID"].iloc[0]),
        "original_cluster": int(ordered["original_cluster"].iloc[0]),
        "n_observations": n,
        "first_VISDATE": first_date.strftime("%Y-%m-%d"),
        "last_VISDATE": last_date.strftime("%Y-%m-%d"),
        "followup_days": followup_days,
        "followup_years": followup_days / 365.25,
        "baseline_ADAS13": float(y[0]),
        "beta0_intercept": float(intercept),
        "beta1_slope_points_per_year": float(slope),
        "r_squared": float(r_squared),
        "RMSE": rmse,
        "slope_standard_error": slope_standard_error,
        "slope_95ci_lower": float(slope - margin),
        "slope_95ci_upper": float(slope + margin),
    }
    numeric = [value for key, value in result.items() if key not in {"PTID", "RID", "first_VISDATE", "last_VISDATE"}]
    if not np.isfinite(numeric).all():
        raise ArithmeticError("Regression produced a non-finite diagnostic")
    return result


def cluster_profile_rows(imputed: pd.DataFrame, assignments: pd.DataFrame) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    linked = imputed.merge(assignments, on=IDENTIFIERS, how="inner", validate="one_to_one")
    if len(linked) != FROZEN["parent_n"]:
        raise AssertionError("Original-scale profile linkage did not retain all clustered participants")
    profiles: list[dict[str, Any]] = []
    for cluster_id, group in linked.groupby("cluster_label", sort=True):
        profiles.append({
            "clusterId": int(cluster_id),
            "nMembers": int(len(group)),
            "variableMeans": {feature: float(group[feature].mean()) for feature in RETAINED_FEATURES},
            "variableStandardDeviations": {feature: float(group[feature].std(ddof=1)) for feature in RETAINED_FEATURES},
        })

    group0 = linked.loc[linked["cluster_label"].eq(0)]
    group1 = linked.loc[linked["cluster_label"].eq(1)]
    smd_rows: list[dict[str, Any]] = []
    for feature in RETAINED_FEATURES:
        variance0 = float(group0[feature].var(ddof=1))
        variance1 = float(group1[feature].var(ddof=1))
        pooled = np.sqrt(((len(group0) - 1) * variance0 + (len(group1) - 1) * variance1) / (len(group0) + len(group1) - 2))
        smd = (float(group1[feature].mean()) - float(group0[feature].mean())) / pooled
        smd_rows.append({"variable": feature, "standardizedMeanDifferenceCluster1Minus0": float(smd), "absoluteSmd": abs(float(smd))})
    smd_rows.sort(key=lambda row: (-row["absoluteSmd"], row["variable"]))
    for rank, row in enumerate(smd_rows, start=1):
        row["rank"] = rank
    return profiles, smd_rows


def time_series_summary(observations: pd.DataFrame) -> list[dict[str, Any]]:
    work = observations.copy()
    work["year_bin"] = np.floor(work["elapsed_years"].to_numpy(dtype=float) + 1e-12).astype(int)
    rows: list[dict[str, Any]] = []
    for (cluster_id, year_bin), group in work.groupby(["original_cluster", "year_bin"], sort=True):
        values = group["TOTAL13"].astype(float)
        rows.append({
            "clusterId": int(cluster_id),
            "yearStart": int(year_bin),
            "yearEnd": int(year_bin + 1),
            "participantCount": int(group["PTID"].nunique()),
            "observationCount": int(len(group)),
            "meanElapsedYears": float(group["elapsed_years"].mean()),
            "meanAdas13": float(values.mean()),
            "medianAdas13": float(values.median()),
            "standardDeviationAdas13": float(values.std(ddof=1)) if len(values) > 1 else 0.0,
        })
    return rows


def main() -> None:
    required_inputs = [
        ASSIGNMENTS_PATH,
        STUDY_ENTRY_PATH,
        IMPUTED_PATH,
        EXCLUSIONS_PATH,
        PREPROCESSING_PATH,
        PCA_PATH,
        NBCLUST_SUMMARY_PATH,
        NBCLUST_VOTES_PATH,
        SELECTED_K_PATH,
        DPC_SUMMARY_PATH,
        DPC_CENTROIDS_PATH,
        ENHANCED_METRICS_PATH,
        ENHANCED_SUMMARY_PATH,
        BASELINE_SUMMARY_PATH,
        BASELINE_COMPARISON_PATH,
        DPC_ABLATION_PATH,
        LONGITUDINAL_COHORT_PATH,
        LONGITUDINAL_VALIDATION_PATH,
        MIXED_MODEL_JSON_PATH,
        MIXED_MODEL_CSV_PATH,
    ]
    for path in required_inputs:
        if not path.is_file():
            raise FileNotFoundError(path)
    hashes_before = {relative(path): file_hash(path) for path in required_inputs}
    mixed_model = json.loads(MIXED_MODEL_JSON_PATH.read_text(encoding="utf-8"))
    validate_mixed_model_artifact(mixed_model)

    assignments = pd.read_csv(ASSIGNMENTS_PATH, dtype={"PTID": str, "RID": str, "cluster_label": int})
    if len(assignments) != FROZEN["parent_n"]:
        raise AssertionError("Final enhanced assignment artifact does not contain 2,437 participants")
    if assignments.duplicated(IDENTIFIERS).any() or assignments["PTID"].duplicated().any() or assignments["RID"].duplicated().any():
        raise AssertionError("Final enhanced assignment participant keys are not one-to-one")
    observed_cluster_sizes = {int(key): int(value) for key, value in assignments["cluster_label"].value_counts().sort_index().items()}
    if observed_cluster_sizes != FROZEN["cluster_sizes"]:
        raise AssertionError(f"Frozen enhanced cluster sizes disagree: {observed_cluster_sizes}")

    study_entry = pd.read_csv(STUDY_ENTRY_PATH, dtype=str, keep_default_na=False, low_memory=False)
    parent_roster = study_entry.merge(assignments[IDENTIFIERS], on=IDENTIFIERS, how="inner", validate="one_to_one")
    phase_counts = {str(key): int(value) for key, value in parent_roster["ENTRY_PHASE"].value_counts().sort_index().items()}
    if phase_counts != FROZEN["phase_counts"]:
        raise AssertionError(f"Frozen study-entry phase counts disagree: {phase_counts}")

    preprocessing = pd.read_csv(PREPROCESSING_PATH)
    exclusions = pd.read_csv(EXCLUSIONS_PATH)
    if preprocessing["variable"].tolist() != RETAINED_FEATURES or len(preprocessing) != 13:
        raise AssertionError("Retained feature artifact does not match the frozen 13-variable contract")
    if set(exclusions["candidate_variable"]) != {"BNT", "NPIQ"}:
        raise AssertionError("Frozen feature exclusions disagree")

    pca = pd.read_csv(PCA_PATH)
    retained_pca = pca.loc[pca["retained_for_85_percent"].astype(bool)]
    if len(retained_pca) != FROZEN["pca_components"]:
        raise AssertionError("Frozen PCA component count disagrees")
    cumulative_variance = float(retained_pca.iloc[-1]["cumulative_explained_variance"])
    assert_close(cumulative_variance, FROZEN["pca_cumulative_variance"], "PCA cumulative variance")

    selected_k = pd.read_csv(SELECTED_K_PATH).iloc[0]
    nbclust_summary = pd.read_csv(NBCLUST_SUMMARY_PATH)
    nbclust_votes = pd.read_csv(NBCLUST_VOTES_PATH, keep_default_na=False)
    if int(selected_k["selected_k"]) != FROZEN["selected_k"]:
        raise AssertionError("Frozen selected k disagrees")
    k2_row = nbclust_summary.loc[nbclust_summary["k"].eq(2)].iloc[0]
    if int(k2_row["vote_count"]) != FROZEN["nbclust_votes_for_k2"] or int(k2_row["total_usable_indices"]) != FROZEN["nbclust_usable_votes"]:
        raise AssertionError("Frozen NbClust vote result disagrees")

    enhanced_metric_rows = pd.read_csv(ENHANCED_METRICS_PATH)
    enhanced_lookup = {str(row.metric): float(row.value) for row in enhanced_metric_rows.itertuples(index=False)}
    enhanced_metrics = {
        "silhouette": enhanced_lookup["silhouette_coefficient"],
        "daviesBouldin": enhanced_lookup["davies_bouldin_index"],
        "calinskiHarabasz": enhanced_lookup["calinski_harabasz_index"],
    }
    baseline_comparison = pd.read_csv(BASELINE_COMPARISON_PATH)
    baseline_metrics = metric_triplet(baseline_comparison, "baseline_mean")
    for metric, expected in FROZEN["enhanced_metrics"].items():
        assert_close(enhanced_metrics[metric], expected, f"enhanced {metric}")
    for metric, expected in FROZEN["baseline_metrics"].items():
        assert_close(baseline_metrics[metric], expected, f"baseline {metric}")

    imputed = pd.read_csv(IMPUTED_PATH, dtype={"PTID": str, "RID": str})
    profiles, smd_rankings = cluster_profile_rows(imputed, assignments)

    cohort_validation = json.loads(LONGITUDINAL_VALIDATION_PATH.read_text(encoding="utf-8"))
    cohort = pd.read_csv(
        LONGITUDINAL_COHORT_PATH,
        dtype={"PTID": str, "RID": str, "TOTAL13": float},
        parse_dates=["VISDATE"],
    )
    if cohort.duplicated(["PTID", "RID", "VISDATE"]).any():
        raise AssertionError("A duplicate participant/date entered longitudinal calculations")
    cohort_keys = cohort[IDENTIFIERS].drop_duplicates()
    if cohort_keys.duplicated(IDENTIFIERS).any():
        raise AssertionError("Longitudinal participant keys are not unique")
    linked = cohort.merge(assignments, on=IDENTIFIERS, how="left", validate="many_to_one")
    if linked["cluster_label"].isna().any() or len(linked) != len(cohort):
        raise AssertionError("Not every longitudinal observation linked to one original enhanced cluster")
    linked = linked.rename(columns={"cluster_label": "original_cluster"})
    if linked.groupby("PTID")["original_cluster"].nunique().gt(1).any():
        raise AssertionError("A longitudinal participant appears in both original clusters")
    if linked["PTID"].nunique() != 1917 or len(linked) != 11327:
        raise AssertionError("Validated >=3-observation cohort disagrees with its frozen audit")
    if not linked.groupby("PTID")["VISDATE"].nunique().ge(3).all():
        raise AssertionError("A participant with fewer than three distinct dated observations entered")

    spans = linked.groupby(IDENTIFIERS, as_index=False).agg(followup_days=("elapsed_days", "max"))
    eligible_keys = spans.loc[spans["followup_days"].ge(365.25), IDENTIFIERS]
    eligible = linked.merge(eligible_keys, on=IDENTIFIERS, how="inner", validate="many_to_one")
    if eligible["PTID"].nunique() != 1845:
        raise AssertionError(f">=12-month longitudinal eligibility disagrees: {eligible['PTID'].nunique()}")

    slopes = pd.DataFrame([fit_participant(group) for _, group in eligible.groupby("PTID", sort=True)])
    if len(slopes) != 1845 or slopes.duplicated(IDENTIFIERS).any():
        raise AssertionError("Participant-level longitudinal calculations are not one row per eligible participant")
    if set(slopes["original_cluster"]) != {0, 1}:
        raise AssertionError("Both original enhanced clusters must be represented longitudinally")

    cluster_summaries: list[dict[str, Any]] = []
    for cluster_id, group in slopes.groupby("original_cluster", sort=True):
        observations = eligible.loc[eligible["original_cluster"].eq(cluster_id)]
        cluster_summaries.append({
            "clusterId": int(cluster_id),
            "eligibleParticipants": int(len(group)),
            "observationCount": int(len(observations)),
            "observationsPerParticipant": describe(group["n_observations"]),
            "followupYears": describe(group["followup_years"]),
            "baselineAdas13": describe(group["baseline_ADAS13"]),
            "slopePointsPerYear": describe(group["beta1_slope_points_per_year"]),
            "intercept": describe(group["beta0_intercept"]),
            "rSquared": describe(group["r_squared"]),
            "rmse": describe(group["RMSE"]),
        })

    at_least_3_keys = cohort_keys.merge(assignments, on=IDENTIFIERS, how="left", validate="one_to_one")
    eligible_assignment_keys = eligible_keys.merge(assignments, on=IDENTIFIERS, how="left", validate="one_to_one")
    flow_by_cluster: list[dict[str, int]] = []
    for cluster_id in (0, 1):
        flow_by_cluster.append({
            "clusterId": cluster_id,
            "parentParticipants": int(assignments["cluster_label"].eq(cluster_id).sum()),
            "atLeast3ObservationParticipants": int(at_least_3_keys["cluster_label"].eq(cluster_id).sum()),
            "atLeast12MonthParticipants": int(eligible_assignment_keys["cluster_label"].eq(cluster_id).sum()),
            "eligibleObservationCount": int(eligible["original_cluster"].eq(cluster_id).sum()),
        })

    filtering = cohort_validation["filtering_flow"]
    participant_counts = cohort_validation["participant_counts"]
    cohort_flow = [
        {"stage": "parent_clustered_cohort", "participantCount": 2437},
        {"stage": "longitudinal_records_found", "participantCount": int(participant_counts["with_at_least_1_usable_observation"]), "observationCount": int(filtering["locked_roster_matched_ADAS_rows"])},
        {"stage": "valid_dated_records", "participantCount": int(participant_counts["with_at_least_1_usable_observation"]), "observationCount": int(filtering["final_usable_observations_before_participant_eligibility"])},
        {"stage": "at_least_3_distinct_observations", "participantCount": 1917, "observationCount": 11327},
        {"stage": "at_least_12_months_followup", "participantCount": 1845, "observationCount": int(len(eligible))},
    ]

    enhanced_summary = read_metric_rows(ENHANCED_SUMMARY_PATH)
    dpc_summary = read_metric_rows(DPC_SUMMARY_PATH)
    dpc_centroids = pd.read_csv(DPC_CENTROIDS_PATH)
    baseline_summary = pd.read_csv(BASELINE_SUMMARY_PATH)
    dpc_ablation = pd.read_csv(DPC_ABLATION_PATH)

    comparison_metrics: list[dict[str, Any]] = []
    for row in baseline_comparison.itertuples(index=False):
        comparison_metrics.append({
            "metric": str(row.metric),
            "direction": "lower" if str(row.direction) == "lower_is_better" else "higher",
            "baselineValue": float(row.baseline_mean),
            "baselineStandardDeviation": float(row.baseline_standard_deviation_ddof_1),
            "baselineMedian": float(row.baseline_median),
            "baselineMinimum": float(row.baseline_minimum),
            "baselineMaximum": float(row.baseline_maximum),
            "enhancedValue": float(row.enhanced_value),
            "signedRelativeChangePercent": float(row.percent_difference_from_baseline_mean),
            "improved": str(row.enhanced_assessment) == "better",
        })

    dpc_comparison: list[dict[str, Any]] = []
    for row in dpc_ablation.itertuples(index=False):
        dpc_comparison.append({
            "metric": str(row.metric),
            "direction": "lower" if str(row.direction) == "lower_is_better" else "higher",
            "dpcValue": float(row.dpc_value),
            "randomMean": float(row.random_mean),
            "signedRelativeChangePercent": float(row.percent_difference_from_random_mean),
            "dpcAssessment": str(row.dpc_assessment),
        })

    cohort_audit = {
        "contractVersion": "unified-longitudinal-cohort-audit/v1",
        "parentClusteredParticipants": 2437,
        "atLeast3ObservationParticipants": 1917,
        "atLeast12MonthParticipants": 1845,
        "cohortFlow": cohort_flow,
        "byOriginalCluster": flow_by_cluster,
        "sequentialExclusions": [
            {"reason": "no_usable_longitudinal_observation", "participantCount": 9},
            {"reason": "fewer_than_3_distinct_dated_observations", "participantCount": 511},
            {"reason": "followup_under_365_25_days", "participantCount": 72},
        ],
        "checks": {
            "parentParticipantKeysUnique": True,
            "parentPtidRidOneToOne": True,
            "allLongitudinalParticipantsInParentCohort": True,
            "noParticipantInBothClusters": True,
            "noDuplicateParticipantDate": True,
            "oneToOneAssignmentLinkageSucceeded": True,
            "noSecondLongitudinalKMeans": True,
        },
    }

    participant_columns = [
        "PTID", "RID", "original_cluster", "n_observations", "first_VISDATE", "last_VISDATE",
        "followup_days", "followup_years", "baseline_ADAS13", "beta0_intercept",
        "beta1_slope_points_per_year", "r_squared", "RMSE", "slope_standard_error",
        "slope_95ci_lower", "slope_95ci_upper",
    ]
    PARTICIPANT_OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    slopes.loc[:, participant_columns].to_csv(PARTICIPANT_OUTPUT_PATH, index=False, encoding="utf-8", lineterminator="\n")
    COHORT_AUDIT_OUTPUT_PATH.write_text(json.dumps(cohort_audit, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    aggregate = {
        "contractVersion": "unified-research-run/v1",
        "research": {
            "title": "Enhanced K-Means cognitive-functional clustering with longitudinal progression analysis",
            "design": "one_continuous_pipeline",
            "stage1": "Enhanced K-Means Cognitive-Functional Clustering",
            "stage2": "Longitudinal Progression Analysis",
            "interpretation": "Descriptive comparison of original enhanced K-Means clusters; no staging, prediction, or causal claim.",
        },
        "cohort": {
            "parentN": 2437,
            "studyEntryPhaseCounts": phase_counts,
            "longitudinalEligibleN": 1845,
            "atLeast3ObservationN": 1917,
            "atLeast12MonthN": 1845,
            "flow": cohort_flow,
            "byOriginalCluster": flow_by_cluster,
            "exclusions": cohort_audit["sequentialExclusions"],
            "linkageChecks": cohort_audit["checks"],
        },
        "preprocessing": {
            "candidateFeatures": RETAINED_FEATURES + ["BNT", "NPIQ"],
            "excludedFeatures": [
                {
                    "feature": str(row.candidate_variable),
                    "missingPercent": float(row.missing_percentage),
                    "reason": str(row.explanation),
                }
                for row in exclusions.itertuples(index=False)
            ],
            "retainedFeatures": RETAINED_FEATURES,
            "missingnessThresholdPercent": 20.0,
            "imputation": "Median imputation",
            "standardization": "Z-score standardization",
        },
        "pca": {
            "components": 6,
            "cumulativeExplainedVariance": cumulative_variance,
            "scree": [
                {
                    "component": int(row.component_number),
                    "eigenvalue": float(row.explained_variance),
                    "individualVariance": float(row.explained_variance_ratio),
                    "cumulativeVariance": float(row.cumulative_explained_variance),
                    "retained": bool(row.retained_for_85_percent),
                }
                for row in pca.itertuples(index=False)
            ],
        },
        "kSelection": {
            "method": "NbClust index voting",
            "candidateK": [int(value) for value in nbclust_summary["k"].tolist()],
            "selectedK": 2,
            "usableVotes": 24,
            "votesForSelectedK": 9,
            "voteDistribution": [
                {"k": int(row.k), "votes": int(row.vote_count)} for row in nbclust_summary.itertuples(index=False)
            ],
            "indexResults": [
                {
                    "index": str(row.index),
                    "status": str(row.status),
                    **({"recommendedK": int(float(row.recommended_k))} if str(row.recommended_k) else {}),
                }
                for row in nbclust_votes.itertuples(index=False)
            ],
        },
        "initialization": {
            "method": "Density Peaks Clustering-derived observation centroids",
            "deterministic": True,
            "selectedCentroids": [
                {
                    "rank": index + 1,
                    "candidateId": f"candidate-{index + 1}",
                    "rho": float(row.rho),
                    "delta": float(row.delta),
                    "gamma": float(row.gamma),
                    "assignedCluster": index,
                }
                for index, row in enumerate(dpc_centroids.itertuples(index=False))
            ],
            "reproducibilityRuns": int(enhanced_summary["reproducibility_runs"]),
            "reproducibilityPassed": enhanced_summary["reproducibility_passed"] == "True",
        },
        "enhancedClustering": {
            "algorithm": "Lloyd K-Means",
            "representation": "Six retained principal components",
            "clusterSizes": [{"clusterId": key, "nMembers": value} for key, value in observed_cluster_sizes.items()],
            "metrics": enhanced_metrics,
            "iterations": int(enhanced_summary["iterations"]),
            "converged": enhanced_summary["converged_before_max_iter"] == "True",
            "inertia": float(enhanced_summary["inertia"]),
        },
        "clusterProfiles": {
            "scale": "Original cognitive-functional units after frozen median imputation",
            "profiles": profiles,
            "smdRanking": smd_rankings,
        },
        "baselineComparison": {
            "baselineMethod": {
                "representation": "13 standardized original variables; no PCA",
                "kSelection": "Maximum Silhouette over k=2..10",
                "selectedK": 2,
                "initialization": "Random initialization across seeds 0-29",
                "algorithm": "Lloyd K-Means",
                "runCount": int(baseline_summary.iloc[0]["run_count"]),
            },
            "enhancedMethod": {
                "representation": "Six-component PCA representation",
                "kSelection": "NbClust index voting",
                "initialization": "Deterministic DPC-derived centroids",
                "algorithm": "Lloyd K-Means",
            },
            "metrics": comparison_metrics,
            "caution": "The baseline-versus-enhanced comparison evaluates the complete integrated enhancement. Differences cannot be attributed independently to PCA, NbClust, or DPC initialization without component-wise ablation.",
            "controlledDpcInitializationComparison": {
                "scope": "Same participants, six-PC representation, k=2, and Lloyd settings; initialization differs.",
                "purpose": "DPC is evaluated primarily as a deterministic and reproducible initializer, not as universally improving cluster geometry.",
                "metrics": dpc_comparison,
            },
        },
        "longitudinal": {
            "measure": "ADAS-Cog13 TOTAL13",
            "timeDefinition": "Actual VISDATE elapsed days divided by 365.25",
            "eligibilityRule": "At least 3 distinct valid dated observations and at least 365.25 days of follow-up",
            "assignmentSource": relative(ASSIGNMENTS_PATH),
            "eligibleParticipants": 1845,
            "observationCount": int(len(eligible)),
            "byOriginalCluster": cluster_summaries,
            "timeSeries": time_series_summary(eligible),
            "participantSlopeMethod": "Ordinary least squares with intercept; descriptive only; slopes are not clustered",
            "mixedEffects": mixed_model,
            "limitations": [
                "Cluster labels are algorithmic groups, not clinical Alzheimer disease subtypes or stages.",
                "The longitudinal model is an observational group comparison and does not establish prediction or causation.",
                "Participant-level OLS slopes vary in precision with observation count and follow-up duration.",
                "The primary inferential model includes a participant random intercept but no additional covariates or random time slope.",
            ],
        },
        "provenance": {
            "inputSha256": hashes_before,
            "assignmentArtifactAuthoritative": relative(ASSIGNMENTS_PATH),
            "legacyArtifactsPreservedForAudit": True,
            "participantLevelOutput": {
                "path": relative(PARTICIPANT_OUTPUT_PATH),
                "sha256": file_hash(PARTICIPANT_OUTPUT_PATH),
                "webExposed": False,
                "gitignored": True,
            },
            "cohortAuditOutput": {
                "path": relative(COHORT_AUDIT_OUTPUT_PATH),
                "sha256": file_hash(COHORT_AUDIT_OUTPUT_PATH),
            },
            "mixedModelOutput": {
                "jsonPath": relative(MIXED_MODEL_JSON_PATH),
                "jsonSha256": file_hash(MIXED_MODEL_JSON_PATH),
                "csvPath": relative(MIXED_MODEL_CSV_PATH),
                "csvSha256": file_hash(MIXED_MODEL_CSV_PATH),
                "aggregateOnly": True,
                "webExposed": True,
            },
            "prohibitedLongitudinalOperations": {
                "nbclustInvoked": False,
                "dpcSuitabilityInvoked": False,
                "kmeansInvoked": False,
            },
        },
    }

    if {relative(path): file_hash(path) for path in required_inputs} != hashes_before:
        raise AssertionError("An authoritative input artifact changed during unified analysis")
    AGGREGATE_OUTPUT_PATH.write_text(json.dumps(aggregate, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(json.dumps({
        "aggregate": relative(AGGREGATE_OUTPUT_PATH),
        "cohort_audit": relative(COHORT_AUDIT_OUTPUT_PATH),
        "participant_level_local_only": relative(PARTICIPANT_OUTPUT_PATH),
        "parent_n": 2437,
        "at_least_3_observations_n": 1917,
        "at_least_12_months_n": 1845,
        "cluster_eligible_counts": {str(row["clusterId"]): row["atLeast12MonthParticipants"] for row in flow_by_cluster},
        "longitudinal_observations": int(len(eligible)),
        "second_longitudinal_kmeans_invoked": False,
    }, indent=2))


if __name__ == "__main__":
    main()
