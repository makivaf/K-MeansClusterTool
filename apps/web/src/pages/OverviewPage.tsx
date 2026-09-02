import { ArrowDown, ArrowRight } from "lucide-react";
import type { UnifiedResearchRun } from "../../../../packages/shared/src";
import { Panel } from "../components/ui/Panel";
import { StatCard } from "../components/ui/StatCard";
import { PageHeading } from "./PageHeading";

type OverviewPageProps = { run: UnifiedResearchRun | null };

const pipelineSteps = [
  "Study-entry cohort",
  "13 retained variables",
  "PCA (6 PCs)",
  "NbClust (k = 2)",
  "DPC initialization",
  "Lloyd K-Means",
  "Original clusters",
  "Longitudinal eligibility",
  "Progression comparison"
];

export const OverviewPage = ({ run }: OverviewPageProps) => {
  if (!run) return null;
  const clusterSizes = [...run.enhancedClustering.clusterSizes].sort((left, right) => left.clusterId - right.clusterId);

  return (
    <>
      <PageHeading
        title="Unified Research Overview"
        description="One continuous analysis: enhanced K-Means defines the participant groups, then eligible members of those same groups are followed through longitudinal ADAS-Cog13 records."
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Parent clustered cohort" value={run.cohort.parentN.toLocaleString()} detail="ADNI1, ADNIGO, ADNI2, and ADNI3 study entry" />
        <StatCard label="Original Cluster 0" value={clusterSizes[0]?.nMembers.toLocaleString()} detail="Fixed enhanced K-Means assignment" accent="teal" />
        <StatCard label="Original Cluster 1" value={clusterSizes[1]?.nMembers.toLocaleString()} detail="Fixed enhanced K-Means assignment" accent="amber" />
        <StatCard label="Longitudinally eligible" value={run.longitudinal.eligibleParticipants.toLocaleString()} detail="≥3 observations and ≥12 months follow-up" />
      </div>

      <Panel title="Continuous scientific flow" className="mt-4">
        <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-9">
          {pipelineSteps.map((step, index) => (
            <div key={step} className="flex items-center gap-2 md:block">
              <div className={`flex min-h-20 flex-1 items-center justify-center rounded-xl border px-3 py-3 text-center text-xs font-semibold leading-5 ${index >= 6 ? "border-teal-200 bg-teal-50 text-teal-900" : "border-line bg-slate-50"}`}>
                {step}
              </div>
              {index < pipelineSteps.length - 1 ? <ArrowRight className="hidden shrink-0 text-slate-300 xl:block" size={16} /> : null}
              {index < pipelineSteps.length - 1 ? <ArrowDown className="shrink-0 text-slate-300 md:hidden" size={16} /> : null}
            </div>
          ))}
        </div>
      </Panel>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Stage 1 — Enhanced K-Means">
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div><dt className="text-muted">Representation</dt><dd className="mt-1 font-semibold">{run.pca.components} principal components</dd></div>
            <div><dt className="text-muted">Selected k</dt><dd className="mt-1 font-semibold">{run.kSelection.selectedK}</dd></div>
            <div><dt className="text-muted">Initialization</dt><dd className="mt-1 font-semibold">Deterministic DPC</dd></div>
            <div><dt className="text-muted">Convergence</dt><dd className="mt-1 font-semibold">{run.enhancedClustering.iterations} Lloyd iterations</dd></div>
          </dl>
        </Panel>
        <Panel title="Stage 2 — Longitudinal Progression">
          <p className="text-sm leading-6 text-muted">
            Cluster assignments are preserved before matching to longitudinal records. Participant slopes are descriptive only and are never sent through a second clustering procedure.
          </p>
          <div className="mt-4 rounded-lg border border-teal-100 bg-teal-50 p-3 text-sm font-medium text-teal-900">
            {run.cohort.atLeast3ObservationN.toLocaleString()} met the ≥3-observation rule → {run.cohort.atLeast12MonthN.toLocaleString()} also met the ≥12-month follow-up rule
          </div>
        </Panel>
      </div>
    </>
  );
};
