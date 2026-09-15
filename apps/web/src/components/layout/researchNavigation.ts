export const researchPages = [
  { step: "01", path: "/dataset-setup", label: "Dataset Setup" },
  { step: "02", path: "/study-findings", label: "Study Findings" },
  { step: "03", path: "/simulation-runs", label: "Simulation Runs" }
] as const;
export type ResearchPagePath = (typeof researchPages)[number]["path"];
