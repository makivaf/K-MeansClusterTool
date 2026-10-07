import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { build } from "esbuild";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const require = createRequire(import.meta.url);
const hookSource = readFileSync(new URL("../src/hooks/useStudyFindings.ts", import.meta.url), "utf8");
const dataset = { upload_ref: "test-upload", file_count: 7, filenames: ["ADAS.csv", "CDR.csv", "FAQ.csv", "MMSE.csv", "NEUROBAT.csv", "NPIQ.csv", "GDSCALE.csv"] };
const job = { status: "complete", run_id: "job", result_run_id: "result" };
// Transport/validation boundaries are stubbed in these UI tests. No fixture is
// imported into production, and no scientific calculation is executed here.
const run = { run_id: "result", cohort: { parentN: 2437 }, preprocessing: { retainedFeatures: ["MMSE", "ADAS13"] },
  baselineComparison: { metrics: [], baselineMethod: { selectedK: 2, runCount: 30 } },
  enhancedClustering: { metrics: {}, clusterSizes: [] }, kSelection: { candidateK: [2, 3], selectedK: 2, usableVotes: 24, voteDistribution: [], indexResults: [] },
  pca: { components: 1, cumulativeExplainedVariance: 0.9, scree: [{ component: 1, cumulativeVariance: 0.9 }] },
  initialization: { deterministic: true, selectedCentroids: [] }, clusterProfiles: { profiles: [], smdRanking: [] },
  longitudinal: { timeSeries: [], mixedEffects: { primaryResult: { confidenceInterval95: {}, pValue: 0.5 }, estimatedAnnualChangeByOriginalCluster: [] } } };
const storage = new Map();
const sessionStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
const calls = [];
let respond;
const response = payload => ({ ok: true, json: async () => payload });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const flush = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };

// A small hook host keeps state, refs, dependency changes and effect cleanup
// observable without requiring a DOM or adding a test framework dependency.
function mount(input = dataset) {
  const slots = []; let cursor = 0; const effects = [];
  const changed = (a, b) => !a || a.some((value, i) => value !== b[i]);
  const react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial; return [slots[i], value => { slots[i] = typeof value === "function" ? value(slots[i]) : value; }]; },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useCallback(callback, deps) { const i = cursor++; if (changed(slots[i]?.deps, deps)) slots[i] = { callback, deps }; return slots[i].callback; },
    useEffect(callback, deps) { const i = cursor++; if (changed(slots[i]?.deps, deps)) { slots[i]?.cleanup?.(); slots[i] = { deps }; effects.push(() => { slots[i].cleanup = callback(); }); } }
  };
  const exports = {};
  const modules = {
    react, zod: { ZodError: class extends Error {} }, "../config/api": { API_BASE_URL: "http://test" },
    "../../../../packages/shared/src/schema": { ResearchRunResponseSchema: { parse: value => value }, ResearchRunCompleteSchema: { safeParse: value => ({ success: value?.status === "complete", data: value }) } },
    "../utils/validatedDataset": { isDatasetReady: value => value?.file_count === 7 },
    "../utils/completedAnalysisResult": { completedAnalysisResult: (completion, payload) => { if (payload.run?.run_id !== completion.result_run_id) throw Error("Result identity mismatch"); return payload.run; } }
  };
  vm.runInNewContext(ts.transpileModule(hookSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText,
    { exports, require: id => { assert.ok(id in modules, id); return modules[id]; }, sessionStorage, AbortController, DOMException, setTimeout, clearTimeout,
      fetch: async (url, options) => { calls.push({ url, options }); return respond(url, options); } });
  return { render() { cursor = 0; const value = exports.useStudyFindings(input); effects.splice(0).forEach(effect => effect()); return value; }, unmount() { slots.forEach(slot => slot?.cleanup?.()); } };
}

