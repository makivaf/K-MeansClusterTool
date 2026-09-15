import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { UnifiedResearchRun } from "../../../../../packages/shared/src";
import { chartPalette } from "./chartPalette";

type TimePoint = UnifiedResearchRun["longitudinal"]["timeSeries"][number];
type Bin = { label: string; start: number; cluster0?: number; cluster1?: number; support0?: TimePoint; support1?: TimePoint };
const SupportTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: Bin }> }) => {
  const bin = payload?.[0]?.payload;
  if (!active || !bin) return null;
  return <div className="rounded-sm border border-line bg-white p-3 text-xs">
    <strong>Years {bin.label}</strong>
    {[bin.support0, bin.support1].map((point) => point ? <div key={point.clusterId} className="mt-2">
      <p>Cluster {point.clusterId}: {point.meanAdas13.toFixed(3)} mean ADAS-Cog13</p>
      <p>{point.participantCount.toLocaleString()} participants · {point.observationCount.toLocaleString()} observations</p>
      <p>Mean elapsed years: {point.meanElapsedYears.toFixed(2)}</p>
    </div> : null)}
  </div>;
};

export const LongitudinalProgressionChart = ({ data }: { defense?: boolean; data: TimePoint[] }) => {
  const bins = useMemo(() => {
    const result = new Map<string, Bin>();
    for (const point of data) {
      const label = `${point.yearStart}–${point.yearEnd}`;
      const bin = result.get(label) ?? { label, start: point.yearStart };
      if (point.clusterId === 0) { bin.cluster0 = point.meanAdas13; bin.support0 = point; }
      else { bin.cluster1 = point.meanAdas13; bin.support1 = point; }
      result.set(label, bin);
    }
    return [...result.values()].sort((a, b) => a.start - b.start);
  }, [data]);
  return <div className="overflow-x-auto"><div className="h-80 min-w-[560px] w-full" role="img" aria-label="Observed mean ADAS-Cog13 by elapsed-year bin. Cluster 0: lower impairment; Cluster 1: higher impairment.">
    <ResponsiveContainer>
      <BarChart data={bins} margin={{ top: 15, right: 15, left: 15, bottom: 25 }}>
        <CartesianGrid vertical={false} stroke={chartPalette.grid} />
        <XAxis dataKey="label" label={{ value: "Elapsed years (bin)", position: "bottom" }} />
        <YAxis label={{ value: "Mean ADAS-Cog13", angle: -90, position: "insideLeft" }} />
        <Tooltip content={<SupportTooltip />} />
        <Legend verticalAlign="top" height={40} />
        <Bar dataKey="cluster0" name="Cluster 0 · lower impairment" fill={chartPalette.primary} isAnimationActive={false} />
        <Bar dataKey="cluster1" name="Cluster 1 · higher impairment" fill={chartPalette.comparison} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  </div></div>;
};
