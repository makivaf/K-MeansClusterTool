# Pipeline verification — October 12, 2026

Branch: `integration/final-mariel-backend-oct11`; HEAD: `7f1cc6edd1f0cc306da8f6ced61d314fe88be170`.

Computed by `scripts/research/validation/verify_pipeline_oct12.py`. Only the two authorized longitudinal MixedLM fits were executed. All clustering metrics use stored matrices and stored assignments; no preprocessing/PCA/clustering/NbClust stage was run. JSON evidence is aggregate-only. Input SHA256s are in `docs/verification/source_manifest.json`; workspace preservation is in `workspace_integrity_after.json`.

## 1. Standard DBI/CH provenance

The authoritative current Standard mean DBI/CH is **1.2241160774 / 1442.02313204**, recomputed from `data/interim/baseline_kmeans_assignments.csv` and `data/interim/clustering_features_standardized.csv`. It describes 2437 participants, 13 variables, original standardized feature-space evaluation, seeds 0–29, n_init=[1]. Cohort identity is the SHA256 of `data/interim/study_entry_cohort_unimputed.csv`: `b9983abfd068c4c00006750c2d08e547bc0c7b2769b60080ae9733b4841c04eb`.

Retained variables: MMSE, ADAS13, LMI, LMD, TMT_A, TMT_B, CATEGORY_FLUENCY_ANIMALS, RAVLT_IMMEDIATE, RAVLT_DELAYED, RAVLT_FORGETTING, CDRSB, FAQ, GDS. Saved per-variable median imputation was independently checked against `clustering_features_unimputed.csv` and `clustering_features_imputed.csv` (maximum absolute discrepancy 0); recorded scaler reconstruction from `clustering_preprocessing_summary.csv` differs by at most 1.33226762955e-15. Seeds and n_init are read from `baseline_kmeans_runs.csv`.

Undeterminable: occurrences in reachable history are an explicit unresolved-value note, not a producing artifact. No evidence establishes 15 versus 13 variables, cohort, imputation, seeds/n_init, or evaluation space.

Search covered 102 reachable commits across local refs and local docs/tests/artifacts. The older pair supplied in the task appears in historical `docs/INDEPENDENT_KMEANS_EXECUTION.md` only as an unresolved provenance note; no producing artifact was located. A 15-variable explanation is unsupported. See `docs/verification/provenance_search.json` for every matching path/commit. No remote fetch or unreachable-history search was performed.

| Pair | Variables | Cohort | Imputation | Seeds / n_init | Evaluation space |
| --- | --- | --- | --- | --- | --- |
| 1.225676 / 1443.226233 | undeterminable | undeterminable | undeterminable | undeterminable | undeterminable |
| 1.2241160774 / 1442.02313204 | 13 | data/interim/study_entry_cohort_unimputed.csv | per-variable median | 0–29 / [1] | standardized original features |

Earlier pair text source: `1ec34facd437aa2e94f5d8d953393839eeb991c4:docs/INDEPENDENT_KMEANS_EXECUTION.md`. Computed entry-phase counts for the analyzed matrix membership: `{"ADNI1": 819, "ADNI2": 789, "ADNI3": 699, "ADNIGO": 130}`. The broader study-entry CSV contains 2999 rows, with full-file phase counts `{"ADNI1": 819, "ADNI2": 789, "ADNI3": 699, "ADNI4": 536, "ADNIGO": 130, "TEAM": 26}`; the analyzed membership is 2437 rows after the scope restriction. Maximum absolute difference between those selected cohort features and the saved unimputed clustering matrix: 3.5527136788e-15. Broad-prefix search also found an unrelated simulation Standard DBI 1.22567316495 with CH 60.6982757198 in `apps/api/private/simulation-runs/simulation-1-00229fed-bc14-41e7-a357-b6698fec96b3/data/interim/baseline_kmeans_summary.csv`. This is not the earlier pair and does not identify its provenance.

## 2. Stored partition reproducibility

Partition equivalence ignores cluster-label permutations; pairwise ARI excludes self-pairs. Exact counts are computed from canonical partitions, not rounded ARI. Sources: `data/interim/baseline_kmeans_assignments.csv`, `data/interim/dpc_comparison_random_assignments.csv`, and `apps/api/private/method-runs/9313513c-93d0-407b-9647-0570ad9fa54a/partitions.npz`. The historical Enhanced NPZ lacks the newer assignment-hash payload field; its file SHA256 is recorded, and each repetition is compared directly to the authoritative assignment CSV.

