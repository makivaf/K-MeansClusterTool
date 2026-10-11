import { useEffect, useState } from "react";
import { formatContinuous, formatInteger } from "../utils/numberFormatting";
import type { CalculationEvidence } from "../../../../packages/shared/src/calculationEvidence";
import "./SilhouetteCalculationCard.css";

export type SilhouetteParticipant = { rid: string; cluster: number; a: number; b: number; s: number };
const columns = [
  { key: "rid", label: "Participant ID (RID)" },
  { key: "cluster", label: "Cluster" },
  { key: "a", label: "Mean intra-cluster distance, a(i)" },
  { key: "b", label: "Mean nearest-cluster distance, b(i)" },
  { key: "s", label: "Participant Silhouette value, s(i)" }
] as const;
const ridOrder = new Intl.Collator("en", { numeric: true });

// Display only. Full rows must come from validated evidence for this stored run.
// The existing exampleParticipant is deliberately never converted into a row.
export const SilhouetteParticipantTable = ({ rows, n }: { rows: readonly SilhouetteParticipant[]; n: number }) => {
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<{ key: keyof SilhouetteParticipant; ascending: boolean }>({ key: "rid", ascending: true });
  useEffect(() => { setPage(1); setSort({ key: "rid", ascending: true }); }, [rows, n]);
  const sorted = [...rows].sort((a, b) => {
    const difference = sort.key === "rid" ? ridOrder.compare(a.rid, b.rid) : (a[sort.key] as number) - (b[sort.key] as number);
    return (sort.ascending ? difference : -difference) || ridOrder.compare(a.rid, b.rid);
  });
  const last = Math.ceil(n / 10);
  const current = Math.min(page, last);
  const start = (current - 1) * 10;
  return <div className="silhouette-participant-table">
    <div className="overflow-x-auto" role="region" aria-label="Participant Silhouette calculations" tabIndex={0}>
      <table className="research-table research-row-dividers">
        <thead><tr>{columns.map(column => <th key={column.key} scope="col" aria-sort={sort.key === column.key ? sort.ascending ? "ascending" : "descending" : "none"}>
          <button type="button" onClick={() => { setSort({ key: column.key, ascending: sort.key === column.key ? !sort.ascending : true }); setPage(1); }}>
            {column.label}{sort.key === column.key && <span aria-hidden="true"> {sort.ascending ? "↑" : "↓"}</span>}
          </button>
        </th>)}</tr></thead>
        <tbody>{sorted.slice(start, start + 10).map(row => <tr key={row.rid}>
          <th scope="row">{row.rid}</th><td>{formatInteger(row.cluster)}</td>
          <td>{formatContinuous(row.a)}</td><td>{formatContinuous(row.b)}</td><td>{formatContinuous(row.s)}</td>
        </tr>)}</tbody>
      </table>
    </div>
    <div className="silhouette-pagination">
      <p aria-live="polite">Showing {formatInteger(start + 1)}–{formatInteger(Math.min(start + 10, n))} of {formatInteger(n)} participants</p>
      <div role="group" aria-label="Participant table pages">
        <button type="button" disabled={current === 1} onClick={() => setPage(current - 1)}>Previous</button>
        <button type="button" aria-current={current === 1 ? "page" : undefined} onClick={() => setPage(1)}>1</button>
        {last > 1 && <button type="button" aria-current={current === last ? "page" : undefined} aria-label={`Last page, ${last}`} onClick={() => setPage(last)}>{last}</button>}
        <button type="button" disabled={current === last} onClick={() => setPage(current + 1)}>Next</button>
      </div>
    </div>
  </div>;
};

export const SilhouetteCalculationCard = ({ n, k, method, representation, calculation, participants, runCount, value }: {
  n?: number; k?: number; method: string; representation?: string;
  calculation?: CalculationEvidence; participants?: readonly SilhouetteParticipant[]; runCount?: number; value: string;
}) => {
  const complete = calculation && n !== undefined && n > 0 && n === calculation.n && k === calculation.k
    && (!(runCount && runCount > 1) || calculation.seed !== undefined)
    && participants?.length === n && new Set(participants.map(row => row.rid)).size === n;
  return <div className="silhouette-calculation">
    <dl className="pca-calculation-metadata silhouette-metadata">
      <div><dt>Participants (N)</dt><dd>{n === undefined ? "Unavailable" : formatInteger(n)}</dd></div>
      <div><dt>Clusters (K)</dt><dd>{k === undefined ? "Unavailable" : formatInteger(k)}</dd></div>
      <div><dt>Method</dt><dd>{method}</dd></div>
      <div><dt>Representation</dt><dd>{representation ?? calculation?.representation ?? "Unavailable"}</dd></div>
      <div><dt>Evaluation Space</dt><dd>{calculation?.representation ?? "Unavailable"}</dd></div>
    </dl>
    <section className="pca-silhouette-card silhouette-calculation-card">
      <h5>Silhouette Coefficient</h5>
      {runCount && runCount > 1 ? <p>Overall Silhouette Coefficient is the mean of {formatInteger(runCount)} runs. Participant scores{calculation?.seed === undefined ? " require an explicitly identified stored run" : ` belong to stored seed ${calculation.seed}`}; their mean need not equal the aggregate.</p>
        : <p>Participant scores correspond to the {method === "Enhanced K-Means" ? "deterministic " : ""}stored run{calculation?.seed === undefined ? "" : ` (seed ${calculation.seed})`}.</p>}
      {complete ? <SilhouetteParticipantTable key={`${method}:${representation}:${calculation?.seed}`} rows={participants!} n={n!} />
        : <div className="silhouette-participant-table"><div className="overflow-x-auto" role="region" aria-label="Participant Silhouette calculations" tabIndex={0}>
          <table className="research-table research-row-dividers"><thead><tr>{columns.map(column => <th key={column.key} scope="col">{column.label}</th>)}</tr></thead>
            <tbody><tr><td colSpan={5}><div className="silhouette-unavailable" role="status"><p>Participant-level calculation unavailable for this cached run.</p>
              <p>Complete RID, cluster, a(i), b(i), and s(i) records are not supplied by the validated result. Representative values cannot populate this table.</p>
            </div></td></tr></tbody>
          </table>
        </div></div>}
      <dl className="silhouette-overall"><div><dt>Overall Silhouette Coefficient<small>Higher is better{runCount && runCount > 1 ? ` · ${formatInteger(runCount)}-run aggregate` : ""}</small></dt><dd>{value}</dd></div></dl>
    </section>
  </div>;
};
