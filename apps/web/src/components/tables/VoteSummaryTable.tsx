import type { VoteSummary } from "../../../../../packages/shared/src";

type VoteSummaryTableProps = {
  rows: VoteSummary[];
};

export const VoteSummaryTable = ({ rows }: VoteSummaryTableProps) => (
  <div className="overflow-hidden rounded-md border border-line">
    <table className="w-full border-collapse text-sm">
      <thead className="bg-slate-50 text-left text-xs uppercase tracking-normal text-muted">
        <tr>
          <th className="px-4 py-3 font-semibold">Index</th>
          <th className="px-4 py-3 font-semibold">Optimal k</th>
          <th className="px-4 py-3 font-semibold">Criterion value</th>
          <th className="px-4 py-3 font-semibold">Direction</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {rows.map((row) => (
          <tr key={row.index_name}>
            <td className="px-4 py-3 font-medium">{row.index_name}</td>
            <td className="px-4 py-3">{row.optimal_k}</td>
            <td className="px-4 py-3">{row.criterion_value.toFixed(3)}</td>
            <td className="px-4 py-3 text-muted">{row.direction}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);
