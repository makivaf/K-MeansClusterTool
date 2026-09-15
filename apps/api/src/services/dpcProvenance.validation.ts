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
import { app } from "../app";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const cohort = "data/interim/study_entry_cohort_unimputed.csv";
const variance = "data/interim/clustering_pca_explained_variance.csv";
// Recorded shared inputs from the completed study runs, independent of the SOP artifact.
const run = { provenance: { inputSha256: {
  [cohort]: "eff5f9759f4e56e85408f08bd357cf2a0b67b42073cced73bed1d83e922fb6f3",
  [variance]: "769216258e22de504fc8ca39d1f898f7c4ce1e1d37cd7dd9876dc0571d67f33f"
} } } as unknown as UnifiedResearchRun;
const evaluation = loadSopEvaluation();
assert.ok(evaluation);
assert.ok(hasSharedSopProvenance(run, evaluation));
const stale = structuredClone(evaluation);
stale.provenance.sourceSha256[cohort] = "b9983abfd068c4c00006750c2d08e547bc0c7b2769b60080ae9733b4841c04eb";
assert.equal(hasSharedSopProvenance(run, stale), false, "Original published mismatch must be rejected");
for (const source of [cohort, variance]) {
  const missingRun = structuredClone(run);
  delete missingRun.provenance.inputSha256[source];
  assert.equal(hasSharedSopProvenance(missingRun, evaluation), false);
  const missingEvaluation: SopEvaluation = structuredClone(evaluation);
  delete missingEvaluation.provenance.sourceSha256[source];
  assert.equal(hasSharedSopProvenance(run, missingEvaluation), false);
  const mismatched = structuredClone(run);
  mismatched.provenance.inputSha256[source] = "0".repeat(64);
  assert.equal(hasSharedSopProvenance(mismatched, evaluation), false);
}
const overlap = structuredClone(run);
overlap.provenance.inputSha256["data/interim/clustering_pca_scores.csv"] = "0".repeat(64);
assert.equal(hasSharedSopProvenance(overlap, evaluation), false, "Additional overlapping hashes remain strict");
const history = path.join(root, "data/processed/run-history");
if (fs.existsSync(history)) {
  for (const filename of fs.readdirSync(history).filter((name) => /^[a-f0-9]{64}\.json$/.test(name))) {
    const saved = UnifiedResearchRunSchema.parse(JSON.parse(fs.readFileSync(path.join(history, filename), "utf8")));
    assert.ok(hasSharedSopProvenance(saved, evaluation), `Saved study run ${saved.run_id}`);
  }
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
  assert.ok(hasSharedSopProvenance(run, payload.evaluation));
  assert.deepEqual(payload.evaluation.sop3, sop3);
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
console.log("PASS DPC API/frontend provenance gate, saved runs, seeds 0–29, unchanged displayed metrics, strict missing/mismatch/source-drift rejection and geometry linkage");
