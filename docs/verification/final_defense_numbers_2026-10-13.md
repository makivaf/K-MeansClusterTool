# Final defense numbers - 2026-10-13

Branch: `final/system-oct12`. HEAD: `3636c1538e6fa3e4e1c070a0e23496604031c153`.
Inspection of existing source and saved artifacts only. No model, preprocessing, PCA, NbClust, clustering, validation runner, or LME fit was executed. Only this requested Markdown file was written. Pre-existing working-tree changes were left intact.
"Currently displayed" below means the current checked-out UI code and its saved full-cohort result inputs. Browser sessionStorage selects the completed job; its active job IDs were not inspected. All inspected completed study Standard and Enhanced result files have identical native metric values. Fresh/simulation runs on other cohorts can have different values.
Precision: JSON numbers below use their full round-trip numeric representation; CSV loading/eigenvalue strings are copied unchanged. Percentages follow the UI's JavaScript arithmetic. Visible formatting is separately reported where applicable.

## 1. ARI counts and references

ARI compares participant cluster assignments and is invariant to label permutations; "space" identifies the feature matrix used to fit those assignments, not a coordinate input to ARI.

| Evidence / comparison | Fit space | Reference partition | Reference self-match | Count | Value source |
| --- | --- | --- | --- | --- | --- |
| Standard designated reference | 13 standardized variables | Standard seed 0 | Included | 22/30 | `apps/api/private/method-runs/a9f1c5d0-0414-4bbf-b0ae-fb1c76f66734/result.json` -> standard.ariBySeed |
| Standard excluding reference | 13 standardized variables | Standard seed 0 | Excluded | 21/29 | `docs/verification/reproducibility.json` -> standard |
| Standard modal frequency (current SOP 3) | 13 standardized variables | Modal partition; earliest member is seed 0 | Included | 22/30 | `apps/web/src/data/finalUiEvidence.json` -> initializationEvidence.standard |
| Controlled PCA-random vs DPC | 6 retained PCs | Enhanced DPC run 1 | No self-match: random seed 0 and DPC run 1 are different runs | 21/30 | `apps/api/artifacts/study_evidence.json` -> ariBySeed |
| PCA-random modal / seed-0 reference | 6 retained PCs | Modal partition; earliest member is random seed 0 | Included | 21/30 | `apps/web/src/data/finalUiEvidence.json` -> initializationEvidence.pcaRandom |
| PCA-random seed-0 reference excluding itself | 6 retained PCs | PCA-random seed 0 | Excluded | 20/29 | `docs/verification/reproducibility.json` -> pcaRandom |
| Standard vs Enhanced | 13-variable Standard vs 6-PC Enhanced | Enhanced DPC run 1 | No self-match | 0/30 | `docs/verification/reproducibility.json` -> standardVersusEnhanced |
| Enhanced original reference checks | 6 retained PCs | DPC run 1 | Included | 3/3 | `apps/api/private/method-runs/26fd961c-2a79-4f0f-9d51-f11c5fb133e2/result.json` -> enhanced.dpc.ariByRun |
| Enhanced current 30-run modal evidence | 6 retained PCs | Modal partition / DPC run 1 | Included | 30/30 | `apps/web/src/data/finalUiEvidence.json` -> initializationEvidence.enhanced |

**Current restored Study Findings SOP 3 displays Standard 22 of 30 runs (73.33333%) and Enhanced 30 of 30 (100%).** The labels are "Runs reaching modal partition." It also displays Standard partition A: 22, partition B: 8. It does not headline the controlled PCA-random 21/30 count. Code: `apps/web/src/pages/StudyFindingsPage.tsx` -> `components/final/StudyResults.tsx` -> `components/final/SopPanels.tsx` (`Sop3`, `Reproducibility`).
For this dataset the Standard modal partition happens to equal seed 0. This equality does not make modal frequency and designated-reference agreement the same definition. Excluding the seed-0 self-match gives **21/29**, not 21/30.

### Computation and display locations

The following covers the full-cohort count-producing and count-displaying paths, plus shared runtime paths. Tests and historical audit notes are listed separately; they do not produce a new experiment.

