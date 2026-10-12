import { z } from "zod";
import { SimulationAnalysisSchema, SimulationConfigurationSchema, SimulationResultSchema, SimulationMetricsSchema } from "./simulation";
import { CalculationEvidenceSchema } from "./calculationEvidence";
import { InitializationEvidenceSchema } from "./partitionEvidence";

export const MethodSchema = z.enum(["standard", "enhanced", "comparison"]);
export type Method = z.infer<typeof MethodSchema>;
const sha = z.string().regex(/^[a-f0-9]{64}$/);
const finite = z.number().finite();
const analysis = SimulationAnalysisSchema.innerType().shape;
const controlCondition = z.object({ k: z.number().int().min(2).max(10), runCount: z.literal(30),
  metrics: SimulationMetricsSchema, calculation: CalculationEvidenceSchema }).strict();
const changes = z.object({ silhouette: finite.nullable(), davies_bouldin: finite.nullable(), calinski_harabasz: finite.nullable() }).strict();
const conditionSummary = z.object({ runCount: z.number().int(), mean: SimulationMetricsSchema,
  minimum: SimulationMetricsSchema, maximum: SimulationMetricsSchema, runs: z.array(SimulationMetricsSchema), calculation: CalculationEvidenceSchema }).strict();
const pairSummary = z.object({ runCount: z.number().int(), pairCount: z.number().int(), mean: finite,
  minimum: finite, maximum: finite, median: finite, exactMatches: z.number().int() }).strict();
export const CommonSpaceSchema = z.object({ version: z.enum(["common-space-v1", "common-space-v2"]),
  spaces: z.array(z.object({ space: z.enum(["standardized_13", "retained_pcs"]), dimensions: z.number().int(), primary: z.boolean(), matrixHash: sha.optional(),
    conditions: z.object({ standard: conditionSummary, pcaRandom: conditionSummary, enhanced: conditionSummary }).strict(),
    comparison: SimulationResultSchema.innerType().shape.comparison }).strict()).length(2),
  pairwise: z.object({ standard: pairSummary, pcaRandom: pairSummary, enhanced: pairSummary }).strict(),
  crossMethod: z.array(z.object({ seed: z.number().int(), enhancedRun: z.literal(1).optional(), ari: finite, agreementCount: z.number().int().nonnegative().optional(), disagreementCount: z.number().int().nonnegative(), disagreementPercent: finite }).strict()).length(30),
  randomVersusDpc: analysis.existing.innerType().shape.ariBySeed.unwrap(), dpcAssignmentsIdentical: z.literal(true)
}).strict().superRefine((evidence, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  if (evidence.version==='common-space-v2' && (evidence.spaces.some(space=>!space.matrixHash) ||
    evidence.crossMethod.some(row=>row.enhancedRun!==1 || row.agreementCount===undefined))) fail('Missing explicit comparison references or matrix provenance.');
  if (evidence.spaces[0].space !== "standardized_13" || evidence.spaces[0].dimensions !== 13 || !evidence.spaces[0].primary ||
    evidence.spaces[1].space !== "retained_pcs" || evidence.spaces[1].primary) fail("Evaluation spaces are invalid.");
  for (const name of ["standard", "pcaRandom", "enhanced"] as const) {
    const expected = name === "enhanced" ? 3 : 30, pair = evidence.pairwise[name];
    if (pair.runCount !== expected || pair.pairCount !== expected*(expected-1)/2 || pair.exactMatches < 0 || pair.exactMatches > pair.pairCount ||
      pair.minimum < -1 || pair.maximum > 1 || pair.minimum > pair.maximum || pair.mean < pair.minimum || pair.mean > pair.maximum ||
      pair.median < pair.minimum || pair.median > pair.maximum) fail("Invalid pairwise ARI summary.");
    for (const space of evidence.spaces) {
      const c = space.conditions[name];
      if (c.runCount !== expected || c.runs.length !== expected) fail("Missing repetitions.");
      for (const key of ["silhouette", "davies_bouldin", "calinski_harabasz"] as const) {
        const values = c.runs.map(row => row[key]);
        if (Math.abs(c.mean[key]-values.reduce((a,b)=>a+b,0)/expected)>1e-10*Math.max(1,Math.abs(c.mean[key])) ||
          c.minimum[key] !== Math.min(...values) || c.maximum[key] !== Math.max(...values)) fail("Invalid metric summary.");
      }
    }
  }
  if (evidence.crossMethod.some((row,i)=>row.seed!==i || row.ari < -1 || row.ari > 1) ||
    evidence.randomVersusDpc.length !== 30 || evidence.randomVersusDpc.some((row,i)=>row.seed!==i)) fail("Incomplete reference experiments.");
  for (const space of evidence.spaces) {
    if (space.comparison.length !== 3 || new Set(space.comparison.map(row=>row.metric)).size !== 3) fail("Missing comparison metrics.");
    for (const row of space.comparison) {
    const a=space.conditions.standard.mean[row.metric], b=space.conditions.enhanced.mean[row.metric];
    const expected=a===0?null:100*(row.metric==='davies_bouldin'?a-b:b-a)/Math.abs(a);
    if (row.existing!==a || row.enhanced!==b || row.difference!==b-a || row.relativeImprovementPercent!==expected) fail("Cross-space or inconsistent comparison.");
    }
  }
});
export const MethodInputSchema = z.discriminatedUnion("scope", [
  z.object({ scope: z.literal("study"), uploadRef: z.string().regex(/^upload-\d{13}-[a-f0-9]{12}$/) }).strict(),
  z.object({ scope: z.literal("simulation"), simulationId: z.number().int().min(1).max(5), configuration: SimulationConfigurationSchema }).strict()
]);
export type MethodInput = z.infer<typeof MethodInputSchema>;
export const MethodRequestSchema = z.object({ method: MethodSchema, input: MethodInputSchema,
  requestId: z.string().uuid(), standardId: z.string().uuid().optional(), enhancedId: z.string().uuid().optional() }).strict();
