import fs from "node:fs";
import path from "node:path";

export type AnalysisInputFileSpec = {
  filename: string;
  axis: "Axis A" | "Axis A and Axis B";
  requiredColumns: readonly string[];
};

const commonColumns = ["RID", "PTID", "PHASE", "VISCODE", "VISCODE2", "VISDATE"] as const;

export const analysisInputManifest: readonly AnalysisInputFileSpec[] = [
  { filename: "All_Subjects_ADAS_10Aug2026.csv", axis: "Axis A and Axis B", requiredColumns: [...commonColumns, "TOTAL13"] },
  { filename: "All_Subjects_CDR_10Aug2026.csv", axis: "Axis A", requiredColumns: [...commonColumns, "CDRSB"] },
  { filename: "All_Subjects_FAQ_10Aug2026.csv", axis: "Axis A", requiredColumns: [...commonColumns, "FAQTOTAL"] },
  { filename: "All_Subjects_MMSE_10Aug2026.csv", axis: "Axis A", requiredColumns: [...commonColumns, "MMSCORE"] },
  {
    filename: "All_Subjects_NEUROBAT_10Aug2026.csv",
    axis: "Axis A",
    requiredColumns: [
      ...commonColumns,
      "LIMMTOTAL", "LDELTOTAL", "TRAASCOR", "TRABSCOR", "CATANIMSC", "BNTTOTAL",
      "AVTOT1", "AVTOT2", "AVTOT3", "AVTOT4", "AVTOT5", "AVDEL30MIN"
    ]
  },
  { filename: "All_Subjects_NPIQ_10Aug2026.csv", axis: "Axis A", requiredColumns: [...commonColumns, "NPISCORE"] },
  { filename: "All_Subjects_GDSCALE_10Aug2026.csv", axis: "Axis A", requiredColumns: [...commonColumns, "GDTOTAL"] }
] as const;

export class AnalysisInputError extends Error {
  readonly code = "INVALID_ANALYSIS_INPUT";
}

const parseCsvHeader = (text: string): string[] => {
  const columns: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      columns.push(current.trim().replace(/^\uFEFF/, ""));
      current = "";
    } else {
      current += character;
    }
  }
  if (quoted) throw new AnalysisInputError("A CSV header contains an unterminated quoted field.");
  columns.push(current.trim());
  return columns;
};

const readHeader = (filePath: string): string[] => {
  const descriptor = fs.openSync(filePath, "r");
  try {
    const buffer = Buffer.alloc(256 * 1024);
    const bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, 0);
    const prefix = buffer.subarray(0, bytesRead).toString("utf8");
    const newline = prefix.search(/[\r\n]/);
    if (newline < 0) throw new AnalysisInputError(`${path.basename(filePath)} has no readable CSV header row.`);
    return parseCsvHeader(prefix.slice(0, newline));
  } finally {
    fs.closeSync(descriptor);
  }
};

export const validateAnalysisInputManifest = (uploadDirectory: string): void => {
  const directoryEntries = fs.readdirSync(uploadDirectory, { withFileTypes: true });
  const suppliedFiles = directoryEntries.filter((entry) => entry.isFile()).map((entry) => entry.name).sort();
  const expectedFiles = analysisInputManifest.map((entry) => entry.filename).sort();
  const missing = expectedFiles.filter((filename) => !suppliedFiles.includes(filename));
  const unexpected = suppliedFiles.filter((filename) => !expectedFiles.includes(filename));

  if (missing.length > 0 || unexpected.length > 0) {
    const details = [
      missing.length > 0 ? `missing: ${missing.join(", ")}` : "",
      unexpected.length > 0 ? `unexpected: ${unexpected.join(", ")}` : ""
    ].filter(Boolean).join("; ");
    throw new AnalysisInputError(`Upload must contain the seven named ADNI exports (${details}).`);
  }

  for (const specification of analysisInputManifest) {
    const headers = new Set(readHeader(path.join(uploadDirectory, specification.filename)));
    const missingColumns = specification.requiredColumns.filter((column) => !headers.has(column));
    if (missingColumns.length > 0) {
      throw new AnalysisInputError(`${specification.filename} is missing required columns: ${missingColumns.join(", ")}.`);
    }
  }
};
