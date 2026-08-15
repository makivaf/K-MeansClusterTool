import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analysisInputManifest } from "./analysisInputManifest";
import {
  AxisBFrozenPrerequisiteError,
  axisBFrozenPrerequisites,
  reconcileAxisBFrozenPrerequisite,
  sha256File,
  type AxisBFrozenPrerequisiteName,
  type FrozenPrerequisiteAudit
} from "./axisBFrozenPrerequisites";
import {
  AXIS_B_SLOPE_SCRIPT,
  AXIS_B_SLOPE_SHA256,
  buildResearchEnvironment,
  getResearchRPathEntries,
  getStagesForAxis,
  ResearchExecutionError,
  resolveAxisBSlopePython,
  resolveResearchScriptPath,
  resolveResearchStagePython,
  runResearchPipeline,
  runResearchPipelines,
  verifyAxisBSlopeArtifact,
  type ExecutionContext
} from "./researchPipelineOrchestrator";
import {
  DPC_INIT_AXIS_A_CANONICAL_SHA256,
  materializeCanonicalResearchSources,
  ResearchSourceMaterializationError,
  sha256Bytes,
  verifyCanonicalDpcSource
} from "./researchSourceMaterializer";

const upload = fs.mkdtempSync(path.join(os.tmpdir(), "orchestrator-input-"));
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const fakeFrozenAudit = (prerequisite: AxisBFrozenPrerequisiteName): FrozenPrerequisiteAudit => ({
  prerequisite,
  producing_stage: axisBFrozenPrerequisites[prerequisite].producingStage,
  runtime_artifact_role: "runtime reproduction artifact",
  runtime_generated_sha256: axisBFrozenPrerequisites[prerequisite].expectedSha256,
  authoritative_artifact_role: "authoritative frozen artifact",
  authoritative_frozen_sha256: axisBFrozenPrerequisites[prerequisite].expectedSha256,
  semantic_equivalence: true,
  byte_identical: true,
  authoritative_substitution_occurred: false,
  runtime_audit_path: `data/interim/runtime_reproduction/${prerequisite}.json`
});
try {
  const uploadProbe = analysisInputManifest[0];
  if (!uploadProbe) throw new Error("Analysis input manifest is empty");
  const uploadProbeBytes = Buffer.from(`${uploadProbe.requiredColumns.join(",")}\r\n`, "utf8");
  for (const file of analysisInputManifest) {
    fs.writeFileSync(
      path.join(upload, file.filename),
      file.filename === uploadProbe.filename ? uploadProbeBytes : `${file.requiredColumns.join(",")}\n`
    );
  }
  const invoked: string[] = [];
  const result = await runResearchPipelines(upload, {
    pythonExecutable: process.execPath,
    runner: async (stage, context) => {
      invoked.push(stage.script);
      const workspaceUpload = fs.readFileSync(path.join(context.workspace, "data", "raw", "adni", uploadProbe.filename));
      if (!workspaceUpload.equals(uploadProbeBytes)) throw new Error("Upload bytes changed during workspace preparation");
    },
    verifySlopeArtifact: () => AXIS_B_SLOPE_SHA256,
    reconcileFrozenPrerequisite: (_workspace, prerequisite) => fakeFrozenAudit(prerequisite)
  });
  if (invoked.length === 0 || getStagesForAxis("Axis A").length === 0 || getStagesForAxis("Axis B").length === 0) throw new Error("Approved stages were not invoked");
  if (!result.axisAArtifactDirectory.endsWith(path.join("data", "interim"))) throw new Error("Unexpected artifact boundary");
  console.log("PASS orchestrator: approved ordered stages with injected process runner");
  fs.rmSync(result.workspace, { recursive: true, force: true });
  console.log("PASS workspace materialization: upload bytes remain unchanged");

  const materializationFixture = fs.mkdtempSync(path.join(os.tmpdir(), "research-source-materialization-"));
  try {
    const source = path.join(materializationFixture, "source");
    const destination = path.join(materializationFixture, "destination");
    fs.mkdirSync(source, { recursive: true });
    const crlfPython = Buffer.from("print('crlf')\r\nprint('second')\r\n", "utf8");
    const expectedCanonicalPython = Buffer.from("print('crlf')\nprint('second')\n", "utf8");
    const lfPython = Buffer.from("print('lf')\n", "utf8");
    const csv = Buffer.from("value\r\n1\r\n", "utf8");
    const json = Buffer.from("{\r\n  \"value\": 1\r\n}\r\n", "utf8");
    const binary = Buffer.from([0, 13, 10, 255, 13, 1]);
    fs.writeFileSync(path.join(source, "crlf.py"), crlfPython);
    fs.writeFileSync(path.join(source, "lf.py"), lfPython);
    fs.writeFileSync(path.join(source, "data.csv"), csv);
    fs.writeFileSync(path.join(source, "artifact.json"), json);
    fs.writeFileSync(path.join(source, "binary.dat"), binary);
    fs.copyFileSync(
      path.join(repositoryRoot, "scripts", "research", "dpc_init_axis_a.py"),
      path.join(source, "dpc_init_axis_a.py")
    );

    materializeCanonicalResearchSources(source, destination);
    if (!fs.readFileSync(path.join(destination, "crlf.py")).equals(expectedCanonicalPython)) {
      throw new Error("CRLF Python source did not materialize as LF");
    }
    if (!fs.readFileSync(path.join(destination, "lf.py")).equals(lfPython)) {
      throw new Error("LF Python source changed during materialization");
    }
    for (const [filename, expected] of [["data.csv", csv], ["artifact.json", json], ["binary.dat", binary]] as const) {
      if (!fs.readFileSync(path.join(destination, filename)).equals(expected)) {
        throw new Error(`${filename} was incorrectly normalized`);
      }
    }
    const dpcHash = verifyCanonicalDpcSource(destination);
    if (dpcHash !== DPC_INIT_AXIS_A_CANONICAL_SHA256) throw new Error("Canonical DPC source hash changed");
    if (sha256Bytes(fs.readFileSync(path.join(destination, "dpc_init_axis_a.py"))) !== DPC_INIT_AXIS_A_CANONICAL_SHA256) {
      throw new Error("Materialized DPC source does not match the historical Git blob");
    }
    try {
      verifyCanonicalDpcSource(destination, "0".repeat(64));
      throw new Error("Incorrect canonical source hash accepted");
    } catch (error) {
      if (error instanceof Error && error.message === "Incorrect canonical source hash accepted") throw error;
      if (!(error instanceof ResearchSourceMaterializationError)) throw error;
    }
  } finally {
    fs.rmSync(materializationFixture, { recursive: true, force: true });
  }
  console.log("PASS workspace materialization: Python-only LF canonicalization, exact DPC hash, and raw non-Python bytes");

  const invalidSources = fs.mkdtempSync(path.join(os.tmpdir(), "invalid-research-source-"));
  const workDirectory = path.join(repositoryRoot, "apps", "api", "work");
  const workEntriesBefore = fs.existsSync(workDirectory) ? fs.readdirSync(workDirectory).sort() : [];
  try {
    fs.writeFileSync(path.join(invalidSources, "dpc_init_axis_a.py"), "print('not authoritative')\r\n", "utf8");
    await runResearchPipeline(upload, "Axis A", {
      pythonExecutable: process.execPath,
      researchScriptsDirectory: invalidSources,
      runner: async () => { throw new Error("A stage ran after canonical source failure"); }
    });
    throw new Error("Incorrect canonical source hash accepted by pipeline");
  } catch (error) {
    if (error instanceof Error && error.message === "Incorrect canonical source hash accepted by pipeline") throw error;
    if (!(error instanceof ResearchExecutionError) || error.code !== "EXECUTION_FAILURE") throw error;
  } finally {
    fs.rmSync(invalidSources, { recursive: true, force: true });
  }
  const workEntriesAfter = fs.existsSync(workDirectory) ? fs.readdirSync(workDirectory).sort() : [];
  if (JSON.stringify(workEntriesAfter) !== JSON.stringify(workEntriesBefore)) {
    throw new Error("Canonical source failure left an execution workspace behind");
  }
  console.log("PASS workspace materialization: incorrect DPC source hash hard-fails before execution and cleans the workspace");

  const axisAStages: string[] = [];
  const axisAResult = await runResearchPipeline(upload, "Axis A", { pythonExecutable: process.execPath, runner: async (stage) => { axisAStages.push(stage.script); } });
  const expectedAxisA = [
    "audit_adni.py", "audit_adni_candidate_mapping.py", "reconcile_adni_dictionary.py",
    "construct_axis_a_study_entry.py", "audit_axis_a_scope_npiq.py", "preprocess_axis_a.py",
    "check_sop2_environment.py", "select_axis_a_k_nbclust.py", "dpc_init_axis_a.py",
    "run_axis_a_enhanced_kmeans.py", "run_axis_a_baseline_comparison.py", "run_axis_a_dpc_ablation.py"
  ];
  if (JSON.stringify(axisAStages) !== JSON.stringify(expectedAxisA)) throw new Error("Axis A stage order changed");
  fs.rmSync(axisAResult.workspace, { recursive: true, force: true });
  console.log("PASS orchestrator: Axis A validated stage order");

  const axisBPlan = getStagesForAxis("Axis B").map((stage) => stage.script);
  if (JSON.stringify(axisBPlan.slice(0, expectedAxisA.length)) !== JSON.stringify(expectedAxisA)) throw new Error("Axis B plan omitted Axis A prerequisites");
  if (axisBPlan.at(-1) !== "summarize_axis_b_results.py") throw new Error("Axis B plan did not finish with final validation summary");
  console.log("PASS orchestrator: Axis B plan includes ordered Axis A prerequisites");

  const rHome = path.join("C:", "Program Files", "R", "R-4.6.1");
  const windowsRPaths = getResearchRPathEntries(rHome, "win32");
  if (JSON.stringify(windowsRPaths) !== JSON.stringify([path.join(rHome, "bin"), path.join(rHome, "bin", "x64")])) {
    throw new Error("Windows R PATH order does not prefer the top-level R executable");
  }
  const preservedPath = path.join("C:", "existing", "tools");
  const windowsEnvironment = buildResearchEnvironment({ RESEARCH_R_HOME: rHome, PATH: preservedPath }, "win32");
  if (windowsEnvironment.R_HOME !== rHome) throw new Error("Configured R_HOME was not preserved");
  if (windowsEnvironment.PATH !== [...windowsRPaths, preservedPath].join(path.delimiter)) {
    throw new Error("Existing PATH was not preserved after the R entries");
  }
  if (JSON.stringify(getResearchRPathEntries("/opt/R", "linux")) !== JSON.stringify([path.join("/opt/R", "bin")])) {
    throw new Error("Non-Windows R PATH behavior changed");
  }
  console.log("PASS orchestrator: Windows R bin precedes bin/x64, existing PATH is preserved, and Linux behavior is unchanged");

  const normalStage = getStagesForAxis("Axis A")[0];
  const slopeStage = getStagesForAxis("Axis B").find((stage) => stage.script === AXIS_B_SLOPE_SCRIPT);
  if (!normalStage || !slopeStage) throw new Error("Required interpreter-resolution stages were not found");
  const context: ExecutionContext = {
    workspace: result.workspace,
    pythonExecutable: "project-python",
    axisBSlopePythonExecutable: "historical-python",
    timeoutMs: 1,
    environment: {}
  };
  if (resolveResearchStagePython(normalStage, context) !== "project-python") throw new Error("Normal stage did not retain the project interpreter");
  if (resolveResearchStagePython(slopeStage, context) !== "historical-python") throw new Error("Axis B slope stage did not use its dedicated interpreter");
  if (resolveAxisBSlopePython({ AXIS_B_SLOPE_PYTHON: process.execPath }) !== path.normalize(process.execPath)) {
    throw new Error("Valid dedicated Axis B slope interpreter did not resolve");
  }
  console.log("PASS orchestrator: only Axis B slope extraction selects the dedicated interpreter");

  for (const invalidInterpreter of ["relative-python", path.join(os.tmpdir(), "missing-axis-b-python.exe")]) {
    try {
      resolveAxisBSlopePython({ AXIS_B_SLOPE_PYTHON: invalidInterpreter });
      throw new Error("Invalid dedicated Axis B slope interpreter accepted");
    } catch (error) {
      if (error instanceof Error && error.message === "Invalid dedicated Axis B slope interpreter accepted") throw error;
      if (!(error instanceof ResearchExecutionError) || error.code !== "ENVIRONMENT_FAILURE") throw error;
    }
  }
  console.log("PASS orchestrator: invalid dedicated Axis B slope interpreter fails in a controlled way");

  const repositoryInterim = path.join(repositoryRoot, "data", "interim");
  const createFrozenFixture = (prerequisite: AxisBFrozenPrerequisiteName) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), `axis-b-${prerequisite}-`));
    const workspace = path.join(root, "workspace");
    const authoritative = path.join(root, "authoritative");
    fs.mkdirSync(path.join(workspace, "data", "interim"), { recursive: true });
    fs.mkdirSync(authoritative, { recursive: true });
    const filename = axisBFrozenPrerequisites[prerequisite].filename;
    fs.copyFileSync(path.join(repositoryInterim, filename), path.join(authoritative, filename));
    return { root, workspace, authoritative, filename };
  };
  const writeRuntimeJson = (fixture: ReturnType<typeof createFrozenFixture>, value: unknown) => {
    fs.writeFileSync(path.join(fixture.workspace, "data", "interim", fixture.filename), `${JSON.stringify(value, null, 2)}\n`, "utf8");
  };
  const authoritativeK = JSON.parse(fs.readFileSync(path.join(repositoryInterim, axisBFrozenPrerequisites.k_selection.filename), "utf8"));

  const pathOnlyFixture = createFrozenFixture("k_selection");
  try {
    const runtimeK = structuredClone(authoritativeK);
    runtimeK.environment_validation.python_executable = path.join(pathOnlyFixture.workspace, ".venv", "Scripts", "python.exe");
    runtimeK.outputs.summary_path = path.join(pathOnlyFixture.workspace, "data", "interim", pathOnlyFixture.filename);
    runtimeK.secondary_diagnostic_kmeans.metrics[1].inertia += 5e-12;
    writeRuntimeJson(pathOnlyFixture, runtimeK);
    const runtimeHash = sha256File(path.join(pathOnlyFixture.workspace, "data", "interim", pathOnlyFixture.filename));
    if (runtimeHash === axisBFrozenPrerequisites.k_selection.expectedSha256) throw new Error("Path-only fixture did not create a byte mismatch");
    const audit = reconcileAxisBFrozenPrerequisite(pathOnlyFixture.workspace, "k_selection", {
      authoritativeDirectory: pathOnlyFixture.authoritative
    });
    if (!audit.semantic_equivalence || !audit.authoritative_substitution_occurred || audit.runtime_generated_sha256 !== runtimeHash) {
      throw new Error("Path-only runtime artifact did not produce the expected substitution audit");
    }
    const inertiaAudit = audit.numerical_reproducibility;
    const k3Inertia = inertiaAudit?.comparisons.find((comparison) => comparison.k === 3);
    if (
      !inertiaAudit
      || inertiaAudit.tolerance !== 1e-11
      || !k3Inertia
      || !k3Inertia.equivalent
      || k3Inertia.absolute_difference <= 0
      || k3Inertia.absolute_difference > inertiaAudit.tolerance
    ) {
      throw new Error("Within-tolerance inertia difference was not recorded under the numerical reproducibility contract");
    }
    if (sha256File(path.join(pathOnlyFixture.workspace, "data", "interim", pathOnlyFixture.filename)) !== axisBFrozenPrerequisites.k_selection.expectedSha256) {
      throw new Error("Authoritative k-selection artifact was not copied byte-for-byte");
    }
    if (sha256File(path.join(pathOnlyFixture.workspace, "data", "interim", "runtime_reproduction", "axis_b_nbclust_k_selection.runtime.json")) !== runtimeHash) {
      throw new Error("Runtime k-selection artifact was not preserved for audit");
    }
  } finally {
    fs.rmSync(pathOnlyFixture.root, { recursive: true, force: true });
  }
  console.log("PASS frozen prerequisite: path and within-tolerance inertia mismatch is audited before authoritative substitution");

  for (const mismatch of ["inertia", "vote", "selected_k", "slope_hash", "candidate_configuration", "unrelated_numeric"] as const) {
    const fixture = createFrozenFixture("k_selection");
    try {
      const runtimeK = structuredClone(authoritativeK);
      if (mismatch === "inertia") runtimeK.secondary_diagnostic_kmeans.metrics[1].inertia += 2e-11;
      if (mismatch === "vote") runtimeK.vote_distribution[0].usable_nbclust_votes += 1;
      if (mismatch === "selected_k") runtimeK.selection.selected_k = 3;
      if (mismatch === "slope_hash") runtimeK.one_dimensional_input_validation.input_sha256 = "0".repeat(64);
      if (mismatch === "candidate_configuration") runtimeK.nbclust_configuration.max_nc = 9;
      if (mismatch === "unrelated_numeric") runtimeK.secondary_diagnostic_kmeans.metrics[1].silhouette += 1e-13;
      writeRuntimeJson(fixture, runtimeK);
      const runtimePath = path.join(fixture.workspace, "data", "interim", fixture.filename);
      const runtimeHashBefore = sha256File(runtimePath);
      try {
        reconcileAxisBFrozenPrerequisite(fixture.workspace, "k_selection", { authoritativeDirectory: fixture.authoritative });
        throw new Error(`${mismatch} mismatch accepted`);
      } catch (error) {
        if (error instanceof Error && error.message === `${mismatch} mismatch accepted`) throw error;
        if (!(error instanceof AxisBFrozenPrerequisiteError) || !error.message.includes("scientific equivalence")) throw error;
      }
      if (sha256File(runtimePath) !== runtimeHashBefore) {
        throw new Error(`${mismatch} failure substituted authoritative bytes before the full contract passed`);
      }
      if (fs.existsSync(path.join(fixture.workspace, "data", "interim", "runtime_reproduction"))) {
        throw new Error(`${mismatch} failure created a successful runtime audit`);
      }
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  }
  console.log("PASS frozen prerequisite: over-tolerance inertia and every exact-field mismatch fail before substitution");

  const authoritativeFailures = ["missing", "wrong_hash", "bad_copy"] as const;
  for (const failure of authoritativeFailures) {
    const fixture = createFrozenFixture("k_selection");
    try {
      const runtimeK = structuredClone(authoritativeK);
      runtimeK.environment_validation.python_executable = path.join(fixture.workspace, ".venv", "Scripts", "python.exe");
      writeRuntimeJson(fixture, runtimeK);
      const authoritativePath = path.join(fixture.authoritative, fixture.filename);
      if (failure === "missing") fs.rmSync(authoritativePath);
      if (failure === "wrong_hash") fs.writeFileSync(authoritativePath, "{}\n", "utf8");
      try {
        reconcileAxisBFrozenPrerequisite(fixture.workspace, "k_selection", {
          authoritativeDirectory: fixture.authoritative,
          copyFile: failure === "bad_copy" ? (_source, destination) => fs.writeFileSync(destination, "corrupt\n", "utf8") : undefined
        });
        throw new Error(`${failure} authoritative failure accepted`);
      } catch (error) {
        if (error instanceof Error && error.message === `${failure} authoritative failure accepted`) throw error;
        if (!(error instanceof AxisBFrozenPrerequisiteError)) throw error;
      }
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  }
  console.log("PASS frozen prerequisite: missing, wrong-hash, and corrupted-copy authoritative artifacts fail hard");

  const dpcFixture = createFrozenFixture("dpc_seed_selection");
  try {
    fs.copyFileSync(
      path.join(dpcFixture.authoritative, dpcFixture.filename),
      path.join(dpcFixture.workspace, "data", "interim", dpcFixture.filename)
    );
    const audit = reconcileAxisBFrozenPrerequisite(dpcFixture.workspace, "dpc_seed_selection", {
      authoritativeDirectory: dpcFixture.authoritative
    });
    if (!audit.semantic_equivalence || !audit.byte_identical || audit.authoritative_substitution_occurred) {
      throw new Error("Byte-identical DPC prerequisite did not pass its explicit scientific contract");
    }
  } finally {
    fs.rmSync(dpcFixture.root, { recursive: true, force: true });
  }
  console.log("PASS frozen prerequisite: DPC audit has an explicit scientific contract and byte-identical path");

  const exactHashWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), "axis-b-slope-hash-"));
  try {
    const exactHashDirectory = path.join(exactHashWorkspace, "data", "interim");
    fs.mkdirSync(exactHashDirectory, { recursive: true });
    fs.copyFileSync(
      path.join(repositoryRoot, "data", "interim", "axis_b_adas13_slopes.csv"),
      path.join(exactHashDirectory, "axis_b_adas13_slopes.csv")
    );
    if (verifyAxisBSlopeArtifact(exactHashWorkspace) !== AXIS_B_SLOPE_SHA256) throw new Error("Authoritative Axis B slope hash was rejected");
  } finally {
    fs.rmSync(exactHashWorkspace, { recursive: true, force: true });
  }
  console.log("PASS orchestrator: authoritative Axis B slope artifact passes exact SHA-256 preflight");

  const mismatchStages: string[] = [];
  let mismatchWorkspace = "";
  try {
    await runResearchPipeline(upload, "Axis B", {
      pythonExecutable: process.execPath,
      runner: async (stage, stageContext) => {
        mismatchStages.push(stage.script);
        mismatchWorkspace = stageContext.workspace;
        if (stage.script === AXIS_B_SLOPE_SCRIPT) {
          fs.writeFileSync(path.join(stageContext.workspace, "data", "interim", "axis_b_adas13_slopes.csv"), "not-authoritative\n");
        }
      }
    });
    throw new Error("Mismatched Axis B slope artifact accepted");
  } catch (error) {
    if (error instanceof Error && error.message === "Mismatched Axis B slope artifact accepted") throw error;
    if (!(error instanceof ResearchExecutionError) || error.code !== "EXECUTION_FAILURE") throw error;
  }
  if (mismatchStages.includes("select_axis_b_k_nbclust.py")) throw new Error("Axis B continued to k-selection after slope hash failure");
  if (!mismatchWorkspace || fs.existsSync(mismatchWorkspace)) throw new Error("Failed Axis B slope workspace was not cleaned");
  console.log("PASS orchestrator: slope hash mismatch stops before k-selection and cleans the workspace");

  let prerequisiteWorkspace = "";
  const prerequisiteStages: string[] = [];
  try {
    await runResearchPipeline(upload, "Axis B", {
      pythonExecutable: process.execPath,
      runner: async (stage, stageContext) => {
        prerequisiteWorkspace = stageContext.workspace;
        prerequisiteStages.push(stage.script);
      },
      verifySlopeArtifact: () => AXIS_B_SLOPE_SHA256,
      reconcileFrozenPrerequisite: () => { throw new AxisBFrozenPrerequisiteError("Runtime scientific equivalence failed: test.json."); }
    });
    throw new Error("Prerequisite equivalence failure accepted");
  } catch (error) {
    if (error instanceof Error && error.message === "Prerequisite equivalence failure accepted") throw error;
    if (!(error instanceof ResearchExecutionError) || error.code !== "EXECUTION_FAILURE") throw error;
  }
  if (prerequisiteStages.includes("select_axis_b_dpc_seeds.py")) throw new Error("Pipeline continued after prerequisite equivalence failure");
  if (!prerequisiteWorkspace || fs.existsSync(prerequisiteWorkspace)) throw new Error("Prerequisite failure workspace was not cleaned");
  console.log("PASS orchestrator: prerequisite equivalence failure stops downstream execution and cleans the workspace");

  try {
    resolveResearchScriptPath(result.workspace, "../audit_adni.py");
    throw new Error("Research script traversal accepted");
  } catch (error) {
    if (error instanceof Error && error.message === "Research script traversal accepted") throw error;
  }
  console.log("PASS orchestrator: research script path traversal rejected");

  try { getStagesForAxis("Axis C" as "Axis A"); throw new Error("Invalid axis accepted"); } catch (error) {
    if (error instanceof Error && error.message === "Invalid axis accepted") throw error;
  }
  console.log("PASS orchestrator: invalid axis rejected");

  let exposed = "";
  try {
    await runResearchPipelines(upload, { pythonExecutable: process.execPath, runner: async () => { throw new Error("PTID=001_S_SECRET C:\\sensitive\\file.csv"); } });
  } catch (error) { exposed = error instanceof Error ? error.message : ""; }
  if (exposed.includes("PTID=") || exposed.includes("sensitive")) throw new Error("Injected process detail crossed the sanitization boundary");
  console.log("PASS orchestrator: injected process failure is sanitized");

  try {
    await runResearchPipelines(upload, { pythonExecutable: process.execPath, runner: async () => { throw new ResearchExecutionError("EXECUTION_TIMEOUT", "Axis A research stage timed out: audit_adni.py"); } });
    throw new Error("Timeout accepted");
  } catch (error) {
    if (error instanceof Error && error.message === "Timeout accepted") throw error;
    if (!(error instanceof ResearchExecutionError) || error.code !== "EXECUTION_TIMEOUT") throw error;
  }
  console.log("PASS orchestrator: timeout classification preserved");
} finally {
  fs.rmSync(upload, { recursive: true, force: true });
}
