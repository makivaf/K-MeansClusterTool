import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { researchPages } from "../../../web/src/components/layout/researchNavigation";
import { countDpcMatches } from "../../../web/src/utils/studyFindings";
import { completedAnalysisResult } from "../../../web/src/utils/completedAnalysisResult";
import { DATASETS, isDatasetReady } from "../../../web/src/utils/validatedDataset";
import { FrozenUnifiedStudyResultSchema } from "../../../../packages/shared/src/schema";
import { SimulationCapabilitiesSchema } from "../../../../packages/shared/src/simulation";

import { loadSopEvaluation } from "./sopEvaluationArtifact";
import { app } from "../app";
import { once } from "node:events";
import type { AddressInfo } from "node:net";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const read = (name: string) => fs.readFileSync(path.join(repositoryRoot, "apps/web/src", name), "utf8");
const application = read("App.tsx");
const setup = read("pages/UploadAndCluster.tsx");
const study = read("pages/StudyFindingsPage.tsx");
const simulations = read("pages/SimulationRunsPage.tsx");
assert.deepEqual(researchPages.map(({ label }) => label), ["Dataset Setup", "Study Findings", "K-Means Comparison"]);
for (const page of researchPages) assert.ok(application.includes('path="' + page.path + '"'));
assert.ok(application.includes('path="/run-history" element={<Navigate to="/simulation-runs" replace'));
assert.ok(!/OverviewPage|EnhancedKMeansPage|ClustersPage|RunHistoryPage|useRunData/.test(application));
assert.ok(!/Unified thesis pipeline|Run Analysis|Run History/.test(read("components/layout/AppShell.tsx")));
assert.ok(read('components/StudyEntrySummary.tsx').includes('to="/study-findings"'));
assert.ok(setup.includes("/api/upload") && !setup.includes("/api/research/runs"));
assert.ok(setup.includes("onValidated(null)"));
assert.ok(!/demo dataset|source.hash|privacy/i.test(setup));
const studySections = ["Method Comparison Overview", '{activeTab === "sop1"', '{activeTab === "sop2"',
  '{activeTab === "sop3"', '{activeTab === "final"', 'title="Cluster Distribution"', 'title="Final Cluster Profiles"',
  'title="ADAS-Cog13 Longitudinal Progression"', 'title="Linear Mixed-Effects Model (LME)"'];
let previousSection = -1;
for (const section of studySections) {
  const position = study.indexOf(section);
  assert.ok(position > previousSection, `Study section missing or out of order: ${section}`);
  previousSection = position;
}
assert.ok(study.includes("defenseGeometry?.sop1.baseline") && study.includes("defenseGeometry?.sop3.dpc[0]"));
assert.ok(!study.includes("relativeChange={relativeChange}"), "Native-space history must not imply cross-space improvement");
assert.ok(!/useRunData|useStudyFindings|useSopEvaluation|Math.random|simulationRunsMock|Longitudinal|mixedEffects/.test(simulations));
assert.ok(!simulations.includes("Full Dataset"));
assert.ok(simulations.includes('const sampleMode = "custom" as const'));
assert.equal((simulations.match(/min=\{100\} max=\{availableParticipantCount\}/g) ?? []).length, 2);
// The requested uniform SOP layout binds independent current results directly.
assert.ok(simulations.includes("useMethodJobs") && simulations.includes("<FreshStudyResults"));
assert.ok(simulations.includes("comparison={comparison ?? undefined}"));
assert.ok(simulations.includes('visibleMethodResult(jobs, "standard")') && simulations.includes('visibleMethodResult(jobs, "enhanced")'));
assert.ok(!/ANALYSIS_JOB_KEY|ad-clustering.analysis-job|\/api\/research\/runs/.test(simulations));
const hook = read("hooks/useMethodJobs.ts");
assert.ok(hook.includes("/api/method-runs") && hook.includes("MethodJobSchema") && hook.includes("crypto.randomUUID"));
assert.ok(!/STUDY_RUN_ID|searchParams|selectedRun|FrozenUnifiedStudyResultSchema/.test(hook));
assert.ok(study.includes("MethodExecutionControls") && application.includes("useStudyExecution"));
assert.equal(isDatasetReady(null), false);
const validated = { upload_ref: "test-upload", filenames: DATASETS.map(([, name]) => name), file_count: 7, preparation: { status: "ready" as const, stage: "ready", error: null } };
assert.equal(isDatasetReady({ ...validated, preparation: undefined }), false);
assert.equal(isDatasetReady({ ...validated, preparation: { status: "preparing", stage: "preprocessing", error: null } }), false);
assert.equal(isDatasetReady(validated), true);
assert.equal(isDatasetReady({ ...validated, filenames: validated.filenames.slice(1) }), false);
assert.equal(isDatasetReady({ ...validated, filenames: Array(7).fill(validated.filenames[0]) }), false);
console.log("PASS final routes, paired study section order, provenance-bound scatter bindings, custom-only simulations, and validation-only setup");

