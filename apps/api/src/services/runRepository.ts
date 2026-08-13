import { PrismaClient } from "@prisma/client";
import { dummyRuns } from "../../../../packages/shared/src/dummyRuns";
import { ClusteringRunSchema, type ClusteringRun } from "../../../../packages/shared/src/schema";

let prisma: PrismaClient | null = null;
const memoryRuns = new Map<string, ClusteringRun>();
const isProduction = () => process.env.NODE_ENV === "production";

export const getRunPersistenceMode = (): "durable" | "memory_only" =>
  process.env.DATABASE_URL ? "durable" : "memory_only";

const getPrisma = () => {
  if (!process.env.DATABASE_URL) {
    return null;
  }
  prisma ??= new PrismaClient();
  return prisma;
};

export const listRuns = async (): Promise<ClusteringRun[]> => {
  const client = getPrisma();

  // TODO: Replace dummy fallback with persisted Python pipeline outputs once the thesis pipeline writes finalized JSON/Postgres records.
  if (!client) {
    if (isProduction()) {
      throw new Error("DATABASE_URL is required in production; refusing to serve dummy clustering runs.");
    }
    return [...memoryRuns.values(), ...dummyRuns.filter((run) => !memoryRuns.has(run.run_id))];
  }

  try {
    const rows = await client.clusteringRun.findMany({
      orderBy: { createdAt: "desc" }
    });
    return rows.map((row: { payload: unknown }) => ClusteringRunSchema.parse(row.payload));
  } catch (error) {
    if (isProduction()) {
      throw error;
    }
    console.warn("Falling back to validated dummy runs because Prisma could not read PostgreSQL.", error);
    return dummyRuns;
  }
};

export const getRunById = async (runId: string): Promise<ClusteringRun | null> => {
  const runs = await listRuns();
  return runs.find((run) => run.run_id === runId) ?? null;
};

export const importRun = async (payload: unknown): Promise<ClusteringRun> => {
  const run = ClusteringRunSchema.parse(payload);
  const client = getPrisma();

  if (!client) {
    memoryRuns.set(run.run_id, run);
    return run;
  }

  await client.clusteringRun.upsert({
    where: { runId: run.run_id },
    update: {
      axis: run.axis,
      title: run.title,
      payload: run
    },
    create: {
      runId: run.run_id,
      axis: run.axis,
      title: run.title,
      payload: run
    }
  });

  return run;
};

export type AxisImportResult = {
  axisA: ClusteringRun & { axis: "Axis A" };
  axisB: ClusteringRun & { axis: "Axis B" };
  persistence: "durable" | "memory_only";
};

export const importAxisResults = async (axisAPayload: unknown, axisBPayload: unknown): Promise<AxisImportResult> => {
  const axisA = ClusteringRunSchema.parse(axisAPayload);
  const axisB = ClusteringRunSchema.parse(axisBPayload);
  if (axisA.axis !== "Axis A" || axisB.axis !== "Axis B") throw new Error("Axis-specific results were supplied in the wrong persistence slots.");
  if (axisA.run_id === axisB.run_id) throw new Error("Axis-specific results must use distinct run IDs.");
  const client = getPrisma();
  if (!client) {
    memoryRuns.set(axisA.run_id, axisA);
    memoryRuns.set(axisB.run_id, axisB);
    return { axisA, axisB, persistence: "memory_only" };
  }
  await client.$transaction([
    client.clusteringRun.upsert({ where: { runId: axisA.run_id }, update: { axis: axisA.axis, title: axisA.title, payload: axisA }, create: { runId: axisA.run_id, axis: axisA.axis, title: axisA.title, payload: axisA } }),
    client.clusteringRun.upsert({ where: { runId: axisB.run_id }, update: { axis: axisB.axis, title: axisB.title, payload: axisB }, create: { runId: axisB.run_id, axis: axisB.axis, title: axisB.title, payload: axisB } })
  ]);
  return { axisA, axisB, persistence: "durable" };
};

export const clearMemoryRunsForTests = () => memoryRuns.clear();
