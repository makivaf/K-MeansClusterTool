import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { CalculationEvidenceSchema, type CalculationEvidence } from "../../../../packages/shared/src/calculationEvidence";
import { partitionCalculations } from "./partitionCalculations";
import { loadSopEvaluation } from "./sopEvaluationArtifact";
import { loadDefenseGeometry } from "./defenseGeometryArtifact";
import { loadStudyEvidence } from "./studyEvidenceArtifact";
import { readCsvRecords } from "./artifactReaders";
import { simulationCalculations } from "./calculationEvidence";
import { createSimulationExecutor, executeSimulation, frozenArtifactHashes, simulationRunRoot } from "./simulationExecution";
import { getSimulationSample } from "./simulationSample";
import { loadSimulationCohort } from "./simulationCohort";

// Independent per-participant distances check selection and RID/intermediate alignment.
function checkRepresentative(calculation: CalculationEvidence, matrix: number[][], ids: string[], labels: number[]) {
  const participants = matrix.map((point, i) => {
    const distances = matrix.map(other => Math.sqrt(point.reduce((sum, value, d) => sum + (value - other[d]) ** 2, 0)));
    const own = labels.flatMap((label, j) => label === labels[i] && i !== j ? [distances[j]] : []);
    const a = own.length ? own.reduce((sum, value) => sum + value, 0) / own.length : 0;
    const b = Math.min(...[...new Set(labels)].filter(label => label !== labels[i]).map(label => {
      const group = distances.filter((_, j) => labels[j] === label);
      return group.reduce((sum, value) => sum + value, 0) / group.length;
    }));
    return { rid: ids[i], cluster: labels[i], a, b, s: !own.length || !Math.max(a, b) ? 0 : (b - a) / Math.max(a, b), singleton: !own.length };
  });
  const overall = participants.reduce((sum, row) => sum + row.s, 0) / participants.length;
  assert.equal(calculation.metrics.silhouette, overall, "Original all-participant mean is unchanged");
  const minimum = Math.min(...participants.map(row => Math.abs(row.s - overall)));
  const tied = participants.filter(row => Math.abs(row.s - overall) === minimum);
  const numeric = ids.every(id => id.trim() && Number.isFinite(Number(id)));
  tied.sort((a, b) => (numeric ? Number(a.rid) - Number(b.rid) : 0) || (a.rid < b.rid ? -1 : a.rid > b.rid ? 1 : 0));
  assert.deepEqual(calculation.exampleParticipant, tied[0]);
  assert.ok(CalculationEvidenceSchema.safeParse(calculation).success);
}

