import fs from "node:fs";
import express from "express";
import { ZodError } from "zod";
import {
  ResearchRunRequestSchema,
  ResearchRunResponseSchema
} from "../../../../packages/shared/src/schema";
import {
  InvalidUploadReferenceError,
  resolveUploadDirectory
} from "../services/localUploadStore";
import { researchRunLifecycle } from "../services/researchRunLifecycle";
import { ResearchAdmissionError } from "../services/researchRunLifecycle";
import { createFixedWindowRateLimiter, requireTrustedBrowserOrigin } from "../httpSecurity";

type ResearchRunLifecyclePort = Pick<typeof researchRunLifecycle, "enqueue" | "get">;

export const createResearchRunsRouter = (lifecycle: ResearchRunLifecyclePort = researchRunLifecycle) => {
  const router = express.Router();

  router.use(requireTrustedBrowserOrigin);
  const admissionRateLimiter = createFixedWindowRateLimiter({
    windowMs: 60 * 60 * 1000,
    maximumRequests: 4,
    message: "Too many local research requests. Try again later."
  });

  router.post("/api/research/runs", admissionRateLimiter, (request, response, next) => {
    try {
      const payload = ResearchRunRequestSchema.parse(request.body);
      const uploadDirectory = resolveUploadDirectory(payload.upload_ref);
      if (!fs.existsSync(uploadDirectory)) {
        response.status(404).json({ error: "Upload reference was not found on local disk." });
        return;
      }
      const run = lifecycle.enqueue(payload, uploadDirectory);
      response
        .status(202)
        .location(`/api/research/runs/${encodeURIComponent(run.run_id)}`)
        .json(ResearchRunResponseSchema.parse({ run }));
    } catch (error) {
      if (error instanceof ResearchAdmissionError) {
        response.status(429).json({ error: error.message });
        return;
      }
      if (error instanceof ZodError || error instanceof InvalidUploadReferenceError) {
        response.status(400).json({ error: "The research run request is invalid." });
        return;
      }
      next(error);
    }
  });

  router.get("/api/research/runs/:runId", (request, response, next) => {
    try {
      const run = lifecycle.get(request.params.runId);
      if (!run) {
        response.status(404).json({ error: "Research run not found." });
        return;
      }
      response.json(ResearchRunResponseSchema.parse({ run }));
    } catch (error) {
      next(error);
    }
  });

  return router;
};

export const researchRunsRouter = createResearchRunsRouter();
