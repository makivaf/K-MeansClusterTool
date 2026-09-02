"""Audit longitudinal ADAS-Cog13 records without modeling.

This script is deliberately limited to schema, date, value, duplicate, cohort,
visit-count, follow-up-coverage, and identifier/order checks. It does not create
an analytical cohort, calculate slopes, transform TOTAL13, or run PCA,
clustering, k selection, or DPC.
"""

from __future__ import annotations

import hashlib
import json
import re
from collections import Counter
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd


ROOT = Path(__file__).resolve().parents[3]
ADAS_PATH = ROOT / "data" / "raw" / "adni" / "All_Subjects_ADAS_10Aug2026.csv"
STUDY_ENTRY_PATH = ROOT / "data" / "interim" / "study_entry_cohort_unimputed.csv"
OUTPUT_PATH = ROOT / "data" / "interim" / "longitudinal_records_audit.json"

SCOPE_PHASES = ("ADNI1", "ADNIGO", "ADNI2", "ADNI3")
EXCLUDED_PHASES = ("ADNI4", "TEAM")
EXPECTED_ENTRY_PHASE_COUNTS = {"ADNI1": 819, "ADNIGO": 130, "ADNI2": 789, "ADNI3": 699}
EXPECTED_ROSTER_SIZE = 2437
DATE_FIELDS = ("VISDATE", "USERDATE", "USERDATE2", "UPDATE_STAMP")
KEY_FIELDS = ("PTID", "RID", "VISCODE", "VISCODE2", "TOTAL13", "TOTSCORE")


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def clean_text(series: pd.Series) -> pd.Series:
    return series.fillna("").astype(str).str.strip()


def parse_dates(series: pd.Series) -> pd.Series:
    # The export uses ISO-like values. Mixed mode supports both date-only fields
    # and UPDATE_STAMP timestamps without treating administrative fields as visits.
    return pd.to_datetime(clean_text(series), errors="coerce", format="mixed")


def numeric_values(series: pd.Series) -> pd.Series:
    return pd.to_numeric(clean_text(series).replace("", np.nan), errors="coerce")


def pct(count: int, denominator: int) -> float:
    return round(100.0 * count / denominator, 4) if denominator else 0.0


def scalar(value: Any) -> Any:
    if pd.isna(value):
        return None
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating,)):
        return float(value)
    if isinstance(value, pd.Timestamp):
        return value.isoformat()
    return value


def records(frame: pd.DataFrame, columns: list[str], limit: int = 5) -> list[dict[str, Any]]:
    output: list[dict[str, Any]] = []
    for row in frame.loc[:, columns].head(limit).to_dict(orient="records"):
        output.append({key: scalar(value) for key, value in row.items()})
    return output


def duplicate_summary(
    frame: pd.DataFrame,
    keys: list[str],
    participant: str,
    example_columns: list[str],
    require_nonblank: bool = True,
) -> dict[str, Any]:
    eligible = pd.Series(True, index=frame.index)
    if require_nonblank:
        for key in keys:
            eligible &= clean_text(frame[key]).ne("")
    subset = frame.loc[eligible].copy()
    mask = subset.duplicated(keys, keep=False)
    duplicated = subset.loc[mask].sort_values(keys, kind="stable")
    group_sizes = duplicated.groupby(keys, dropna=False).size() if len(duplicated) else pd.Series(dtype=int)
    return {
        "key": keys,
        "duplicate_groups": int(len(group_sizes)),
        "rows_in_duplicate_groups": int(len(duplicated)),
        "excess_rows_beyond_one_per_group": int((group_sizes - 1).sum()) if len(group_sizes) else 0,
        "participants_affected": int(duplicated[participant].nunique()) if len(duplicated) else 0,
        "examples": records(duplicated, example_columns),
    }


def count_distribution(counts: pd.Series) -> dict[str, int]:
    frequencies = counts.value_counts().sort_index()
    return {str(int(key)): int(value) for key, value in frequencies.items()}


