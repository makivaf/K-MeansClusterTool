import { useEffect, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { UnifiedResearchRun } from "../../../../../packages/shared/src/schema";
import { FinalUiEvidenceSchema, type FinalUiEvidence } from "../../../../../packages/shared/src/finalUiEvidence";
import { API_BASE_URL } from "../../config/api";
import { formatNumber } from "../../utils/formatNumber";
import { Panel, T } from "./ui";
const interaction = "time_years:original_cluster[T.1]";
export function ForestPlot({ models }: { models: NonNullable<FinalUiEvidence["models"]> }) {
  const entries = [{ label: "Primary: random intercept (locked)", effect: models.randomIntercept[interaction], solid: true }, { label: "Sensitivity: random slope", effect: models.randomSlope[interaction], solid: false }];
  if (entries.some(row => !row.effect)) return <p>Not available</p>;
  const x = (value: number) => 250 + value / 4 * 350;
  return <><svg width="100%" viewBox="0 0 940 175" role="img" aria-label="Time by Cluster annual-change estimates and 95% confidence intervals">
    <line x1={x(0)} x2={x(0)} y1={25} y2={125} stroke={T.slate} strokeDasharray="4 4" /><text x={x(0) + 5} y={14} fontSize={12} fill={T.slate}>No difference</text>
    {entries.map((row, i) => <g key={row.label}><text x={0} y={45 + i * 60} fontSize={13} fill="#4F6672">{row.label}</text><line x1={x(row.effect.ci95[0])} x2={x(row.effect.ci95[1])} y1={40 + i * 60} y2={40 + i * 60} stroke={T.teal} strokeWidth={2} /><circle cx={x(row.effect.estimate)} cy={40 + i * 60} r={5} fill={row.solid ? T.teal : "white"} stroke={T.teal} strokeWidth={2} />
      <text x={625} y={45 + i * 60} fontSize={12} fill="#4F6672">{`${formatNumber(row.effect.estimate, "lme")} (95% CI ${formatNumber(row.effect.ci95[0], "lme")} to ${formatNumber(row.effect.ci95[1], "lme")})`}</text></g>)}
    <line x1={x(0)} x2={x(4)} y1={140} y2={140} stroke="#CBD5DC" />{[0, 1, 2, 3, 4].map(tick => <g key={tick}><line x1={x(tick)} x2={x(tick)} y1={140} y2={144} stroke={T.slate} /><text x={x(tick)} y={158} textAnchor="middle" fontSize={12}>{formatNumber(tick, "count")}</text></g>)}<text x={425} y={173} textAnchor="middle" fontSize={12}>points/year</text>
  </svg>{entries.every(row => row.effect.pValue < .001 && row.effect.estimate > 0) && <p>Both models: faster progression in Cluster 1, p &lt; 0.001</p>}</>;
}
export function longitudinalBins(rows: NonNullable<FinalUiEvidence["observedMeans"]>) {
  const maximum = Math.max(0, ...rows.map(row => row.yearStart));
  return Array.from({ length: maximum + 1 }, (_, start) => {
    const c0 = rows.find(row => row.yearStart === start && row.clusterId === 0);
    const c1 = rows.find(row => row.yearStart === start && row.clusterId === 1);
    return { start, label: `${formatNumber(start, "count")}–${formatNumber(start + 1, "count")}`, cluster0: c0?.meanAdas13, cluster1: c1?.meanAdas13, n0: c0?.observationCount ?? 0, n1: c1?.observationCount ?? 0 };
  });
}
export const supportedLongitudinalBins = (data: ReturnType<typeof longitudinalBins>) => data.filter(row => row.n0 >= 20 && row.n1 >= 20);
export function FinalLongitudinal({ run }: { run: UnifiedResearchRun }) {
  const [evidence, setEvidence] = useState<FinalUiEvidence | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { const controller = new AbortController(); void fetch(API_BASE_URL + "/api/study-final-ui", { signal: controller.signal, cache: "no-store" }).then(async response => { if (!response.ok) throw Error(); setEvidence(FinalUiEvidenceSchema.parse(await response.json())); }).catch(() => { if (!controller.signal.aborted) setFailed(true); }); return () => controller.abort(); }, []);
  const model = run.longitudinal.mixedEffects;
  const verifiedPrimary = evidence?.models?.randomIntercept[interaction];
  const analysisSet = evidence?.observedAnalysisSet;
  const applicable = verifiedPrimary && Math.abs(verifiedPrimary.estimate - model.primaryResult.estimate) < 1e-8 && analysisSet?.participantCount === model.participantCount && analysisSet?.observationCount === model.observationCount;
  const data = applicable && evidence?.observedMeans ? longitudinalBins(evidence.observedMeans) : [];
  const total = data.reduce((sum, row) => sum + row.n0 + row.n1, 0);
  const reconciled = data.length > 0 && total === model.observationCount;
  return <><Panel title="Longitudinal observed means">{reconciled ? <>
    <p className="final-caption">n per bin counts observations from the LME analysis set: {formatNumber(model.participantCount, "count")} participants / {formatNumber(model.observationCount, "count")} observations; bin counts sum to {formatNumber(total, "count")} observations.</p>
    <div style={{ height: 300 }}><ResponsiveContainer width="100%" height="100%"><LineChart data={supportedLongitudinalBins(data)} margin={{ top: 24, right: 24, bottom: 24, left: 0 }}><CartesianGrid stroke="#E2E8EC" /><XAxis dataKey="label" /><YAxis allowDecimals={false} tickFormatter={v => formatNumber(v, "count")} width={60} /><Tooltip formatter={(v: number) => formatNumber(v, "lme")} /><Line dataKey="cluster0" name="Cluster 0" stroke={T.c0} connectNulls={false} isAnimationActive={false} /><Line dataKey="cluster1" name="Cluster 1" stroke={T.c1} connectNulls={false} isAnimationActive={false} /></LineChart></ResponsiveContainer></div>
    <p className="final-caption">Bins with fewer than 20 observations in either cluster are not plotted; counts are listed below.</p>
    <div className="final-preview"><table aria-label="Observations per elapsed-year bin"><thead><tr><th>n per bin</th>{data.map(row => <th key={row.start}>{row.label}</th>)}</tr></thead><tbody><tr><th>Cluster 0</th>{data.map(row => <td key={row.start}>{formatNumber(row.n0, "count")}</td>)}</tr><tr><th>Cluster 1</th>{data.map(row => <td key={row.start}>{formatNumber(row.n1, "count")}</td>)}</tr></tbody></table></div>
  </> : <p role="status">{failed || evidence ? "Verified LME chart evidence is unavailable or incompatible." : "Loading verified LME chart evidence…"}</p>}
    <div className="final-grid" style={{ marginTop: 16 }}>{model.estimatedAnnualChangeByOriginalCluster.map(row => <div key={row.clusterId} className="final-stat"><span>Primary model</span><span>Cluster {formatNumber(row.clusterId, "count")} annual ADAS-Cog13 change</span><strong style={{ color: row.clusterId === 0 ? T.c0 : T.c1 }}>{formatNumber(row.estimate, "lme")}</strong><span>points/year</span></div>)}</div>
  </Panel><Panel title="Time × Cluster effect">{applicable && evidence?.models ? <ForestPlot models={evidence.models} /> : <p role="status">Not available — verified model source is pending or incompatible.</p>}</Panel></>;
}