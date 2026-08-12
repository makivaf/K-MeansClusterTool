# Analysis Input Contract

## Scope

Upload & Run accepts one **seven-file ADNI export batch** for a coordinated local Axis A and Axis B analysis. It does not accept a prepared feature matrix, one arbitrary CSV, renamed exports, or a generic dataset. Raw input remains on the local API filesystem and is never persisted to PostgreSQL or returned by a result endpoint.

The same batch feeds both axes. Axis A uses all seven tables. Axis B uses longitudinal `TOTAL13` and actual `VISDATE` from the ADAS table, restricted through the Axis A study-entry roster produced earlier in the coordinated workflow.

## Required files and headers

Filenames are fixed by the frozen research entry points. Header matching is case-sensitive.

| File | Use | Required headers |
| --- | --- | --- |
| `All_Subjects_ADAS_10Aug2026.csv` | Axis A and B | `RID`, `PTID`, `PHASE`, `VISCODE`, `VISCODE2`, `VISDATE`, `TOTAL13` |
| `All_Subjects_CDR_10Aug2026.csv` | Axis A | common identity/phase/visit/date headers plus `CDRSB` |
| `All_Subjects_FAQ_10Aug2026.csv` | Axis A | common headers plus `FAQTOTAL` |
| `All_Subjects_MMSE_10Aug2026.csv` | Axis A | common headers plus `MMSCORE` |
| `All_Subjects_NEUROBAT_10Aug2026.csv` | Axis A | common headers plus `LIMMTOTAL`, `LDELTOTAL`, `TRAASCOR`, `TRABSCOR`, `CATANIMSC`, `BNTTOTAL`, `AVTOT1`â€“`AVTOT5`, `AVDEL30MIN` |
| `All_Subjects_NPIQ_10Aug2026.csv` | Axis A scope audit | common headers plus `NPISCORE` |
| `All_Subjects_GDSCALE_10Aug2026.csv` | Axis A | common headers plus `GDTOTAL` |

Here, common headers are `RID`, `PTID`, `PHASE`, `VISCODE`, `VISCODE2`, and `VISDATE`.

The API performs a bounded header-only validation before execution. Scientific row-level validation, visit semantics, missing-code policy, cohort construction, and transformations remain the responsibility of the authoritative Python/R research pipeline.

## Transport restrictions

- exactly seven `.csv` files in one multipart `files` upload;
- maximum 500 MiB per file;
- local/development API only; the routes are not mounted in production;
- exact filenames listed above; sanitized filenames must remain identical;
- no additional files;
- no raw row preview, participant IDs, or assignments in API responses or application results.

## Research-code evidence

- `scripts/research/audit_adni.py` defines the seven target exports.
- `scripts/research/construct_axis_a_study_entry.py` defines the Axis A source files and candidate fields.
- `scripts/research/construct_axis_b_longitudinal_cohort.py` consumes the ADAS export plus the generated Axis A roster and requires `TOTAL13`/`VISDATE`.
- `scripts/research/extract_axis_b_adas13_slopes.py` constructs the participant-specific one-dimensional slope downstream; the upload is not expected to contain precomputed slopes.

`ADNIMERGE2` materials listed in `data/README.md` are provenance/reference resources but are explicitly not read by `construct_axis_a_study_entry.py`; they are therefore not part of the executable upload manifest.
