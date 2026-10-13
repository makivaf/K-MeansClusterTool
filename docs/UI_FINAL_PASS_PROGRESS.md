# Final UI pass progress

Branch: `final/system-oct12`. All work remains uncommitted.
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

## Revision pass - final/system-oct12

| Item | Status | Files touched |
| --- | --- | --- |
| 1 | Diagnosed: Enhanced stores only three runs and no job-local evidence; optional private external 30-run files cannot serve a fresh checkout. | run_method.py; methodExecution.ts; derive_partition_evidence.py (inspection) |
| 2 | Implemented: once-only NbClust, 30 DPC + Lloyd repetitions, exact job-partition assertion, per-job aggregate/ARI evidence. Existing comparison scoring retains its first three identical Enhanced repetitions. Runtime pending end-to-end verification. | run_method.py; derive_partition_evidence.py |
| 3 | Implemented independent full-width method switch and per-method Final Results; comparison remains gated by compatible completions. | StudyResults.tsx; SopPanels.tsx; FinalResults.tsx |
| 4 | Implemented: Restored native-space Internal validation primary table, signed computed improvement and footnote; both same-space plots collapsed; reliability tiles retained. Artifact verification/tests pending. | components/final/*.tsx |
| 5 | Implemented: Restored SOP 1 native-space PCA contribution table, computed improvement, footnote and collapsed same-space checks. Artifact verification/tests pending. | components/final/*.tsx |
| 6 | Implemented: SOP 3 quality comparison uses both conditions in retained PCs. Artifact verification/tests pending. | components/final/*.tsx |
| 7 | Implemented: Plain-language ARI labels with symbols and chance-correction explanation; Enhanced uses Run. Artifact verification/tests pending. | components/final/*.tsx |
| 8 | Implemented: Updated exact top-three absolute-loadings legend. Artifact verification/tests pending. | components/final/*.tsx |

Revision verification: items 4/5 match the saved full-study artifacts to six decimals; no mismatches. Final: Standard 0.331875 / 1.224116 / 1,442.023132; Enhanced 0.372700 / 1.075885 / 1,800.024958; improvements +12.30% / -12.11% / +24.83%. SOP 1 PCA + random: 0.372770 / 1.075644 / 1,800.016609; improvements +12.32% / -12.13% / +24.83%. Exact artifact paths and rendered values are recorded in `docs/verification/revision_pass.json`.

Items 3–8: affected final UI, independent jobs, Study Findings, final presentation, and number-format tests passed. Python evidence tests (6 cases), shared contracts and build passed; final UI text corrections are undergoing the final build. Item 2 Enhanced full-study job is running; runtime and actual SOP 3 rendering pending.

Item 2 integration correction: the legacy DPC validator requires exactly three inputs. Apply existing DPC/Lloyd validators to each group of three and retain the exact all-30 job-partition assertion. First integration attempt failed before Lloyd and published no result; retrying after this correction.

Item 2 publication correction: all 30 partitions passed equality and evidence derivation, but the legacy Enhanced metadata contract permits exactly three ariByRun entries. Preserve that original three-entry field unchanged; the job-local initializationEvidence, partitions and fit evidence carry all 30 repetitions. Retrying full execution/publication after this contract correction.

Item 2 correction applied and checked at the worker source: the previous metadata replacement did not match CRLF, leaving the three-entry contract failure in place. The exact ariByRun expression now uses runs[:3]; full 30-run evidence remains unchanged.

| Revision item | Final status |
| --- | --- |
| 1 | Complete: no job-local evidence, three historical repetitions and dependence on optional private external evidence caused the fresh-checkout gap. |
| 2 | Complete: published full-study Enhanced job 65eb2ae8-5baf-440f-8548-4aad19945328; NbClust once; all 30 exact partitions identical, 435 ARI pairs at 1, zero differing participants; own evidence rendered by SOP 3 and independently re-derived from hash-verified run partitions. Wall 261.08s; added 27 DPC + Lloyd repetitions 42.12s; evidence 2.82s. Legacy Enhanced result fields and partition equal the previous artifact exactly. Preserve three-entry metadata; all 30 live in job evidence. |
| 3 | Complete: independent method switch, full-width per-method sections and Final Results; compatible completed-method comparison gate. |
| 4 | Complete: requested native-space primary table, all expected values verified, signed improvements, one-line footnote, collapsed two-space checks and unchanged reliability tiles. |
| 5 | Complete: requested PCA contribution primary table and footnote, all expected values verified, collapsed two-space checks. |
| 6 | Complete: PCA + random versus DPC quality display uses their shared retained-PC space. |
| 7 | Complete: six requested plain-text term labels, Seed/Run naming and chance-correction explanation. |
| 8 | Complete: exact loadings legend. |
| Final checks | Passed: web typecheck, five affected web test files, six Python evidence tests (including all-30 assertion rejection cases), shared contracts, build, full-study Enhanced executor/publication and actual SOP 3 component render with own evidence. No mismatches or unresolved issues. Three failed unpublished integration attempts are documented above; corrected execution passed. No commit/push. |

Changed files:
- `scripts/research/simulation/run_method.py`
- `scripts/research/validation/derive_partition_evidence.py`
- `apps/web/src/components/final/StudyResults.tsx`
- `apps/web/src/components/final/FinalResults.tsx`
- `apps/web/src/components/final/RangeCards.tsx`
- `apps/web/src/components/final/SopPanels.tsx`
- `apps/web/tests/finalUiPass.test.mjs`
- `scripts/research/validation/test_ari_calculation.py`
- `docs/UI_FINAL_PASS_PROGRESS.md`
- `docs/verification/revision_pass.json`

Aggregate verification and source paths: `docs/verification/revision_pass.json`. Existing untracked `docs/figma-make-export/` preserved. Temporary revision scripts removed. Stopped.
