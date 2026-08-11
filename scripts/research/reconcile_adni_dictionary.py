"""Reconcile ADNI candidate fields with official documentation.

The script reads only the seven approved raw CSV exports. Documentation-derived
metadata is recorded as citations/notes; no raw values are changed, no tables are
merged, and no preprocessing or inclusion decision is performed.
"""

from __future__ import annotations

import json
from decimal import Decimal, InvalidOperation
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw" / "adni"
OUT = ROOT / "data" / "interim"

FILES = {
    "ADAS": "All_Subjects_ADAS_10Aug2026.csv",
    "CDR": "All_Subjects_CDR_10Aug2026.csv",
    "FAQ": "All_Subjects_FAQ_10Aug2026.csv",
    "MMSE": "All_Subjects_MMSE_10Aug2026.csv",
    "NEUROBAT": "All_Subjects_NEUROBAT_10Aug2026.csv",
    "NPIQ": "All_Subjects_NPIQ_10Aug2026.csv",
    "GDSCALE": "All_Subjects_GDSCALE_10Aug2026.csv",
}

URL_CLINICAL = "https://adni.loni.usc.edu/quick-start-guide-asset101625/clinical.html"
URL_COMMON_TABLES = "https://adni.loni.usc.edu/wp-content/themes/freshnews-dev-v2/documents/bio/inst_commonly_used_table.pdf"
URL_NEUROBAT = "https://adni.bitbucket.io/reference/neurobat.html"
URL_ANATOMY = "https://adni.loni.usc.edu/quick-start-guide-asset/anatomy2.html"
URL_FAQ = "https://adni.loni.usc.edu/help-faqs/faqs/"
URL_ADNI1_PROTOCOL = "https://adni.loni.usc.edu/wp-content/themes/freshnews-dev-v2/documents/clinical/ADNI-1_Protocol.pdf"
URL_ADNI3_MANUAL = "https://adni.loni.usc.edu/wp-content/uploads/2012/10/ADNI3-Procedures-Manual_v3.0_20170627.pdf"
URL_TEAM_PROTOCOL = "https://adni.loni.usc.edu/wp-content/uploads/2026/03/TEAM-ADNI_Protocol_v1.1_11Dec2025.pdf"
URL_SCHEDULES = "https://adni.loni.usc.edu/quick-start-guide-asset101625/schedules.html"
URL_VISIT_CODES = "https://adni.loni.usc.edu/quick-start-guide-asset/anatomy2.html"
URL_ASK_EXPERTS = "https://adni.loni.usc.edu/help-faqs/ask-the-experts/"
URL_LM_PUBLICATION = "https://adni.loni.usc.edu/adni-publications/nihms499871.pdf"
URL_RAVLT_PUBLICATION = "https://adni.loni.usc.edu/adni-publications/Battista-2017-Optimizing%20Neuropsychological%20As.pdf"


def variable(
    thesis_variable: str,
    canonical_name: str,
    file_key: str,
    source_fields: list[str],
    definition: str,
    score_range: str,
    direction: str,
    phases: str,
    recording_type: str,
    formula: str,
    same_meaning: str,
    status: str,
    entry_visit: str,
    source_urls: list[str],
    notes: str,
    analysis_axis: str = "Axis A",
) -> dict[str, object]:
    return {
        "analysis_axis": analysis_axis,
        "thesis_variable": thesis_variable,
        "canonical_internal_name": canonical_name,
        "file_key": file_key,
        "source_fields": source_fields,
        "official_adni_definition": definition,
        "documented_score_range": score_range,
        "score_direction": direction,
        "documented_applicable_phases": phases,
        "recording_or_derivation": recording_type,
        "documented_formula": formula,
        "same_meaning_across_phases": same_meaning,
        "final_mapping_status": status,
        "documented_study_entry_visit": entry_visit,
        "source_urls": source_urls,
        "source_notes": notes,
    }


