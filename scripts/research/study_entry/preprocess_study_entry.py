"""Preprocess the locked ADNI1--ADNI3 study-entry cohort and apply PCA.

The audited participant-level study-entry table is the sole analytical input.
This script does not revisit raw ADNI exports, alter cohort construction, or run
clustering.  Both the future baseline and enhanced methods use the same imputed
and standardized 13-feature matrix; ``apply_pca`` is the explicit SOP 1 step
that creates the enhanced method's reduced feature space.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.decomposition import PCA
from sklearn.preprocessing import StandardScaler


ROOT = Path(__file__).resolve().parents[3]
INTERIM = ROOT / "data" / "interim"
AUTHORITATIVE_INPUT = INTERIM / "study_entry_cohort_unimputed.csv"
SCOPE_AUDIT = INTERIM / "study_entry_scope_restricted_missingness.csv"

IDENTIFIERS = ("PTID", "RID")
SCOPE_PHASES = ("ADNI1", "ADNIGO", "ADNI2", "ADNI3")
EXPECTED_PHASE_COUNTS = {"ADNI1": 819, "ADNIGO": 130, "ADNI2": 789, "ADNI3": 699}
EXPECTED_COHORT_ROWS = 2437
VARIANCE_THRESHOLD = 0.85
NEAR_ZERO_VARIANCE = 1e-12

RETAINED_FEATURES = (
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
)

EXPECTED_MISSING_COUNTS = {
    "MMSE": 0,
    "ADAS13": 26,
    "LMI": 2,
    "LMD": 1,
    "TMT_A": 15,
    "TMT_B": 61,
    "CATEGORY_FLUENCY_ANIMALS": 6,
    "RAVLT_IMMEDIATE": 11,
    "RAVLT_DELAYED": 8,
    "RAVLT_FORGETTING": 12,
    "CDRSB": 0,
    "FAQ": 31,
    "GDS": 1,
}

OUTPUT_PATHS = {
    "unimputed": INTERIM / "clustering_features_unimputed.csv",
    "imputed": INTERIM / "clustering_features_imputed.csv",
    "standardized": INTERIM / "clustering_features_standardized.csv",
    "scores": INTERIM / "clustering_pca_scores.csv",
    "variance": INTERIM / "clustering_pca_explained_variance.csv",
    "loadings": INTERIM / "clustering_pca_loadings.csv",
    "summary": INTERIM / "clustering_preprocessing_summary.csv",
}


def read_csv_as_text(path: Path) -> pd.DataFrame:
    """Read an audited artifact without allowing identifier type inference."""
    if not path.is_file():
        raise FileNotFoundError(path)
    return pd.read_csv(
        path,
        dtype=str,
        keep_default_na=False,
        na_filter=False,
        encoding="utf-8-sig",
        low_memory=False,
    )


def validate_scope_audit() -> None:
    """Confirm that the saved scope audit agrees with the locked missing counts."""
    audit = read_csv_as_text(SCOPE_AUDIT)
    audit = audit.loc[audit["candidate_variable"].isin(RETAINED_FEATURES)].copy()
    observed = dict(
        zip(audit["candidate_variable"], pd.to_numeric(audit["missing_values"], errors="raise"))
    )
    if observed != EXPECTED_MISSING_COUNTS:
        raise AssertionError(
            "Saved scope audit does not match the locked retained-feature missing counts: "
            f"observed={observed}, expected={EXPECTED_MISSING_COUNTS}"
        )


def build_retained_feature_table(source: pd.DataFrame) -> pd.DataFrame:
    """Filter the audited study-entry artifact and select exactly 13 features."""
    required = set(IDENTIFIERS) | {"ENTRY_PHASE"} | set(RETAINED_FEATURES)
    missing_columns = sorted(required - set(source.columns))
    if missing_columns:
        raise AssertionError(f"Authoritative input is missing columns: {missing_columns}")

    scoped = source.loc[source["ENTRY_PHASE"].isin(SCOPE_PHASES)].copy()
    phase_counts = scoped["ENTRY_PHASE"].value_counts().to_dict()
    if phase_counts != EXPECTED_PHASE_COUNTS:
        raise AssertionError(
            f"Scope phase counts differ from the locked cohort: {phase_counts}"
        )
    if len(scoped) != EXPECTED_COHORT_ROWS:
        raise AssertionError(f"Expected {EXPECTED_COHORT_ROWS} rows, found {len(scoped)}")

    retained = scoped.loc[:, [*IDENTIFIERS, *RETAINED_FEATURES]].copy()
    for identifier in IDENTIFIERS:
        if retained[identifier].str.strip().eq("").any():
            raise AssertionError(f"Blank {identifier} found in the retained cohort")
        if retained[identifier].duplicated().any():
            raise AssertionError(f"Duplicate {identifier} found in the retained cohort")

    for feature in RETAINED_FEATURES:
        raw = retained[feature].str.strip()
        numeric = pd.to_numeric(raw.mask(raw.eq("")), errors="coerce")
        malformed = raw.ne("") & numeric.isna()
        if malformed.any():
            examples = sorted(raw.loc[malformed].unique().tolist())[:5]
            raise AssertionError(f"Non-numeric values found in {feature}: {examples}")
        retained[feature] = numeric.astype(float)

    if any(column in retained.columns for column in ("BNT", "NPIQ")):
        raise AssertionError("BNT or NPIQ entered the final retained table")
    if list(retained.columns) != [*IDENTIFIERS, *RETAINED_FEATURES]:
        raise AssertionError("Retained table does not have the exact required schema")
    return retained


def median_impute_features(
    retained: pd.DataFrame,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Median-impute each retained feature and create its traceable QC summary."""
    imputed = retained.copy()
    summary_rows: list[dict[str, float | int | str]] = []

    for feature in RETAINED_FEATURES:
        before = retained[feature]
        missing_before = int(before.isna().sum())
        expected_missing = EXPECTED_MISSING_COUNTS[feature]
        if missing_before != expected_missing:
            raise AssertionError(
                f"{feature} missing count is {missing_before}; expected {expected_missing}. "
                "Stopping before imputation."
            )
        median = float(before.median(skipna=True))
        if not np.isfinite(median):
            raise AssertionError(f"No finite observed-value median is available for {feature}")

        imputed[feature] = before.fillna(median)
        after = imputed[feature]
        summary_rows.append(
            {
                "variable": feature,
                "missing_before": missing_before,
                "missing_percent_before": 100.0 * missing_before / len(retained),
                "median_used": median,
                "imputed_count": missing_before,
                "min_before": float(before.min(skipna=True)),
                "max_before": float(before.max(skipna=True)),
                "min_after": float(after.min()),
                "max_after": float(after.max()),
            }
        )

    summary = pd.DataFrame(summary_rows)
    if imputed.loc[:, RETAINED_FEATURES].isna().any().any():
        raise AssertionError("Missing values remain after median imputation")
    return imputed, summary


