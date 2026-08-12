import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateAnalysisInputManifest } from "./analysisInputManifest";

export type ResearchAxis = "Axis A" | "Axis B";
export type ResearchStage = { axis: ResearchAxis; script: string };
export type StageRunner = (stage: ResearchStage, context: ExecutionContext) => Promise<void>;

export type ExecutionContext = {
  workspace: string;
  pythonExecutable: string;
  timeoutMs: number;
};

export type ResearchExecution = {
  executionId: string;
  workspace: string;
  axisAArtifactDirectory: string;
  axisBArtifactDirectory: string;
};

const serviceDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(serviceDirectory, "../../../..");
const authoritativeScripts = path.join(repositoryRoot, "scripts", "research");
const workRoot = path.resolve(serviceDirectory, "../../work");

const stages: readonly ResearchStage[] = [
  { axis: "Axis A", script: "audit_adni.py" },
  { axis: "Axis A", script: "audit_adni_candidate_mapping.py" },
  { axis: "Axis A", script: "reconcile_adni_dictionary.py" },
  { axis: "Axis A", script: "construct_axis_a_study_entry.py" },
  { axis: "Axis A", script: "audit_axis_a_scope_npiq.py" },
  { axis: "Axis A", script: "preprocess_axis_a.py" },
  { axis: "Axis A", script: "check_sop2_environment.py" },
  { axis: "Axis A", script: "select_axis_a_k_nbclust.py" },
  { axis: "Axis A", script: "dpc_init_axis_a.py" },
  { axis: "Axis A", script: "run_axis_a_enhanced_kmeans.py" },
  { axis: "Axis A", script: "run_axis_a_baseline_comparison.py" },
  { axis: "Axis A", script: "run_axis_a_dpc_ablation.py" },
  { axis: "Axis B", script: "audit_axis_b_longitudinal.py" },
  { axis: "Axis B", script: "reconcile_axis_b_longitudinal_methodology.py" },
  { axis: "Axis B", script: "construct_axis_b_longitudinal_cohort.py" },
  { axis: "Axis B", script: "extract_axis_b_adas13_slopes.py" },
  { axis: "Axis B", script: "select_axis_b_k_nbclust.py" },
  { axis: "Axis B", script: "select_axis_b_dpc_seeds.py" },
  { axis: "Axis B", script: "reconcile_axis_b_dpc_methodology.py" },
  { axis: "Axis B", script: "run_axis_b_final_clustering.py" },
  { axis: "Axis B", script: "run_axis_b_random_ablation.py" },
  { axis: "Axis B", script: "run_axis_b_sensitivity_analysis.py" },
  { axis: "Axis B", script: "summarize_axis_b_results.py" }
] as const;

const approvedScripts = new Set(stages.map((stage) => stage.script));

export class ResearchExecutionError extends Error {
  constructor(readonly code: "ENVIRONMENT_FAILURE" | "EXECUTION_FAILURE" | "EXECUTION_TIMEOUT" | "MISSING_ARTIFACT", message: string) {
    super(message);
  }
}

export const getStagesForAxis = (axis: ResearchAxis): readonly ResearchStage[] => {
  if (axis !== "Axis A" && axis !== "Axis B") throw new ResearchExecutionError("EXECUTION_FAILURE", "Unsupported research axis.");
  return stages.filter((stage) => stage.axis === axis);
};

const resolvePython = (): string => {
  if (process.env.RESEARCH_PYTHON) return path.resolve(process.env.RESEARCH_PYTHON);
  return process.platform === "win32"
    ? path.join(repositoryRoot, ".venv", "Scripts", "python.exe")
    : path.join(repositoryRoot, ".venv", "bin", "python");
};