let host = mount();
let state = host.render();
assert.equal(state.standard.status, "idle");
await state.startEnhanced();
assert.equal(calls.length, 0, "Enhanced is locked initially");
const admission = deferred();
respond = (_, options) => options?.method === "POST" ? admission.promise : response({ run });
const first = state.start(); await state.start();
state = host.render();
assert.equal(state.standard.status, "running");
assert.equal(state.enhanced.status, "locked");
assert.equal(calls.length, 1, "Rapid Standard clicks submit only once");
admission.resolve(response({ run: job })); await first;
state = host.render();
assert.equal(state.standard.status, "completed");
assert.equal(state.enhanced.status, "ready");
const retained = state.standard.run;
host.unmount(); host = mount(null); host.render(); await flush(); state = host.render();
assert.equal(state.standard.status, "completed", "Restores without temporary upload metadata");
assert.equal(state.enhanced.status, "ready", "Refresh must not unlock comparison");
const loading = deferred(); respond = () => loading.promise;
const second = state.startEnhanced(); await state.startEnhanced(); state = host.render();
assert.equal(state.enhanced.status, "running"); assert.equal(state.standard.run, retained);
loading.resolve({ ok: false }); await second; state = host.render();
assert.equal(state.enhanced.status, "error"); assert.equal(state.standard.run, retained);
respond = () => response({ run: { ...run, run_id: "unrelated" } });
await state.startEnhanced(); state = host.render(); assert.equal(state.enhanced.status, "error");
respond = () => response({ run: structuredClone(run) });
await state.startEnhanced(); state = host.render();
assert.equal(state.enhanced.status, "completed"); assert.equal(state.standard.run, retained);
assert.notEqual(state.standard.run, state.enhanced.run, "Results are held independently");
assert.equal(calls.filter(call => call.options?.method === "POST").length, 1);
host.unmount(); host = mount(null); host.render(); await flush(); state = host.render();
assert.equal(state.enhanced.status, "completed", "Comparison survives refresh");
state.reset(); state = host.render(); assert.equal(state.standard.status, "idle"); assert.equal(storage.size, 0);
host.unmount();

// Legacy completions continue to restore the comparison; in-flight Enhanced
// retrieval is recovered by the existing persisted-result verification.
for (const phase of [null, "running", "ready", "error"]) {
  storage.clear(); storage.set("ad-clustering.analysis-completion", JSON.stringify({ uploadRef: dataset.upload_ref, job }));
  if (phase) storage.set("ad-clustering.analysis-phase", JSON.stringify({ uploadRef: dataset.upload_ref, enhanced: phase }));
  host = mount(null); host.render(); await flush(); state = host.render();
  assert.equal(state.enhanced.status, phase === null || phase === "running" ? "completed" : "ready"); host.unmount();
}
storage.clear(); storage.set("ad-clustering.analysis-job", JSON.stringify({ uploadRef: dataset.upload_ref, jobId: job.run_id }));
storage.set("ad-clustering.analysis-phase", JSON.stringify({ uploadRef: dataset.upload_ref, enhanced: "locked" }));
respond = url => response({ run: url.includes("/research/") ? job : run });
host = mount(null); host.render(); await flush(); state = host.render(); assert.equal(state.enhanced.status, "ready");
const pending = deferred(); respond = () => pending.promise;
const cancelled = state.startEnhanced(); state.reset(); pending.resolve(response({ run })); await cancelled;
state = host.render(); assert.equal(state.standard.status, "idle"); assert.equal(state.enhanced.status, "locked"); assert.equal(storage.size, 0);
host.unmount();
console.log("PASS sequential states, independent results, duplicate prevention, failure/retry, restoration, cancellation");