VARIABLES = [
    variable("MMSE", "mmse", "MMSE", ["MMSCORE"], "Mini-Mental State Examination total score.", "0-30", "Higher is better; lower indicates greater impairment.", "ADNI1, ADNIGO, ADNI2, ADNI3, ADNI4", "Provided total score.", "", "Yes for the total score; administration details may vary.", "CONFIRMED", "Screening for new participants.", [URL_CLINICAL, URL_ADNI1_PROTOCOL, URL_ADNI3_MANUAL], "Official ADNI clinical documentation identifies MMSCORE as the total. MMSE is explicitly part of screening in ADNI1 and ADNI3 manuals."),
    variable("ADAS-Cog 13", "adas_cog_13", "ADAS", ["TOTAL13"], "Thirteen-item ADAS-Cog total, including delayed word recall and number cancellation.", "0-85", "Higher is worse; higher indicates greater cognitive impairment.", "ADNI1, ADNIGO, ADNI2, ADNI3, ADNI4", "Provided/harmonized calculated total.", "Sum of the 13 ADAS-Cog component scores; use the provided TOTAL13 field.", "The total has been harmonized across phases, but historical storage and word-list item data are inconsistent.", "CONFIRMED", "Baseline/full cognitive battery for new participants.", [URL_COMMON_TABLES, URL_CLINICAL], "Official ADNI tables documentation identifies TOTSCORE as the 11-item score and TOTAL13 as the 13-item score. Do not use TOTSCORE for the thesis ADAS-Cog 13 variable."),
    variable("Logical Memory Immediate", "logical_memory_immediate", "NEUROBAT", ["LIMMTOTAL"], "Total story units recalled in the immediate Logical Memory condition.", "0-25 expected; one ADNI-hosted publication describes 0-24, while the export contains 25", "Higher is better.", "ADNI1, ADNIGO, ADNI2, ADNI3, ADNI4", "Directly recorded assessment total.", "", "Core construct is preserved, but story version (LMSTORY 1/2) is phase/record dependent.", "PHASE_DEPENDENT", "Screening for new participants.", [URL_CLINICAL, URL_ADNI1_PROTOCOL, URL_ADNI3_MANUAL, URL_LM_PUBLICATION], "Zero literal-bl availability is explained by documented screening administration. Exact upper bound and story-version comparability require dictionary/manual confirmation."),
    variable("Logical Memory Delayed", "logical_memory_delayed", "NEUROBAT", ["LDELTOTAL"], "Total story units recalled in the delayed Logical Memory condition.", "0-25", "Higher is better.", "ADNI1, ADNIGO, ADNI2, ADNI3, ADNI4", "Directly recorded assessment total.", "", "Core construct is preserved, but story version (LMSTORY 1/2) is phase/record dependent.", "PHASE_DEPENDENT", "Screening for new participants.", [URL_CLINICAL, URL_ADNI1_PROTOCOL, URL_ADNI3_MANUAL, URL_LM_PUBLICATION], "Zero literal-bl availability is explained by documented screening administration. LDELCUE is a cue field, not the delayed total."),
    variable("Trail Making Test A", "trail_making_test_a", "NEUROBAT", ["TRAASCOR"], "Elapsed seconds to complete Trail Making Test Part A.", "0-150 seconds in the ADNI1 procedures manual", "Higher is worse/slower.", "ADNI1, ADNIGO, ADNI2, ADNI3, ADNI4", "Directly recorded elapsed time.", "", "The intended meaning is stable, but observed values above the documented stop limit indicate phase/data-entry differences requiring review.", "PHASE_DEPENDENT", "Baseline/full cognitive battery for new participants.", [URL_CLINICAL, URL_ADNI1_PROTOCOL], "The export contains values above 150; no capping or correction is authorized in this audit."),
    variable("Trail Making Test B", "trail_making_test_b", "NEUROBAT", ["TRABSCOR"], "Elapsed seconds to complete Trail Making Test Part B.", "0-300 seconds in the ADNI1 procedures manual", "Higher is worse/slower.", "ADNI1, ADNIGO, ADNI2, ADNI3, ADNI4", "Directly recorded elapsed time.", "", "The intended meaning is stable, but observed values above the documented stop limit indicate phase/data-entry differences requiring review.", "PHASE_DEPENDENT", "Baseline/full cognitive battery for new participants.", [URL_CLINICAL, URL_ADNI1_PROTOCOL], "The export contains values above 300; no capping or correction is authorized in this audit."),
    variable("Category Fluency - Animals", "category_fluency_animals", "NEUROBAT", ["CATANIMSC"], "Total correct animal exemplars generated during the category-fluency task.", "No fixed maximum documented in the reviewed ADNI sources", "Higher is better.", "ADNI1, ADNIGO, ADNI2, ADNI3, ADNI4", "Directly recorded total correct.", "", "Yes for the animals task.", "CONFIRMED", "Baseline/full cognitive battery for new participants.", [URL_CLINICAL, URL_TEAM_PROTOCOL], "CATANPERS and CATANINTR are error fields, not the primary total."),
    variable("Boston Naming Test", "boston_naming_test", "NEUROBAT", ["BNTTOTAL"], "Total number correct on the Boston Naming Test.", "0-30", "Higher is better.", "ADNI1, ADNIGO, ADNI2", "Directly recorded total correct.", "", "No: BNT was replaced by MINT in ADNI3 and ADNI4; the instruments must not be silently equated.", "PHASE_DEPENDENT", "Baseline/full cognitive battery where BNT was scheduled.", [URL_CLINICAL, URL_RAVLT_PUBLICATION], "MINTTOTAL is a different instrument and is not a drop-in BNT replacement without a documented harmonization decision."),
    variable("RAVLT Immediate (Trials 1-5 Sum)", "ravlt_immediate_trials_1_5_sum", "NEUROBAT", ["AVTOT1", "AVTOT2", "AVTOT3", "AVTOT4", "AVTOT5"], "Total words recalled across RAVLT learning Trials 1 through 5.", "0-75", "Higher is better.", "ADNI1, ADNIGO, ADNI2, ADNI3, ADNI4", "Analytically derived from five recorded trial totals.", "AVTOT1 + AVTOT2 + AVTOT3 + AVTOT4 + AVTOT5", "Yes for the documented derivation, subject to complete valid component scores.", "CONFIRMED_DERIVED", "Baseline/full cognitive battery for new participants.", [URL_CLINICAL, URL_NEUROBAT, URL_ASK_EXPERTS], "The seven-file export contains no canonical precomputed sum; ADNI's maintained package documentation defines this exact derivation."),
    variable("RAVLT Delayed Recall", "ravlt_delayed_recall", "NEUROBAT", ["AVDEL30MIN"], "Number of list-A words recalled after the delayed interval.", "0-15", "Higher is better.", "ADNI1, ADNIGO, ADNI2, ADNI3, ADNI4", "Directly recorded delayed-recall score.", "", "Yes for AVDEL30MIN.", "CONFIRMED", "Baseline/full cognitive battery for new participants.", [URL_CLINICAL, URL_NEUROBAT, URL_ASK_EXPERTS, URL_RAVLT_PUBLICATION], "ADNI documentation identifies AVDEL30MIN as delayed recall. An ADNI-hosted neuropsychology publication labels AVDELTOT as recognition, so it is not selected for this thesis variable."),
    variable("RAVLT Forgetting Score", "ravlt_forgetting_score", "NEUROBAT", ["AVTOT5", "AVDEL30MIN"], "Number of words lost between Trial 5 and delayed recall.", "Theoretical -15 to 15; negative values are possible when delayed recall exceeds Trial 5", "Higher is worse/more forgetting; negative values can represent improvement after delay.", "ADNI1, ADNIGO, ADNI2, ADNI3, ADNI4", "Analytically derived from recorded scores.", "AVTOT5 - AVDEL30MIN", "Yes for the documented derivation, subject to complete valid inputs.", "CONFIRMED_DERIVED", "Baseline/full cognitive battery for new participants.", [URL_NEUROBAT, URL_ASK_EXPERTS], "Do not treat a negative derived forgetting score as a missing code. ADNI also documents percent forgetting as 100 * forgetting / AVTOT5, with AVTOT5 == 0 set missing; percentage forgetting is not the thesis variable requested."),
    variable("CDR Sum of Boxes", "cdr_sum_of_boxes", "CDR", ["CDRSB"], "Sum of the six CDR box scores: memory, orientation, judgment/problem solving, community affairs, home/hobbies, and personal care.", "0-18", "Higher is worse.", "ADNI1, ADNIGO, ADNI2, ADNI3, ADNI4", "Automatically derived by the eCRF and provided in CDRSB.", "CDMEMORY + CDORIENT + CDJUDGE + CDCOMMUN + CDHOME + CDCARE", "Yes for CDR-SB, although CDR is ordinal and tied to diagnostic criteria.", "CONFIRMED_DERIVED", "Screening for new participants.", [URL_CLINICAL, URL_ADNI3_MANUAL], "Use the provided CDRSB rather than recomputing it. CDGLOBAL is a different proprietary global score."),
    variable("FAQ", "faq", "FAQ", ["FAQTOTAL"], "Ten-item informant measure of impairment in complex activities of daily living.", "0-30", "Higher is worse/greater dependency.", "ADNI1, ADNIGO, ADNI2, ADNI3, ADNI4", "Provided total score.", "", "Yes for FAQTOTAL; item coding should not be assumed to equal item contribution.", "CONFIRMED", "Baseline/full study-partner assessment for new participants.", [URL_CLINICAL, URL_TEAM_PROTOCOL], "Official ADNI guidance warns that item codes do not necessarily equal their contribution to the total; use FAQTOTAL."),
    variable("NPI-Q", "npi_q", "NPIQ", ["NPISCORE"], "NPI-Q total severity score, the sum of severity ratings across 12 symptom domains.", "0-36", "Higher is worse/more severe neuropsychiatric symptoms.", "ADNI1, ADNIGO, ADNI2, ADNI3, ADNI4", "Derived aggregate provided in NPISCORE.", "Sum of the 12 domain severity scores", "Core NPI-Q meaning is preserved, but administration source (phone/in person) can vary.", "CONFIRMED_DERIVED", "Baseline/full study-partner assessment for new participants, subject to phase schedule.", [URL_CLINICAL, URL_TEAM_PROTOCOL], "Use NPISCORE; do not substitute the longer NPI total."),
    variable("GDS", "gds", "GDSCALE", ["GDTOTAL"], "Site-entered total for the 15-item short-form Geriatric Depression Scale.", "0-15", "Higher is worse/more depressive symptoms.", "ADNI1, ADNIGO, ADNI2, ADNI3, ADNI4", "Totaled by site staff and entered into the total field.", "", "Core 15-item total is intended to be stable; ADNI reports item/total discrepancies.", "CONFIRMED", "Screening for new participants.", [URL_CLINICAL, URL_ADNI1_PROTOCOL, URL_ADNI3_MANUAL, URL_TEAM_PROTOCOL], "Use GDTOTAL rather than recomputing from item columns."),
]


