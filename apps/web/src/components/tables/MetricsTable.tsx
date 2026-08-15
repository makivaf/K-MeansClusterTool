import type { AxisAClusteringRun } from "../../../../../packages/shared/src";
import { formatMetric, getConditions, metricDelta, metricLabels } from "../../utils/metrics";
import { DeltaBadge } from "../ui/DeltaBadge";

type MetricsTableProps = {
  run: AxisAClusteringRun;
};

export const MetricsTable = ({ run }: MetricsTableProps) => {
  const { baseline, enhanced } = getConditions(run);

  return (
    <div className="overflow-hidden rounded-md border border-line">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-normal text-muted">
          <tr>
            <th className="px-3 py-3 font-semibold">Metric</th>
            <th className="px-3 py-3 font-semibold">Better</th>
            <th className="px-3 py-3 font-semibold">Baseline</th>
            <th className="px-3 py-3 font-semibold">Enhanced</th>
            <th className="px-3 py-3 font-semibold">Delta</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {Object.entries(metricLabels).map(([metricKey, label]) => {
            const metric = metricKey as keyof typeof baseline.metrics;
            const delta = metricDelta(metric, baseline, enhanced);
            return (
              <tr key={metricKey}>
                <td className="px-3 py-3 font-medium">{label}</td>
                <td className="px-3 py-3 text-muted">{metric === "davies_bouldin" ? "Lower" : "Higher"}</td>
                <td className="px-3 py-3">{formatMetric(metric, baseline.metrics[metric])}</td>
                <td className="px-3 py-3 font-semibold">{formatMetric(metric, enhanced.metrics[metric])}</td>
                <td className="px-3 py-3">
                  <DeltaBadge
                    value={delta.rawDelta}
                    improved={delta.improved}
                    precision={metric === "calinski_harabasz" ? 1 : 3}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
