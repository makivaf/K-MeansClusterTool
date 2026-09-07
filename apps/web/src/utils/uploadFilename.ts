/** Resolve short export names to the original filenames required by the pipeline. */
export const canonicalUploadFilename = (filename: string): string =>
  /^(ADAS|CDR|FAQ|GDSCALE|MMSE|NEUROBAT|NPIQ)\.csv$/.test(filename)
    ? `All_Subjects_${filename.slice(0, -4)}_10Aug2026.csv`
    : filename;
