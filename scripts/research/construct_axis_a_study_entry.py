"""Construct the unimputed, participant-level ADNI Axis A study-entry table.

This script reads only the seven approved ADNI CSV exports plus the previously
generated visit-semantics and missing-code-policy audits. It does not inspect
ADNIMERGE2, impute values, cap scores, merge longitudinal visits, or run any
dimension-reduction or clustering procedure.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from pathlib import Path

import numpy as np
import pandas as pd


ROOT = Path(__file__).resolve().parents[2]
RAW_DIR = ROOT / "data" / "raw" / "adni"
INTERIM_DIR = ROOT / "data" / "interim"

FILES = {
    "ADAS": "All_Subjects_ADAS_10Aug2026.csv",
    "CDR": "All_Subjects_CDR_10Aug2026.csv",
    "FAQ": "All_Subjects_FAQ_10Aug2026.csv",
    "MMSE": "All_Subjects_MMSE_10Aug2026.csv",
    "NEUROBAT": "All_Subjects_NEUROBAT_10Aug2026.csv",
    "NPIQ": "All_Subjects_NPIQ_10Aug2026.csv",
    "GDSCALE": "All_Subjects_GDSCALE_10Aug2026.csv",
}

BASELINE_CLASSES = {"literal_or_translated_baseline", "phase_specific_baseline"}
SCREENING_CLASSES = {"screening"}
ENROLLMENT_EVIDENCE_CLASSES = BASELINE_CLASSES
SCREENING_EVIDENCE_CLASSES = {"screening", "screen_failure"}

PHASE_ORDER = {
    "ADNI1": 1,
    "ADNIGO": 2,
    "ADNI2": 3,
    "ADNI3": 4,
    "ADNI4": 5,
    "TEAM": 6,
}

PHASE_LABELS = {
    "ADNI1": "ADNI1",
    "ADNIGO": "ADNI-GO",
    "ADNI2": "ADNI2",
    "ADNI3": "ADNI3",
    "ADNI4": "ADNI4",
    "TEAM": "TEAM",
}


@dataclass(frozen=True)
class VariableSpec:
    output: str
    file_key: str
    fields: tuple[str, ...]
    visit_kind: str
    mode: str = "direct"
    documented_phases: tuple[str, ...] = ("ADNI1", "ADNIGO", "ADNI2", "ADNI3", "ADNI4")


VARIABLES = (
    VariableSpec("MMSE", "MMSE", ("MMSCORE",), "screening"),
    VariableSpec("ADAS13", "ADAS", ("TOTAL13",), "baseline"),
    VariableSpec("LMI", "NEUROBAT", ("LIMMTOTAL",), "screening"),
    VariableSpec("LMD", "NEUROBAT", ("LDELTOTAL",), "screening"),
    VariableSpec("TMT_A", "NEUROBAT", ("TRAASCOR",), "baseline"),
    VariableSpec("TMT_B", "NEUROBAT", ("TRABSCOR",), "baseline"),
    VariableSpec("CATEGORY_FLUENCY_ANIMALS", "NEUROBAT", ("CATANIMSC",), "baseline"),
    VariableSpec("BNT", "NEUROBAT", ("BNTTOTAL",), "baseline", documented_phases=("ADNI1", "ADNIGO", "ADNI2")),
    VariableSpec("RAVLT_IMMEDIATE", "NEUROBAT", ("AVTOT1", "AVTOT2", "AVTOT3", "AVTOT4", "AVTOT5"), "baseline", "ravlt_immediate"),
    VariableSpec("RAVLT_DELAYED", "NEUROBAT", ("AVDEL30MIN",), "baseline"),
    VariableSpec("RAVLT_FORGETTING", "NEUROBAT", ("AVTOT5", "AVDEL30MIN"), "baseline", "ravlt_forgetting"),
    VariableSpec("CDRSB", "CDR", ("CDRSB",), "screening"),
    VariableSpec("FAQ", "FAQ", ("FAQTOTAL",), "baseline"),
    VariableSpec("NPIQ", "NPIQ", ("NPISCORE",), "baseline"),
    VariableSpec("GDS", "GDSCALE", ("GDTOTAL",), "screening"),
)

OUTPUT_VARIABLES = [spec.output for spec in VARIABLES]
PROVENANCE_SUFFIXES = (
    "SOURCE_FILE",
    "SOURCE_PHASE",
    "SOURCE_VISCODE",
    "SOURCE_VISCODE2",
    "SOURCE_DATE",
    "SOURCE_VISIT_CLASS",
    "MISSING_REASON",
)

REASON_COLUMNS = {
    "BLANK": "missing_due_to_blank",
    "MINUS1": "missing_due_to_minus1",
    "MINUS4": "missing_due_to_minus4",
    "UNAVAILABLE_PHASE_INSTRUMENT": "missing_due_to_unavailable_phase_instrument",
    "FAILED_DERIVATION": "missing_due_to_failed_derivation",
    "UNRESOLVED_DUPLICATE_QC": "missing_due_to_unresolved_duplicate_qc_issue",
}


def read_raw_frames() -> dict[str, pd.DataFrame]:
    frames: dict[str, pd.DataFrame] = {}
    for file_key, filename in FILES.items():
        path = RAW_DIR / filename
        if not path.is_file():
            raise FileNotFoundError(path)
        frame = pd.read_csv(
            path,
            dtype=str,
            keep_default_na=False,
            na_filter=False,
            encoding="utf-8-sig",
            low_memory=False,
        )
        frame["_SOURCE_ROW_NUMBER"] = np.arange(2, len(frame) + 2)
        frame["_VISDATE_PARSED"] = pd.to_datetime(frame["VISDATE"], errors="coerce")
        frames[file_key] = frame
    return frames


def load_visit_lookup() -> dict[tuple[str, str, str, str], str]:
    path = INTERIM_DIR / "adni_visit_semantics.csv"
    visits = pd.read_csv(path, dtype=str, keep_default_na=False, na_filter=False)
    lookup: dict[tuple[str, str, str, str], str] = {}
    for row in visits.itertuples(index=False):
        key = (row.source_file, row.phase.strip(), row.viscode.strip(), row.viscode2.strip())
        category = row.visit_semantics_category.strip()
        prior = lookup.get(key)
        if prior is not None and prior != category:
            raise ValueError(f"Conflicting visit classifications for {key}: {prior!r} versus {category!r}")
        lookup[key] = category
    return lookup


def attach_visit_classes(
    frames: dict[str, pd.DataFrame], lookup: dict[tuple[str, str, str, str], str]
) -> None:
    for file_key, frame in frames.items():
        filename = FILES[file_key]
        frame["_VISIT_CLASS"] = [
            lookup.get((filename, phase.strip(), viscode.strip(), viscode2.strip()), "other")
            for phase, viscode, viscode2 in zip(frame["PHASE"], frame["VISCODE"], frame["VISCODE2"])
        ]


def load_missing_policy() -> set[tuple[str, str, str]]:
    path = INTERIM_DIR / "adni_missing_code_policy.csv"
    policy = pd.read_csv(path, dtype=str, keep_default_na=False, na_filter=False)
    approved: set[tuple[str, str, str]] = set()
    for row in policy.itertuples(index=False):
        if row.treat_as_missing.strip().upper() == "YES":
            approved.add((row.source_file, row.source_field, row.code.strip()))
    return approved


def parse_decimal(text: str) -> Decimal | None:
    try:
        return Decimal(text.strip())
    except (InvalidOperation, AttributeError):
        return None


def normalize_value(
    raw_value: str,
    source_file: str,
    source_field: str,
    missing_policy: set[tuple[str, str, str]],
) -> tuple[float | None, str]:
    stripped = raw_value.strip()
    if stripped == "":
        return None, "BLANK"
    decimal = parse_decimal(stripped)
    if decimal == Decimal("-1") and (source_file, source_field, "-1") in missing_policy:
        return None, "MINUS1"
    if decimal == Decimal("-4") and (source_file, source_field, "-4") in missing_policy:
        return None, "MINUS4"
    if decimal is None:
        return None, "UNRESOLVED_DUPLICATE_QC"
    return float(decimal), "VALID"


def intended_classes(spec: VariableSpec) -> set[str]:
    return SCREENING_CLASSES if spec.visit_kind == "screening" else BASELINE_CLASSES


def source_sort_key(row: pd.Series) -> tuple[object, ...]:
    date = row.get("_VISDATE_PARSED", pd.NaT)
    missing_date = pd.isna(date)
    date_key = pd.Timestamp.max if missing_date else date
    source_id = row.get("ID", "").strip()
    return (missing_date, date_key, source_id, int(row["_SOURCE_ROW_NUMBER"]))


def provenance(row: pd.Series | None, spec: VariableSpec, missing_reason: str) -> dict[str, object]:
    if row is None:
        source_phase = source_viscode = source_viscode2 = source_date = source_class = ""
    else:
        source_phase = row["PHASE"].strip()
        source_viscode = row["VISCODE"].strip()
        source_viscode2 = row["VISCODE2"].strip()
        source_date = row["VISDATE"].strip()
        source_class = row["_VISIT_CLASS"]
    return {
        f"{spec.output}_SOURCE_FILE": FILES[spec.file_key],
        f"{spec.output}_SOURCE_PHASE": source_phase,
        f"{spec.output}_SOURCE_VISCODE": source_viscode,
        f"{spec.output}_SOURCE_VISCODE2": source_viscode2,
        f"{spec.output}_SOURCE_DATE": source_date,
        f"{spec.output}_SOURCE_VISIT_CLASS": source_class,
        f"{spec.output}_MISSING_REASON": missing_reason,
    }


def duplicate_record(
    rid: str,
    ptid: str,
    spec: VariableSpec,
    entry_phase: str,
    candidates: pd.DataFrame,
    valid_rows: int,
    distinct_valid_values: int,
    resolution: str,
    action: str,
) -> dict[str, object]:
    def joined(column: str) -> str:
        values = sorted({value.strip() for value in candidates[column] if value.strip()})
        return " | ".join(values)

    return {
        "RID": rid,
        "PTID": ptid,
        "source_file": FILES[spec.file_key],
        "candidate_variable": spec.output,
        "entry_phase": entry_phase,
        "intended_visit_kind": spec.visit_kind,
        "candidate_row_count": len(candidates),
        "valid_candidate_row_count": valid_rows,
        "distinct_valid_value_count": distinct_valid_values,
        "observed_viscodes": joined("VISCODE"),
        "observed_viscode2_values": joined("VISCODE2"),
        "observed_visdates": joined("VISDATE"),
        "source_row_numbers": " | ".join(str(value) for value in candidates["_SOURCE_ROW_NUMBER"]),
        "resolution_status": resolution,
        "analytical_value_action": action,
        "notes": "No first-row fallback was used.",
    }


def missing_reason_from_rows(reasons: list[str], spec: VariableSpec, entry_phase: str) -> str:
    if entry_phase not in spec.documented_phases:
        return "UNAVAILABLE_PHASE_INSTRUMENT"
    if "UNRESOLVED_DUPLICATE_QC" in reasons:
        return "UNRESOLVED_DUPLICATE_QC"
    if "MINUS1" in reasons:
        return "MINUS1"
    if "MINUS4" in reasons:
        return "MINUS4"
    return "BLANK"


def resolve_direct(
    rid: str,
    ptid: str,
    spec: VariableSpec,
    entry_phase: str,
    candidates: pd.DataFrame,
    missing_policy: set[tuple[str, str, str]],
) -> tuple[float | None, str, pd.Series | None, dict[str, object] | None]:
    if candidates.empty:
        return None, "UNAVAILABLE_PHASE_INSTRUMENT", None, None

    field = spec.fields[0]
    filename = FILES[spec.file_key]
    normalized = [normalize_value(value, filename, field, missing_policy) for value in candidates[field]]
    valid_positions = [position for position, (value, reason) in enumerate(normalized) if reason == "VALID"]
    valid_values = [normalized[position][0] for position in valid_positions]
    distinct_values = sorted(set(valid_values))
    duplicate = None

    if len(distinct_values) > 1:
        if len(candidates) > 1:
            duplicate = duplicate_record(
                rid, ptid, spec, entry_phase, candidates, len(valid_positions), len(distinct_values),
                "UNRESOLVED_CONFLICTING_VALUES", "SET_MISSING",
            )
        return None, "UNRESOLVED_DUPLICATE_QC", None, duplicate

    if valid_positions:
        valid_candidates = candidates.iloc[valid_positions]
        selected_index = min(valid_candidates.index, key=lambda index: source_sort_key(candidates.loc[index]))
        selected = candidates.loc[selected_index]
        if len(candidates) > 1:
            resolution = "RESOLVED_IDENTICAL_VALID_VALUES" if len(valid_positions) > 1 else "RESOLVED_UNIQUE_VALID_VALUE"
            duplicate = duplicate_record(
                rid, ptid, spec, entry_phase, candidates, len(valid_positions), 1,
                resolution, "USE_VALID_VALUE",
            )
        return distinct_values[0], "", selected, duplicate

    reasons = [reason for _, reason in normalized]
    missing_reason = missing_reason_from_rows(reasons, spec, entry_phase)
    if len(candidates) > 1:
        duplicate = duplicate_record(
            rid, ptid, spec, entry_phase, candidates, 0, 0,
            "NO_VALID_VALUE", f"SET_MISSING_{missing_reason}",
        )
    return None, missing_reason, min((row for _, row in candidates.iterrows()), key=source_sort_key), duplicate


def derive_value(spec: VariableSpec, values: tuple[float, ...]) -> float:
    if spec.mode == "ravlt_immediate":
        return float(sum(values))
    if spec.mode == "ravlt_forgetting":
        return float(values[0] - values[1])
    raise ValueError(f"Unknown derivation mode: {spec.mode}")


def resolve_derived(
    rid: str,
    ptid: str,
    spec: VariableSpec,
    entry_phase: str,
    candidates: pd.DataFrame,
    missing_policy: set[tuple[str, str, str]],
) -> tuple[float | None, str, pd.Series | None, dict[str, object] | None]:
    if candidates.empty:
        return None, "UNAVAILABLE_PHASE_INSTRUMENT", None, None

    filename = FILES[spec.file_key]
    component_rows: list[tuple[tuple[float, ...] | None, list[str]]] = []
    complete_positions: list[int] = []
    for position, (_, row) in enumerate(candidates.iterrows()):
        normalized = [normalize_value(row[field], filename, field, missing_policy) for field in spec.fields]
        reasons = [reason for _, reason in normalized]
        if all(reason == "VALID" for reason in reasons):
            vector = tuple(float(value) for value, _ in normalized if value is not None)
            component_rows.append((vector, reasons))
            complete_positions.append(position)
        else:
            component_rows.append((None, reasons))

    complete_vectors = [component_rows[position][0] for position in complete_positions]
    distinct_vectors = sorted(set(vector for vector in complete_vectors if vector is not None))
    duplicate = None

    if len(distinct_vectors) > 1:
        if len(candidates) > 1:
            derived_results = {derive_value(spec, vector) for vector in distinct_vectors}
            duplicate = duplicate_record(
                rid, ptid, spec, entry_phase, candidates, len(complete_positions), len(derived_results),
                "UNRESOLVED_CONFLICTING_COMPONENT_VECTORS", "SET_MISSING",
            )
        return None, "UNRESOLVED_DUPLICATE_QC", None, duplicate

    if distinct_vectors:
        complete_candidates = candidates.iloc[complete_positions]
        selected_index = min(complete_candidates.index, key=lambda index: source_sort_key(candidates.loc[index]))
        selected = candidates.loc[selected_index]
        if len(candidates) > 1:
            resolution = "RESOLVED_IDENTICAL_COMPLETE_COMPONENTS" if len(complete_positions) > 1 else "RESOLVED_UNIQUE_COMPLETE_COMPONENT_ROW"
            duplicate = duplicate_record(
                rid, ptid, spec, entry_phase, candidates, len(complete_positions), 1,
                resolution, "DERIVE_FROM_COMPLETE_ROW",
            )
        return derive_value(spec, distinct_vectors[0]), "", selected, duplicate

    if len(candidates) > 1:
        duplicate = duplicate_record(
            rid, ptid, spec, entry_phase, candidates, 0, 0,
            "NO_COMPLETE_COMPONENT_ROW", "SET_MISSING_FAILED_DERIVATION",
        )
    selected = min((row for _, row in candidates.iterrows()), key=source_sort_key)
    return None, "FAILED_DERIVATION", selected, duplicate


def enrollment_evidence(frames: dict[str, pd.DataFrame]) -> tuple[pd.DataFrame, int, int]:
    evidence_parts = []
    screening_ids: set[str] = set()
    for file_key, frame in frames.items():
        filename = FILES[file_key]
        baseline = frame.loc[frame["_VISIT_CLASS"].isin(ENROLLMENT_EVIDENCE_CLASSES)].copy()
        if not baseline.empty:
            baseline["_SOURCE_FILE"] = filename
            evidence_parts.append(baseline[["RID", "PTID", "PHASE", "VISCODE", "VISCODE2", "VISDATE", "_VISDATE_PARSED", "_VISIT_CLASS", "_SOURCE_FILE", "_SOURCE_ROW_NUMBER"]])
        screening_ids.update(
            frame.loc[frame["_VISIT_CLASS"].isin(SCREENING_EVIDENCE_CLASSES), "RID"].str.strip().loc[lambda values: values.ne("")]
        )

    if not evidence_parts:
        raise ValueError("No original baseline/full-battery enrollment evidence was found.")
    evidence = pd.concat(evidence_parts, ignore_index=True)
    evidence["RID"] = evidence["RID"].str.strip()
    evidence["PTID"] = evidence["PTID"].str.strip()
    evidence = evidence.loc[evidence["RID"].ne("")].copy()
    eligible_ids = set(evidence["RID"])
    screening_only = screening_ids - eligible_ids
    return evidence, len(eligible_ids), len(screening_only)


def choose_entry_phase(rid: str, group: pd.DataFrame) -> dict[str, object]:
    phase_summary = []
    for phase, phase_rows in group.groupby("PHASE", sort=False):
        dates = phase_rows["_VISDATE_PARSED"].dropna()
        phase_summary.append(
            {
                "phase": phase.strip(),
                "earliest_date": dates.min() if not dates.empty else pd.NaT,
                "evidence_rows": len(phase_rows),
                "source_files": sorted(set(phase_rows["_SOURCE_FILE"])),
            }
        )
    dated = [item for item in phase_summary if not pd.isna(item["earliest_date"])]
    if dated:
        chosen = min(dated, key=lambda item: (item["earliest_date"], PHASE_ORDER.get(item["phase"], 999)))
        status = "SINGLE_PHASE" if len(phase_summary) == 1 else "EARLIEST_DATED_BASELINE_PHASE"
        if len(dated) != len(phase_summary):
            status = "EARLIEST_DATED_PHASE_WITH_UNDATED_ALTERNATIVE"
    else:
        chosen = min(phase_summary, key=lambda item: PHASE_ORDER.get(item["phase"], 999))
        status = "SINGLE_UNDATED_PHASE" if len(phase_summary) == 1 else "PHASE_ORDER_FALLBACK_ALL_DATES_MISSING"

    chosen_phase_rows = group.loc[group["PHASE"].str.strip().eq(chosen["phase"])]
    ptids = sorted({value.strip() for value in chosen_phase_rows["PTID"] if value.strip()})
    ptid = ptids[0] if ptids else ""
    ptid_status = "UNIQUE" if len(ptids) == 1 else ("MISSING" if not ptids else "MULTIPLE_LEXICAL_FALLBACK")
    all_dates = chosen_phase_rows["_VISDATE_PARSED"].dropna()
    baseline_date = all_dates.min().strftime("%Y-%m-%d") if not all_dates.empty else ""
    return {
        "RID": rid,
        "PTID": ptid,
        "ENTRY_PHASE": chosen["phase"],
        "ENTRY_PHASE_LABEL": PHASE_LABELS.get(chosen["phase"], chosen["phase"]),
        "ENTRY_BASELINE_DATE": baseline_date,
        "ENTRY_PHASE_SELECTION_STATUS": status,
        "PTID_SELECTION_STATUS": ptid_status,
        "ENROLLMENT_EVIDENCE_ROW_COUNT": int(len(chosen_phase_rows)),
        "ENROLLMENT_EVIDENCE_SOURCE_FILES": " | ".join(sorted(set(chosen_phase_rows["_SOURCE_FILE"]))),
        "ENROLLMENT_EVIDENCE_VISCODE_VALUES": " | ".join(sorted({value.strip() for value in chosen_phase_rows["VISCODE"] if value.strip()})),
        "ENROLLMENT_EVIDENCE_VISCODE2_VALUES": " | ".join(sorted({value.strip() for value in chosen_phase_rows["VISCODE2"] if value.strip()})),
        "ENROLLMENT_EVIDENCE_VISIT_CLASSES": " | ".join(sorted(set(chosen_phase_rows["_VISIT_CLASS"]))),
        "OTHER_BASELINE_PHASES_JSON": json.dumps(sorted({item["phase"] for item in phase_summary if item["phase"] != chosen["phase"]})),
    }


def construct_table(
    frames: dict[str, pd.DataFrame],
    evidence: pd.DataFrame,
    missing_policy: set[tuple[str, str, str]],
) -> tuple[pd.DataFrame, pd.DataFrame]:
    enrollment_rows = [choose_entry_phase(rid, group) for rid, group in evidence.groupby("RID", sort=True)]
    participant_rows: list[dict[str, object]] = []
    duplicate_rows: list[dict[str, object]] = []
    empty_frames = {file_key: frame.iloc[0:0] for file_key, frame in frames.items()}
    candidate_indexes: dict[str, dict[tuple[str, str, str], pd.DataFrame]] = {}
    for file_key, frame in frames.items():
        relevant = frame.loc[frame["_VISIT_CLASS"].isin(SCREENING_CLASSES | BASELINE_CLASSES)]
        candidate_indexes[file_key] = {
            (rid.strip(), phase.strip(), visit_class): group
            for (rid, phase, visit_class), group in relevant.groupby(
                ["RID", "PHASE", "_VISIT_CLASS"], sort=False
            )
        }

    for participant_number, enrollment in enumerate(enrollment_rows, start=1):
        if participant_number % 500 == 0:
            print(f"Constructed {participant_number}/{len(enrollment_rows)} participant rows...", flush=True)
        rid = str(enrollment["RID"])
        ptid = str(enrollment["PTID"])
        entry_phase = str(enrollment["ENTRY_PHASE"])
        output = dict(enrollment)
        participant_candidate_cache: dict[tuple[str, str], pd.DataFrame] = {}
        for spec in VARIABLES:
            cache_key = (spec.file_key, spec.visit_kind)
            candidates = participant_candidate_cache.get(cache_key)
            if candidates is None:
                matching_groups = [
                    candidate_indexes[spec.file_key].get((rid, entry_phase, visit_class))
                    for visit_class in intended_classes(spec)
                ]
                matching_groups = [group for group in matching_groups if group is not None]
                if matching_groups:
                    candidates = pd.concat(matching_groups, axis=0) if len(matching_groups) > 1 else matching_groups[0]
                else:
                    candidates = empty_frames[spec.file_key]
                participant_candidate_cache[cache_key] = candidates
            if spec.mode == "direct":
                value, reason, selected, duplicate = resolve_direct(
                    rid, ptid, spec, entry_phase, candidates, missing_policy
                )
            else:
                value, reason, selected, duplicate = resolve_derived(
                    rid, ptid, spec, entry_phase, candidates, missing_policy
                )
            output[spec.output] = value
            output.update(provenance(selected, spec, reason))
            if duplicate is not None:
                duplicate_rows.append(duplicate)
        participant_rows.append(output)

    table = pd.DataFrame(participant_rows)
    duplicate_details = pd.DataFrame(duplicate_rows)
    if duplicate_details.empty:
        duplicate_details = pd.DataFrame(columns=[
            "RID", "PTID", "source_file", "candidate_variable", "entry_phase",
            "intended_visit_kind", "candidate_row_count", "valid_candidate_row_count",
            "distinct_valid_value_count", "observed_viscodes", "observed_viscode2_values",
            "observed_visdates", "source_row_numbers", "resolution_status",
            "analytical_value_action", "notes",
        ])
    else:
        counts = duplicate_details.groupby(["source_file", "candidate_variable"]).size().rename("source_variable_duplicate_group_count")
        unresolved = (
            duplicate_details["resolution_status"].str.startswith("UNRESOLVED")
            .groupby([duplicate_details["source_file"], duplicate_details["candidate_variable"]])
            .sum()
            .rename("source_variable_unresolved_group_count")
        )
        duplicate_details = duplicate_details.join(counts, on=["source_file", "candidate_variable"])
        duplicate_details = duplicate_details.join(unresolved, on=["source_file", "candidate_variable"])
    if "source_variable_duplicate_group_count" not in duplicate_details:
        duplicate_details["source_variable_duplicate_group_count"] = pd.Series(dtype="int64")
        duplicate_details["source_variable_unresolved_group_count"] = pd.Series(dtype="int64")
    duplicate_details.insert(0, "record_type", "DETAIL")

    summary_rows = []
    for spec in VARIABLES:
        matching = duplicate_details.loc[
            duplicate_details["source_file"].eq(FILES[spec.file_key])
            & duplicate_details["candidate_variable"].eq(spec.output)
        ]
        summary_rows.append(
            {
                "record_type": "SUMMARY",
                "RID": "",
                "PTID": "",
                "source_file": FILES[spec.file_key],
                "candidate_variable": spec.output,
                "entry_phase": "ALL",
                "intended_visit_kind": spec.visit_kind,
                "candidate_row_count": "",
                "valid_candidate_row_count": "",
                "distinct_valid_value_count": "",
                "observed_viscodes": "",
                "observed_viscode2_values": "",
                "observed_visdates": "",
                "source_row_numbers": "",
                "resolution_status": "SUMMARY_COUNT",
                "analytical_value_action": "",
                "notes": "Counts cover duplicate candidate groups for this source-variable pair.",
                "source_variable_duplicate_group_count": int(len(matching)),
                "source_variable_unresolved_group_count": int(matching["resolution_status"].str.startswith("UNRESOLVED").sum()),
            }
        )
    duplicates = pd.concat([pd.DataFrame(summary_rows), duplicate_details], ignore_index=True, sort=False)
    return table, duplicates


def audit_missingness(
    table: pd.DataFrame,
    eligible_count: int,
    screening_only_count: int,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    rows = []
    decision_rows = []
    for spec in VARIABLES:
        missing = table[spec.output].isna()
        valid_count = int((~missing).sum())
        missing_count = int(missing.sum())
        missing_pct = 100.0 * missing_count / eligible_count if eligible_count else np.nan
        reasons = table[f"{spec.output}_MISSING_REASON"]
        row = {
            "candidate_variable": spec.output,
            "source_file": FILES[spec.file_key],
            "source_fields": " + ".join(spec.fields),
            "study_entry_visit_kind": spec.visit_kind,
            "total_eligible_participants": eligible_count,
            "participant_exclusion_reason": "SCREENING_ONLY_NOT_ENROLLED",
            "participant_exclusion_count": screening_only_count,
            "screening_only_not_enrolled_excluded": screening_only_count,
            "valid_values": valid_count,
            "missing_values": missing_count,
            "missing_percentage": missing_pct,
        }
        for reason, column in REASON_COLUMNS.items():
            row[column] = int((missing & reasons.eq(reason)).sum())
        accounted = sum(row[column] for column in REASON_COLUMNS.values())
        if accounted != missing_count:
            raise AssertionError(f"Missingness causes do not reconcile for {spec.output}: {accounted} != {missing_count}")
        decision = "EXCLUDE_GT20_MISSING" if missing_pct > 20.0 else "RETAIN"
        row["exclusion_decision"] = decision
        row["decision_rule"] = "EXCLUDE only when missing_percentage > 20.0"
        rows.append(row)
        decision_rows.append(
            {
                "candidate_variable": spec.output,
                "total_eligible_participants": eligible_count,
                "participant_exclusion_reason": "SCREENING_ONLY_NOT_ENROLLED",
                "participant_exclusion_count": screening_only_count,
                "valid_values": valid_count,
                "missing_values": missing_count,
                "missing_percentage": missing_pct,
                "threshold_percentage": 20.0,
                "decision": decision,
                "replacement_variable_used": "NO",
                "notes": "No imputation, replacement, phase-specific override, or score capping was applied.",
            }
        )
    return pd.DataFrame(rows), pd.DataFrame(decision_rows)


def phase_missingness(table: pd.DataFrame) -> pd.DataFrame:
    rows = []
    phases = sorted(table["ENTRY_PHASE"].unique(), key=lambda phase: PHASE_ORDER.get(phase, 999))
    for phase in phases:
        subset = table.loc[table["ENTRY_PHASE"].eq(phase)]
        for spec in VARIABLES:
            missing = subset[spec.output].isna()
            reasons = subset[f"{spec.output}_MISSING_REASON"]
            row = {
                "phase": phase,
                "phase_label": PHASE_LABELS.get(phase, phase),
                "candidate_variable": spec.output,
                "eligible_participants_in_phase": len(subset),
                "valid_values": int((~missing).sum()),
                "missing_values": int(missing.sum()),
                "missing_percentage": 100.0 * float(missing.mean()) if len(subset) else np.nan,
            }
            for reason, column in REASON_COLUMNS.items():
                row[column] = int((missing & reasons.eq(reason)).sum())
            rows.append(row)
    return pd.DataFrame(rows)


def ordered_columns(table: pd.DataFrame) -> list[str]:
    identifiers = [
        "PTID", "RID", "ENTRY_PHASE", "ENTRY_PHASE_LABEL", "ENTRY_BASELINE_DATE",
        "ENTRY_PHASE_SELECTION_STATUS", "PTID_SELECTION_STATUS",
        "ENROLLMENT_EVIDENCE_ROW_COUNT", "ENROLLMENT_EVIDENCE_SOURCE_FILES",
        "ENROLLMENT_EVIDENCE_VISCODE_VALUES", "ENROLLMENT_EVIDENCE_VISCODE2_VALUES",
        "ENROLLMENT_EVIDENCE_VISIT_CLASSES", "OTHER_BASELINE_PHASES_JSON",
    ]
    columns = identifiers + OUTPUT_VARIABLES
    for spec in VARIABLES:
        columns.extend(f"{spec.output}_{suffix}" for suffix in PROVENANCE_SUFFIXES)
    missing = [column for column in columns if column not in table.columns]
    if missing:
        raise AssertionError(f"Expected output columns missing: {missing}")
    return columns


def validate(
    table: pd.DataFrame,
    missing_audit: pd.DataFrame,
    decisions: pd.DataFrame,
    eligible_count: int,
) -> None:
    if len(table) != eligible_count:
        raise AssertionError(f"Participant row count {len(table)} != eligible count {eligible_count}")
    if table["RID"].duplicated().any():
        raise AssertionError("Axis A table contains duplicate RID rows.")
    if set(missing_audit["candidate_variable"]) != set(OUTPUT_VARIABLES):
        raise AssertionError("Missingness audit does not contain exactly the 15 candidate variables.")
    if len(decisions) != 15:
        raise AssertionError("Exclusion decision output must contain exactly 15 rows.")
    expected = np.where(decisions["missing_percentage"] > 20.0, "EXCLUDE_GT20_MISSING", "RETAIN")
    if not np.array_equal(expected, decisions["decision"].to_numpy()):
        raise AssertionError("Exclusion decisions do not match the strict >20% rule.")
    forgetting = table["RAVLT_FORGETTING"].dropna()
    if (forgetting < 0).any() and table.loc[table["RAVLT_FORGETTING"].lt(0), "RAVLT_FORGETTING_MISSING_REASON"].ne("").any():
        raise AssertionError("A valid negative RAVLT Forgetting value was marked missing.")


def main() -> None:
    frames = read_raw_frames()
    print("Loaded seven approved raw CSVs.", flush=True)
    visit_lookup = load_visit_lookup()
    attach_visit_classes(frames, visit_lookup)
    missing_policy = load_missing_policy()
    evidence, eligible_count, screening_only_count = enrollment_evidence(frames)
    print(f"Enrollment evidence resolved for {eligible_count} eligible participants.", flush=True)
    table, duplicates = construct_table(frames, evidence, missing_policy)
    print("Participant-level values and provenance constructed.", flush=True)
    table = table.loc[:, ordered_columns(table)]
    missing_audit, decisions = audit_missingness(table, eligible_count, screening_only_count)
    phase_audit = phase_missingness(table)
    validate(table, missing_audit, decisions, eligible_count)

    INTERIM_DIR.mkdir(parents=True, exist_ok=True)
    table.to_csv(INTERIM_DIR / "axis_a_study_entry_unimputed.csv", index=False, encoding="utf-8")
    missing_audit.to_csv(INTERIM_DIR / "axis_a_missingness_audit.csv", index=False, encoding="utf-8")
    phase_audit.to_csv(INTERIM_DIR / "axis_a_phase_missingness.csv", index=False, encoding="utf-8")
    duplicates.to_csv(INTERIM_DIR / "axis_a_duplicate_qc.csv", index=False, encoding="utf-8")
    decisions.to_csv(INTERIM_DIR / "axis_a_exclusion_decisions.csv", index=False, encoding="utf-8")

    print(f"Eligible Axis A participants: {eligible_count}")
    print(f"Screening-only/non-enrolled excluded: {screening_only_count}")
    print(f"Participant table rows: {len(table)}")
    duplicate_details = duplicates.loc[duplicates["record_type"].eq("DETAIL")]
    print(f"Duplicate QC groups: {len(duplicate_details)}")
    print(f"Unresolved duplicate QC groups: {int(duplicate_details['resolution_status'].str.startswith('UNRESOLVED').sum())}")
    print(f"Valid negative RAVLT Forgetting values preserved: {int(table['RAVLT_FORGETTING'].lt(0).sum())}")
    print("Exclusion decisions:")
    print(decisions[["candidate_variable", "missing_percentage", "decision"]].to_string(index=False))


if __name__ == "__main__":
    main()
