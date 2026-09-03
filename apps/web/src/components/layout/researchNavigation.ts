export const researchPages = [
  { step: "01", path: "/overview", label: "Overview" },
  { step: "02", path: "/enhanced-kmeans", label: "Enhanced K-Means" },
  { step: "03", path: "/cluster-findings", label: "Cluster Findings" },
  { step: "04", path: "/enhancement-evaluation", label: "Enhancement Evaluation" },
  { step: "05", path: "/longitudinal-follow-up", label: "Longitudinal Follow-Up" }
] as const;

export type ResearchPagePath = (typeof researchPages)[number]["path"];
