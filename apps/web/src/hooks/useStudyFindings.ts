import { useCallback, useEffect, useRef, useState } from "react";
import { ResearchRunResponseSchema, type ResearchRunStatus, type UnifiedResearchRun } from "../../../../packages/shared/src/schema";
import { API_BASE_URL } from "../config/api";
import { completedAnalysisResult } from "../utils/completedAnalysisResult";

export const ANALYSIS_JOB_KEY = "ad-clustering.analysis-job";
type Status = "idle" | "submitting" | "queued" | "running" | "verifying" | "complete" | "failed" | "admission_failed" | "interrupted";
type State = { status: Status; run: UnifiedResearchRun | null; error: string | null; jobId: string | null; stage: string | null };
const empty: State = { status: "idle", run: null, error: null, jobId: null, stage: null };
const delay = (signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  const abort = () => { clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); };
  const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, 1000);
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) abort();
});

export const useStudyFindings = () => {
  const [state, setState] = useState<State>(() => sessionStorage.getItem(ANALYSIS_JOB_KEY)
    ? { ...empty, status: "verifying" } : empty);
  const controllerRef = useRef<AbortController | null>(null);
  const lockedRef = useRef(false);
  const monitor = useCallback(async (jobId: string, controller: AbortController, initial?: ResearchRunStatus) => {
    let job = initial;
    while (!controller.signal.aborted) {
      if (!job) {
        const response = await fetch(`${API_BASE_URL}/api/research/runs/${encodeURIComponent(jobId)}`, { signal: controller.signal });
        if (response.status === 404) {
          sessionStorage.removeItem(ANALYSIS_JOB_KEY);
          lockedRef.current = false;
          setState({ ...empty, status: "failed", error: "Previous analysis status is unavailable. Validate and run the datasets again." });
          return;
        }
        if (!response.ok) throw new Error("Unable to check analysis status.");
        job = ResearchRunResponseSchema.parse(await response.json()).run;
      }
      if (job.run_id !== jobId) throw new Error("Analysis job identity mismatch.");
      if (job.status === "failed") {
        sessionStorage.removeItem(ANALYSIS_JOB_KEY);
        lockedRef.current = false;
        setState({ ...empty, status: "failed", error: job.error.message });
        return;
      }
      if (job.status === "complete") {
        setState({ ...empty, status: "verifying", jobId });
        const response = await fetch(`${API_BASE_URL}/api/runs/${encodeURIComponent(job.result_run_id)}`, { signal: controller.signal });
        if (!response.ok) throw new Error("Completed analysis result is unavailable.");
        const run = completedAnalysisResult(job, await response.json());
        if (controller.signal.aborted) return;
        lockedRef.current = false;
        setState({ ...empty, status: "complete", run, jobId });
        return;
      }
      setState({ ...empty, status: job.status, jobId, stage: job.status === "running" ? job.progress.stage : null });
      await delay(controller.signal);
      job = undefined;
    }
  }, []);

  const resume = useCallback(async (jobId: string) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    lockedRef.current = true;
    setState({ ...empty, status: "verifying", jobId });
    try { await monitor(jobId, controller); }
    catch (caught) {
      if (!controller.signal.aborted) setState({ ...empty, status: "interrupted", jobId,
        error: caught instanceof Error ? caught.message : "Unable to verify analysis. Resume status checking." });
    }
  }, [monitor]);

  useEffect(() => {
    const jobId = sessionStorage.getItem(ANALYSIS_JOB_KEY);
    if (jobId) void resume(jobId);
    return () => controllerRef.current?.abort();
  }, [resume]);

  const reset = useCallback(() => {
    if (lockedRef.current) return;
    controllerRef.current?.abort();
    sessionStorage.removeItem(ANALYSIS_JOB_KEY);
    setState(empty);
  }, []);

  const start = async (uploadRef: string) => {
    if (lockedRef.current || !uploadRef) return;
    lockedRef.current = true;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    sessionStorage.removeItem(ANALYSIS_JOB_KEY);
    setState({ ...empty, status: "submitting" });
    let jobId: string | null = null;
    try {
      const response = await fetch(`${API_BASE_URL}/api/research/runs`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ upload_ref: uploadRef }), signal: controller.signal
      });
      if (!response.ok) {
        lockedRef.current = false;
        setState({ ...empty, status: "admission_failed", error: `Analysis was not admitted (HTTP ${response.status}). Validate the datasets again before retrying.` });
        return;
      }
      const job = ResearchRunResponseSchema.parse(await response.json()).run;
      jobId = job.run_id;
      sessionStorage.setItem(ANALYSIS_JOB_KEY, jobId);
      await monitor(jobId, controller, job);
    } catch (caught) {
      if (!controller.signal.aborted) setState({ ...empty, status: "interrupted", jobId,
        error: jobId ? (caught instanceof Error ? caught.message : "Status connection interrupted.")
          : "Analysis admission could not be confirmed. Check the local API before refreshing; a job may still be running." });
    }
  };
  return {
    ...state, start, reset,
    resume: () => state.jobId ? resume(state.jobId) : Promise.resolve(),
    locked: ["submitting", "queued", "running", "verifying", "interrupted"].includes(state.status)
  };
};
export type AnalysisRunState = ReturnType<typeof useStudyFindings>;
