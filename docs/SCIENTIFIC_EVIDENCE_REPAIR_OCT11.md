# First scientific-evidence repair pass — October 11, 2026

Branch: `integration/final-mariel-backend-oct11`; HEAD: `7f1cc6edd1f0cc306da8f6ced61d314fe88be170`.
This report describes changes on top of the existing uncommitted integration, not remote main. All pre-existing modified and untracked files were preserved. No commits, staging, pushes, branch changes, merges, resets, cleanup, or stash operations were performed.

## Actual causes

- `FreshStudyResults` and `SimulationResults` supplied designated-reference ARI but did not supply partition-frequency or modal-ARI evidence to `InitializationComparison`. Historical Study Results also left those derived fields unbound.
- SOP 3's primary columns represented original Standard 13D versus Enhanced PCA. This did not isolate initialization. The controlled primary comparison now uses PCA-random versus PCA-DPC; original Standard 13D remains a separate baseline disclosure.
- Unavailable chart wrappers had a minimum height and stretched within cards. Missing evidence now uses short status text without reserved chart height.
- Historical findings were in a top-level, lazy disclosure below every fresh SOP tab. Longitudinal panels now appear in Final Results, with one detailed historical-record disclosure there. When no fresh results exist, one Historical Final Results section remains accessible.
- Historical diagnostic method jobs predate `assignmentsHash` and `comparisonSources`. They cannot satisfy the fresh provenance requirements. Their NPZ arrays were inspected and found identical to the historical CSVs, but that equality alone was not used as fresh provenance.
- Two existing frontend harnesses selected tabs by replacing a literal `useState("sop1")`. The new explicit initial-tab prop made that obsolete. Their selection hooks were updated; all numerical and functional assertions remain.
- The legacy LME validation's default `data/interim/unified_longitudinal_mixed_model.json` path is absent. An existing isolated validation snapshot contains the exact historical model and its hash-linked inputs. A test-only root override permits validation without copying or changing frozen artifacts.

## Artifact validation and paths

The frozen SOP and defense-geometry loaders verify checksums and source hashes before deriving historical evidence. The study-evidence loader also verifies correlation/calculation provenance. No saved scientific artifacts were edited.

- `data/interim/baseline_kmeans_assignments.csv`: 73,110 rows, 30 seeds, 2,437 participants per seed; SHA-256 `7fbcd0075ca23a5beae1908cb590fe39eab3ccb8ee7b322a29e38d2b8ba0f275`.
- `data/interim/dpc_comparison_random_assignments.csv`: 73,110 rows, 30 seeds, same cohort order; SHA-256 `fdb83f7dd423fd27b100e2299034a72065b8ee2b701993b4df091cd7bd09c0b4`.
- `data/interim/unified_cluster_assignments.csv`: 2,437 rows, saved DPC reference; SHA-256 `a98289c9f4548d26daf40060f13f07e18d9254f74e0f232d02cea016302090c5`.
- `clustering_features_standardized.csv` and `clustering_pca_scores.csv`: verified cohort order and source hashes. Both cohort identifiers are unique; assignment identifiers, seed/run indices, lengths and integer labels are checked. The cohort remains 2,437 participants with 13 retained features and six retained PCs.
- `apps/api/artifacts/defense_geometry.json`: checksum/source-linked saved reference DPC run 1 and previously validated reconstructed checks 2–3. Their origin remains explicit in the historical SOP 3 UI. No reconstruction was rerun in this pass.
- Historical diagnostic `partitions.npz` files in the Standard, Enhanced and comparison job directories: shapes 30×2,437, 3×2,437, and 30×2,437 controls; participant order and CSV equality verified. Missing assignment-hash fields exclude these older jobs from fresh evidence enrichment.
- Existing n=300 integration benchmark comparison under `apps/api/private/method-benchmarks/integration-af63934b-9a74-43bd-96b8-ea0182f97876`: fresh-schema job/result equality, assignment hashes, participant hashes/order, both source-result hashes and provenance, controlled k, reference ARI and pairwise summaries pass. Evidence is derived on read; job/result files remain unchanged.

Participant-level data remain in ignored local storage. Reports and derivation subprocess output contain only aggregate evidence and hashes, never participant identifiers or assignment rows.

## Exact historical SOP 3 results

Partitions are grouped after mapping cluster labels to first-occurrence canonical labels. Group names identify their earliest execution. The modal group has the greatest frequency; ties choose the earliest execution. Each run's modal ARI is against its own experiment's selected modal partition. Pairwise summaries include every unordered execution pair. Maximum differing participants uses optimal one-to-one label alignment.

