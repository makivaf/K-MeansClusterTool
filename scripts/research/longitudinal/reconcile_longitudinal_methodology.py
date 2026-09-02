"""Reconcile longitudinal phase and record ambiguities without modeling.

The output is summary-only. No slopes, participant-level analytical cohort,
imputation, date reconstruction, dimension reduction, or clustering is created.
"""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd


ROOT = Path(__file__).resolve().parents[3]
ADAS_PATH = ROOT / "data" / "raw" / "adni" / "All_Subjects_ADAS_10Aug2026.csv"
ROSTER_PATH = ROOT / "data" / "interim" / "study_entry_cohort_unimputed.csv"
PRIOR_AUDIT_PATH = ROOT / "data" / "interim" / "longitudinal_records_audit.json"
OUTPUT_PATH = ROOT / "data" / "interim" / "longitudinal_methodology_reconciliation.json"

LOCKED_PHASES = ("ADNI1", "ADNIGO", "ADNI2", "ADNI3")
EXPECTED_COUNTS = {"ADNI1": 819, "ADNIGO": 130, "ADNI2": 789, "ADNI3": 699}
CONFLICT_KEYS = (("082_S_0304", "2007-02-15"), ("128_S_1430", "2009-10-01"))
EXPECTED_VISCODE_ANOMALIES = {"094_S_1267", "027_S_0074"}
EXPECTED_VISCODE2_ANOMALIES = {"094_S_1267", "027_S_0074", "082_S_4224"}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def text(series: pd.Series) -> pd.Series:
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


def rows(frame: pd.DataFrame, columns: list[str]) -> list[dict[str, Any]]:
    return [
        {key: scalar(value) for key, value in record.items()}
        for record in frame.loc[:, columns].to_dict(orient="records")
    ]


def frequency(counts: pd.Series, roster_index: pd.Index) -> dict[str, int]:
    complete = counts.reindex(roster_index, fill_value=0)
    return {str(int(key)): int(value) for key, value in complete.value_counts().sort_index().items()}


def spans_by_participant(frame: pd.DataFrame, eligible_ids: pd.Index) -> pd.Series:
    selected = frame.loc[frame["PTID"].isin(eligible_ids)]
    return selected.groupby("PTID")["_DATE"].agg(lambda x: int((x.max() - x.min()).days))


def span_summary(spans: pd.Series) -> dict[str, Any]:
    q = spans.quantile([0, 0.25, 0.5, 0.75, 1], interpolation="linear")
    labels = {0.0: "minimum", 0.25: "q1", 0.5: "median", 0.75: "q3", 1.0: "maximum"}
    return {
        "participants": int(len(spans)),
        "days": {labels[key]: scalar(q.loc[key]) for key in labels},
        "approx_years_days_divided_by_365_25": {
            labels[key]: round(float(q.loc[key]) / 365.25, 4) for key in labels
        },
        "under_12_months_365_25_days": int((spans < 365.25).sum()),
        "under_24_months_730_5_days": int((spans < 730.5).sum()),
    }


def scenario_summary(frame: pd.DataFrame, roster_index: pd.Index) -> tuple[dict[str, Any], pd.Series, pd.Series]:
    counts = frame.groupby("PTID")["_DATE"].nunique()
    eligible = counts.loc[counts.ge(3)].index
    spans = spans_by_participant(frame, eligible)
    return (
        {
            "valid_dated_TOTAL13_rows": int(len(frame)),
            "participants_with_at_least_1": int(len(counts)),
            "distinct_date_count_distribution_including_zero": frequency(counts, roster_index),
            "potentially_eligible_at_least_3_distinct_dates": int(len(eligible)),
            "follow_up_span_for_potential_participants": span_summary(spans),
        },
        counts,
        spans,
    )


def month_number(value: str) -> int | None:
    match = re.fullmatch(r"m(\d+)", value.strip().lower())
    return int(match.group(1)) if match else None


