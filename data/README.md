# Research Data

This directory contains the local data workspace for the Alzheimer's disease clustering research pipeline.

## Directory Structure

- `raw/adni/` — Original ADNI exports. Do not modify.
- `interim/` — Intermediate datasets produced during preprocessing and data auditing.
- `processed/` — Final processed datasets used by the research pipeline.

## Required Raw ADNI Data

Place the following files in `data/raw/adni/`:

- All_Subjects_ADAS_10Aug2026.csv
- All_Subjects_CDR_10Aug2026.csv
- All_Subjects_FAQ_10Aug2026.csv
- All_Subjects_MMSE_10Aug2026.csv
- All_Subjects_NEUROBAT_10Aug2026.csv
- ADNIMERGE2.tar.gz
- ADNIMERGE2 R package extracted from the archive
- ADNIMERGE2 R Package Methods documentation

These files were obtained from the ADNI/LONI IDA system.

## Important

Raw ADNI data must not be committed to this repository.

Each authorized researcher must obtain and maintain the required ADNI data locally according to applicable ADNI data-use requirements.