"""Audit thesis candidate-variable mappings in the seven approved ADNI CSVs.

This script performs discovery and descriptive counting only. It does not merge
files, convert missing codes, derive scores, remove duplicates, or make variable
selection decisions.
"""

from __future__ import annotations

import json
import re
from collections import Counter
from decimal import Decimal, InvalidOperation
from pathlib import Path

import pandas as pd


REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
RAW_DIRECTORY = REPOSITORY_ROOT / "data" / "raw" / "adni"
OUTPUT_DIRECTORY = REPOSITORY_ROOT / "data" / "interim"

FILES = {
    "ADAS": "All_Subjects_ADAS_10Aug2026.csv",
    "CDR": "All_Subjects_CDR_10Aug2026.csv",
    "FAQ": "All_Subjects_FAQ_10Aug2026.csv",
    "MMSE": "All_Subjects_MMSE_10Aug2026.csv",
    "NEUROBAT": "All_Subjects_NEUROBAT_10Aug2026.csv",
    "NPIQ": "All_Subjects_NPIQ_10Aug2026.csv",
    "GDSCALE": "All_Subjects_GDSCALE_10Aug2026.csv",
}

CONFIRMATION = "REQUIRES_DATA_DICTIONARY_CONFIRMATION"
TEXTUAL_SENTINEL_CANDIDATES = {
    "na",
    "n/a",
    "nan",
    "null",
    "none",
    "missing",
    ".",
}
NUMERIC_SENTINEL_CANDIDATES = {
    Decimal("-999"),
    Decimal("-99"),
    Decimal("-9"),
    Decimal("888"),
    Decimal("999"),
    Decimal("9999"),
}

OBSERVED_VERSION_CONTEXT = {
    "ADAS": "Observed export context: PHASE has ADNI1/ADNIGO/ADNI2/ADNI3/ADNI4 and WORDLIST has values 1-4.",
    "CDR": "Observed export context: PHASE spans ADNI1/ADNIGO/ADNI2/ADNI3/ADNI4/TEAM and CDVERSION has values 1-3.",
    "FAQ": "Observed export context: PHASE spans ADNI1/ADNIGO/ADNI2/ADNI3/ADNI4/TEAM.",
    "MMSE": "Observed export context: PHASE has ADNI1/ADNIGO/ADNI2/ADNI3/ADNI4 and WORDLIST has values 1-2.",
    "NEUROBAT": "Observed export context: PHASE spans ADNI1/ADNIGO/ADNI2/ADNI3/ADNI4/TEAM, LMSTORY has values 1-2, and DD_CRF_VERSION_LABEL has annual/bl/sc.",
    "NPIQ": "Observed export context: PHASE spans ADNI1/ADNIGO/ADNI2/ADNI3/ADNI4/TEAM.",
    "GDSCALE": "Observed export context: PHASE spans ADNI1/ADNIGO/ADNI2/ADNI3/ADNI4/TEAM.",
}


def candidate(
    canonical_variable: str,
    thesis_variable_name: str,
    file_key: str,
    source_column: str,
    likely_role: str,
    notes: str,
) -> dict[str, str]:
    return {
        "canonical_variable": canonical_variable,
        "thesis_variable_name": thesis_variable_name,
        "file_key": file_key,
        "source_column": source_column,
        "likely_role": likely_role,
        "notes": notes,
    }


