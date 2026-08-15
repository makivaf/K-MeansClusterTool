import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { axisADevelopmentFixture, axisBDevelopmentFixture } from "../../../../packages/shared/src/dummyRuns";
import { executeAnalysis } from "./executeAnalysis";

const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "execute-analysis-"));
const response = await executeAnalysis("unused-upload", "Validation run", {
  orchestrate: async () => ({ executionId: "analysis-test", workspace, axisAArtifactDirectory: workspace, axisBArtifactDirectory: workspace }),
  adaptAxisA: (_directory, options) => ({ ...axisADevelopmentFixture, run_id: options.runId, title: options.title ?? axisADevelopmentFixture.title, created_at: options.createdAt }),
  adaptAxisB: (_directory, options) => ({ ...axisBDevelopmentFixture, run_id: options.runId, title: options.title ?? axisBDevelopmentFixture.title, created_at: options.createdAt }),
  persist: async (axisA, axisB) => ({ axisA: axisA as typeof axisADevelopmentFixture, axisB: axisB as typeof axisBDevelopmentFixture, persistence: "memory_only" })
});

if (response.axis_a_run_id !== "analysis-test-axis-a" || response.axis_b_run_id !== "analysis-test-axis-b") throw new Error("Coordinated run IDs were not returned");
if (response.persistence !== "memory_only") throw new Error("Non-durable execution was misreported");
if (fs.existsSync(workspace)) throw new Error("Execution workspace was not cleaned");
console.log("PASS execution service: orchestrator, adapters, persistence, response, and cleanup coordinated");
