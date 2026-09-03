import type { UnifiedResearchRun } from "../../../../packages/shared/src";
import { ResearchPageNavigation } from "../components/layout/ResearchPageNavigation";
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
      <PageHeading title="Cluster Findings" description="The enhanced K-Means result separates the study-entry cohort into two fixed groups with distinct aggregate cognitive-functional profiles." />
      <div className="grid gap-3 sm:grid-cols-2">
        <StatCard label="Cluster 0" value={`${profiles[0]?.nMembers.toLocaleString()} participants`} detail="63.7% · relatively lower-impairment cognitive-functional profile" accent="teal" />
        <StatCard label="Cluster 1" value={`${profiles[1]?.nMembers.toLocaleString()} participants`} detail="36.3% · relatively higher-impairment cognitive-functional profile" accent="amber" />
      </div>
      <div className="mt-5 border-l-2 border-amber-500 bg-amber-50/60 px-4 py-3 text-sm leading-6 text-amber-950">
        These are algorithmically identified groups and do not represent diagnoses, clinical Alzheimer’s disease stages, or clinical subtypes.
      </div>

      <Panel title="Simple interpretation" className="mt-8" variant="section">
        <div className="grid gap-4 text-sm leading-6 sm:grid-cols-2">
          <div><h2 className="font-semibold text-teal-900">Cluster 0</h2><p className="mt-1 text-muted">Generally shows better cognitive test performance and lower functional impairment relative to Cluster 1.</p></div>
          <div><h2 className="font-semibold text-amber-900">Cluster 1</h2><p className="mt-1 text-muted">Generally shows poorer cognitive test performance and greater functional impairment relative to Cluster 0.</p></div>
        </div>
        <p className="mt-4 text-xs leading-5 text-muted">This aggregate comparison is descriptive and does not establish causation or clinical classification.</p>
      </Panel>

      <Panel title="Strongest observed profile differences" className="mt-8" variant="section">
        <p className="text-sm leading-6 text-muted">The following measures are shown in the frozen standardized-mean-difference ranking order.</p>
        <ol className="mt-4 grid gap-x-8 sm:grid-cols-2">
          {run.clusterProfiles.smdRanking.slice(0, 10).map((row, index) => (
            <li key={row.variable} className="grid grid-cols-[2rem_1fr_auto] items-baseline gap-3 border-b border-line py-2.5 text-sm">
              <span className="text-[11px] font-semibold tabular-nums text-muted">{String(index + 1).padStart(2, "0")}</span>
              <span className="font-medium">{getMeasureLabel(row.variable)}</span>
              <span className="text-xs font-semibold tabular-nums text-muted">{row.standardizedMeanDifferenceCluster1Minus0.toFixed(3)}</span>
            </li>
          ))}
        </ol>
        <p className="mt-2 text-right text-[11px] text-muted">Values shown as SMD (Cluster 1 − Cluster 0).</p>
      </Panel>

      <Panel title="PCA representation and aggregate reporting" className="mt-8" variant="section">
        <div className="grid gap-3 sm:grid-cols-2">
          <StatCard label="Retained representation" value={`${run.pca.components} PCs`} accent="teal" />
          <StatCard label="Cumulative variance" value={`${(run.pca.cumulativeExplainedVariance * 100).toFixed(6)}%`} />
        </div>
        <p className="mt-4 text-sm leading-6 text-muted">
          Participant-level PCA coordinates are not displayed in the web application. Cluster Findings are presented using validated aggregate cognitive-functional profiles to preserve aggregate-only result exposure.
        </p>
        <p className="mt-3 text-xs leading-5 text-muted">PCA remains part of the frozen enhanced K-Means pipeline; the final clustering used the full six-dimensional PCA space.</p>
      </Panel>

      <details className="research-disclosure">
        <summary>Full original-scale cognitive-functional profile table</summary>
        <div className="py-5">
          <div className="overflow-x-auto">
            <table className="research-table min-w-[620px]">
              <thead><tr><th>Variable</th><th className="text-right">Cluster 0 mean</th><th className="text-right">Cluster 1 mean</th><th className="text-right">SMD (1 − 0)</th></tr></thead>
              <tbody>
                {run.clusterProfiles.smdRanking.map((row) => (
                  <tr key={row.variable}>
                    <td className="font-medium">{getMeasureLabel(row.variable)}</td>
                    <td className="text-right tabular-nums">{profiles[0]?.variableMeans[row.variable]?.toFixed(2)}</td>
                    <td className="text-right tabular-nums">{profiles[1]?.variableMeans[row.variable]?.toFixed(2)}</td>
                    <td className="text-right font-semibold tabular-nums">{row.standardizedMeanDifferenceCluster1Minus0.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-xs leading-5 text-muted">Profile scale: {run.clusterProfiles.scale}. SMD signs describe Cluster 1 relative to Cluster 0 and do not imply clinical ordering.</p>
        </div>
      </details>
      <ResearchPageNavigation currentPath="/cluster-findings" />
    </>
  );
};
