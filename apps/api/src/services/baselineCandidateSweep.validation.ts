import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BaselineCandidateSweepSchema } from "../../../../packages/shared/src/schema";
import { selectBaselineCandidate } from "../../../web/src/utils/baselineCandidate";
import { loadBaselineCandidateSweep, loadSopEvaluation } from "./sopEvaluationArtifact";
import { readCsvRecords } from "./artifactReaders";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const evaluation = loadSopEvaluation();
assert.ok(evaluation);
const sweep = loadBaselineCandidateSweep(evaluation);
assert.ok(sweep);
const rows = readCsvRecords(path.join(root, "data/interim"), "baseline_kmeans_k_selection.csv");
for (const row of rows) {
  const selected = selectBaselineCandidate(sweep, Number(row.k));
  assert.ok(selected);
  assert.equal(selected.silhouette, Number(row.silhouette));
  assert.equal(selected.daviesBouldin, Number(row.davies_bouldin));
  assert.equal(selected.calinskiHarabasz, Number(row.calinski_harabasz));
  assert.deepEqual(selected.clusterSizes, row.cluster_sizes.split("|").map((entry) => Number(entry.split(":")[1])));
}
for (const k of [1, 11, 2.5, NaN]) assert.throws(() => selectBaselineCandidate(sweep, k), RangeError);
assert.equal(selectBaselineCandidate(null, 4), null);
const invalid = structuredClone(sweep);
invalid.candidates[2].clusterSizes[0]++;
assert.equal(BaselineCandidateSweepSchema.safeParse(invalid).success, false);
for (const page of ["OverviewPage.tsx", "ClustersPage.tsx"]) {
  const text = fs.readFileSync(path.join(root, "apps/web/src/pages", page), "utf8");
  assert.ok(text.includes("<BaselineCandidateControl sweep={baselineSweep}"));
  assert.ok(!text.includes("Frozen baseline metrics"));
}
console.log("PASS both manual-k consumers: same candidate lookup, all k=2–10 metrics/counts match source, invalid k rejected, no frozen fallback");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "baseline-source-"));
try {
  for (const source of Object.keys(sweep.sourceSha256)) fs.copyFileSync(path.join(root, source), path.join(temp, path.basename(source)));
  fs.appendFileSync(path.join(temp, "baseline_kmeans_k_selection.csv"), "\n");
  assert.throws(() => loadBaselineCandidateSweep(evaluation, temp), /source drift/);
  console.log("PASS baseline candidate provenance: changed source bytes rejected");
} finally {
  if (path.resolve(temp).startsWith(`${path.resolve(os.tmpdir())}${path.sep}`)) fs.rmSync(temp, { recursive: true, force: true });
}