AXIS_B_ROWS = [
    variable("Participant identifier", "participant_id_ptid", "ADAS", ["PTID"], "Participant ID.", "Not applicable", "Not applicable", "ADNI1, ADNIGO, ADNI2, ADNI3, ADNI4", "Direct identifier.", "", "Yes.", "CONFIRMED", "Not a visit field.", [URL_ANATOMY], "PTID is structured; RID is ADNI's generally preferred cross-table identifier.", "Axis B"),
    variable("Participant roster identifier", "participant_id_rid", "ADAS", ["RID"], "Participant roster ID.", "Not applicable", "Not applicable", "ADNI1, ADNIGO, ADNI2, ADNI3, ADNI4", "Direct identifier.", "", "Yes.", "CONFIRMED", "Not a visit field.", [URL_ANATOMY], "Official ADNI anatomy guidance describes RID as the go-to participant identifier for most analyses.", "Axis B"),
    variable("Raw visit code", "viscode", "ADAS", ["VISCODE"], "Phase-specific visit code tied to the phase schedule of events.", "Categorical", "Not applicable", "ADNI1, ADNIGO, ADNI2, ADNI3, ADNI4", "Direct structural field.", "", "No: code meanings are phase-specific.", "PHASE_DEPENDENT", "Interpret jointly with PHASE.", [URL_VISIT_CODES], "Do not order or merge on VISCODE alone across phases." , "Axis B"),
    variable("Translated visit code", "viscode2", "ADAS", ["VISCODE2"], "Phase-independent translated visit code; sc and bl denote screening and baseline, month codes denote elapsed scheduled months.", "Categorical", "Not applicable", "ADNI1, ADNIGO, ADNI2, ADNI3, ADNI4", "Derived/translated structural field.", "", "Mostly harmonized, but historical assignment has documented foibles and ADNI4 changed the assignment method.", "PHASE_DEPENDENT", "Use for visit labeling only with explicit handling of non-month codes.", [URL_VISIT_CODES], "VISCODE2 is not an exact elapsed-time measurement." , "Axis B"),
    variable("ADAS visit date", "adas_visit_date", "ADAS", ["VISDATE"], "Registry EXAMDATE matched on the corresponding VISCODE.", "YYYY-MM-DD", "Chronological", "ADNI1, ADNIGO, ADNI2, ADNI3, ADNI4", "Registry-matched visit date.", "", "Meaning is intended to be consistent, subject to matching completeness.", "CONFIRMED", "Use as the Axis B elapsed-time date when nonblank, after later duplicate/date QC.", [URL_ANATOMY, URL_FAQ], "Appropriate for actual elapsed time because it is the matched registry examination/visit date; 18 ADAS rows are blank in this export." , "Axis B"),
    variable("Record creation date", "adas_userdate", "ADAS", ["USERDATE"], "Date the record was created.", "YYYY-MM-DD", "Administrative", "ADNI1, ADNIGO, ADNI2, ADNI3, ADNI4", "Administrative metadata.", "", "Yes as administrative metadata.", "CONFIRMED", "Exclude from Axis B elapsed-time calculations.", [URL_ANATOMY], "Not an assessment date." , "Axis B"),
    variable("Record last-updated date", "adas_userdate2", "ADAS", ["USERDATE2"], "Date the record was last updated.", "YYYY-MM-DD", "Administrative", "ADNI1, ADNIGO, ADNI2, ADNI3, ADNI4", "Administrative metadata.", "", "Yes as administrative metadata.", "CONFIRMED", "Exclude from Axis B elapsed-time calculations.", [URL_ANATOMY], "Not an assessment date." , "Axis B"),
    variable("Table build timestamp", "adas_update_stamp", "ADAS", ["UPDATE_STAMP"], "Automatically generated timestamp representing the most recent table build.", "Timestamp", "Administrative", "ADNI1, ADNIGO, ADNI2, ADNI3, ADNI4", "Administrative metadata.", "", "Yes as administrative metadata.", "CONFIRMED", "Exclude from all analysis.", [URL_ANATOMY], "Official ADNI documentation explicitly says update_stamp should not be used in analysis." , "Axis B"),
]


