import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { StudyEvidenceSchema, type SopEvaluation, type DefenseGeometry } from "../../../../packages/shared/src/schema";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const digest = (bytes: Buffer | string) => crypto.createHash("sha256").update(bytes).digest("hex");
export const canonicalCohortBytes = (bytes: Buffer) => bytes.toString("utf8").replace(
  /All_Subjects_(ADAS|CDR|FAQ|MMSE|NEUROBAT|NPIQ|GDSCALE)_(?:10Aug2026|Aug102026)\.csv/g, "$1.csv"
);

export function loadStudyEvidence(evaluation: SopEvaluation, geometry: DefenseGeometry | null,
  artifactDirectory = path.join(root, "apps/api/artifacts"), sourceDirectory = path.join(root, "data/interim")) {
  const bytes = fs.readFileSync(path.join(artifactDirectory, "study_evidence.json"));
  if (digest(bytes) !== fs.readFileSync(path.join(artifactDirectory, "study_evidence.sha256"), "utf8").trim()) {
    throw new Error("Study evidence checksum mismatch.");
  }
  const evidence = StudyEvidenceSchema.parse(JSON.parse(bytes.toString("utf8")));
  const required = ["study_entry_cohort_unimputed.csv", "clustering_features_imputed.csv", "clustering_features_standardized.csv",
    "clustering_pca_scores.csv", "dpc_comparison_random_assignments.csv", "unified_cluster_assignments.csv"].map(name => `data/interim/${name}`).sort();
  if (Object.keys(evidence.provenance.sourceSha256).sort().join() !== required.join()) throw new Error("Invalid study evidence source set.");
  for (const source of required) {
    const expected = evaluation.provenance.sourceSha256[source] ?? geometry?.provenance.sourceSha256[source];
    if (source !== "data/interim/clustering_features_imputed.csv" && expected !== evidence.provenance.sourceSha256[source]) {
      throw new Error("Study evidence source linkage mismatch.");
    }
  }
  const available = required.filter(source => fs.existsSync(path.join(sourceDirectory, path.posix.basename(source))));
  if (available.length && available.length !== required.length) throw new Error("Incomplete study evidence source set.");
  for (const source of available) {
    const sourceBytes = fs.readFileSync(path.join(sourceDirectory, path.posix.basename(source)));
    if (digest(sourceBytes) !== evidence.provenance.sourceSha256[source]) throw new Error("Study evidence source drift detected.");
    if (source.endsWith("/study_entry_cohort_unimputed.csv") && digest(canonicalCohortBytes(sourceBytes)) !== evidence.provenance.canonicalCohortSha256) {
      throw new Error("Canonical cohort provenance mismatch.");
    }
  }
  return evidence;
}
