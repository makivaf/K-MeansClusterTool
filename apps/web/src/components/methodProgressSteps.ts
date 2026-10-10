export const standardProgressSteps = [
  ["Preparing Run", "Initialize analysis", 0],
  ["Preprocessing", "Using validated, standardized study-entry data", 1],
  ["Standard Setup", "Silhouette k selection · random initialization", 2],
  ["K-Means", "Lloyd clustering", 3],
  ["Validation", "Metrics & reproducibility evidence", 4],
  ["Complete", "Standard results ready", 5]
] as const;

export const enhancedProgressSteps = [
  ["Preparing Run", "Initialize analysis", 0],
  ["Preprocessing", "Using validated, standardized study-entry data", 1],
  ["PCA", "Dimensionality reduction", 2],
  ["NbClust", "Cluster-number selection", 3],
  ["DPC", "Deterministic centroid initialization", 4],
  ["K-Means", "Lloyd clustering", 5],
  ["Validation", "Metrics & reproducibility evidence", 6],
  ["Complete", "Enhanced results ready", 7]
] as const;

export const comparisonProgressSteps = (method: "Standard" | "Enhanced") =>
  (method === "Standard" ? standardProgressSteps : enhancedProgressSteps).map(([title, subtitle, stage]) =>
    [title, stage === 0 ? "Initialize comparison" : subtitle, stage] as const);
