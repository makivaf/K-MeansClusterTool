import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/** SHA-256 of the committed LF Git blob used by the historical DPC audit. */
export const DPC_INIT_AXIS_A_CANONICAL_SHA256 =
  "bda58cfd431934c7c2077bc0fdc583a9fe5a5a771f18682d7d14a4edd9bec513";

export class ResearchSourceMaterializationError extends Error {}

export const sha256Bytes = (contents: Buffer): string =>
  crypto.createHash("sha256").update(contents).digest("hex");

/** Frozen Python sources are committed with LF bytes. Windows checkouts may
 * expose the same text as CRLF, so only disposable workspace copies of .py
 * files are restored to their committed/historical byte representation. */
export const canonicalizeResearchPythonSource = (contents: Buffer): Buffer =>
  Buffer.from(contents.toString("utf8").replace(/\r\n?/g, "\n"), "utf8");

export const materializeCanonicalResearchSources = (
  sourceDirectory: string,
  destinationDirectory: string
): void => {
  fs.mkdirSync(destinationDirectory, { recursive: true });
  for (const entry of fs.readdirSync(sourceDirectory, { withFileTypes: true })) {
    const source = path.join(sourceDirectory, entry.name);
    const destination = path.join(destinationDirectory, entry.name);
    if (entry.isFile() && path.extname(entry.name).toLowerCase() === ".py") {
      fs.writeFileSync(destination, canonicalizeResearchPythonSource(fs.readFileSync(source)));
    } else {
      fs.cpSync(source, destination, { recursive: true });
    }
  }
};

export const verifyCanonicalDpcSource = (
  researchScriptsDirectory: string,
  expectedSha256 = DPC_INIT_AXIS_A_CANONICAL_SHA256
): string => {
  const source = path.join(researchScriptsDirectory, "dpc_init_axis_a.py");
  if (!fs.existsSync(source) || !fs.statSync(source).isFile()) {
    throw new ResearchSourceMaterializationError("The canonical DPC research source is missing.");
  }
  const actualSha256 = sha256Bytes(fs.readFileSync(source));
  if (actualSha256 !== expectedSha256) {
    throw new ResearchSourceMaterializationError("The canonical DPC research source hash is invalid.");
  }
  return actualSha256;
};
