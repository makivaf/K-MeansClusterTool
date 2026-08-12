"""Construct the locked Axis B longitudinal observation cohort without slopes.

The script creates only the validated observation-level time axis authorized for
Axis B. It does not fit regressions, calculate participant slopes, standardize,
reduce dimensions, select k, cluster, or alter raw/Axis A artifacts.
"""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd


ROOT = Path(__file__).resolve().parents[2]
RAW_ADAS = ROOT / "data" / "raw" / "adni" / "All_Subjects_ADAS_10Aug2026.csv"
ROSTER = ROOT / "data" / "interim" / "axis_a_study_entry_unimputed.csv"
PRIOR_AUDIT = ROOT / "data" / "interim" / "axis_b_adas_longitudinal_audit.json"
PRIOR_RECONCILIATION = ROOT / "data" / "interim" / "axis_b_longitudinal_methodology_reconciliation.json"
OUTPUT_COHORT = ROOT / "data" / "interim" / "axis_b_longitudinal_cohort.csv"
OUTPUT_VALIDATION = ROOT / "data" / "interim" / "axis_b_longitudinal_cohort_validation.json"

LOCKED_ENTRY_PHASES = ("ADNI1", "ADNIGO", "ADNI2", "ADNI3")
ALLOWED_RECORD_PHASES = (*LOCKED_ENTRY_PHASES, "ADNI4")
EXPECTED_ROSTER_PHASE_COUNTS = {"ADNI1": 819, "ADNIGO": 130, "ADNI2": 789, "ADNI3": 699}
CONFLICT_KEYS = {("082_S_0304", "2007-02-15"), ("128_S_1430", "2009-10-01")}
EXPECTED_ANOMALY_PARTICIPANTS = {"027_S_0074", "082_S_4224", "094_S_1267"}


def file_hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def hash_manifest(paths: list[Path]) -> dict[str, str]:
    return {str(path.relative_to(ROOT)): file_hash(path) for path in paths}


def clean_text(series: pd.Series) -> pd.Series:
    return series.fillna("").astype(str).str.strip()


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


def month_number(value: str) -> int | None:
    match = re.fullmatch(r"m(\d+)", value.strip().lower())
    return int(match.group(1)) if match else None


def anomaly_source_rows(frame: pd.DataFrame) -> tuple[set[int], set[str], dict[str, list[str]]]:
    """Return rows participating in explicit mNN/date order contradictions."""
    source_rows: set[int] = set()
    participants: set[str] = set()
    fields_by_participant: dict[str, set[str]] = {}
    for field in ("VISCODE", "VISCODE2"):
        work = frame.loc[frame["_VISDATE_PARSED"].notna()].copy()
        work["_MONTH_NUMBER"] = clean_text(work[field]).map(month_number)
        work = work.loc[work["_MONTH_NUMBER"].notna()]
        for ptid, group in work.groupby("PTID", sort=False):
            values = list(group[["_SOURCE_ROW", "_MONTH_NUMBER", "_VISDATE_PARSED"]].itertuples(index=False, name=None))
            participant_rows: set[int] = set()
            for left_index, (left_row, left_month, left_date) in enumerate(values):
                for right_row, right_month, right_date in values[left_index + 1 :]:
                    if (left_month < right_month and left_date > right_date) or (
                        right_month < left_month and right_date > left_date
                    ):
                        participant_rows.update((int(left_row), int(right_row)))
            if participant_rows:
                source_rows.update(participant_rows)
                participants.add(str(ptid))
                fields_by_participant.setdefault(str(ptid), set()).add(field)
    return source_rows, participants, {
        ptid: sorted(fields) for ptid, fields in sorted(fields_by_participant.items())
    }


def count_distribution(counts: pd.Series) -> dict[str, int]:
    return {str(int(key)): int(value) for key, value in counts.value_counts().sort_index().items()}


def span_summary(spans: pd.Series) -> dict[str, Any]:
    quantiles = spans.quantile([0, 0.25, 0.5, 0.75, 1], interpolation="linear")
    labels = {0.0: "minimum", 0.25: "q1", 0.5: "median", 0.75: "q3", 1.0: "maximum"}
    return {
        "days": {labels[key]: scalar(quantiles.loc[key]) for key in labels},
        "years_days_divided_by_365_25": {
            labels[key]: round(float(quantiles.loc[key]) / 365.25, 6) for key in labels
        },
    }


