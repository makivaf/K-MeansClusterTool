import { useEffect, useState } from "react";
import type { MethodResult } from "../../../../../packages/shared/src/methodExecution";
import { API_BASE_URL } from "../../config/api";
import { formatNumber } from "../../utils/formatNumber";
import { Dialog } from "./ui";
import type { SilhouetteParticipant } from "../SilhouetteCalculationCard";
type Condition = NonNullable<MethodResult["commonSpace"]>["spaces"][number]["conditions"]["standard"];
const f = (n?: number) => formatNumber(n, "calculation", "Not available");
export function ParticipantRows({ rows, all = false }: { rows: readonly SilhouetteParticipant[]; all?: boolean }) {
  const [query, setQuery] = useState("");
  const [size, setSize] = useState(25);
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<{ key: keyof SilhouetteParticipant; ascending: boolean }>({ key: "rid", ascending: true });
  const filtered = rows.filter(row => row.rid.includes(query)).slice().sort((a, b) => {
    const difference = sort.key === "rid" ? a.rid.localeCompare(b.rid, "en", { numeric: true }) : (a[sort.key] as number) - (b[sort.key] as number);
    return sort.ascending ? difference : -difference;
  });
  const offset = Math.min(page, Math.max(0, Math.ceil(filtered.length / size) - 1)) * size;
  const display = all ? filtered.slice(offset, offset + size) : rows.slice(0, 5);
  return <div className="final-preview">{all && <div><label>RID search <input value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} /></label> <label>Page size <select value={size} onChange={event => { setSize(Number(event.target.value)); setPage(0); }}>{[10, 25, 50, 100].map(n => <option key={n} value={n}>{formatNumber(n, "count")}</option>)}</select></label></div>}
    <table><thead><tr>{(["rid", "cluster", "a", "b", "s"] as const).map(key => <th key={key} aria-sort={sort.key === key ? sort.ascending ? "ascending" : "descending" : "none"}><button type="button" onClick={() => { setSort({ key, ascending: sort.key === key ? !sort.ascending : true }); setPage(0); }}>{key === "rid" ? "RID" : key === "cluster" ? "Cluster" : `${key}(i)`}</button></th>)}</tr></thead>
      <tbody>{display.map(row => <tr key={row.rid}><td>{row.rid}</td><td>{formatNumber(row.cluster, "count")}</td><td>{f(row.a)}</td><td>{f(row.b)}</td><td>{f(row.s)}</td></tr>)}</tbody></table>
    {all && <div><p>{formatNumber(filtered.length, "count")} participants · Page {formatNumber(Math.floor(offset / size) + 1, "count")}</p><button type="button" disabled={offset === 0} onClick={() => setPage(page - 1)}>Previous</button> <button type="button" disabled={offset + size >= filtered.length} onClick={() => setPage(page + 1)}>Next</button></div>}
  </div>;
}
export function CalculationDetails({ before, after, beforeLabel, afterLabel }: { before: Condition; after: Condition; beforeLabel: string; afterLabel: string }) {
  const [opened, setOpened] = useState(false), [selected, setSelected] = useState("before"), [dialog, setDialog] = useState(false);
  const [loaded, setLoaded] = useState<{ url: string; rows: SilhouetteParticipant[] } | null>(null), [error, setError] = useState(false);
  const current = selected === "before" ? before : after;
  const name = selected === "before" ? beforeLabel : afterLabel;
  const calc = current.calculation, ref = calc.participantSidecar;
  useEffect(() => {
    if (!opened || !ref) return;
    const controller = new AbortController(); setLoaded(null); setError(false);
    void fetch(API_BASE_URL + ref.url, { cache: "no-store", signal: controller.signal }).then(async response => {
      if (!response.ok) throw Error(); const data = await response.json() as { rows: SilhouetteParticipant[] };
      if (!Array.isArray(data.rows) || data.rows.length !== calc.n || new Set(data.rows.map(r => r.rid)).size !== calc.n || data.rows.some(r => typeof r.rid !== "string" || ![r.cluster, r.a, r.b, r.s].every(Number.isFinite))) throw Error();
      const average = data.rows.reduce((total, row) => total + row.s, 0) / calc.n;
      const sizes = new Map<number, number>(); data.rows.forEach(row => sizes.set(row.cluster, (sizes.get(row.cluster) ?? 0) + 1));
      if (Math.abs(average - calc.metrics.silhouette) > 1e-10 || data.rows.some(r => {
        const expected = sizes.get(r.cluster) === 1 || Math.max(r.a, r.b) === 0 ? 0 : (r.b - r.a) / Math.max(r.a, r.b);
        return Math.abs(r.s - expected) > 1e-10;
      })) throw Error();
      setLoaded({ url: ref.url, rows: data.rows });
    }).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [opened, ref?.url, ref?.sha256, calc]);
  const rows = loaded?.url === ref?.url ? loaded?.rows : undefined;
  const first = rows?.[0], db = calc.daviesBouldin, ch = calc.calinskiHarabasz;
  return <details onToggle={event => setOpened(event.currentTarget.open)}><summary>Calculation details</summary>
    <p className="final-caption">{formatNumber(calc.n, "count")} participants · k = {formatNumber(calc.k, "count")} · 13 standardized variables · stored {name === "Enhanced" ? "Enhanced partition" : "seed 0"}</p>
    <div className="final-segment" role="group" aria-label="Calculation run">{[["before", beforeLabel], ["after", afterLabel]].map(([key, label]) => <button key={key} type="button" aria-pressed={selected === key} onClick={() => { setSelected(key); setDialog(false); }}>{label === "Enhanced" ? label : `${label} (seed 0)`}</button>)}</div>
    <section className="final-card" style={{ marginTop: 16 }}><h4>Silhouette Coefficient</h4><p>s(i) = (b(i) − a(i)) / max(a(i), b(i))</p>
      {first ? <p>RID {first.rid}: ({f(first.b)} − {f(first.a)}) / max({f(first.a)}, {f(first.b)}) = {f(first.s)}{first.s === 0 && first.a === 0 ? " (singleton convention: s(i) = 0)" : ""}</p> : <p role="status">Not available{error ? " — sidecar rows failed validation" : ref ? " — loading sidecar rows" : " — no participant sidecar"}</p>}
      {rows && <><ParticipantRows rows={rows} /><button type="button" onClick={() => setDialog(true)}>View all {formatNumber(calc.n, "count")} participants</button></>}
      <p>Overall = mean of {formatNumber(calc.n, "count")} s(i) values = {f(calc.metrics.silhouette)}</p>
      <p className="final-caption">Stored run range: {formatNumber(current.minimum.silhouette)} to {formatNumber(current.maximum.silhouette)}</p>
    </section>
    <div className="final-grid" style={{ marginTop: 16 }}><section className="final-card"><h4>Davies-Bouldin Index</h4><p>DB = (σ₀ + σ₁) / d(c₀,c₁)</p>
      {calc.k === 2 && db ? <p>({f(db.sigma0)} + {f(db.sigma1)}) / {f(db.centroidDistance)} = {f(calc.metrics.davies_bouldin)}</p> : <p>Not available</p>}
      <p className="final-caption">Range: {formatNumber(current.minimum.davies_bouldin)} to {formatNumber(current.maximum.davies_bouldin)}</p></section>
      <section className="final-card"><h4>Calinski-Harabasz Index</h4><p>CH = (SSB / (K − 1)) / (SSW / (N − K))</p>
        {ch ? <p>({f(ch.ssb)} / ({formatNumber(calc.k, "count")} − 1)) / ({f(ch.ssw)} / ({formatNumber(calc.n, "count")} − {formatNumber(calc.k, "count")})) = {f(calc.metrics.calinski_harabasz)}</p> : <p>Not available</p>}
        <p className="final-caption">Range: {formatNumber(current.minimum.calinski_harabasz)} to {formatNumber(current.maximum.calinski_harabasz)}</p></section></div>
    {dialog && rows && <Dialog title={`All ${formatNumber(calc.n, "count")} participants`} close={() => setDialog(false)}><ParticipantRows rows={rows} all /></Dialog>}
    <p className="final-caption">Range bands use stored repetitions. The worked arithmetic describes the selected stored run.</p>
  </details>;
}
