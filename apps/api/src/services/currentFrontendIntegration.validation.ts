import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { app } from "../app";
import { analysisInputManifest } from "./analysisInputManifest";
import { removeUploadDirectory, resolveUploadDirectory } from "./localUploadStore";
import { executeSimulation } from "./simulationExecution";
import { RunListResponseSchema, RunResponseSchema, FrozenUnifiedStudyResultSchema, SopEvaluationResponseSchema, UploadResponseSchema } from "../../../../packages/shared/src/schema";
import { SimulationRunStateSchema } from "../../../../packages/shared/src/simulation";
import { hasSharedSopProvenance } from "../../../web/src/utils/sopProvenance";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const configuration = { sampleMode: "custom" as const, sampleCount: 100, manualK: null };
if (process.argv.includes("--execute")) {
  const result = await executeSimulation(1, configuration);
  assert.equal(result.status, "complete");
  assert.equal(result.result!.sameParticipantsVerified, true);
  assert.equal(result.result!.analysis.existing.selectedK, result.result!.analysis.existing.silhouetteSelectedK);
}
const server = app.listen(0, "127.0.0.1");
await once(server, "listening");
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
let uploadRef: string | undefined;
try {
  const body = new FormData();
  for (const { filename } of analysisInputManifest) {
    body.append("files", new Blob([fs.readFileSync(path.join(root, "data/raw/adni", filename))]), filename);
  }
  const uploaded = await fetch(`${base}/api/upload`, { method: "POST", body });
  const dataset = UploadResponseSchema.parse(await uploaded.json());
  uploadRef = dataset.upload_ref;
  assert.equal(uploaded.status, 201);
  assert.equal(dataset.file_count, 7);
  const capabilities = await (await fetch(`${base}/api/simulations/capabilities`)).json();
  assert.equal(capabilities.executionAvailable, true);
  for (const method of ["GET", "POST"]) {
    const response = await fetch(`${base}/api/simulations/1/run${method === "GET" ? "?sampleMode=custom&sampleCount=100" : ""}`, {
      method, ...(method === "POST" ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(configuration) } : {})
    });
    assert.equal(response.status, 200);
    const run = SimulationRunStateSchema.parse(await response.json());
    assert.equal(run.status, "complete");
    assert.equal(run.result!.analysis.existing.participantCount, 100);
    assert.equal(run.result!.analysis.enhanced.participantCount, 100);
    assert.equal(run.result!.sameParticipantsVerified, true);
    const analysis = run.result!.analysis;
    assert.equal(analysis.existing.ariBySeed?.length, 30);
    assert.equal(analysis.enhanced.dpc.ariByRun?.length, 3);
    assert.ok(analysis.enhanced.dpc.ariByRun?.every(row => row.adjustedRandIndex === 1));
    assert.ok(analysis.enhanced.pcaVariance.every(row => Number.isFinite(row.eigenvalue)));
    assert.equal(analysis.pcaContribution?.k, analysis.existing.selectedK);
  }
  const list = RunListResponseSchema.parse(await (await fetch(`${base}/api/runs`)).json());
  const full = list.runs.find(run => "pipeline" in run && run.pipeline === "unified");
  assert.ok(full, "A persisted authoritative full-cohort result is required");
  const response = await fetch(`${base}/api/runs/${encodeURIComponent(full.run_id)}`);
  assert.equal(response.status, 200);
  const study = FrozenUnifiedStudyResultSchema.parse(RunResponseSchema.parse(await response.json()).run);
  assert.equal(study.cohort.parentN, 2437);
  const evidenceResponse = await fetch(`${base}/api/sop-evaluation`);
  assert.equal(evidenceResponse.status, 200);
  const evidence = SopEvaluationResponseSchema.parse(await evidenceResponse.json());
  assert.ok(hasSharedSopProvenance(study, evidence.evaluation, evidence.studyEvidence ?? null));
  assert.equal(evidence.studyEvidence?.ariBySeed.filter(row => row.adjustedRandIndex === 1).length, 21);
  assert.deepEqual(evidence.studyEvidence?.dpcAriByRun, [1, 2, 3].map(seed => ({ seed, adjustedRandIndex: 1 })));
  assert.deepEqual(evidence.studyEvidence?.dpcCenters?.map(row => row.rid), ["1086", "5124"]);
  assert.deepEqual(evidence.studyEvidence?.dpcCenters?.map(row => row.rho), [223, 218]);
  const wrongAri = structuredClone(evidence);
  wrongAri.studyEvidence!.dpcAriByRun![1].adjustedRandIndex = 0.5;
  assert.equal(SopEvaluationResponseSchema.safeParse(wrongAri).success, false);
  assert.equal(SopEvaluationResponseSchema.safeParse({ ...evidence, defenseGeometry: null }).success, false);
  assert.equal(study.preprocessing.retainedFeatures.length, 13);
  assert.equal(study.pca.components, 6);
  assert.equal((100 * study.pca.cumulativeExplainedVariance).toFixed(2), "87.48");
  assert.equal(study.kSelection.selectedK, 2);
  assert.equal(study.kSelection.usableVotes, 24);
  assert.equal(study.kSelection.votesForSelectedK, 9);
  assert.deepEqual([...study.enhancedClustering.clusterSizes].sort((a, b) => a.clusterId - b.clusterId).map(row => row.nMembers), [1553, 884]);
  const enhanced = study.enhancedClustering.metrics;
  assert.deepEqual([enhanced.silhouette, enhanced.daviesBouldin, enhanced.calinskiHarabasz].map(value => value.toFixed(6)),
    ["0.372700", "1.075885", "1800.024958"]);
  const standard = Object.fromEntries(study.baselineComparison.metrics.map(row => [row.metric, row.baselineValue]));
  assert.deepEqual([standard.silhouette, standard.davies_bouldin, standard.calinski_harabasz].map(value => value.toFixed(6)),
    ["0.331875", "1.224116", "1442.023132"]);
  console.log("PASS real seven-file upload, capabilities, automatic paired simulation GET/POST, full-cohort n=2437 result API, and hash-verified matching study evidence.");
} finally {
  if (uploadRef) removeUploadDirectory(resolveUploadDirectory(uploadRef));
  await new Promise<void>(resolve => server.close(() => resolve()));
}
