import { CheckCircle2, UploadCloud } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { UploadResponseSchema, type UploadResponse } from "../../../../packages/shared/src/schema";
import { API_BASE_URL, isLocalApiBaseUrl } from "../config/api";
import { canonicalUploadFilename } from "../utils/uploadFilename";
import { Panel } from "../components/ui/Panel";
import { PageHeading } from "./PageHeading";
import { DATASETS, isDatasetReady } from "../utils/validatedDataset";

export const UploadAndCluster = ({ onValidated, dataset }: {
  onValidated: (dataset: UploadResponse | null) => void;
  dataset: UploadResponse | null;
}) => {
  const [files, setFiles] = useState<Record<string, File>>({});
  const validated = isDatasetReady(dataset);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invalidFiles, setInvalidFiles] = useState<string[]>([]);
  const controllerRef = useRef<AbortController | null>(null);
  const localApi = isLocalApiBaseUrl();
  const selectedCount = DATASETS.filter(([, name]) => files[name]).length;
  const ready = DATASETS.every(([, name]) => files[name]);

  useEffect(() => () => controllerRef.current?.abort(), []);
  const chooseFiles = (incoming: File[], expected?: string) => {
    if (busy || incoming.length === 0) return;
    onValidated(null);
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
    if (!ready || busy || controllerRef.current || !localApi) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    setBusy(true); setError(null); onValidated(null);
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
      if (!isDatasetReady(dataset)) throw new Error("The API did not validate all seven exports.");
      if (controller.signal.aborted) return;
      setInvalidFiles([]); onValidated(dataset);
    } catch (caught) {
      if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Unable to validate dataset.");
    } finally {
      controllerRef.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  };

  return <div className="research-page">
    <PageHeading title="Dataset Setup" description="Validate the seven ADNI CSV exports to continue." />
    <Panel title="Required datasets" variant="surface" action={
      <label className="research-file-action research-secondary-button" aria-disabled={busy || !localApi}>
        <UploadCloud size={16} aria-hidden="true" /> Select CSV files
        <input type="file" multiple accept=".csv" className="sr-only" aria-label="Select CSV files" disabled={busy || !localApi}
          onChange={(event) => { chooseFiles(Array.from(event.target.files ?? [])); event.currentTarget.value = ""; }} />
      </label>
    }>
      <p role="status" className="mb-4 text-sm text-muted">{validated ? "7 of 7 datasets validated" : `${selectedCount} of 7 files selected`}</p>
      <div className="overflow-x-auto" role="region" aria-label="Required datasets" tabIndex={0} aria-busy={busy}><table className="research-table">
        <caption className="sr-only">Required ADNI exports and validation status</caption>
        <thead><tr><th scope="col">Dataset</th><th scope="col">Selected file</th><th scope="col">Status</th></tr></thead>
        <tbody>{DATASETS.map(([label, name]) => {
          const file = files[name];
          const invalid = invalidFiles.includes(name);
          const status = invalid ? "Invalid" : validated ? "Valid" : file ? "Selected" : "Missing";
          return <tr key={name}>
            <td className="whitespace-nowrap font-semibold">{label}</td>
            <td><span className="block max-w-[30rem] break-all text-sm text-muted">{file?.name ?? (validated ? name : "—")}</span>
              <label className="research-file-action research-text-action mt-1 inline-block" aria-disabled={busy || !localApi}>
                {file || validated ? "Replace file" : "Choose file"}
                <input type="file" accept=".csv" className="sr-only" aria-label={`Choose ${label} file`} disabled={busy || !localApi}
                  onChange={(event) => { const selected = event.target.files?.[0]; if (selected) chooseFiles([selected], name); event.currentTarget.value = ""; }} />
              </label>
            </td>
            <td><span className={`research-badge ${invalid ? "is-invalid" : validated ? "is-valid" : ""}`}>{validated ? <CheckCircle2 size={14} aria-hidden="true" /> : null}{status}</span></td>
          </tr>;
        })}</tbody>
      </table></div>
      {!localApi ? <p role="alert" className="mt-4 text-sm text-muted">Dataset validation requires the local API.</p> : null}
      {error ? <p role="alert" className="mt-4 text-sm text-red-700">{error}</p> : null}
      <div className="mt-6 flex flex-col gap-4 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
        <span role="status" className="text-sm text-muted">{validated ? <span className="inline-flex items-center gap-2 text-teal-800"><CheckCircle2 size={18} aria-hidden="true" />Dataset ready</span> : busy ? "Validating exports…" : ready ? "All files selected. Ready to validate." : "Select all seven files to validate."}</span>
        {!validated ? <button type="button" disabled={!ready || busy || !localApi}
          onClick={() => { setInvalidFiles([]); void validate(); }}
          className="research-primary-button">
          {busy ? "Validating…" : "Validate Dataset"}
        </button> : null}
        {validated ? <Link to="/study-findings" className="research-primary-button">Continue to Study Findings</Link> : null}
      </div>
    </Panel>
  </div>;
};
