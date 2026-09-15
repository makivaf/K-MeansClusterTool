import { CheckCircle2, UploadCloud } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { UploadResponseSchema, type UploadResponse } from "../../../../packages/shared/src/schema";
import { API_BASE_URL, isLocalApiBaseUrl } from "../config/api";
import { canonicalUploadFilename } from "../utils/uploadFilename";
import { Panel } from "../components/ui/Panel";
import { PageHeading } from "./PageHeading";

export const DATASETS = [
  ["ADAS", "All_Subjects_ADAS_10Aug2026.csv"],
  ["CDR", "All_Subjects_CDR_10Aug2026.csv"],
  ["FAQ", "All_Subjects_FAQ_10Aug2026.csv"],
  ["MMSE", "All_Subjects_MMSE_10Aug2026.csv"],
  ["NEUROBAT", "All_Subjects_NEUROBAT_10Aug2026.csv"],
  ["NPI-Q", "All_Subjects_NPIQ_10Aug2026.csv"],
  ["GDS", "All_Subjects_GDSCALE_10Aug2026.csv"]
] as const;

export const UploadAndCluster = ({ onValidated }: { onValidated: (dataset: UploadResponse | null) => void }) => {
  const [files, setFiles] = useState<Record<string, File>>({});
  const [validated, setValidated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invalidFiles, setInvalidFiles] = useState<string[]>([]);
  const controllerRef = useRef<AbortController | null>(null);
  const localApi = isLocalApiBaseUrl();
  const ready = DATASETS.every(([, name]) => files[name]);

  useEffect(() => () => controllerRef.current?.abort(), []);
  const chooseFiles = (incoming: File[], expected?: string) => {
    if (busy) return;
    onValidated(null);
    setValidated(false);
    setError(null);
    setInvalidFiles([]);
    const accepted: Record<string, File> = {};
    const rejected: string[] = [];
    for (const file of incoming) {
      const canonical = canonicalUploadFilename(file.name);
      if (!DATASETS.some(([, name]) => name === canonical) || (expected && expected !== canonical) || accepted[canonical]) rejected.push(file.name);
      else accepted[canonical] = file;
    }
    setFiles((current) => ({ ...current, ...accepted }));
    if (rejected.length) {
      setError("Choose the required ADNI export for each dataset.");
      // A rejected replacement cannot leave the previous file marked valid.
      if (expected) {
        setFiles((current) => { const next = { ...current }; delete next[expected]; return next; });
        setInvalidFiles([expected]);
      }
    }
  };

  const validate = async () => {
    if (!ready || busy || !localApi) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    setBusy(true); setValidated(false); setError(null); onValidated(null);
    try {
      const body = new FormData();
      DATASETS.forEach(([, name]) => body.append("files", files[name], name));
      const response = await fetch(`${API_BASE_URL}/api/upload`, { method: "POST", body, signal: controller.signal });
      if (!response.ok) {
        const payload: unknown = await response.json().catch(() => null);
        const message = payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
          ? payload.error : "Dataset validation failed. Try again.";
        const affected = DATASETS.filter(([, name]) => message.includes(name)).map(([, name]) => name);
        setInvalidFiles(affected.length ? affected : DATASETS.map(([, name]) => name));
        throw new Error(message);
      }
      const parsed = UploadResponseSchema.safeParse(await response.json());
      if (!parsed.success) throw new Error("The API returned an invalid dataset validation response.");
      const dataset = parsed.data;
      if (dataset.file_count !== DATASETS.length || dataset.filenames.length !== DATASETS.length ||
        !DATASETS.every(([, name]) => dataset.filenames.includes(name))) throw new Error("The API did not validate all seven exports.");
      setValidated(true); setInvalidFiles([]); onValidated(dataset);
    } catch (caught) {
      if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Unable to validate dataset.");
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  };

  return <>
    <PageHeading title="Dataset Setup" description="Select and validate the seven required ADNI CSV exports." />
    <Panel title="Required datasets" variant="surface" action={
      <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-teal-800">
        <UploadCloud size={16} /> Select CSV files
        <input type="file" multiple accept=".csv" className="sr-only" aria-label="Select CSV files" disabled={busy || !localApi}
          onChange={(event) => { chooseFiles(Array.from(event.target.files ?? [])); event.currentTarget.value = ""; }} />
      </label>
    }>
      <div className="overflow-x-auto"><table className="research-table">
        <thead><tr><th>Dataset</th><th>Selected file</th><th>Status</th></tr></thead>
        <tbody>{DATASETS.map(([label, name]) => {
          const file = files[name];
          const invalid = invalidFiles.includes(name);
          const status = invalid ? "Invalid" : validated ? "Valid" : "Not uploaded";
          return <tr key={name}>
            <td className="font-semibold">{label}</td>
            <td><span className="block max-w-[30rem] break-all text-xs text-muted">{file?.name ?? "—"}</span>
              <label className="mt-1 inline-block cursor-pointer text-xs font-semibold text-teal-800 underline">
                {file ? "Replace file" : "Choose file"}
                <input type="file" accept=".csv" className="sr-only" aria-label={`Choose ${label} file`} disabled={busy || !localApi}
                  onChange={(event) => { const selected = event.target.files?.[0]; if (selected) chooseFiles([selected], name); event.currentTarget.value = ""; }} />
              </label>
            </td>
            <td className={`whitespace-nowrap text-xs font-semibold ${invalid ? "text-red-700" : validated ? "text-teal-800" : "text-muted"}`}>{status}</td>
          </tr>;
        })}</tbody>
      </table></div>
      {!localApi ? <p role="alert" className="mt-4 text-sm text-muted">Dataset validation requires the local API.</p> : null}
      {error ? <p role="alert" className="mt-4 text-sm text-red-700">{error}</p> : null}
      <div className="mt-6 flex flex-wrap items-center gap-4">
        {!validated ? <button type="button" disabled={!ready || busy || !localApi}
          onClick={() => { setInvalidFiles([]); void validate(); }}
          className="inline-flex h-11 items-center rounded-sm bg-teal-700 px-5 text-sm font-semibold text-white hover:bg-teal-900 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500">
          {busy ? "Validating Dataset…" : "Validate Dataset"}
        </button> : null}
        <span role="status" className="text-sm text-teal-800">{validated ? <span className="inline-flex items-center gap-2"><CheckCircle2 size={18} />Dataset ready</span> : busy ? "Validating the seven exports" : null}</span>
        {validated ? <Link to="/study-findings" className="inline-flex h-11 items-center rounded-sm bg-teal-700 px-5 text-sm font-semibold text-white hover:bg-teal-900">View Study Findings</Link> : null}
      </div>
    </Panel>
  </>;
};
