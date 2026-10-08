import { z } from "zod";
import { CalculationSetSchema } from "./calculationEvidence";
import { PcaLoadingEvidenceSchema } from "./schema";

export const simulationParticipantLimit = 2437;

export const SimulationCapabilitiesSchema = z.object({
  executionAvailable: z.boolean(),
  code: z.enum(["SUBSAMPLE_RUNNER_UNAVAILABLE", "SUBSAMPLE_RUNNER_AVAILABLE"]),
  message: z.string().min(1)
}).strict();
export type SimulationCapabilities = z.infer<typeof SimulationCapabilitiesSchema>;

export const SimulationConfigurationSchema = z.object({
  sampleMode: z.enum(["full", "custom"]),
  sampleCount: z.number().int().min(100).max(simulationParticipantLimit),
  manualK: z.number().int().min(2).max(10).nullable().default(null)
}).strict().refine(value => value.sampleMode !== "full" || value.sampleCount === 2437,
  "Full dataset requires all 2,437 participants.");
export type SimulationConfiguration = z.infer<typeof SimulationConfigurationSchema>;
export const simulationConfigurationKey = (value: SimulationConfiguration) =>
  `${value.sampleMode}:${value.sampleCount}:${value.manualK ?? "auto"}`;

export const simulationIds = [1, 2, 3, 4, 5] as const;
export const SimulationMetadataSchema = z.object({
  simulationId: z.number().int().min(1).max(5),
  sampleSize: z.number().int().positive(),
  samplingFraction: z.number().positive().max(1),
  samplingMethod: z.literal("deterministic stratified random sampling by ENTRY_PHASE"),
  phaseSampleCounts: z.object({
    ADNI1: z.number().int().nonnegative(), ADNIGO: z.number().int().nonnegative(),
    ADNI2: z.number().int().nonnegative(), ADNI3: z.number().int().nonnegative()
  }).strict(),
  seed: z.number().int().optional(),
  sampleFingerprint: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  configuration: SimulationConfigurationSchema.optional(),
  sampleStatus: z.literal("sample_ready"),
  analysisStatus: z.enum(["analysis_unavailable", "sample_ready", "running", "complete", "failed"])
}).strict().refine((value) => Object.values(value.phaseSampleCounts).reduce((sum, count) => sum + count, 0) === value.sampleSize,
  "Phase counts must sum to the sample size.");
export const SimulationMetadataResponseSchema = z.object({
  availableParticipantCount: z.number().int().min(100).max(simulationParticipantLimit).optional(),
  simulations: z.array(SimulationMetadataSchema).length(5)
    .refine((values) => new Set(values.map((value) => value.simulationId)).size === 5, "Each simulation must appear once.")
}).strict();
export type SimulationMetadataResponse = z.infer<typeof SimulationMetadataResponseSchema>;

