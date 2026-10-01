import { CalculationEvidenceSchema, type CalculationEvidence } from "../../../../packages/shared/src/calculationEvidence";

/** Read-only Euclidean validation of an existing partition. Never fits a model. */
export function partitionCalculations(matrix: number[][], ids: string[], labels: number[], representation: string, seed?: number): CalculationEvidence {
  const n = matrix.length, dimensions = matrix[0]?.length;
  const k = new Set(labels).size;
  if (!dimensions || n !== ids.length || n !== labels.length || new Set(ids).size !== n || k < 2 || k >= n ||
    labels.some(label => !Number.isInteger(label) || label < 0 || label >= k) ||
    matrix.some(row => row.length !== dimensions || row.some(value => !Number.isFinite(value)))) throw new Error("Invalid calculation matrix/partition alignment.");
  const groups = Array.from({ length: k }, (_, cluster) => labels.flatMap((label, i) => label === cluster ? [i] : []));
  const mean = (indices: number[]) => Array.from({ length: dimensions }, (_, d) => indices.reduce((sum, i) => sum + matrix[i][d], 0) / indices.length);
  const squared = (a: number[], b: number[]) => a.reduce((sum, value, d) => sum + (value - b[d]) ** 2, 0);
  const centers = groups.map(mean), global = mean(matrix.map((_, i) => i));
  const scatter = groups.map((members, cluster) => members.reduce((sum, i) => sum + Math.sqrt(squared(matrix[i], centers[cluster])), 0) / members.length);
  const distances = centers.map(a => centers.map(b => Math.sqrt(squared(a, b))));
  const ssw = groups.reduce((total, members, cluster) => total + members.reduce((sum, i) => sum + squared(matrix[i], centers[cluster]), 0), 0);
  const ssb = groups.reduce((sum, members, cluster) => sum + members.length * squared(centers[cluster], global), 0);
  // Accumulate pairwise distances once; retain only n*k sums, not an n*n matrix.
  const sums = Array.from({ length: n }, () => Array(k).fill(0) as number[]);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const distance = Math.sqrt(squared(matrix[i], matrix[j]));
    sums[i][labels[j]] += distance; sums[j][labels[i]] += distance;
  }
  const examples = sums.map((row, i) => {
    const singleton = groups[labels[i]].length === 1;
    const a = singleton ? 0 : row[labels[i]] / (groups[labels[i]].length - 1);
    const b = Math.min(...groups.flatMap((members, c) => c === labels[i] ? [] : [row[c] / members.length]));
    return { a, b, s: singleton || Math.max(a, b) === 0 ? 0 : (b - a) / Math.max(a, b), singleton };
  });
  const db = scatter.every(value => Math.abs(value) <= 1e-8) || distances.every(row => row.every(value => Math.abs(value) <= 1e-8)) ? 0 :
    scatter.reduce((sum, sigma, c) => sum + Math.max(...scatter.map((other, j) => j === c || distances[c][j] === 0 ? 0 : (sigma + other) / distances[c][j])), 0) / k;
  return CalculationEvidenceSchema.parse({ n, k, representation, seed,
    exampleParticipant: { rid: ids[0], ...examples[0] },
    daviesBouldin: { sigma0: scatter[0], sigma1: scatter[1], centroidDistance: distances[0][1] },
    calinskiHarabasz: { ssb, ssw }, metrics: {
      silhouette: examples.reduce((sum, row) => sum + row.s, 0) / n,
      davies_bouldin: db, calinski_harabasz: ssw === 0 ? 1 : ssb * (n - k) / (ssw * (k - 1))
    } });
}

export function verifyCalculationMetrics(calculation: CalculationEvidence, expected: CalculationEvidence["metrics"]) {
  for (const key of ["silhouette", "davies_bouldin", "calinski_harabasz"] as const) {
    if (!Number.isFinite(expected[key]) || Math.abs(calculation.metrics[key] - expected[key]) > 1e-9 * Math.max(1, Math.abs(expected[key]))) {
      throw new Error(`Calculation partition disagrees with stored ${key}.`);
    }
  }
}
