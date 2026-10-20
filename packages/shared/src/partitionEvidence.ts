import { z } from "zod";
import { adjustedRandIndex } from "./adjustedRandIndex.js";

const count = z.number().int().nonnegative().safe();
const finite = z.number().finite();
const ari = finite.min(-1).max(1);
export const AriCalculationSchema = z.object({
  pair: z.object({ kind: z.enum(["seed", "run"]), first: count, second: count }).strict(),
  n_ij: z.tuple([z.tuple([count, count]), z.tuple([count, count])]),
  a_i: z.tuple([count, count]), b_j: z.tuple([count, count]), N: count.min(2),
  terms: z.object({ sumCellChoose2: count, sumRowChoose2: count, sumColumnChoose2: count,
    totalChoose2: count, expectedIndex: finite.nonnegative(), maxIndex: finite.nonnegative() }).strict(),
  ariRecalculated: ari, ariStored: ari, sklearnAri: ari, match: z.boolean(),
  cohort: z.object({ ridHashes: z.tuple([z.string().regex(/^[a-f0-9]{64}$/), z.string().regex(/^[a-f0-9]{64}$/)]), identical: z.boolean() }).strict()
}).strict().superRefine((record, ctx) => {
  const choose2 = (n: number) => n * (n - 1) / 2;
  const a = record.n_ij.map(row => row[0] + row[1]);
  const b = [record.n_ij[0][0] + record.n_ij[1][0], record.n_ij[0][1] + record.n_ij[1][1]];
  const cells = record.n_ij.flat().reduce((sum, value) => sum + choose2(value), 0);
  const rows = a.reduce((sum, value) => sum + choose2(value), 0), columns = b.reduce((sum, value) => sum + choose2(value), 0);
  const n = a[0] + a[1], total = choose2(n), expected = rows * columns / total, maximum = (rows + columns) / 2;
  const recalculated = maximum === expected ? 1 : (cells - expected) / (maximum - expected);
  const same6 = (...values: number[]) => values.every(value => value.toFixed(6) === values[0].toFixed(6));
  if (record.pair.first >= record.pair.second || record.N !== n || a.some((v, i) => v !== record.a_i[i]) || b.some((v, i) => v !== record.b_j[i]) ||
      record.terms.sumCellChoose2 !== cells || record.terms.sumRowChoose2 !== rows || record.terms.sumColumnChoose2 !== columns || record.terms.totalChoose2 !== total ||
      !same6(record.terms.expectedIndex, expected) || !same6(record.terms.maxIndex, maximum) ||
      !record.match || !same6(recalculated, record.ariRecalculated, record.ariStored, record.sklearnAri) ||
      !record.cohort.identical || record.cohort.ridHashes[0] !== record.cohort.ridHashes[1])
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Inconsistent ARI calculation or ordered cohort." });
});

export const PartitionEvidenceSchema = z.object({
  ariCalculation: AriCalculationSchema.optional(),
  executions: z.number().int().min(2),
  pairwiseAriMatrix: z.array(z.array(z.number().finite().min(-1).max(1))).optional(),
  partitionMembership: z.array(z.string().regex(/^[A-Z]$/)).optional(),
  modalPartitionPercent: z.number().finite().min(0).max(100).optional(),
  partitionFrequencies: z.array(z.object({ partition: z.string(), frequency: z.number().int().positive() }).strict()),
  modalPartitionAri: z.array(z.object({ seed: z.number().int(), adjustedRandIndex: z.number().finite().min(-1).max(1) }).strict()),
  modalReferenceRun: z.number().int().nonnegative(),
  pairwiseComparisons: z.number().int().positive(), uniqueFinalPartitions: z.number().int().positive(),
  modalPartitionFrequency: z.number().int().positive(), minimumPairwiseAri: z.number().finite().min(-1).max(1),
  meanPairwiseAri: z.number().finite().min(-1).max(1),
  maximumDifferingParticipants: z.number().int().nonnegative()
}).strict().superRefine((e, ctx) => {
  if (e.ariCalculation) {
    const c = e.ariCalculation, first = e.modalPartitionAri[0]?.seed;
    const left = c.pair.first - first, right = c.pair.second - first;
    const stored = e.pairwiseAriMatrix?.[left]?.[right];
    if (c.pair.kind !== (first === 1 ? "run" : "seed") || left < 0 || right >= e.executions ||
        c.pair.kind === "run" && (c.pair.first !== 1 || c.pair.second !== 2) ||
        stored !== undefined && stored.toFixed(6) !== c.ariStored.toFixed(6) ||
        c.pair.kind === "seed" && c.ariStored.toFixed(6) !== e.minimumPairwiseAri.toFixed(6))
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "ARI calculation pair does not match stored evidence." });
  }
  if (e.pairwiseAriMatrix && (e.pairwiseAriMatrix.length !== e.executions || e.pairwiseAriMatrix.some((row, i) =>
    row.length !== e.executions || row[i] !== 1 || row.some((v, j) => v !== e.pairwiseAriMatrix![j]?.[i]))) ||
    e.partitionMembership && e.partitionMembership.length !== e.executions ||
    e.modalPartitionPercent !== undefined && Math.abs(e.modalPartitionPercent - 100 * e.modalPartitionFrequency / e.executions) > 1e-10)
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Inconsistent optional run-level evidence." });
  if (e.partitionFrequencies.reduce((n, p) => n + p.frequency, 0) !== e.executions ||
      e.uniqueFinalPartitions !== e.partitionFrequencies.length || e.modalPartitionAri.length !== e.executions ||
      e.modalPartitionFrequency !== Math.max(...e.partitionFrequencies.map(p => p.frequency)) ||
      e.pairwiseComparisons !== e.executions * (e.executions - 1) / 2 ||
      e.modalPartitionAri.filter(p => p.adjustedRandIndex === 1).length !== e.modalPartitionFrequency ||
      e.modalPartitionAri.some((p, i, rows) => p.seed !== rows[0].seed + i) ||
      !e.modalPartitionAri.some(p => p.seed === e.modalReferenceRun && p.adjustedRandIndex === 1) ||
      e.meanPairwiseAri < e.minimumPairwiseAri)
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Inconsistent partition evidence." });
});
export const InitializationEvidenceSchema = z.object({
  standard: PartitionEvidenceSchema.optional(), pcaRandom: PartitionEvidenceSchema.optional(), enhanced: PartitionEvidenceSchema.optional()
}).strict().superRefine((evidence, ctx) => {
  for (const name of ["standard", "pcaRandom", "enhanced"] as const) {
    const e = evidence[name], count = name === "enhanced" ? 3 : 30, first = name === "enhanced" ? 1 : 0;
    const extended = name === "enhanced" && e?.executions === 30 && e.pairwiseAriMatrix?.length === 30;
    if (e && ((!extended && e.executions !== count) || e.modalPartitionAri[0]?.seed !== first || e.modalReferenceRun < first || e.modalReferenceRun >= first + e.executions))
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Initialization experiment repetition or reference mismatch." });
  }
});

