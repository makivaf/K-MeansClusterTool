// Run with node apps/web/src/pages/SimulationRunsPage.validation.cjs.
// Uses saved simulation outputs read-only; never launches analytical execution.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const ts = require("typescript");
const root = path.resolve(__dirname, "../../../..");
const moduleCaches = new WeakMap();
function compile(file, dependencies = {}, source = fs.readFileSync(file, "utf8")) {
  let cache = moduleCaches.get(dependencies);
  if (!cache) { cache = new Map(); moduleCaches.set(dependencies, cache); }
  if (cache.has(file)) return cache.get(file);
  const exports = {};
  cache.set(file, exports);
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true }
  }).outputText;
  new Function("require", "exports", output)(name => {
    if (dependencies[name]) return dependencies[name];
    if (name.endsWith('.css')) return {};
    if (name.startsWith('.')) {
      const base = path.resolve(path.dirname(file), name);
      const resolved = [base + '.tsx', base + '.ts', path.join(base, 'index.ts')].find(fs.existsSync);
      if (resolved) return compile(resolved, dependencies);
    }
    return require(name);
  }, exports);
  return exports;
}
const contract = compile(path.join(root, "packages/shared/src/simulation.ts"));
const cacheRoot = path.join(root, "apps/api/private/simulation-runs");
const saved = fs.readdirSync(cacheRoot).filter(name => /^runtime-v2-1-.*\.json$/.test(name)).map(name => contract.SimulationRunStateSchema.parse(
  JSON.parse(fs.readFileSync(path.join(cacheRoot, name), "utf8")).state)).filter(state => state.configurationKey === "custom:100:auto");
