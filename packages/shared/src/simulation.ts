import { z } from "zod";

// Capability only: this service does not yet implement participant-subsample execution.
// Do not advertise support until a runner recomputes both methods on one shared sample.
export const SimulationCapabilitiesSchema = z.object({
  executionAvailable: z.literal(false),
  code: z.literal("SUBSAMPLE_RUNNER_UNAVAILABLE"),
  message: z.string().min(1)
}).strict();
export type SimulationCapabilities = z.infer<typeof SimulationCapabilitiesSchema>;

