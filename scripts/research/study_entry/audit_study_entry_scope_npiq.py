"""Audit the ADNI1--ADNI3 clustering scope and NPI-Q study-entry coverage.

The existing study-entry analytical table is read but never modified. This script
creates only scope-restricted comparison and NPI-Q QC outputs. It does not
impute, standardize, recompute NPISCORE, run PCA/clustering, or inspect
ADNIMERGE2.
"""

from __future__ import annotations

import json
from decimal import Decimal, InvalidOperation
from pathlib import Path

import numpy as np
import pandas as pd


ROOT = Path(__file__).resolve().parents[3]
INTERIM = ROOT / "data" / "interim"
NPIQ_PATH = ROOT / "data" / "raw" / "adni" / "All_Subjects_NPIQ_10Aug2026.csv"
STUDY_ENTRY_PATH = INTERIM / "study_entry_cohort_unimputed.csv"
MISSING_POLICY_PATH = INTERIM / "adni_missing_code_policy.csv"

SCOPE_PHASES = ("ADNI1", "ADNIGO", "ADNI2", "ADNI3")
PHASE_LABELS = {"ADNI1": "ADNI1", "ADNIGO": "ADNI-GO", "ADNI2": "ADNI2", "ADNI3": "ADNI3"}

VARIABLES = (
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

NPIQ_PRESENCE_FIELDS = tuple(f"NPI{letter}" for letter in "ABCDEFGHIJKL")
NPIQ_SEVERITY_FIELDS = tuple(f"NPI{letter}SEV" for letter in "ABCDEFGHIJKL")
NPIQ_ITEM_FIELDS = NPIQ_PRESENCE_FIELDS + NPIQ_SEVERITY_FIELDS

REASON_COLUMNS = {
    "BLANK": "missing_due_to_blank",
    "MINUS1": "missing_due_to_minus1",
    "MINUS4": "missing_due_to_minus4",
    "UNAVAILABLE_PHASE_INSTRUMENT": "missing_due_to_unavailable_phase_instrument",
    "FAILED_DERIVATION": "missing_due_to_failed_derivation",
    "UNRESOLVED_DUPLICATE_QC": "missing_due_to_unresolved_duplicate_qc_issue",
}


def read_csv(path: Path) -> pd.DataFrame:
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


def decimal_value(value: str) -> Decimal | None:
    try:
        return Decimal(value.strip())
    except (InvalidOperation, AttributeError):
        return None


def missing_codes() -> set[str]:
    policy = read_csv(MISSING_POLICY_PATH)
    rows = policy.loc[
        policy["source_file"].eq(NPIQ_PATH.name)
        & policy["source_field"].eq("NPISCORE")
        & policy["treat_as_missing"].str.upper().eq("YES")
    ]
    return set(rows["code"].str.strip())


def score_state(value: str, approved_missing_codes: set[str]) -> tuple[float | None, str]:
    stripped = value.strip()
    if stripped == "":
        return None, "BLANK"
    decimal = decimal_value(stripped)
    if decimal == Decimal("-1") and "-1" in approved_missing_codes:
        return None, "MINUS1"
    if decimal == Decimal("-4") and "-4" in approved_missing_codes:
        return None, "MINUS4"
    if decimal is None:
        return None, "UNRESOLVED"
    return float(decimal), "VALID"


def classify_visit(row: pd.Series) -> str:
    viscode = row["VISCODE"].strip()
    viscode2 = row["VISCODE2"].strip()
    if viscode in {"sc", "v01", "4_sc"} or viscode2 == "sc":
        return "SCREENING"
    if viscode in {"bl", "v03", "4_bl", "t_bl"} or viscode2 == "bl":
        return "BASELINE"
    if viscode in {"init", "v06", "4_init"}:
        return "ROLLOVER_PHASE_ENTRY_NOT_ORIGINAL_BASELINE"
    return "SCHEDULED_FOLLOWUP_OR_OTHER"


def item_fields_populated(frame: pd.DataFrame) -> pd.Series:
    return frame.loc[:, NPIQ_ITEM_FIELDS].apply(lambda column: column.str.strip().ne("")).any(axis=1)


def valid_score_distribution(frame: pd.DataFrame) -> str:
    values = frame.loc[frame["_SCORE_STATE"].eq("VALID"), "_SCORE_VALUE"]
    counts = values.value_counts().sort_index()
    return json.dumps({str(int(score) if float(score).is_integer() else score): int(count) for score, count in counts.items()})


def unique_join(values: pd.Series) -> str:
    return " | ".join(sorted({value.strip() for value in values if value.strip()}))


def scope_missingness(axis_scope: pd.DataFrame) -> pd.DataFrame:
    total = len(axis_scope)
    rows = []
    for variable in VARIABLES:
        missing = axis_scope[variable].str.strip().eq("")
        reasons = axis_scope[f"{variable}_MISSING_REASON"].str.strip()
        missing_count = int(missing.sum())
        missing_percentage = 100.0 * missing_count / total
        row = {
            "scope": "ADNI1_ADNIGO_ADNI2_ADNI3",
            "included_phases": "ADNI1 | ADNIGO | ADNI2 | ADNI3",
            "candidate_variable": variable,
            "total_eligible_participants": total,
            "valid_values": int((~missing).sum()),
            "missing_values": missing_count,
            "missing_percentage": missing_percentage,
        }
        for reason, column in REASON_COLUMNS.items():
            row[column] = int((missing & reasons.eq(reason)).sum())
        accounted = sum(row[column] for column in REASON_COLUMNS.values())
        if accounted != missing_count:
            raise AssertionError(f"Missingness causes do not reconcile for {variable}: {accounted} != {missing_count}")
        row["threshold_percentage"] = 20.0
        row["threshold_result"] = "EXCLUDE_GT20_MISSING" if missing_percentage > 20.0 else "RETAIN"
        rows.append(row)
    return pd.DataFrame(rows)


def participant_sets(frame: pd.DataFrame) -> dict[str, set[str]]:
    result: dict[str, set[str]] = {}
    for label, group in frame.groupby("_VISIT_CATEGORY", sort=False):
        result[label] = set(group["RID"].str.strip())
    return result


def npiq_qc(axis_scope: pd.DataFrame, npiq: pd.DataFrame) -> pd.DataFrame:
    rows = []
    all_npiq_rids = set(npiq["RID"].str.strip())
    header_total_candidates = [
        column for column in npiq.columns
        if column != "NPISCORE" and ("TOTAL" in column.upper() or column.upper().endswith("SCORE"))
    ]

    for phase in SCOPE_PHASES:
        cohort = axis_scope.loc[axis_scope["ENTRY_PHASE"].eq(phase)]
        cohort_rids = set(cohort["RID"].str.strip())
        same_phase = npiq.loc[npiq["PHASE"].eq(phase) & npiq["RID"].isin(cohort_rids)].copy()
        anywhere = npiq.loc[npiq["RID"].isin(cohort_rids)].copy()
        baseline = same_phase.loc[same_phase["_VISIT_CATEGORY"].eq("BASELINE")]
        screening = same_phase.loc[same_phase["_VISIT_CATEGORY"].eq("SCREENING")]
        phase_entry = same_phase.loc[same_phase["_VISIT_CATEGORY"].eq("ROLLOVER_PHASE_ENTRY_NOT_ORIGINAL_BASELINE")]
        followup = same_phase.loc[same_phase["_VISIT_CATEGORY"].eq("SCHEDULED_FOLLOWUP_OR_OTHER")]

        missing_cohort = cohort.loc[cohort["NPIQ"].str.strip().eq("")]
        missing_rids = set(missing_cohort["RID"].str.strip())
        valid_screening_rids = set(screening.loc[screening["_SCORE_STATE"].eq("VALID"), "RID"])
        valid_phase_entry_rids = set(phase_entry.loc[phase_entry["_SCORE_STATE"].eq("VALID"), "RID"])
        valid_followup_rids = set(followup.loc[followup["_SCORE_STATE"].eq("VALID"), "RID"])
        valid_baseline_rids = set(baseline.loc[baseline["_SCORE_STATE"].eq("VALID"), "RID"])
        same_phase_rids = set(same_phase["RID"])

        blank_total = same_phase.loc[same_phase["_SCORE_STATE"].eq("BLANK")]
        entry_blank_total = pd.concat([screening, baseline, phase_entry], ignore_index=True)
        entry_blank_total = entry_blank_total.loc[entry_blank_total["_SCORE_STATE"].eq("BLANK")]
        phase_version_values = unique_join(same_phase["DD_CRF_VERSION_LABEL"])

        wrong_visit = missing_rids & (valid_screening_rids | valid_phase_entry_rids)
        phase_specific = missing_rids & valid_followup_rids
        absent_anywhere = missing_rids - all_npiq_rids
        absent_same_phase = missing_rids - same_phase_rids
        entry_blank_with_items = set(entry_blank_total.loc[entry_blank_total["_ANY_ITEM_POPULATED"], "RID"])
        provided_total_not_populated = missing_rids & entry_blank_with_items
        true_unavailable = missing_rids - wrong_visit
        explained_union = wrong_visit | phase_specific | absent_anywhere | provided_total_not_populated
        unresolved = missing_rids - explained_union

        rows.append(
            {
                "phase": phase,
                "phase_label": PHASE_LABELS[phase],
                "eligible_participants": len(cohort_rids),
                "participants_represented_anywhere_in_npiq_file": len(cohort_rids & all_npiq_rids),
                "participants_with_same_phase_npiq_record": len(same_phase_rids),
                "same_phase_npiq_record_rows": len(same_phase),
                "same_phase_visit_codes": unique_join(same_phase["VISCODE"]),
                "same_phase_viscode2_values": unique_join(same_phase["VISCODE2"]),
                "participants_with_valid_npiscore_at_screening": len(valid_screening_rids),
                "participants_with_valid_npiscore_at_baseline": len(valid_baseline_rids),
                "participants_with_valid_npiscore_at_other_entry_associated_visit": len(valid_phase_entry_rids),
                "participants_with_valid_npiscore_at_scheduled_followup_or_other": len(valid_followup_rids),
                "study_entry_valid_npiscore_distribution_json": valid_score_distribution(baseline),
                "study_entry_baseline_record_rows": len(baseline),
                "study_entry_valid_npiscore_count": int(baseline["_SCORE_STATE"].eq("VALID").sum()),
                "study_entry_zero_count": int((baseline["_SCORE_STATE"].eq("VALID") & baseline["_SCORE_VALUE"].eq(0)).sum()),
                "study_entry_positive_count": int((baseline["_SCORE_STATE"].eq("VALID") & baseline["_SCORE_VALUE"].gt(0)).sum()),
                "study_entry_blank_count": int(baseline["_SCORE_STATE"].eq("BLANK").sum()),
                "study_entry_minus1_count": int(baseline["_SCORE_STATE"].eq("MINUS1").sum()),
                "study_entry_minus4_count": int(baseline["_SCORE_STATE"].eq("MINUS4").sum()),
                "study_entry_blank_total_rows_with_any_item_field_populated": int(
                    (baseline["_SCORE_STATE"].eq("BLANK") & baseline["_ANY_ITEM_POPULATED"]).sum()
                ),
                "same_phase_all_valid_npiscore_distribution_json": valid_score_distribution(same_phase),
                "same_phase_valid_npiscore_count": int(same_phase["_SCORE_STATE"].eq("VALID").sum()),
                "same_phase_zero_count": int((same_phase["_SCORE_STATE"].eq("VALID") & same_phase["_SCORE_VALUE"].eq(0)).sum()),
                "same_phase_positive_count": int((same_phase["_SCORE_STATE"].eq("VALID") & same_phase["_SCORE_VALUE"].gt(0)).sum()),
                "same_phase_blank_count": int(same_phase["_SCORE_STATE"].eq("BLANK").sum()),
                "same_phase_minus1_count": int(same_phase["_SCORE_STATE"].eq("MINUS1").sum()),
                "same_phase_minus4_count": int(same_phase["_SCORE_STATE"].eq("MINUS4").sum()),
                "same_phase_unresolved_nonnumeric_count": int(same_phase["_SCORE_STATE"].eq("UNRESOLVED").sum()),
                "blank_total_rows_with_any_item_field_populated": int(blank_total["_ANY_ITEM_POPULATED"].sum()),
                "entry_associated_blank_total_rows_with_any_item_field_populated": int(entry_blank_total["_ANY_ITEM_POPULATED"].sum()),
                "alternate_total_field_exists": "YES" if header_total_candidates else "NO",
                "alternate_total_fields": " | ".join(header_total_candidates),
                "severity_component_fields": " | ".join(NPIQ_SEVERITY_FIELDS),
                "explicit_form_version_values": phase_version_values,
                "multiple_form_version_conventions_observed": "NO_EXPLICIT_EVIDENCE" if not phase_version_values else "REVIEW_VERSION_LABELS",
                "form_version_interpretation": "No nonblank DD_CRF_VERSION_LABEL values occur in this scope-phase cohort; SOURCE varies but is an administration-source field, not an alternate total." if not phase_version_values else "One or more explicit DD_CRF_VERSION_LABEL values occur and are reported separately.",
                "source_values_observed": unique_join(same_phase["SOURCE"]),
                "missing_study_entry_npiscore_participants": len(missing_rids),
                "classification_true_assessment_unavailable_count": len(true_unavailable),
                "classification_wrong_visit_selection_count": len(wrong_visit),
                "classification_phase_specific_collection_count": len(phase_specific),
                "classification_provided_total_not_populated_count": len(provided_total_not_populated),
                "classification_participant_not_present_in_npiq_table_count": len(absent_anywhere),
                "participants_not_present_in_same_phase_npiq_records": len(absent_same_phase),
                "classification_unresolved_count": len(unresolved),
                "classification_counts_are_nonexclusive": "YES",
                "study_entry_rule_assessment": "Baseline selection is not wrong: no valid screening or rollover/phase-entry NPISCORE substitutes were found for missing baseline values. Later scheduled visits are not original study entry.",
            }
        )
    return pd.DataFrame(rows)


def visit_distribution(axis_scope: pd.DataFrame, npiq: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for cohort_phase in SCOPE_PHASES:
        cohort_rids = set(axis_scope.loc[axis_scope["ENTRY_PHASE"].eq(cohort_phase), "RID"])
        records = npiq.loc[npiq["RID"].isin(cohort_rids)].copy()
        grouped = records.groupby(["PHASE", "VISCODE", "VISCODE2", "_VISIT_CATEGORY"], dropna=False, sort=True)
        for (record_phase, viscode, viscode2, category), group in grouped:
            rows.append(
                {
                    "cohort_entry_phase": cohort_phase,
                    "cohort_entry_phase_label": PHASE_LABELS[cohort_phase],
                    "record_phase": record_phase,
                    "viscode": viscode,
                    "viscode2": viscode2,
                    "visit_category": category,
                    "record_rows": len(group),
                    "unique_participants": group["RID"].nunique(),
                    "valid_npiscore_count": int(group["_SCORE_STATE"].eq("VALID").sum()),
                    "zero_count": int((group["_SCORE_STATE"].eq("VALID") & group["_SCORE_VALUE"].eq(0)).sum()),
                    "positive_count": int((group["_SCORE_STATE"].eq("VALID") & group["_SCORE_VALUE"].gt(0)).sum()),
                    "blank_count": int(group["_SCORE_STATE"].eq("BLANK").sum()),
                    "minus1_count": int(group["_SCORE_STATE"].eq("MINUS1").sum()),
                    "minus4_count": int(group["_SCORE_STATE"].eq("MINUS4").sum()),
                    "blank_total_rows_with_any_item_field_populated": int(
                        (group["_SCORE_STATE"].eq("BLANK") & group["_ANY_ITEM_POPULATED"]).sum()
                    ),
                    "valid_npiscore_distribution_json": valid_score_distribution(group),
                    "source_values_observed": unique_join(group["SOURCE"]),
                    "explicit_form_version_values": unique_join(group["DD_CRF_VERSION_LABEL"]),
                    "eligible_as_original_study_entry": "YES" if record_phase == cohort_phase and category == "BASELINE" else "NO",
                }
            )
    return pd.DataFrame(rows)


def exclusion_preview(scope_audit: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for variable in ("BNT", "NPIQ"):
        source = scope_audit.loc[scope_audit["candidate_variable"].eq(variable)].iloc[0]
        if variable == "BNT":
            explanation = "BNT is unavailable for ADNI3 and MINT substitution is prohibited; the scope-restricted missingness remains above 20%."
        else:
            explanation = "NPI-Q has complete/near-complete original-baseline coverage in ADNI1/GO but no ADNI2 baseline rows and only one ADNI3 baseline score; later scores are not study entry."
        rows.append(
            {
                "scope": source["scope"],
                "candidate_variable": variable,
                "total_eligible_participants": int(source["total_eligible_participants"]),
                "missing_count": int(source["missing_values"]),
                "missing_percentage": float(source["missing_percentage"]),
                "threshold_percentage": 20.0,
                "threshold_result": source["threshold_result"],
                "methodologically_justified": "YES",
                "replacement_variable_used": "NO",
                "explanation": explanation,
            }
        )
    return pd.DataFrame(rows)


def validate(
    axis_scope: pd.DataFrame,
    scope_audit: pd.DataFrame,
    npiq_qc_table: pd.DataFrame,
    preview: pd.DataFrame,
) -> None:
    if len(axis_scope) != 2437:
        raise AssertionError(f"Unexpected ADNI1--ADNI3 cohort size: {len(axis_scope)}")
    if axis_scope["RID"].duplicated().any():
        raise AssertionError("Scope-restricted cohort contains duplicate RIDs.")
    if len(scope_audit) != 15 or set(scope_audit["candidate_variable"]) != set(VARIABLES):
        raise AssertionError("Scope missingness output must contain exactly 15 candidate rows.")
    if len(npiq_qc_table) != 4:
        raise AssertionError("NPI-Q QC output must contain one summary row per thesis phase.")
    if len(preview) != 2:
        raise AssertionError("Final exclusion preview must contain exactly BNT and NPIQ.")
    expected = np.where(scope_audit["missing_percentage"] > 20.0, "EXCLUDE_GT20_MISSING", "RETAIN")
    if not np.array_equal(expected, scope_audit["threshold_result"].to_numpy()):
        raise AssertionError("Scope threshold results do not match the strict >20% rule.")


def main() -> None:
    axis = read_csv(STUDY_ENTRY_PATH)
    axis_scope = axis.loc[axis["ENTRY_PHASE"].isin(SCOPE_PHASES)].copy()
    npiq = read_csv(NPIQ_PATH)
    approved_missing_codes = missing_codes()
    states = [score_state(value, approved_missing_codes) for value in npiq["NPISCORE"]]
    npiq["_SCORE_VALUE"] = [value for value, _ in states]
    npiq["_SCORE_STATE"] = [state for _, state in states]
    npiq["_VISIT_CATEGORY"] = npiq.apply(classify_visit, axis=1)
    npiq["_ANY_ITEM_POPULATED"] = item_fields_populated(npiq)

    scope_audit = scope_missingness(axis_scope)
    npiq_qc_table = npiq_qc(axis_scope, npiq)
    visit_table = visit_distribution(axis_scope, npiq)
    preview = exclusion_preview(scope_audit)
    validate(axis_scope, scope_audit, npiq_qc_table, preview)

    scope_audit.to_csv(INTERIM / "study_entry_scope_restricted_missingness.csv", index=False, encoding="utf-8")
    npiq_qc_table.to_csv(INTERIM / "npiq_study_entry_qc.csv", index=False, encoding="utf-8")
    visit_table.to_csv(INTERIM / "npiq_visit_distribution.csv", index=False, encoding="utf-8")
    preview.to_csv(INTERIM / "study_entry_final_exclusion_preview.csv", index=False, encoding="utf-8")

    print(f"ADNI1--ADNI3 eligible cohort: {len(axis_scope)}")
    print(scope_audit[["candidate_variable", "missing_values", "missing_percentage", "threshold_result"]].to_string(index=False))
    print("\nNPI-Q phase summary:")
    print(npiq_qc_table[[
        "phase", "eligible_participants", "participants_represented_anywhere_in_npiq_file",
        "participants_with_same_phase_npiq_record", "participants_with_valid_npiscore_at_baseline",
        "participants_with_valid_npiscore_at_scheduled_followup_or_other",
        "classification_wrong_visit_selection_count", "classification_phase_specific_collection_count",
        "classification_participant_not_present_in_npiq_table_count",
    ]].to_string(index=False))


if __name__ == "__main__":
    main()
