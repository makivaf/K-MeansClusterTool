import { ArrowDownRight, ArrowUpRight, CheckCircle2 } from "lucide-react";
import type { UnifiedResearchRun } from "../../../../packages/shared/src";
import { Panel } from "../components/ui/Panel";
import { PageHeading } from "./PageHeading";

type BaselineVsEnhancedPageProps = { run: UnifiedResearchRun | null };

const labels = {
  silhouette: "Silhouette",
  davies_bouldin: "Davies–Bouldin",
  calinski_harabasz: "Calinski–Harabasz"
};

const formatMetric = (metric: keyof typeof labels, value: number) =>
  metric === "calinski_harabasz" ? value.toFixed(3) : value.toFixed(6);

const formatMethodValue = (key: string, value: string | number) =>
  key === "kSelection" ? "NbClust index voting" : value;

export const BaselineVsEnhancedPage = ({ run }: BaselineVsEnhancedPageProps) => {
  if (!run) return null;
  const comparison = run.baselineComparison;
  return (
    <>
      <PageHeading title="Baseline vs Enhanced" description="Complete-pipeline comparison on the same 2,437-participant cohort, sourced directly from the validated aggregate research result." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Defined Baseline K-Means">
          <dl className="space-y-3 text-sm">
            {Object.entries(comparison.baselineMethod).filter(([key]) => key !== "runCount").map(([key, value]) => <div key={key} className="flex justify-between gap-5 border-b border-line pb-3 last:border-0"><dt className="capitalize text-muted">{key.replace(/([A-Z])/g, " $1")}</dt><dd className="max-w-[65%] text-right font-semibold">{formatMethodValue(key, value)}</dd></div>)}
            <div className="flex justify-between gap-5"><dt className="text-muted">Independent runs</dt><dd className="font-semibold">{comparison.baselineMethod.runCount}</dd></div>
          </dl>
        </Panel>
        <Panel title="Enhanced K-Means">
          <dl className="space-y-3 text-sm">
            {Object.entries(comparison.enhancedMethod).map(([key, value]) => <div key={key} className="flex justify-between gap-5 border-b border-line pb-3 last:border-0"><dt className="capitalize text-muted">{key.replace(/([A-Z])/g, " $1")}</dt><dd className="max-w-[65%] text-right font-semibold text-teal-800">{formatMethodValue(key, value)}</dd></div>)}
          </dl>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        {comparison.metrics.map((metric) => {
          const isLower = metric.direction === "lower";
          const DirectionIcon = isLower ? ArrowDownRight : ArrowUpRight;
          return (
            <article key={metric.metric} className="rounded-xl border border-teal-100 bg-white p-5 shadow-panel">
              <div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold">{labels[metric.metric]}</h2><p className="mt-1 text-xs font-medium text-muted">{isLower ? "Lower is better" : "Higher is better"}</p></div><CheckCircle2 className="text-emerald-600" size={21} /></div>
              <div className="mt-5 grid grid-cols-2 gap-3 text-sm"><div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-muted">Baseline</div><div className="mt-1 text-lg font-semibold tabular-nums">{formatMetric(metric.metric, metric.baselineValue)}</div></div><div className="rounded-lg bg-teal-50 p-3"><div className="text-xs text-teal-800">Enhanced</div><div className="mt-1 text-lg font-semibold text-teal-800 tabular-nums">{formatMetric(metric.metric, metric.enhancedValue)}</div></div></div>
              <p className="mt-3 text-xs leading-5 text-muted">30-run baseline SD {formatMetric(metric.metric, metric.baselineStandardDeviation)}; range {formatMetric(metric.metric, metric.baselineMinimum)} to {formatMetric(metric.metric, metric.baselineMaximum)}</p>
              <div className="mt-4 flex items-center gap-2 text-sm font-semibold text-emerald-700"><DirectionIcon size={18} />{Math.abs(metric.signedRelativeChangePercent).toFixed(2)}% {isLower ? "lower" : "higher"}</div>
            </article>
          );
        })}
      </div>

      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">{comparison.caution}</div>

      <details className="mt-4 rounded-xl border border-line bg-white shadow-sm">
        <summary className="cursor-pointer px-5 py-4 font-semibold">Controlled DPC initialization comparison</summary>
        <div className="border-t border-line p-5">
          <p className="text-sm leading-6 text-muted">{comparison.controlledDpcInitializationComparison.purpose}</p>
          <p className="mt-2 text-xs leading-5 text-muted">{comparison.controlledDpcInitializationComparison.scope}</p>
          <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[560px] text-sm"><thead><tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted"><th className="py-3">Metric</th><th className="py-3 text-right">Random mean</th><th className="py-3 text-right">DPC</th><th className="py-3 text-right">Assessment</th></tr></thead><tbody>{comparison.controlledDpcInitializationComparison.metrics.map((metric) => <tr key={metric.metric} className="border-b border-line last:border-0"><td className="py-3 font-medium">{labels[metric.metric]}</td><td className="py-3 text-right tabular-nums">{formatMetric(metric.metric, metric.randomMean)}</td><td className="py-3 text-right tabular-nums">{formatMetric(metric.metric, metric.dpcValue)}</td><td className="py-3 text-right capitalize">{metric.dpcAssessment}</td></tr>)}</tbody></table></div>
        </div>
      </details>
    </>
  );
};