| Experiment | Runs | Partition frequencies | Modal reference | Pairwise comparisons | Minimum pairwise ARI | Mean pairwise ARI | Maximum aligned disagreement |
|---|---:|---|---|---:|---:|---:|---:|
| Original Standard, 13 standardized features | 30 | 22, 8 | Seed 0 | 435 | 0.9917583536346767 | 0.9966654488269048 | 5 |
| PCA-random, six PCs, NbClust k=2 | 30 | 21, 7, 2 | Seed 0 | 435 | 0.99340465973853 | 0.9976378643414584 | 4 |
| PCA-DPC, six PCs, k=2 | 3 | 3 | Run 1 | 3 | 1 | 1 | 0 |

Per-run modal ARI:

- Standard seeds 4, 5, 16, 18, 22, 23, 25, 27: `0.9917583536346767`; all other seeds: `1`.
- PCA-random seeds 4 and 16: `0.99340465973853`; seeds 5, 18, 19, 22, 23, 25, 27: `0.9950516316927642`; all other seeds: `1`.
- PCA-DPC runs 1–3: `1`.

Separate designated-reference evidence remains unchanged: original Standard agreement with original Standard seed 0 is **22/30**, including the self-match; PCA-random agreement with DPC run 1 is **21/30**; DPC agreement with DPC run 1 is **3/3**. The modal counts happen to match these reference counts in the historical experiment; they were calculated independently rather than assumed equivalent.

The saved n=300 benchmark independently yields one partition in each experiment, frequencies 30/30/3, pairwise/modal ARI 1, and no aligned disagreements. These are sample-specific validation outcomes, not substitutes for the full-cohort results above.

## Changes in this pass

Backend and API:

- `apps/api/src/services/studyEvidenceArtifact.ts`: derive historical aggregates only after existing frozen-source checks; verify order/completeness, saved DPC reference and controlled reference ARI.
- `apps/api/src/services/partitionEvidence.ts` (new): asynchronously enrich completed API responses from verified saved assignments. Cache results using current source-file content hashes; recheck files after derivation. Persisted jobs/results remain immutable.
- `apps/api/src/routes/methodRuns.ts`: enrich completed GET and idempotent POST responses; reject unavailable or incompatible fresh assignment artifacts with HTTP 409.
- `apps/api/src/services/partitionEvidence.validation.ts` (new): synthetic invariance/tie/ARI checks and exact historical aggregate assertions.
- `apps/api/src/services/methodExecution.validation.ts`: inject the lifecycle fixture's evidence boundary; separately assert the real production route rejects its missing assignment files. Lifecycle assertions remain intact.
- `apps/api/src/services/mixedEffectsModel.validation.ts`: optional isolated validation root, preserving every existing scientific/privacy/hash assertion; additionally check exact model equality across frozen saved runs.

Shared contracts:

- `packages/shared/src/partitionEvidence.ts` (new): aggregate-only contract, repetition/reference checks, label-invariant derivation and optimal alignment.
- `packages/shared/src/methodExecution.ts`, `packages/shared/src/schema.ts`: optional verified initialization-evidence fields. No existing numerical values or algorithm parameters changed.

Frontend:

- `apps/web/src/components/InitializationComparison.tsx`: controlled labels and separately labeled 13D baseline; preserve reference definitions and DPC evidence; define aligned disagreement.
- `apps/web/src/components/SopComparison.tsx`: optional method badge label for PCA-random/PCA-DPC columns.
- `apps/web/src/components/SopComparison.css`: compact genuinely unavailable chart status.
- `apps/web/src/components/FreshStudyResults.tsx`: bind current verified aggregates; mount historical evidence only in Final Results.
- `apps/web/src/pages/SimulationRunsPage.tsx`: bind comparison-owned controlled initialization aggregates.
- `apps/web/src/pages/StudyFindingsPage.tsx`: bind historical aggregates, reuse original longitudinal panels, retain detailed historical records once, show source run/date and explicit historical attribution. Select stored runs that pass the frozen-study contract.
- `apps/web/tests/marielBackendIntegration.test.mjs`: verified aggregate bindings, reference labels, separate baseline, historical placement and existing common-space/SOP behavior.
- `apps/web/tests/lmeCard.test.mjs`, `apps/web/tests/studyFindings.test.mjs`: update tab-selection harnesses; retain scientific assertions and add historical attribution/uniqueness checks.

Read-only research derivation and tests:

