# Research Script Organization

The Python files in this directory are the authoritative Axis A and Axis B
research implementation. They intentionally remain in one flat directory.
Their logical organization is recorded in
`apps/api/src/services/researchStageManifest.ts` and summarized below.

## Logical groups

### Shared and ADNI audits

- `audit_adni.py`
- `audit_adni_candidate_mapping.py`
- `reconcile_adni_dictionary.py`
- `check_sop2_environment.py`

### Axis A preprocessing

- `construct_axis_a_study_entry.py`
- `audit_axis_a_scope_npiq.py`
- `preprocess_axis_a.py`

### Axis A k-selection

- `select_axis_a_k_nbclust.py`

### Axis A initialization

- `dpc_init_axis_a.py`

### Axis A clustering

- `run_axis_a_enhanced_kmeans.py`

### Axis A validation

- `run_axis_a_baseline_comparison.py`
- `run_axis_a_dpc_ablation.py`

### Axis B longitudinal preprocessing

- `audit_axis_b_longitudinal.py`
- `reconcile_axis_b_longitudinal_methodology.py`
- `construct_axis_b_longitudinal_cohort.py`
- `extract_axis_b_adas13_slopes.py`

### Axis B k-selection

- `select_axis_b_k_nbclust.py`

### Axis B clustering

- `axis_b_final_common.py` (shared Axis B module; not an entry point)
- `run_axis_b_final_clustering.py`

### Axis B validation

- `select_axis_b_dpc_seeds.py`
- `reconcile_axis_b_dpc_methodology.py`
- `run_axis_b_random_ablation.py`
- `run_axis_b_sensitivity_analysis.py`
- `summarize_axis_b_results.py`

## Why the files are not physically grouped

Physical relocation is prohibited during normal application integration because:

- nineteen scripts derive the repository root from their current depth using
  `Path(__file__).resolve().parents[2]`;
- Axis B scripts use imports that depend on the current flat module directory;
- Axis B DPC audit and reconciliation artifacts record the path and SHA-256 of
  the Axis A DPC implementation;
- final Axis B utilities enforce hashes of authoritative research artifacts;
- existing Axis A and Axis B outputs are frozen and authoritative.

Moving these files would therefore require a separately reviewed reproducibility
migration with isolated golden-output verification. Application orchestration
must use the existing paths and must not rewrite research calculations.

## Validated execution plans

- **Axis A:** the shared/audit prerequisites followed by Axis A preprocessing,
  environment validation, k-selection, initialization, clustering, and both
  validation stages.
- **Axis B:** the complete current Axis A prerequisite sequence followed by all
  Axis B longitudinal, k-selection, DPC suitability/reconciliation, final
  clustering, ablation, sensitivity, and summary stages. Only the requested
  Axis B aggregate result is adapted and persisted by the application.

Research execution must occur in an isolated workspace. Do not execute migration
or application tests against the authoritative `data/interim` directory.

## Axis B slope numerical provenance

`extract_axis_b_adas13_slopes.py` is methodologically frozen. Its authoritative
CSV was produced, and has been reproduced byte-for-byte, with this historical
numerical environment:

- Python 3.13.7
- NumPy 2.4.2
- pandas 3.0.1
- SciPy 1.17.1
- Windows AMD64

The interpreter used to recover that environment on the original local
validation machine was
`C:\Users\Lenovo\AppData\Local\Programs\Python\Python313\python.exe`. That
absolute path is provenance, not a portable application default. Each local
environment configures its reproducing interpreter with
`AXIS_B_SLOPE_PYTHON`.

The authoritative `axis_b_adas13_slopes.csv` SHA-256 is
`22cdd55303a873d62889a40190caf061f95c4ed81d7d7c82eb8f454886ed0280`.
Application orchestration checks this exact hash immediately after slope
extraction and stops before Axis B k-selection if it differs. A configured but
invalid dedicated interpreter is an environment failure; it is never silently
replaced. If `AXIS_B_SLOPE_PYTHON` is unset, slope extraction uses the standard
research interpreter and remains subject to the same exact hash gate.

Only slope extraction uses the dedicated environment. Axis A, R/rpy2/NbClust,
and every later Axis B stage continue on `RESEARCH_PYTHON` or the project
`.venv`. This separation records a numerical-provenance requirement and does
not alter OLS, cohort construction, features, k-selection, clustering, or any
other research methodology.

## Runtime reproduction and authoritative frozen prerequisites

Final Axis B research code enforces exact hashes for four prerequisite files:

