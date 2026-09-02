import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { adaptUnifiedResult } from "./unifiedResultAdapter";
import { executeAnalysis } from "./executeAnalysis";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const artifactDirectory = path.join(repositoryRoot, "data", "interim");
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "execute-unified-analysis-"));
const response = await executeAnalysis("unused-upload", "Validation run", {
  orchestrate: async () => ({ executionId: "analysis-test", workspace, artifactDirectory }),
  adapt: (_directory, options) => adaptUnifiedResult(artifactDirectory, {
    runId: options.runId,
    title: options.title,
    createdAt: options.createdAt
  }),
  persist: async (payload) => payload as ReturnType<typeof adaptUnifiedResult>,
  persistenceMode: () => "memory_only"
});

if (response.run_id !== "analysis-test-unified") throw new Error("Unified run ID was not returned");
if (response.persistence !== "memory_only") throw new Error("Non-durable execution was misreported");
if (fs.existsSync(workspace)) throw new Error("Execution workspace was not cleaned");
console.log("PASS execution service: one unified artifact is adapted, persisted, linked, and cleaned");