/** Maximum-weight one-to-one label alignment, including unmatched clusters. */
function differingParticipants(a: readonly number[], b: readonly number[]) {
  const left = [...new Set(a)], right = [...new Set(b)], size = Math.max(left.length, right.length);
  if (size > 10) throw new Error("Partition cluster count exceeds validated range.");
  const table = Array.from({ length: size }, () => Array(size).fill(0) as number[]);
  a.forEach((v, i) => table[left.indexOf(v)][right.indexOf(b[i])]++);
  const best = Array(1 << size).fill(-Infinity) as number[]; best[0] = 0;
  for (let mask = 0; mask < best.length; mask++) {
    const row = mask.toString(2).replace(/0/g, "").length;
    if (row === size) continue;
    for (let col = 0; col < size; col++) if (!(mask & (1 << col))) {
      const next = mask | (1 << col);
      best[next] = Math.max(best[next], best[mask] + table[row][col]);
    }
  }
  return a.length - best[best.length - 1];
}

/** First-occurrence canonical labels; ties select the earliest execution. */
export function derivePartitionEvidence(partitions: readonly (readonly number[])[], firstRun = 0) {
  if (partitions.length < 2 || partitions[0].length < 2 || partitions.some(p => p.length !== partitions[0].length ||
      p.some(v => !Number.isInteger(v) || v < 0))) throw new Error("Incomplete aligned partitions.");
  const groups = new Map<string, { first: number; frequency: number }>();
  partitions.forEach((p, i) => {
    const labels = new Map<number, number>();
    const key = p.map(v => { if (!labels.has(v)) labels.set(v, labels.size); return labels.get(v); }).join(",");
    const group = groups.get(key);
    if (group) group.frequency++; else groups.set(key, { first: i, frequency: 1 });
  });
  const ordered = [...groups.values()].sort((a, b) => b.frequency - a.frequency || a.first - b.first);
  const modal = ordered[0];
  const pairwise: number[] = [];
  let maximumDifferingParticipants = 0;
  partitions.forEach((p, i) => partitions.slice(i + 1).forEach(q => {
    pairwise.push(adjustedRandIndex(p, q));
    maximumDifferingParticipants = Math.max(maximumDifferingParticipants, differingParticipants(p, q));
  }));
  return PartitionEvidenceSchema.parse({ executions: partitions.length,
    partitionFrequencies: ordered.map(g => ({ partition: `Partition ${g.first + firstRun}`, frequency: g.frequency })),
    modalReferenceRun: modal.first + firstRun,
    modalPartitionAri: partitions.map((p, i) => ({ seed: i + firstRun, adjustedRandIndex: adjustedRandIndex(partitions[modal.first], p) })),
    pairwiseComparisons: pairwise.length, uniqueFinalPartitions: ordered.length, modalPartitionFrequency: modal.frequency,
    minimumPairwiseAri: Math.min(...pairwise), meanPairwiseAri: pairwise.reduce((a, b) => a + b, 0) / pairwise.length, maximumDifferingParticipants });
}
