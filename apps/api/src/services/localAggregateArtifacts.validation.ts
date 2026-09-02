import path from "node:path";
import { fileURLToPath } from "node:url";
import { FrozenUnifiedStudyResultSchema, UnifiedResearchRunSchema } from "../../../../packages/shared/src/schema";
import { adaptUnifiedResult } from "./unifiedResultAdapter";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const artifactDirectory = path.join(repositoryRoot, "data", "interim");
const run = adaptUnifiedResult(artifactDirectory, {
  runId: "frozen-unified-study-validation",
  createdAt: "2026-09-01T00:00:00.000Z"
});
FrozenUnifiedStudyResultSchema.parse(run);

if (run.cohort.parentN !== 2437 || run.cohort.atLeast3ObservationN !== 1917 || run.cohort.atLeast12MonthN !== 1845) throw new Error("Unified cohort audit counts disagree");
const eligible = [...run.cohort.byOriginalCluster].sort((left, right) => left.clusterId - right.clusterId).map((entry) => entry.atLeast12MonthParticipants);
if (eligible[0] !== 1233 || eligible[1] !== 612) throw new Error("Original-cluster longitudinal counts disagree");
if (run.provenance.prohibitedLongitudinalOperations.kmeansInvoked) throw new Error("A second longitudinal K-Means escaped the contract");
const mixedModel = run.longitudinal.mixedEffects;
if (!mixedModel.converged || mixedModel.participantCount !== 1845 || mixedModel.observationCount !== 11111) throw new Error("Mixed-effects model convergence or cohort counts disagree");
if (mixedModel.primaryResult.term !== "time_x_cluster" || !mixedModel.diagnostics.timeClusterEstimable) throw new Error("The primary Time × Cluster coefficient is missing or inestimable");
if (mixedModel.provenance.longitudinalClusteringInvoked || !mixedModel.provenance.originalAssignmentsFixed) throw new Error("Mixed-effects model provenance violates the no-clustering/fixed-assignment contract");

const forbiddenParticipantKeys = new Set(["PTID", "RID", "VISDATE", "TOTAL13", "participant_assignments", "participant_rows"]);
const inspectKeys = (value: unknown): void => {
  if (Array.isArray(value)) { value.forEach(inspectKeys); return; }
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    if (forbiddenParticipantKeys.has(key)) throw new Error(`Participant-level field escaped aggregate adapter: ${key}`);
    inspectKeys(nested);
  }
};
inspectKeys(run);

const malformed = structuredClone(run);
malformed.longitudinal.byOriginalCluster[0].eligibleParticipants += 1;
if (UnifiedResearchRunSchema.safeParse(malformed).success) throw new Error("Malformed longitudinal aggregate was accepted");
const drifted = structuredClone(run);
drifted.enhancedClustering.metrics.silhouette += 0.001;
if (FrozenUnifiedStudyResultSchema.safeParse(drifted).success) throw new Error("Frozen numerical drift was accepted");
const driftedLongitudinal = structuredClone(run);
driftedLongitudinal.longitudinal.byOriginalCluster[0].slopePointsPerYear.mean += 0.01;
if (FrozenUnifiedStudyResultSchema.safeParse(driftedLongitudinal).success) throw new Error("Frozen longitudinal descriptive drift was accepted");
const mismatchedPrimary = structuredClone(run);
mismatchedPrimary.longitudinal.mixedEffects.primaryResult.estimate += 0.1;
if (UnifiedResearchRunSchema.safeParse(mismatchedPrimary).success) throw new Error("A mismatched primary Time × Cluster result was accepted");
console.log("PASS local aggregate artifacts: frozen exact results, cohort audit, mixed-model convergence, original-cluster linkage, no second K-Means, and malformed aggregate rejection");
