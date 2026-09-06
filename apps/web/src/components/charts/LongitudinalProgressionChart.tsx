import { useMemo } from "react";
import { CartesianGrid, Legend, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import type { UnifiedResearchRun } from "../../../../../packages/shared/src";
import { chartPalette } from "./chartPalette";

type TimePoint = UnifiedResearchRun["longitudinal"]["timeSeries"][number];
type ChartPoint = TimePoint & { elapsedYear: number };
type LongitudinalProgressionChartProps = { defense?: boolean; data: UnifiedResearchRun["longitudinal"]["timeSeries"] };

const SupportTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: ChartPoint }> }) => {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="rounded-sm border border-line bg-white p-3 text-xs shadow-sm">
      <div className="font-semibold">Cluster {point.clusterId}, year {point.yearStart}–{point.yearEnd}</div>
      <dl className="mt-2 space-y-1 text-muted">
        <div><dt className="inline">Mean ADAS-Cog13: </dt><dd className="inline font-semibold text-ink">{point.meanAdas13.toFixed(5)}</dd></div>
        <div><dt className="inline">Participants: </dt><dd className="inline font-semibold text-ink">{point.participantCount.toLocaleString()}</dd></div>
        <div><dt className="inline">Observations: </dt><dd className="inline font-semibold text-ink">{point.observationCount.toLocaleString()}</dd></div>
      </dl>
    </div>
  );
};

export const LongitudinalProgressionChart = ({ data, defense = false }: LongitudinalProgressionChartProps) => {
  const byCluster = useMemo(() => ({
    cluster0: data.filter((point) => point.clusterId === 0).map((point) => ({ ...point, elapsedYear: point.meanElapsedYears })),
    cluster1: data.filter((point) => point.clusterId === 1).map((point) => ({ ...point, elapsedYear: point.meanElapsedYears }))
  }), [data]);

  return (
    <div className="h-80 w-full sm:h-96" role="img" aria-label={defense ? "Observed mean ADAS-Cog13 by elapsed-year bin, following the same study-entry clusters. Points are not connected. Point tooltips show participant and observation counts." : "Descriptive mean ADAS-Cog13 points by elapsed-year bin and original cluster. Points are not connected; participant and observation counts are available in the accompanying support table."}>
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 18, right: 20, left: defense ? 20 : 8, bottom: defense ? 24 : 16 }}>
          <CartesianGrid vertical={false} stroke={chartPalette.grid} />
          <XAxis type="number" dataKey="elapsedYear" domain={[0, "dataMax"]} tickLine={false} axisLine={{ stroke: "#aebcbc" }} tickMargin={8} tick={defense ? { fontSize: 14 } : undefined} label={{ value: "Mean elapsed years within bin", position: "insideBottom", offset: -10, fill: "#657579", fontSize: defense ? 14 : 11 }} />
          <YAxis type="number" dataKey="meanAdas13" tickLine={false} axisLine={{ stroke: "#aebcbc" }} tickMargin={8} tick={defense ? { fontSize: 14 } : undefined} label={{ value: "Mean ADAS-Cog13", angle: -90, position: "insideLeft", fill: "#657579", fontSize: defense ? 14 : 11 }} />
          <Tooltip content={<SupportTooltip />} />
          <Legend verticalAlign="top" align="right" height={38} iconType="circle" iconSize={8} wrapperStyle={{ fontSize: defense ? 14 : 11 }} />
          <Scatter data={byCluster.cluster0} name="Original Cluster 0" fill={chartPalette.primary} isAnimationActive={false} />
          <Scatter data={byCluster.cluster1} name="Original Cluster 1" fill={chartPalette.comparison} shape="diamond" isAnimationActive={false} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
};