| Source / function | What it computes or displays | Result for the stored full cohort |
| --- | --- | --- |
| scripts/research/simulation/run_method.py: Standard ariBySeed | ARI for each 13D seed against runs[0]; includes seed 0 | 22 values equal 1 out of 30 |
| scripts/research/simulation/run_method.py: sopControls.randomAriBySeed | 6-PC random runs vs saved Enhanced partition; no DPC self-run | 21/30 |
| scripts/research/simulation/run_method.py: enhanced.dpc.ariByRun | First three DPC runs vs run 1, includes run 1 | 3/3 at ARI 1; 30 full partitions also saved |
| apps/api/src/services/studyEvidenceArtifact.ts: loadStudyEvidence | Builds standardAriBySeed from baseline assignments vs seed 0; validates saved PCA-random-vs-DPC series | 22/30 Standard; 21/30 controlled |
| packages/shared/src/partitionEvidence.ts and studyEvidenceArtifact.ts | Canonical partition groups; modal reference is earliest execution in most frequent partition | 22/30 Standard; 21/30 PCA-random; historical DPC 3/3 |
| scripts/research/validation/derive_partition_evidence.py: derive / evidence | Canonical membership and modal ARI from saved partitions; includes modal reference itself; no fitting | 22/30 Standard; 21/30 PCA-random; 30/30 Enhanced |
| scripts/research/validation/derive_final_ui_evidence.py | Builds saved final UI modal evidence from Standard/PCA-random assignments and existing Enhanced 30-run NPZ | 22/30; 21/30; 30/30 |
| apps/api/src/services/partitionEvidence.ts: withPartitionEvidence | Enriches completed API responses with derive_partition_evidence; does not alter immutable job files | Current method SOP 3 receives 30-run modal evidence |
| apps/web/src/components/final/SopPanels.tsx: Reproducibility | Displays modal frequency; counts ARI=1 only for upper triangle i<j in pairwise matrix | 22/30 and 30/30; identical pairs 259/435 and 435/435 |
| apps/web/src/components/final/FinalResults.tsx | Final reliability summary displays modal percentages | 73.33333% Standard; 100.00000% Enhanced; difference 26.66667 percentage points |
| apps/web/src/components/InitializationComparison.tsx | Main charts use modal reference. Additional disclosure counts adjustedRandIndex === 1; separately excludes Standard seed 0 | Standard 22/30 and 21/29; DPC 3/3; controlledRuns disclosure 21/30 when supplied |
| apps/web/src/pages/StudyFindingsPage.tsx: legacy StudyResults | Supplies standardAriBySeed and controlled ariBySeed to InitializationComparison | 22/30 Standard disclosure; 21/30 controlled disclosure |
| apps/web/src/components/FreshStudyResults.tsx | Uses InitializationComparison for runtime/simulation results; supplies native Standard seed-reference and DPC series | Full-cohort inputs give 22/30, 21/29, DPC 3/3; simulation counts depend on saved run |
| apps/web/src/pages/SimulationRunsPage.tsx: legacy simulation evidence | Supplies PCA-random modal evidence and controlled reference series, with original Standard baseline separately | 21/30 PCA-random modal; Standard baseline 22/30 for full cohort |
| analysis/chapter1_evidence/03_sop3_initialization_variability.py | Counts exact canonical PCA-random partitions matching saved DPC assignments, then plots count; no self-match | 21/30 matching, 9/30 different in existing outputs/sop3_computation_summary.txt |
| scripts/research/validation/verify_pipeline_oct12.py: reproducibility | Counts canonical seed-0 matches including/excluding self; separately cross-method ARI | Standard 22/30, 21/29; PCA-random 21/30, 20/29; random vs DPC 21/30 |
| scripts/research/simulation/common_space.py: pairwise | Counts ARI=1 among all unordered execution pairs; excludes diagonals | 259/435 Standard; 232/435 PCA-random; 435/435 for 30 Enhanced runs (3/3 for historical 3 runs) |

Related saved evidence: `docs/verification/reproducibility.json`, `apps/web/src/data/finalUiEvidence.json`, `analysis/chapter1_evidence/outputs/sop3_ari_by_seed.csv`, `analysis/chapter1_evidence/outputs/sop3_ari_reproducibility*.png`. Verification assertions: `apps/api/src/services/partitionEvidence.validation.ts` (22 Standard, 21 controlled), `currentFrontendIntegration.validation.ts` (21 controlled), `apps/web/tests/finalUiPass.test.mjs` (259 and 435 identical pairs). `apps/web/docs/UI_CONTINUATION_AUDIT.md` describes an older UI state with a 22/30 headline; current `final/SopPanels.tsx` uses modal frequency.

### Per-seed ARI, seeds 0-29

