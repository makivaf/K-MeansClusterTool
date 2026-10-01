import { z } from "zod";

const finite = z.number().finite();
export const CalculationEvidenceSchema = z.object({
  n: z.number().int().positive(), k: z.number().int().min(2),
  representation: z.string().min(1), seed: z.number().int().nonnegative().optional(),
  exampleParticipant: z.object({ rid: z.string().min(1), a: finite.nonnegative(), b: finite.nonnegative(),
    s: finite.min(-1).max(1), singleton: z.boolean() }).strict(),
  daviesBouldin: z.object({ sigma0: finite.nonnegative(), sigma1: finite.nonnegative(), centroidDistance: finite.nonnegative() }).strict(),
  calinskiHarabasz: z.object({ ssb: finite.nonnegative(), ssw: finite.nonnegative() }).strict(),
  metrics: z.object({ silhouette: finite, davies_bouldin: finite, calinski_harabasz: finite }).strict()
}).strict().superRefine((value, ctx) => {
  const { a, b, s, singleton } = value.exampleParticipant;
  const expected = singleton || Math.max(a, b) === 0 ? 0 : (b - a) / Math.max(a, b);
  if (value.n <= value.k || Math.abs(s - expected) > 1e-10) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid partition calculation evidence." });
  }
  const { ssb, ssw } = value.calinskiHarabasz;
  const ch = ssw === 0 ? 1 : ssb * (value.n - value.k) / (ssw * (value.k - 1));
  if (Math.abs(ch - value.metrics.calinski_harabasz) > 1e-9 * Math.max(1, ch)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "CH intermediates disagree with partition metric." });
  }
});
export const CalculationSetSchema = z.object({
  standard: CalculationEvidenceSchema, enhanced: CalculationEvidenceSchema,
  pca: CalculationEvidenceSchema.optional()
}).strict();
export type CalculationEvidence = z.infer<typeof CalculationEvidenceSchema>;
