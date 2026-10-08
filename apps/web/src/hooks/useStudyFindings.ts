import { useCallback, useEffect, useRef, useState } from "react";
import { ZodError } from "zod";
import { ResearchRunCompleteSchema, ResearchRunResponseSchema, type ResearchRunStatus, type UnifiedResearchRun, type UploadResponse } from "../../../../packages/shared/src/schema";
import { API_BASE_URL } from "../config/api";
import { completedAnalysisResult } from "../utils/completedAnalysisResult";
import { isDatasetReady } from "../utils/validatedDataset";

export const ANALYSIS_JOB_KEY = "ad-clustering.analysis-job";
export const ANALYSIS_COMPLETION_KEY = "ad-clustering.analysis-completion";
export const ANALYSIS_PHASE_KEY = "ad-clustering.analysis-phase";
type EnhancedState = { status: "locked" | "ready" | "running" | "completed" | "error"; run: UnifiedResearchRun | null; error: string | null };
const emptyEnhanced: EnhancedState = { status: "locked", run: null, error: null };
const readPhase = (sourceRef: string) => {
  try {
    const saved = JSON.parse(sessionStorage.getItem(ANALYSIS_PHASE_KEY) ?? "null");
    return saved?.uploadRef === sourceRef ? saved.enhanced : null;
  } catch { return null; }
};
const savePhase = (uploadRef: string, enhanced: EnhancedState["status"]) =>
  sessionStorage.setItem(ANALYSIS_PHASE_KEY, JSON.stringify({ uploadRef, enhanced }));
type Status = "idle" | "submitting" | "queued" | "running" | "verifying" | "complete" | "failed" | "admission_failed" | "interrupted";
type State = { status: Status; run: UnifiedResearchRun | null; error: string | null; jobId: string | null; stage: string | null; uploadRef: string | null };
const empty: State = { status: "idle", run: null, error: null, jobId: null, stage: null, uploadRef: null };
const errorMessage = (caught: unknown, fallback: string) => caught instanceof ZodError
  ? "The analysis API returned an invalid response. Retry status checking."
  : caught instanceof Error ? caught.message : fallback;
const readJob = (uploadRef: string | undefined): { uploadRef: string; jobId: string } | null => {
  try {
    const saved = JSON.parse(sessionStorage.getItem(ANALYSIS_JOB_KEY) ?? "null");
    return typeof saved?.uploadRef === "string" && (!uploadRef || saved.uploadRef === uploadRef) && typeof saved.jobId === "string" ? saved : null;
  } catch { return null; }
};
const readCompletion = (uploadRef: string | undefined) => {
  try {
    const saved = JSON.parse(sessionStorage.getItem(ANALYSIS_COMPLETION_KEY) ?? "null");
    const job = ResearchRunCompleteSchema.safeParse(saved?.job);
    return job.success && typeof saved.uploadRef === "string" && (!uploadRef || saved.uploadRef === uploadRef)
      ? { uploadRef: saved.uploadRef as string, job: job.data } : null;
  } catch { return null; }
};
const delay = (signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  const abort = () => { clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); };
  const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, 1000);
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) abort();
});

