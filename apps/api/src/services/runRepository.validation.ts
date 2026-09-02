import path from "node:path";
import { fileURLToPath } from "node:url";
import { axisADevelopmentFixture, axisBDevelopmentFixture } from "../../../../packages/shared/src/dummyRuns";
import { adaptUnifiedResult } from "./unifiedResultAdapter";
import {
  clearMemoryRunsForTests,
  getRunById,
  importAxisResults,
  importRun,
  listRuns
} from "./runRepository";

const originalDatabaseUrl = process.env.DATABASE_URL;
const originalNodeEnv = process.env.NODE_ENV;
const originalLegacyFixtures = process.env.INCLUDE_LEGACY_AXIS_FIXTURES;
delete process.env.DATABASE_URL;
process.env.NODE_ENV = "development";
delete process.env.INCLUDE_LEGACY_AXIS_FIXTURES;
clearMemoryRunsForTests();
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

try {
  const unified = adaptUnifiedResult(path.join(repositoryRoot, "data", "interim"), {
    runId: "repository-unified-validation",
    createdAt: "2026-09-01T00:00:00.000Z"
  });
  const persisted = await importRun(unified);
  if (!("pipeline" in persisted) || persisted.pipeline !== "unified") throw new Error("Unified persistence contract failed");
  const retrieved = await getRunById(unified.run_id);
  if (!retrieved || !("pipeline" in retrieved) || retrieved.cohort.parentN !== 2437) throw new Error("Unified retrieval failed");
  const listed = await listRuns();
  if (!listed.some((run) => "pipeline" in run && run.pipeline === "unified")) throw new Error("Unified result was not listed");
  if (listed.some((run) => "axis" in run)) throw new Error("Legacy Axis fixtures leaked into the active default result list");
  console.log("PASS repository: unified aggregate is persisted/retrieved and active listing excludes legacy fixtures");

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
  clearMemoryRunsForTests();
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = originalDatabaseUrl;
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = originalNodeEnv;
  if (originalLegacyFixtures === undefined) delete process.env.INCLUDE_LEGACY_AXIS_FIXTURES; else process.env.INCLUDE_LEGACY_AXIS_FIXTURES = originalLegacyFixtures;
}
