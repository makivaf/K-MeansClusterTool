# Repository Structure and Artifact Audit

> Historical pre-migration audit. The approved migration has since been applied; use `SCIENTIFIC_ARTIFACT_MIGRATION.md` for the current paths and classifications. This file is retained as decision provenance.

Audit date: 2026-09-02  
Branch: `refactor/unified-longitudinal-pipeline`

This audit classifies the current working tree without changing scientific code, generated scientific data, frozen paths, assignments, eligibility rules, or model outputs. The active architecture is one clustering pipeline followed by longitudinal analysis of eligible members of the original fixed clusters.

## Classification summary

| Class | Meaning | Repository conclusion |
| --- | --- | --- |
| A | Active | Unified schema, adapter, execution/lifecycle/repository services, five active React result pages, Run Analysis, and the 17-stage research allowlist |
| B | Generated scientific artifact | Gitignored `data/interim` products listed below; current active artifacts remain in place |
| C | Legacy / audit-only | Independent longitudinal slope-clustering scripts, Axis adapters/contracts, compatibility persistence helpers, and explicitly labelled historical documents |
| D | Duplicate / redundant | Generated Vite configuration outputs and the retired React route/component graph; removed after reference tracing |
| E | Dead / unreferenced | Retired React pages/components that had no imports from `App.tsx` or any active module; removed |
| F | Uncertain | Any rename/move of frozen research scripts or artifacts, legacy adapters/contracts, and old scientific artifacts needed for provenance; retained pending researcher approval |

## Active execution path

`apps/api/src/services/researchStageManifest.ts` is the only ordered script allowlist. It invokes these files, in order:

1. `audit_adni.py`
2. `audit_adni_candidate_mapping.py`
3. `reconcile_adni_dictionary.py`
4. `construct_axis_a_study_entry.py`
5. `audit_axis_a_scope_npiq.py`
6. `preprocess_axis_a.py`
7. `check_sop2_environment.py`
8. `select_axis_a_k_nbclust.py`
9. `dpc_init_axis_a.py`
10. `run_axis_a_enhanced_kmeans.py`
11. `run_axis_a_baseline_comparison.py`
12. `run_axis_a_dpc_ablation.py`
13. `audit_axis_b_longitudinal.py`
14. `reconcile_axis_b_longitudinal_methodology.py`
15. `construct_axis_b_longitudinal_cohort.py`
16. `fit_unified_longitudinal_mixed_model.py`
17. `run_unified_longitudinal_analysis.py`

The first 15 filenames are historical, but they remain active. Moving them into a new `unified/` directory would require changing the allowlist, isolated-workspace materialization, tests, documentation, generated artifact paths, and provenance. `dpc_init_axis_a.py` also has a canonical LF SHA-256 gate in `researchSourceMaterializer.ts`. No such move was made.

The active application path is:

`researchPipelineOrchestrator.ts` → `executeUnifiedResearch.ts` → `unifiedResultAdapter.ts` → `runRepository.ts` → shared `UnifiedResearchRun` schema → active React routes.

`executeAnalysis.ts`, `executeResearchAxis.ts`, and `runResearchPipelines` are compatibility names that delegate to this same unified path. They do not start a separate analysis.

## Legacy scientific scripts

The following files are explicitly absent from the active allowlist and retained unchanged for historical audit:

- `extract_axis_b_adas13_slopes.py`
- `select_axis_b_k_nbclust.py`
- `select_axis_b_dpc_seeds.py`
- `reconcile_axis_b_dpc_methodology.py`
- `axis_b_final_common.py`
- `run_axis_b_final_clustering.py`
- `run_axis_b_random_ablation.py`
- `run_axis_b_sensitivity_analysis.py`
- `summarize_axis_b_results.py`

They remain in `scripts/research/` because their imports, documentation, legacy artifact names, and provenance form a connected historical record. Moving only some files would weaken reproducibility; moving the full record requires researcher approval and a manifest of old-to-new paths. `researchStageManifest.ts` maintains an explicit deprecated inventory and rejects these scripts as execution entry points.

## Scientific CSV/JSON inventory

All files under `data/interim/` are gitignored. None were moved, renamed, edited, or deleted. `data/processed/` contains only `.gitkeep`.

### Active audit and preparation intermediates

These are produced or consumed by active allowlisted stages. Old `axis_a`/`axis_b` names are retained because current scripts refer to the exact paths.

