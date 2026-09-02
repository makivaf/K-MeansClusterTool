import { AlertTriangle, CheckCircle2, FileText, Loader2, UploadCloud } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ResearchRunResponseSchema, RunResponseSchema, UploadResponseSchema } from "../../../../packages/shared/src";
import { API_BASE_URL, isLocalApiBaseUrl } from "../config/api";
import { Panel } from "../components/ui/Panel";
import { PageHeading } from "./PageHeading";

type UploadStatus = "idle" | "uploading" | "queued" | "running" | "complete" | "failed";
type CompletedRun = { resultRunId: string; persistence: "durable" | "memory_only" };

const buttonText: Record<UploadStatus, string> = {
  idle: "Run Unified Pipeline",
  uploading: "Uploading CSV files",
  queued: "Research run queued",
  running: "Processing locally",
  complete: "Run Complete",
  failed: "Try Again"
};

const waitForNextPoll = (signal: AbortSignal, milliseconds = 1000) => new Promise<void>((resolve, reject) => {
  const timer = window.setTimeout(() => {
    signal.removeEventListener("abort", onAbort);
    resolve();
  }, milliseconds);
  const onAbort = () => {
    window.clearTimeout(timer);
    reject(new DOMException("Polling aborted", "AbortError"));
  };
  signal.addEventListener("abort", onAbort, { once: true });
});

