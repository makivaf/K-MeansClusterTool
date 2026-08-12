import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { analysisInputManifest, validateAnalysisInputManifest } from "./analysisInputManifest";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "analysis-input-contract-"));
try {
  for (const file of analysisInputManifest) {
    fs.writeFileSync(path.join(root, file.filename), `${file.requiredColumns.join(",")}\n`, "utf8");
  }
  validateAnalysisInputManifest(root);
  console.log("PASS accepted: exact seven-file ADNI manifest with required headers");

  fs.rmSync(path.join(root, analysisInputManifest[0].filename));
  try {
    validateAnalysisInputManifest(root);
    throw new Error("Missing required export should be rejected");
  } catch (error) {
    if (error instanceof Error && error.message === "Missing required export should be rejected") throw error;
  }
  console.log("PASS rejected: incomplete ADNI manifest");
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
