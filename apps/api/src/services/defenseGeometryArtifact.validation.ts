import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DefenseGeometrySchema, SopEvaluationResponseSchema, type DefenseGeometry } from "../../../../packages/shared/src/schema";
import { loadDefenseGeometry } from "./defenseGeometryArtifact";
import { loadBaselineCandidateSweep, loadSopEvaluation } from "./sopEvaluationArtifact";
import { readCsvRecords } from "./artifactReaders";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const interim = path.join(root, "data/interim");
const artifacts = path.join(root, "apps/api/artifacts");
const evaluation = loadSopEvaluation();
assert.ok(evaluation);
const geometry = loadDefenseGeometry(evaluation);
assert.ok(geometry);
const response = SopEvaluationResponseSchema.parse({ evaluation, baselineSweep: loadBaselineCandidateSweep(evaluation), defenseGeometry: geometry });
assert.ok(response.defenseGeometry);
const scores = readCsvRecords(interim, "clustering_pca_scores.csv");
const identity = (row: Record<string, string>) => `${row.PTID}|${row.RID}`;
assert.equal(scores.length, 2437);
assert.equal(new Set(scores.map(identity)).size, 2437);
const baseline = readCsvRecords(interim, "baseline_kmeans_assignments.csv");
const random = readCsvRecords(interim, "dpc_comparison_random_assignments.csv");
const dpc = readCsvRecords(interim, "unified_cluster_assignments.csv");
const cases = [
  { panel: geometry.sop1.baseline, rows: baseline.filter((row) => row.run_number === "1") },
  { panel: geometry.sop1.pcaOnly, rows: random.filter((row) => row.run_number === "1") },
  ...geometry.sop3.random.map((panel) => ({ panel, rows: random.filter((row) => Number(row.run_number) === panel.runNumber) })),
  ...geometry.sop3.dpc.map((panel) => ({ panel, rows: dpc }))
];
for (const { panel, rows } of cases) {
  const assignments = new Map(rows.map((row) => [identity(row), Number(row.cluster_label)]));
  assert.equal(assignments.size, 2437);
  assert.equal(panel.observations.length, 2437);
  panel.observations.forEach((point, i) => {
    assert.deepEqual(Object.keys(point).sort(), ["cluster", "pc1", "pc2"]);
    assert.equal(point.pc1, Number(scores[i].PC1));
    assert.equal(point.pc2, Number(scores[i].PC2));
    assert.equal(point.cluster, assignments.get(identity(scores[i])));
  });
  for (const marker of panel.markers) {
    assert.deepEqual(Object.keys(marker).sort(), ["cluster", "pc1", "pc2", "type"]);
    if (marker.type === "initial") assert.ok(scores.some((point) => Math.abs(Number(point.PC1) - marker.pc1) < 1e-12 && Math.abs(Number(point.PC2) - marker.pc2) < 1e-12));
  }
}
console.log("PASS eight complete panels: 2,437 points each, identical source projection, exact saved assignments, strict public field allowlists, initial markers match real observations");

const invalid: Array<(copy: any) => void> = [
  (copy) => copy.sop1.baseline.observations.pop(),
  (copy) => copy.sop1.pcaOnly.observations[0].pc1 += 0.1,
  (copy) => copy.sop1.baseline.markers[0].pc1 += 0.1,
  (copy) => copy.sop3.random[1].seed = 0,
  (copy) => copy.sop3.random[0].markers.pop(),
  (copy) => copy.sop3.dpc[1].origin = "saved_reference",
  (copy) => copy.sop3.dpc[1].markers[0].pc1 += 0.1,
  ...["RID", "PTID", "participantId", "row", "index", "diagnosis", "age", "sex", "cognitiveScore"].flatMap((field) => [
    (copy: any) => { copy.sop1.baseline.observations[0][field] = "forbidden"; },
    (copy: any) => { copy.sop3.random[0].markers[0][field] = "forbidden"; }
  ])
];
for (const mutate of invalid) {
  const copy: DefenseGeometry = structuredClone(geometry); mutate(copy);
  assert.equal(DefenseGeometrySchema.safeParse(copy).success, false);
}
const mismatched = structuredClone(response);
mismatched.defenseGeometry!.provenance.sourceSha256["data/interim/clustering_pca_scores.csv"] = "0".repeat(64);
assert.equal(SopEvaluationResponseSchema.safeParse(mismatched).success, false);
console.log("PASS geometry corruption, source mismatch, false historical origin, and forbidden observation/marker fields rejected");

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "defense-geometry-validation-"));
try {
  const emptySources = path.join(temporary, "sources"); fs.mkdirSync(emptySources);
  assert.ok(loadDefenseGeometry(evaluation, artifacts, emptySources), "Packaged geometry works without local private sources");
  fs.writeFileSync(path.join(emptySources, "clustering_pca_scores.csv"), "partial");
  assert.throws(() => loadDefenseGeometry(evaluation, artifacts, emptySources), /Incomplete/);
  for (const source of Object.keys(geometry.provenance.sourceSha256)) fs.copyFileSync(path.join(root, source), path.join(emptySources, path.basename(source)));
  fs.appendFileSync(path.join(emptySources, "clustering_pca_scores.csv"), "\n");
  assert.throws(() => loadDefenseGeometry(evaluation, artifacts, emptySources), /source drift/);
  for (const file of ["defense_geometry.json", "defense_geometry.sha256", "sop_evaluation_summary.json"]) fs.copyFileSync(path.join(artifacts, file), path.join(temporary, file));
  fs.appendFileSync(path.join(temporary, "defense_geometry.json"), "\n");
  assert.throws(() => loadDefenseGeometry(evaluation, temporary, interim), /checksum/);
} finally {
  assert.ok(path.resolve(temporary).startsWith(path.resolve(os.tmpdir()) + path.sep));
  fs.rmSync(temporary, { recursive: true, force: true });
}
console.log("PASS checksum protection, source-drift/incomplete-source rejection, and packaged-only loading");