export const UploadAndCluster = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [progressStage, setProgressStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [completedRun, setCompletedRun] = useState<CompletedRun | null>(null);
  const pollingController = useRef<AbortController | null>(null);
  const localApiEnabled = useMemo(() => isLocalApiBaseUrl(), []);
  const busy = status === "uploading" || status === "queued" || status === "running";
  const disabled = !localApiEnabled || files.length !== 7 || busy;

  useEffect(() => () => pollingController.current?.abort(), []);

  const onFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setFiles(Array.from(event.target.files ?? []));
    pollingController.current?.abort();
    setStatus("idle");
    setProgressStage(null);
    setError(null);
    setCompletedRun(null);
  };

  const runPipeline = async () => {
    if (disabled) return;
    try {
      setStatus("uploading");
      setError(null);
      setCompletedRun(null);
      pollingController.current?.abort();
      const controller = new AbortController();
      pollingController.current = controller;
      const formData = new FormData();
      files.forEach((file) => formData.append("files", file));

      const uploadResponse = await fetch(`${API_BASE_URL}/api/upload`, { method: "POST", body: formData, signal: controller.signal });
      if (!uploadResponse.ok) {
        const payload = (await uploadResponse.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? `Upload failed with ${uploadResponse.status}`);
      }
      const uploadPayload = UploadResponseSchema.parse(await uploadResponse.json());
      const runResponse = await fetch(`${API_BASE_URL}/api/research/runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ upload_ref: uploadPayload.upload_ref }),
        signal: controller.signal
      });
      if (!runResponse.ok) {
        const payload = (await runResponse.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? `Pipeline run failed with ${runResponse.status}`);
      }

      let researchRun = ResearchRunResponseSchema.parse(await runResponse.json()).run;
      setStatus(researchRun.status);
      while (researchRun.status === "queued" || researchRun.status === "running") {
        if (researchRun.status === "running") setProgressStage(researchRun.progress.stage.replace(/_/g, " "));
        await waitForNextPoll(controller.signal);
        const statusResponse = await fetch(`${API_BASE_URL}/api/research/runs/${encodeURIComponent(researchRun.run_id)}`, { signal: controller.signal });
        if (!statusResponse.ok) throw new Error(`Research status request failed with ${statusResponse.status}`);
        researchRun = ResearchRunResponseSchema.parse(await statusResponse.json()).run;
        setStatus(researchRun.status);
      }
      if (researchRun.status === "failed") throw new Error(researchRun.error.message);

      const resultResponse = await fetch(`${API_BASE_URL}/api/runs/${encodeURIComponent(researchRun.result_run_id)}`, { signal: controller.signal });
      if (!resultResponse.ok) throw new Error(`Persisted result request failed with ${resultResponse.status}`);
      const persistedResult = RunResponseSchema.parse(await resultResponse.json()).run;
      if (!("pipeline" in persistedResult) || persistedResult.pipeline !== "unified") throw new Error("Persisted result did not satisfy the unified contract.");
      setCompletedRun({ resultRunId: researchRun.result_run_id, persistence: researchRun.persistence });
      setProgressStage(null);
      setStatus("complete");
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setStatus("failed");
      setError(caught instanceof Error ? caught.message : "Unable to run the unified pipeline.");
    }
  };

  return (
    <>
      <PageHeading title="Run Unified Research Pipeline" description="Local-only workflow for one continuous enhanced K-Means and longitudinal progression analysis using the exact seven-file ADNI input contract." />
      {!localApiEnabled ? <Panel title="Local-only feature"><div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><AlertTriangle className="mt-0.5 shrink-0" size={18} /><div><div className="font-semibold">This feature is only available when running locally.</div><p className="mt-1">Raw participant-level CSV files must not be sent to a deployed production API.</p></div></div></Panel> : null}
      <div className="grid gap-4 xl:grid-cols-12">
        <Panel title="Dataset files" className="xl:col-span-7">
          <label className="flex min-h-48 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-line bg-slate-50 px-6 py-8 text-center transition hover:border-teal-600 hover:bg-teal-50">
            <UploadCloud size={34} className="text-teal-700" strokeWidth={1.8} />
            <span className="mt-3 text-sm font-semibold">Choose the seven required ADNI CSV exports</span>
            <span className="mt-1 text-xs text-muted">Exact filenames and required headers are validated. 500 MB maximum per file.</span>
            <input type="file" multiple accept=".csv" className="sr-only" onChange={onFileChange} disabled={!localApiEnabled || busy} />
          </label>
          <div className="mt-4 rounded-xl border border-line">
            {files.length > 0 ? <ul className="divide-y divide-line">{files.map((file) => <li key={`${file.name}-${file.lastModified}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm"><span className="inline-flex min-w-0 items-center gap-2 font-medium"><FileText size={16} className="shrink-0 text-teal-700" /><span className="truncate">{file.name}</span></span><span className="shrink-0 text-xs text-muted">{(file.size / 1024 / 1024).toFixed(2)} MB</span></li>)}</ul> : <div className="px-4 py-6 text-sm text-muted">No CSV files selected.</div>}
          </div>
        </Panel>
        <Panel title="One-run lifecycle" className="xl:col-span-5">
          <div className="rounded-xl border border-line bg-canvas p-4 text-sm"><div className="font-semibold">Status</div><div className="mt-2 flex items-center gap-2 text-muted">{busy ? <Loader2 size={16} className="animate-spin text-teal-700" /> : null}{status === "complete" ? <CheckCircle2 size={16} className="text-emerald-700" /> : null}<span className="capitalize">{progressStage ?? status}</span></div></div>
          <button type="button" onClick={runPipeline} disabled={disabled} className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white transition hover:bg-teal-900 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600">{busy ? <Loader2 size={17} className="animate-spin" /> : <UploadCloud size={17} />}{buttonText[status]}</button>
          {error ? <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
          {completedRun ? <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"><div className="font-semibold">Validated unified analysis completed.</div><p className="mt-1 text-xs">{completedRun.persistence === "durable" ? "The aggregate result was persisted to PostgreSQL." : "The aggregate result is available in this API process only."}</p><a href={`/overview?run_id=${encodeURIComponent(completedRun.resultRunId)}`} className="mt-3 inline-flex rounded-lg bg-white px-3 py-2 text-xs font-semibold text-emerald-800 shadow-sm ring-1 ring-emerald-200">Open result</a></div> : null}
          <p className="mt-4 text-xs leading-5 text-muted">Raw rows stay on the local API filesystem. The persisted and web-exposed result contains aggregate values only.</p>
        </Panel>
      </div>
    </>
  );
};