Column A source: `apps/api/private/method-runs/a9f1c5d0-0414-4bbf-b0ae-fb1c76f66734/result.json` -> standard.ariBySeed (13D seeds vs Standard seed 0). Column B source: `apps/api/artifacts/study_evidence.json` -> ariBySeed (6-PC random seeds vs DPC run 1), also stored in `analysis/chapter1_evidence/outputs/sop3_ari_by_seed.csv`. Column C source: `docs/verification/reproducibility.json` -> standardVersusEnhanced.perSeed (13D seeds vs Enhanced).

| Seed | A: Standard vs Standard seed 0 | B: PCA-random vs Enhanced DPC run 1 | C: Standard vs Enhanced DPC run 1 |
| --- | --- | --- | --- |
| 0 | 1 | 1 | 0.9983493014482632 |
| 1 | 1 | 1 | 0.9983493014482632 |
| 2 | 1 | 1 | 0.9983493014482632 |
| 3 | 1 | 1 | 0.9983493014482632 |
| 4 | 0.9917583536346767 | 0.99340465973853 | 0.9901144398062053 |
| 5 | 0.9917583536346767 | 0.9950516316927642 | 0.9901144398062053 |
| 6 | 1 | 1 | 0.9983493014482632 |
| 7 | 1 | 1 | 0.9983493014482632 |
| 8 | 1 | 1 | 0.9983493014482632 |
| 9 | 1 | 1 | 0.9983493014482632 |
| 10 | 1 | 1 | 0.9983493014482632 |
| 11 | 1 | 1 | 0.9983493014482632 |
| 12 | 1 | 1 | 0.9983493014482632 |
| 13 | 1 | 1 | 0.9983493014482632 |
| 14 | 1 | 1 | 0.9983493014482632 |
| 15 | 1 | 1 | 0.9983493014482632 |
| 16 | 0.9917583536346767 | 0.99340465973853 | 0.9901144398062053 |
| 17 | 1 | 1 | 0.9983493014482632 |
| 18 | 0.9917583536346767 | 0.9950516316927642 | 0.9901144398062053 |
| 19 | 1 | 0.9950516316927642 | 0.9983493014482632 |
| 20 | 1 | 1 | 0.9983493014482632 |
| 21 | 1 | 1 | 0.9983493014482632 |
| 22 | 0.9917583536346767 | 0.9950516316927642 | 0.9901144398062053 |
| 23 | 0.9917583536346767 | 0.9950516316927642 | 0.9901144398062053 |
| 24 | 1 | 1 | 0.9983493014482632 |
| 25 | 0.9917583536346767 | 0.9950516316927642 | 0.9901144398062053 |
| 26 | 1 | 1 | 0.9983493014482632 |
| 27 | 0.9917583536346767 | 0.9950516316927642 | 0.9901144398062053 |
| 28 | 1 | 1 | 0.9983493014482632 |
| 29 | 1 | 1 | 0.9983493014482632 |

Enhanced repeated-run ARI: runs **1, 2, 3 each equal 1** versus DPC run 1, including its self-match; source `apps/api/private/method-runs/26fd961c-2a79-4f0f-9d51-f11c5fb133e2/result.json` -> enhanced.dpc.ariByRun. Existing `apps/api/private/final-ui-evidence/enhanced-30-report.json` has `runs: 30` and `allAriEqualOne: true`; saved final UI evidence gives runs 1-30 ARI=1 versus modal run 1, with pairwise minimum=mean=1 and 435/435 identical unordered pairs. These are existing artifacts, not runs executed for this report.

## 2. Standard DBI/CH provenance

| Pair | Producing script / configuration / seeds | Source / status |
| --- | --- | --- |
| Earlier 1.225676 / 1443.226233 | Not established: no producing script, seed, n_init, cohort, feature count, imputation or scoring space found | docs/verification/metric_provenance.json -> earlier; docs/verification/provenance_search.json. Historical text only: 1ec34facd437aa2e94f5d8d953393839eeb991c4:docs/INDEPENDENT_KMEANS_EXECUTION.md |
| Current displayed 1.224116 / 1442.023132 | run_baseline_kmeans_comparison.py; runtime run_method.py calls the same baseline fitter. 2,437 participants; 13 median-imputed, z-standardized variables; k=2; init=random; seeds 0-29; n_init=1; max_iter=300; tol=0.0001; algorithm=lloyd; arithmetic mean across all 30 runs; scored in standardized 13D space | apps/api/private/method-runs/a9f1c5d0-0414-4bbf-b0ae-fb1c76f66734/result.json -> standard.metrics; data/interim/baseline_kmeans_runs.csv; docs/verification/metric_provenance.json -> current |

