# Continuation audit ? October 12, 2026

No git mutations, computations, scientific values, or existing test assertions were changed. Failure triage uses current source and previous errors, not a clean baseline.

## 1. T1 proof

Repository grep excludes node_modules, dist, and docs; ordinary repository ignore rules apply. No matching rendered UI text. Each of 19 hits follows.

| File | Line | Hit | User-facing? |
|---|---:|---|---|
| apps/api/artifacts/sop_evaluation_summary.json | 329 | `"relativeMeanChangePercent": 12.322537098887507` | No; stored backend artifact, retained unchanged. |
| packages/shared/src/simulation.ts | 141 | `difference: finite, relativeImprovementPercent: finite.nullable().optional(), favorableMethod: z.enum(["existing", "enhanced", "equal"]) }).strict()).length(3),` | No; shared contract or frozen-schema constant, not rendered. |
| packages/shared/src/simulation.ts | 148 | `value.comparison.every(row => row.relativeImprovementPercent !== undefined))));` | No; shared contract or frozen-schema constant, not rendered. |
| packages/shared/src/schema.ts | 846 | `silhouette: [0.33187500971522454, 0.00023426851518023573, 0.33173611492709726, 0.33173611492709726, 0.33225697038257485, 0.3727004724250328, 12.30145733022796],` | No; shared contract or frozen-schema constant, not rendered. |
| packages/shared/src/methodExecution.ts | 53 | `if (row.existing!==a \|\| row.enhanced!==b \|\| row.difference!==b-a \|\| row.relativeImprovementPercent!==expected) fail("Cross-space or inconsistent comparison.");` | No; shared contract or frozen-schema constant, not rendered. |
| scripts/research/simulation/common_space.py | 65 | `relativeImprovementPercent=None if a[key] == 0 else 100*favorable/abs(a[key]),` | No; backend/research compatibility field, not rendered. |
| apps/web/tests/metricComparison.test.mjs | 25 | `assert.doesNotMatch(signed, /Improvement\|%\|↑\|↓\|internal-validation-enhanced/);` | No; test fixture/assertion (absence assertions are retained). |
| apps/web/tests/metricComparison.test.mjs | 31 | `assert.doesNotMatch(difference, /Improvement\|%\|↑\|↓/);` | No; test fixture/assertion (absence assertions are retained). |
| apps/web/tests/metricComparison.test.mjs | 40 | `assert.doesNotMatch(standardOnly, />Enhanced<\|>Improvement</);` | No; test fixture/assertion (absence assertions are retained). |
| apps/web/tests/marielBackendIntegration.test.mjs | 29 | `relativeImprovementPercent: 0, favorableMethod: 'equal', direction: metric === 'davies_bouldin' ? 'lower_is_better' : 'higher_is_better' }));` | No; test fixture/assertion (absence assertions are retained). |
| apps/web/tests/marielBackendIntegration.test.mjs | 85 | `assert.doesNotMatch(html, />Improvement</);` | No; test fixture/assertion (absence assertions are retained). |
| apps/web/tests/marielBackendIntegration.test.mjs | 108 | `assert.doesNotMatch(final, /Supplementary native-space metrics\|Improvement/);` | No; test fixture/assertion (absence assertions are retained). |
| apps/web/tests/marielBackendIntegration.test.mjs | 112 | `assert.doesNotMatch(simulation, />Improvement</);` | No; test fixture/assertion (absence assertions are retained). |
| apps/web/tests/finalPresentation.test.mjs | 38 | `assert.doesNotMatch(html, /<details[^>]* open\|Improvement\|%\|↑\|↓\|internal-validation-enhanced/);` | No; test fixture/assertion (absence assertions are retained). |
| apps/api/src/services/commonSpace.validation.ts | 14 | `relativeImprovementPercent:0,favorableMethod:'equal',direction:metric==='davies_bouldin'?'lower_is_better':'higher_is_better'}));` | No; test fixture/assertion (absence assertions are retained). |
| apps/api/src/services/finalSimulationQa.validation.ts | 53 | `assert.ok(compareSimulationMetrics(adverse).every(row => row.favorableMethod === "existing" && row.relativeImprovementPercent! < 0));` | No; test fixture/assertion (absence assertions are retained). |
| apps/api/src/services/simulationExecution.ts | 48 | `return { metric, direction, existing, enhanced, difference, relativeImprovementPercent: existing === 0 ? null : favorable / Math.abs(existing) * 100,` | No; backend/research compatibility field, not rendered. |
| apps/api/src/services/simulationExecution.validation.ts | 76 | `assert.deepEqual(compareSimulationMetrics(modified).map(row => row.relativeImprovementPercent), [200, 50, 50]);` | No; test fixture/assertion (absence assertions are retained). |
| apps/api/src/services/simulationExecution.validation.ts | 78 | `assert.equal(compareSimulationMetrics(modified)[0].relativeImprovementPercent, null);` | No; test fixture/assertion (absence assertions are retained). |

