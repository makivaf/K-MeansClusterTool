export const researchPages = [
  { step: "01", path: "/existing-algorithm", label: "Existing Algorithm" },
  { step: "02", path: "/enhanced-algorithm", label: "Enhanced Algorithm" },
  { step: "03", path: "/summary-of-findings", label: "Summary of Findings" },
  { step: "04", path: "/run-history", label: "Run History" }
] as const;

export type ResearchPagePath = (typeof researchPages)[number]["path"];
