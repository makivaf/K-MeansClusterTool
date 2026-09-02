import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dummyRuns } from "../../../../packages/shared/src/dummyRuns";
import {
  ClusteringRunSchema,
  ResearchResultSchema,
  type ClusteringRun,
  type ResearchResult,
  type UnifiedResearchRun
} from "../../../../packages/shared/src/schema";
import { adaptUnifiedResult, UNIFIED_RESULT_FILENAME } from "./unifiedResultAdapter";

let prisma: PrismaClient | null = null;
const memoryRuns = new Map<string, ResearchResult>();
const isProduction = () => process.env.NODE_ENV === "production";
const serviceDirectory = path.dirname(fileURLToPath(import.meta.url));
const localArtifactDirectory = path.resolve(serviceDirectory, "../../../../data/interim");

export const getRunPersistenceMode = (): "durable" | "memory_only" =>
  process.env.DATABASE_URL ? "durable" : "memory_only";

const getPrisma = () => {
  if (!process.env.DATABASE_URL) {
    return null;
  }
  prisma ??= new PrismaClient();
  return prisma;
};

const persistenceDiscriminator = (run: ResearchResult): string =>
  "pipeline" in run ? "Unified" : run.axis;

const loadLocalUnifiedResult = (): UnifiedResearchRun | null => {
  const artifactPath = path.join(localArtifactDirectory, UNIFIED_RESULT_FILENAME);
  if (!fs.existsSync(artifactPath)) return null;
  return adaptUnifiedResult(localArtifactDirectory, {
    runId: "validated-unified-study-run",
    createdAt: fs.statSync(artifactPath).mtime.toISOString()
  });
};

export const listRuns = async (): Promise<ResearchResult[]> => {
  const client = getPrisma();

  if (!client) {
    if (isProduction()) {
      throw new Error("DATABASE_URL is required in production; refusing to serve local research artifacts.");
    }
    const localUnified = loadLocalUnifiedResult();
    const compatibilityFixtures = process.env.INCLUDE_LEGACY_AXIS_FIXTURES === "true" ? dummyRuns : [];
    const localRuns = localUnified ? [localUnified] : [];
    return [
      ...memoryRuns.values(),
      ...localRuns.filter((run) => !memoryRuns.has(run.run_id)),
      ...compatibilityFixtures.filter((run) => !memoryRuns.has(run.run_id))
    ];
  }

  try {
    const rows = await client.clusteringRun.findMany({
      orderBy: { createdAt: "desc" }
    });
    return rows.map((row: { payload: unknown }) => ResearchResultSchema.parse(row.payload));
  } catch (error) {
    if (isProduction()) {
      throw error;
    }
    console.warn("Falling back to the local validated unified artifact because Prisma could not read PostgreSQL.", error);
    const localUnified = loadLocalUnifiedResult();
    return localUnified ? [localUnified] : [];
  }
};

export const getRunById = async (runId: string): Promise<ResearchResult | null> => {
  const runs = await listRuns();
  return runs.find((run) => run.run_id === runId) ?? null;
};

export const importRun = async (payload: unknown): Promise<ResearchResult> => {
  const run = ResearchResultSchema.parse(payload);
  const client = getPrisma();

  if (!client) {
    memoryRuns.set(run.run_id, run);
    return run;
  }

  await client.clusteringRun.upsert({
    where: { runId: run.run_id },
    update: {
      axis: persistenceDiscriminator(run),
      title: run.title,
      payload: run
    },
    create: {
      runId: run.run_id,
      axis: persistenceDiscriminator(run),
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
