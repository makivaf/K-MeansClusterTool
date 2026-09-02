# Defense Algorithm Traceability

> **LEGACY / HISTORICAL — NOT CURRENT METHODOLOGY:** This traceability packet predates the unified longitudinal continuation. Its Axis B clustering sections are preserved only as an audit record. See `UNIFIED_RESEARCH_PIPELINE.md` and `UNIFIED_RESULTS_AUDIT.md` for current claims.

## Direct answer: what was enhanced?

Axis A enhances the **method around K-Means**, principally its input representation, cluster-number selection, and centroid initialization. Median imputation and z-score standardization feed PCA; NbClust selects `k`; DPC selects real observations as deterministic initial centroids; ordinary Lloyd assignment/update iterations then optimize the K-Means objective. The work does not claim a newly invented Lloyd update rule. K-Means|| is not implemented.

The controlled comparator changes only the initialization stage: it uses random initial centroids for seeds 0-29 in the same PC1-PC6 space, with the same `k`, `n_init=1`, maximum iterations, tolerance, and Lloyd algorithm. That isolation is the evidence for discussing initialization rather than conflating PCA or `k` selection with the initializer.

## Axis A code-to-artifact trace

| Step | Authoritative implementation | Key code | Aggregate evidence |
| --- | --- | --- | --- |
| Cohort | `construct_axis_a_study_entry.py` | `FILES`, `VARIABLES`, and `main` | `axis_a_study_entry_unimputed.csv`; scope summaries |
| Missingness/features | `preprocess_axis_a.py` | scope constants lines 26-32; `validate_scope_audit` line 89; `build_axis_a_retained_table` line 103 | `axis_a_scope_restricted_missingness.csv`; `axis_a_final_exclusion_preview.csv` |
| Imputation | `preprocess_axis_a.py` | `median_impute_features` line 142 | `axis_a_preprocessing_summary.csv` |
| Scaling | `preprocess_axis_a.py` | `standardize_features` line 184 | `axis_a_standardized.csv`; preprocessing summary |
| PCA | `preprocess_axis_a.py` | `VARIANCE_THRESHOLD=0.85` line 29; `apply_pca` line 229 | `axis_a_pca_explained_variance.csv`; `axis_a_pca_scores.csv` |
| `k` selection | `select_axis_a_k_nbclust.py` | candidate range lines 31-37; `select_k_nbclust` line 344 | `axis_a_nbclust_summary.csv`; `axis_a_selected_k.csv` |
| DPC initializer | `dpc_init_axis_a.py` | PC shape lines 28-35; `dpc_init` line 87 | `axis_a_dpc_summary.csv`; private selected-centroid artifact |
| Enhanced fit | `run_axis_a_enhanced_kmeans.py` | configuration lines 43-59; `run_enhanced_kmeans` line 176 | `axis_a_enhanced_metrics.csv`; `axis_a_enhanced_run_summary.csv` |
| Random comparator | `run_axis_a_dpc_ablation.py` | locked inputs/configuration lines 42-50; `fit_random_pca_kmeans` line 144 | `axis_a_pca_random_summary.csv`; `axis_a_dpc_ablation_comparison.csv` |
| Broader 13-feature baseline | `run_axis_a_baseline_comparison.py` | features/configuration lines 43-67; fitting line 133 | `axis_a_baseline_summary.csv`; `axis_a_baseline_vs_enhanced.csv` |

The DPC transformation is: pairwise distances -> cutoff `d_c` -> local density `rho` -> nearest higher-density separation `delta` -> `gamma=rho*delta` -> top `k` observations -> initial centroid matrix. `run_axis_a_enhanced_kmeans.py` passes that matrix to sklearn KMeans and preserves Lloyd assignment, mean update, convergence tolerance, and objective mechanics.

Defense caveat: the like-for-like ablation does not show across-metric superiority. The DPC result is deterministic and observation-based, but its three internal metrics lie within the 30-run random range. State that evidence directly.

## Baseline/comparator distinction

Two existing comparisons answer different questions:

1. `run_axis_a_dpc_ablation.py` is the controlled initializer test because it holds PCA space and `k` fixed.
2. `run_axis_a_baseline_comparison.py` evaluates random K-Means in the 13-feature standardized space and includes its own silhouette-based `k` step. It is broader and should not be described as changing initialization alone.

## Axis B trace

| Step | Authoritative implementation | Key code | Aggregate evidence |
| --- | --- | --- | --- |
| Longitudinal cohort | `construct_axis_b_longitudinal_cohort.py` | inputs/phases lines 20-30; `main` line 110 | `axis_b_longitudinal_cohort_validation.json` |
| Slope extraction | `extract_axis_b_adas13_slopes.py` | expected counts lines 22-30; `fit_participant` line 121; `extract_slopes` line 184 | `axis_b_adas13_slopes_validation.json` |
| `k` selection | `select_axis_b_k_nbclust.py` | one-feature/candidate constants lines 24-35; `main` line 329 | `axis_b_nbclust_k_selection.json` |
| DPC audit | `select_axis_b_dpc_seeds.py` | cutoff set lines 28-39; `result_audit` line 207; sensitivity line 253 | `axis_b_dpc_seed_selection.json` |
| DPC rejection | `reconcile_axis_b_dpc_methodology.py` | `main` line 27 | `axis_b_dpc_methodology_reconciliation.json` |
| Final model | `run_axis_b_final_clustering.py` | `main` line 38; shared configuration in `axis_b_final_common.py` | `axis_b_final_clustering_metrics.json`; `axis_b_final_cluster_profiles.csv` |
| Sensitivity | `run_axis_b_sensitivity_analysis.py` | diagnostics lines 37-39; subset analysis line 140 | `axis_b_sensitivity_analysis.json` |

Axis B's negative DPC finding does not invalidate Axis A. DPC was tested on a different geometry: one raw slope coordinate rather than six retained principal components. In that 1D space the inherited hard-cutoff rule produced tied/nearly coincident high-density candidates and cutoff-unstable pairs. Rejecting an unsuitable initializer for the supplementary representation is methodological constraint, not contradictory evidence about the multivariate Axis A implementation.

## Application trace

`researchPipelineOrchestrator.ts` copies the frozen scripts into a private per-execution workspace and runs a fixed allowlist. `axisAResultAdapter.ts` and `axisBResultAdapter.ts` whitelist aggregate fields into the shared discriminated schemas. `executeAnalysis.ts` coordinates both mappings and dual persistence. The application does not implement PCA, DPC, NbClust, slope regression, or K-Means in TypeScript.
