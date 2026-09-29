/** Canonical runtime filenames are short; retain legacy upload aliases for compatibility. */
export const canonicalUploadFilename = (filename: string): string =>
  filename.replace(/^All_Subjects_(ADAS|CDR|FAQ|GDSCALE|MMSE|NEUROBAT|NPIQ)_(?:10Aug2026|Aug102026)\.csv$/, "$1.csv");
