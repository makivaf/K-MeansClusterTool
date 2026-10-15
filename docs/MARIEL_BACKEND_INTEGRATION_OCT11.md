# Mariel frontend / independent backend integration ? October 11, 2026

Branch: integration/final-mariel-backend-oct11. Baseline and HEAD: 7f1cc6e. Backend source: 883c919; verified component source: 1ec34fa.

## Reconciliation and preservation

Individually inspected and reused 32 API, shared-contract and research files byte-for-byte from 883c919. No merge, cherry-pick, stash application or branch change. Mariel's CSS, chart implementations, FeatureRepresentationComparison, historical StudyResults panels, longitudinal/LME presentation and frozen provenance gates remain unchanged. Shared component changes supply Enhanced-only layouts, explicit reference definitions, neutral differences and single-method calculation toggles.

The old IndependentStudyPage and IndependentMethods were not restored. The existing Study Findings module has an entry point for independent jobs and retains its historical renderer. FreshStudyResults binds the distinct method contract to the existing tabs, panels, PCA/NbClust/DPC components, scatterplots and distribution cards. Simulation retains its configuration and paired-result layout; its execution wiring and metric bindings changed.

## Runtime workflow

- Seven-file upload validation starts verified cohort preparation: Preparing, Ready and Error/retry are distinct. Reload rechecks readiness. Preparation updates on the same upload do not reset jobs.
- Either method runs first. Durable jobs have independent progress, cancellation/retry and retained successes. Explicit reruns get new IDs and perform fresh fits; uncertain POST retries retain their ID.
- Heavy work is serialized across preparation, independent jobs and legacy endpoints. Hash-verified cohort/preprocessing/PCA caches invalidate on input, code, settings or dependency changes.
- Standard retains 30 seeds. Enhanced retains both full NbClust checks and three separately executed DPC/Lloyd repetitions. Canonical DPC source, settings and numerical outputs remain unchanged.
- Comparisons require compatible provenance and matching completed job IDs. Both assignments are evaluated in 13 standardized features (primary) and retained PCs (supporting), with neutral absolute differences. Native-space values are supplementary without cross-space improvement percentages.
- Stored historical profiles, longitudinal curves and LME results remain accessible separately with actual source-run metadata; they are never attached to fresh jobs.

## Validation results

- Shared/API/frontend typechecks: PASS.
- Frontend production build: PASS.
- All 14 frontend regression scripts: PASS (12 baseline scripts plus independentJobs and marielBackendIntegration).
- API independent execution, common-space/provenance and preparation/cache suites: PASS.
- Existing API simulation execution/cohort/sample/metadata, upload manifest, orchestration, frontend contract and SOP artifact suites: PASS. Two obsolete frontend-facing harnesses were adapted to current Mariel labels and independent job controls while retaining scientific checks. Historical contract validation now reads the real durable run history used by the page because the old consolidated raw aggregate is absent; no artifact/model was reconstructed.
- All 20 available Python tests: PASS, including full-cohort common-space parity within 1e-12, exact-runtime parity, three separate DPC/Lloyd calls, cohort duplicate/selection rules and controlled NbClust inputs.
- Frozen cohort: 2,437 participants and the exact same 13 retained features: MMSE, ADAS13, LMI, LMD, TMT_A, TMT_B, CATEGORY_FLUENCY_ANIMALS, RAVLT_IMMEDIATE, RAVLT_DELAYED, RAVLT_FORGETTING, CDRSB, FAQ, GDS.
- Real 300-participant API exercise: PASS Enhanced-first, Standard, comparison and genuine warm reruns. New IDs reproduced outputs; completed results restored; frozen hashes remained byte-identical. Record: apps/api/private/method-benchmarks/integration-af63934b-9a74-43bd-96b8-ea0182f97876/integration-summary.json.
- Whitespace/conflict/import/JSX checks: PASS.

No new full-cohort Enhanced experiment was run. Cold raw-seven-file preparation was not repeated in this first pass; its validated implementation and focused preparation/cache checks were reused.

## Missing evidence and pending review

Fresh jobs do not supply modal-partition ARI/frequency arrays, fresh profile means or a longitudinal model. Missing modal evidence remains unavailable. Seed-0, DPC-run-1 and controlled PCA-random references remain separate. Verified historical profiles and longitudinal findings remain accessible. Full-cohort Enhanced performance acceptance is not newly established.