Standard k selection scans k=2-10 using seed 0 and maximum Silhouette (smaller k wins a tie). The reported DBI/CH are **30-seed means**, not the seed-0 metrics or a selected best run. The current producing paths and constants are in `scripts/research/comparison/run_baseline_kmeans_comparison.py` and `scripts/research/simulation/run_method.py`.
The restored 13D-Standard vs 6-PC-Enhanced table displays the **current** pair. The previous audit searched 102 reachable local commits; its older-pair conclusion remains unresolved. This inspection checked the current relevant paths and that existing search record; it did not fetch remotes or repeat a history-wide search. The unrelated simulation near-match DBI 1.22567316495 with CH 60.6982757198 is not evidence for the earlier pair.

## 3. Restored internal-validation table

Current rendering: `apps/web/src/components/final/FinalResults.tsx` passes Standard `s.metrics` and Enhanced `e.metrics` directly to `NativeMetricTable` in `apps/web/src/components/final/RangeCards.tsx`. Standard source S = `apps/api/private/method-runs/a9f1c5d0-0414-4bbf-b0ae-fb1c76f66734/result.json`. Enhanced source E = `apps/api/private/method-runs/26fd961c-2a79-4f0f-9d51-f11c5fb133e2/result.json`. Both are completed full-cohort result artifacts; other inspected completed study jobs have the same numeric metric inputs.

| Metric | Standard (13D, mean of 30 seeds), full precision [S] | Enhanced (6 PCs), full precision [E] | UI "Improvement", full precision (%) |
| --- | --- | --- | --- |
| Silhouette | 0.33187500971522454 | 0.3727004724250328 | 12.301457330227962 |
| Davies-Bouldin (DBI) | 1.2241160774005175 | 1.0758850311620256 | -12.109231222031596 |
| Calinski-Harabasz (CH) | 1442.0231320417006 | 1800.0249578026044 | 24.826358038655307 |

Exact UI convention for every row: `(Enhanced - Standard) / Standard * 100`. DBI therefore has a negative displayed change despite lower being better. A direction-aware DBI reduction would be +12.109231222031596%, but the restored table displays the signed negative value above. This is a transcription of existing behavior.

| Metric | Standard text | Enhanced text | Improvement text |
| --- | --- | --- | --- |
| Silhouette | 0.331875 | 0.372700 | +12.30146% |
| Davies-Bouldin (DBI) | 1.224116 | 1.075885 | -12.10923% |
| Calinski-Harabasz (CH) | 1,442.023132 | 1,800.024958 | +24.82636% |

Formatting source: `apps/web/src/utils/formatNumber.ts` (calculation=6 decimals; percentage=5 decimals). The native table compares each method in its own fit space. The separate common-space tables and their differences are different evidence.

### Last-digit source differences

| Value | Current method-result / restored table input | Other existing source | Other stored value |
| --- | --- | --- | --- |
| Standard Silhouette | 0.33187500971522454 | apps/web/src/data/verifiedStudyPresentation.json -> spaces.13D.conditions.standard.silhouette.mean | 0.33187500971522443 |
| Standard DBI | 1.2241160774005175 | docs/verification/metric_provenance.json -> current.DBI | 1.224116077400517 |
| Standard CH | 1442.0231320417006 | docs/verification/metric_provenance.json -> current.CH | 1442.0231320417008 |
| Enhanced CH | 1800.0249578026044 | data/interim/enhanced_kmeans_metrics.csv; saved unified research runs | 1800.0249578026046 |

These differences occur only in the last floating-point digits and leave the visible six-decimal values unchanged. The full-precision main table above uses current MethodResult inputs, not the older recomputation/presentation values.

## 4. Chapter 4 - existing artifacts

### PCA: all 13 components

Source for every row: `data/interim/clustering_pca_explained_variance.csv`. `explained_variance` is the sample-covariance eigenvalue. Percentages below equal the saved ratio *100, shown by exact decimal shifting of the saved CSV text. The UI performs IEEE-754 multiplication and rounds to five decimals, so its underlying final digit may differ. Six PCs retained to exceed 85%; retained cumulative variance = 87.479459233778312%.