// Independent hand-checkable partition: centroids 1 and 11, global centroid 6.
const simple = partitionCalculations([[0], [2], [10], [12]], ["a", "b", "c", "d"], [0, 0, 1, 1], "test", 7);
checkRepresentative(simple, [[0], [2], [10], [12]], ["a", "b", "c", "d"], [0, 0, 1, 1]);
assert.deepEqual(simple.daviesBouldin, { sigma0: 1, sigma1: 1, centroidDistance: 10 });
assert.deepEqual(simple.calinskiHarabasz, { ssb: 100, ssw: 4 });
assert.equal(simple.metrics.davies_bouldin, .2);
assert.equal(simple.metrics.calinski_harabasz, 50);
checkRepresentative(partitionCalculations([[0], [2], [3]], ["a", "b", "c"], [0, 1, 1], "test"), [[0], [2], [3]], ["a", "b", "c"], [0, 1, 1]);
for (const ids of [["20", "10", "2", "30"], ["z", "b", "a", "c"]]) {
  for (const order of [[0, 1, 2, 3], [3, 2, 1, 0]]) {
    const X = order.map(i => [[0], [0], [4], [4]][i]), rids = order.map(i => ids[i]), labels = order.map(i => [0, 0, 1, 1][i]);
    const result = partitionCalculations(X, rids, labels, "tie");
    checkRepresentative(result, X, rids, labels);
    assert.equal(result.exampleParticipant.rid, ids[2], "Numeric or lexical minimum wins exact ties regardless of row order");
  }
}
const uneven = [[0], [1], [4], [10], [12]], unevenIds = ["901", "707", "505", "303", "101"], unevenLabels = [0, 0, 0, 1, 1];
const representative = partitionCalculations(uneven, unevenIds, unevenLabels, "uneven");
checkRepresentative(representative, uneven, unevenIds, unevenLabels);
assert.notEqual(representative.exampleParticipant.rid, unevenIds[0]);
assert.deepEqual(partitionCalculations(uneven, unevenIds.map(id => `renamed-${id}`), unevenLabels, "uneven").metrics, representative.metrics);
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
const pcaRows = readCsvRecords("data/interim", "clustering_pca_scores.csv");
for (const [name, calculation] of Object.entries(study)) {
  const coordinates = name === "standard" ? rows : pcaRows;
  const columns = Object.keys(coordinates[0]).filter(column => name === "standard" ? column !== "RID" && column !== "PTID" : /^PC\d+$/.test(column));
  const file = name === "standard" ? "baseline_kmeans_assignments.csv" : name === "pca" ? "dpc_comparison_random_assignments.csv" : "unified_cluster_assignments.csv";
  const assignments = readCsvRecords("data/interim", file).filter(row => name === "enhanced" || Number(row.seed) === calculation.seed);
  checkRepresentative(calculation, coordinates.map(row => columns.map(column => Number(row[column]))), rows.map(row => row.RID), assignments.map(row => Number(row.cluster_label)));
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
  assert.ok(result.analysis.calculations.standard.exampleParticipant.cluster !== undefined);
  assert.equal(result.analysis.calculations.pca, undefined, "Historical PCA controls must not invent assignments");
  if (sampleCount === 100) {
    // Exercise saved PCA-control and final detail sources with distinct partitions.
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "silhouette-selection-"));
    try {
      const directory = path.join(workspace, "data/interim");
      fs.mkdirSync(directory, { recursive: true });
      const ids = unevenIds, X = uneven, Z = X.map(row => [row[0], 0]);
      const finalLabels = [0, 0, 1, 1, 1];
      const standard = partitionCalculations(X, ids, unevenLabels, "fixture", 0);
      const final = partitionCalculations(Z, ids, finalLabels, "fixture");
      const analysis = structuredClone(result.analysis);
      analysis.projection = { ...analysis.projection!, standardSeed: 0,
        points: ids.map((_, i) => ({ x: Z[i][0], y: Z[i][1], standard: unevenLabels[i], enhanced: finalLabels[i] })) };
      analysis.existing.runs = [{ ...analysis.existing.runs[0], seed: 0, metrics: standard.metrics }];
      analysis.enhanced.metrics = final.metrics;
      analysis.enhanced.retainedVariables = ["feature"];
      analysis.enhanced.pcaComponents = 2;
      analysis.pcaContribution = { ...analysis.pcaContribution!, k: 2 };
      fs.writeFileSync(path.join(workspace, "request.json"), JSON.stringify({ sampleParticipantIds: ids }));
      fs.writeFileSync(path.join(directory, "clustering_features_standardized.csv"), "RID,feature\n" + ids.map((id, i) => `${id},${X[i][0]}`).join("\n"));
      fs.writeFileSync(path.join(directory, "clustering_pca_scores.csv"), "RID,PC1,PC2\n" + ids.map((id, i) => `${id},${Z[i].join(",")}`).join("\n"));
      fs.writeFileSync(path.join(directory, "baseline_kmeans_assignments.csv"), "RID,seed,cluster_label\n" + ids.map((id, i) => `${id},0,${unevenLabels[i]}`).join("\n"));
      fs.writeFileSync(path.join(workspace, "controlled-pca-partition.json"), JSON.stringify({ ids, labels: unevenLabels, seed: 0, k: 2, metrics: standard.metrics }));
      const calculations = simulationCalculations(workspace, analysis)!;
      checkRepresentative(calculations.standard, X, ids, unevenLabels);
      checkRepresentative(calculations.pca!, Z, ids, unevenLabels);
      checkRepresentative(calculations.enhanced, Z, ids, finalLabels);
      assert.deepEqual(simulationCalculations(workspace, analysis), calculations, "Cached readback preserves selection");
    } finally {
      fs.rmSync(workspace, { recursive: true, force: true });
    }
  }
}
if (process.argv.includes("--fresh")) {
  const result = (await executeSimulation(1, { sampleMode: "custom", sampleCount: 103, manualK: null })).result!;
  assert.ok(result.analysis.calculations?.pca, "New analysis must capture its actual PCA-control partition");
  const workspace = fs.readdirSync(simulationRunRoot).map(name => path.join(simulationRunRoot, name)).find(directory => {
    try { return JSON.parse(fs.readFileSync(path.join(directory, "public-result.json"), "utf8")).configurationKey === "custom:103:auto"; } catch { return false; }
  })!;
  const captured = JSON.parse(fs.readFileSync(path.join(workspace, "controlled-pca-partition.json"), "utf8"));
  assert.ok(captured.ids.includes(result.analysis.calculations.pca.exampleParticipant.rid));
  assert.equal(captured.labels.length, captured.ids.length);
  assert.deepEqual(simulationCalculations(workspace, result.analysis), result.analysis.calculations);
  console.log("PASS new-run PCA partition capture, metric validation, representative RID and saved evidence readback.");
}
assert.deepEqual(frozenArtifactHashes(), before, "All frozen study artifacts remain byte-identical");
console.log("PASS real study/cached simulation calculations, representative selection, numeric/lexical ties, independent formulas, singleton/degenerate handling, aggregate separation, full cohort bounds, and unchanged frozen artifacts.");