def standardize_features(
    imputed: pd.DataFrame, summary: pd.DataFrame
) -> tuple[pd.DataFrame, pd.DataFrame, StandardScaler]:
    """Fit StandardScaler on all 2,437 participants and record scaling QC."""
    values = imputed.loc[:, RETAINED_FEATURES].to_numpy(dtype=float)
    if not np.isfinite(values).all():
        raise AssertionError("Non-finite values exist before standardization")

    original_std = values.std(axis=0, ddof=0)
    near_constant = [
        feature
        for feature, standard_deviation in zip(RETAINED_FEATURES, original_std)
        if standard_deviation <= NEAR_ZERO_VARIANCE
    ]
    if near_constant:
        raise AssertionError(f"Zero or near-zero variance features found: {near_constant}")

    scaler = StandardScaler()
    standardized_values = scaler.fit_transform(values)
    if not np.isfinite(standardized_values).all():
        raise AssertionError("Non-finite values exist after standardization")

    standardized_means = standardized_values.mean(axis=0)
    standardized_stds = standardized_values.std(axis=0, ddof=0)
    if not np.allclose(standardized_means, 0.0, atol=1e-12):
        raise AssertionError("Standardized feature means are not approximately zero")
    if not np.allclose(standardized_stds, 1.0, atol=1e-12):
        raise AssertionError("Standardized feature standard deviations are not approximately one")

    standardized = imputed.loc[:, IDENTIFIERS].copy()
    standardized.loc[:, RETAINED_FEATURES] = standardized_values
    scaling = pd.DataFrame(
        {
            "variable": RETAINED_FEATURES,
            "original_mean": values.mean(axis=0),
            "scaler_mean_": scaler.mean_,
            "scaler_scale_": scaler.scale_,
            "standardized_mean": standardized_means,
            "standardized_standard_deviation": standardized_stds,
        }
    )
    summary = summary.merge(scaling, on="variable", how="left", validate="one_to_one")
    return standardized, summary, scaler


