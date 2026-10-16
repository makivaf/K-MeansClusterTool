import { formatNumber } from "../../utils/formatNumber";
import { formatContinuous, formatInteger } from "../../utils/numberFormatting";
import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import "./PartitionProjection.css";

const palette = ["var(--research-primary)", "var(--research-comparison)", "var(--research-cluster-3)", "var(--research-cluster-4)", "var(--research-cluster-5)", "var(--research-cluster-6)", "var(--research-cluster-7)", "var(--research-cluster-8)", "var(--research-cluster-9)", "var(--research-cluster-10)"];
export const projectionTick = (value: number) => formatNumber(value, "axisTick2");
type Point = { x: number; y: number; cluster: number };
// Display bounds only; supplied scientific coordinates remain unchanged.
export const projectionDomain = (values: readonly number[]): [number, number] => {
  if (!values.length) return [-1, 1];
  const minimum = values.reduce((a, b) => Math.min(a, b), Infinity);
  const maximum = values.reduce((a, b) => Math.max(a, b), -Infinity);
  const padding = (maximum - minimum) * 0.05 || Math.abs(minimum) * 0.05 || 1;
  return [minimum - padding, maximum + padding];
};
/** Presentation only. All coordinates, labels and projected means come from the caller. */
export const PartitionProjection = ({ points, centers, label }: { points: Point[]; centers: Point[]; label: string }) => {
  const xs = points.map(point => point.x), ys = points.map(point => point.y);
  const clusters = [...new Set(points.map(point => point.cluster))].sort((a, b) => a - b);
  return <figure className="partition-projection-figure">
    <div className="partition-projection simulation-chart-plot" role="img" aria-label={`${label}: ${formatInteger(points.length)} assignments on common PC1-PC2 coordinates; diamonds are projected cluster means`}>
    <ResponsiveContainer width="100%" height="100%"><ScatterChart margin={{ top: 12, right: 24, bottom: 16, left: 20 }}>
      <CartesianGrid stroke="var(--research-border)" strokeDasharray="3 3" />
      <XAxis type="number" dataKey="x" name="PC1" minTickGap={24} tickCount={5} interval="preserveStartEnd" height={50} tickMargin={8} tickFormatter={projectionTick} domain={projectionDomain(xs)}
        tick={{ fontSize: "var(--research-caption-size)", fill: "var(--research-muted)" }} axisLine={{ stroke: "var(--research-border)" }} tickLine={false}
        label={{ value: "PC1", position: "insideBottom", offset: 0, fontSize: "var(--research-caption-size)", fill: "var(--research-muted)" }} />
      <YAxis type="number" dataKey="y" name="PC2" tickCount={5} minTickGap={16} tickMargin={8} tickFormatter={projectionTick} width={64} domain={projectionDomain(ys)}
        tick={{ fontSize: "var(--research-caption-size)", fill: "var(--research-muted)" }} axisLine={{ stroke: "var(--research-border)" }} tickLine={false}
        label={{ value: "PC2", angle: -90, position: "left", offset: 12, style: { textAnchor: "middle" }, fontSize: "var(--research-caption-size)", fill: "var(--research-muted)" }} />
      <ZAxis range={points.length > 1000 ? [16, 16] : [26, 26]} />
      <ZAxis zAxisId={1} range={[80, 80]} />
      <Tooltip formatter={(value: number, name: string) => [formatNumber(value, "calculation"), name]} />
      {clusters.map(cluster => <Scatter key={cluster} name={`Cluster ${cluster}`} data={points.filter(point => point.cluster === cluster)} fill={palette[cluster % palette.length]} fillOpacity={points.length > 1000 ? .5 : .7} isAnimationActive={false} />)}
      <Scatter name="Projected cluster means" data={centers} zAxisId={1} fill="var(--research-ink)" shape="diamond" isAnimationActive={false} />
    </ScatterChart></ResponsiveContainer>
    </div>
    <ul className="projection-legend" aria-label={`${label} cluster legend`}>
      {clusters.map(cluster => <li key={cluster}><span className="projection-legend-dot" style={{ backgroundColor: palette[cluster % palette.length] }} aria-hidden="true" />Cluster {cluster}</li>)}
      {centers.length > 0 && <li><span className="projection-legend-diamond" aria-hidden="true" />Projected cluster means</li>}
    </ul>
  </figure>;
};
