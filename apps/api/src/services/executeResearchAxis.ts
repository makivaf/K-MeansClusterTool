import fs from "node:fs";
import type {
  AxisAClusteringRun,
  AxisBClusteringRun,
  ClusteringRun,
  ResearchRunRequest
} from "../../../../packages/shared/src/schema";
import { adaptAxisAResult } from "./axisAResultAdapter";
import { adaptAxisBResult } from "./axisBResultAdapter";
import {
  runResearchPipeline,
  type ResearchAxis,
  type ResearchExecution
} from "./researchPipelineOrchestrator";
import { getRunPersistenceMode, importRun } from "./runRepository";

type AdapterOptions = { runId: string; title?: string; createdAt: string };

type Dependencies = {
  orchestrate?: (uploadDirectory: string, axis: ResearchAxis) => Promise<ResearchExecution>;
  adaptAxisA?: (directory: string, options: AdapterOptions) => AxisAClusteringRun;
  adaptAxisB?: (directory: string, options: AdapterOptions) => AxisBClusteringRun;
  persist?: (payload: unknown) => Promise<ClusteringRun>;
  persistenceMode?: () => "durable" | "memory_only";
};

export class ResearchArtifactError extends Error {}
export class ResearchPersistenceError extends Error {}

export type ResearchAxisExecutionResult = {
  resultRunId: string;
  persistence: "durable" | "memory_only";
};

export const executeResearchAxis = async (
  uploadDirectory: string,
  request: ResearchRunRequest,
  dependencies: Dependencies = {}
): Promise<ResearchAxisExecutionResult> => {
  const execution = await (dependencies.orchestrate ?? runResearchPipeline)(uploadDirectory, request.axis);
  try {
    const createdAt = new Date().toISOString();
    const suffix = request.axis === "Axis A" ? "axis-a" : "axis-b";
    const options: AdapterOptions = {
      runId: `${execution.executionId}-${suffix}`,
      title: request.run_label ? `${request.run_label} - ${request.axis}` : undefined,
      createdAt
    };

    let result: ClusteringRun;
    try {
      result = request.axis === "Axis A"
        ? (dependencies.adaptAxisA ?? adaptAxisAResult)(execution.axisAArtifactDirectory, options)
        : (dependencies.adaptAxisB ?? adaptAxisBResult)(execution.axisBArtifactDirectory, options);
    } catch {
      throw new ResearchArtifactError(`The ${request.axis} aggregate artifacts could not be validated.`);
    }

    let persisted: ClusteringRun;
    try {
      persisted = await (dependencies.persist ?? importRun)(result);
    } catch {
      throw new ResearchPersistenceError(`The ${request.axis} aggregate result could not be persisted.`);
    }
    if (persisted.axis !== request.axis) throw new ResearchPersistenceError("The persisted result axis did not match the request.");

    return {
      resultRunId: persisted.run_id,
      persistence: (dependencies.persistenceMode ?? getRunPersistenceMode)()
    };
  } finally {
    fs.rmSync(execution.workspace, { recursive: true, force: true });
  }
};
