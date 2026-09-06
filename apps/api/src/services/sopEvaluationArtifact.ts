import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BaselineCandidateSweepSchema, SopEvaluationSchema, type SopEvaluation } from "../../../../packages/shared/src/schema";
import { readCsvRecords } from "./artifactReaders";

const serviceDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(serviceDirectory, "../../../..");
const artifactDirectory = path.join(repositoryRoot, "apps", "api", "artifacts");
const artifactPath = path.join(artifactDirectory, "sop_evaluation_summary.json");
const sourceArtifactDirectory = path.join(repositoryRoot, "data", "interim");

type SopEvaluationLoadOptions = { sourceArtifactDirectory?: string };

export const loadBaselineCandidateSweep = (evaluation: SopEvaluation, directory = sourceArtifactDirectory) => {
  const filename = path.join(artifactDirectory, "baseline_candidate_sweep.json");
  if (!fs.existsSync(filename)) return null;
  const sweep = BaselineCandidateSweepSchema.parse(JSON.parse(fs.readFileSync(filename, "utf8")));
  const input = "data/interim/clustering_features_standardized.csv";
  if (sweep.sourceSha256[input] !== evaluation.provenance.sourceSha256[input]) throw new Error("Baseline sweep input provenance disagrees with SOP evaluation.");
  const selection = evaluation.sop2.controlledComparison;
  if (!selection) return null;
  if (sweep.candidates.some((row, i) => row.silhouette !== selection.baselineCandidates[i].silhouette)) {
    throw new Error("Baseline sweep disagrees with the validated original-feature selection.");
  }
  const expectedSources = [input, "data/interim/baseline_kmeans_k_selection.csv"];
  if (Object.keys(sweep.sourceSha256).sort().join() !== expectedSources.sort().join()) throw new Error("Invalid baseline sweep source set.");
  const available = expectedSources.filter((source) => fs.existsSync(path.join(directory, path.posix.basename(source))));
  if (available.length > 0 && available.length !== expectedSources.length) throw new Error("Incomplete baseline sweep source set.");
  for (const source of available) {
    const actual = crypto.createHash("sha256").update(fs.readFileSync(path.join(directory, path.posix.basename(source)))).digest("hex");
    if (actual !== sweep.sourceSha256[source]) throw new Error("Baseline candidate source drift detected.");
  }
  if (available.length === expectedSources.length) {
    const rows = readCsvRecords(directory, "baseline_kmeans_k_selection.csv");
    if (rows.length !== sweep.candidates.length || rows.some((row, i) => {
      const candidate = sweep.candidates[i];
      return Number(row.selection_seed) !== sweep.seed || Number(row.k) !== candidate.k ||
        Number(row.silhouette) !== candidate.silhouette || Number(row.davies_bouldin) !== candidate.daviesBouldin ||
        Number(row.calinski_harabasz) !== candidate.calinskiHarabasz || Number(row.inertia) !== candidate.inertia ||
        Number(row.iterations) !== candidate.iterations ||
        row.cluster_sizes !== candidate.clusterSizes.map((size, cluster) => `${cluster}:${size}`).join("|");
    })) throw new Error("Packaged baseline candidate values disagree with their validated source.");
  }
  return sweep;
};

export const loadSopEvaluation = (options: SopEvaluationLoadOptions = {}): SopEvaluation | null => {
  const resolved = path.resolve(artifactPath);
  if (!resolved.startsWith(`${path.resolve(artifactDirectory)}${path.sep}`)) {
    throw new Error("The SOP evaluation artifact path escaped its aggregate directory.");
  }
  if (!fs.existsSync(resolved)) return null;
  const evaluation = SopEvaluationSchema.parse(JSON.parse(fs.readFileSync(resolved, "utf8")));
  const localSourceDirectory = path.resolve(options.sourceArtifactDirectory ?? sourceArtifactDirectory);
  const sources = Object.entries(evaluation.provenance.sourceSha256).map(([reportedPath, expectedSha256]) => {
    if (path.posix.dirname(reportedPath) !== "data/interim") throw new Error(`Invalid SOP source path: ${reportedPath}`);
    return { reportedPath, expectedSha256, sourcePath: path.resolve(localSourceDirectory, path.posix.basename(reportedPath)) };
  });
  const availableSourceCount = sources.filter(({ sourcePath }) => fs.existsSync(sourcePath)).length;
  if (availableSourceCount > 0 && availableSourceCount !== sources.length) {
    throw new Error("The local SOP source-artifact set is incomplete.");
  }
  for (const { reportedPath, expectedSha256, sourcePath } of availableSourceCount === sources.length ? sources : []) {
    if (!sourcePath.startsWith(`${localSourceDirectory}${path.sep}`) || !fs.statSync(sourcePath).isFile()) {
      throw new Error(`A declared SOP source artifact is missing or outside data/interim: ${reportedPath}`);
    }
    const actualSha256 = crypto.createHash("sha256").update(fs.readFileSync(sourcePath)).digest("hex");
    if (actualSha256 !== expectedSha256) throw new Error(`SOP evaluation source drift detected: ${reportedPath}`);
  }
  const serialized = JSON.stringify(evaluation);
  for (const forbidden of ["PTID", "RID", "participantId", "coordinates", "assignments"]) {
    if (serialized.includes(`\"${forbidden}\"`)) throw new Error(`Participant-level field escaped SOP evaluation: ${forbidden}`);
  }
  return evaluation;
};
