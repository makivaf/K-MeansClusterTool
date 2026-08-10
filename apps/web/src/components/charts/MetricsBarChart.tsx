import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ClusteringRun } from "../../../../../packages/shared/src";
import { getConditions, metricLabels } from "../../utils/metrics";

type MetricsBarChartProps = {
  run: ClusteringRun;
};

export const MetricsBarChart = ({ run }: MetricsBarChartProps) => {
  const { baseline, enhanced } = getConditions(run);
  const data = Object.entries(metricLabels).map(([metric, label]) => ({
    metric: label,
    baseline: baseline.metrics[metric as keyof typeof baseline.metrics],
    enhanced: enhanced.metrics[metric as keyof typeof enhanced.metrics]
  }));

  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="#dbe4e4" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="metric" tickLine={false} axisLine={false} />
          <YAxis tickLine={false} axisLine={false} />
          <Tooltip />
          <Legend />
          <Bar dataKey="baseline" name={baseline.algorithm_label} fill="#0f7977" radius={[4, 4, 0, 0]} />
          <Bar dataKey="enhanced" name={enhanced.algorithm_label} fill="#d88a00" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};
