import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ResearchProgressStage } from "../../../../packages/shared/src/schema";
import { validateAnalysisInputManifest } from "./analysisInputManifest";
import {
  approvedResearchScripts,
  getResearchExecutionPlan,
  type ResearchStageGroup
} from "./researchStageManifest";
import {
  DPC_INITIALIZER_CANONICAL_SHA256,
  materializeCanonicalResearchSources,
  ResearchSourceMaterializationError,
  verifyCanonicalDpcSource
} from "./researchSourceMaterializer";
import { researchWorkRoot } from "./localResearchWorkspaceStore";

export type ResearchStage = { script: string; group: ResearchStageGroup };
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
  artifactDirectory: string;
};

export type ResearchProgressCallback = (
  stage: ResearchProgressStage,
  completedStages: number,
  totalStages: number
) => void;

const serviceDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(serviceDirectory, "../../../..");
const authoritativeScripts = path.join(repositoryRoot, "scripts", "research");
export const UNIFIED_AGGREGATE_FILENAME = "unified_research_result.json";

export const getResearchRPathEntries = (rHome: string, platform: NodeJS.Platform = process.platform): string[] =>
  platform === "win32"
    ? [path.join(rHome, "bin"), path.join(rHome, "bin", "x64")]
    : [path.join(rHome, "bin")];

export const buildResearchEnvironment = (
  source: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform
): NodeJS.ProcessEnv => {
  const environment: NodeJS.ProcessEnv = { PYTHONUNBUFFERED: "1" };
  const passThroughKeys = [
    "PATH", "PATHEXT", "SYSTEMROOT", "WINDIR", "COMSPEC", "TEMP", "TMP",
    "USERPROFILE", "HOME", "LANG", "LC_ALL", "TZ", "R_LIBS", "R_LIBS_USER"
  ] as const;
  for (const key of passThroughKeys) if (source[key]) environment[key] = source[key];
  const rHome = source.RESEARCH_R_HOME ?? source.R_HOME;
  if (rHome) {
    environment.R_HOME = rHome;
    environment.PATH = [...getResearchRPathEntries(rHome, platform), environment.PATH ?? ""].join(path.delimiter);
  }
  return environment;
};

export class ResearchExecutionError extends Error {
  constructor(
    readonly code: "ENVIRONMENT_FAILURE" | "EXECUTION_FAILURE" | "EXECUTION_TIMEOUT" | "MISSING_ARTIFACT",
    message: string
  ) {
    super(message);
  }
}

export const getUnifiedResearchStages = (): readonly ResearchStage[] =>
  getResearchExecutionPlan().map((entry) => ({ script: entry.script, group: entry.group }));

export const resolveResearchScriptPath = (workspace: string, script: string): string => {
  if (!approvedResearchScripts.has(script) || path.isAbsolute(script) || path.extname(script) !== ".py") {
    throw new ResearchExecutionError("EXECUTION_FAILURE", "An unapproved research entry point was requested.");
  }
  const scriptRoot = path.resolve(workspace, "scripts", "research");
  const resolved = path.resolve(scriptRoot, ...script.split("/"));
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

export type ResearchPipelineOptions = {
  runner?: StageRunner;
  timeoutMs?: number;
  overallTimeoutMs?: number;
  pythonExecutable?: string;
  researchScriptsDirectory?: string;
  expectedDpcSourceSha256?: string;
  onProgress?: ResearchProgressCallback;
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
    reject(new ResearchExecutionError("EXECUTION_TIMEOUT", `Research stage timed out: ${stage.script}.`));
  }, context.timeoutMs);
  child.once("error", () => {
    clearTimeout(timer);
    reject(new ResearchExecutionError("ENVIRONMENT_FAILURE", `The local research environment could not start ${stage.script}.`));
  });
  child.once("exit", (code) => {
    clearTimeout(timer);
    if (code === 0) resolve();
    else {
      void diagnostic;
      reject(new ResearchExecutionError("EXECUTION_FAILURE", `Research stage failed: ${stage.script}.`));
    }
  });
});

