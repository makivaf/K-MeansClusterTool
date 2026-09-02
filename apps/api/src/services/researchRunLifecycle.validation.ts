import type { AddressInfo } from "node:net";
import express from "express";
import { ResearchRunResponseSchema } from "../../../../packages/shared/src/schema";
import { createResearchRunsRouter } from "../routes/researchRuns";
import {
  createUploadDirectory,
  InvalidUploadReferenceError,
  removeUploadDirectory,
  resolveUploadDirectory
} from "./localUploadStore";
import { ResearchExecutionError } from "./researchPipelineOrchestrator";
import { formatResearchFailureDiagnostic, ResearchAdmissionError, ResearchRunLifecycle } from "./researchRunLifecycle";
import { ResearchRunJobRepository } from "./researchRunRepository";

const nextTurn = () => new Promise<void>((resolve) => setImmediate(resolve));
let releaseFirst!: () => void;
const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
let calls = 0;
let active = 0;
let maximumActive = 0;
const cleaned: string[] = [];

const lifecycle = new ResearchRunLifecycle({
  execute: async (_directory, _request, onProgress) => {
    calls += 1;
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    onProgress?.("constructing_study_entry_cohort", 1, 4);
    if (calls === 1) await firstGate;
    onProgress?.("longitudinal_analysis", 3, 4);
    active -= 1;
    return { resultRunId: `unified-result-${calls}`, persistence: "memory_only" };
  },
  cleanupUpload: (directory) => { cleaned.push(directory); }
});

const first = lifecycle.enqueue({ upload_ref: "upload-a" }, "upload-a-directory");
const second = lifecycle.enqueue({ upload_ref: "upload-b" }, "upload-b-directory");
if (first.status !== "queued" || second.status !== "queued" || first.pipeline !== "unified") throw new Error("New unified runs must be queued");
await nextTurn();
const firstRunning = lifecycle.get(first.run_id);
if (firstRunning?.status !== "running" || firstRunning.progress.stage !== "constructing_study_entry_cohort") throw new Error("First run did not report scientific progress");
if (lifecycle.get(second.run_id)?.status !== "queued") throw new Error("Second run bypassed the single-concurrency queue");
releaseFirst();
await lifecycle.whenIdle();
const firstComplete = lifecycle.get(first.run_id);
const secondComplete = lifecycle.get(second.run_id);
if (firstComplete?.status !== "complete" || secondComplete?.status !== "complete") throw new Error("Queued runs did not complete");
if (firstComplete.result_run_id !== "unified-result-1" || secondComplete.result_run_id !== "unified-result-2") throw new Error("Unified result linkage failed");
if (maximumActive !== 1 || cleaned.length !== 2) throw new Error("Queue concurrency or upload cleanup failed");
console.log("PASS lifecycle: queued -> staged progress -> complete, single concurrency, one result linkage, cleanup");

const boundedLifecycle = new ResearchRunLifecycle({ execute: async () => ({ resultRunId: "unused", persistence: "memory_only" }), cleanupUpload: () => undefined, maxQueuedTasks: 1 });
boundedLifecycle.enqueue({ upload_ref: "upload-bounded" }, "bounded-directory");
try {
  boundedLifecycle.enqueue({ upload_ref: "upload-overflow" }, "overflow-directory");
  throw new Error("Queue overflow was accepted");
} catch (error) {
  if (error instanceof Error && error.message === "Queue overflow was accepted") throw error;
  if (!(error instanceof ResearchAdmissionError)) throw error;
}
await boundedLifecycle.whenIdle();
console.log("PASS lifecycle admission: queue overflow is rejected with backpressure");

let failedCleanup = 0;
const timeoutLifecycle = new ResearchRunLifecycle({
  execute: async () => { throw new ResearchExecutionError("EXECUTION_TIMEOUT", "PTID=SECRET C:\\private\\raw.csv"); },
  cleanupUpload: () => { failedCleanup += 1; }
});
const timedOut = timeoutLifecycle.enqueue({ upload_ref: "upload-timeout" }, "timeout-directory");
await timeoutLifecycle.whenIdle();
const failed = timeoutLifecycle.get(timedOut.run_id);
if (failed?.status !== "failed" || failed.error.code !== "EXECUTION_TIMEOUT" || JSON.stringify(failed).match(/PTID|private|raw\.csv/)) throw new Error("Timeout failure was not classified and sanitized");
if (formatResearchFailureDiagnostic(new ResearchExecutionError("EXECUTION_TIMEOUT", "PTID=SECRET")) !== "EXECUTION_TIMEOUT" || failedCleanup !== 1) throw new Error("Failure diagnostic or cleanup failed");
console.log("PASS lifecycle: failed stages expose controlled codes without participant/path leakage");

try {
  resolveUploadDirectory("../../data/raw/adni");
  throw new Error("Upload traversal accepted");
} catch (error) {
  if (error instanceof Error && error.message === "Upload traversal accepted") throw error;
  if (!(error instanceof InvalidUploadReferenceError)) throw error;
}

const routeRepository = new ResearchRunJobRepository();
const routeApp = express();
routeApp.use(express.json());
routeApp.use(createResearchRunsRouter({
  enqueue: () => routeRepository.create(),
  get: (runId) => routeRepository.get(runId)
}));
const server = routeApp.listen(0, "127.0.0.1");
await new Promise<void>((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
const routeUpload = createUploadDirectory();
try {
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const postResponse = await fetch(`${baseUrl}/api/research/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ upload_ref: routeUpload.uploadRef })
  });
  if (postResponse.status !== 202 || !postResponse.headers.get("location")) throw new Error("Unified run POST did not return 202 with Location");
  const posted = ResearchRunResponseSchema.parse(await postResponse.json()).run;
  if (posted.status !== "queued" || posted.pipeline !== "unified") throw new Error("Unified run POST did not return queued status");
  const legacyAxisResponse = await fetch(`${baseUrl}/api/research/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ axis: "Axis A", upload_ref: routeUpload.uploadRef })
  });
  if (legacyAxisResponse.status !== 400) throw new Error("New route accidentally required or accepted the legacy axis contract");
  console.log("PASS research routes: unified request accepted; legacy Axis request rejected by strict schema");
} finally {
  removeUploadDirectory(routeUpload.directory);
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
