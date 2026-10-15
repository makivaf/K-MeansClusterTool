import { z } from "zod";
import { InitializationEvidenceSchema } from "./partitionEvidence";
const finite = z.number().finite();
const effect = z.object({ estimate: finite, ci95: z.tuple([finite, finite]), pValue: finite.min(0).max(1) }).strict();
const point = z.object({ x: finite, y: finite, cluster: z.number().int().nonnegative() }).strict();
/** Additive presentation evidence. Absent optional values are unavailable. */
export const FinalUiEvidenceSchema = z.object({
  initializationEvidence: InitializationEvidenceSchema.optional(),
  headline: z.object({ standardModalPercent: finite, enhancedModalPercent: finite, differencePercentagePoints: finite,
    standardDimensions: z.number().int().positive().optional(), enhancedDimensions: z.number().int().positive().optional(), varianceRetained: finite.optional() }).strict().optional(),
  standardSeed0VersusEnhanced: z.object({ ari: finite.min(-1).max(1), differingParticipants: z.number().int().nonnegative() }).strict().optional(),
  projection: z.object({ standard: z.object({ points: z.array(point), means: z.array(point) }).strict(), enhanced: z.object({ points: z.array(point), means: z.array(point) }).strict() }).strict().optional(),
  observedMeans: z.array(z.object({ clusterId: z.number().int().nonnegative(), yearStart: finite, yearEnd: finite,
    participantCount: z.number().int().positive(), observationCount: z.number().int().positive(), meanElapsedYears: finite, meanAdas13: finite }).strict()).optional(),
  observedAnalysisSet: z.object({ participantCount: z.number().int().positive(), observationCount: z.number().int().positive(),
    countUnit: z.literal("observations"), analysisSet: z.literal("LME analysis set") }).strict().optional(),
  models: z.object({ randomIntercept: z.record(effect), randomSlope: z.record(effect) }).strict().optional(),
  sources: z.record(z.string()).optional()
}).strict();
export type FinalUiEvidence = z.infer<typeof FinalUiEvidenceSchema>;