LIKELY_FIELDS = {
    "MMSE": ["MMSCORE"],
    "ADAS": ["TOTAL13"],
    "NEUROBAT": ["LIMMTOTAL", "LDELTOTAL", "TRAASCOR", "TRABSCOR", "CATANIMSC", "BNTTOTAL", "AVTOT1", "AVTOT2", "AVTOT3", "AVTOT4", "AVTOT5", "AVDEL30MIN"],
    "CDR": ["CDRSB"],
    "FAQ": ["FAQTOTAL"],
    "NPIQ": ["NPISCORE"],
    "GDSCALE": ["GDTOTAL"],
}

SCREENING_FIELDS = {"MMSCORE", "LIMMTOTAL", "LDELTOTAL", "CDRSB", "GDTOTAL"}
BASELINE_FIELDS = set(sum(LIKELY_FIELDS.values(), [])) - SCREENING_FIELDS

FIELD_SCORE_RANGES = {
    "MMSCORE": "0-30",
    "TOTAL13": "0-85",
    "LIMMTOTAL": "0-25 expected; upper-bound discrepancy remains open",
    "LDELTOTAL": "0-25",
    "TRAASCOR": "0-150 seconds per ADNI1 manual; export exceptions remain open",
    "TRABSCOR": "0-300 seconds per ADNI1 manual; export exceptions remain open",
    "CATANIMSC": "Nonnegative count; no fixed maximum documented in reviewed sources",
    "BNTTOTAL": "0-30",
    "AVTOT1": "0-15",
    "AVTOT2": "0-15",
    "AVTOT3": "0-15",
    "AVTOT4": "0-15",
    "AVTOT5": "0-15",
    "AVDEL30MIN": "0-15",
    "CDRSB": "0-18",
    "FAQTOTAL": "0-30",
    "NPISCORE": "0-36",
    "GDTOTAL": "0-15",
}


