import type {
  ResearchProgressStage,
  ResearchRunFailureCode,
  ResearchRunRequest,
  ResearchRunStatus
} from "../../../../packages/shared/src/schema";
import { AnalysisInputError } from "./analysisInputManifest";
import {
  executeUnifiedResearch,
  ResearchArtifactError,
  ResearchPersistenceError,
  type UnifiedResearchExecutionResult
} from "./executeUnifiedResearch";
import { removeUploadDirectory } from "./localUploadStore";
import { ResearchExecutionError } from "./researchPipelineOrchestrator";
import { ResearchRunJobRepository } from "./researchRunRepository";

type QueuedTask = {
  runId: string;
  request: ResearchRunRequest;
  uploadDirectory: string;
};

type LifecycleDependencies = {
  repository?: ResearchRunJobRepository;
  execute?: (
    uploadDirectory: string,
    request: ResearchRunRequest,
    onProgress?: (stage: ResearchProgressStage, completedStages: number, totalStages: number) => void
  ) => Promise<UnifiedResearchExecutionResult>;
  cleanupUpload?: (uploadDirectory: string) => void;
  diagnoseFailure?: (runId: string, diagnostic: string) => void;
  maxQueuedTasks?: number;
};

export class ResearchAdmissionError extends Error {}

const safeFailure = (
  code: ResearchRunFailureCode,
  message: string
): { code: ResearchRunFailureCode; message: string } => ({ code, message });

export const sanitizeResearchFailure = (error: unknown): { code: ResearchRunFailureCode; message: string } => {
  if (error instanceof AnalysisInputError) return safeFailure("INVALID_INPUT", "Research input validation failed.");
  if (error instanceof ResearchArtifactError) return safeFailure("ARTIFACT_VALIDATION_FAILURE", "Research aggregate artifacts failed validation.");
  if (error instanceof ResearchPersistenceError) return safeFailure("PERSISTENCE_FAILURE", "The validated aggregate result could not be persisted.");
  if (error instanceof ResearchExecutionError) {
    if (error.code === "ENVIRONMENT_FAILURE") return safeFailure("ENVIRONMENT_FAILURE", "The local research environment could not be started.");
    if (error.code === "EXECUTION_TIMEOUT") return safeFailure("EXECUTION_TIMEOUT", "The research execution timed out.");
    return safeFailure("EXECUTION_FAILURE", "The research pipeline did not complete successfully.");
  }
  return safeFailure("EXECUTION_FAILURE", "The research pipeline did not complete successfully.");
};

const controlledExecutionDiagnosticPatterns = [
  /^Runtime scientific equivalence failed: [A-Za-z0-9_.-]+\.$/,
  /^Research stage failed: [A-Za-z0-9_.-]+\.$/,
  /^The isolated workspace failed canonical research-source verification\.$/,
  /^The unified aggregate research artifact was not produced\.$/
] as const;

/** Retain useful controlled server diagnostics without logging arbitrary
 * exception text that could contain participant identifiers or private paths. */
export const formatResearchFailureDiagnostic = (error: unknown): string => {
  if (error instanceof ResearchExecutionError) {
    const detail = controlledExecutionDiagnosticPatterns.some((pattern) => pattern.test(error.message))
      ? `: ${error.message}`
      : "";
    return `${error.code}${detail}`;
  }
  if (error instanceof AnalysisInputError) return "INVALID_INPUT";
  if (error instanceof ResearchArtifactError) return "ARTIFACT_VALIDATION_FAILURE";
  if (error instanceof ResearchPersistenceError) return "PERSISTENCE_FAILURE";
  return "EXECUTION_FAILURE";
};

export class ResearchRunLifecycle {
  readonly repository: ResearchRunJobRepository;
  private readonly execute: NonNullable<LifecycleDependencies["execute"]>;
  private readonly cleanupUpload: NonNullable<LifecycleDependencies["cleanupUpload"]>;
  private readonly diagnoseFailure: NonNullable<LifecycleDependencies["diagnoseFailure"]>;
  private readonly maxQueuedTasks: number;
  private readonly queue: QueuedTask[] = [];
  private readonly admittedUploadRefs = new Set<string>();
  private draining = false;
  private idleWaiters: Array<() => void> = [];

  constructor(dependencies: LifecycleDependencies = {}) {
    this.repository = dependencies.repository ?? new ResearchRunJobRepository();
    this.execute = dependencies.execute ?? executeUnifiedResearch;
    this.cleanupUpload = dependencies.cleanupUpload ?? removeUploadDirectory;
    this.diagnoseFailure = dependencies.diagnoseFailure
      ?? ((runId, diagnostic) => console.error(`[research] Run ${runId} failed internally: ${diagnostic}`));
    this.maxQueuedTasks = dependencies.maxQueuedTasks ?? Number(process.env.RESEARCH_MAX_QUEUED_RUNS ?? 2);
  }

  enqueue(request: ResearchRunRequest, uploadDirectory: string): ResearchRunStatus {
    if (this.queue.length >= this.maxQueuedTasks) throw new ResearchAdmissionError("The local research queue is full. Try again after an active run finishes.");
    if (this.admittedUploadRefs.has(request.upload_ref)) throw new ResearchAdmissionError("This upload batch is already queued or running.");
    const job = this.repository.create();
    this.queue.push({ runId: job.run_id, request, uploadDirectory });
    this.admittedUploadRefs.add(request.upload_ref);
    queueMicrotask(() => { void this.drain(); });
    return job;
  }

  get(runId: string): ResearchRunStatus | null {
    return this.repository.get(runId);
  }

  whenIdle(): Promise<void> {
    if (!this.draining && this.queue.length === 0) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      let task = this.queue.shift();
      while (task) {
        const currentTask = task;
        this.repository.markRunning(currentTask.runId);
        try {
          const result = await this.execute(
            currentTask.uploadDirectory,
            currentTask.request,
            (stage, completedStages, totalStages) => {
              this.repository.markProgress(currentTask.runId, stage, completedStages, totalStages);
            }
          );
          this.repository.markComplete(currentTask.runId, result);
        } catch (error) {
          try {
            this.diagnoseFailure(currentTask.runId, formatResearchFailureDiagnostic(error));
          } catch {
            console.warn("A research failure diagnostic could not be recorded.");
          }
          this.repository.markFailed(currentTask.runId, sanitizeResearchFailure(error));
        } finally {
          this.admittedUploadRefs.delete(currentTask.request.upload_ref);
          try {
            this.cleanupUpload(currentTask.uploadDirectory);
          } catch {
            console.warn("A completed research upload directory could not be removed.");
          }
        }
        task = this.queue.shift();
      }
    } finally {
      this.draining = false;
      const waiters = this.idleWaiters;
      this.idleWaiters = [];
      waiters.forEach((resolve) => resolve());
    }
  }
}

export const researchRunLifecycle = new ResearchRunLifecycle();
