import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analysisInputManifest } from "./analysisInputManifest";
import {
  getUnifiedResearchStages,
  ResearchExecutionError,
  resolveResearchScriptPath,
  runUnifiedResearchPipeline,
  UNIFIED_AGGREGATE_FILENAME
} from "./researchPipelineOrchestrator";
import { deprecatedLongitudinalClusteringScripts } from "./researchStageManifest";
import { DPC_INITIALIZER_CANONICAL_SHA256, verifyCanonicalDpcSource } from "./researchSourceMaterializer";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const stages = getUnifiedResearchStages();
const scripts = stages.map((stage) => stage.script);
if (scripts.at(-1) !== "longitudinal/consolidate_unified_results.py") throw new Error("Unified aggregate stage is not final");
for (const deprecated of deprecatedLongitudinalClusteringScripts) {
  if (scripts.includes(deprecated)) throw new Error(`Deprecated longitudinal clustering script remains executable: ${deprecated}`);
}
if (!scripts.includes("study_entry/run_enhanced_kmeans.py") || !scripts.includes("longitudinal/construct_longitudinal_cohort.py")) throw new Error("Unified plan lost a required clustering or longitudinal stage");
const mixedModelIndex = scripts.indexOf("longitudinal/fit_longitudinal_mixed_model.py");
const aggregateIndex = scripts.indexOf("longitudinal/consolidate_unified_results.py");
if (mixedModelIndex < 0 || mixedModelIndex >= aggregateIndex) throw new Error("The pre-specified mixed-effects stage must run before unified aggregation");
console.log("PASS orchestrator contract: one plan preserves enhanced clustering and excludes every second-clustering entry point");

const scriptsDirectory = path.join(repositoryRoot, "scripts", "research");
if (verifyCanonicalDpcSource(scriptsDirectory) !== DPC_INITIALIZER_CANONICAL_SHA256) throw new Error("Frozen DPC source hash changed");
try {
  resolveResearchScriptPath(path.resolve("unused-workspace"), "legacy/old_longitudinal_clustering/run_axis_b_final_clustering.py");
  throw new Error("Deprecated slope K-Means entry point was approved");
} catch (error) {
  if (error instanceof Error && error.message === "Deprecated slope K-Means entry point was approved") throw error;
  if (!(error instanceof ResearchExecutionError)) throw error;
}
console.log("PASS provenance gate: canonical DPC source retained and deprecated K-Means path rejected");

const uploadDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "unified-upload-"));
for (const specification of analysisInputManifest) {
  fs.writeFileSync(path.join(uploadDirectory, specification.filename), `${specification.requiredColumns.join(",")}\n`, "utf8");
}
const observedScripts: string[] = [];
const observedProgress: string[] = [];
let executionWorkspace = "";
try {
  const execution = await runUnifiedResearchPipeline(uploadDirectory, {
    pythonExecutable: process.execPath,
    runner: async (stage, context) => {
      if (fs.existsSync(path.join(context.workspace, "scripts", "research", "legacy"))) {
        throw new Error("Legacy research sources were materialized into the active execution workspace");
      }
      observedScripts.push(stage.script);
      if (stage.script === "longitudinal/consolidate_unified_results.py") {
        const interim = path.join(context.workspace, "data", "interim");
        fs.writeFileSync(path.join(interim, UNIFIED_AGGREGATE_FILENAME), "{}\n", "utf8");
      }
    },
    onProgress: (stage) => observedProgress.push(stage)
  });
  executionWorkspace = execution.workspace;
  if (JSON.stringify(observedScripts) !== JSON.stringify(scripts)) throw new Error("One-run orchestrator did not execute the approved plan exactly once and in order");
  if (observedProgress[0] !== "preparing_inputs" || observedProgress.at(-1) !== "aggregate_artifact_validation") throw new Error("Progress lifecycle omitted its preparation or validation boundary");
  if (execution.artifactDirectory !== path.join(execution.workspace, "data", "interim")) throw new Error("Unified artifact directory linkage failed");
  console.log("PASS orchestrator execution: exact ordered stages, progress states, and one aggregate directory");
} finally {
  fs.rmSync(uploadDirectory, { recursive: true, force: true });
  if (executionWorkspace) fs.rmSync(executionWorkspace, { recursive: true, force: true });
}

const missingUpload = fs.mkdtempSync(path.join(os.tmpdir(), "unified-upload-missing-artifact-"));
for (const specification of analysisInputManifest) {
  fs.writeFileSync(path.join(missingUpload, specification.filename), `${specification.requiredColumns.join(",")}\n`, "utf8");
}
try {
  await runUnifiedResearchPipeline(missingUpload, { pythonExecutable: process.execPath, runner: async () => undefined });
  throw new Error("Missing unified aggregate was accepted");
} catch (error) {
  if (error instanceof Error && error.message === "Missing unified aggregate was accepted") throw error;
  if (!(error instanceof ResearchExecutionError) || error.code !== "MISSING_ARTIFACT") throw error;
  console.log("PASS orchestrator failure: stale or missing aggregate cannot be substituted");
} finally {
  fs.rmSync(missingUpload, { recursive: true, force: true });
}