| PC | Eigenvalue | Explained variance (%) | Cumulative (%) | Retained |
| --- | --- | --- | --- | --- |
| PC1 | 6.9080819327212675 | 53.117286664275165 | 53.117286664275165 | True |
| PC2 | 1.4383037114275576 | 11.059334746496424 | 64.176621410771584 | True |
| PC3 | 0.9700474223537966 | 7.4588413271482898 | 71.635462737919875 | True |
| PC4 | 0.85801007373574012 | 6.5973692106318108 | 78.232831948551684 | True |
| PC5 | 0.67898480016798646 | 5.2208168088419424 | 83.453648757393628 | True |
| PC6 | 0.52357020403260779 | 4.0258104763846884 | 87.479459233778312 | True |
| PC7 | 0.43136608261868703 | 3.3168390431461192 | 90.796298276924436 | False |
| PC8 | 0.38712570462984414 | 2.9766680864818054 | 93.77296636340624 | False |
| PC9 | 0.32981986458375223 | 2.5360348162179882 | 96.309001179624232 | False |
| PC10 | 0.18201955175737367 | 1.3995758596034294 | 97.708577039227662 | False |
| PC11 | 0.15288308125159791 | 1.1755411316842672 | 98.884118170911928 | False |
| PC12 | 0.10443722239891384 | 0.80303359667862201 | 99.687151767590554 | False |
| PC13 | 0.040686965726451634 | 0.31284823240944485 | 100 | False |

### PCA: full 13 x 6 loading matrix

Source for every cell: `data/interim/clustering_pca_loadings.csv` (PC1-PC6 columns copied as stored). These are signed PCA component coefficients from the saved loading artifact; signs are preserved.

| Variable | PC1 | PC2 | PC3 | PC4 | PC5 | PC6 |
| --- | --- | --- | --- | --- | --- | --- |
| MMSE | -0.31167967797428425 | 0.11369956964411872 | -0.020684812123613484 | 0.19457496132377369 | -0.14096345015356992 | -0.0060678305685385207 |
| ADAS13 | 0.34311414223641723 | -0.021887023380881415 | -0.04869144365583538 | -0.076065577540112436 | -0.0071176784682950786 | -0.096359301292784111 |
| LMI | -0.31896387572132784 | -0.044332488514393892 | -0.076648208419242275 | 0.18381247223794436 | 0.39868466550436144 | -0.33585959638160068 |
| LMD | -0.32234581634363801 | -0.097692635404537251 | -0.11312494407712942 | 0.20706102389191355 | 0.31641501036914993 | -0.33830754094730453 |
| TMT_A | 0.22987860161067719 | -0.32582234168378293 | -0.21293748150173356 | 0.49481177373831775 | 0.21625826933824363 | 0.14065866690050641 |
| TMT_B | 0.25105870015036313 | -0.26202088768306159 | -0.18499036254572981 | 0.41854091311678437 | 0.084008804401450643 | 0.42881348634008015 |
| CATEGORY_FLUENCY_ANIMALS | -0.26591027622945385 | 0.091195561149081089 | 0.17125014102778588 | -0.23762361541573965 | 0.27550175155139811 | 0.69662039790465513 |
| RAVLT_IMMEDIATE | -0.31873304815944392 | -0.13129224631110631 | 0.098217010089922813 | -0.058620708473731041 | 0.29549058816681628 | 0.16394223141990302 |
| RAVLT_DELAYED | -0.29341439362055655 | -0.47200141176857646 | 0.095437476234090615 | -0.12629640168840622 | 0.00039886806198756019 | 0.058575676041787206 |
| RAVLT_FORGETTING | 0.085507256612284754 | 0.72054788334674158 | -0.05061213119889646 | 0.22930057802569023 | 0.3837939995772236 | 0.086253544847769315 |
| CDRSB | 0.31919885339579057 | -0.11483145511522436 | 0.12364028418719994 | -0.2817732063367348 | 0.34599137324064022 | -0.073644836893891064 |
| FAQ | 0.29484579637423136 | -0.13708736132348559 | 0.094703752243038231 | -0.31408236622479802 | 0.48623911795289937 | -0.1581118909106074 |
| GDS | 0.095312968933261327 | -0.027584862830087657 | 0.9077810659197606 | 0.39141199979183083 | -0.023091093733880866 | -0.07942159159184628 |

### NbClust

Sources: `data/interim/clustering_nbclust_votes.csv` for each index; `data/interim/clustering_nbclust_summary.csv` for votes; `data/interim/clustering_selected_k.csv` for seed/configuration. Existing aggregate audit: `docs/verification/nbclust.json`. Seed **20260811**; k candidates **2-10**; method **kmeans**; distance **euclidean**; input **2,437 x 6 retained PCs**; selected **k=2** by majority/plurality rule (9 votes), no tie.

