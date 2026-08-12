"""Extract participant-specific Axis B ADAS-Cog13 slopes and QC only.

Authoritative input: data/interim/axis_b_longitudinal_cohort.csv

The script fits independent intercept-inclusive OLS regressions of TOTAL13 on
validated elapsed_years. It does not standardize slopes, reduce dimensions,
select k, cluster, exclude outliers, or modify the frozen observation cohort.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from scipy.stats import t as student_t


ROOT = Path(__file__).resolve().parents[2]
COHORT_PATH = ROOT / "data" / "interim" / "axis_b_longitudinal_cohort.csv"
COHORT_VALIDATION_PATH = ROOT / "data" / "interim" / "axis_b_longitudinal_cohort_validation.json"
OUTPUT_SLOPES = ROOT / "data" / "interim" / "axis_b_adas13_slopes.csv"
OUTPUT_VALIDATION = ROOT / "data" / "interim" / "axis_b_adas13_slopes_validation.json"

EXPECTED_PARTICIPANTS = 1917
EXPECTED_OBSERVATIONS = 11327
REQUIRED_COLUMNS = {
    "PTID",
    "RID",
    "study_entry_phase",
    "VISDATE",
    "TOTAL13",
    "observation_number",
    "elapsed_days",
    "elapsed_years",
}


def file_hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def scalar(value: Any) -> Any:
    if pd.isna(value):
        return None
    if isinstance(value, np.integer):
        return int(value)
    if isinstance(value, np.floating):
        return float(value)
    if isinstance(value, pd.Timestamp):
        return value.strftime("%Y-%m-%d")
    return value


def validate_cohort(frame: pd.DataFrame, validation: dict[str, Any]) -> dict[str, int]:
    missing = REQUIRED_COLUMNS.difference(frame.columns)
    if missing:
        raise KeyError(f"Frozen cohort is missing required fields: {sorted(missing)}")
    if len(frame) != EXPECTED_OBSERVATIONS:
        raise AssertionError(f"Expected {EXPECTED_OBSERVATIONS} observations, found {len(frame)}")
    if frame["PTID"].nunique() != EXPECTED_PARTICIPANTS:
        raise AssertionError(
            f"Expected {EXPECTED_PARTICIPANTS} participants, found {frame['PTID'].nunique()}"
        )
    if validation["outputs"]["cohort_rows"] != EXPECTED_OBSERVATIONS:
        raise AssertionError("Cohort validation JSON observation count differs")
    expected_hash = validation["outputs"]["cohort_sha256"]
    if file_hash(COHORT_PATH) != expected_hash:
        raise AssertionError("Frozen cohort hash differs from its validation provenance")

    frame["VISDATE"] = pd.to_datetime(frame["VISDATE"], errors="raise", format="%Y-%m-%d")
    for column in ("TOTAL13", "elapsed_days", "elapsed_years", "observation_number"):
        frame[column] = pd.to_numeric(frame[column], errors="raise")
    if not np.isfinite(frame[["TOTAL13", "elapsed_days", "elapsed_years"]].to_numpy(float)).all():
        raise AssertionError("Frozen cohort contains non-finite required numeric values")
    if frame.duplicated(["PTID", "VISDATE"]).any():
        raise AssertionError("Frozen cohort contains duplicate participant/date observations")

    time_formula_error = np.abs(
        frame["elapsed_years"].to_numpy(float)
        - frame["elapsed_days"].to_numpy(float) / 365.25
    )
    if float(time_formula_error.max()) > 5.1e-11:
        raise AssertionError("elapsed_years differs from elapsed_days / 365.25")

    zero_variance = 0
    nonmonotonic = 0
    first_nonzero = 0
    bad_observation_number = 0
    under_three = 0
    for _, group in frame.groupby("PTID", sort=False):
        if len(group) < 3:
            under_three += 1
        if np.var(group["elapsed_years"].to_numpy(float)) == 0:
            zero_variance += 1
        if not group["VISDATE"].is_monotonic_increasing:
            nonmonotonic += 1
        if group.iloc[0]["elapsed_days"] != 0 or group.iloc[0]["elapsed_years"] != 0:
            first_nonzero += 1
        if group["observation_number"].tolist() != list(range(1, len(group) + 1)):
            bad_observation_number += 1
    violations = {
        "participants_with_under_3_observations": under_three,
        "participants_with_zero_elapsed_year_variance": zero_variance,
        "participants_with_nonmonotonic_VISDATE": nonmonotonic,
        "participants_with_nonzero_first_elapsed_time": first_nonzero,
        "participants_with_observation_number_violation": bad_observation_number,
    }
    if any(violations.values()):
        raise AssertionError(f"Frozen cohort elapsed-time validation failed: {violations}")
    return violations


def fit_participant(group: pd.DataFrame) -> dict[str, Any]:
    group = group.sort_values(["VISDATE", "observation_number"], kind="stable")
    x = group["elapsed_years"].to_numpy(dtype=np.float64)
    y = group["TOTAL13"].to_numpy(dtype=np.float64)
    n = len(group)
    design = np.column_stack([np.ones(n, dtype=np.float64), x])
    parameters, _, rank, _ = np.linalg.lstsq(design, y, rcond=None)
    if rank != 2:
        raise ArithmeticError("OLS design matrix rank is not two")
    beta0, beta1 = parameters
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
    residual_variance = sse / degrees_freedom
    slope_standard_error = float(np.sqrt(residual_variance / sxx))
    critical_value = float(student_t.ppf(0.975, degrees_freedom))
    ci_margin = critical_value * slope_standard_error
    first_date = group["VISDATE"].iloc[0]
    last_date = group["VISDATE"].iloc[-1]
    followup_days = int((last_date - first_date).days)
    result = {
        "PTID": str(group["PTID"].iloc[0]),
        "RID": str(group["RID"].iloc[0]),
        "study_entry_phase": str(group["study_entry_phase"].iloc[0]),
        "n_observations": n,
        "first_VISDATE": first_date.strftime("%Y-%m-%d"),
        "last_VISDATE": last_date.strftime("%Y-%m-%d"),
        "followup_days": followup_days,
        "followup_years": followup_days / 365.25,
        "beta0_intercept": float(beta0),
        "beta1_slope_points_per_year": float(beta1),
        "r_squared": float(r_squared),
        "RMSE": rmse,
        "slope_standard_error": slope_standard_error,
        "slope_95ci_lower": float(beta1 - ci_margin),
        "slope_95ci_upper": float(beta1 + ci_margin),
    }
    required_numeric = [
        "followup_years",
        "beta0_intercept",
        "beta1_slope_points_per_year",
        "r_squared",
        "RMSE",
        "slope_standard_error",
        "slope_95ci_lower",
        "slope_95ci_upper",
    ]
    if not np.isfinite([result[column] for column in required_numeric]).all():
        raise ArithmeticError("Regression produced a non-finite required diagnostic")
    return result


def extract_slopes(frame: pd.DataFrame) -> tuple[pd.DataFrame, list[dict[str, str]]]:
    results: list[dict[str, Any]] = []
    failures: list[dict[str, str]] = []
    for ptid, group in frame.groupby("PTID", sort=True):
        try:
            results.append(fit_participant(group))
        except Exception as exc:  # record exact failure before the mandatory stop
            failures.append({"PTID": str(ptid), "reason": f"{type(exc).__name__}: {exc}"})
    slopes = pd.DataFrame(results).sort_values(["PTID", "RID"], kind="stable").reset_index(drop=True)
    return slopes, failures


def distribution(series: pd.Series, percentiles: list[float], labels: list[str]) -> dict[str, float]:
    quantiles = series.quantile(percentiles, interpolation="linear")
    return {label: float(quantiles.loc[percentile]) for percentile, label in zip(percentiles, labels)}


def iqr(series: pd.Series) -> float:
    return float(series.quantile(0.75, interpolation="linear") - series.quantile(0.25, interpolation="linear"))


def support_summary(group: pd.DataFrame) -> dict[str, Any]:
    return {
        "participant_count": int(len(group)),
        "median_slope": float(group["beta1_slope_points_per_year"].median()),
        "slope_IQR": iqr(group["beta1_slope_points_per_year"]),
        "median_r_squared": float(group["r_squared"].median()),
        "median_followup_years": float(group["followup_years"].median()),
    }


def duration_summary(group: pd.DataFrame) -> dict[str, Any]:
    return {
        "participant_count": int(len(group)),
        "median_slope": float(group["beta1_slope_points_per_year"].median()),
        "slope_IQR": iqr(group["beta1_slope_points_per_year"]),
        "median_r_squared": float(group["r_squared"].median()),
    }


def trajectory(frame: pd.DataFrame, ptid: str) -> list[dict[str, Any]]:
    group = frame.loc[frame["PTID"].eq(ptid)].sort_values("observation_number")
    return [
        {
            "VISDATE": row.VISDATE.strftime("%Y-%m-%d"),
            "elapsed_years": float(row.elapsed_years),
            "TOTAL13": float(row.TOTAL13),
        }
        for row in group.itertuples(index=False)
    ]


def inspection_rows(selected: pd.DataFrame, cohort: pd.DataFrame) -> list[dict[str, Any]]:
    output: list[dict[str, Any]] = []
    for row in selected.itertuples(index=False):
        output.append({
            "PTID": row.PTID,
            "RID": row.RID,
            "n_observations": int(row.n_observations),
            "followup_years": float(row.followup_years),
            "beta1_slope_points_per_year": float(row.beta1_slope_points_per_year),
            "beta0_intercept": float(row.beta0_intercept),
            "r_squared": float(row.r_squared),
            "RMSE": float(row.RMSE),
            "trajectory": trajectory(cohort, row.PTID),
        })
    return output


def numerical_sample(slopes: pd.DataFrame, cohort: pd.DataFrame) -> list[dict[str, Any]]:
    positions = np.linspace(0, len(slopes) - 1, num=10, dtype=int)
    sample: list[dict[str, Any]] = []
    for position in positions:
        result = slopes.iloc[int(position)]
        group = cohort.loc[cohort["PTID"].eq(result["PTID"])]
        x = group["elapsed_years"].to_numpy(np.float64)
        y = group["TOTAL13"].to_numpy(np.float64)
        independent = float(np.cov(x, y, ddof=1)[0, 1] / np.var(x, ddof=1))
        fitted = float(result["beta1_slope_points_per_year"])
        absolute_difference = abs(independent - fitted)
        if not np.isclose(independent, fitted, rtol=1e-12, atol=1e-12):
            raise AssertionError(f"Independent slope validation failed for {result['PTID']}")
        sample.append({
            "PTID": str(result["PTID"]),
            "RID": str(result["RID"]),
            "n_observations": int(result["n_observations"]),
            "lstsq_beta1": fitted,
            "covariance_divided_by_variance_beta1": independent,
            "absolute_difference": absolute_difference,
        })
    return sample


def main() -> None:
    for path in (COHORT_PATH, COHORT_VALIDATION_PATH):
        if not path.is_file():
            raise FileNotFoundError(path)
    cohort_hash_before = file_hash(COHORT_PATH)
    cohort_validation_hash_before = file_hash(COHORT_VALIDATION_PATH)
    cohort_validation = json.loads(COHORT_VALIDATION_PATH.read_text(encoding="utf-8"))
    cohort = pd.read_csv(
        COHORT_PATH,
        dtype={"PTID": str, "RID": str, "study_entry_phase": str},
        low_memory=False,
    )
    elapsed_violations = validate_cohort(cohort, cohort_validation)

    slopes, failures = extract_slopes(cohort)
    if failures:
        raise RuntimeError("STOP: one or more participant regressions failed: " + json.dumps(failures))
    if len(slopes) != EXPECTED_PARTICIPANTS:
        raise AssertionError(f"Expected {EXPECTED_PARTICIPANTS} slope rows, found {len(slopes)}")
    if slopes.duplicated(["PTID", "RID"]).any() or slopes["PTID"].duplicated().any():
        raise AssertionError("Duplicate participant identifier rows in slope output")
    if not np.isfinite(slopes.select_dtypes(include=[np.number]).to_numpy()).all():
        raise AssertionError("Slope output contains a non-finite numeric value")

    # A second full extraction pass must be exactly deterministic in memory.
    slopes_second_pass, failures_second_pass = extract_slopes(cohort)
    if failures_second_pass:
        raise RuntimeError("STOP: second deterministic pass failed: " + json.dumps(failures_second_pass))
    pd.testing.assert_frame_equal(slopes, slopes_second_pass, check_exact=True)

    beta1 = slopes["beta1_slope_points_per_year"]
    slope_distribution = distribution(
        beta1,
        [0, 0.01, 0.05, 0.25, 0.5, 0.75, 0.95, 0.99, 1],
        ["minimum", "p01", "p05", "q1", "median", "q3", "p95", "p99", "maximum"],
    )
    slope_distribution.update({
        "mean": float(beta1.mean()),
        "standard_deviation_sample_ddof_1": float(beta1.std(ddof=1)),
        "interquartile_range": iqr(beta1),
    })
    slope_sign_counts = {
        "beta1_less_than_0": int((beta1 < 0).sum()),
        "beta1_exactly_equal_to_0": int((beta1 == 0).sum()),
        "beta1_greater_than_0": int((beta1 > 0).sum()),
    }

    r2 = slopes["r_squared"]
    r2_distribution = distribution(
        r2, [0, 0.25, 0.5, 0.75, 1], ["minimum", "q1", "median", "q3", "maximum"]
    )
    r2_distribution["mean"] = float(r2.mean())
    r2_counts = {
        "r_squared_less_than_0_10": int((r2 < 0.10).sum()),
        "r_squared_less_than_0_25": int((r2 < 0.25).sum()),
        "r_squared_less_than_0_50": int((r2 < 0.50).sum()),
    }
    rmse_distribution = distribution(
        slopes["RMSE"],
        [0, 0.25, 0.5, 0.75, 1],
        ["minimum", "q1", "median", "q3", "maximum"],
    )
    rmse_distribution["mean"] = float(slopes["RMSE"].mean())

    observation_support = {
        "exactly_3": support_summary(slopes.loc[slopes["n_observations"].eq(3)]),
        "exactly_4": support_summary(slopes.loc[slopes["n_observations"].eq(4)]),
        "exactly_5": support_summary(slopes.loc[slopes["n_observations"].eq(5)]),
        "at_least_6": support_summary(slopes.loc[slopes["n_observations"].ge(6)]),
    }
    duration_groups = {
        "less_than_1_year": slopes["followup_years"] < 1,
        "1_to_less_than_2_years": (slopes["followup_years"] >= 1) & (slopes["followup_years"] < 2),
        "2_to_less_than_4_years": (slopes["followup_years"] >= 2) & (slopes["followup_years"] < 4),
        "at_least_4_years": slopes["followup_years"] >= 4,
    }
    followup_comparison = {
        label: duration_summary(slopes.loc[mask]) for label, mask in duration_groups.items()
    }

    most_negative = slopes.sort_values(
        ["beta1_slope_points_per_year", "PTID"], ascending=[True, True], kind="stable"
    ).head(10)
    most_positive = slopes.sort_values(
        ["beta1_slope_points_per_year", "PTID"], ascending=[False, True], kind="stable"
    ).head(10)
    lowest_r2 = slopes.sort_values(["r_squared", "PTID"], kind="stable").head(10)

    validation = {
        "status": "SLOPE_EXTRACTION_AND_QC_ONLY",
        "files_read": {
            str(COHORT_PATH.relative_to(ROOT)): cohort_hash_before,
            str(COHORT_VALIDATION_PATH.relative_to(ROOT)): cohort_validation_hash_before,
        },
        "regression_specification": {
            "model": "TOTAL13 = beta0_intercept + beta1_slope_points_per_year * elapsed_years + error",
            "estimator": "numpy.linalg.lstsq ordinary least squares with intercept",
            "time_unit": "years; elapsed_years from frozen cohort",
            "slope_unit": "ADAS-Cog13 points per year",
            "RMSE_definition": "sqrt(SSE / n_observations)",
            "slope_standard_error": "sqrt((SSE / (n-2)) / sum((x-xbar)^2))",
            "slope_95ci": "two-sided Student-t interval with n-2 degrees of freedom",
            "future_clustering_feature_only": "beta1_slope_points_per_year",
        },
        "cohort_revalidation": {
            "participants": int(cohort["PTID"].nunique()),
            "observations": int(len(cohort)),
            **elapsed_violations,
            "maximum_absolute_elapsed_year_formula_error": float(
                np.abs(cohort["elapsed_years"] - cohort["elapsed_days"] / 365.25).max()
            ),
        },
        "regression_completion": {
            "expected_participants": EXPECTED_PARTICIPANTS,
            "successful_regressions": int(len(slopes)),
            "failed_regressions": 0,
            "failures": [],
        },
        "slope_distribution": slope_distribution,
        "slope_sign_counts": slope_sign_counts,
        "r_squared_distribution": r2_distribution,
        "r_squared_descriptive_counts": r2_counts,
        "RMSE_distribution": rmse_distribution,
        "observation_support_comparison": observation_support,
        "followup_duration_comparison": followup_comparison,
        "extreme_slope_inspection": {
            "10_most_negative": inspection_rows(most_negative, cohort),
            "10_most_positive": inspection_rows(most_positive, cohort),
            "automatic_exclusions": 0,
        },
        "poor_linear_fit_inspection": {
            "10_lowest_r_squared": inspection_rows(lowest_r2, cohort),
            "automatic_exclusions": 0,
        },
        "numerical_validation": {
            "deterministic_sample_method": "10 evenly spaced rows from PTID-sorted slope output",
            "tolerance": {"relative": 1e-12, "absolute": 1e-12},
            "sample": numerical_sample(slopes, cohort),
            "zero_elapsed_year_variance_participants": 0,
            "nonfinite_slope_values": int((~np.isfinite(beta1)).sum()),
            "nonfinite_required_diagnostics": int(
                (~np.isfinite(slopes.select_dtypes(include=[np.number]).to_numpy())).sum()
            ),
            "duplicate_PTID_RID_rows": int(slopes.duplicated(["PTID", "RID"]).sum()),
            "output_participants": int(len(slopes)),
        },
        "reproducibility": {
            "randomness_used": False,
            "full_second_in_memory_extraction_pass_exact_dataframe_match": True,
        },
        "outputs": {
            "slopes_path": str(OUTPUT_SLOPES),
            "validation_path": str(OUTPUT_VALIDATION),
            "slope_rows": int(len(slopes)),
            "slope_columns": int(len(slopes.columns)),
        },
        "prohibited_outputs_created": [],
    }

    OUTPUT_SLOPES.parent.mkdir(parents=True, exist_ok=True)
    slopes.to_csv(
        OUTPUT_SLOPES,
        index=False,
        encoding="utf-8",
        lineterminator="\n",
        float_format="%.17g",
    )
    validation["outputs"]["slopes_sha256"] = file_hash(OUTPUT_SLOPES)

    if file_hash(COHORT_PATH) != cohort_hash_before:
        raise AssertionError("Frozen Axis B longitudinal cohort changed during slope extraction")
    if file_hash(COHORT_VALIDATION_PATH) != cohort_validation_hash_before:
        raise AssertionError("Cohort validation provenance changed during slope extraction")
    validation["input_immutability"] = {
        "cohort_sha256_unchanged": True,
        "cohort_validation_sha256_unchanged": True,
    }
    OUTPUT_VALIDATION.write_text(
        json.dumps(validation, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(json.dumps({
        "slopes": str(OUTPUT_SLOPES),
        "validation": str(OUTPUT_VALIDATION),
        "participants": int(len(slopes)),
        "failed_regressions": 0,
        "slopes_sha256": validation["outputs"]["slopes_sha256"],
        "standardization_or_clustering_performed": False,
    }, indent=2))


if __name__ == "__main__":
    main()
