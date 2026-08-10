import { PrismaClient } from "@prisma/client";
import { dummyRuns } from "../../../packages/shared/src/dummyRuns";

const prisma = new PrismaClient();

for (const run of dummyRuns) {
  await prisma.clusteringRun.upsert({
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
}

await prisma.$disconnect();