def category_counts(counts: pd.Series) -> dict[str, int]:
    return {
        "exactly_1": int(counts.eq(1).sum()),
        "exactly_2": int(counts.eq(2).sum()),
        "exactly_3": int(counts.eq(3).sum()),
        "exactly_4": int(counts.eq(4).sum()),
        "at_least_5": int(counts.ge(5).sum()),
    }


def month_number(value: str) -> int | None:
    # Restrict ordering checks to explicit month-number codes. Baseline,
    # screening, rollover, and phase-specific codes are intentionally excluded.
    match = re.fullmatch(r"m(\d+)", value.strip().lower())
    return int(match.group(1)) if match else None


def ordering_conflicts(frame: pd.DataFrame, visit_field: str) -> dict[str, Any]:
    work = frame.loc[frame["_VISDATE_PARSED"].notna()].copy()
    work["_MONTH"] = clean_text(work[visit_field]).map(month_number)
    work = work.loc[work["_MONTH"].notna()].copy()
    conflicts: list[pd.DataFrame] = []
    affected: set[str] = set()
    for ptid, group in work.groupby("PTID", sort=False):
        by_month = group.sort_values(["_MONTH", "_VISDATE_PARSED"], kind="stable")
        dates = by_month.groupby("_MONTH")["_VISDATE_PARSED"].agg(["min", "max"]).sort_index()
        prior_max: pd.Timestamp | None = None
        bad_months: set[int] = set()
        for month, row in dates.iterrows():
            if prior_max is not None and row["min"] < prior_max:
                bad_months.add(int(month))
            prior_max = row["max"] if prior_max is None else max(prior_max, row["max"])
        if bad_months:
            affected.add(str(ptid))
            conflicts.append(by_month.loc[by_month["_MONTH"].isin(bad_months)])
    example_frame = pd.concat(conflicts, ignore_index=True) if conflicts else work.iloc[0:0]
    return {
        "definition": "Only explicit mNN codes were compared; sc/bl/rollover/phase-specific labels were not ordered.",
        "participants_with_decreasing_actual_dates_as_month_code_increases": len(affected),
        "month_coded_rows_checked": int(len(work)),
        "examples": records(example_frame, ["PTID", "RID", "PHASE", visit_field, "VISDATE", "TOTAL13"]),
    }