| Method | Runs | Pairwise ARI mean | min | max | Distinct partitions | Seed/run 0 incl. self | Excl. self | Modal exact |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| standard | 30 | 0.996665448827 | 0.991758353635 | 1 | 2 | 22/30 | 21/29 | 22/30 |
| pcaRandom | 30 | 0.997637864341 | 0.993404659739 | 1 | 3 | 21/30 | 20/29 | 21/30 |
| enhanced | 3 | 1 | 1 | 1 | 1 | 3/3 | 2/2 | 3/3 |

| Reference | Feature space | Self-match treatment | Computed count |
| --- | --- | --- | --- |
| Standard seed 0 | original standardized features | included | 22/30 |
| Standard seed 0 | original standardized features | excluded | 21/29 |
| Enhanced DPC run 1 vs PCA+random | retained PCs | no self-match: different method | 21/30 |

The historical PCA-random/DPC count and Standard reference count refer to different experiments; neither is inferred from the other. Modal agreement is independently calculated above.

Standard seed 0 versus Enhanced: ARI 0.998349301448; aligned differing participants 1. Across all stored Standard seeds: minimum ARI 0.990114439806; exact matches 0/30. Every seed’s ARI and aligned mismatch count is in `docs/verification/reproducibility.json`.

| Standard seed vs Enhanced | ARI | Aligned differing participants |
| --- | --- | --- |
| 0 | 0.998349301448 | 1 |
| 1 | 0.998349301448 | 1 |
| 2 | 0.998349301448 | 1 |
| 3 | 0.998349301448 | 1 |
| 4 | 0.990114439806 | 6 |
| 5 | 0.990114439806 | 6 |
| 6 | 0.998349301448 | 1 |
| 7 | 0.998349301448 | 1 |
| 8 | 0.998349301448 | 1 |
| 9 | 0.998349301448 | 1 |
| 10 | 0.998349301448 | 1 |
| 11 | 0.998349301448 | 1 |
| 12 | 0.998349301448 | 1 |
| 13 | 0.998349301448 | 1 |
| 14 | 0.998349301448 | 1 |
| 15 | 0.998349301448 | 1 |
| 16 | 0.990114439806 | 6 |
| 17 | 0.998349301448 | 1 |
| 18 | 0.990114439806 | 6 |
| 19 | 0.998349301448 | 1 |
| 20 | 0.998349301448 | 1 |
| 21 | 0.998349301448 | 1 |
| 22 | 0.990114439806 | 6 |
| 23 | 0.990114439806 | 6 |
| 24 | 0.998349301448 | 1 |
| 25 | 0.990114439806 | 6 |
| 26 | 0.998349301448 | 1 |
| 27 | 0.990114439806 | 6 |
| 28 | 0.998349301448 | 1 |
| 29 | 0.998349301448 | 1 |

## 3. Common-space metrics

All statistics below are recomputed from the stored labels cited in item 2. Original-space matrix: `data/interim/clustering_features_standardized.csv`; PC matrix: `data/interim/clustering_pca_scores.csv`. SD is sample SD (ddof=1). Enhanced is evaluated once from its deterministic stored partition. Signed absolute differences are Enhanced minus Standard mean; they are not percentage improvements.

### 13D (13 dimensions)

| Method | Metric | Mean/value | SD | Min | Max |
| --- | --- | --- | --- | --- | --- |
| standard | silhouette | 0.331875009715 | 0.00023426851518 | 0.331736114927 | 0.332256970383 |
| standard | davies_bouldin | 1.2241160774 | 0.000424126986366 | 1.22342456396 | 1.22436753683 |
| standard | calinski_harabasz | 1442.02313204 | 0.0138377120472 | 1442.00057049 | 1442.03133624 |
| pcaRandom | silhouette | 0.331771641099 | 0.000118839496083 | 0.331697426029 | 0.332041440085 |
| pcaRandom | davies_bouldin | 1.22448116198 | 0.000381022236483 | 1.22381927602 | 1.22472578472 |
| pcaRandom | calinski_harabasz | 1442.01617234 | 0.00641031339422 | 1441.99345797 | 1442.0188071 |
| enhanced | silhouette | 0.331697426029 | N/A | 0.331697426029 | 0.331697426029 |
| enhanced | davies_bouldin | 1.22472578472 | N/A | 1.22472578472 | 1.22472578472 |
| enhanced | calinski_harabasz | 1442.0188071 | N/A | 1442.0188071 | 1442.0188071 |

