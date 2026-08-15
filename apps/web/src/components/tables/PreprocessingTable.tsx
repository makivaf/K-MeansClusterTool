import type { ExcludedVariable } from "../../../../../packages/shared/src";

type PreprocessingTableProps = {
  rows: ExcludedVariable[];
};

export const PreprocessingTable = ({ rows }: PreprocessingTableProps) => (
  <div className="overflow-hidden rounded-md border border-line">
    <table className="w-full border-collapse text-sm">
      <thead className="bg-slate-50 text-left text-xs uppercase tracking-normal text-muted">
        <tr>
          <th className="px-4 py-3 font-semibold">Excluded variable</th>
          <th className="px-4 py-3 font-semibold">Missing rate</th>
          <th className="px-4 py-3 font-semibold">Reason</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {rows.map((row) => (
          <tr key={row.variable}>
            <td className="px-4 py-3 font-medium">{row.variable}</td>
            <td className="px-4 py-3">
              {row.missing_rate === undefined ? "Not provided for fixture" : `${(row.missing_rate * 100).toFixed(1)}%`}
            </td>
            <td className="px-4 py-3 text-muted">{row.reason}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);
