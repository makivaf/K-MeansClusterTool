import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { adjustedRandIndex } from "../../../../packages/shared/src/adjustedRandIndex";
import { executeSimulation, createSimulationExecutor, simulationRunRoot } from "./simulationExecution";
import { readCsvRecords } from "./artifactReaders";

assert.equal(adjustedRandIndex([0, 0, 1, 1], [8, 8, 4, 4]), 1);
assert.ok(Math.abs(adjustedRandIndex([0, 0, 1, 1], [0, 1, 0, 1]) + 0.5) < 1e-12);
assert.equal(adjustedRandIndex([0, 0, 0], [1, 1, 1]), 1);
assert.throws(() => adjustedRandIndex([0, 1], [0]));
const sampleCount = process.argv.includes("--fresh") ? 101 : 100;
const configuration = { sampleMode: "custom" as const, sampleCount, manualK: null };
const started = performance.now();
const state = process.argv.includes("--fresh") ? await executeSimulation(1, configuration) : createSimulationExecutor().get(1, configuration);
assert.equal(state.status, "complete");
const analysis = state.result!.analysis;
const workspace = fs.readdirSync(simulationRunRoot).filter(name => name.startsWith("simulation-1-")).map(name => path.join(simulationRunRoot, name))
  .find(directory => {
    try { return JSON.parse(fs.readFileSync(path.join(directory, "public-result.json"), "utf8")).configurationKey === state.configurationKey; }
    catch { return false; }
  })!;
const assignments = readCsvRecords(path.join(workspace, "data/interim"), "baseline_kmeans_assignments.csv");
const labels = Array.from({ length: 30 }, (_, seed) => assignments.filter(row => Number(row.seed) === seed).map(row => Number(row.cluster_label)));
analysis.existing.ariBySeed!.forEach((row, seed) => assert.ok(Math.abs(row.adjustedRandIndex - adjustedRandIndex(labels[0], labels[seed])) < 1e-12));
assert.deepEqual(analysis.enhanced.dpc.ariByRun!.map(row => row.adjustedRandIndex), [1, 1, 1]);
const variance = readCsvRecords(path.join(workspace, "data/interim"), "clustering_pca_explained_variance.csv");
analysis.enhanced.pcaVariance.forEach((row, i) => assert.equal(row.eigenvalue, Number(variance[i].explained_variance)));
const contribution = analysis.pcaContribution!;
assert.equal(contribution.k, analysis.existing.selectedK);
assert.deepEqual(contribution.existing, analysis.existing.metrics);
for (const key of ["silhouette", "davies_bouldin", "calinski_harabasz"] as const) {
  assert.equal(contribution.relativeChange[key], contribution.existing[key] === 0 ? null :
    100 * (contribution.enhanced[key] - contribution.existing[key]) / Math.abs(contribution.existing[key]));
}
if (contribution.k === analysis.enhanced.selectedK) {
  const control = JSON.parse(fs.readFileSync(path.join(workspace, "random-control.json"), "utf8"));
  assert.deepEqual(contribution.enhanced, control.randomMean, "Reuse the computed PCA random control, not final DPC metrics");
}
if (sampleCount === 101) {
  const other = createSimulationExecutor().get(1, { ...configuration, sampleCount: 100 });
  assert.notEqual(state.result!.metadata.sampleFingerprint, other.result!.metadata.sampleFingerprint);
  assert.notDeepEqual(analysis.enhanced.pcaVariance, other.result!.analysis.enhanced.pcaVariance);
}
console.log(`PASS n=${sampleCount}: actual-assignment ARI, label permutation, eigenvalues, fixed-k PCA-only controls, signed changes and sample isolation (${((performance.now() - started) / 1000).toFixed(2)}s).`);