export const prepareWorkspace = (
  uploadDirectory: string,
  executionId: string,
  pythonExecutable: string,
  researchScriptsDirectory = authoritativeScripts,
  expectedDpcSourceSha256 = DPC_INITIALIZER_CANONICAL_SHA256
): string => {
  validateAnalysisInputManifest(uploadDirectory);
  const workspace = path.join(researchWorkRoot, executionId);
  try {
    const workspaceResearchScripts = path.join(workspace, "scripts", "research");
    materializeCanonicalResearchSources(researchScriptsDirectory, workspaceResearchScripts);
    const dpcSourceHash = verifyCanonicalDpcSource(workspaceResearchScripts, expectedDpcSourceSha256);
    console.info(`[research] Canonical DPC source SHA-256 verified: ${dpcSourceHash}`);

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
      if (process.platform === "win32") {
        fs.mkdirSync(path.join(workspaceEnvironment, "Scripts"), { recursive: true });
        fs.mkdirSync(path.join(workspaceEnvironment, "Lib"), { recursive: true });
        fs.copyFileSync(path.join(environmentRoot, "pyvenv.cfg"), path.join(workspaceEnvironment, "pyvenv.cfg"));
        fs.copyFileSync(pythonExecutable, path.join(workspaceEnvironment, "Scripts", "python.exe"));
        fs.symlinkSync(path.join(environmentRoot, "Lib", "site-packages"), path.join(workspaceEnvironment, "Lib", "site-packages"), "junction");
      } else {
        fs.symlinkSync(environmentRoot, workspaceEnvironment, "dir");
      }
    }
  } catch (error) {
    fs.rmSync(workspace, { recursive: true, force: true });
    if (error instanceof ResearchSourceMaterializationError) {
      throw new ResearchExecutionError("EXECUTION_FAILURE", "The isolated workspace failed canonical research-source verification.");
    }
    throw new ResearchExecutionError("ENVIRONMENT_FAILURE", "The isolated workspace could not be prepared.");
  }
  return workspace;
};

export const runUnifiedResearchPipeline = async (
  uploadDirectory: string,
  options: ResearchPipelineOptions = {}
): Promise<ResearchExecution> => {
  const executionId = `analysis-${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
  const pythonExecutable = options.pythonExecutable ?? resolvePython();
  const stages = getUnifiedResearchStages();
  const totalStages = stages.length + 2;
  options.onProgress?.("preparing_inputs", 0, totalStages);
  const workspace = prepareWorkspace(
    uploadDirectory,
    executionId,
    pythonExecutable,
    options.researchScriptsDirectory,
    options.expectedDpcSourceSha256
  );
  const workspacePython = options.pythonExecutable || process.platform !== "win32"
    ? pythonExecutable
    : path.join(workspace, ".venv", "Scripts", "python.exe");
  const context: ExecutionContext = {
    workspace,
    pythonExecutable: workspacePython,
    timeoutMs: options.timeoutMs ?? 60 * 60 * 1000,
    environment: buildResearchEnvironment()
  };
  const deadline = Date.now() + (options.overallTimeoutMs ?? Number(process.env.RESEARCH_TOTAL_TIMEOUT_MS ?? 4 * 60 * 60 * 1000));
  const runner = options.runner ?? defaultStageRunner;
  try {
    for (const [index, stage] of stages.entries()) {
      options.onProgress?.(stage.group, index + 1, totalStages);
      try {
        const remainingMs = deadline - Date.now();
        if (remainingMs <= 0) throw new ResearchExecutionError("EXECUTION_TIMEOUT", "The overall research execution deadline was reached.");
        await runner(stage, { ...context, timeoutMs: Math.min(context.timeoutMs, remainingMs) });
      } catch (error) {
        if (error instanceof ResearchExecutionError) throw error;
        throw new ResearchExecutionError("EXECUTION_FAILURE", `Research stage failed: ${stage.script}.`);
      }
    }
  } catch (error) {
    fs.rmSync(workspace, { recursive: true, force: true });
    throw error;
  }

  options.onProgress?.("aggregate_artifact_validation", totalStages - 1, totalStages);
  const artifactDirectory = path.join(workspace, "data", "interim");
  const aggregateArtifact = path.join(artifactDirectory, UNIFIED_AGGREGATE_FILENAME);
  if (!fs.existsSync(aggregateArtifact) || !fs.statSync(aggregateArtifact).isFile()) {
    fs.rmSync(workspace, { recursive: true, force: true });
    throw new ResearchExecutionError("MISSING_ARTIFACT", "The unified aggregate research artifact was not produced.");
  }
  return { executionId, workspace, artifactDirectory };
};

/** Compatibility alias for callers migrated from the former coordinated path. */
export const runResearchPipelines = runUnifiedResearchPipeline;
