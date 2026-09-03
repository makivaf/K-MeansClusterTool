import { useState, type ReactNode } from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Check, ChevronRight } from "lucide-react";
import type { SopEvaluation, UnifiedResearchRun } from "../../../../packages/shared/src";
import { ResearchPageNavigation } from "../components/layout/ResearchPageNavigation";
import { Panel } from "../components/ui/Panel";
import { useSopEvaluation } from "../hooks/useSopEvaluation";
import { PageHeading } from "./PageHeading";

type BaselineVsEnhancedPageProps = { run: UnifiedResearchRun | null };
type EvaluationTab = "sop1" | "sop2" | "sop3" | "overall";

const labels = {
  silhouette: "Silhouette",
  davies_bouldin: "Davies–Bouldin",
  calinski_harabasz: "Calinski–Harabasz"
} as const;

const metricInterpretations = {
  silhouette: "Higher values indicate better within-cluster cohesion and between-cluster separation.",
  davies_bouldin: "Lower values indicate better separation relative to within-cluster dispersion.",
  calinski_harabasz: "Higher values indicate stronger between-cluster separation relative to within-cluster dispersion."
};

const formatMetric = (metric: keyof typeof labels, value: number) =>
  metric === "calinski_harabasz" ? value.toFixed(2) : value.toFixed(4);

const formatMethodValue = (key: string, value: string | number) =>
  key === "kSelection" ? "NbClust index voting" : value;

const Stage = ({ number, title, children }: { number: number; title: string; children: ReactNode }) => (
  <section className="sop-stage">
    <div className="sop-stage-title"><span>{number}</span><h2>{title}</h2></div>
    <div className="sop-stage-body">{children}</div>
  </section>
);

const Conclusion = ({ children }: { children: ReactNode }) => (
  <div className="sop-conclusion"><Check size={17} aria-hidden="true" /><p>{children}</p></div>
);

const ClusterComposition = ({ sizes, total }: { sizes: number[]; total: number }) => (
  <div>
    <div className="flex h-2.5 overflow-hidden bg-slate-100" aria-label={`Cluster sizes ${sizes.join(", ")}`}>
      {sizes.map((size, index) => (
        <span
          key={`${index}-${size}`}
          className={index % 3 === 0 ? "bg-teal-700" : index % 3 === 1 ? "bg-sky-400" : "bg-amber-500"}
          style={{ width: `${(size / total) * 100}%`, opacity: Math.max(0.48, 1 - index * 0.07) }}
        />
      ))}
    </div>
    <div className="mt-1.5 text-[11px] tabular-nums text-muted">{sizes.map((size) => size.toLocaleString()).join(" / ")}</div>
  </div>
);

