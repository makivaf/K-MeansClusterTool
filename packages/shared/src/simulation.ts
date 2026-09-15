import { z } from "zod";

export const SimulationCapabilitiesSchema = z.object({
  executionAvailable: z.boolean(),
  code: z.enum(["SUBSAMPLE_RUNNER_UNAVAILABLE", "SUBSAMPLE_RUNNER_AVAILABLE"]),
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
  analysisStatus: z.enum(["analysis_unavailable", "sample_ready", "running", "complete", "failed"])
}).strict().refine((value) => Object.values(value.phaseSampleCounts).reduce((sum, count) => sum + count, 0) === value.sampleSize,
  "Phase counts must sum to the sample size.");
export const SimulationMetadataResponseSchema = z.object({
  simulations: z.array(SimulationMetadataSchema).length(5)
    .refine((values) => new Set(values.map((value) => value.simulationId)).size === 5, "Each simulation must appear once.")
}).strict();
export type SimulationMetadataResponse = z.infer<typeof SimulationMetadataResponseSchema>;

const finite = z.number().finite();
const count = z.number().int().nonnegative();
export const SimulationMetricsSchema = z.object({ silhouette: finite, davies_bouldin: finite, calinski_harabasz: finite }).strict();
const sizes = z.array(z.number().int().positive()).min(2).max(10).refine(values => values.reduce((a, b) => a + b, 0) === 1949);
const run = z.object({ seed: count, iterations: z.number().int().positive(), convergedBeforeMaxIter: z.boolean(), clusterSizes: sizes, metrics: SimulationMetricsSchema }).strict();
export const SimulationAnalysisSchema = z.object({
  existing: z.object({ participantCount: z.literal(1949), selectedK: z.number().int().min(2).max(10), initialization: z.literal("random"), metrics: SimulationMetricsSchema,
    runs: z.array(run).length(30).refine(values => values.every((value, index) => value.seed === index))
  }).strict().refine(value => value.runs.every(run => run.clusterSizes.length === value.selectedK)),
  enhanced: z.object({ participantCount: z.literal(1949), selectedK: z.number().int().min(2).max(10), initialization: z.literal("DPC"),
    iterations: z.number().int().positive(), convergedBeforeMaxIter: z.boolean(), clusterSizes: sizes, metrics: SimulationMetricsSchema,
    retainedVariables: z.array(z.string()).length(13), excludedVariables: z.array(z.string()),
    pcaComponents: z.number().int().min(1).max(13), cumulativeExplainedVariance: finite.min(0.85).max(1.000000000001),
    pcaVariance: z.array(z.object({ component: count, explainedVarianceRatio: finite, cumulativeExplainedVariance: finite }).strict()).length(13),
    nbclust: z.object({ votes: z.array(z.object({ k: count, count }).strict()),
      indices: z.array(z.object({ index: z.string(), status: z.string(), recommendedK: count.nullable() }).strict()),
      tieOccurred: z.boolean(), reproducible: z.literal(true) }).strict(),
    dpc: z.object({ cutoffPercentile: finite, distanceCutoff: finite, centroidCount: count, dimensions: count, pairwiseDistanceCount: count,
      determinismPassed: z.literal(true), centers: z.array(z.object({ rho: count, delta: finite, gamma: finite }).strict()) }).strict()
  }).strict().refine(value => value.clusterSizes.length === value.selectedK && value.dpc.centroidCount === value.selectedK && value.dpc.centers.length === value.selectedK && value.dpc.dimensions === value.pcaComponents)
}).strict();
export type SimulationAnalysis = z.infer<typeof SimulationAnalysisSchema>;
export const SimulationResultSchema = z.object({
  metadata: SimulationMetadataSchema, analysis: SimulationAnalysisSchema,
  comparison: z.array(z.object({ metric: z.enum(["silhouette", "davies_bouldin", "calinski_harabasz"]),
    direction: z.enum(["higher_is_better", "lower_is_better"]), existing: finite, enhanced: finite,
    difference: finite, favorableMethod: z.enum(["existing", "enhanced", "equal"]) }).strict()).length(3),
  enhancedFavorableMetrics: z.number().int().min(0).max(3), sameParticipantsVerified: z.literal(true)
}).strict();
export const SimulationRunStateSchema = z.object({
  simulationId: z.number().int().min(1).max(5), status: z.enum(["sample_ready", "running", "complete", "failed"]),
  result: SimulationResultSchema.nullable(), message: z.string().nullable()
}).strict().refine(value => (value.status === "complete") === (value.result !== null)
  && (!value.result || value.result.metadata.simulationId === value.simulationId), "Completed results must match their simulation.");
export type SimulationRunState = z.infer<typeof SimulationRunStateSchema>;