export const useStudyFindings = (dataset: UploadResponse | null) => {
  const uploadRef = isDatasetReady(dataset) ? dataset.upload_ref : undefined;
  const [state, setState] = useState<State>(() => {
    const completed = readCompletion(uploadRef);
    if (completed) return { ...empty, uploadRef: completed.uploadRef, jobId: completed.job.run_id, status: "verifying" };
    const job = readJob(uploadRef);
    return job ? { ...empty, ...job, status: "verifying" } : empty;
  });
  const controllerRef = useRef<AbortController | null>(null);
  const lockedRef = useRef(false);
  const [enhanced, setEnhanced] = useState<EnhancedState>(emptyEnhanced);
  const enhancedController = useRef<AbortController | null>(null);
  const enhancedLocked = useRef(false);
  const monitor = useCallback(async (jobId: string, sourceRef: string, controller: AbortController, initial?: ResearchRunStatus) => {
    let job = initial;
    while (!controller.signal.aborted) {
      if (!job) {
        const response = await fetch(`${API_BASE_URL}/api/research/runs/${encodeURIComponent(jobId)}`, { signal: controller.signal });
        if (controller.signal.aborted) return;
        if (response.status === 404) {
          sessionStorage.removeItem(ANALYSIS_JOB_KEY);
          lockedRef.current = false;
          setState({ ...empty, uploadRef: sourceRef, status: "failed", error: "Previous analysis is unavailable. Validate the datasets again." });
          return;
        }
        if (!response.ok) throw new Error("Unable to check analysis status.");
        job = ResearchRunResponseSchema.parse(await response.json()).run;
      }
      if (controller.signal.aborted) return;
      if (job.run_id !== jobId) throw new Error("Analysis job identity mismatch.");
      if (job.status === "failed") {
        sessionStorage.removeItem(ANALYSIS_JOB_KEY);
        lockedRef.current = false;
        setState({ ...empty, uploadRef: sourceRef, status: "failed", error: job.error.message });
        return;
      }
      if (job.status === "complete") {
        setState({ ...empty, uploadRef: sourceRef, status: "verifying", jobId });
        const response = await fetch(`${API_BASE_URL}/api/runs/${encodeURIComponent(job.result_run_id)}`, { signal: controller.signal });
        if (!response.ok) throw new Error("Completed analysis result is unavailable.");
        const run = completedAnalysisResult(job, await response.json());
        if (controller.signal.aborted) return;
        lockedRef.current = false;
        // Save only the identity of a completion whose exact persisted result
        // passed validation. Restoration does not depend on temporary uploads
        // or the API's in-memory job registry.
        sessionStorage.setItem(ANALYSIS_COMPLETION_KEY, JSON.stringify({ uploadRef: sourceRef, job }));
        // Older saved comparisons have no phase marker and stay comparative.
        // A restored Enhanced request is satisfied by this exact-result verification.
        const phase = readPhase(sourceRef);
        const restored = phase === null || phase === "completed" || phase === "running";
        setEnhanced({ status: restored ? "completed" : "ready", run: restored ? run : null, error: null });
        savePhase(sourceRef, restored ? "completed" : "ready");
        setState({ ...empty, uploadRef: sourceRef, status: "complete", run, jobId });
        return;
      }
      setState({ ...empty, uploadRef: sourceRef, status: job.status, jobId, stage: job.status === "running" ? job.progress.stage : null });
      await delay(controller.signal);
      job = undefined;
    }
  }, []);

  const resume = useCallback(async (jobId: string, sourceRef: string, completed?: ResearchRunStatus) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    lockedRef.current = true;
    setState({ ...empty, uploadRef: sourceRef, status: "verifying", jobId });
    try { await monitor(jobId, sourceRef, controller, completed); }
    catch (caught) {
      if (!controller.signal.aborted) {
        lockedRef.current = false;
        setState({ ...empty, uploadRef: sourceRef, status: "interrupted", jobId,
          error: errorMessage(caught, "Unable to verify analysis. Resume status checking.") });
      }
    }
  }, [monitor]);

  useEffect(() => {
    const completed = readCompletion(uploadRef);
    const job = readJob(uploadRef);
    if (completed) void resume(completed.job.run_id, completed.uploadRef, completed.job);
    else if (job) void resume(job.jobId, job.uploadRef);
    return () => { controllerRef.current?.abort(); enhancedController.current?.abort(); enhancedLocked.current = false; };
  }, [uploadRef, resume]);

  const reset = useCallback(() => {
    // Detach even an active job: its eventual result belongs to the old files.
    controllerRef.current?.abort();
    lockedRef.current = false;
    sessionStorage.removeItem(ANALYSIS_JOB_KEY);
    sessionStorage.removeItem(ANALYSIS_COMPLETION_KEY);
    sessionStorage.removeItem(ANALYSIS_PHASE_KEY);
    enhancedController.current?.abort();
    enhancedLocked.current = false;
    setEnhanced(emptyEnhanced);
    setState(empty);
  }, []);

  const start = async () => {
    if (lockedRef.current || !uploadRef || state.status === "complete") return;
    lockedRef.current = true;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setState({ ...empty, uploadRef, status: "submitting" });
    savePhase(uploadRef, "locked");
    setEnhanced(emptyEnhanced);
    let jobId: string | null = null;
    try {
      const response = await fetch(`${API_BASE_URL}/api/research/runs`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ upload_ref: uploadRef }), signal: controller.signal
      });
      if (!response.ok) {
        const payload: unknown = await response.json().catch(() => null);
        if (controller.signal.aborted) return;
        lockedRef.current = false;
        const message = payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
          ? payload.error : `Unable to start comparison (HTTP ${response.status}). Try again.`;
        setState({ ...empty, uploadRef, status: "admission_failed", error: message });
        return;
      }
      const job = ResearchRunResponseSchema.parse(await response.json()).run;
      if (controller.signal.aborted) return;
      jobId = job.run_id;
      sessionStorage.setItem(ANALYSIS_JOB_KEY, JSON.stringify({ uploadRef, jobId }));
      await monitor(jobId, uploadRef, controller, job);
    } catch (caught) {
      if (!controller.signal.aborted) {
        lockedRef.current = false;
        setState({ ...empty, uploadRef, status: "interrupted", jobId,
          error: jobId ? errorMessage(caught, "Status connection interrupted.")
            : "Unable to confirm analysis status. Retry to reconnect." });
      }
    }
  };
  // A completed workflow survives upload expiry, but never attaches to a
  // different dataset. Explicit dataset changes still call reset().
  const completed = readCompletion(uploadRef);
  const current = !uploadRef || state.uploadRef === uploadRef ? state : empty;
  const startEnhanced = async () => {
    if (enhancedLocked.current || current.status !== "complete" || !current.run || !completed || enhanced.status === "completed") return;
    enhancedLocked.current = true;
    const controller = new AbortController();
    enhancedController.current = controller;
    savePhase(completed.uploadRef, "running");
    setEnhanced({ status: "running", run: null, error: null });
    try {
      // The existing API executes both methods once. Consume its Enhanced output
      // independently; never POST another job or rerun the completed Standard method.
      const response = await fetch(`${API_BASE_URL}/api/runs/${encodeURIComponent(completed.job.result_run_id)}`, { signal: controller.signal });
      if (!response.ok) throw new Error("Enhanced results are unavailable. Retry loading the completed analysis.");
      const run = completedAnalysisResult(completed.job, await response.json());
      if (controller.signal.aborted) return;
      savePhase(completed.uploadRef, "completed");
      setEnhanced({ status: "completed", run, error: null });
    } catch (caught) {
      if (!controller.signal.aborted) {
        savePhase(completed.uploadRef, "error");
        setEnhanced({ status: "error", run: null, error: errorMessage(caught, "Unable to load Enhanced results.") });
      }
    } finally {
      if (!controller.signal.aborted) enhancedLocked.current = false;
    }
  };
  return {
    ...current, start, reset, startEnhanced,
    standard: { status: current.status === "complete" ? "completed" : ["submitting", "queued", "running", "verifying"].includes(current.status) ? "running" : current.status === "idle" ? "idle" : "error", run: current.run },
    enhanced: current.status === "complete" ? enhanced : emptyEnhanced,
    resume: () => completed ? resume(completed.job.run_id, completed.uploadRef, completed.job)
      : current.jobId && current.uploadRef ? resume(current.jobId, current.uploadRef) : start(),
    locked: ["submitting", "queued", "running", "verifying"].includes(current.status)
  };
};
export type AnalysisRunState = ReturnType<typeof useStudyFindings>;
