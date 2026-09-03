import { AlertTriangle, Check, CheckCircle2, Circle, FileText, Loader2, RefreshCw, ShieldCheck, UploadCloud, XCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ResearchRunResponseSchema, RunResponseSchema, UploadResponseSchema,
  type ResearchProgressStage, type ResearchRunFailureCode, type ResearchRunStatus
} from "../../../../packages/shared/src";
import { API_BASE_URL, isLocalApiBaseUrl } from "../config/api";
import { RESEARCH_RUN_COMPLETE_EVENT } from "../components/run/runEvents";
import { Panel } from "../components/ui/Panel";
import { PageHeading } from "./PageHeading";

type WorkflowStatus = "idle" | "uploading" | "queued" | "running" | "tracking_interrupted" | "complete" | "failed";
type Failure = { kind: "input" | "admission" | "research" | "tracking"; title: string; message: string; guidance: string; code?: ResearchRunFailureCode };
type CompletedRun = { resultRunId: string; persistence: "durable" | "memory_only"; researchRunId: string };

const DATASETS = [
  ["ADAS", "All_Subjects_ADAS_10Aug2026.csv", "Clustering and longitudinal follow-up"],
  ["CDR", "All_Subjects_CDR_10Aug2026.csv", "Study-entry clustering"],
  ["FAQ", "All_Subjects_FAQ_10Aug2026.csv", "Study-entry clustering"],
  ["MMSE", "All_Subjects_MMSE_10Aug2026.csv", "Study-entry clustering"],
  ["NEUROBAT", "All_Subjects_NEUROBAT_10Aug2026.csv", "Study-entry clustering"],
  ["NPI-Q", "All_Subjects_NPIQ_10Aug2026.csv", "Study-entry clustering"],
  ["GDSCALE", "All_Subjects_GDSCALE_10Aug2026.csv", "Study-entry clustering"]
] as const;

const STAGE_LABELS: Record<ResearchProgressStage, string> = {
  preparing_inputs: "Validating inputs and preparing the workspace",
  constructing_study_entry_cohort: "Preparing the study-entry cohort",
  preprocessing: "Confirming retained-variable scope",
  pca: "Preprocessing retained variables and PCA",
  selecting_k: "Selecting k with NbClust",
  deterministic_initialization: "Deterministic DPC initialization",
  enhanced_kmeans: "Lloyd K-Means clustering",
  cluster_profiling: "Generating aggregate cluster results",
  baseline_comparison: "Evaluating the enhancement",
  matching_longitudinal_records: "Linking fixed assignments to longitudinal records",
  longitudinal_eligibility: "Applying longitudinal eligibility",
  longitudinal_analysis: "Fitting the mixed-effects model and consolidating results",
  aggregate_artifact_validation: "Validating aggregate results"
};

// Exact ordered stage groups emitted by the production orchestration manifest.
const EXECUTION_STAGES = [
  "preparing_inputs", "constructing_study_entry_cohort", "preprocessing", "pca", "selecting_k",
  "deterministic_initialization", "enhanced_kmeans", "baseline_comparison",
  "matching_longitudinal_records", "longitudinal_eligibility", "longitudinal_analysis",
  "aggregate_artifact_validation"
] as const satisfies readonly ResearchProgressStage[];

const ACTIVE_RUN_KEY = "ad-clustering.active-research-run";

const waitForPoll = (signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  const timer = window.setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, 1000);
  const abort = () => { window.clearTimeout(timer); reject(new DOMException("Polling aborted", "AbortError")); };
  signal.addEventListener("abort", abort, { once: true });
});

const responseError = async (response: Response, fallback: string) => {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? fallback;
};

const failureGuidance = (code: ResearchRunFailureCode) => {
  if (code === "INVALID_INPUT") return "Replace the affected export, then start again. A new attempt repeats all required validation.";
  if (code === "ENVIRONMENT_FAILURE") return "Confirm that the approved local research runtime is available, then start a new attempt.";
  if (code === "EXECUTION_TIMEOUT") return "The configured time limit stopped the run. A new attempt is safe; review the local runtime if it times out again.";
  if (code === "ARTIFACT_VALIDATION_FAILURE") return "No result was accepted. A new attempt is safe; preserve this run identifier if the failure repeats.";
  if (code === "PERSISTENCE_FAILURE") return "The validated aggregate could not be saved. A new attempt is safe; review local result storage if this repeats.";
  return "No completed result was accepted. A new attempt is safe; preserve this run identifier if the same stage fails again.";
};

