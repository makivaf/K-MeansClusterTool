import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import assert from "node:assert/strict";
import { z } from "zod";
import { SimulationDpcControlSchema, SimulationMetricsSchema, SimulationRunStateSchema } from "../../../../packages/shared/src/simulation";
import { matchesDpcSolution } from "../../../../packages/shared/src/dpcMatching";
import { frozenArtifactHashes, simulationRunRoot } from "./simulationExecution";
import { getSimulationSample } from "./simulationSample";
import { loadSimulationCohort, sha256 } from "./simulationCohort";
import { buildResearchEnvironment, resolvePython } from "./researchPipelineOrchestrator";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const keys = ["silhouette", "davies_bouldin", "calinski_harabasz"] as const;
const read = (file: string) => JSON.parse(fs.readFileSync(file, "utf8"));
const hash = (file: string) => sha256(fs.readFileSync(file));
export const DpcControlEvaluationSchema = z.object({
  sampleFingerprint: z.string(), participantCount: z.literal(1949), pcaComponents: z.number().int(), selectedK: z.number().int(),
  settings: z.object({ nInit: z.literal(1), maxIter: z.literal(300), tolerance: z.literal(1e-4), algorithm: z.literal("lloyd") }).strict(),
  runs: z.array(z.object({ seed: z.number().int(), metrics: SimulationMetricsSchema,
    clusterSizes: z.array(z.number().int().positive()).min(2).max(10)
      .refine(sizes => sizes.reduce((a, b) => a + b, 0) === 1949) }).strict()).length(30)
    .refine(runs => runs.every((run, index) => run.seed === index)),
  randomMean: SimulationMetricsSchema, randomSd: SimulationMetricsSchema
}).strict().refine(value => value.runs.every(run => run.clusterSizes.length === value.selectedK));

/** Explicit maintenance command only. GET/page loads never launch controls. */
export async function evaluateSimulationDpcControl(id: number) {
  const sample = getSimulationSample(id);
  const cachePath = path.join(simulationRunRoot, `${id}.json`);
  const cache = read(cachePath);
  const state = SimulationRunStateSchema.parse(cache.state);
  assert.equal(state.simulationId, id);
  assert.ok(state.result && state.status === "complete", "A completed simulation is required");
  assert.equal(cache.fingerprint, sample.fingerprint);
  assert.equal(cache.sourceHash, loadSimulationCohort().provenance.source.sha256);
  const analysis = structuredClone(state.result.analysis);
  delete analysis.enhanced.dpc.randomControl;
  const candidates = fs.readdirSync(simulationRunRoot).filter(name => name.startsWith(`simulation-${id}-`))
    .map(name => path.join(simulationRunRoot, name)).filter(dir => fs.existsSync(path.join(dir, "result.json")))
    .filter(dir => JSON.stringify(read(path.join(dir, "result.json"))) === JSON.stringify(analysis));
  assert.equal(candidates.length, 1, "Exactly one saved workspace must match the cached analysis");
  const workspace = candidates[0];
  assert.deepEqual(read(path.join(workspace, "request.json")).sampleParticipantIds, sample.sampleParticipantIds);
  const pcaPath = path.join(workspace, "data/interim/clustering_pca_scores.csv");
  const provenancePath = path.join(workspace, "dpc-control-provenance.json");
  const binding = { pcaSha256: hash(pcaPath), analysisSha256: hash(path.join(workspace, "result.json")),
    sampleFingerprint: sample.fingerprint, sourceHash: cache.sourceHash };
  if (state.result.analysis.enhanced.dpc.randomControl) {
    const proof = read(provenancePath);
    assert.deepEqual(proof.binding, binding);
    assert.equal(proof.summarySha256, sha256(JSON.stringify(state.result.analysis.enhanced.dpc.randomControl)));
    return { cached: true, summary: state.result.analysis.enhanced.dpc.randomControl };
  }
  const lockPath = path.join(workspace, "dpc-control.lock");
  const lock = fs.openSync(lockPath, "wx");
  try {
    const protectedBefore = frozenArtifactHashes();
    const originalFiles = [cachePath, path.join(workspace, "result.json"), path.join(workspace, "public-result.json"),
      path.join(workspace, "request.json"), ...fs.readdirSync(path.join(workspace, "data/interim")).map(name => path.join(workspace, "data/interim", name))]
      .filter(file => fs.statSync(file).isFile());
    const originalHashes = originalFiles.map(hash);
    const { stdout } = await promisify(execFile)(resolvePython(), [path.join(root, "scripts/research/simulation/evaluate_dpc_control.py"), workspace], {
      cwd: root, env: { ...buildResearchEnvironment(), PYTHONDONTWRITEBYTECODE: "1" }, windowsHide: true,
      timeout: 30 * 60 * 1000, maxBuffer: 1024 * 1024
    });
    const evaluation = DpcControlEvaluationSchema.parse(JSON.parse(stdout));
    assert.equal(evaluation.sampleFingerprint, sample.fingerprint);
    assert.equal(evaluation.pcaComponents, analysis.enhanced.pcaComponents);
    assert.equal(evaluation.selectedK, analysis.enhanced.selectedK);
    assert.deepEqual(originalFiles.map(hash), originalHashes, "Saved simulation inputs/results changed");
    assert.deepEqual(frozenArtifactHashes(), protectedBefore, "Protected artifacts changed");
    const summary = SimulationDpcControlSchema.parse({ totalRandomRuns: evaluation.runs.length,
      matchingRuns: evaluation.runs.filter(run => matchesDpcSolution(keys.map(key => run.metrics[key]), run.clusterSizes,
        keys.map(key => analysis.enhanced.metrics[key]), analysis.enhanced.clusterSizes)).length,
      randomMean: evaluation.randomMean, randomSd: evaluation.randomSd });
    state.result.analysis.enhanced.dpc.randomControl = summary;
    SimulationRunStateSchema.parse(state);
    const proof = { binding, seeds: evaluation.runs.map(run => run.seed), participantCount: evaluation.participantCount,
      pcaComponents: evaluation.pcaComponents, selectedK: evaluation.selectedK, settings: evaluation.settings,
      canonicalSourceSha256: hash(path.join(root, "scripts/research/comparison/run_dpc_initialization_comparison.py")),
      summarySha256: sha256(JSON.stringify(summary)) };
    fs.writeFileSync(provenancePath, JSON.stringify(proof, null, 2));
    fs.writeFileSync(path.join(workspace, "public-result.json"), JSON.stringify(state, null, 2));
    const temporary = `${cachePath}.dpc.tmp`;
    fs.writeFileSync(temporary, JSON.stringify({ ...cache, state }));
    fs.renameSync(temporary, cachePath);
    return { cached: false, summary };
  } finally {
    fs.closeSync(lock);
    fs.unlinkSync(lockPath);
  }
}
