import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import express from "express";
import { SimulationConfigurationSchema, SimulationRunStateSchema, simulationConfigurationKey } from "../../../../packages/shared/src/simulation";
import { compareSimulationMetrics, createSimulationExecutor, executeSimulation, frozenArtifactHashes, simulationRunRoot } from "./simulationExecution";
import { getSimulationSample } from "./simulationSample";
import { getSimulationMetadata } from "./simulationMetadata";
import { readCsvRecords } from "./artifactReaders";
import { createSimulationMetadataRouter } from "../routes/simulations";

const configuration = { sampleMode: "custom" as const, sampleCount: 100, manualK: 3 };
for (const invalid of [{ ...configuration, sampleCount: 99 }, { ...configuration, sampleCount: 2438 },
  { ...configuration, manualK: 11 }, { ...configuration, manualK: 1.5 }, { ...configuration, sampleMode: "full" },
  { ...configuration, sampleParticipantIds: ["1"] }]) assert.equal(SimulationConfigurationSchema.safeParse(invalid).success, false);
const automatic = SimulationConfigurationSchema.parse({ sampleMode: "custom", sampleCount: 100 });
assert.equal(automatic.manualK, null);
assert.equal(simulationConfigurationKey(automatic), "custom:100:auto");
assert.notEqual(simulationConfigurationKey(automatic), simulationConfigurationKey(configuration));
assert.deepEqual(getSimulationSample(1, automatic).sampleParticipantIds, getSimulationSample(1, configuration).sampleParticipantIds);
const before = frozenArtifactHashes();
// Explicit opt-in only: one small real analysis; normal validation reads its cache.
const state = process.argv.includes("--execute") ? await executeSimulation(1, configuration) : createSimulationExecutor().get(1, configuration);
assert.equal(state.status, "complete", "Run once with --execute to create the real n=100, manual k=3 validation result");
assert.ok(state.result);
assert.deepEqual(frozenArtifactHashes(), before, "Frozen thesis artifacts must remain byte-identical");
const sample = getSimulationSample(1, configuration);
// Reproduce a pending in-memory attempt whose worker has persisted success.
// Only move the cache briefly; never run or modify the analytical result.
const cacheFile = fs.readdirSync(simulationRunRoot).map(name => path.join(simulationRunRoot, name)).find(file =>
  path.basename(file).startsWith("runtime-v2-1-") && file.endsWith(".json") &&
  JSON.parse(fs.readFileSync(file, "utf8")).state.configurationKey === state.configurationKey)!;
assert.ok(cacheFile);
const heldCache = `${cacheFile}.validation`;
assert.ok(!fs.existsSync(heldCache));
assert.equal(path.dirname(path.resolve(heldCache)), path.resolve(simulationRunRoot));
const recovering = createSimulationExecutor(() => new Promise(() => {}));
fs.renameSync(cacheFile, heldCache);
try {
  assert.equal(recovering.start(1, configuration).status, "running");
  assert.equal(recovering.get(1, configuration).status, "running");
} finally { fs.renameSync(heldCache, cacheFile); }
assert.deepEqual(recovering.get(1, configuration), state, "Verified completion must supersede stale running state");
assert.equal(sample.sampleParticipantCount, 100);
assert.equal(state.result.metadata.sampleFingerprint, sample.fingerprint);
assert.equal(state.result.analysis.existing.selectedK, 3);
const analysis = state.result.analysis;
assert.equal(analysis.enhanced.nbclust.votes.reduce((winner, row) => row.count > winner.count || (row.count === winner.count && row.k < winner.k) ? row : winner).k, analysis.enhanced.selectedK);
assert.equal(analysis.projection!.points.length, 100);
assert.equal(analysis.enhanced.dpc.decisionGraph!.filter(row => row.selected).length, analysis.enhanced.selectedK);
assert.ok(analysis.existing.runs.every(run => run.clusterSizes.reduce((a, b) => a + b, 0) === 100));
assert.equal(analysis.enhanced.clusterSizes.reduce((a, b) => a + b, 0), 100);
assert.ok(state.result.comparison.every(row => Number.isFinite(row.existing) && Number.isFinite(row.enhanced)));
const workspace = fs.readdirSync(simulationRunRoot).filter(name => name.startsWith("simulation-1-")).map(name => path.join(simulationRunRoot, name))
  .find(dir => fs.existsSync(path.join(dir, "public-result.json")) && JSON.parse(fs.readFileSync(path.join(dir, "public-result.json"), "utf8")).configurationKey === state.configurationKey)!;
