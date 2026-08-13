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
