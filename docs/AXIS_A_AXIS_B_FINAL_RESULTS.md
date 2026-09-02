# Final Axis A and Axis B Results

> **Legacy scientific record:** This document describes the superseded two-axis design. The active study contract is documented in `UNIFIED_RESEARCH_PIPELINE.md`; the historical results below are retained only for provenance.

This sheet consolidates aggregate, defense-ready findings. Participant identifiers and assignments are intentionally omitted.

## Axis A: cross-sectional cognitive/functional profiles

- **Cohort:** 2,437 ADNI1-ADNI3 study-entry participants: ADNI1 819, ADNI-GO 130, ADNI2 789, ADNI3 699 (`axis_a_phase_missingness.csv`; `preprocess_axis_a.py:26-28`).
- **Features:** 13 retained measures. BNT (29.011% missing) and NPI-Q (61.059% missing) were excluded because each exceeded the strict 20% scope-restricted missingness threshold (`axis_a_final_exclusion_preview.csv`; `axis_a_scope_restricted_missingness.csv`).
- **Preprocessing:** median imputation and z-score standardization (`axis_a_preprocessing_summary.csv`; `preprocess_axis_a.py:142-227`).
- **PCA:** PC1-PC6 retained by the >=85% rule; cumulative explained variance was 0.8747945923 (87.47945923%) (`axis_a_pca_explained_variance.csv`).
- **Cluster count:** NbClust selected `k=2` with 9 of 24 usable index votes (`axis_a_nbclust_summary.csv`).
- **DPC initialization:** two observation-based centroids were selected in six-dimensional PCA space at the 2% distance cutoff; `d_c=1.3643319363`. The run was deterministic across three checks (`axis_a_dpc_summary.csv`). Public consolidation omits source participant identities and centroid coordinates.
- **Enhanced result:** Lloyd K-Means with the two explicit DPC centroids, `n_init=1`, `max_iter=300`, tolerance `1e-4`; 12 iterations; group sizes 1,553 and 884 (`axis_a_enhanced_run_summary.csv`). Silhouette 0.3727004724, Davies-Bouldin 1.0758850312, and Calinski-Harabasz 1800.0249578 (`axis_a_enhanced_metrics.csv`).
- **Controlled initialization comparison:** 30 runs (seeds 0-29), random initialization, `n_init=1`, the same PC1-PC6 representation, `k=2`, and Lloyd settings (`run_axis_a_dpc_ablation.py:42-50`). Random-run means were silhouette 0.3727704309, Davies-Bouldin 1.0756438607, and Calinski-Harabasz 1800.0166093 (`axis_a_dpc_ablation_comparison.csv`). DPC was within the random range for all three metrics; it was marginally worse on silhouette and Davies-Bouldin and marginally better on Calinski-Harabasz. This evidence does not support claiming across-metric superiority.
- **Profiles:** aggregate cognitive/functional cluster means were not consolidated from a public-safe authoritative aggregate artifact. Exact participant-level assignments are private. **Not consolidated from the current authoritative artifact set.**

The separate 13-feature baseline artifacts (`axis_a_baseline_*`) answer a broader raw-standardized-space comparison. The controlled DPC initialization ablation above is the appropriate like-for-like initialization comparison because it holds PC space, `k`, and Lloyd parameters fixed.

## Axis B: supplementary longitudinal progression groups

- **Cohort:** 1,917 participants and 11,327 retained longitudinal observations; eligibility required at least three valid dated `TOTAL13` observations (`axis_b_longitudinal_cohort_validation.json`; `axis_b_adas13_slopes_validation.json`).
- **Feature:** each participant's intercept-inclusive OLS coefficient for `TOTAL13` versus actual elapsed years, where elapsed years are `(VISDATE - first VISDATE) / 365.25`. Unit: ADAS-Cog13 points/year (`axis_b_final_research_summary.json`; `extract_axis_b_adas13_slopes.py:121-182`). Positive slopes indicate increasing/worsening scores, but negative slopes do not automatically establish clinical improvement.
- **Representation:** one raw, unstandardized slope dimension. PCA was not applicable (`axis_b_nbclust_k_selection.json`).
- **Cluster count:** NbClust selected `k=2` with 8 of 23 usable numerical votes and no winning tie (`axis_b_nbclust_k_selection.json`).
- **DPC suitability:** the 1D hard-cutoff analysis produced tied/nearly coincident maximum-density candidates and cutoff-unstable seed pairs. DPC was therefore not retained for final initialization (`axis_b_dpc_seed_selection.json`; `axis_b_dpc_methodology_reconciliation.json`).
- **Final model:** standard sklearn Lloyd K-Means on raw slopes, `init="random"`, `n_init=1`, `random_state=0`, `max_iter=300`, tolerance `1e-4` (`axis_b_final_clustering_metrics.json`).
- **Final validation metrics:** silhouette 0.7329758438, Davies-Bouldin 0.5322622183, Calinski-Harabasz 2591.5498302; 11 iterations (`axis_b_final_clustering_metrics.json`).
- **Lower-slope group:** 1,675 participants (87.3761%); centroid 0.7674371172, mean slope 0.7700629074 points/year (`axis_b_final_cluster_profiles.csv`).
- **Higher-slope group:** 242 participants (12.6239%); centroid 9.5888287917, mean slope 9.6071064488 points/year (`axis_b_final_cluster_profiles.csv`).
- **Sensitivity:** excluding the maximum slope retained 99.113% ordered-label agreement (ARI 0.9498); excluding the positive 1% tail retained 96.046% agreement (ARI 0.7899) but shifted the higher centroid to 7.5044. The higher-group location is positive-tail sensitive (`axis_b_sensitivity_analysis.json`).

## Methodology/results comparison

| Dimension | Axis A | Axis B |
| --- | --- | --- |
| Purpose | Cross-sectional cognitive/functional profiles | Supplementary longitudinal progression-rate groups |
| Unit | Study-entry participant | Participant-specific longitudinal slope |
| Input | 13 retained measures | One raw ADAS-Cog13 slope |
| PCA | Yes; PC1-PC6, 87.4795% cumulative variance | Not applicable in one dimension |
| `k` | NbClust selected 2 | NbClust selected 2 |
| DPC | Supplies final observation-based centroids | Evaluated and rejected for final initialization |
| Final clustering | DPC-initialized Lloyd K-Means | Fixed-seed standard Lloyd K-Means |
| Final sizes | 1,553 / 884 | 1,675 / 242 |
| Interpretation | Cognitive-profile clusters, not diagnoses | Lower-/higher-slope groups, not stages or diagnoses |

The axes share cohort lineage, NbClust-based `k` evaluation, Lloyd assignment/update mechanics, and internal validation metrics. They differ because Axis A is multivariate and suitable for PCA/DPC initialization, whereas Axis B is a one-dimensional estimated-rate representation in which the inherited DPC rule was empirically unstable.
