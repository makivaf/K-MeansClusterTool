import { formatContinuous, formatPercent } from "../utils/numberFormatting";
import "./SopFigures.css";
import { ChevronDown } from "lucide-react";
import { nbclustIndexReference } from "../utils/nbclustIndexReference";
import { Bar, BarChart, LabelList, CartesianGrid, Cell, Line, LineChart, ReferenceLine, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Props as LabelProps } from "recharts/types/component/Label";
const percent = (value: number) => formatPercent(100 * value);
const axisNumber = (value: number) => formatContinuous(value);

const pcaAxisLabel = ({ viewBox }: LabelProps) => {
  if (!viewBox || !("x" in viewBox) || !("y" in viewBox) || !("width" in viewBox) || !("height" in viewBox)) return null;
  const { x = 0, y = 0, width = 0, height = 0 } = viewBox;
  return <text x={x + width / 2} y={y + height} textAnchor="middle" fontSize={12} fill="var(--research-muted)"
    textLength={width < 190 ? Math.max(1, width) : undefined} lengthAdjust="spacingAndGlyphs">Number of Principal Components</text>;
};

// Reuse the page's existing charts with the same result bindings.
export const PcaChart = ({ enhanced, showAllComponents = false }: { showAllComponents?: boolean; enhanced: { pcaComponents: number; cumulativeExplainedVariance: number; pcaVariance: { component: number; cumulativeExplainedVariance: number }[] } }) => (
  <div className="pca-variance-chart">
    <h3 className="card-title simulation-compact-title">Cumulative Explained Variance (%)</h3>
    <p className="pca-retention-annotation"><strong>{enhanced.pcaComponents} PCs retained</strong><span>{percent(enhanced.cumulativeExplainedVariance)}</span></p>
    <div className="simulation-chart-plot pca-variance-chart-plot" role="img" aria-label={`${enhanced.pcaComponents} PCs retained with ${percent(enhanced.cumulativeExplainedVariance)} cumulative explained variance`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={enhanced.pcaVariance.filter(row => showAllComponents || row.component <= enhanced.pcaComponents)} margin={{ top: 28, right: 28, bottom: 24, left: 36 }}>
          <CartesianGrid stroke="#e3edef" strokeDasharray="3 3" />
          <XAxis dataKey="component" tickFormatter={value => `PC${value}`} interval="preserveStartEnd" minTickGap={16} tickLine={false} axisLine={false} height={56} tickMargin={10}
            label={{ content: pcaAxisLabel }} />
          <YAxis domain={[0, 1]} ticks={[0, 0.2, 0.4, 0.6, 0.8, 1]} tickFormatter={value => `${Math.round(value * 100)}%`} width={56} tickMargin={8} tickLine={false} axisLine={false}
            label={{ value: "Explained Variance (%)", angle: -90, position: "left", offset: 20, style: { textAnchor: "middle" }, fontSize: 12, fill: "var(--research-muted)" }} />
          <ReferenceLine y={0.85} stroke="#e49b35" strokeDasharray="5 4" />
          <ReferenceLine x={enhanced.pcaComponents} stroke="var(--simulation-teal)" strokeDasharray="5 4" />
          <ReferenceDot x={enhanced.pcaComponents} y={enhanced.cumulativeExplainedVariance} r={5} fill="var(--simulation-teal)" stroke="white" />
          <Tooltip formatter={(value: number) => [percent(value), "Cumulative Explained Variance (%)"]} labelFormatter={value => `PC${value}`} />
          <Line type="linear" dataKey="cumulativeExplainedVariance" name="Cumulative Explained Variance (%)" stroke="var(--simulation-teal)" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
    <p className="pca-threshold-annotation"><span aria-hidden="true" />85% Variance Retention Threshold</p>
  </div>
);
export const NbClustChart = ({ selectedK, votes, usableIndices, supportingIndices }: { selectedK: number; votes: { k: number; count?: number }[]; usableIndices: number; supportingIndices?: number }) => {
  return (<div><h3 className="card-title simulation-compact-title">NbClust Votes</h3>
          <div className="simulation-chart-plot" role="img" aria-label={`NbClust selected k=${selectedK}, supported by ${supportingIndices ?? "unavailable"} of ${usableIndices} indices`}>
            <ResponsiveContainer width="100%" height="100%"><BarChart data={votes} margin={{ top: 16, right: 16, bottom: 8, left: 0 }}>
              <CartesianGrid vertical={false} stroke="#e3edef" strokeDasharray="3 3" /><XAxis dataKey="k" tickFormatter={value => `k=${value}`} interval={0} tickLine={false} axisLine={false} /><YAxis allowDecimals={false} width={30} tickLine={false} axisLine={false} />
              <Tooltip formatter={(value: number) => [value, "Votes"]} labelFormatter={value => `k=${value}`} /><Bar dataKey="count" radius={[2, 2, 0, 0]} isAnimationActive={false}>{votes.map(vote => <Cell key={vote.k} fill={vote.k === selectedK ? "var(--simulation-teal)" : "#c7d9dc"} />)}<LabelList dataKey="count" position="top" fontSize={11} fill="var(--research-muted)" /></Bar>
            </BarChart></ResponsiveContainer>
          </div>
        </div>);
};
export const SilhouetteChart = ({ candidates }: { candidates: { k: number; silhouette: number }[] }) => <div className="simulation-chart-plot" role="img" aria-label="Silhouette by candidate k"><ResponsiveContainer width="100%" height="100%"><LineChart data={candidates}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="k" /><YAxis tickFormatter={axisNumber} width={56} /><Tooltip formatter={(value: number) => formatContinuous(value)} /><Line dataKey="silhouette" stroke="var(--simulation-teal)" isAnimationActive={false} /></LineChart></ResponsiveContainer></div>;

export const NbClustIndexDetails = ({ indices }: {
  indices: readonly { index: string; status: string; recommendedK?: number | null }[];
}) => (<details className="nbclust-index-details">
  <summary><span className="nbclust-show">View NbClust Index Details</span><span className="nbclust-hide">Hide NbClust Index Details</span><ChevronDown size={14} aria-hidden="true" /></summary>
  <div className="simulation-table-container"><table className="simulation-comparison-table">
    <thead><tr><th>Index</th><th>What it assesses</th><th>Favorable / selection rule</th><th>Suggested k</th></tr></thead>
    <tbody>{indices.map(row => {
      const reference = nbclustIndexReference[row.index.toLowerCase().replace(/[^a-z0-9]/g, "")];
      return <tr key={row.index}><th scope="row">{row.index}</th><td>{reference?.[0] ?? "Reference unavailable"}</td><td>{reference?.[1] ?? "Reference unavailable"}</td><td>{row.recommendedK ?? <span className="text-muted" title={row.status}>Unavailable</span>}</td></tr>;
    })}</tbody>
  </table>{indices.length === 0 && <p className="simulation-compact-note">Per-index results are unavailable for this run.</p>}</div>
</details>);
