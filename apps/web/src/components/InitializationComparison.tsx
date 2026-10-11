import { formatContinuous, formatInteger } from "../utils/numberFormatting";
import type { ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { MethodCard, SopComparison } from "./SopComparison";
import { chartPalette } from "./charts/chartPalette";
import { sopText } from "../utils/sopText";

// Presentation inputs only. Callers must supply validated evidence for their own
// method and cohort; reference-seed ARI and legacy DPC checks are not modal ARI.
export type InitializationEvidence = {
  executions?: number;
  partitionFrequencies?: readonly { partition: string; frequency: number }[];
  modalPartitionAri?: readonly { seed: number; adjustedRandIndex: number }[];
  pairwiseComparisons?: number;
  uniqueFinalPartitions?: number;
  modalPartitionFrequency?: number;
  minimumPairwiseAri?: number;
  meanPairwiseAri?: number;
  maximumDifferingParticipants?: number;
  distinctInitialCentroidSets?: number;
};

const count = (value?: number) => value === undefined ? "Unavailable" : formatInteger(value);
const continuous = (value?: number) => value === undefined ? "Unavailable" : formatContinuous(value);
const modalFrequency = (evidence?: InitializationEvidence) => evidence?.modalPartitionFrequency === undefined || evidence.executions === undefined
  ? "Unavailable" : `${formatInteger(evidence.modalPartitionFrequency)} / ${formatInteger(evidence.executions)}`;
const Unavailable = ({ reason }: { reason: string }) => <p className="sop3-chart-unavailable text-sm text-muted" role="status">Unavailable — {reason}</p>;

export const PartitionFrequencyChart = ({ rows }: { rows?: InitializationEvidence["partitionFrequencies"] }) => <div className={`sop3-chart${rows?.length ? "" : " is-unavailable"}`}>
  {rows?.length ? <ResponsiveContainer width="100%" height="100%">
    <BarChart data={[...rows]} margin={{ top: 28, right: 32, bottom: 32, left: 12 }}>
      <CartesianGrid vertical={false} stroke={chartPalette.grid} strokeDasharray="3 3" />
      <XAxis dataKey="partition" tick={{ fontSize: 11, fill: chartPalette.text }} tickLine={false}
        height={44} label={{ value: "Final partition", position: "bottom", fontSize: 12, fill: chartPalette.text }} />
      <YAxis allowDecimals={false} width={108} tick={{ fontSize: 11, fill: chartPalette.text }} tickLine={false}
        label={{ value: "Executions", angle: -90, position: "insideLeft", fontSize: 11, fill: chartPalette.text }} />
      <Tooltip formatter={(value: number) => [formatInteger(value), "Executions"]} />
      <Bar dataKey="frequency" fill={chartPalette.primary} radius={[2, 2, 0, 0]} isAnimationActive={false} />
    </BarChart>
  </ResponsiveContainer> : <Unavailable reason="verified final-partition frequencies are not supplied." />}
</div>;

export const AriChart = ({ runs, axisLabel, minimum, unavailable }: {
  runs?: InitializationEvidence["modalPartitionAri"]; axisLabel: "Random seed" | "Execution"; minimum: number; unavailable?: string;
}) => <div className={`sop3-chart${runs?.length ? "" : " is-unavailable"}`}>
  {runs?.length ? <ResponsiveContainer width="100%" height="100%">
    <LineChart data={[...runs]} margin={{ top: 28, right: 32, bottom: 32, left: 12 }}>
      <CartesianGrid stroke={chartPalette.grid} strokeDasharray="3 3" />
      <XAxis type="number" dataKey="seed" domain={["dataMin", "dataMax"]} allowDecimals={false}
        tick={{ fontSize: 11, fill: chartPalette.text }} tickLine={false} tickMargin={8}
        height={44} minTickGap={24} interval="preserveStartEnd"
        label={{ value: axisLabel, position: "bottom", fontSize: 12, fill: chartPalette.text }} />
      <YAxis domain={[minimum, 1]} width={108} tickFormatter={(value: number) => formatContinuous(value)}
        tick={{ fontSize: 11, fill: chartPalette.text }} tickLine={false} tickMargin={8} minTickGap={16}
        label={{ value: "Adjusted Rand Index (ARI)", angle: -90, position: "insideLeft", offset: 12,
          style: { textAnchor: "middle" }, fontSize: 11, fill: chartPalette.text }} />
      <Tooltip formatter={(value: number) => [formatContinuous(value), "ARI"]} labelFormatter={value => `${axisLabel} ${value}`} />
      <ReferenceLine y={1} stroke={chartPalette.primary} strokeDasharray="4 4"
        label={{ value: `ARI = ${formatContinuous(1)}`, position: "insideTopRight", offset: 12, fontSize: 10, fill: chartPalette.primary }} />
      <Line type="linear" dataKey="adjustedRandIndex" stroke={chartPalette.neutral} strokeWidth={1.5}
        dot={{ r: 3, fill: chartPalette.primary, stroke: "white" }} isAnimationActive={false} />
    </LineChart>
  </ResponsiveContainer> : <Unavailable reason={unavailable ?? "verified modal-partition ARI is not supplied."} />}
</div>;

const metrics: { label: string; value: (evidence?: InitializationEvidence) => string }[] = [
  { label: "Executions", value: e => count(e?.executions) },
  { label: "Pairwise ARI Comparisons", value: e => count(e?.pairwiseComparisons) },
  { label: "Unique Final Partitions", value: e => count(e?.uniqueFinalPartitions) },
  { label: "Modal Partition Frequency", value: modalFrequency },
  { label: "Minimum Pairwise ARI", value: e => continuous(e?.minimumPairwiseAri) },
  { label: "Mean Pairwise ARI", value: e => continuous(e?.meanPairwiseAri) },
  { label: "Maximum Differing Participants", value: e => count(e?.maximumDifferingParticipants) },
  { label: "Distinct Initial Centroid Sets", value: e => count(e?.distinctInitialCentroidSets) }
];

export const InitializationComparison = ({ standard, enhanced, randomUnavailable, dpcUnavailable,
  selectedCenters, centerTable, decisionGraph, simulation = false, standardOnly = false }: {
  standard?: InitializationEvidence; enhanced?: InitializationEvidence;
  randomUnavailable?: string; dpcUnavailable?: string;
  selectedCenters: number; centerTable: ReactNode; decisionGraph?: ReactNode; simulation?: boolean; standardOnly?: boolean;
}) => {
  const minimum = Math.max(-1, Math.min(0.85, ...[...(standard?.modalPartitionAri ?? []), ...(standardOnly ? [] : enhanced?.modalPartitionAri ?? [])].map(row => row.adjustedRandIndex - 0.02)));
  const methods = (render: (evidence: InitializationEvidence | undefined, isEnhanced: boolean) => ReactNode) =>
    <SopComparison standardOnly={standardOnly} simulation={simulation} standard={render(standard, false)} enhanced={render(enhanced, true)} />;
  const card = (title: string, isEnhanced: boolean, children: ReactNode) => <MethodCard simulation={simulation} enhanced={isEnhanced} title={title}>{children}</MethodCard>;
  return <div className="sop3-comparison">
    {!simulation && <p className="section-subtitle mb-4">{sopText.sop3.description}</p>}
    <section className="sop3-section" aria-label="Final Partition Frequency Across Executions">
      <h3 className="card-title mb-3">Final Partition Frequency Across Executions</h3>
      {methods((evidence, isEnhanced) => card("Final Partition Frequency", isEnhanced, <PartitionFrequencyChart rows={evidence?.partitionFrequencies} />))}
    </section>
    <section className="sop3-section" aria-label="ARI by Execution">
      <h3 className="card-title mb-3">ARI by Execution</h3>
      {methods((evidence, isEnhanced) => card(isEnhanced ? "ARI by DPC Execution" : "ARI by Random Seed", isEnhanced,
        <AriChart runs={evidence?.modalPartitionAri} axisLabel={isEnhanced ? "Execution" : "Random seed"} minimum={minimum}
          unavailable={isEnhanced ? dpcUnavailable : randomUnavailable} />))}
      <p className="sop3-note text-xs text-muted">ARI = 1 indicates identical participant groupings, regardless of cluster labels. Each run is compared with its method's modal partition.</p>
    </section>
    <section className="sop3-section" aria-label="Initialization & Reproducibility Summary">
      <h3 className="card-title mb-3">Initialization &amp; Reproducibility Summary</h3>
      {methods((evidence, isEnhanced) => card(isEnhanced ? "Deterministic DPC Initialization" : "Random Initialization", isEnhanced,
        <dl className="sop3-summary">{metrics.slice(2, 5).map(metric => {
          const value = metric.value(evidence);
          return <div key={metric.label}><dt>{metric.label}</dt><dd className={value === "Unavailable" ? "sop3-unavailable" : undefined}>{value}</dd></div>;
        })}</dl>))}
    </section>
    <details className="sop3-metrics sop3-disclosure">
      <summary>Reproducibility Metrics</summary>
      <div className="overflow-x-auto" role="region" aria-label="Reproducibility metrics table" tabIndex={0}>
        <table className="research-table research-row-dividers sop-table"><thead><tr><th scope="col">Metric</th><th scope="col">Standard K-Means</th>{!standardOnly && <th scope="col">Enhanced K-Means</th>}</tr></thead>
          <tbody>{metrics.map(metric => <tr key={metric.label}><th scope="row">{metric.label}</th><td>{metric.value(standard)}</td>{!standardOnly && <td>{metric.value(enhanced)}</td>}</tr>)}</tbody>
        </table>
      </div>
    </details>
    {!standardOnly && <section className="sop-evidence">
      <h3 className="card-title mb-3">DPC Initialization Evidence</h3>
      <p className="mb-3 text-xs">Selected centers: {formatInteger(selectedCenters)}</p>
      {centerTable}
      <p className="mt-3 text-xs text-muted">Initial centroids are selected using local density and separation from higher-density observations.</p>
      <details className="sop3-disclosure"><summary>DPC Center-Selection Details</summary>{decisionGraph ?? <p className="mt-3 text-sm text-muted" role="status">Unavailable — the decision graph and calculation details are not supplied by this data source.</p>}</details>
    </section>}
  </div>;
};
