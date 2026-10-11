import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { formatMetric } from "./MetricComparisonTable";
import { SilhouetteCalculationCard, type SilhouetteParticipant } from "./SilhouetteCalculationCard";
import type { CalculationEvidence } from "../../../../packages/shared/src/calculationEvidence";

type Representation = {
  label: string;
  description: string;
  silhouette?: number;
  calculation?: CalculationEvidence;
  participants?: readonly SilhouetteParticipant[];
  runCount?: number;
};

export const PcaCalculationDetails = ({ n, k, representations }: {
  n?: number; k?: number; representations: [Representation, Representation];
}) => {
  const [selected, setSelected] = useState(1);
  const representation = representations[selected];
  return <details className="pca-calculation-details">
    <summary>View Calculation Details <ChevronDown size={14} aria-hidden="true" /></summary>
    <div className="pca-calculation-content">
      <h4>Calculation Details</h4>
      <div className="pca-representation-toggle" role="group" aria-label="Calculation representation">
        {representations.map((item, index) => <button key={item.label} type="button"
          aria-pressed={selected === index} onClick={() => setSelected(index)}>{item.label}</button>)}
      </div>
      <SilhouetteCalculationCard key={selected} n={n} k={k} method="Standard K-Means"
        representation={representation.description} calculation={representation.calculation}
        participants={representation.participants} runCount={representation.runCount} value={formatMetric(representation.silhouette)} />
    </div>
  </details>;
};
