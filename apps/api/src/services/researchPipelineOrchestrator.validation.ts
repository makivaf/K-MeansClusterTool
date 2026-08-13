import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { analysisInputManifest } from "./analysisInputManifest";
import {
  getStagesForAxis,
  ResearchExecutionError,
  resolveResearchScriptPath,
  runResearchPipeline,
  runResearchPipelines
} from "./researchPipelineOrchestrator";

const upload = fs.mkdtempSync(path.join(os.tmpdir(), "orchestrator-input-"));
try {
  for (const file of analysisInputManifest) fs.writeFileSync(path.join(upload, file.filename), `${file.requiredColumns.join(",")}\n`);
  const invoked: string[] = [];
  const result = await runResearchPipelines(upload, { pythonExecutable: process.execPath, runner: async (stage) => { invoked.push(stage.script); } });
  if (invoked.length === 0 || getStagesForAxis("Axis A").length === 0 || getStagesForAxis("Axis B").length === 0) throw new Error("Approved stages were not invoked");
  if (!result.axisAArtifactDirectory.endsWith(path.join("data", "interim"))) throw new Error("Unexpected artifact boundary");
  console.log("PASS orchestrator: approved ordered stages with injected process runner");
  fs.rmSync(result.workspace, { recursive: true, force: true });

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
