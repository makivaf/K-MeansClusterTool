/** Study Findings SOP 3 aggregate agreement; not participant-level partition identity. */
export function matchesDpcSolution(metrics: readonly number[], clusterSizes: readonly number[],
  referenceMetrics: readonly number[], referenceSizes: readonly number[]): boolean {
  const sizes = [...referenceSizes].sort((a, b) => a - b);
  return metrics.length === referenceMetrics.length && clusterSizes.length === sizes.length &&
    metrics.every((value, index) => Math.abs(value - referenceMetrics[index]) <= 1e-10) &&
    [...clusterSizes].sort((a, b) => a - b).every((count, index) => count === sizes[index]);
}
