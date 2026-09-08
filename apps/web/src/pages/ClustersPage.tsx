import { useState, type CSSProperties, type ReactNode } from "react";
import { CheckCircle2 } from "lucide-react";
import type { BaselineCandidateSweep, DefenseGeometry, DefensePanel, SopEvaluation, UnifiedResearchRun } from "../../../../packages/shared/src";
import { ClusterDifferenceFigure, FinalNbClustFigure, InternalValidationFigure, PcaVarianceFigure } from "../components/charts/FinalFindingsCharts";
import { LongitudinalProgressionChart } from "../components/charts/LongitudinalProgressionChart";
import { DefenseScatter } from "../components/charts/DefenseScatter";
import { SopRunSeriesChart } from "../components/charts/SopRunSeriesChart";
import { ResearchPageNavigation } from "../components/layout/ResearchPageNavigation";
import { StatCard } from "../components/ui/StatCard";
import { useSopEvaluation } from "../hooks/useSopEvaluation";
import { getMeasureLabel } from "../utils/measureLabels";

type ClustersPageProps = { run: UnifiedResearchRun | null };
type SummaryTab = "pca" | "nbclust" | "dpc" | "fullComparison" | "profiles" | "longitudinal";
type ComparisonMetric = UnifiedResearchRun["baselineComparison"]["metrics"][number];
type SopMetric = keyof SopEvaluation["sop1"]["ablation"]["conditions"][number]["metrics"];
type DpcStabilityTab = "three" | "thirty" | "summary";
type SopRunResult = {
  representation: string;
  dimensions?: number;
  runCount: number | string;
  metrics: Record<SopMetric, { mean: number; standardDeviation?: number }>;
};

const summaryTabs: Array<{ id: SummaryTab; label: string }> = [
  { id: "pca", label: "SOP 1 — PCA" },
  { id: "nbclust", label: "SOP 2 — NBCLUST" },
  { id: "dpc", label: "SOP 3 — DPC" },
  { id: "fullComparison", label: "FULL COMPARISON" },
  { id: "profiles", label: "CLUSTER PROFILE" },
  { id: "longitudinal", label: "LONGITUDINAL PROGRESSION" }
];

const metricLabels: Record<ComparisonMetric["metric"], string> = {
  silhouette: "Silhouette",
  davies_bouldin: "Davies-Bouldin",
  calinski_harabasz: "Calinski-Harabasz"
};

const formatComparisonMetric = (_metric: ComparisonMetric["metric"], value: number) => value.toFixed(5);

const formatPercent = (value: number) => `${(value * 100).toFixed(2)}%`;

const formatPValue = (value: number) => value.toFixed(5);

const sopMetricLabels: Record<SopMetric, string> = {
  silhouette: "Silhouette",
  davies_bouldin: "Davies-Bouldin",
  calinski_harabasz: "Calinski-Harabasz"
};