## 2. T2/T8/T9 source audit

The verification report exists. Bundled `src/data/verifiedStudyPresentation.json.spaces` exactly equals `docs/verification/common_space_metrics.json.spaces`; its participant/observation counts and random-intercept/random-slope blocks exactly equal `docs/verification/longitudinal.json`. These are artifact constants, not component literals.

| Display | Real source / behavior |
|---|---|
| SD | Fresh: `comparison.commonSpace.spaces[].conditions[standard or pcaRandom].runs` and `.mean`, sample SD with ddof=1; this existing display summarization is unchanged. Frozen: bundled `.spaces[13D or 6-PC].conditions[condition][metric].SD`. Missing SD has no numeric fallback. |
| LME reference/slopes/counts | `run.longitudinal.mixedEffects.primaryResult`, `.estimatedAnnualChangeByOriginalCluster`, `.participantCount`, `.observationCount`. No component literals for estimates/counts. |
| LME provenance | Defaults to stored frozen assignments. Current Enhanced equality is stated only when its `provenance.participantsHash` and SHA256 of the actual ordered `labels` equal the verified artifact?s `.verifiedEnhanced.participantsHash` / `.labelsHash`. The model is explicitly not refitted. |
| Random-slope sensitivity | Bundled `.longitudinal.randomSlope.fixedEffects[time_years:original_cluster[T.1]]` estimate, CI, p-value; discrepancy text from `.discrepancyNote`. Rendered only for matching reference counts/estimate, convergence, nonsingular covariance and finite CI. Otherwise omitted. |
| Pairwise ARI | Fresh: `comparison.commonSpace.pairwise.standard/enhanced.mean/minimum`; evidence requires compatible paired provenance. Other reproducibility tables read `initializationEvidence.standard/enhanced.meanPairwiseAri/minimumPairwiseAri`. Missing evidence is omitted or labeled unavailable. |
| Cross-method ARI | `comparison.commonSpace.crossMethod[0].ari`, only with paired compatible evidence and an actual row; otherwise omitted. |
| Differing participants | `comparison.commonSpace.crossMethod[0].disagreementCount`; source row is Standard seed 0 versus Enhanced with aligned labels. No numeric fallback. |
| 22/30 | No literal. `InitializationComparison` counts `standard.standard.ariBySeed` observations with `adjustedRandIndex === 1` and displays their actual length; label explicitly includes seed-0 self-match, with a separate excluding-self count. Frozen source: API `studyEvidence.standardAriBySeed`, derived from `baseline_kmeans_assignments.csv`. No series means no count. |

Literal grep (`22`, `0.9967`, `0.9918`, `1.4696`, `3.10`, `1845`, `11111`, `87.48`, `0.3318`): the retired `BaselineVsEnhancedPage` variance sentence was hardcoded and is now bound to `sop1.ablation.conditions[1].varianceRetained`. Artifact JSON matches are legitimate; `simulationRunsMock.ts` contains unused hardcoded fixture values (no imports anywhere); other 22 matches are CSS RGB channels, layout dimensions, icon/SVG geometry, column widths, or the existing dataset audit?s GDS record count. No queried metric/count literal remains in a component.

## 3. Read-only failure triage

Categories: (a) missing local artifact/environment; (b) tests a retired flow; (c) attributable to Oct 11/12 changes identified by current source/diff; (d) possible real regression. Dates refer to the inherited work; no baseline was reconstructed.

