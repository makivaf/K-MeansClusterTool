import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadSopEvaluation } from "./sopEvaluationArtifact";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const runtimeArtifact = path.join(repositoryRoot, "apps", "api", "artifacts", "sop_evaluation_summary.json");
if (!fs.existsSync(runtimeArtifact)) throw new Error("Tracked runtime SOP aggregate is missing");

const evaluation = loadSopEvaluation();
if (!evaluation) throw new Error("Aggregate SOP evaluation artifact is missing");
const emptySourceDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "sop-clean-clone-"));
try {
  const cleanCloneEvaluation = loadSopEvaluation({ sourceArtifactDirectory: emptySourceDirectory });
  if (!cleanCloneEvaluation || cleanCloneEvaluation.contractVersion !== "sop-evaluation/v1") {
    throw new Error("Tracked SOP aggregate cannot load without gitignored local sources");
  }
} finally {
  fs.rmSync(emptySourceDirectory, { recursive: true, force: true });
}
if (evaluation.cohortN !== 2437 || evaluation.provenance.officialResultsModified || evaluation.provenance.participantLevelOutput) {
  throw new Error("SOP evaluation scope or privacy contract failed");
}

const [original, pca] = evaluation.sop1.ablation.conditions;
const expectedSeeds = Array.from({ length: 30 }, (_, seed) => seed);
if (original.dimensions !== 13 || pca.dimensions !== 6 || Math.abs(pca.varianceRetained - 0.8747945923377831) > 1e-15) {
  throw new Error("SOP 1 dimensionality or variance result changed");
}
if (
  evaluation.sop1.ablation.settings.cohortN !== 2437 ||
  evaluation.sop1.ablation.settings.k !== 2 ||
  evaluation.sop1.ablation.settings.algorithm !== "lloyd" ||
  evaluation.sop1.ablation.settings.nInit !== 1 ||
  evaluation.sop1.ablation.settings.seeds.join(",") !== expectedSeeds.join(",") ||
  original.representation !== "13 standardized features" || pca.representation !== "PC1-PC6"
) throw new Error("SOP 1 is not a representation-only controlled ablation");
if (
  pca.metrics.silhouette.mean <= original.metrics.silhouette.mean ||
  pca.metrics.davies_bouldin.mean >= original.metrics.davies_bouldin.mean ||
  pca.metrics.calinski_harabasz.mean <= original.metrics.calinski_harabasz.mean
) throw new Error("SOP 1 controlled metric directions changed");

if (
  evaluation.sop2.maximumSilhouetteSelectedK !== 2 ||
  evaluation.sop2.nbclust.selectedK !== 2 ||
  evaluation.sop2.nbclust.votesForSelectedK !== 9 ||
  evaluation.sop2.nbclust.usableIndices !== 24
) throw new Error("SOP 2 selection result changed");
if (
  evaluation.sop2.settings.representation !== "PC1-PC6" || evaluation.sop2.settings.seed !== 0 ||
  evaluation.sop2.settings.initialization !== "random" || evaluation.sop2.settings.nInit !== 1 ||
  evaluation.sop2.settings.algorithm !== "lloyd" || evaluation.sop2.settings.maxIter !== 300 ||
  evaluation.sop2.settings.tolerance !== 0.0001
) throw new Error("SOP 2 candidate settings changed");
if (evaluation.sop2.candidates.some((candidate) => candidate.clusterSizes.reduce((sum, size) => sum + size, 0) !== 2437)) {
  throw new Error("SOP 2 aggregate cluster sizes do not cover the cohort");
}

if (
  evaluation.sop3.firstThreeRandomRuns.map((run) => run.seed).join(",") !== "0,1,2" ||
  evaluation.sop3.partitionStability.distinctLabelInvariantPartitions !== 3 ||
  !evaluation.sop3.dpcDeterminism.identicalInitialization ||
  !evaluation.sop3.dpcDeterminism.identicalOutput
) throw new Error("SOP 3 sensitivity or determinism result changed");

const serialized = fs.readFileSync(runtimeArtifact, "utf8");
for (const forbidden of ["\"PTID\"", "\"RID\"", "participantId", "coordinates", "assignments"]) {
  if (serialized.includes(forbidden)) throw new Error(`Participant-level content entered the tracked SOP aggregate: ${forbidden}`);
}

console.log("PASS SOP evaluation: isolated aggregate contract, controlled PCA/k experiments, privacy boundary, and DPC determinism");
