export const researchPages = [
  { step: "01", path: "/overview", label: "Pipeline" },
  { step: "02", path: "/enhancement-evaluation", label: "Enhancement Evaluation" },
  { step: "03", path: "/cluster-findings", label: "Cluster Findings" },
  { step: "04", path: "/longitudinal-follow-up", label: "Longitudinal Progression" }
] as const;

export type ResearchPagePath = (typeof researchPages)[number]["path"];
