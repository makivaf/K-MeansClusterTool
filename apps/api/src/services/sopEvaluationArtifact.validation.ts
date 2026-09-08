import { isDeepStrictEqual } from "node:util";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadSopEvaluation } from "./sopEvaluationArtifact";
import { SopEvaluationSchema, SopEvaluationResponseSchema } from "../../../../packages/shared/src/schema";

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
if (!controlled || controlled.clusterSizes.join(",") !== "1553,884" || controlled.iterations !== 12) {
  throw new Error("Validated PCA-space DPC-only result is missing or changed");
}
for (const [metric, expected] of Object.entries({
  silhouette: 0.3727004724250328, daviesBouldin: 1.0758850311620256, calinskiHarabasz: 1800.0249578026046
})) {
  if (Math.abs(controlled.metrics[metric as keyof typeof controlled.metrics] - expected) > 1e-10) {
    throw new Error(`DPC-only ${metric} changed`);
  }
}
const raw = JSON.parse(fs.readFileSync(runtimeArtifact, "utf8"));
for (let i = 0; i < 6; i += 1) {
  for (const flag of ["pca", "nbclust", "dpc"] as const) {
    const invalid = structuredClone(raw);
    invalid.pipelines[i][flag] = !invalid.pipelines[i][flag];
    if (SopEvaluationSchema.safeParse(invalid).success) {
      throw new Error(`Incorrect cumulative ${flag} setting accepted for pipeline ${i}`);
    }
  }
}
for (const condition of evaluation.sop1.ablation.conditions) {
  const ranked = [...condition.baselineCandidates].sort((a, b) => b.silhouette - a.silhouette || a.k - b.k);
  if (condition.baselineCandidates.some((row, i) => row.k !== i + 2) || ranked[0].k !== condition.selectedK) {
    throw new Error("SOP 1 must select k using the baseline method in each representation");
  }
}
if (evaluation.sop3.settings.representation !== "PC1-PC6" ||
    controlled.settings.kSelection !== "NbClust" ||
    !isDeepStrictEqual(evaluation.sop3.dpcDeterminism.metrics, controlled.metrics)) {
  throw new Error("SOP 3 primary results do not retain PCA and NbClust");
}
for (const metric of ["silhouette", "davies_bouldin", "calinski_harabasz"] as const) {
  if (!isDeepStrictEqual(evaluation.sop3.randomRunSummary[metric], pca.metrics[metric])) {
    throw new Error(`SOP 3 random control differs from the common baseline: ${metric}`);
  }
}
console.log("PASS all six cumulative SOP configurations and retained upstream stages");
const invalidCases: Array<[string, (artifact: typeof raw) => void]> = [
  ["missing", (a) => { delete a.sop3.controlledComparison; }],
  ["legacy PCA result", (a) => { a.sop3.controlledComparison = a.sop3.dpcDeterminism; }],
  ["PCA removed", (a) => { a.sop3.controlledComparison.settings.pca = false; }],
  ["NbClust removed", (a) => { a.sop3.controlledComparison.settings.nbclust = false; }],
  ["baseline selection", (a) => { a.sop3.controlledComparison.settings.kSelection = "maximum silhouette; ties choose smaller k"; }],
  ["fixed k carry-over", (a) => { a.sop3.controlledComparison.settings.kSelection = "fixed"; }],
  ["wrong k", (a) => { a.sop3.controlledComparison.settings.k = 3; }],
  ["wrong features", (a) => { a.sop3.controlledComparison.settings.features[0] = "MMSE"; }],
  ["different input", (a) => { a.sop3.controlledComparison.settings.inputSha256 = "0".repeat(64); }],
  ["different settings", (a) => { a.sop3.controlledComparison.settings.nInit = 10; }],
  ["different algorithm", (a) => { a.sop3.controlledComparison.settings.algorithm = "elkan"; }],
  ["different seeds", (a) => { a.sop3.controlledComparison.settings.randomSeeds[0] = 29; }],
  ["different control", (a) => { a.sop1.ablation.conditions[1].dimensions = 13; }],
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
const interimArtifact = path.join(repositoryRoot, "data/interim/sop_evaluation_summary.json");
if (fs.existsSync(interimArtifact) && !isDeepStrictEqual(JSON.parse(fs.readFileSync(interimArtifact, "utf8")), JSON.parse(fs.readFileSync(runtimeArtifact, "utf8")))) {
  throw new Error("Runtime and interim SOP aggregates differ");
}
console.log("PASS SOP 3: PCA-space DPC metrics, controlled protocol, and invalid-artifact pending fallback");

const nbclustOnly = evaluation.sop2.controlledComparison;
if (!nbclustOnly) throw new Error("Validated PCA-space NbClust-only comparison is missing");
if (nbclustOnly.control.selectedK !== 2) throw new Error("PCA-space baseline selection changed");
if (nbclustOnly.nbclustOnly.selectedK !== 2 || nbclustOnly.selection.votesForSelectedK !== 9 || nbclustOnly.selection.usableIndices !== 24) {
  throw new Error("PCA-space NbClust selection or votes changed");
}
if (!isDeepStrictEqual(evaluation.sop2.nbclust.voteDistribution, nbclustOnly.selection.voteDistribution) ||
    evaluation.sop2.candidates.some((row, i) => row.silhouette !== nbclustOnly.baselineCandidates[i].silhouette)) {
  throw new Error("SOP 2 primary evidence differs from the PCA-space controlled comparison");
}
for (const metric of ["silhouette", "davies_bouldin", "calinski_harabasz"] as const) {
  if (Math.abs(nbclustOnly.control.metrics[metric].mean - pca.metrics[metric].mean) > 1e-10) {
    throw new Error(`Recomputed SOP 2 control disagrees with the PCA-space baseline: ${metric}`);
  }
  if (nbclustOnly.control.selectedK === nbclustOnly.nbclustOnly.selectedK &&
      JSON.stringify(nbclustOnly.control.metrics[metric]) !== JSON.stringify(nbclustOnly.nbclustOnly.metrics[metric])) {
    throw new Error(`Same k and initialization must produce identical SOP 2 summaries: ${metric}`);
  }
}
const invalidNbClustCases: Array<[string, (artifact: typeof raw) => void]> = [
  ["missing", (a) => { delete a.sop2.controlledComparison; }],
  ["legacy PCA result", (a) => { a.sop2.controlledComparison = a.sop2.nbclust; }],
  ["PCA removed", (a) => { a.sop2.controlledComparison.settings.pca = false; }],
  ["DPC enabled", (a) => { a.sop2.controlledComparison.settings.dpc = true; }],
  ["NbClust in control", (a) => { a.sop2.controlledComparison.settings.controlNbclust = true; }],
  ["fixed baseline k", (a) => { a.sop2.controlledComparison.settings.controlKSelection = "fixed"; }],
  ["wrong features", (a) => { a.sop2.controlledComparison.settings.features[0] = "MMSE"; }],
  ["different input", (a) => { a.sop2.controlledComparison.settings.inputSha256 = "0".repeat(64); }],
  ["different initialization", (a) => { a.sop2.controlledComparison.settings.initialization = "k-means++"; }],
  ["different settings", (a) => { a.sop2.controlledComparison.settings.nInit = 10; }],
  ["different algorithm", (a) => { a.sop2.controlledComparison.settings.algorithm = "elkan"; }],
  ["different seeds", (a) => { a.sop2.controlledComparison.settings.randomSeeds[0] = 29; }],
  ["wrong baseline selection", (a) => { a.sop2.controlledComparison.control.selectedK = 10; }],
  ["wrong NbClust selection", (a) => { a.sop2.controlledComparison.nbclustOnly.selectedK = 10; }],
  ["wrong result dimensions", (a) => { a.sop2.controlledComparison.nbclustOnly.dimensions = 13; }],
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
console.log("PASS SOP 2: PCA-space selection, matched control, and incompatible-artifact pending fallback");

const serialized = fs.readFileSync(runtimeArtifact, "utf8");
for (const forbidden of ["\"PTID\"", "\"RID\"", "participantId", "coordinates", "assignments"]) {
  if (serialized.includes(forbidden)) throw new Error(`Participant-level content entered the tracked SOP aggregate: ${forbidden}`);
}

console.log("PASS SOP evaluation: isolated aggregate contract, controlled PCA/k experiments, privacy boundary, and DPC determinism");

const series = evaluation.sop3.randomRuns;
assert.ok(series);
assert.equal(series.length, 30);
assert.deepEqual(series.map((run) => run.seed), expectedSeeds);
assert.deepEqual(series.slice(0, 3), evaluation.sop3.firstThreeRandomRuns);
const response = SopEvaluationResponseSchema.parse(JSON.parse(JSON.stringify({ evaluation })));
assert.deepEqual(response.evaluation.sop3.randomRuns, series);
const allowedFields = ["runNumber", "seed", "silhouette", "daviesBouldin", "calinskiHarabasz", "iterations", "clusterSizes"].sort();
for (const run of series) assert.deepEqual(Object.keys(run).sort(), allowedFields);
for (const [field, key] of [["silhouette", "silhouette"], ["daviesBouldin", "davies_bouldin"], ["calinskiHarabasz", "calinski_harabasz"]] as const) {
  const mean = series.reduce((sum, run) => sum + run[field], 0) / 30;
  const delta = Math.abs(mean - evaluation.sop3.randomRunSummary[key].mean);
  assert.ok(delta <= 1e-10);
  console.log(`PASS SOP 3 ${field}: 30-run mean absolute delta=${delta} (tolerance 1e-10)`);
}
const invalidSeriesCases: Array<[string, (artifact: typeof raw) => void]> = [
  ["29 rows", (a) => { a.sop3.randomRuns.pop(); }],
  ["31 rows", (a) => { a.sop3.randomRuns.push(a.sop3.randomRuns[0]); }],
  ["duplicate seed", (a) => { a.sop3.randomRuns[4].seed = 3; }],
  ["wrong run order", (a) => { a.sop3.randomRuns.reverse(); }],
  ["nonfinite metric", (a) => { a.sop3.randomRuns[4].silhouette = Infinity; }],
  ["summary mismatch", (a) => { a.sop3.randomRuns[4].silhouette += 0.01; }],
  ["first-three mismatch", (a) => { a.sop3.firstThreeRandomRuns[0].iterations += 1; }],
  ["wrong cohort size", (a) => { a.sop3.randomRuns[4].clusterSizes[0] += 1; }],
  ["missing hash", (a) => { delete a.provenance.sourceSha256["data/interim/dpc_comparison_random_runs.csv"]; }],
  ...["PTID", "RID", "participantId", "coordinates", "assignments"].map((field): [string, (artifact: typeof raw) => void] =>
    [field, (a) => { a.sop3.randomRuns[4][field] = "forbidden"; }])
];
for (const [name, mutate] of invalidSeriesCases) {
  const artifact = structuredClone(raw);
  mutate(artifact);
  assert.equal(SopEvaluationSchema.safeParse(artifact).success, false, name);
}
const legacy = structuredClone(raw);
delete legacy.sop3.randomRuns;
delete legacy.provenance.sourceSha256["data/interim/dpc_comparison_random_runs.csv"];
assert.ok(SopEvaluationSchema.safeParse(legacy).success, "Legacy summaries remain compatible");
const driftDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "sop-series-drift-"));
try {
  for (const source of Object.keys(evaluation.provenance.sourceSha256)) {
    fs.copyFileSync(path.join(repositoryRoot, source), path.join(driftDirectory, path.basename(source)));
  }
  fs.appendFileSync(path.join(driftDirectory, "dpc_comparison_random_runs.csv"), "\n");
  assert.throws(() => loadSopEvaluation({ sourceArtifactDirectory: driftDirectory }), /source drift/);
} finally {
  fs.rmSync(driftDirectory, { recursive: true, force: true });
}
console.log("PASS SOP 3 series: API response, strict field allowlist, 14 invalid cases, legacy compatibility, CSV equality and source-drift rejection");
