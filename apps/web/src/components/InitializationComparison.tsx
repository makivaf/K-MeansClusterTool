import { formatNumber } from "../utils/formatNumber";
import { formatContinuous, formatInteger } from "../utils/numberFormatting";
import type { ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { MethodCard, SopComparison } from "./SopComparison";
import { chartPalette } from "./charts/chartPalette";
import { sopText } from "../utils/sopText";

type AriObservation = { seed: number; adjustedRandIndex: number };

// Presentation inputs only. Callers must supply validated evidence for their own
// method and cohort; reference-seed ARI and legacy DPC checks are not modal ARI.
export type InitializationEvidence = {
  executions?: number;
  partitionFrequencies?: readonly { partition: string; frequency: number }[];
  modalPartitionAri?: readonly AriObservation[];
  pairwiseComparisons?: number;
  uniqueFinalPartitions?: number;
  modalPartitionFrequency?: number;
  minimumPairwiseAri?: number;
  meanPairwiseAri?: number;
  maximumDifferingParticipants?: number;
  distinctInitialCentroidSets?: number;
};

const count = (value?: number) => value === undefined ? "Unavailable" : formatInteger(value);
const continuous = (value?: number) => value === undefined ? "Unavailable" : formatNumber(value, "ari");
const modalFrequency = (evidence?: InitializationEvidence) => evidence?.modalPartitionFrequency === undefined || evidence.executions === undefined
  ? "Unavailable" : `${formatInteger(evidence.modalPartitionFrequency)} / ${formatInteger(evidence.executions)}`;
const Unavailable = ({ reason }: { reason: string }) => <p className="sop3-chart-unavailable text-sm text-muted" role="status">Unavailable — {reason}</p>;

export const PartitionFrequencyChart = ({ rows }: { rows?: InitializationEvidence["partitionFrequencies"] }) => <div className={`sop3-chart${rows?.length ? "" : " is-unavailable"}`}>
  {rows?.length ? <ResponsiveContainer width="100%" height="100%">
    <BarChart data={[...rows]} margin={{ top: 28, right: 32, bottom: 32, left: 12 }}>
      <CartesianGrid vertical={false} stroke={chartPalette.grid} strokeDasharray="3 3" />
      <XAxis dataKey="partition" tick={{ fontSize: "var(--research-caption-size)", fill: chartPalette.text }} tickLine={false}
        height={44} label={{ value: "Final partition", position: "bottom", fontSize: "var(--research-caption-size)", fill: chartPalette.text }} />
      <YAxis allowDecimals={false} width={108} tick={{ fontSize: "var(--research-caption-size)", fill: chartPalette.text }} tickLine={false}
        label={{ value: "Executions", angle: -90, position: "insideLeft", fontSize: "var(--research-caption-size)", fill: chartPalette.text }} />
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
        tick={{ fontSize: "var(--research-caption-size)", fill: chartPalette.text }} tickLine={false} tickMargin={8}
        height={44} minTickGap={24} interval="preserveStartEnd"
        label={{ value: axisLabel, position: "bottom", fontSize: "var(--research-caption-size)", fill: chartPalette.text }} />
      <YAxis domain={[minimum, 1]} width={88} tickFormatter={(value: number) => formatNumber(value, "axis")}
        tick={{ fontSize: "var(--research-caption-size)", fill: chartPalette.text }} tickLine={false} tickMargin={8} minTickGap={16}
        label={{ value: "Adjusted Rand Index (ARI)", angle: -90, position: "insideLeft", offset: 12,
          style: { textAnchor: "middle" }, fontSize: "var(--research-caption-size)", fill: chartPalette.text }} />
      <Tooltip formatter={(value: number) => [formatNumber(value, "ari"), "ARI"]} labelFormatter={value => `${axisLabel} ${value}`} />
      <ReferenceLine y={1} stroke={chartPalette.primary} strokeDasharray="4 4" />
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

export const InitializationComparison = ({ standard, enhanced, randomRuns, dpcRuns, controlledRuns, randomUnavailable, dpcUnavailable,
  selectedCenters, centerTable, decisionGraph, simulation = false, standardOnly = false, enhancedOnly = false, controlled = false, baseline,
  standardAvailable = !enhancedOnly, enhancedAvailable = !standardOnly, standardState = "Not run yet", enhancedState = "Not run yet" }: {
  standardAvailable?: boolean; enhancedAvailable?: boolean; standardState?: string; enhancedState?: string;
  controlled?: boolean; baseline?: InitializationEvidence;
  standard?: InitializationEvidence; enhanced?: InitializationEvidence;
  // Designated-reference observations populate only the additional disclosure.
  randomRuns?: readonly AriObservation[]; dpcRuns?: readonly AriObservation[];
  randomUnavailable?: string; dpcUnavailable?: string;
  controlledRuns?: readonly AriObservation[];
  selectedCenters: number; centerTable: ReactNode; decisionGraph?: ReactNode; simulation?: boolean; standardOnly?: boolean; enhancedOnly?: boolean;
}) => {
  const minimum = Math.max(-1, Math.min(0.85, ...[...(enhancedOnly ? [] : standard?.modalPartitionAri ?? []), ...(standardOnly ? [] : enhanced?.modalPartitionAri ?? [])].map(row => row.adjustedRandIndex - 0.02)));
  const methods = (render: (evidence: InitializationEvidence | undefined, isEnhanced: boolean) => ReactNode) =>
    <SopComparison simulation={simulation}
      standard={standardAvailable ? render(standard, false) : <MethodCard title="Standard K-Means"><p role="status">{standardState}</p></MethodCard>}
      enhanced={enhancedAvailable ? render(enhanced, true) : <MethodCard title="Enhanced K-Means" enhanced><p role="status">{enhancedState}</p></MethodCard>} />;
  const card = (title: string, isEnhanced: boolean, children: ReactNode) => <MethodCard simulation={simulation} enhanced={isEnhanced} title={title}
    methodLabel={controlled ? isEnhanced ? "PCA-DPC" : "PCA-random" : undefined}>{children}</MethodCard>;
  return <div className="sop3-comparison">
    {!simulation && <p className="section-subtitle mb-4">{sopText.sop3.description}</p>}
    {controlled && <p className="sop3-note text-xs text-muted">Controlled initialization comparison: PCA-random (30 seeds) and PCA-DPC (three repetitions) use the same retained-PC matrix and NbClust k. Modal ties select the earliest execution.</p>}
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
        <dl className="sop3-summary">{metrics.slice(2, 6).map(metric => {
          const value = metric.value(evidence);
          return <div key={metric.label}><dt>{metric.label}</dt><dd className={value === "Unavailable" ? "sop3-unavailable" : undefined}>{value}</dd></div>;
        })}</dl>))}
    </section>
    <details className="sop3-metrics sop3-disclosure">
      <summary>Reproducibility Metrics</summary>
      <p className="sop3-note text-xs text-muted">Pairwise ARI compares every execution pair. Maximum differing participants uses optimal one-to-one cluster-label alignment.</p>
      <div className="overflow-x-auto" role="region" aria-label="Reproducibility metrics table" tabIndex={0}>
        <table className="research-table research-row-dividers sop-table"><thead><tr><th scope="col">Metric</th>{!enhancedOnly && <th scope="col">{controlled ? "PCA-random" : "Standard K-Means"}</th>}{!standardOnly && <th scope="col">{controlled ? "PCA-DPC" : "Enhanced K-Means"}</th>}</tr></thead>
          <tbody>{metrics.map(metric => <tr key={metric.label}><th scope="row">{metric.label}</th>{!enhancedOnly && <td>{metric.value(standard)}</td>}{!standardOnly && <td>{metric.value(enhanced)}</td>}</tr>)}</tbody>
        </table>
      </div>
    </details>
    {controlled && baseline && <details className="sop3-disclosure"><summary>Original Standard 15D baseline reproducibility</summary>
      <p className="sop3-note text-xs text-muted">Separate baseline: 30 random seeds in 15 standardized features. Its modal partition and seed-0 reference are distinct definitions.</p>
      <dl className="sop3-summary">{metrics.map(metric => <div key={metric.label}><dt>{metric.label}</dt><dd>{metric.value(baseline)}</dd></div>)}</dl>
      <PartitionFrequencyChart rows={baseline.partitionFrequencies} />
      <AriChart runs={baseline.modalPartitionAri} axisLabel="Random seed" minimum={minimum} />
    </details>}
    {((!enhancedOnly && !!randomRuns?.length) || (!standardOnly && !!dpcRuns?.length) || (!standardOnly && !enhancedOnly && !!controlledRuns?.length)) && <details className="sop3-reference sop3-disclosure">
      <summary>Additional Reference-Partition Agreement Evidence</summary>
      <p className="sop3-note text-xs text-muted">The primary charts describe within-method reproducibility using modal-partition ARI and partition frequencies. This additional evidence measures agreement with the designated reference partition; reference-equivalent match counts are not modal-partition frequencies.</p>
      {methods((_evidence, isEnhanced) => {
        const runs = isEnhanced ? dpcRuns : randomRuns;
        if (!runs?.length) return null;
        return <MethodCard simulation={simulation} enhanced={isEnhanced} title={isEnhanced ? "Agreement with DPC Run 1" : "Agreement with Standard Seed 0"}>
          <strong className={isEnhanced ? "sop3-headline text-teal-800" : "sop3-headline"}>{runs.filter(row => row.adjustedRandIndex === 1).length} / {runs.length}</strong>
          <p className="sop3-description text-xs text-muted">{isEnhanced ? "repeated DPC runs" : "random starts"} reproduced the reference-equivalent partition</p>
          <p className="sop3-note text-xs text-muted">{isEnhanced ? "Enhanced reference: DPC run 1." : "Standard reference: original-feature seed 0, including its self-match."} ARI = 1 indicates equivalent participant-level cluster assignments, independent of cluster labels.</p>
          {!isEnhanced && runs.length > 1 && <p className="sop3-note text-xs text-muted">Excluding seed 0 self-match: {runs.filter(row => row.seed !== 0 && row.adjustedRandIndex === 1).length} / {runs.length - 1}.</p>}
          <AriChart runs={runs} axisLabel={isEnhanced ? "Execution" : "Random seed"}
            minimum={Math.max(-1, Math.min(0.85, ...[...(!enhancedOnly ? randomRuns ?? [] : []), ...(!standardOnly ? dpcRuns ?? [] : [])].map(row => row.adjustedRandIndex - 0.02)))} />
        </MethodCard>;
      })}
      {!standardOnly && !enhancedOnly && !!controlledRuns?.length && <section className="sop-support-card">
        <h3 className="card-title mb-3">Controlled PCA-Random Agreement with DPC Run 1</h3>
        <p className="sop3-note text-xs text-muted">{controlledRuns.filter(row => row.adjustedRandIndex === 1).length} / {controlledRuns.length} PCA random runs match DPC run 1. This uses a different reference from Standard's original-feature seed-0 ARI.</p>
        <p className="sop3-note text-xs text-muted">Controlled SOP 3 uses the same PCA matrix and NbClust k for random starts and DPC.</p>
        <AriChart runs={controlledRuns} axisLabel="Random seed" minimum={Math.max(-1, Math.min(0.85, ...controlledRuns.map(row => row.adjustedRandIndex - 0.02)))} />
        <div className="overflow-x-auto" role="region" aria-label="Controlled reference-partition ARI" tabIndex={0}>
          <table className="research-table research-row-dividers sop-table"><thead><tr><th scope="col">Random seed</th><th scope="col">ARI versus DPC</th></tr></thead><tbody>{controlledRuns.map(row => <tr key={row.seed}><th scope="row">{row.seed}</th><td>{formatNumber(row.adjustedRandIndex, "ari")}</td></tr>)}</tbody></table>
        </div>
      </section>}
      {!standardOnly && !!dpcRuns?.length && <p className="sop3-note text-xs text-muted">DPC repetition agreement describes observed reproducibility under fixed conditions; it does not establish superior clustering quality.</p>}
    </details>}
    {!standardOnly && <section className="sop-evidence">
      <h3 className="card-title mb-3">DPC Initialization Evidence</h3>
      <p className="mb-3 text-xs">Selected centers: {formatInteger(selectedCenters)}</p>
      {centerTable}
      <p className="mt-3 text-xs text-muted">Initial centroids are selected using local density and separation from higher-density observations.</p>
      <details className="sop3-disclosure"><summary>DPC Center-Selection Details</summary>{decisionGraph ?? <p className="mt-3 text-sm text-muted" role="status">Unavailable — the decision graph and calculation details are not supplied by this data source.</p>}</details>
    </section>}
  </div>;
};