CANDIDATES = [
    candidate("mmse", "MMSE", "MMSE", "MMSCORE", "published/calculated total-score candidate", "Header explicitly identifies an MMSE score."),
    candidate("adas_cog_13", "ADAS-Cog 13", "ADAS", "TOTAL13", "13-item total-score candidate", f"Header strongly indicates the 13-item total; exact scoring semantics {CONFIRMATION}."),
    candidate("adas_cog_13", "ADAS-Cog 13", "ADAS", "TOTSCORE", "alternate total-score field", f"May represent a different ADAS total or version; {CONFIRMATION}."),
    *[
        candidate("adas_cog_13", "ADAS-Cog 13", "ADAS", f"Q{i}SCORE", "item/subtest score, not a total", "Preserved to distinguish component scores from total-score fields.")
        for i in range(1, 14)
    ],
    candidate("logical_memory_immediate", "Logical Memory Immediate", "NEUROBAT", "LIMMTOTAL", "immediate-recall total candidate", f"Most explicit immediate-total header; scoring/version semantics {CONFIRMATION}."),
    candidate("logical_memory_immediate", "Logical Memory Immediate", "NEUROBAT", "LIMMEND", "administration end-time field, not a score total", f"Observed values span 33-1935 and are consistent with timing rather than performance; exact format {CONFIRMATION}."),
    candidate("logical_memory_delayed", "Logical Memory Delayed", "NEUROBAT", "LDELTOTAL", "delayed-recall total candidate", f"Most explicit delayed-total header; scoring/version semantics {CONFIRMATION}."),
    candidate("logical_memory_delayed", "Logical Memory Delayed", "NEUROBAT", "LDELCUE", "delayed-recall cue/subscore candidate", f"Could be a cue indicator or cued score, not the main delayed total; {CONFIRMATION}."),
    candidate("logical_memory_delayed", "Logical Memory Delayed", "NEUROBAT", "LDELBEGIN", "administration begin-time field, not a score total", f"Observed values span 8-1823 and are consistent with timing rather than performance; exact format {CONFIRMATION}."),
    candidate("trail_making_test_a", "Trail Making Test A", "NEUROBAT", "TRAASCOR", "primary score candidate", f"Header identifies Trail A score; units and censoring rules {CONFIRMATION}."),
    candidate("trail_making_test_a", "Trail Making Test A", "NEUROBAT", "TRAAERRCOM", "commission-error component", "Error component, not the primary score."),
    candidate("trail_making_test_a", "Trail Making Test A", "NEUROBAT", "TRAAERROM", "omission-error component", "Error component, not the primary score."),
    candidate("trail_making_test_b", "Trail Making Test B", "NEUROBAT", "TRABSCOR", "primary score candidate", f"Header identifies Trail B score; units and censoring rules {CONFIRMATION}."),
    candidate("trail_making_test_b", "Trail Making Test B", "NEUROBAT", "TRABERRCOM", "commission-error component", "Error component, not the primary score."),
    candidate("trail_making_test_b", "Trail Making Test B", "NEUROBAT", "TRABERROM", "omission-error component", "Error component, not the primary score."),
    candidate("category_fluency_animals", "Category Fluency - Animals", "NEUROBAT", "CATANIMSC", "animal-fluency primary score candidate", f"Header explicitly indicates animal category score; exact scoring semantics {CONFIRMATION}."),
    candidate("category_fluency_animals", "Category Fluency - Animals", "NEUROBAT", "CATANPERS", "perseveration-error component", "Error component, not the primary score."),
    candidate("category_fluency_animals", "Category Fluency - Animals", "NEUROBAT", "CATANINTR", "intrusion-error component", "Error component, not the primary score."),
    candidate("boston_naming_test", "Boston Naming Test", "NEUROBAT", "BNTTOTAL", "total-score candidate", f"Most explicit Boston Naming total; exact composition {CONFIRMATION}."),
    candidate("boston_naming_test", "Boston Naming Test", "NEUROBAT", "BNTSPONT", "spontaneous-response subscore/component", "Component field, not clearly equivalent to the published total."),
    candidate("boston_naming_test", "Boston Naming Test", "NEUROBAT", "BNTSTIM", "stimulus-cue component", "Component field, not clearly equivalent to the published total."),
    candidate("boston_naming_test", "Boston Naming Test", "NEUROBAT", "BNTCSTIM", "correct-after-stimulus component", "Component field, not clearly equivalent to the published total."),
    candidate("boston_naming_test", "Boston Naming Test", "NEUROBAT", "BNTPHON", "phonemic-cue component", "Component field, not clearly equivalent to the published total."),
    candidate("boston_naming_test", "Boston Naming Test", "NEUROBAT", "BNTCPHON", "correct-after-phonemic-cue component", "Component field, not clearly equivalent to the published total."),
    candidate("ravlt_immediate_trials_1_5_sum", "RAVLT Immediate, Trials 1-5 Sum", "NEUROBAT", "AVTOT1", "raw Trial 1 score component", f"No explicit Trials 1-5 sum header was found; do not derive without {CONFIRMATION}."),
    candidate("ravlt_immediate_trials_1_5_sum", "RAVLT Immediate, Trials 1-5 Sum", "NEUROBAT", "AVTOT2", "raw Trial 2 score component", f"No explicit Trials 1-5 sum header was found; do not derive without {CONFIRMATION}."),
    candidate("ravlt_immediate_trials_1_5_sum", "RAVLT Immediate, Trials 1-5 Sum", "NEUROBAT", "AVTOT3", "raw Trial 3 score component", f"No explicit Trials 1-5 sum header was found; do not derive without {CONFIRMATION}."),
    candidate("ravlt_immediate_trials_1_5_sum", "RAVLT Immediate, Trials 1-5 Sum", "NEUROBAT", "AVTOT4", "raw Trial 4 score component", f"No explicit Trials 1-5 sum header was found; do not derive without {CONFIRMATION}."),
    candidate("ravlt_immediate_trials_1_5_sum", "RAVLT Immediate, Trials 1-5 Sum", "NEUROBAT", "AVTOT5", "raw Trial 5 score component", f"No explicit Trials 1-5 sum header was found; do not derive without {CONFIRMATION}."),
    candidate("ravlt_delayed_recall", "RAVLT Delayed Recall", "NEUROBAT", "AVDEL30MIN", "30-minute delayed-recall candidate", f"Header suggests delayed recall, but relationship to AVDELTOT {CONFIRMATION}."),
    candidate("ravlt_delayed_recall", "RAVLT Delayed Recall", "NEUROBAT", "AVDELTOT", "alternate delayed total candidate", f"Header suggests a delayed total, but relationship to AVDEL30MIN {CONFIRMATION}."),
    candidate("ravlt_delayed_recall", "RAVLT Delayed Recall", "NEUROBAT", "AVDELERR1", "delayed-recall error component", "Error component, not the primary delayed score."),
    candidate("ravlt_delayed_recall", "RAVLT Delayed Recall", "NEUROBAT", "AVDELERR2", "delayed-recall error component", "Error component, not the primary delayed score."),
    candidate("ravlt_forgetting_score", "RAVLT Forgetting Score", "", "", "no explicit source field found", f"No header explicitly identifies a forgetting score; any derivation {CONFIRMATION}."),
    candidate("cdr_sum_of_boxes", "CDR Sum of Boxes", "CDR", "CDRSB", "sum-of-boxes total candidate", f"Header explicitly identifies CDRSB; exact scoring semantics {CONFIRMATION}."),
    candidate("cdr_sum_of_boxes", "CDR Sum of Boxes", "CDR", "CDGLOBAL", "alternate global summary, not sum of boxes", "Preserved to distinguish the global score from CDRSB."),
    *[
        candidate("cdr_sum_of_boxes", "CDR Sum of Boxes", "CDR", column, "domain component used by CDR summaries", "Component/subscale, not itself the sum of boxes.")
        for column in ("CDMEMORY", "CDORIENT", "CDJUDGE", "CDCOMMUN", "CDHOME", "CDCARE")
    ],
    candidate("faq", "FAQ", "FAQ", "FAQTOTAL", "published/calculated total-score candidate", f"Header explicitly identifies FAQ total; exact treatment of codes {CONFIRMATION}."),
    *[
        candidate("faq", "FAQ", "FAQ", column, "FAQ item-level component", "Item-level field, not the total score.")
        for column in ("FAQFINAN", "FAQFORM", "FAQSHOP", "FAQGAME", "FAQBEVG", "FAQMEAL", "FAQEVENT", "FAQTV", "FAQREM", "FAQTRAVL")
    ],
    candidate("npi_q", "NPI-Q", "NPIQ", "NPISCORE", "published/calculated aggregate-score candidate", f"Header identifies an NPI score; aggregation semantics {CONFIRMATION}."),
    *[
        candidate("npi_q", "NPI-Q", "NPIQ", f"NPI{letter}SEV", "NPI-Q item severity component", "Item-level severity field, not the aggregate score.")
        for letter in "ABCDEFGHIJKL"
    ],
    candidate("gds", "GDS", "GDSCALE", "GDTOTAL", "published/calculated total-score candidate", f"Header explicitly identifies GDS total; version/scoring semantics {CONFIRMATION}."),
    *[
        candidate("gds", "GDS", "GDSCALE", column, "GDS item-level component", "Item-level field, not the total score.")
        for column in ("GDSATIS", "GDDROP", "GDEMPTY", "GDBORED", "GDSPIRIT", "GDAFRAID", "GDHAPPY", "GDHELP", "GDHOME", "GDMEMORY", "GDALIVE", "GDWORTH", "GDENERGY", "GDHOPE", "GDBETTER")
    ],
]


