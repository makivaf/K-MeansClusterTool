import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analysisInputManifest } from "./analysisInputManifest";
import { buildResearchEnvironment, defaultStageRunner, prepareWorkspace, resolvePython, ResearchExecutionError } from "./researchPipelineOrchestrator";
import { formatResearchFailureDiagnostic } from "./researchRunLifecycle";
import { researchWorkRoot } from "./localResearchWorkspaceStore";

const filename = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(filename), "../../../..");

if (process.argv.includes("--fresh")) {
  const upload = fs.mkdtempSync(path.join(os.tmpdir(), "nbclust-preflight-"));
  let workspace: string | undefined;
  try {
    for (const spec of analysisInputManifest) fs.writeFileSync(path.join(upload, spec.filename), `${spec.requiredColumns.join(",")}\n`);
    workspace = prepareWorkspace(upload, `analysis-${Date.now()}-abcdef123456`, resolvePython());
    const python = process.platform === "win32" ? path.join(workspace, ".venv", "Scripts", "python.exe") : resolvePython();
    const environment = buildResearchEnvironment();
    assert.ok(environment.R_HOME, "R must be discovered without inherited R_HOME");
    await defaultStageRunner({ script: "validation/check_clustering_environment.py", group: "selecting_k" }, { workspace, pythonExecutable: python, environment, timeoutMs: 60000 });
    const selectionScript = path.join(workspace, "scripts/research/study_entry/select_cluster_count_nbclust.py");
    const imported = spawnSync(python, ["-c", "import runpy, sys; runpy.run_path(sys.argv[1], run_name='preflight_import')", selectionScript], { cwd: workspace, env: environment, encoding: "utf8", windowsHide: true, timeout: 60000 });
    assert.equal(imported.status, 0, "The actual NbClust stage must import in the isolated environment");
    console.log("PASS fresh-process isolated .venv: stats, rpy2, small-matrix NbClust execution and stage import");
  } finally {
    if (path.resolve(upload).startsWith(`${path.resolve(os.tmpdir())}${path.sep}`)) fs.rmSync(upload, { recursive: true, force: true });
    if (workspace && path.resolve(workspace).startsWith(`${researchWorkRoot}${path.sep}`)) fs.rmSync(workspace, { recursive: true, force: true });
  }
} else {
  const rHome = path.join(root, "test-r");
  const source = { Path: "system-path", SystemRoot: "system-root", RESEARCH_R_HOME: rHome, R_HOME: "ignored", PRIVATE_KEY: "secret" };
  const environment = buildResearchEnvironment(source, "win32");
  assert.equal(environment.R_HOME, rHome);
  assert.equal(environment.SYSTEMROOT, "system-root");
  assert.equal(environment.PATH, `${path.join(rHome, "bin")};${path.join(rHome, "bin/x64")};system-path`);
  assert.equal(environment.PRIVATE_KEY, undefined);
  assert.equal(source.Path, "system-path");
  assert.match(formatResearchFailureDiagnostic(new ResearchExecutionError("EXECUTION_FAILURE", "Research stage failed: validation/check_clustering_environment.py.")), /validation\/check_clustering_environment.py/);
  assert.equal(formatResearchFailureDiagnostic(new ResearchExecutionError("EXECUTION_FAILURE", "Research stage failed: private/participant.py.")), "EXECUTION_FAILURE");
  assert.equal(resolvePython({ RESEARCH_PYTHON: ".venv/Scripts/python.exe" }), path.join(root, ".venv/Scripts/python.exe"));
  console.log("PASS runtime environment: Windows case-insensitive inheritance, explicit R precedence, DLL paths, repository-relative Python, no parent mutation or secrets");
  if (process.argv.includes("--integration")) {
    for (let restart = 0; restart < 2; restart++) {
      const clean = { ...process.env };
      for (const key of Object.keys(clean)) if (["R_HOME", "RESEARCH_R_HOME", "RESEARCH_PYTHON"].includes(key.toUpperCase())) delete clean[key];
      const child = spawnSync(process.execPath, ["--import", "tsx", filename, "--fresh"], { cwd: path.join(root, "apps/api"), env: clean, encoding: "utf8", windowsHide: true, timeout: 90000 });
      assert.equal(child.status, 0, child.stderr);
      console.log(child.stdout.trim());
    }
    console.log("PASS two fresh API-cwd processes without session R/Python overrides");
  }
}
