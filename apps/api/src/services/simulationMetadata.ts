import { simulationIds, SimulationMetadataResponseSchema } from "../../../../packages/shared/src/simulation";
import { getSimulationSample } from "./simulationSample";

export const getSimulationMetadata = () => SimulationMetadataResponseSchema.parse({
  simulations: simulationIds.map((id) => {
    const sample = getSimulationSample(id);
    // Explicit allowlist: never spread the internal sample into a public response.
    return {
      simulationId: sample.simulationId,
      sampleSize: sample.sampleParticipantCount,
      samplingFraction: sample.samplingFraction,
      samplingMethod: sample.samplingMethod,
      phaseSampleCounts: sample.phaseSampleCounts,
      sampleStatus: "sample_ready",
      analysisStatus: "analysis_unavailable"
    };
  })
});
