# Active Unified Dependency Graph

Captured before the controlled repository migration on 2026-09-02.

This is the pre-migration dependency snapshot. See `SCIENTIFIC_ARTIFACT_MIGRATION.md` for the completed path mapping and current legacy classification.

## Execution graph

```text
seven validated ADNI CSV uploads
  -> analysisInputManifest.ts
  -> researchPipelineOrchestrator.ts
  -> researchStageManifest.ts ordered allowlist
     -> input/dictionary audits
     -> study-entry cohort construction
     -> scope/missingness audit
     -> preprocessing + PCA
     -> NbClust index voting
     -> deterministic DPC initialization
     -> enhanced Lloyd K-Means
     -> complete-pipeline baseline comparison
     -> controlled DPC initialization comparison
     -> longitudinal record audit/reconciliation
     -> longitudinal cohort construction
     -> random-intercept mixed-effects model
     -> unified aggregate consolidation
  -> executeUnifiedResearch.ts
  -> unifiedResultAdapter.ts
  -> runRepository.ts
  -> UnifiedResearchRun shared schema
  -> five active result pages + Run Analysis
```

There is no independent longitudinal clustering node.

## Active Python sources before migration

| Phase | Pre-migration files |
| --- | --- |
| Input/study entry | `audit_adni.py`, `audit_adni_candidate_mapping.py`, `reconcile_adni_dictionary.py`, `construct_axis_a_study_entry.py`, `audit_axis_a_scope_npiq.py` |
| Clustering preparation | `preprocess_axis_a.py`, `check_sop2_environment.py`, `select_axis_a_k_nbclust.py`, `dpc_init_axis_a.py` |
| Clustering/comparison | `run_axis_a_enhanced_kmeans.py`, `run_axis_a_baseline_comparison.py`, `run_axis_a_dpc_ablation.py` |
| Longitudinal continuation | `audit_axis_b_longitudinal.py`, `reconcile_axis_b_longitudinal_methodology.py`, `construct_axis_b_longitudinal_cohort.py`, `fit_unified_longitudinal_mixed_model.py`, `run_unified_longitudinal_analysis.py` |

## Active TypeScript dependencies

- `analysisInputManifest.ts`: exact upload allowlist and CSV header validation.
- `researchStageManifest.ts`: exact active Python order and deprecated-script exclusion.
- `researchSourceMaterializer.ts`: canonical Python bytes and DPC source SHA-256 gate.
- `researchPipelineOrchestrator.ts`: isolated workspace, safe process spawn, timeouts, and aggregate requirement.
- `executeUnifiedResearch.ts`: final adaptation, persistence, and workspace cleanup.
- `unifiedResultAdapter.ts`: strict aggregate-only artifact loading and SHA-256 verification.
- `runRepository.ts`: one current unified result, with separately classified legacy payload compatibility.
- `packages/shared/src/schema.ts`: authoritative unified result and lifecycle contracts; legacy discriminated contracts remain compatibility-only.

## Active artifact dependency chain before migration

```text
axis_a_study_entry_unimputed.csv
  -> axis_a_retained_unimputed.csv
  -> axis_a_imputed.csv
  -> axis_a_standardized.csv
  -> axis_a_pca_scores.csv
  -> axis_a_selected_k.csv + axis_a_dpc_selected_centroids.csv
  -> axis_a_enhanced_assignments.csv (authoritative fixed assignments)
  -> axis_b_longitudinal_cohort.csv
  -> unified_longitudinal_mixed_model.json/.csv
  -> unified_research_result.json
```

The final consolidation also consumes aggregate preprocessing, PCA, NbClust, DPC, enhanced-run, baseline, comparison, longitudinal-validation, and mixed-model artifacts. Every consumed path is listed in `run_unified_longitudinal_analysis.py`; every final input path and SHA-256 is recorded in `unified_research_result.json`.

## Tests and documentation coupled to active paths

- Orchestrator validation asserts active script names/order and rejects the deprecated longitudinal K-Means entry point.
- Unified adapter, local artifact, and mixed-model validations assert current artifact names, content, hashes, frozen counts, and privacy.
- Frontend contract validation asserts unified routes and aggregate-only rendering.
- `README.md`, `ANALYSIS_INPUT_CONTRACT.md`, `UNIFIED_RESEARCH_PIPELINE.md`, and `UNIFIED_RESULTS_AUDIT.md` describe the current method.
- Historical Axis documents and legacy adapter tests are not active dependencies; they are retained as labelled provenance/compatibility records.
