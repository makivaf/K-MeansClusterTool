import fs from "node:fs";
import type {
  ResearchProgressStage,
  ResearchResult,
  ResearchRunRequest,
  UnifiedResearchRun
} from "../../../../packages/shared/src/schema";
import {
  runUnifiedResearchPipeline,
  type ResearchExecution,
  type ResearchProgressCallback
} from "./researchPipelineOrchestrator";
import { getRunPersistenceMode, importRun } from "./runRepository";
import { adaptUnifiedResult } from "./unifiedResultAdapter";

type AdapterOptions = { runId: string; title?: string; createdAt: string };

export type UnifiedExecutionDependencies = {
  orchestrate?: (uploadDirectory: string, onProgress?: ResearchProgressCallback) => Promise<ResearchExecution>;
  adapt?: (directory: string, options: AdapterOptions) => UnifiedResearchRun;
  persist?: (payload: unknown) => Promise<ResearchResult>;
  persistenceMode?: () => "durable" | "memory_only";
};

export class ResearchArtifactError extends Error {}
export class ResearchPersistenceError extends Error {}

export type UnifiedResearchExecutionResult = {
  resultRunId: string;
  persistence: "durable" | "memory_only";
};

export const executeUnifiedResearch = async (
  uploadDirectory: string,
  request: ResearchRunRequest,
  onProgress?: (stage: ResearchProgressStage, completedStages: number, totalStages: number) => void,
  dependencies: UnifiedExecutionDependencies = {}
): Promise<UnifiedResearchExecutionResult> => {
  const orchestrate = dependencies.orchestrate
    ?? ((directory: string, progress?: ResearchProgressCallback) => runUnifiedResearchPipeline(directory, { onProgress: progress }));
  const execution = await orchestrate(uploadDirectory, onProgress);
  try {
    const createdAt = new Date().toISOString();
    let result: UnifiedResearchRun;
    try {
      result = (dependencies.adapt ?? adaptUnifiedResult)(execution.artifactDirectory, {
        runId: `${execution.executionId}-unified`,
        title: request.run_label,
        createdAt
      });
    } catch {
      throw new ResearchArtifactError("The unified aggregate artifacts could not be validated.");
    }

    let persisted: ResearchResult;
    try {
      persisted = await (dependencies.persist ?? importRun)(result);
    } catch {
      throw new ResearchPersistenceError("The unified aggregate result could not be persisted.");
    }
    if (!("pipeline" in persisted) || persisted.pipeline !== "unified") {
      throw new ResearchPersistenceError("The persisted result did not satisfy the unified research contract.");
    }

    return {
      resultRunId: persisted.run_id,
      persistence: (dependencies.persistenceMode ?? getRunPersistenceMode)()
    };
  } finally {
    fs.rmSync(execution.workspace, { recursive: true, force: true });
  }
};
