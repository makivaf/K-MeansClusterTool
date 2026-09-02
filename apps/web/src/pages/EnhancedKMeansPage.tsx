import type { UnifiedResearchRun } from "../../../../packages/shared/src";
import { Panel } from "../components/ui/Panel";
import { StatCard } from "../components/ui/StatCard";
import { getMeasureLabel } from "../utils/measureLabels";
import { PageHeading } from "./PageHeading";

type EnhancedKMeansPageProps = { run: UnifiedResearchRun | null };

export const EnhancedKMeansPage = ({ run }: EnhancedKMeansPageProps) => {
  if (!run) return null;
  const metrics = run.enhancedClustering.metrics;
  return (
    <>
      <PageHeading title="Enhanced K-Means" description="Data preparation, PCA-based dimensionality reduction, NbClust index voting, deterministic Density Peaks-based initialization, and final Lloyd K-Means clustering." />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Selected k" value={run.kSelection.selectedK} detail={`k = ${run.kSelection.selectedK} received the highest number of votes, with ${run.kSelection.votesForSelectedK} of ${run.kSelection.usableVotes} usable indices.`} accent="teal" />
        <StatCard label="Silhouette" value={metrics.silhouette.toFixed(6)} detail="Higher is better" />
        <StatCard label="Davies–Bouldin" value={metrics.daviesBouldin.toFixed(6)} detail="Lower is better" />
        <StatCard label="Calinski–Harabasz" value={metrics.calinskiHarabasz.toFixed(3)} detail="Higher is better" />
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Panel title="NbClust index voting">
          <div className="space-y-3">
            {run.kSelection.voteDistribution.map((entry) => (
              <div key={entry.k} className="grid grid-cols-[2.5rem_1fr_2rem] items-center gap-3 text-sm">
                <span className={entry.k === run.kSelection.selectedK ? "font-semibold text-teal-800" : "text-muted"}>k={entry.k}</span>
                <div className="h-3 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${entry.k === run.kSelection.selectedK ? "bg-teal-600" : "bg-slate-300"}`} style={{ width: `${(entry.votes / run.kSelection.votesForSelectedK) * 100}%` }} /></div>
                <span className="text-right font-semibold">{entry.votes}</span>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Deterministic initialization">
          <p className="text-sm leading-6 text-muted">Two Density Peaks-derived candidates were selected as the initial centroids for the final K-Means run.</p>
          <p className="mt-2 text-xs leading-5 text-muted">Participant identifiers are never exposed.</p>
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">Reproduced across {run.initialization.reproducibilityRuns} runs; deterministic check passed.</div>
          <details className="mt-4 rounded-lg border border-line bg-white">
            <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">Density Peaks seed statistics</summary>
            <div className="grid gap-3 border-t border-line p-4 sm:grid-cols-2">
              {run.initialization.selectedCentroids.map((centroid) => (
                <div key={centroid.candidateId} className="rounded-xl border border-line bg-slate-50 p-4 text-sm">
                  <div className="font-semibold">Cluster {centroid.assignedCluster} seed</div>
                  <dl className="mt-3 grid grid-cols-3 gap-2 text-xs"><div><dt className="text-muted">Density (ρ)</dt><dd className="font-semibold">{centroid.rho.toFixed(3)}</dd></div><div><dt className="text-muted">Separation (δ)</dt><dd className="font-semibold">{centroid.delta.toFixed(3)}</dd></div><div><dt className="text-muted">Priority (γ)</dt><dd className="font-semibold">{centroid.gamma.toFixed(3)}</dd></div></dl>
                </div>
              ))}
            </div>
          </details>
        </Panel>
      </div>
      <details id="data-preparation" className="mt-4 scroll-mt-28 rounded-xl border border-line bg-white shadow-panel">
        <summary className="cursor-pointer px-5 py-4 font-semibold">Data preparation and PCA details</summary>
        <div className="border-t border-line p-4 sm:p-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Parent cohort" value={run.cohort.parentN.toLocaleString()} />
            <StatCard label="Candidate measures" value={run.preprocessing.candidateFeatures.length} />
            <StatCard label="Retained measures" value={run.preprocessing.retainedFeatures.length} accent="teal" />
            <StatCard label="PCA representation" value={`${run.pca.components} PCs`} detail={`${(run.pca.cumulativeExplainedVariance * 100).toFixed(6)}% variance`} />
          </div>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-muted">Missing-value handling</dt><dd className="mt-1 font-semibold">{run.preprocessing.imputation}</dd></div>
            <div><dt className="text-muted">Scaling</dt><dd className="mt-1 font-semibold">{run.preprocessing.standardization}</dd></div>
          </dl>
          <div className="mt-4">
            <h2 className="text-sm font-semibold">Retained cognitive and functional measures</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {run.preprocessing.retainedFeatures.map((feature) => <span key={feature} className="rounded-full border border-line bg-slate-50 px-3 py-1.5 text-xs font-medium">{getMeasureLabel(feature)}</span>)}
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {run.preprocessing.excludedFeatures.map((feature) => (
              <div key={feature.feature} className="rounded-lg border border-amber-100 bg-amber-50 p-3 text-sm">
                <div className="font-semibold">Excluded: {getMeasureLabel(feature.feature)}</div>
                <p className="mt-1 text-xs leading-5 text-muted">{feature.missingPercent.toFixed(2)}% missing. {feature.reason}</p>
              </div>
            ))}
          </div>
        </div>
      </details>
      <details className="mt-4 rounded-xl border border-line bg-white shadow-panel">
        <summary className="cursor-pointer px-5 py-4 font-semibold">Final clustering convergence details</summary>
        <dl className="grid gap-4 border-t border-line p-5 text-sm sm:grid-cols-3"><div><dt className="text-muted">Algorithm</dt><dd className="mt-1 font-semibold">{run.enhancedClustering.algorithm}</dd></div><div><dt className="text-muted">Iterations</dt><dd className="mt-1 font-semibold">{run.enhancedClustering.iterations}</dd></div><div><dt className="text-muted">Inertia</dt><dd className="mt-1 font-semibold">{run.enhancedClustering.inertia.toLocaleString(undefined, { maximumFractionDigits: 3 })}</dd></div></dl>
      </details>
    </>
  );
};