| Frozen prerequisite | Producing stage | Authoritative SHA-256 |
| --- | --- | --- |
| `axis_b_longitudinal_cohort.csv` | `construct_axis_b_longitudinal_cohort.py` | `333dabedb1bc948c3b403cdf828d343dc76f74c821a0fdb43db9133588aed8b8` |
| `axis_b_adas13_slopes.csv` | `extract_axis_b_adas13_slopes.py` | `22cdd55303a873d62889a40190caf061f95c4ed81d7d7c82eb8f454886ed0280` |
| `axis_b_nbclust_k_selection.json` | `select_axis_b_k_nbclust.py` | `f26ebeda169479c64cfa42859f97595ba1c0e9501f33a4631117274724b4943c` |
| `axis_b_dpc_seed_selection.json` | `select_axis_b_dpc_seeds.py` | `782afd7dc4759d8875fe6517d6cc03204e9f49929817e5eae1ccdf7390b1c6d3` |

A **runtime reproduction artifact** is newly generated inside an isolated
application workspace to prove that the current execution reproduces the
scientific prerequisite. An **authoritative frozen artifact** is the immutable
historical file whose exact bytes are required by downstream frozen validation.

The k-selection JSON records absolute interpreter and output paths. Its runtime
copy is therefore expected to be byte-different in an isolated workspace even
when every scientific result is equivalent. Application orchestration compares
an explicit allowlist of scientific fields, preserves the runtime artifact and
both hashes in a workspace audit, verifies the repository-controlled frozen
source, and only then copies the authoritative bytes to the downstream input
path. DPC receives the authoritative k-selection prerequisite, executes normally,
and passes its own exact semantic-equivalence and hash gate. Cohort and slope
artifacts remain exact-byte prerequisites and are not normalized.

### Axis B secondary inertia numerical reproducibility

The exact historical Axis B k-selection environment was recovered:

- Python 3.13.7
- NumPy 2.5.2
- pandas 3.0.5
- SciPy 1.18.0
- scikit-learn 1.9.0
- joblib 1.5.3
- threadpoolctl 3.6.0
- R 4.6.1 and NbClust 3.0.1
- Microsoft OpenMP on the original 16-logical-processor Windows machine

In scikit-learn 1.9.0, dense K-Means inertia uses multithreaded OpenMP
accumulation. Floating-point addition is non-associative, and the original
research execution did not record a reproducible parallel reduction order.
Repeated execution with the same interpreter, packages, input, seed, labels,
and iteration counts can therefore differ in only the final inertia bits.

The affected inertia values are secondary candidate-k diagnostics. They did
not determine the NbClust vote winner or selected `k`. The application compares
only `secondary_diagnostic_kmeans.metrics[].inertia` with an absolute threshold
of `1e-11`, candidate by candidate. The runtime audit records authoritative and
runtime inertia, absolute difference, threshold, and pass status. Every other
decision-determining and deterministic scientific field remains exact,
including the slope hash, participant/input definition, candidate-k and method
configuration, every index result and vote, selected `k`, repeated-pass result,
iteration counts, and all other diagnostic metrics. No global numerical
tolerance exists.

This substitution does not claim byte-identical runtime reproduction. It does
not skip k-selection or DPC, alter a hash, rewrite authoritative JSON, round
runtime inertia, expose an artifact path to upload input, or change any research
calculation. An over-threshold inertia difference, any exact-field mismatch, or
any source/copy hash failure stops execution before final clustering. DPC has no
numerical exception unless separate execution evidence and review explicitly
approve one.

### Canonical source bytes in disposable workspaces

The frozen Python sources are committed as LF text. On Windows, the working
tree may contain CRLF bytes even though the committed Git blob and scientific
source text are unchanged. Because the DPC audit records the exact bytes of
`dpc_init_axis_a.py`, copying raw Windows checkout bytes would create a false
provenance mismatch. Its committed Git blob and LF-normalized source SHA-256 is
`bda58cfd431934c7c2077bc0fdc583a9fe5a5a771f18682d7d14a4edd9bec513`.

The application resolves this only while materializing an isolated execution
workspace: copied `.py` files under `scripts/research` use canonical LF bytes,
and the DPC source is verified against that historical hash before execution.
The repository working tree and Git index are not rewritten. CSV, JSON, binary,
raw ADNI, authoritative interim, and uploaded files are copied or linked without
line-ending normalization. The DPC scientific-equivalence contract remains
exact and continues to include the recorded source hash.
