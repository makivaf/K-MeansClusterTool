import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { analysisInputManifest } from "./analysisInputManifest";
import { getStagesForAxis, ResearchExecutionError, runResearchPipelines } from "./researchPipelineOrchestrator";

const upload = fs.mkdtempSync(path.join(os.tmpdir(), "orchestrator-input-"));
try {
  for (const file of analysisInputManifest) fs.writeFileSync(path.join(upload, file.filename), `${file.requiredColumns.join(",")}\n`);
  const invoked: string[] = [];
  const result = await runResearchPipelines(upload, { pythonExecutable: process.execPath, runner: async (stage) => { invoked.push(stage.script); } });
  if (invoked.length === 0 || getStagesForAxis("Axis A").length === 0 || getStagesForAxis("Axis B").length === 0) throw new Error("Approved stages were not invoked");
  if (!result.axisAArtifactDirectory.endsWith(path.join("data", "interim"))) throw new Error("Unexpected artifact boundary");
  console.log("PASS orchestrator: approved ordered stages with injected process runner");
  fs.rmSync(result.workspace, { recursive: true, force: true });

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
