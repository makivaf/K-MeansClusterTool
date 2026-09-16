import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as contract from "../../../../packages/shared/src/simulation";
import { SimulationRunStateSchema } from "../../../../packages/shared/src/simulation";
import { simulationRunRoot } from "./simulationExecution";
import { getSimulationMetadata } from "./simulationMetadata";
const state = SimulationRunStateSchema.parse(JSON.parse(fs.readFileSync(path.join(simulationRunRoot, "1.json"), "utf8")).state);
// Render the actual page with the completed real payload and controlled states.
const require = createRequire(import.meta.url);
const pageSource = fs.readFileSync(new URL("../../../web/src/pages/SimulationRunsPage.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(pageSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
function renderPage(runState: typeof state | null, method = "enhanced", simulationId = 1) {
  let stateIndex = 0;
  const dependencies: Record<string, unknown> = {
    react: { ...React, useEffect: () => {}, useState: (initial: unknown) => {
      const values = [simulationId, runState, null, runState ? 1 : 0,
        runState ? (runState.status === "complete" ? 4 : 2) : null,
        runState?.status === "complete", method];
      return [stateIndex < values.length ? values[stateIndex++] : initial, () => {}];
    } },
    "../../../../packages/shared/src/simulation": contract,
    "../hooks/useSimulationMetadata": { useSimulationMetadata: () => ({ metadata: getSimulationMetadata(), loading: false, error: null, retry: () => {} }) },
    "../hooks/useSimulationCapabilities": { useSimulationCapabilities: () => ({ capabilities: { executionAvailable: true } }) },
    "../config/api": { API_BASE_URL: "http://local.test" }
  };
  const exports: Record<string, any> = {};
  new Function("require", "exports", compiled)((name: string) => name in dependencies ? dependencies[name] : name.endsWith(".css") ? {} : require(name), exports);
  return renderToStaticMarkup(React.createElement(exports.SimulationRunsPage));
}
const completeHtml = renderPage(state);
for (const text of ["0.329681", "0.370638", "1.088558", "Enhancement Evidence", "Cumulative Explained Variance", "NbClust Votes", "Enhanced Cluster Distribution"]) assert.ok(completeHtml.includes(text), text);
assert.ok(!completeHtml.includes("<svg class=\"recharts"));
const existingHtml = renderPage(state, "existing");
assert.ok(existingHtml.includes("695 participants"));
assert.ok(existingHtml.includes("Iterations (range)"));
assert.ok(existingHtml.includes("5\u201315"));
assert.ok(!completeHtml.includes("Scatter"));
assert.ok(completeHtml.includes("<dt>Random runs matching DPC solution</dt><dd>30 / 30</dd>"));
assert.ok(!completeHtml.includes("<table", completeHtml.indexOf("simulation-method-content")));
const readyHtml = renderPage(null);
assert.match(readyHtml, /<button type="button" class="simulation-run-button"/);
assert.ok(!readyHtml.includes("simulation-stepper"));
assert.ok(!readyHtml.includes("Existing vs Enhanced"));
const runningHtml = renderPage({ simulationId: 1, status: "running", result: null, message: null });
assert.match(runningHtml, /disabled="" class="simulation-run-button"/);
assert.ok(runningHtml.includes("Running Algorithms"));
assert.ok(!runningHtml.includes("Existing vs Enhanced"));
assert.match(completeHtml, /Rerun Simulation/);
assert.ok(renderPage({ simulationId: 1, status: "failed", result: null, message: "Simulation analysis failed" }).includes("Simulation analysis failed"));
assert.ok(!renderPage(state, "enhanced", 2).includes("Existing vs Enhanced"), "Stale results must never appear under a different simulation");
console.log("PASS rendered real metrics, both detail sections, evidence, ready/running/failed states, and stale-selection isolation. Browser interaction remains unverified.");

for (const id of [1, 2, 3, 4, 5]) {
  const saved = SimulationRunStateSchema.parse(JSON.parse(fs.readFileSync(path.join(simulationRunRoot, `${id}.json`), "utf8")).state);
  const html = renderPage(saved, "enhanced", id);
  assert.ok(html.includes("Enhancement Evidence"));
  assert.ok(html.includes("Cumulative Explained Variance"));
  assert.ok(html.includes((saved.result!.analysis.enhanced.cumulativeExplainedVariance * 100).toFixed(2) + "%"));
  assert.ok(html.includes("NbClust Votes"));
  assert.ok(!html.includes("Scatter"));
  const baselineHtml = renderPage(saved, "existing", id);
  assert.ok(!baselineHtml.includes("<select"));
  assert.ok(!html.includes("Index votes and availability"));
  assert.ok(!html.includes("Enhanced favorable metrics:"));
  assert.ok(!baselineHtml.includes("Enhanced favorable metrics:"));
  for (const size of saved.result!.analysis.existing.runs[0].clusterSizes) {
    assert.ok(baselineHtml.includes(`${size.toLocaleString("en-US")} participants`));
  }
  const iterations = saved.result!.analysis.existing.runs.map(run => run.iterations);
  const min = Math.min(...iterations), max = Math.max(...iterations);
  assert.ok(baselineHtml.includes(min === max ? String(min) : `${min}–${max}`));
}
console.log("PASS all five simulations retain real distributions, iteration ranges and PCA/vote charts; seed dropdown, favorable count and index details are absent.");
