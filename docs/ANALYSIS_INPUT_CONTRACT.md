# Analysis Input Contract

## Scope

Run Analysis accepts one **seven-file ADNI export batch** for one local unified analysis. It does not accept a prepared feature matrix, one arbitrary CSV, renamed exports, or a generic dataset. Raw input remains on the local API filesystem and is never persisted to PostgreSQL or returned by a result endpoint.

The frozen scripts additionally verify thesis-run shapes and content hashes of generated artifacts. Therefore the current executable contract is an authorized local copy of the **10Aug2026 thesis source snapshot**, not a newer export merely renamed to match. A different cohort may pass the header gate but will fail research validation; such failure is intentional until the scientific pipeline is explicitly generalized and revalidated.

The same batch feeds both dependent stages. Enhanced K-Means cohort construction uses all seven tables. Longitudinal progression uses `TOTAL13` and actual `VISDATE` from the ADAS table, restricted to members of the original enhanced-clustering study-entry roster.

## Required files and headers

Filenames are fixed by the frozen research entry points. Header matching is case-sensitive.

| File | Use | Required headers |
| --- | --- | --- |
| `All_Subjects_ADAS_10Aug2026.csv` | Clustering and longitudinal progression | `RID`, `PTID`, `PHASE`, `VISCODE`, `VISCODE2`, `VISDATE`, `TOTAL13` |
| `All_Subjects_CDR_10Aug2026.csv` | Clustering | common identity/phase/visit/date headers plus `CDRSB` |
| `All_Subjects_FAQ_10Aug2026.csv` | Clustering | common headers plus `FAQTOTAL` |
| `All_Subjects_MMSE_10Aug2026.csv` | Clustering | common headers plus `MMSCORE` |
| `All_Subjects_NEUROBAT_10Aug2026.csv` | Clustering | common headers plus `LIMMTOTAL`, `LDELTOTAL`, `TRAASCOR`, `TRABSCOR`, `CATANIMSC`, `BNTTOTAL`, `AVTOT1`–`AVTOT5`, `AVDEL30MIN` |
| `All_Subjects_NPIQ_10Aug2026.csv` | Clustering scope audit | common headers plus `NPISCORE` |
| `All_Subjects_GDSCALE_10Aug2026.csv` | Clustering | common headers plus `GDTOTAL` |

Here, common headers are `RID`, `PTID`, `PHASE`, `VISCODE`, `VISCODE2`, and `VISDATE`.

The API performs bounded header-only validation before execution. Scientific row-level validation, visit semantics, missing-code policy, cohort construction, and transformations remain the responsibility of the authoritative Python/R research pipeline.

## Transport restrictions

- exactly seven `.csv` files in one multipart `files` upload;
- maximum 500 MiB per file;
- local/development API only; the routes are not mounted in production;
- exact filenames listed above; sanitized filenames must remain identical;
- no additional files;
- no raw row preview, participant IDs, or assignments in API responses or application results.

## Research-code evidence

- `scripts/research/study_entry/audit_adni_inputs.py` defines the seven target exports.
- `scripts/research/study_entry/construct_study_entry_cohort.py` defines the clustering source files and candidate fields.
- `scripts/research/longitudinal/construct_longitudinal_cohort.py` consumes the ADAS export plus the generated study-entry roster and requires `TOTAL13`/`VISDATE`.
- `scripts/research/longitudinal/fit_longitudinal_mixed_model.py` consumes the validated cohort and original fixed assignments; it never clusters longitudinal observations or participant slopes.

`ADNIMERGE2` materials listed in `data/README.md` are provenance/reference resources but are explicitly not read by `construct_study_entry_cohort.py`; they are therefore not part of the executable upload manifest.
