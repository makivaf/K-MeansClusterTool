import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { UnifiedMixedEffectsModelSchema } from "../../../../packages/shared/src/schema";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const artifactDirectory = path.join(repositoryRoot, "data", "interim");
const modelPath = path.join(artifactDirectory, "unified_longitudinal_mixed_model.json");
const coefficientPath = path.join(artifactDirectory, "unified_longitudinal_mixed_model.csv");
const model = UnifiedMixedEffectsModelSchema.parse(JSON.parse(fs.readFileSync(modelPath, "utf8")));

if (model.participantCount !== 1845 || model.observationCount !== 11111) throw new Error("Mixed-model frozen cohort counts disagree");
const clusterCounts = [...model.participantCountsByOriginalCluster].sort((left, right) => left.clusterId - right.clusterId).map((entry) => entry.participantCount);
if (clusterCounts[0] !== 1233 || clusterCounts[1] !== 612) throw new Error("Mixed-model original-cluster counts disagree");
if (!model.converged || !model.diagnostics.timeClusterEstimable || model.primaryResult.term !== "time_x_cluster") throw new Error("Primary mixed-model fit is not valid");
if (model.provenance.longitudinalClusteringInvoked || !model.provenance.originalAssignmentsFixed) throw new Error("Mixed-model provenance violates fixed-assignment/no-clustering requirements");

for (const [reportedPath, expectedHash] of Object.entries(model.provenance.inputSha256)) {
  const absolutePath = path.resolve(repositoryRoot, reportedPath);
  if (!absolutePath.startsWith(`${repositoryRoot}${path.sep}`) || !fs.existsSync(absolutePath)) throw new Error("Mixed-model input provenance path is invalid");
  const actualHash = crypto.createHash("sha256").update(fs.readFileSync(absolutePath)).digest("hex");
  if (actualHash !== expectedHash) throw new Error(`Mixed-model input provenance hash mismatch: ${reportedPath}`);
}

const serialized = JSON.stringify(model);
for (const forbidden of ["PTID", "RID", "VISDATE", "TOTAL13", "participant_rows", "participant_assignments"]) {
  if (serialized.includes(`\"${forbidden}\"`)) throw new Error(`Participant-level field escaped mixed-model artifact: ${forbidden}`);
}
const coefficientLines = fs.readFileSync(coefficientPath, "utf8").trim().split(/\r?\n/);
if (coefficientLines.length !== 5 || /PTID|RID|VISDATE|TOTAL13/.test(coefficientLines[0])) throw new Error("Mixed-model coefficient CSV is not aggregate-only or complete");

const malformed = structuredClone(model) as Record<string, any>;
malformed.observationCount = 11110;
if (UnifiedMixedEffectsModelSchema.safeParse(malformed).success) throw new Error("A mismatched mixed-model cohort was accepted");
const missingInteraction = structuredClone(model) as Record<string, any>;
missingInteraction.fixedEffects.pop();
if (UnifiedMixedEffectsModelSchema.safeParse(missingInteraction).success) throw new Error("A mixed model without Time × Cluster was accepted");

console.log("PASS mixed-effects model: exact cohort, fixed assignments, convergence, coefficient structure, aggregate privacy, and input hashes validated");
