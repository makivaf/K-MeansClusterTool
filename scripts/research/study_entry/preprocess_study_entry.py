"""Preprocess the locked ADNI1--ADNI3 study-entry cohort and apply PCA.

Oct 2026 panel revision: all 15 candidate variables are clustering inputs (the
former >20% missingness exclusion of BNT and NPI-Q is dropped).  The imputed
matrix is Mariel's verified finalized 15-variable median-imputed dataset
(``final_15var_median``); this script does NOT impute again.  It verifies that
dataset against the audited unimputed study-entry table, then standardizes it.
Both the baseline and enhanced methods use the same standardized 15-feature
matrix; ``apply_pca`` is the explicit SOP 1 step that creates the enhanced
method's reduced feature space.  The 13-variable artifacts are archived in
``data/interim/archive_13var_frozen``.
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
FINALIZED_IMPUTED_INPUT = INTERIM / "final_15var_median" / "ADNI_15var_median_imputed_wide.csv"
# SHA-256 of Mariel's original file, verified against her SHA256SUMS.txt handoff manifest.
FINALIZED_IMPUTED_SHA256 = "4f8ceda03cd931d47260b00977ff9967c3de8d41352d70703b87048fed24c97b"
OBSERVED_MATCH_TOLERANCE = 1e-9

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
    "BNT",
    "RAVLT_IMMEDIATE",
    "RAVLT_DELAYED",
    "RAVLT_FORGETTING",
    "CDRSB",
    "FAQ",
    "NPIQ",
    "GDS",
)
EXPECTED_FEATURE_COUNT = 15

EXPECTED_MISSING_COUNTS = {
    "MMSE": 0,
    "ADAS13": 26,
    "LMI": 2,
    "LMD": 1,
    "TMT_A": 15,
    "TMT_B": 61,
    "CATEGORY_FLUENCY_ANIMALS": 6,
    "BNT": 707,
    "RAVLT_IMMEDIATE": 11,
    "RAVLT_DELAYED": 8,
    "RAVLT_FORGETTING": 12,
    "CDRSB": 0,
    "FAQ": 31,
    "NPIQ": 1488,
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


_ENTRY_PHASE_BY_RID: dict[str, str] = {}


def scope_phases_for(retained: pd.DataFrame) -> pd.Series:
    """Return the audited ENTRY_PHASE for each retained participant."""
    return retained["RID"].map(_ENTRY_PHASE_BY_RID)


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


def build_retained_feature_table(source: pd.DataFrame, *, expected_phase_counts: dict[str, int] = EXPECTED_PHASE_COUNTS, expected_rows: int = EXPECTED_COHORT_ROWS) -> pd.DataFrame:
    """Filter the audited study-entry artifact and select exactly 15 features."""
    required = set(IDENTIFIERS) | {"ENTRY_PHASE"} | set(RETAINED_FEATURES)
    missing_columns = sorted(required - set(source.columns))
    if missing_columns:
        raise AssertionError(f"Authoritative input is missing columns: {missing_columns}")

    scoped = source.loc[source["ENTRY_PHASE"].isin(SCOPE_PHASES)].copy()
    phase_counts = scoped["ENTRY_PHASE"].value_counts().to_dict()
    if phase_counts != expected_phase_counts:
        raise AssertionError(
            f"Scope phase counts differ from the locked cohort: {phase_counts}"
        )
    if len(scoped) != expected_rows:
        raise AssertionError(f"Expected {EXPECTED_COHORT_ROWS} rows, found {len(scoped)}")

    retained = scoped.loc[:, [*IDENTIFIERS, *RETAINED_FEATURES]].copy()
    _ENTRY_PHASE_BY_RID.update(dict(zip(scoped["RID"], scoped["ENTRY_PHASE"])))
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

    if list(retained.columns) != [*IDENTIFIERS, *RETAINED_FEATURES]:
        raise AssertionError("Retained table does not have the exact required schema")
    return retained


def median_impute_features(
    retained: pd.DataFrame, *, expected_missing_counts: dict[str, int] = EXPECTED_MISSING_COUNTS,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Median-impute each retained feature (live simulator subsets; not the study run)."""
    imputed = retained.copy()
    summary_rows: list[dict[str, float | int | str]] = []

    for feature in RETAINED_FEATURES:
        before = retained[feature]
        missing_before = int(before.isna().sum())
        expected_missing = expected_missing_counts[feature]
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


