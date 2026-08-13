import { axisADevelopmentFixture, axisBDevelopmentFixture } from "./dummyRuns.js";
import {
  ClusteringRunSchema,
  ClusterRunResponseSchema,
  FrozenAxisAStudyResultSchema,
  FrozenAxisBStudyResultSchema,
  ResearchRunRequestSchema,
  ResearchRunStatusSchema
} from "./schema.js";

type MutablePayload = Record<string, any>;

const clonePayload = (value: unknown): MutablePayload => JSON.parse(JSON.stringify(value)) as MutablePayload;

const expectAccepted = (name: string, payload: unknown) => {
  const result = ClusteringRunSchema.safeParse(payload);
  if (!result.success) {
    throw new Error(`${name} should be accepted: ${result.error.message}`);
  }
  console.log(`PASS accepted: ${name}`);
};

const expectRejected = (name: string, payload: unknown) => {
  if (ClusteringRunSchema.safeParse(payload).success) {
    throw new Error(`${name} should be rejected`);
  }
  console.log(`PASS rejected: ${name}`);
};

expectAccepted("methodologically valid Axis A aggregate", axisADevelopmentFixture);
expectAccepted("methodologically valid Axis B aggregate", axisBDevelopmentFixture);

if (FrozenAxisAStudyResultSchema.safeParse(axisADevelopmentFixture).success) {
  throw new Error("A reusable Axis A fixture must not masquerade as the frozen thesis result");
}
console.log("PASS rejected: general Axis A fixture as frozen thesis cardinalities");

if (FrozenAxisBStudyResultSchema.safeParse(axisBDevelopmentFixture).success) {
  throw new Error("A reusable Axis B fixture must not masquerade as the frozen thesis result");
}
console.log("PASS rejected: general Axis B fixture as frozen thesis cardinalities");

const axisBWithOneSelectedCluster = clonePayload(axisBDevelopmentFixture);
axisBWithOneSelectedCluster.nbclust = {
  candidate_k: [1, 2],
  selected_k: 1,
  index_votes: [{ optimal_k: 1, votes: 1 }],
  vote_summary: []
};
axisBWithOneSelectedCluster.final_clustering.selected_k = 1;
axisBWithOneSelectedCluster.final_clustering.cluster_profiles = [
  { cluster_id: 1, n_members: 3, variable_means: {} }
];
expectAccepted("Axis B contract with a data-derived non-frozen k", axisBWithOneSelectedCluster);

const axisBWithPca = clonePayload(axisBDevelopmentFixture);
axisBWithPca.pca = axisADevelopmentFixture.pca;
expectRejected("Axis B claiming PCA", axisBWithPca);

const axisBWithDpcInitialization = clonePayload(axisBDevelopmentFixture);
axisBWithDpcInitialization.dpc_suitability.used_for_final_initialization = true;
expectRejected("Axis B claiming DPC final initialization", axisBWithDpcInitialization);

const axisBAsEnhancedResult = clonePayload(axisBDevelopmentFixture);
axisBAsEnhancedResult.conditions = axisADevelopmentFixture.conditions;
expectRejected("Axis B represented as Axis A-style enhanced result", axisBAsEnhancedResult);

const axisAWithoutPca = clonePayload(axisADevelopmentFixture);
delete axisAWithoutPca.pca;
expectRejected("Axis A missing PCA", axisAWithoutPca);

const axisAWithoutDpcInitialization = clonePayload(axisADevelopmentFixture);
delete axisAWithoutDpcInitialization.dpc_init;
expectRejected("Axis A missing DPC initialization", axisAWithoutDpcInitialization);

const axisBWithParticipantAssignments = clonePayload(axisBDevelopmentFixture);
axisBWithParticipantAssignments.participant_assignments = [{ PTID: "not-allowed", cluster: 1 }];
expectRejected("participant-level assignments", axisBWithParticipantAssignments);

const axisAWithParticipantCandidateId = clonePayload(axisADevelopmentFixture);
axisAWithParticipantCandidateId.dpc_init.gamma_values[0].candidate_id = "001_S_0001";
expectRejected("participant identifier used as DPC candidate ID", axisAWithParticipantCandidateId);

const coordinatedResponse = {
  status: "complete",
  persistence: "memory_only",
  axis_a_run_id: axisADevelopmentFixture.run_id,
  axis_b_run_id: axisBDevelopmentFixture.run_id
};
ClusterRunResponseSchema.parse(coordinatedResponse);
console.log("PASS accepted: coordinated response with separate axis records");

if (ClusterRunResponseSchema.safeParse({ ...coordinatedResponse, axis_b_run_id: coordinatedResponse.axis_a_run_id }).success) {
  throw new Error("Coordinated response should reject one record masquerading as both axes");
}
console.log("PASS rejected: coordinated response reusing one run ID for both axes");

ResearchRunRequestSchema.parse({ axis: "Axis A", upload_ref: "upload-1", run_label: "Axis A validation" });
ResearchRunRequestSchema.parse({ axis: "Axis B", upload_ref: "upload-2" });
if (ResearchRunRequestSchema.safeParse({ axis: "Axis C", upload_ref: "upload-3" }).success) {
  throw new Error("Unsupported research axis should be rejected");
}
if (ResearchRunRequestSchema.safeParse({ axis: "Axis A", upload_ref: "upload-1", axis_b_options: {} }).success) {
  throw new Error("Cross-axis request fields should be rejected");
}
console.log("PASS research request: strict Axis A/Axis B discrimination");

const lifecycleBase = { run_id: "research-test", axis: "Axis A", created_at: "2026-08-13T00:00:00.000Z" };
ResearchRunStatusSchema.parse({ ...lifecycleBase, status: "queued" });
ResearchRunStatusSchema.parse({ ...lifecycleBase, status: "running", started_at: "2026-08-13T00:00:01.000Z" });
ResearchRunStatusSchema.parse({ ...lifecycleBase, status: "complete", started_at: "2026-08-13T00:00:01.000Z", finished_at: "2026-08-13T00:00:02.000Z", result_run_id: "axis-a-result", persistence: "memory_only" });
ResearchRunStatusSchema.parse({ ...lifecycleBase, status: "failed", started_at: "2026-08-13T00:00:01.000Z", finished_at: "2026-08-13T00:00:02.000Z", error: { code: "EXECUTION_FAILURE", message: "The research pipeline did not complete successfully." } });
console.log("PASS research status: queued, running, complete, and failed contracts");
