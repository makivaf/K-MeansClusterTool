import { Bar, BarChart, CartesianGrid, Cell, LabelList, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { MethodResult } from "../../../../../packages/shared/src/methodExecution";
import type { z } from "zod";
import type { PartitionEvidenceSchema } from "../../../../../packages/shared/src/partitionEvidence";
import { formatNumber } from "../../utils/formatNumber";
import { nbclustIndexReference } from "../../utils/nbclustIndexReference";
import { DpcCenterTable } from "../DpcCenterTable";
import { Heatmap, shortVariableName } from "./Heatmap";
import { Panel, T } from "./ui";
import { NativeMetricTable } from "./RangeCards";
import { CalculationDetails } from "./CalculationDetails";
type Evidence = z.infer<typeof PartitionEvidenceSchema>;
type Props = { standard?: MethodResult; enhanced?: MethodResult; comparison?: MethodResult; onlyMethod?: "standard" | "enhanced"; comparisonView: boolean; standardState: string; enhancedState: string };
export const Placeholder = ({ method, state }: { method: "standard" | "enhanced"; state: string }) => <Panel title={method === "standard" ? "Standard K-Means" : "Enhanced K-Means"} kind={method} expand={false}><p role="status">{state}</p></Panel>;
const axis = (v: number) => formatNumber(v, "count");
const metric = (v: number) => formatNumber(v, "metric");
const pc = (v: number) => `PC${formatNumber(v, "count")}`;
const ticks = Array.from({ length: 9 }, (_, i) => i + 2);
const VoteTick = ({ x = 0, y = 0, payload }: { x?: number; y?: number; payload?: { value: number } }) => <text x={x} y={y + 12} textAnchor="middle" fontSize={10} fill={T.slate}><tspan x={x}>k =</tspan><tspan x={x} dy={12}>{formatNumber(payload?.value, "count")}</tspan></text>;

export const topLoadingRows = (values: number[][], column: number) => new Set(values.map((row, i) => ({ i, magnitude: Math.abs(row[column]) })).sort((a, b) => b.magnitude - a.magnitude || a.i - b.i).slice(0, 3).map(row => row.i));
export function Sop1({ standard, enhanced, comparison, comparisonView, onlyMethod, standardState, enhancedState }: Props) {
  const pca = enhanced?.common.pca;
  const completeEigenvalues = pca?.pcaVariance.length === enhanced?.common.retainedVariables.length && pca?.pcaVariance.every(row => row.eigenvalue !== undefined && Number.isFinite(row.eigenvalue));
  const totalVariance = completeEigenvalues ? pca!.pcaVariance.reduce((sum, row) => sum + row.eigenvalue!, 0) : undefined;
  const n = enhanced?.common.participantCount, dimensions = enhanced?.common.retainedVariables.length;
  const sampleCovarianceVerified = totalVariance !== undefined && n !== undefined && dimensions !== undefined && n > 1 && Math.abs(totalVariance - dimensions * n / (n - 1)) <= 1e-9;
  return <div className="final-stack"><div className={onlyMethod ? "final-stack" : "final-grid"}>
    {onlyMethod !== "enhanced" && (standard ? <Panel title="Correlation heatmap" kind="standard"><Heatmap matrix={standard.common.correlation} labels={standard.common.retainedVariables} /></Panel> : <Placeholder method="standard" state={standardState} />)}
    {onlyMethod !== "standard" && (enhanced && pca ? <Panel title="Principal Component Analysis" kind="enhanced"><div style={{ height: 280 }}><ResponsiveContainer width="100%" height="100%"><LineChart data={pca.pcaVariance} margin={{ top: 24, right: 24, bottom: 24, left: 0 }}><CartesianGrid stroke="#E2E8EC" />
      <XAxis dataKey="component" tickFormatter={pc} interval={0} tick={{ fontSize: 10 }} /><YAxis domain={[0, 1]} tickFormatter={v => formatNumber(v * 100, "axisPercentage")} width={64} />
      <Tooltip labelFormatter={v => pc(Number(v))} formatter={(v: number) => formatNumber(v * 100, "percentage")} /><ReferenceLine x={pca.pcaComponents} stroke={T.teal} strokeDasharray="4 4" /><ReferenceLine y={.85} stroke={T.slate} strokeDasharray="4 4" />
      <Line dataKey="cumulativeExplainedVariance" stroke={T.teal} isAnimationActive={false} /></LineChart></ResponsiveContainer></div>
      <span className="final-chip">{formatNumber(pca.pcaComponents, "count")} PCs retained</span><span className="final-chip">{formatNumber(pca.cumulativeExplainedVariance * 100, "percentage")} variance retained</span>
      <h4>Eigenvalues</h4><table aria-label="PCA eigenvalues"><thead><tr><th>Component</th><th>Eigenvalue (λ)</th><th>Explained variance (%)</th><th>Cumulative (%)</th></tr></thead><tbody>{pca.pcaVariance.map(row => <tr key={row.component} style={row.component <= pca.pcaComponents ? { background: "#F0FDFA" } : undefined}><th>{pc(row.component)}{row.component <= pca.pcaComponents && <span className="final-chip">Retained</span>}</th><td>{formatNumber(row.eigenvalue, "eigenvalue", "Not available")}</td><td>{formatNumber(row.explainedVarianceRatio * 100, "percentage")}</td><td>{formatNumber(row.cumulativeExplainedVariance * 100, "percentage")}</td></tr>)}<tr style={{ fontWeight: 700 }}><th>Total variance (sum of all {formatNumber(pca.pcaVariance.length, "count")} eigenvalues)</th><td>{formatNumber(totalVariance, "eigenvalue", "Not available")}</td><td>{formatNumber(pca.pcaVariance.reduce((sum, row) => sum + row.explainedVarianceRatio, 0) * 100, "percentage")}</td><td /></tr></tbody></table>
      {sampleCovarianceVerified && <p className="final-caption">Explained variance = eigenvalue ÷ total variance. Total variance is {formatNumber(dimensions, "count")} × {formatNumber(n, "count")} ÷ {formatNumber(n! - 1, "count")} because PCA uses the sample covariance (divides by N − 1).</p>}
      <details><summary>Show PC composition (loadings)</summary><p className="final-caption">In each PC column, the 3 variables with the largest absolute loadings are bold.</p><div className="final-preview"><table><thead><tr><th>Variable</th>{pca.pcaLoadings.components.slice(0, pca.pcaComponents).map(c => <th key={c}>{c}</th>)}</tr></thead><tbody>{pca.pcaLoadings.variables.map((variable, i) => <tr key={variable}><th>{shortVariableName(variable)}</th>{pca.pcaLoadings.values[i].slice(0, pca.pcaComponents).map((v, j) => <td key={j}>{topLoadingRows(pca.pcaLoadings.values, j).has(i) ? <b>{formatNumber(v, "loading", "Not available")}</b> : formatNumber(v, "loading", "Not available")}</td>)}</tr>)}</tbody></table></div></details>
    </Panel> : <Placeholder method="enhanced" state={enhancedState} />)}
  </div>{comparisonView && <div><Panel title="PCA contribution"><NativeMetricTable before={standard?.standard?.metrics} after={comparison?.pcaContribution?.enhanced} dimensions={standard?.common.retainedVariables.length} components={enhanced?.common.pca.pcaComponents} pca /><CalculationDetails before={standard?.calculation} after={comparison?.calculation} beforeLabel={"Standard (" + formatNumber(standard?.common.retainedVariables.length, "count") + " variables)"} afterLabel={"PCA + random (" + formatNumber(enhanced?.common.pca.pcaComponents, "count") + " PCs)"} silhouetteOnly /></Panel></div>}</div>;
}

export function Sop2({ standard, enhanced, onlyMethod, standardState, enhancedState }: Props) {
  const s = standard?.standard, e = enhanced?.enhanced;
  const votes = ticks.map(k => ({ k, count: e?.nbclust.votes.find(row => row.k === k)?.count ?? (e?.nbclust.indices.length ? e.nbclust.indices.filter(row => row.recommendedK === k).length : undefined) }));
  return <div className="final-stack"><div className={onlyMethod ? "final-stack" : "final-grid"}>
    {onlyMethod !== "enhanced" && (s ? <Panel title="Silhouette by k" kind="standard">{s.silhouetteByK?.length ? <div style={{ height: 280 }}><ResponsiveContainer width="100%" height="100%"><LineChart data={s.silhouetteByK} margin={{ top: 24, right: 24, bottom: 24, left: 0 }}><CartesianGrid stroke="#E2E8EC" /><XAxis type="number" dataKey="k" domain={[2, 10]} ticks={ticks} tickFormatter={axis} /><YAxis tickFormatter={v => formatNumber(v, "axis")} width={68} /><Tooltip labelFormatter={v => `k = ${formatNumber(Number(v), "count")}`} formatter={metric} /><ReferenceLine x={s.selectedK} stroke={T.slate} strokeDasharray="4 4" /><Line dataKey="silhouette" stroke={T.slate} isAnimationActive={false} /></LineChart></ResponsiveContainer></div> : <p>Not available</p>}
      <span className="final-chip">Selected k = {formatNumber(s.selectedK, "count")}</span><span className="final-chip">Maximum Silhouette</span></Panel> : <Placeholder method="standard" state={standardState} />)}
    {onlyMethod !== "standard" && (e ? <Panel title="NbClust votes" kind="enhanced"><div style={{ height: 300, minWidth: 0 }}><ResponsiveContainer width="100%" height="100%"><BarChart data={votes} margin={{ top: 48, right: 12, bottom: 12, left: 0 }}><CartesianGrid vertical={false} stroke="#E2E8EC" /><XAxis dataKey="k" type="category" interval={0} tick={<VoteTick />} height={42} padding={{ left: 4, right: 4 }} /><YAxis domain={[0, 10]} ticks={[0, 3, 6, 9]} allowDataOverflow allowDecimals={false} tickFormatter={axis} width={36} /><Tooltip labelFormatter={v => `k = ${formatNumber(Number(v), "count")}`} formatter={v => formatNumber(Number(v), "count", "Not available")} /><Bar dataKey="count" maxBarSize={32} isAnimationActive={false}>{votes.map(row => <Cell key={row.k} fill={row.k === e.selectedK ? T.teal : "#CBD5DC"} />)}<LabelList dataKey="count" position="top" offset={10} fontSize={12} formatter={(value: number) => formatNumber(value, "count", "Not available")} /></Bar></BarChart></ResponsiveContainer></div>
      <span className="final-chip">Selected k = {formatNumber(e.selectedK, "count")}</span><span className="final-chip">{formatNumber(e.nbclust.indices.filter(row => row.recommendedK != null).length, "count")} voting indices</span><span className="final-chip">{formatNumber(e.nbclust.indices.filter(row => row.recommendedK == null && ["hubert", "dindex"].includes(row.index.toLowerCase())).length, "count")} graphical</span>
      <details><summary>Show votes by index</summary>{ticks.map(k => { const rows = e.nbclust.indices.filter(row => row.recommendedK === k); return rows.length ? <div key={k}><strong>k = {formatNumber(k, "count")}</strong> {rows.map(row => <span className="final-chip" key={row.index}>{row.index}</span>)}</div> : null; })}
      {e.nbclust.indices.filter(row => row.recommendedK == null).map(row => <span className="final-chip" key={row.index}>{row.index}: {row.status === "unavailable" ? "Graphical / no vote" : row.status}</span>)}</details>
    </Panel> : <Placeholder method="enhanced" state={enhancedState} />)}
  </div>{e && <Panel title="Index reference"><details><summary>Index reference</summary><table><thead><tr><th>Index</th><th>What it assesses</th><th>Selection rule</th><th>Voted k</th></tr></thead><tbody>{e.nbclust.indices.map(row => { const info = nbclustIndexReference[row.index.toLowerCase()]; return <tr key={row.index}><th>{row.index}</th><td>{info?.[0] ?? "Not available"}</td><td>{info?.[1] ?? "Not available"}</td><td>{row.recommendedK == null ? "No vote" : formatNumber(row.recommendedK, "count")}</td></tr>; })}</tbody></table></details></Panel>}</div>;
}

export function AriCalculation({ calculation }: { calculation?: Evidence["ariCalculation"] }) {
  if (!calculation) return <details><summary>Show ARI calculation</summary><p>Not available — ARI calculation evidence is not supplied for this prepared dataset.</p></details>;
  const c = calculation, t = c.terms;
  const f = (value: number) => formatNumber(value, "calculation");
  const n = (value: number) => formatNumber(value, "count");
  const pair = c.pair.kind === "seed" ? "Seed" : "Run";
  const columns = c.n_ij[0][0] + c.n_ij[1][1] >= c.n_ij[0][1] + c.n_ij[1][0] ? [0, 1] : [1, 0];
  const changed = c.N - columns.reduce((sum, j, i) => sum + c.n_ij[i][j], 0);
  const terms = [
    ["Pairs grouped together in both runs (S)", n(t.sumCellChoose2)],
    ["Agreement expected by chance (E)", f(t.expectedIndex)],
    ["Maximum possible agreement (M)", f(t.maxIndex)],
    ["ARI = (S − E) / (M − E)", f(c.ariRecalculated)]
  ];
  return <details><summary>Show ARI calculation</summary>
    <h4>How the agreement score is computed: {pair} {n(c.pair.first)} vs {pair} {n(c.pair.second)}</h4>
    <table aria-label="ARI contingency counts"><thead><tr><th>n_ij</th>{columns.map(j => <th key={j}>{pair} {n(c.pair.second)} · Cluster {n(j)}</th>)}<th>Row totals</th></tr></thead>
      <tbody>{c.n_ij.map((row, i) => <tr key={i}><th>{pair} {n(c.pair.first)} · Cluster {n(i)}</th>{columns.map((j, position) => <td key={j} data-off-diagonal={i !== position || undefined} style={i !== position ? { background: "#FFF7ED", color: "#9A3412", fontWeight: 600 } : undefined}>{n(row[j])}</td>)}<td>{n(c.a_i[i])}</td></tr>)}
        <tr><th>Column totals</th>{columns.map(j => <td key={j}>{n(c.b_j[j])}</td>)}<td>{n(c.N)}</td></tr></tbody></table>
    <p>{n(changed)} participants changed groups</p>
    <table aria-label="ARI calculation terms"><thead><tr><th>Term</th><th>Value</th></tr></thead><tbody>{terms.map(([label, value]) => <tr key={label}><th>{label}</th><td>{value}</td></tr>)}</tbody></table>
    <p style={{ fontSize: 28, fontWeight: 700 }}>ARI = {f(c.ariRecalculated)}</p>
    {c.match && <span className="final-chip">Verified against scikit-learn</span>}
  </details>;
}

export function Reproducibility({ evidence, enhanced = false }: { evidence?: Evidence; enhanced?: boolean }) {
  const complete = evidence?.executions === 30 && evidence.partitionMembership?.length === 30 && evidence.pairwiseAriMatrix?.length === 30;
  if (!complete) return <p role="status">Not available — 30-run partition evidence is not supplied for this prepared dataset.</p>;
  const order = evidence.partitionMembership!.map((_, i) => i).sort((a, b) => evidence.partitionMembership![a].localeCompare(evidence.partitionMembership![b]) || a - b);
  const labels = evidence.modalPartitionAri.map(row => `${enhanced ? "Run" : "Seed"} ${formatNumber(row.seed, "count")}`);
  const aCount = evidence.partitionMembership!.filter(p => p === "A").length;
  const bCount = evidence.partitionMembership!.filter(p => p === "B").length;
  let identical = 0, pairs = 0;
  evidence.pairwiseAriMatrix!.forEach((row, i) => row.forEach((value, j) => { if (j > i) { pairs++; if (value === 1) identical++; } }));
  const pairPercent = pairs ? identical / pairs * 100 : undefined;
  const percentage = (value?: number) => formatNumber(value, "percentage1", "Not available").replace(/\.0%$/, "%");
  const groups = [...new Set(evidence.partitionMembership!)].sort().map(partition => ({ partition, count: evidence.partitionMembership!.filter(p => p === partition).length }));
  const barCaption = enhanced && groups.length === 1 ? `${formatNumber(evidence.uniqueFinalPartitions, "count")} partition: ${formatNumber(evidence.executions, "count")} runs` : groups.map(group => `Partition ${group.partition}: ${formatNumber(group.count, "count")} runs`).join(" | ");
  return <><div role="img" aria-label={barCaption} style={{ display: "flex", width: "100%", height: 34, borderRadius: 6, overflow: "hidden", margin: "16px 0 6px" }}>
    {groups.map(group => <span key={group.partition} title={`Partition ${group.partition}: ${formatNumber(group.count, "count")} runs`} style={{ width: `${group.count / evidence.executions * 100}%`, background: enhanced ? T.teal : group.partition === "A" ? T.slate : "white", border: !enhanced && group.partition !== "A" ? `2px solid ${T.c1}` : undefined, boxSizing: "border-box" }} />)}
    </div><p className="final-caption" style={{ marginBottom: 16 }}>{barCaption}</p>
    <div className="final-stats"><div className="final-stat"><strong>{percentage(evidence.modalPartitionPercent)}</strong><span>{formatNumber(evidence.modalPartitionFrequency, "count")} of {formatNumber(evidence.executions, "count")} runs</span><span>Runs reaching modal partition</span></div><div className="final-stat"><strong>{formatNumber(evidence.uniqueFinalPartitions, "count")}</strong><span>Distinct partitions</span></div><div className="final-stat"><strong>{formatNumber(evidence.maximumDifferingParticipants, "count")}</strong><span>Maximum differing participants</span></div></div>
    <p className="final-caption" style={{ margin: "16px 0" }}>Pairwise ARI over {formatNumber(evidence.pairwiseComparisons, "count")} run pairs: minimum {formatNumber(evidence.minimumPairwiseAri, "ari")}, mean {formatNumber(evidence.meanPairwiseAri, "ari")} · identical pairs {formatNumber(identical, "count")} ({percentage(pairPercent)})</p>
    <Heatmap matrix={evidence.pairwiseAriMatrix!} labels={labels} ari order={order} />
    <p className="final-caption">{enhanced ? `All ${formatNumber(evidence.pairwiseComparisons, "count")} pairs agree at ARI = ${formatNumber(evidence.minimumPairwiseAri, "count")}.` : `All pairs agree at ARI ≥ ${formatNumber(evidence.minimumPairwiseAri, "ari")}; the two blocks are two partitions differing by ${formatNumber(evidence.maximumDifferingParticipants, "count")} participants.`}</p>
    <AriCalculation calculation={evidence.ariCalculation} />
  </>;
}
export function Sop3({ standard, enhanced, comparison, comparisonView, onlyMethod, standardState, enhancedState }: Props) {
  const e = enhanced?.enhanced;
  return <div className="final-stack"><div className={onlyMethod ? "final-stack" : "final-grid"}>
    {onlyMethod !== "enhanced" && (standard ? <Panel title="Random initialization" kind="standard"><Reproducibility evidence={standard.initializationEvidence?.standard} /></Panel> : <Placeholder method="standard" state={standardState} />)}
    {onlyMethod !== "standard" && (enhanced ? <Panel title="DPC initialization" kind="enhanced"><Reproducibility enhanced evidence={enhanced.initializationEvidence?.enhanced} /></Panel> : <Placeholder method="enhanced" state={enhancedState} />)}
  </div>{e && <Panel title="DPC centers" kind="enhanced"><DpcCenterTable centers={e.dpc.centers.map((row, i) => ({ ...row, center: i + 1 }))} /></Panel>}</div>;
}
