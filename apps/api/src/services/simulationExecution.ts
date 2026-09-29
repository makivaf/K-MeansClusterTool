import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { SimulationDpcControlSchema, SimulationMetricsSchema } from "../../../../packages/shared/src/simulation";
import { matchesDpcSolution } from "../../../../packages/shared/src/dpcMatching";
import { SimulationConfigurationSchema, simulationConfigurationKey, type SimulationConfiguration, SimulationAnalysisSchema, SimulationResultSchema, SimulationRunStateSchema, type SimulationAnalysis, type SimulationRunState } from "../../../../packages/shared/src/simulation";
import { getSimulationSample } from "./simulationSample";
import { loadSimulationCohort, simulationCohortRoot, sha256 } from "./simulationCohort";
import { getSimulationMetadata } from "./simulationMetadata";
import { buildResearchEnvironment, resolvePython } from "./researchPipelineOrchestrator";
import { materializeCanonicalResearchSources, verifyCanonicalDpcSource } from "./researchSourceMaterializer";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
export const simulationRunRoot = path.join(root, "apps/api/private/simulation-runs");
const sourcePath = () => process.env.SIMULATION_COHORT_SOURCE
  ? path.resolve(root, process.env.SIMULATION_COHORT_SOURCE) : path.join(simulationCohortRoot, "study_entry_cohort_unimputed.csv");

function verifiedSource() {
  const { provenance } = loadSimulationCohort();
  const bytes = fs.readFileSync(sourcePath());
  if (sha256(bytes) !== provenance.source.sha256) throw new Error("Simulation source integrity failed.");
  return bytes;
}

export function simulationCapabilities() {
  try {
    verifiedSource();
    if (!fs.existsSync(resolvePython())) throw new Error("Python unavailable");
    verifyCanonicalDpcSource(path.join(root, "scripts/research"));
    return { executionAvailable: true, code: "SUBSAMPLE_RUNNER_AVAILABLE" as const, message: "Paired simulation analysis is available." };
  } catch {
    return { executionAvailable: false, code: "SUBSAMPLE_RUNNER_UNAVAILABLE" as const, message: "A verified cohort source and research environment are required." };
  }
}

export function compareSimulationMetrics(analysis: SimulationAnalysis) {
  return (["silhouette", "davies_bouldin", "calinski_harabasz"] as const).map(metric => {
    const existing = analysis.existing.metrics[metric], enhanced = analysis.enhanced.metrics[metric];
    const difference = enhanced - existing;
    const direction = metric === "davies_bouldin" ? "lower_is_better" as const : "higher_is_better" as const;
    const favorable = direction === "lower_is_better" ? -difference : difference;
    return { metric, direction, existing, enhanced, difference, relativeImprovementPercent: existing === 0 ? null : favorable / Math.abs(existing) * 100,
      favorableMethod: favorable === 0 ? "equal" as const : favorable > 0 ? "enhanced" as const : "existing" as const };
  });
}

/** Hash only protected artifacts; simulation workspaces are outside these roots. */
export function frozenArtifactHashes() {
  const hashes: Record<string, string> = {};
  const visit = (directory: string) => {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile()) hashes[path.relative(root, file)] = sha256(fs.readFileSync(file));
    }
  };
  for (const relative of ["apps/api/artifacts", "data/interim", "data/processed", "apps/api/private/simulation-cohort"]) visit(path.join(root, relative));
  return hashes;
}

