import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadSopEvaluation } from "./sopEvaluationArtifact";
import { SopEvaluationSchema } from "../../../../packages/shared/src/schema";

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

const controlled = evaluation.sop3.controlledComparison;
if (!controlled || controlled.clusterSizes.join(",") !== "1554,883" || controlled.iterations !== 13) {
  throw new Error("Validated original-space DPC-only result is missing or changed");
}
for (const [metric, expected] of Object.entries({
  silhouette: 0.33173611492709726, daviesBouldin: 1.224367536833148, calinskiHarabasz: 1442.0313362431123
})) {
  if (Math.abs(controlled.metrics[metric as keyof typeof controlled.metrics] - expected) > 1e-10) {
    throw new Error(`DPC-only ${metric} changed`);
  }
}
const raw = JSON.parse(fs.readFileSync(runtimeArtifact, "utf8"));
const invalidCases: Array<[string, (artifact: typeof raw) => void]> = [
  ["missing", (a) => { delete a.sop3.controlledComparison; }],
  ["legacy PCA result", (a) => { a.sop3.controlledComparison = a.sop3.dpcDeterminism; }],
  ["PCA enabled", (a) => { a.sop3.controlledComparison.settings.pca = true; }],
  ["NbClust enabled", (a) => { a.sop3.controlledComparison.settings.nbclust = true; }],
  ["selected k", (a) => { a.sop3.controlledComparison.settings.kSelection = "NbClust"; }],
  ["wrong k", (a) => { a.sop3.controlledComparison.settings.k = 3; }],
  ["wrong features", (a) => { a.sop3.controlledComparison.settings.features[0] = "PC1"; }],
  ["different input", (a) => { a.sop3.controlledComparison.settings.inputSha256 = "0".repeat(64); }],
  ["different settings", (a) => { a.sop3.controlledComparison.settings.nInit = 10; }],
  ["different algorithm", (a) => { a.sop3.controlledComparison.settings.algorithm = "elkan"; }],
  ["different seeds", (a) => { a.sop3.controlledComparison.settings.randomSeeds[0] = 29; }],
  ["different control", (a) => { a.sop1.ablation.conditions[0].dimensions = 6; }],
  ["missing metric", (a) => { delete a.sop3.controlledComparison.metrics.silhouette; }],
  ["nonfinite metric", (a) => { a.sop3.controlledComparison.metrics.silhouette = Infinity; }],
  ["failed determinism", (a) => { a.sop3.controlledComparison.identicalOutput = false; }]
];
for (const [name, mutate] of invalidCases) {
  const artifact = structuredClone(raw);
  mutate(artifact);
  const parsed = SopEvaluationSchema.parse(artifact);
  if (parsed.sop3.controlledComparison !== undefined || !parsed.sop3.dpcDeterminism) {
    throw new Error(`Invalid DPC-only artifact must remain pending without losing legacy evidence: ${name}`);
  }
}
const clustersPage = fs.readFileSync(path.join(repositoryRoot, "apps/web/src/pages/ClustersPage.tsx"), "utf8");
for (const binding of ["evaluation?.sop3.controlledComparison", "resultPending={!controlledResult}",
  "formatSopMetric(metric, controlledResult.metrics[metric].mean)", "controlled?.selectedCentroids"]) {
  if (!clustersPage.includes(binding)) throw new Error(`SOP 3 controlled-result rendering is disconnected: ${binding}`);
}
const interimArtifact = path.join(repositoryRoot, "data/interim/sop_evaluation_summary.json");
if (fs.existsSync(interimArtifact) && fs.readFileSync(interimArtifact, "utf8") !== fs.readFileSync(runtimeArtifact, "utf8")) {
  throw new Error("Runtime and interim SOP aggregates differ");
}
console.log("PASS SOP 3: original-space DPC metrics, controlled protocol, frontend binding, and invalid-artifact pending fallback");