def apply_pca(
    standardized: pd.DataFrame, variance_threshold: float = VARIANCE_THRESHOLD
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, PCA, int]:
    """Apply enhanced SOP 1 and retain the minimum PCs reaching the threshold."""
    if not 0.0 < variance_threshold <= 1.0:
        raise ValueError("variance_threshold must be in (0, 1]")
    values = standardized.loc[:, RETAINED_FEATURES].to_numpy(dtype=float)
    if values.shape != (EXPECTED_COHORT_ROWS, len(RETAINED_FEATURES)):
        raise AssertionError(f"Unexpected standardized matrix shape: {values.shape}")
    if not np.isfinite(values).all():
        raise AssertionError("Standardized PCA input contains NaN or infinite values")

    pca = PCA(svd_solver="full")
    all_scores = pca.fit_transform(values)
    cumulative = np.cumsum(pca.explained_variance_ratio_)
    retained_components = int(np.searchsorted(cumulative, variance_threshold, side="left") + 1)
    if cumulative[retained_components - 1] < variance_threshold:
        raise AssertionError("PCA cumulative explained variance did not reach the threshold")
    if retained_components > 1 and cumulative[retained_components - 2] >= variance_threshold:
        raise AssertionError("PCA retained more components than the minimum required")

    component_names = [f"PC{index}" for index in range(1, len(RETAINED_FEATURES) + 1)]
    score_names = component_names[:retained_components]
    scores = standardized.loc[:, IDENTIFIERS].copy()
    scores.loc[:, score_names] = all_scores[:, :retained_components]

    variance = pd.DataFrame(
        {
            "component": component_names,
            "component_number": np.arange(1, len(component_names) + 1),
            "explained_variance": pca.explained_variance_,
            "explained_variance_ratio": pca.explained_variance_ratio_,
            "cumulative_explained_variance": cumulative,
            "retained_for_85_percent": np.arange(1, len(component_names) + 1)
            <= retained_components,
        }
    )
    # These are PCA component coefficients (eigenvector weights), transposed so
    # variables are rows and all 13 fitted components are columns.
    loadings = pd.DataFrame(
        pca.components_.T,
        index=pd.Index(RETAINED_FEATURES, name="variable"),
        columns=component_names,
    ).reset_index()
    return scores, variance, loadings, pca, retained_components