const defaultStageRunner: StageRunner = (stage, context) => new Promise((resolve, reject) => {
  if (!approvedScripts.has(stage.script) || path.basename(stage.script) !== stage.script) {
    reject(new ResearchExecutionError("EXECUTION_FAILURE", "An unapproved research entry point was requested."));
    return;
  }
  const scriptPath = path.join(context.workspace, "scripts", "research", stage.script);
  const child = spawn(context.pythonExecutable, [scriptPath], {
    cwd: context.workspace,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PYTHONUNBUFFERED: "1" },
    shell: false
  });
  let diagnostic = "";
  const collect = (chunk: Buffer) => { diagnostic = `${diagnostic}${chunk.toString("utf8")}`.slice(-8192); };
  child.stdout.on("data", collect);
  child.stderr.on("data", collect);
  const timer = setTimeout(() => {
    child.kill();
    reject(new ResearchExecutionError("EXECUTION_TIMEOUT", `${stage.axis} research stage timed out: ${stage.script}`));
  }, context.timeoutMs);
  child.once("error", () => {
    clearTimeout(timer);
    reject(new ResearchExecutionError("ENVIRONMENT_FAILURE", `The local research environment could not start ${stage.script}.`));
  });
  child.once("exit", (code) => {
    clearTimeout(timer);
    if (code === 0) resolve();
    else {
      // Keep raw process output server-side and out of the error/API boundary.
      void diagnostic;
      reject(new ResearchExecutionError("EXECUTION_FAILURE", `${stage.axis} research stage failed: ${stage.script}.`));
    }
  });
});

const prepareWorkspace = (uploadDirectory: string, executionId: string, pythonExecutable: string): string => {
  validateAnalysisInputManifest(uploadDirectory);
  const workspace = path.join(workRoot, executionId);
  fs.mkdirSync(path.join(workspace, "scripts"), { recursive: true });
  fs.cpSync(authoritativeScripts, path.join(workspace, "scripts", "research"), { recursive: true });
  const rawDirectory = path.join(workspace, "data", "raw", "adni");
  fs.mkdirSync(rawDirectory, { recursive: true });
  fs.mkdirSync(path.join(workspace, "data", "interim"), { recursive: true });
  fs.mkdirSync(path.join(workspace, "data", "processed"), { recursive: true });
  for (const filename of fs.readdirSync(uploadDirectory)) {
    const source = path.join(uploadDirectory, filename);
    const destination = path.join(rawDirectory, filename);
    try { fs.linkSync(source, destination); } catch { fs.copyFileSync(source, destination); }
  }
  const environmentRoot = path.resolve(pythonExecutable, "..", "..");
  const workspaceEnvironment = path.join(workspace, ".venv");
  if (fs.existsSync(environmentRoot) && !fs.existsSync(workspaceEnvironment)) {
    try {
      fs.symlinkSync(environmentRoot, workspaceEnvironment, process.platform === "win32" ? "junction" : "dir");
    } catch {
      throw new ResearchExecutionError("ENVIRONMENT_FAILURE", "The isolated workspace could not link the local research environment.");
    }
  }
  return workspace;
};

export const runResearchPipelines = async (
  uploadDirectory: string,
  options: { runner?: StageRunner; timeoutMs?: number; pythonExecutable?: string } = {}
): Promise<ResearchExecution> => {
  const executionId = `analysis-${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
  const pythonExecutable = options.pythonExecutable ?? resolvePython();
  const workspace = prepareWorkspace(uploadDirectory, executionId, pythonExecutable);
  const context: ExecutionContext = { workspace, pythonExecutable, timeoutMs: options.timeoutMs ?? 60 * 60 * 1000 };
  const runner = options.runner ?? defaultStageRunner;
  try {
    for (const stage of stages) {
      try {
        await runner(stage, context);
      } catch (error) {
        if (error instanceof ResearchExecutionError) throw error;
        throw new ResearchExecutionError("EXECUTION_FAILURE", `${stage.axis} research stage failed: ${stage.script}.`);
      }
    }
  } catch (error) {
    fs.rmSync(workspace, { recursive: true, force: true });
    throw error;
  }
  const artifactDirectory = path.join(workspace, "data", "interim");
  if (!fs.existsSync(artifactDirectory)) throw new ResearchExecutionError("MISSING_ARTIFACT", "Research output directory was not produced.");
  return { executionId, workspace, axisAArtifactDirectory: artifactDirectory, axisBArtifactDirectory: artifactDirectory };
};
