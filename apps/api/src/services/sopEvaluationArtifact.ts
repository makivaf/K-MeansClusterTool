import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SopEvaluationSchema, type SopEvaluation } from "../../../../packages/shared/src/schema";

const serviceDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(serviceDirectory, "../../../..");
const artifactDirectory = path.join(repositoryRoot, "apps", "api", "artifacts");
const artifactPath = path.join(artifactDirectory, "sop_evaluation_summary.json");
const sourceArtifactDirectory = path.join(repositoryRoot, "data", "interim");

type SopEvaluationLoadOptions = { sourceArtifactDirectory?: string };

export const loadSopEvaluation = (options: SopEvaluationLoadOptions = {}): SopEvaluation | null => {
  const resolved = path.resolve(artifactPath);
  if (!resolved.startsWith(`${path.resolve(artifactDirectory)}${path.sep}`)) {
    throw new Error("The SOP evaluation artifact path escaped its aggregate directory.");
  }
  if (!fs.existsSync(resolved)) return null;
  const evaluation = SopEvaluationSchema.parse(JSON.parse(fs.readFileSync(resolved, "utf8")));
  const localSourceDirectory = path.resolve(options.sourceArtifactDirectory ?? sourceArtifactDirectory);
  const sources = Object.entries(evaluation.provenance.sourceSha256).map(([reportedPath, expectedSha256]) => {
    if (path.posix.dirname(reportedPath) !== "data/interim") throw new Error(`Invalid SOP source path: ${reportedPath}`);
    return { reportedPath, expectedSha256, sourcePath: path.resolve(localSourceDirectory, path.posix.basename(reportedPath)) };
  });
  const availableSourceCount = sources.filter(({ sourcePath }) => fs.existsSync(sourcePath)).length;
  if (availableSourceCount > 0 && availableSourceCount !== sources.length) {
    throw new Error("The local SOP source-artifact set is incomplete.");
  }
  for (const { reportedPath, expectedSha256, sourcePath } of availableSourceCount === sources.length ? sources : []) {
    if (!sourcePath.startsWith(`${localSourceDirectory}${path.sep}`) || !fs.statSync(sourcePath).isFile()) {
      throw new Error(`A declared SOP source artifact is missing or outside data/interim: ${reportedPath}`);
    }
    const actualSha256 = crypto.createHash("sha256").update(fs.readFileSync(sourcePath)).digest("hex");
    if (actualSha256 !== expectedSha256) throw new Error(`SOP evaluation source drift detected: ${reportedPath}`);
  }
  const serialized = JSON.stringify(evaluation);
  for (const forbidden of ["PTID", "RID", "participantId", "coordinates", "assignments"]) {
    if (serialized.includes(`\"${forbidden}\"`)) throw new Error(`Participant-level field escaped SOP evaluation: ${forbidden}`);
  }
  return evaluation;
};