def read_frames() -> dict[str, pd.DataFrame]:
    frames: dict[str, pd.DataFrame] = {}
    for key, filename in FILES.items():
        path = RAW / filename
        if not path.is_file():
            raise FileNotFoundError(path)
        frames[key] = pd.read_csv(
            path,
            dtype=str,
            keep_default_na=False,
            na_filter=False,
            encoding="utf-8-sig",
            low_memory=False,
        )
    return frames


def nonblank(series: pd.Series) -> pd.Series:
    return series.str.strip().ne("")


def decimal_value(value: str) -> Decimal | None:
    try:
        return Decimal(value.strip())
    except (InvalidOperation, AttributeError):
        return None


def count_code(series: pd.Series, code: str) -> int:
    if code == "blank":
        return int(series.str.strip().eq("").sum())
    target = Decimal(code)
    return sum(decimal_value(value) == target for value in series if value.strip() != "")


def observed_phases(frame: pd.DataFrame, fields: list[str]) -> dict[str, list[str]]:
    result: dict[str, list[str]] = {}
    for field in fields:
        if field not in frame.columns:
            result[field] = []
            continue
        phases = frame.loc[nonblank(frame[field]), "PHASE"].str.strip().unique().tolist()
        result[field] = sorted(phase for phase in phases if phase)
    return result


