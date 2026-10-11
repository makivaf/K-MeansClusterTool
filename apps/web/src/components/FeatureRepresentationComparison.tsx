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
  return <SopComparison className="sop-feature-representation" standardOnly={standardOnly} simulation figures
    standard={<MethodCard simulation title="Original Feature Representation">
      <p className="simulation-compact-note">{standardVariables.length} standardized input variables</p>
      {standardFigure}
      <VariableChips variables={standardVariables} />
    </MethodCard>}
    enhanced={<MethodCard simulation enhanced title="Principal Component Analysis">
      <PcaChart showAllComponents enhanced={enhanced} />
      <dl className="simulation-detail-list sop-summary">
        <div><dt>Input variables</dt><dd>{enhancedVariables.length}</dd></div>
        <div><dt>Components retained</dt><dd>{enhanced.pcaComponents}</dd></div>
        <div><dt>Cumulative explained variance</dt><dd>{variance}</dd></div>
        <div><dt>Variance retention threshold</dt><dd>≥ 85.00%</dd></div>
      </dl>
    </MethodCard>}>
    {children}
  </SopComparison>;
};
