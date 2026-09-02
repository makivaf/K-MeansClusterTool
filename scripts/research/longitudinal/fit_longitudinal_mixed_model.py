"""Fit the pre-specified longitudinal random-intercept mixed-effects model.

The original enhanced K-Means assignments are fixed before this stage. This
script uses all 11,111 eligible repeated ADAS-Cog13 observations and never
clusters longitudinal observations or participant slopes. Outputs are
aggregate-only and contain no participant identifiers or rows.
"""

from __future__ import annotations

import hashlib
import json
import warnings
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import statsmodels
import statsmodels.formula.api as smf


ROOT = Path(__file__).resolve().parents[3]
INTERIM = ROOT / "data" / "interim"
ASSIGNMENTS_PATH = INTERIM / "unified_cluster_assignments.csv"
LONGITUDINAL_COHORT_PATH = INTERIM / "unified_longitudinal_cohort.csv"
MODEL_JSON_PATH = INTERIM / "unified_longitudinal_mixed_model.json"
MODEL_CSV_PATH = INTERIM / "unified_longitudinal_mixed_model.csv"

IDENTIFIERS = ["PTID", "RID"]
EXPECTED_PARENT_N = 2437
EXPECTED_PARENT_CLUSTERS = {0: 1553, 1: 884}
EXPECTED_ELIGIBLE_N = 1845
EXPECTED_ELIGIBLE_CLUSTERS = {0: 1233, 1: 612}
EXPECTED_OBSERVATIONS = 11111
ALPHA = 0.05
OPTIMIZERS = ("lbfgs", "bfgs", "cg")
IMPLEMENTATION_FORMULA = "adas13 ~ time_years * original_cluster"
DISPLAY_FORMULA = "ADAS13 ~ time + cluster + time:cluster + (1 | participant)"


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


def validate_and_prepare_model_data() -> pd.DataFrame:
    assignments = pd.read_csv(ASSIGNMENTS_PATH, dtype={"PTID": str, "RID": str})
    required_assignment_columns = {*IDENTIFIERS, "cluster_label"}
    if not required_assignment_columns.issubset(assignments.columns):
        raise AssertionError("The authoritative assignment artifact is missing required columns")
    if len(assignments) != EXPECTED_PARENT_N or assignments.duplicated(IDENTIFIERS).any():
        raise AssertionError("The frozen parent assignment count or composite-key uniqueness drifted")
    if assignments["PTID"].duplicated().any() or assignments["RID"].duplicated().any():
        raise AssertionError("PTID/RID one-to-one linkage failed in the authoritative assignment artifact")
    parent_counts = assignments["cluster_label"].value_counts().to_dict()
    if parent_counts != EXPECTED_PARENT_CLUSTERS:
        raise AssertionError(f"Frozen parent cluster counts drifted: {parent_counts}")

    cohort = pd.read_csv(
        LONGITUDINAL_COHORT_PATH,
        dtype={"PTID": str, "RID": str, "TOTAL13": float},
        parse_dates=["VISDATE"],
    )
    required_cohort_columns = {*IDENTIFIERS, "VISDATE", "TOTAL13"}
    if not required_cohort_columns.issubset(cohort.columns):
        raise AssertionError("The validated longitudinal cohort is missing required columns")
    if cohort[[*IDENTIFIERS, "VISDATE", "TOTAL13"]].isna().any().any():
        raise AssertionError("The validated longitudinal model input contains a missing required value")
    if cohort.duplicated([*IDENTIFIERS, "VISDATE"]).any():
        raise AssertionError("A duplicate participant/date entered the mixed-effects model input")

    cohort["calculated_elapsed_days"] = (
        cohort["VISDATE"] - cohort.groupby(IDENTIFIERS)["VISDATE"].transform("min")
    ).dt.days
    if "elapsed_days" in cohort.columns and not np.array_equal(
        cohort["calculated_elapsed_days"].to_numpy(dtype=int),
        cohort["elapsed_days"].to_numpy(dtype=int),
    ):
        raise AssertionError("Elapsed days disagree with actual VISDATE-derived values")
    if not cohort.groupby(IDENTIFIERS)["VISDATE"].nunique().ge(3).all():
        raise AssertionError("A participant with fewer than three dated observations entered the validated cohort")

    eligible_keys = (
        cohort.groupby(IDENTIFIERS, as_index=False)["calculated_elapsed_days"]
        .max()
        .loc[lambda frame: frame["calculated_elapsed_days"].ge(365.25), IDENTIFIERS]
    )
    eligible = cohort.merge(eligible_keys, on=IDENTIFIERS, how="inner", validate="many_to_one")
    eligible = eligible.merge(assignments, on=IDENTIFIERS, how="left", validate="many_to_one")
    if eligible["cluster_label"].isna().any():
        raise AssertionError("A mixed-model participant did not link to an original enhanced cluster")
    if eligible.groupby(IDENTIFIERS)["cluster_label"].nunique().gt(1).any():
        raise AssertionError("A mixed-model participant retained more than one original cluster assignment")

    participant_count = eligible[IDENTIFIERS].drop_duplicates().shape[0]
    cluster_participants = (
        eligible[[*IDENTIFIERS, "cluster_label"]]
        .drop_duplicates()
        ["cluster_label"]
        .value_counts()
        .to_dict()
    )
    if participant_count != EXPECTED_ELIGIBLE_N:
        raise AssertionError(f"Final longitudinal participant count drifted: {participant_count}")
    if cluster_participants != EXPECTED_ELIGIBLE_CLUSTERS:
        raise AssertionError(f"Final longitudinal cluster counts drifted: {cluster_participants}")
    if len(eligible) != EXPECTED_OBSERVATIONS:
        raise AssertionError(f"Final longitudinal observation count drifted: {len(eligible)}")

    model_data = pd.DataFrame({
        "adas13": eligible["TOTAL13"].astype(float),
        "time_years": eligible["calculated_elapsed_days"].astype(float) / 365.25,
        "original_cluster": pd.Categorical(
            eligible["cluster_label"].astype(int), categories=[0, 1], ordered=False
        ),
        "participant_group": eligible["PTID"].astype(str) + "|" + eligible["RID"].astype(str),
    })
    if model_data["original_cluster"].isna().any() or not np.isfinite(model_data[["adas13", "time_years"]]).all().all():
        raise AssertionError("Mixed-model values or cluster coding are invalid")
    return model_data