- `scripts/research/validation/derive_partition_evidence.py` (new): hash/order-verified NPZ derivation; sklearn ARI and SciPy optimal alignment; cross-check existing reference and pairwise evidence. Does not fit clustering or models.
- `scripts/research/validation/test_partition_evidence.py` (new): invariance, deterministic ties, reference/modal distinction, ARI/alignment, order/hash/participant-provenance rejection and independent historical CSV parity.

`docs/MARIEL_BACKEND_INTEGRATION_OCT11.md` retains its earlier report and links this follow-up. This report is new.

Inspected supporting implementation includes `common_space.py`, `run_method.py`, baseline and Enhanced research producers, `recover_defense_geometry.py`, the longitudinal-refresh validation script, MethodExecutor, frozen artifact loaders, run repository, shared ARI/result schemas, `useMethodJobs`, `useSopEvaluation`, provenance helpers, SOP copy, common-space and controlled-evidence presentation. These supporting implementations were not rewritten.

## Historical longitudinal evidence

Existing snapshot: `apps/api/private/longitudinal-refresh/4b3dca3d-b435-4485-ac2b-18a0e442a624`.
Its model is byte-equivalent as a parsed object to the model in all **17** frozen saved unified runs. Validation confirms model input hashes, convergence, fixed original assignments, 1,845 eligible participants and 11,111 observations.

The preserved random-intercept ML model estimates annual ADAS-Cog13 changes of `0.5664670365343818` and `2.036147600391599`; interaction `1.469680563857217`, 95% CI `[1.3640611239844185, 1.5753000037300156]`, p=`8.95749142204344e-164`. The existing progression and LME cards are reused; source title, run ID and timestamp are visible. Fresh K-Means runs are explicitly not represented as refitting this model. The separate random-slope sensitivity result was not attached or substituted.

## Methodological checks

- Fresh Standard-versus-Enhanced primary quality comparison remains in the same 13D standardized evaluation space, with retained-PC evaluation supporting it.
- Native-space SOP 1 measurements remain visible, without cross-space quality-improvement claims. Existing neutral absolute differences and comparability caveats remain.
- Frozen Standard Silhouette and Enhanced NbClust both select k=2; controlled SOP 3 uses the same six-PC matrix and k=2.
- Standard seeds remain 0–29 with one random start each; DPC remains three repetitions. No frozen settings changed.
- Existing seed-specific calculations remain distinct from aggregate 30-run metric summaries.
- Scatter bindings remain each method's actual saved labels and projected centroids. Existing projection regression assertions pass.
- SOP 1/SOP 2 chart and table bindings, PCA loadings, NbClust details, execution hooks, readiness/preparation behavior and research calculations were preserved.

## Validation results

Final passing checks:

- `npm run typecheck`: shared, API and frontend.
- `npm run build -w @ad-clustering/web`: production build, 2,459 modules.
- All **14** `apps/web/tests/*.test.mjs` scripts, including extended scientific-evidence assertions.
- `.venv/Scripts/python.exe -B -m unittest discover -s scripts/research/validation -p 'test_*.py'`: **25 tests, OK**, 7.392 seconds. Saved full-cohort parity and inexpensive fixtures only. Existing Windows rpy2 ABI/locale warnings did not fail tests.
- Focused API scripts: partition evidence, common-space validation, independent method lifecycle/HTTP routes and preparation/cache validation.
- Existing API scripts: SOP evaluation, frontend contract, simulation metadata, simulation cohort, simulation sample, input contract.
- Existing mixed-model scientific assertions with `MIXED_MODEL_VALIDATION_ROOT` pointing to the snapshot above; added exact historical-run model equality passes for 17 runs.
- Saved n=300 API enrichment/cache/immutability check, plus actual reference/pairwise cross-checks.
- `git diff --check`; explicit modified/untracked source scan for trailing whitespace and conflict markers: clean.

Initial failures corrected: two frontend source-selection harnesses, floating-point exact-equality in the new synthetic ARI test (now checked to 1e-12), and the lifecycle fixture's lack of research files (separate injectable fixture boundary plus real rejection assertion).

The mixed-model test's **default root still lacks its expected artifact**. Its default invocation initially failed ENOENT. Validation passes against the existing verified snapshot using the explicit test root override; the absent default file was not regenerated, copied or replaced. No scientific assertion was weakened.

## Remaining evidence and browser QA

