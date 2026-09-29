import { Router } from "express";
import { SimulationConfigurationSchema, SimulationMetadataResponseSchema, SimulationRunStateSchema } from "../../../../packages/shared/src/simulation";
import { getSimulationMetadata } from "../services/simulationMetadata";
import { simulationExecutor, simulationCapabilities } from "../services/simulationExecution";
import { requireTrustedBrowserOrigin, createFixedWindowRateLimiter } from "../httpSecurity";

export const createSimulationMetadataRouter = (loadMetadata = getSimulationMetadata, executor = simulationExecutor) => {
  const router = Router();
  const admissionLimiter = createFixedWindowRateLimiter({ windowMs: 60 * 60 * 1000, maximumRequests: 10, message: "Too many simulation requests. Try again later." });
  router.get("/metadata", (_request, response) => {
    response.setHeader("Cache-Control", "no-store");
    try {
      const metadata = loadMetadata();
      response.json(SimulationMetadataResponseSchema.parse({ simulations: metadata.simulations.map(value => ({
        ...value, analysisStatus: executor.get(value.simulationId).status
      })) }));
    } catch {
      // Do not expose validation details, private paths, or participant data.
      response.status(503).json({ code: "SIMULATION_METADATA_UNAVAILABLE", message: "Simulation sample metadata is unavailable." });
    }
  });
  router.get("/:simulationId/run", (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    if (!/^[1-5]$/.test(request.params.simulationId)) { response.status(400).json({ message: "Invalid simulation." }); return; }
    const hasConfiguration = Object.keys(request.query).length > 0;
    const configuration = SimulationConfigurationSchema.safeParse({ ...request.query,
      sampleCount: typeof request.query.sampleCount === "string" ? Number(request.query.sampleCount) : null,
      manualK: request.query.manualK === undefined ? null : typeof request.query.manualK === "string" ? Number(request.query.manualK) : NaN });
    if (hasConfiguration && !configuration.success) { response.status(400).json({ message: "Invalid simulation configuration." }); return; }
    try { response.json(SimulationRunStateSchema.parse(executor.get(Number(request.params.simulationId), configuration.success ? configuration.data : undefined))); }
    catch { response.status(503).json({ message: "Simulation status unavailable." }); }
  });
  router.post("/:simulationId/run", requireTrustedBrowserOrigin, admissionLimiter, (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    if (!/^[1-5]$/.test(request.params.simulationId)) { response.status(400).json({ message: "Invalid simulation." }); return; }
    const hasConfiguration = request.body !== undefined && (request.body === null || Array.isArray(request.body) || typeof request.body !== "object" || Object.keys(request.body).length > 0);
    const configuration = SimulationConfigurationSchema.safeParse(request.body);
    if (hasConfiguration && !configuration.success) { response.status(400).json({ message: "Invalid simulation configuration." }); return; }
    if (!simulationCapabilities().executionAvailable) { response.status(503).json({ message: "Simulation execution unavailable." }); return; }
    try {
      const state = executor.start(Number(request.params.simulationId), configuration.success ? configuration.data : undefined);
      response.status(state.status === "running" ? 202 : 200).json(SimulationRunStateSchema.parse(state));
    } catch { response.status(503).json({ message: "Simulation execution unavailable." }); }
  });
  return router;
};
