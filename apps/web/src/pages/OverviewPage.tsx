import type { UnifiedResearchRun } from "../../../../packages/shared/src";
import { ResearchPageNavigation } from "../components/layout/ResearchPageNavigation";
import { Panel } from "../components/ui/Panel";
import { StatCard } from "../components/ui/StatCard";
import { PageHeading } from "./PageHeading";

type OverviewPageProps = { run: UnifiedResearchRun | null };

const pipelineSteps = [
  "Study-entry cohort",
  "15 candidate measures",
  "13 retained measures",
  "PCA (6 PCs)",
  "NbClust (k = 2)",
  "Deterministic DPC initialization",
  "Lloyd K-Means",
  "Cluster 0 / Cluster 1",
  "Longitudinal eligibility",
  "Mixed-effects comparison"
];

export const OverviewPage = ({ run }: OverviewPageProps) => {
  if (!run) return null;
  const clusterSizes = [...run.enhancedClustering.clusterSizes].sort((left, right) => left.clusterId - right.clusterId);
  const annualChangeByCluster = new Map(run.longitudinal.mixedEffects.estimatedAnnualChangeByOriginalCluster.map((entry) => [entry.clusterId, entry.estimate]));
  const primaryDifference = run.longitudinal.mixedEffects.primaryResult.estimate;

  return (
    <>
      <PageHeading
        title="Unified Research Overview"
        description="One continuous analysis links enhanced K-Means clustering at study entry to longitudinal comparison of the same fixed algorithmic groups."
      />
      <Panel title="Primary study summary" variant="result">
        <p className="max-w-4xl text-base leading-7 text-ink">
          Enhanced K-Means identified two fixed algorithmic groups among {run.cohort.parentN.toLocaleString()} study-entry participants. Eligible members of those same groups were then followed longitudinally, with {run.longitudinal.eligibleParticipants.toLocaleString()} participants entering the mixed-effects comparison.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <StatCard label="Study-entry cohort" value={run.cohort.parentN.toLocaleString()} detail="Participants clustered once at study entry" />
          <StatCard label="Fixed algorithmic groups" value={run.kSelection.selectedK} detail="Cluster 0 and Cluster 1 from enhanced K-Means" accent="teal" />
          <StatCard label="Longitudinal comparison" value={run.longitudinal.eligibleParticipants.toLocaleString()} detail="Eligible participants retaining their original assignments" />
        </div>
      </Panel>

      <Panel title="Continuous scientific flow" className="mt-8" variant="section">
        <ol className="grid gap-x-5 md:grid-cols-2 xl:grid-cols-5">
          {pipelineSteps.map((step, index) => (
            <li key={step} className="relative border-l-2 border-line pb-5 pl-8 last:pb-0 xl:border-l-0 xl:border-t-2 xl:pb-6 xl:pl-0 xl:pt-5">
              <span className={`absolute -left-[9px] top-0 flex h-4 w-4 items-center justify-center rounded-full border-2 bg-canvas xl:-top-[9px] xl:left-0 ${index >= 6 ? "border-teal-600" : "border-slate-400"}`} aria-hidden="true" />
              <span className="block text-[10px] font-semibold tabular-nums text-muted">{String(index + 1).padStart(2, "0")}</span>
              <span className={`mt-1 block text-sm font-semibold leading-5 ${index >= 6 ? "text-teal-900" : "text-ink"}`}>{step}</span>
            </li>
          ))}
        </ol>
      </Panel>

      <Panel title="Core study findings" className="mt-8" variant="section">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <StatCard label="Cluster 0" value={clusterSizes[0]?.nMembers.toLocaleString()} detail="63.7% · relatively lower-impairment profile" accent="teal" />
          <StatCard label="Cluster 1" value={clusterSizes[1]?.nMembers.toLocaleString()} detail="36.3% · relatively higher-impairment profile" accent="amber" />
          <StatCard label="Longitudinally eligible" value={run.longitudinal.eligibleParticipants.toLocaleString()} detail="Original assignments preserved" />
          <StatCard label="Cluster 0 annual change" value={`+${annualChangeByCluster.get(0)?.toFixed(3)}/year`} detail="ADAS-Cog13 points" accent="teal" />
          <StatCard label="Cluster 1 annual change" value={`+${annualChangeByCluster.get(1)?.toFixed(3)}/year`} detail="ADAS-Cog13 points" accent="amber" />
          <StatCard label="Difference in annual change" value={`+${primaryDifference.toFixed(3)}/year`} detail="Cluster 1 relative to Cluster 0" />
        </div>
        <p className="mt-4 text-sm leading-6 text-ink">Among longitudinally eligible participants, Cluster 1 exhibited a greater average annual increase in ADAS-Cog13 than Cluster 0.</p>
        <p className="mt-1 text-xs leading-5 text-muted">The groups are algorithmic rather than diagnostic, and the observed longitudinal difference does not establish causation or individual prognosis.</p>
      </Panel>

      <details className="research-disclosure">
        <summary>Technical pipeline summary</summary>
        <div className="grid gap-6 py-5 lg:grid-cols-2">
          <section>
            <h2 className="text-sm font-semibold">Enhanced K-Means</h2>
            <dl className="mt-3 grid grid-cols-2 gap-4 text-sm">
              <div><dt className="text-muted">Representation</dt><dd className="mt-1 font-semibold">{run.pca.components} principal components</dd></div>
              <div><dt className="text-muted">Selected k</dt><dd className="mt-1 font-semibold">{run.kSelection.selectedK}</dd></div>
              <div><dt className="text-muted">Initialization</dt><dd className="mt-1 font-semibold">Deterministic DPC</dd></div>
              <div><dt className="text-muted">Convergence</dt><dd className="mt-1 font-semibold">{run.enhancedClustering.iterations} Lloyd iterations</dd></div>
            </dl>
          </section>
          <section>
            <h2 className="text-sm font-semibold">Longitudinal continuation</h2>
            <p className="mt-3 text-sm leading-6 text-muted">Cluster assignments are preserved before matching to longitudinal records. Participant slopes are descriptive only and are never sent through a second clustering procedure.</p>
            <div className="mt-3 border-l-2 border-teal-600 bg-teal-50/60 px-3 py-2.5 text-sm font-medium text-teal-900">
              {run.cohort.atLeast3ObservationN.toLocaleString()} met the ≥3-observation rule → {run.cohort.atLeast12MonthN.toLocaleString()} also met the ≥12-month follow-up rule
            </div>
          </section>
        </div>
      </details>
      <ResearchPageNavigation currentPath="/overview" />
    </>
  );
};