| Role | Artifacts | Exposure |
| --- | --- | --- |
| Input/dictionary audit | `adni_axis_b_field_inventory.csv`, `adni_candidate_missing_codes.csv`, `adni_candidate_variable_mapping.csv`, `adni_column_inventory.csv`, `adni_confirmed_variable_dictionary.csv`, `adni_file_inventory.csv`, `adni_missing_code_policy.csv`, `adni_missing_value_candidates.csv`, `adni_unresolved_methodology_items.csv`, `adni_visit_semantics.csv` | Local only; some inventories may reflect row/file metadata |
| Study-entry and missingness | `axis_a_duplicate_qc.csv`, `axis_a_exclusion_decisions.csv`, `axis_a_final_exclusion_preview.csv`, `axis_a_missingness_audit.csv`, `axis_a_phase_missingness.csv`, `axis_a_scope_restricted_missingness.csv`, `npiq_study_entry_qc.csv`, `npiq_visit_distribution.csv` | Local validation/audit |
| Private clustering inputs/intermediates | `axis_a_study_entry_unimputed.csv`, `axis_a_retained_unimputed.csv`, `axis_a_imputed.csv`, `axis_a_standardized.csv`, `axis_a_pca_scores.csv`, `axis_a_dpc_scores.csv` | Participant-level; never web-exposed |
| Aggregate preprocessing/PCA/k/DPC | `axis_a_preprocessing_summary.csv`, `axis_a_pca_explained_variance.csv`, `axis_a_pca_loadings.csv`, `axis_a_nbclust_votes.csv`, `axis_a_nbclust_summary.csv`, `axis_a_nbclust_tie_break.csv`, `axis_a_selected_k.csv`, `axis_a_dpc_determinism_check.csv`, `axis_a_dpc_selected_centroids.csv`, `axis_a_dpc_summary.csv` | Local intermediate; aggregate portions are consolidated by the final adapter |
| Enhanced result | `axis_a_enhanced_assignments.csv`, `axis_a_enhanced_centroids.csv`, `axis_a_enhanced_metrics.csv`, `axis_a_enhanced_reproducibility.csv`, `axis_a_enhanced_run_summary.csv` | Assignments are private; summaries are aggregate |
| Complete-pipeline baseline | `axis_a_baseline_assignments.csv`, `axis_a_baseline_cumulative_qc.csv`, `axis_a_baseline_k_selection.csv`, `axis_a_baseline_runs.csv`, `axis_a_baseline_stability.csv`, `axis_a_baseline_summary.csv`, `axis_a_baseline_vs_enhanced.csv` | Assignments are private; summaries are aggregate |
| Controlled DPC comparison | `axis_a_pca_random_assignments.csv`, `axis_a_pca_random_runs.csv`, `axis_a_pca_random_stability.csv`, `axis_a_pca_random_summary.csv`, `axis_a_dpc_ablation_comparison.csv` | Assignments are private; summaries are aggregate |
| Longitudinal preparation | `axis_b_adas_longitudinal_audit.json`, `axis_b_longitudinal_methodology_reconciliation.json`, `axis_b_longitudinal_cohort.csv`, `axis_b_longitudinal_cohort_validation.json` | Cohort CSV is participant/visit-level and private; JSON files are local audit inputs |

`axis_a_enhanced_assignments.csv` is the authoritative frozen assignment source. It is consumed by both unified longitudinal scripts, its path and SHA-256 are recorded in `unified_research_result.json`, and its current SHA-256 is `a98289c9f4548d26daf40060f13f07e18d9254f74e0f232d02cea016302090c5`. It is therefore **DO NOT TOUCH** despite the legacy name.

`axis_b_longitudinal_cohort.csv` and its validation JSON remain active inputs to the mixed model and final consolidation. Their names cannot be migrated without updating current scripts and the final artifact's hashed `inputSha256` path map.

### Current unified outputs

| Artifact | Classification | Web exposure |
| --- | --- | --- |
| `unified_longitudinal_participant_slopes.csv` | PRIVATE PARTICIPANT-LEVEL OUTPUT | Prohibited; local-only and gitignored |
| `unified_longitudinal_cohort_audit.json` | ACTIVE FINAL/AGGREGATE OUTPUT | Aggregate-safe |
| `unified_longitudinal_mixed_model.json` | ACTIVE FINAL/AGGREGATE OUTPUT | Aggregate-safe and SHA-256 validated |
| `unified_longitudinal_mixed_model.csv` | ACTIVE FINAL/AGGREGATE OUTPUT | Aggregate-safe and SHA-256 validated |
| `unified_research_result.json` | ACTIVE FINAL/AGGREGATE OUTPUT | Validated API source of truth |