const Sop1View = ({ evaluation }: { evaluation: SopEvaluation }) => {
  const { redundancy, distanceBehavior, ablation } = evaluation.sop1;
  const [original, pca] = ablation.conditions;
  const metricKeys = Object.keys(labels) as Array<keyof typeof labels>;
  return (
    <div className="sop-flow">
      <Stage number={1} title="Problem Demonstration">
        <div className="grid gap-5 lg:grid-cols-[1fr_1.35fr]">
          <div><div className="sop-big-number">13</div><div className="text-sm font-semibold">standardized features</div><p className="mt-2 text-sm leading-6 text-muted">The original feature space contains overlapping cognitive and functional signals.</p></div>
          <div className="grid grid-cols-3 gap-3">
            <div className="sop-mini-stat"><span>{redundancy.pairCount}</span><small>feature pairs</small></div>
            <div className="sop-mini-stat"><span>{redundancy.pairsAtOrAbove070}</span><small>|r| ≥ 0.70</small></div>
            <div className="sop-mini-stat"><span>{redundancy.maximumAbsoluteCorrelation.toFixed(3)}</span><small>maximum |r|</small></div>
          </div>
        </div>
      </Stage>
      <Stage number={2} title="Enhancement Applied">
        <div className="flex flex-wrap items-center gap-4">
          <div className="sop-dimension-block"><strong>13D</strong><span>standardized</span></div>
          <ArrowRight className="text-slate-400" aria-hidden="true" />
          <div className="sop-dimension-block sop-dimension-block-active"><strong>6D</strong><span>PC1–PC6</span></div>
          <div className="min-w-[180px] flex-1 border-l border-line pl-4"><div className="text-2xl font-semibold tabular-nums text-teal-800">{(pca.varianceRetained * 100).toFixed(2)}%</div><div className="text-xs text-muted">variance retained</div></div>
        </div>
      </Stage>
      <Stage number={3} title="Controlled Comparison">
        <p className="mb-4 text-sm text-muted">Same cohort, k=2, Lloyd settings, n_init=1, and seeds 0–29; only the representation changed.</p>
        <div className="divide-y divide-line border-y border-line">
          {metricKeys.map((metric) => {
            const before = original.metrics[metric].mean;
            const after = pca.metrics[metric].mean;
            const change = ablation.metricChanges[metric].relativeMeanChangePercent;
            const DirectionIcon = metric === "davies_bouldin" ? ArrowDownRight : ArrowUpRight;
            return <div key={metric} className="grid gap-2 py-3 sm:grid-cols-[1.25fr_1fr_auto_1fr_1fr] sm:items-center">
              <div className="text-sm font-semibold">{labels[metric]}</div>
              <div className="text-sm tabular-nums"><span className="mr-2 text-xs text-muted">13D</span>{formatMetric(metric, before)}</div>
              <ArrowRight className="hidden text-slate-400 sm:block" size={15} aria-hidden="true" />
              <div className="text-sm font-semibold tabular-nums text-teal-800"><span className="mr-2 text-xs font-normal text-muted">6D</span>{formatMetric(metric, after)}</div>
              <div className="flex items-center gap-1 text-sm font-semibold text-teal-800"><DirectionIcon size={15} />{Math.abs(change).toFixed(2)}%</div>
            </div>;
          })}
        </div>
      </Stage>
      <Stage number={4} title="Finding">
        <Conclusion>PCA reduced 13 correlated dimensions to 6 while retaining 87.48% of variance, and the matched random-seed ablation improved all three mean internal-validity metrics.</Conclusion>
      </Stage>
      <details className="research-disclosure"><summary>Correlation, distance, and ablation details</summary><div className="grid gap-6 py-5 xl:grid-cols-2">
        <div><h3 className="text-sm font-semibold">Strongest absolute correlations</h3><div className="mt-3 overflow-x-auto"><table className="research-table"><thead><tr><th>Feature pair</th><th className="text-right">r</th></tr></thead><tbody>{redundancy.topCorrelatedPairs.map((pair) => <tr key={`${pair.featureA}-${pair.featureB}`}><td>{pair.featureA} × {pair.featureB}</td><td className="text-right tabular-nums">{pair.correlation.toFixed(4)}</td></tr>)}</tbody></table></div></div>
        <div><h3 className="text-sm font-semibold">Aggregate pairwise distance behavior</h3><div className="mt-3 overflow-x-auto"><table className="research-table"><thead><tr><th>Representation</th><th className="text-right">Mean</th><th className="text-right">CV</th><th className="text-right">5th–95th</th></tr></thead><tbody>{distanceBehavior.map((item) => <tr key={item.representation}><td>{item.representation}</td><td className="text-right tabular-nums">{item.mean.toFixed(3)}</td><td className="text-right tabular-nums">{item.coefficientOfVariation.toFixed(3)}</td><td className="text-right tabular-nums">{item.fifthPercentile.toFixed(2)}–{item.ninetyFifthPercentile.toFixed(2)}</td></tr>)}</tbody></table></div><p className="mt-3 text-xs leading-5 text-muted">Based on {distanceBehavior[0].pairCount.toLocaleString()} unique participant pairs; only aggregate distance statistics are shown.</p></div>
      </div></details>
    </div>
  );
};