def main() -> None:
    for path in (ADAS_PATH, STUDY_ENTRY_PATH):
        if not path.is_file():
            raise FileNotFoundError(path)

    source_hash_before = file_sha256(ADAS_PATH)
    adas = pd.read_csv(
        ADAS_PATH,
        dtype=str,
        keep_default_na=False,
        na_filter=False,
        encoding="utf-8-sig",
        low_memory=False,
    )
    required = {"PHASE", *KEY_FIELDS, *DATE_FIELDS}
    missing = required.difference(adas.columns)
    if missing:
        raise KeyError(f"ADAS export is missing required audit fields: {sorted(missing)}")

    adas["_SOURCE_ROW_NUMBER"] = np.arange(2, len(adas) + 2)
    adas["_TOTAL13_NUMERIC"] = numeric_values(adas["TOTAL13"])
    adas["_TOTAL13_NONBLANK"] = clean_text(adas["TOTAL13"]).ne("")
    adas["_TOTAL13_VALID"] = adas["_TOTAL13_NUMERIC"].notna()
    for field in DATE_FIELDS:
        adas[f"_{field}_PARSED"] = parse_dates(adas[field])
    adas["_VISDATE_PARSED"] = adas["_VISDATE_PARSED"]

    # Pandas inference is reported separately because CSV itself has no stored types.
    inferred = pd.read_csv(ADAS_PATH, low_memory=False, encoding="utf-8-sig")

    date_audit: dict[str, Any] = {}
    for field in DATE_FIELDS:
        nonmissing = clean_text(adas[field]).ne("")
        parsed = adas[f"_{field}_PARSED"]
        parseable = parsed.notna()
        date_audit[field] = {
            "non_missing_count": int(nonmissing.sum()),
            "non_missing_percent_of_rows": pct(int(nonmissing.sum()), len(adas)),
            "parseable_count": int(parseable.sum()),
            "parseable_percent_of_rows": pct(int(parseable.sum()), len(adas)),
            "parseable_percent_of_non_missing": pct(int(parseable.sum()), int(nonmissing.sum())),
            "minimum": scalar(parsed.min()),
            "maximum": scalar(parsed.max()),
            "valid_TOTAL13_with_missing_or_unparseable_field": int((adas["_TOTAL13_VALID"] & ~parseable).sum()),
        }

    total_numeric = adas["_TOTAL13_NUMERIC"]
    invalid_total = adas["_TOTAL13_NONBLANK"] & total_numeric.isna()
    suspicious_total = total_numeric.notna() & ((total_numeric < 0) | (total_numeric > 85))
    suspicious_values = Counter(clean_text(adas.loc[suspicious_total, "TOTAL13"]))

    duplicate_examples = [
        "_SOURCE_ROW_NUMBER", "PHASE", "PTID", "RID", "VISCODE", "VISCODE2", "VISDATE", "TOTAL13", "TOTSCORE"
    ]
    exact_mask = adas.duplicated(list(inferred.columns), keep=False)
    exact_groups = adas.loc[exact_mask].groupby(list(inferred.columns), dropna=False).size()

    duplicate_audit: dict[str, Any] = {
        "exact_duplicate_rows": {
            "duplicate_groups": int(len(exact_groups)),
            "rows_in_duplicate_groups": int(exact_mask.sum()),
            "excess_rows_beyond_one_per_group": int((exact_groups - 1).sum()) if len(exact_groups) else 0,
            "participants_affected": int(adas.loc[exact_mask, "PTID"].nunique()),
            "examples": records(adas.loc[exact_mask], duplicate_examples),
        },
        "PTID_VISCODE": duplicate_summary(adas, ["PTID", "VISCODE"], "PTID", duplicate_examples),
        "PTID_VISCODE2": duplicate_summary(adas, ["PTID", "VISCODE2"], "PTID", duplicate_examples),
    }
    valid_date = adas["_VISDATE_PARSED"].notna()
    dated = adas.loc[valid_date].copy()
    dated["_CANDIDATE_DATE"] = dated["_VISDATE_PARSED"].dt.strftime("%Y-%m-%d")
    duplicate_audit["PTID_VISDATE"] = duplicate_summary(
        dated, ["PTID", "_CANDIDATE_DATE"], "PTID", duplicate_examples
    )
    duplicate_audit["RID_VISDATE"] = duplicate_summary(
        dated, ["RID", "_CANDIDATE_DATE"], "PTID", duplicate_examples
    )

    same_day = dated.loc[dated.duplicated(["PTID", "_CANDIDATE_DATE"], keep=False)].copy()
    conflict_keys: list[tuple[str, str]] = []
    harmless_keys: list[tuple[str, str]] = []
    incomplete_keys: list[tuple[str, str]] = []
    for key, group in same_day.groupby(["PTID", "_CANDIDATE_DATE"], sort=True):
        values = group["_TOTAL13_NUMERIC"].dropna().unique()
        if len(values) > 1:
            conflict_keys.append(key)
        elif group["_TOTAL13_VALID"].all():
            harmless_keys.append(key)
        else:
            incomplete_keys.append(key)
    conflict_index = pd.MultiIndex.from_tuples(conflict_keys, names=["PTID", "_CANDIDATE_DATE"])
    if conflict_keys:
        indexed = same_day.set_index(["PTID", "_CANDIDATE_DATE"])
        conflicting_rows = indexed.loc[conflict_index].reset_index()
    else:
        conflicting_rows = same_day.iloc[0:0]
    duplicate_audit["same_participant_date_TOTAL13_classification"] = {
        "same_day_groups": int(same_day.groupby(["PTID", "_CANDIDATE_DATE"]).ngroups),
        "same_day_rows": int(len(same_day)),
        "participants_with_same_day_repeats": int(same_day["PTID"].nunique()),
        "groups_with_conflicting_numeric_TOTAL13": len(conflict_keys),
        "participants_with_conflicting_numeric_TOTAL13": len({key[0] for key in conflict_keys}),
        "groups_with_one_numeric_TOTAL13_value_and_no_missing_TOTAL13": len(harmless_keys),
        "groups_involving_missing_or_invalid_TOTAL13": len(incomplete_keys),
        "conflict_examples": records(conflicting_rows, duplicate_examples),
    }

    roster_all = pd.read_csv(
        STUDY_ENTRY_PATH,
        dtype=str,
        keep_default_na=False,
        na_filter=False,
        encoding="utf-8-sig",
        low_memory=False,
    )
    roster = roster_all.loc[roster_all["ENTRY_PHASE"].isin(SCOPE_PHASES), ["PTID", "RID", "ENTRY_PHASE"]].copy()
    phase_counts = roster["ENTRY_PHASE"].value_counts().to_dict()
    if len(roster) != EXPECTED_ROSTER_SIZE or phase_counts != EXPECTED_ENTRY_PHASE_COUNTS:
        raise AssertionError(f"Study-entry roster lock failed: rows={len(roster)}, phase_counts={phase_counts}")
    if roster["PTID"].duplicated().any() or roster["RID"].duplicated().any():
        raise AssertionError("The in-scope study-entry roster does not have unique PTID and RID")

    joined = adas.merge(roster, on=["PTID", "RID"], how="inner", validate="many_to_one")
    scoped = joined.loc[joined["PHASE"].isin(SCOPE_PHASES)].copy()
    excluded_phase_rows_for_roster = joined.loc[joined["PHASE"].isin(EXCLUDED_PHASES)]
    eligible_rows = scoped.loc[scoped["_TOTAL13_VALID"] & scoped["_VISDATE_PARSED"].notna()].copy()

    row_counts = eligible_rows.groupby("PTID").size()
    distinct_date_counts = eligible_rows.groupby("PTID")["_VISDATE_PARSED"].nunique()
    potentially_eligible_ids = distinct_date_counts.loc[distinct_date_counts.ge(3)].index
    potential_rows = eligible_rows.loc[eligible_rows["PTID"].isin(potentially_eligible_ids)].copy()
    spans = potential_rows.groupby("PTID")["_VISDATE_PARSED"].agg(lambda values: (values.max() - values.min()).days)
    quantiles = spans.quantile([0, 0.25, 0.5, 0.75, 1], interpolation="linear")

    full_phase_rows = adas.groupby("PHASE", dropna=False).size().sort_index()
    full_phase_participants = adas.groupby("PHASE", dropna=False)["PTID"].nunique().sort_index()
    ptid_to_rid = adas.groupby("PTID")["RID"].nunique()
    rid_to_ptid = adas.groupby("RID")["PTID"].nunique()
    inconsistent_ptids = ptid_to_rid.loc[ptid_to_rid.gt(1)]
    inconsistent_rids = rid_to_ptid.loc[rid_to_ptid.gt(1)]

    report: dict[str, Any] = {
        "audit_scope": {
            "status": "AUDIT_ONLY",
            "candidate_actual_assessment_date": "VISDATE",
            "date_method_basis": "Existing repository dictionary documents VISDATE as REGISTRY EXAMDATE matched on VISCODE; USERDATE/USERDATE2/UPDATE_STAMP are administrative.",
            "longitudinal_counts_population": "Locked 2,437-person ADNI1/ADNIGO/ADNI2/ADNI3 study-entry roster, with only ADAS rows whose record PHASE is in those four phases.",
            "prohibited_outputs_created": [],
        },
        "files_inspected": {
            "ADAS": {"path": str(ADAS_PATH), "sha256": source_hash_before},
            "study_entry_roster": {"path": str(STUDY_ENTRY_PATH), "sha256": file_sha256(STUDY_ENTRY_PATH)},
        },
        "basic_structure": {
            "rows": int(len(adas)),
            "columns": int(len(inferred.columns)),
            "key_field_presence": {field: field in adas.columns for field in KEY_FIELDS},
            "key_field_csv_storage_type": {field: "text token (CSV has no intrinsic typed schema)" for field in KEY_FIELDS},
            "key_field_pandas_inferred_dtype": {field: str(inferred[field].dtype) for field in KEY_FIELDS},
            "plausible_date_columns": list(DATE_FIELDS),
            "phase_or_cohort_columns": [column for column in adas.columns if column.upper() in {"PHASE", "COHORT", "COLPROT", "ORIGPROT"} or "PHASE" in column.upper() or "COHORT" in column.upper()],
            "all_columns": list(inferred.columns),
        },
        "date_field_audit": date_audit,
        "date_field_interpretation": {
            "VISDATE": "Capable of representing actual ADAS assessment date; documented in the existing repository dictionary as registry EXAMDATE matched on VISCODE.",
            "USERDATE": "Record creation date; not an assessment date.",
            "USERDATE2": "Record last-update date; not an assessment date.",
            "UPDATE_STAMP": "Table build timestamp; not an assessment date.",
            "ambiguity": "No competing assessment-date field is present in this export, but VISDATE matching completeness and duplicate/date conflicts still require explicit QC rules before slope extraction.",
        },
        "TOTAL13_audit": {
            "non_missing_records": int(adas["_TOTAL13_NONBLANK"].sum()),
            "missing_records": int((~adas["_TOTAL13_NONBLANK"]).sum()),
            "numeric_records": int(adas["_TOTAL13_VALID"].sum()),
            "non_numeric_invalid_records": int(invalid_total.sum()),
            "observed_minimum_numeric": scalar(total_numeric.min()),
            "observed_maximum_numeric": scalar(total_numeric.max()),
            "outside_documented_0_to_85_count": int(suspicious_total.sum()),
            "outside_documented_values": dict(sorted(suspicious_values.items())),
            "valid_TOTAL13_without_valid_VISDATE": int((adas["_TOTAL13_VALID"] & adas["_VISDATE_PARSED"].isna()).sum()),
            "valid_VISDATE_with_missing_TOTAL13": int((adas["_VISDATE_PARSED"].notna() & ~adas["_TOTAL13_NONBLANK"]).sum()),
            "valid_VISDATE_with_non_numeric_TOTAL13": int((adas["_VISDATE_PARSED"].notna() & invalid_total).sum()),
            "invalid_examples": records(adas.loc[invalid_total], duplicate_examples),
            "suspicious_examples": records(adas.loc[suspicious_total], duplicate_examples),
        },
        "duplicate_audit_full_ADAS_file": duplicate_audit,
        "phase_cohort_audit": {
            "ADAS_PHASE_values": sorted(clean_text(adas["PHASE"]).unique().tolist()),
            "requested_phase_labels_observed": {
                phase: bool(clean_text(adas["PHASE"]).eq(phase).any())
                for phase in (*SCOPE_PHASES, *EXCLUDED_PHASES)
            },
            "ADAS_rows_by_PHASE": {str(key): int(value) for key, value in full_phase_rows.items()},
            "ADAS_distinct_PTID_by_PHASE": {str(key): int(value) for key, value in full_phase_participants.items()},
            "assessment": "PHASE explicitly identifies each ADAS record's phase. ADNI1/ADNIGO/ADNI2/ADNI3/ADNI4 are observed; TEAM is not observed in this ADAS export. PHASE does not by itself define original study-entry membership for participants who span phases.",
            "study_entry_all_phase_counts": {
                str(key): int(value)
                for key, value in sorted(roster_all["ENTRY_PHASE"].value_counts().to_dict().items())
            },
            "study_entry_roster_rows": int(len(roster)),
            "study_entry_phase_counts": {str(key): int(value) for key, value in sorted(phase_counts.items())},
            "study_entry_unique_PTID": int(roster["PTID"].nunique()),
            "study_entry_unique_RID": int(roster["RID"].nunique()),
            "ADAS_rows_matching_roster_both_identifiers": int(len(joined)),
            "matching_roster_rows_in_scope_record_PHASE": int(len(scoped)),
            "matching_roster_rows_excluded_as_ADNI4_or_TEAM": int(len(excluded_phase_rows_for_roster)),
            "roster_participants_with_any_matching_ADAS_row": int(joined["PTID"].nunique()),
            "roster_participants_without_any_matching_ADAS_row": int(EXPECTED_ROSTER_SIZE - joined["PTID"].nunique()),
        },
        "longitudinal_visit_count_audit": {
            "population_roster_size": EXPECTED_ROSTER_SIZE,
            "valid_dated_TOTAL13_rows": int(len(eligible_rows)),
            "participants_with_at_least_1_valid_dated_TOTAL13": int(distinct_date_counts.size),
            "row_count_categories_among_observed_participants": category_counts(row_counts),
            "row_count_full_frequency": count_distribution(row_counts),
            "distinct_date_count_categories_among_observed_participants": category_counts(distinct_date_counts),
            "distinct_date_count_full_frequency": count_distribution(distinct_date_counts),
            "potentially_eligible_at_least_3_distinct_dates": int(distinct_date_counts.ge(3).sum()),
            "roster_participants_with_zero_valid_dated_TOTAL13": int(EXPECTED_ROSTER_SIZE - distinct_date_counts.size),
            "rows_minus_distinct_participant_dates": int(len(eligible_rows) - distinct_date_counts.sum()),
        },
        "follow_up_coverage_for_potential_participants": {
            "participants": int(len(spans)),
            "span_days": {
                "minimum": scalar(quantiles.loc[0.0]),
                "p25": scalar(quantiles.loc[0.25]),
                "median": scalar(quantiles.loc[0.5]),
                "p75": scalar(quantiles.loc[0.75]),
                "maximum": scalar(quantiles.loc[1.0]),
            },
            "span_approx_years_dividing_days_by_365_25": {
                "minimum": round(float(quantiles.loc[0.0]) / 365.25, 4),
                "p25": round(float(quantiles.loc[0.25]) / 365.25, 4),
                "median": round(float(quantiles.loc[0.5]) / 365.25, 4),
                "p75": round(float(quantiles.loc[0.75]) / 365.25, 4),
                "maximum": round(float(quantiles.loc[1.0]) / 365.25, 4),
            },
            "very_short_spans": {
                "less_than_6_months_182_625_days": int((spans < 182.625).sum()),
                "less_than_12_months_365_25_days": int((spans < 365.25).sum()),
                "less_than_24_months_730_5_days": int((spans < 730.5).sum()),
            },
        },
        "data_quality_ordering_identifier_audit": {
            "VISCODE_month_order_check": ordering_conflicts(scoped, "VISCODE"),
            "VISCODE2_month_order_check": ordering_conflicts(scoped, "VISCODE2"),
            "same_day_repeated_observations_full_file": duplicate_audit["same_participant_date_TOTAL13_classification"],
            "unparseable_nonblank_VISDATE_rows": int((clean_text(adas["VISDATE"]).ne("") & adas["_VISDATE_PARSED"].isna()).sum()),
            "VISDATE_before_2000": int((adas["_VISDATE_PARSED"] < pd.Timestamp("2000-01-01")).sum()),
            "VISDATE_after_export_filename_date_2026_08_10": int((adas["_VISDATE_PARSED"] > pd.Timestamp("2026-08-10")).sum()),
            "blank_PTID_rows": int(clean_text(adas["PTID"]).eq("").sum()),
            "blank_RID_rows": int(clean_text(adas["RID"]).eq("").sum()),
            "PTID_mapping_to_multiple_RID_count": int(len(inconsistent_ptids)),
            "RID_mapping_to_multiple_PTID_count": int(len(inconsistent_rids)),
            "inconsistent_PTID_examples": [str(value) for value in inconsistent_ptids.index[:5]],
            "inconsistent_RID_examples": [str(value) for value in inconsistent_rids.index[:5]],
            "traceability_assessment": "PTID and RID are suitable only if their observed one-to-one pairing checks pass; see counts above. Longitudinal joins use both fields together.",
        },
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    source_hash_after = file_sha256(ADAS_PATH)
    if source_hash_before != source_hash_after:
        raise AssertionError("Raw ADAS source changed during audit")
    print(json.dumps({
        "output": str(OUTPUT_PATH),
        "source_sha256_unchanged": True,
        "source_rows": len(adas),
        "source_columns": len(inferred.columns),
        "potentially_eligible_at_least_3_distinct_dates": int(distinct_date_counts.ge(3).sum()),
    }, indent=2))


if __name__ == "__main__":
    main()
