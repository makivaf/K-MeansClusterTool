import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { formatMetric, type MetricKey } from "./MetricComparisonTable";
import "./SopComparison.css";
import "./InternalValidationCalculationDetails.css";

type MethodDetails = {
  n: number;
  k: number;
  metrics: Partial<Record<MetricKey, number>>;
  exampleParticipant?: { rid?: string | number; a?: number; b?: number; s?: number };
  daviesBouldin?: { sigma0?: number; sigma1?: number; centroidDistance?: number };
  calinskiHarabasz?: { ssb?: number; ssw?: number };
};
const intermediate = (value?: number) => value === undefined ? "—" : value.toLocaleString("en-US", {
  minimumFractionDigits: 3, maximumFractionDigits: 3
});
const Row = ({ label, value }: { label: string; value: ReactNode }) => <div><dt>{label}</dt><dd>{value}</dd></div>;
const MetricCard = ({ title, totalLabel = title, value, direction, children }: {
  title: string; totalLabel?: string; value: string; direction: "Higher" | "Lower"; children: ReactNode;
}) => <section className="internal-calculation-card">
  <h5>{title}</h5>
  <div className="internal-calculation-fields">{children}</div>
  <dl className="internal-calculation-total"><Row label={totalLabel} value={value} /></dl>
  <small>{direction} is better</small>
</section>;

export const InternalValidationCalculationDetails = ({ standard, enhanced, formatValue = formatMetric }: {
  standard?: MethodDetails; enhanced: MethodDetails; formatValue?: (value: number | undefined) => string;
}) => {
  const [selected, setSelected] = useState<"standard" | "enhanced">("standard");
  const method = standard && selected === "standard" ? standard : enhanced;
  return <details className="pca-calculation-details internal-validation-calculations">
    <summary>View Calculation Details <ChevronDown size={14} aria-hidden="true" /></summary>
    <div className="pca-calculation-content">
      <h4>Calculation Details</h4>
      {standard && <div className="pca-representation-toggle" role="group" aria-label="Validation calculation method">
        {(["standard", "enhanced"] as const).map(key => <button key={key} type="button"
          aria-pressed={selected === key} onClick={() => setSelected(key)}>
          {key === "standard" ? "Standard K-Means" : "Enhanced K-Means"}
        </button>)}
      </div>}
      <div className="pca-calculation-metadata">
        <span>Participants (N): <strong>{method.n.toLocaleString("en-US")}</strong></span>
        <span>Clusters (K): <strong>{method.k}</strong></span>
      </div>
      <div className="internal-calculation-grid">
        <MetricCard title="Silhouette Coefficient" totalLabel="Overall Silhouette"
          value={formatValue(method.metrics.silhouette)} direction="Higher">
          <p>Example Participant Calculation</p>
          <dl>
            <Row label="RID" value={method.exampleParticipant?.rid ?? "—"} />
            <Row label="a(i)" value={intermediate(method.exampleParticipant?.a)} />
            <Row label="b(i)" value={intermediate(method.exampleParticipant?.b)} />
            <Row label="s(i)" value={intermediate(method.exampleParticipant?.s)} />
          </dl>
        </MetricCard>
        <MetricCard title="Davies-Bouldin Index" value={formatValue(method.metrics.davies_bouldin)} direction="Lower">
          <dl>
            <Row label="σ0" value={intermediate(method.daviesBouldin?.sigma0)} />
            <Row label="σ1" value={intermediate(method.daviesBouldin?.sigma1)} />
            <Row label="d(c0,c1)" value={intermediate(method.daviesBouldin?.centroidDistance)} />
          </dl>
        </MetricCard>
        <MetricCard title="Calinski-Harabasz Index" value={formatValue(method.metrics.calinski_harabasz)} direction="Higher">
          <dl>
            <Row label="SSB" value={intermediate(method.calinskiHarabasz?.ssb)} />
            <Row label="SSW" value={intermediate(method.calinskiHarabasz?.ssw)} />
            <Row label="N" value={method.n.toLocaleString("en-US")} />
            <Row label="K" value={method.k} />
          </dl>
        </MetricCard>
      </div>
    </div>
  </details>;
};