assert.equal(saved.length, 1, "Run API simulation execution validation with --execute first");
const key = saved[0].configurationKey;
const equalDeps = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
class Hooks {
  slots = []; index = 0; effects = []; dirty = false;
  react = { ...React,
    useState: initial => {
      const index = this.index++;
      if (!(index in this.slots)) this.slots[index] = initial;
      return [this.slots[index], value => {
        const next = typeof value === "function" ? value(this.slots[index]) : value;
        if (!Object.is(next, this.slots[index])) { this.slots[index] = next; this.dirty = true; }
      }];
    },
    useRef: initial => { const index = this.index++; return this.slots[index] ??= { current: initial }; },
    useEffect: (effect, deps) => {
      const index = this.index++, old = this.slots[index];
      if (!old || !equalDeps(old.deps, deps)) {
        this.slots[index] = { deps, cleanup: old?.cleanup };
        this.effects.push(() => { old?.cleanup?.(); this.slots[index].cleanup = effect(); });
      }
    }
  };
  render() { this.index = 0; this.dirty = false; this.output = this.component(); this.effects.splice(0).forEach(fn => fn()); }
  async settle() { for (let i = 0; i < 10; i++) { await new Promise(resolve => setImmediate(resolve)); if (this.dirty) this.render(); } }
  unmount() { this.slots.forEach(slot => slot?.cleanup?.()); }
}
function find(node, predicate) {
  if (!node || typeof node !== "object") return null;
  if (predicate(node)) return node;
  for (const child of React.Children.toArray(node.props?.children)) { const match = find(child, predicate); if (match) return match; }
  return null;
}
const hooks = new Hooks();
const page = compile(path.join(__dirname, "SimulationRunsPage.tsx"), {
  react: hooks.react,
  "react-router-dom": { Link: ({ to, ...props }) => React.createElement("a", { ...props, href: to }) },
  "../../../../packages/shared/src/simulation": contract,
  "../hooks/useSimulationMetadata": { useSimulationMetadata: () => ({ metadata: { simulations: saved.map(s => s.result.metadata) }, loading: false }) },
  "../hooks/useSimulationCapabilities": { useSimulationCapabilities: () => ({ capabilities: { executionAvailable: true } }) },
  "../config/api": { API_BASE_URL: "http://simulation.test" }
});
hooks.component = page.SimulationRunsPage;
const button = () => find(hooks.output, node => node.props?.className === "simulation-run-button");
const progress = () => find(hooks.output, node => node.type === page.SimulationProgress);
const result = () => find(hooks.output, node => node.type === page.SimulationResults)?.props.result;
const progressHtml = () => renderToStaticMarkup(React.createElement(page.SimulationProgress, progress().props));
// PASS 2: one coarse runtime update changes a methodology group together.
for (const [stage, reached, active] of [[-1,0,0],[0,0,1],[1,1,3],[2,4,3],[3,7,1],[4,9,0]]) {
  const html = renderToStaticMarkup(React.createElement(page.SimulationProgress,{stage,interrupted:stage === -1}));
  assert.equal((html.match(/class="simulation-step /g) ?? []).length,9);
  assert.equal((html.match(/is-reached/g) ?? []).length,reached);
  assert.equal((html.match(/is-active/g) ?? []).length,active);
  for (const subtitle of ['Sampling participants','Cleaning &amp; standardization','Feature scaling','Dimensionality reduction',
    'Cluster selection','Centroid initialization','Clustering both methods','Computing metrics','Results ready']) assert.ok(html.includes(subtitle));
  assert.ok(!html.includes('individual analytical stage progress'));
  assert.ok(!html.includes('simulation-step-connector'));
}
for (const stage of [0,1,2,3,4]) {
  const html = renderToStaticMarkup(React.createElement(page.SimulationProgress,{stage,interrupted:true}));
  assert.ok(!html.includes('is-active'));
  assert.ok(html.includes('Complete<span class="sr-only">: pending'));
}
const originalFetch = globalThis.fetch;
const originalDateNow = Date.now;
const originalSetTimeout = globalThis.setTimeout, originalClearTimeout = globalThis.clearTimeout;
let now = 0, timerId = 0;
const timers = new Map();
globalThis.setTimeout = (callback, delay) => { const id = ++timerId; timers.set(id, { callback, at: now + delay }); return id; };
globalThis.clearTimeout = id => timers.delete(id);
async function advance(ms) {
  now += ms;
  for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.callback(); }
  await hooks.settle();
}
const requests = [];
let resolvePost, serverState = saved[0], throttlePost = false, failGet = false;
globalThis.fetch = async (url, options) => {
  requests.push({ url, options });
  if (options?.method === "POST") {
    if (throttlePost) return Response.json({ error: "Too many simulation requests. Try again later." }, { status: 429, headers: { "Retry-After": "60" } });
    return new Promise(resolve => { resolvePost = state => resolve(Response.json(state, { status: state.status === "running" ? 202 : 200 })); });
  }
  if (failGet) return Response.json({ message: "Unavailable" }, { status: 503 });
  return Response.json(serverState);
};
// PASS 1: exercise the real hook, provenance gates, and shared disclosure.
async function validateStudyEvidence() {
  const transport = globalThis.fetch;
  const readArtifact = name => JSON.parse(fs.readFileSync(path.join(root, 'apps/api/artifacts', name), 'utf8'));
  const evaluation = readArtifact('sop_evaluation_summary.json');
  const defenseGeometry = readArtifact('defense_geometry.json');
  const studyEvidence = readArtifact('study_evidence.json');
  // Use the real backend derivation, including source hashes and metric checks.
  studyEvidence.calculations = JSON.parse(require('child_process').execFileSync(process.execPath,
    [path.join(root,'node_modules/tsx/dist/cli.mjs'),'-e',
      "import {loadSopEvaluation} from './apps/api/src/services/sopEvaluationArtifact'; import {loadDefenseGeometry} from './apps/api/src/services/defenseGeometryArtifact'; import {loadStudyEvidence} from './apps/api/src/services/studyEvidenceArtifact'; const e=loadSopEvaluation(); console.log(JSON.stringify(loadStudyEvidence(e,loadDefenseGeometry(e)).calculations));"],
    {cwd:root,encoding:'utf8'}));
  const { adjustedRandIndex } = compile(path.join(root, 'packages/shared/src/adjustedRandIndex.ts'));
  studyEvidence.dpcAriByRun = defenseGeometry.sop3.dpc.map(panel => ({ seed: panel.checkNumber,
    adjustedRandIndex: adjustedRandIndex(defenseGeometry.sop3.dpc[0].observations.map(row => row.cluster), panel.observations.map(row => row.cluster)) }));
  const payload = { evaluation, defenseGeometry, studyEvidence };
  const run = { provenance: { inputSha256: { ...evaluation.provenance.sourceSha256 } } };
  async function check(fetcher, expected, input = run) {
    const state = new Hooks();
    const { useSopEvaluation } = compile(path.join(root, 'apps/web/src/hooks/useSopEvaluation.ts'), {
      react: state.react, '../config/api': { API_BASE_URL: 'http://study.test' }
    });
    globalThis.fetch = fetcher;
    state.component = () => useSopEvaluation(input);
    state.render();
    assert.equal(state.output.dpcStatus, input ? 'loading' : 'unavailable');
    await state.settle();
    assert.equal(state.output.dpcStatus, expected);
    if (expected === 'provenance-rejected' || expected.endsWith('error')) {
      assert.equal(state.output.defenseGeometry, null);
      assert.equal(state.output.studyEvidence, null);
    }
    state.unmount();
    return state.output;
  }
  try {
    const ready = await check(async () => Response.json(payload), 'ready');
    assert.deepEqual(ready.studyEvidence.ariBySeed, studyEvidence.ariBySeed);
    assert.deepEqual(ready.studyEvidence.dpcAriByRun, studyEvidence.dpcAriByRun);
    assert.deepEqual(ready.defenseGeometry, defenseGeometry);
    await check(async () => { throw new TypeError('Network failure'); }, 'request-error');
    await check(async () => Response.json({}, {status:503}), 'request-error');
    await check(async () => new Response('{'), 'validation-error');
    await check(async () => Response.json({}), 'validation-error');
    const invalidCalculation = structuredClone(payload);
    invalidCalculation.studyEvidence.calculations.standard.exampleParticipant.s += .1;
    await check(async () => Response.json(invalidCalculation), 'validation-error');
    const mismatched = structuredClone(run);
    mismatched.provenance.inputSha256['data/interim/study_entry_cohort_unimputed.csv'] = '0'.repeat(64);
    await check(async () => Response.json(payload), 'provenance-rejected', mismatched);
    await check(async () => Response.json(payload), 'provenance-rejected', {provenance:{inputSha256:{}}});
    await check(async () => Response.json({evaluation}), 'unavailable');
    await check(async () => Response.json({evaluation, defenseGeometry}), 'unavailable');
    await check(async () => { throw Error('Disabled hook must not fetch'); }, 'unavailable', null);
    const { NbClustIndexDetails } = compile(path.join(root, 'apps/web/src/components/SopFigures.tsx'));
    const indices = [{index:'successful',status:'success',recommendedK:7},
      {index:'missing',status:'unavailable',recommendedK:null}, {index:'failed',status:'failed'}];
    const html = renderToStaticMarkup(React.createElement(NbClustIndexDetails,{indices}));
    assert.ok(html.includes('<details class="nbclust-index-details"><summary>NbClust index results</summary>'));
    indices.forEach(row => assert.ok(html.includes('<th>'+row.index+'</th><td>'+row.status+'</td>')));
    assert.ok(html.includes('<td>7</td>'));
    assert.equal(html.split('<td>Unavailable</td>').length - 1, 2);
    const history = path.join(root, 'data/processed/run-history');
    const persisted = fs.readdirSync(history).map(name => JSON.parse(fs.readFileSync(path.join(history,name),'utf8')))
      .find(run => run.pipeline === 'unified' && run.result_source === 'validated_research_output');
    assert.ok(persisted, 'A persisted study result is required for page rendering');
    const studyFile = path.join(root, 'apps/web/src/pages/StudyFindingsPage.tsx');
    const originalSource = require('child_process').execFileSync('git', ['show','HEAD:apps/web/src/pages/StudyFindingsPage.tsx'], {cwd:root,encoding:'utf8'});
    function renderStudy(tab, evidence = ready, original = false) {
      const dependencies = {
        react: {...React, useState: initial => [initial === 'sop1' ? tab : initial, () => {}]},
        '../hooks/useSopEvaluation': {useSopEvaluation: () => evidence},
        'react-router-dom': {Link: ({to,...props}) => React.createElement('a',{...props,href:to})}
      };
      const Study = compile(studyFile, dependencies, original ? originalSource : undefined).StudyFindingsPage;
      return renderToStaticMarkup(React.createElement(Study,{analysis:{status:'complete',run:persisted},dataset:null}));
    }
    const sop1 = renderStudy('sop1');
    assert.ok(!sop1.includes('calculationSilhouettes'));
    assert.ok(!fs.readFileSync(studyFile,'utf8').includes('calculationSilhouettes'));
    const final = renderStudy('final');
    for (const label of ['Internal Validation','Cluster Distribution','Final Cluster Profiles']) assert.ok(final.includes(label));
    assert.ok(final.includes('Overall metrics are means of '+persisted.baselineComparison.baselineMethod.runCount+' runs'));
    assert.ok(!sop1.includes('Participant-level calculation unavailable for this cached run.'));
    const calculation = ready.studyEvidence.calculations;
    assert.ok(sop1.includes(calculation.pca.exampleParticipant.a.toFixed(3)));
    assert.ok(sop1.includes('Seed '+calculation.pca.seed));
    assert.ok(sop1.includes('mean of '+evaluation.sop1.ablation.conditions[1].runCount+' runs'));
    const {formatMetric} = compile(path.join(root,'apps/web/src/components/MetricComparisonTable.tsx'));
    assert.ok(sop1.includes('<dt>Overall Silhouette</dt><dd>'+formatMetric(evaluation.sop1.ablation.conditions[1].metrics.silhouette.mean)+'</dd>'));
    assert.ok(final.includes('stored seed '+calculation.standard.seed));
    assert.ok(final.includes(calculation.standard.calinskiHarabasz.ssb.toLocaleString('en-US',{minimumFractionDigits:3,maximumFractionDigits:3})));
    assert.ok(!final.includes('Participant-level calculation unavailable for this cached run.'));
    const sharedCss = fs.readFileSync(path.join(root,'apps/web/src/components/SopFigures.css'),'utf8');
    assert.ok(sharedCss.includes('.nbclust-index-details table.simulation-comparison-table'));
    assert.ok(sharedCss.includes('table-layout: auto'));
    assert.ok(!sharedCss.includes('.simulation-results-section'));
    const sop2 = renderStudy('sop2');
    assert.ok(sop2.includes('NbClust index results'));
    persisted.kSelection.indexResults.forEach(row => assert.ok(sop2.includes('<th>'+row.index+'</th><td>'+row.status+'</td>')));
    const sop3 = renderStudy('sop3');
    for (const label of ['ARI by Random Seed','ARI by Repeated DPC Run','DPC Initialization Evidence']) assert.ok(sop3.includes(label));
    for (const removed of ['DPC check ','DPC Reproducibility in PCA Space','The full density-distance decision graph is not supplied','DPC Center-Selection Details']) assert.ok(!sop3.includes(removed));
    const messages = {loading:'Loading validated DPC', 'request-error':'study evidence request failed',
      'validation-error':'study evidence response failed validation', 'provenance-rejected':'required study provenance or geometry did not match',
      unavailable:'geometry or per-run ARI evidence is not supplied'};
    for (const [dpcStatus,message] of Object.entries(messages)) {
      const html = renderStudy('sop3',{...ready,studyEvidence:null,defenseGeometry:null,dpcStatus});
      assert.ok(html.includes(message));
      assert.ok(!html.includes('DPC Reproducibility in PCA Space'));
      assert.ok(html.includes('DPC Initialization Evidence'), 'Run center evidence remains available');
    }
    console.log('PASS Study SOP1/Final Results evidence, SOP2 indices, SOP3 ARI/centers without repeat projections and status messages.');
    console.log('PASS SOP evidence loading, request/validation errors, provenance rejection, absent evidence, verified ARI/geometry, and shared NbClust records.');
  } finally { globalThis.fetch = transport; }
}

(async () => {
  try {
    await validateStudyEvidence();
    hooks.render(); await hooks.settle();
    assert.equal(progress().props.stage, -1);
    assert.equal(result(), undefined);
    assert.equal(requests.length, 0);
    assert.match(renderToStaticMarkup(button()), /Run Simulation/);
    assert.equal(find(hooks.output, n => n.props?.id === 'simulation-sample-count').props.max, 2437);
    // Rapid duplicate events before React renders must be admitted once.
    const click = button().props.onClick; click(); click(); hooks.render(); await hooks.settle();
    assert.deepEqual(requests.map(r => r.options.method), ['GET']);
    assert.equal(progress().props.stage, 4, 'Cached completion follows actual status immediately');
    assert.deepEqual(result(), saved[0].result);
    assert.match(renderToStaticMarkup(button()), /Rerun/);
    const completedHtml = renderToStaticMarkup(React.createElement(page.SimulationResults, {result: saved[0].result}));
    for (const heading of ['Feature Representation', 'Cluster Number Selection', 'Initialization &amp; Reproducibility', 'Standard vs Enhanced Comparison']) assert.ok(completedHtml.includes(heading));
    for (const row of saved[0].result.comparison) {
      for (const value of [row.existing, row.enhanced]) assert.ok(completedHtml.includes(value.toLocaleString('en-US', {maximumFractionDigits: 6})));
    }
    assert.match(completedHtml, /PC1 and PC2 are used only for 2D visualization/);
    assert.doesNotMatch(completedHtml, /no supplied ARI series|Eigenvalues are not supplied|Controlled PCA-only metrics are unavailable/);
    assert.ok(completedHtml.includes('Participant-level calculation unavailable for this cached run.'));
    assert.match(completedHtml, /3 \/ 3/);
    assert.doesNotMatch(completedHtml, /Exploratory manual/);
    const adverse = structuredClone(saved[0].result);
    adverse.comparison.forEach((row, i) => { row.favorableMethod = 'existing'; row.existing = 901 + i; row.enhanced = 951 + i; });
    const adverseHtml = renderToStaticMarkup(React.createElement(page.SimulationResults, {result:adverse}));
    adverse.comparison.forEach(row => assert.ok(adverseHtml.includes(`<td class="simulation-favorable">${row.existing}</td><td>${row.enhanced}</td>`), 'Enhanced must not be highlighted when Standard wins'));
    serverState = {simulationId: 1, configurationKey: key, status: 'sample_ready', result: null, message: null};
    button().props.onClick(); hooks.render(); await hooks.settle();
    assert.deepEqual(requests.slice(-2).map(r => r.options.method), ['GET', 'POST']);
    assert.deepEqual(JSON.parse(requests.at(-1).options.body), {sampleMode:'custom', sampleCount:100, manualK:null});
    serverState = {...serverState, status:'running', stage:1};
    resolvePost(serverState); await hooks.settle();
    await advance(60_000);
    assert.equal(progress().props.stage, 1, 'Elapsed time must not advance the pipeline');
    assert.equal(button().props.disabled, true);
    assert.match(renderToStaticMarkup(button()), /Running\.\.\./);
    serverState = {...serverState, stage:2}; await advance(2000);
    assert.equal(progress().props.stage, 2);
    failGet = true; await advance(2000);
    assert.equal(button().props.disabled, true, 'Transport interruption cannot unlock an active backend job');
    assert.match(renderToStaticMarkup(button()), /Running\.\.\./);
    failGet = false; await advance(2000);
    serverState = {...serverState, stage:3}; await advance(2000);
    assert.equal(progress().props.stage, 3);
    assert.equal(button().props.disabled, true);
    assert.equal(result(), undefined);
    assert.equal(requests.filter(r => r.options.method === 'POST').length, 1);
    serverState = saved[0]; await advance(2000); await advance(400); await advance(400);
    assert.deepEqual(result(), saved[0].result);
    // The calculation/projection markup intentionally changes; preserve the
    // substantive result checks above and all lifecycle checks below.
    const input = () => find(hooks.output, n => n.props?.id === 'simulation-sample-number');
    const before = requests.length;
    for (const id of ['simulation-sample-count','simulation-sample-number']) {
      const control = () => find(hooks.output, n => n.props?.id === id);
      assert.equal(control().props.max,2437);
      control().props.onChange({target:{value:'2437'}}); hooks.render(); await hooks.settle();
      assert.equal(input().props.value,2437);
      control().props.onChange({target:{value:'2438'}}); hooks.render(); await hooks.settle();
      assert.equal(input().props.value,2437, 'Cannot select beyond available participants');
    }
    assert.equal(requests.length,before, 'Changing sample size must not start execution');
    input().props.onChange({target:{value:'500'}}); hooks.render(); await hooks.settle();
    assert.equal(result(), undefined); assert.equal(requests.length,before);
    assert.match(renderToStaticMarkup(button()), /Run Simulation/);
    button().props.onClick(); hooks.render(); await hooks.settle();
    assert.equal(result(),undefined); // Server response is for the old configuration.
    assert.ok(find(hooks.output,n=>n.props?.role==='alert'));
    input().props.onChange({target:{value:'100'}}); hooks.render(); await hooks.settle();
    serverState = {simulationId:1,configurationKey:key,status:'sample_ready',result:null,message:null};
    throttlePost = true;
    button().props.onClick(); hooks.render(); await hooks.settle();
    const alert = () => find(hooks.output,n=>n.props?.role==='alert');
    assert.match(renderToStaticMarkup(alert()), /HTTP 429/);
    let count = requests.length;
    button().props.onClick(); hooks.render(); await hooks.settle();
    assert.deepEqual(requests.slice(count).map(r=>r.options.method), ['GET']);
    failGet = true; count=requests.length;
    button().props.onClick(); hooks.render(); await hooks.settle();
    assert.deepEqual(requests.slice(count).map(r=>r.options.method), ['GET']);
    assert.match(renderToStaticMarkup(alert()), /HTTP 503/);
    failGet = false; throttlePost = false;
    Date.now = () => originalDateNow() + 120_000;
    serverState = {simulationId:1,configurationKey:key,status:'sample_ready',result:null,message:null};
    button().props.onClick(); hooks.render(); await hooks.settle();
    resolvePost({...serverState,status:'running',stage:2}); await hooks.settle();
    assert.equal(button().props.disabled,true);
    serverState = {...serverState,status:'failed',message:'Test analytical failure'};
    await advance(2000);
    assert.equal(button().props.disabled,false,'An actual job failure must release the button');
    assert.doesNotMatch(renderToStaticMarkup(button()), /Running\.\.\./);
    assert.ok(fs.readFileSync(path.join(root,'apps/web/src/App.tsx'),'utf8').includes('SimulationRuns key={datasetRevision}'));
    console.log('PASS duplicate-click guard, GET-first recovery, real result rendering, aggregate result preservation, progress, polling, stale response rejection, configuration and dataset invalidation, throttling and network recovery.');
  } finally { Date.now=originalDateNow; hooks.unmount(); globalThis.fetch=originalFetch; globalThis.setTimeout=originalSetTimeout; globalThis.clearTimeout=originalClearTimeout; }
})().catch(error=>{console.error(error); process.exitCode=1;});
