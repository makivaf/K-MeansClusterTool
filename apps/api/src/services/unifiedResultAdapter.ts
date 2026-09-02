import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  UnifiedResearchArtifactSchema,
  UnifiedResearchRunSchema,
  type UnifiedResearchRun
} from "../../../../packages/shared/src/schema";

type AdapterOptions = { runId?: string; title?: string; createdAt?: string };

export const UNIFIED_RESULT_FILENAME = "unified_research_result.json";
export const MIXED_MODEL_JSON_FILENAME = "unified_longitudinal_mixed_model.json";
export const MIXED_MODEL_CSV_FILENAME = "unified_longitudinal_mixed_model.csv";

const verifyAggregateArtifact = (
  artifactDirectory: string,
  reportedPath: string,
  expectedFilename: string,
  expectedSha256: string
): void => {
  if (path.basename(reportedPath) !== expectedFilename) {
    throw new Error(`The ${expectedFilename} provenance path is invalid.`);
  }
  const artifactPath = path.resolve(artifactDirectory, expectedFilename);
  const directoryRoot = path.resolve(artifactDirectory);
  if (!artifactPath.startsWith(`${directoryRoot}${path.sep}`) || !fs.existsSync(artifactPath) || !fs.statSync(artifactPath).isFile()) {
    throw new Error(`The ${expectedFilename} provenance artifact is missing.`);
  }
  const actualSha256 = crypto.createHash("sha256").update(fs.readFileSync(artifactPath)).digest("hex");
  if (actualSha256 !== expectedSha256) {
    throw new Error(`The ${expectedFilename} provenance hash is invalid.`);
  }
};

export const adaptUnifiedResult = (
  artifactDirectory: string,
  options: AdapterOptions = {}
): UnifiedResearchRun => {
  const artifactPath = path.resolve(artifactDirectory, UNIFIED_RESULT_FILENAME);
  const directoryRoot = path.resolve(artifactDirectory);
  if (!artifactPath.startsWith(`${directoryRoot}${path.sep}`)) {
    throw new Error("The unified aggregate artifact path escaped its artifact directory.");
  }
  if (!fs.existsSync(artifactPath) || !fs.statSync(artifactPath).isFile()) {
    throw new Error("The unified aggregate research artifact is missing.");
  }

  let document: unknown;
  try {
    document = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  } catch {
    throw new Error("The unified aggregate research artifact is not valid JSON.");
  }
  const artifact = UnifiedResearchArtifactSchema.parse(document);
  verifyAggregateArtifact(artifactDirectory, artifact.provenance.mixedModelOutput.jsonPath, MIXED_MODEL_JSON_FILENAME, artifact.provenance.mixedModelOutput.jsonSha256);
  verifyAggregateArtifact(artifactDirectory, artifact.provenance.mixedModelOutput.csvPath, MIXED_MODEL_CSV_FILENAME, artifact.provenance.mixedModelOutput.csvSha256);

  return UnifiedResearchRunSchema.parse({
    ...artifact,
    run_id: options.runId ?? `unified-${crypto.randomUUID()}`,
    result_source: "validated_research_output",
    pipeline: "unified",
    title: options.title ?? "Unified enhanced K-Means and longitudinal progression analysis",
    description:
      "One continuous research run: enhanced K-Means defines Cluster 0 and Cluster 1, then eligible members of those same clusters are compared longitudinally.",
    created_at: options.createdAt ?? new Date().toISOString()
  });
};
