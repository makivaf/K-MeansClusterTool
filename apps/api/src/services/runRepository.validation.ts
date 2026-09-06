import path from "node:path";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { fork, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { axisADevelopmentFixture, axisBDevelopmentFixture } from "../../../../packages/shared/src/dummyRuns";
import { adaptUnifiedResult } from "./unifiedResultAdapter";
import {
  clearMemoryRunsForTests,
  getRunById,
  getRunPersistenceMode,
  importAxisResults,
  importRun,
  listRuns
} from "./runRepository";
import { RunListResponseSchema, RunResponseSchema } from "../../../../packages/shared/src/schema";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

if (process.argv.includes("--restart-server")) {
  const { app } = await import("../app");
  const { executeUnifiedResearch } = await import("./executeUnifiedResearch");
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  process.send?.({ port: (server.address() as AddressInfo).port });
  process.on("message", async (command) => {
    if (command === "stop") server.close(() => process.exit(0));
    if (command === "complete") {
      try {
        const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "history-execution-"));
        const result = await executeUnifiedResearch("unused-upload", { upload_ref: "validation", run_label: "Restart validation" }, undefined, {
          // Reuse validated artifacts; never execute methodology to test persistence.
          orchestrate: async () => ({ executionId: "restart-validation", workspace, artifactDirectory: path.join(repositoryRoot, "data/interim") })
        });
        assert.equal(fs.existsSync(workspace), false);
        process.send?.(result);
      } catch (error) {
        process.send?.({ error: String(error) });
      }
    }
  });
} else {

const originalDatabaseUrl = process.env.DATABASE_URL;
const originalNodeEnv = process.env.NODE_ENV;
const originalLegacyFixtures = process.env.INCLUDE_LEGACY_AXIS_FIXTURES;
const originalHistoryDirectory = process.env.RESEARCH_RUN_HISTORY_DIRECTORY;
const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "run-history-validation-"));
process.env.RESEARCH_RUN_HISTORY_DIRECTORY = path.join(testDirectory, "history");
delete process.env.DATABASE_URL;
process.env.NODE_ENV = "development";
delete process.env.INCLUDE_LEGACY_AXIS_FIXTURES;
clearMemoryRunsForTests();
let apiProcess: ChildProcess | undefined;
const waitForMessage = (child: ChildProcess): Promise<any> => new Promise((resolve, reject) => {
  const cleanup = () => { clearTimeout(timer); child.off("message", received); child.off("error", failed); child.off("exit", exited); };
  const received = (message: unknown) => { cleanup(); resolve(message); };
  const failed = (error: Error) => { cleanup(); reject(error); };
  const exited = () => failed(new Error("API test process exited before responding"));
  const timer = setTimeout(() => failed(new Error("API test process timed out")), 30000);
  child.once("message", received); child.once("error", failed); child.once("exit", exited);
});
const startApi = async () => {
  apiProcess = fork(fileURLToPath(import.meta.url), ["--restart-server"], { execArgv: ["--import", "tsx"], env: { ...process.env }, stdio: ["ignore", "inherit", "inherit", "ipc"] });
  const ready = await waitForMessage(apiProcess);
  return `http://127.0.0.1:${ready.port}`;
};
const stopApi = async () => {
  const child = apiProcess!;
  const exited = once(child, "exit");
  child.send("stop");
  await exited;
  apiProcess = undefined;
};

