import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { SopEvaluationResponseSchema, UnifiedResearchRunSchema, type SopEvaluation, type UnifiedResearchRun } from "../../../../packages/shared/src/schema";
import { hasSharedSopProvenance } from "../../../web/src/utils/sopProvenance";
import { loadSopEvaluation } from "./sopEvaluationArtifact";
import { loadDefenseGeometry } from "./defenseGeometryArtifact";
import { loadStudyEvidence, canonicalCohortBytes } from "./studyEvidenceArtifact";
import { readCsvRecords } from "./artifactReaders";
import crypto from "node:crypto";
import { app } from "../app";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const cohort = "data/interim/study_entry_cohort_unimputed.csv";
const variance = "data/interim/clustering_pca_explained_variance.csv";
// Original frozen cohort input; runtime filenames have a verified canonical alias.
// Keep this independent of the packaged SOP artifact to catch provenance drift.
const run = { provenance: { inputSha256: {
  [cohort]: "b9983abfd068c4c00006750c2d08e547bc0c7b2769b60080ae9733b4841c04eb",
  [variance]: "769216258e22de504fc8ca39d1f898f7c4ce1e1d37cd7dd9876dc0571d67f33f"
} } } as unknown as UnifiedResearchRun;
const evaluation = loadSopEvaluation();
assert.ok(evaluation);
const evidence = loadStudyEvidence(evaluation, loadDefenseGeometry(evaluation));
assert.ok(hasSharedSopProvenance(run, evaluation, evidence));
const stale = structuredClone(evaluation);
stale.provenance.sourceSha256[cohort] = "eff5f9759f4e56e85408f08bd357cf2a0b67b42073cced73bed1d83e922fb6f3";
assert.equal(hasSharedSopProvenance(run, stale, evidence), false, "Mismatched recovery cohort must be rejected");
for (const source of [cohort, variance]) {
  const missingRun = structuredClone(run);
  delete missingRun.provenance.inputSha256[source];
  assert.equal(hasSharedSopProvenance(missingRun, evaluation, evidence), false);
  const missingEvaluation: SopEvaluation = structuredClone(evaluation);
  delete missingEvaluation.provenance.sourceSha256[source];
  assert.equal(hasSharedSopProvenance(run, missingEvaluation, evidence), false);
  const mismatched = structuredClone(run);
  mismatched.provenance.inputSha256[source] = "0".repeat(64);
  assert.equal(hasSharedSopProvenance(mismatched, evaluation, evidence), false);
}
const overlap = structuredClone(run);
overlap.provenance.inputSha256["data/interim/clustering_pca_scores.csv"] = "0".repeat(64);
assert.equal(hasSharedSopProvenance(overlap, evaluation, evidence), false, "Additional overlapping hashes remain strict");
const history = path.join(root, "data/processed/run-history");
if (fs.existsSync(history)) {
  for (const filename of fs.readdirSync(history).filter((name) => /^[a-f0-9]{64}\.json$/.test(name))) {
    const saved = UnifiedResearchRunSchema.parse(JSON.parse(fs.readFileSync(path.join(history, filename), "utf8")));
    assert.ok(hasSharedSopProvenance(saved, evaluation, evidence), `Saved study run ${saved.run_id}`);
    assert.deepEqual(evidence.correlation.features, saved.preprocessing.retainedFeatures);
  }
}
const normalized = structuredClone(run);
normalized.provenance.inputSha256[cohort] = evidence.provenance.canonicalCohortSha256;
assert.equal(hasSharedSopProvenance(normalized, evaluation), false, "Canonical alias requires verified evidence");
assert.ok(hasSharedSopProvenance(normalized, evaluation, evidence));
const digest = (bytes: string | Buffer) => crypto.createHash("sha256").update(bytes).digest("hex");
assert.equal(digest(canonicalCohortBytes(fs.readFileSync(path.join(root, cohort)))), normalized.provenance.inputSha256[cohort]);
assert.equal(evidence.correlation.features.length, 13);
assert.equal(evidence.ariBySeed.filter(row => row.adjustedRandIndex === 1).length, 21);
assert.deepEqual(evidence.ariBySeed.map(row => row.seed), Array.from({ length: 30 }, (_, i) => i));
// If the original aggregate exports are present, check the packaged values exactly.
const exportsDirectory = path.join(root, "analysis/chapter1_evidence/outputs");
for (const [name, key] of [["sop1_correlation_matrix.csv", "correlation"], ["sop3_ari_by_seed.csv", "ariBySeed"]] as const) {
  const file = path.join(exportsDirectory, name);
  if (!fs.existsSync(file)) continue;
  assert.equal(digest(fs.readFileSync(file)), evidence.provenance.aggregateCsvSha256[key]);
  const rows = readCsvRecords(exportsDirectory, name);
  if (key === "correlation") assert.deepEqual(rows.map(row => evidence.correlation.features.map(feature => Number(row[feature]))), evidence.correlation.matrix);
  else assert.deepEqual(rows.map(row => ({ seed: Number(row.seed), adjustedRandIndex: Number(row.adjusted_rand_index) })), evidence.ariBySeed);
}
const sop3 = evaluation.sop3;
assert.deepEqual(sop3.settings.randomSeeds, Array.from({ length: 30 }, (_, i) => i));
assert.deepEqual(sop3.randomRuns?.map(({ seed }) => seed), sop3.settings.randomSeeds);
assert.deepEqual(sop3.controlledComparison?.metrics, sop3.dpcDeterminism.metrics);
assert.deepEqual(Object.fromEntries(Object.entries(sop3.dpcDeterminism.metrics).map(([k, v]) => [k, v.toFixed(6)])), {
  silhouette: "0.372700", daviesBouldin: "1.075885", calinskiHarabasz: "1800.024958"
});
for (const [metric, expected] of Object.entries({ silhouette: "0.372770", davies_bouldin: "1.075644", calinski_harabasz: "1800.016609" })) {
  assert.equal(sop3.randomRunSummary[metric as keyof typeof sop3.randomRunSummary].mean.toFixed(6), expected);
}
assert.ok(loadDefenseGeometry(evaluation), "Dependent checksum and source linkage remain valid");
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "dpc-provenance-"));
try {
  const packaged = path.join(root, "apps/api/artifacts");
  const evidencePath = path.join(temporary, "study_evidence.json");
  fs.copyFileSync(path.join(packaged, "study_evidence.json"), evidencePath);
  fs.copyFileSync(path.join(packaged, "study_evidence.sha256"), path.join(temporary, "study_evidence.sha256"));
  assert.deepEqual(loadStudyEvidence(evaluation, loadDefenseGeometry(evaluation), temporary, temporary),
    { ...evidence, dpcCenters: undefined, calculations: undefined }, "Packaged evidence must not invent RIDs when the private center source is absent");
  fs.appendFileSync(evidencePath, " ");
  assert.throws(() => loadStudyEvidence(evaluation, loadDefenseGeometry(evaluation), temporary), /checksum/);
  const altered = structuredClone(evidence);
  altered.provenance.canonicalCohortSha256 = "0".repeat(64);
  fs.writeFileSync(evidencePath, JSON.stringify(altered));
  fs.writeFileSync(path.join(temporary, "study_evidence.sha256"), digest(fs.readFileSync(evidencePath)));
  assert.throws(() => loadStudyEvidence(evaluation, loadDefenseGeometry(evaluation), temporary), /Canonical cohort/);
  fs.writeFileSync(path.join(temporary, path.basename(cohort)), "drift");
  assert.throws(() => loadSopEvaluation({ sourceArtifactDirectory: temporary }), /incomplete/);
  for (const source of Object.keys(evaluation.provenance.sourceSha256)) {
    fs.writeFileSync(path.join(temporary, path.basename(source)), "drift");
  }
  assert.throws(() => loadSopEvaluation({ sourceArtifactDirectory: temporary }), /source drift/);
} finally {
  assert.ok(path.resolve(temporary).startsWith(path.resolve(os.tmpdir()) + path.sep));
  fs.rmSync(temporary, { recursive: true, force: true });
}
const server = app.listen(0, "127.0.0.1");
try {
  await once(server, "listening");
  const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/sop-evaluation`);
  assert.equal(response.status, 200);
  const payload = SopEvaluationResponseSchema.parse(await response.json());
  assert.ok(hasSharedSopProvenance(run, payload.evaluation, payload.studyEvidence));
  assert.deepEqual(payload.evaluation.sop3, sop3);
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
console.log("PASS DPC API/frontend provenance gate, saved runs, seeds 0–29, unchanged displayed metrics, strict missing/mismatch/source-drift rejection and geometry linkage");