def build_dictionary(frames: dict[str, pd.DataFrame]) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    for specification in VARIABLES + AXIS_B_ROWS:
        frame = frames[specification["file_key"]]
        fields = specification["source_fields"]
        found = all(field in frame.columns for field in fields)
        row = {
            "analysis_axis": specification["analysis_axis"],
            "thesis_variable": specification["thesis_variable"],
            "canonical_internal_name": specification["canonical_internal_name"],
            "source_file": FILES[specification["file_key"]],
            "source_fields": json.dumps(fields),
            "all_source_fields_found": found,
            "official_adni_definition": specification["official_adni_definition"],
            "documented_score_range": specification["documented_score_range"],
            "score_direction": specification["score_direction"],
            "documented_applicable_phases": specification["documented_applicable_phases"],
            "observed_nonblank_phases_by_field_json": json.dumps(observed_phases(frame, fields)),
            "recording_or_derivation": specification["recording_or_derivation"],
            "documented_formula": specification["documented_formula"],
            "same_meaning_preserved_across_phases": specification["same_meaning_across_phases"],
            "final_mapping_status": specification["final_mapping_status"],
            "documented_study_entry_visit": specification["documented_study_entry_visit"],
            "source_urls": " | ".join(specification["source_urls"]),
            "source_notes": specification["source_notes"],
        }
        rows.append(row)
    return rows


def classify_visit(phase: str, viscode: str, viscode2: str) -> str | None:
    phase = phase.strip()
    viscode = viscode.strip()
    viscode2 = viscode2.strip()
    if viscode == "f" or viscode2 == "f":
        return "screen_failure"
    if viscode in {"init", "v06", "4_init"}:
        return "rollover_or_phase_initial"
    if viscode2 == "sc" or viscode in {"sc", "v01", "4_sc"}:
        return "screening"
    if viscode == "t_bl":
        return "phase_specific_baseline"
    if viscode2 == "bl" or viscode in {"bl", "v03", "4_bl"}:
        return "literal_or_translated_baseline"
    if viscode.endswith("_bl"):
        return "phase_specific_or_unresolved"
    return None


def visit_documentation(category: str) -> tuple[str, str]:
    if category == "screening":
        return ("Pre-enrollment screening visit; a subset of assessments is collected for eligibility.", URL_FAQ)
    if category == "literal_or_translated_baseline":
        return ("Baseline visit after successful screening for new participants; additional assessments are collected.", URL_FAQ)
    if category == "phase_specific_baseline":
        return ("Phase-specific baseline code; t_bl is observed for TEAM records and is kept distinct from generic bl.", URL_TEAM_PROTOCOL)
    if category == "rollover_or_phase_initial":
        return ("Initial visit for a continuing/rollover participant in a new ADNI phase; not the participant's original study-entry baseline.", URL_VISIT_CODES)
    if category == "screen_failure":
        return ("Screening visit ending in screen failure; participant may not have enrolled.", URL_VISIT_CODES)
    return ("Baseline-like or phase-specific code whose semantics are not sufficiently resolved for selection in this audit.", URL_VISIT_CODES)


def field_visit_recommendation(field: str, category: str) -> str:
    if category == "screen_failure":
        return "Do not treat as enrolled study entry without enrollment confirmation."
    if category == "rollover_or_phase_initial":
        return "Treat as phase-entry/rollover context, not original study entry."
    if field in SCREENING_FIELDS:
        return "Screening is the documented new-participant study-entry assessment for this field; preserve phase and code."
    if field in BASELINE_FIELDS:
        return "Baseline/full-battery visit is the documented study-entry assessment for this field; preserve phase and code."
    return "UNRESOLVED"


def build_visit_semantics(frames: dict[str, pd.DataFrame]) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    for file_key, fields in LIKELY_FIELDS.items():
        frame = frames[file_key]
        grouped = frame.groupby(["PHASE", "VISCODE", "VISCODE2"], dropna=False, sort=True)
        for (phase, viscode, viscode2), group in grouped:
            category = classify_visit(str(phase), str(viscode), str(viscode2))
            if category is None:
                continue
            definition, source_url = visit_documentation(category)
            for field in fields:
                series = group[field]
                rows.append(
                    {
                        "source_file": FILES[file_key],
                        "phase": phase,
                        "viscode": viscode,
                        "viscode2": viscode2,
                        "visit_semantics_category": category,
                        "candidate_field": field,
                        "row_count": len(group),
                        "nonblank_count": int(nonblank(series).sum()),
                        "minus4_count": count_code(series, "-4"),
                        "minus1_count": count_code(series, "-1"),
                        "documented_visit_definition": definition,
                        "study_entry_recommendation": field_visit_recommendation(field, category),
                        "documentation_source": source_url,
                        "notes": "Availability is descriptive; no visit was selected, combined, recoded, or merged.",
                    }
                )
    return rows


