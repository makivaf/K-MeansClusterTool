import { UploadResponseSchema, type UploadResponse } from "../../../../packages/shared/src/schema";

export const DATASETS = [
  ["ADAS", "ADAS.csv"],
  ["CDR", "CDR.csv"],
  ["FAQ", "FAQ.csv"],
  ["MMSE", "MMSE.csv"],
  ["NEUROBAT", "NEUROBAT.csv"],
  ["NPI-Q", "NPIQ.csv"],
  ["GDS", "GDSCALE.csv"]
] as const;

const DATASET_KEY = "ad-clustering.validated-dataset";
export const isDatasetReady = (dataset: UploadResponse | null): dataset is UploadResponse =>
  dataset !== null && dataset.file_count === DATASETS.length && dataset.filenames.length === DATASETS.length &&
  DATASETS.every(([, name]) => dataset.filenames.includes(name));

// Store validation metadata only; the CSVs remain in the API's upload store.
export const readValidatedDataset = (): UploadResponse | null => {
  try {
    const parsed = UploadResponseSchema.safeParse(JSON.parse(sessionStorage.getItem(DATASET_KEY) ?? "null"));
    return parsed.success && isDatasetReady(parsed.data) ? parsed.data : null;
  } catch { return null; }
};

export const saveValidatedDataset = (dataset: UploadResponse | null) => {
  try {
    if (dataset) sessionStorage.setItem(DATASET_KEY, JSON.stringify(dataset));
    else sessionStorage.removeItem(DATASET_KEY);
  } catch { /* In-memory navigation state remains available if storage is disabled. */ }
};

const FILENAMES_KEY = "ad-clustering.validated-filenames";
export const readValidatedFilenames = (): Record<string, string> => {
  const dataset = readValidatedDataset();
  if (!dataset) return {};
  try {
    const saved = JSON.parse(sessionStorage.getItem(FILENAMES_KEY) ?? "null");
    return Object.fromEntries(DATASETS.map(([, key]) => [key,
      saved?.uploadRef === dataset.upload_ref && typeof saved?.filenames?.[key] === "string" ? saved.filenames[key] : key]));
  } catch { return Object.fromEntries(DATASETS.map(([, key]) => [key, key])); }
};

export const saveValidatedFilenames = (dataset: UploadResponse | null, filenames: Record<string, string>) => {
  try {
    if (dataset) sessionStorage.setItem(FILENAMES_KEY, JSON.stringify({ uploadRef: dataset.upload_ref, filenames }));
    else sessionStorage.removeItem(FILENAMES_KEY);
  } catch { /* Display metadata is optional; never persist File objects. */ }
};
