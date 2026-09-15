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
import { adaptUnifiedResult } from "./unifiedResultAdapter";
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
assert.deepEqual(researchPages.map(({ label }) => label), ["Dataset Setup", "Study Findings", "Simulation Runs"]);
for (const page of researchPages) assert.ok(application.includes('path="' + page.path + '"'));
assert.ok(application.includes('path="/run-history" element={<Navigate to="/simulation-runs" replace'));
assert.ok(!/OverviewPage|EnhancedKMeansPage|ClustersPage|RunHistoryPage|useRunData/.test(application));
assert.ok(!/Unified thesis pipeline|Run Analysis|Run History/.test(read("components/layout/AppShell.tsx")));
assert.ok(setup.includes('to="/study-findings"'));
assert.ok(setup.includes("/api/upload") && !setup.includes("/api/research/runs"));
assert.ok(setup.includes("onValidated(null)"));
assert.ok(!/demo dataset|source.hash|privacy/i.test(setup));
assert.ok(!/Scatter|DefenseScatter|SopRunSeriesChart/.test(study + simulations + read("components/charts/LongitudinalProgressionChart.tsx")));
assert.ok(!/signedRelativeChangePercent|relativeMeanChangePercent/.test(study + simulations));
assert.ok(!/useRunData|useStudyFindings|useSopEvaluation|2437|1950|Math.random|setTimeout/.test(simulations));
assert.ok(!/ANALYSIS_JOB_KEY|ad-clustering.analysis-job|\/api\/research\/runs/.test(simulations));
const hook = read("hooks/useStudyFindings.ts");
assert.ok(hook.includes("/api/research/runs") && hook.includes("completedAnalysisResult"));
assert.ok(!/STUDY_RUN_ID|searchParams|selectedRun|FrozenUnifiedStudyResultSchema/.test(hook));
assert.ok(study.includes("Run Comparison") && !study.includes("useStudyFindings()"));
assert.equal(isDatasetReady(null), false);
const validated = { upload_ref: "test-upload", filenames: DATASETS.map(([, name]) => name), file_count: 7 };
assert.equal(isDatasetReady(validated), true);
assert.equal(isDatasetReady({ ...validated, filenames: validated.filenames.slice(1) }), false);
assert.equal(isDatasetReady({ ...validated, filenames: Array(7).fill(validated.filenames[0]) }), false);
console.log("PASS final routes, study/simulation separation, validation-only setup, and aggregate-only figures");

const frozen = adaptUnifiedResult(path.join(repositoryRoot, "data/interim"), { runId: "validated-unified-study-run" });
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
  assert.equal(capability.executionAvailable, false);
  assert.equal(capability.code, "SUBSAMPLE_RUNNER_UNAVAILABLE");
  assert.equal(SimulationCapabilitiesSchema.safeParse({ ...capability, executionAvailable: true }).success, false);
  console.log("PASS live capability API truthfully rejects unsupported execution");
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
