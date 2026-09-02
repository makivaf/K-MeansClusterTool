import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { adaptUnifiedResult } from "./unifiedResultAdapter";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const artifactDirectory = path.join(repositoryRoot, "data", "interim");
const run = adaptUnifiedResult(artifactDirectory, { runId: "adapter-validation", createdAt: "2026-09-01T00:00:00.000Z" });
if (run.pipeline !== "unified" || run.enhancedClustering.clusterSizes.length !== 2 || run.longitudinal.byOriginalCluster.length !== 2) throw new Error("Unified adapter omitted a required scientific section");

const malformedDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "unified-adapter-malformed-"));
try {
  const malformed = structuredClone(run) as Record<string, unknown>;
  delete malformed.run_id;
  delete malformed.result_source;
  delete malformed.pipeline;
  delete malformed.title;
  delete malformed.description;
  delete malformed.created_at;
  const longitudinal = malformed.longitudinal as Record<string, unknown>;
  longitudinal.participant_rows = [{ RID: "private" }];
  fs.writeFileSync(path.join(malformedDirectory, "unified_research_result.json"), JSON.stringify(malformed), "utf8");
  try {
    adaptUnifiedResult(malformedDirectory);
    throw new Error("Participant-level aggregate contamination was accepted");
  } catch (error) {
    if (error instanceof Error && error.message === "Participant-level aggregate contamination was accepted") throw error;
  }
  console.log("PASS unified adapter: strict aggregate-only contract rejects participant-level contamination");
} finally {
  fs.rmSync(malformedDirectory, { recursive: true, force: true });
}

const staleDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "unified-adapter-stale-model-"));
try {
  for (const filename of ["unified_research_result.json", "unified_longitudinal_mixed_model.json", "unified_longitudinal_mixed_model.csv"]) {
    fs.copyFileSync(path.join(artifactDirectory, filename), path.join(staleDirectory, filename));
  }
  fs.appendFileSync(path.join(staleDirectory, "unified_longitudinal_mixed_model.json"), "\n", "utf8");
  try {
    adaptUnifiedResult(staleDirectory);
    throw new Error("A stale or mismatched mixed-model artifact was accepted");
  } catch (error) {
    if (error instanceof Error && error.message === "A stale or mismatched mixed-model artifact was accepted") throw error;
    if (!(error instanceof Error) || !error.message.includes("provenance hash is invalid")) throw error;
  }
  console.log("PASS unified adapter: stale mixed-model artifacts are rejected by SHA-256 provenance validation");
} finally {
  fs.rmSync(staleDirectory, { recursive: true, force: true });
}
