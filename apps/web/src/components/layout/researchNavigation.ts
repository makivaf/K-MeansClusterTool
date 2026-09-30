export const researchPages = [
  { step: "01", path: "/dataset-setup", label: "Dataset Setup" },
  { step: "02", path: "/simulation-runs", label: "K-Means Comparison" },
  { step: "03", path: "/study-findings", label: "Study Findings" }
] as const;
export type ResearchPagePath = (typeof researchPages)[number]["path"];
