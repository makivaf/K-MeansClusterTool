import { UploadResponseSchema, type UploadResponse } from "../../../../packages/shared/src/schema";

export const DATASETS = [
  ["ADAS", "All_Subjects_ADAS_10Aug2026.csv"],
  ["CDR", "All_Subjects_CDR_10Aug2026.csv"],
  ["FAQ", "All_Subjects_FAQ_10Aug2026.csv"],
  ["MMSE", "All_Subjects_MMSE_10Aug2026.csv"],
  ["NEUROBAT", "All_Subjects_NEUROBAT_10Aug2026.csv"],
  ["NPI-Q", "All_Subjects_NPIQ_10Aug2026.csv"],
  ["GDS", "All_Subjects_GDSCALE_10Aug2026.csv"]
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
  if (dataset) sessionStorage.setItem(DATASET_KEY, JSON.stringify(dataset));
  else sessionStorage.removeItem(DATASET_KEY);
};
