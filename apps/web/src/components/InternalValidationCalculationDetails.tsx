import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { formatNumber } from "../utils/formatNumber";
import { metricDefinitions, type MetricKey } from "./MetricComparisonTable";
import { SilhouetteParticipantTable, type SilhouetteParticipant } from "./SilhouetteCalculationCard";
import { API_BASE_URL } from "../config/api";
import type { CalculationEvidence } from "../../../../packages/shared/src/calculationEvidence";
import "./InternalValidationCalculationDetails.css";

type Values = Partial<Record<MetricKey, number>>;
export type MethodDetails = { n: number; k: number; metrics: Values; calculation?: CalculationEvidence; runCount?: number; representation?: string; participants?: readonly SilhouetteParticipant[];
  summary?: { mean: Values; sd: Values; minimum: Values; maximum: Values } };
const f = (value?: number) => formatNumber(value, "calculation");
export const InternalValidationCalculationDetails = ({ standard, enhanced, singleMethod, labels, notes }: {
  standard?: MethodDetails; enhanced: MethodDetails; singleMethod?: "standard" | "enhanced"; labels?: {standard:string;enhanced:string}; notes?: string; formatValue?: (value:number|undefined)=>string;
}) => {
  const [selected,setSelected]=useState<"standard"|"enhanced">("standard");
  const [opened,setOpened]=useState(false);
  const method=standard && (singleMethod ?? selected)==="standard" ? standard : enhanced;
  const isStandard=method===standard;
  const name=(labels?.[isStandard?"standard":"enhanced"] ?? (isStandard?"Standard":"Enhanced")).replace(" (mean of 30 runs)","");
  const deterministic=/Enhanced|DPC/.test(name);
  const calc=method.calculation, ref=calc?.participantSidecar;
  const evaluationSpace = calc?.representation === "standardized_13" ? "Standardized evaluation space" : calc?.representation === "retained_pcs" ? "Retained PC evaluation space" : calc?.representation ?? method.representation ?? "Not available";
  const [loaded,setLoaded]=useState<{url:string;rows:SilhouetteParticipant[]} | null>(null);
  const [rowError,setRowError]=useState(false);
  useEffect(()=>{
    if(!opened || !ref) return;
    const controller=new AbortController();setLoaded(null);setRowError(false);
    void fetch(API_BASE_URL+ref.url,{cache:"no-store",signal:controller.signal}).then(async response=>{
      if(!response.ok) throw Error();
      const data=await response.json() as {rows:SilhouetteParticipant[]};
      if(!Array.isArray(data.rows)||data.rows.length!==method.n||new Set(data.rows.map(r=>r.rid)).size!==method.n||data.rows.some(r=>typeof r.rid!=="string"||![r.cluster,r.a,r.b,r.s].every(Number.isFinite)))throw Error();
      setLoaded({url:ref.url,rows:data.rows});
    }).catch(()=>{if(!controller.signal.aborted)setRowError(true);});
    return()=>controller.abort();
  },[opened,ref?.url,ref?.sha256,method.n]);
  const rows=method.participants ?? (loaded?.url===ref?.url?loaded?.rows:undefined);
  const db=calc?.daviesBouldin,ch=calc?.calinskiHarabasz;
  const metricResult=calc?.metrics;
  const validRange=!!metricResult && !!method.summary && metricDefinitions.every(({key})=>metricResult[key]>=method.summary!.minimum[key]! && metricResult[key]<=method.summary!.maximum[key]!);
  const tab=(key:"standard"|"enhanced")=>{
    const label=(labels?.[key] ?? (key==="standard"?"Standard":"Enhanced")).replace(" (mean of 30 runs)","");
    return /Enhanced|DPC/.test(label)?"Enhanced (deterministic)":label+" (seed 0)";
  };
  return <details className="pca-calculation-details internal-validation-calculations" onToggle={event=>setOpened(event.currentTarget.open)}>
    <summary>View Calculation Details <ChevronDown size={14} aria-hidden="true" /></summary>
    <div className="pca-calculation-content">
      <div className="calculation-chips"><span>N {formatNumber(method.n,"count")}</span><span>K {formatNumber(method.k,"count")}</span><span>{name}</span><span>{evaluationSpace}</span></div>
      {standard && !singleMethod && <div className="pca-representation-toggle" role="group" aria-label="Validation calculation method">{(["standard","enhanced"] as const).map(key=><button key={key} type="button" aria-pressed={selected===key} onClick={()=>setSelected(key)}>{tab(key)}</button>)}</div>}
      <h4>{deterministic?"Deterministic run":"Stored seed 0"}</h4>
      {!calc && <p role="status">Stored calculation evidence not available.</p>}
      <section className="internal-calculation-card"><h5>Silhouette Coefficient</h5>
        {rows?.length===method.n?<SilhouetteParticipantTable rows={rows} n={method.n}/>:<p role="status">{rowError?"Stored participant calculation could not be validated.":ref?"Loading stored participant calculations...":"Participant-level calculation unavailable for this cached run."}</p>}
        <p>{deterministic?"Deterministic overall Silhouette":"Seed-0 overall Silhouette"}: <strong>{f(metricResult?.silhouette)}</strong> = mean of s(i).</p>
      </section>
      <section className="internal-calculation-card"><h5>Davies-Bouldin Index</h5>
        {method.k===2?<><dl><div><dt>sigma0</dt><dd>{f(db?.sigma0)}</dd></div><div><dt>sigma1</dt><dd>{f(db?.sigma1)}</dd></div><div><dt>d(c0,c1)</dt><dd>{f(db?.centroidDistance)}</dd></div></dl>
          {db && <p data-formula="db">({f(db.sigma0)} + {f(db.sigma1)}) / {f(db.centroidDistance)} = {f(metricResult?.davies_bouldin)}</p>}</>:<p role="status">The two-cluster substitution is not applicable to this partition.</p>}
      </section>
      <section className="internal-calculation-card"><h5>Calinski-Harabasz Index</h5>
        <dl><div><dt>SSB</dt><dd>{f(ch?.ssb)}</dd></div><div><dt>SSW</dt><dd>{f(ch?.ssw)}</dd></div><div><dt>N</dt><dd>{formatNumber(method.n,"count")}</dd></div><div><dt>K</dt><dd>{formatNumber(method.k,"count")}</dd></div></dl>
        {ch && <p data-formula="ch">({f(ch.ssb)} / ({formatNumber(method.k,"count")}-1)) / ({f(ch.ssw)} / ({formatNumber(method.n,"count")}-{formatNumber(method.k,"count")})) = {f(metricResult?.calinski_harabasz)}</p>}
      </section>
      {method.summary && method.runCount===30 && <section><h5>30-run summary</h5><table className="research-table"><thead><tr><th>Metric</th><th>Mean</th><th>SD</th><th>Min</th><th>Max</th></tr></thead><tbody>{metricDefinitions.map(({key,label})=><tr key={key}><th>{label}</th>{[method.summary!.mean[key],method.summary!.sd[key],method.summary!.minimum[key],method.summary!.maximum[key]].map((value,i)=><td key={i}>{formatNumber(value,"metric")}</td>)}</tr>)}</tbody></table>{validRange && <p>Stored seed 0 lies within this range</p>}</section>}
      {notes && <p className="text-xs text-muted">{notes}</p>}
    </div>
  </details>;
};