export async function executeSimulation(id: number, configuration?: SimulationConfiguration): Promise<SimulationRunState> {
  const sample = getSimulationSample(id, configuration);
  const source = verifiedSource();
  const before = frozenArtifactHashes();
  const workspace = path.join(simulationRunRoot, `simulation-${id}-${crypto.randomUUID()}`);
  fs.mkdirSync(path.join(workspace, "data/interim"), { recursive: true });
  materializeCanonicalResearchSources(path.join(root, "scripts/research"), path.join(workspace, "scripts/research"));
  verifyCanonicalDpcSource(path.join(workspace, "scripts/research"));
  fs.writeFileSync(path.join(workspace, "data/interim/study_entry_cohort_unimputed.csv"), source);
  fs.writeFileSync(path.join(workspace, "request.json"), JSON.stringify({ isolatedSimulation: true,
    configuration, sampleParticipantIds: sample.sampleParticipantIds, phaseSampleCounts: sample.phaseSampleCounts }));
  fs.writeFileSync(path.join(workspace, "frozen-before.json"), JSON.stringify(before));
  await new Promise<void>((resolve, reject) => {
    const log = fs.openSync(path.join(workspace, "execution.log"), "w");
    const child = spawn(resolvePython(), [path.join(workspace, "scripts/research/simulation/run_simulation.py")], {
      cwd: workspace, env: { ...buildResearchEnvironment(), PYTHONDONTWRITEBYTECODE: "1" }, windowsHide: true, shell: false, stdio: ["ignore", log, log]
    });
    fs.closeSync(log);
    const timer = setTimeout(() => { child.kill(); reject(new Error("Simulation execution timed out.")); }, 60 * 60 * 1000);
    child.once("error", () => { clearTimeout(timer); reject(new Error("Simulation environment unavailable.")); });
    child.once("exit", code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error("Simulation analysis failed.")); });
  });
  const after = frozenArtifactHashes();
  fs.writeFileSync(path.join(workspace, "frozen-after.json"), JSON.stringify(after));
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error("Protected study artifacts changed during execution.");
  const proof = JSON.parse(fs.readFileSync(path.join(workspace, "membership-proof.json"), "utf8"));
  if (proof.sampleCount !== sample.sampleParticipantCount || proof.identical !== true || [proof.selected, proof.existing, proof.enhanced].some(value => value !== sample.fingerprint)) {
    throw new Error("Paired membership verification failed.");
  }
  const analysis = SimulationAnalysisSchema.parse(JSON.parse(fs.readFileSync(path.join(workspace, "result.json"), "utf8")));
  if (configuration) {
    const control = z.object({
      runs: z.array(z.object({ metrics: SimulationMetricsSchema, clusterSizes: z.array(z.number().int().positive()) }).strict()).length(30),
      randomMean: SimulationMetricsSchema, randomSd: SimulationMetricsSchema
    }).strict().parse(JSON.parse(fs.readFileSync(path.join(workspace, "random-control.json"), "utf8")));
    const keys = ["silhouette", "davies_bouldin", "calinski_harabasz"] as const;
    if (control.runs.some(run => run.clusterSizes.length !== analysis.enhanced.selectedK || run.clusterSizes.reduce((a, b) => a + b, 0) !== sample.sampleParticipantCount)) throw new Error("Invalid control dimensions");
    analysis.enhanced.dpc.randomControl = SimulationDpcControlSchema.parse({
      totalRandomRuns: control.runs.length,
      matchingRuns: control.runs.filter(run => matchesDpcSolution(keys.map(key => run.metrics[key]), run.clusterSizes,
        keys.map(key => analysis.enhanced.metrics[key]), analysis.enhanced.clusterSizes)).length,
      randomMean: control.randomMean, randomSd: control.randomSd
    });
  }
  const comparison = compareSimulationMetrics(analysis);
  const metadata = configuration ? {
    simulationId: id, sampleSize: sample.sampleParticipantCount, samplingFraction: sample.samplingFraction,
    samplingMethod: sample.samplingMethod, phaseSampleCounts: sample.phaseSampleCounts,
    seed: sample.seed, sampleFingerprint: sample.fingerprint, configuration, sampleStatus: "sample_ready"
  } : getSimulationMetadata().simulations.find(value => value.simulationId === id)!;
  if (configuration && (analysis.existing.selectedK !== (configuration.manualK ?? analysis.existing.silhouetteSelectedK) || !analysis.projection || !analysis.correlation || !analysis.existing.silhouetteByK || !analysis.enhanced.dpc.decisionGraph || !analysis.enhanced.dpc.randomControl)) {
    throw new Error("Runtime output does not match requested configuration.");
  }
  const result = SimulationResultSchema.parse({ metadata: { ...metadata, analysisStatus: "complete" }, analysis, comparison,
    enhancedFavorableMetrics: comparison.filter(value => value.favorableMethod === "enhanced").length, sameParticipantsVerified: true });
  const state = SimulationRunStateSchema.parse({ simulationId: id, configurationKey: configuration ? simulationConfigurationKey(configuration) : undefined, status: "complete", result, message: null });
  fs.writeFileSync(path.join(workspace, "public-result.json"), JSON.stringify(state, null, 2));
  // Private cache is bound to sample and source; never used as a full-study artifact.
  const cache = { runtimeVersion: 2, fingerprint: sample.fingerprint, sourceHash: sha256(source), state };
  const cacheFile = cacheFilename(id, configuration);
  const temporary = `${cacheFile}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(cache));
  fs.renameSync(temporary, cacheFile);
  return state;
}

const cacheFilename = (id: number, configuration?: SimulationConfiguration) => path.join(simulationRunRoot,
  configuration ? `runtime-v2-${id}-${sha256(simulationConfigurationKey(configuration))}.json` : `${id}.json`);

export function createSimulationExecutor(execute = executeSimulation, useCache = true) {
  const states = new Map<string, SimulationRunState>();
  const keyFor = (id: number, configuration?: SimulationConfiguration) => `${id}:${configuration ? simulationConfigurationKey(SimulationConfigurationSchema.parse(configuration)) : "legacy"}`;
  const get = (id: number, configuration?: SimulationConfiguration): SimulationRunState => {
    const key = keyFor(id, configuration);
    const sample = getSimulationSample(id, configuration);
    // A verified persisted completion supersedes stale in-memory running state.
    if (states.has(key) && !useCache) return states.get(key)!;
    if (useCache) {
      try {
        const saved = JSON.parse(fs.readFileSync(cacheFilename(id, configuration), "utf8"));
        if (saved.fingerprint === sample.fingerprint && saved.sourceHash === loadSimulationCohort().provenance.source.sha256 && (!configuration || saved.runtimeVersion === 2)) {
          const state = SimulationRunStateSchema.parse(saved.state);
          if (state.simulationId === id && state.status === "complete" && state.configurationKey === (configuration ? simulationConfigurationKey(configuration) : undefined)) {
            states.set(key, state); return state;
          }
        }
      } catch { /* No valid completed run cached. */ }
    }
    return states.get(key) ?? { simulationId: id, configurationKey: configuration ? simulationConfigurationKey(configuration) : undefined, status: "sample_ready", result: null, message: null };
  };
  const start = (id: number, configuration?: SimulationConfiguration) => {
    const key = keyFor(id, configuration);
    const current = get(id, configuration);
    if (current.status === "running" || current.status === "complete") return current;
    const running: SimulationRunState = { ...current, status: "running", result: null, message: null };
    states.set(key, running);
    void Promise.resolve().then(() => execute(id, configuration)).then(state => {
      const parsed = SimulationRunStateSchema.parse(state);
      if (parsed.simulationId !== id || parsed.configurationKey !== running.configurationKey) throw new Error("Configuration mismatch");
      states.set(key, parsed);
    }).catch(() => states.set(key, { ...running, status: "failed", message: "Simulation analysis failed. Check the private execution log and research environment before retrying." }));
    return running;
  };
  return { get, start };
}
export const simulationExecutor = createSimulationExecutor();