def load_finalized_imputed_features(
    retained: pd.DataFrame, *, expected_missing_counts: dict[str, int] = EXPECTED_MISSING_COUNTS,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Load the verified finalized median-imputed dataset without imputing again.

    Every check compares the finalized file with the audited unimputed table:
    same participants and phases, observed scores unchanged, and each originally
    missing cell holding that variable's single observed-score median.
    """
    import hashlib

    if not FINALIZED_IMPUTED_INPUT.is_file():
        raise FileNotFoundError(FINALIZED_IMPUTED_INPUT)
    digest = hashlib.sha256(FINALIZED_IMPUTED_INPUT.read_bytes()).hexdigest()
    if digest != FINALIZED_IMPUTED_SHA256:
        raise AssertionError(f"Finalized dataset SHA-256 differs from the verified handoff: {digest}")

    final = read_csv_as_text(FINALIZED_IMPUTED_INPUT)
    expected_columns = {"RID", "ENTRY_PHASE", *RETAINED_FEATURES}
    if set(final.columns) != expected_columns or len(final.columns) != len(expected_columns):
        raise AssertionError(f"Finalized dataset columns differ: {sorted(final.columns)}")
    if len(final) != len(retained) or final["RID"].duplicated().any():
        raise AssertionError("Finalized dataset row count or RID uniqueness differs")

    final = final.set_index("RID")
    source_rids = retained["RID"]
    if set(final.index) != set(source_rids):
        raise AssertionError("Finalized dataset participants differ from the audited cohort")

    imputed = retained.loc[:, list(IDENTIFIERS)].copy()
    summary_rows: list[dict[str, float | int | str]] = []
    for feature in RETAINED_FEATURES:
        before = retained[feature]
        after = pd.to_numeric(final.loc[source_rids, feature].str.strip(), errors="raise").to_numpy(dtype=float)
        after = pd.Series(after, index=retained.index)
        if not np.isfinite(after.to_numpy()).all():
            raise AssertionError(f"{feature}: finalized dataset contains blank or non-finite values")
        missing = before.isna()
        missing_before = int(missing.sum())
        if missing_before != expected_missing_counts[feature]:
            raise AssertionError(
                f"{feature} missing count is {missing_before}; expected {expected_missing_counts[feature]}"
            )
        if (after[~missing] - before[~missing]).abs().max() > OBSERVED_MATCH_TOLERANCE:
            raise AssertionError(f"{feature}: an observed score differs in the finalized dataset")
        median = float(before.median(skipna=True))
        if missing_before and (after[missing] - median).abs().max() > OBSERVED_MATCH_TOLERANCE:
            raise AssertionError(f"{feature}: an imputed cell is not the observed-score median")
        imputed[feature] = after
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

    phases = final.loc[source_rids, "ENTRY_PHASE"].to_numpy()
    if phases.tolist() != scope_phases_for(retained).tolist():
        raise AssertionError("Finalized dataset ENTRY_PHASE values differ from the audited cohort")
    summary = pd.DataFrame(summary_rows)
    if imputed.loc[:, RETAINED_FEATURES].isna().any().any():
        raise AssertionError("Missing values remain in the finalized dataset")
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
    standardized: pd.DataFrame, variance_threshold: float = VARIANCE_THRESHOLD, *, expected_rows: int = EXPECTED_COHORT_ROWS
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, PCA, int]:
    """Apply enhanced SOP 1 and retain the minimum PCs reaching the threshold."""
    if not 0.0 < variance_threshold <= 1.0:
        raise ValueError("variance_threshold must be in (0, 1]")
    values = standardized.loc[:, RETAINED_FEATURES].to_numpy(dtype=float)
    if values.shape != (expected_rows, len(RETAINED_FEATURES)):
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
    # variables are rows and all 15 fitted components are columns.
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
    retained_components: int, *, expected_rows: int = EXPECTED_COHORT_ROWS,
) -> None:
    """Enforce every locked cohort, feature, imputation, and PCA assertion."""
    for name, table in (
        ("retained", retained),
        ("imputed", imputed),
        ("standardized", standardized),
        ("PCA scores", scores),
    ):
        if len(table) != expected_rows:
            raise AssertionError(f"{name} row count changed to {len(table)}")
        for identifier in IDENTIFIERS:
            if table[identifier].duplicated().any():
                raise AssertionError(f"{name} has duplicate {identifier} values")

    if len(RETAINED_FEATURES) != EXPECTED_FEATURE_COUNT:
        raise AssertionError("The retained feature list does not contain exactly 15 variables")
    if imputed.loc[:, RETAINED_FEATURES].isna().any().any():
        raise AssertionError("Missing values remain after imputation")
    if not np.isfinite(imputed.loc[:, RETAINED_FEATURES].to_numpy(dtype=float)).all():
        raise AssertionError("Infinite values exist after imputation")
    if not retained["RAVLT_FORGETTING"].lt(0).any():
        raise AssertionError("No valid negative RAVLT_FORGETTING values remain")
    if standardized.loc[:, RETAINED_FEATURES].shape != (expected_rows, EXPECTED_FEATURE_COUNT):
        raise AssertionError("Standardized feature matrix is not (2437, 15)")
    if scores.shape != (expected_rows, len(IDENTIFIERS) + retained_components):
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
    imputed, summary = load_finalized_imputed_features(retained)
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
    print(f"Finalized imputed input: {FINALIZED_IMPUTED_INPUT.relative_to(ROOT)} (SHA-256 verified; no re-imputation)")
    print(f"Cohort rows unimputed/finalized: {len(retained)}/{len(imputed)}")
    print(f"Retained features: {len(RETAINED_FEATURES)}")
    print(f"Valid negative RAVLT_FORGETTING values: {int(retained['RAVLT_FORGETTING'].lt(0).sum())}")
    print(f"Standardized feature matrix shape: {standardized.loc[:, RETAINED_FEATURES].shape}")
    print(f"Retained principal components: {retained_components}")
    print(f"Cumulative explained variance: {cumulative:.17g}")
    print(f"PCA feature score matrix shape: ({len(scores)}, {retained_components})")
    print("All locked preprocessing and PCA QC assertions passed.")


if __name__ == "__main__":
    main()
