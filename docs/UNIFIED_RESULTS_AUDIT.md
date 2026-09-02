# Unified Results and Cohort Audit

This aggregate-only summary is intended to support later rewriting of thesis Chapters 3–5. It contains no ADNI participant identifiers or rows.

## Frozen enhanced K-Means result

| Result | Validated value |
|---|---:|
| Parent clustered cohort | 2,437 |
| ADNI1 / ADNIGO / ADNI2 / ADNI3 | 819 / 130 / 789 / 699 |
| Candidate / excluded / retained variables | 15 / 2 / 13 |
| Excluded variables | BNT; NPI-Q |
| PCA components | 6 |
| Cumulative explained variance | 87.479459% |
| NbClust selection | k = 2; 9 of 24 usable votes |
| Cluster 0 / Cluster 1 | 1,553 / 884 |
| Silhouette | 0.3727004724 |
| Davies–Bouldin | 1.0758850312 |
| Calinski–Harabasz | 1800.0249578026 |

## Complete-pipeline baseline comparison

The baseline uses the same 2,437 participants, 13 standardized original variables, no PCA, maximum-Silhouette k selection over 2–10, random initialization across seeds 0–29, and Lloyd K-Means.

| Metric | Baseline mean ± SD (30 runs) | Baseline range | Enhanced | Relative change | Direction |
|---|---:|---:|---:|---:|---|
| Silhouette | 0.3318750097 ± 0.0002342685 | 0.3317361149–0.3322569704 | 0.3727004724 | +12.3015% | higher is better |
| Davies–Bouldin | 1.2241160774 ± 0.0004241270 | 1.2234245640–1.2243675368 | 1.0758850312 | 12.1092% lower | lower is better |
| Calinski–Harabasz | 1442.0231320417 ± 0.0138377120 | 1442.0005704878–1442.0313362431 | 1800.0249578026 | +24.8264% | higher is better |

These values assess the complete integrated enhancement. They cannot be attributed independently to PCA, NbClust, or DPC initialization without component-wise ablation.

The controlled PCA-space initialization comparison remains separate. Its results support DPC primarily as a deterministic and reproducible initializer, not as universally improving internal-validation geometry.

## Exact longitudinal cohort flow

| Sequential stage | Participants | Observations/records |
|---|---:|---:|
| Parent clustered cohort | 2,437 | — |
| At least one usable longitudinal record | 2,428 | 12,415 matched raw ADAS rows |
| Valid dated usable records after exclusions | 2,428 | 12,105 |
| At least 3 distinct valid dated observations | 1,917 | 11,327 |
| Also at least 365.25 days follow-up | 1,845 | 11,111 |

Sequential participant exclusions:

- no usable longitudinal observation: 9
- fewer than 3 distinct dated observations: 511
- follow-up under 365.25 days after meeting the visit rule: 72
- total excluded from the parent cohort: 592

Known observation cleaning in the frozen longitudinal cohort includes 303 invalid/missing `TOTAL13` rows, 3 invalid/missing `VISDATE` rows after the score filter, and 4 rows at two known same-day conflict keys. No unexpected duplicate participant/date rows remained.

## Eligibility by original enhanced cluster

| Original cluster | Parent n | ≥3 observations n | ≥12 months n | Eligible observations |
|---|---:|---:|---:|---:|
| Cluster 0 | 1,553 | 1,244 | 1,233 | 7,967 |
| Cluster 1 | 884 | 673 | 612 | 3,144 |
| Total | 2,437 | 1,917 | 1,845 | 11,111 |

## Longitudinal descriptive results

Participant slopes are OLS estimates in ADAS-Cog13 points per year using actual elapsed days divided by 365.25. They are descriptive and are not clustered.

### Original Cluster 0

- eligible participants: 1,233
- longitudinal observations: 7,967
- observations per participant: mean 6.4615; median 6; range 3–20
- follow-up years: mean 6.5189; median 6.0041
- baseline ADAS-Cog13: mean 10.3606; median 10.0000
- slope: mean 0.64325; median 0.34502 points/year
- slope SD: 1.71219
- slope IQR: 1.19642
- slope range: −8.65064 to 11.93789
- median R²: 0.33095
- median RMSE: 1.90898

### Original Cluster 1

- eligible participants: 612
- longitudinal observations: 3,144
- observations per participant: mean 5.1373; median 4; range 3–17
- follow-up years: mean 3.3098; median 2.2040
- baseline ADAS-Cog13: mean 24.3844; median 23.6700
- slope: mean 3.95329; median 2.97447 points/year
- slope SD: 4.45337
- slope IQR: 4.82104
- slope range: −11.44491 to 29.99760
- median R²: 0.70415
- median RMSE: 2.25745

## Primary inferential longitudinal model

The pre-specified maximum-likelihood model is `ADAS13 ~ time + cluster + time:cluster + (1 | participant)`, with original Cluster 0 as the reference, α = 0.05, and all 11,111 eligible observations nested within 1,845 participants. Statsmodels 0.15.0 converged with `lbfgs` on the first declared optimizer attempt and emitted no warnings. No random-effect boundary condition was detected.

| Fixed effect | Estimate | SE | 95% CI | z | p |
|---|---:|---:|---:|---:|---:|
| Intercept | 9.8259869090 | 0.2038156873 | 9.4265155025 to 10.2254583156 | 48.2102 | <1×10⁻³⁰⁰ |
| Time, Cluster 0 | 0.5664670365 | 0.0183595771 | 0.5304829267 to 0.6024511464 | 30.8540 | 4.9453×10⁻²⁰⁹ |
| Cluster 1 vs 0 at time zero | 15.6315310636 | 0.3561269922 | 14.9335349849 to 16.3295271422 | 43.8931 | <1×10⁻³⁰⁰ |
| **Time × Cluster 1** | **1.4696805639** | **0.0538884595** | **1.3640611240 to 1.5753000037** | **27.2726** | **8.9575×10⁻¹⁶⁴** |

The primary interaction indicates that original Cluster 1 had an estimated 1.469681-point/year higher annual ADAS-Cog13 change than original Cluster 0. The observed trajectories differed statistically at α = 0.05. This is an observational comparison of the two previously established algorithmic groups and does not establish causation, diagnosis, clinical subtype, or prediction.

Model variance and fit statistics:

- random-intercept variance: 43.1858484803
- residual variance: 24.9221729166
- log-likelihood: −35803.1520208788
- AIC: 71618.3040417576
- BIC: 71662.1981870831

## Integrity checks

- parent participant keys unique: passed
- PTID/RID one-to-one linkage: passed
- all longitudinal participants belong to the clustered parent cohort: passed
- original cluster assignments preserved: passed
- no participant appears in both clusters: passed
- no duplicate participant/date enters calculations: passed
- one participant slope row per eligible participant: passed
- no longitudinal NbClust: passed
- no longitudinal DPC suitability/seed selection: passed
- no longitudinal K-Means: passed
- mixed-model original assignments and exact cohort counts: passed
- Time × Cluster coefficient estimable and finite: passed
- optimizer convergence: passed with `lbfgs`; no fallback optimizer selected
- random-effect boundary warning: not detected

## Interpretation limits

- Cluster 0 and Cluster 1 are algorithmic groups, not clinical Alzheimer disease stages or subtypes.
- The descriptive and inferential results do not establish prediction or causation.
- Participant OLS precision varies with observation count and follow-up duration.
- The original clusters differ substantially in baseline ADAS-Cog13 and follow-up support; unadjusted slope summaries should be interpreted accordingly.
- The primary mixed-effects model includes a participant random intercept but no additional covariates or random time slope.
