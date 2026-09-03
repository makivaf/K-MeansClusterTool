import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import type { UnifiedResearchRun } from "../../../../packages/shared/src";
import { ResearchPageNavigation } from "../components/layout/ResearchPageNavigation";
import { Panel } from "../components/ui/Panel";
import { PageHeading } from "./PageHeading";

type BaselineVsEnhancedPageProps = { run: UnifiedResearchRun | null };

const labels = {
  silhouette: "Silhouette",
  davies_bouldin: "Davies–Bouldin",
  calinski_harabasz: "Calinski–Harabasz"
};

const metricInterpretations = {
  silhouette: "Higher values indicate better within-cluster cohesion and between-cluster separation.",
  davies_bouldin: "Lower values indicate better separation relative to within-cluster dispersion.",
  calinski_harabasz: "Higher values indicate stronger between-cluster separation relative to within-cluster dispersion."
};

const formatMetric = (_metric: keyof typeof labels, value: number) => value.toFixed(6);

const formatMethodValue = (key: string, value: string | number) =>
  key === "kSelection" ? "NbClust index voting" : value;

export const BaselineVsEnhancedPage = ({ run }: BaselineVsEnhancedPageProps) => {
  if (!run) return null;
  const comparison = run.baselineComparison;
  return (
    <>
      <PageHeading title="Enhancement Evaluation" description="The complete enhanced pipeline is compared with the defined baseline on the same 2,437-participant cohort using three internal clustering-validity metrics." />

      <Panel title="Primary finding" variant="result">
        <p className="max-w-4xl text-base leading-7 text-ink">The complete enhanced pipeline produced better internal clustering validity values than the defined baseline under all three selected metrics.</p>
      </Panel>

      <div className="mt-8 grid gap-x-6 gap-y-5 xl:grid-cols-3">
        {comparison.metrics.map((metric) => {
          const isLower = metric.direction === "lower";
          const DirectionIcon = isLower ? ArrowDownRight : ArrowUpRight;
          return (
            <article key={metric.metric} className="border-y border-line py-4">
              <div><h2 className="font-semibold">{labels[metric.metric]}</h2><p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{isLower ? "Lower is better" : "Higher is better"}</p></div>
              <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-end gap-3 text-sm"><div><div className="text-xs text-muted">Baseline</div><div className="mt-1 font-semibold tabular-nums">{formatMetric(metric.metric, metric.baselineValue)}</div></div><ArrowRight className="mb-0.5 text-slate-400" size={16} aria-hidden="true" /><div className="text-right"><div className="text-xs text-teal-800">Enhanced</div><div className="mt-1 font-semibold text-teal-800 tabular-nums">{formatMetric(metric.metric, metric.enhancedValue)}</div></div></div>
              <div className="mt-4 flex items-center gap-2 border-t border-line pt-3 text-sm font-semibold text-teal-800"><DirectionIcon size={17} aria-hidden="true" />{Math.abs(metric.signedRelativeChangePercent).toFixed(2)}% {isLower ? "lower" : "higher"}</div>
            </article>
          );
        })}
      </div>

      <Panel title="Simple interpretation" className="mt-8" variant="section">
        <ul className="space-y-3 text-sm leading-6">
          {comparison.metrics.map((metric) => <li key={metric.metric}><span className="font-semibold">{labels[metric.metric]}:</span> <span className="text-muted">{metricInterpretations[metric.metric]}</span></li>)}
        </ul>
        <p className="mt-4 text-xs leading-5 text-muted">These internal validity metrics characterize clustering geometry; they do not establish clinical validity.</p>
      </Panel>

      <div className="mt-6 border-l-2 border-amber-500 bg-amber-50/60 px-4 py-3 text-sm leading-6 text-amber-950">
        <div className="font-semibold">Complete-pipeline attribution limitation</div>
        <p className="mt-1">{comparison.caution}</p>
      </div>

      <details className="research-disclosure">
        <summary>Secondary evidence: controlled DPC initialization comparison</summary>
        <div className="py-5">
          <p className="text-sm leading-6 text-muted">{comparison.controlledDpcInitializationComparison.purpose}</p>
          <p className="mt-2 text-xs leading-5 text-muted">{comparison.controlledDpcInitializationComparison.scope}</p>
          <div className="mt-4 overflow-x-auto"><table className="research-table min-w-[560px]"><thead><tr><th>Metric</th><th className="text-right">Random mean</th><th className="text-right">DPC</th><th className="text-right">Assessment</th></tr></thead><tbody>{comparison.controlledDpcInitializationComparison.metrics.map((metric) => <tr key={metric.metric}><td className="font-medium">{labels[metric.metric]}</td><td className="text-right tabular-nums">{formatMetric(metric.metric, metric.randomMean)}</td><td className="text-right tabular-nums">{formatMetric(metric.metric, metric.dpcValue)}</td><td className="text-right capitalize text-muted">{metric.dpcAssessment}</td></tr>)}</tbody></table></div>
          <div className="mt-4 border-l-2 border-slate-400 bg-slate-50 px-4 py-3 text-sm leading-6"><p>DPC was not uniformly geometrically superior to random initialization.</p><p className="mt-1 font-semibold">Its strongest demonstrated contribution was deterministic and reproducible initialization.</p></div>
        </div>
      </details>

      <details className="research-disclosure">
        <summary>Methods and repeated-run diagnostics</summary>
        <div className="py-5">
          <div className="grid gap-4 lg:grid-cols-2">
            <section><h2 className="font-semibold">Defined Baseline K-Means</h2><dl className="mt-4 space-y-3 text-sm">{Object.entries(comparison.baselineMethod).filter(([key]) => key !== "runCount").map(([key, value]) => <div key={key} className="flex justify-between gap-5 border-b border-line pb-3 last:border-0"><dt className="capitalize text-muted">{key.replace(/([A-Z])/g, " $1")}</dt><dd className="max-w-[65%] text-right font-semibold">{formatMethodValue(key, value)}</dd></div>)}<div className="flex justify-between gap-5"><dt className="text-muted">Independent runs</dt><dd className="font-semibold">{comparison.baselineMethod.runCount}</dd></div></dl></section>
            <section><h2 className="font-semibold">Enhanced K-Means</h2><dl className="mt-4 space-y-3 text-sm">{Object.entries(comparison.enhancedMethod).map(([key, value]) => <div key={key} className="flex justify-between gap-5 border-b border-line pb-3 last:border-0"><dt className="capitalize text-muted">{key.replace(/([A-Z])/g, " $1")}</dt><dd className="max-w-[65%] text-right font-semibold text-teal-800">{formatMethodValue(key, value)}</dd></div>)}</dl></section>
          </div>
          <div className="mt-5 overflow-x-auto"><table className="research-table min-w-[620px]"><thead><tr><th>Metric</th><th className="text-right">Baseline SD</th><th className="text-right">Baseline minimum</th><th className="text-right">Baseline maximum</th></tr></thead><tbody>{comparison.metrics.map((metric) => <tr key={metric.metric}><td className="font-medium">{labels[metric.metric]}</td><td className="text-right tabular-nums">{formatMetric(metric.metric, metric.baselineStandardDeviation)}</td><td className="text-right tabular-nums">{formatMetric(metric.metric, metric.baselineMinimum)}</td><td className="text-right tabular-nums">{formatMetric(metric.metric, metric.baselineMaximum)}</td></tr>)}</tbody></table></div>
        </div>
      </details>
      <ResearchPageNavigation currentPath="/enhancement-evaluation" />
    </>
  );
};
