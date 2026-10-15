import type { ComponentProps, ReactNode } from "react";
import { formatPercent } from "../utils/numberFormatting";
import { PcaChart } from "./SopFigures";
import { MethodCard, SopComparison, VariableChips } from "./SopComparison";

// Pages retain their own evidence gates and sources; this owns SOP 1 presentation.
export const FeatureRepresentationComparison = ({ standardVariables, standardFigure, enhancedVariables, enhanced, standardOnly = false, children }: {
  standardVariables: readonly string[];
  standardFigure: ReactNode;
  enhancedVariables: readonly string[];
  enhanced: ComponentProps<typeof PcaChart>["enhanced"];
  standardOnly?: boolean;
  children: ReactNode;
}) => {
  const variance = formatPercent(enhanced.cumulativeExplainedVariance * 100);
  return <SopComparison className="sop-feature-representation" simulation figures
    standard={<MethodCard simulation title="Original Feature Representation">
      <p className="simulation-compact-note">{standardVariables.length} standardized variables</p>
      {standardFigure}
      <VariableChips variables={standardVariables} />
    </MethodCard>}
    enhanced={standardOnly ? <MethodCard simulation enhanced title="Enhanced K-Means"><p role="status">Not run yet</p></MethodCard> : <MethodCard simulation enhanced title="Principal Component Analysis">
      <p className="simulation-compact-note">{enhancedVariables.length} variables {" -> "}{enhanced.pcaComponents} PCs, {variance} variance</p>
      <PcaChart enhanced={enhanced} />
    </MethodCard>}>
    {!standardOnly && children}
  </SopComparison>;
};