LONGITUDINAL_FIELDS = (
    "TOTAL13",
    "TOTSCORE",
    "PTID",
    "RID",
    "VISCODE",
    "VISCODE2",
    "VISDATE",
    "USERDATE",
    "USERDATE2",
    "UPDATE_STAMP",
)


def raw_missing_mask(series: pd.Series) -> pd.Series:
    return series.str.strip().eq("")


def parse_decimal(value: str) -> Decimal | None:
    try:
        return Decimal(value.strip())
    except (InvalidOperation, AttributeError):
        return None


def count_decimal(series: pd.Series, target: Decimal) -> int:
    return sum(parse_decimal(value) == target for value in series)


def numeric_summary(series: pd.Series) -> tuple[object, object]:
    values = pd.to_numeric(series.str.strip(), errors="coerce").dropna()
    if values.empty:
        return "", ""
    return values.min(), values.max()


def exact_value_counts(values: list[str]) -> str:
    return json.dumps(dict(sorted(Counter(values).items())), ensure_ascii=False)


def sentinel_exposure(series: pd.Series) -> dict[str, object]:
    blank_mask = series.eq("")
    whitespace_mask = series.ne("") & series.str.strip().eq("")
    stripped_nonblank = series.loc[~(blank_mask | whitespace_mask)].str.strip()

    minus4_count = count_decimal(stripped_nonblank, Decimal("-4"))
    minus1_count = count_decimal(stripped_nonblank, Decimal("-1"))
    other_negative_values: list[str] = []
    unusual_values: list[str] = []

    for value in stripped_nonblank:
        decimal_value = parse_decimal(value)
        if decimal_value is not None:
            if decimal_value < 0 and decimal_value not in {Decimal("-4"), Decimal("-1")}:
                other_negative_values.append(value)
            if decimal_value in NUMERIC_SENTINEL_CANDIDATES:
                unusual_values.append(value)
        elif value.casefold() in TEXTUAL_SENTINEL_CANDIDATES:
            unusual_values.append(value)

    return {
        "blank_count": int(blank_mask.sum()),
        "whitespace_only_count": int(whitespace_mask.sum()),
        "minus4_count": minus4_count,
        "minus1_count": minus1_count,
        "other_negative_numeric_count": len(other_negative_values),
        "other_negative_numeric_values_json": exact_value_counts(other_negative_values),
        "other_unusual_sentinel_like_count": len(unusual_values),
        "other_unusual_sentinel_like_values_json": exact_value_counts(unusual_values),
    }


