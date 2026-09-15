import { z } from "zod";

// Capability only: this service does not yet implement participant-subsample execution.
// Do not advertise support until a runner recomputes both methods on one shared sample.
export const SimulationCapabilitiesSchema = z.object({
  executionAvailable: z.literal(false),
  code: z.literal("SUBSAMPLE_RUNNER_UNAVAILABLE"),
  message: z.string().min(1)
}).strict();
export type SimulationCapabilities = z.infer<typeof SimulationCapabilitiesSchema>;

export const simulationIds = [1, 2, 3, 4, 5] as const;
export const SimulationMetadataSchema = z.object({
  simulationId: z.number().int().min(1).max(5),
  sampleSize: z.number().int().positive(),
  samplingFraction: z.literal(0.8),
  samplingMethod: z.literal("deterministic stratified random sampling by ENTRY_PHASE"),
  phaseSampleCounts: z.object({
    ADNI1: z.number().int().nonnegative(), ADNIGO: z.number().int().nonnegative(),
    ADNI2: z.number().int().nonnegative(), ADNI3: z.number().int().nonnegative()
  }).strict(),
  sampleStatus: z.literal("sample_ready"),
  analysisStatus: z.literal("analysis_unavailable")
}).strict().refine((value) => Object.values(value.phaseSampleCounts).reduce((sum, count) => sum + count, 0) === value.sampleSize,
  "Phase counts must sum to the sample size.");
export const SimulationMetadataResponseSchema = z.object({
  simulations: z.array(SimulationMetadataSchema).length(5)
    .refine((values) => new Set(values.map((value) => value.simulationId)).size === 5, "Each simulation must appear once.")
}).strict();
export type SimulationMetadataResponse = z.infer<typeof SimulationMetadataResponseSchema>;