def find_order_anomalies(frame: pd.DataFrame, field: str) -> tuple[set[str], dict[str, Any]]:
    work = frame.copy()
    work["_MONTH"] = text(work[field]).map(month_number)
    work = work.loc[work["_DATE"].notna() & work["_MONTH"].notna()].copy()
    affected: set[str] = set()
    explanations: dict[str, Any] = {}
    sequence_columns = ["_SOURCE_ROW", "PTID", "RID", "PHASE", "VISCODE", "VISCODE2", "VISDATE", "TOTAL13"]
    for ptid, participant in work.groupby("PTID", sort=False):
        by_month = participant.sort_values(["_MONTH", "_DATE"], kind="stable")
        month_dates = by_month.groupby("_MONTH")["_DATE"].agg(["min", "max"]).sort_index()
        contradictions: list[dict[str, Any]] = []
        prior_month: int | None = None
        prior_latest: pd.Timestamp | None = None
        for month, summary in month_dates.iterrows():
            if prior_latest is not None and summary["min"] < prior_latest:
                contradictions.append({
                    "earlier_month_code": f"m{prior_month:02d}" if prior_month is not None else None,
                    "earlier_month_latest_date": scalar(prior_latest),
                    "later_month_code": f"m{int(month):02d}",
                    "later_month_earliest_date": scalar(summary["min"]),
                })
            if prior_latest is None or summary["max"] > prior_latest:
                prior_latest = summary["max"]
                prior_month = int(month)
        if contradictions:
            affected.add(str(ptid))
            chronological = frame.loc[frame["PTID"].eq(ptid) & frame["_DATE"].notna()].sort_values(
                ["_DATE", "_SOURCE_ROW"], kind="stable"
            )
            explanations[str(ptid)] = {
                "contradictions": contradictions,
                "chronological_sequence": rows(chronological, sequence_columns),
            }
    return affected, explanations


def component_difference_report(pair: pd.DataFrame) -> dict[str, Any]:
    component_columns = [
        column for column in pair.columns
        if column == "WORDLIST" or re.fullmatch(r"Q\d+.*", column)
    ]
    differing = [column for column in component_columns if pair.iloc[0][column] != pair.iloc[1][column]]
    score_columns = [column for column in differing if "SCORE" in column]
    item_columns = [column for column in differing if column not in score_columns]
    return {
        "component_fields_compared": len(component_columns),
        "differing_component_fields": len(differing),
        "differing_score_fields": {
            column: [pair.iloc[0][column], pair.iloc[1][column]] for column in score_columns
        },
        "differing_item_or_task_fields": {
            column: [pair.iloc[0][column], pair.iloc[1][column]] for column in item_columns
        },
    }


