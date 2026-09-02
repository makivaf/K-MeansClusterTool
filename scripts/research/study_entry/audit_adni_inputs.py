"""Inventory the seven thesis-scope ADNI CSV exports without transforming them.

The audit deliberately treats only empty or whitespace-only CSV fields as raw
missing values. Potential sentinel/textual codes are retained as observed and
reported separately for later interpretation.
"""

from __future__ import annotations

import csv
import json
import re
from decimal import Decimal, InvalidOperation
from pathlib import Path

import pandas as pd


REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
RAW_DIRECTORY = REPOSITORY_ROOT / "data" / "raw" / "adni"
OUTPUT_DIRECTORY = REPOSITORY_ROOT / "data" / "interim"

TARGET_FILES = (
    "All_Subjects_ADAS_10Aug2026.csv",
    "All_Subjects_CDR_10Aug2026.csv",
    "All_Subjects_FAQ_10Aug2026.csv",
    "All_Subjects_MMSE_10Aug2026.csv",
    "All_Subjects_NEUROBAT_10Aug2026.csv",
    "All_Subjects_NPIQ_10Aug2026.csv",
    "All_Subjects_GDSCALE_10Aug2026.csv",
)

TEXTUAL_MISSING_CANDIDATES = {
    "na",
    "n/a",
    "nan",
    "null",
    "none",
    "missing",
    ".",
}
NUMERIC_MISSING_CANDIDATES = {Decimal("-4"), Decimal("-1")}


def normalized_name(column_name: str) -> str:
    """Normalize a column name only for field classification."""
    return re.sub(r"[^A-Z0-9]+", "_", column_name.strip().upper()).strip("_")


def identifier_fields(columns: list[str]) -> list[str]:
    """Return conservatively identified participant identifier fields."""
    exact_names = {
        "RID",
        "PTID",
        "SUBJECT",
        "SUBJECT_ID",
        "SUBJECTID",
        "PARTICIPANT",
        "PARTICIPANT_ID",
        "PARTICIPANTID",
    }
    fields: list[str] = []
    for column in columns:
        name = normalized_name(column)
        if (
            name in exact_names
            or "PARTICIPANT_ID" in name
            or "SUBJECT_ID" in name
        ):
            fields.append(column)
    return fields


def visit_fields(columns: list[str]) -> list[str]:
    """Return columns whose names explicitly indicate a visit code/visit."""
    fields: list[str] = []
    for column in columns:
        name = normalized_name(column)
        if name in {"VISCODE", "VISCODE2"} or "VISIT" in name:
            fields.append(column)
    return fields


def date_fields(columns: list[str]) -> list[str]:
    """Return columns whose names explicitly indicate dates."""
    exact_names = {
        "EXAMDATE",
        "VISDATE",
        "USERDATE",
        "USERDATE2",
        "UPDATE_STAMP",
    }
    return [
        column
        for column in columns
        if normalized_name(column) in exact_names
        or normalized_name(column).endswith("_DATE")
        or normalized_name(column).endswith("_STAMP")
    ]


def choose_participant_field(fields: list[str]) -> str | None:
    priorities = ("PTID", "RID")
    by_normalized_name = {normalized_name(field): field for field in fields}
    for name in priorities:
        if name in by_normalized_name:
            return by_normalized_name[name]
    return fields[0] if fields else None


def choose_visit_field(visits: list[str], dates: list[str]) -> str | None:
    priorities = ("VISCODE2", "VISCODE", "EXAMDATE")
    all_fields = visits + [field for field in dates if field not in visits]
    by_normalized_name = {normalized_name(field): field for field in all_fields}
    for name in priorities:
        if name in by_normalized_name:
            return by_normalized_name[name]
    return all_fields[0] if all_fields else None


def read_exact_header(path: Path) -> list[str]:
    with path.open("r", encoding="utf-8-sig", newline="") as source:
        return next(csv.reader(source))


def is_raw_missing(series: pd.Series) -> pd.Series:
    """Identify only structurally blank or whitespace-only raw fields."""
    return series.str.strip().eq("")


