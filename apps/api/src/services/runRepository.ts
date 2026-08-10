import { PrismaClient } from "@prisma/client";
import { dummyRuns } from "../../../../packages/shared/src/dummyRuns";
import { ClusteringRunSchema, type ClusteringRun } from "../../../../packages/shared/src/schema";

let prisma: PrismaClient | null = null;

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
    return dummyRuns;
  }

  try {
    const rows = await client.clusteringRun.findMany({
      orderBy: { createdAt: "desc" }
    });
    return rows.map((row: { payload: unknown }) => ClusteringRunSchema.parse(row.payload));
  } catch (error) {
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