const nbclustOnly = evaluation.sop2.controlledComparison;
if (!nbclustOnly) throw new Error("Validated original-space NbClust-only comparison is missing");
if (nbclustOnly.control.selectedK !== 2) throw new Error("Original-space baseline selection changed");
if (nbclustOnly.nbclustOnly.selectedK !== 2 || nbclustOnly.selection.votesForSelectedK !== 11 || nbclustOnly.selection.usableIndices !== 24) {
  throw new Error("Original-space NbClust selection or votes changed");
}
for (const metric of ["silhouette", "davies_bouldin", "calinski_harabasz"] as const) {
  if (Math.abs(nbclustOnly.control.metrics[metric].mean - original.metrics[metric].mean) > 1e-10) {
    throw new Error(`Recomputed SOP 2 control disagrees with the original-space baseline: ${metric}`);
  }
  if (nbclustOnly.control.selectedK === nbclustOnly.nbclustOnly.selectedK &&
      JSON.stringify(nbclustOnly.control.metrics[metric]) !== JSON.stringify(nbclustOnly.nbclustOnly.metrics[metric])) {
    throw new Error(`Same k and initialization must produce identical SOP 2 summaries: ${metric}`);
  }
}
const invalidNbClustCases: Array<[string, (artifact: typeof raw) => void]> = [
  ["missing", (a) => { delete a.sop2.controlledComparison; }],
  ["legacy PCA result", (a) => { a.sop2.controlledComparison = a.sop2.nbclust; }],
  ["PCA enabled", (a) => { a.sop2.controlledComparison.settings.pca = true; }],
  ["DPC enabled", (a) => { a.sop2.controlledComparison.settings.dpc = true; }],
  ["NbClust in control", (a) => { a.sop2.controlledComparison.settings.controlNbclust = true; }],
  ["fixed baseline k", (a) => { a.sop2.controlledComparison.settings.controlKSelection = "fixed"; }],
  ["wrong features", (a) => { a.sop2.controlledComparison.settings.features[0] = "PC1"; }],
  ["different input", (a) => { a.sop2.controlledComparison.settings.inputSha256 = "0".repeat(64); }],
  ["different initialization", (a) => { a.sop2.controlledComparison.settings.initialization = "k-means++"; }],
  ["different settings", (a) => { a.sop2.controlledComparison.settings.nInit = 10; }],
  ["different algorithm", (a) => { a.sop2.controlledComparison.settings.algorithm = "elkan"; }],
  ["different seeds", (a) => { a.sop2.controlledComparison.settings.randomSeeds[0] = 29; }],
  ["wrong baseline selection", (a) => { a.sop2.controlledComparison.control.selectedK = 10; }],
  ["wrong NbClust selection", (a) => { a.sop2.controlledComparison.nbclustOnly.selectedK = 10; }],
  ["wrong result dimensions", (a) => { a.sop2.controlledComparison.nbclustOnly.dimensions = 6; }],
  ["partial run set", (a) => { a.sop2.controlledComparison.nbclustOnly.runCount = 1; }],
  ["inconsistent votes", (a) => { a.sop2.controlledComparison.selection.voteDistribution[0].votes += 1; }],
  ["missing metric", (a) => { delete a.sop2.controlledComparison.nbclustOnly.metrics.silhouette; }],
  ["nonfinite metric", (a) => { a.sop2.controlledComparison.nbclustOnly.metrics.silhouette.mean = Infinity; }],
  ["failed repeat check", (a) => { a.sop2.controlledComparison.selection.reproducible = false; }]
];
for (const [name, mutate] of invalidNbClustCases) {
  const artifact = structuredClone(raw);
  mutate(artifact);
  const parsed = SopEvaluationSchema.parse(artifact);
  if (parsed.sop2.controlledComparison !== undefined || !parsed.sop3.controlledComparison) {
    throw new Error(`Invalid NbClust-only artifact must remain pending without affecting DPC: ${name}`);
  }
}
console.log("PASS SOP 2: original-space selection, matched control, and incompatible-artifact pending fallback");

const serialized = fs.readFileSync(runtimeArtifact, "utf8");
for (const forbidden of ["\"PTID\"", "\"RID\"", "participantId", "coordinates", "assignments"]) {
  if (serialized.includes(forbidden)) throw new Error(`Participant-level content entered the tracked SOP aggregate: ${forbidden}`);
}

console.log("PASS SOP evaluation: isolated aggregate contract, controlled PCA/k experiments, privacy boundary, and DPC determinism");
