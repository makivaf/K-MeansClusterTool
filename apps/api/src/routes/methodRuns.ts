import { Router } from "express";
import { ZodError } from "zod";
import { methodExecutor } from "../services/methodExecution";
import { withPartitionEvidence } from "../services/partitionEvidence";
import { requireTrustedBrowserOrigin, createFixedWindowRateLimiter } from "../httpSecurity";
import { calculationSidecar, withCalculationRows } from "../services/calculationRows";

export function createMethodRunsRouter(executor = methodExecutor, enrich = withPartitionEvidence) {
  const router = Router();
  router.get("/:id/calculations/:variant", async (request, response) => {
    if (process.env.NODE_ENV === "production") { response.status(403).json({ error: "Participant calculations are local-only." }); return; }
    const job = executor.get(request.params.id);
    if (!job) { response.status(404).json({ error: "Stored run not found." }); return; }
    try {
      const data = await calculationSidecar(job, executor.directory);
      const variant = data?.variants[request.params.variant];
      response.setHeader("Cache-Control", "no-store");
      response.status(variant ? 200 : 404).json(variant ? { rows: variant.rows } : { error: "Stored calculation not available." });
    } catch { response.status(409).json({ error: "Stored calculation validation failed." }); }
  });
  router.get("/:id", async (request, response) => {
    const job = executor.get(request.params.id);
    try {
      response.status(job ? 200 : 404).json(job ? await withCalculationRows(await enrich(job, executor.directory), executor.directory) : { error: "Method execution not found." });
    } catch {
      response.status(409).json({ error: "Saved partition evidence failed provenance or completeness validation." });
    }
  });
  router.post("/", requireTrustedBrowserOrigin, createFixedWindowRateLimiter({ windowMs: 3600000, maximumRequests: 30, message: "Too many execution requests." }), async (request, response) => {
    // Preserve the existing local-only boundary for uploaded study datasets.
    if (process.env.NODE_ENV === "production" && request.body?.input?.scope === "study") {
      response.status(403).json({ error: "Uploaded study execution is available only in the local research environment." });
      return;
    }
    try {
      const job = executor.start(request.body);
      response.status(job.status === "queued" || job.status === "running" ? 202 : 200).json(await withCalculationRows(await enrich(job, executor.directory), executor.directory));
    } catch (error) {
      response.status(error instanceof ZodError ? 400 : 409).json({ error: error instanceof ZodError ? "Invalid method request." : "Execution cannot start: verify inputs, compatible completions, and queue availability." });
    }
  });
  router.post("/:id/cancel", requireTrustedBrowserOrigin, (request, response) => {
    const job = executor.cancel(request.params.id);
    response.status(job ? 200 : 404).json(job ?? { error: "Method execution not found." });
  });
  return router;
}