// The active page restores stored findings from durable run history. Validate
// that real frozen contract here; never reconstruct a missing aggregate or LME.
const history = path.join(repositoryRoot, "data/processed/run-history");
const frozen = fs.readdirSync(history).filter(name => name.endsWith('.json')).flatMap(name => {
  const parsed = FrozenUnifiedStudyResultSchema.safeParse(JSON.parse(fs.readFileSync(path.join(history, name), 'utf8')));
  return parsed.success ? [parsed.data] : [];
})[0];
assert.ok(frozen, 'Verified full-cohort historical results must be available');
FrozenUnifiedStudyResultSchema.parse(frozen);
const completedJob = {
  pipeline: "unified" as const, status: "complete" as const, run_id: "explicit-study-job",
  created_at: new Date().toISOString(), started_at: new Date().toISOString(), finished_at: new Date().toISOString(),
  result_run_id: frozen.run_id, persistence: "memory_only" as const
};
assert.equal(completedAnalysisResult(completedJob, { run: frozen }).run_id, frozen.run_id);
assert.throws(() => completedAnalysisResult({ ...completedJob, result_run_id: "another-result" }, { run: frozen }));
assert.throws(() => completedAnalysisResult({ pipeline: "unified", status: "queued", run_id: "pending", created_at: completedJob.created_at }, { run: frozen }));
const unrelated = structuredClone(frozen);
unrelated.cohort.parentN = 1950;
assert.equal(FrozenUnifiedStudyResultSchema.safeParse(unrelated).success, false);
const sop = loadSopEvaluation();
assert.ok(sop);
assert.equal(countDpcMatches(sop.sop3), 21);
assert.equal(countDpcMatches({ ...sop.sop3, randomRuns: undefined }), null);
const changed = structuredClone(sop.sop3);
assert.ok(changed.randomRuns);
changed.randomRuns[0].silhouette += 0.01;
assert.equal(countDpcMatches(changed), 20);
const permuted = structuredClone(sop.sop3);
permuted.randomRuns?.forEach((run) => run.clusterSizes.reverse());
assert.equal(countDpcMatches(permuted), 21);
console.log("PASS frozen cohort rejection and artifact-derived, label-invariant DPC agreement");

const server = app.listen(0, "127.0.0.1");
try {
  await once(server, "listening");
  const port = (server.address() as AddressInfo).port;
  const response = await fetch(`http://127.0.0.1:${port}/api/simulations/capabilities`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const capability = SimulationCapabilitiesSchema.parse(await response.json());
  assert.equal(capability.code, capability.executionAvailable ? "SUBSAMPLE_RUNNER_AVAILABLE" : "SUBSAMPLE_RUNNER_UNAVAILABLE");
  assert.equal(SimulationCapabilitiesSchema.safeParse({ ...capability, sampleParticipantIds: [] }).success, false);
  console.log("PASS live capability API exposes availability without participant IDs");
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
