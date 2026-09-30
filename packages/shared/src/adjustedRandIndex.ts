/** Label-invariant adjusted Rand index for two aligned participant partitions. */
export function adjustedRandIndex(reference: readonly number[], labels: readonly number[]): number {
  if (reference.length !== labels.length || reference.length < 2) throw new Error("ARI requires aligned partitions.");
  const rows = new Map<number, number>(), columns = new Map<number, number>(), cells = new Map<string, number>();
  reference.forEach((label, i) => {
    if (!Number.isInteger(label) || !Number.isInteger(labels[i])) throw new Error("Invalid partition label.");
    rows.set(label, (rows.get(label) ?? 0) + 1);
    columns.set(labels[i], (columns.get(labels[i]) ?? 0) + 1);
    const key = `${label}:${labels[i]}`;
    cells.set(key, (cells.get(key) ?? 0) + 1);
  });
  const pairs = (n: number) => n * (n - 1) / 2;
  const sum = (counts: Map<unknown, number>) => [...counts.values()].reduce((total, n) => total + pairs(n), 0);
  const a = sum(rows), b = sum(columns), observed = sum(cells);
  const expected = a * b / pairs(reference.length), maximum = (a + b) / 2;
  return maximum === expected ? 1 : (observed - expected) / (maximum - expected);
}
