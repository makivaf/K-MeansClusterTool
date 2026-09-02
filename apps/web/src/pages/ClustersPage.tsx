import type { UnifiedResearchRun } from "../../../../packages/shared/src";
import { PcaClusterScatter } from "../components/charts/PcaClusterScatter";
import { Panel } from "../components/ui/Panel";
import { StatCard } from "../components/ui/StatCard";
import { getMeasureLabel } from "../utils/measureLabels";
import { PageHeading } from "./PageHeading";

type ClustersPageProps = { run: UnifiedResearchRun | null };

export const ClustersPage = ({ run }: ClustersPageProps) => {
  if (!run) return null;
  const profiles = [...run.clusterProfiles.profiles].sort((left, right) => left.clusterId - right.clusterId);
  return (
    <>
      <PageHeading title="Cluster Results" description="Aggregate cognitive and functional profiles of the two algorithmic groups. Cluster numbers are neutral identifiers and do not represent diagnoses or clinical stages." />
      <div className="grid gap-3 sm:grid-cols-2">
        {profiles.map((profile) => (
          <StatCard key={profile.clusterId} label={`Original Cluster ${profile.clusterId}`} value={profile.nMembers.toLocaleString()} detail={`${((profile.nMembers / run.cohort.parentN) * 100).toFixed(1)}% of the clustered parent cohort`} accent={profile.clusterId === 0 ? "teal" : "amber"} />
        ))}
      </div>
      <Panel title="PCA cluster visualization" className="mt-4">
        <PcaClusterScatter />
      </Panel>
      <Panel title="Original-scale cognitive-functional means" className="mt-4">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead><tr className="border-b border-line text-xs uppercase tracking-wide text-muted"><th className="px-3 py-3">Variable</th><th className="px-3 py-3 text-right">Cluster 0 mean</th><th className="px-3 py-3 text-right">Cluster 1 mean</th><th className="px-3 py-3 text-right">SMD (1 − 0)</th></tr></thead>
            <tbody>
              {run.clusterProfiles.smdRanking.map((row) => (
                <tr key={row.variable} className="border-b border-line last:border-0">
                  <td className="px-3 py-3 font-medium">{getMeasureLabel(row.variable)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{profiles[0]?.variableMeans[row.variable]?.toFixed(2)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{profiles[1]?.variableMeans[row.variable]?.toFixed(2)}</td>
                  <td className="px-3 py-3 text-right font-semibold tabular-nums">{row.standardizedMeanDifferenceCluster1Minus0.toFixed(3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-xs leading-5 text-muted">Profile scale: {run.clusterProfiles.scale}. SMD signs describe Cluster 1 relative to Cluster 0 and do not imply clinical ordering.</p>
      </Panel>
    </>
  );
};
