import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { formatMetric } from "./MetricComparisonTable";
import type { CalculationEvidence } from "../../../../packages/shared/src/calculationEvidence";

type Representation = {
  label: string;
  description: string;
  silhouette?: number;
  calculation?: CalculationEvidence;
  runCount?: number;
};

export const PcaCalculationDetails = ({ n, k, representations }: {
  n?: number; k?: number; representations: [Representation, Representation];
}) => {
  const [selected, setSelected] = useState(1);
  const representation = representations[selected];
  const example = representation.calculation?.exampleParticipant;
  return <details className="pca-calculation-details">
    <summary>View Calculation Details <ChevronDown size={14} aria-hidden="true" /></summary>
    <div className="pca-calculation-content">
      <h4>Calculation Details</h4>
      <div className="pca-representation-toggle" role="group" aria-label="Calculation representation">
        {representations.map((item, index) => <button key={item.label} type="button"
          aria-pressed={selected === index} onClick={() => setSelected(index)}>{item.label}</button>)}
      </div>
      <div className="pca-calculation-metadata">
        <span>Participants (N): <strong>{n?.toLocaleString("en-US") ?? "Unavailable"}</strong></span>
        <span>Clusters (K): <strong>{k ?? "Unavailable"}</strong></span>
        <span>Representation: <strong>{representation.description}</strong></span>
      </div>
      <section className="pca-silhouette-card">
        <h5>Silhouette Coefficient</h5>
        <p>{example ? `Example Participant Calculation · Seed ${representation.calculation?.seed}` : "Participant-level calculation unavailable for this cached run."}</p>
        {representation.runCount && <p>Overall Silhouette is the mean of {representation.runCount} runs{example ? "; the participant example describes one stored run." : "."}</p>}
        <dl>
          {example && <>
          <div><dt>RID</dt><dd>{example?.rid ?? "Unavailable"}</dd></div>
          <div><dt>a(i)</dt><dd>{example.a === undefined ? "Unavailable" : formatMetric(example.a)}</dd></div>
          <div><dt>b(i)</dt><dd>{example.b === undefined ? "Unavailable" : formatMetric(example.b)}</dd></div>
          <div><dt>s(i)</dt><dd>{example.s === undefined ? "Unavailable" : formatMetric(example.s)}</dd></div>
          </>}
          <div className="pca-silhouette-overall"><dt>Overall Silhouette</dt><dd>{formatMetric(representation.silhouette)}</dd></div>
        </dl>
        <small>Higher is better</small>
      </section>
    </div>
  </details>;
};