| Usable index | Suggested k |
| --- | --- |
| kl | 4 |
| ch | 2 |
| hartigan | 3 |
| ccc | 8 |
| scott | 3 |
| marriot | 4 |
| trcovw | 3 |
| tracew | 3 |
| friedman | 4 |
| rubin | 3 |
| cindex | 6 |
| db | 2 |
| silhouette | 2 |
| duda | 2 |
| pseudot2 | 2 |
| beale | 2 |
| ratkowsky | 7 |
| ball | 3 |
| ptbiserial | 2 |
| frey | 4 |
| mcclain | 2 |
| dunn | 4 |
| sdindex | 2 |
| sdbw | 10 |
| k | Votes |
| --- | --- |
| 2 | 9 |
| 3 | 6 |
| 4 | 5 |
| 5 | 0 |
| 6 | 1 |
| 7 | 1 |
| 8 | 1 |
| 9 | 0 |
| 10 | 1 |
| Index without a usable vote | Saved status | Reason |
| --- | --- | --- |
| hubert | unavailable | NbClust completed index 'hubert' but returned no Best.nc recommendation (graphical index). |
| dindex | unavailable | NbClust completed index 'dindex' but returned no Best.nc recommendation (graphical index). |

All 24 usable indices and both non-voting graphical indices are accounted for (26 requested indices). Hubert and Dindex completed but returned no `Best.nc`; they are graphical/no-vote, not evidence of a numerical failure.

### DPC centers and final cluster sizes

Center values source: `data/interim/clustering_dpc_selected_centroids.csv`; confirmed in `apps/api/private/method-runs/26fd961c-2a79-4f0f-9d51-f11c5fb133e2/result.json` -> enhanced.dpc.centers. These RIDs identify initial observation centroids, not final mean-centroid RIDs. Fit space: 6 retained PCs.

| Center order | RID | rho | delta |
| --- | --- | --- | --- |
| 1 | 1086 | 223 | 10.724562796370238 |
| 2 | 5124 | 218 | 1.1938684434199174 |

Final cluster-size sources: `data/interim/enhanced_kmeans_run_summary.csv` and `apps/api/private/method-runs/26fd961c-2a79-4f0f-9d51-f11c5fb133e2/result.json` -> enhanced.clusterSizes.

| Final Enhanced cluster | Participants |
| --- | --- |
| 0 | 1553 |
| 1 | 884 |
| Total | 2437 |

Enhanced Lloyd fitting: explicit DPC observation centroids; k=2; n_init=1; max_iter=300; tol=0.0001; algorithm=lloyd; converged in 12 iterations. Source: `data/interim/enhanced_kmeans_run_summary.csv`.

### Longitudinal LME: reference random-intercept model only

Source for counts and every coefficient/SE/p/CI: `apps/api/private/longitudinal-refresh/4b3dca3d-b435-4485-ac2b-18a0e442a624/data/interim/unified_longitudinal_mixed_model.json`. Exact matching aggregate copy: `docs/verification/longitudinal.json` -> randomIntercept. Implementation source: `scripts/research/longitudinal/fit_longitudinal_mixed_model.py`.
Formula: `adas13 ~ time_years * original_cluster`; participant random intercept only; ML; optimizer lbfgs; converged; reference cluster 0.

| Analysis-set count | Value |
| --- | --- |
| Participants | 1845 |
| Observations | 11111 |
| Participants in original cluster 0 | 1233 |
| Participants in original cluster 1 | 612 |
| Fixed effect | Coefficient | SE | p (stored) | 95% CI lower | 95% CI upper |
| --- | --- | --- | --- | --- | --- |
| Intercept | 9.825986909002848 | 0.20381568727734725 | 0 | 9.426515502454968 | 10.225458315550728 |
| time_years | 0.5664670365343818 | 0.018359577086906963 | 4.94529058701535e-209 | 0.5304829266726574 | 0.6024511463961062 |
| original_cluster[T.1] | 15.631531063571277 | 0.3561269922118994 | 0 | 14.933534984913377 | 16.329527142229175 |
| time_years:original_cluster[T.1] | 1.469680563857217 | 0.05388845953594618 | 8.95749142204344e-164 | 1.3640611239844185 | 1.5753000037300156 |

Intercept and cluster-effect p-values are stored as 0 (numerical underflow), not a mathematical claim that p is exactly zero. Time is measured in years and outcome is ADAS13. No random-slope sensitivity results are substituted here.

