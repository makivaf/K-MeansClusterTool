import { AlertTriangle, CheckCircle2, FileText, Loader2, UploadCloud } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ClusterRunResponseSchema, UploadResponseSchema } from "../../../../packages/shared/src";
import { API_BASE_URL, isLocalApiBaseUrl } from "../config/api";
import { Panel } from "../components/ui/Panel";
import { PageHeading } from "./PageHeading";

type UploadStatus = "idle" | "uploading" | "processing" | "done" | "error";
type CompletedRunIds = { axisA: string; axisB: string; persistence: "durable" | "memory_only" };

const buttonText: Record<UploadStatus, string> = {
  idle: "Run Clustering",
  uploading: "Uploading CSV files",
  processing: "Processing locally",
  done: "Run Complete",
  error: "Try Again"
};

export const UploadAndCluster = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [completedRunIds, setCompletedRunIds] = useState<CompletedRunIds | null>(null);
  const localApiEnabled = useMemo(() => isLocalApiBaseUrl(), []);
  const busy = status === "uploading" || status === "processing";
  const disabled = !localApiEnabled || files.length !== 7 || busy;

  const onFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setFiles(Array.from(event.target.files ?? []));
    setStatus("idle");
    setError(null);
    setCompletedRunIds(null);
  };

  const runClustering = async () => {
    if (disabled) {
      return;
    }

    try {
      setStatus("uploading");
      setError(null);
      setCompletedRunIds(null);

      const formData = new FormData();
      files.forEach((file) => formData.append("files", file));

      const uploadResponse = await fetch(`${API_BASE_URL}/api/upload`, {
        method: "POST",
        body: formData
      });

      if (!uploadResponse.ok) {
        const payload = (await uploadResponse.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? `Upload failed with ${uploadResponse.status}`);
      }

      const uploadPayload = UploadResponseSchema.parse(await uploadResponse.json());

      setStatus("processing");
      const runResponse = await fetch(`${API_BASE_URL}/api/cluster/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ upload_ref: uploadPayload.upload_ref })
      });

      if (!runResponse.ok) {
        const payload = (await runResponse.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? `Pipeline run failed with ${runResponse.status}`);
      }

      const runPayload = ClusterRunResponseSchema.parse(await runResponse.json());
      setCompletedRunIds({
        axisA: runPayload.axis_a_run_id,
        axisB: runPayload.axis_b_run_id,
        persistence: runPayload.persistence
      });
      setStatus("done");
    } catch (caught) {
      setStatus("error");
      setError(caught instanceof Error ? caught.message : "Unable to run clustering.");
    }
  };

  return (
    <>
      <PageHeading
        title="Upload Dataset & Run Clustering"
        description="Local-only workflow for the exact seven-file ADNI export manifest used by the validated Axis A and Axis B research pipelines."
      />

      {!localApiEnabled ? (
        <Panel title="Local-only feature">
          <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 shrink-0" size={18} />
            <div>
              <div className="font-semibold">This feature is only available when running locally.</div>
              <p className="mt-1 text-amber-800">
                Raw participant-level CSV files must not be sent to a deployed production API.
              </p>
            </div>
          </div>
        </Panel>
      ) : null}

      <div className="grid grid-cols-12 gap-4">
        <Panel title="Dataset Files" className="col-span-7">
          <label className="flex min-h-48 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-line bg-slate-50 px-6 py-8 text-center transition hover:border-teal-600 hover:bg-teal-50">
            <UploadCloud size={34} className="text-teal-700" strokeWidth={1.8} />
            <span className="mt-3 text-sm font-semibold">Choose the seven required ADNI CSV exports</span>
            <span className="mt-1 text-xs text-muted">Exact filenames and required headers are validated. 500MB maximum per file.</span>
            <input type="file" multiple accept=".csv" className="sr-only" onChange={onFileChange} disabled={!localApiEnabled || busy} />
          </label>

          <div className="mt-4 rounded-md border border-line">
            <div className="border-b border-line bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-normal text-muted">
              Selected files
            </div>
            {files.length > 0 ? (
              <ul className="divide-y divide-line">
                {files.map((file) => (
                  <li key={`${file.name}-${file.lastModified}`} className="flex items-center justify-between px-4 py-3 text-sm">
                    <span className="inline-flex items-center gap-2 font-medium">
                      <FileText size={16} className="text-teal-700" />
                      {file.name}
                    </span>
                    <span className="text-xs text-muted">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="px-4 py-6 text-sm text-muted">No CSV files selected.</div>
            )}
          </div>
        </Panel>

        <Panel title="Run Control" className="col-span-5">
          <div className="space-y-4">
            <div className="rounded-md border border-line bg-canvas p-4 text-sm">
              <div className="font-semibold">Status</div>
              <div className="mt-2 flex items-center gap-2 text-muted">
                {busy ? <Loader2 size={16} className="animate-spin text-teal-700" /> : null}
                {status === "done" ? <CheckCircle2 size={16} className="text-emerald-700" /> : null}
                <span className="capitalize">{status}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={runClustering}
              disabled={disabled}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white transition hover:bg-teal-900 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
            >
              {busy ? <Loader2 size={17} className="animate-spin" /> : <UploadCloud size={17} />}
              {buttonText[status]}
            </button>

            {error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

            {completedRunIds ? (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                <div className="font-semibold">Validated Axis A and Axis B analyses completed.</div>
                <p className="mt-1 text-xs text-emerald-800">
                  {completedRunIds.persistence === "durable"
                    ? "Both aggregate results were persisted to PostgreSQL."
                    : "Both aggregate results are available in this API process only; DATABASE_URL is not configured."}
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Link
                    to={`/runs/${completedRunIds.axisA}/comparison`}
                    className="rounded-md bg-white px-3 py-2 text-xs font-semibold text-emerald-800 shadow-sm ring-1 ring-emerald-200"
                  >
                    Axis A comparison
                  </Link>
                  <Link
                    to={`/runs/${completedRunIds.axisA}/cluster-profiles`}
                    className="rounded-md bg-white px-3 py-2 text-xs font-semibold text-emerald-800 shadow-sm ring-1 ring-emerald-200"
                  >
                    Axis A profiles
                  </Link>
                  <Link
                    to={`/runs/${completedRunIds.axisB}/comparison`}
                    className="rounded-md bg-white px-3 py-2 text-xs font-semibold text-emerald-800 shadow-sm ring-1 ring-emerald-200"
                  >
                    Axis B final result
                  </Link>
                  <Link
                    to={`/runs/${completedRunIds.axisB}/cluster-profiles`}
                    className="rounded-md bg-white px-3 py-2 text-xs font-semibold text-emerald-800 shadow-sm ring-1 ring-emerald-200"
                  >
                    Axis B profiles
                  </Link>
                </div>
              </div>
            ) : null}

            <div className="text-xs leading-5 text-muted">
              Required files: ADAS, CDR, FAQ, MMSE, NEUROBAT, NPIQ, and GDSCALE exports named for the 10Aug2026 snapshot. Raw rows stay on the local API filesystem; production never mounts this workflow.
            </div>
          </div>
        </Panel>
      </div>
    </>
  );
};