const Sop2View = ({ evaluation }: { evaluation: SopEvaluation }) => {
  const { demonstratedK, candidates, maximumSilhouetteSelectedK, nbclust } = evaluation.sop2;
  const maximumSilhouette = Math.max(...candidates.map((candidate) => candidate.silhouette));
  const maximumVotes = Math.max(...nbclust.voteDistribution.map((entry) => entry.votes));
  return (
    <div className="sop-flow">
      <Stage number={1} title="Problem Demonstration">
        <p className="mb-4 text-sm text-muted">Supplying different k values to the same real PC1–PC6 representation changes both geometry and group composition.</p>
        <div className="grid gap-4 md:grid-cols-3">{demonstratedK.map((candidate) => <article key={candidate.k} className={`sop-k-card ${candidate.k === 2 ? "sop-k-card-selected" : ""}`}><div className="flex items-baseline justify-between"><h3>k={candidate.k}</h3><span>Sil. {candidate.silhouette.toFixed(3)}</span></div><div className="mt-4"><ClusterComposition sizes={candidate.clusterSizes} total={evaluation.cohortN} /></div><dl className="mt-4 grid grid-cols-2 gap-2 text-xs"><div><dt>DBI</dt><dd>{candidate.daviesBouldin.toFixed(3)}</dd></div><div><dt>CH</dt><dd>{candidate.calinskiHarabasz.toFixed(1)}</dd></div></dl></article>)}</div>
      </Stage>
      <Stage number={2} title="Enhancement Applied">
        <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
          <div><div className="text-4xl font-semibold tracking-tight text-teal-800">9 / 24</div><div className="mt-1 text-sm font-semibold">NbClust votes for k=2</div><p className="mt-2 text-sm leading-6 text-muted">Twenty-four usable indices contribute to one systematic selection process.</p></div>
          <div className="space-y-2">{nbclust.voteDistribution.map((entry) => <div key={entry.k} className="grid grid-cols-[28px_1fr_24px] items-center gap-2 text-xs"><span>k={entry.k}</span><div className="h-2 bg-slate-100"><div className="h-full bg-teal-700" style={{ width: `${maximumVotes === 0 ? 0 : (entry.votes / maximumVotes) * 100}%` }} /></div><span className="text-right tabular-nums">{entry.votes}</span></div>)}</div>
        </div>
      </Stage>
      <Stage number={3} title="Controlled Comparison">
        <div className="grid gap-4 sm:grid-cols-2"><div className="sop-selection"><small>Maximum Silhouette</small><strong>k={maximumSilhouetteSelectedK}</strong><span>single-index baseline</span></div><div className="sop-selection sop-selection-active"><small>NbClust index voting</small><strong>k={nbclust.selectedK}</strong><span>{nbclust.votesForSelectedK} of {nbclust.usableIndices} usable votes</span></div></div>
        <div className="mt-5 space-y-2">{candidates.map((candidate) => <div key={candidate.k} className="grid grid-cols-[32px_1fr_54px] items-center gap-3 text-xs"><span className={candidate.k === 2 ? "font-semibold text-teal-800" : "text-muted"}>k={candidate.k}</span><div className="h-2 bg-slate-100"><div className={candidate.k === 2 ? "h-full bg-teal-700" : "h-full bg-slate-400"} style={{ width: `${(candidate.silhouette / maximumSilhouette) * 100}%` }} /></div><span className="text-right tabular-nums">{candidate.silhouette.toFixed(3)}</span></div>)}</div>
      </Stage>
      <Stage number={4} title="Finding"><Conclusion>Both methods selected k=2 here. NbClust’s demonstrated improvement is a systematic multi-index decision process—not a different cluster count.</Conclusion></Stage>
      <details className="research-disclosure"><summary>Full k=2–10 metrics and cluster sizes</summary><div className="py-5 overflow-x-auto"><table className="research-table min-w-[780px]"><thead><tr><th>k</th><th>Cluster sizes</th><th className="text-right">Silhouette</th><th className="text-right">DBI</th><th className="text-right">CH</th><th className="text-right">Iterations</th></tr></thead><tbody>{candidates.map((candidate) => <tr key={candidate.k} className={candidate.k === 2 ? "bg-teal-50/60" : ""}><td className="font-semibold">{candidate.k}</td><td className="tabular-nums">{candidate.clusterSizes.join(" / ")}</td><td className="text-right tabular-nums">{candidate.silhouette.toFixed(6)}</td><td className="text-right tabular-nums">{candidate.daviesBouldin.toFixed(6)}</td><td className="text-right tabular-nums">{candidate.calinskiHarabasz.toFixed(3)}</td><td className="text-right tabular-nums">{candidate.iterations}</td></tr>)}</tbody></table></div></details>
    </div>
  );
};

