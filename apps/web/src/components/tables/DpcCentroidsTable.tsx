import type { SelectedCentroid } from "../../../../../packages/shared/src";

type DpcCentroidsTableProps = {
  centroids: SelectedCentroid[];
};

export const DpcCentroidsTable = ({ centroids }: DpcCentroidsTableProps) => (
  <div className="overflow-hidden rounded-md border border-line">
    <table className="w-full border-collapse text-sm">
      <thead className="bg-slate-50 text-left text-xs uppercase tracking-normal text-muted">
        <tr>
          <th className="px-4 py-3 font-semibold">Rank</th>
          <th className="px-4 py-3 font-semibold">Candidate</th>
          <th className="px-4 py-3 font-semibold">Gamma</th>
          <th className="px-4 py-3 font-semibold">Cluster</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {centroids.map((centroid) => (
          <tr key={centroid.candidate_id}>
            <td className="px-4 py-3">{centroid.centroid_rank}</td>
            <td className="px-4 py-3 font-medium">{centroid.candidate_id}</td>
            <td className="px-4 py-3">{centroid.gamma.toFixed(2)}</td>
            <td className="px-4 py-3">{centroid.assigned_cluster}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);
