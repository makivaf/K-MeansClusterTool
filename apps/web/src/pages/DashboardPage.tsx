import type { ClusteringRun } from "../../../../packages/shared/src";
import { PcaScreeChart } from "../components/charts/PcaScreeChart";
import { MetricsTable } from "../components/tables/MetricsTable";
import { DeltaBadge } from "../components/ui/DeltaBadge";
import { Panel } from "../components/ui/Panel";
import { formatMetric, getConditions, metricDelta, metricLabels } from "../utils/metrics";
import { PageHeading } from "./PageHeading";

type DashboardPageProps = {
  run: ClusteringRun | null;
};

export const DashboardPage = ({ run }: DashboardPageProps) => {
  if (!run) return null;

  if (run.axis === "Axis B") {
    const finalMetrics = run.final_clustering.metrics;

    return (
      <>
        <PageHeading title="Dashboard" description={run.description} />
        <div className="grid grid-cols-5 gap-3">
          <Panel title="Selected k">
            <div className="text-4xl font-semibold">{run.nbclust.selected_k}</div>
            <div className="mt-2 text-xs text-muted">NbClust result</div>
          </Panel>
          <Panel title="Input dimensions">
            <div className="text-4xl font-semibold">{run.slope_construction.input_dimensions}</div>
            <div className="mt-2 text-xs text-muted">ADAS-Cog13 slope only</div>
          </Panel>
          {Object.entries(metricLabels).map(([metricKey, label]) => {
            const metric = metricKey as keyof typeof finalMetrics;
            return (
              <Panel key={metricKey} title={label}>
                <div className="text-3xl font-semibold text-teal-700">{formatMetric(metric, finalMetrics[metric])}</div>
                <div className="mt-2 text-xs text-muted">Final fixed-seed standard K-Means</div>
              </Panel>
            );
          })}
        </div>
        <Panel title="Final Axis B method" className="mt-4">
          <p className="text-sm text-muted">
            PCA is not applicable to the one-dimensional slope input. DPC suitability was evaluated but rejected for
            final initialization. The reported result uses fixed-seed standard Lloyd K-Means.
          </p>
        </Panel>
      </>
    );
  }

  const { baseline, enhanced } = getConditions(run);

  return (
    <>
      <PageHeading title="Dashboard" description={run.description} />
      <div className="grid grid-cols-5 gap-3">
        <Panel title="Selected k" className="col-span-1">
          <div className="text-4xl font-semibold">{run.nbclust.selected_k}</div>
          <div className="mt-2 text-xs text-muted">NbClust majority vote</div>
        </Panel>
        <Panel title="Cumulative variance" className="col-span-1">
          <div className="text-4xl font-semibold">{(run.pca.cumulative_explained_variance * 100).toFixed(1)}%</div>
          <div className="mt-2 text-xs text-muted">{run.pca.n_components_selected} retained PCs</div>
        </Panel>
        {Object.keys(metricLabels).map((metricKey) => {
          const metric = metricKey as keyof typeof baseline.metrics;
          const delta = metricDelta(metric, baseline, enhanced);
          return (
            <Panel key={metricKey} title={metricLabels[metric]} className="col-span-1">
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-xs text-muted">Enhanced</div>
                  <div className="text-3xl font-semibold text-teal-700">
                    {metric === "calinski_harabasz"
                      ? enhanced.metrics[metric].toLocaleString(undefined, { maximumFractionDigits: 1 })
                      : enhanced.metrics[metric].toFixed(3)}
                  </div>
                </div>
                <DeltaBadge value={delta.rawDelta} improved={delta.improved} precision={metric === "calinski_harabasz" ? 1 : 3} />
              </div>
            </Panel>
          );
        })}
      </div>

      <div className="mt-4 grid grid-cols-12 gap-4">
        <Panel title="Explained Variance (PCA)" className="col-span-7">
          <PcaScreeChart data={run.pca.scree_data} />
        </Panel>
        <Panel title="Metrics Comparison" className="col-span-5">
          <MetricsTable run={run} />
        </Panel>
      </div>
    </>
  );
};
