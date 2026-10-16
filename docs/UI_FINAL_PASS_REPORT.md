# Final UI pass report

## Follow-up F1-F6 (October 12, 2026)

All six follow-up items are complete on `integration/final-mariel-backend-oct11`.
Nothing was staged, committed, stashed or reset. Existing work and computed
research results were preserved. Each item passed its web typecheck and affected
web tests; F6 has no affected web tests.

- F1: horizontal missingness bars, threshold line and counts disclosure; four
  summary tiles; simplified ready dataset card. All audit numbers are imported
  from the scope-restricted missingness CSV and displayed through `formatNumber`.
  Previously copied retained-variable counts were corrected to artifact values.
- F2: removed the validated-cohort subtitle from both Study Findings headings.
- F3: correlation matrix fits its panel, all PC ticks are shown, and the PC
  composition table shares short names and marks exactly three largest absolute
  loadings per PC column.
- F4: unlabeled strips, explicit partition/count captions, partition-ordered ARI
  matrices with sparse labels and a fixed 0.990-1.000 legend. Identical pairs are
  computed from the upper triangle: Standard 259/435 (59.5%); Enhanced 435/435
  (100%).
- F5: Output reliability heading, Primary model tiles, integer forest ticks and
  one model interpretation. The exact LME input was validated without fitting:
  stored means already matched its 1,845 participants and 11,111 observations.
  The former table counted unique participants per bin; the new table counts
  observations, which sum to 11,111. Participant counts across bins are
  non-additive. All 21 bins remain in the zero-filled count table; 9 meet the
  threshold of at least 20 observations in each cluster and are plotted. Chart
  evidence is linked to the verified LME sources by hashes.
- F6: Standard iteration counts were read from the 30 stored seed records.
  Enhanced was replayed through Lloyd only, reusing the saved PCA matrix, k and
  initial DPC centroids. All 30 assignments exactly matched the saved repetitions;
  source hashes were unchanged. No DPC, NbClust, PCA, quality metrics or models
  were recomputed.

| Method | Min | Median | Max | Mean |
| --- | ---: | ---: | ---: | ---: |
| Standard | 6 | 10.5 | 13 | 10.3 |
| Enhanced | 12 | 12 | 12 | 12 |

Verification artifacts: `docs/verification/longitudinal_ui.json`,
`docs/verification/lloyd_iterations.json`, and
`docs/verification/followup_web_tests.json`.

Final checks passed: workspace typecheck, all 20 web test files, shared
contracts, and production build. No browser visual review is claimed.

Branch: `integration/final-mariel-backend-oct11`. All changes are uncommitted.
No staging, commits, stash, checkout, restore, reset, or push were performed.
Existing uncommitted work was preserved. Page 03 and its presentation components were left unchanged.

## Status

D1–D3 and U1–U11 are implemented and verified by typecheck and automated checks.
The per-item status and file inventory are in `docs/UI_FINAL_PASS_PROGRESS.md`.
Visual review is the next step; no browser visual review is claimed here.

## D1 and D2

- D1 completed in **46.6925469 seconds**. The first-run estimate was 53.36 seconds.
- All **30 Enhanced partitions have ARI = 1** against the authoritative stored Enhanced assignments.
- Only DPC initialization and the existing Lloyd routine were repeated. The saved prepared PCA matrix and selected-k artifact were reused. No NbClust, preprocessing or PCA execution occurred. Existing stored metrics were reused only after asserting partition equivalence.
- Labels and identifiers remain in the private artifact `apps/api/private/final-ui-evidence/enhanced-30-partitions.npz`. The aggregate runtime/source-hash report is `enhanced-30-report.json` in the same directory.
- D2 stores three symmetric **30 × 30** ARI matrices with diagonal 1 and **435** comparisons per method, partition membership ordered by frequency, modal count/percentage, distinct partitions, minimum/mean ARI and maximum aligned participant differences.
- Standard seed 0 versus Enhanced ARI and aligned difference count are stored in `apps/web/src/data/finalUiEvidence.json`. No participant-level rows appear in this report.
- D1 evidence enriches matching full-cohort Study Findings responses only after verifying source hashes, participant membership, prepared geometry and partition equivalence. It does not replace immutable stored jobs or alter page 03 repetitions.

## Data and UI

