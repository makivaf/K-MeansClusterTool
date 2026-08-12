import fs from "node:fs";
import path from "node:path";

export class ArtifactValidationError extends Error {
  readonly code = "ARTIFACT_VALIDATION_FAILURE";
}

export const requireArtifact = (directory: string, filename: string): string => {
  if (path.basename(filename) !== filename) throw new ArtifactValidationError("Invalid aggregate artifact name.");
  const artifactPath = path.resolve(directory, filename);
  if (!artifactPath.startsWith(path.resolve(directory) + path.sep) || !fs.existsSync(artifactPath)) {
    throw new ArtifactValidationError(`Required aggregate artifact is missing: ${filename}.`);
  }
  return artifactPath;
};

const parseCsv = (text: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') { value += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(value); value = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(value); value = "";
      if (row.some((entry) => entry !== "")) rows.push(row);
      row = [];
    } else value += character;
  }
  if (quoted) throw new ArtifactValidationError("Malformed quoted CSV aggregate artifact.");
  if (value !== "" || row.length > 0) { row.push(value); rows.push(row); }
  return rows;
};

export const readCsvRecords = (directory: string, filename: string): Record<string, string>[] => {
  const rows = parseCsv(fs.readFileSync(requireArtifact(directory, filename), "utf8").replace(/^\uFEFF/, ""));
  const header = rows.shift();
  if (!header || new Set(header).size !== header.length) throw new ArtifactValidationError(`Invalid header in ${filename}.`);
  return rows.map((values) => Object.fromEntries(header.map((column, index) => [column, values[index] ?? ""])));
};

export const readJsonArtifact = <T>(directory: string, filename: string): T => {
  try { return JSON.parse(fs.readFileSync(requireArtifact(directory, filename), "utf8")) as T; }
  catch (error) {
    if (error instanceof ArtifactValidationError) throw error;
    throw new ArtifactValidationError(`Malformed JSON aggregate artifact: ${filename}.`);
  }
};

export const finiteNumber = (value: unknown, label: string): number => {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) throw new ArtifactValidationError(`Invalid numeric aggregate field: ${label}.`);
  return number;
};

export const positiveInteger = (value: unknown, label: string): number => {
  const number = finiteNumber(value, label);
  if (!Number.isInteger(number) || number <= 0) throw new ArtifactValidationError(`Invalid positive integer aggregate field: ${label}.`);
  return number;
};
