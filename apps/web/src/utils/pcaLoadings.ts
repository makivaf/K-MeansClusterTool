import { z } from "zod";

// Frontend-only evidence shape. It does not extend either existing API schema.
const PcaLoadingEvidenceSchema = z.object({
  variables: z.array(z.string().min(1)).min(1),
  components: z.array(z.string().min(1)).min(1),
  values: z.array(z.array(z.number().finite()))
}).strict();
export type PcaLoadingEvidence = z.infer<typeof PcaLoadingEvidenceSchema>;

// Future integration: Study run.pca.pcaLoadings and simulation
// result.analysis.enhanced.pcaLoadings. Current payloads have neither field.
export const readPcaLoadings = (source: unknown, variables: readonly string[], retained: number): PcaLoadingEvidence | undefined => {
  if (!source || typeof source !== "object" || !("pcaLoadings" in source)) return undefined;
  const result = PcaLoadingEvidenceSchema.safeParse(source.pcaLoadings);
  if (!result.success || !Number.isInteger(retained) || retained < 1) return undefined;
  const data = result.data;
  if (data.variables.length !== variables.length || new Set(data.variables).size !== variables.length ||
    !variables.every(variable => data.variables.includes(variable)) || data.components.length < retained ||
    data.components.some((name, index) => name !== `PC${index + 1}`) ||
    data.values.length !== data.variables.length || data.values.some(row => row.length !== data.components.length)) return undefined;
  return data;
};

// Rows follow variables; columns follow PC1, PC2, ... in the supplied evidence.
export type PcaLoadings = readonly (readonly (number | null)[])[];

export const topLoadingRows = (loadings: PcaLoadings, component: number, topCount = 3) =>
  loadings.map((row, index) => ({ index, value: row[component] }))
    .filter((entry): entry is { index: number; value: number } => typeof entry.value === "number" && Number.isFinite(entry.value))
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value) || a.index - b.index)
    .slice(0, Math.max(0, Math.floor(topCount))).map(entry => entry.index);

