import crypto from "node:crypto";
import {
  ResearchRunCompleteSchema,
  ResearchRunFailedSchema,
  ResearchRunQueuedSchema,
  ResearchRunRunningSchema,
  type Axis,
  type ResearchRunComplete,
  type ResearchRunFailed,
  type ResearchRunFailureCode,
  type ResearchRunQueued,
  type ResearchRunRunning,
  type ResearchRunStatus
} from "../../../../packages/shared/src/schema";

export class ResearchRunJobRepository {
  private readonly jobs = new Map<string, ResearchRunStatus>();

  create(axis: Axis, now = new Date().toISOString()): ResearchRunQueued {
    const job = ResearchRunQueuedSchema.parse({
      run_id: `research-${Date.now()}-${crypto.randomBytes(6).toString("hex")}`,
      axis,
      status: "queued",
      created_at: now
    });
    this.jobs.set(job.run_id, job);
    return job;
  }

  get(runId: string): ResearchRunStatus | null {
    return this.jobs.get(runId) ?? null;
  }

  markRunning(runId: string, now = new Date().toISOString()): ResearchRunRunning {
    const current = this.require(runId);
    if (current.status !== "queued") throw new Error("Only queued research runs can start.");
    const running = ResearchRunRunningSchema.parse({
      run_id: current.run_id,
      axis: current.axis,
      status: "running",
      created_at: current.created_at,
      started_at: now
    });
    this.jobs.set(runId, running);
    return running;
  }

  markComplete(
    runId: string,
    result: { resultRunId: string; persistence: "durable" | "memory_only" },
    now = new Date().toISOString()
  ): ResearchRunComplete {
    const current = this.require(runId);
    if (current.status !== "running") throw new Error("Only running research runs can complete.");
    const complete = ResearchRunCompleteSchema.parse({
      ...current,
      status: "complete",
      finished_at: now,
      result_run_id: result.resultRunId,
      persistence: result.persistence
    });
    this.jobs.set(runId, complete);
    return complete;
  }

  markFailed(
    runId: string,
    error: { code: ResearchRunFailureCode; message: string },
    now = new Date().toISOString()
  ): ResearchRunFailed {
    const current = this.require(runId);
    if (current.status !== "queued" && current.status !== "running") throw new Error("Finished research runs cannot fail again.");
    const failed = ResearchRunFailedSchema.parse({
      run_id: current.run_id,
      axis: current.axis,
      status: "failed",
      created_at: current.created_at,
      ...(current.status === "running" ? { started_at: current.started_at } : {}),
      finished_at: now,
      error
    });
    this.jobs.set(runId, failed);
    return failed;
  }

  clear(): void {
    this.jobs.clear();
  }

  private require(runId: string): ResearchRunStatus {
    const current = this.jobs.get(runId);
    if (!current) throw new Error("Research run not found.");
    return current;
  }
}
