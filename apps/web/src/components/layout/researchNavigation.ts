import { ENABLE_KMEANS_COMPARISON } from "../../config/api";

export const researchPages = [
  { step: "01", path: "/dataset-setup", label: "Dataset Setup" },
  { step: "02", path: "/study-findings", label: "Study Findings" },
  ...(ENABLE_KMEANS_COMPARISON
    ? [{ step: "03", path: "/simulation-runs", label: "K-Means Comparison" } as const]
    : [])
] as const;
export type ResearchPagePath = (typeof researchPages)[number]["path"];
