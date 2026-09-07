const datasetLabels: Record<string, string> = {
  ADAS: "ADAS", CDR: "CDR", FAQ: "FAQ", MMSE: "MMSE", NEUROBAT: "NEUROBAT", NPIQ: "NPI-Q", GDSCALE: "GDS"
};

/** Presentation only: never use this value for upload matching or provenance. */
export const formatSourceFileLabel = (text: string): string => text
  .replace(/All_Subjects_(ADAS|CDR|FAQ|MMSE|NEUROBAT|NPIQ|GDSCALE)_(?:10Aug2026|Aug102026)\.csv/gi,
    (_filename, dataset: string) => datasetLabels[dataset.toUpperCase()])
  .replace(/[_ -]?(?:10Aug2026|Aug102026)/gi, "");