def nonmissing_unique_count(series: pd.Series) -> int:
    cleaned = series.loc[~is_raw_missing(series)].str.strip()
    return int(cleaned.nunique(dropna=False))


def candidate_category(raw_value: str) -> str | None:
    stripped = raw_value.strip()
    if raw_value == "":
        return "blank_string"
    if stripped == "":
        return "whitespace_only"
    if stripped.casefold() in TEXTUAL_MISSING_CANDIDATES:
        return "textual_missing_code"
    try:
        numeric_value = Decimal(stripped)
    except InvalidOperation:
        return None
    if numeric_value in NUMERIC_MISSING_CANDIDATES:
        return "numeric_sentinel_candidate"
    return None


def candidate_rows(filename: str, frame: pd.DataFrame) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    total_rows = len(frame)
    for column in frame.columns:
        counts = frame[column].value_counts(dropna=False)
        for raw_value, count in counts.items():
            category = candidate_category(raw_value)
            if category is None:
                continue
            rows.append(
                {
                    "filename": filename,
                    "column_name": column,
                    "candidate_category": category,
                    "observed_raw_value": raw_value,
                    "observed_value_display": (
                        "<blank>"
                        if raw_value == ""
                        else repr(raw_value)
                        if raw_value.strip() == ""
                        else raw_value
                    ),
                    "count": int(count),
                    "percentage_of_rows": (
                        float(count) / total_rows * 100 if total_rows else 0.0
                    ),
                    "counted_as_raw_missing": category
                    in {"blank_string", "whitespace_only"},
                }
            )
    return rows


def duplicate_statistics(
    frame: pd.DataFrame, participant_field: str | None, visit_field: str | None
) -> dict[str, object]:
    if participant_field is None or visit_field is None:
        return {
            "duplicate_key_fields": "",
            "duplicate_key_complete_rows": 0,
            "duplicate_key_incomplete_rows": len(frame),
            "duplicate_key_group_count": 0,
            "duplicate_rows_all_occurrences": 0,
            "duplicate_rows_beyond_first": 0,
        }

    key_fields = [participant_field, visit_field]
    complete_mask = ~frame[key_fields].apply(is_raw_missing).any(axis=1)
    complete_keys = frame.loc[complete_mask, key_fields].apply(
        lambda series: series.str.strip()
    )
    all_duplicate_mask = complete_keys.duplicated(keep=False)
    beyond_first_mask = complete_keys.duplicated(keep="first")
    duplicate_groups = (
        complete_keys.loc[all_duplicate_mask].drop_duplicates().shape[0]
    )
    return {
        "duplicate_key_fields": json.dumps(key_fields, ensure_ascii=False),
        "duplicate_key_complete_rows": int(complete_mask.sum()),
        "duplicate_key_incomplete_rows": int((~complete_mask).sum()),
        "duplicate_key_group_count": int(duplicate_groups),
        "duplicate_rows_all_occurrences": int(all_duplicate_mask.sum()),
        "duplicate_rows_beyond_first": int(beyond_first_mask.sum()),
    }