def safe_longitudinal_example(field: str, series: pd.Series) -> tuple[str, str]:
    nonblank = series.loc[~raw_missing_mask(series)].str.strip()
    if field == "PTID":
        matches = nonblank.str.fullmatch(r"\d+_S_\d+").mean() if len(nonblank) else 0
        return "<site>_S_<subject-number>", f"structured identifier; {matches:.1%} match numeric_S_numeric"
    if field == "RID":
        matches = nonblank.str.fullmatch(r"\d+").mean() if len(nonblank) else 0
        return "<integer participant identifier>", f"integer-like identifier; {matches:.1%} numeric"
    if field in {"VISDATE", "USERDATE", "USERDATE2"}:
        matches = nonblank.str.fullmatch(r"\d{4}-\d{2}-\d{2}").mean() if len(nonblank) else 0
        return "YYYY-MM-DD", f"date string; {matches:.1%} match YYYY-MM-DD"
    if field == "UPDATE_STAMP":
        return "timestamp-like value", "administrative timestamp format"
    examples = sorted(nonblank.unique().tolist())[:8]
    return json.dumps(examples, ensure_ascii=False), "observed values"


def longitudinal_ordering_assessment(field: str) -> tuple[str, str]:
    if field in {"TOTAL13", "TOTSCORE"}:
        return "No - outcome value only", f"ADAS-Cog 13 field choice {CONFIRMATION}."
    if field in {"PTID", "RID"}:
        return "Identifier only", "Identifies participants but does not order visits."
    if field == "VISCODE":
        return "Potentially, with explicit visit-code rules", f"Contains legacy/non-month codes; ordering rules {CONFIRMATION}."
    if field == "VISCODE2":
        return "Potentially, with explicit visit-code rules", f"Month codes coexist with non-month codes; ordering rules {CONFIRMATION}."
    if field == "VISDATE":
        return "Yes, as a date candidate", f"Appears visit-specific, but actual-assessment-date semantics {CONFIRMATION}."
    return "No - likely record metadata", f"Whether this is assessment timing rather than administrative metadata {CONFIRMATION}."


