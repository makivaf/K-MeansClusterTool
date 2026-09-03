import type { UnifiedResearchRun } from "../../../../packages/shared/src";
import { ResearchPageNavigation } from "../components/layout/ResearchPageNavigation";
import { Panel } from "../components/ui/Panel";
import { PageHeading } from "./PageHeading";

type OverviewPageProps = { run: UnifiedResearchRun | null };

export const OverviewPage = ({ run }: OverviewPageProps) => {
  if (!run) return null;
  const clusterSizes = [...run.enhancedClustering.clusterSizes].sort((left, right) => left.clusterId - right.clusterId);
  const pipelineSteps = [
    { label: "Study-entry cohort", value: `${run.cohort.parentN.toLocaleString()} participants` },
    { label: "Preprocessing", value: "15 candidate → 13 standardized measures" },
    { label: "PCA", value: `13 → ${run.pca.components} PCs` },
    { label: "NbClust", value: `k = ${run.kSelection.selectedK}` },
    { label: "DPC initialization", value: "Deterministic initial centroids" },
    { label: "Lloyd K-Means", value: "Final clustering algorithm" },
    { label: "Fixed clusters", value: `${clusterSizes[0]?.nMembers.toLocaleString()} / ${clusterSizes[1]?.nMembers.toLocaleString()}` },
    { label: "Longitudinal matching", value: "Original assignments retained" },
    { label: "Linear mixed effects", value: "ADAS-Cog13 progression" }
  ];

  return (
    <>
      <PageHeading
        title="Pipeline"
        description="One frozen analysis flow connects study-entry clustering to longitudinal progression modeling."
      />

      <Panel title="Continuous analysis flow" variant="result">
        <ol className="grid gap-x-5 md:grid-cols-3 xl:grid-cols-9">
          {pipelineSteps.map((step, index) => (
            <li key={step.label} className="relative border-l-2 border-line pb-5 pl-7 last:pb-0 xl:border-l-0 xl:border-t-2 xl:pb-0 xl:pl-0 xl:pt-5">
              <span className={`absolute -left-[9px] top-0 h-4 w-4 rounded-full border-2 bg-white xl:-top-[9px] xl:left-0 ${index >= 6 ? "border-teal-600" : "border-slate-400"}`} aria-hidden="true" />
              <span className="block text-[10px] font-semibold tabular-nums text-muted">{String(index + 1).padStart(2, "0")}</span>
              <span className={`mt-1 block text-sm font-semibold leading-5 ${index >= 6 ? "text-teal-900" : "text-ink"}`}>{step.label}</span>
              <span className="mt-1 block text-xs leading-5 text-muted">{step.value}</span>
            </li>
          ))}
        </ol>
      </Panel>

      <details id="technical-pipeline" className="research-disclosure scroll-mt-28">
        <summary>Technical pipeline evidence</summary>
        <dl className="grid gap-4 py-5 text-sm sm:grid-cols-2 xl:grid-cols-4">
          <div><dt className="text-muted">PCA representation</dt><dd className="mt-1 font-semibold">{run.pca.components} PCs · {(run.pca.cumulativeExplainedVariance * 100).toFixed(6)}% variance</dd></div>
          <div><dt className="text-muted">Cluster selection</dt><dd className="mt-1 font-semibold">k = {run.kSelection.selectedK} · NbClust multi-index vote</dd></div>
          <div><dt className="text-muted">Initialization and fit</dt><dd className="mt-1 font-semibold">Deterministic DPC · {run.enhancedClustering.iterations} Lloyd iterations</dd></div>
          <div><dt className="text-muted">Longitudinal continuation</dt><dd className="mt-1 font-semibold">{run.longitudinal.eligibleParticipants.toLocaleString()} eligible · no reclustering</dd></div>
        </dl>
      </details>

      <ResearchPageNavigation currentPath="/overview" />
    </>
  );
};
