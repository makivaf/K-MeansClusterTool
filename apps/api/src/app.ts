import cors from "cors";
import express from "express";
import { ZodError } from "zod";
import { RunListResponseSchema, RunResponseSchema, SopEvaluationResponseSchema } from "../../../packages/shared/src/schema";
import { clusterRouter } from "./routes/cluster";
import { researchRunsRouter } from "./routes/researchRuns";
import { getRunById, listRuns } from "./services/runRepository";
import { allowedBrowserOrigins } from "./httpSecurity";
import { loadBaselineCandidateSweep, loadSopEvaluation } from "./services/sopEvaluationArtifact";
import { loadDefenseGeometry } from "./services/defenseGeometryArtifact";
import { SimulationCapabilitiesSchema } from "../../../packages/shared/src/simulation";

export const app = express();

app.disable("x-powered-by");
app.use((request, response, next) => {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  if (process.env.NODE_ENV === "production" && process.env.ENABLE_HSTS === "true") {
    response.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  if (request.path.startsWith("/api/")) response.setHeader("Cache-Control", "no-store");
  next();
});
app.use(cors({
  origin: (origin, callback) => callback(null, !origin || allowedBrowserOrigins.has(origin)),
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"],
  maxAge: 600
}));
app.use(express.json({ limit: "32kb", strict: true }));

app.get("/api/health", (_request, response) => {
  response.json({ ok: true });
});

// Read-only capability discovery. The full-cohort research endpoint must never
// be presented as a subsample simulation runner.
app.get("/api/simulations/capabilities", (_request, response) => {
  response.json(SimulationCapabilitiesSchema.parse({
    executionAvailable: false,
    code: "SUBSAMPLE_RUNNER_UNAVAILABLE",
    message: "Simulation execution is unavailable. The backend does not yet support participant-subsample runs."
  }));
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

app.get("/api/sop-evaluation", (_request, response, next) => {
  try {
    const evaluation = loadSopEvaluation();
    if (!evaluation) {
      response.status(404).json({ error: "Aggregate SOP evaluation artifact not found" });
      return;
    }
    response.json(SopEvaluationResponseSchema.parse({ evaluation, baselineSweep: loadBaselineCandidateSweep(evaluation), defenseGeometry: loadDefenseGeometry(evaluation) }));
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
    response.status(500).json({ error: "API response failed schema validation" });
    return;
  }

  if (process.env.NODE_ENV === "production") {
    console.error(`[api] Unhandled ${error instanceof Error ? error.name : "non-Error exception"}`);
  } else {
    console.error(error);
  }
  response.status(500).json({ error: "Unexpected API error" });
});
