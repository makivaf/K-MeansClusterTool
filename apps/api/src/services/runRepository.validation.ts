import { axisADevelopmentFixture, axisBDevelopmentFixture } from "../../../../packages/shared/src/dummyRuns";
import { clearMemoryRunsForTests, getRunById, importAxisResults, listRuns } from "./runRepository";

const originalDatabaseUrl = process.env.DATABASE_URL;
const originalNodeEnv = process.env.NODE_ENV;
delete process.env.DATABASE_URL;
process.env.NODE_ENV = "development";
clearMemoryRunsForTests();

try {
  const imported = await importAxisResults(axisADevelopmentFixture, axisBDevelopmentFixture);
  if (imported.persistence !== "memory_only") throw new Error("Development import incorrectly claimed durability");
  if ((await getRunById(axisADevelopmentFixture.run_id))?.axis !== "Axis A") throw new Error("Axis A retrieval failed");
  if ((await getRunById(axisBDevelopmentFixture.run_id))?.axis !== "Axis B") throw new Error("Axis B retrieval failed");
  if ((await getRunById("missing-run")) !== null) throw new Error("Missing run did not return null");
  console.log("PASS repository: separate in-memory Axis A/B imports are retrievable and explicitly non-durable");

  try { await importAxisResults(axisBDevelopmentFixture, axisADevelopmentFixture); throw new Error("Swapped axes accepted"); } catch (error) {
    if (error instanceof Error && error.message === "Swapped axes accepted") throw error;
  }
  console.log("PASS repository: axis masquerading rejected");

  clearMemoryRunsForTests();
  process.env.NODE_ENV = "production";
  try { await listRuns(); throw new Error("Production dummy fallback accepted"); } catch (error) {
    if (error instanceof Error && error.message === "Production dummy fallback accepted") throw error;
  }
  console.log("PASS repository: production refuses dummy fallback without DATABASE_URL");
} finally {
  clearMemoryRunsForTests();
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = originalDatabaseUrl;
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = originalNodeEnv;
}