const Sop3View = ({ evaluation }: { evaluation: SopEvaluation }) => {
  const { firstThreeRandomRuns, randomRunSummary, partitionStability, dpcDeterminism } = evaluation.sop3;
  const metricRows = [
    ["Silhouette", randomRunSummary.silhouette],
    ["Davies–Bouldin", randomRunSummary.davies_bouldin],
    ["Calinski–Harabasz", randomRunSummary.calinski_harabasz]
  ] as const;
  return (
    <div className="sop-flow">
      <Stage number={1} title="Problem Demonstration">
        <div className="grid gap-4 sm:grid-cols-[auto_1fr] sm:items-center">
          <div className="sop-big-number">30</div>
          <div><div className="text-sm font-semibold">random-initialization runs</div><p className="mt-1 text-sm leading-6 text-muted">The same PC1–PC6 data and Lloyd settings were rerun with n_init=1 and predetermined seeds 0–29.</p></div>
        </div>
      </Stage>
      <Stage number={2} title="Enhancement Applied">
        <div className="grid gap-5 sm:grid-cols-[1fr_auto] sm:items-center"><div><h3 className="text-base font-semibold">Density Peaks initialization</h3><p className="mt-1 text-sm leading-6 text-muted">The same data-derived centroid initialization was repeated independently.</p></div><div className="flex gap-2" aria-label="Three passed determinism checks">{Array.from({ length: dpcDeterminism.repeatedChecks }, (_, index) => <span key={index} className="flex h-9 w-9 items-center justify-center bg-teal-700 text-white"><Check size={18} /></span>)}</div></div>
      </Stage>
      <Stage number={3} title="Controlled Comparison">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sop-selection"><small>Random initialization · 30 runs</small><strong>{partitionStability.distinctLabelInvariantPartitions} partitions</strong><span>Label-invariant partitions · mean pairwise ARI {partitionStability.meanPairwiseAdjustedRandIndex.toFixed(4)} · small metric variation</span></div>
          <div className="sop-selection sop-selection-active"><small>DPC · {dpcDeterminism.repeatedChecks} repeated checks</small><strong>Identical</strong><span>Identical initialization and identical final output across repeated checks</span></div>
        </div>
      </Stage>
      <Stage number={4} title="Finding"><Conclusion>DPC did not improve clustering geometry in this controlled comparison. Its demonstrated benefit is deterministic reproducibility and removal of arbitrary seed dependence.</Conclusion></Stage>
      <details className="research-disclosure"><summary>Predetermined seeds, 30-run variability, and DPC details</summary><div className="py-5"><h3 className="text-sm font-semibold">First three predetermined seeds</h3><p className="mt-1 text-xs leading-5 text-muted">Cluster labels are arbitrary, so sizes are normalized from largest to smallest for display and are not treated as evidence of instability.</p><div className="mt-3 grid gap-3 md:grid-cols-3">{firstThreeRandomRuns.map((run) => { const normalizedSizes = [...run.clusterSizes].sort((left, right) => right - left); return <article key={run.seed} className="sop-seed-run"><div className="flex items-center justify-between"><h3>Seed {run.seed}</h3><span>{run.iterations} iterations</span></div><ClusterComposition sizes={normalizedSizes} total={evaluation.cohortN} /><div className="mt-3 text-sm font-semibold tabular-nums">Silhouette {run.silhouette.toFixed(4)}</div></article>; })}</div><div className="mt-6 grid gap-6 xl:grid-cols-2"><div><h3 className="text-sm font-semibold">Random initialization summary</h3><div className="mt-3 overflow-x-auto"><table className="research-table"><thead><tr><th>Metric</th><th className="text-right">Mean</th><th className="text-right">SD</th><th className="text-right">Range</th></tr></thead><tbody>{metricRows.map(([label, metric]) => <tr key={label}><td>{label}</td><td className="text-right tabular-nums">{metric.mean.toFixed(6)}</td><td className="text-right tabular-nums">{metric.standardDeviation.toFixed(6)}</td><td className="text-right tabular-nums">{metric.minimum.toFixed(4)}–{metric.maximum.toFixed(4)}</td></tr>)}</tbody></table></div></div><div><h3 className="text-sm font-semibold">Repeated DPC result</h3><dl className="mt-3 space-y-3 text-sm"><div className="flex justify-between border-b border-line pb-2"><dt className="text-muted">Cluster sizes</dt><dd className="font-semibold tabular-nums">{dpcDeterminism.clusterSizes.join(" / ")}</dd></div><div className="flex justify-between border-b border-line pb-2"><dt className="text-muted">Silhouette</dt><dd className="font-semibold tabular-nums">{dpcDeterminism.metrics.silhouette.toFixed(6)}</dd></div><div className="flex justify-between border-b border-line pb-2"><dt className="text-muted">Identical centroid matrix</dt><dd className="font-semibold text-teal-800">Yes</dd></div><div className="flex justify-between"><dt className="text-muted">Identical output</dt><dd className="font-semibold text-teal-800">Yes</dd></div></dl></div></div></div></details>
    </div>
  );
};

