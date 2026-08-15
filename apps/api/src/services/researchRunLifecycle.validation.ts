import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import express from "express";
import { axisADevelopmentFixture } from "../../../../packages/shared/src/dummyRuns";
import { ResearchRunResponseSchema } from "../../../../packages/shared/src/schema";
import { createResearchRunsRouter } from "../routes/researchRuns";
import { executeResearchAxis } from "./executeResearchAxis";
import {
  createUploadDirectory,
  InvalidUploadReferenceError,
  removeUploadDirectory,
  resolveUploadDirectory
} from "./localUploadStore";
import { ResearchExecutionError } from "./researchPipelineOrchestrator";
import { ResearchRunLifecycle } from "./researchRunLifecycle";
import { ResearchRunJobRepository } from "./researchRunRepository";

const nextTurn = () => new Promise<void>((resolve) => setImmediate(resolve));

let releaseFirst!: () => void;
const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
let calls = 0;
let active = 0;
let maximumActive = 0;
const cleaned: string[] = [];

const lifecycle = new ResearchRunLifecycle({
  execute: async (_directory, request) => {
    calls += 1;
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    if (calls === 1) await firstGate;
    active -= 1;
    return { resultRunId: `${request.axis}-result-${calls}`, persistence: "memory_only" };
  },
  cleanupUpload: (directory) => { cleaned.push(directory); }
});

const first = lifecycle.enqueue({ axis: "Axis A", upload_ref: "upload-a" }, "upload-a-directory");
const second = lifecycle.enqueue({ axis: "Axis B", upload_ref: "upload-b" }, "upload-b-directory");
if (first.status !== "queued" || second.status !== "queued") throw new Error("New research runs must be returned queued");
await nextTurn();
if (lifecycle.get(first.run_id)?.status !== "running") throw new Error("First research run did not transition to running");
if (lifecycle.get(second.run_id)?.status !== "queued") throw new Error("Second research run bypassed the single-concurrency queue");
releaseFirst();
await lifecycle.whenIdle();
const firstComplete = lifecycle.get(first.run_id);
const secondComplete = lifecycle.get(second.run_id);
if (firstComplete?.status !== "complete" || secondComplete?.status !== "complete") throw new Error("Queued runs did not complete");
if (firstComplete.result_run_id !== "Axis A-result-1" || secondComplete.result_run_id !== "Axis B-result-2") throw new Error("Final result_run_id linkage failed");
if (maximumActive !== 1) throw new Error("Research dispatcher exceeded single concurrency");
if (cleaned.length !== 2) throw new Error("Upload cleanup did not run for every completed task");
console.log("PASS lifecycle: queued -> running -> complete, single concurrency, result linkage, and upload cleanup");

let failedUploadCleanups = 0;
const timeoutLifecycle = new ResearchRunLifecycle({
  execute: async () => { throw new ResearchExecutionError("EXECUTION_TIMEOUT", "PTID=001_S_SECRET C:\\sensitive\\raw.csv"); },
  cleanupUpload: () => { failedUploadCleanups += 1; }
});
const timedOut = timeoutLifecycle.enqueue({ axis: "Axis A", upload_ref: "upload-timeout" }, "timeout-directory");
await timeoutLifecycle.whenIdle();
const failed = timeoutLifecycle.get(timedOut.run_id);
if (failed?.status !== "failed" || failed.error.code !== "EXECUTION_TIMEOUT") throw new Error("Execution timeout was not represented as failed");
if (JSON.stringify(failed).match(/PTID|sensitive|raw\.csv/)) throw new Error("Sensitive process detail escaped the failure sanitizer");
if (failedUploadCleanups !== 1) throw new Error("Failed research upload was not cleaned");
console.log("PASS lifecycle: timeout failure is classified and sanitized");

let environmentFailureCleanups = 0;
const environmentFailureLifecycle = new ResearchRunLifecycle({
  execute: async () => { throw new ResearchExecutionError("ENVIRONMENT_FAILURE", "C:\\private\\missing-python.exe"); },
  cleanupUpload: () => { environmentFailureCleanups += 1; }
});
const environmentFailure = environmentFailureLifecycle.enqueue(
  { axis: "Axis B", upload_ref: "upload-environment-failure" },
  "environment-failure-directory"
);
await environmentFailureLifecycle.whenIdle();
const environmentFailed = environmentFailureLifecycle.get(environmentFailure.run_id);
if (environmentFailed?.status !== "failed" || environmentFailed.error.code !== "ENVIRONMENT_FAILURE") {
  throw new Error("Interpreter environment failure was not represented as failed");
}
if (JSON.stringify(environmentFailed).includes("private") || environmentFailureCleanups !== 1) {
  throw new Error("Interpreter failure was not sanitized or its upload was not cleaned");
}
console.log("PASS lifecycle: interpreter failure is sanitized and cleans the upload");

const genericFailureLifecycle = new ResearchRunLifecycle({
  execute: async () => { throw new Error("participant_id=SECRET local-file.csv"); },
  cleanupUpload: () => undefined
});
const genericFailure = genericFailureLifecycle.enqueue({ axis: "Axis B", upload_ref: "upload-failure" }, "failure-directory");
await genericFailureLifecycle.whenIdle();
const genericFailed = genericFailureLifecycle.get(genericFailure.run_id);
if (genericFailed?.status !== "failed" || JSON.stringify(genericFailed).includes("SECRET")) throw new Error("Generic failure was not sanitized");
console.log("PASS lifecycle: generic failed lifecycle is sanitized");

