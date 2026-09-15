// Presentation-only fixtures: no sampling, fitting, or API execution.
export const simulationNumbers = [1, 2, 3, 4, 5] as const;
export type SimulationNumber = typeof simulationNumbers[number];
type MethodResult = {
  silhouette: number; daviesBouldin: number; calinskiHarabasz: number;
  iterations: number; clusterSizes: [number, number];
};
type SimulationResult = {
  sampleSize: number; existing: MethodResult; enhanced: MethodResult;
  selectedK: number; inputVariables: number; cumulativeVariance: number[]; votes: number[];
};
const common = {
  sampleSize: 1950, selectedK: 2, inputVariables: 13,
  cumulativeVariance: [42.1, 59.4, 70.8, 78.6, 83.7, 87.48],
  votes: [9, 6, 5, 0, 1, 1, 1, 0, 1],
};
export const simulationRunsMock: Record<SimulationNumber, SimulationResult> = {
  1: { ...common,
    existing: { silhouette: 0.2812, daviesBouldin: 1.4871, calinskiHarabasz: 232.8, iterations: 25, clusterSizes: [1180, 770] },
    enhanced: { silhouette: 0.3241, daviesBouldin: 1.3092, calinskiHarabasz: 249.1, iterations: 16, clusterSizes: [1205, 745] } },
  2: { ...common,
    existing: { silhouette: 0.2891, daviesBouldin: 1.4612, calinskiHarabasz: 239.4, iterations: 22, clusterSizes: [1192, 758] },
    enhanced: { silhouette: 0.3324, daviesBouldin: 1.2846, calinskiHarabasz: 255.2, iterations: 14, clusterSizes: [1210, 740] } },
  3: { ...common,
    existing: { silhouette: 0.2843, daviesBouldin: 1.4756, calinskiHarabasz: 235.9, iterations: 24, clusterSizes: [1184, 766] },
    enhanced: { silhouette: 0.3276, daviesBouldin: 1.3012, calinskiHarabasz: 251.4, iterations: 15, clusterSizes: [1208, 742] } },
  4: { ...common,
    existing: { silhouette: 0.2867, daviesBouldin: 1.4698, calinskiHarabasz: 237.6, iterations: 23, clusterSizes: [1188, 762] },
    enhanced: { silhouette: 0.3298, daviesBouldin: 1.2934, calinskiHarabasz: 252.3, iterations: 15, clusterSizes: [1211, 739] } },
  5: { ...common,
    existing: { silhouette: 0.2875, daviesBouldin: 1.4653, calinskiHarabasz: 238.2, iterations: 21, clusterSizes: [1190, 760] },
    enhanced: { silhouette: 0.3312, daviesBouldin: 1.2897, calinskiHarabasz: 254.6, iterations: 14, clusterSizes: [1214, 736] } },
};