- Complete initial-centroid sets for every random execution are not saved in the assignment artifacts. Their distinct-set count remains unavailable; random seeds are not treated as proof of distinct initial centroids.
- Legacy diagnostic jobs without assignment/result-source hashes remain ineligible for fresh evidence binding. Historical CSV provenance and newer immutable job artifacts are separate paths.
- Fresh runs still do not produce new longitudinal fits or participant-profile results. Only existing historically validated longitudinal results are shown with attribution.
- Interactive browser QA was not performed in this pass. Check SOP 3 chart sizing/tooltips and controlled labels, separate baseline/reference disclosures, compact missing states, historical content only in Final Results, detailed-record navigation, SOP 1/SOP 2 charts, and single-method/paired states at desktop/mobile widths.
- No expensive full-cohort clustering or model fits were run. Modal and pairwise measurements were derived from saved assignments.

## Final Git status

HEAD and branch unchanged. **28 modified tracked files, 38 untracked files, 0 staged files** after adding this report. This includes the original integration's 25 modified and 32 untracked files; none were removed. Both stashes and main were untouched. The complete status file list follows the prior integration report plus the additional paths listed in this report.

```text
 M apps/api/src/app.ts
 M apps/api/src/routes/cluster.ts
 M apps/api/src/services/frontendContract.validation.ts
 M apps/api/src/services/mixedEffectsModel.validation.ts
 M apps/api/src/services/researchPipelineOrchestrator.ts
 M apps/api/src/services/simulationExecution.ts
 M apps/api/src/services/simulationExecution.validation.ts
 M apps/api/src/services/simulationMetadata.validation.ts
 M apps/api/src/services/studyEvidenceArtifact.ts
 M apps/web/src/App.tsx
 M apps/web/src/components/InitializationComparison.tsx
 M apps/web/src/components/InternalValidationCalculationDetails.tsx
 M apps/web/src/components/MetricComparisonTable.tsx
 M apps/web/src/components/NbClustComparison.tsx
 M apps/web/src/components/SopComparison.css
 M apps/web/src/components/SopComparison.tsx
 M apps/web/src/components/SopFigures.tsx
 M apps/web/src/pages/SimulationRunsPage.tsx
 M apps/web/src/pages/StudyFindingsPage.tsx
 M apps/web/src/pages/UploadAndCluster.tsx
 M apps/web/src/utils/validatedDataset.ts
 M apps/web/tests/datasetSetup.test.mjs
 M apps/web/tests/lmeCard.test.mjs
 M apps/web/tests/studyFindings.test.mjs
 M packages/shared/src/schema.ts
 M scripts/research/comparison/run_baseline_kmeans_comparison.py
 M scripts/research/study_entry/construct_study_entry_cohort.py
 M scripts/research/study_entry/run_enhanced_kmeans.py
?? apps/api/src/routes/methodRuns.ts
?? apps/api/src/routes/studyPreparations.ts
?? apps/api/src/services/cohortReuse.ts
?? apps/api/src/services/commonSpace.validation.ts
?? apps/api/src/services/methodExecution.fixture.ts
?? apps/api/src/services/methodExecution.real.validation.ts
?? apps/api/src/services/methodExecution.ts
?? apps/api/src/services/methodExecution.validation.ts
?? apps/api/src/services/partitionEvidence.ts
?? apps/api/src/services/partitionEvidence.validation.ts
?? apps/api/src/services/researchExecutionCapacity.ts
?? apps/api/src/services/studyPreparation.ts
?? apps/api/src/services/studyPreparation.validation.ts
?? apps/web/src/components/CommonSpaceValidation.tsx
?? apps/web/src/components/ControlledSopEvidence.tsx
?? apps/web/src/components/FreshStudyResults.tsx
?? apps/web/src/components/MethodDecisionGraph.tsx
?? apps/web/src/components/MethodExecutionControls.tsx
?? apps/web/src/hooks/useMethodJobs.ts
?? apps/web/tests/independentJobs.test.mjs
?? apps/web/tests/marielBackendIntegration.test.mjs
?? docs/MARIEL_BACKEND_INTEGRATION_OCT11.md
?? docs/SCIENTIFIC_EVIDENCE_REPAIR_OCT11.md
?? packages/shared/src/methodExecution.ts
?? packages/shared/src/partitionEvidence.ts
?? packages/shared/src/studyPreparation.ts
?? scripts/research/simulation/common_space.py
?? scripts/research/simulation/exact_runtime.py
?? scripts/research/simulation/prepare_method_data.py
?? scripts/research/simulation/run_method.py
?? scripts/research/validation/benchmark_independent_methods.py
?? scripts/research/validation/derive_partition_evidence.py
?? scripts/research/validation/profile_cohort_preparation.py
?? scripts/research/validation/test_cohort_preparation.py
?? scripts/research/validation/test_common_space.py
?? scripts/research/validation/test_exact_runtime.py
?? scripts/research/validation/test_partition_evidence.py
?? scripts/research/validation/validate_longitudinal_refresh.py
```
