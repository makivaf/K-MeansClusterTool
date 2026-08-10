import type { ClusterProfile, ConditionResult } from "../../../../../packages/shared/src";
import { DistributionBars } from "../charts/DistributionBars";

type ClusterProfileTableProps = {
  condition: ConditionResult;
};

const variableKeys = (profiles: ClusterProfile[]) => Object.keys(profiles[0]?.variable_means ?? {});

export const ClusterProfileTable = ({ condition }: ClusterProfileTableProps) => {
  const keys = variableKeys(condition.cluster_profiles);

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">{condition.algorithm_label}</h3>
      <div className="overflow-hidden rounded-md border border-line">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-normal text-muted">
            <tr>
              <th className="px-4 py-3 font-semibold">Cluster</th>
              <th className="px-4 py-3 font-semibold">Members</th>
              {keys.map((key) => (
                <th className="px-4 py-3 font-semibold" key={key}>
                  {key}
                </th>
              ))}
              <th className="px-4 py-3 font-semibold">Age mean</th>
              <th className="px-4 py-3 font-semibold">Diagnosis distribution</th>
              <th className="px-4 py-3 font-semibold">APOE4 distribution</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {condition.cluster_profiles.map((profile) => (
              <tr key={profile.cluster_id} className="align-top">
                <td className="px-4 py-3 font-medium">Cluster {profile.cluster_id}</td>
                <td className="px-4 py-3">{profile.n_members.toLocaleString()}</td>
                {keys.map((key) => (
                  <td className="px-4 py-3" key={key}>
                    {profile.variable_means[key].toFixed(2)}
                  </td>
                ))}
                <td className="px-4 py-3">
                  {profile.post_hoc_summary.age.mean.toFixed(1)} ({profile.post_hoc_summary.age.sd.toFixed(1)})
                </td>
                <td className="px-4 py-3 min-w-60">
                  <DistributionBars values={profile.post_hoc_summary.diagnosis_distribution} />
                </td>
                <td className="px-4 py-3 min-w-60">
                  <DistributionBars values={profile.post_hoc_summary.apoe4_distribution} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
