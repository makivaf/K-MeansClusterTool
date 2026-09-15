# Frozen Simulation Runs cohort

The backend-only publication command creates `apps/api/private/simulation-cohort/roster.json`
and `provenance.json`. This directory is ignored by Git, outside research workspace
cleanup, and has no public HTTP route. Back it up as private participant data.

## Deliberate publication

From the repository root, explicitly select a validated backend upload:

```powershell
npm run cohort:publish -w @ad-clustering/api -- C:\absolute\repository\apps\api\uploads\upload-<timestamp>-<suffix>
```

Only a direct backend upload directory with the existing upload naming convention
is accepted. Diagnostic workspaces and arbitrary cohort CSVs are not publication
inputs. The command copies the seven validated exports into an isolated private
workspace and runs the repository's unchanged scripts, in order:

1. `audit_adni_inputs.py`
2. `audit_candidate_mapping.py`
3. `reconcile_variable_dictionary.py`
4. `construct_study_entry_cohort.py`

Python defaults to the repository `.venv`; `RESEARCH_PYTHON` can select an installed
environment with the constructor's existing dependencies. No analytical stages
or simulation sampling execute. No existing research orchestrator is changed.

Publication reads the freshly constructed `study_entry_cohort_unimputed.csv`,
rejects missing/invalid identifiers, missing phases, duplicate RIDs and unknown
phases, and retains only original `ENTRY_PHASE` membership in ADNI1, ADNIGO,
ADNI2, and ADNI3. ADNI4 and TEAM entry participants are out of scope. The roster
must have exactly 2,437 unique RIDs with phase counts 819, 130, 789, and 699.
It contains only string `RID` and `ENTRY_PHASE` fields, sorted by numeric RID
without converting identifiers through floating-point numbers.

The validated roster and metadata publish together by directory rename. Repeating
publication with identical source bytes, inputs, scripts, and roster returns the
existing publication. A different source or roster is rejected; there is no
automatic overwrite or "latest upload" selection. Failed construction or
validation does not change the existing roster. Temporary construction data is
deleted after the publication attempt.

## Provenance and consumption

`provenance.json` records a construction UUID, publication timestamp, schema
version, source cohort filename and SHA-256, hashes of all seven copied inputs
and four executed scripts, roster SHA-256, total count and phase counts. Hashes
identify the exact source bytes after workspace deletion; they are integrity
checks, not digital signatures or copies of the deleted source data.

`loadSimulationCohort()` reads the stable artifact without Python or the analytical
pipeline. It verifies roster integrity, the strict two-field schema, unique IDs,
allowed phases, and exact counts on every load. It fails if publication is missing
or invalid; it never falls back to fixtures, diagnostic artifacts, or clustering
assignments. Participant records are backend-internal. Future samplers can consume
these records; no sampling or public simulation metadata endpoint is added here.

Run `npm run test:simulation-cohort -w @ad-clustering/api` for synthetic-fixture
validation. Test fixtures are temporary and never written to the real cohort store.
