import evidence from "../data/verifiedStudyPresentation.json";
import { MetricComparisonTable, metricDefinitions } from "./MetricComparisonTable";
/** Aggregate presentation evidence; applicability must be established by the frozen-study contract. */
export function VerifiedStudyMetrics({ experiment = "final" }: { experiment?: "final" | "sop1" | "sop3" }) {
  const before = experiment === "sop3" ? "pcaRandom" : "standard";
  const after = experiment === "sop1" ? "pcaRandom" : "enhanced";
  const beforeLabel = experiment === "sop3" ? "PCA + random (mean of 30 runs)" : "Standard (mean of 30 runs)";
  const afterLabel = experiment === "sop1" ? "PCA + random" : experiment === "sop3" ? "DPC" : "Enhanced";
  const content = (space: typeof evidence.spaces["13D"]) => {
    const values = (condition: "standard" | "pcaRandom" | "enhanced") => Object.fromEntries(metricDefinitions.map(({ key }) => [key, space.conditions[condition][key].mean]));
    return <MetricComparisonTable existing={values(before)} enhanced={values(after)} existingLabel={beforeLabel} enhancedLabel={afterLabel}
      title={experiment === "sop1" ? "PCA Contribution" : "Internal Validation"} subtitle="13D evaluation" existingSD={Object.fromEntries(metricDefinitions.map(({ key }) => [key, space.conditions[before][key].SD]))}
      absoluteDifference={Object.fromEntries(metricDefinitions.map(({ key }) => [key, space.conditions[after][key].mean - space.conditions[before][key].mean]))}
      footerNote="Standard: mean of 30 random-initialization runs. Enhanced: deterministic." />;
  };
  return <>{content(evidence.spaces["13D"])}</>;
}
