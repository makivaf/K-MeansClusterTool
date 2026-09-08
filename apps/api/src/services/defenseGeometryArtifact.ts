import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DefenseGeometrySchema, type SopEvaluation } from "../../../../packages/shared/src/schema";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const digest = (file: string) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

export const loadDefenseGeometry = (evaluation: SopEvaluation, artifactDirectory = path.join(root, "apps/api/artifacts"), sourceDirectory = path.join(root, "data/interim")) => {
  const filename = path.join(artifactDirectory, "defense_geometry.json");
  if (!fs.existsSync(filename)) return null;
  const checksum = fs.readFileSync(path.join(artifactDirectory, "defense_geometry.sha256"), "utf8").trim();
  if (!/^[a-f0-9]{64}$/.test(checksum) || digest(filename) !== checksum) throw new Error("Defense geometry artifact checksum mismatch.");
  const geometry = DefenseGeometrySchema.parse(JSON.parse(fs.readFileSync(filename, "utf8")));
  const requiredSources = [
    "clustering_pca_scores.csv", "clustering_pca_explained_variance.csv", "clustering_features_standardized.csv",
    "clustering_pca_loadings.csv", "study_entry_cohort_unimputed.csv", "clustering_selected_k.csv",
    "baseline_kmeans_assignments.csv", "baseline_kmeans_runs.csv", "dpc_comparison_random_assignments.csv",
    "dpc_comparison_random_runs.csv", "unified_cluster_assignments.csv", "enhanced_kmeans_centroids.csv",
    "clustering_dpc_selected_centroids.csv", "enhanced_kmeans_metrics.csv", "enhanced_kmeans_run_summary.csv",
    "enhanced_kmeans_reproducibility.csv", "clustering_dpc_determinism_check.csv"
  ].map((name) => `data/interim/${name}`).sort();
  if (Object.keys(geometry.provenance.sourceSha256).sort().join() !== requiredSources.join()) throw new Error("Invalid defense geometry source set.");
  if (geometry.provenance.evaluationSha256 !== digest(path.join(artifactDirectory, "sop_evaluation_summary.json"))) throw new Error("Defense geometry SOP artifact linkage mismatch.");
  for (const [source, hash] of Object.entries(evaluation.provenance.sourceSha256)) {
    if (geometry.provenance.sourceSha256[source] !== hash) throw new Error("Defense geometry SOP source mismatch.");
  }
  const sources = Object.entries(geometry.provenance.sourceSha256).map(([source, hash]) => {
    if (path.posix.dirname(source) !== "data/interim" || !/^[a-z0-9_]+\.csv$/.test(path.posix.basename(source))) throw new Error("Invalid defense geometry source path.");
    return { filename: path.join(sourceDirectory, path.posix.basename(source)), hash };
  });
  const available = sources.filter((source) => fs.existsSync(source.filename));
  if (available.length && available.length !== sources.length) throw new Error("Incomplete defense geometry source set.");
  for (const source of available) {
    if (digest(source.filename) !== source.hash) throw new Error("Defense geometry source drift detected.");
  }
  return geometry;
};
