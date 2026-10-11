const sop = (number: number, title: string, description: string) => ({
  title,
  heading: `SOP ${number} · ${title}`,
  description
});

// Shared presentation copy; evidence and numerical results stay page-specific.
export const sopText = {
  sop1: sop(1, "Feature Representation", "Examines how Principal Component Analysis (PCA) reduces the original feature space while retaining the predefined variance threshold."),
  sop2: sop(2, "Cluster Number Selection", "Compares single-index Silhouette-based selection with the multi-index consensus approach of NbClust for determining the number of clusters."),
  sop3: sop(3, "Initialization and Reproducibility", "Evaluates the consistency of clustering results across repeated executions using random initialization and deterministic Density Peaks Clustering (DPC) initialization.")
} as const;