`/api/study-final-ui` provides optional, source-validated presentation evidence: D2 aggregates, headline values, both full PCA projections and projected means, the existing observed longitudinal bins with support counts and both stored LME specifications. Direct verification returned 2,437 points per partition, 38 cluster/bin records and both models.

The active Study Findings page uses a separate CSS/component set so shared page 03 presentation remains intact. It implements the run card, gated results view, persistent SOP panels, expand dialogs, heatmaps, real NbClust charts and ledger, partition strips, 13-variable range plots, sidecar calculation preview/search/sort dialog, final scorecard/distribution, observed longitudinal chart and model forest plot. Cluster blue/orange is scoped to cluster figures; method comparisons use slate/teal. No new dependency or Tailwind configuration was added.

The supporting PC-space disclosure was removed from Study Findings. Page 03 retains its existing presentation under the task's explicit exclusion. Repository component searches found no hardcoded export values `0.9934`, `0.3318`, the prohibited partition seed list, user-facing Improvement columns or task-description wording in the new presentation.

## Files changed by this pass

- `apps/web/src/components/final/`: `FinalUi.css`, `ui.tsx`, `RunsCard.tsx`, `Heatmap.tsx`, `RangeCards.tsx`, `CalculationDetails.tsx`, `SopPanels.tsx`, `StudyResults.tsx`, `FinalResults.tsx`, `FinalLongitudinal.tsx`.
- `apps/web/src/pages/StudyFindingsPage.tsx`, `apps/web/src/components/VerifiedStudyMetrics.tsx`, `apps/web/src/data/finalUiEvidence.json`, `apps/web/src/data/verifiedStudyPresentation.json`, `apps/web/tests/finalUiPass.test.mjs`.
- `apps/api/src/app.ts`, `apps/api/src/services/partitionEvidence.ts`, `apps/api/src/services/finalUiEvidence.ts`.
- `packages/shared/src/partitionEvidence.ts`, `packages/shared/src/finalUiEvidence.ts`, `packages/shared/src/index.ts`.
- `scripts/research/validation/repeat_enhanced_final_ui.py`, `derive_final_ui_evidence.py`, `derive_partition_evidence.py`, `test_final_ui_evidence.py`.
- Private D1 artifacts listed above; this report, the progress file and `docs/verification/final_ui_web_tests.json`.

## Checks

| Check | Result |
| --- | --- |
| Workspace typecheck | Passed |
| All `apps/web/tests/*.test.mjs` | 20/20 files passed |
| Shared contract tests | Passed |
| New Python D1/D2 tests | 3 passed |
| Affected existing Python partition-evidence tests | 5 passed |
| Workspace build | Passed |
| Final web typecheck/test/build after timing and arithmetic corrections | Passed |
| Both dist folders | `apps/web/dist/index.html` and `packages/shared/dist/finalUiEvidence.js` confirmed |
| Real completed study-job D1 enrichment | 30 runs, 30 matrix rows, 435 comparisons |
| Read-only evidence service | Full projections, observed bins and both models confirmed |

No existing test was weakened, deleted or updated. New tests cover the D1 assertion, D2 symmetry/diagonal, singular/plural, Comparison gating, tab retention, run strips, missing values, duration formatting, no supporting-component view in Study Findings and no hardcoded export values.

## Not available states

- Run timing fields show `Not available` before completion or when an older result lacks that optional timing field. Steps a method does not use show `-`.
- Range plots and the cross-method ARI/difference caption show `Not available` while compatible controlled-comparison evidence is absent.
- The 30-run Enhanced strip/matrix shows `Not available` for a different prepared dataset or partition without matching D1 evidence; historical three-run data is never expanded into fictional repetitions.
- Worked participant calculations show `Not available` if the local sidecar is missing, still loading, fails arithmetic validation, or is inaccessible under the existing local-only API boundary.
- The model forest shows `Not available` while its verified API source is pending or incompatible. Missing support in a longitudinal bin also remains `Not available`.
- No missing value was replaced by a design-export number. Completed full-cohort evidence used in direct verification contains both projections, all stored bins and both models.

## Start and review

From the repository root, run `npm run dev`. Open `http://127.0.0.1:5173/study-findings` after validating/preparing the datasets. The existing independent job controls run Standard and Enhanced; controlled comparison evidence is requested automatically once compatible results are complete. Select Comparison to review the range panels. No new clustering run is required to inspect the stored artifacts in the report.

Work is stopped for visual review.