### Cluster profile: means of all 13 variables

Source for every mean and membership count: `data/processed/run-history/85d162496d26ec9ff8bd80393f3e6fff6d3bbfff83207a4ee771ae891f54004b.json` -> clusterProfiles.profiles[].variableMeans. Scale: Original cognitive-functional units after frozen median imputation. Enhanced partition, Cluster 0 n=1553 and Cluster 1 n=884. All inspected full-cohort unified history profile tables are identical. This is the saved aggregate profile table, not standardized centroids or longitudinal follow-up means.

| Variable | Cluster 0 mean (n=1553) | Cluster 1 mean (n=884) |
| --- | --- | --- |
| MMSE | 28.83386992916935 | 24.881221719457013 |
| ADAS13 | 10.311191241652137 | 25.396334838349354 |
| LMI | 12.508048937540245 | 5.219457013574661 |
| LMD | 10.814552479072763 | 2.501131221719457 |
| TMT_A | 34.02253702511268 | 56.90723981900452 |
| TMT_B | 84.23824855119125 | 167.52488687782807 |
| CATEGORY_FLUENCY_ANIMALS | 20.307791371538958 | 13.427601809954751 |
| RAVLT_IMMEDIATE | 43.24533161622666 | 25.16289592760181 |
| RAVLT_DELAYED | 6.917578879587895 | 1.085972850678733 |
| RAVLT_FORGETTING | 3.9858338699291695 | 4.863122171945701 |
| CDRSB | 0.5251126851255634 | 3.104638009049774 |
| FAQ | 0.8126207340631036 | 8.889140271493213 |
| GDS | 1.145524790727624 | 1.7839366515837105 |

## 5. Missing or conflicting evidence

| Item | Finding |
| --- | --- |
| Earlier Standard DBI 1.225676 / CH 1443.226233 | Producing artifact, script, configuration and seed remain unfound; no attribution is justified. |
| 21/30 vs 22/30 | Different experiments/references. 21/30 is retained-PC random vs DPC; 22/30 is original-feature Standard vs its seed-0/modal partition. Standard excluding self is 21/29. |
| Enhanced repetition count | Historical reference series contains 3 runs; current modal display uses existing 30-run partition evidence. Both show ARI=1 throughout. |
| Native table "Improvement" | Existing UI uses signed relative change, including negative DBI change; direction-aware improvement would reverse the DBI sign. |
| Full precision between sources | Last-digit differences in Standard metric means and Enhanced CH are tabulated above; rounded UI text agrees. |
| Live browser selection | No browser session was inspected. Current rendering and all inspected completed study inputs agree; the report does not claim to identify a live session's selected job IDs. |

All requested Chapter 4 quantities were found in existing artifacts. No commit was made.

## 6. Additional read-only checks (2026-10-13)

### 6.1 Enhanced stage execution count and 435 pairwise ARIs

**The existing dedicated reproducibility batch executed DPC initialization plus Lloyd exactly 30 times**, each on the locked 2,437 x 6 retained-PC matrix with k=2. The historical three-element `enhanced.dpc.ariByRun` series is a reference-agreement disclosure; it is not the execution count of this dedicated batch. This count describes the reproducibility batch, not every Enhanced job ever run in the repository.

Execution source: `scripts/research/validation/repeat_enhanced_final_ui.py` (`execute`). Its loop `range(1, 31)` calls `exact_dpc_init(matrix.tolist(), k)` and `enhanced.run_enhanced_kmeans(matrix, initialization.centroid_matrix, k, ...)` on every iteration. It loads the saved selected k; no NbClust call occurs. The existing `apps/api/private/final-ui-evidence/enhanced-30-report.json` records 30 numbered runs, each with positive DPC and Lloyd timings, selectedK=2, and the saved NPZ SHA-256. The matrix and source hashes were verified against that report during this additional check.

Partition source: `apps/api/private/final-ui-evidence/enhanced-30-partitions.npz`, verified shape 30 x 2,437, unique participant IDs, and ARI=1 for every saved run versus the frozen Enhanced assignment CSV. All 435 unordered pairs (i<j) were freshly evaluated with scikit-learn adjusted_rand_score from these saved labels. Canonical label-invariant partitions were counted directly. No clustering stage was rerun: the condition "fewer than 30" was false.

Output: `docs/verification/enhanced_30run_ari.json` contains all 435 run-pair ARIs, summary statistics, execution count, source SHA-256s, and `newClusteringExecutions: 0`.

