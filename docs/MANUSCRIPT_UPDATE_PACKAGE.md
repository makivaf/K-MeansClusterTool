# Manuscript Update Package

> **LEGACY / HISTORICAL — NOT CURRENT METHODOLOGY:** This draft package predates the unified longitudinal continuation and is retained for manuscript change history. It must be rewritten from `UNIFIED_RESEARCH_PIPELINE.md` and `UNIFIED_RESULTS_AUDIT.md` before use.

Use this text as a repository-grounded basis for the Google Docs manuscript. Bracketed items require human confirmation before being represented as approved.

## Chapter 3 replacement text

### Axis A methodology

The primary cross-sectional analysis used the first eligible ADNI1, ADNI-GO, ADNI2, or ADNI3 study-entry record for each of 2,437 participants. Fifteen candidate cognitive and functional measures were audited under a rule that excluded a variable only when scope-restricted missingness exceeded 20%. BNT and NPI-Q exceeded this threshold, leaving 13 measures. Missing retained values were median-imputed and each retained feature was standardized to a z score.

Principal component analysis was fitted to the standardized 13-feature matrix. Components were retained in order until cumulative explained variance met or exceeded 85%; PC1 through PC6 were retained in the final analysis. NbClust evaluated candidate values `k=2` through `k=10` and selected `k=2` by the implemented majority rule. The Silhouette index remained an internal comparator rather than a replacement for the multi-index selection procedure.

For the proposed Axis A initialization, pairwise Euclidean distances in the retained PCA space were used to calculate DPC density (`rho`), separation (`delta`), and `gamma=rho*delta`; the cutoff distance was the 2nd percentile of non-zero pairwise distances. The two highest ranked observation-based candidates supplied the initial centroids. Standard Lloyd assignment and arithmetic-mean centroid-update steps were then applied with `n_init=1`, `max_iter=300`, and tolerance `1e-4`. Thus, the enhancement changes the preprocessing/model-selection/initialization pipeline; it does not claim to invent a new Lloyd update equation.

A controlled initialization ablation held participants, PC1-PC6, `k=2`, and Lloyd parameters constant while replacing DPC centroids with random initialization for seeds 0-29 (`n_init=1` each). All 30 runs were retained; no best seed was selected post hoc. K-Means|| and Bahmani et al. are not part of the implemented final method and should be removed from descriptions of the proposed enhancement.

### Axis B methodology

Axis B was a supplementary longitudinal analysis derived from the Axis A roster. Valid ADAS-Cog13 `TOTAL13` records were ordered using actual `VISDATE`; elapsed years equaled elapsed days divided by 365.25. Participants required at least three distinct valid dated observations. For each eligible participant, an intercept-inclusive ordinary least-squares model, `TOTAL13 = beta0 + beta1(elapsed years) + error`, produced one slope in ADAS-Cog13 points/year. The final cohort contained 1,917 participants and 11,327 observations.

Clustering used the raw participant-level slope as its only feature. PCA was not applied because a one-dimensional representation has no multivariate dimensionality to reduce. NbClust selected `k=2`. The Axis A DPC rule was then evaluated in the slope space, including neighboring cutoff distances. The maximum-density candidates were tied/nearly coincident and the selected pair changed across nearby cutoffs; adopting them would have required an arbitrary new tie rule. DPC was therefore not retained for the final Axis B initializer. The reported model used standard Lloyd K-Means with `init="random"`, `n_init=1`, fixed `random_state=0`, `max_iter=300`, and tolerance `1e-4`. Seeds 0-29 and eligibility/outlier subsets were evaluated as sensitivity analyses.

**[ADVISER CONFIRMATION REQUIRED]** Confirm the manuscript's characterization of DPC as methodologically unsuitable for this one-dimensional representation while retaining it as the final Axis A initializer. Confirm the wording that seed 0 is the pre-specified reporting run rather than a metric-selected best run.

## Chapter 4 results text

### Axis A results

The ADNI1-ADNI3 study-entry cohort comprised 2,437 participants. Application of the greater-than-20% missingness rule excluded BNT (29.011%) and NPI-Q (61.059%), leaving 13 variables for median imputation and z-score standardization. PCA retained six components explaining 87.479459% of total variance. NbClust selected two clusters, receiving 9 of 24 usable votes.

The DPC procedure selected two observation-based initial centroids at `d_c=1.3643319363` and reproduced the selection across three determinism checks. DPC-initialized Lloyd K-Means converged in 12 iterations and produced groups of 1,553 and 884 participants. Internal validation was silhouette 0.372700, Davies-Bouldin 1.075885, and Calinski-Harabasz 1800.024958.

Across the 30 like-for-like random-initialization runs, mean silhouette was 0.372770, mean Davies-Bouldin was 1.075644, and mean Calinski-Harabasz was 1800.016609. The DPC result fell within the observed random range for every metric: it was marginally lower on silhouette, marginally higher (worse) on Davies-Bouldin, and marginally higher (better) on Calinski-Harabasz. These results support deterministic, observation-based initialization but do not demonstrate uniform improvement in internal cluster validity. **[ADVISER CONFIRMATION REQUIRED]** Confirm this cautious interpretation and the final wording used for cognitive-profile clusters.

Aggregate clinical/demographic post-hoc profile values were not found in a public-safe authoritative summary artifact and should not be inserted from memory. They remain: **Not consolidated from the current authoritative artifact set.**

### Axis B results

Axis B retained 1,917 participants with 11,327 observations. NbClust selected two groups in the one-dimensional slope representation. DPC suitability testing found tied/nearly identical high-density candidates and cutoff-sensitive seed selection, so the final analysis used fixed-seed standard Lloyd K-Means rather than DPC initialization.

The final model converged in 11 iterations. Silhouette was 0.732976, Davies-Bouldin 0.532262, and Calinski-Harabasz 2591.549830. The lower-slope group included 1,675 participants (87.376%) with centroid 0.7674 and mean slope 0.7701 points/year. The higher-slope group included 242 participants (12.624%) with centroid 9.5888 and mean slope 9.6071 points/year. These are descriptive progression-rate groups, not diagnoses, stages, causal subtypes, or independently clinically validated strata.

Sensitivity analysis showed that the partition was largely retained after removal of the single maximum slope (99.113% ordered-label agreement), but excluding the upper 1% shifted the higher centroid to 7.5044 while retaining 96.046% agreement. The higher-slope group location is therefore sensitive to the positive tail. **[ADVISER CONFIRMATION REQUIRED]** Confirm the labels “lower-slope progression group” and “higher-slope progression group.”

## Limitations text

Study limitations include the use of ADNI, which may limit population generalizability; internal clustering indices do not establish clinical validity; unsupervised clusters are not equivalent to diagnoses; and K-Means favors partitions representable around Euclidean means. Axis A conclusions depend on the retained measures and linear PCA representation. Axis B compresses each trajectory to one linear coefficient, even when change may be nonlinear; slope reliability varies with observation count and follow-up; short follow-up and extreme slopes can influence estimates; and its one-dimensional geometry made the inherited DPC initializer unstable. The positive-tail sensitivity of the higher-slope centroid should be reported.

Implementation limitations are separate: full upload-to-dashboard scientific E2E validation stopped at the isolated environment gate before the gate was corrected; mock-process orchestration and real aggregate-adapter validation passed, but a complete post-fix research rerun was not performed. Development without `DATABASE_URL` is process-memory-only, not durable.
