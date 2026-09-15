import { Router } from "express";
import { SimulationMetadataResponseSchema } from "../../../../packages/shared/src/simulation";
import { getSimulationMetadata } from "../services/simulationMetadata";

export const createSimulationMetadataRouter = (loadMetadata = getSimulationMetadata) => {
  const router = Router();
  router.get("/metadata", (_request, response) => {
    response.setHeader("Cache-Control", "no-store");
    try {
      response.json(SimulationMetadataResponseSchema.parse(loadMetadata()));
    } catch {
      // Do not expose validation details, private paths, or participant data.
      response.status(503).json({ code: "SIMULATION_METADATA_UNAVAILABLE", message: "Simulation sample metadata is unavailable." });
    }
  });
  return router;
};
