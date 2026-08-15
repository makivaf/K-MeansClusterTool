import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateAnalysisInputManifest } from "./analysisInputManifest";
import {
  AxisBFrozenPrerequisiteError,
  reconcileAxisBFrozenPrerequisite,
  type AxisBFrozenPrerequisiteName,
  type FrozenPrerequisiteAudit
} from "./axisBFrozenPrerequisites";
import {
  approvedResearchScripts,
  getResearchExecutionPlan,
  type ResearchAxis,
  type ResearchStageGroup
} from "./researchStageManifest";
import {
  DPC_INIT_AXIS_A_CANONICAL_SHA256,
  materializeCanonicalResearchSources,
  ResearchSourceMaterializationError,
  verifyCanonicalDpcSource
} from "./researchSourceMaterializer";

export type { ResearchAxis } from "./researchStageManifest";
export type ResearchStage = { axis: ResearchAxis; script: string; group: ResearchStageGroup };
export type StageRunner = (stage: ResearchStage, context: ExecutionContext) => Promise<void>;

export type ExecutionContext = {
  workspace: string;
  pythonExecutable: string;
  axisBSlopePythonExecutable?: string;
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

export const AXIS_B_SLOPE_SCRIPT = "extract_axis_b_adas13_slopes.py";
export const AXIS_B_SLOPE_SHA256 = "22cdd55303a873d62889a40190caf061f95c4ed81d7d7c82eb8f454886ed0280";

export const getResearchRPathEntries = (rHome: string, platform: NodeJS.Platform = process.platform): string[] =>
  platform === "win32"
    ? [path.join(rHome, "bin"), path.join(rHome, "bin", "x64")]
    : [path.join(rHome, "bin")];

export const buildResearchEnvironment = (
  source: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform
): NodeJS.ProcessEnv => {
  const environment: NodeJS.ProcessEnv = { ...source, PYTHONUNBUFFERED: "1" };
  const rHome = source.RESEARCH_R_HOME ?? source.R_HOME;
  if (rHome) {
    environment.R_HOME = rHome;
    const rPaths = getResearchRPathEntries(rHome, platform);
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

type ResearchPipelineOptions = {
  runner?: StageRunner;
  timeoutMs?: number;
  pythonExecutable?: string;
  verifySlopeArtifact?: (workspace: string) => string;
  reconcileFrozenPrerequisite?: (workspace: string, prerequisite: AxisBFrozenPrerequisiteName) => FrozenPrerequisiteAudit;
  researchScriptsDirectory?: string;
  expectedDpcSourceSha256?: string;
};

export const resolveAxisBSlopePython = (environment: NodeJS.ProcessEnv = process.env): string | undefined => {
  const configured = environment.AXIS_B_SLOPE_PYTHON?.trim();
  if (!configured) return undefined;
  if (!path.isAbsolute(configured)) {
    throw new ResearchExecutionError("ENVIRONMENT_FAILURE", "The configured Axis B slope interpreter is unavailable.");
  }
  try {
    if (!fs.statSync(configured).isFile()) throw new Error("Not a file");
  } catch {
    throw new ResearchExecutionError("ENVIRONMENT_FAILURE", "The configured Axis B slope interpreter is unavailable.");
  }
  return path.normalize(configured);
};

export const resolveResearchStagePython = (stage: ResearchStage, context: ExecutionContext): string =>
  stage.script === AXIS_B_SLOPE_SCRIPT
    ? context.axisBSlopePythonExecutable ?? context.pythonExecutable
    : context.pythonExecutable;

export const verifyAxisBSlopeArtifact = (workspace: string): string => {
  const artifact = path.join(workspace, "data", "interim", "axis_b_adas13_slopes.csv");
  if (!fs.existsSync(artifact) || !fs.statSync(artifact).isFile()) {
    throw new ResearchExecutionError("MISSING_ARTIFACT", "Axis B slope extraction did not produce its required artifact.");
  }
  const actualHash = crypto.createHash("sha256").update(fs.readFileSync(artifact)).digest("hex");
  if (actualHash !== AXIS_B_SLOPE_SHA256) {
    throw new ResearchExecutionError("EXECUTION_FAILURE", "Axis B slope extraction failed its exact reproducibility preflight.");
  }
  return actualHash;
};

const defaultStageRunner: StageRunner = (stage, context) => new Promise((resolve, reject) => {
  let scriptPath: string;
  try {
    scriptPath = resolveResearchScriptPath(context.workspace, stage.script);
  } catch (error) {
    reject(error);
    return;
  }
  const child = spawn(resolveResearchStagePython(stage, context), [scriptPath], {
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

export const prepareWorkspace = (
  uploadDirectory: string,
  executionId: string,
  pythonExecutable: string,
  researchScriptsDirectory = authoritativeScripts,
  expectedDpcSourceSha256 = DPC_INIT_AXIS_A_CANONICAL_SHA256
): string => {
  validateAnalysisInputManifest(uploadDirectory);
  const workspace = path.join(workRoot, executionId);
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
      if (process.platform === "win32" && fs.existsSync(path.join(environmentRoot, "pyvenv.cfg"))) {
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

export const runResearchPipeline = async (
  uploadDirectory: string,
  axis: ResearchAxis,
  options: ResearchPipelineOptions = {}
): Promise<ResearchExecution> => {
  const executionId = `analysis-${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
  const pythonExecutable = options.pythonExecutable ?? resolvePython();
  const environment = buildResearchEnvironment();
  const axisBSlopePythonExecutable = axis === "Axis B" ? resolveAxisBSlopePython(environment) : undefined;
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
    axisBSlopePythonExecutable,
    timeoutMs: options.timeoutMs ?? 60 * 60 * 1000,
    environment
  };
  const runner = options.runner ?? defaultStageRunner;
  const verifySlopeArtifact = options.verifySlopeArtifact ?? verifyAxisBSlopeArtifact;
  const reconcileFrozenPrerequisite = options.reconcileFrozenPrerequisite ?? reconcileAxisBFrozenPrerequisite;
  const stages = getStagesForAxis(axis);
  try {
    for (const stage of stages) {
      try {
        await runner(stage, context);
      } catch (error) {
        if (error instanceof ResearchExecutionError) throw error;
        throw new ResearchExecutionError("EXECUTION_FAILURE", `${stage.axis} research stage failed: ${stage.script}.`);
      }
      if (stage.script === AXIS_B_SLOPE_SCRIPT) {
        const slopeHash = verifySlopeArtifact(workspace);
        console.info(`[research] Axis B slope SHA-256 verified: ${slopeHash}`);
      }
      const frozenPrerequisite = stage.script === "select_axis_b_k_nbclust.py"
        ? "k_selection"
        : stage.script === "select_axis_b_dpc_seeds.py"
          ? "dpc_seed_selection"
          : undefined;
      if (frozenPrerequisite) {
        try {
          const audit = reconcileFrozenPrerequisite(workspace, frozenPrerequisite);
          console.info(`[research] Axis B frozen prerequisite reconciled: ${JSON.stringify(audit)}`);
        } catch (error) {
          if (error instanceof AxisBFrozenPrerequisiteError) {
            throw new ResearchExecutionError("EXECUTION_FAILURE", error.message);
          }
          if (error instanceof ResearchExecutionError) throw error;
          throw new ResearchExecutionError("EXECUTION_FAILURE", `Axis B frozen prerequisite reconciliation failed: ${frozenPrerequisite}.`);
        }
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
  options: ResearchPipelineOptions = {}
): Promise<ResearchExecution> => runResearchPipeline(uploadDirectory, "Axis B", options);
