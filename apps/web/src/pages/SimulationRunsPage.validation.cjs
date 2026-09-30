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
function compile(file, dependencies = {}) {
  let cache = moduleCaches.get(dependencies);
  if (!cache) { cache = new Map(); moduleCaches.set(dependencies, cache); }
  if (cache.has(file)) return cache.get(file);
  const exports = {};
  cache.set(file, exports);
  const output = ts.transpileModule(fs.readFileSync(file, "utf8"), {
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
(async () => {
  try {
    hooks.render(); await hooks.settle();
    assert.equal(progress().props.stage, -1);
    assert.equal(result(), undefined);
    assert.equal(requests.length, 0);
    assert.match(renderToStaticMarkup(button()), /Run Simulation/);
    assert.equal(find(hooks.output, n => n.props?.id === 'simulation-sample-count').props.max, 2436);
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
    // Compare frozen rendered result markup against the branch's original UI.
    const originalSource = require('child_process').execFileSync('git', ['show', 'HEAD:apps/web/src/pages/SimulationRunsPage.tsx'], {cwd:root, encoding:'utf8'});
    const originalFile = path.join(__dirname, '.simulation-ui-before.validation.tsx');
    fs.writeFileSync(originalFile, originalSource);
    try {
      const original = compile(originalFile, {
        '../hooks/useSimulationMetadata': {useSimulationMetadata:()=>({})},
        '../hooks/useSimulationCapabilities': {useSimulationCapabilities:()=>({})},
        '../config/api': {API_BASE_URL:'http://simulation.test'},
        '../../../../packages/shared/src/simulation':contract
      });
      // Compare identical legacy data through both presentations; newly supplied
      // evidence intentionally replaces unavailable values inside frozen components.
      const legacy = structuredClone(saved[0].result);
      delete legacy.analysis.existing.ariBySeed;
      delete legacy.analysis.enhanced.dpc.ariByRun;
      delete legacy.analysis.pcaContribution;
      legacy.analysis.enhanced.pcaVariance.forEach(row => { delete row.eigenvalue; });
      const withoutHighlight = html => html.replace(/ class="simulation-favorable"/g, '');
      assert.equal(withoutHighlight(renderToStaticMarkup(React.createElement(original.SimulationResults, {result:legacy}))),
        withoutHighlight(renderToStaticMarkup(React.createElement(page.SimulationResults, {result:legacy}))));
    } finally { fs.unlinkSync(originalFile); }
    const input = () => find(hooks.output, n => n.props?.id === 'simulation-sample-number');
    const before = requests.length;
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
    console.log('PASS duplicate-click guard, GET-first recovery, real result rendering, exact before/after result markup, progress, polling, stale response rejection, configuration and dataset invalidation, throttling and network recovery.');
  } finally { Date.now=originalDateNow; hooks.unmount(); globalThis.fetch=originalFetch; globalThis.setTimeout=originalSetTimeout; globalThis.clearTimeout=originalClearTimeout; }
})().catch(error=>{console.error(error); process.exitCode=1;});