def main() -> None:
    for path in (ADAS_PATH, ROSTER_PATH, PRIOR_AUDIT_PATH):
        if not path.is_file():
            raise FileNotFoundError(path)
    before_hashes = {str(path): sha256(path) for path in (ADAS_PATH, ROSTER_PATH)}

    adas = pd.read_csv(ADAS_PATH, dtype=str, keep_default_na=False, na_filter=False, encoding="utf-8-sig")
    adas["_SOURCE_ROW"] = np.arange(2, len(adas) + 2)
    adas["_DATE"] = pd.to_datetime(text(adas["VISDATE"]), errors="coerce", format="mixed")
    adas["_TOTAL13"] = pd.to_numeric(text(adas["TOTAL13"]).replace("", np.nan), errors="coerce")
    roster_all = pd.read_csv(ROSTER_PATH, dtype=str, keep_default_na=False, na_filter=False, encoding="utf-8-sig")
    roster = roster_all.loc[roster_all["ENTRY_PHASE"].isin(LOCKED_PHASES), ["PTID", "RID", "ENTRY_PHASE"]].copy()
    counts = roster["ENTRY_PHASE"].value_counts().to_dict()
    if len(roster) != 2437 or counts != EXPECTED_COUNTS:
        raise AssertionError(f"Locked roster mismatch: {len(roster)}, {counts}")
    if roster[["PTID", "RID"]].duplicated().any():
        raise AssertionError("Locked roster has duplicate PTID+RID")

    matched = adas.merge(roster, on=["PTID", "RID"], how="inner", validate="many_to_one")
    usable = matched.loc[matched["_DATE"].notna() & matched["_TOTAL13"].notna()].copy()
    scenario_a_rows = usable.loc[usable["PHASE"].isin(LOCKED_PHASES)].copy()
    scenario_b_rows = usable.loc[usable["PHASE"].isin((*LOCKED_PHASES, "ADNI4"))].copy()
    team_rows = usable.loc[usable["PHASE"].eq("TEAM")].copy()
    adni4_added = scenario_b_rows.loc[scenario_b_rows["PHASE"].eq("ADNI4")].copy()

    roster_index = pd.Index(roster["PTID"], name="PTID")
    summary_a, count_a, span_a = scenario_summary(scenario_a_rows, roster_index)
    summary_b, count_b, span_b = scenario_summary(scenario_b_rows, roster_index)
    complete_a = count_a.reindex(roster_index, fill_value=0)
    complete_b = count_b.reindex(roster_index, fill_value=0)
    date_gain = complete_b - complete_a
    newly_eligible = (complete_a < 3) & (complete_b >= 3)
    common_eligible = complete_a.index[(complete_a >= 3) & (complete_b >= 3)]
    common_span_comparison = pd.DataFrame({
        "A": span_a.reindex(common_eligible),
        "B": span_b.reindex(common_eligible),
    })
    all_spans_a = scenario_a_rows.groupby("PTID")["_DATE"].agg(lambda x: int((x.max() - x.min()).days))
    all_spans_b = scenario_b_rows.groupby("PTID")["_DATE"].agg(lambda x: int((x.max() - x.min()).days))
    scenario_b_eligible = complete_b.index[complete_b >= 3]
    b_eligible_span_comparison = pd.DataFrame({
        "A": all_spans_a.reindex(scenario_b_eligible),
        "B": all_spans_b.reindex(scenario_b_eligible),
    })

    conflict_columns = [
        "_SOURCE_ROW", "PHASE", "PTID", "RID", "VISCODE", "VISCODE2", "VISDATE",
        "TOTAL13", "TOTSCORE", "ID", "SITEID", "SOURCE", "DONE", "NDREASON",
        "USERDATE", "USERDATE2", "DD_CRF_VERSION_LABEL", "LANGUAGE_CODE",
        "HAS_QC_ERROR", "UPDATE_STAMP",
    ]
    conflict_report: dict[str, Any] = {}
    for ptid, date in CONFLICT_KEYS:
        pair = adas.loc[adas["PTID"].eq(ptid) & adas["VISDATE"].eq(date)].sort_values("_SOURCE_ROW")
        if len(pair) != 2:
            raise AssertionError(f"Expected exactly two conflict rows for {ptid} {date}, found {len(pair)}")
        conflict_report[f"{ptid}_{date}"] = {
            "rows": rows(pair, conflict_columns),
            "component_comparison": component_difference_report(pair),
            "supersession_evidence": {
                "distinct_record_IDs": bool(pair["ID"].nunique() == 2),
                "same_USERDATE": bool(pair["USERDATE"].nunique() == 1),
                "same_UPDATE_STAMP": bool(pair["UPDATE_STAMP"].nunique() == 1),
                "USERDATE2_blank_both": bool(text(pair["USERDATE2"]).eq("").all()),
                "HAS_QC_ERROR_blank_both": bool(text(pair["HAS_QC_ERROR"]).eq("").all()),
                "conclusion": "No field in the export marks either row as superseded or corrected; distinct IDs and differing components indicate distinct records, not exact duplicates.",
            },
        }

    viscode_affected, viscode_details = find_order_anomalies(matched, "VISCODE")
    viscode2_affected, viscode2_details = find_order_anomalies(matched, "VISCODE2")
    if viscode_affected != EXPECTED_VISCODE_ANOMALIES:
        raise AssertionError(f"Unexpected VISCODE anomaly set: {viscode_affected}")
    if viscode2_affected != EXPECTED_VISCODE2_ANOMALIES:
        raise AssertionError(f"Unexpected VISCODE2 anomaly set: {viscode2_affected}")

    undated = matched.loc[matched["_TOTAL13"].notna() & matched["_DATE"].isna()].copy()
    undated_columns = [
        "_SOURCE_ROW", "PHASE", "ENTRY_PHASE", "PTID", "RID", "VISCODE", "VISCODE2",
        "VISDATE", "TOTAL13", "TOTSCORE", "ID", "USERDATE", "USERDATE2", "UPDATE_STAMP",
    ]
    undated_report: list[dict[str, Any]] = []
    for _, record in undated.iterrows():
        same_viscode = matched.loc[
            matched["PTID"].eq(record["PTID"])
            & matched["VISCODE"].eq(record["VISCODE"])
            & matched["_DATE"].notna()
        ]
        same_viscode2 = matched.loc[
            matched["PTID"].eq(record["PTID"])
            & matched["VISCODE2"].eq(record["VISCODE2"])
            & matched["_DATE"].notna()
        ]
        undated_report.append({
            "undated_record": rows(record.to_frame().T, undated_columns)[0],
            "dated_same_VISCODE": rows(same_viscode, undated_columns),
            "dated_same_VISCODE2": rows(same_viscode2, undated_columns),
            "interpretation": "Potential nominal-visit counterpart(s) are reported only; no date is inferred or transferred.",
        })

    report = {
        "status": "AUDIT_METHODOLOGY_RECONCILIATION_ONLY",
        "files_inspected": {
            "ADAS": {"path": str(ADAS_PATH), "sha256": before_hashes[str(ADAS_PATH)]},
            "locked_roster": {"path": str(ROSTER_PATH), "sha256": before_hashes[str(ROSTER_PATH)]},
            "prior_audit": {"path": str(PRIOR_AUDIT_PATH), "sha256": sha256(PRIOR_AUDIT_PATH)},
        },
        "scenario_definitions": {
            "A": "Locked 2,437-person entry roster; usable ADAS rows only from ADNI1/ADNIGO/ADNI2/ADNI3.",
            "B": "Same locked roster; usable ADAS rows from ADNI1/ADNIGO/ADNI2/ADNI3 plus later ADNI4.",
            "usable_observation": "Numeric TOTAL13 plus valid VISDATE; distinct dates define observation counts.",
            "TEAM": "Excluded from both scenarios and reported separately.",
        },
        "scenario_A": summary_a,
        "scenario_B": summary_b,
        "scenario_B_effect": {
            "additional_usable_rows": int(len(scenario_b_rows) - len(scenario_a_rows)),
            "additional_rows_phase_distribution": {
                str(key): int(value) for key, value in adni4_added["PHASE"].value_counts().sort_index().items()
            },
            "participants_receiving_at_least_one_additional_usable_row": int(adni4_added["PTID"].nunique()),
            "participants_gaining_at_least_one_distinct_date": int(date_gain.gt(0).sum()),
            "participants_changing_from_under_3_to_at_least_3_dates": int(newly_eligible.sum()),
            "potentially_eligible_count_change": int((complete_b >= 3).sum() - (complete_a >= 3).sum()),
            "scenario_A_potential_participants_with_longer_span_in_B": int((common_span_comparison["B"] > common_span_comparison["A"]).sum()),
            "common_potential_participants_compared": int(len(common_span_comparison)),
            "scenario_B_potential_participants_with_longer_span_than_their_scenario_A_span": int(
                (b_eligible_span_comparison["B"] > b_eligible_span_comparison["A"]).sum()
            ),
            "scenario_B_potential_participants_without_any_scenario_A_span": int(
                b_eligible_span_comparison["A"].isna().sum()
            ),
            "all_matched_ADNI4_rows_before_usability_filter": int(matched["PHASE"].eq("ADNI4").sum()),
            "matched_ADNI4_rows_excluded_for_missing_TOTAL13_or_VISDATE": int(
                matched["PHASE"].eq("ADNI4").sum() - len(adni4_added)
            ),
            "all_ADAS_TEAM_rows": int(adas["PHASE"].eq("TEAM").sum()),
            "all_matched_TEAM_rows_before_usability_filter": int(matched["PHASE"].eq("TEAM").sum()),
            "TEAM_usable_rows_for_locked_roster_reported_not_included": int(len(team_rows)),
            "TEAM_locked_roster_participants_with_usable_rows": int(team_rows["PTID"].nunique()),
        },
        "same_day_conflicts": conflict_report,
        "visit_code_date_anomalies": {
            "scope_note": "Ordering checks use only explicit mNN codes and actual VISDATE; non-month codes are not assigned an order.",
            "VISCODE": viscode_details,
            "VISCODE2": viscode2_details,
        },
        "undated_valid_TOTAL13_records": {
            "count": int(len(undated)),
            "records": undated_report,
        },
        "prohibited_outputs_created": [],
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    after_hashes = {str(path): sha256(path) for path in (ADAS_PATH, ROSTER_PATH)}
    if before_hashes != after_hashes:
        raise AssertionError("A source or primary study-entry artifact changed during reconciliation")
    print(json.dumps({
        "output": str(OUTPUT_PATH),
        "source_hashes_unchanged": True,
        "scenario_A_potential": summary_a["potentially_eligible_at_least_3_distinct_dates"],
        "scenario_B_potential": summary_b["potentially_eligible_at_least_3_distinct_dates"],
        "added_usable_ADNI4_rows": len(adni4_added),
    }, indent=2))


if __name__ == "__main__":
    main()
