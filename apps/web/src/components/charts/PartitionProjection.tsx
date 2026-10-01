import { formatContinuous, formatInteger } from "../../utils/numberFormatting";
import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import "./PartitionProjection.css";

const palette = ["#087f8c", "#e49b35", "#7866b0", "#d76673", "#559a54", "#3675b5", "#a27850", "#aa57a1", "#718333", "#607785"];
const axisNumber = (value: number) => formatContinuous(value);
type Point = { x: number; y: number; cluster: number };
/** Presentation only. All coordinates, labels and projected means come from the caller. */
export const PartitionProjection = ({ points, centers, label }: { points: Point[]; centers: Point[]; label: string }) => {
  const xs = points.map(point => point.x), ys = points.map(point => point.y);
  const clusters = [...new Set(points.map(point => point.cluster))].sort((a, b) => a - b);
  return <div className="partition-projection simulation-chart-plot" role="img" aria-label={`${label}: ${formatInteger(points.length)} assignments on common PC1-PC2 coordinates; diamonds are projected cluster means`}>
    <ResponsiveContainer width="100%" height="100%"><ScatterChart>
      <CartesianGrid strokeDasharray="3 3" />
      <XAxis type="number" dataKey="x" name="PC1" minTickGap={24} tickFormatter={axisNumber} domain={[Math.min(...xs), Math.max(...xs)]} />
      <YAxis type="number" dataKey="y" name="PC2" tickFormatter={axisNumber} width={70} domain={[Math.min(...ys), Math.max(...ys)]} />
      <Tooltip formatter={(value: number, name: string) => [formatContinuous(value), name]} />
      {clusters.map(cluster => <Scatter key={cluster} name={`Cluster ${cluster}`} data={points.filter(point => point.cluster === cluster)} fill={palette[cluster % palette.length]} fillOpacity={.55} isAnimationActive={false} />)}
      <Scatter name="Projected centroids" data={centers} fill="#142d38" shape="diamond" isAnimationActive={false} />
    </ScatterChart></ResponsiveContainer>
  </div>;
};
