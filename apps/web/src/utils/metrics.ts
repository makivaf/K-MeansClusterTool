import type { ClusteringMetrics, ClusteringRun, ConditionResult } from "../../../../packages/shared/src";

export const metricLabels: Record<keyof ClusteringMetrics, string> = {
  silhouette: "Silhouette",
  davies_bouldin: "Davies-Bouldin",
  calinski_harabasz: "Calinski-Harabasz"
};

export const betterDirection: Record<keyof ClusteringMetrics, "higher" | "lower"> = {
  silhouette: "higher",
  davies_bouldin: "lower",
  calinski_harabasz: "higher"
};

export const getConditions = (run: ClusteringRun) => {
  const [baseline, enhanced] = run.conditions;
  return { baseline, enhanced };
};

export const metricDelta = (metric: keyof ClusteringMetrics, baseline: ConditionResult, enhanced: ConditionResult) => {
  const rawDelta = enhanced.metrics[metric] - baseline.metrics[metric];
  const direction = betterDirection[metric];
  const improved = direction === "higher" ? rawDelta > 0 : rawDelta < 0;
  return { rawDelta, improved };
};

export const formatMetric = (metric: keyof ClusteringMetrics, value: number) => {
  if (metric === "calinski_harabasz") {
    return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
  }
  return value.toFixed(3);
};