def missing_meaning(code: str) -> str:
    if code == "blank":
        return "ADNI lists empty strings among possible missing-data encodings; the reason for absence may vary by table, phase, and schedule."
    if code == "-4":
        return "ADNI generally describes -4 as passively missing or not applicable, such as an item not collected at a visit."
    return "ADNI generally describes -1 as confirmed missing at the point of data entry."


def build_missing_policy(frames: dict[str, pd.DataFrame]) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    for file_key, fields in LIKELY_FIELDS.items():
        frame = frames[file_key]
        for field in fields:
            for code in ("blank", "-4", "-1"):
                count = count_code(frame[field], code)
                rows.append(
                    {
                        "source_file": FILES[file_key],
                        "source_field": field,
                        "code": code,
                        "observed_count": count,
                        "code_observed": count > 0,
                        "documented_meaning": missing_meaning(code),
                        "documented_valid_score_range": FIELD_SCORE_RANGES[field],
                        "treat_as_missing": "YES",
                        "source_url": URL_FAQ,
                        "source_notes": "Per-field recommendation: the code is not a valid score for this recorded field. Exact field/phase reason remains contextual; no replacement is performed.",
                    }
                )
    return rows


def max_numeric(frame: pd.DataFrame, field: str) -> float | None:
    values = pd.to_numeric(frame[field].str.strip(), errors="coerce")
    values = values.loc[~values.isin([-4, -1])].dropna()
    return float(values.max()) if not values.empty else None