try {
  const unified = adaptUnifiedResult(path.join(repositoryRoot, "data", "interim"), {
    runId: "repository-unified-validation",
    createdAt: "2026-09-01T00:00:00.000Z"
  });
  const persisted = await importRun(unified);
  assert.equal(getRunPersistenceMode(), "durable");
  if (!("pipeline" in persisted) || persisted.pipeline !== "unified") throw new Error("Unified persistence contract failed");
  const retrieved = await getRunById(unified.run_id);
  if (!retrieved || !("pipeline" in retrieved) || retrieved.cohort.parentN !== 2437) throw new Error("Unified retrieval failed");
  const listed = await listRuns();
  if (!listed.some((run) => "pipeline" in run && run.pipeline === "unified")) throw new Error("Unified result was not listed");
  if (listed.some((run) => "axis" in run)) throw new Error("Legacy Axis fixtures leaked into the active default result list");
  console.log("PASS repository: unified aggregate is persisted/retrieved and active listing excludes legacy fixtures");

  clearMemoryRunsForTests();
  assert.deepEqual(await getRunById(unified.run_id), unified);
  await importRun({ ...unified, title: "Updated history title" });
  assert.equal((await listRuns()).filter((run) => run.run_id === unified.run_id).length, 1);
  assert.equal((await getRunById(unified.run_id))?.title, "Updated history title");
  await assert.rejects(importRun({ run_id: "invalid" }));
  const historyDirectory = process.env.RESEARCH_RUN_HISTORY_DIRECTORY!;
  const blockedPath = path.join(testDirectory, "not-a-directory");
  fs.writeFileSync(blockedPath, "blocked");
  process.env.RESEARCH_RUN_HISTORY_DIRECTORY = blockedPath;
  await assert.rejects(importRun({ ...unified, run_id: "failed-write" }));
  process.env.RESEARCH_RUN_HISTORY_DIRECTORY = historyDirectory;
  assert.equal(await getRunById("failed-write"), null);
  fs.writeFileSync(path.join(historyDirectory, `${"0".repeat(64)}.json`), "invalid JSON");
  fs.writeFileSync(path.join(historyDirectory, "incomplete.tmp"), "partial write");
  assert.ok(await getRunById(unified.run_id));
  fs.unlinkSync(path.join(historyDirectory, `${"0".repeat(64)}.json`));
  console.log("PASS local storage: reload, upsert/deduplication, invalid input, failed writes, and partial/corrupt file isolation");

  const firstApi = await startApi();
  const completionMessage = waitForMessage(apiProcess!);
  apiProcess!.send("complete");
  const completion = await completionMessage;
  assert.equal(completion.persistence, "durable", completion.error);
  const immediate = RunListResponseSchema.parse(await (await fetch(`${firstApi}/api/runs`)).json());
  assert.ok(immediate.runs.some((run) => run.run_id === completion.resultRunId));
  const beforeRestart = RunResponseSchema.parse(await (await fetch(`${firstApi}/api/runs/${completion.resultRunId}`)).json());
  await stopApi();
  const secondApi = await startApi();
  const afterRestart = RunResponseSchema.parse(await (await fetch(`${secondApi}/api/runs/${completion.resultRunId}`)).json());
  assert.deepEqual(afterRestart, beforeRestart);
  const restartedList = RunListResponseSchema.parse(await (await fetch(`${secondApi}/api/runs`)).json());
  assert.ok(restartedList.runs.some((run) => run.run_id === completion.resultRunId));
  assert.ok(restartedList.runs.some((run) => run.run_id === unified.run_id));
  assert.equal(new Set(restartedList.runs.map((run) => run.run_id)).size, restartedList.runs.length);
  await stopApi();
  console.log("PASS API restart: newly completed result appears immediately and survives a fresh API process with identical scientific payload");

  const legacy = await importAxisResults(axisADevelopmentFixture, axisBDevelopmentFixture);
  if (legacy.persistence !== "memory_only") throw new Error("Legacy audit import incorrectly claimed durability");
  const legacyA = await getRunById(axisADevelopmentFixture.run_id);
  if (!legacyA || !("axis" in legacyA) || legacyA.axis !== "Axis A") throw new Error("Legacy audit compatibility failed");
  console.log("PASS repository: deprecated Axis artifacts remain importable for audit compatibility");

  clearMemoryRunsForTests();
  process.env.NODE_ENV = "production";
  try {
    await listRuns();
    throw new Error("Production local-artifact fallback accepted");
  } catch (error) {
    if (error instanceof Error && error.message === "Production local-artifact fallback accepted") throw error;
  }
  console.log("PASS repository: production refuses local artifact fallback without DATABASE_URL");
} finally {
  if (apiProcess) {
    const exited = once(apiProcess, "exit");
    apiProcess.kill();
    await exited;
  }
  clearMemoryRunsForTests();
  if (originalHistoryDirectory === undefined) delete process.env.RESEARCH_RUN_HISTORY_DIRECTORY; else process.env.RESEARCH_RUN_HISTORY_DIRECTORY = originalHistoryDirectory;
  if (!path.resolve(testDirectory).startsWith(`${path.resolve(os.tmpdir())}${path.sep}`)) throw new Error("Test cleanup escaped its temporary root");
  fs.rmSync(testDirectory, { recursive: true, force: true });
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = originalDatabaseUrl;
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = originalNodeEnv;
  if (originalLegacyFixtures === undefined) delete process.env.INCLUDE_LEGACY_AXIS_FIXTURES; else process.env.INCLUDE_LEGACY_AXIS_FIXTURES = originalLegacyFixtures;
}
}
