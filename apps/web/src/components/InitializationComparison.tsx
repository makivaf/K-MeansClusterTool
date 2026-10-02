import { formatContinuous } from "../utils/numberFormatting";
import type { ReactNode } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { MethodCard, SopComparison } from "./SopComparison";
import { chartPalette } from "./charts/chartPalette";

type AriObservation = { seed: number; adjustedRandIndex: number };

const AriChart = ({ runs, axisLabel, minimum, unavailable }: {
  runs?: readonly AriObservation[]; axisLabel: "Random seed" | "Run"; minimum: number; unavailable?: string;
}) => <div className="sop3-chart">
  {runs?.length ? <ResponsiveContainer width="100%" height="100%">
    <LineChart data={[...runs]} margin={{ top: 16, right: 20, bottom: 30, left: 0 }}>
      <CartesianGrid stroke={chartPalette.grid} strokeDasharray="3 3" />
      <XAxis type="number" dataKey="seed" domain={["dataMin", "dataMax"]} allowDecimals={false}
        tick={{ fontSize: 11, fill: chartPalette.text }} tickLine={false}
        label={{ value: axisLabel, position: "bottom", fontSize: 12, fill: chartPalette.text }} />
      <YAxis domain={[minimum, 1]} width={52} tickFormatter={(value: number) => formatContinuous(value)}
        tick={{ fontSize: 11, fill: chartPalette.text }} tickLine={false}
        label={{ value: "ARI", angle: -90, position: "insideLeft", fontSize: 11, fill: chartPalette.text }} />
      <Tooltip formatter={(value: number) => [formatContinuous(value), "ARI"]} labelFormatter={value => `${axisLabel} ${value}`} />
      <ReferenceLine y={1} stroke={chartPalette.primary} strokeDasharray="4 4"
        label={{ value: `ARI = ${formatContinuous(1)}`, position: "insideBottomRight", fontSize: 10, fill: chartPalette.primary }} />
      <Line type="linear" dataKey="adjustedRandIndex" stroke={chartPalette.neutral} strokeWidth={1.5}
        dot={{ r: 3, fill: chartPalette.primary, stroke: "white" }} isAnimationActive={false} />
    </LineChart>
  </ResponsiveContainer> : <p className="sop3-chart-unavailable text-sm text-muted" role="status">{unavailable ?? "Per-run ARI values are unavailable in this result."}</p>}
</div>;

// Only participant-level ARI observations may populate the counts and lines.
// Aggregate metric agreement and determinism flags are not ARI observations.
export const InitializationComparison = ({ randomRuns, dpcRuns, randomUnavailable, dpcUnavailable,
  selectedCenters, centerTable, decisionGraph, simulation = false }: {
  randomRuns?: readonly AriObservation[]; dpcRuns?: readonly AriObservation[];
  randomUnavailable?: string; dpcUnavailable?: string;
  selectedCenters: number; centerTable: ReactNode; decisionGraph?: ReactNode; simulation?: boolean;
}) => {
  const minimum = Math.max(-1, Math.min(0.85, ...[...(randomRuns ?? []), ...(dpcRuns ?? [])].map(row => row.adjustedRandIndex - 0.02)));
  const card = (enhanced: boolean, runs?: readonly AriObservation[], unavailable?: string) => <MethodCard
    simulation={simulation} enhanced={enhanced} title={enhanced ? "DPC Initialization" : "Random Initialization"}>
    <strong className={`sop3-headline ${enhanced ? "text-teal-800" : ""}`}>
      {runs?.length ? `${runs.filter(row => row.adjustedRandIndex === 1).length} / ${runs.length}` : "Unavailable"}
    </strong>
    <p className="sop3-description text-xs text-muted">{runs?.length
      ? `${enhanced ? "repeated DPC runs" : "random starts"} reproduced the reference-equivalent partition`
      : "Participant-level reproducibility has no supplied ARI series."}</p>
    <h4 className="sop3-chart-title text-sm font-semibold">{enhanced ? "ARI by Repeated DPC Run" : "ARI by Random Seed"}</h4>
    <AriChart runs={runs} axisLabel={enhanced ? "Run" : "Random seed"} minimum={minimum} unavailable={unavailable} />
  </MethodCard>;
  return <div className="sop3-comparison">
    <p className="section-subtitle mb-4">How initial cluster centers are selected and how consistently the solution can be reproduced.</p>
    <SopComparison simulation={simulation} standard={card(false, randomRuns, randomUnavailable)} enhanced={card(true, dpcRuns, dpcUnavailable)} />
    <p className="sop3-note text-xs text-muted">ARI = 1 indicates equivalent participant-level cluster assignments, independent of cluster labels.</p>
    <section className="sop-evidence">
      <h3 className="card-title mb-3">DPC Initialization Evidence</h3>
      <p className="mb-3 text-xs">Selected centers: {selectedCenters}</p>
      {centerTable}
      {decisionGraph && <details><summary>DPC Center-Selection Details</summary>{decisionGraph}</details>}
    </section>
  </div>;
};
