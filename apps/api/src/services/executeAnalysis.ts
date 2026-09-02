import type { ClusterRunResponse } from "../../../../packages/shared/src/schema";
import { ClusterRunResponseSchema } from "../../../../packages/shared/src/schema";
import { executeUnifiedResearch, type UnifiedExecutionDependencies } from "./executeUnifiedResearch";

/**
 * Compatibility path for the former synchronous endpoint. It now returns one
 * unified result ID and delegates to the same authoritative workflow as the
 * queued lifecycle.
 */
export const executeAnalysis = async (
  uploadDirectory: string,
  runLabel?: string,
  dependencies: UnifiedExecutionDependencies = {}
): Promise<ClusterRunResponse> => {
  const result = await executeUnifiedResearch(uploadDirectory, {
    upload_ref: "synchronous-local-upload",
    ...(runLabel ? { run_label: runLabel } : {})
  }, undefined, dependencies);
  return ClusterRunResponseSchema.parse({
    status: "complete",
    persistence: result.persistence,
    run_id: result.resultRunId
  });
};
