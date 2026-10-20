import { formatNumber } from "../utils/formatNumber";
import type { MethodResult } from "../../../../packages/shared/src/methodExecution";
import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import { projectionTick } from "./charts/PartitionProjection";
import { formatContinuous, formatInteger } from "../utils/numberFormatting";
const displayCoordinate = formatContinuous;
export const MethodDecisionGraph = ({ enhanced }: { enhanced: NonNullable<MethodResult["enhanced"]> }) => enhanced.dpc.decisionGraph ? <figure className="sop-figures">
  <div className="simulation-chart-plot" role="img" aria-label="DPC rho delta decision graph; selected centers highlighted">
    <ResponsiveContainer width="100%" height="100%"><ScatterChart margin={{ top: 12, right: 24, bottom: 16, left: 20 }}>
      <CartesianGrid stroke="var(--research-border)" strokeDasharray="3 3" />
      <XAxis type="number" dataKey="rho" name="rho" allowDecimals={false} tickCount={5} minTickGap={24} tickFormatter={projectionTick} height={50} tickMargin={8}
        tick={{ fontSize: "var(--research-caption-size)", fill: "var(--research-muted)" }} axisLine={{ stroke: "var(--research-border)" }} tickLine={false}
        label={{ value: "rho", position: "insideBottom", offset: 0, fontSize: "var(--research-caption-size)", fill: "var(--research-muted)" }} />
      <YAxis type="number" dataKey="delta" name="delta" tickCount={5} minTickGap={16} tickFormatter={projectionTick} width={64} tickMargin={8}
        tick={{ fontSize: "var(--research-caption-size)", fill: "var(--research-muted)" }} axisLine={{ stroke: "var(--research-border)" }} tickLine={false}
        label={{ value: "delta", angle: -90, position: "left", offset: 12, style: { textAnchor: "middle" }, fontSize: "var(--research-caption-size)", fill: "var(--research-muted)" }} />
      <Tooltip formatter={(value: number, name: string) => [formatNumber(value, name === "rho" ? "rho" : "delta"), name]} cursor={{ strokeDasharray: "3 3" }} />
      <Scatter name="Participants" data={enhanced.dpc.decisionGraph.filter(point => !point.selected)} fill="var(--research-selected-border)" isAnimationActive={false} />
      <Scatter name="DPC centers" data={enhanced.dpc.decisionGraph.filter(point => point.selected)} fill="var(--research-comparison)" shape="diamond" isAnimationActive={false} />
    </ScatterChart></ResponsiveContainer>
  </div>
  <ul className="projection-legend" aria-label="DPC decision graph legend">
    <li><span className="projection-legend-dot" style={{ backgroundColor: "var(--research-selected-border)" }} aria-hidden="true" />Participants</li>
    <li><span className="projection-legend-diamond" style={{ backgroundColor: "var(--research-comparison)" }} aria-hidden="true" />Selected DPC centers</li>
  </ul>
</figure> : <p className="simulation-unavailable">Decision graph unavailable for this historical run.</p>;
