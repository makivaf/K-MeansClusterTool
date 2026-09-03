import type { UnifiedResearchRun } from "../../../../packages/shared/src";
import { ResearchPageNavigation } from "../components/layout/ResearchPageNavigation";
import { Panel } from "../components/ui/Panel";
import { StatCard } from "../components/ui/StatCard";
import { getMeasureLabel } from "../utils/measureLabels";
import { PageHeading } from "./PageHeading";

type EnhancedKMeansPageProps = { run: UnifiedResearchRun | null };

export const EnhancedKMeansPage = ({ run }: EnhancedKMeansPageProps) => {
  if (!run) return null;
  const metrics = run.enhancedClustering.metrics;
  const clusterSizes = [...run.enhancedClustering.clusterSizes].sort((left, right) => left.clusterId - right.clusterId);
  return (
    <>
      <PageHeading title="Enhanced K-Means" description="The enhanced pipeline combines PCA-based representation, NbClust-based selection of k, and deterministic Density Peaks-based initialization before final Lloyd K-Means clustering." />

      <Panel title="Primary method summary" variant="result">
        <p className="max-w-4xl text-base leading-7 text-ink">PCA, NbClust, and Density Peaks initialization prepare the representation, cluster count, and initial centroids. Lloyd K-Means remains the final clustering algorithm.</p>
      </Panel>

      <div className="mt-8 grid gap-x-6 xl:grid-cols-3">
        <Panel title="1. PCA representation" variant="section">
          <p className="text-sm leading-6 text-muted">Reduce dimensionality while retaining at least 85% cumulative explained variance.</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <StatCard label="Retained" value={`${run.pca.components} PCs`} accent="teal" />
            <StatCard label="Cumulative variance" value={`${(run.pca.cumulativeExplainedVariance * 100).toFixed(6)}%`} />
          </div>
        </Panel>
        <Panel title="2. NbClust selection" variant="section">
          <p className="text-sm leading-6 text-muted">Select k using multiple internal validity indices rather than a manually chosen cluster count.</p>
          <div className="mt-4">
            <StatCard label="Selected k" value={run.kSelection.selectedK} detail={`k = ${run.kSelection.selectedK} received the highest number of votes, with ${run.kSelection.votesForSelectedK} of ${run.kSelection.usableVotes} usable indices.`} accent="teal" />
          </div>
        </Panel>
        <Panel title="3. DPC initialization" variant="section">
          <p className="text-sm leading-6 text-muted">Provide deterministic and reproducible initial centroids before Lloyd K-Means.</p>
          <div className="mt-4 border-l-2 border-emerald-600 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-900">Reproduced across {run.initialization.reproducibilityRuns} runs; deterministic check passed.</div>
          <p className="mt-3 text-xs leading-5 text-muted">The controlled comparison did not show DPC to be uniformly geometrically superior to random initialization.</p>
        </Panel>
      </div>

      <Panel title="Final Lloyd K-Means result" className="mt-8" variant="surface">
        <p className="text-sm leading-6 text-muted">The prepared six-component representation, selected k, and deterministic centroids were supplied to standard Lloyd K-Means.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <StatCard label="Final clusters" value={run.kSelection.selectedK} detail="Cluster 0 and Cluster 1" accent="teal" />
          <StatCard label="Cluster 0" value={clusterSizes[0]?.nMembers.toLocaleString()} detail="Fixed algorithmic assignment" accent="teal" />
          <StatCard label="Cluster 1" value={clusterSizes[1]?.nMembers.toLocaleString()} detail="Fixed algorithmic assignment" accent="amber" />
        </div>
      </Panel>

      <Panel title="Supporting evidence: NbClust index voting" className="mt-8" variant="section">
        <div className="space-y-3">
          {run.kSelection.voteDistribution.map((entry) => (
            <div key={entry.k} className="grid grid-cols-[2.5rem_1fr_2rem] items-center gap-3 text-sm">
              <span className={entry.k === run.kSelection.selectedK ? "font-semibold text-teal-800" : "text-muted"}>k={entry.k}</span>
              <div className="h-2 overflow-hidden bg-slate-100"><div className={`h-full ${entry.k === run.kSelection.selectedK ? "bg-teal-600" : "bg-slate-300"}`} style={{ width: `${(entry.votes / run.kSelection.votesForSelectedK) * 100}%` }} /></div>
              <span className="text-right font-semibold">{entry.votes}</span>
            </div>
          ))}
        </div>
      </Panel>
      <details id="data-preparation" className="research-disclosure scroll-mt-28">
        <summary>Data preparation and PCA details</summary>
        <div className="py-5">
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
            <div className="mt-3 grid gap-x-5 sm:grid-cols-2 xl:grid-cols-3">
              {run.preprocessing.retainedFeatures.map((feature) => <span key={feature} className="border-b border-line py-2 text-xs font-medium">{getMeasureLabel(feature)}</span>)}
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {run.preprocessing.excludedFeatures.map((feature) => (
              <div key={feature.feature} className="border-l-2 border-amber-500 bg-amber-50/60 px-3 py-2.5 text-sm">
                <div className="font-semibold">Excluded: {getMeasureLabel(feature.feature)}</div>
                <p className="mt-1 text-xs leading-5 text-muted">{feature.missingPercent.toFixed(2)}% missing. {feature.reason}</p>
              </div>
            ))}
          </div>
        </div>
      </details>
      <details className="research-disclosure">
        <summary>Density Peaks seed statistics</summary>
        <div className="py-5">
          <p className="text-sm leading-6 text-muted">Two Density Peaks-derived candidates were selected as the initial centroids for the final K-Means run. Participant identifiers are never exposed.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {run.initialization.selectedCentroids.map((centroid) => (
              <div key={centroid.candidateId} className="border-l-2 border-slate-300 bg-slate-50 px-4 py-3 text-sm">
                <div className="font-semibold">Cluster {centroid.assignedCluster} seed</div>
                <dl className="mt-3 grid grid-cols-3 gap-2 text-xs"><div><dt className="text-muted">Density (ρ)</dt><dd className="font-semibold">{centroid.rho.toFixed(3)}</dd></div><div><dt className="text-muted">Separation (δ)</dt><dd className="font-semibold">{centroid.delta.toFixed(3)}</dd></div><div><dt className="text-muted">Priority (γ)</dt><dd className="font-semibold">{centroid.gamma.toFixed(3)}</dd></div></dl>
              </div>
            ))}
          </div>
        </div>
      </details>
      <details className="research-disclosure">
        <summary>Final clustering convergence details</summary>
        <div className="py-5">
          <dl className="grid gap-4 text-sm sm:grid-cols-3"><div><dt className="text-muted">Algorithm</dt><dd className="mt-1 font-semibold">{run.enhancedClustering.algorithm}</dd></div><div><dt className="text-muted">Iterations</dt><dd className="mt-1 font-semibold">{run.enhancedClustering.iterations}</dd></div><div><dt className="text-muted">Inertia</dt><dd className="mt-1 font-semibold">{run.enhancedClustering.inertia.toLocaleString(undefined, { maximumFractionDigits: 3 })}</dd></div></dl>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <StatCard label="Silhouette" value={metrics.silhouette.toFixed(6)} detail="Higher is better" />
            <StatCard label="Davies–Bouldin" value={metrics.daviesBouldin.toFixed(6)} detail="Lower is better" />
            <StatCard label="Calinski–Harabasz" value={metrics.calinskiHarabasz.toFixed(3)} detail="Higher is better" />
          </div>
        </div>
      </details>
      <ResearchPageNavigation currentPath="/overview" />
    </>
  );
};
