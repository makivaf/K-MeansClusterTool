import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import express from "express";
import { SimulationRunStateSchema } from "../../../../packages/shared/src/simulation";
import { compareSimulationMetrics, createSimulationExecutor, frozenArtifactHashes, simulationRunRoot } from "./simulationExecution";
import { getSimulationSample } from "./simulationSample";
import { getSimulationMetadata } from "./simulationMetadata";
import { readCsvRecords } from "./artifactReaders";
import { createSimulationMetadataRouter } from "../routes/simulations";

// This suite inspects the single real run; it NEVER executes another analysis.
const saved = JSON.parse(fs.readFileSync(path.join(simulationRunRoot, "1.json"), "utf8"));
const state = SimulationRunStateSchema.parse(saved.state);
assert.equal(state.status, "complete");
assert.ok(state.result);
const sample = getSimulationSample(1);
assert.equal(sample.sampleParticipantIds.length, 1949);
assert.equal(sample.fingerprint, saved.fingerprint);
const workspace = fs.readdirSync(simulationRunRoot).filter(name => name.startsWith("simulation-1-")).map(name => path.join(simulationRunRoot, name))
  .find(dir => fs.existsSync(path.join(dir, "public-result.json")))!;
assert.ok(workspace, "A successful isolated Simulation 1 run is required");
const request = JSON.parse(fs.readFileSync(path.join(workspace, "request.json"), "utf8"));
assert.deepEqual(request.sampleParticipantIds, sample.sampleParticipantIds);
for (const filename of ["clustering_features_unimputed.csv", "clustering_features_imputed.csv", "clustering_features_standardized.csv", "clustering_pca_scores.csv"]) {
  const ids = readCsvRecords(path.join(workspace, "data/interim"), filename).map(row => row.RID);
  assert.deepEqual(ids, sample.sampleParticipantIds, `${filename} must contain only the exact ordered sample`);
}
const assignments = readCsvRecords(path.join(workspace, "data/interim"), "baseline_kmeans_assignments.csv");
for (let seed = 0; seed < 30; seed++) assert.deepEqual(assignments.filter(row => Number(row.seed) === seed).map(row => row.RID), sample.sampleParticipantIds);
const proof = JSON.parse(fs.readFileSync(path.join(workspace, "membership-proof.json"), "utf8"));
assert.equal(proof.identical, true);
for (const field of ["selected", "existing", "enhanced"]) assert.equal(proof[field], sample.fingerprint);
const before = JSON.parse(fs.readFileSync(path.join(workspace, "frozen-before.json"), "utf8"));
assert.deepEqual(JSON.parse(fs.readFileSync(path.join(workspace, "frozen-after.json"), "utf8")), before);
assert.deepEqual(frozenArtifactHashes(), before);
assert.ok(Object.keys(before).some(key => key.includes("sop_evaluation_summary.json")));

const analysis = structuredClone(state.result.analysis);
analysis.existing.metrics = { silhouette: 1, davies_bouldin: 1, calinski_harabasz: 1 };
analysis.enhanced.metrics = { silhouette: 2, davies_bouldin: 2, calinski_harabasz: 2 };
assert.deepEqual(compareSimulationMetrics(analysis).map(row => row.favorableMethod), ["enhanced", "existing", "enhanced"]);
analysis.enhanced.metrics = { silhouette: 0, davies_bouldin: 0, calinski_harabasz: 0 };
assert.deepEqual(compareSimulationMetrics(analysis).map(row => row.favorableMethod), ["existing", "enhanced", "existing"]);
analysis.enhanced.metrics = { ...analysis.existing.metrics };
assert.ok(compareSimulationMetrics(analysis).every(row => row.favorableMethod === "equal"));
assert.equal(SimulationRunStateSchema.safeParse({ ...state, RID: "private" }).success, false);
const contaminated = structuredClone(state);
Object.assign(contaminated.result!.analysis.enhanced.dpc.centers[0], { RID: "private" });
assert.equal(SimulationRunStateSchema.safeParse(contaminated).success, false);

let calls = 0;
let finish!: (value: typeof state) => void;
const executor = createSimulationExecutor(async () => { calls++; return new Promise(resolve => { finish = resolve; }); }, false);
assert.equal(executor.start(1).status, "running");
assert.equal(executor.start(1).status, "running");
await new Promise(resolve => setImmediate(resolve));
assert.equal(calls, 1);
finish(state);
await new Promise(resolve => setImmediate(resolve));
assert.equal(executor.get(1).status, "complete");
assert.equal(executor.start(1).status, "complete");
assert.equal(calls, 1);
const failed = createSimulationExecutor(async () => { throw new Error("RID private/path"); }, false);
failed.start(1);
await new Promise(resolve => setImmediate(resolve));
assert.equal(failed.get(1).status, "failed");
assert.ok(!JSON.stringify(failed.get(1)).includes("private/path"));

const app = express(); app.use(express.json());
app.use("/api/simulations", createSimulationMetadataRouter(getSimulationMetadata, executor));
const server = app.listen(0, "127.0.0.1");
await once(server, "listening");
try {
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/simulations`;
  for (const method of ["GET", "POST"]) {
    const response = await fetch(`${base}/1/run`, { method });
    assert.equal(response.status, 200);
    const publicState = SimulationRunStateSchema.parse(await response.json());
    assert.deepEqual(publicState, state);
    assert.ok(!/"RID"|"PTID"|sampleParticipantIds|fingerprint|analytical_row_index|private\//.test(JSON.stringify(publicState)));
  }
  assert.equal(calls, 1);
  assert.equal((await fetch(`${base}/1/run`, { method: "POST", headers: { Origin: "https://untrusted.example" } })).status, 403);
  assert.equal((await fetch(`${base}/6/run`, { method: "POST" })).status, 400);
  assert.equal((await fetch(`${base}/1/run`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sampleParticipantIds: ["1"] }) })).status, 400);
  for (const id of [2, 3, 4, 5]) assert.equal(executor.get(id).status, "sample_ready");
} finally { await new Promise<void>(resolve => server.close(() => resolve())); }

await import("./simulationTabs.validation");