export type MethodRequest = z.infer<typeof MethodRequestSchema>;
export const MethodProvenanceSchema = z.object({ compatibilityKey: sha, sourceHash: sha, participantsHash: sha,
  preprocessingHash: sha, pcaHash: sha, implementationHash: sha, dependenciesHash: sha,
  evaluationVersion: z.literal("euclidean-full-lloyd-v1"), configurationHash: sha.optional(), datasetHash: sha.optional(), preparationKey: sha.optional() }).strict();
export const MethodResultSchema = z.object({ method: MethodSchema,
  initializationEvidence: InitializationEvidenceSchema.optional(),
  common: z.object({ participantCount: z.number().int().min(100).max(2437), retainedVariables: z.array(z.string()).length(13),
    excludedVariables: z.array(z.string()), phaseCounts: z.record(z.number().int().nonnegative()),
    correlation: analysis.correlation.unwrap(), xy: z.array(z.tuple([finite, finite])),
    pca: z.object({ pcaComponents: z.number().int().min(1).max(13), cumulativeExplainedVariance: finite.min(0.85).max(1.000000000001),
      pcaVariance: analysis.enhanced.innerType().shape.pcaVariance, pcaLoadings: analysis.enhanced.innerType().shape.pcaLoadings.unwrap() }).strict()
  }).strict(), provenance: MethodProvenanceSchema,
  assignmentsHash: sha.optional(), nativeSpace: z.enum(["standardized_13", "retained_pcs"]).optional(),
  fitEvidence: z.array(z.object({ run: z.number().int(), inertia: finite.nonnegative(), iterations: z.number().int() }).strict()).optional(),
  commonSpace: CommonSpaceSchema.optional(),
  comparisonSources: z.object({ standard: z.object({ resultHash: sha, assignmentsHash: sha }).strict(),
    enhanced: z.object({ resultHash: sha, assignmentsHash: sha }).strict() }).strict().optional(),
  standard: analysis.existing.optional(), enhanced: analysis.enhanced.optional(),
  pcaContribution: analysis.pcaContribution, randomControl: analysis.enhanced.innerType().shape.dpc.shape.randomControl,
  comparison: SimulationResultSchema.innerType().shape.comparison.optional(),
  sopControls: z.object({ pcaSilhouetteByK: analysis.existing.innerType().shape.silhouetteByK.unwrap(),
    pcaRandom: controlCondition, nbclustRandom: controlCondition,
    relativeChange: z.object({ sop1: changes, sop2: changes, sop3: changes }).strict(),
    randomAriBySeed: analysis.existing.innerType().shape.ariBySeed.unwrap() }).strict().optional(),
  calculation: CalculationEvidenceSchema, labels: z.array(z.number().int().nonnegative()),
  centroids: z.array(z.object({ cluster: z.number().int().nonnegative(), x: finite, y: finite }).strict()),
  timings: z.record(finite.nonnegative()), cacheHits: z.object({ preprocessing: z.boolean(), pca: z.boolean() }).strict()
}).strict().superRefine((result, ctx) => {
  const n = result.common.participantCount;
  const fail = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  const pca = result.common.pca;
  if (result.method === "comparison" && result.provenance.configurationHash && !result.commonSpace) fail("Fresh comparison requires common-space evidence.");
  if (result.commonSpace) {
    if (result.commonSpace.crossMethod.some(row => row.disagreementCount > n || (row.agreementCount !== undefined && row.agreementCount+row.disagreementCount !== n) ||
      Math.abs(row.disagreementPercent - 100*row.disagreementCount/n) > 1e-10)) fail("Invalid participant agreement.");
    if (!result.comparisonSources || result.commonSpace.spaces[0].space !== "standardized_13" ||
      !result.commonSpace.spaces[0].primary || result.commonSpace.spaces[1].space !== "retained_pcs" ||
      result.commonSpace.spaces[1].dimensions !== pca.pcaComponents ||
      JSON.stringify(result.comparison) !== JSON.stringify(result.commonSpace.spaces[0].comparison)) fail("Invalid common-space provenance.");
    for (const space of result.commonSpace.spaces) for (const method of ["standard", "pcaRandom", "enhanced"] as const) {
      const condition = space.conditions[method], count = method === "enhanced" ? 3 : 30;
      if (condition.runCount !== count || condition.runs.length !== count || condition.calculation.n !== n) fail("Missing common-space repetitions.");
      for (const key of ["silhouette", "davies_bouldin", "calinski_harabasz"] as const) {
        const values = condition.runs.map(run => run[key]);
        if (Math.abs(condition.mean[key] - values.reduce((a,b)=>a+b,0)/count) > 1e-10*Math.max(1,Math.abs(condition.mean[key])) ||
          condition.minimum[key] !== Math.min(...values) || condition.maximum[key] !== Math.max(...values)) fail("Invalid common-space summary.");
      }
    }
  }
  const totalVariance = pca.pcaVariance.reduce((sum, row) => sum + (row.eigenvalue ?? 0), 0);
  if (Object.values(result.common.phaseCounts).reduce((a,b) => a+b, 0) !== n ||
    pca.pcaLoadings.variables.some((variable, i) => variable !== result.common.retainedVariables[i]) ||
    pca.pcaLoadings.components.length !== 13 ||
    pca.pcaVariance.some((row,i) => row.component !== i+1 || row.eigenvalue === undefined || totalVariance <= 0 ||
      Math.abs(row.eigenvalue / totalVariance - row.explainedVarianceRatio) > 1e-10)) fail("Incomplete PCA/preprocessing evidence.");
  if (result.method === "standard" && result.enhanced || result.method === "enhanced" && result.standard) fail("Mixed method result.");
  const own = result.method === "standard" ? result.standard : result.enhanced;
  if ((result.method !== "comparison" && !own) || result.labels.length !== n || result.common.xy.length !== n ||
    result.calculation.n !== n || result.centroids.length !== result.calculation.k ||
    result.labels.some(label => label >= result.calculation.k) || (own && own.participantCount !== n) ||
    (result.method === "comparison" && (!result.pcaContribution || !result.randomControl || !result.sopControls))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Incomplete method evidence." });
  }
  if ((result.standard && !result.standard.ariBySeed) || (result.enhanced && (!result.enhanced.dpc.ariByRun || !result.enhanced.dpc.decisionGraph)) ||
    (result.method === "comparison" && !result.comparison)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Required computed evidence missing." });
  }
  const sizes = result.standard?.runs[0].clusterSizes ?? result.enhanced?.clusterSizes;
  if (sizes?.some((size, cluster) => result.labels.filter(label => label === cluster).length !== size)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Assignments and distribution disagree." });
  }
  const expected = result.standard?.runs[0].metrics ?? result.enhanced?.metrics;
  if (expected && Object.keys(expected).some(key => Math.abs(expected[key as keyof typeof expected] - result.calculation.metrics[key as keyof typeof expected]) >
    1e-9 * Math.max(1, Math.abs(expected[key as keyof typeof expected])))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Calculation does not match fitted partition." });
  }
  if (result.standard) {
    const standard = result.standard;
    if (!standard.silhouetteByK?.every((row, i) => row.k === i+2) || standard.ariBySeed?.[0].adjustedRandIndex !== 1 ||
      Object.keys(standard.metrics).some(key => Math.abs(standard.metrics[key as keyof typeof standard.metrics] -
        standard.runs.reduce((sum, run) => sum + run.metrics[key as keyof typeof standard.metrics], 0)/30) >
        1e-9 * Math.max(1,Math.abs(standard.metrics[key as keyof typeof standard.metrics])))) fail("Invalid Standard evaluation evidence.");
  }
  if (result.enhanced) {
    const { nbclust, dpc, selectedK } = result.enhanced;
    if (nbclust.indices.length !== 26 || new Set(nbclust.indices.map(row => row.index)).size !== 26 || nbclust.votes.length !== 9 ||
      nbclust.votes.some((row,i) => row.k !== i+2 || row.count !== nbclust.indices.filter(index => index.status === "success" && index.recommendedK === row.k).length) ||
      !nbclust.votes.some(row => row.k === selectedK && row.count === Math.max(...nbclust.votes.map(vote => vote.count)) && row.count > 0) ||
      dpc.decisionGraph?.length !== n || dpc.decisionGraph.filter(row => row.selected).length !== selectedK ||
      dpc.centers.some(center => !center.rid || center.coordinates?.length !== pca.pcaComponents) ||
      dpc.ariByRun?.some(row => row.adjustedRandIndex !== 1)) fail("Invalid NbClust/DPC evaluation evidence.");
  }
});
export type MethodResult = z.infer<typeof MethodResultSchema>;
export const MethodJobSchema = z.object({ id: z.string().uuid(), method: MethodSchema, input: MethodInputSchema,
  status: z.enum(["queued", "running", "complete", "failed", "cancelled"]), stage: z.string(),
  createdAt: z.string(), startedAt: z.string().nullable(), finishedAt: z.string().nullable(),
  elapsedSeconds: finite.nonnegative(), admissionSeconds: finite.nonnegative().optional(), error: z.string().nullable(), result: MethodResultSchema.nullable(),
  standardId: z.string().uuid().optional(), enhancedId: z.string().uuid().optional()
}).strict().refine(job => (job.status === "complete") === (job.result !== null) && (!job.result || job.result.method === job.method), "Job completion/result identity mismatch.");
export type MethodJob = z.infer<typeof MethodJobSchema>;
export const compatibleMethods = (standard?: MethodResult | null, enhanced?: MethodResult | null) =>
  !!standard && !!enhanced && standard.method === "standard" && enhanced.method === "enhanced" &&
  !!standard.assignmentsHash && !!enhanced.assignmentsHash && !!standard.provenance.configurationHash &&
  Object.keys(standard.provenance).every(key => standard.provenance[key as keyof typeof standard.provenance] === enhanced.provenance[key as keyof typeof enhanced.provenance]);