| Metric | Enhanced minus Standard mean | Inside Standard seed range |
| --- | --- | --- |
| silhouette | -0.000177583686175 | False |
| davies_bouldin | 0.000609707315031 | False |
| calinski_harabasz | -0.00432494255597 | True |

### 6-PC (6 dimensions)

| Method | Metric | Mean/value | SD | Min | Max |
| --- | --- | --- | --- | --- | --- |
| standard | silhouette | 0.372856413631 | 0.000202884109734 | 0.372736126253 | 0.37318720392 |
| standard | davies_bouldin | 1.07529607492 | 0.000422364251676 | 1.07460743552 | 1.07554648925 |
| standard | calinski_harabasz | 1799.97441919 | 0.0494980538227 | 1799.8937156 | 1800.00376595 |
| pcaRandom | silhouette | 0.372770430909 | 0.000111242441715 | 0.372700472425 | 0.373013231443 |
| pcaRandom | davies_bouldin | 1.07564386072 | 0.000376066479157 | 1.07497324161 | 1.07588503116 |
| pcaRandom | calinski_harabasz | 1800.01660927 | 0.0145608353057 | 1799.97490871 | 1800.0249578 |
| enhanced | silhouette | 0.372700472425 | N/A | 0.372700472425 | 0.372700472425 |
| enhanced | davies_bouldin | 1.07588503116 | N/A | 1.07588503116 | 1.07588503116 |
| enhanced | calinski_harabasz | 1800.0249578 | N/A | 1800.0249578 | 1800.0249578 |

| Metric | Enhanced minus Standard mean | Inside Standard seed range |
| --- | --- | --- |
| silhouette | -0.000155941205967 | False |
| davies_bouldin | 0.000588956238895 | False |
| calinski_harabasz | 0.0505386129205 | False |

User-supplied rounded comparison values: 0 mismatches of 12 checks, using half the last displayed decimal as tolerance. All raw differences and tolerances are in `docs/verification/common_space_metrics.json`.

## 4. Longitudinal reference and sensitivity

Inputs: `apps/api/private/longitudinal-refresh/4b3dca3d-b435-4485-ac2b-18a0e442a624/data/interim/unified_longitudinal_cohort.csv` and `apps/api/private/longitudinal-refresh/4b3dca3d-b435-4485-ac2b-18a0e442a624/data/interim/unified_cluster_assignments.csv`. Model/data validation: `scripts/research/longitudinal/fit_longitudinal_mixed_model.py`. Stored reference: `apps/api/private/longitudinal-refresh/4b3dca3d-b435-4485-ac2b-18a0e442a624/data/interim/unified_longitudinal_mixed_model.json`. VISDATE-derived time, fixed original-cluster membership, and the existing eligibility rules are reused unchanged. Computed sample: 1845 participants; 11111 observations. Reference coefficient/SE/p-value maximum absolute error: 0; match at 1e-8: True.

### randomIntercept

| Fixed effect | Estimate | SE | 95% CI low | 95% CI high | p |
| --- | --- | --- | --- | --- | --- |
| Intercept | 9.825986909 | 0.203815687277 | 9.42651550245 | 10.2254583156 | 0 |
| original_cluster[T.1] | 15.6315310636 | 0.356126992212 | 14.9335349849 | 16.3295271422 | 0 |
| time_years | 0.566467036534 | 0.0183595770869 | 0.530482926673 | 0.602451146396 | 4.94529058702e-209 |
| time_years:original_cluster[T.1] | 1.46968056386 | 0.0538884595359 | 1.36406112398 | 1.57530000373 | 8.95749142204e-164 |

ML; random formula `1`; converged=True; singular=False under diagnostic eigenvalue criterion stated in JSON. Random variances: 43.1858484803; intercept–slope correlation: N/A; residual variance: 24.9221729166. Covariance eigenvalues: 43.1858484803. Optimizer attempts/warnings: `[{"optimizer": "lbfgs", "converged": true, "warnings": []}]`.

