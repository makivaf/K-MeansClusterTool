import type { SopEvaluation } from "../../../../packages/shared/src";

// Aggregate agreement is descriptive evidence, not a new participant-level partition test.
export const countDpcMatches = (sop3: SopEvaluation["sop3"]): number | null => {
  if (!sop3.randomRuns) return null;
  const reference = sop3.dpcDeterminism;
  const sizes = [...reference.clusterSizes].sort((a, b) => a - b);
  return sop3.randomRuns.filter((run) =>
    (["silhouette", "daviesBouldin", "calinskiHarabasz"] as const).every((key) => Math.abs(run[key] - reference.metrics[key]) <= 1e-10) &&
    [...run.clusterSizes].sort((a, b) => a - b).every((count, index) => count === sizes[index])
  ).length;
};
