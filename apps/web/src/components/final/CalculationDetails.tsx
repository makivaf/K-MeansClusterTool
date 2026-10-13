import { useEffect, useState } from "react";
import type { MethodResult } from "../../../../../packages/shared/src/methodExecution";
import { API_BASE_URL } from "../../config/api";
import { formatNumber } from "../../utils/formatNumber";
import { Dialog } from "./ui";
import type { SilhouetteParticipant } from "../SilhouetteCalculationCard";
type Calculation = MethodResult["calculation"];
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
function CalculationColumn({ calculation: calc, label, workedLabel, opened, silhouetteOnly }: { calculation?: Calculation; label: string; workedLabel: string; opened: boolean; silhouetteOnly: boolean }) {
  const [dialog, setDialog] = useState(false);
  const [loaded, setLoaded] = useState<{ url: string; rows: SilhouetteParticipant[] } | null>(null), [error, setError] = useState(false);
  const ref = calc?.participantSidecar;
  useEffect(() => {
    if (!opened || !ref || !calc) return;
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
  const first = rows?.[0], db = calc?.daviesBouldin, ch = calc?.calinskiHarabasz;
  return <section className="final-stack"><header><h4>{label}</h4><small className="final-caption">{workedLabel}</small></header>
    <section className="final-card" style={{ padding: 16 }}><h5>Silhouette Coefficient</h5><p>s(i) = (b(i) − a(i)) / max(a(i), b(i))</p>
      {first ? <><ParticipantRows rows={[first]} /><p>({f(first.b)} − {f(first.a)}) / max({f(first.a)}, {f(first.b)}) = {f(first.s)}{first.s === 0 && first.a === 0 ? " (singleton convention: s(i) = 0)" : ""}</p></> : <p role="status">Not available{error ? " — sidecar rows failed validation" : ref ? " — loading sidecar rows" : " — no participant sidecar"}</p>}
      {rows && <><ParticipantRows rows={rows} /><button type="button" onClick={() => setDialog(true)}>View all {formatNumber(calc?.n, "count")} participants</button></>}
      <p><strong>Overall Silhouette = mean of s(i) = {f(calc?.metrics.silhouette)}</strong></p>
    </section>
    {!silhouetteOnly && <><section className="final-card" style={{ padding: 16 }}><h5>Davies-Bouldin Index</h5><p>DB = (σ₀ + σ₁) / d(c₀, c₁)</p>
      {calc?.k === 2 && db ? <><dl><div><dt>Cluster 0 mean distance (σ₀)</dt><dd>{f(db.sigma0)}</dd></div><div><dt>Cluster 1 mean distance (σ₁)</dt><dd>{f(db.sigma1)}</dd></div><div><dt>Distance between centroids</dt><dd>{f(db.centroidDistance)}</dd></div></dl><p>({f(db.sigma0)} + {f(db.sigma1)}) / {f(db.centroidDistance)}</p><p><strong>Davies-Bouldin = {f(calc.metrics.davies_bouldin)}</strong></p></> : <p>Not available</p>}
    </section><section className="final-card" style={{ padding: 16 }}><h5>Calinski-Harabasz Index</h5><p>CH = (SSB / (K − 1)) / (SSW / (N − K))</p>
      {calc && ch ? <><dl><div><dt>Between-cluster sum of squares (SSB)</dt><dd>{f(ch.ssb)}</dd></div><div><dt>Within-cluster sum of squares (SSW)</dt><dd>{f(ch.ssw)}</dd></div><div><dt>Clusters (K)</dt><dd>{formatNumber(calc.k, "count")}</dd></div><div><dt>Participants (N)</dt><dd>{formatNumber(calc.n, "count")}</dd></div></dl><p>({f(ch.ssb)} / ({formatNumber(calc.k, "count")} − 1)) / ({f(ch.ssw)} / ({formatNumber(calc.n, "count")} − {formatNumber(calc.k, "count")}))</p><p><strong>Calinski-Harabasz = {f(calc.metrics.calinski_harabasz)}</strong></p></> : <p>Not available</p>}
    </section></>}
    {dialog && rows && <Dialog title={label + " — All " + formatNumber(calc?.n, "count") + " participants"} close={() => setDialog(false)}><ParticipantRows rows={rows} all /></Dialog>}
  </section>;
}
export function CalculationDetails({ before, after, beforeLabel, afterLabel, silhouetteOnly = false }: { before?: Calculation; after?: Calculation; beforeLabel: string; afterLabel: string; silhouetteOnly?: boolean }) {
  const [opened, setOpened] = useState(false);
  return <details onToggle={event => setOpened(event.currentTarget.open)}><summary>Calculation details</summary><div className="final-grid" style={{ marginTop: 16 }}>
    <CalculationColumn calculation={before} label={beforeLabel} workedLabel="Worked example: seed 0 (one of 30 runs)" opened={opened} silhouetteOnly={silhouetteOnly} />
    <CalculationColumn calculation={after} label={afterLabel} workedLabel={silhouetteOnly ? "Worked example: seed 0 (one of 30 runs)" : "Deterministic run"} opened={opened} silhouetteOnly={silhouetteOnly} />
  </div></details>;
}