export const UploadAndCluster = () => {
  const [files, setFiles] = useState<Record<string, File>>({});
  const [unexpected, setUnexpected] = useState<string[]>([]);
  const [status, setStatus] = useState<WorkflowStatus>("idle");
  const [validated, setValidated] = useState(false);
  const [stage, setStage] = useState<ResearchProgressStage | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [completed, setCompleted] = useState<CompletedRun | null>(null);
  const [researchRunId, setResearchRunId] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const localApi = useMemo(() => isLocalApiBaseUrl(), []);
  const selected = useMemo(() => DATASETS.flatMap(([, name]) => files[name] ? [files[name]] : []), [files]);
  const busy = status === "uploading" || status === "queued" || status === "running";
  const fileControlsLocked = busy || status === "tracking_interrupted";
  const ready = selected.length === 7 && unexpected.length === 0;

  const resetWorkflow = () => {
    controllerRef.current?.abort();
    setStatus("idle"); setValidated(false); setStage(null); setFailure(null); setCompleted(null); setResearchRunId(null);
  };

  const chooseFiles = (incoming: File[]) => {
    if (fileControlsLocked) return;
    const names = new Set(DATASETS.map(([, name]) => name));
    const accepted = incoming.filter((file) => names.has(file.name as typeof DATASETS[number][1]));
    setFiles((current) => ({ ...current, ...Object.fromEntries(accepted.map((file) => [file.name, file])) }));
    setUnexpected(incoming.filter((file) => !names.has(file.name as typeof DATASETS[number][1])).map((file) => file.name));
    resetWorkflow();
  };

  const replaceFile = (expected: string, file?: File) => {
    if (!file || fileControlsLocked) return;
    if (file.name !== expected) { setUnexpected([file.name]); resetWorkflow(); return; }
    setFiles((current) => ({ ...current, [expected]: file })); setUnexpected([]); resetWorkflow();
  };

  const completeRun = useCallback(async (run: Extract<ResearchRunStatus, { status: "complete" }>, controller: AbortController) => {
    const response = await fetch(`${API_BASE_URL}/api/runs/${encodeURIComponent(run.result_run_id)}`, { signal: controller.signal });
    if (!response.ok) throw new Error(`Persisted aggregate verification returned ${response.status}.`);
    const result = RunResponseSchema.parse(await response.json()).run;
    if (!("pipeline" in result) || result.pipeline !== "unified") throw new Error("The persisted result did not satisfy the unified aggregate contract.");
    setCompleted({ resultRunId: run.result_run_id, persistence: run.persistence, researchRunId: run.run_id });
    setStatus("complete"); setValidated(true); setStage(null); setFailure(null); setResearchRunId(run.run_id);
    sessionStorage.removeItem(ACTIVE_RUN_KEY);
    window.dispatchEvent(new CustomEvent(RESEARCH_RUN_COMPLETE_EVENT, { detail: { runId: run.result_run_id } }));
  }, []);

  const observeRun = useCallback(async (initial: ResearchRunStatus, controller: AbortController) => {
    let run = initial;
    setResearchRunId(run.run_id); sessionStorage.setItem(ACTIVE_RUN_KEY, run.run_id);
    while (run.status === "queued" || run.status === "running") {
      setStatus(run.status);
      if (run.status === "running") setStage(run.progress.stage);
      await waitForPoll(controller.signal);
      const response = await fetch(`${API_BASE_URL}/api/research/runs/${encodeURIComponent(run.run_id)}`, { signal: controller.signal });
      if (!response.ok) throw new Error(`Research status request returned ${response.status}.`);
      run = ResearchRunResponseSchema.parse(await response.json()).run;
    }
    if (run.status === "failed") {
      sessionStorage.removeItem(ACTIVE_RUN_KEY); setStatus("failed");
      setFailure({ kind: "research", title: "Analysis did not complete", message: run.error.message, guidance: failureGuidance(run.error.code), code: run.error.code });
      return;
    }
    await completeRun(run, controller);
  }, [completeRun]);

  const trackingFailed = useCallback((message: string) => {
    setStatus("tracking_interrupted");
    setFailure({ kind: "tracking", title: "Status connection interrupted", message, guidance: "The admitted backend run may still be active. Resume status checking before starting another analysis." });
  }, []);

  const resumeRun = useCallback(async (runId: string) => {
    controllerRef.current?.abort(); const controller = new AbortController(); controllerRef.current = controller;
    setStatus("queued"); setValidated(true); setFailure(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/research/runs/${encodeURIComponent(runId)}`, { signal: controller.signal });
      if (!response.ok) { if (response.status === 404) sessionStorage.removeItem(ACTIVE_RUN_KEY); throw new Error(`Research status request returned ${response.status}.`); }
      await observeRun(ResearchRunResponseSchema.parse(await response.json()).run, controller);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      trackingFailed(error instanceof Error ? error.message : "Unable to reconnect to the research run.");
    }
  }, [observeRun, trackingFailed]);

  useEffect(() => {
    const active = sessionStorage.getItem(ACTIVE_RUN_KEY);
    if (active && localApi) void resumeRun(active);
    return () => controllerRef.current?.abort();
  }, [localApi, resumeRun]);

  const runPipeline = async () => {
    if (!localApi || !ready || busy) return;
    controllerRef.current?.abort(); const controller = new AbortController(); controllerRef.current = controller;
    let admitted: string | null = null;
    try {
      setStatus("uploading"); setValidated(false); setStage(null); setFailure(null); setCompleted(null); setResearchRunId(null);
      const body = new FormData(); selected.forEach((file) => body.append("files", file));
      const upload = await fetch(`${API_BASE_URL}/api/upload`, { method: "POST", body, signal: controller.signal });
      if (!upload.ok) {
        setStatus("failed"); setFailure({ kind: "input", title: "Input validation failed", message: await responseError(upload, `Input validation returned ${upload.status}.`), guidance: "Review the named export or required fields, replace the affected file, and validate again. No research run was started." }); return;
      }
      const uploaded = UploadResponseSchema.parse(await upload.json()); setValidated(true);
      const response = await fetch(`${API_BASE_URL}/api/research/runs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ upload_ref: uploaded.upload_ref }), signal: controller.signal });
      if (!response.ok) {
        setStatus("failed"); setFailure({ kind: "admission", title: "Analysis could not enter the queue", message: await responseError(response, `Run admission returned ${response.status}.`), guidance: "No run was admitted. Wait for any active local run to finish, then submit these seven files again." }); return;
      }
      const run = ResearchRunResponseSchema.parse(await response.json()).run; admitted = run.run_id; await observeRun(run, controller);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      const message = error instanceof Error ? error.message : "Unable to continue the unified analysis.";
      if (admitted) { sessionStorage.setItem(ACTIVE_RUN_KEY, admitted); trackingFailed(message); }
      else { setStatus("failed"); setFailure({ kind: "input", title: "Upload could not be completed", message, guidance: "Check the local API connection and selected files, then try again. No confirmed research run was started." }); }
    }
  };

  const affected = failure?.kind === "input" ? DATASETS.find(([, name]) => failure.message.includes(name))?.[1] : undefined;
  const stageIndex = stage ? EXECUTION_STAGES.indexOf(stage as typeof EXECUTION_STAGES[number]) : -1;
  const stepStates = [
    ready || validated || busy || status === "complete" ? "complete" : "current",
    status === "uploading" ? "current" : validated ? "complete" : failure?.kind === "input" ? "failed" : "pending",
    status === "queued" || status === "running" || status === "tracking_interrupted" ? "current" : status === "complete" ? "complete" : failure?.kind === "research" ? "failed" : "pending",
    status === "complete" ? "complete" : "pending"
  ] as const;
  const stepLabels = ["Upload seven exports", "Validate inputs", "Execute pipeline", "Analysis complete"];
  const primaryLabel = status === "tracking_interrupted" ? "Resume status check" : busy ? (status === "uploading" ? "Uploading and validating inputs" : status === "queued" ? "Waiting for research runner" : "Analysis is still running") : status === "failed" ? "Validate and run again" : status === "complete" ? "Run another analysis" : "Validate and run analysis";
  const currentText = status === "uploading" ? "Uploading and validating inputs" : status === "queued" ? "Waiting for the local research runner" : status === "running" && stage ? STAGE_LABELS[stage] : status === "tracking_interrupted" ? "Run status needs to be reconnected" : status === "complete" ? "Analysis complete" : failure?.title ?? (ready ? "Ready to validate" : "Waiting for all seven required files");
  const serverCheckText = status === "uploading" ? "Validating" : validated ? "Passed" : failure?.title === "Input validation failed" ? "Failed" : "Not started";

  return (
    <>
      <PageHeading title="Run Analysis" description="Submit the exact seven ADNI CSV exports to one controlled execution of the frozen enhanced K-Means and longitudinal follow-up pipeline." />
      {!localApi ? <div role="alert" className="mb-6 flex gap-3 border-l-2 border-amber-500 bg-amber-50 px-4 py-3 text-sm text-amber-900"><AlertTriangle size={18} /><div><strong>Run Analysis is available only with the local API.</strong><p className="mt-1">Participant-level source files must not be sent to a deployed production API.</p></div></div> : null}

      <ol className="mb-8 grid gap-px border border-line bg-line sm:grid-cols-2 xl:grid-cols-4" aria-label="Analysis workflow">
        {stepLabels.map((label, index) => <li key={label} className="flex items-center gap-3 bg-white px-4 py-3"><span className={`flex h-7 w-7 shrink-0 items-center justify-center border text-xs font-semibold ${stepStates[index] === "complete" ? "border-teal-700 bg-teal-700 text-white" : stepStates[index] === "failed" ? "border-red-600 text-red-700" : stepStates[index] === "current" ? "border-teal-700 text-teal-800" : "border-slate-300 text-muted"}`}>{stepStates[index] === "complete" ? <Check size={15} /> : index + 1}</span><span><span className="block text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">Step {index + 1}</span><span className="text-sm font-semibold">{label}</span></span></li>)}
      </ol>

      <Panel title="Step 1 — Required ADNI exports" variant="section" action={<span className="text-xs font-semibold tabular-nums text-muted">{selected.length} of 7 supplied</span>}>
        <div className="mb-4 flex flex-col justify-between gap-3 border-l-2 border-teal-600 bg-teal-50/60 px-4 py-3 text-sm sm:flex-row sm:items-center"><div><p className="font-semibold text-teal-900">Exactly seven named CSV files are required.</p><p className="mt-1 text-muted">Select them together or choose and replace each export separately before execution.</p><p className="mt-1 text-xs text-muted">CSV only · exact filenames · readable UTF-8 headers · required columns · 64 MB maximum per file</p></div><label className={`inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-sm border border-teal-700 px-4 font-semibold ${fileControlsLocked || !localApi ? "cursor-not-allowed bg-slate-100 text-slate-500" : "cursor-pointer bg-white text-teal-800 hover:bg-teal-50"}`}><UploadCloud size={16} /> Select CSV files<input type="file" multiple accept=".csv" className="sr-only" disabled={fileControlsLocked || !localApi} onChange={(event) => { chooseFiles(Array.from(event.target.files ?? [])); event.currentTarget.value = ""; }} /></label></div>
        {unexpected.length ? <div role="alert" className="mb-4 border-l-2 border-red-600 bg-red-50 px-4 py-3 text-sm text-red-800"><strong>Unexpected filename selected.</strong><p className="mt-1 break-words">{unexpected.join(", ")}</p><p className="mt-1">Choose the exact named export for the missing slot. Unexpected files are not uploaded.</p><button type="button" className="mt-2 text-xs font-semibold underline" onClick={() => setUnexpected([])}>Dismiss</button></div> : null}
        <div className="overflow-hidden border border-line"><div className="hidden grid-cols-[7rem_minmax(10rem,1fr)_minmax(12rem,1.3fr)_7rem] gap-4 border-b border-line bg-slate-50 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted md:grid"><span>Dataset</span><span>Expected role</span><span>Selected file</span><span>Status</span></div><ul className="divide-y divide-line">
          {DATASETS.map(([label, name, role]) => {
            const file = files[name]; const fileStatus = !file ? "Missing" : status === "uploading" ? "Validating" : validated ? "Valid" : affected === name ? "Error" : "Selected";
            return <li key={label} className="grid gap-3 px-4 py-3 md:grid-cols-[7rem_minmax(10rem,1fr)_minmax(12rem,1.3fr)_7rem] md:items-center md:gap-4"><strong className="text-sm">{label}</strong><span className="text-xs leading-5 text-muted">{role}</span><div className="min-w-0">{file ? <div className="flex min-w-0 items-center gap-2"><FileText size={15} className="shrink-0 text-teal-700" /><span className="truncate text-xs font-medium" title={file.name}>{file.name}</span><span className="shrink-0 text-[10px] text-muted">{(file.size / 1048576).toFixed(2)} MB</span></div> : <span className="break-all text-xs text-muted">{name}</span>}<label className={`mt-1.5 inline-block text-xs font-semibold underline ${fileControlsLocked || !localApi ? "cursor-not-allowed text-slate-400" : "cursor-pointer text-teal-800"}`}>{file ? "Replace file" : "Choose file"}<input type="file" accept=".csv" className="sr-only" disabled={fileControlsLocked || !localApi} onChange={(event) => { replaceFile(name, event.target.files?.[0]); event.currentTarget.value = ""; }} /></label></div><span className={`inline-flex w-fit items-center gap-1.5 text-xs font-semibold ${fileStatus === "Valid" ? "text-teal-800" : fileStatus === "Error" ? "text-red-700" : "text-muted"}`}>{fileStatus === "Validating" ? <Loader2 size={14} className="animate-spin" /> : fileStatus === "Valid" ? <CheckCircle2 size={14} /> : fileStatus === "Error" ? <XCircle size={14} /> : <Circle size={11} />}{fileStatus}</span></li>;
          })}
        </ul></div>
      </Panel>

      <div className="mt-8 grid gap-8 xl:grid-cols-12">
        <Panel title="Steps 2–3 — Validate and execute" variant="section" className="xl:col-span-7">
          <div aria-live="polite" aria-atomic="true" className="border-l-2 border-teal-600 bg-white px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">Current state</p>
            <div className="mt-1 flex items-start gap-2 text-sm font-semibold">{busy ? <Loader2 size={16} className="mt-0.5 shrink-0 animate-spin text-teal-700" /> : status === "complete" ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-teal-700" /> : null}<span>{currentText}</span></div>
            {status === "queued" || status === "running" ? <p className="mt-1 text-xs text-muted">Analysis is still active. No estimated completion time is available.</p> : null}
          </div>

          <dl className="mt-4 grid gap-px border border-line bg-line sm:grid-cols-3">
            <div className="bg-white px-3 py-2"><dt className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted">File presence</dt><dd className="mt-1 text-xs font-semibold">{ready || validated || busy || status === "complete" ? "Complete" : `${selected.length} of 7 supplied`}</dd></div>
            <div className="bg-white px-3 py-2"><dt className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted">File/readability check</dt><dd className="mt-1 text-xs font-semibold">{serverCheckText}</dd></div>
            <div className="bg-white px-3 py-2"><dt className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted">Dataset/schema check</dt><dd className="mt-1 text-xs font-semibold">{serverCheckText}</dd></div>
          </dl>

          <ol className="mt-4 divide-y divide-line border-y border-line" aria-label="Frozen research pipeline stages">
            {EXECUTION_STAGES.map((item, index) => {
              const running = status === "running" && item === stage;
              const complete = status === "complete" || stageIndex > index;
              const failed = status === "failed" && failure?.kind === "research" && item === stage;
              const itemStatus = failed ? "Failed" : running ? "Running" : complete ? "Complete" : "Pending";
              return <li key={item} className={`grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-3 px-1 py-2.5 text-sm ${running ? "bg-teal-50/60 text-teal-900" : failed ? "bg-red-50 text-red-800" : complete ? "text-slate-600" : "text-muted"}`}>{running ? <Loader2 size={15} className="animate-spin text-teal-700" /> : failed ? <XCircle size={15} /> : complete ? <Check size={15} className="text-teal-700" /> : <Circle size={11} />}<span className={running || failed ? "font-semibold" : ""}>{STAGE_LABELS[item]}</span><span className="text-[10px] font-semibold uppercase tracking-[0.06em]">{itemStatus}</span></li>;
            })}
          </ol>

          <button type="button" onClick={() => status === "tracking_interrupted" && researchRunId ? void resumeRun(researchRunId) : status === "complete" ? resetWorkflow() : void runPipeline()} disabled={status === "tracking_interrupted" ? !researchRunId : !ready || busy || !localApi} className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-sm bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-900 focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600 sm:w-auto">{busy ? <Loader2 size={17} className="animate-spin" /> : status === "tracking_interrupted" ? <RefreshCw size={17} /> : <UploadCloud size={17} />}{primaryLabel}</button>
          {!ready && status === "idle" ? <p className="mt-2 text-xs text-muted">Supply every required export before validation can begin.</p> : null}
          {busy ? <p className="mt-3 text-xs leading-5 text-muted">Once admitted, navigating away does not stop backend execution. This browser tab retains the run identifier so status checking can resume when you return.</p> : null}
        </Panel>

        <div className="xl:col-span-5">
          {failure ? <section role="alert" className="border-t-2 border-red-600 bg-white pt-4"><div className="flex items-start gap-3"><AlertTriangle size={18} className="mt-0.5 shrink-0 text-red-700" /><div><h2 className="font-semibold text-red-800">{failure.title}</h2><p className="mt-1 text-sm leading-6">{failure.message}</p><p className="mt-2 text-sm leading-6 text-muted">{failure.guidance}</p></div></div><details className="mt-4 border-t border-line pt-3 text-xs text-muted"><summary className="cursor-pointer font-semibold text-ink">Technical details</summary><dl className="mt-3 grid gap-2">{researchRunId ? <div><dt className="inline font-semibold">Research run: </dt><dd className="inline break-all">{researchRunId}</dd></div> : null}{stage ? <div><dt className="inline font-semibold">Last observed stage: </dt><dd className="inline">{stage}</dd></div> : null}{failure.code ? <div><dt className="inline font-semibold">Failure code: </dt><dd className="inline">{failure.code}</dd></div> : null}</dl></details></section>
          : completed ? <section className="border-t-2 border-teal-700 bg-white pt-4"><div className="flex items-start gap-3"><CheckCircle2 size={20} className="mt-0.5 shrink-0 text-teal-700" /><div><h2 className="text-lg font-semibold text-teal-900">Analysis complete</h2><p className="mt-1 text-sm leading-6">The unified aggregate result passed the required application contract validation.</p></div></div><a href={`/overview?run_id=${encodeURIComponent(completed.resultRunId)}`} className="mt-5 inline-flex h-10 items-center rounded-sm bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-900">View Overview</a><details className="mt-4 border-t border-line pt-3 text-xs text-muted"><summary className="cursor-pointer font-semibold text-ink">Run details</summary><dl className="mt-3 grid gap-2"><div><dt className="inline font-semibold">Research run: </dt><dd className="inline break-all">{completed.researchRunId}</dd></div><div><dt className="inline font-semibold">Result run: </dt><dd className="inline break-all">{completed.resultRunId}</dd></div><div><dt className="inline font-semibold">Availability: </dt><dd className="inline">{completed.persistence === "durable" ? "Persisted to configured result storage" : "Available in this API process"}</dd></div></dl></details></section>
          : <section className="border-t border-line pt-4"><h2 className="text-base font-semibold">Execution controls</h2><p className="mt-2 text-sm leading-6 text-muted">Validation and execution begin only after the explicit action. During an active run, file controls and repeat submission are disabled.</p></section>}

          <section className="mt-6 border-t border-line pt-4"><div className="flex items-start gap-3"><ShieldCheck size={18} className="mt-0.5 shrink-0 text-teal-700" /><div><h2 className="text-sm font-semibold">Participant-data handling</h2><p className="mt-1 text-xs leading-5 text-muted">Source CSV files are uploaded to the local API process for private analysis. Participant-level rows, identifiers, scores, and histories are not displayed in web-facing research results; only validated aggregate results are exposed.</p></div></div></section>
        </div>
      </div>
    </>
  );
};