const OverallView = ({ run }: { run: UnifiedResearchRun }) => {
  const comparison = run.baselineComparison;
  return <div className="pt-6">
    <Panel title="Primary finding" variant="result"><p className="max-w-4xl text-base leading-7 text-ink">The complete enhanced pipeline produced better internal clustering validity values than the defined baseline under all three selected metrics.</p></Panel>
    <div className="mt-8 grid gap-x-6 gap-y-5 xl:grid-cols-3">{comparison.metrics.map((metric) => { const isLower = metric.direction === "lower"; const DirectionIcon = isLower ? ArrowDownRight : ArrowUpRight; return <article key={metric.metric} className="border-y border-line py-4"><div><h2 className="font-semibold">{labels[metric.metric]}</h2><p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{isLower ? "Lower is better" : "Higher is better"}</p></div><div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-end gap-3 text-sm"><div><div className="text-xs text-muted">Standard</div><div className="mt-1 font-semibold tabular-nums">{formatMetric(metric.metric, metric.baselineValue)}</div></div><ArrowRight className="mb-0.5 text-slate-400" size={16} /><div className="text-right"><div className="text-xs text-teal-800">Complete enhanced</div><div className="mt-1 font-semibold text-teal-800 tabular-nums">{formatMetric(metric.metric, metric.enhancedValue)}</div></div></div><div className="mt-4 flex items-center gap-2 border-t border-line pt-3 text-sm font-semibold text-teal-800"><DirectionIcon size={17} />{Math.abs(metric.signedRelativeChangePercent).toFixed(2)}% {isLower ? "lower" : "higher"}</div></article>; })}</div>
    <Panel title="Simple interpretation" className="mt-8" variant="section"><ul className="space-y-3 text-sm leading-6">{comparison.metrics.map((metric) => <li key={metric.metric}><span className="font-semibold">{labels[metric.metric]}:</span> <span className="text-muted">{metricInterpretations[metric.metric]}</span></li>)}</ul><p className="mt-4 text-xs leading-5 text-muted">These internal validity metrics characterize clustering geometry; they do not establish clinical validity.</p></Panel>
    <div className="mt-6 border-l-2 border-amber-500 bg-amber-50/60 px-4 py-3 text-sm leading-6 text-amber-950"><div className="font-semibold">Complete-pipeline attribution limitation</div><p className="mt-1">{comparison.caution}</p></div>
    <details className="research-disclosure"><summary>Controlled DPC comparison retained from the original evaluation</summary><div className="py-5"><p className="text-sm leading-6 text-muted">{comparison.controlledDpcInitializationComparison.purpose}</p><div className="mt-4 overflow-x-auto"><table className="research-table min-w-[560px]"><thead><tr><th>Metric</th><th className="text-right">Random mean</th><th className="text-right">DPC</th><th className="text-right">Assessment</th></tr></thead><tbody>{comparison.controlledDpcInitializationComparison.metrics.map((metric) => <tr key={metric.metric}><td className="font-medium">{labels[metric.metric]}</td><td className="text-right tabular-nums">{formatMetric(metric.metric, metric.randomMean)}</td><td className="text-right tabular-nums">{formatMetric(metric.metric, metric.dpcValue)}</td><td className="text-right capitalize text-muted">{metric.dpcAssessment}</td></tr>)}</tbody></table></div></div></details>
    <details className="research-disclosure"><summary>Standard and complete enhanced methods</summary><div className="grid gap-4 py-5 lg:grid-cols-2"><section><h2 className="font-semibold">Defined Baseline K-Means</h2><dl className="mt-4 space-y-3 text-sm">{Object.entries(comparison.baselineMethod).map(([key, value]) => <div key={key} className="flex justify-between gap-5 border-b border-line pb-3 last:border-0"><dt className="capitalize text-muted">{key.replace(/([A-Z])/g, " $1")}</dt><dd className="max-w-[65%] text-right font-semibold">{formatMethodValue(key, value)}</dd></div>)}</dl></section><section><h2 className="font-semibold">Enhanced K-Means</h2><dl className="mt-4 space-y-3 text-sm">{Object.entries(comparison.enhancedMethod).map(([key, value]) => <div key={key} className="flex justify-between gap-5 border-b border-line pb-3 last:border-0"><dt className="capitalize text-muted">{key.replace(/([A-Z])/g, " $1")}</dt><dd className="max-w-[65%] text-right font-semibold text-teal-800">{formatMethodValue(key, value)}</dd></div>)}</dl></section></div></details>
  </div>;
};

const tabs: Array<{ id: EvaluationTab; label: string }> = [
  { id: "sop1", label: "SOP 1 PCA" },
  { id: "sop2", label: "SOP 2 NbClust" },
  { id: "sop3", label: "SOP 3 DPC" },
  { id: "overall", label: "Overall" }
];

export const BaselineVsEnhancedPage = ({ run }: BaselineVsEnhancedPageProps) => {
  const [activeTab, setActiveTab] = useState<EvaluationTab>("sop1");
  const { evaluation, error } = useSopEvaluation();
  if (!run) return null;
  return <>
    <PageHeading title="SOP Simulation / Enhancement Evaluation" description="Controlled simulations translate the original proposal-defense demonstrations to the frozen 2,437-participant ADNI cohort." />
    <div className="sop-tabs" role="tablist" aria-label="Enhancement evaluation sections">{tabs.map((tab) => <button key={tab.id} type="button" role="tab" aria-selected={activeTab === tab.id} aria-controls={`panel-${tab.id}`} onClick={() => setActiveTab(tab.id)}>{tab.label}<ChevronRight size={14} aria-hidden="true" /></button>)}</div>
    <div id={`panel-${activeTab}`} role="tabpanel" tabIndex={0} className="min-h-[420px]">
      {activeTab === "overall" ? <OverallView run={run} /> : !evaluation ? <div className={`mt-6 border-l-2 px-4 py-3 text-sm ${error ? "border-red-400 bg-red-50 text-red-800" : "border-slate-300 bg-white text-muted"}`}>{error ?? "Loading aggregate SOP evaluation…"}</div> : activeTab === "sop1" ? <Sop1View evaluation={evaluation} /> : activeTab === "sop2" ? <Sop2View evaluation={evaluation} /> : <Sop3View evaluation={evaluation} />}
    </div>
    <ResearchPageNavigation currentPath="/enhancement-evaluation" />
  </>;
};