def warning_messages(captured: list[warnings.WarningMessage]) -> list[str]:
    return list(dict.fromkeys(f"{item.category.__name__}: {item.message}" for item in captured))


def fit_with_documented_optimizers(model_data: pd.DataFrame) -> tuple[Any, str, list[dict[str, Any]]]:
    attempts: list[dict[str, Any]] = []
    selected_result: Any | None = None
    selected_optimizer = ""
    for optimizer in OPTIMIZERS:
        with warnings.catch_warnings(record=True) as captured:
            warnings.simplefilter("always")
            try:
                model = smf.mixedlm(
                    IMPLEMENTATION_FORMULA,
                    model_data,
                    groups=model_data["participant_group"],
                    re_formula="1",
                    missing="raise",
                )
                result = model.fit(
                    reml=False,
                    method=optimizer,
                    maxiter=2000,
                    full_output=True,
                    disp=False,
                )
                converged = bool(result.converged)
                attempts.append({
                    "optimizer": optimizer,
                    "converged": converged,
                    "warnings": warning_messages(captured),
                    "error": None,
                })
                if converged:
                    selected_result = result
                    selected_optimizer = optimizer
                    break
            except Exception as error:  # statsmodels exposes optimizer-specific exceptions
                attempts.append({
                    "optimizer": optimizer,
                    "converged": False,
                    "warnings": warning_messages(captured),
                    "error": f"{type(error).__name__}: {error}",
                })
    if selected_result is None:
        failure = {
            "contractVersion": "unified-longitudinal-mixed-model/v1",
            "status": "failed",
            "modelFormula": DISPLAY_FORMULA,
            "implementationFormula": IMPLEMENTATION_FORMULA,
            "library": {"name": "statsmodels", "version": statsmodels.__version__},
            "optimizerAttempts": attempts,
        }
        MODEL_JSON_PATH.write_text(json.dumps(failure, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        raise RuntimeError("No pre-specified standard optimizer produced a converged mixed-effects model")
    return selected_result, selected_optimizer, attempts


def canonical_coefficient_names(result: Any) -> dict[str, str]:
    names = [str(name) for name in result.fe_params.index]
    mapping: dict[str, str] = {}
    for name in names:
        if name == "Intercept":
            mapping["intercept"] = name
        elif ":" in name and "time_years" in name and "original_cluster" in name:
            mapping["time_x_cluster"] = name
        elif name == "time_years":
            mapping["time"] = name
        elif "original_cluster" in name and ":" not in name:
            mapping["cluster"] = name
    if set(mapping) != {"intercept", "time", "cluster", "time_x_cluster"}:
        raise AssertionError(f"The expected fixed-effect coefficient structure was not estimable: {names}")
    return mapping


def build_coefficient(result: Any, term: str, parameter_name: str) -> dict[str, Any]:
    confidence = result.conf_int(alpha=ALPHA).loc[parameter_name]
    return {
        "term": term,
        "parameterName": parameter_name,
        "estimate": finite(result.fe_params.loc[parameter_name], f"{term} estimate"),
        "standardError": finite(result.bse_fe.loc[parameter_name], f"{term} standard error"),
        "confidenceInterval95": {
            "lower": finite(confidence.iloc[0], f"{term} confidence lower"),
            "upper": finite(confidence.iloc[1], f"{term} confidence upper"),
        },
        "zStatistic": finite(result.tvalues.loc[parameter_name], f"{term} z statistic"),
        "pValue": finite(result.pvalues.loc[parameter_name], f"{term} p value"),
    }


def main() -> None:
    input_hashes = {
        relative(ASSIGNMENTS_PATH): file_hash(ASSIGNMENTS_PATH),
        relative(LONGITUDINAL_COHORT_PATH): file_hash(LONGITUDINAL_COHORT_PATH),
    }
    model_data = validate_and_prepare_model_data()
    result, optimizer, attempts = fit_with_documented_optimizers(model_data)
    name_map = canonical_coefficient_names(result)
    fixed_effects = [
        build_coefficient(result, term, name_map[term])
        for term in ("intercept", "time", "cluster", "time_x_cluster")
    ]
    coefficient_lookup = {row["term"]: row for row in fixed_effects}
    primary = coefficient_lookup["time_x_cluster"]
    primary_significant = bool(primary["pValue"] < ALPHA)
    interaction_direction = "higher" if primary["estimate"] > 0 else "lower"
    if primary_significant:
        conclusion = "The observed trajectories differed statistically between the two original clusters."
    else:
        conclusion = "The analysis did not provide sufficient statistical evidence that the longitudinal rates differed between the two original clusters."
    interpretation = (
        f"{conclusion} The Time × Cluster estimate indicates that original Cluster 1 had an estimated "
        f"{abs(primary['estimate']):.6f}-point/year {interaction_direction} annual ADAS-Cog13 change than "
        "original Cluster 0. This is an observational group comparison and does not establish causation."
    )

    random_intercept_variance = finite(result.cov_re.iloc[0, 0], "random-intercept variance")
    residual_variance = finite(result.scale, "residual variance")
    boundary_threshold = max(1e-10, residual_variance * 1e-8)
    selected_attempt = next(attempt for attempt in attempts if attempt["optimizer"] == optimizer)
    selected_warnings = list(selected_attempt["warnings"])
    singular_warning = any(
        "singular" in message.lower() or "boundary" in message.lower()
        for message in selected_warnings
    )
    boundary_detected = bool(random_intercept_variance <= boundary_threshold or singular_warning)

    artifact = {
        "contractVersion": "unified-longitudinal-mixed-model/v1",
        "status": "converged",
        "modelRole": "primary_inferential_longitudinal_model",
        "modelFormula": DISPLAY_FORMULA,
        "implementationFormula": IMPLEMENTATION_FORMULA,
        "estimationMethod": "Maximum likelihood (ML); random intercept only",
        "library": {"name": "statsmodels", "version": statsmodels.__version__},
        "alpha": ALPHA,
        "confidenceLevel": 0.95,
        "referenceCluster": 0,
        "participantCount": EXPECTED_ELIGIBLE_N,
        "participantCountsByOriginalCluster": [
            {"clusterId": 0, "participantCount": EXPECTED_ELIGIBLE_CLUSTERS[0]},
            {"clusterId": 1, "participantCount": EXPECTED_ELIGIBLE_CLUSTERS[1]},
        ],
        "observationCount": EXPECTED_OBSERVATIONS,
        "groupingVariable": "private participant composite key (not exported)",
        "randomEffectsStructure": "participant-level random intercept",
        "selectedOptimizer": optimizer,
        "optimizerAttempts": attempts,
        "converged": True,
        "fixedEffects": fixed_effects,
        "primaryTerm": "time_x_cluster",
        "primaryResult": {
            **primary,
            "significantAtAlpha": primary_significant,
            "coefficientMeaning": "Difference in annual ADAS-Cog13 change for original Cluster 1 relative to original Cluster 0",
        },
        "estimatedAnnualChangeByOriginalCluster": [
            {"clusterId": 0, "estimate": coefficient_lookup["time"]["estimate"], "unit": "ADAS-Cog13 points/year"},
            {"clusterId": 1, "estimate": coefficient_lookup["time"]["estimate"] + primary["estimate"], "unit": "ADAS-Cog13 points/year"},
        ],
        "varianceComponents": {
            "randomInterceptVariance": random_intercept_variance,
            "residualVariance": residual_variance,
        },
        "fitStatistics": {
            "logLikelihood": finite(result.llf, "log-likelihood"),
            "aic": finite(result.aic, "AIC"),
            "bic": finite(result.bic, "BIC"),
        },
        "diagnostics": {
            "coefficientStructureComplete": True,
            "allEstimatesFinite": True,
            "timeClusterEstimable": True,
            "randomEffectBoundaryDetected": boundary_detected,
            "randomEffectBoundaryThreshold": boundary_threshold,
            "selectedFitWarnings": selected_warnings,
        },
        "interpretation": {
            "summary": interpretation,
            "coefficientMeaning": "The Time × Cluster coefficient estimates how much the annual ADAS-Cog13 rate differs between the original enhanced K-Means groups.",
            "causalCaution": "The model compares observed trajectories of algorithmic groups and does not establish prediction or causation.",
        },
        "provenance": {
            "inputSha256": input_hashes,
            "originalAssignmentsFixed": True,
            "eligibleCohortFrozen": True,
            "participantLevelRowsExported": False,
            "longitudinalClusteringInvoked": False,
        },
    }
    if {relative(ASSIGNMENTS_PATH): file_hash(ASSIGNMENTS_PATH), relative(LONGITUDINAL_COHORT_PATH): file_hash(LONGITUDINAL_COHORT_PATH)} != input_hashes:
        raise AssertionError("A mixed-model input artifact changed during fitting")

    MODEL_JSON_PATH.write_text(json.dumps(artifact, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    pd.DataFrame([
        {
            **row,
            "confidenceInterval95Lower": row["confidenceInterval95"]["lower"],
            "confidenceInterval95Upper": row["confidenceInterval95"]["upper"],
            "isPrimary": row["term"] == "time_x_cluster",
            "significantAtAlpha": row["pValue"] < ALPHA,
        }
        for row in fixed_effects
    ]).drop(columns=["confidenceInterval95"]).to_csv(MODEL_CSV_PATH, index=False, lineterminator="\n")

    print(json.dumps({
        "status": artifact["status"],
        "optimizer": optimizer,
        "participants": EXPECTED_ELIGIBLE_N,
        "observations": EXPECTED_OBSERVATIONS,
        "time_x_cluster_estimate": primary["estimate"],
        "time_x_cluster_p_value": primary["pValue"],
        "random_effect_boundary_detected": boundary_detected,
        "json_artifact": relative(MODEL_JSON_PATH),
        "csv_artifact": relative(MODEL_CSV_PATH),
    }, indent=2))


if __name__ == "__main__":
    main()