No known functional wiring blocker remains. Interactive browser visual QA is pending; rendered component tests and the production build validate bindings while Mariel's styles are preserved. The manual SimulationRunsPage.validation.cjs harness still targets retired combined-run controls; the API metadata suite exercises the active independent-job, presentation and progress tests instead.

## Files changed or added

### API

- `apps/api/src/app.ts`
- `apps/api/src/routes/cluster.ts`
- `apps/api/src/services/frontendContract.validation.ts`
- `apps/api/src/services/researchPipelineOrchestrator.ts`
- `apps/api/src/services/simulationExecution.ts`
- `apps/api/src/services/simulationExecution.validation.ts`
- `apps/api/src/services/simulationMetadata.validation.ts`
- `apps/api/src/routes/methodRuns.ts`
- `apps/api/src/routes/studyPreparations.ts`
- `apps/api/src/services/cohortReuse.ts`
- `apps/api/src/services/commonSpace.validation.ts`
- `apps/api/src/services/methodExecution.fixture.ts`
- `apps/api/src/services/methodExecution.real.validation.ts`
- `apps/api/src/services/methodExecution.ts`
- `apps/api/src/services/methodExecution.validation.ts`
- `apps/api/src/services/researchExecutionCapacity.ts`
- `apps/api/src/services/studyPreparation.ts`
- `apps/api/src/services/studyPreparation.validation.ts`

### Frontend

- `apps/web/src/App.tsx`
- `apps/web/src/components/InitializationComparison.tsx`
- `apps/web/src/components/InternalValidationCalculationDetails.tsx`
- `apps/web/src/components/MetricComparisonTable.tsx`
- `apps/web/src/components/NbClustComparison.tsx`
- `apps/web/src/components/SopComparison.tsx`
- `apps/web/src/components/SopFigures.tsx`
- `apps/web/src/pages/SimulationRunsPage.tsx`
- `apps/web/src/pages/StudyFindingsPage.tsx`
- `apps/web/src/pages/UploadAndCluster.tsx`
- `apps/web/src/utils/validatedDataset.ts`
- `apps/web/tests/datasetSetup.test.mjs`
- `apps/web/tests/lmeCard.test.mjs`
- `apps/web/tests/studyFindings.test.mjs`
- `apps/web/src/components/CommonSpaceValidation.tsx`
- `apps/web/src/components/ControlledSopEvidence.tsx`
- `apps/web/src/components/FreshStudyResults.tsx`
- `apps/web/src/components/MethodDecisionGraph.tsx`
- `apps/web/src/components/MethodExecutionControls.tsx`
- `apps/web/src/hooks/useMethodJobs.ts`
- `apps/web/tests/independentJobs.test.mjs`
- `apps/web/tests/marielBackendIntegration.test.mjs`

### Shared contracts

- `packages/shared/src/schema.ts`
- `packages/shared/src/methodExecution.ts`
- `packages/shared/src/studyPreparation.ts`

### Research implementation and validation

- `scripts/research/comparison/run_baseline_kmeans_comparison.py`
- `scripts/research/study_entry/construct_study_entry_cohort.py`
- `scripts/research/study_entry/run_enhanced_kmeans.py`
- `scripts/research/simulation/common_space.py`
- `scripts/research/simulation/exact_runtime.py`
- `scripts/research/simulation/prepare_method_data.py`
- `scripts/research/simulation/run_method.py`
- `scripts/research/validation/benchmark_independent_methods.py`
- `scripts/research/validation/profile_cohort_preparation.py`
- `scripts/research/validation/test_cohort_preparation.py`
- `scripts/research/validation/test_common_space.py`
- `scripts/research/validation/test_exact_runtime.py`
- `scripts/research/validation/validate_longitudinal_refresh.py`

This report is also new. Nothing staged, committed or pushed. Both stashes, main and protected integration branches were untouched. Real validation output is retained only in private ignored storage.

The subsequent scientific-evidence repair pass is documented in [SCIENTIFIC_EVIDENCE_REPAIR_OCT11.md](SCIENTIFIC_EVIDENCE_REPAIR_OCT11.md). It derives verified modal/partition evidence and restores historical longitudinal visibility without refitting clustering or models; the original integration record above is preserved.