### randomSlope

| Fixed effect | Estimate | SE | 95% CI low | 95% CI high | p |
| --- | --- | --- | --- | --- | --- |
| Intercept | 9.60800871768 | 0.158281096167 | 9.29778346976 | 9.9182339656 | 0 |
| original_cluster[T.1] | 14.1733815831 | 0.277165523644 | 13.630147139 | 14.7166160272 | 0 |
| time_years | 0.710971550195 | 0.0586838036046 | 0.595953408655 | 0.825989691736 | 8.76489750586e-34 |
| time_years:original_cluster[T.1] | 3.10125269618 | 0.116796279198 | 2.87233619542 | 3.33016919694 | 2.39239482736e-155 |

ML; random formula `1 + time_years`; converged=True; singular=False under diagnostic eigenvalue criterion stated in JSON. Random variances: 25.9074238122, 3.39548688605; intercept–slope correlation: 0.38276557303; residual variance: 11.7638013026. Covariance eigenvalues: 2.83684495001, 26.4660657482. Optimizer attempts/warnings: `[{"optimizer": "lbfgs", "converged": true, "warnings": []}]`.

| Model | log likelihood | AIC | BIC |
| --- | --- | --- | --- |
| randomIntercept | -35803.1520209 | 71618.3040418 | 71662.1981871 |
| randomSlope | -33542.6773036 | 67101.3546072 | 67159.8801343 |

Likelihood-ratio statistic 4520.94943454; nominal df 2; nominal p 0. Nominal chi-square only: zero slope variance is on the boundary and intercept–slope correlation is unidentified under the null. Ordinary chi-square calibration is not exact; no calibrated bootstrap or mixture test was performed.

Discrepancy note: On the same validated stored longitudinal cohort, the random-intercept ML model estimates the Time × Cluster interaction at 1.46968056386, while allowing correlated participant-specific intercepts and time slopes estimates it at 3.10125269618. These correspond to the rounded values described in the task; the discrepancy arises under different random-effect specifications on the same fixed assignments and observations. The sensitivity model changes the covariance/weighting assumptions and is a separate analysis; it does not replace or revise the pre-specified random-intercept reference. Convergence and covariance diagnostics are reported above; the comparison does not establish that either specification should replace the reference.

Full-cohort Enhanced versus model assignment file: literal matches 2437/2437; ARI 1; all Enhanced repetitions match: True. This is the full parent assignment file actually joined by the model validator, before eligibility filtering.

Reported p-values of zero are floating-point underflow, not literal zero probability. The nominal LRT log-p is -2260.47471727; boundary-aware calibration remains unavailable.

## 5. Stored NbClust index ledger

Source: `data/interim/clustering_nbclust_votes.csv`; seed/selection metadata: `data/interim/clustering_selected_k.csv`. No R or NbClust execution was performed.

| Index | Status | Voted k | Reason |
| --- | --- | --- | --- |
| kl | voted k | 4 |  |
| ch | voted k | 2 |  |
| hartigan | voted k | 3 |  |
| ccc | voted k | 8 |  |
| scott | voted k | 3 |  |
| marriot | voted k | 4 |  |
| trcovw | voted k | 3 |  |
| tracew | voted k | 3 |  |
| friedman | voted k | 4 |  |
| rubin | voted k | 3 |  |
| cindex | voted k | 6 |  |
| db | voted k | 2 |  |
| silhouette | voted k | 2 |  |
| duda | voted k | 2 |  |
| pseudot2 | voted k | 2 |  |
| beale | voted k | 2 |  |
| ratkowsky | voted k | 7 |  |
| ball | voted k | 3 |  |
| ptbiserial | voted k | 2 |  |
| frey | voted k | 4 |  |
| mcclain | voted k | 2 |  |
| dunn | voted k | 4 |  |
| hubert | graphical/no vote |  | NbClust completed index 'hubert' but returned no Best.nc recommendation (graphical index). |
| sdindex | voted k | 2 |  |
| dindex | graphical/no vote |  | NbClust completed index 'dindex' but returned no Best.nc recommendation (graphical index). |
| sdbw | voted k | 10 |  |

