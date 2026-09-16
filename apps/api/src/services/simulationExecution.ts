import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { SimulationAnalysisSchema, SimulationResultSchema, SimulationRunStateSchema, type SimulationAnalysis, type SimulationRunState } from "../../../../packages/shared/src/simulation";
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
    return { metric, direction, existing, enhanced, difference,
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

export async function executeSimulation(id: number): Promise<SimulationRunState> {
  const sample = getSimulationSample(id);
  const source = verifiedSource();
  const before = frozenArtifactHashes();
  const workspace = path.join(simulationRunRoot, `simulation-${id}-${crypto.randomUUID()}`);
  fs.mkdirSync(path.join(workspace, "data/interim"), { recursive: true });
  materializeCanonicalResearchSources(path.join(root, "scripts/research"), path.join(workspace, "scripts/research"));
  verifyCanonicalDpcSource(path.join(workspace, "scripts/research"));
  fs.writeFileSync(path.join(workspace, "data/interim/study_entry_cohort_unimputed.csv"), source);
  fs.writeFileSync(path.join(workspace, "request.json"), JSON.stringify({ isolatedSimulation: true,
    sampleParticipantIds: sample.sampleParticipantIds, phaseSampleCounts: sample.phaseSampleCounts }));
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
  if (proof.sampleCount !== 1949 || proof.identical !== true || [proof.selected, proof.existing, proof.enhanced].some(value => value !== sample.fingerprint)) {
    throw new Error("Paired membership verification failed.");
  }
  const analysis = SimulationAnalysisSchema.parse(JSON.parse(fs.readFileSync(path.join(workspace, "result.json"), "utf8")));
  const comparison = compareSimulationMetrics(analysis);
  const metadata = getSimulationMetadata().simulations.find(value => value.simulationId === id)!;
  const result = SimulationResultSchema.parse({ metadata: { ...metadata, analysisStatus: "complete" }, analysis, comparison,
    enhancedFavorableMetrics: comparison.filter(value => value.favorableMethod === "enhanced").length, sameParticipantsVerified: true });
  const state = SimulationRunStateSchema.parse({ simulationId: id, status: "complete", result, message: null });
  fs.writeFileSync(path.join(workspace, "public-result.json"), JSON.stringify(state, null, 2));
  // Private cache is bound to sample and source; never used as a full-study artifact.
  const cache = { fingerprint: sample.fingerprint, sourceHash: sha256(source), state };
  const temporary = path.join(simulationRunRoot, `${id}.json.tmp`);
  fs.writeFileSync(temporary, JSON.stringify(cache));
  fs.renameSync(temporary, path.join(simulationRunRoot, `${id}.json`));
  return state;
}

export function createSimulationExecutor(execute = executeSimulation, useCache = true) {
  const states = new Map<number, SimulationRunState>();
  const get = (id: number): SimulationRunState => {
    const sample = getSimulationSample(id);
    // An explicit control evaluation may extend a completed cache while the API is running.
    if (states.has(id) && (!useCache || states.get(id)!.status !== "complete")) return states.get(id)!;
    if (useCache) {
      try {
        const saved = JSON.parse(fs.readFileSync(path.join(simulationRunRoot, `${id}.json`), "utf8"));
        if (saved.fingerprint === sample.fingerprint && saved.sourceHash === loadSimulationCohort().provenance.source.sha256) {
          const state = SimulationRunStateSchema.parse(saved.state);
          if (state.simulationId === id && state.status === "complete") { states.set(id, state); return state; }
        }
      } catch { /* No valid completed run cached. */ }
    }
    return states.get(id) ?? { simulationId: id, status: "sample_ready", result: null, message: null };
  };
  const start = (id: number) => {
    const current = get(id);
    if (current.status === "running" || current.status === "complete") return current;
    const running: SimulationRunState = { simulationId: id, status: "running", result: null, message: null };
    states.set(id, running);
    void Promise.resolve().then(() => execute(id)).then(state => states.set(id, SimulationRunStateSchema.parse(state)))
      .catch(() => states.set(id, { simulationId: id, status: "failed", result: null, message: "Simulation analysis failed. Check the private execution log and research environment before retrying." }));
    return running;
  };
  return { get, start };
}
export const simulationExecutor = createSimulationExecutor();