| Suite | Class | Evidence / first error |
|---|---|---|
| Shared contracts | c | Extensionless runtime imports introduced in `packages/shared/src/schema.ts` and `partitionEvidence.ts`; native Node ESM cannot resolve them. Fixed only by adding `.js` suffixes. |
| unifiedResultAdapter.validation.ts | a | Calls adapter with `data/interim`; `unified_research_result.json` is absent. First error: unified aggregate research artifact missing. |
| runRepository.validation.ts | a | Same missing local unified artifact in its adapter call. |
| executeAnalysis.validation.ts | a | Stub orchestrator returns `data/interim`; adapter rejects the same missing file. First error: unified aggregate artifacts could not be validated. |
| localAggregateArtifacts.validation.ts | a | Same absent `data/interim/unified_research_result.json`. |
| baselineCandidateSweep.validation.ts:31 | c | Exact source assertion is `assert.ok(findings.includes("<SilhouetteByKFigure sweep={baselineSweep}"))`. Inherited `apps/web/src/pages/StudyFindingsPage.tsx` removed that legacy sweep binding; completed fresh Standard uses its own `standard.silhouetteByK` through `FreshStudyResults`. Line 31 does not assert a computed number or validate the new chart. Earlier UI changes affect it; this continuation?s token/import changes do not cause it. |
| dpcProvenance.validation.ts | c | Exact failing assertion deep-compares a load using a temporary packaged-only directory with `{ ...evidence, dpcCenters: undefined, calculations: undefined }`, message ?Packaged evidence must not invent RIDs when the private center source is absent?. `apps/api/src/services/studyEvidenceArtifact.ts` now adds `initializationEvidence`, Standard ARI and its source hash only when required actual sources exist. The expected spread retains those full-source fields, whereas the temporary directory lacks the sources. The inherited service change affects equality; no RIDs were invented and the new web token/import changes cannot affect this loader. Test left intact. |
| pageState.validation.ts | b | Retired upload/Run Comparison harness invokes `UploadAndCluster` without the now-lifted `files`, `setFiles`, `validatedFiles` state props; first error: cannot read undefined ADAS.csv. Current ownership is in `apps/web/src/App.tsx` and `pages/UploadAndCluster.tsx`. |
| simulationDpcControl.validation.ts | a | Missing legacy cache `apps/api/private/simulation-runs/1.json`; first error ENOENT. Current saved jobs do not make that filename exist. |
| simulationTabs.validation.ts | b | Legacy `apps/web/src/pages/SimulationRunsPage.validation.cjs:86` asserts exactly nine step nodes and old combined-flow stages. `SimulationRunsPage.tsx` now uses independent Standard/Enhanced lanes (14 nodes), producing `14 !== 9`. |
| uploadFilename.validation.ts | b | Old extracted-handler harness declares setFiles/setInvalidFiles/setError but not lifted `setValidatedFiles`; current `UploadAndCluster.tsx` handler invokes it. First error: setValidatedFiles is not defined. |

No suite requires changing analytical values or weakening tests. No API files or tests were edited.

## 4. Shared ESM fix

Only relative runtime import suffixes changed in `schema.ts` and its required `partitionEvidence.ts` dependency. Existing `index.ts`, `dummyRuns.ts`, and contract validator already use `.js`; this follows that convention throughout the reachable runtime graph. No schemas or numerical logic changed.

## 5. Token application

Inter remains global with system fallback and tabular numerals (including source-field code text). Nine palette values: teal #0F766E, tealDark #0B625C, tealBg #EEF7F6, tealBorder #B7D9D5, orange #E58A00, text #1A1A1A, textSec #4F6672, bg #F4F6F8, border #E2E8EC. Existing semantic `--research-*` variables implement these. White remains the surface color; pre-existing additional cluster hues are centralized as category tokens to preserve distinction when k exceeds two.

11/14/16px chart labels now use caption/body/card tokens; the type scale is 12/13/15/20px, with page-title size preserved. Controls use 6px; cards use 10px; circular markers stay circular. Spacing uses multiples of 4px; fractional padding/margin/gap utilities were normalized. Card padding is 20px 24px. One-off colors now reference palette variables; neutral/accent Tailwind shades resolve to the same palette. Scientific coordinates, graph domains, assignments, counts, metric formatting, and layout structures are unchanged.

Changed token components/files:

- `apps/web/src/components/charts/chartPalette.ts`
- `apps/web/src/components/charts/DefenseScatter.tsx`
- `apps/web/src/components/charts/FinalFindingsCharts.tsx`
- `apps/web/src/components/charts/PartitionProjection.css`
- `apps/web/src/components/charts/PartitionProjection.tsx`
- `apps/web/src/components/InitializationComparison.tsx`
- `apps/web/src/components/InternalValidationCalculationDetails.css`
- `apps/web/src/components/MethodDecisionGraph.tsx`
- `apps/web/src/components/MetricComparisonTable.css`
- `apps/web/src/components/PcaLoadingMatrix.css`
- `apps/web/src/components/RunProgress.css`
- `apps/web/src/components/SilhouetteCalculationCard.css`
- `apps/web/src/components/SopComparison.css`
- `apps/web/src/components/SopFigures.css`
- `apps/web/src/components/SopFigures.tsx`
- `apps/web/src/components/ui/Panel.tsx`
- `apps/web/src/pages/DatasetSetup.css`
- `apps/web/src/pages/EnhancedKMeansPage.tsx`
- `apps/web/src/pages/SimulationRunsPage.css`
- `apps/web/src/pages/SimulationRunsPage.tsx`
- `apps/web/src/pages/StudyFindingsPage.css`
- `apps/web/src/styles.css`
- `apps/web/src/components/layout/AppShell.tsx`
- `apps/web/src/components/ui/StatCard.tsx`
- `apps/web/src/pages/BaselineVsEnhancedPage.tsx`
- `apps/web/src/pages/LongitudinalProgressionPage.tsx`
- `apps/web/tailwind.config.ts`

## 6. Final checks

Web typecheck: PASS. All 15 apps/web test files: PASS. Shared contracts: PASS. Workspace build: PASS. packages/shared/dist and apps/web/dist: present. Existing tests were not changed. API failure triage was read-only; API suites were not rerun in this continuation. All changes remain uncommitted.