try {
  resolveUploadDirectory("../../data/raw/adni");
  throw new Error("Upload traversal accepted");
} catch (error) {
  if (error instanceof Error && error.message === "Upload traversal accepted") throw error;
  if (!(error instanceof InvalidUploadReferenceError)) throw error;
}
console.log("PASS upload store: path traversal rejected");

const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "axis-execution-cleanup-"));
const executionResult = await executeResearchAxis("unused-upload", { axis: "Axis A", upload_ref: "upload-execution" }, {
  orchestrate: async () => ({ executionId: "research-link", workspace, axisAArtifactDirectory: workspace, axisBArtifactDirectory: workspace }),
  adaptAxisA: (_directory, options) => ({ ...axisADevelopmentFixture, run_id: options.runId, created_at: options.createdAt }),
  persist: async (payload) => payload as typeof axisADevelopmentFixture,
  persistenceMode: () => "memory_only"
});
if (executionResult.resultRunId !== "research-link-axis-a") throw new Error("Axis execution returned the wrong result run ID");
if (fs.existsSync(workspace)) throw new Error("Axis execution workspace was not cleaned");
console.log("PASS axis execution: persisted result linkage and workspace cleanup");

const failedWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), "axis-execution-failure-cleanup-"));
try {
  await executeResearchAxis("unused-upload", { axis: "Axis A", upload_ref: "upload-failed-execution" }, {
    orchestrate: async () => ({ executionId: "research-failure", workspace: failedWorkspace, axisAArtifactDirectory: failedWorkspace, axisBArtifactDirectory: failedWorkspace }),
    adaptAxisA: () => { throw new Error("participant_id=SECRET"); }
  });
  throw new Error("Invalid aggregate artifacts were accepted");
} catch (error) {
  if (error instanceof Error && error.message === "Invalid aggregate artifacts were accepted") throw error;
}
if (fs.existsSync(failedWorkspace)) throw new Error("Failed axis execution workspace was not cleaned");
console.log("PASS axis execution: failed workspace cleanup");

let equivalenceFailureAdapted = false;
let equivalenceFailurePersisted = false;
try {
  await executeResearchAxis("unused-upload", { axis: "Axis B", upload_ref: "upload-equivalence-failure" }, {
    orchestrate: async () => {
      throw new ResearchExecutionError("EXECUTION_FAILURE", "Runtime scientific equivalence failed: axis_b_nbclust_k_selection.json.");
    },
    adaptAxisB: () => {
      equivalenceFailureAdapted = true;
      throw new Error("Adapter must not run");
    },
    persist: async (payload) => {
      equivalenceFailurePersisted = true;
      return payload as typeof axisADevelopmentFixture;
    }
  });
  throw new Error("Failed equivalence reached result persistence");
} catch (error) {
  if (error instanceof Error && error.message === "Failed equivalence reached result persistence") throw error;
  if (!(error instanceof ResearchExecutionError)) throw error;
}
if (equivalenceFailureAdapted || equivalenceFailurePersisted) {
  throw new Error("Failed equivalence reached aggregate adaptation or persistence");
}
console.log("PASS axis execution: failed prerequisite equivalence prevents adaptation and persistence");

let sourceFailureAdapted = false;
let sourceFailurePersisted = false;
try {
  await executeResearchAxis("unused-upload", { axis: "Axis B", upload_ref: "upload-source-failure" }, {
    orchestrate: async () => {
      throw new ResearchExecutionError(
        "EXECUTION_FAILURE",
        "The isolated workspace failed canonical research-source verification."
      );
    },
    adaptAxisB: () => {
      sourceFailureAdapted = true;
      throw new Error("Adapter must not run");
    },
    persist: async (payload) => {
      sourceFailurePersisted = true;
      return payload as typeof axisADevelopmentFixture;
    }
  });
  throw new Error("Canonical source failure reached result persistence");
} catch (error) {
  if (error instanceof Error && error.message === "Canonical source failure reached result persistence") throw error;
  if (!(error instanceof ResearchExecutionError)) throw error;
}
if (sourceFailureAdapted || sourceFailurePersisted) {
  throw new Error("Canonical source failure reached aggregate adaptation or persistence");
}
console.log("PASS axis execution: canonical source failure prevents adaptation and persistence");

const routeRepository = new ResearchRunJobRepository();
const routeApp = express();
routeApp.use(express.json());
routeApp.use(createResearchRunsRouter({
  enqueue: (request) => routeRepository.create(request.axis),
  get: (runId) => routeRepository.get(runId)
}));
const server = routeApp.listen(0, "127.0.0.1");
await new Promise<void>((resolve, reject) => {
  server.once("listening", resolve);
  server.once("error", reject);
});
const routeUpload = createUploadDirectory();
try {
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const postResponse = await fetch(`${baseUrl}/api/research/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ axis: "Axis A", upload_ref: routeUpload.uploadRef })
  });
  if (postResponse.status !== 202 || !postResponse.headers.get("location")) throw new Error("Research run POST did not return 202 with Location");
  const posted = ResearchRunResponseSchema.parse(await postResponse.json()).run;
  if (posted.status !== "queued") throw new Error("Research run POST did not return queued status");
  const getResponse = await fetch(`${baseUrl}/api/research/runs/${posted.run_id}`);
  const fetched = ResearchRunResponseSchema.parse(await getResponse.json()).run;
  if (getResponse.status !== 200 || fetched.run_id !== posted.run_id) throw new Error("Research run GET did not return the job resource");
  console.log("PASS research routes: POST 202 queued response, Location header, and GET linkage");
} finally {
  removeUploadDirectory(routeUpload.directory);
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
