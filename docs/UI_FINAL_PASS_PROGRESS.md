# Final UI pass progress

Branch: `integration/final-mariel-backend-oct11`. All work remains uncommitted.
Existing uncommitted changes must be preserved. Page 03 is excluded.

| Item | Status | Files touched |
| --- | --- | --- |
| D1 | Complete: 30/30 ARI = 1; runtime 46.69s; web typecheck passed; no affected web tests | scripts/research/validation/repeat_enhanced_final_ui.py; apps/api/private/final-ui-evidence/enhanced-30-partitions.npz; apps/api/private/final-ui-evidence/enhanced-30-report.json |
| D2 | Complete: three 30-square symmetric matrices, diagonal 1, 435 pairs each; additive optional schema; web typecheck passed | scripts/research/validation/derive_partition_evidence.py; scripts/research/validation/derive_final_ui_evidence.py; packages/shared/src/partitionEvidence.ts; apps/web/src/data/finalUiEvidence.json |
| D3 | Complete: optional presentation schema, read-only /api/study-final-ui endpoint, source-hash validation, full projections, observed bins/n, both verified models; existing job timings/full xy retained; web typecheck passed | packages/shared/src/finalUiEvidence.ts; apps/api/src/services/finalUiEvidence.ts; apps/api/src/app.ts; scripts/research/validation/derive_partition_evidence.py; packages/shared/src/partitionEvidence.ts |
| U1 | Complete: isolated Study Findings tokens, Inter, tabular numerals, export sizes/radii/padding; web typecheck passed | apps/web/src/components/final/FinalUi.css; apps/web/src/components/final/ui.tsx |
| U2 | Complete: two columns, persisted computed timestamp, single shared run-details/overhead table, two-decimal durations; web typecheck passed | apps/web/src/components/final/RunsCard.tsx |
| U3 | Complete: gated segmented view, persistent SOP panels/disclosures, rerun placeholders; web typecheck passed | apps/web/src/components/final/StudyResults.tsx; apps/web/src/pages/StudyFindingsPage.tsx |
| U4 | Complete: consistent panel headers, native fit-content dialogs with Escape/X/focus return, accessible hover correlation/ARI matrices | apps/web/src/components/final/ui.tsx; apps/web/src/components/final/Heatmap.tsx |
| U5 | Complete: correlation, cumulative variance/PC table, loadings disclosure, contribution range/calculations; web typecheck passed | apps/web/src/components/final/SopPanels.tsx |
| U6 | Complete: fixed-height real-data charts on k=2..10, ledger-derived zero-vote bins, grouped vote chips and index reference | apps/web/src/components/final/SopPanels.tsx |
| U7 | Complete: 30-square strips/stat tiles, partition-ordered ARI matrices, DPC centers and decision graph disclosure, quality range disclosure | apps/web/src/components/final/SopPanels.tsx |
| U8 | Complete: 13-variable range bands from run summaries; backend supporting spaces retained; web typecheck passed | apps/web/src/components/final/RangeCards.tsx |
| U9 | Complete: one disclosure, first sidecar row, five-row preview, RID/page-size/sort dialog, DB/CH substitution and range footers | apps/web/src/components/final/CalculationDetails.tsx |
| U10 | Complete: requested ordering, headline/scorecard/ranges, 100% distribution/aligned caption, observed-bin chart/n, annual tiles, locked primary/sensitivity forest, collapsed full scatter | apps/web/src/components/final/FinalResults.tsx; apps/web/src/components/final/FinalLongitudinal.tsx; apps/web/src/pages/StudyFindingsPage.tsx |
| U11 | Complete: no Stored Study Findings, Improvement column, percent-change or arrows in active Study Findings; removed legacy Study Findings supporting-space disclosure and task wording; page 03 supporting-space UI retained under explicit exclusion; web typecheck passed | apps/web/src/components/VerifiedStudyMetrics.tsx; apps/web/src/data/verifiedStudyPresentation.json |
| Final tests | Complete: workspace typecheck, 20 web test files, shared contracts, 3 new + 5 affected Python tests, build and both dist folders passed; no existing tests changed | scripts/research/validation/test_final_ui_evidence.py; apps/web/tests/finalUiPass.test.mjs |

Resume from the first unfinished item. Do not rerun completed scientific work.

Final report: `docs/UI_FINAL_PASS_REPORT.md`. Stopped for visual review.

## Follow-up fixes

| Item | Status | Files touched |
| --- | --- | --- |
| F1 | Complete; web typecheck and datasetSetup test passed. Chart/counts now read scope-restricted audit; copied counts corrected to artifact values. | StudyEntrySummary.tsx; DatasetSetup.css; data/datasetMissingness.json |
| F2 | Complete; web typecheck and studyFindings test passed, including assertion that the subtitle is absent. | StudyFindingsPage.tsx; studyFindings.test.mjs |
| F3 | Complete; fitted correlation cells, every PC tick, shared short names and top-three absolute loading emphasis; web typecheck and finalUiPass test passed. | SopPanels.tsx; Heatmap.tsx; FinalUi.css; finalUiPass.test.mjs |
| F4 | Complete; strips, count captions, matrix-derived identical pairs (Standard 259/435; Enhanced 435/435), partition order and fixed ARI scale; web typecheck, finalUiPass and formatNumber tests passed. | SopPanels.tsx; Heatmap.tsx; FinalUi.css; formatNumber.ts; finalUiPass.test.mjs |
| F5 | Complete; web typecheck and finalUiPass test passed. Exact LME input audit: stored means match; n now counts observations, full bins total 11,111 across 1,845 participants. Full zero-filled count table retained; supported-bin chart, Primary model tiles, integer forest axis and singular interpretation. | FinalResults.tsx; FinalLongitudinal.tsx; finalUiEvidence.ts (shared/API); derive_longitudinal_ui_counts.py; verification/longitudinal_ui.json; finalUiPass.test.mjs |
| F6 | Complete; web typecheck passed; no affected web tests. Standard uses stored iterations: min 6, median 10.5, max 13, mean 10.3. Enhanced replays only Lloyd with saved initial centroids: all 30 are 12 iterations, exact assignment parity; source hashes unchanged. | report_lloyd_iterations.py; verification/lloyd_iterations.json |
| Follow-up final checks | Complete: workspace typecheck, all 20 web test files, shared contracts, and production build passed. Same branch; nothing staged, committed, stashed or reset. | verification/followup_web_tests.json |
| ARI calculation addendum | Complete; new Python test (4 cases), web typecheck, affected finalUiPass test and build passed. Standard seeds 0/4, cells [[0,1554],[878,5]], ARI 0.991758; Enhanced runs 1/2. Optional records only; cohort hashes match and existing stored values preserved. Nothing staged, committed, stashed or reset. | derive_partition_evidence.py; partitionEvidence.ts; SopPanels.tsx; finalUiEvidence.json; test_ari_calculation.py; finalUiPass.test.mjs |
| Small fix pass | Complete: NbClust chart margin, labels and fixed vote axis; SOP 3 bar/stat/matrix order and single calculation disclosure; display-only maximum-overlap contingency columns; comparable quality title and Enhanced-only integer-axis scatter. Web typecheck, affected finalUiPass test and build passed. No computed results or artifacts changed; nothing staged, committed, stashed or reset. | SopPanels.tsx; FinalResults.tsx; finalUiPass.test.mjs |
