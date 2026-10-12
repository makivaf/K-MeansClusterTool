import { Bar, BarChart, CartesianGrid, Cell, LabelList, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { MethodResult } from "../../../../../packages/shared/src/methodExecution";
import type { z } from "zod";
import type { PartitionEvidenceSchema } from "../../../../../packages/shared/src/partitionEvidence";
import { formatNumber } from "../../utils/formatNumber";
import { nbclustIndexReference } from "../../utils/nbclustIndexReference";
import { DpcCenterTable } from "../DpcCenterTable";
import { MethodDecisionGraph } from "../MethodDecisionGraph";
import { Heatmap, shortVariableName } from "./Heatmap";
import { Panel, T } from "./ui";
import { RangeCards } from "./RangeCards";
type Evidence = z.infer<typeof PartitionEvidenceSchema>;
type Props = { standard?: MethodResult; enhanced?: MethodResult; comparison?: MethodResult; comparisonView: boolean; standardState: string; enhancedState: string };
export const Placeholder = ({ method, state }: { method: "standard" | "enhanced"; state: string }) => <Panel title={method === "standard" ? "Standard K-Means" : "Enhanced K-Means"} kind={method} expand={false}><p role="status">{state}</p></Panel>;
const axis = (v: number) => formatNumber(v, "count");
const metric = (v: number) => formatNumber(v, "metric");
const pc = (v: number) => `PC${formatNumber(v, "count")}`;
const ticks = Array.from({ length: 9 }, (_, i) => i + 2);
const VoteTick = ({ x = 0, y = 0, payload }: { x?: number; y?: number; payload?: { value: number } }) => <text x={x} y={y + 12} textAnchor="middle" fontSize={10} fill={T.slate}><tspan x={x}>k =</tspan><tspan x={x} dy={12}>{formatNumber(payload?.value, "count")}</tspan></text>;

export const topLoadingRows = (values: number[][], column: number) => new Set(values.map((row, i) => ({ i, magnitude: Math.abs(row[column]) })).sort((a, b) => b.magnitude - a.magnitude || a.i - b.i).slice(0, 3).map(row => row.i));
export function Sop1({ standard, enhanced, comparison, comparisonView, standardState, enhancedState }: Props) {
  const pca = enhanced?.common.pca;
  return <div className="final-stack"><div className="final-grid">
    {standard ? <Panel title="Correlation heatmap" kind="standard"><Heatmap matrix={standard.common.correlation} labels={standard.common.retainedVariables} /></Panel> : <Placeholder method="standard" state={standardState} />}
    {enhanced && pca ? <Panel title="Principal Component Analysis" kind="enhanced"><div style={{ height: 280 }}><ResponsiveContainer width="100%" height="100%"><LineChart data={pca.pcaVariance} margin={{ top: 24, right: 24, bottom: 24, left: 0 }}><CartesianGrid stroke="#E2E8EC" />
      <XAxis dataKey="component" tickFormatter={pc} interval={0} tick={{ fontSize: 10 }} /><YAxis domain={[0, 1]} tickFormatter={v => formatNumber(v * 100, "percentage")} width={64} />
      <Tooltip labelFormatter={v => pc(Number(v))} formatter={(v: number) => formatNumber(v * 100, "percentage")} /><ReferenceLine x={pca.pcaComponents} stroke={T.teal} strokeDasharray="4 4" /><ReferenceLine y={.85} stroke={T.slate} strokeDasharray="4 4" />
      <Line dataKey="cumulativeExplainedVariance" stroke={T.teal} isAnimationActive={false} /></LineChart></ResponsiveContainer></div>
      <span className="final-chip">{formatNumber(pca.pcaComponents, "count")} PCs retained</span><span className="final-chip">{formatNumber(pca.cumulativeExplainedVariance * 100, "percentage")} variance retained</span>
      <table><thead><tr><th>PC</th><th>Eigenvalue</th><th>Cumulative variance</th></tr></thead><tbody>{pca.pcaVariance.filter(row => row.component <= pca.pcaComponents).map(row => <tr key={row.component}><th>{pc(row.component)}</th><td>{formatNumber(row.eigenvalue, "eigenvalue", "Not available")}</td><td>{formatNumber(row.cumulativeExplainedVariance * 100, "percentage")}</td></tr>)}</tbody></table>
      <details><summary>Show PC composition (loadings)</summary><p className="final-caption">Bold: 3 largest absolute loadings per PC</p><div className="final-preview"><table><thead><tr><th>Variable</th>{pca.pcaLoadings.components.slice(0, pca.pcaComponents).map(c => <th key={c}>{c}</th>)}</tr></thead><tbody>{pca.pcaLoadings.variables.map((variable, i) => <tr key={variable}><th>{shortVariableName(variable)}</th>{pca.pcaLoadings.values[i].slice(0, pca.pcaComponents).map((v, j) => <td key={j}>{topLoadingRows(pca.pcaLoadings.values, j).has(i) ? <b>{formatNumber(v, "loading", "Not available")}</b> : formatNumber(v, "loading", "Not available")}</td>)}</tr>)}</tbody></table></div></details>
    </Panel> : <Placeholder method="enhanced" state={enhancedState} />}
  </div><div hidden={!comparisonView}><Panel title="PCA contribution"><RangeCards comparison={comparison} experiment="sop1" /></Panel></div></div>;
}

export function Sop2({ standard, enhanced, standardState, enhancedState }: Props) {
  const s = standard?.standard, e = enhanced?.enhanced;
  const votes = ticks.map(k => ({ k, count: e?.nbclust.votes.find(row => row.k === k)?.count ?? (e?.nbclust.indices.length ? e.nbclust.indices.filter(row => row.recommendedK === k).length : undefined) }));
  return <div className="final-stack"><div className="final-grid">
    {s ? <Panel title="Silhouette by k" kind="standard">{s.silhouetteByK?.length ? <div style={{ height: 280 }}><ResponsiveContainer width="100%" height="100%"><LineChart data={s.silhouetteByK} margin={{ top: 24, right: 24, bottom: 24, left: 0 }}><CartesianGrid stroke="#E2E8EC" /><XAxis type="number" dataKey="k" domain={[2, 10]} ticks={ticks} tickFormatter={axis} /><YAxis tickFormatter={metric} width={68} /><Tooltip labelFormatter={v => `k = ${formatNumber(Number(v), "count")}`} formatter={metric} /><ReferenceLine x={s.selectedK} stroke={T.slate} strokeDasharray="4 4" /><Line dataKey="silhouette" stroke={T.slate} isAnimationActive={false} /></LineChart></ResponsiveContainer></div> : <p>Not available</p>}
      <span className="final-chip">Selected k = {formatNumber(s.selectedK, "count")}</span><span className="final-chip">Maximum Silhouette</span></Panel> : <Placeholder method="standard" state={standardState} />}
    {e ? <Panel title="NbClust votes" kind="enhanced"><div style={{ height: 300, minWidth: 0 }}><ResponsiveContainer width="100%" height="100%"><BarChart data={votes} margin={{ top: 48, right: 12, bottom: 12, left: 0 }}><CartesianGrid vertical={false} stroke="#E2E8EC" /><XAxis dataKey="k" type="category" interval={0} tick={<VoteTick />} height={42} padding={{ left: 4, right: 4 }} /><YAxis domain={[0, 10]} ticks={[0, 3, 6, 9]} allowDataOverflow allowDecimals={false} tickFormatter={axis} width={36} /><Tooltip labelFormatter={v => `k = ${formatNumber(Number(v), "count")}`} formatter={v => formatNumber(Number(v), "count", "Not available")} /><Bar dataKey="count" maxBarSize={32} isAnimationActive={false}>{votes.map(row => <Cell key={row.k} fill={row.k === e.selectedK ? T.teal : "#CBD5DC"} />)}<LabelList dataKey="count" position="top" offset={10} fontSize={12} formatter={(value: number) => formatNumber(value, "count", "Not available")} /></Bar></BarChart></ResponsiveContainer></div>
      <span className="final-chip">Selected k = {formatNumber(e.selectedK, "count")}</span><span className="final-chip">{formatNumber(e.nbclust.indices.filter(row => row.recommendedK != null).length, "count")} voting indices</span><span className="final-chip">{formatNumber(e.nbclust.indices.filter(row => row.recommendedK == null && ["hubert", "dindex"].includes(row.index.toLowerCase())).length, "count")} graphical</span>
      <details><summary>Show votes by index</summary>{ticks.map(k => { const rows = e.nbclust.indices.filter(row => row.recommendedK === k); return rows.length ? <div key={k}><strong>k = {formatNumber(k, "count")}</strong> {rows.map(row => <span className="final-chip" key={row.index}>{row.index}</span>)}</div> : null; })}
      {e.nbclust.indices.filter(row => row.recommendedK == null).map(row => <span className="final-chip" key={row.index}>{row.index}: {row.status === "unavailable" ? "Graphical / no vote" : row.status}</span>)}</details>
    </Panel> : <Placeholder method="enhanced" state={enhancedState} />}
  </div>{e && <Panel title="Index reference"><details><summary>Index reference</summary><table><thead><tr><th>Index</th><th>What it assesses</th><th>Selection rule</th><th>Voted k</th></tr></thead><tbody>{e.nbclust.indices.map(row => { const info = nbclustIndexReference[row.index.toLowerCase()]; return <tr key={row.index}><th>{row.index}</th><td>{info?.[0] ?? "Not available"}</td><td>{info?.[1] ?? "Not available"}</td><td>{row.recommendedK == null ? "No vote" : formatNumber(row.recommendedK, "count")}</td></tr>; })}</tbody></table></details></Panel>}</div>;
}

export function AriCalculation({ calculation }: { calculation?: Evidence["ariCalculation"] }) {
  if (!calculation) return <details><summary>Show ARI calculation</summary><p>Not available — ARI calculation evidence is not supplied for this prepared dataset.</p></details>;
  const c = calculation, t = c.terms;
  const f = (value: number) => formatNumber(value, "calculation");
  const n = (value: number) => formatNumber(value, "count");
  const pair = c.pair.kind === "seed" ? "Seed" : "Run";
  const columns = c.n_ij[0][0] + c.n_ij[1][1] >= c.n_ij[0][1] + c.n_ij[1][0] ? [0, 1] : [1, 0];
  const chooseSum = (values: readonly number[]) => values.map(value => `C(${n(value)}, 2)`).join(" + ");
  const terms = [
    ["S = Σ C(n_ij, 2)", n(t.sumCellChoose2), chooseSum(c.n_ij.flat())],
    ["A = Σ C(a_i, 2)", n(t.sumRowChoose2), chooseSum(c.a_i)],
    ["B = Σ C(b_j, 2)", n(t.sumColumnChoose2), chooseSum(c.b_j)],
    ["T = C(N, 2)", n(t.totalChoose2), `C(${n(c.N)}, 2)`],
    ["E = expected index", f(t.expectedIndex), `(${n(t.sumRowChoose2)} × ${n(t.sumColumnChoose2)}) / ${n(t.totalChoose2)}`],
    ["M = max index", f(t.maxIndex), `(${n(t.sumRowChoose2)} + ${n(t.sumColumnChoose2)}) / 2`]
  ];
  return <details><summary>Show ARI calculation</summary>
    <p>{pair} {n(c.pair.first)} vs {pair} {n(c.pair.second)}</p>
    <table aria-label="ARI contingency counts"><thead><tr><th>n_ij</th>{columns.map(j => <th key={j}>{pair} {n(c.pair.second)} · Cluster {n(j)}</th>)}<th>Row totals a_i</th></tr></thead>
      <tbody>{c.n_ij.map((row, i) => <tr key={i}><th>{pair} {n(c.pair.first)} · Cluster {n(i)}</th>{columns.map((j, position) => <td key={j} data-off-diagonal={i !== position || undefined} style={i !== position ? { background: "#FFF7ED", color: "#9A3412", fontWeight: 600 } : undefined}>{n(row[j])}</td>)}<td>{n(c.a_i[i])}</td></tr>)}
        <tr><th>Column totals b_j</th>{columns.map(j => <td key={j}>{n(c.b_j[j])}</td>)}<td>N = {n(c.N)}</td></tr></tbody></table>
    <p className="final-caption">Columns reordered by matching clusters; ARI does not depend on cluster numbering.</p>
    <p className="final-caption">C(x, 2) = x(x − 1) / 2; ARI = (S − E) / (M − E), where E = AB / T and M = (A + B) / 2.</p>
    <table aria-label="ARI calculation terms"><thead><tr><th>Term</th><th>Substituted arithmetic</th><th>Value</th></tr></thead><tbody>{terms.map(([label, value, arithmetic]) => <tr key={label}><th>{label}</th><td>{arithmetic}</td><td>{value}</td></tr>)}</tbody></table>
    <p>ARI = ({n(t.sumCellChoose2)} − {f(t.expectedIndex)}) / ({f(t.maxIndex)} − {f(t.expectedIndex)}) = <strong>{f(c.ariRecalculated)}</strong></p>
    <p className="final-caption">Recalculated: {f(c.ariRecalculated)} · Stored: {f(c.ariStored)} · scikit-learn: {f(c.sklearnAri)}</p>
    {c.match && <p>Matches stored and scikit-learn ARI to 6 decimals</p>}
    {c.cohort.identical && <p>Same cohort and participant order (RID hash identical)</p>}
    {c.cohort.ridHashes.map((hash, i) => <p key={i} className="final-caption" style={{ overflowWrap: "anywhere" }}>{pair} {n(i === 0 ? c.pair.first : c.pair.second)} RID SHA-256: <code>{hash}</code></p>)}
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
export function Sop3({ standard, enhanced, comparison, comparisonView, standardState, enhancedState }: Props) {
  const e = enhanced?.enhanced;
  return <div className="final-stack"><div className="final-grid">
    {standard ? <Panel title="Random initialization" kind="standard"><Reproducibility evidence={comparison?.initializationEvidence?.standard ?? standard.initializationEvidence?.standard} /></Panel> : <Placeholder method="standard" state={standardState} />}
    {enhanced ? <Panel title="DPC initialization" kind="enhanced"><Reproducibility enhanced evidence={comparison?.initializationEvidence?.enhanced ?? enhanced.initializationEvidence?.enhanced} /></Panel> : <Placeholder method="enhanced" state={enhancedState} />}
  </div>{e && <Panel title="DPC centers" kind="enhanced"><DpcCenterTable centers={e.dpc.centers.map((row, i) => ({ ...row, center: i + 1 }))} /><details><summary>Show decision graph</summary><MethodDecisionGraph enhanced={e} /></details></Panel>}
  <div hidden={!comparisonView}><details><summary>Show effect on quality</summary><Panel title="Effect on quality"><RangeCards comparison={comparison} experiment="sop3" /></Panel></details></div></div>;
}
