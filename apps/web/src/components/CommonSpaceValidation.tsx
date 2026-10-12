import type { MethodResult } from "../../../../packages/shared/src/methodExecution";
import { MetricComparisonTable, metricDefinitions, formatMetric, type MetricKey } from "./MetricComparisonTable";
import { InternalValidationCalculationDetails } from "./InternalValidationCalculationDetails";
import { formatContinuous } from "../utils/numberFormatting";

export function CommonSpaceValidation({ comparison, standardK, enhancedK, experiment = "final" }: {
  comparison: MethodResult; standardK: number; enhancedK: number; experiment?: "final" | "sop1" | "sop3";
}) {
  const evidence = comparison.commonSpace;
  if (!evidence) return <p role="status">Not available — common-space metrics are not supplied.</p>;
  const beforeKey = experiment === "sop3" ? "pcaRandom" : "standard";
  const afterKey = experiment === "sop1" ? "pcaRandom" : "enhanced";
  const beforeLabel = experiment === "sop3" ? "PCA + random (mean of 30 runs)" : "Standard (mean of 30 runs)";
  const afterLabel = experiment === "sop1" ? "PCA + random" : experiment === "sop3" ? "DPC" : "Enhanced";
  const content = (space: typeof evidence.spaces[number]) => {
    const before = space.conditions[beforeKey], after = space.conditions[afterKey];
    // Summarize the supplied per-run metrics; no metric or clustering fit is performed.
    const sd = Object.fromEntries(metricDefinitions.map(({ key }) => [key, before.runs.length > 1
      ? Math.sqrt(before.runs.reduce((sum, run) => sum + (run[key] - before.mean[key]) ** 2, 0) / (before.runs.length - 1)) : undefined]));
    const difference = Object.fromEntries(metricDefinitions.map(({ key }) => [key, after.mean[key] - before.mean[key]]));
    return <section>
      <MetricComparisonTable existing={before.mean} existingSD={sd} enhanced={after.mean} absoluteDifference={difference}
        existingLabel={beforeLabel} enhancedLabel={afterLabel} title={experiment === "sop1" ? "PCA Contribution" : "Internal Validation"} subtitle={space.primary ? "13D evaluation" : "6-PC evaluation"}
        footerNote={experiment === "final" ? "Standard: mean of 30 random-initialization runs. Enhanced: deterministic."
          : experiment === "sop1" ? "Original versus PCA + random; both evaluated in the same space." : "PCA + random versus DPC; both evaluated in the same space."} />
      <InternalValidationCalculationDetails labels={{ standard: beforeLabel, enhanced: afterLabel }}
        standard={{ n: comparison.common.participantCount, k: experiment === "sop3" ? enhancedK : standardK, runCount: before.runCount, metrics: before.mean, summary: {mean: before.mean, sd, minimum: before.minimum, maximum: before.maximum}, calculation: before.calculation, representation: before.calculation.representation }}
        enhanced={{ n: comparison.common.participantCount, k: enhancedK, runCount: after.runCount, metrics: after.mean, summary: {mean: after.mean, sd: Object.fromEntries(metricDefinitions.map(({key})=>[key, after.runs.length > 1 ? Math.sqrt(after.runs.reduce((sum,run)=>sum+(run[key]-after.mean[key])**2,0)/(after.runs.length-1)):undefined])), minimum: after.minimum, maximum: after.maximum}, calculation: after.calculation, representation: after.calculation.representation }}
        notes="Held constant: participants and evaluation matrix. Absolute differences are descriptive and do not establish statistical significance or equivalence." />

    </section>;
  };
  const primary = evidence.spaces.find(space => space.primary);
  return <>{primary && <>{content(primary)}</>}
    {evidence.spaces.filter(space => !space.primary).map(space => <details key={space.space} className="sop3-disclosure">
      <summary>Evaluated in the {space.dimensions}-PC space</summary>{content(space)}
    </details>)}
  </>;
}
