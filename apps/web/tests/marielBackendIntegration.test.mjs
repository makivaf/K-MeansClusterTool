import assert from 'node:assert/strict';
import fs from 'node:fs';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server.js';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const bundle = await build({ absWorkingDir: root, stdin: { contents: `
  export { FreshStudyResults } from './apps/web/src/components/FreshStudyResults';
  export { MethodExecutionControls, methodStage } from './apps/web/src/components/MethodExecutionControls';
  export { SimulationResults } from './apps/web/src/pages/SimulationRunsPage';
  export { StudyExecutionPage } from './apps/web/src/pages/StudyFindingsPage';
  export { methodFixture } from './apps/api/src/services/methodExecution.fixture';
  export { MethodResultSchema } from './packages/shared/src/methodExecution';
  export { derivePartitionEvidence } from './packages/shared/src/partitionEvidence';
`, resolveDir: root }, bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external', jsx: 'automatic',
  loader: { '.css': 'empty' }, define: { 'import.meta.env.VITE_API_URL': 'undefined' } });
const module = { exports: {} };
vm.runInThisContext(`(function(require,module,exports){${bundle.outputFiles[0].text}\n})`)(createRequire(import.meta.url), module, module.exports);
const { FreshStudyResults, MethodExecutionControls, methodStage, SimulationResults, StudyExecutionPage, methodFixture, MethodResultSchema, derivePartitionEvidence } = module.exports;
const render = (Component, props) => renderToStaticMarkup(React.createElement(StaticRouter, { location: '/study-findings' }, React.createElement(Component, props)));
const standard = methodFixture('standard'), enhanced = methodFixture('enhanced');
const metrics = standard.standard.metrics, calculation = standard.calculation;
const rows = Object.entries(metrics).map(([metric, value]) => ({ metric, existing: value, enhanced: value, difference: 0,
  relativeImprovementPercent: 0, favorableMethod: 'equal', direction: metric === 'davies_bouldin' ? 'lower_is_better' : 'higher_is_better' }));
const condition = count => ({ runCount: count, mean: metrics, minimum: metrics, maximum: metrics, runs: Array.from({ length: count }, () => metrics), calculation });
const pair = count => ({ runCount: count, pairCount: count * (count - 1) / 2, mean: 1, minimum: 1, maximum: 1, median: 1, exactMatches: count * (count - 1) / 2 });
const ari = Array.from({ length: 30 }, (_, seed) => ({ seed, adjustedRandIndex: 1 }));
const changes = { silhouette: 0, davies_bouldin: 0, calinski_harabasz: 0 };
const comparison = MethodResultSchema.parse({ ...standard, method: 'comparison', standard: undefined,
  commonSpace: { version: 'common-space-v1', spaces: ['standardized_13', 'retained_pcs'].map((space, i) => ({ space, dimensions: i ? 12 : 13, primary: !i,
    conditions: { standard: condition(30), pcaRandom: condition(30), enhanced: condition(3) }, comparison: rows })),
    pairwise: { standard: pair(30), pcaRandom: pair(30), enhanced: pair(3) }, crossMethod: ari.map(row => ({ seed: row.seed, ari: 1, disagreementCount: 0, disagreementPercent: 0 })), randomVersusDpc: ari, dpcAssignmentsIdentical: true },
  comparison: rows, pcaContribution: { k: 2, runCount: 30, existing: metrics, enhanced: metrics, relativeChange: changes },
  randomControl: { totalRandomRuns: 30, matchingRuns: 30, randomMean: metrics, randomSd: changes },
  sopControls: { pcaSilhouetteByK: standard.standard.silhouetteByK, pcaRandom: { k: 2, runCount: 30, metrics, calculation }, nbclustRandom: { k: 2, runCount: 30, metrics, calculation }, relativeChange: { sop1: changes, sop2: changes, sop3: changes }, randomAriBySeed: ari },
  comparisonSources: { standard: { resultHash: 'a'.repeat(64), assignmentsHash: standard.assignmentsHash }, enhanced: { resultHash: 'b'.repeat(64), assignmentsHash: enhanced.assignmentsHash } }
});
for (const method of ['standard', 'enhanced']) {
  const props = { [method]: method === 'standard' ? standard : enhanced };
  const other = method === 'standard' ? 'Enhanced K-Means' : 'Standard K-Means';
  for (const initialTab of ['sop1', 'sop2', 'sop3', 'final']) {
    const html = render(FreshStudyResults, { ...props, initialTab });
    assert.match(html, /study-sop-tabs|study-tab-content/);
    assert.match(html, new RegExp(other)); assert.match(html, /Not run yet/);
    assert.doesNotMatch(html, /ADAS-Cog13|Longitudinal|Final Cluster Profiles|Lower impairment|Higher impairment/);
    if (initialTab === 'sop3') {
      assert.match(html, /verified modal-partition ARI is not supplied/);
      assert.match(html, /verified final-partition frequencies are not supplied/);
      assert.match(html, /Additional Reference-Partition Agreement Evidence/);
      assert.match(html, method === 'standard' ? /Standard reference: original-feature seed 0, including its self-match/ : /Enhanced reference: DPC run 1/);
      assert.doesNotMatch(html, /Historical PCA-random/);
    }
    if (initialTab === 'sop2' && method === 'enhanced') {
      assert.match(html, /View NbClust Index Details/);
      assert.match(html, /simulation-two-column/);
    }
    if (initialTab === 'final') {
      assert.match(html, /Complete both methods to view Final Results/); assert.doesNotMatch(html, /Cluster Distribution/);
      assert.doesNotMatch(html, /aria-label="Validation calculation method"/);
    }
  }
}
for (const initialTab of ['sop1', 'sop2', 'sop3', 'final']) {
  const html = render(FreshStudyResults, { standard, enhanced, comparison, initialTab });
  assert.match(html, /Method Comparison Overview/);
  assert.doesNotMatch(html, /Controlled sequential SOP evidence/);
  if (initialTab === 'sop1') assert.match(html, /PCA Contribution/);
  if (initialTab === 'sop3') assert.match(html, /PCA \+ random versus DPC/);
  if (initialTab === 'sop3') {
    assert.match(html, /reference-equivalent match counts are not modal-partition frequencies/);
    assert.match(html, /Standard reference: original-feature seed 0, including its self-match/);
  }
  if (initialTab === 'final') {
    assert.match(html, /13D evaluation/);
    assert.match(html, /Evaluated in the 12-PC space/);
    assert.match(html, />Difference<\/th>/); assert.match(html, /Enhanced minus Standard<\/caption>/);
    assert.match(html, /Standard: mean of 30 random-initialization runs. Enhanced: deterministic/);
    assert.match(html, /Absolute differences are descriptive/);
    assert.match(html, /after label alignment/);
    assert.doesNotMatch(html, />Improvement</);
  }
}
const invalid = structuredClone(enhanced); invalid.provenance.sourceHash = '0'.repeat(64);
assert.doesNotMatch(render(FreshStudyResults, { standard, enhanced: invalid, comparison }), /Method Comparison Overview/);
const absent = { ...standard, standard: { ...standard.standard, silhouetteByK: undefined } };
assert.match(render(FreshStudyResults, { standard: absent, initialTab: 'sop2' }), /Candidate-k Silhouette scores are unavailable/);
const empty = { jobs: {}, completed: {}, errors: {}, compatible: false, locked: false, submitting: null, run() {}, cancel() {}, refresh() {} };
assert.match(render(MethodExecutionControls, { state: empty, ready: true }), /Run Standard K-Means/);
assert.match(render(MethodExecutionControls, { state: empty, ready: true }), /Run Enhanced K-Means/);
assert.equal((render(MethodExecutionControls, { state: empty, ready: false }).match(/disabled=""/g) ?? []).length, 2);
assert.equal(methodStage('standard', 'seed_evaluation'), 3); assert.equal(methodStage('enhanced', 'nbclust'), 3);
const study = render(StudyExecutionPage, { jobs: empty, dataset: null });
assert.doesNotMatch(study, /Historical Final Results|Stored Study Findings/);
assert.doesNotMatch(study, /<summary>Stored Study Findings/); // Detailed records mount only after verified loading.

// Distinct presentation values ensure native and common spaces cannot be confused.
const varied = structuredClone(comparison);
varied.commonSpace.spaces[0].conditions.standard.mean.silhouette = 0.123456;
varied.commonSpace.spaces[0].conditions.enhanced.mean.silhouette = 0.234567;
varied.commonSpace.spaces[0].comparison[0].difference = 0.111111;
const final = render(FreshStudyResults, { standard, enhanced, comparison: varied, initialTab: 'final' });
assert.match(final, /0.12346/); assert.match(final, /0.23457/); assert.match(final, /0.11111/);
assert.doesNotMatch(final, /Supplementary native-space metrics|Improvement/);
const simulation = render(SimulationResults, { result: { metadata: {}, comparison: rows,
  analysis: { existing: standard.standard, enhanced: enhanced.enhanced, calculations: { standard: standard.calculation, enhanced: enhanced.calculation } } }, comparisonEvidence: varied });
assert.match(simulation, /13D evaluation/); assert.match(simulation, /0.12346/); assert.ok(simulation.includes(standard.calculation.metrics.silhouette.toFixed(6)), "Details show the stored seed result, not the six-decimal run mean");
assert.doesNotMatch(simulation, />Improvement</);
const app = fs.readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
assert.match(app, /module.StudyExecutionPage/); assert.doesNotMatch(app, /IndependentStudyPage/);
console.log('PASS Mariel panels/tabs, independent result bindings, Enhanced-only evidence, exact references, unavailable modal evidence, common/native separation, neutral differences, preparation gates and historical separation');

const verifiedFixture = { ...comparison, initializationEvidence: {
  standard: derivePartitionEvidence(Array.from({ length: 30 }, () => standard.labels)),
  pcaRandom: derivePartitionEvidence(Array.from({ length: 30 }, () => enhanced.labels)),
  enhanced: derivePartitionEvidence(Array.from({ length: 3 }, () => enhanced.labels), 1)
} };
const sop3 = render(FreshStudyResults, { standard, enhanced, comparison: verifiedFixture, initialTab: 'sop3' });
assert.doesNotMatch(sop3, /Controlled initialization comparison: PCA-random/);
assert.match(sop3, /PCA \+ random versus DPC/);
assert.match(sop3, /30 \/ 30/); assert.match(sop3, /3 \/ 3/);
assert.match(sop3, /<th scope="col">Standard K-Means<\/th><th scope="col">Enhanced K-Means/);
assert.match(sop3, /Agreement with Standard Seed 0/);
assert.match(sop3, /Standard reference: original-feature seed 0, including its self-match/);
assert.doesNotMatch(sop3, /sop3-chart is-unavailable|verified modal-partition ARI is not supplied|verified final-partition frequencies are not supplied/);
const historical = React.createElement('section', { 'aria-label': 'Historical evidence fixture' }, 'Validated historical model fixture');
for (const initialTab of ['sop1', 'sop2', 'sop3', 'final']) {
  const html = render(FreshStudyResults, { standard, enhanced, comparison: verifiedFixture, initialTab, historical });
  assert.equal((html.match(/Validated historical model fixture/g) ?? []).length, initialTab === 'final' ? 1 : 0);
}
const evidenceSimulation = render(SimulationResults, { result: { metadata: {}, comparison: rows,
  analysis: { existing: standard.standard, enhanced: enhanced.enhanced, calculations: { standard: standard.calculation, enhanced: enhanced.calculation } } }, comparisonEvidence: verifiedFixture });
assert.match(evidenceSimulation, /Controlled initialization comparison: PCA-random/);
assert.doesNotMatch(evidenceSimulation, /sop3-chart is-unavailable/);
assert.match(fs.readFileSync(new URL('../src/pages/StudyFindingsPage.tsx', import.meta.url), 'utf8'), /FrozenUnifiedStudyResultSchema.safeParse\(value\).success/);
console.log('PASS verified aggregate SOP 3 binding in Study Findings and Comparison, controlled references, separate 13D baseline, compact unavailable state, and historical evidence only in Final Results');
