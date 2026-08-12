import { axisADevelopmentFixture, axisBDevelopmentFixture } from "./dummyRuns.js";
import {
  ClusteringRunSchema,
  ClusterRunResponseSchema,
  FrozenAxisAStudyResultSchema,
  FrozenAxisBStudyResultSchema
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
  axis_a_run_id: axisADevelopmentFixture.run_id,
  axis_b_run_id: axisBDevelopmentFixture.run_id
};
ClusterRunResponseSchema.parse(coordinatedResponse);
console.log("PASS accepted: coordinated response with separate axis records");

if (ClusterRunResponseSchema.safeParse({ ...coordinatedResponse, axis_b_run_id: coordinatedResponse.axis_a_run_id }).success) {
  throw new Error("Coordinated response should reject one record masquerading as both axes");
}
console.log("PASS rejected: coordinated response reusing one run ID for both axes");