const formatSopMetric = (_metric: SopMetric, value: number) => value.toFixed(5);
const formatSignedPercent = (value: number) => `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;

const fromSop2Condition = (condition: NonNullable<SopEvaluation["sop2"]["controlledComparison"]>["control"]): SopRunResult => ({
  representation: `${condition.representation}, k=${condition.selectedK}`,
  dimensions: condition.dimensions,
  runCount: condition.runCount,
  metrics: condition.metrics
});

const ClusterComposition = ({ clusters, total }: { clusters: Array<{ clusterId: number; nMembers: number }>; total: number }) => (
  <div>
    <div className="flex h-3 overflow-hidden rounded-full bg-slate-100" aria-label="Cluster-size composition">
      {clusters.map((cluster) => (
        <span
          key={cluster.clusterId}
          className={cluster.clusterId === 0 ? "bg-teal-700" : "bg-amber-500"}
          style={{ width: `${(cluster.nMembers / total) * 100}%` }}
        />
      ))}
    </div>
    <div className="existing-cluster-legend summary-compact-legend">
      {clusters.map((cluster) => (
        <div key={cluster.clusterId}>
          <span aria-hidden="true" className={cluster.clusterId === 0 ? "bg-teal-700" : "bg-amber-500"} />
          <strong>Cluster {cluster.clusterId}</strong>
        </div>
      ))}
    </div>
  </div>
);

const SopClusterCounts = ({ sizes }: { sizes: number[] }) => {
  const total = sizes.reduce((sum, size) => sum + size, 0);
  return (
    <div className="summary-sop-counts" aria-label="Cluster membership counts">
      <p>Cluster membership counts for k = {sizes.length}</p>
      {sizes.map((size, clusterId) => (
        <div key={clusterId}>
          <span>Cluster {clusterId}</span>
          <div><i style={{ width: `${(size / total) * 100}%` }} /></div>
          <strong>{size.toLocaleString()}</strong>
        </div>
      ))}
    </div>
  );
};

const SopProjectionPanel = ({ title, subtitle, sizes, panel }: { title: string; subtitle: string; sizes?: number[]; panel: DefensePanel | null }) => (
  <article className="existing-card summary-sop-result-card">
    <div className="summary-sop-result-heading">
      <div>
        <p>{subtitle}</p>
        <h3>{title}</h3>
        <span>Common PC1-PC2 projection · representative seed 0</span>
      </div>
    </div>
    <DefenseScatter panel={panel} label={title} />
    {sizes ? <SopClusterCounts sizes={sizes} /> : null}
  </article>
);

const FindingNote = ({ children }: { children: ReactNode }) => (
  <div className="summary-finding-note">
    <CheckCircle2 size={17} aria-hidden="true" />
    <p>{children}</p>
  </div>
);

const OverviewTab = ({ run }: { run: UnifiedResearchRun }) => {
  const clusters = [...run.enhancedClustering.clusterSizes].sort((left, right) => left.clusterId - right.clusterId);
  const annualChange = new Map(run.longitudinal.mixedEffects.estimatedAnnualChangeByOriginalCluster.map((entry) => [entry.clusterId, entry]));

  return (
    <div className="summary-tab-panel">
      <section className="existing-grid">
        <article className="existing-card existing-card-large">
          <div className="existing-card-header">
            <div>
              <p>Comparison and Findings</p>
              <h2>Validated unified result</h2>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Participants" value={run.cohort.parentN.toLocaleString()} accent="teal" />
            <StatCard label="Retained variables" value={run.preprocessing.retainedFeatures.length} />
            <StatCard label="PCA retained" value={`${run.pca.components} PCs`} detail={formatPercent(run.pca.cumulativeExplainedVariance)} />
            <StatCard label="NbClust selected" value={`k=${run.kSelection.selectedK}`} detail={`${run.kSelection.votesForSelectedK}/${run.kSelection.usableVotes} usable votes`} accent="teal" />
          </div>
          <div className="mt-5">
            <ClusterComposition clusters={clusters} total={run.cohort.parentN} />
          </div>
        </article>

        <article className="existing-card">
          <div className="existing-card-header">
            <div>
              <p>Scope</p>
              <h2>Descriptive comparison</h2>
            </div>
          </div>
          <div className="space-y-3 text-sm leading-6 text-muted">
            <p>Clusters are algorithmically identified aggregate groups, not diagnoses, clinical Alzheimer&apos;s subtypes, predictions, prognoses, or causal claims.</p>
            <p>Longitudinal analysis follows the same baseline clusters over time; no second longitudinal K-Means clustering is performed.</p>
          </div>
        </article>
      </section>

      <section className="existing-card">
        <div className="existing-card-header">
          <div>
            <p>Primary Finding</p>
            <h2>Enhanced pipeline improves internal validation</h2>
          </div>
        </div>
        <div className="existing-metrics summary-metric-grid">
          {run.baselineComparison.metrics.map((metric) => (
            <div key={metric.metric}>
              <span>{metricLabels[metric.metric]}</span>
              <strong>{Math.abs(metric.signedRelativeChangePercent).toFixed(2)}%</strong>
              <small>{metric.direction === "lower" ? "lower is better" : "higher is better"} vs baseline K-Means</small>
            </div>
          ))}
        </div>
      </section>

      <section className="existing-grid">
        <article className="existing-card">
          <div className="existing-card-header">
            <div>
              <p>Final Clusters</p>
              <h2>Study-entry grouping</h2>
            </div>
          </div>
          <div className="existing-metrics">
            {clusters.map((cluster) => (
              <div key={cluster.clusterId}>
                <span>Cluster {cluster.clusterId}</span>
                <strong>{cluster.nMembers.toLocaleString()}</strong>
                <small>{((cluster.nMembers / run.cohort.parentN) * 100).toFixed(1)}% of the study-entry cohort</small>
              </div>
            ))}
          </div>
        </article>
        <article className="existing-card">
          <div className="existing-card-header">
            <div>
              <p>Longitudinal Follow-Up</p>
              <h2>Original clusters over time</h2>
            </div>
          </div>
          <div className="existing-metrics">
            {([0, 1] as const).map((clusterId) => (
              <div key={clusterId}>
                <span>Cluster {clusterId} annual change</span>
                <strong>{annualChange.get(clusterId)?.estimate.toFixed(5)}</strong>
                <small>ADAS-Cog13 points per year</small>
              </div>
            ))}
          </div>
        </article>
      </section>
    </div>
  );
};

const MetricsTab = ({ run }: { run: UnifiedResearchRun }) => (
  <div className="summary-tab-panel">
    <section className="existing-card">
      <div className="existing-card-header">
        <div>
          <p>Baseline vs Enhanced K-Means</p>
          <h2>Internal validation comparison</h2>
        </div>
      </div>
      <InternalValidationFigure run={run} />
      <div className="summary-comparison-list">
        {run.baselineComparison.metrics.map((metric) => (
          <article key={metric.metric}>
            <div>
              <span>{metricLabels[metric.metric]}</span>
              <h3>{metric.direction === "lower" ? "Lower is better" : "Higher is better"}</h3>
            </div>
            <div className="summary-comparison-values">
              <div>
                <small>Existing Algorithm</small>
                <strong>{formatComparisonMetric(metric.metric, metric.baselineValue)}</strong>
              </div>
              <div>
                <small>Enhanced Algorithm</small>
                <strong>{formatComparisonMetric(metric.metric, metric.enhancedValue)}</strong>
              </div>
              <div>
                <small>Relative change</small>
                <strong>{Math.abs(metric.signedRelativeChangePercent).toFixed(2)}%</strong>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>

    <section className="existing-card">
      <div className="existing-card-header">
        <div>
          <p>Detailed Metrics</p>
          <h2>Frozen aggregate values</h2>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="research-table min-w-[760px]">
          <thead>
            <tr>
              <th>Metric</th>
              <th className="text-right">Baseline mean</th>
              <th className="text-right">Baseline SD</th>
              <th className="text-right">Enhanced value</th>
              <th className="text-right">Direction</th>
              <th className="text-right">Relative change</th>
            </tr>
          </thead>
          <tbody>
            {run.baselineComparison.metrics.map((metric) => (
              <tr key={metric.metric}>
                <td className="font-medium">{metricLabels[metric.metric]}</td>
                <td className="text-right tabular-nums">{formatComparisonMetric(metric.metric, metric.baselineValue)}</td>
                <td className="text-right tabular-nums">{metric.baselineStandardDeviation.toFixed(5)}</td>
                <td className="text-right font-semibold tabular-nums text-teal-800">{formatComparisonMetric(metric.metric, metric.enhancedValue)}</td>
                <td className="text-right capitalize text-muted">{metric.direction}</td>
                <td className="text-right font-semibold tabular-nums">{metric.signedRelativeChangePercent.toFixed(2)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  </div>
);

const PcaTab = ({ run, evaluation, error, baselineSweep, geometry }: { run: UnifiedResearchRun; evaluation: SopEvaluation | null; error: string | null; baselineSweep: BaselineCandidateSweep | null; geometry: DefenseGeometry | null }) => {
  const ablation = evaluation?.sop1.ablation;

  if (!ablation) {
    return (
      <div className="summary-tab-panel">
        <div className="existing-note">{error ?? "Loading aggregate PCA evaluation details..."}</div>
        <section className="existing-card"><h2>PCA Cumulative Explained Variance</h2><PcaVarianceFigure run={run} /></section>
      </div>
    );
  }

  const [originalCondition, pcaCondition] = ablation.conditions;
  const metricKeys = Object.keys(sopMetricLabels) as SopMetric[];
  const baselineK2Sizes = baselineSweep?.candidates.find((candidate) => candidate.k === ablation.settings.k)?.clusterSizes;
  const pcaK2Sizes = evaluation?.sop2.demonstratedK.find((candidate) => candidate.k === ablation.settings.k)?.clusterSizes;

  return (
    <div className="summary-tab-panel summary-sop1-panel">
      <section className="summary-sop-intro">
        <p>SOP 1</p>
        <h2>PCA Dimensionality Reduction</h2>
      </section>

      <section className="existing-card">
        <div className="existing-card-header"><div><p>Controlled PCA Comparison</p><h2>PCA Experimental Context</h2></div></div>
        <div className="summary-controlled-strip" aria-label="Controlled SOP 1 settings">
          <div><span>Cohort</span><strong>{ablation.settings.cohortN.toLocaleString()} participants</strong></div>
          <div><span>Control</span><strong>Standardized features</strong></div>
          <div><span>Comparison</span><strong>PCA-transformed features</strong></div>
          <div><span>Controlled Change</span><strong>PCA only</strong></div>
        </div>
      </section>

      <section className="existing-card"><div className="existing-card-header"><div><p>Current run: PCA retention</p><h2>Cumulative Explained Variance</h2></div></div><PcaVarianceFigure run={run} /></section>

      <section>
        <div className="summary-sop-intro">
          <p>Dimensionality Reduction Effect</p>
          <h2>Baseline K-Means vs PCA-Only K-Means</h2>
        </div>
        <div className="summary-sop-two-up">
          <SopProjectionPanel title="Baseline K-Means" subtitle="Without PCA" sizes={baselineK2Sizes} panel={geometry?.sop1.baseline ?? null} />
          <SopProjectionPanel title="PCA Only K-Means" subtitle="With PCA" sizes={pcaK2Sizes} panel={geometry?.sop1.pcaOnly ?? null} />
        </div>
        {geometry ? <p className="existing-note">Both panels show the same complete PC1-PC2 projection. Only saved seed-0 cluster assignments change. Crosses mark projected means of the saved final assignments; a fixed linear PCA projection preserves cluster means. Cluster labels are arbitrary within each condition.</p> : null}
      </section>
      <section className="existing-card">
        <div className="existing-card-header">
          <div>
            <p>Quantitative Validation</p>
            <h2>Controlled Internal Validation</h2>
          </div>
        </div>
        <div className="summary-sop-metric-table">
          <div className="summary-sop-metric-head">
            <span>Baseline K-Means</span>
            <span>Metric</span>
            <span>PCA Only K-Means</span>
          </div>
          {metricKeys.map((metric) => {
            const originalValue = originalCondition.metrics[metric].mean;
            const pcaValue = pcaCondition.metrics[metric].mean;
            const change = ablation.metricChanges[metric].relativeMeanChangePercent;
            return (
              <div key={metric} className="summary-sop-metric-row">
                <strong>{formatSopMetric(metric, originalValue)}</strong>
                <div>
                  <span>{sopMetricLabels[metric]}</span>
                  <small>{metric === "davies_bouldin" ? "Lower is better" : "Higher is better"}</small>
                  <em>{formatSignedPercent(change)}</em>
                </div>
                <strong>{formatSopMetric(metric, pcaValue)}</strong>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};

const NbClustTab = ({ run, evaluation, error }: { run: UnifiedResearchRun; evaluation: SopEvaluation | null; error: string | null }) => {
  const [manualBaselineK, setManualBaselineK] = useState<number | null>(null);
  const sop2 = evaluation?.sop2;
  const controlled = sop2?.controlledComparison;
  const selection = controlled?.selection ?? sop2?.nbclust;
  const selectedK = controlled?.nbclustOnly.selectedK ?? sop2?.nbclust.selectedK;

  if (!sop2) {
    return (
      <div className="summary-tab-panel">
        <div className="existing-note">{error ?? "Loading aggregate NbClust evaluation details..."}</div>
      </div>
    );
  }

  // Matched 30-run results must come only from the validated SOP 2 comparison.
  const controlResult = controlled ? fromSop2Condition(controlled.control) : null;
  const nbclustResult = controlled ? fromSop2Condition(controlled.nbclustOnly) : null;
  const metricKeys = Object.keys(sopMetricLabels) as SopMetric[];
  const baselineSelectedK = controlled?.control.selectedK ?? sop2.maximumSilhouetteSelectedK;
  const selectedManualBaselineK = manualBaselineK ?? baselineSelectedK;
  // Representative seed-0 PCA candidates are separate from both the standardized
  // SOP 1 baselineSweep and the matched 30-run means below. Never substitute either.
  const pcaCandidates = sop2.candidates;
  const candidateKs = pcaCandidates.map((candidate) => candidate.k).sort((left, right) => left - right);
  const minimumK = candidateKs[0];
  const maximumK = candidateKs[candidateKs.length - 1];
  const baselineCandidate = pcaCandidates.find((candidate) => candidate.k === selectedManualBaselineK);
  const baselineMetricValues: Record<SopMetric, number | undefined> = {
    silhouette: baselineCandidate?.silhouette,
    davies_bouldin: baselineCandidate?.daviesBouldin,
    calinski_harabasz: baselineCandidate?.calinskiHarabasz
  };
  const baselineSliderFill = maximumK > minimumK ? ((selectedManualBaselineK - minimumK) / (maximumK - minimumK)) * 100 : 0;
  const pcaRepresentationLabel = sop2.settings.representation;
  const pcaRepresentationDetail = sop2.settings.representation;

  return (
    <div className="summary-tab-panel summary-sop1-panel">
      <section className="summary-sop-intro">
        <p>SOP 2</p>
        <h2>NbClust Cluster Number Selection</h2>
      </section>

      <section className="existing-card">
        <div className="existing-card-header"><div><p>Controlled NbClust Comparison</p><h2>Cluster Selection Experimental Context</h2></div></div>
        <div className="summary-controlled-strip summary-controlled-strip-five" aria-label="Controlled SOP 2 settings">
          <div><span>Cohort</span><strong>{sop2.settings.cohortN.toLocaleString()} participants</strong></div>
          <div><span>Shared Input</span><strong>{evaluation?.sop2.settings.representation}</strong></div>
          <div><span>Control</span><strong>Maximum Silhouette k-selection</strong></div>
          <div><span>Comparison</span><strong>NbClust index voting</strong></div>
          <div><span>Controlled Change</span><strong>k-selection only</strong></div>
        </div>
      </section>

      <p className="existing-note">Current run: NbClust result.</p><FinalNbClustFigure run={run} />

      <section>
        <div className="summary-sop-intro">
          <p>Cluster Selection Comparison</p>
          <h2>Baseline K-Means vs NbClust Selection</h2>
        </div>
        <div className="summary-nbclust-comparison">
          <article className="existing-card summary-nbclust-selection-card">
            <div className="summary-sop-result-heading">
              <div>
                <p>Manual k Selection</p>
                <h3>Baseline K-Means</h3>
                <span>Single internal validation criterion</span>
              </div>
              <strong>k = {selectedManualBaselineK}</strong>
            </div>
            <p className="summary-nbclust-selection-copy">Maximum Silhouette across candidate k values using random initialization and seed 0.</p>
            <div className="summary-manual-k-control">
              <label htmlFor="summary-manual-baseline-k">Manual cluster count: {selectedManualBaselineK}</label>
              <input
                id="summary-manual-baseline-k"
                aria-label="Manual baseline cluster count"
                className="baseline-k-slider"
                type="range"
                min={minimumK}
                max={maximumK}
                step={1}
                value={selectedManualBaselineK}
                disabled={pcaCandidates.length === 0}
                onChange={(event) => {
                  const nextK = Number(event.target.value);
                  if (candidateKs.includes(nextK)) setManualBaselineK(nextK);
                }}
                style={{ "--slider-fill": `${baselineSliderFill}%` } as CSSProperties}
              />
              <div className="existing-k-ticks" aria-hidden="true">
                {candidateKs.map((k) => <span key={k}>{k}</span>)}
              </div>
            </div>
            {baselineCandidate ? <SopClusterCounts sizes={baselineCandidate.clusterSizes} /> : null}
            <div className="summary-nbclust-metrics">
              {metricKeys.map((metric) => (
                <div key={metric}>
                  <span>{sopMetricLabels[metric]}</span>
                  <strong>{baselineMetricValues[metric] === undefined ? "—" : formatSopMetric(metric, baselineMetricValues[metric])}</strong>
                  <small>{baselineCandidate ? `Seed ${sop2.settings.seed}, ${baselineCandidate.iterations} iterations` : "Validated result pending"}</small>
                </div>
              ))}
            </div>
          </article>

          <article className="existing-card summary-nbclust-selection-card">
            <div className="summary-sop-result-heading">
              <div>
                <p>NbClust Selection</p>
                <h3>NbClust Based K-Means</h3>
                <span>Multi index consensus</span>
              </div>
              <strong>k = {selectedK}</strong>
            </div>
            <p className="summary-nbclust-selection-copy">{selection?.votesForSelectedK ?? "—"} of {selection?.usableIndices ?? "—"} usable indices recommended k = {selectedK}. The selected k is carried into the same random initialization Lloyd procedure.</p>
            <div className="summary-nbclust-facts">
              <div><span>Representation</span><strong>{pcaRepresentationLabel}</strong><small>{pcaRepresentationDetail}, k={selectedK}</small></div>
              <div><span>Run count</span><strong>{nbclustResult?.runCount ?? "—"}</strong><small>Predetermined random seeds</small></div>
            </div>
            <div className="summary-nbclust-metrics">
              {metricKeys.map((metric) => {
                const value = nbclustResult?.metrics[metric].mean;
                const standardDeviation = nbclustResult?.metrics[metric].standardDeviation;
                return (
                  <div key={metric}>
                    <span>{sopMetricLabels[metric]} mean</span>
                    <strong>{value === undefined ? "—" : formatSopMetric(metric, value)}</strong>
                    <small>{standardDeviation === undefined ? "Validated result pending" : `SD ${standardDeviation.toFixed(5)}`}</small>
                  </div>
                );
              })}
            </div>
          </article>
        </div>
      </section>

      <section className="existing-card">
        <div className="existing-card-header">
          <div>
            <p>SOP 2 NbClust</p>
            <h2>PCA Representation NbClust Control</h2>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <StatCard label="Baseline selection" value={`k=${baselineSelectedK}`} detail="Maximum Silhouette over k=2–10, seed 0" />
          <StatCard label="NbClust selection" value={`k=${selectedK}`} detail={`${selection?.votesForSelectedK}/${selection?.usableIndices} usable votes (${pcaRepresentationDetail})`} accent="teal" />
        </div>
        <p className="existing-note">{controlled ? `NbClust votes were computed on the same ${pcaRepresentationLabel} retained from SOP1 and reproduced in two checks. Both selected cluster counts feed the same 30 seed random initialization Lloyd procedure.` : "The available vote distribution is PCA evidence. The no DPC NbClust only controlled result is pending."}</p>
      </section>

      <section className="existing-card">
        <div className="existing-card-header">
          <div>
            <p>Quantitative Validation</p>
            <h2>Controlled Internal Validation</h2>
          </div>
        </div>
        <div className="summary-sop-metric-table">
          <div className="summary-sop-metric-head">
            <span>Baseline K-Means</span>
            <span>Metric</span>
            <span>NbClust Only K-Means</span>
          </div>
          {metricKeys.map((metric) => {
            const existingValue = controlResult?.metrics[metric].mean;
            const nbclustValue = nbclustResult?.metrics[metric].mean;
            return (
              <div key={metric} className="summary-sop-metric-row">
                <strong>{existingValue === undefined ? "—" : formatSopMetric(metric, existingValue)}</strong>
                <div>
                  <span>{sopMetricLabels[metric]}</span>
                  <small>{metric === "davies_bouldin" ? "Lower is better" : "Higher is better"}</small>
                  <em>{existingValue === undefined || nbclustValue === undefined ? "Pending" : Math.abs(nbclustValue - existingValue) < 1e-12 ? "Equal to control mean" :
                    (nbclustValue < existingValue) === (metric === "davies_bouldin") ? "Better than control mean" : "Worse than control mean"}</em>
                </div>
                <strong>{nbclustValue === undefined ? "—" : formatSopMetric(metric, nbclustValue)}</strong>
              </div>
            );
          })}
        </div>
      </section>

    </div>
  );
};

const DpcTab = ({ run, evaluation, error, baselineSweep: _baselineSweep, geometry }: { run: UnifiedResearchRun; evaluation: SopEvaluation | null; error: string | null; baselineSweep: BaselineCandidateSweep | null; geometry: DefenseGeometry | null }) => {
  const [activeStabilityTab, setActiveStabilityTab] = useState<DpcStabilityTab>("three");
  const sop3 = evaluation?.sop3;
  const randomSummary = sop3?.randomRunSummary;
  const dpcDeterminism = sop3?.dpcDeterminism;
  const firstThreeRuns = sop3?.firstThreeRandomRuns ?? [];
  const randomRunCount = sop3?.settings.randomSeeds.length ?? 0;
  const metricKeys = Object.keys(sopMetricLabels) as SopMetric[];
  const dpcSeeds = run.initialization.selectedCentroids;
  const maximumGamma = Math.max(...dpcSeeds.map((centroid) => centroid.gamma), 1);

  if (!sop3 || !randomSummary || !dpcDeterminism) {
    return (
      <div className="summary-tab-panel">
        <div className="existing-note">{error ?? "Loading aggregate DPC evaluation details..."}</div>
      </div>
    );
  }

  const dpcMetrics: Record<SopMetric, number> = {
    silhouette: dpcDeterminism.metrics.silhouette,
    davies_bouldin: dpcDeterminism.metrics.daviesBouldin,
    calinski_harabasz: dpcDeterminism.metrics.calinskiHarabasz
  };
  // Directions, changes and assessments are backend evidence, not frontend thresholds.
  // Legacy aggregate metrics alone cannot establish a validated controlled comparison.
  const comparisonMetrics = sop3.controlledComparison
    ? run.baselineComparison.controlledDpcInitializationComparison?.metrics
    : undefined;
  const assessmentLabels = { better: "Better", worse: "Worse", equal: "Equal reported value" } as const;

  return (
    <div className="summary-tab-panel summary-sop1-panel">
      <section className="summary-sop-intro">
        <p>SOP 3</p>
        <h2>Density Peak Deterministic Initialization</h2>
      </section>

      <section className="existing-card">
        <div className="existing-card-header"><div><p>Controlled DPC Comparison</p><h2>Initialization Experimental Context</h2></div></div>
        <div className="summary-controlled-strip summary-controlled-strip-five" aria-label="Controlled SOP 3 settings">
          <div><span>Cohort</span><strong>{sop3.settings.cohortN.toLocaleString()} participants</strong></div>
          <div><span>Shared Input</span><strong>{evaluation?.sop2.settings.representation}</strong></div>
          <div><span>Control</span><strong>Random initialization</strong></div>
          <div><span>Comparison</span><strong>DPC initialization</strong></div>
          <div><span>Controlled Change</span><strong>Initialization only</strong></div>
        </div>
      </section>

      <section>
        <div className="summary-sop-intro">
          <p>Initialization Stability</p>
          <h2>Random Initialization vs Deterministic DPC Across Repeated Runs</h2>
        </div>
        <div className="summary-view-tabs" role="tablist" aria-label="SOP 3 stability views">
          {[["three", "3 Runs"], ["thirty", "30 Runs"], ["summary", "Summary"]].map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={activeStabilityTab === id} onClick={() => setActiveStabilityTab(id as DpcStabilityTab)}>{label}</button>
          ))}
        </div>

        {activeStabilityTab === "three" ? (
          <div className="summary-dpc-runs">
            <div className="summary-dpc-column-heading"><p>Existing K-Means</p><h3>Random Initialization</h3><span>Initial centroids are selected independently for each run</span></div>
            <div className="summary-dpc-column-heading"><p>Enhanced K-Means</p><h3>Deterministic DPC Initialization</h3><span>Fixed DPC seeds are selected deterministically from the same input</span></div>
            {firstThreeRuns.map((randomRun) => (
              <div key={randomRun.runNumber} className="summary-dpc-run-pair">
                <article className="summary-dpc-plot-card">
                  <p>Run {randomRun.runNumber}</p>
                  <DefenseScatter panel={geometry?.sop3.random.find((panel) => panel.runNumber === randomRun.runNumber) ?? null} label={`Random run ${randomRun.runNumber}`} />
                  <p className="text-xs text-muted">Replayed seed {randomRun.seed}; validated against saved results.</p>
                  <div className="summary-dpc-plot-metrics">Silhouette {randomRun.silhouette.toFixed(3)} - DBI {randomRun.daviesBouldin.toFixed(3)} - CH {randomRun.calinskiHarabasz.toFixed(1)} - Iter {randomRun.iterations}</div>
                </article>
                <article className="summary-dpc-plot-card">
                  <p>Run {randomRun.runNumber}</p>
                  <DefenseScatter panel={geometry?.sop3.dpc.find((panel) => panel.checkNumber === randomRun.runNumber) ?? null} label={`DPC check ${randomRun.runNumber}`} />
                  <p className="text-xs text-muted">{randomRun.runNumber === 1 ? "Saved DPC reference geometry." : "Reconstructed DPC check; validated against the saved reference."}</p>
                  <div className="summary-dpc-plot-metrics">Silhouette {dpcMetrics.silhouette.toFixed(3)} - DBI {dpcMetrics.davies_bouldin.toFixed(3)} - CH {dpcMetrics.calinski_harabasz.toFixed(1)} - Iter {dpcDeterminism.iterations}</div>
                </article>
              </div>
            ))}
          </div>
        ) : activeStabilityTab === "thirty" ? (
          <div className="summary-dpc-chart-stack">
            <div className="summary-sop-intro">
              <p>30-Run Stability</p>
              <h2>Run-to-Run Internal Validation Metrics</h2>
              <blockquote>The random-control runs show run-to-run variation, while deterministic DPC remains fixed under identical inputs.</blockquote>
            </div>
            {([
              ["Silhouette", "higher is better", "silhouette"],
              ["Davies-Bouldin", "lower is better", "daviesBouldin"],
              ["Calinski-Harabasz", "higher is better", "calinskiHarabasz"]
            ] as const).map(([label, direction, metric]) => (
              <article key={label} className="existing-card summary-dpc-chart-missing">
                <h3>{label} <span>({direction})</span></h3>
                <SopRunSeriesChart sop3={sop3} metric={metric} />
              </article>
            ))}
          </div>
        ) : (
          <div className="existing-card summary-dpc-reproducibility-card">
            <div className="existing-card-header"><div><h2>Random Initialization vs Deterministic DPC</h2></div></div>
            <div className="overflow-x-auto">
              <table className="research-table summary-dpc-reproducibility-table">
                <thead><tr><th>Dimension</th><th>Random Initialization</th><th className="text-teal-700">Deterministic DPC</th></tr></thead>
                <tbody>
                  <tr><td className="font-medium">Initialization</td><td>Varies across runs</td><td className="font-semibold text-teal-800">Fixed deterministic seed set</td></tr>
                  <tr><td className="font-medium">Seed identities</td><td>Run-dependent</td><td className="font-semibold text-teal-800">Reproduced</td></tr>
                  <tr><td className="font-medium">Final clustering</td><td>May vary across initializations</td><td className="font-semibold text-teal-800">Reproducible under identical deterministic inputs</td></tr>
                  <tr><td className="font-medium">Internal validation</td><td>30-run control distribution</td><td className="font-semibold text-teal-800">Fixed deterministic result</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {activeStabilityTab === "summary" ? <><section className="existing-card">
        <div className="existing-card-header"><div><p>Current run: selected density peaks</p><h2>Deterministic DPC Seeds in PCA Space</h2></div></div>
        <div className="grid gap-4 sm:grid-cols-2">
          {dpcSeeds.map((centroid, index) => (
            <div key={centroid.candidateId} className="summary-dpc-seed-card">
              <div><span>Seed {index + 1} · Cluster {centroid.assignedCluster} Seed</span><strong>Cluster {centroid.assignedCluster} DPC Seed</strong><small>RID {centroid.candidateId}</small></div>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <div><dt>rho</dt><dd>{centroid.rho.toFixed(0)}</dd></div>
                <div><dt>delta</dt><dd>{centroid.delta.toFixed(4)}</dd></div>
                <div><dt>gamma</dt><dd>{centroid.gamma.toFixed(2)}</dd></div>
              </dl>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100"><span style={{ width: `${(centroid.gamma / maximumGamma) * 100}%` }} /></div>
            </div>
          ))}
        </div>
      </section>

      <section className="existing-card summary-dpc-validation-card">
        <div className="existing-card-header"><div><p>Current run: controlled internal validation</p><h2>Random Initialization vs Deterministic DPC</h2></div></div>
        <div className="summary-dpc-validation-table-wrap">
          <table className="research-table summary-dpc-validation-table">
            <thead><tr><th>Metric</th><th className="text-right">Random/Control Mean</th><th className="text-right">DPC</th><th className="text-right">Assessment</th></tr></thead>
            <tbody>
              {metricKeys.map((metric) => {
                const evidence = comparisonMetrics?.find((entry) => entry.metric === metric);
                return (
                  <tr key={metric}>
                    <td className="font-medium">{sopMetricLabels[metric]}<small className="mt-1 block text-muted">{evidence ? evidence.direction === "lower" ? "Lower is better" : "Higher is better" : "Validated direction pending"}</small></td>
                    <td className="text-right tabular-nums">{evidence ? formatSopMetric(metric, evidence.randomMean) : "—"}</td>
                    <td className="text-right tabular-nums text-teal-800">{evidence ? formatSopMetric(metric, evidence.dpcValue) : "—"}</td>
                    <td className="text-right text-muted">{evidence ? `${assessmentLabels[evidence.dpcAssessment]}; ${evidence.signedRelativeChangePercent > 0 ? "+" : ""}${evidence.signedRelativeChangePercent.toFixed(5)}% vs random mean` : "Validated comparison pending"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      </> : null}
    </div>
  );
};

const ProfilesTab = ({ run }: { run: UnifiedResearchRun }) => {
  const profiles = [...run.clusterProfiles.profiles].sort((left, right) => left.clusterId - right.clusterId);

  return (
    <div className="summary-tab-panel">
      <section className="summary-profile-grid">
        {profiles.map((profile) => (
          <article key={profile.clusterId} className="existing-card summary-profile-card">
            <div className="existing-card-header">
              <div>
                <p>Enhanced Final Cluster</p>
                <h2>Cluster {profile.clusterId}</h2>
              </div>
            </div>
            <div className="existing-metrics">
              <div>
                <span>Participants</span>
                <strong>{profile.nMembers.toLocaleString()}</strong>
                <small>{((profile.nMembers / run.cohort.parentN) * 100).toFixed(1)}% of study-entry cohort</small>
              </div>
            </div>
            <p className="mt-4 text-sm leading-6 text-muted">
              {profile.clusterId === 0
                ? "Relatively lower-impairment aggregate cognitive-functional profile compared with Cluster 1."
                : "Relatively higher-impairment aggregate cognitive-functional profile compared with Cluster 0."}
            </p>
          </article>
        ))}
      </section>

      <section className="existing-card">
        <div className="existing-card-header">
          <div>
            <p>Strongest Observed Differences</p>
            <h2>Standardized mean-difference ranking</h2>
          </div>
        </div>
        <ClusterDifferenceFigure run={run} />
      </section>

      <section className="existing-card">
        <div className="existing-card-header">
          <div>
            <p>Original-Scale Profile Table</p>
            <h2>Aggregate means</h2>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="research-table min-w-[680px]">
            <thead><tr><th>Variable</th><th className="text-right">Cluster 0 mean</th><th className="text-right">Cluster 1 mean</th><th className="text-right">SMD (1 minus 0)</th></tr></thead>
            <tbody>
              {run.clusterProfiles.smdRanking.map((row) => (
                <tr key={row.variable}>
                  <td className="font-medium">{getMeasureLabel(row.variable)}</td>
                  <td className="text-right tabular-nums">{profiles[0]?.variableMeans[row.variable]?.toFixed(5)}</td>
                  <td className="text-right tabular-nums">{profiles[1]?.variableMeans[row.variable]?.toFixed(5)}</td>
                  <td className="text-right font-semibold tabular-nums">{row.standardizedMeanDifferenceCluster1Minus0.toFixed(5)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="existing-note">Profile scale: {run.clusterProfiles.scale}. Signs describe Cluster 1 relative to Cluster 0 and do not imply clinical ordering.</p>
      </section>
    </div>
  );
};

const LongitudinalTab = ({ run }: { run: UnifiedResearchRun }) => {
  const summaries = [...run.longitudinal.byOriginalCluster].sort((left, right) => left.clusterId - right.clusterId);
  const mixedModel = run.longitudinal.mixedEffects;
  const primary = mixedModel.primaryResult;
  const annualChange = new Map(mixedModel.estimatedAnnualChangeByOriginalCluster.map((entry) => [entry.clusterId, entry]));
  const cluster0Rate = annualChange.get(0);
  const cluster1Rate = annualChange.get(1);
  const maxRate = Math.max(
    Math.abs(cluster0Rate?.estimate ?? 0),
    Math.abs(cluster1Rate?.estimate ?? 0),
    Math.abs(primary.estimate)
  ) || 1;

  return (
    <div className="summary-tab-panel summary-longitudinal-panel">
      <section className="summary-longitudinal-strip" aria-label="Longitudinal eligibility summary">
        <div>
          <span>Original clustered cohort</span>
          <strong>{run.cohort.parentN.toLocaleString()}</strong>
          <small>study-entry participants</small>
        </div>
        <div>
          <span>Longitudinal eligible cohort</span>
          <strong>{run.longitudinal.eligibleParticipants.toLocaleString()}</strong>
          <small>{run.longitudinal.observationCount.toLocaleString()} observations</small>
        </div>
        <div>
          <span>Cluster 0 eligible</span>
          <strong>{summaries[0]?.eligibleParticipants.toLocaleString() ?? "—"}</strong>
          <small>{summaries[0]?.observationCount.toLocaleString() ?? "—"} observations</small>
        </div>
        <div>
          <span>Cluster 1 eligible</span>
          <strong>{summaries[1]?.eligibleParticipants.toLocaleString() ?? "—"}</strong>
          <small>{summaries[1]?.observationCount.toLocaleString() ?? "—"} observations</small>
        </div>
        <div>
          <span>Eligibility criteria</span>
          <p>{run.longitudinal.eligibilityRule}</p>
        </div>
      </section>

      <section className="summary-longitudinal-main">
        <article className="existing-card summary-longitudinal-chart-card">
          <div className="existing-card-header">
            <div>
              <p>Longitudinal Trajectories</p>
              <h2>Longitudinal ADAS-Cog13 Trajectories by Study-Entry Cluster</h2>
            </div>
          </div>
          <LongitudinalProgressionChart defense data={run.longitudinal.timeSeries} />
        </article>

        <aside className="existing-card summary-lme-panel">
          <div className="existing-card-header">
            <div>
              <p>Linear Mixed-Effects Model</p>
              <h2>Time by Cluster interaction</h2>
            </div>
          </div>

          <div className="summary-lme-rates">
            <div>
              <span>Cluster 0 estimated rate</span>
              <strong>{cluster0Rate ? cluster0Rate.estimate.toFixed(5) : "—"}</strong>
              <small>{cluster0Rate?.unit ?? "ADAS-Cog13 points/year"}</small>
            </div>
            <div>
              <span>Cluster 1 estimated rate</span>
              <strong>{cluster1Rate ? cluster1Rate.estimate.toFixed(5) : "—"}</strong>
              <small>{cluster1Rate?.unit ?? "ADAS-Cog13 points/year"}</small>
            </div>
          </div>

          <div className="summary-lme-primary">
            <span>Primary comparison</span>
            <h3>Time × Cluster interaction / β₃</h3>
            <dl>
              <div>
                <dt>β₃</dt>
                <dd>{primary.estimate.toFixed(5)}</dd>
              </div>
              <div>
                <dt>95% CI</dt>
                <dd>{primary.confidenceInterval95.lower.toFixed(5)} to {primary.confidenceInterval95.upper.toFixed(5)}</dd>
              </div>
              <div>
                <dt>p-value</dt>
                <dd>{formatPValue(primary.pValue)}</dd>
              </div>
            </dl>
          </div>

          <div className="summary-lme-bars" aria-label="Estimated annual ADAS-Cog13 change comparison">
            {[
              { label: "Cluster 0", value: cluster0Rate?.estimate, color: "teal" },
              { label: "Cluster 1", value: cluster1Rate?.estimate, color: "amber" },
              { label: "Difference (C1 - C0)", value: primary.estimate, color: "slate" }
            ].map((row) => (
              <div key={row.label}>
                <span>{row.label}</span>
                <div><i className={`summary-lme-bar-${row.color}`} style={{ width: `${Math.max(5, (Math.abs(row.value ?? 0) / maxRate) * 100)}%` }} /></div>
                <strong>{row.value === undefined ? "—" : `${row.value.toFixed(5)} / year`}</strong>
              </div>
            ))}
          </div>
        </aside>
      </section>

      <p className="summary-longitudinal-note">
        The same study-entry cluster assignments are followed over time. Points show observed means within elapsed-year bins, not fitted trajectories; follow-up support varies by bin. Higher ADAS-Cog13 indicates greater cognitive impairment. Longitudinal differences are observational and do not establish causality or individual prognosis. No second longitudinal K-Means clustering is performed.
      </p>
    </div>
  );
};

const FullComparisonTab = ({ run }: { run: UnifiedResearchRun }) => (
  <>
    <MetricsTab run={run} />
    <OverviewTab run={run} />
  </>
);

const renderTab = (activeTab: SummaryTab, run: UnifiedResearchRun, evaluation: SopEvaluation | null, error: string | null, baselineSweep: BaselineCandidateSweep | null, geometry: DefenseGeometry | null) => {
  if (activeTab === "pca") return <PcaTab run={run} evaluation={evaluation} error={error} baselineSweep={baselineSweep} geometry={geometry} />;
  if (activeTab === "nbclust") return <NbClustTab run={run} evaluation={evaluation} error={error} />;
  if (activeTab === "dpc") return <DpcTab run={run} evaluation={evaluation} error={error} baselineSweep={baselineSweep} geometry={geometry} />;
  if (activeTab === "fullComparison") return <FullComparisonTab run={run} />;
  if (activeTab === "profiles") return <ProfilesTab run={run} />;
  return <LongitudinalTab run={run} />;
};

export const ClustersPage = ({ run }: ClustersPageProps) => {
  const [activeTab, setActiveTab] = useState<SummaryTab>("pca");
  const { evaluation, baselineSweep, defenseGeometry, error } = useSopEvaluation(run);

  if (!run) return <div className="existing-note">Run analysis to view results.</div>;

  const isSopTab = activeTab === "pca" || activeTab === "nbclust" || activeTab === "dpc";

  return (
    <div className="existing-algorithm-page">
      <section className="existing-hero">
        <div>
          <p className="existing-eyebrow">Summary of Findings</p>
          <h1>Comparison and Findings</h1>
          <p>
            A consolidated view of the validated baseline comparison, enhanced
            clustering result, aggregate cluster characterization, and
            longitudinal follow-up analysis.
          </p>
        </div>
      </section>

      <nav className="summary-tabs" role="tablist" aria-label="Comparison and findings sections">
        {summaryTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`summary-panel-${tab.id}`}
            id={`summary-tab-${tab.id}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>

      <div
        id={`summary-panel-${activeTab}`}
        role="tabpanel"
        tabIndex={0}
        aria-labelledby={`summary-tab-${activeTab}`}
      >
        {isSopTab && !evaluation ? (
          <div className="existing-note">{error ?? "Frozen-study evaluation pending."}</div>
        ) : (
          <>
            {isSopTab ? <div className="existing-note">SOP 1–3: validated frozen-study evaluation evidence. The active run matches the cohort and PCA-variance source hashes. This does not establish full provenance identity or link the SOP experiments to this run; standardized-matrix and PCA-score hashes are not required in the run payload. Sections labeled Current run show only that run’s reported results.</div> : null}
            {renderTab(activeTab, run, evaluation, error, baselineSweep, defenseGeometry)}
          </>
        )}
      </div>
      <ResearchPageNavigation currentPath="/summary-of-findings" />
    </div>
  );
};
