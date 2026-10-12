import { useEffect, useRef, useState } from "react";
import { MethodJobSchema, compatibleMethods, type Method, type MethodInput, type MethodJob } from "../../../../packages/shared/src/methodExecution";
import type { UploadResponse } from "../../../../packages/shared/src/schema";
import { API_BASE_URL } from "../config/api";
import { isDatasetReady } from "../utils/validatedDataset";

type Jobs = Partial<Record<Method, MethodJob>>;
const busy = (job?: MethodJob) => job?.status === "running" || job?.status === "queued";
export function useMethodJobs(input: MethodInput | null) {
  const key = input ? JSON.stringify(input) : "none";
  const storageKey = `kmeans-method-jobs/v1:${key}`;
  const [jobs, setJobs] = useState<Jobs>({});
  const [completed, setCompleted] = useState<Jobs>({});
  const [errors, setErrors] = useState<Partial<Record<Method, string>>>({});
  const [submitting, setSubmitting] = useState<Method | null>(null);
  const generation = useRef(0);
  const locked = useRef(false);
  const ids = useRef<Partial<Record<Method, { latest: string; complete?: string }>>>({});
  const pending = useRef<Partial<Record<Method, string>>>({});
  const remember = (job: MethodJob) => {
    ids.current[job.method] = { ...ids.current[job.method], latest: job.id,
      ...(job.status === "complete" ? { complete: job.id } : {}) };
    try { sessionStorage.setItem(storageKey, JSON.stringify(ids.current)); } catch { /* Keep working in memory if storage is disabled. */ }
    setJobs(previous => ({ ...previous, [job.method]: job }));
    if (job.status === "complete") setCompleted(previous => ({ ...previous, [job.method]: job }));
  };
  const read = async (id: string, signal?: AbortSignal) => {
    const response = await fetch(`${API_BASE_URL}/api/method-runs/${id}`, { signal, cache: "no-store" });
    if (!response.ok) throw new Error(`Unable to check execution (${response.status}). Retry status checking.`);
    const job = MethodJobSchema.parse(await response.json());
    if (job.id !== id || JSON.stringify(job.input) !== key) throw new Error("Execution input mismatch.");
    return job;
  };
  useEffect(() => {
    generation.current++; locked.current = false; pending.current = {};
    setJobs({}); setCompleted({}); setErrors({}); setSubmitting(null);
    const controller = new AbortController();
    try { ids.current = JSON.parse(sessionStorage.getItem(storageKey) ?? "{}"); } catch { ids.current = {}; }
    void Promise.all(Object.entries(ids.current).map(async ([method, saved]) => {
      try {
        if (saved.complete) {
          const previous = await read(saved.complete, controller.signal);
          if (!controller.signal.aborted && previous.status === "complete") setCompleted(value => ({ ...value, [method]: previous }));
        }
        const latest = await read(saved.latest, controller.signal);
        if (!controller.signal.aborted) remember(latest);
      } catch {
        if (!controller.signal.aborted) setErrors(value => ({ ...value, [method]: "Unable to restore execution. Retry status checking." }));
      }
    }));
    return () => controller.abort();
  }, [storageKey]);
  const runningIds = Object.values(jobs).filter(busy).map(job => job.id).join(":");
  useEffect(() => {
    if (!runningIds) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      await Promise.all(runningIds.split(":").map(async id => {
        try {
          const job = await read(id, controller.signal);
          if (!controller.signal.aborted) { remember(job); setErrors(value => ({ ...value, [job.method]: undefined })); }
        } catch {
          if (!controller.signal.aborted) setErrors(value => ({ ...value, [Object.values(jobs).find(job => job.id === id)!.method]: "Status connection interrupted; checking again." }));
        }
      }));
      if (!controller.signal.aborted) timer = setTimeout(() => void poll(), 1000);
    };
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [runningIds, storageKey]);
  const run = async (method: Method) => {
    const unresolved = (Object.keys(pending.current) as Method[]).find(key => pending.current[key]);
    if (!input || locked.current || Object.values(jobs).some(busy) || unresolved && unresolved !== method) return;
    const epoch = generation.current;
    locked.current = true; setSubmitting(method);
    setErrors(previous => ({ ...previous, [method]: undefined }));
    // Retain an uncertain POST identity. A retry must not start two fits.
    const requestId = pending.current[method] ?? crypto.randomUUID();
    pending.current[method] = requestId;
    try {
      const response = await fetch(`${API_BASE_URL}/api/method-runs`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method, input, requestId, ...(method === "comparison" ? { standardId: completed.standard?.id, enhancedId: completed.enhanced?.id } : {}) }) });
      if (!response.ok) {
        // A confirmed client rejection did not accept a job; transport/5xx failures remain uncertain.
        if (response.status >= 400 && response.status < 500) delete pending.current[method];
        throw new Error(`Unable to start ${method} (${response.status}). Retry when inputs and execution capacity are available.`);
      }
      const job = MethodJobSchema.parse(await response.json());
      if (job.method !== method || JSON.stringify(job.input) !== key) throw new Error("Execution identity mismatch.");
      if (generation.current === epoch) { delete pending.current[method]; remember(job); }
    } catch (error) {
      if (generation.current === epoch) setErrors(previous => ({ ...previous, [method]: error instanceof Error ? error.message : "Unable to start execution." }));
    } finally {
      if (generation.current === epoch) { locked.current = false; setSubmitting(null); }
    }
  };
  const cancel = async (method: Method) => {
    const job = jobs[method]; if (!job) return;
    const epoch = generation.current;
    try {
      const response = await fetch(`${API_BASE_URL}/api/method-runs/${job.id}/cancel`, { method: "POST" });
      if (!response.ok) throw new Error();
      const next = MethodJobSchema.parse(await response.json());
      if (epoch === generation.current) remember(next);
    } catch { if (epoch === generation.current) setErrors(previous => ({ ...previous, [method]: "Cancellation could not be confirmed. Check status before retrying." })); }
  };
  const refresh = async (method: Method) => {
    const saved = ids.current[method]; if (!saved) return;
    const epoch = generation.current;
    try {
      const latest = await read(saved.latest);
      const previous = saved.complete && saved.complete !== saved.latest ? await read(saved.complete) : latest;
      if (epoch === generation.current) {
        remember(latest);
        if (latest.status !== "complete" && previous.status === "complete") setCompleted(value => ({ ...value, [method]: previous }));
        setErrors(value => ({ ...value, [method]: undefined }));
      }
    } catch { if (epoch === generation.current) setErrors(value => ({ ...value, [method]: "Status checking failed. Try again when the API is available." })); }
  };
  const reset = () => {
    generation.current++; locked.current = false;
    try { sessionStorage.removeItem(storageKey); } catch { /* In-memory reset still applies. */ }
    ids.current = {}; pending.current = {}; setJobs({}); setCompleted({}); setErrors({}); setSubmitting(null);
  };
  const uncertain = submitting === null ? (Object.keys(pending.current) as Method[]).find(key => pending.current[key]) ?? null : null;
  const currentPair = uncertain !== "standard" && uncertain !== "enhanced" && submitting !== "standard" && submitting !== "enhanced" &&
    (!jobs.standard || jobs.standard.status === "complete") && (!jobs.enhanced || jobs.enhanced.status === "complete");
  const compatible = currentPair && compatibleMethods(completed.standard?.result, completed.enhanced?.result);
  const comparison = compatible && completed.comparison?.result?.commonSpace && completed.comparison?.standardId === completed.standard?.id && completed.comparison?.enhancedId === completed.enhanced?.id ? completed.comparison : undefined;
  return { jobs, completed, errors, run, cancel, refresh, reset, submitting, uncertain, locked: submitting !== null || uncertain !== null || Object.values(jobs).some(busy), compatible, comparison };
}
export const useStudyExecution = (dataset: UploadResponse | null) => useMethodJobs(isDatasetReady(dataset) ? { scope: "study", uploadRef: dataset.upload_ref } : null);
export type MethodJobs = ReturnType<typeof useMethodJobs>;
