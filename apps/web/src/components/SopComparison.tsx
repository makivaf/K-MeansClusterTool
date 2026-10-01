import type { ReactNode } from "react";
import { MetricComparisonTable, type MetricKey } from "./MetricComparisonTable";
import { PcaCalculationDetails } from "./PcaCalculationDetails";
import "./SopComparison.css";

// Presentation only: each page supplies its own evidence and chart bindings.
export const MethodCard = ({ title, enhanced = false, children, simulation = false }: {
  title: string; enhanced?: boolean; children: ReactNode; simulation?: boolean;
}) => <section className={`sop-method-card ${simulation ? "simulation-chart" : "study-method-card"} ${enhanced ? "is-enhanced simulation-enhanced" : ""}`}>
  <span className={`research-badge ${enhanced ? "is-valid" : ""}`}>{enhanced ? "Enhanced K-Means" : "Standard K-Means"}</span>
  <h3 className="card-title mb-3 mt-3">{title}</h3>
  {children}
</section>;

export const SopComparison = ({ standard, enhanced, children, simulation = false, figures = false }: {
  standard: ReactNode; enhanced: ReactNode; children?: ReactNode; simulation?: boolean; figures?: boolean;
}) => {
  const content = <>
    <div className={simulation ? "simulation-two-column" : "study-method-grid"}>{standard}{enhanced}</div>
    {children}
  </>;
  return figures ? <div className="sop-figures">{content}</div> : content;
};

export const VariableChips = ({ variables }: { variables: readonly string[] }) =>
  <ul className="sop-variable-chips" aria-label="Input variables">{variables.map((variable, index) => <li key={variable}>{index + 1}. {variable.replace(/_/g, " ")}</li>)}</ul>;

export const VarianceSummary = ({ rows, retained }: {
  rows: { component: number; eigenvalue?: number; cumulativeVariance: number }[]; retained: number;
}) => <section className="sop-support-card">
  <h3 className="card-title mb-4">Principal Components — Variance Summary</h3>
  <div className="overflow-x-auto"><table className="research-table sop-table">
    <thead><tr><th>PC</th><th>Eigenvalue</th><th>Cumulative Var.</th></tr></thead>
    <tbody>{rows.filter(row => row.component <= retained).map(row => <tr key={row.component} className={row.component === retained ? "sop-selected-row" : undefined}>
      <th scope="row">PC{row.component}{row.component === retained ? " ★" : ""}</th>
      <td>{row.eigenvalue === undefined ? "Unavailable" : row.eigenvalue.toFixed(3)}</td>
      <td>{(row.cumulativeVariance * 100).toFixed(2)}%</td>
    </tr>)}</tbody>
  </table></div>
  <p className="mt-3 text-xs text-muted">★ Retained at ≥ 85% cumulative explained variance.{rows.some(row => row.eigenvalue === undefined) ? " Eigenvalues are not supplied for this run." : ""}</p>
</section>;

export const PcaContribution = ({ dimensions, components, existing, enhanced, relativeChange, note, n, k, calculationSilhouettes }: {
  dimensions: number; components: number; existing?: Partial<Record<MetricKey, number>>;
  enhanced?: Partial<Record<MetricKey, number>>; relativeChange?: Partial<Record<MetricKey, number>>; note: string;
  n?: number; k?: number;
  calculationSilhouettes?: { existing: number; enhanced: number };
}) => <section className="sop-support-card">
  <h3 className="card-title mb-2">Controlled PCA Contribution to Clustering</h3>
  <p className="mb-4 text-sm text-muted">{dimensions} standardized variables vs {components} principal components.</p>
  <MetricComparisonTable existing={existing} enhanced={enhanced} relativeChange={relativeChange ?? {}}
    existingLabel={`${dimensions} Features`} enhancedLabel={`${components} PCs`} metrics={["silhouette"]} />
  <p className="mt-3 text-xs text-muted">{note}</p>
  <PcaCalculationDetails n={n} k={k} representations={[
    { label: `${dimensions} Features`, description: `${dimensions} standardized features`, silhouette: calculationSilhouettes?.existing ?? existing?.silhouette },
    { label: `${components} PCs`, description: `${components} principal components`, silhouette: calculationSilhouettes?.enhanced ?? enhanced?.silhouette }
  ]} />
</section>;

export const ClusterDistribution = ({ sizes, participants, title }: { sizes: number[]; participants: number; title: string }) => <div className="sop-distribution">
  <h3 className="card-title">{title}</h3>
  {sizes.map((size, index) => <div className="sop-cluster" key={index}>
    <div className="sop-distribution-values"><span>Cluster {index}<small>{size.toLocaleString("en-US")} participants</small></span><strong>{(100 * size / participants).toFixed(1)}%</strong></div>
    <div className="sop-distribution-track"><div className={index % 2 ? "is-light" : ""} style={{ width: `${100 * size / participants}%` }} /></div>
  </div>)}
</div>;