const finite = z.number().finite();
const count = z.number().int().nonnegative();
export const SimulationMetricsSchema = z.object({ silhouette: finite, davies_bouldin: finite, calinski_harabasz: finite }).strict();
export const SimulationDpcControlSchema = z.object({
  totalRandomRuns: z.literal(30), matchingRuns: count.max(30),
  randomMean: SimulationMetricsSchema,
  randomSd: SimulationMetricsSchema.refine(value => Object.values(value).every(sd => sd >= 0))
}).strict();
const sizes = z.array(z.number().int().positive()).min(2).max(10);
const ariSeries = z.array(z.object({ seed: count, adjustedRandIndex: finite.min(-1).max(1) }).strict());
const run = z.object({ seed: count, iterations: z.number().int().positive(), convergedBeforeMaxIter: z.boolean(), clusterSizes: sizes, metrics: SimulationMetricsSchema }).strict();
export const SimulationAnalysisSchema = z.object({
  calculations: CalculationSetSchema.optional(),
  existing: z.object({ participantCount: z.number().int().min(100).max(2437), selectedK: z.number().int().min(2).max(10), initialization: z.literal("random"), metrics: SimulationMetricsSchema,
    silhouetteSelectedK: z.number().int().min(2).max(10).optional(),
    ariBySeed: ariSeries.length(30).refine(rows => rows.every((row, i) => row.seed === i)).optional(),
    silhouetteByK: z.array(z.object({ k: z.number().int().min(2).max(10), silhouette: finite }).strict()).length(9).optional(),
    runs: z.array(run).length(30).refine(values => values.every((value, index) => value.seed === index))
  }).strict().refine(value => value.runs.every(run => run.clusterSizes.length === value.selectedK && run.clusterSizes.reduce((a, b) => a + b, 0) === value.participantCount)),
  enhanced: z.object({ participantCount: z.number().int().min(100).max(2437), selectedK: z.number().int().min(2).max(10), initialization: z.literal("DPC"),
    iterations: z.number().int().positive(), convergedBeforeMaxIter: z.boolean(), clusterSizes: sizes, metrics: SimulationMetricsSchema,
    retainedVariables: z.array(z.string()).length(13), excludedVariables: z.array(z.string()),
    pcaComponents: z.number().int().min(1).max(13), cumulativeExplainedVariance: finite.min(0.85).max(1.000000000001),
    pcaLoadings: PcaLoadingEvidenceSchema.optional(),
    pcaVariance: z.array(z.object({ component: count, eigenvalue: finite.nonnegative().optional(), explainedVarianceRatio: finite, cumulativeExplainedVariance: finite }).strict()).length(13),
    nbclust: z.object({ votes: z.array(z.object({ k: count, count }).strict()),
      indices: z.array(z.object({ index: z.string(), status: z.string(), recommendedK: count.nullable() }).strict()),
      tieOccurred: z.boolean(), reproducible: z.literal(true) }).strict(),
    dpc: z.object({ cutoffPercentile: finite, distanceCutoff: finite, centroidCount: count, dimensions: count, pairwiseDistanceCount: count,
      ariByRun: ariSeries.length(3).refine(rows => rows.every((row, i) => row.seed === i + 1)).optional(),
      determinismPassed: z.literal(true), centers: z.array(z.object({ rid: z.string().regex(/^[1-9]\d*$/).optional(), rho: count, delta: finite, gamma: finite, coordinates: z.array(finite).optional() }).strict()),
      decisionGraph: z.array(z.object({ rho: count, delta: finite, gamma: finite, selected: z.boolean() }).strict()).optional(),
      randomControl: SimulationDpcControlSchema.optional() }).strict()
  }).strict().refine(value => value.clusterSizes.reduce((a, b) => a + b, 0) === value.participantCount && value.clusterSizes.length === value.selectedK && value.dpc.centroidCount === value.selectedK && value.dpc.centers.length === value.selectedK && value.dpc.dimensions === value.pcaComponents),
  correlation: z.array(z.array(finite.nullable()).length(13)).length(13).optional(),
  pcaContribution: z.object({ k: z.number().int().min(2).max(10), runCount: z.literal(30),
    existing: SimulationMetricsSchema, enhanced: SimulationMetricsSchema,
    relativeChange: z.object({ silhouette: finite.nullable(), davies_bouldin: finite.nullable(), calinski_harabasz: finite.nullable() }).strict()
  }).strict().optional(),
  projection: z.object({
    standardSeed: z.literal(0),
    points: z.array(z.object({ x: finite, y: finite, standard: count.max(9), enhanced: count.max(9) }).strict()),
    standardCentroids: z.array(z.object({ x: finite, y: finite, cluster: count }).strict()),
    enhancedCentroids: z.array(z.object({ x: finite, y: finite, cluster: count }).strict())
  }).strict().optional()
}).strict().superRefine((value, ctx) => {
  const n = value.existing.participantCount;
  const fail = () => ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Paired output dimensions or assignments differ." });
  if (value.enhanced.participantCount !== n) fail();
  const loadings = value.enhanced.pcaLoadings;
  if (loadings && (loadings.variables.length !== value.enhanced.retainedVariables.length ||
    loadings.variables.some((variable, index) => variable !== value.enhanced.retainedVariables[index]) ||
    loadings.components.length !== value.enhanced.pcaVariance.length ||
    loadings.components.length < value.enhanced.pcaComponents)) fail();
  if (value.calculations) {
    const { standard, enhanced, pca } = value.calculations;
    if (standard.n !== n || enhanced.n !== n || standard.k !== value.existing.selectedK || enhanced.k !== value.enhanced.selectedK ||
      standard.seed !== value.projection?.standardSeed || (pca && (pca.n !== n || pca.k !== value.pcaContribution?.k))) fail();
    const run = value.existing.runs.find(run => run.seed === standard.seed);
    for (const [calculation, expected] of [[standard, run?.metrics], [enhanced, value.enhanced.metrics]] as const) {
      if (!expected || Object.entries(calculation.metrics).some(([key, score]) => Math.abs(score - expected[key as keyof typeof expected]) > 1e-9 * Math.max(1, Math.abs(score)))) fail();
    }
  }
  if (value.existing.ariBySeed && value.existing.ariBySeed[0].adjustedRandIndex !== 1) fail();
  if (value.enhanced.dpc.ariByRun?.some(row => row.adjustedRandIndex !== 1)) fail();
  if (value.pcaContribution && (value.pcaContribution.k !== value.existing.selectedK ||
    Object.entries(value.existing.metrics).some(([metric, mean]) => value.pcaContribution!.existing[metric as keyof typeof value.existing.metrics] !== mean))) fail();
  const eigenvalues = value.enhanced.pcaVariance.map(row => row.eigenvalue);
  if (eigenvalues.some(value => value !== undefined)) {
    const total = eigenvalues.reduce<number>((sum, value) => sum + (value ?? 0), 0);
    if (eigenvalues.some(value => value === undefined) || total <= 0 ||
      value.enhanced.pcaVariance.some(row => Math.abs(row.eigenvalue! / total - row.explainedVarianceRatio) > 1e-10)) fail();
  }
  if (value.enhanced.dpc.decisionGraph && value.enhanced.dpc.decisionGraph.length !== n) fail();
  if (value.enhanced.dpc.centers.some(center => center.coordinates && center.coordinates.length !== value.enhanced.pcaComponents)) fail();
  if (value.existing.silhouetteByK && !value.existing.silhouetteByK.every((row, i) => row.k === i + 2)) fail();
  const projection = value.projection;
  if (projection) {
    if (projection.points.length !== n) fail();
    for (const [method, clusterSizes, k, centroids] of [
      ["standard", value.existing.runs[0].clusterSizes, value.existing.selectedK, projection.standardCentroids],
      ["enhanced", value.enhanced.clusterSizes, value.enhanced.selectedK, projection.enhancedCentroids]
    ] as const) {
      if (centroids.length !== k || projection.points.some(point => point[method] >= k)) fail();
      clusterSizes.forEach((size, cluster) => { if (projection.points.filter(point => point[method] === cluster).length !== size) fail(); });
    }
  }
});
export type SimulationAnalysis = z.infer<typeof SimulationAnalysisSchema>;
export const SimulationResultSchema = z.object({
  metadata: SimulationMetadataSchema, analysis: SimulationAnalysisSchema,
  comparison: z.array(z.object({ metric: z.enum(["silhouette", "davies_bouldin", "calinski_harabasz"]),
    direction: z.enum(["higher_is_better", "lower_is_better"]), existing: finite, enhanced: finite,
    difference: finite, relativeImprovementPercent: finite.nullable().optional(), favorableMethod: z.enum(["existing", "enhanced", "equal"]) }).strict()).length(3),
  enhancedFavorableMetrics: z.number().int().min(0).max(3), sameParticipantsVerified: z.literal(true)
}).strict().refine(value => value.metadata.sampleSize === value.analysis.existing.participantCount &&
  (!value.metadata.configuration || (value.metadata.configuration.sampleCount === value.metadata.sampleSize &&
    (value.metadata.configuration.manualK ?? value.analysis.existing.silhouetteSelectedK) === value.analysis.existing.selectedK &&
    !!value.analysis.projection && !!value.analysis.correlation && !!value.analysis.existing.silhouetteByK &&
    !!value.analysis.enhanced.dpc.decisionGraph && !!value.analysis.enhanced.dpc.randomControl &&
    value.comparison.every(row => row.relativeImprovementPercent !== undefined))));
export const SimulationRunStateSchema = z.object({
  stage: z.number().int().min(0).max(3).optional(),
  configurationKey: z.string().optional(),
  simulationId: z.number().int().min(1).max(5), status: z.enum(["sample_ready", "running", "complete", "failed"]),
  result: SimulationResultSchema.nullable(), message: z.string().nullable()
}).strict().refine(value => (value.status === "complete") === (value.result !== null)
  && (!value.result || (value.result.metadata.simulationId === value.simulationId &&
    value.configurationKey === (value.result.metadata.configuration ? simulationConfigurationKey(value.result.metadata.configuration) : undefined))), "Completed results must match their simulation and configuration.");
export type SimulationRunState = z.infer<typeof SimulationRunStateSchema>;