def build_unresolved(frames: dict[str, pd.DataFrame]) -> list[dict[str, object]]:
    neurobat = frames["NEUROBAT"]
    adas = frames["ADAS"]
    return [
        {"item_id": "U01", "topic": "Axis A study-entry visit", "affected_fields": "All Axis A fields", "finding": "A universal VISCODE2 == bl rule is contradicted by documented screening administration for MMSE, Logical Memory, CDR, and GDS, and by phase-specific rollover/initial codes.", "recommended_methodology_action": "Define study entry instrument-by-instrument and phase-aware: documented screening score for screening instruments; documented baseline/full-battery score for baseline instruments; distinguish rollover initial visits from original enrollment.", "status": "REQUIRES_CHAPTER_3_UPDATE", "source_urls": f"{URL_ADNI1_PROTOCOL} | {URL_ADNI3_MANUAL} | {URL_ASK_EXPERTS} | {URL_VISIT_CODES}"},
        {"item_id": "U02", "topic": "Boston Naming phase discontinuity", "affected_fields": "BNTTOTAL; MINTTOTAL", "finding": "BNT was used in ADNI1/GO/2 and replaced by MINT in ADNI3/4.", "recommended_methodology_action": "Table 3.1 must either phase-restrict the Boston Naming variable or document a validated cross-instrument harmonization; do not silently substitute MINTTOTAL.", "status": "REQUIRES_TABLE_3_1_DECISION", "source_urls": URL_CLINICAL},
        {"item_id": "U03", "topic": "Logical Memory story/range comparability", "affected_fields": "LMSTORY; LIMMTOTAL; LDELTOTAL", "finding": "Two story versions occur. LIMMTOTAL includes an observed value of 25 while one reviewed ADNI-hosted source describes an upper bound of 24.", "recommended_methodology_action": "Confirm story-version scoring and valid range in the current ADNI data dictionary/manual before preprocessing.", "status": "UNRESOLVED", "source_urls": URL_CLINICAL},
        {"item_id": "U04", "topic": "Trail Making values above protocol stop limits", "affected_fields": "TRAASCOR; TRABSCOR", "finding": f"Documented ADNI1 limits are 150/300 seconds, but valid-looking export maxima excluding -1/-4 are {max_numeric(neurobat, 'TRAASCOR')} and {max_numeric(neurobat, 'TRABSCOR')}.", "recommended_methodology_action": "Confirm phase-specific coding, timeout codes, and data-entry rules before any capping or exclusion.", "status": "UNRESOLVED", "source_urls": URL_ADNI1_PROTOCOL},
        {"item_id": "U05", "topic": "ADAS cross-phase harmonization", "affected_fields": "TOTAL13; WORDLIST", "finding": "TOTAL13 is confirmed as ADAS-Cog13, but ADNI documents historically inconsistent storage and ongoing item/word-list quality concerns.", "recommended_methodology_action": "Use provided TOTAL13, retain PHASE, and document reliance on the harmonized total rather than recomputing item scores.", "status": "REQUIRES_CHAPTER_3_NOTE", "source_urls": f"{URL_COMMON_TABLES} | {URL_CLINICAL}"},
        {"item_id": "U06", "topic": "RAVLT derived variables", "affected_fields": "AVTOT1-AVTOT5; AVDEL30MIN", "finding": "Immediate and Forgetting are documented derived variables and are not present as columns in the seven-file export.", "recommended_methodology_action": "Table 3.1 should label them derived and state the documented formulas; derivation must occur only after field-specific missing-code handling is approved.", "status": "REQUIRES_TABLE_3_1_UPDATE", "source_urls": URL_NEUROBAT},
        {"item_id": "U07", "topic": "RAVLT negative derived forgetting", "affected_fields": "Derived RAVLT Forgetting", "finding": "AVTOT5 - AVDEL30MIN can legitimately be negative when delayed recall exceeds Trial 5.", "recommended_methodology_action": "Do not apply raw -1/-4 missing-code rules to the derived forgetting result; validate inputs before derivation.", "status": "REQUIRES_CHAPTER_3_NOTE", "source_urls": URL_NEUROBAT},
        {"item_id": "U08", "topic": "VISDATE completeness and duplicate assessment keys", "affected_fields": "ADAS VISDATE; PTID; VISCODE2", "finding": f"VISDATE is registry-matched examination date and is appropriate for elapsed time, but {int(adas['VISDATE'].str.strip().eq('').sum())} ADAS rows are blank and prior audit found duplicate PTID+VISCODE2 keys.", "recommended_methodology_action": "Before slopes, define duplicate/date-QC rules and require nonblank valid VISDATE; do not use USERDATE, USERDATE2, or UPDATE_STAMP.", "status": "REQUIRES_CHAPTER_3_NOTE", "source_urls": URL_ANATOMY},
        {"item_id": "U09", "topic": "Missing-code cause is contextual", "affected_fields": "All likely score fields", "finding": "ADNI gives general meanings for blank, -4, and -1 but warns coding varies by table and phase.", "recommended_methodology_action": "Use the per-field policy as a provisional treatment recommendation and retain code-specific audit counts; do not describe -4/-1 as globally identical causes.", "status": "REQUIRES_CHAPTER_3_NOTE", "source_urls": URL_FAQ},
        {"item_id": "U10", "topic": "Provided totals versus item recomputation", "affected_fields": "FAQTOTAL; GDTOTAL", "finding": "ADNI warns FAQ item coding does not necessarily equal item contribution and reports GDS item/total discrepancies.", "recommended_methodology_action": "Use provided FAQTOTAL and GDTOTAL; do not recompute from items without a separate documented validation.", "status": "REQUIRES_CHAPTER_3_NOTE", "source_urls": URL_CLINICAL},
        {"item_id": "U11", "topic": "NPI-Q administration source", "affected_fields": "NPISCORE; SOURCE", "finding": "NPI-Q may be collected by phone or in person, and both NPI and NPI-Q may occur at one visit.", "recommended_methodology_action": "Use NPISCORE only for the NPI-Q thesis variable and retain SOURCE for later sensitivity/QC planning.", "status": "REQUIRES_CHAPTER_3_NOTE", "source_urls": URL_CLINICAL},
    ]


def main() -> None:
    frames = read_frames()
    dictionary_rows = build_dictionary(frames)
    visit_rows = build_visit_semantics(frames)
    missing_rows = build_missing_policy(frames)
    unresolved_rows = build_unresolved(frames)

    OUT.mkdir(parents=True, exist_ok=True)
    pd.DataFrame(dictionary_rows).to_csv(OUT / "adni_confirmed_variable_dictionary.csv", index=False, encoding="utf-8")
    pd.DataFrame(visit_rows).to_csv(OUT / "adni_visit_semantics.csv", index=False, encoding="utf-8")
    pd.DataFrame(missing_rows).to_csv(OUT / "adni_missing_code_policy.csv", index=False, encoding="utf-8")
    pd.DataFrame(unresolved_rows).to_csv(OUT / "adni_unresolved_methodology_items.csv", index=False, encoding="utf-8")

    print(f"Dictionary rows: {len(dictionary_rows)}")
    print(f"Visit-semantics rows: {len(visit_rows)}")
    print(f"Missing-code policy rows: {len(missing_rows)}")
    print(f"Unresolved-methodology rows: {len(unresolved_rows)}")


if __name__ == "__main__":
    main()
