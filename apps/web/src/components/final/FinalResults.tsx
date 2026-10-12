import type { ReactNode } from "react";
import { CartesianGrid, Legend, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import type { MethodResult } from "../../../../../packages/shared/src/methodExecution";
import { formatNumber } from "../../utils/formatNumber";
import { Panel, T } from "./ui";
import { RangeCards } from "./RangeCards";
export const assignmentCaption = (count?: number, ari?: number) => count === undefined || ari === undefined ? "Not available" : `${formatNumber(count, "count")} participant${count === 1 ? "" : "s"} assigned differently · ARI ${formatNumber(ari, "ari")}`;
export const standardDifferenceCaption = (count?: number) => count === undefined ? "Standard seed 0 difference: Not available." : `Standard seed 0 differs by ${formatNumber(count, "count")} participant${count === 1 ? "" : "s"}.`;
export function integerScatterAxis(values: number[]) {
  const lo = Math.min(0, ...values), hi = Math.max(0, ...values);
  const rough = Math.max(1, (hi - lo) / 6), power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].map(multiplier => multiplier * power).find(value => value >= rough)!;
  const minimum = Math.floor(lo / step) * step, maximum = Math.max(minimum + step, Math.ceil(hi / step) * step);
  return { domain: [minimum, maximum] as [number, number], ticks: Array.from({ length: Math.round((maximum - minimum) / step) + 1 }, (_, i) => minimum + i * step) };
}
export function EnhancedScatter({ result }: { result: MethodResult }) {
  const points = result.common.xy.map(([x, y], i) => ({ x, y, cluster: result.labels[i] }));
  const xAxis = integerScatterAxis(points.map(point => point.x)), yAxis = integerScatterAxis(points.map(point => point.y));
  return <div style={{ height: 360, minWidth: 0 }}><ResponsiveContainer width="100%" height="100%"><ScatterChart margin={{ top: 16, right: 24, bottom: 32, left: 0 }}><CartesianGrid stroke="#E2E8EC" />
    <XAxis type="number" dataKey="x" domain={xAxis.domain} ticks={xAxis.ticks} allowDecimals={false} tickFormatter={value => formatNumber(value, "count")} label={{ value: "PC1", position: "insideBottom", offset: -16 }} />
    <YAxis type="number" dataKey="y" domain={yAxis.domain} ticks={yAxis.ticks} allowDecimals={false} tickFormatter={value => formatNumber(value, "count")} width={54} label={{ value: "PC2", angle: -90, position: "insideLeft" }} />
    <Tooltip formatter={(value: number) => formatNumber(value, "axis")} /><Legend verticalAlign="top" />
    {[0, 1].map(cluster => <Scatter key={cluster} name={`Cluster ${formatNumber(cluster, "count")}`} data={points.filter(point => point.cluster === cluster)} fill={cluster === 0 ? T.c0 : T.c1} fillOpacity={.55} isAnimationActive={false} />)}
    <Scatter name="Final centers" data={result.centroids} shape="cross" fill={T.teal} legendType="none" isAnimationActive={false} />
  </ScatterChart></ResponsiveContainer></div>;
}
function Distribution({ sizes, n, label }: { sizes: number[]; n: number; label: string }) {
  return <div><h4>{label}</h4><div className="final-distribution" role="img" aria-label={`${label} cluster distribution`}>{sizes.map((size, cluster) => <span key={cluster} title={`Cluster ${formatNumber(cluster, "count")}: ${formatNumber(size, "count")} participants`} style={{ width: `${100 * size / n}%`, background: cluster === 0 ? T.c0 : T.c1 }}>{formatNumber(100 * size / n, "percentage")}</span>)}</div>
    {sizes.map((size, cluster) => <span className="final-chip" key={cluster}>Cluster {formatNumber(cluster, "count")}: {formatNumber(size, "count")}</span>)}</div>;
}
export function FinalResults({ standard, enhanced, comparison, longitudinal }: { standard: MethodResult; enhanced: MethodResult; comparison?: MethodResult; longitudinal?: ReactNode }) {
  const s = standard.standard!, e = enhanced.enhanced!;
  const stability = comparison?.initializationEvidence ?? { ...standard.initializationEvidence, ...enhanced.initializationEvidence };
  const standardPercent = stability.standard?.modalPartitionPercent, enhancedPercent = stability.enhanced?.modalPartitionPercent;
  const difference = standardPercent !== undefined && enhancedPercent !== undefined ? enhancedPercent - standardPercent : undefined;
  const cross = comparison?.commonSpace?.crossMethod.find(row => row.seed === 0);
  return <div className="final-stack"><section aria-labelledby="output-reliability"><h3 id="output-reliability">Output reliability</h3><div className="final-stats">
    <div className="final-stat"><strong>{formatNumber(enhancedPercent, "percentage", "Not available")}</strong><span>Enhanced runs reaching modal partition</span></div>
    <div className="final-stat"><strong>{formatNumber(difference, "axis2", "Not available")}</strong><span>Percentage-point difference versus Standard</span></div>
    <div className="final-stat"><strong>{formatNumber(standard.common.retainedVariables.length, "count")} vs {formatNumber(enhanced.common.pca.pcaComponents, "count")}</strong><span>Clustering dimensions · {formatNumber(enhanced.common.pca.cumulativeExplainedVariance * 100, "percentage")} variance retained</span></div>
  </div></section><Panel title="Standard vs Enhanced"><table><thead><tr><th>Measure</th><th>Standard</th><th>Enhanced</th></tr></thead><tbody>
    <tr><th>Runs reaching modal partition</th><td>{formatNumber(standardPercent, "percentage", "Not available")}</td><td>{formatNumber(enhancedPercent, "percentage", "Not available")}</td></tr>
    <tr><th>Distinct final partitions</th><td>{formatNumber(stability.standard?.uniqueFinalPartitions, "count", "Not available")}</td><td>{formatNumber(stability.enhanced?.uniqueFinalPartitions, "count", "Not available")}</td></tr>
    <tr><th>Maximum differing participants</th><td>{formatNumber(stability.standard?.maximumDifferingParticipants, "count", "Not available")}</td><td>{formatNumber(stability.enhanced?.maximumDifferingParticipants, "count", "Not available")}</td></tr>
    <tr><th>Selected k</th><td>{formatNumber(s.selectedK, "count")}</td><td>{formatNumber(e.selectedK, "count")}</td></tr>
  </tbody></table></Panel>
  <Panel title="Clustering quality: comparable"><RangeCards comparison={comparison} /></Panel>
  <Panel title="Cluster distribution"><div className="final-grid"><Distribution label="Standard (seed 0)" sizes={s.runs[0].clusterSizes} n={standard.common.participantCount} /><Distribution label="Enhanced" sizes={e.clusterSizes} n={enhanced.common.participantCount} /></div><p>{assignmentCaption(cross?.disagreementCount, cross?.ari)}</p></Panel>
  {longitudinal ?? <Panel title="Longitudinal observed means"><p>Not available</p></Panel>}
  <details><summary>Show cluster visualization</summary><Panel title="What the two clusters look like" kind="enhanced"><EnhancedScatter result={enhanced} /><p className="final-caption">{standardDifferenceCaption(cross?.disagreementCount)}</p></Panel></details>
  </div>;
}
