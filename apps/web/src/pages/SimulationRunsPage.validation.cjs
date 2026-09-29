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
const cacheRoot = path.join(root, "apps/api/private/simulation-runs");
const saved = fs.readdirSync(cacheRoot).filter(name => /^runtime-v2-1-.*\.json$/.test(name)).map(name => contract.SimulationRunStateSchema.parse(
  JSON.parse(fs.readFileSync(path.join(cacheRoot, name), "utf8")).state)).filter(state => state.configurationKey === "custom:100:3");
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
    hooks.render();
    assert.equal(progress(), null);
    assert.equal(result(), undefined);
    assert.match(renderToStaticMarkup(button()), /Run Simulation/);
    assert.equal(find(hooks.output, node => node.props?.id === "simulation-analysis-status"), null);
    await hooks.settle();
    assert.equal(requests.length, 0, "Cached complete metadata must not start a run or fetch results");
    find(hooks.output, node => node.type === "button" && node.props.children === "Custom Sample").props.onClick(); hooks.render();
    const initialSlider = find(hooks.output, node => node.props?.id === "simulation-sample-count");
    assert.equal(initialSlider.props.value, 100);
    assert.equal(initialSlider.props.min, 100);
    assert.equal(initialSlider.props.max, 2437);
    const override = find(hooks.output, node => node.type === "input" && node.props.type === "checkbox");
    assert.equal(override.props.checked, false);
    assert.equal(find(hooks.output, node => node.props?.["aria-label"] === "Increase manual k"), null);
    override.props.onChange({ target: { checked: true } }); hooks.render();
    find(hooks.output, node => node.props?.["aria-label"] === "Increase manual k").props.onClick(); hooks.render();
    await hooks.settle();
    assert.equal(requests.length, 0, "Configuration changes never execute or reveal results");
    button().props.onClick(); hooks.render();
    assert.equal(button().props.disabled, true);
    assert.equal(find(hooks.output, node => node.type === "fieldset").props.disabled, true);
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
    serverState = { simulationId: 1, configurationKey: key, status: "sample_ready", result: null, message: null };
    button().props.onClick(); hooks.render();
    assert.equal(result(), undefined, "Hide previous result during POST");
    assert.equal(button().props.disabled, true);
    assert.equal((progressHtml().match(/simulation-step is-reached/g) || []).length, 0);
    await hooks.settle();
    assert.deepEqual(requests.slice(-2).map(r => r.options.method), ["GET", "POST"]);
    serverState = { simulationId: 1, configurationKey: key, status: "running", result: null, message: null };
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
    assert.ok(posts.every(r => r.url === "http://simulation.test/api/simulations/1/run" && JSON.parse(r.options.body).manualK === 3 && JSON.parse(r.options.body).sampleCount === 100));
    serverState = { simulationId: 1, configurationKey: key, status: "failed", result: null, message: "Simulation analysis failed" };
    button().props.onClick(); hooks.render(); await hooks.settle();
    resolvePost(serverState); await hooks.settle();
    assert.equal(result(), undefined, "Failure must not reveal previous results");
    assert.equal(button().props.disabled, false);
    assert.equal((progressHtml().match(/simulation-step is-reached/g) || []).length, 0);
    assert.equal(requests.filter(r => r.options.method === "POST").length, 2, "An explicitly retried failed run may POST after GET");
    // Changing configuration hides results and never automatically launches work.
    find(hooks.output, node => node.type === "button" && node.props.children === "Custom Sample").props.onClick(); hooks.render();
    find(hooks.output, node => node.props?.id === "simulation-sample-count").props.onChange({ target: { value: "500" } }); hooks.render();
    find(hooks.output, node => node.props?.["aria-label"] === "Increase manual k").props.onClick(); hooks.render();
    assert.match(renderToStaticMarkup(hooks.output), /Selected: 500 of 2,437 participants/);
    assert.equal(find(hooks.output, node => node.props?.["aria-label"] === "Simulation 2"), null);
    await hooks.settle();
    assert.equal(result(), undefined);
    const beforeStale = requests.length;
    serverState = saved[0];
    button().props.onClick(); hooks.render(); await hooks.settle();
    assert.equal(result(), undefined, "Reject cached response belonging to a different configuration");
    assert.equal(requests.length, beforeStale + 1);
    find(hooks.output, node => node.props?.id === "simulation-sample-count").props.onChange({ target: { value: "100" } }); hooks.render();
    find(hooks.output, node => node.props?.["aria-label"] === "Decrease manual k").props.onClick(); hooks.render();
    await hooks.settle();
    // Throttling is a request failure, not a failed analytical result.
    serverState = { simulationId: 1, configurationKey: key, status: "sample_ready", result: null, message: null };
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
    serverState = { simulationId: 1, configurationKey: key, status: "running", result: null, message: null };
    requestCount = requests.length;
    find(alert(), node => node.type === "button").props.onClick(); hooks.render(); await hooks.settle();
    assert.deepEqual(requests.slice(requestCount).map(r => r.options.method), ["GET"], "Recover active work without POST");
    await advance(400); await advance(400);
    serverState = saved[0]; await advance(2000); await advance(400); await advance(400);
    assert.deepEqual(result(), saved[0].result);
    failGet = true; requestCount = requests.length;
    button().props.onClick(); hooks.render(); await hooks.settle();
    assert.deepEqual(requests.slice(requestCount).map(r => r.options.method), ["GET"], "Never POST when status is unknown");
    assert.match(renderToStaticMarkup(alert()), /HTTP 503/);
    assert.doesNotMatch(statusText(), /Paired analysis did not complete/);
    failGet = false; requestCount = requests.length;
    find(alert(), node => node.type === "button").props.onClick(); hooks.render(); await hooks.settle();
    for (let i = 0; i < 4; i++) await advance(400);
    assert.deepEqual(result(), saved[0].result);
    assert.deepEqual(requests.slice(requestCount).map(r => r.options.method), ["GET"]);
    for (const state of saved) {
      const html = renderToStaticMarkup(React.createElement(page.SimulationResults, { result: state.result, manualK: 3 }));
      const headings = ["Feature Representation", "Cluster Number Selection", "Initialization", "Standard vs Enhanced Comparison"];
      let last = -1;
      for (const heading of headings) {
        const next = html.indexOf(`class="simulation-section-title">${heading}</h2>`);
        assert.ok(next > last, `${heading} follows the previous section`);
        last = next;
      }
      const control = state.result.analysis.enhanced.dpc.randomControl;
      assert.match(html, /PCA-space random-start agreement with DPC solution:/);
      if (control) assert.ok(html.includes(`${control.matchingRuns} of ${control.totalRandomRuns} random starts`));
      assert.match(html, /manual k = 3/);
      assert.match(html, /Relative Change/);
      assert.match(html, /PC1 and PC2 are used only for 2D visualization/);
      assert.match(html, /Selected Centers/);
      assert.doesNotMatch(html, /Existing vs Enhanced|Simulation 1|SOP 1/);
      for (const row of state.result.comparison) {
        const format = value => value.toLocaleString("en-US", { maximumFractionDigits: 6 });
        assert.ok(html.includes(format(row.existing)));
        assert.ok(html.includes(format(row.enhanced)));
      }
    }
    assert.ok(requests.every(r => r.options.method === "GET" ? r.url.includes("?sampleMode=custom&sampleCount=") : !!r.options.body));
    const html = renderToStaticMarkup(React.createElement(page.SimulationResults, { result: saved[0].result }));
    assert.doesNotMatch(html, /Correlation heatmap unavailable|projections unavailable|Full DPC decision graph unavailable|not supplied/);
    assert.match(html, /not statistical significance/);
    assert.doesNotMatch(html, /2\?10|0\?29|sample\?s|Enhanced\?s|PC1\?PC2/);
    assert.match(html, /not the canonical enhancement comparison/);
    const requestsBeforeFull = requests.length;
    find(hooks.output, node => node.type === "button" && node.props.children === "Full Dataset").props.onClick(); hooks.render();
    assert.equal(result(), undefined, "Changing a completed configuration immediately hides its result");
    await hooks.settle();
    assert.equal(requests.length, requestsBeforeFull, "Full Dataset selection does not automatically run");
    button().props.onClick(); hooks.render(); await hooks.settle();
    assert.ok(requests.at(-1).url.endsWith("?sampleMode=full&sampleCount=2437&manualK=3"));
    assert.equal(result(), undefined, "A cached custom sample cannot satisfy Full Dataset");
    find(hooks.output, node => node.type === "input" && node.props.type === "checkbox").props.onChange({ target: { checked: false } }); hooks.render();
    assert.equal(result(), undefined, "Disabling override hides the overridden result");
    await hooks.settle();
    serverState = { simulationId: 1, configurationKey: "full:2437:auto", status: "sample_ready", result: null, message: null };
    throttlePost = false;
    Date.now = () => originalDateNow() + 120_000; // The earlier Retry-After window has elapsed.
    button().props.onClick(); hooks.render(); await hooks.settle();
    assert.ok(requests.at(-2).url.endsWith("?sampleMode=full&sampleCount=2437"));
    assert.equal(JSON.parse(requests.at(-1).options.body).manualK, null);
    resolvePost({ ...serverState, status: "failed", message: "Test stops before analysis" }); await hooks.settle();
    find(hooks.output, node => node.type === "button" && node.props.children === "Custom Sample").props.onClick(); hooks.render();
    assert.equal(find(hooks.output, node => node.props?.id === "simulation-sample-count").props.value, 100);
    find(hooks.output, node => node.props?.id === "simulation-sample-count").props.onChange({ target: { value: "500" } }); hooks.render();
    find(hooks.output, node => node.type === "button" && node.props.children === "Full Dataset").props.onClick(); hooks.render();
    find(hooks.output, node => node.type === "button" && node.props.children === "Custom Sample").props.onClick(); hooks.render();
    assert.equal(find(hooks.output, node => node.props?.id === "simulation-sample-count").props.value, 100, "Switching back to Custom Sample resets the default");
    console.log("PASS initial visibility, GET-first recovery, configuration-bound requests, progress/completion, failure/retry, throttling, runtime configuration and stale response rejection, ordered results and preserved metrics for the real runtime run.");
  } finally { Date.now = originalDateNow; hooks.unmount(); globalThis.fetch = originalFetch; globalThis.setTimeout = originalSetTimeout; globalThis.clearTimeout = originalClearTimeout; }
})().catch(error => { console.error(error); process.exitCode = 1; });
