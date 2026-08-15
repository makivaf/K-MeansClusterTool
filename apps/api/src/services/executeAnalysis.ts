import fs from "node:fs";
import type { AxisAClusteringRun, AxisBClusteringRun, ClusterRunResponse } from "../../../../packages/shared/src/schema";
import { ClusterRunResponseSchema } from "../../../../packages/shared/src/schema";
import { adaptAxisAResult } from "./axisAResultAdapter";
import { adaptAxisBResult } from "./axisBResultAdapter";
import { runResearchPipelines, type ResearchExecution } from "./researchPipelineOrchestrator";
import { importAxisResults } from "./runRepository";

type Dependencies = {
  orchestrate?: (uploadDirectory: string) => Promise<ResearchExecution>;
  adaptAxisA?: (directory: string, options: { runId: string; title?: string; createdAt: string }) => AxisAClusteringRun;
  adaptAxisB?: (directory: string, options: { runId: string; title?: string; createdAt: string }) => AxisBClusteringRun;
  persist?: typeof importAxisResults;
};

export const executeAnalysis = async (
  uploadDirectory: string,
  runLabel?: string,
  dependencies: Dependencies = {}
): Promise<ClusterRunResponse> => {
  const execution = await (dependencies.orchestrate ?? runResearchPipelines)(uploadDirectory);
  try {
    const createdAt = new Date().toISOString();
    const axisA = (dependencies.adaptAxisA ?? adaptAxisAResult)(execution.axisAArtifactDirectory, {
      runId: `${execution.executionId}-axis-a`,
      title: runLabel ? `${runLabel} - Axis A` : undefined,
      createdAt
    });
    const axisB = (dependencies.adaptAxisB ?? adaptAxisBResult)(execution.axisBArtifactDirectory, {
      runId: `${execution.executionId}-axis-b`,
      title: runLabel ? `${runLabel} - Axis B` : undefined,
      createdAt
    });
    const imported = await (dependencies.persist ?? importAxisResults)(axisA, axisB);
    return ClusterRunResponseSchema.parse({
      status: "complete",
      persistence: imported.persistence,
      axis_a_run_id: imported.axisA.run_id,
      axis_b_run_id: imported.axisB.run_id
    });
  } finally {
    fs.rmSync(execution.workspace, { recursive: true, force: true });
  }
};
