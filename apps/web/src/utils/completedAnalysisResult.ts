import { RunResponseSchema, type ResearchRunStatus, type UnifiedResearchRun } from "../../../../packages/shared/src/schema";

// Completion alone is insufficient: fetch and validate that job's exact persisted result.
// Scientific artifact/hash validation remains in the existing backend execution adapter.
export const completedAnalysisResult = (job: ResearchRunStatus, payload: unknown): UnifiedResearchRun => {
  if (job.status !== "complete") throw new Error("Analysis has not completed.");
  const result = RunResponseSchema.parse(payload).run;
  if (!("pipeline" in result) || result.pipeline !== "unified" ||
    result.run_id !== job.result_run_id || result.result_source !== "validated_research_output") {
    throw new Error("Completed analysis result identity mismatch.");
  }
  return result;
};
