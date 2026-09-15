// Run with node apps/web/src/pages/SimulationRunsPage.validation.cjs.
// Uses saved simulation outputs read-only; never launches analytical execution.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const ts = require("typescript");
const root = path.resolve(__dirname, "../../../..");
function compile(file, dependencies = {}) {
  const output = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true }
  }).outputText;
  const exports = {};
  new Function("require", "exports", output)(name => dependencies[name] ?? (name.endsWith(".css") ? {} : require(name)), exports);
  return exports;
}
const contract = compile(path.join(root, "packages/shared/src/simulation.ts"));
const saved = [1, 2, 3, 4, 5].map(id => contract.SimulationRunStateSchema.parse(
  JSON.parse(fs.readFileSync(path.join(root, `apps/api/private/simulation-runs/${id}.json`), "utf8")).state));
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
    hooks.render();
    assert.equal(progress(), null);
    assert.equal(result(), undefined);
    assert.match(renderToStaticMarkup(button()), /Run Simulation/);
    assert.equal(find(hooks.output, node => node.props?.id === "simulation-analysis-status"), null);
    await hooks.settle();
    assert.equal(requests.length, 0, "Cached complete metadata must not start a run or fetch results");
    button().props.onClick(); hooks.render();
    assert.equal(button().props.disabled, true);
    assert.ok(progress());
    await hooks.settle();
    assert.deepEqual(requests.map(r => r.options.method), ["GET"], "Cached success must not POST");
    for (let stage = 0; stage < 4; stage++) {
      assert.equal(progress().props.stage, stage, "Cached success must still present every step in order");
      assert.equal(result(), undefined);
      assert.equal(button().props.disabled, true);
      assert.equal((progressHtml().match(/simulation-step is-active/g) || []).length, 1);
      await advance(400);
    }
    assert.deepEqual(result(), saved[0].result);
    assert.equal(button().props.disabled, false);
    assert.match(renderToStaticMarkup(button()), /Rerun Simulation/);
    assert.equal((progressHtml().match(/simulation-step is-reached/g) || []).length, 5);
    serverState = { simulationId: 1, status: "sample_ready", result: null, message: null };
    button().props.onClick(); hooks.render();
    assert.equal(result(), undefined, "Hide previous result during POST");
    assert.equal(button().props.disabled, true);
    assert.equal((progressHtml().match(/simulation-step is-reached/g) || []).length, 0);
    await hooks.settle();
    assert.deepEqual(requests.slice(-2).map(r => r.options.method), ["GET", "POST"]);
    serverState = { simulationId: 1, status: "running", result: null, message: null };
    resolvePost(serverState); await hooks.settle();
    assert.equal(result(), undefined, "Hide previous result during polling");
    assert.equal(button().props.disabled, true);
    await advance(400); await advance(400);
    assert.equal(progress().props.stage, 2);
    await advance(4000);
    assert.equal(progress().props.stage, 2, "Never advance to evaluation before API success");
    assert.equal((progressHtml().match(/simulation-step is-active/g) || []).length, 1);
    assert.match(progressHtml(), /individual analytical stage progress is unavailable/);
    serverState = saved[0];
    await advance(2000);
    assert.equal(result(), undefined);
    await advance(400);
    assert.equal(progress().props.stage, 3);
    assert.equal(result(), undefined, "Evaluation must finish before revealing results");
    await advance(400);
    assert.equal(button().props.disabled, false);
    assert.deepEqual(result(), saved[0].result);
    const status = find(hooks.output, node => node.props?.id === "simulation-analysis-status");
    assert.match(renderToStaticMarkup(status), /Paired analysis complete/);
    assert.match(renderToStaticMarkup(status), /Both methods used the same participant sample\./);
    assert.equal((progressHtml().match(/simulation-step is-reached/g) || []).length, 5);
    const posts = requests.filter(r => r.options?.method === "POST");
    assert.equal(posts.length, 1);
    assert.ok(posts.every(r => r.url === "http://simulation.test/api/simulations/1/run" && r.options.body === undefined));
    serverState = { simulationId: 1, status: "failed", result: null, message: "Simulation analysis failed" };
    button().props.onClick(); hooks.render(); await hooks.settle();
    resolvePost(serverState); await hooks.settle();
    assert.equal(result(), undefined, "Failure must not reveal previous results");
    assert.equal(button().props.disabled, false);
    assert.equal((progressHtml().match(/simulation-step is-reached/g) || []).length, 0);
    assert.equal(requests.filter(r => r.options.method === "POST").length, 2, "An explicitly retried failed run may POST after GET");
    find(hooks.output, node => node.props?.["aria-label"] === "Simulation 2").props.onClick(); hooks.render();
    assert.equal(result(), undefined, "Never display another simulation's result");
    assert.equal(progress(), null);
    assert.match(renderToStaticMarkup(button()), /Run Simulation/);
    // Abort an in-flight request on selection change, even if transport later resolves.
    serverState = { simulationId: 2, status: "sample_ready", result: null, message: null };
    button().props.onClick(); hooks.render(); await hooks.settle();
    const latePost = resolvePost;
    find(hooks.output, node => node.props?.["aria-label"] === "Simulation 3").props.onClick(); hooks.render();
    latePost(saved[1]); await hooks.settle(); await advance(4000);
    assert.equal(result(), undefined);
    assert.equal(progress(), null);
    assert.equal(find(hooks.output, node => node.props?.id === "simulation-analysis-status"), null);
    // Throttling is a request failure, not a failed analytical result.
    serverState = { simulationId: 3, status: "sample_ready", result: null, message: null };
    throttlePost = true;
    button().props.onClick(); hooks.render(); await hooks.settle();
    const statusText = () => renderToStaticMarkup(find(hooks.output, node => node.props?.id === "simulation-analysis-status"));
    assert.match(statusText(), /Simulation request throttled/);
    assert.doesNotMatch(statusText(), /Paired analysis did not complete/);
    const alert = () => find(hooks.output, node => node.props?.role === "alert");
    assert.match(renderToStaticMarkup(alert()), /HTTP 429/);
    assert.match(renderToStaticMarkup(alert()), /retried after/);
    let requestCount = requests.length;
    find(alert(), node => node.type === "button").props.onClick(); hooks.render(); await hooks.settle();
    assert.deepEqual(requests.slice(requestCount).map(r => r.options.method), ["GET"], "Retry-After blocks another POST but permits status recovery");
    assert.match(statusText(), /Simulation request throttled/);
    serverState = { simulationId: 3, status: "running", result: null, message: null };
    requestCount = requests.length;
    find(alert(), node => node.type === "button").props.onClick(); hooks.render(); await hooks.settle();
    assert.deepEqual(requests.slice(requestCount).map(r => r.options.method), ["GET"], "Recover active work without POST");
    await advance(400); await advance(400);
    serverState = saved[2]; await advance(2000); await advance(400); await advance(400);
    assert.deepEqual(result(), saved[2].result);
    failGet = true; requestCount = requests.length;
    button().props.onClick(); hooks.render(); await hooks.settle();
    assert.deepEqual(requests.slice(requestCount).map(r => r.options.method), ["GET"], "Never POST when status is unknown");
    assert.match(renderToStaticMarkup(alert()), /HTTP 503/);
    assert.doesNotMatch(statusText(), /Paired analysis did not complete/);
    failGet = false; requestCount = requests.length;
    find(alert(), node => node.type === "button").props.onClick(); hooks.render(); await hooks.settle();
    for (let i = 0; i < 4; i++) await advance(400);
    assert.deepEqual(result(), saved[2].result);
    assert.deepEqual(requests.slice(requestCount).map(r => r.options.method), ["GET"]);
    for (const state of saved) {
      const html = renderToStaticMarkup(React.createElement(page.SimulationTabPanel, { analysis: state.result.analysis, method: "enhanced" }));
      assert.match(html, /DPC Initialization &amp; Reproducibility/);
      assert.match(html, /<dt>Centers selected<\/dt><dd>2<\/dd>/);
      assert.match(html, /<dt>Reproducibility status<\/dt><dd>Passed<\/dd>/);
      assert.doesNotMatch(html, /Count unavailable|Repeated checks|3\s*\/\s*3 identical|21\/30/);
    }
    console.log("PASS GET-first recovery, 200/202 responses, 429/Retry-After handling, GET failure without POST, sequential progress, completion/failure, selection isolation, and current DPC card for all five simulations.");
  } finally { hooks.unmount(); globalThis.fetch = originalFetch; globalThis.setTimeout = originalSetTimeout; globalThis.clearTimeout = originalClearTimeout; }
})().catch(error => { console.error(error); process.exitCode = 1; });
