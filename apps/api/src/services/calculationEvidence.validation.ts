import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { CalculationEvidenceSchema } from "../../../../packages/shared/src/calculationEvidence";
import { partitionCalculations } from "./partitionCalculations";
import { loadSopEvaluation } from "./sopEvaluationArtifact";
import { loadDefenseGeometry } from "./defenseGeometryArtifact";
import { loadStudyEvidence } from "./studyEvidenceArtifact";
import { readCsvRecords } from "./artifactReaders";
import { simulationCalculations } from "./calculationEvidence";
import { createSimulationExecutor, executeSimulation, frozenArtifactHashes, simulationRunRoot } from "./simulationExecution";
import { getSimulationSample } from "./simulationSample";
import { loadSimulationCohort } from "./simulationCohort";

// Independent hand-checkable partition: centroids 1 and 11, global centroid 6.
const simple = partitionCalculations([[0], [2], [10], [12]], ["a", "b", "c", "d"], [0, 0, 1, 1], "test", 7);
assert.deepEqual(simple.exampleParticipant, { rid: "a", a: 2, b: 11, s: 9 / 11, singleton: false });
assert.deepEqual(simple.daviesBouldin, { sigma0: 1, sigma1: 1, centroidDistance: 10 });
assert.deepEqual(simple.calinskiHarabasz, { ssb: 100, ssw: 4 });
assert.equal(simple.metrics.davies_bouldin, .2);
assert.equal(simple.metrics.calinski_harabasz, 50);
assert.equal(partitionCalculations([[0], [2], [3]], ["a", "b", "c"], [0, 1, 1], "test").exampleParticipant.s, 0);
assert.equal(partitionCalculations([[0], [0], [0]], ["a", "b", "c"], [0, 1, 1], "test").metrics.davies_bouldin, 0);
assert.throws(() => partitionCalculations([[0], [2], [3]], ["a", "a", "c"], [0, 1, 1], "test"));
assert.equal(CalculationEvidenceSchema.safeParse({ ...simple, exampleParticipant: { ...simple.exampleParticipant, s: .9 } }).success, false);
assert.equal(CalculationEvidenceSchema.safeParse({ ...simple, calinskiHarabasz: { ssb: NaN, ssw: 4 } }).success, false);

const before = frozenArtifactHashes();
const evaluation = loadSopEvaluation()!;
const geometry = loadDefenseGeometry(evaluation)!;
const evidence = loadStudyEvidence(evaluation, geometry);
const study = evidence.calculations!;
assert.ok(study.standard && study.enhanced && study.pca);
const rows = readCsvRecords("data/interim", "clustering_features_standardized.csv");
for (const calculation of Object.values(study)) {
  assert.equal(calculation.exampleParticipant.rid, rows[0].RID);
  assert.equal(calculation.n, rows.length);
  assert.ok(CalculationEvidenceSchema.safeParse(calculation).success);
}
assert.equal(study.standard.seed, geometry.sop1.seed);
assert.equal(study.pca.seed, geometry.sop1.seed);
// Aggregate display remains distinct from the actual seed example.
assert.notEqual(study.pca.metrics.silhouette, evaluation.sop1.ablation.conditions[1].metrics.silhouette.mean);
const sample = getSimulationSample(1, { sampleMode: "custom", sampleCount: 2437, manualK: null });
assert.deepEqual(new Set(sample.sampleParticipantIds), new Set(loadSimulationCohort().participants.map(row => row.RID)));
assert.throws(() => getSimulationSample(1, { sampleMode: "custom", sampleCount: 2438, manualK: null }));

const executor = createSimulationExecutor();
for (const sampleCount of [100, 101, 1020, 1166, 2436]) {
  const result = executor.get(1, { sampleMode: "custom", sampleCount, manualK: null }).result!;
  assert.ok(result?.analysis.calculations, `Saved n=${sampleCount} final evidence`);
  assert.equal(result.analysis.calculations.standard.exampleParticipant.rid, getSimulationSample(1, result.metadata.configuration).sampleParticipantIds[0]);
  assert.equal(result.analysis.calculations.pca, undefined, "Historical PCA controls must not invent assignments");
}
if (process.argv.includes("--fresh")) {
  const result = (await executeSimulation(1, { sampleMode: "custom", sampleCount: 103, manualK: null })).result!;
  assert.ok(result.analysis.calculations?.pca, "New analysis must capture its actual PCA-control partition");
  const workspace = fs.readdirSync(simulationRunRoot).map(name => path.join(simulationRunRoot, name)).find(directory => {
    try { return JSON.parse(fs.readFileSync(path.join(directory, "public-result.json"), "utf8")).configurationKey === "custom:103:auto"; } catch { return false; }
  })!;
  const captured = JSON.parse(fs.readFileSync(path.join(workspace, "controlled-pca-partition.json"), "utf8"));
  assert.equal(captured.ids[0], result.analysis.calculations.pca.exampleParticipant.rid);
  assert.equal(captured.labels.length, captured.ids.length);
  assert.deepEqual(simulationCalculations(workspace, result.analysis), result.analysis.calculations);
  console.log("PASS new-run PCA partition capture, metric validation, first-row RID and saved evidence readback.");
}
assert.deepEqual(frozenArtifactHashes(), before, "All frozen study artifacts remain byte-identical");
console.log("PASS real study/cached simulation calculations, independent formulas, singleton/degenerate handling, first input RID, aggregate separation, full cohort bounds, and unchanged frozen artifacts.");