| Quantity | Verified value |
| --- | --- |
| Previously documented DPC + Lloyd executions | 30 |
| New DPC + Lloyd executions for this check | 0 |
| Pairwise comparisons (excluding self-pairs) | 435 |
| Mean ARI | 1 |
| Minimum ARI | 1 |
| Maximum ARI | 1 |
| Identical pairs (ARI=1) | 435/435 |
| Distinct label-invariant partitions | 1 |

### 6.2 Standard sweep seed and fixed k

**The k=2..10 maximum-Silhouette sweep uses seed 0. k is selected once, then fixed at 2 for every seed 0-29. It is not re-selected per replication seed.**

Source: `scripts/research/comparison/run_baseline_kmeans_comparison.py`: `K_SELECTION_SEED = 0`; `select_baseline_k` fits each candidate k using that seed and chooses `min(candidate_runs, key=(-silhouette, k))`; `run_baseline_replications(X, baseline_k)` passes the same selected k to every seed in `BASELINE_SEEDS`. Stored result: `data/interim/baseline_kmeans_k_selection.csv` and `data/interim/baseline_kmeans_runs.csv`.

Runtime source: `scripts/research/simulation/run_method.py` likewise runs `fit(k, 0)` for k=2..10, selects once, and evaluates all 30 seeds at that k (or a requested manual k). For the saved study baseline, selectedK=2; the seed-0 candidate is reused as the first replication rather than performing a new k sweep for each seed.

### 6.3 Exact NbClust call and counted indices

Source: `scripts/research/study_entry/select_cluster_count_nbclust.py` (`RANDOM_SEED`, `NBCLUST_INDICES`, structured R wrapper, `select_nbclust_from_matrix`). The script makes **26 separate calls**, resetting the same seed before each one. It uses the standard index="all" set by enumeration, but does **not** pass literal index="all" in a single call.

```r
set.seed(20260811)
NbClust::NbClust(
  data = data,         # frozen retained-PC input: 2437 rows, PC1-PC6
  distance = "euclidean",
  min.nc = 2,
  max.nc = 10,
  method = "kmeans",
  index = index_name   # one named index per call
)
```

the 24 counted index names, in configured order:

`kl`, `ch`, `hartigan`, `ccc`, `scott`, `marriot`, `trcovw`, `tracew`, `friedman`, `rubin`, `cindex`, `db`, `silhouette`, `duda`, `pseudot2`, `beale`, `ratkowsky`, `ball`, `ptbiserial`, `frey`, `mcclain`, `dunn`, `sdindex`, `sdbw`.

Ledger sources: `data/interim/clustering_nbclust_votes.csv` and `docs/verification/nbclust.json`. Hubert and Dindex are also called but are graphical/no-vote and excluded from the 24 counted recommendations. GAP, Gamma, Gplus and Tau belong to alllong and are not requested. The parameter seed is independently saved in `data/interim/clustering_selected_k.csv` (20260811).

### 6.4 Which ARI chart current SOP 3 displays

**The restored Study Findings SOP 3 displays both within-method pairwise ARI heatmaps: Standard and Enhanced. It does not display the random-vs-DPC ARI series as its main chart.**

| Current SOP 3 panel | Chart input | Comparison | Unique off-diagonal pairs |
| --- | --- | --- | --- |
| Random initialization / Standard | standard.initializationEvidence.standard.pairwiseAriMatrix | Each of 30 Standard seed partitions vs every other Standard seed partition | 435; 259 identical |
| DPC initialization / Enhanced | enhanced.initializationEvidence.enhanced.pairwiseAriMatrix | Each of 30 Enhanced run partitions vs every other Enhanced run partition | 435; 435 identical |

Source: `apps/web/src/components/final/SopPanels.tsx`, `Sop3` passes the corresponding method evidence to `Reproducibility`, which renders `<Heatmap matrix={evidence.pairwiseAriMatrix} ... ari />`. Each heatmap is 30 x 30 and includes its diagonal self-matches visually; reported pair counts and identical pairs use i<j and exclude all diagonal entries. The frequency bar and modal-partition percentage are separate displays.

The legacy/general component `apps/web/src/components/InitializationComparison.tsx` uses modal-reference ARI line charts and additional designated-reference disclosures, including random-vs-DPC when controlledRuns is supplied. That separate path does not describe the restored Study Findings pairwise heatmaps. Browser session selection was not inspected.

Only the requested report was appended and the new aggregate ARI JSON was saved. No code, input, model, or stored research result was changed; no commit was made.
