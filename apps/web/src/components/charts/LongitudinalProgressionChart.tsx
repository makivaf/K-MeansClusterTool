import { useMemo } from "react";
import { CartesianGrid, Legend, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import type { UnifiedResearchRun } from "../../../../../packages/shared/src";

type TimePoint = UnifiedResearchRun["longitudinal"]["timeSeries"][number];
type ChartPoint = TimePoint & { elapsedYear: number };
type LongitudinalProgressionChartProps = { data: UnifiedResearchRun["longitudinal"]["timeSeries"] };

const SupportTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: ChartPoint }> }) => {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="rounded-sm border border-line bg-white p-3 text-xs shadow-sm">
      <div className="font-semibold">Cluster {point.clusterId}, year {point.yearStart}–{point.yearEnd}</div>
      <dl className="mt-2 space-y-1 text-muted">
        <div><dt className="inline">Mean ADAS-Cog13: </dt><dd className="inline font-semibold text-ink">{point.meanAdas13.toFixed(2)}</dd></div>
        <div><dt className="inline">Participants: </dt><dd className="inline font-semibold text-ink">{point.participantCount.toLocaleString()}</dd></div>
        <div><dt className="inline">Observations: </dt><dd className="inline font-semibold text-ink">{point.observationCount.toLocaleString()}</dd></div>
      </dl>
    </div>
  );
};

export const LongitudinalProgressionChart = ({ data }: LongitudinalProgressionChartProps) => {
  const byCluster = useMemo(() => ({
    cluster0: data.filter((point) => point.clusterId === 0).map((point) => ({ ...point, elapsedYear: point.meanElapsedYears })),
    cluster1: data.filter((point) => point.clusterId === 1).map((point) => ({ ...point, elapsedYear: point.meanElapsedYears }))
  }), [data]);

  return (
    <div className="h-80 w-full sm:h-96" role="img" aria-label="Descriptive mean ADAS-Cog13 points by elapsed-year bin and original cluster. Points are not connected; participant and observation counts are available in the accompanying support table.">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 18, right: 20, left: 8, bottom: 16 }}>
          <CartesianGrid vertical={false} stroke="#dbe4e4" />
          <XAxis type="number" dataKey="elapsedYear" domain={[0, "dataMax"]} tickLine={false} axisLine={{ stroke: "#aebcbc" }} tickMargin={8} label={{ value: "Mean elapsed years within bin", position: "insideBottom", offset: -10, fill: "#657579", fontSize: 11 }} />
          <YAxis type="number" dataKey="meanAdas13" tickLine={false} axisLine={{ stroke: "#aebcbc" }} tickMargin={8} label={{ value: "Mean ADAS-Cog13", angle: -90, position: "insideLeft", fill: "#657579", fontSize: 11 }} />
          <Tooltip content={<SupportTooltip />} />
          <Legend verticalAlign="top" align="right" height={38} iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
          <Scatter data={byCluster.cluster0} name="Original Cluster 0" fill="#0f7977" isAnimationActive={false} />
          <Scatter data={byCluster.cluster1} name="Original Cluster 1" fill="#d88a00" isAnimationActive={false} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
};
