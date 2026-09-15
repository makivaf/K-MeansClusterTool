import { Router } from "express";
import { SimulationMetadataResponseSchema, SimulationRunStateSchema } from "../../../../packages/shared/src/simulation";
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
    if (!/^[1-5]$/.test(request.params.simulationId)) { response.status(400).json({ message: "Invalid simulation." }); return; }
    try { response.json(SimulationRunStateSchema.parse(executor.get(Number(request.params.simulationId)))); }
    catch { response.status(503).json({ message: "Simulation status unavailable." }); }
  });
  router.post("/:simulationId/run", requireTrustedBrowserOrigin, admissionLimiter, (request, response) => {
    if (!/^[1-5]$/.test(request.params.simulationId)) { response.status(400).json({ message: "Invalid simulation." }); return; }
    if (request.body && Object.keys(request.body).length) { response.status(400).json({ message: "Simulation inputs are selected by the server." }); return; }
    if (!simulationCapabilities().executionAvailable) { response.status(503).json({ message: "Simulation execution unavailable." }); return; }
    try {
      const state = executor.start(Number(request.params.simulationId));
      response.status(state.status === "running" ? 202 : 200).json(SimulationRunStateSchema.parse(state));
    } catch { response.status(503).json({ message: "Simulation execution unavailable." }); }
  });
  return router;
};
