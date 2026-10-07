import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { StudyEvidenceSchema, type SopEvaluation, type DefenseGeometry } from "../../../../packages/shared/src/schema";
import { adjustedRandIndex } from "../../../../packages/shared/src/adjustedRandIndex";
import { readCsvRecords } from "./artifactReaders";
import { studyCalculations } from "./calculationEvidence";

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
  // Geometry has already passed checksum, source linkage and aligned-row checks.
  const standardSource = "data/interim/baseline_kmeans_assignments.csv" as const;
  const standardFile = path.join(sourceDirectory, path.posix.basename(standardSource));
  let standardAriBySeed;
  let standardAri;
  if (fs.existsSync(standardFile)) {
    const sourceSha256 = digest(fs.readFileSync(standardFile));
    const expected = evaluation.provenance.sourceSha256[standardSource] ?? geometry?.provenance.sourceSha256[standardSource];
    if (!expected || sourceSha256 !== expected || (geometry?.provenance.sourceSha256[standardSource] &&
      geometry.provenance.sourceSha256[standardSource] !== sourceSha256)) throw new Error("Standard ARI source linkage mismatch.");
    const participants = readCsvRecords(sourceDirectory, "clustering_features_standardized.csv").map(row => row.RID);
    if (participants.length !== evidence.cohortN || new Set(participants).size !== participants.length ||
      participants.some(rid => !rid)) throw new Error("Invalid Standard ARI cohort.");
    const assignments = readCsvRecords(sourceDirectory, path.posix.basename(standardSource));
    const partitions = Array.from({ length: 30 }, () => new Map<string, number>());
    for (const row of assignments) {
      const seed = Number(row.seed), label = Number(row.cluster_label);
      if (!/^\d+$/.test(row.seed) || !Number.isInteger(seed) || seed < 0 || seed >= partitions.length ||
        !/^\d+$/.test(row.cluster_label) || !Number.isInteger(label) ||
        partitions[seed].has(row.RID)) throw new Error("Invalid Standard ARI assignment.");
      partitions[seed].set(row.RID, label);
    }
    const labels = partitions.map(partition => {
      if (partition.size !== participants.length || participants.some(rid => !partition.has(rid))) {
        throw new Error("Standard ARI participant membership mismatch.");
      }
      return participants.map(rid => partition.get(rid)!);
    });
    standardAriBySeed = labels.map((partition, seed) => ({ seed, adjustedRandIndex: adjustedRandIndex(labels[0], partition) }));
    standardAri = { source: standardSource, sourceSha256, referenceSeed: 0 as const };
  }
  // Derive ARI from the actual saved/reconstructed partitions, never a flag.
  const reference = geometry?.sop3.dpc[0].observations.map(point => point.cluster);
  const centersFile = "clustering_dpc_selected_centroids.csv";
  let dpcCenters;
  if (geometry && fs.existsSync(path.join(sourceDirectory, centersFile))) {
    if (digest(fs.readFileSync(path.join(sourceDirectory, centersFile))) !== geometry.provenance.sourceSha256[`data/interim/${centersFile}`]) throw new Error("DPC center source drift detected.");
    dpcCenters = readCsvRecords(sourceDirectory, centersFile).map(row => ({ center: Number(row.centroid_order), rid: row.RID,
      rho: Number(row.rho), delta: Number(row.delta), gamma: Number(row.gamma) }));
  }
  return StudyEvidenceSchema.parse({ ...evidence, standardAriBySeed,
    provenance: { ...evidence.provenance, standardAri,
      sourceSha256: { ...evidence.provenance.sourceSha256, ...(standardAri ? { [standardSource]: standardAri.sourceSha256 } : {}) } },
    calculations: studyCalculations(sourceDirectory, geometry), dpcCenters, dpcAriByRun: reference && geometry
    ? geometry.sop3.dpc.map(panel => ({ seed: panel.checkNumber,
      adjustedRandIndex: adjustedRandIndex(reference, panel.observations.map(point => point.cluster)) })) : undefined });
}
