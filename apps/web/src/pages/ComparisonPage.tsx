import type { ClusteringRun } from "../../../../packages/shared/src";
import { MetricsBarChart } from "../components/charts/MetricsBarChart";
import { MetricsTable } from "../components/tables/MetricsTable";
import { Panel } from "../components/ui/Panel";
import { getConditions } from "../utils/metrics";
import { PageHeading } from "./PageHeading";

type ComparisonPageProps = {
  run: ClusteringRun | null;
};

export const ComparisonPage = ({ run }: ComparisonPageProps) => {
  if (!run) return null;

  const { baseline, enhanced } = getConditions(run);

  return (
    <>
      <PageHeading
        title="Comparison"
        description="Core thesis comparison between standard K-Means and the enhanced PCA + NbClust + DPC-init pipeline."
      />
      <div className="grid grid-cols-2 gap-4">
        <Panel title={baseline.algorithm_label}>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between border-b border-line pb-2">
              <span className="text-muted">Silhouette</span>
              <span className="font-semibold">{baseline.metrics.silhouette.toFixed(3)}</span>
            </div>
            <div className="flex justify-between border-b border-line pb-2">
              <span className="text-muted">Davies-Bouldin</span>
              <span className="font-semibold">{baseline.metrics.davies_bouldin.toFixed(3)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Calinski-Harabasz</span>
              <span className="font-semibold">{baseline.metrics.calinski_harabasz.toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
            </div>
          </div>
        </Panel>
        <Panel title={enhanced.algorithm_label}>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between border-b border-line pb-2">
              <span className="text-muted">Silhouette</span>
              <span className="font-semibold text-teal-700">{enhanced.metrics.silhouette.toFixed(3)}</span>
            </div>
            <div className="flex justify-between border-b border-line pb-2">
              <span className="text-muted">Davies-Bouldin</span>
              <span className="font-semibold text-teal-700">{enhanced.metrics.davies_bouldin.toFixed(3)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Calinski-Harabasz</span>
              <span className="font-semibold text-teal-700">
                {enhanced.metrics.calinski_harabasz.toLocaleString(undefined, { maximumFractionDigits: 1 })}
              </span>
            </div>
          </div>
        </Panel>
      </div>
      <div className="mt-4 grid grid-cols-12 gap-4">
        <Panel title="Metric Deltas" className="col-span-6">
          <MetricsTable run={run} />
        </Panel>
        <Panel title="Baseline vs Enhanced Bars" className="col-span-6">
          <MetricsBarChart run={run} />
        </Panel>
      </div>
    </>
  );
};