def load_files() -> tuple[dict[str, pd.DataFrame], dict[str, pd.DataFrame]]:
    raw_frames: dict[str, pd.DataFrame] = {}
    inferred_frames: dict[str, pd.DataFrame] = {}
    for key, filename in FILES.items():
        path = RAW_DIRECTORY / filename
        if not path.is_file():
            raise FileNotFoundError(path)
        raw_frames[key] = pd.read_csv(
            path,
            dtype=str,
            keep_default_na=False,
            na_filter=False,
            encoding="utf-8-sig",
            low_memory=False,
        )
        inferred_frames[key] = pd.read_csv(path, encoding="utf-8-sig", low_memory=False)
    return raw_frames, inferred_frames


def build_mapping_and_missing_rows(
    raw_frames: dict[str, pd.DataFrame], inferred_frames: dict[str, pd.DataFrame]
) -> tuple[list[dict[str, object]], list[dict[str, object]]]:
    mapping_rows: list[dict[str, object]] = []
    missing_rows: list[dict[str, object]] = []

    for specification in CANDIDATES:
        file_key = specification["file_key"]
        source_column = specification["source_column"]
        found = bool(file_key and source_column in raw_frames[file_key].columns)
        source_file = FILES[file_key] if file_key else ""

        mapping_row: dict[str, object] = {
            "canonical_variable": specification["canonical_variable"],
            "thesis_variable_name": specification["thesis_variable_name"],
            "source_file": source_file,
            "source_column": source_column,
            "field_found": found,
            "likely_role": specification["likely_role"],
            "observed_dtype": "",
            "nonblank_count": "",
            "unique_value_count": "",
            "observed_min": "",
            "observed_max": "",
            "contains_minus4": "",
            "contains_minus1": "",
            "notes": " ".join(
                part
                for part in (
                    specification["notes"],
                    OBSERVED_VERSION_CONTEXT.get(file_key, ""),
                )
                if part
            ),
        }

        if not found:
            mapping_rows.append(mapping_row)
            continue

        raw_series = raw_frames[file_key][source_column]
        nonblank_mask = ~raw_missing_mask(raw_series)
        nonblank_values = raw_series.loc[nonblank_mask].str.strip()
        exposure = sentinel_exposure(raw_series)
        observed_min, observed_max = numeric_summary(nonblank_values)
        mapping_row.update(
            {
                "observed_dtype": str(inferred_frames[file_key][source_column].dtype),
                "nonblank_count": int(nonblank_mask.sum()),
                "unique_value_count": int(nonblank_values.nunique(dropna=False)),
                "observed_min": observed_min,
                "observed_max": observed_max,
                "contains_minus4": exposure["minus4_count"] > 0,
                "contains_minus1": exposure["minus1_count"] > 0,
            }
        )
        mapping_rows.append(mapping_row)

        baseline_mask = raw_frames[file_key]["VISCODE2"].str.strip().eq("bl")
        baseline_series = raw_series.loc[baseline_mask]
        baseline_nonblank = ~raw_missing_mask(baseline_series)
        missing_rows.append(
            {
                "canonical_variable": specification["canonical_variable"],
                "thesis_variable_name": specification["thesis_variable_name"],
                "source_file": source_file,
                "source_column": source_column,
                **exposure,
                "baseline_row_count": int(baseline_mask.sum()),
                "baseline_nonblank_count": int(baseline_nonblank.sum()),
                "baseline_minus4_count": count_decimal(
                    baseline_series.loc[baseline_nonblank], Decimal("-4")
                ),
                "baseline_minus1_count": count_decimal(
                    baseline_series.loc[baseline_nonblank], Decimal("-1")
                ),
                "notes": "Counts are descriptive only; no code was converted and no row was removed.",
            }
        )

    return mapping_rows, missing_rows