def validate_final_outputs(
    retained: pd.DataFrame,
    imputed: pd.DataFrame,
    standardized: pd.DataFrame,
    scores: pd.DataFrame,
    variance: pd.DataFrame,
    retained_components: int,
) -> None:
    """Enforce every locked cohort, feature, imputation, and PCA assertion."""
    for name, table in (
        ("retained", retained),
        ("imputed", imputed),
        ("standardized", standardized),
        ("PCA scores", scores),
    ):
        if len(table) != EXPECTED_COHORT_ROWS:
            raise AssertionError(f"{name} row count changed to {len(table)}")
        for identifier in IDENTIFIERS:
            if table[identifier].duplicated().any():
                raise AssertionError(f"{name} has duplicate {identifier} values")

    if len(RETAINED_FEATURES) != 13:
        raise AssertionError("The retained feature list does not contain exactly 13 variables")
    if {"BNT", "NPIQ"} & set(retained.columns):
        raise AssertionError("An excluded variable is present")
    if imputed.loc[:, RETAINED_FEATURES].isna().any().any():
        raise AssertionError("Missing values remain after imputation")
    if not np.isfinite(imputed.loc[:, RETAINED_FEATURES].to_numpy(dtype=float)).all():
        raise AssertionError("Infinite values exist after imputation")
    if not retained["RAVLT_FORGETTING"].lt(0).any():
        raise AssertionError("No valid negative RAVLT_FORGETTING values remain")
    if standardized.loc[:, RETAINED_FEATURES].shape != (EXPECTED_COHORT_ROWS, 13):
        raise AssertionError("Standardized feature matrix is not (2437, 13)")
    if scores.shape != (EXPECTED_COHORT_ROWS, len(IDENTIFIERS) + retained_components):
        raise AssertionError("PCA score artifact has an unexpected shape")
    cumulative = float(variance.loc[retained_components - 1, "cumulative_explained_variance"])
    if cumulative < VARIANCE_THRESHOLD:
        raise AssertionError("Retained PCA scores do not reach 85% cumulative variance")


def write_outputs(
    retained: pd.DataFrame,
    imputed: pd.DataFrame,
    standardized: pd.DataFrame,
    scores: pd.DataFrame,
    variance: pd.DataFrame,
    loadings: pd.DataFrame,
    summary: pd.DataFrame,
) -> None:
    """Write only the seven requested clustering preprocessing deliverables."""
    INTERIM.mkdir(parents=True, exist_ok=True)
    outputs = {
        "unimputed": retained,
        "imputed": imputed,
        "standardized": standardized,
        "scores": scores,
        "variance": variance,
        "loadings": loadings,
        "summary": summary,
    }
    for name, table in outputs.items():
        table.to_csv(OUTPUT_PATHS[name], index=False, encoding="utf-8", float_format="%.17g")


def main() -> None:
    validate_scope_audit()
    source = read_csv_as_text(AUTHORITATIVE_INPUT)
    retained = build_retained_feature_table(source)
    imputed, summary = median_impute_features(retained)
    standardized, summary, _scaler = standardize_features(imputed, summary)
    scores, variance, loadings, _pca, retained_components = apply_pca(standardized)
    validate_final_outputs(
        retained, imputed, standardized, scores, variance, retained_components
    )
    write_outputs(retained, imputed, standardized, scores, variance, loadings, summary)

    cumulative = float(
        variance.loc[retained_components - 1, "cumulative_explained_variance"]
    )
    print(f"Authoritative input: {AUTHORITATIVE_INPUT.relative_to(ROOT)}")
    print(f"Cohort rows before/after imputation: {len(retained)}/{len(imputed)}")
    print(f"Retained features: {len(RETAINED_FEATURES)}")
    print(f"Valid negative RAVLT_FORGETTING values: {int(retained['RAVLT_FORGETTING'].lt(0).sum())}")
    print(f"Standardized feature matrix shape: {standardized.loc[:, RETAINED_FEATURES].shape}")
    print(f"Retained principal components: {retained_components}")
    print(f"Cumulative explained variance: {cumulative:.17g}")
    print(f"PCA feature score matrix shape: ({len(scores)}, {retained_components})")
    print("All locked preprocessing and PCA QC assertions passed.")


if __name__ == "__main__":
    main()
