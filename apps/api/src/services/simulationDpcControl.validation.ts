// Uses the completed Simulation 1 evaluation; never runs a new control fit.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import express from "express";
import { DpcControlEvaluationSchema, evaluateSimulationDpcControl } from "./simulationDpcControl";
import { createSimulationExecutor, frozenArtifactHashes, simulationRunRoot } from "./simulationExecution";
import { SimulationRunStateSchema, SimulationDpcControlSchema } from "../../../../packages/shared/src/simulation";
import { matchesDpcSolution } from "../../../../packages/shared/src/dpcMatching";
import { countDpcMatches } from "../../../web/src/utils/studyFindings";
import { loadSopEvaluation } from "./sopEvaluationArtifact";
import { getSimulationMetadata } from "./simulationMetadata";
import { createSimulationMetadataRouter } from "../routes/simulations";
import { getSimulationSample } from "./simulationSample";
import { readCsvRecords } from "./artifactReaders";
import { sha256 } from "./simulationCohort";

const read = (file: string) => JSON.parse(fs.readFileSync(file, "utf8"));
const cachePath = path.join(simulationRunRoot, "1.json");
const state = SimulationRunStateSchema.parse(read(cachePath).state);
assert.ok(state.result?.analysis.enhanced.dpc.randomControl, "Evaluate Simulation 1 explicitly before this test");
const summary = state.result.analysis.enhanced.dpc.randomControl;
const workspace = fs.readdirSync(simulationRunRoot).filter(name => name.startsWith("simulation-1-"))
  .map(name => path.join(simulationRunRoot, name)).find(dir => fs.existsSync(path.join(dir, "dpc-control-provenance.json")))!;
const proof = read(path.join(workspace, "dpc-control-provenance.json"));
const original = read(path.join(workspace, "result.json"));
const extended = structuredClone(state.result.analysis);
delete extended.enhanced.dpc.randomControl;
assert.deepEqual(extended, original, "DPC, baseline and all original analysis fields stay identical");
assert.deepEqual(proof.seeds, Array.from({ length: 30 }, (_, i) => i));
assert.equal(proof.participantCount, 1949);
assert.equal(proof.selectedK, original.enhanced.selectedK);
assert.equal(proof.pcaComponents, original.enhanced.pcaComponents);
assert.equal(proof.binding.analysisSha256, sha256(fs.readFileSync(path.join(workspace, "result.json"))));
assert.equal(proof.binding.pcaSha256, sha256(fs.readFileSync(path.join(workspace, "data/interim/clustering_pca_scores.csv"))));
assert.deepEqual(readCsvRecords(path.join(workspace, "data/interim"), "clustering_pca_scores.csv").map(row => row.RID), getSimulationSample(1).sampleParticipantIds);
assert.notDeepEqual(summary.randomMean, original.existing.metrics, "Original-space baseline means are not controls");
assert.deepEqual(proof.settings, { nInit: 1, maxIter: 300, tolerance: 1e-4, algorithm: "lloyd" });

assert.equal(matchesDpcSolution([0, 1, 2], [900, 1049], [0, 1, 2], [1049, 900]), true);
assert.equal(matchesDpcSolution([1e-10], [900, 1049], [0], [1049, 900]), true);
assert.equal(matchesDpcSolution([1.01e-10], [900, 1049], [0], [1049, 900]), false);
assert.equal(matchesDpcSolution([0], [901, 1048], [0], [1049, 900]), false);
const sop3 = loadSopEvaluation()!.sop3;
assert.ok(sop3.randomRuns);
const metricKeys = ["silhouette", "daviesBouldin", "calinskiHarabasz"] as const;
const oldMatches = sop3.randomRuns.filter(run => metricKeys.every(key => Math.abs(run[key] - sop3.dpcDeterminism.metrics[key]) <= 1e-10) &&
  [...run.clusterSizes].sort((a, b) => a - b).every((size, index) => size === [...sop3.dpcDeterminism.clusterSizes].sort((a, b) => a - b)[index])).length;
assert.equal(countDpcMatches(sop3), oldMatches, "Shared match helper preserves Study Findings output");

// Contract rejects missing/duplicate seeds, wrong membership size, and leaked IDs.
const evaluation = { sampleFingerprint: proof.binding.sampleFingerprint, participantCount: 1949,
  pcaComponents: proof.pcaComponents, selectedK: proof.selectedK, settings: proof.settings,
  randomMean: summary.randomMean, randomSd: summary.randomSd,
  runs: proof.seeds.map((seed: number) => ({ seed, clusterSizes: original.enhanced.clusterSizes, metrics: original.enhanced.metrics })) };
assert.ok(DpcControlEvaluationSchema.safeParse(evaluation).success);
assert.equal(DpcControlEvaluationSchema.safeParse({ ...evaluation, runs: evaluation.runs.slice(1) }).success, false);
assert.equal(DpcControlEvaluationSchema.safeParse({ ...evaluation, runs: evaluation.runs.map((run: object) => ({ ...run, seed: 0 })) }).success, false);
assert.equal(DpcControlEvaluationSchema.safeParse({ ...evaluation, participantCount: 2437 }).success, false);
assert.equal(SimulationDpcControlSchema.safeParse({ ...summary, RID: "private" }).success, false);
assert.equal(SimulationDpcControlSchema.safeParse({ ...summary, matchingRuns: 31 }).success, false);

const before = frozenArtifactHashes();
const cacheBefore = fs.readFileSync(cachePath);
assert.deepEqual(await evaluateSimulationDpcControl(1), { cached: true, summary });
assert.deepEqual(fs.readFileSync(cachePath), cacheBefore, "Cache hit never rewrites results");
assert.deepEqual(frozenArtifactHashes(), before);
const executor = createSimulationExecutor(async () => { throw new Error("Tests must not execute analysis"); });
const app = express();
app.use("/api/simulations", createSimulationMetadataRouter(getSimulationMetadata, executor));
const server = app.listen(0, "127.0.0.1");
await once(server, "listening");
try {
  for (const id of [1, 2, 3, 4, 5]) {
    const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/simulations/${id}/run`);
    assert.equal(response.status, 200);
    const body = await response.json();
    const parsed = SimulationRunStateSchema.parse(body);
    assert.equal(parsed.simulationId, id);
    assert.doesNotMatch(JSON.stringify(body), /"RID"|"PTID"|sampleParticipantIds|sampleFingerprint|private\//);
    if (id === 1) assert.deepEqual(parsed.result!.analysis.enhanced.dpc.randomControl, summary);
    else assert.equal(parsed.result!.analysis.enhanced.dpc.randomControl, undefined, "Simulations 2–5 have not been evaluated");
  }
} finally { await new Promise<void>(resolve => server.close(() => resolve())); }
console.log("PASS Simulation 1 cached controls, seeds 0–29, saved PCA membership/k/settings, unchanged DPC/baseline, canonical match parity, strict contracts, aggregate-only API, and Simulations 2–5 untouched.");
