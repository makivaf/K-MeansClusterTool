import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateAnalysisInputManifest } from "./analysisInputManifest";
import {
  approvedResearchScripts,
  getResearchExecutionPlan,
  type ResearchAxis,
  type ResearchStageGroup
} from "./researchStageManifest";

export type { ResearchAxis } from "./researchStageManifest";
export type ResearchStage = { axis: ResearchAxis; script: string; group: ResearchStageGroup };
export type StageRunner = (stage: ResearchStage, context: ExecutionContext) => Promise<void>;

export type ExecutionContext = {
  workspace: string;
  pythonExecutable: string;
  timeoutMs: number;
  environment: NodeJS.ProcessEnv;
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

const buildResearchEnvironment = (): NodeJS.ProcessEnv => {
  const environment: NodeJS.ProcessEnv = { ...process.env, PYTHONUNBUFFERED: "1" };
  const rHome = process.env.RESEARCH_R_HOME ?? process.env.R_HOME;
  if (rHome) {
    environment.R_HOME = rHome;
    const rPaths = process.platform === "win32" ? [path.join(rHome, "bin", "x64"), path.join(rHome, "bin")] : [path.join(rHome, "bin")];
    environment.PATH = [...rPaths, environment.PATH ?? ""].join(path.delimiter);
  }
  return environment;
};

export class ResearchExecutionError extends Error {
  constructor(readonly code: "ENVIRONMENT_FAILURE" | "EXECUTION_FAILURE" | "EXECUTION_TIMEOUT" | "MISSING_ARTIFACT", message: string) {
    super(message);
  }
}

export const getStagesForAxis = (axis: ResearchAxis): readonly ResearchStage[] => {
  if (axis !== "Axis A" && axis !== "Axis B") throw new ResearchExecutionError("EXECUTION_FAILURE", "Unsupported research axis.");
  return getResearchExecutionPlan(axis).map((entry) => ({
    axis: entry.executionAxis,
    script: entry.script,
    group: entry.group
  }));
};

export const resolveResearchScriptPath = (workspace: string, script: string): string => {
  if (!approvedResearchScripts.has(script) || path.basename(script) !== script) {
    throw new ResearchExecutionError("EXECUTION_FAILURE", "An unapproved research entry point was requested.");
  }
  const scriptRoot = path.resolve(workspace, "scripts", "research");
  const resolved = path.resolve(scriptRoot, script);
  if (!resolved.startsWith(`${scriptRoot}${path.sep}`)) {
    throw new ResearchExecutionError("EXECUTION_FAILURE", "An invalid research script path was requested.");
  }
  return resolved;
};

const resolvePython = (): string => {
  if (process.env.RESEARCH_PYTHON) return path.resolve(process.env.RESEARCH_PYTHON);
  return process.platform === "win32"
    ? path.join(repositoryRoot, ".venv", "Scripts", "python.exe")
    : path.join(repositoryRoot, ".venv", "bin", "python");
};

const defaultStageRunner: StageRunner = (stage, context) => new Promise((resolve, reject) => {
  let scriptPath: string;
  try {
    scriptPath = resolveResearchScriptPath(context.workspace, stage.script);
  } catch (error) {
    reject(error);
    return;
  }
  const child = spawn(context.pythonExecutable, [scriptPath], {
    cwd: context.workspace,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: context.environment,
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
  if (fs.existsSync(path.join(environmentRoot, "pyvenv.cfg")) && !fs.existsSync(workspaceEnvironment)) {
    try {
      if (process.platform === "win32" && fs.existsSync(path.join(environmentRoot, "pyvenv.cfg"))) {
        fs.mkdirSync(path.join(workspaceEnvironment, "Scripts"), { recursive: true });
        fs.mkdirSync(path.join(workspaceEnvironment, "Lib"), { recursive: true });
        fs.copyFileSync(path.join(environmentRoot, "pyvenv.cfg"), path.join(workspaceEnvironment, "pyvenv.cfg"));
        fs.copyFileSync(pythonExecutable, path.join(workspaceEnvironment, "Scripts", "python.exe"));
        fs.symlinkSync(path.join(environmentRoot, "Lib", "site-packages"), path.join(workspaceEnvironment, "Lib", "site-packages"), "junction");
      } else {
        fs.symlinkSync(environmentRoot, workspaceEnvironment, "dir");
      }
    } catch {
      fs.rmSync(workspace, { recursive: true, force: true });
      throw new ResearchExecutionError("ENVIRONMENT_FAILURE", "The isolated workspace could not link the local research environment.");
    }
  }
  return workspace;
};

export const runResearchPipeline = async (
  uploadDirectory: string,
  axis: ResearchAxis,
  options: { runner?: StageRunner; timeoutMs?: number; pythonExecutable?: string } = {}
): Promise<ResearchExecution> => {
  const executionId = `analysis-${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
  const pythonExecutable = options.pythonExecutable ?? resolvePython();
  const workspace = prepareWorkspace(uploadDirectory, executionId, pythonExecutable);
  const workspacePython = options.pythonExecutable || process.platform !== "win32"
    ? pythonExecutable
    : path.join(workspace, ".venv", "Scripts", "python.exe");
  const context: ExecutionContext = { workspace, pythonExecutable: workspacePython, timeoutMs: options.timeoutMs ?? 60 * 60 * 1000, environment: buildResearchEnvironment() };
  const runner = options.runner ?? defaultStageRunner;
  const stages = getStagesForAxis(axis);
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
  if (!fs.existsSync(artifactDirectory)) {
    fs.rmSync(workspace, { recursive: true, force: true });
    throw new ResearchExecutionError("MISSING_ARTIFACT", "Research output directory was not produced.");
  }
  return { executionId, workspace, axisAArtifactDirectory: artifactDirectory, axisBArtifactDirectory: artifactDirectory };
};

/** Compatibility path for the existing coordinated endpoint: Axis B's validated
 * plan includes every Axis A prerequisite followed by all Axis B stages. */
export const runResearchPipelines = async (
  uploadDirectory: string,
  options: { runner?: StageRunner; timeoutMs?: number; pythonExecutable?: string } = {}
): Promise<ResearchExecution> => runResearchPipeline(uploadDirectory, "Axis B", options);