assert.ok(workspace);
for (const filename of ["clustering_features_unimputed.csv", "clustering_features_imputed.csv", "clustering_features_standardized.csv", "clustering_pca_scores.csv"]) {
  assert.deepEqual(readCsvRecords(path.join(workspace, "data/interim"), filename).map(row => row.RID), sample.sampleParticipantIds);
}
const proof = JSON.parse(fs.readFileSync(path.join(workspace, "membership-proof.json"), "utf8"));
assert.equal(proof.identical, true);
for (const key of ["selected", "existing", "enhanced"]) assert.equal(proof[key], sample.fingerprint);
const assignments = readCsvRecords(path.join(workspace, "data/interim"), "baseline_kmeans_assignments.csv");
const seed0 = assignments.filter(row => Number(row.seed) === 0);
assert.equal(seed0.length, 100);
const pca = readCsvRecords(path.join(workspace, "data/interim"), "clustering_pca_scores.csv");
analysis.projection!.points.forEach((point, i) => {
  assert.ok(Math.abs(point.x - Number(pca[i].PC1)) < 1e-10);
  assert.ok(Math.abs(point.y - Number(pca[i].PC2)) < 1e-10);
});
const modified = structuredClone(analysis);
modified.existing.metrics = { silhouette: -1, davies_bouldin: 2, calinski_harabasz: 2 };
modified.enhanced.metrics = { silhouette: 1, davies_bouldin: 1, calinski_harabasz: 3 };
assert.deepEqual(compareSimulationMetrics(modified).map(row => row.relativeImprovementPercent), [200, 50, 50]);
modified.existing.metrics.silhouette = 0;
assert.equal(compareSimulationMetrics(modified)[0].relativeImprovementPercent, null);
assert.equal(SimulationRunStateSchema.safeParse({ ...state, configurationKey: "wrong" }).success, false);
const contaminated = structuredClone(state);
contaminated.result!.analysis.projection!.points.pop();
assert.equal(SimulationRunStateSchema.safeParse(contaminated).success, false);
let calls = 0;
const executor = createSimulationExecutor(async () => { calls++; return state; }, false);
assert.equal(executor.start(1, configuration).status, "running");
assert.equal(executor.start(1, configuration).status, "running");
await new Promise(resolve => setImmediate(resolve));
assert.equal(calls, 1);
assert.equal(executor.get(1, configuration).status, "complete");
assert.equal(executor.get(1, automatic).status, "sample_ready");
assert.equal(executor.get(1, { ...configuration, manualK: 2 }).status, "sample_ready");
assert.equal(executor.get(1, { ...configuration, sampleCount: 101 }).status, "sample_ready");
assert.equal(executor.get(1, { sampleMode: "full", sampleCount: 2437, manualK: 3 }).status, "sample_ready");
assert.equal(executor.start(1, configuration).status, "complete");
assert.equal(calls, 1);
const failed = createSimulationExecutor(async () => { throw new Error("private/path"); }, false);
failed.start(1, configuration); await new Promise(resolve => setImmediate(resolve));
assert.equal(failed.get(1, configuration).status, "failed");
assert.ok(!JSON.stringify(failed.get(1, configuration)).includes("private/path"));
const app = express(); app.use(express.json()); app.use("/api/simulations", createSimulationMetadataRouter(getSimulationMetadata, executor));
const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
try {
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/simulations/1/run`;
  const query = new URLSearchParams({ sampleMode: "custom", sampleCount: "100", manualK: "3" });
  for (const method of ["GET", "POST"]) {
    const response = await fetch(base + (method === "GET" ? `?${query}` : ""), { method,
      ...(method === "POST" ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(configuration) } : {}) });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(SimulationRunStateSchema.parse(await response.json()), state);
  }
  const automaticResponse = await fetch(base + "?sampleMode=custom&sampleCount=100");
  assert.equal(automaticResponse.status, 200);
  assert.equal((await automaticResponse.json()).configurationKey, "custom:100:auto");
  assert.equal((await fetch(base + "?sampleMode=custom&sampleCount=100&manualK=bad")).status, 400);
  assert.equal((await fetch(base + "?sampleMode=custom&sampleCount=99&manualK=2")).status, 400);
  assert.equal((await fetch(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...configuration, manualK: 11 }) })).status, 400);
  assert.equal((await fetch(base, { method: "POST", headers: { Origin: "https://untrusted.example" } })).status, 403);
} finally { await new Promise<void>(resolve => server.close(() => resolve())); }
assert.equal(state.configurationKey, simulationConfigurationKey(configuration));
console.log("PASS real runtime outputs, same membership, projection coordinates, manual k, automatic NbClust, finite metrics, relative changes, cache isolation, HTTP configuration validation and frozen artifact integrity.");
