# Run controls and calculation details

R4 cause: ExactMetrics.calculation and the representative-participant branch expose only one example; the schema and cohort-reuse cache contain no full participant-row reference, so the UI receives no complete table.

## Status

| Item | Status | Result |
|---|---|---|
| R1 | Done | Ticking/per-run seconds removed from active Analysis Runs cards; Computed date retained; existing artifact timings displayed only in collapsed Run details. |
| R2 | Done | One formatter with explicit kinds and unit coverage; all changed call sites and intentional expectation updates are in FORMAT_CALL_SITES.md. Dates and RID collation remain separate. |
| R3 | Done | Four SOP 1 panels use native dialogs, large content, X/Esc close and focus return; loading matrix remains visible; duplicate retention line removed; one metric title/subtitle, short Difference header and caption direction. |
| R4 | Done | Verified read-only derivation from cached standardized.csv, scores.npy and saved partitions; private sidecar plus checksum beside stored run; optional API schema reference, local-only row endpoint and lazy completed-job enrichment. Existing result/job/assignment artifacts remain immutable. |
| R5 | Done | One disclosure per active metric table; method/evaluation chips, seed-0/deterministic tabs, sortable paginated rows, seed metrics, substituted DB/CH arithmetic and one run-summary table. |

## Validation

- Web typecheck: passed.
- Full web suite: 19 files executed; 18 passed initially. The remaining integration test asserted the intentionally removed long Difference heading and six-decimal mean in calculation details; its exact caption and seed-result assertions were updated and it passed on affected-only rerun. All 19 now pass.
- Shared contracts: passed.
- Workspace build: passed (shared, API and web).
- Rows: six common-space variants plus native variant tested on the stored full-cohort comparison; each has 2,437 records, stored-mean error and sklearn disagreement within 1e-9. No participant rows appear in logs/reports. Optional API references tested.
- DB/CH arithmetic: all six variants reproduce displayed seed results within 0.5e-6, with no comparison mean substituted as a worked-example result.
- Dialog lifecycle: native showModal, same content, X close, Escape cancellation and focus restoration tested.

## Sources and limits

Worker: scripts/research/simulation/run_method.py and exact_runtime.py (read only). Cache: scripts/research/simulation/prepare_method_data.py and the stored request cacheDirectory/preparationKey or compatibilityKey (read only). History: fix/silhouette-representative-participant and ad6b45f. Stored validation source: apps/api/private/method-runs/07b8c0b6-9789-4249-a27f-7dea49baa30f/{job.json,result.json,partitions.npz,request.json}. Sidecars: participant-calculations.json and participant-calculations.sha256 in that run directory; the earlier cached sample also has a native sidecar, and other completed runs are derived lazily from their own sources. No clustering, PCA, preprocessing or NbClust stage was run or changed.

The requested docs/figma-make-export/src/CalculationDetails.tsx reference is absent; the participant table follows the explicit requested columns and behavior. The prescribed two-cluster DB substitution is shown only for K=2; other K values display a visible not-applicable state rather than incorrect arithmetic. Missing/corrupt row sources leave completed aggregate results available and show an unavailable state. Raw rows are confined to private sidecars and the local-only browser endpoint.

## Files changed in this task

- `apps/web/src/utils/formatNumber.ts`
- `apps/web/src/utils/numberFormatting.ts`
- `apps/web/src/config/api.ts`
- `apps/web/src/components/MethodExecutionControls.tsx`
- `apps/web/src/components/MetricComparisonTable.tsx`
- `apps/web/src/components/InitializationComparison.tsx`
- `apps/web/src/components/PcaLoadingMatrix.tsx`
- `apps/web/src/components/FreshStudyResults.tsx`
- `apps/web/src/components/SopComparison.tsx`
- `apps/web/src/components/DpcCenterTable.tsx`
- `apps/web/src/components/SopFigures.tsx`
- `apps/web/src/components/ExpandPanel.tsx`
- `apps/web/src/components/FeatureRepresentationComparison.tsx`
- `apps/web/src/components/ControlledSopEvidence.tsx`
- `apps/web/src/components/VerifiedStudyMetrics.tsx`
- `apps/web/src/components/InternalValidationCalculationDetails.tsx`
- `apps/web/src/components/SilhouetteCalculationCard.tsx`
- `apps/web/src/components/CommonSpaceValidation.tsx`
- `apps/web/src/components/MethodDecisionGraph.tsx`
- `apps/web/src/components/InternalValidationCalculationDetails.css`
- `apps/web/src/components/charts/PartitionProjection.tsx`
- `apps/web/src/components/charts/FinalFindingsCharts.tsx`
- `apps/web/src/pages/StudyFindingsPage.tsx`
- `apps/web/src/styles.css`
- `apps/api/src/routes/methodRuns.ts`
- `apps/api/src/services/calculationRows.ts`
- `packages/shared/src/calculationEvidence.ts`
- `scripts/research/validation/derive_calculation_rows.py`
- `apps/web/tests/formatNumber.test.mjs`
- `apps/web/tests/expandPanel.test.mjs`
- `apps/web/tests/calculationRows.test.mjs`
- `apps/web/tests/calculationArithmetic.test.mjs`
- `apps/web/tests/lmeCard.test.mjs`
- `apps/web/tests/studyFindings.test.mjs`
- `apps/web/tests/finalPresentation.test.mjs`
- `apps/web/tests/pcaLoadingMatrix.test.mjs`
- `apps/web/tests/varianceSummary.test.mjs`
- `apps/web/tests/initializationComparison.test.mjs`
- `apps/web/tests/metricComparison.test.mjs`
- `apps/web/tests/silhouetteCalculation.test.mjs`
- `apps/web/tests/marielBackendIntegration.test.mjs`
- `apps/web/FORMAT_CALL_SITES.md`
- `apps/web/RUN_CONTROLS_CALCULATION_REPORT.md`

All changes remain uncommitted. Existing tests were retained; only assertions for intentional presentation/precision changes and the dialog state harness were updated.
