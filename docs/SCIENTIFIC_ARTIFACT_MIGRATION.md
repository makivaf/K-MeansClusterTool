# Unified Pipeline Migration Record

Migration date: 2026-09-02  
Branch: `refactor/unified-longitudinal-pipeline`

This is the authoritative record of the controlled naming and directory migration. It changes repository organization and provenance labels only. It does not alter cohort construction, clustering, eligibility, assignments, mixed-effects estimates, or any frozen scientific result.

## Active research sources

The active allowlisted pipeline now uses role-based paths:

- `scripts/research/study_entry/`: input audits, dictionary reconciliation, study-entry cohort construction, preprocessing/PCA, NbClust index voting, DPC initialization, and enhanced K-Means.
- `scripts/research/comparison/`: baseline comparison and DPC-initialization comparison.
- `scripts/research/longitudinal/`: longitudinal record audit, methodology reconciliation, cohort construction, mixed-effects model, and unified result consolidation.
- `scripts/research/validation/`: clustering environment validation.

The ordered manifest in `apps/api/src/services/researchStageManifest.ts` is the sole active script allowlist. Script names formerly containing `axis_a` or `axis_b` were renamed to describe their pipeline role. Repository-root and artifact-path references were updated without changing scientific formulas or decision rules.

## Active artifact renames

All path-only moves were checked by SHA-256 before and after the move. CSV moves also retained the same header and row count.

| Former prefix/name | Active replacement |
| --- | --- |
| `axis_a_study_entry_unimputed.csv` | `study_entry_cohort_unimputed.csv` |
| `axis_a_duplicate_qc.csv` | `study_entry_duplicate_qc.csv` |
| `axis_a_exclusion_decisions.csv` | `study_entry_exclusion_decisions.csv` |
| `axis_a_missingness_audit.csv` | `study_entry_missingness_audit.csv` |
| `axis_a_phase_missingness.csv` | `study_entry_phase_missingness.csv` |
| `axis_a_final_exclusion_preview.csv` | `study_entry_final_exclusion_preview.csv` |
| `axis_a_scope_restricted_missingness.csv` | `study_entry_scope_restricted_missingness.csv` |
| `axis_a_retained_unimputed.csv` | `clustering_features_unimputed.csv` |
| `axis_a_imputed.csv` | `clustering_features_imputed.csv` |
| `axis_a_standardized.csv` | `clustering_features_standardized.csv` |
| `axis_a_preprocessing_summary.csv` | `clustering_preprocessing_summary.csv` |
| `axis_a_pca_scores.csv` | `clustering_pca_scores.csv` |
| `axis_a_pca_explained_variance.csv` | `clustering_pca_explained_variance.csv` |
| `axis_a_pca_loadings.csv` | `clustering_pca_loadings.csv` |
| `axis_a_nbclust_votes.csv` | `clustering_nbclust_votes.csv` |
| `axis_a_nbclust_summary.csv` | `clustering_nbclust_summary.csv` |
| `axis_a_nbclust_tie_break.csv` | `clustering_nbclust_tie_break.csv` |
| `axis_a_selected_k.csv` | `clustering_selected_k.csv` |
| `axis_a_dpc_scores.csv` | `clustering_dpc_scores.csv` |
| `axis_a_dpc_selected_centroids.csv` | `clustering_dpc_selected_centroids.csv` |
| `axis_a_dpc_summary.csv` | `clustering_dpc_summary.csv` |
| `axis_a_dpc_determinism_check.csv` | `clustering_dpc_determinism_check.csv` |
| `axis_a_enhanced_assignments.csv` | `unified_cluster_assignments.csv` |
| `axis_a_enhanced_centroids.csv` | `enhanced_kmeans_centroids.csv` |
| `axis_a_enhanced_metrics.csv` | `enhanced_kmeans_metrics.csv` |
| `axis_a_enhanced_run_summary.csv` | `enhanced_kmeans_run_summary.csv` |
| `axis_a_enhanced_reproducibility.csv` | `enhanced_kmeans_reproducibility.csv` |
| `axis_a_baseline_*` | `baseline_kmeans_*` |
| `axis_a_baseline_vs_enhanced.csv` | `baseline_vs_enhanced_metrics.csv` |
| `axis_a_pca_random_*` | `dpc_comparison_random_*` |
| `axis_a_dpc_ablation_comparison.csv` | `dpc_initialization_comparison.csv` |
| `adni_axis_b_field_inventory.csv` | `adni_longitudinal_field_inventory.csv` |
| `axis_b_adas_longitudinal_audit.json` | `longitudinal_records_audit.json` |
| `axis_b_longitudinal_methodology_reconciliation.json` | `longitudinal_methodology_reconciliation.json` |
| `axis_b_longitudinal_cohort.csv` | `unified_longitudinal_cohort.csv` |
| `axis_b_longitudinal_cohort_validation.json` | `unified_longitudinal_cohort_validation.json` |

No old/new duplicate remains in `data/interim`.

## Frozen provenance checks

- `unified_cluster_assignments.csv`: `a98289c9f4548d26daf40060f13f07e18d9254f74e0f232d02cea016302090c5`
- `unified_longitudinal_cohort.csv`: `333dabedb1bc948c3b403cdf828d343dc76f74c821a0fdb43db9133588aed8b8`
- `unified_longitudinal_mixed_model.csv`: `f2d5b250e2e94d5a942b0e4d8f0374391fd5f238c66339499654fd06e625f611`

Two JSON/summary hashes changed only because embedded provenance paths or pipeline labels were updated:

- `enhanced_kmeans_run_summary.csv`: `e77c01dab12b7bae13501a35c2d720965cacb1b0d64c1099694b7685f0a91088`
- `unified_longitudinal_mixed_model.json`: `f5755797dcab023300d0a4927036610fa4551b72801b664b87b4eafcf0f5ec4b`

The aggregate hash manifest was updated to match those provenance-only changes. Existing frozen audit JSON files were not regenerated; their historical Axis-named metadata keys remain provenance evidence.

## Legacy isolation and compatibility

The nine superseded independent longitudinal slope-clustering scripts are preserved under `scripts/research/legacy/old_longitudinal_clustering/`. Their twelve generated artifacts are preserved locally under `data/legacy/old_longitudinal_clustering/`. The active materializer, script resolver, and ordered manifest exclude that directory from execution.

Axis-named shared schemas, adapters, fixtures, repository import helpers, and frozen-prerequisite utilities remain solely for migration/audit compatibility. Renaming or deleting them would break historical payload provenance and is outside this controlled cleanup.

## Frozen values

The migration preserves: parent cohort 2,437; clusters 1,553 and 884; six PCs; 87.479459% variance; NbClust k = 2 with 9/24 usable votes; longitudinal cohort 1,845; eligible cluster counts 1,233 and 612; 11,111 observations; and Time × Cluster approximately 1.469681. No second longitudinal K-Means is active.
