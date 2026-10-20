import assert from 'node:assert/strict';
import fs from 'node:fs';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const bundle = await build({ absWorkingDir: root, stdin: { contents: `
  export { CommonSpaceValidation } from './apps/web/src/components/CommonSpaceValidation';
  export { ControlledSopEvidence } from './apps/web/src/components/ControlledSopEvidence';
  export { SilhouetteChart } from './apps/web/src/components/SopFigures';
  export { FreshStudyResults } from './apps/web/src/components/FreshStudyResults';
  export { methodFixture } from './apps/api/src/services/methodExecution.fixture';
  export { MethodExecutionControls } from './apps/web/src/components/MethodExecutionControls';
  export { visibleMethodResult, methodPlaceholder } from './apps/web/src/utils/methodPresentation';
  export { HistoricalLongitudinal } from './apps/web/src/pages/StudyFindingsPage';
  export { pcaPercentTick, silhouetteTick } from './apps/web/src/components/SopFigures';
`, resolveDir: root }, bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external', jsx: 'automatic', loader: { '.css': 'empty' }, define: { 'import.meta.env.VITE_API_URL': 'undefined' } });
const module = { exports: {} };
vm.runInThisContext(`(function(require,module,exports){${bundle.outputFiles[0].text}\n})`)(createRequire(import.meta.url), module, module.exports);
const { CommonSpaceValidation, ControlledSopEvidence, SilhouetteChart, FreshStudyResults, methodFixture, MethodExecutionControls, visibleMethodResult, methodPlaceholder, HistoricalLongitudinal, pcaPercentTick, silhouetteTick } = module.exports;
const render = (Component, props) => renderToStaticMarkup(React.createElement(Component, props));
const s = methodFixture('standard'), e = methodFixture('enhanced');
const keys = ['silhouette', 'davies_bouldin', 'calinski_harabasz'];
const condition = (value, count) => ({ runCount: count, mean: Object.fromEntries(keys.map(key => [key, value])),
  minimum: Object.fromEntries(keys.map(key => [key, value])), maximum: Object.fromEntries(keys.map(key => [key, value])),
  runs: Array.from({ length: count }, () => Object.fromEntries(keys.map(key => [key, value]))), calculation: s.calculation });
const c = { ...s, method: 'comparison', commonSpace: { spaces: [
  { space: 'standardized_13', primary: true, dimensions: 13, conditions: { standard: condition(.123456, 30), pcaRandom: condition(.234567, 30), enhanced: condition(.345678, 3) } },
  { space: 'retained_pcs', primary: false, dimensions: 6, conditions: { standard: condition(.456789, 30), pcaRandom: condition(.567891, 30), enhanced: condition(.678912, 3) } }
] } };
for (const experiment of ['final', 'sop1', 'sop3']) {
  const html = render(CommonSpaceValidation, { comparison: c, standardK: 2, enhancedK: 2, experiment });
  assert.match(html, /13D evaluation/); assert.match(html, /<summary>Evaluated in the 6-PC space<\/summary>/);
  assert.doesNotMatch(html, /<details[^>]* open|Improvement|%|↑|↓|internal-validation-enhanced/);
  const before = experiment === 'sop3' ? '.23457' : '.12346';
  const after = experiment === 'sop1' ? '.23457' : '.34568';
  assert.ok(html.includes(before) && html.includes(after));
}
assert.equal(render(ControlledSopEvidence, { standard: s, enhanced: e, comparison: c, sop: 'sop2' }), '');
const job = JSON.parse(fs.readFileSync(new URL('../../api/private/method-runs/1667c343-313f-4555-80be-655824db686a/job.json', import.meta.url), 'utf8'));
assert.equal(job.status, 'complete');
assert.deepEqual(job.result.standard.silhouetteByK.map(row => row.k), Array.from({ length: 9 }, (_, i) => i + 2));
const html = render(FreshStudyResults, { standard: job.result, initialTab: 'sop2' });
assert.match(html, /Silhouette by candidate k/); assert.doesNotMatch(html, /Candidate-k Silhouette scores are unavailable/);
const chart = SilhouetteChart({ candidates: job.result.standard.silhouetteByK });
assert.equal(chart.props.children.props.height, 280, 'Chart has a height even before SimulationRunsPage CSS loads');
assert.equal(chart.props.children.props.children.props.data, job.result.standard.silhouetteByK, 'Standard series reaches the chart without comparison evidence');
for (const candidates of [undefined, []]) assert.match(render(SilhouetteChart, { candidates }), /Not available/);
assert.deepEqual([0, .2, .4, .6, .8, 1].map(pcaPercentTick), ['0%', '20%', '40%', '60%', '80%', '100%']);
assert.equal(silhouetteTick(.331875010), '0.332');
const active = { jobs: { standard: { ...job, status: 'running' } }, completed: { standard: job }, submitting: null,
  errors: {}, locked: true, compatible: false, run() {}, cancel() {}, refresh() {} };
assert.equal(visibleMethodResult(active, 'standard'), undefined);
assert.equal(methodPlaceholder(active, 'standard'), 'Running');
assert.match(render(MethodExecutionControls, { state: active, ready: true }), /Waiting for Standard to finish/);
const rerun = render(FreshStudyResults, { standard: s, enhanced: e, standardState: 'Running', initialTab: 'sop2' });
assert.match(rerun, /Running/); assert.doesNotMatch(rerun, /Silhouette by candidate k/);
for (const initialTab of ['sop1', 'sop2', 'sop3', 'final']) {
  const onlyMethodRerun = render(FreshStudyResults, { standard: s, standardState: 'Running', initialTab });
  assert.match(onlyMethodRerun, /Running/, 'A sole-method rerun preserves its result placeholder');
  assert.match(onlyMethodRerun, /Not run yet/, 'The other method keeps its neutral placeholder');
  assert.match(onlyMethodRerun, /simulation-two-column|study-method-grid/, 'SOP layouts retain both columns');
  assert.doesNotMatch(onlyMethodRerun, /Silhouette by candidate k|Cluster Distribution|Annual ADAS-Cog13 Change/);
}
assert.doesNotMatch(render(FreshStudyResults, { standard: s, initialTab: 'final' }), /Cluster Distribution|Internal Validation|Longitudinal/);
assert.match(render(FreshStudyResults, { standard: s, initialTab: 'final' }), /Completed/);
const referencePath = '../../api/private/longitudinal-refresh/4b3dca3d-b435-4485-ac2b-18a0e442a624/data/interim/unified_longitudinal_mixed_model.json';
const reference = JSON.parse(fs.readFileSync(new URL(referencePath, import.meta.url), 'utf8'));
const longitudinal = render(HistoricalLongitudinal, { run: { title: 'Verified reference', run_id: 'reference', created_at: '2026-10-12T00:00:00Z',
  longitudinal: { mixedEffects: reference, timeSeries: [] } } });
assert.match(longitudinal, /Random intercept only, maximum likelihood/);
assert.match(longitudinal, /1,845 eligible participants, 11,111 observations/);
assert.match(longitudinal, /stored frozen assignments/);
assert.match(longitudinal, /<summary>Sensitivity analysis \(random slope\)<\/summary>/);
assert.doesNotMatch(longitudinal, /<details[^>]* open/);
const verification = JSON.parse(fs.readFileSync(new URL('../../../docs/verification/longitudinal.json', import.meta.url), 'utf8'));
const effect = verification.randomSlope.fixedEffects['time_years:original_cluster[T.1]'];
for (const value of [effect.estimate, ...effect.ci95]) assert.ok(longitudinal.includes(value.toFixed(3)));
console.log('PASS same-space experiments, neutral differences, collapsed supporting space, no SOP 2 metric table, and complete Standard chart without comparison evidence');
console.log('PASS rerun placeholders, waiting labels, both-method final gates, percentage-axis formatting and report-backed reference/sensitivity presentation');

// Exercise the actual hook after an uncertain rerun POST; do not start a second heavy job.
const hookSource = fs.readFileSync(new URL('../src/hooks/useMethodJobs.ts', import.meta.url), 'utf8');
const slots = [], effects = [], requests = [];
let cursor = 0, failStart = false, rejectStart = false;
const hookReact = {
  useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
  useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
  useEffect(fn, deps) { const i = cursor++; if (!slots[i] || deps.some((v, j) => v !== slots[i].deps[j])) { slots[i]?.cleanup?.(); slots[i] = { deps }; effects.push(() => { slots[i].cleanup = fn(); }); } }
};
const hookModule = { exports: {} }, input = { scope: 'simulation', simulationId: 1, configuration: { sampleMode: 'custom', sampleCount: 100, manualK: null } };
const boundary = { react: hookReact, '../../../../packages/shared/src/methodExecution': { MethodJobSchema: { parse: value => value }, compatibleMethods: (a, b) => !!a && !!b },
  '../config/api': { API_BASE_URL: 'http://test' }, '../utils/validatedDataset': { isDatasetReady: () => true } };
vm.runInNewContext(ts.transpileModule(hookSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
  exports: hookModule.exports, require: name => boundary[name], crypto: globalThis.crypto, AbortController, setTimeout, clearTimeout,
  sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  fetch: async (_url, options) => { const request = JSON.parse(options.body); requests.push(request); if (failStart) throw Error('Lost start response');
    if (rejectStart) return { ok: false, status: 400 };
    return { ok: true, json: async () => ({ id: request.requestId, method: request.method, input, status: 'complete', result: s, finishedAt: '2026-10-12T00:00:00Z' }) }; }
});
const renderHook = () => { cursor = 0; const state = hookModule.exports.useMethodJobs(input); effects.splice(0).forEach(fn => fn()); return state; };
let state = renderHook(); await state.run('standard'); state = renderHook();
const priorSuccess = state.completed.standard;
failStart = true; await state.run('standard'); state = renderHook();
assert.equal(state.completed.standard, priorSuccess, 'Prior success is retained for recovery');
assert.equal(state.uncertain, 'standard'); assert.equal(state.locked, true);
assert.equal(visibleMethodResult(state, 'standard'), undefined, 'An unconfirmed rerun cannot display its prior success');
const attempted = requests.length; await state.run('enhanced'); assert.equal(requests.length, attempted, 'Uncertain Standard cannot queue Enhanced');
const retryId = requests.at(-1).requestId;
failStart = false; await state.run('standard'); state = renderHook();
assert.equal(requests.at(-1).requestId, retryId, 'Retry confirms the same request identity');
assert.equal(state.uncertain, null); assert.equal(state.locked, false);
rejectStart = true; await state.run('standard'); state = renderHook();
assert.equal(state.uncertain, null); assert.equal(state.locked, false, 'A confirmed rejected request cannot strand the run gate');
slots.forEach(slot => slot?.cleanup?.());
console.log('PASS lost-response rerun keeps waiting/placeholder state, blocks other methods, preserves recovery data and retries idempotently');