The unified result records mixed-model JSON SHA-256 `bba99c61495763a17783be7a8da9b5f5e6c3b5b417e2df45537f2ad34c440080` and CSV SHA-256 `f2d5b250e2e94d5a942b0e4d8f0374391fd5f238c66339499654fd06e625f611`.

### Legacy/audit-only scientific artifacts

These belong to the abandoned independent slope-clustering design. They are not active inputs and are not safe to remove automatically because legacy scripts, compatibility adapters/tests, and historical documents reference them.

- `axis_b_adas13_slopes.csv`
- `axis_b_adas13_slopes_validation.json`
- `axis_b_dpc_methodology_reconciliation.json`
- `axis_b_dpc_seed_selection.json`
- `axis_b_final_cluster_assignments.csv`
- `axis_b_final_cluster_profiles.csv`
- `axis_b_final_clustering_metrics.json`
- `axis_b_final_research_summary.json`
- `axis_b_nbclust_k_selection.json`
- `axis_b_random_init_runs.csv`
- `axis_b_random_init_summary.json`
- `axis_b_sensitivity_analysis.json`

No generated scientific CSV/JSON was classified SAFE TO REMOVE in this audit.

## TypeScript compatibility inventory

- `unifiedResultAdapter.ts` is the only active scientific result adapter.
- `axisAResultAdapter.ts`, `axisBResultAdapter.ts`, and `axisBFrozenPrerequisites.ts` are compatibility/audit-only and are exercised only by their legacy validation suites and historical documentation.
- The shared discriminated legacy schemas and `dummyRuns` remain compatibility-only. Removing them would require an explicit API/schema migration and database-payload retention decision.
- `importAxisResults` in `runRepository.ts` is compatibility-only. The active lifecycle persists one unified result.

These items are F (uncertain), not dead: persisted legacy payloads or external imports may still depend on them even though the active UI does not.

## Frontend cleanup evidence

`App.tsx` imports only `OverviewPage`, `EnhancedKMeansPage`, `ClustersPage`, `BaselineVsEnhancedPage`, `LongitudinalProgressionPage`, and `UploadAndCluster`. A repository-wide import search showed the retired pages formed a closed graph with their old charts/tables and had no active consumer. The standalone `DataPreparationPage` and `ValidationLimitationsPage` were also unreferenced after their content moved into progressive-disclosure sections of active pages.

That closed graph was removed. The active pages read `UnifiedResearchRun` aggregate fields. React performs display formatting, sorting, filtering, and chart scaling only; PCA, clustering, cohort eligibility, slopes, confidence intervals, p-values, and mixed-model statistics remain backend artifact fields.

Generated `apps/web/vite.config.js` and `vite.config.d.ts` duplicated `vite.config.ts`. The web TypeScript configs now emit build output and metadata under ignored `apps/web/.tsbuild/`, leaving the TypeScript config as the single source file.

## Documentation status

- Current: `README.md`, `ANALYSIS_INPUT_CONTRACT.md`, `UNIFIED_RESEARCH_PIPELINE.md`, `UNIFIED_RESULTS_AUDIT.md`, and this audit.
- Historical documents with Axis A/Axis B methodology are retained and prominently labelled legacy/historical.
- Old scientific names inside historical documents are intentional evidence, not active terminology.

## Recommended final structure

Keep the current shallow structure until a researcher approves a provenance migration:

```text
scripts/research/
  README.md                         active/deprecated manifest and provenance rules
  <17 active historical/frozen paths>
  <9 deprecated audit-only paths>
apps/api/src/services/
  researchStageManifest.ts         execution/deprecation source of truth
  unifiedResultAdapter.ts          active result adapter
  <legacy adapters>                compatibility-only, documented
apps/web/src/
  pages/                            five result pages plus Run Analysis
  components/                      only components reachable from active pages
packages/shared/src/
  schema.ts                        unified plus compatibility contracts
data/interim/                      local generated artifacts, all gitignored
docs/
  UNIFIED_*                        current methodology/results
  REPOSITORY_STRUCTURE_AUDIT.md    current structure/artifact classification
  <labelled historical records>
```

A future `scripts/research/legacy/` move is reasonable only as one reviewed migration that preserves a path map, historical hashes, import behavior, and reproduction instructions. It should not be mixed into this scientific freeze.
