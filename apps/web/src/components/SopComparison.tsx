import { formatContinuous, formatPercent, formatInteger } from "../utils/numberFormatting";
import { Fragment, useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { topLoadingRows, type PcaLoadingEvidence } from "../utils/pcaLoadings";
import { MetricComparisonTable, type MetricKey } from "./MetricComparisonTable";
import { PcaCalculationDetails } from "./PcaCalculationDetails";
import type { CalculationEvidence } from "../../../../packages/shared/src/calculationEvidence";
import "./SopComparison.css";

// Presentation only: each page supplies its own evidence and chart bindings.
export const MethodCard = ({ title, enhanced = false, children, simulation = false }: {
  title: string; enhanced?: boolean; children: ReactNode; simulation?: boolean;
}) => <section className={`sop-method-card ${simulation ? "simulation-chart" : "study-method-card"} ${enhanced ? "is-enhanced simulation-enhanced" : ""}`}>
  <span className={`research-badge ${enhanced ? "is-valid" : ""}`}>{enhanced ? "Enhanced K-Means" : "Standard K-Means"}</span>
  <h3 className="card-title mb-3 mt-3">{title}</h3>
  {children}
</section>;

export const SopComparison = ({ standard, enhanced, children, simulation = false, figures = false, standardOnly = false }: {
  standard: ReactNode; enhanced: ReactNode; children?: ReactNode; simulation?: boolean; figures?: boolean; standardOnly?: boolean;
}) => {
  const content = <>
    <div className={standardOnly ? "study-single-method" : simulation ? "simulation-two-column" : "study-method-grid"}>{standard}{!standardOnly && enhanced}</div>
    {!standardOnly && children}
  </>;
  return figures ? <div className="sop-figures">{content}</div> : content;
};

export const VariableChips = ({ variables }: { variables: readonly string[] }) =>
  <ul className="sop-variable-chips" aria-label="Input variables">{variables.map((variable, index) => <li key={variable}>{index + 1}. {variable.replace(/_/g, " ")}</li>)}</ul>;

export const VarianceSummary = ({ rows, retained, loadingData }: {
  rows: { component: number; eigenvalue?: number; cumulativeVariance: number }[]; retained: number;
  loadingData?: PcaLoadingEvidence;
}) => {
  const [expanded, setExpanded] = useState<number | null>(null);
  const disclosureId = useId();
  return <section className="sop-support-card">
  <h3 className="card-title mb-4">Principal Components — Variance Summary</h3>
  <div className="overflow-x-auto"><table className="research-table sop-table pca-variance-table">
    <thead><tr><th>PC</th><th>Eigenvalue</th><th>Cumulative Var.</th></tr></thead>
    <tbody>{rows.filter(row => row.component <= retained).map(row => {
      const open = expanded === row.component;
      const label = `PC${row.component}`;
      const column = loadingData?.components.indexOf(label) ?? -1;
      const contributors = loadingData && column >= 0 ? topLoadingRows(loadingData.values, column) : [];
      return <Fragment key={row.component}><tr className={open || row.component === retained ? "sop-selected-row" : undefined}>
      <th scope="row"><button type="button" className="pca-variance-toggle" aria-expanded={open} aria-controls={`${disclosureId}-${row.component}`}
        onClick={() => setExpanded(current => current === row.component ? null : row.component)}>
        {label}{row.component === retained ? " ★" : ""}<ChevronDown size={14} aria-hidden="true" />
      </button></th>
      <td>{row.eigenvalue === undefined ? "Unavailable" : formatContinuous(row.eigenvalue)}</td>
      <td>{formatPercent(row.cumulativeVariance * 100)}</td>
    </tr><tr id={`${disclosureId}-${row.component}`} hidden={!open} className="pca-variance-details"><td colSpan={3}>
      <h4 className="text-xs font-semibold text-muted">Top Absolute Loadings</h4>
      {loadingData && contributors.length ? <ul className="pca-top-loadings">{contributors.map(index => {
        const value = loadingData.values[index][column];
        return <li key={loadingData.variables[index]}><span className="research-badge is-valid">{loadingData.variables[index]}</span><strong className="tabular-nums">{value > 0 ? "+" : ""}{formatContinuous(value)}</strong></li>;
      })}</ul> : <p className="mt-2 text-xs text-muted">Loading values will appear when PCA loading data is available.</p>}
    </td></tr></Fragment>;
    })}</tbody>
  </table></div>
  <p className="mt-3 text-xs text-muted">★ Retained at ≥ 85.00% cumulative explained variance.{rows.some(row => row.eigenvalue === undefined) ? " Eigenvalues are not supplied for this run." : ""}</p>
</section>;
};

export const PcaContribution = ({ dimensions, components, existing, enhanced, relativeChange, note, n, k, calculations, runCount }: {
  dimensions: number; components: number; existing?: Partial<Record<MetricKey, number>>;
  enhanced?: Partial<Record<MetricKey, number>>; relativeChange?: Partial<Record<MetricKey, number>>; note: string;
  n?: number; k?: number;
  calculations?: { existing?: CalculationEvidence; enhanced?: CalculationEvidence };
  runCount?: number;
}) => <section className="sop-support-card">
  <h3 className="card-title mb-2">Controlled PCA Contribution to Clustering</h3>
  <p className="mb-4 text-sm text-muted">{dimensions} standardized variables vs {components} principal components.</p>
  <MetricComparisonTable existing={existing} enhanced={enhanced} relativeChange={relativeChange ?? {}}
    metrics={["silhouette"]} footerNote={note} />
  <PcaCalculationDetails n={n} k={k} representations={[
    { label: `${dimensions} Features`, description: `${dimensions} standardized features`, silhouette: existing?.silhouette, calculation: calculations?.existing, runCount },
    { label: `${components} PCs`, description: `${components} principal components`, silhouette: enhanced?.silhouette, calculation: calculations?.enhanced, runCount }
  ]} />
</section>;

export const ClusterDistribution = ({ sizes, participants, title, metadata, interpretations, unavailableMessage }: {
  sizes?: number[]; participants: number; title: string; metadata?: string;
  interpretations?: readonly string[]; unavailableMessage?: string;
}) => <section className="sop-distribution" aria-label={`${title} cluster distribution`}>
  <header className="sop-distribution-heading"><h3 className="card-title">{title}</h3>
    <p className="sop-distribution-metadata">{metadata}</p>
  </header>
  {sizes ? <div className="sop-clusters">{sizes.map((size, index) => <article className="sop-cluster" key={index}>
    <h4>Cluster {index}</h4>
    <p className="sop-cluster-interpretation">{interpretations?.[index]}</p>
    <p className="sop-cluster-count">{formatInteger(size)}</p>
    <p className="sop-cluster-percentage">participants · {formatPercent(100 * size / participants)}</p>
    <div className="sop-distribution-track" aria-hidden="true"><div className={index % 2 ? "is-secondary" : ""} style={{ width: `${100 * size / participants}%` }} /></div>
  </article>)}</div> : <div className="sop-distribution-unavailable" role="status">
    <p className="font-medium">{title.replace(" K-Means", "")} distribution unavailable</p>
    <p className="mt-1 text-xs text-muted">{unavailableMessage}</p>
  </div>}
</section>;