def audit_file(path: Path) -> tuple[dict[str, object], list[dict[str, object]], list[dict[str, object]]]:
    exact_columns = read_exact_header(path)
    if len(exact_columns) != len(set(exact_columns)):
        raise ValueError(f"Duplicate column names are ambiguous in {path.name}")

    raw_frame = pd.read_csv(
        path,
        dtype=str,
        keep_default_na=False,
        na_filter=False,
        encoding="utf-8-sig",
        low_memory=False,
    )
    inferred_frame = pd.read_csv(path, encoding="utf-8-sig", low_memory=False)

    if list(raw_frame.columns) != exact_columns:
        raise ValueError(f"Parsed columns differ from the exact CSV header in {path.name}")
    if list(inferred_frame.columns) != exact_columns:
        raise ValueError(f"Inferred columns differ from the exact CSV header in {path.name}")
    if len(raw_frame) != len(inferred_frame):
        raise ValueError(f"Raw and inferred row counts differ in {path.name}")

    ids = identifier_fields(exact_columns)
    visits = visit_fields(exact_columns)
    dates = date_fields(exact_columns)
    participant_field = choose_participant_field(ids)
    visit_field = choose_visit_field(visits, dates)

    participant_counts = {
        field: nonmissing_unique_count(raw_frame[field]) for field in ids
    }
    visit_values = {
        field: sorted(
            raw_frame.loc[~is_raw_missing(raw_frame[field]), field]
            .str.strip()
            .unique()
            .tolist()
        )
        for field in visits
    }

    file_row: dict[str, object] = {
        "filename": path.name,
        "row_count": len(raw_frame),
        "column_count": len(exact_columns),
        "column_names_json": json.dumps(exact_columns, ensure_ascii=False),
        "identifier_fields_json": json.dumps(ids, ensure_ascii=False),
        "visit_code_fields_json": json.dumps(visits, ensure_ascii=False),
        "date_fields_json": json.dumps(dates, ensure_ascii=False),
        "participant_unique_counts_json": json.dumps(
            participant_counts, ensure_ascii=False
        ),
        "participant_identifier_used": participant_field or "",
        "unique_participants": (
            participant_counts[participant_field] if participant_field else ""
        ),
        "unique_visit_code_values_json": json.dumps(
            visit_values, ensure_ascii=False
        ),
    }
    file_row.update(duplicate_statistics(raw_frame, participant_field, visit_field))

    column_rows: list[dict[str, object]] = []
    total_rows = len(raw_frame)
    for position, column in enumerate(exact_columns, start=1):
        missing_count = int(is_raw_missing(raw_frame[column]).sum())
        column_rows.append(
            {
                "filename": path.name,
                "column_position": position,
                "column_name": column,
                "pandas_inferred_dtype": str(inferred_frame[column].dtype),
                "raw_missing_count": missing_count,
                "raw_missing_percentage": (
                    missing_count / total_rows * 100 if total_rows else 0.0
                ),
                "is_likely_participant_identifier": column in ids,
                "is_visit_code_field": column in visits,
                "is_date_field": column in dates,
            }
        )

    return file_row, column_rows, candidate_rows(path.name, raw_frame)


def main() -> None:
    missing_files = [name for name in TARGET_FILES if not (RAW_DIRECTORY / name).is_file()]
    if missing_files:
        raise FileNotFoundError(
            "The audit requires all seven named CSV exports; missing: "
            + ", ".join(missing_files)
        )

    file_rows: list[dict[str, object]] = []
    column_rows: list[dict[str, object]] = []
    missing_candidate_rows: list[dict[str, object]] = []

    for filename in TARGET_FILES:
        file_row, file_columns, file_candidates = audit_file(RAW_DIRECTORY / filename)
        file_rows.append(file_row)
        column_rows.extend(file_columns)
        missing_candidate_rows.extend(file_candidates)

    OUTPUT_DIRECTORY.mkdir(parents=True, exist_ok=True)
    pd.DataFrame(file_rows).to_csv(
        OUTPUT_DIRECTORY / "adni_file_inventory.csv", index=False, encoding="utf-8"
    )
    pd.DataFrame(column_rows).to_csv(
        OUTPUT_DIRECTORY / "adni_column_inventory.csv", index=False, encoding="utf-8"
    )
    candidate_columns = [
        "filename",
        "column_name",
        "candidate_category",
        "observed_raw_value",
        "observed_value_display",
        "count",
        "percentage_of_rows",
        "counted_as_raw_missing",
    ]
    pd.DataFrame(missing_candidate_rows, columns=candidate_columns).to_csv(
        OUTPUT_DIRECTORY / "adni_missing_value_candidates.csv",
        index=False,
        encoding="utf-8",
    )

    print(f"Audited {len(file_rows)} CSV files.")
    print(f"File inventory rows: {len(file_rows)}")
    print(f"Column inventory rows: {len(column_rows)}")
    print(f"Missing-value candidate rows: {len(missing_candidate_rows)}")


if __name__ == "__main__":
    main()
