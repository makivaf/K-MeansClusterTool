import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import * as React from "react";
import ts from "typescript";
import * as schema from "../../../../packages/shared/src/schema";
import * as simulationContract from "../../../../packages/shared/src/simulation";
import * as datasets from "../../../web/src/utils/validatedDataset";
import { completedAnalysisResult } from "../../../web/src/utils/completedAnalysisResult";
import { ResearchRunLifecycle } from "./researchRunLifecycle";
import { createUploadDirectory, removeUploadDirectory } from "./localUploadStore";
import { getRunById } from "./runRepository";
import { getSimulationMetadata } from "./simulationMetadata";
import { simulationRunRoot } from "./simulationExecution";

// Exercise actual hooks and page event handlers, with controlled transport and
// real persisted analytical payloads. No analytical pipeline is recomputed.
const require = createRequire(import.meta.url);
const storage = new Map<string, string>();
Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key)
} });
const equalDeps = (a?: unknown[], b?: unknown[]) => !!a && !!b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
class Hooks {
  slots: any[] = []; index = 0; effects: Array<() => void> = []; dirty = false; output: any;
  component!: () => any;
  react = { ...React,
    useState: (initial: any) => {
      const index = this.index++;
      if (!(index in this.slots)) this.slots[index] = typeof initial === "function" ? initial() : initial;
      return [this.slots[index], (value: any) => { const next = typeof value === "function" ? value(this.slots[index]) : value;
        if (!Object.is(this.slots[index], next)) { this.slots[index] = next; this.dirty = true; } }];
    },
    useRef: (initial: any) => { const index = this.index++; return this.slots[index] ??= { current: initial }; },
    useCallback: (callback: any, deps: unknown[]) => { const index = this.index++; const old = this.slots[index];
      if (!old || !equalDeps(old.deps, deps)) this.slots[index] = { deps, callback }; return this.slots[index].callback; },
    useEffect: (effect: () => any, deps: unknown[]) => { const index = this.index++; const old = this.slots[index];
      if (!old || !equalDeps(old.deps, deps)) { this.slots[index] = { deps, cleanup: old?.cleanup };
        this.effects.push(() => { old?.cleanup?.(); this.slots[index].cleanup = effect(); }); } }
  };
  render() { this.index = 0; this.dirty = false; this.output = this.component(); this.effects.splice(0).forEach(effect => effect()); return this.output; }
  async settle() { for (let i = 0; i < 30; i++) { await new Promise(resolve => setImmediate(resolve)); if (this.dirty) this.render(); } return this.output; }
  unmount() { this.slots.forEach(slot => slot?.cleanup?.()); }
}
function compile(file: string, hooks: Hooks, extra: Record<string, any> = {}) {
  const dependencies: Record<string, any> = { react: hooks.react,
    "../../../../packages/shared/src/schema": schema,
    "../../../../packages/shared/src/simulation": simulationContract,
    "../config/api": { API_BASE_URL: "http://test", isLocalApiBaseUrl: () => true },
    "../utils/validatedDataset": datasets,
    "../utils/completedAnalysisResult": { completedAnalysisResult }, ...extra };
  const source = fs.readFileSync(new URL(`../../../web/src/${file}`, import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const exports: Record<string, any> = {};
  new Function("require", "exports", output)((name: string) => dependencies[name] ?? (name.endsWith(".css") ? {} : name.startsWith(".") ? new Proxy({}, { get: (_, key) => key === "metricDefinitions" ? [] : () => null }) : require(name)), exports);
  return exports;
}
function find(node: any, predicate: (node: any) => boolean): any {
  if (!node || typeof node !== "object") return null;
  if (predicate(node)) return node;
  const action = find(node.props?.action, predicate); if (action) return action;
  for (const child of React.Children.toArray(node.props?.children)) { const found = find(child, predicate); if (found) return found; }
  return null;
}
const originalFetch = globalThis.fetch;
const upload = createUploadDirectory();
const history = path.resolve("data/processed/run-history");
const persisted = fs.readdirSync(history).map(name => schema.ResearchResultSchema.safeParse(JSON.parse(fs.readFileSync(path.join(history, name), "utf8"))))
  .find(result => result.success && "pipeline" in result.data && result.data.result_source === "validated_research_output");
assert.ok(persisted?.success, "A real persisted validated comparison is required");
const result = persisted.data;
const uploadResponse = schema.UploadResponseSchema.parse({ upload_ref: upload.uploadRef, file_count: 7, filenames: datasets.DATASETS.map(([, name]) => name) });
let dataset: schema.UploadResponse | null = null;
let invalidResult = false;
let requests: string[] = [];
const lifecycle = new ResearchRunLifecycle({ execute: async () => ({ resultRunId: result.run_id, persistence: "durable" }) });
try {
  globalThis.fetch = (async (url: any, options?: RequestInit) => {
    requests.push(`${options?.method ?? "GET"} ${url}`);
    if (String(url).endsWith("/api/upload")) return Response.json(uploadResponse);
    if (String(url).endsWith("/api/research/runs") && options?.method === "POST") {
      assert.equal(JSON.parse(String(options.body)).upload_ref, upload.uploadRef);
      const job = lifecycle.enqueue({ upload_ref: upload.uploadRef }, upload.directory);
      await lifecycle.whenIdle();
      return Response.json({ run: lifecycle.get(job.run_id) });
    }
    if (String(url).includes("/api/research/runs/")) return Response.json({}, { status: 404 }); // lost job registry
    if (String(url).endsWith(`/api/runs/${encodeURIComponent(result.run_id)}`)) {
      return Response.json({ run: invalidResult ? { ...result, run_id: "wrong-result" } : await getRunById(result.run_id) });
    }
    throw new Error(`Unexpected request ${url}`);
  }) as typeof fetch;
  const hooks = new Hooks();
  const exports = compile("hooks/useStudyFindings.ts", hooks);
  hooks.component = () => exports.useStudyFindings(dataset);
  hooks.render(); await hooks.settle();
  assert.equal(hooks.output.status, "idle"); assert.equal(requests.length, 0);

  // Dataset Setup file selection -> validation -> Run Comparison event.
  const setup = new Hooks();
  const Upload = compile("pages/UploadAndCluster.tsx", setup, {
    "../utils/uploadFilename": { canonicalUploadFilename: (name: string) => name }
  }).UploadAndCluster;
  setup.component = () => Upload({ dataset, onValidated: (value: schema.UploadResponse | null) => {
    hooks.output.reset(); datasets.saveValidatedDataset(value); dataset = value;
  } });
  setup.render();
  find(setup.output, node => node.props?.["aria-label"] === "Select CSV files").props.onChange({
    target: { files: datasets.DATASETS.map(([, name]) => new File(["test upload boundary"], name)) }, currentTarget: { value: "" }
  });
  setup.render();
  find(setup.output, node => node.type === "button" && node.props.className === "research-primary-button").props.onClick();
  await setup.settle();
  assert.ok(datasets.isDatasetReady(dataset));
  hooks.render(); await hooks.settle(); assert.equal(hooks.output.status, "idle");
  const studyHooks = new Hooks();
  const Study = compile("pages/StudyFindingsPage.tsx", studyHooks).StudyFindingsPage;
  let page = Study({ analysis: hooks.output, dataset });
  assert.ok(!page.props.run, "Validated datasets alone do not authorize findings");
  find(page, node => node.type === "button").props.onClick();
  await hooks.settle();
  assert.equal(hooks.output.status, "complete");
  assert.equal(fs.existsSync(upload.directory), false, "Successful lifecycle removes its temporary upload");
  assert.equal(Study({ analysis: hooks.output, dataset }).props.run.run_id, result.run_id);
  assert.ok(storage.has(exports.ANALYSIS_COMPLETION_KEY));
  hooks.unmount();

  // Refresh after losing both upload metadata and the in-memory job registry.
  dataset = null; datasets.saveValidatedDataset(null); requests = [];
  const restored = new Hooks(); const restoredExports = compile("hooks/useStudyFindings.ts", restored);
  restored.component = () => restoredExports.useStudyFindings(dataset);
  restored.render(); await restored.settle();
  assert.equal(restored.output.status, "complete");
  assert.equal(Study({ analysis: restored.output, dataset }).props.run.run_id, result.run_id);
  assert.deepEqual(requests, [`GET http://test/api/runs/${encodeURIComponent(result.run_id)}`]);
  restored.unmount();

  invalidResult = true;
  const invalid = new Hooks(); const invalidExports = compile("hooks/useStudyFindings.ts", invalid);
  invalid.component = () => invalidExports.useStudyFindings(null); invalid.render(); await invalid.settle();
  assert.notEqual(invalid.output.status, "complete"); assert.equal(invalid.output.run, null);
  invalid.output.reset(); invalid.render(); invalid.unmount(); invalidResult = false;
  assert.ok(!storage.has(exports.ANALYSIS_COMPLETION_KEY), "Explicit dataset reset clears completion");
  const fresh = new Hooks(); const freshExports = compile("hooks/useStudyFindings.ts", fresh);
  fresh.component = () => freshExports.useStudyFindings(uploadResponse); requests = [];
  fresh.render(); await fresh.settle(); assert.equal(fresh.output.status, "idle"); assert.equal(requests.length, 0);
  assert.ok(!Study({ analysis: fresh.output, dataset: uploadResponse }).props.run); fresh.unmount();
  console.log("PASS Dataset Setup events -> Run Comparison -> validated persisted findings; real temporary-upload cleanup; refresh without upload/job registry; no completion gate; result identity validation; explicit reset.");

  const savedSimulation = simulationContract.SimulationRunStateSchema.parse(JSON.parse(fs.readFileSync(path.join(simulationRunRoot, "1.json"), "utf8")).state);
  globalThis.fetch = (async (url: any, options?: RequestInit) => {
    requests.push(`${options?.method ?? "GET"} ${url}`);
    assert.equal(String(url), "http://test/api/simulations/1/run"); return Response.json(savedSimulation);
  }) as typeof fetch;
  const mountSimulation = () => {
    const h = new Hooks();
    const Page = compile("pages/SimulationRunsPage.tsx", h, {
      "../hooks/useSimulationMetadata": { useSimulationMetadata: () => ({ metadata: getSimulationMetadata(), loading: false, error: null, retry: () => {} }) },
      "../hooks/useSimulationCapabilities": { useSimulationCapabilities: () => ({ capabilities: { executionAvailable: true } }) }
    }).SimulationRunsPage;
    h.component = Page; h.render(); return h;
  };
  requests = [];
  const finishSimulationProgress = async (h: Hooks) => {
    for (let stage = 0; stage < 4; stage++) {
      assert.ok(!find(h.output, node => node.props?.result), "Results remain hidden during progress transitions");
      assert.equal(find(h.output, node => node.props?.className === "simulation-run-button").props.disabled, true);
      await new Promise(resolve => setTimeout(resolve, 450));
      await h.settle();
    }
  };
  const simulation = mountSimulation(); await simulation.settle();
  assert.equal(requests.length, 0); assert.ok(!find(simulation.output, node => node.props?.result));
  const button = find(simulation.output, node => node.props?.className === "simulation-run-button");
  assert.equal(button.props.disabled, false); button.props.onClick(); await simulation.settle();
  assert.deepEqual(requests, ["GET http://test/api/simulations/1/run"], "Cached results need no POST");
  await finishSimulationProgress(simulation);
  assert.deepEqual(find(simulation.output, node => node.props?.result).props.result, savedSimulation.result);
  simulation.unmount(); requests = [];
  const refreshed = mountSimulation(); await refreshed.settle();
  assert.equal(requests.length, 0); assert.ok(!find(refreshed.output, node => node.props?.result));
  find(refreshed.output, node => node.props?.className === "simulation-run-button").props.onClick(); await refreshed.settle();
  await finishSimulationProgress(refreshed);
  assert.deepEqual(find(refreshed.output, node => node.props?.result).props.result, savedSimulation.result);
  refreshed.unmount();
  console.log("PASS Simulation Runs mount/refresh: metadata only, no result requests; explicit button click displays real paired result; explicit rerun after refresh.");
} finally { globalThis.fetch = originalFetch; if (fs.existsSync(upload.directory)) removeUploadDirectory(upload.directory); }
