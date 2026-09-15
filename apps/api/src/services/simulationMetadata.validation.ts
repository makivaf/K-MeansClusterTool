import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import fs from "node:fs";
import { createRequire } from "node:module";
import express from "express";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as contract from "../../../../packages/shared/src/simulation";
import { app } from "../app";
import { createSimulationMetadataRouter } from "../routes/simulations";
import { getSimulationMetadata } from "./simulationMetadata";
import { getSimulationSample } from "./simulationSample";

const payload = getSimulationMetadata();
for (const entry of payload.simulations) {
  const sample = getSimulationSample(entry.simulationId);
  assert.equal(entry.sampleSize, sample.sampleParticipantCount);
  assert.deepEqual(entry.phaseSampleCounts, sample.phaseSampleCounts);
  assert.deepEqual(Object.keys(entry).sort(), ["simulationId", "sampleSize", "samplingFraction", "samplingMethod", "phaseSampleCounts", "sampleStatus", "analysisStatus"].sort());
  assert.equal(entry.sampleStatus, "sample_ready");
  assert.equal(entry.analysisStatus, "analysis_unavailable");
}
for (const secret of ["RID", "sampleParticipantIds", "fingerprint", "diagnosis", "cluster", "severity", "outcome"]) {
  assert.ok(!JSON.stringify(payload).includes(secret));
  assert.equal(contract.SimulationMetadataSchema.safeParse({ ...payload.simulations[0], [secret]: "private" }).success, false);
}
assert.equal(contract.SimulationMetadataResponseSchema.safeParse({ simulations: Array(5).fill(payload.simulations[0]) }).success, false);
assert.equal(contract.SimulationMetadataSchema.safeParse({ ...payload.simulations[0], sampleSize: 1 }).success, false);
assert.equal(contract.SimulationMetadataSchema.safeParse({ ...payload.simulations[0], analysisStatus: "complete" }).success, false);

async function checkHttp(application: express.Express, failure = false) {
  const server = application.listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const response = await fetch(`${base}/api/simulations/metadata`);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.status, failure ? 503 : 200);
    assert.deepEqual(await response.json(), failure
      ? { code: "SIMULATION_METADATA_UNAVAILABLE", message: "Simulation sample metadata is unavailable." } : payload);
    if (!failure) {
      const capabilities = contract.SimulationCapabilitiesSchema.parse(await (await fetch(`${base}/api/simulations/capabilities`)).json());
      assert.equal(capabilities.executionAvailable, false);
    }
  } finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}
await checkHttp(app);
const failedApp = express();
failedApp.use("/api/simulations", createSimulationMetadataRouter(() => { throw new Error("private roster path and RID must not escape"); }));
await checkHttp(failedApp, true);

// Execute the actual hook and page with controlled React state/fetch; no browser or extra test dependency needed.
const require = createRequire(import.meta.url);
function compile(relativePath: string, dependencies: Record<string, unknown>) {
  const source = fs.readFileSync(new URL(relativePath, import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const exports: Record<string, any> = {};
  new Function("require", "exports", output)((name: string) => name in dependencies ? dependencies[name] : name.endsWith(".css") ? {} : require(name), exports);
  return exports;
}
const originalFetch = globalThis.fetch;
try {
  async function checkHook(mode: "ready" | "error" | "malformed" | "abort") {
    const states: any[] = [];
    let cleanup: (() => void) | undefined;
    let finish!: (response: Response) => void;
    let signal: AbortSignal | undefined;
    globalThis.fetch = ((_url: unknown, options: RequestInit) => {
      assert.ok(String(_url).endsWith("/api/simulations/metadata"));
      signal = options.signal as AbortSignal;
      return new Promise<Response>((resolve) => { finish = resolve; });
    }) as typeof fetch;
    const hook = compile("../../../web/src/hooks/useSimulationMetadata.ts", {
      react: { useState: (initial: unknown) => { const index = states.length; states.push(initial); return [initial, (value: any) => { states[index] = typeof value === "function" ? value(states[index]) : value; }]; },
        useEffect: (effect: () => () => void) => { cleanup = effect(); } },
      "../../../../packages/shared/src/simulation": contract,
      "../config/api": { API_BASE_URL: "http://local.test" }
    }).useSimulationMetadata();
    assert.equal(hook.loading, true);
    assert.equal(hook.metadata, null);
    if (mode === "abort") cleanup?.();
    finish(new Response(JSON.stringify(mode === "malformed" ? {} : payload), { status: mode === "error" ? 503 : 200 }));
    await new Promise((resolve) => setImmediate(resolve));
    if (mode === "ready") { assert.deepEqual(states[0], payload); assert.equal(states[1], null); assert.equal(states[2], false); }
    else if (mode === "abort") { assert.equal(signal?.aborted, true); assert.equal(states[0], null); assert.equal(states[1], null); }
    else { assert.equal(states[0], null); assert.equal(states[1], "Unable to load simulation sample metadata."); assert.equal(states[2], false); hook.retry(); assert.equal(states[3], 1); }
    cleanup?.();
  }
  for (const mode of ["ready", "error", "malformed", "abort"] as const) await checkHook(mode);
} finally { globalThis.fetch = originalFetch; }

for (const state of [
  { metadata: null, loading: true, error: null },
  { metadata: payload, loading: false, error: null },
  { metadata: null, loading: false, error: "Unable to load simulation sample metadata." }
]) {
  const page = compile("../../../web/src/pages/SimulationRunsPage.tsx", {
    react: { ...React, useState: () => [3, () => {}] },
    "../../../../packages/shared/src/simulation": contract,
    "../hooks/useSimulationMetadata": { useSimulationMetadata: () => ({ ...state, retry: () => {} }) }
  }).SimulationRunsPage;
  const html = renderToStaticMarkup(React.createElement(page));
  assert.match(html, /disabled=""[^>]*class="simulation-run-button"/);
  assert.match(html, /Analysis unavailable/);
  assert.equal((html.match(/class="simulation-choice /g) ?? []).length, 5);
  assert.match(html, /aria-pressed="true" aria-label="Simulation 3"/);
  assert.ok(!/Silhouette|Davies|Calinski|Cluster Distribution|Cumulative Explained|Iterations/.test(html));
  if (state.metadata) { assert.match(html, /1,949/); assert.match(html, /80% stratified participant subsample/); assert.match(html, /Sample ready/); }
  else { assert.ok(!html.includes("1,949")); assert.match(html, state.loading ? /Loading sample metadata/ : /Retry/); }
}
console.log("PASS aggregate metadata API, strict privacy contract, safe 503, execution disabled, hook loading/retry/abort, and Simulation Runs rendering.");
