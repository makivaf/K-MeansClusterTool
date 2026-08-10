import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ScreePoint } from "../../../../../packages/shared/src";

type PcaScreeChartProps = {
  data: ScreePoint[];
};

export const PcaScreeChart = ({ data }: PcaScreeChartProps) => {
  const chartData = data.map((point) => ({
    component: `PC${point.component}`,
    individual: Number((point.individual_variance * 100).toFixed(1)),
    cumulative: Number((point.cumulative_variance * 100).toFixed(1))
  }));

  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 8, right: 20, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#dbe4e4" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="component" tickLine={false} axisLine={false} />
          <YAxis yAxisId="left" tickLine={false} axisLine={false} label={{ value: "Individual variance (%)", angle: -90, position: "insideLeft" }} />
          <YAxis yAxisId="right" orientation="right" tickLine={false} axisLine={false} domain={[0, 100]} />
          <Tooltip />
          <Legend />
          <Bar yAxisId="left" dataKey="individual" name="Individual variance" fill="#8ecdc7" radius={[3, 3, 0, 0]} />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="cumulative"
            name="Cumulative variance"
            stroke="#0f7977"
            strokeWidth={2.5}
            dot={{ r: 3 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};
