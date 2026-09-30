import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createSimulationExecutor, compareSimulationMetrics, simulationRunRoot } from "./simulationExecution";
import { getSimulationSample } from "./simulationSample";
import { readCsvRecords } from "./artifactReaders";
import { adjustedRandIndex } from "../../../../packages/shared/src/adjustedRandIndex";

// A fresh seed-202 n=100 run verifies real milestone transport. The user's
// completed n=1020 run is audited read-only instead of repeating NbClust.
for (const [id, n] of [[2, 100], [1, 1020]]) {
  const configuration = { sampleMode: "custom" as const, sampleCount: n, manualK: null };
  const executor = createSimulationExecutor();
  let state = executor.get(id, configuration);
  const stages = new Set<number>();
  if (state.status !== "complete") {
    state = executor.start(id, configuration);
    assert.equal(executor.start(id, configuration).status, "running");
    const deadline = Date.now() + 60 * 60 * 1000;
    while (state.status === "running" && Date.now() < deadline) {
      if (state.stage !== undefined) stages.add(state.stage);
      await new Promise(resolve => setTimeout(resolve, 100));
      state = executor.get(id, configuration);
    }
    assert.equal(state.status, "complete", state.message ?? "Run did not complete");
    assert.ok(stages.has(1) && stages.has(2) && stages.has(3), `Actual milestones: ${[...stages]}`);
  }
  const result = state.result!, a = result.analysis;
  const sample = getSimulationSample(id, configuration);
  assert.equal(result.metadata.sampleFingerprint, sample.fingerprint);
  assert.equal(a.existing.participantCount, n); assert.equal(a.enhanced.participantCount, n);
  const workspace = fs.readdirSync(simulationRunRoot).filter(name => name.startsWith(`simulation-${id}-`)).map(name => path.join(simulationRunRoot, name)).find(dir => {
    try { return JSON.parse(fs.readFileSync(path.join(dir, "public-result.json"), "utf8")).configurationKey === state.configurationKey; } catch { return false; }
  })!;
  assert.ok(workspace);
  const proof = JSON.parse(fs.readFileSync(path.join(workspace, "membership-proof.json"), "utf8"));
  assert.equal(proof.identical, true);
  for (const key of ["selected", "existing", "enhanced"]) assert.equal(proof[key], sample.fingerprint);
  const rows = readCsvRecords(path.join(workspace, "data/interim"), "baseline_kmeans_assignments.csv");
  const labels = Array.from({ length: 30 }, (_, seed) => {
    const selected = rows.filter(row => Number(row.seed) === seed);
    assert.deepEqual(selected.map(row => row.RID), sample.sampleParticipantIds);
    return selected.map(row => Number(row.cluster_label));
  });
  a.existing.ariBySeed!.forEach((row, i) => assert.ok(Math.abs(row.adjustedRandIndex - adjustedRandIndex(labels[0], labels[i])) < 1e-12));
  assert.equal(a.enhanced.pcaVariance.filter(row => row.eigenvalue !== undefined).length, 13);
  assert.equal(a.pcaContribution!.k, a.existing.selectedK);
  assert.ok(a.enhanced.dpc.centers.every(center => center.rid && sample.sampleParticipantIds.includes(center.rid)));
  assert.equal(a.existing.selectedK, a.existing.silhouetteSelectedK);
  const adverse = structuredClone(a);
  adverse.existing.metrics = { silhouette: .5, davies_bouldin: 1, calinski_harabasz: 100 };
  adverse.enhanced.metrics = { silhouette: .2, davies_bouldin: 2, calinski_harabasz: 50 };
  assert.ok(compareSimulationMetrics(adverse).every(row => row.favorableMethod === "existing" && row.relativeImprovementPercent! < 0));
  console.log(`PASS n=${n}: paired membership, all 30 assignments/ARIs, sample PCA/eigenvalues, controlled k, real center RIDs, adverse Enhanced results; milestones=${[...stages].join(",") || "verified saved completion"}`);
  console.log(`PRIVATE_WORKSPACE ${workspace}`);
}
