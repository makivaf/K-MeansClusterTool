import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { IndexVote } from "../../../../../packages/shared/src";

type NbClustVotesChartProps = {
  data: IndexVote[];
  selectedK: number;
};

export const NbClustVotesChart = ({ data, selectedK }: NbClustVotesChartProps) => (
  <div className="h-72">
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="#dbe4e4" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="optimal_k" tickLine={false} axisLine={false} label={{ value: "Optimal k", position: "insideBottom", offset: -2 }} />
        <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip />
        <Bar dataKey="votes" name="Index votes" radius={[4, 4, 0, 0]}>
          {data.map((entry) => (
            <Cell key={entry.optimal_k} fill={entry.optimal_k === selectedK ? "#0f7977" : "#b7cfcc"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  </div>
);
