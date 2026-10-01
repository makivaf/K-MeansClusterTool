import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { formatMetric } from "./MetricComparisonTable";

type Representation = {
  label: string;
  description: string;
  silhouette?: number;
  exampleParticipant?: { rid?: string | number; a?: number; b?: number; s?: number };
};

export const PcaCalculationDetails = ({ n, k, representations }: {
  n?: number; k?: number; representations: [Representation, Representation];
}) => {
  const [selected, setSelected] = useState(1);
  const representation = representations[selected];
  const example = representation.exampleParticipant;
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
        <p>Example Participant Calculation</p>
        <dl>
          <div><dt>RID</dt><dd>{example?.rid ?? "Unavailable"}</dd></div>
          <div><dt>a(i)</dt><dd>{example?.a?.toFixed(3) ?? "Unavailable"}</dd></div>
          <div><dt>b(i)</dt><dd>{example?.b?.toFixed(3) ?? "Unavailable"}</dd></div>
          <div><dt>s(i)</dt><dd>{example?.s?.toFixed(3) ?? "Unavailable"}</dd></div>
          <div className="pca-silhouette-overall"><dt>Overall Silhouette</dt><dd>{formatMetric(representation.silhouette)}</dd></div>
        </dl>
        <small>Higher is better</small>
      </section>
    </div>
  </details>;
};