def build_longitudinal_rows(
    raw_frames: dict[str, pd.DataFrame], inferred_frames: dict[str, pd.DataFrame]
) -> list[dict[str, object]]:
    raw_frame = raw_frames["ADAS"]
    inferred_frame = inferred_frames["ADAS"]
    rows: list[dict[str, object]] = []

    for field in LONGITUDINAL_FIELDS:
        found = field in raw_frame.columns
        row: dict[str, object] = {
            "source_file": FILES["ADAS"],
            "field_name": field,
            "field_found": found,
            "observed_dtype": "",
            "nonblank_count": "",
            "example_non_sensitive_values_or_format": "",
            "observed_value_format": "",
            "appears_usable_for_longitudinal_ordering": "",
            "ambiguity_requiring_confirmation": "",
        }
        if found:
            series = raw_frame[field]
            example, value_format = safe_longitudinal_example(field, series)
            ordering, ambiguity = longitudinal_ordering_assessment(field)
            row.update(
                {
                    "observed_dtype": str(inferred_frame[field].dtype),
                    "nonblank_count": int((~raw_missing_mask(series)).sum()),
                    "example_non_sensitive_values_or_format": example,
                    "observed_value_format": value_format,
                    "appears_usable_for_longitudinal_ordering": ordering,
                    "ambiguity_requiring_confirmation": ambiguity,
                }
            )
        else:
            row["ambiguity_requiring_confirmation"] = (
                f"Field absent from ADAS export; {CONFIRMATION}."
            )
        rows.append(row)
    return rows


def main() -> None:
    raw_frames, inferred_frames = load_files()
    mapping_rows, missing_rows = build_mapping_and_missing_rows(
        raw_frames, inferred_frames
    )
    longitudinal_rows = build_longitudinal_rows(raw_frames, inferred_frames)

    OUTPUT_DIRECTORY.mkdir(parents=True, exist_ok=True)
    pd.DataFrame(mapping_rows).to_csv(
        OUTPUT_DIRECTORY / "adni_candidate_variable_mapping.csv",
        index=False,
        encoding="utf-8",
    )
    pd.DataFrame(missing_rows).to_csv(
        OUTPUT_DIRECTORY / "adni_candidate_missing_codes.csv",
        index=False,
        encoding="utf-8",
    )
    pd.DataFrame(longitudinal_rows).to_csv(
        OUTPUT_DIRECTORY / "adni_longitudinal_field_inventory.csv",
        index=False,
        encoding="utf-8",
    )

    print(f"Candidate mapping rows: {len(mapping_rows)}")
    print(f"Candidate missing-code rows: {len(missing_rows)}")
    print(f"Longitudinal inventory rows: {len(longitudinal_rows)}")


if __name__ == "__main__":
    main()
