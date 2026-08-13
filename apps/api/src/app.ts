import cors from "cors";
import express from "express";
import { ZodError } from "zod";
import { RunListResponseSchema, RunResponseSchema } from "../../../packages/shared/src/schema";
import { clusterRouter } from "./routes/cluster";
import { researchRunsRouter } from "./routes/researchRuns";
import { getRunById, listRuns } from "./services/runRepository";

export const app = express();

app.use(cors());
app.use(express.json());

app.get("/api/health", (_request, response) => {
  response.json({ ok: true });
});

app.get("/api/runs", async (_request, response, next) => {
  try {
    const runs = await listRuns();
    response.json(RunListResponseSchema.parse({ runs }));
  } catch (error) {
    next(error);
  }
});

app.get("/api/runs/:runId", async (request, response, next) => {
  try {
    const run = await getRunById(request.params.runId);
    if (!run) {
      response.status(404).json({ error: "Run not found" });
      return;
    }
    response.json(RunResponseSchema.parse({ run }));
  } catch (error) {
    next(error);
  }
});

if (process.env.NODE_ENV !== "production") {
  app.use(clusterRouter);
  app.use(researchRunsRouter);
}

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  if (error instanceof ZodError) {
    response.status(500).json({ error: "API response failed schema validation", details: error.flatten() });
    return;
  }

  console.error(error);
  response.status(500).json({ error: "Unexpected API error" });
});