Computed confirmation: 26 evaluated = 24 voting + 2 graphical; 0 failed.

Computed status counts: `{"success": 24, "unavailable": 2}`; evaluated indices: 26. Vote totals by k: `{"2": 9, "3": 6, "4": 5, "5": 0, "6": 1, "7": 1, "8": 1, "9": 0, "10": 1}`. Stored selection metadata: `[{"selected_k": 2, "selection_rule": "majority_rule", "tie_occurred": false, "tied_k": "", "total_usable_indices": 24, "reproducible": true, "random_seed": 20260811, "distance": "euclidean", "method": "kmeans", "candidate_k_min": 2, "candidate_k_max": 10, "input_rows": 2437, "input_features": 6}]`. An empty failure ledger is evidence of no failed indices in this artifact, not a claim about other runs.

## 6. Standard Silhouette-by-k at completion

Field: `result.standard.silhouetteByK` in `apps/api/private/method-runs/<job-id>/job.json`; corresponding `standard.silhouetteByK` in the sibling `result.json`. The Standard branch in `scripts/research/simulation/run_method.py` creates the series before writing `result.json`. `executeMethod` in `apps/api/src/services/methodExecution.ts` parses/validates the result and records timing metadata, persists the result, then returns it. Only afterward does `drain` persist `job.json` with `status: complete` and that result. This establishes source-level write order plus stored-completion evidence, not a live race/timing replay.

| Stored complete job | Participants | k series | Present | Result equality |
| --- | --- | --- | --- | --- |
| apps/api/private/method-runs/1667c343-313f-4555-80be-655824db686a/job.json | 2437 | 2,3,4,5,6,7,8,9,10 | True | True |
| apps/api/private/method-runs/2e56b21e-586a-4305-8b85-d396fae3a71e/job.json | 100 | 2,3,4,5,6,7,8,9,10 | True | True |
| apps/api/private/method-runs/399ce11f-b786-4f0d-9f3a-c97328f84bb3/job.json | 2437 | 2,3,4,5,6,7,8,9,10 | True | True |
| apps/api/private/method-runs/a21710b2-cabb-435e-b943-ee752bb8ee7a/job.json | 2437 | 2,3,4,5,6,7,8,9,10 | True | True |
| apps/api/private/method-runs/bb20d664-2229-4fa8-8592-3272ae65e04a/job.json | 100 | 2,3,4,5,6,7,8,9,10 | True | True |
| apps/api/private/method-runs/eb728b68-dd53-4940-9242-510f0d51eace/job.json | 2437 | 2,3,4,5,6,7,8,9,10 | True | True |
| apps/api/private/method-runs/f6e67c3b-901f-4a89-a867-91b4777d222b/job.json | 2437 | 2,3,4,5,6,7,8,9,10 | True | True |
| apps/api/private/method-runs/fbb96dda-1518-4b97-9af4-21c4a1ab21ad/job.json | 2437 | 2,3,4,5,6,7,8,9,10 | True | True |

This is diagnosis only. No application code or job state was changed. Full per-job evidence is in `docs/verification/completion_payload.json`.

## Discrepancies and unreproducible evidence

| Finding | Evidence / limitation |
| --- | --- |
| Earlier Standard DBI/CH pair | No producing artifact found; feature count, cohort, imputation, seeds/n_init and space undeterminable. Only an unresolved historical note was located. |
| Standard versus PCA-random reproducibility | Different reference partitions/spaces; included/excluded self-match counts computed above. |
| Native-space metric comparison | Original-feature Standard versus PC-space Enhanced is not a common-space comparison; use the two common-space tables. |
| Rounded metric mismatches | 0 flagged; raw comparisons retained in JSON. |
| Longitudinal discrepancy | Reference and sensitivity differ in random-effect specification; reference remains unchanged. |
| LRT calibration | Nominal chi-square p is descriptive; boundary-aware calibration not performed. |
| Singular diagnosis | Explicit minimum covariance eigenvalue diagnostic; no calibrated singular-fit package test. |
| Completion timing | Stored complete payload plus source write order checked; no live execution was replayed. |
| Historical provenance scope | Only locally reachable refs and available artifacts searched; no fetched or deleted/unreachable history. |
| Workspace | Existing changes, branch/HEAD and Git index compared before/after; see integrity JSON. |
