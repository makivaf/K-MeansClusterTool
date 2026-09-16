import type { SopEvaluation } from "../../../../packages/shared/src";
import { matchesDpcSolution } from "../../../../packages/shared/src/dpcMatching";

// Aggregate agreement is descriptive evidence, not a new participant-level partition test.
export const countDpcMatches = (sop3: SopEvaluation["sop3"]): number | null => {
  if (!sop3.randomRuns) return null;
  const reference = sop3.dpcDeterminism;
  const keys = ["silhouette", "daviesBouldin", "calinskiHarabasz"] as const;
  return sop3.randomRuns.filter(run => matchesDpcSolution(keys.map(key => run[key]), run.clusterSizes,
    keys.map(key => reference.metrics[key]), reference.clusterSizes)).length;
};