// Render the production page with controlled evidence and tab selection. This
// checks all five layouts plus every tab without starting a research job.
const bundle = await build({ absWorkingDir: root, entryPoints: ["apps/web/src/pages/StudyFindingsPage.tsx"], bundle: true, write: false, platform: "node", format: "cjs", packages: "external", loader: { ".css": "empty" },
  plugins: [{ name: "test-evidence", setup(build) {
    build.onLoad({ filter: /useSopEvaluation\.ts$/ }, () => ({ contents: "export const useSopEvaluation = () => globalThis.__studyEvidence;", loader: "ts" }));
    build.onLoad({ filter: /StudyFindingsPage\.tsx$/ }, args => ({ contents: readFileSync(args.path, "utf8").replace('useState("sop1")', 'useState(globalThis.__studyTab ?? "sop1")'), loader: "tsx" }));
  } }] });
const module = { exports: {} };
globalThis.__studyEvidence = { studyEvidence: JSON.parse(readFileSync(new URL("../../api/artifacts/study_evidence.json", import.meta.url))), dpcStatus: "unavailable" };
vm.runInThisContext(`(function(require,module,exports){${bundle.outputFiles[0].text}\n})`)(require, module, module.exports);
const { StudyFindingsPage } = module.exports;
const render = (standard, enhanced, tab = "sop1", progress = {}) => {
  globalThis.__studyTab = tab;
  return renderToStaticMarkup(React.createElement(StaticRouter, { location: "/study-findings" }, React.createElement(StudyFindingsPage, { dataset,
    analysis: { standard: { status: standard, run: standard === "completed" ? run : null }, enhanced: { status: enhanced, run: enhanced === "completed" ? run : null }, locked: standard === "running", ...progress } })));
};
let html = render("idle", "locked");
assert.match(html, /Run Standard K-Means/); assert.match(html, /n = 2,437/); assert.doesNotMatch(html, /role="tab"|Method Comparison Overview|Analysis Runs/);
html = render("running", "locked"); assert.match(html, /Running\.\.\./); assert.match(html, /What happens next/); assert.match(html, /Results will appear here/); assert.doesNotMatch(html, /role="tab"|Run Enhanced K-Means|aria-label="Analysis Runs"/);
const workflowSteps = ["Preparing Data", "Preprocessing", "Standard Setup", "K-Means", "Validation", "Complete"];
const stageCases = [
  ["preparing_inputs", 0], ["constructing_study_entry_cohort", 0], ["preprocessing", 1],
  ["pca", 2], ["selecting_k", 2], ["deterministic_initialization", 2], ["enhanced_kmeans", 2], ["cluster_profiling", 2],
  ["baseline_comparison", 3], ["matching_longitudinal_records", 4], ["longitudinal_eligibility", 4],
  ["longitudinal_analysis", 4], ["aggregate_artifact_validation", 4]
];
for (const [stage, active] of stageCases) {
  html = render("running", "locked", "sop1", { status: "running", stage });
  assert.equal((html.match(/aria-current="step"/g) ?? []).length, 1, stage);
  assert.equal((html.match(/simulation-step is-reached/g) ?? []).length, active, stage);
  const steps = [...html.matchAll(/<li[^>]*class="simulation-step [^"]*"[^>]*>([\s\S]*?)<\/li>/g)];
  assert.equal(steps.length, 6);
  for (let i = 0; i < 6; i++) {
    assert.ok(steps[i][1].includes(workflowSteps[i]));
    assert.ok(steps[i][1].includes(`: ${i < active ? "complete" : i === active ? "in progress" : "pending"}`));
  }
  assert.doesNotMatch(html, /role="tab"|Method Comparison Overview|Standard K-Means Results|Run Enhanced K-Means/);
}
for (const progress of [{ status: "queued" }, { status: "submitting" }, { status: "verifying" }, { status: "running", stage: "unknown" }]) {
  html = render("running", "locked", "sop1", progress);
  assert.doesNotMatch(html, /aria-current="step"|simulation-step is-reached/);
  assert.equal((html.match(/: pending/g) ?? []).length, 6);
}
console.log("PASS all reported runtime stage mappings; pending queue/verification; no premature completion or results");
for (const tab of ["sop1", "sop2", "sop3", "final"]) {
  html = render("completed", "ready", tab); assert.match(html, /Standard K-Means Results/); assert.match(html, /Run Enhanced K-Means/);
  assert.doesNotMatch(html, /Method Comparison Overview|Principal Component Analysis|DPC Initialization Evidence|Final Cluster Profiles|Relative Change/);
  assert.match(html, new RegExp(`id="study-panel-${tab}"`));
  html = render("completed", "running", tab); assert.match(html, /Standard K-Means Results/); assert.doesNotMatch(html, /Method Comparison Overview/);
  assert.match(html, /Run Enhanced K-Means/);
  assert.match(html, /Track Enhanced K-Means analysis progress on the validated full cohort/);
  assert.match(html, /Loading and verifying Enhanced results/);
  assert.doesNotMatch(html, /What happens next|Results will appear here|aria-label="Analysis Runs"|aria-current="step"/);
  assert.equal((html.match(/: pending/g) ?? []).length, 8, "No fabricated Enhanced workflow progress");
  for (const label of ["Validated cohort ready", "Dimensionality reduction", "Cluster number selection", "Centroid initialization", "Lloyd clustering", "Computing clustering metrics", "Enhanced results ready"]) assert.ok(html.includes(label));
  assert.match(html, new RegExp(`id="study-panel-${tab}"`));
  assert.match(html, new RegExp(`id="study-tab-${tab}"[^>]*aria-selected="true"`));
  assert.ok(html.indexOf("Run Enhanced K-Means") < html.indexOf("Standard K-Means Results"));
  assert.doesNotMatch(html, /<button[^>]*>Run Enhanced K-Means/);
  html = render("completed", "completed", tab); assert.match(html, /Method Comparison Overview/); assert.match(html, /Comparison Ready/);
  assert.doesNotMatch(html, /study-stepper|Loading and verifying Enhanced results/);
  if (tab === "sop2") {
    for (const label of ["Silhouette-Based Selection", "NbClust Multi-Index Selection", "NbClust Votes", "Vote Summary", "Highest vote count", "View NbClust Index Details", "What it assesses", "Suggested k"]) assert.ok(html.includes(label), label);
    assert.ok(html.indexOf("NbClust Votes") < html.indexOf("Vote Summary"));
    assert.ok(html.indexOf("Vote Summary") < html.indexOf("View NbClust Index Details"));
  }
  if (tab === "sop1" || tab === "final") {
    const validation = html.match(/<table class="internal-validation-table">[\s\S]*?<\/table>/)?.[0];
    assert.ok(validation);
    assert.equal((validation.match(/scope="row"/g) ?? []).length, tab === "sop1" ? 1 : 3);
    assert.match(html, /View Calculation Details/);
  }
}
// React preserves local tab state when the same result component, key and
// position survive a parent update. Inspect those reconciliation inputs directly.
const resultPosition = enhancedStatus => {
  const tree = StudyFindingsPage({ dataset, analysis: {
    standard: { status: "completed", run }, enhanced: { status: enhancedStatus, run: null }
  } });
  let found;
  function walk(node, path = []) {
    if (Array.isArray(node)) return node.forEach((child, index) => walk(child, [...path, index]));
    if (!React.isValidElement(node)) return;
    if (node.props.standardRun === run) found = { node, path };
    walk(node.props.children, [...path, "children"]);
  }
  walk(tree); return found;
};
const beforeEnhanced = resultPosition("ready"), duringEnhanced = resultPosition("running");
assert.ok(beforeEnhanced && duringEnhanced);
assert.deepEqual(beforeEnhanced.path, duringEnhanced.path);
assert.equal(beforeEnhanced.node.type, duringEnhanced.node.type);
assert.equal(beforeEnhanced.node.key, duringEnhanced.node.key);
assert.equal(beforeEnhanced.node.props.run, duringEnhanced.node.props.run);
assert.equal(beforeEnhanced.node.props.standardRun, duringEnhanced.node.props.standardRun);
console.log("PASS Enhanced card, eight unreported stages pending, preserved Standard tabs/component/result identity, gated comparison");
html = render("completed", "ready"); assert.match(html, /Pre-PCA correlation heatmap/);
html = render("completed", "completed"); assert.match(html, /Principal Component Analysis/); assert.match(html, /Controlled PCA Contribution/);
assert.match(html, /Principal Components \u2014 Loading Matrix/);
assert.match(html, /Loading values will appear when PCA loading data is available/);
const placeholderMatrix = html.match(/<table class="pca-loading-table">[\s\S]*?<\/table>/)?.[0];
assert.ok(placeholderMatrix);
assert.doesNotMatch(placeholderMatrix, /is-strongest|color-mix/);
assert.equal((placeholderMatrix.match(/class="is-placeholder"/g) ?? []).length, run.preprocessing.retainedFeatures.length * run.pca.components);
assert.ok(html.indexOf("Variance Summary") < html.indexOf("Loading Matrix"));
assert.ok(html.indexOf("Loading Matrix") < html.indexOf("Controlled PCA Contribution"));
// Supply evidence only on the Enhanced result: the final comparison must use
// that result rather than the earlier Standard result or a running-state gate.
const enhancedWithLoadings = { ...run, pca: { ...run.pca, pcaLoadings: {
  variables: [...run.preprocessing.retainedFeatures], components: ["PC1"], values: [[0.421583], [-0.438192]]
} } };
const withLoadings = render("completed", "completed", "sop1", { enhanced: { status: "completed", run: enhancedWithLoadings } });
assert.match(withLoadings, /Comparison Ready/);
assert.equal((withLoadings.match(/Principal Components — Loading Matrix/g) ?? []).length, 1);
assert.match(withLoadings, /\+0\.421583/); assert.match(withLoadings, /-0\.438192/);
assert.ok(withLoadings.indexOf("Principal Components — Variance Summary") < withLoadings.indexOf("Principal Components — Loading Matrix"));
assert.ok(withLoadings.indexOf("Principal Components — Loading Matrix") < withLoadings.indexOf("Controlled PCA Contribution to Clustering"));
assert.doesNotMatch(render("completed", "running", "sop1", { enhanced: { status: "running", run: enhancedWithLoadings } }), /Principal Components — Loading Matrix/);
console.log("PASS Comparison Ready SOP 1 consumes Enhanced loading evidence once, in the required order; absent evidence shows neutral placeholders");
const completedCard = html.match(/<section class="study-runs is-completed"[\s\S]*?<\/section>/)?.[0];
assert.ok(completedCard);
assert.equal((completedCard.match(/✓ Completed/g) ?? []).length, 2);
assert.match(completedCard, /study-comparison-ready/);
assert.match(completedCard, /Both analyses completed successfully\./);
assert.match(completedCard, /Comparative Study Findings are now available below\./);
assert.ok(html.indexOf("Both analyses completed successfully.") < html.indexOf("Method Comparison Overview"));
for (const [standard, enhanced] of [["idle", "locked"], ["running", "locked"], ["completed", "ready"], ["completed", "running"], ["completed", "error"], ["error", "completed"]]) {
  assert.doesNotMatch(render(standard, enhanced), /study-runs is-completed|Comparison Ready|Both analyses completed successfully/);
}
assert.doesNotMatch(render("completed", "completed", "sop1", { enhanced: { status: "completed", run: null } }), /study-runs is-completed|Comparison Ready/);
console.log("PASS completion card uses both completed states and available results; final findings remain below");
delete globalThis.__studyEvidence; delete globalThis.__studyTab;
console.log("PASS five page states, all four tabs, actual correlation rendering, gated comparison and retained PCA evidence");
