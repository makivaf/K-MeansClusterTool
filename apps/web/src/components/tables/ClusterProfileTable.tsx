import type { AxisBFinalClustering, ClusterProfile, ConditionResult } from "../../../../../packages/shared/src";
import { DistributionBars } from "../charts/DistributionBars";

type ClusterProfileTableProps = {
  result: ConditionResult | AxisBFinalClustering;
};

const variableKeys = (profiles: ClusterProfile[]) => Object.keys(profiles[0]?.variable_means ?? {});

export const ClusterProfileTable = ({ result }: ClusterProfileTableProps) => {
  const profiles: ClusterProfile[] = [...result.cluster_profiles];
  const keys = variableKeys(profiles);
  const showsPostHoc = profiles.some((profile) => "post_hoc_summary" in profile);

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">{result.algorithm_label}</h3>
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
              {showsPostHoc ? <th className="px-4 py-3 font-semibold">Age mean</th> : null}
              {showsPostHoc ? <th className="px-4 py-3 font-semibold">Diagnosis distribution</th> : null}
              {showsPostHoc ? <th className="px-4 py-3 font-semibold">APOE4 distribution</th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {profiles.map((profile) => (
              <tr key={profile.cluster_id} className="align-top">
                <td className="px-4 py-3 font-medium">Cluster {profile.cluster_id}</td>
                <td className="px-4 py-3">{profile.n_members.toLocaleString()}</td>
                {keys.map((key) => (
                  <td className="px-4 py-3" key={key}>
                    {profile.variable_means[key].toFixed(2)}
                  </td>
                ))}
                {"post_hoc_summary" in profile ? (
                  <>
                    <td className="px-4 py-3">
                      {profile.post_hoc_summary.age.mean.toFixed(1)} ({profile.post_hoc_summary.age.sd.toFixed(1)})
                    </td>
                    <td className="px-4 py-3 min-w-60">
                      <DistributionBars values={profile.post_hoc_summary.diagnosis_distribution} />
                    </td>
                    <td className="px-4 py-3 min-w-60">
                      <DistributionBars values={profile.post_hoc_summary.apoe4_distribution} />
                    </td>
                  </>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