def main() -> None:
    required_inputs = (RAW_ADAS, ROSTER, PRIOR_AUDIT, PRIOR_RECONCILIATION)
    for path in required_inputs:
        if not path.is_file():
            raise FileNotFoundError(path)

    raw_hash_before = file_hash(RAW_ADAS)
    axis_a_files = sorted((ROOT / "data" / "interim").glob("axis_a_*"))
    axis_a_manifest_before = hash_manifest(axis_a_files)
    input_hashes = {str(path.relative_to(ROOT)): file_hash(path) for path in required_inputs}

    prior_reconciliation = json.loads(PRIOR_RECONCILIATION.read_text(encoding="utf-8"))
    prior_anomaly_participants = set(prior_reconciliation["visit_code_date_anomalies"]["VISCODE"])
    prior_anomaly_participants.update(prior_reconciliation["visit_code_date_anomalies"]["VISCODE2"])
    if prior_anomaly_participants != EXPECTED_ANOMALY_PARTICIPANTS:
        raise AssertionError(f"Prior anomaly provenance mismatch: {prior_anomaly_participants}")

    adas = pd.read_csv(
        RAW_ADAS,
        dtype=str,
        keep_default_na=False,
        na_filter=False,
        encoding="utf-8-sig",
        low_memory=False,
    )
    adas["_SOURCE_ROW"] = np.arange(2, len(adas) + 2)
    adas["_TOTAL13_NUMERIC"] = pd.to_numeric(
        clean_text(adas["TOTAL13"]).replace("", np.nan), errors="coerce"
    )
    adas["_VISDATE_PARSED"] = pd.to_datetime(
        clean_text(adas["VISDATE"]), errors="coerce", format="mixed"
    )

    roster_all = pd.read_csv(
        ROSTER,
        dtype=str,
        keep_default_na=False,
        na_filter=False,
        encoding="utf-8-sig",
        low_memory=False,
    )
    roster = roster_all.loc[
        roster_all["ENTRY_PHASE"].isin(LOCKED_ENTRY_PHASES),
        ["PTID", "RID", "ENTRY_PHASE"],
    ].copy()
    phase_counts = roster["ENTRY_PHASE"].value_counts().to_dict()
    if len(roster) != 2437 or phase_counts != EXPECTED_ROSTER_PHASE_COUNTS:
        raise AssertionError(f"Locked roster mismatch: rows={len(roster)}, phases={phase_counts}")
    if roster["PTID"].duplicated().any() or roster["RID"].duplicated().any():
        raise AssertionError("Locked roster PTID/RID is not one-to-one")

    matched = adas.merge(roster, on=["PTID", "RID"], how="inner", validate="many_to_one")
    matched_rows = len(matched)
    disallowed_phase = ~matched["PHASE"].isin(ALLOWED_RECORD_PHASES)
    disallowed_phase_rows = matched.loc[disallowed_phase].copy()
    allowed = matched.loc[~disallowed_phase].copy()

    invalid_total = allowed["_TOTAL13_NUMERIC"].isna()
    after_total = allowed.loc[~invalid_total].copy()
    invalid_date_after_valid_total = after_total["_VISDATE_PARSED"].isna()
    dated = after_total.loc[~invalid_date_after_valid_total].copy()

    dated["_DATE_TEXT"] = dated["_VISDATE_PARSED"].dt.strftime("%Y-%m-%d")
    conflict_mask = pd.Series(
        [(ptid, date) in CONFLICT_KEYS for ptid, date in zip(dated["PTID"], dated["_DATE_TEXT"])],
        index=dated.index,
    )
    conflict_rows = dated.loc[conflict_mask].copy()
    if len(conflict_rows) != 4:
        raise AssertionError(f"Expected four known conflict rows, found {len(conflict_rows)}")
    if set(zip(conflict_rows["PTID"], conflict_rows["_DATE_TEXT"])) != CONFLICT_KEYS:
        raise AssertionError("Known conflict keys did not reconcile")
    usable = dated.loc[~conflict_mask].copy()

    unexpected_duplicates = usable.loc[
        usable.duplicated(["PTID", "_DATE_TEXT"], keep=False)
    ].sort_values(["PTID", "_DATE_TEXT", "_SOURCE_ROW"])
    if len(unexpected_duplicates):
        examples = unexpected_duplicates[
            ["_SOURCE_ROW", "PHASE", "PTID", "RID", "VISCODE", "VISCODE2", "VISDATE", "TOTAL13"]
        ].head(20).to_dict(orient="records")
        raise RuntimeError(
            "STOP: unexpected duplicate participant/date records remain after known conflicts: "
            + json.dumps(examples)
        )

    anomaly_rows, anomaly_participants, anomaly_fields = anomaly_source_rows(allowed)
    if anomaly_participants != EXPECTED_ANOMALY_PARTICIPANTS:
        raise AssertionError(f"Current anomaly set differs from locked provenance: {anomaly_participants}")

    usable_counts = usable.groupby("PTID")["_DATE_TEXT"].nunique()
    eligible_ids = usable_counts.loc[usable_counts.ge(3)].index
    retained = usable.loc[usable["PTID"].isin(eligible_ids)].copy()
    if retained.empty:
        raise AssertionError("Final retained observation table is empty")

    retained = retained.sort_values(["PTID", "_VISDATE_PARSED", "_SOURCE_ROW"], kind="stable")
    retained["observation_number"] = retained.groupby("PTID").cumcount() + 1
    first_dates = retained.groupby("PTID")["_VISDATE_PARSED"].transform("min")
    retained["elapsed_days"] = (retained["_VISDATE_PARSED"] - first_dates).dt.days.astype(int)
    retained["elapsed_years"] = (retained["elapsed_days"] / 365.25).round(10)
    retained["visit_code_date_anomaly_flag"] = retained["_SOURCE_ROW"].isin(anomaly_rows).astype(int)
    retained["participant_has_visit_code_date_anomaly_flag"] = retained["PTID"].isin(
        anomaly_participants
    ).astype(int)
    retained["later_adni4_followup_flag"] = retained["PHASE"].eq("ADNI4").astype(int)
    retained["VISDATE"] = retained["_DATE_TEXT"]
    # Preserve the exact validated numeric token from the raw CSV rather than
    # round-tripping long decimal strings through binary floating point.
    retained["TOTAL13"] = clean_text(retained["TOTAL13"])

    cohort = retained.rename(
        columns={
            "ENTRY_PHASE": "study_entry_phase",
            "PHASE": "record_phase",
        }
    )[
        [
            "PTID",
            "RID",
            "study_entry_phase",
            "record_phase",
            "VISCODE",
            "VISCODE2",
            "VISDATE",
            "TOTAL13",
            "observation_number",
            "elapsed_days",
            "elapsed_years",
            "visit_code_date_anomaly_flag",
            "participant_has_visit_code_date_anomaly_flag",
            "later_adni4_followup_flag",
        ]
    ].copy()

    # Validation is performed before any artifact is written.
    participant_counts = cohort.groupby("PTID").size()
    first_elapsed = cohort.loc[cohort["observation_number"].eq(1), ["elapsed_days", "elapsed_years"]]
    negative_elapsed = int((cohort["elapsed_days"] < 0).sum() + (cohort["elapsed_years"] < 0).sum())
    monotonic_violations = 0
    observation_number_violations = 0
    for _, group in cohort.groupby("PTID", sort=False):
        dates = pd.to_datetime(group["VISDATE"], format="%Y-%m-%d")
        if not dates.is_monotonic_increasing:
            monotonic_violations += 1
        if group["observation_number"].tolist() != list(range(1, len(group) + 1)):
            observation_number_violations += 1
    duplicate_final_dates = int(cohort.duplicated(["PTID", "VISDATE"], keep=False).sum())
    ptid_rid_pairs = cohort[["PTID", "RID"]].drop_duplicates()
    ptid_multiple_rid = int(ptid_rid_pairs.groupby("PTID")["RID"].nunique().gt(1).sum())
    rid_multiple_ptid = int(ptid_rid_pairs.groupby("RID")["PTID"].nunique().gt(1).sum())
    if (
        not first_elapsed["elapsed_days"].eq(0).all()
        or not first_elapsed["elapsed_years"].eq(0).all()
        or negative_elapsed
        or monotonic_violations
        or observation_number_violations
        or duplicate_final_dates
        or ptid_multiple_rid
        or rid_multiple_ptid
    ):
        raise AssertionError("Final elapsed-time, uniqueness, ordering, or identifier validation failed")
    if not cohort["study_entry_phase"].isin(LOCKED_ENTRY_PHASES).all():
        raise AssertionError("A non-locked study-entry phase entered the cohort")
    if not cohort["record_phase"].isin(ALLOWED_RECORD_PHASES).all():
        raise AssertionError("A disallowed record phase entered the cohort")
    if cohort["record_phase"].eq("TEAM").any():
        raise AssertionError("TEAM entered the cohort")

    spans = retained.groupby("PTID")["_VISDATE_PARSED"].agg(lambda x: int((x.max() - x.min()).days))
    in_scope_usable = usable.loc[usable["PHASE"].isin(LOCKED_ENTRY_PHASES)]
    in_scope_counts = in_scope_usable.groupby("PTID")["_DATE_TEXT"].nunique()
    eligibility_depends_on_adni4 = set(eligible_ids).difference(in_scope_counts.loc[in_scope_counts.ge(3)].index)

    conflict_participant_results: dict[str, Any] = {}
    for ptid, date in sorted(CONFLICT_KEYS):
        remaining = usable.loc[usable["PTID"].eq(ptid)]
        remaining_dates = int(remaining["_DATE_TEXT"].nunique())
        conflict_participant_results[ptid] = {
            "excluded_conflict_date": date,
            "raw_conflicting_rows_removed": int(conflict_rows["PTID"].eq(ptid).sum()),
            "remaining_distinct_usable_dates": remaining_dates,
            "remains_eligible": bool(remaining_dates >= 3),
            "retained_observations_if_eligible": int(len(remaining)) if remaining_dates >= 3 else 0,
        }

    OUTPUT_COHORT.parent.mkdir(parents=True, exist_ok=True)
    cohort.to_csv(OUTPUT_COHORT, index=False, encoding="utf-8", lineterminator="\n")

    validation = {
        "status": "COHORT_CONSTRUCTION_ONLY_NO_SLOPES",
        "provenance": {
            "files_read": input_hashes,
            "axis_a_artifacts_hash_verified": axis_a_manifest_before,
            "locked_rules": {
                "entry_phases": list(LOCKED_ENTRY_PHASES),
                "record_phases": list(ALLOWED_RECORD_PHASES),
                "measure": "TOTAL13",
                "date": "VISDATE",
                "minimum_distinct_dates": 3,
                "same_day_conflict_action": "exclude all rows at the two locked participant/date keys",
                "minimum_follow_up_exclusion": None,
            },
        },
        "filtering_flow": {
            "locked_roster_participants": int(len(roster)),
            "locked_roster_matched_ADAS_rows": int(matched_rows),
            "disallowed_record_phase_rows_removed": int(disallowed_phase.sum()),
            "disallowed_phase_distribution": {
                str(key): int(value) for key, value in disallowed_phase_rows["PHASE"].value_counts().items()
            },
            "allowed_phase_rows": int(len(allowed)),
            "invalid_or_missing_TOTAL13_rows_removed": int(invalid_total.sum()),
            "rows_after_TOTAL13_filter": int(len(after_total)),
            "invalid_or_missing_VISDATE_rows_removed_after_valid_TOTAL13": int(invalid_date_after_valid_total.sum()),
            "rows_after_VISDATE_filter": int(len(dated)),
            "known_same_day_conflicting_rows_removed": int(len(conflict_rows)),
            "unexpected_duplicate_participant_date_rows": int(len(unexpected_duplicates)),
            "other_removed_rows": 0,
            "final_usable_observations_before_participant_eligibility": int(len(usable)),
            "observations_removed_for_participants_with_under_3_distinct_dates": int(len(usable) - len(cohort)),
            "final_retained_observations": int(len(cohort)),
        },
        "participant_counts": {
            "locked_roster": int(len(roster)),
            "with_at_least_1_usable_observation": int(len(usable_counts)),
            "with_0_usable_dates": int(len(roster) - len(usable_counts)),
            "with_exactly_1_distinct_date": int(usable_counts.eq(1).sum()),
            "with_exactly_2_distinct_dates": int(usable_counts.eq(2).sum()),
            "with_at_least_3_distinct_dates": int(usable_counts.ge(3).sum()),
            "final_axis_b_longitudinal_participants": int(cohort["PTID"].nunique()),
        },
        "conflict_participant_results": conflict_participant_results,
        "final_observation_count_distribution_eligible_participants": count_distribution(participant_counts),
        "final_follow_up_span": span_summary(spans),
        "ADNI4_contribution": {
            "final_eligible_participants_with_at_least_1_ADNI4_observation": int(
                cohort.loc[cohort["record_phase"].eq("ADNI4"), "PTID"].nunique()
            ),
            "retained_ADNI4_observations": int(cohort["record_phase"].eq("ADNI4").sum()),
            "participants_whose_eligibility_depends_on_ADNI4": int(len(eligibility_depends_on_adni4)),
        },
        "elapsed_time_validation": {
            "participants_checked": int(cohort["PTID"].nunique()),
            "first_observation_nonzero_elapsed_days": int((~first_elapsed["elapsed_days"].eq(0)).sum()),
            "first_observation_nonzero_elapsed_years": int((~first_elapsed["elapsed_years"].eq(0)).sum()),
            "negative_elapsed_value_violations": negative_elapsed,
            "participants_with_nonmonotonic_VISDATE": monotonic_violations,
            "participants_with_observation_number_sequence_violation": observation_number_violations,
            "duplicate_participant_VISDATE_rows": duplicate_final_dates,
        },
        "QC": {
            "visit_code_date_anomaly_participants_in_final_cohort": int(
                cohort.loc[cohort["participant_has_visit_code_date_anomaly_flag"].eq(1), "PTID"].nunique()
            ),
            "visit_code_date_anomaly_records_flagged_in_final_cohort": int(
                cohort["visit_code_date_anomaly_flag"].sum()
            ),
            "anomaly_fields_by_participant": anomaly_fields,
            "later_ADNI4_rows_flagged": int(cohort["later_adni4_followup_flag"].sum()),
        },
        "integrity": {
            "PTID_mapping_to_multiple_RID": ptid_multiple_rid,
            "RID_mapping_to_multiple_PTID": rid_multiple_ptid,
            "non_locked_study_entry_phase_rows": int(
                (~cohort["study_entry_phase"].isin(LOCKED_ENTRY_PHASES)).sum()
            ),
            "TEAM_rows": int(cohort["record_phase"].eq("TEAM").sum()),
            "raw_ADAS_sha256_unchanged": True,
            "axis_a_artifact_manifest_unchanged": True,
        },
        "outputs": {
            "cohort_path": str(OUTPUT_COHORT),
            "cohort_sha256": file_hash(OUTPUT_COHORT),
            "cohort_rows": int(len(cohort)),
            "cohort_columns": int(len(cohort.columns)),
            "validation_path": str(OUTPUT_VALIDATION),
        },
        "prohibited_outputs_created": [],
    }

    raw_hash_after = file_hash(RAW_ADAS)
    axis_a_manifest_after = hash_manifest(axis_a_files)
    if raw_hash_before != raw_hash_after:
        raise AssertionError("Raw ADAS changed during cohort construction")
    if axis_a_manifest_before != axis_a_manifest_after:
        raise AssertionError("An Axis A artifact changed during cohort construction")
    OUTPUT_VALIDATION.write_text(json.dumps(validation, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(json.dumps({
        "cohort": str(OUTPUT_COHORT),
        "validation": str(OUTPUT_VALIDATION),
        "participants": int(cohort["PTID"].nunique()),
        "observations": int(len(cohort)),
        "source_and_axis_a_hashes_unchanged": True,
        "slopes_calculated": False,
    }, indent=2))


if __name__ == "__main__":
    main()
