import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { CheckCircle2 } from "lucide-react";
import type { SopEvaluation, UnifiedResearchRun } from "../../../../packages/shared/src";
import { LongitudinalProgressionChart } from "../components/charts/LongitudinalProgressionChart";
import { ResearchPageNavigation } from "../components/layout/ResearchPageNavigation";
import { StatCard } from "../components/ui/StatCard";
import { useSopEvaluation } from "../hooks/useSopEvaluation";
import { getMeasureLabel } from "../utils/measureLabels";

type ClustersPageProps = { run: UnifiedResearchRun | null };
type SummaryTab = "pca" | "nbclust" | "dpc" | "fullComparison" | "profiles" | "longitudinal";
type ComparisonMetric = UnifiedResearchRun["baselineComparison"]["metrics"][number];
type SopMetric = keyof SopEvaluation["sop1"]["ablation"]["conditions"][number]["metrics"];
type SopRunSide = "existing" | "enhanced";
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

const easeOutCubic = (value: number) => 1 - Math.pow(1 - value, 3);

const clusterColors = ["#0f7977", "#d88a00"];

const sopPointColor = (cluster: 0 | 1, id: number, progress: number) => {
  const revealThreshold = 0.18 + (id % 18) * 0.04;
  return progress >= 1 || progress >= revealThreshold ? clusterColors[cluster] : "#aebcbc";
};

type SopScatterPoint = {
  id: number;
  cluster: 0 | 1;
  startX: number;
  startY: number;
  finalX: number;
  finalY: number;
};

const buildSopScatterPoints = (side: SopRunSide): SopScatterPoint[] =>
  Array.from({ length: 90 }, (_, index) => {
    const cluster = (index % 2) as 0 | 1;
    const localAngle = ((index * 137.5) % 360) * (Math.PI / 180);
    const radius = 3 + ((index * 9) % 18) * 0.62;
    const originalCenter = cluster === 0 ? { x: 43, y: 52 } : { x: 57, y: 46 };
    const pcaCenter = cluster === 0 ? { x: 34, y: 60 } : { x: 68, y: 37 };
    const center = side === "existing" ? originalCenter : pcaCenter;
    const spreadX = side === "existing" ? 1.55 : 1;
    const spreadY = side === "existing" ? 1.05 : 0.82;

    return {
      id: side === "existing" ? index : index + 1000,
      cluster,
      startX: 50 + Math.cos(localAngle) * 5,
      startY: 50 + Math.sin(localAngle) * 4,
      finalX: center.x + Math.cos(localAngle) * radius * spreadX,
      finalY: center.y + Math.sin(localAngle) * radius * spreadY
    };
  });

const sopCentroids = {
  existing: [
    { x: 43, y: 52 },
    { x: 57, y: 46 }
  ],
  enhanced: [
    { x: 34, y: 60 },
    { x: 68, y: 37 }
  ]
} as const;

const fromSop1Condition = (condition: SopEvaluation["sop1"]["ablation"]["conditions"][number]): SopRunResult => ({
  representation: condition.representation,
  dimensions: condition.dimensions,
  runCount: condition.runCount,
  metrics: condition.metrics
});

const fromSop2Candidate = (candidate: SopEvaluation["sop2"]["candidates"][number]): SopRunResult => ({
  representation: `PC1-PC6, k=${candidate.k}`,
  dimensions: 6,
  runCount: 1,
  metrics: {
    silhouette: { mean: candidate.silhouette },
    davies_bouldin: { mean: candidate.daviesBouldin },
    calinski_harabasz: { mean: candidate.calinskiHarabasz }
  }
});

const fromSop3DpcResult = (result: SopEvaluation["sop3"]["dpcDeterminism"]): SopRunResult => ({
  representation: "PC1-PC6, DPC initialization",
  dimensions: 6,
  runCount: result.repeatedChecks,
  metrics: {
    silhouette: { mean: result.metrics.silhouette },
    davies_bouldin: { mean: result.metrics.daviesBouldin },
    calinski_harabasz: { mean: result.metrics.calinskiHarabasz }
  }
});

const useSopRunReplay = () => {
  const [existingProgress, setExistingProgress] = useState(0);
  const [enhancedProgress, setEnhancedProgress] = useState(0);
  const existingTimerRef = useRef<number | null>(null);
  const enhancedTimerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (existingTimerRef.current !== null) window.clearInterval(existingTimerRef.current);
    if (enhancedTimerRef.current !== null) window.clearInterval(enhancedTimerRef.current);
  }, []);

  const replayRun = (side: SopRunSide) => {
    const timerRef = side === "existing" ? existingTimerRef : enhancedTimerRef;
    const setProgress = side === "existing" ? setExistingProgress : setEnhancedProgress;
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    setProgress(0);
    timerRef.current = window.setInterval(() => {
      setProgress((current) => {
        const next = Math.min(100, current + 5);
        if (next === 100 && timerRef.current !== null) {
          window.clearInterval(timerRef.current);
          timerRef.current = null;
        }
        return next;
      });
    }, 120);
  };

  return { existingProgress, enhancedProgress, replayRun };
};

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

const SopScatterPlot = ({ side, progress }: { side: SopRunSide; progress: number }) => {
  const points = useMemo(() => buildSopScatterPoints(side), [side]);
  const animationPosition = easeOutCubic(progress / 100);

  return (
    <div className="summary-sop-scatter">
      <div
        className="existing-scatter-plot summary-sop-scatter-plot"
        aria-label={`${side === "existing" ? "Existing without PCA" : "Enhanced with PCA"} visualization-only scatter plot`}
      >
        <div className="existing-scatter-grid" aria-hidden="true" />
        <span className="existing-axis-label existing-axis-label-x">Projection Dimension 1</span>
        <span className="existing-axis-label existing-axis-label-y">Projection Dimension 2</span>
        {sopCentroids[side].map((centroid, index) => (
          <span
            key={`${side}-centroid-${index}`}
            className="existing-centroid"
            style={{
              left: `${centroid.x}%`,
              top: `${centroid.y}%`,
              opacity: animationPosition >= 0.75 ? 1 : 0
            } as CSSProperties}
          >
            ★
          </span>
        ))}
        {points.map((point) => (
          <span
            key={point.id}
            className="existing-scatter-point"
            style={{
              "--point-color": sopPointColor(point.cluster, point.id, animationPosition),
              left: `${point.finalX}%`,
              top: `${point.finalY}%`
            } as CSSProperties}
          />
        ))}
      </div>
      <div className="existing-cluster-legend summary-compact-legend">
        <div>
          <span aria-hidden="true" style={{ backgroundColor: clusterColors[0] }} />
          <strong>Cluster 0</strong>
        </div>
        <div>
          <span aria-hidden="true" style={{ backgroundColor: clusterColors[1] }} />
          <strong>Cluster 1</strong>
        </div>
        <div className="existing-centroid-legend">
            <span
              aria-hidden="true"
              style={{
                display: "inline-block",
                width: "auto",
                height: "auto",
                borderRadius: 0,
                background: "none",
                backgroundColor: "transparent",
                color: "red",
                fontSize: "14px",
                lineHeight: 1,
              }}
            >
              ★
            </span>
            <strong>Centroid</strong>
          </div>
      </div>
    </div>
  );
};

const SopRunPanel = ({
  side,
  title,
  subtitle,
  condition,
  progress,
  onRun,
  label,
  resultPending
}: {
  side: SopRunSide;
  title: string;
  subtitle: string;
  condition: SopRunResult;
  progress: number;
  onRun: () => void;
  label?: string;
  resultPending?: boolean;
}) => {
  const isRunning = progress > 0 && progress < 100;
  const isComplete = progress === 100;

  return (
    <article className="existing-card summary-sop-result-card">
      <div className="summary-sop-result-heading">
        <div>
          <p>{label ?? (side === "existing" ? "Existing" : "Enhanced")}</p>
          <h3>{title}</h3>
          <span>{subtitle}</span>
        </div>
        <button type="button" className="existing-run-button summary-sop-run-button" disabled={isRunning} onClick={onRun}>
          {isRunning ? "Running..." : isComplete ? `Rerun ${side === "existing" ? "Existing" : "Enhanced"}` : `Run ${side === "existing" ? "Existing" : "Enhanced"}`}
        </button>
      </div>

      <div className="existing-progress" aria-label={`${title} replay progress ${progress}%`}>
        <div><span style={{ width: `${progress}%` }} /></div>
        <strong>{progress}%</strong>
      </div>

      <SopScatterPlot side={side} progress={progress} />

      {isComplete && resultPending ? (
        <div className="summary-sop-panel-metrics">
          <StatCard label="Result status" value="Validated controlled result pending" detail="Current stored aggregate result does not match this corrected pipeline definition." />
          <StatCard label="Run count" value="—" detail="Unavailable for this corrected control" />
          <StatCard label="Silhouette mean" value="—" detail="Metric unavailable" />
        </div>
      ) : isComplete ? (
        <div className="summary-sop-panel-metrics">
          <StatCard label="Representation" value={condition.dimensions ? `${condition.dimensions}D` : condition.representation} detail={condition.dimensions ? condition.representation : undefined} accent={side === "enhanced" ? "teal" : "slate"} />
          <StatCard label="Run count" value={condition.runCount} detail="Predetermined random seeds" />
          <StatCard label="Silhouette mean" value={condition.metrics.silhouette.mean.toFixed(5)} detail={condition.metrics.silhouette.standardDeviation === undefined ? undefined : `SD ${condition.metrics.silhouette.standardDeviation.toFixed(5)}`} accent={side === "enhanced" ? "teal" : "slate"} />
        </div>
      ) : (
        <p className="existing-run-status">
          {isRunning ? "Replaying frontend execution presentation for stored aggregate SOP results." : "Run this side to reveal the stored validated SOP result."}
        </p>
      )}
    </article>
  );
};

const PcaTab = ({ run, evaluation, error }: { run: UnifiedResearchRun; evaluation: SopEvaluation | null; error: string | null }) => {
  const retainedScree = run.pca.scree.filter((point) => point.retained);
  const ablation = evaluation?.sop1.ablation;
  const { existingProgress, enhancedProgress, replayRun } = useSopRunReplay();

  if (!ablation) {
    return (
      <div className="summary-tab-panel">
        <div className="existing-note">{error ?? "Loading aggregate PCA evaluation details..."}</div>
      </div>
    );
  }

  const [originalCondition, pcaCondition] = ablation.conditions;
  const metricKeys = Object.keys(sopMetricLabels) as SopMetric[];

  return (
    <div className="summary-tab-panel summary-sop1-panel">
      <section className="summary-sop-intro">
        <p>SOP 1</p>
        <h2>PCA-Based Dimensionality Reduction</h2>
      </section>

      <section className="summary-controlled-strip" aria-label="Controlled SOP 1 settings">
        <div><span>Frozen cohort</span><strong>n = {ablation.settings.cohortN.toLocaleString()}</strong></div>
        <div><span>Control configuration</span><strong>No PCA • No NbClust • No DPC</strong></div>
        <div><span>Comparison configuration</span><strong>PCA • No NbClust • No DPC</strong></div>
        <div><span>Controlled change</span><strong>Only PCA is introduced</strong></div>
      </section>

      <section className="summary-sop-comparison">
        <SopRunPanel
          side="existing"
          title="Baseline K-Means"
          subtitle="No PCA • No NbClust • No DPC"
          label="Control configuration"
          condition={fromSop1Condition(originalCondition)}
          progress={existingProgress}
          onRun={() => replayRun("existing")}
        />
        <div className="summary-vs" aria-hidden="true">vs</div>
        <SopRunPanel
          side="enhanced"
          title="PCA-Only K-Means"
          subtitle="PCA • No NbClust • No DPC"
          label="Only PCA is introduced"
          condition={fromSop1Condition(pcaCondition)}
          progress={enhancedProgress}
          onRun={() => replayRun("enhanced")}
        />
      </section>

      <section className="summary-sop-pca-section">
        <article className="existing-card">
          <div className="existing-card-header">
            <div>
              <p>PCA Transformation</p>
              <h2>13 variables to 6 components</h2>
            </div>
          </div>
          <div className="summary-pca-flow">
            <div><strong>{run.preprocessing.retainedFeatures.length}</strong><span>Original variables</span></div>
            <b aria-hidden="true">&rarr;</b>
            <div><strong>PCA</strong><span>Applied</span></div>
            <b aria-hidden="true">&rarr;</b>
            <div><strong>{run.pca.components}</strong><span>Components retained</span></div>
            <b aria-hidden="true">&rarr;</b>
            <div><strong>K-Means</strong><span>Passed forward</span></div>
          </div>
          <div className="summary-pca-variance">
            <strong>{formatPercent(pcaCondition.varianceRetained)}</strong>
            <span>cumulative variance retained in {run.pca.components} PCs</span>
          </div>
        </article>

        <article className="existing-card">
          <div className="existing-card-header">
            <div>
              <p>Cumulative Explained Variance</p>
              <h2>Retained component curve</h2>
            </div>
          </div>
          <div className="summary-bar-list">
            {retainedScree.map((point) => (
              <div key={point.component}>
                <span>PC{point.component}</span>
                <div><i style={{ width: `${Math.min(100, point.cumulativeVariance * 100)}%` }} /></div>
                <strong>{formatPercent(point.cumulativeVariance)}</strong>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="existing-card">
        <div className="existing-card-header">
          <div>
            <p>Controlled Validation</p>
            <h2>k and initialization held constant</h2>
          </div>
        </div>
        <div className="summary-sop-metric-table">
          <div className="summary-sop-metric-head">
            <span>Baseline K-Means</span>
            <span>Metric</span>
            <span>PCA-Only K-Means</span>
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
                  <em>{change > 0 ? "+" : ""}{change.toFixed(2)}%</em>
                </div>
                <strong>{formatSopMetric(metric, pcaValue)}</strong>
              </div>
            );
          })}
        </div>
      </section>

      <FindingNote>
        In the controlled SOP 1 ablation, introducing PCA before K-Means reduced the representation from {originalCondition.dimensions} dimensions to {pcaCondition.dimensions}, retained {formatPercent(pcaCondition.varianceRetained)} cumulative variance, and improved the mean internal-validation metrics while k and random-initialization settings were held constant.
      </FindingNote>
    </div>
  );
};

const NbClustTab = ({ run, evaluation, error }: { run: UnifiedResearchRun; evaluation: SopEvaluation | null; error: string | null }) => {
  const { existingProgress, enhancedProgress, replayRun } = useSopRunReplay();
  const voteDenominator = Math.max(...run.kSelection.voteDistribution.map((entry) => entry.votes), 1);
  const sop2 = evaluation?.sop2;

  if (!sop2 || !evaluation?.sop1.ablation) {
    return (
      <div className="summary-tab-panel">
        <div className="existing-note">{error ?? "Loading aggregate NbClust evaluation details..."}</div>
      </div>
    );
  }

  const [baselineCondition] = evaluation.sop1.ablation.conditions;
  const existingCandidate = sop2.candidates.find((candidate) => candidate.k === sop2.maximumSilhouetteSelectedK) ?? sop2.candidates[0];
  const metricKeys = Object.keys(sopMetricLabels) as SopMetric[];

  return (
    <div className="summary-tab-panel summary-sop1-panel">
      <section className="summary-sop-intro">
        <p>SOP 2</p>
        <h2>NbClust-Based Cluster Number Selection</h2>
      </section>

      <section className="summary-controlled-strip" aria-label="Controlled SOP 2 settings">
        <div><span>Frozen cohort</span><strong>n = {sop2.settings.cohortN.toLocaleString()}</strong></div>
        <div><span>Control configuration</span><strong>No PCA • No NbClust • No DPC</strong></div>
        <div><span>Comparison configuration</span><strong>No PCA • NbClust • No DPC</strong></div>
        <div><span>Controlled change</span><strong>Only NbClust is introduced</strong></div>
      </section>

      <section className="summary-sop-comparison">
        <SopRunPanel
          side="existing"
          title="Baseline K-Means"
          subtitle="No PCA • No NbClust • No DPC"
          label="Control configuration"
          condition={fromSop1Condition(baselineCondition)}
          progress={existingProgress}
          onRun={() => replayRun("existing")}
        />
        <div className="summary-vs" aria-hidden="true">vs</div>
        <SopRunPanel
          side="enhanced"
          title="NbClust-Only K-Means"
          subtitle="No PCA • NbClust • No DPC"
          label="Only NbClust is introduced"
          condition={fromSop2Candidate(existingCandidate)}
          progress={enhancedProgress}
          onRun={() => replayRun("enhanced")}
          resultPending
        />
      </section>

      <section className="existing-card">
        <div className="existing-card-header">
          <div>
            <p>SOP 2 — NBCLUST</p>
            <h2>Baseline cluster-number selection versus NbClust</h2>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <StatCard label="Baseline selection" value={`k=${baselineCondition.dimensions ? evaluation.sop1.ablation.settings.k : "—"}`} detail="Control condition" />
          <StatCard label="NbClust-based selection" value={`k=${sop2.nbclust.selectedK}`} detail={`${sop2.nbclust.votesForSelectedK}/${sop2.nbclust.usableIndices} usable votes exposed in current data`} accent="teal" />
        </div>
        <div className="mt-5 space-y-3">
          {run.kSelection.voteDistribution.map((entry) => (
            <div key={entry.k} className="grid grid-cols-[2.75rem_1fr_2.5rem] items-center gap-3 text-sm">
              <span className={entry.k === run.kSelection.selectedK ? "font-semibold text-teal-800" : "text-muted"}>k={entry.k}</span>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div className={entry.k === run.kSelection.selectedK ? "h-full rounded-full bg-teal-700" : "h-full rounded-full bg-slate-300"} style={{ width: `${(entry.votes / voteDenominator) * 100}%` }} />
              </div>
              <span className="text-right font-semibold tabular-nums">{entry.votes}</span>
            </div>
          ))}
        </div>
        <p className="existing-note">The available NbClust vote distribution is stored aggregate evidence. A no-PCA/no-DPC NbClust-only controlled clustering result is not exposed.</p>
      </section>

      <section className="existing-card">
        <div className="existing-card-header">
          <div>
            <p>Controlled Validation</p>
            <h2>PCA and initialization held constant</h2>
          </div>
        </div>
        <div className="summary-sop-metric-table">
          <div className="summary-sop-metric-head">
            <span>Baseline K-Means</span>
            <span>Metric</span>
            <span>NbClust-Only K-Means</span>
          </div>
          {metricKeys.map((metric) => {
            const existingValue = baselineCondition.metrics[metric].mean;
            return (
              <div key={metric} className="summary-sop-metric-row">
                <strong>{formatSopMetric(metric, existingValue)}</strong>
                <div>
                  <span>{sopMetricLabels[metric]}</span>
                  <small>{metric === "davies_bouldin" ? "Lower is better" : "Higher is better"}</small>
                  <em>Pending</em>
                </div>
                <strong>—</strong>
              </div>
            );
          })}
        </div>
      </section>

      <FindingNote>
        The available data supports that NbClust selected k={sop2.nbclust.selectedK} from {sop2.nbclust.usableIndices} usable internal-validity indices. The corrected NbClust-only controlled result is pending because the stored SOP 2 clustering outputs are PCA-based.
      </FindingNote>
    </div>
  );
};

const DpcTab = ({ run, evaluation, error }: { run: UnifiedResearchRun; evaluation: SopEvaluation | null; error: string | null }) => {
  const { existingProgress, enhancedProgress, replayRun } = useSopRunReplay();
  const dpcDeterminism = evaluation?.sop3.dpcDeterminism;
  const baselineCondition = evaluation?.sop1.ablation.conditions[0];

  if (!baselineCondition || !dpcDeterminism) {
    return (
      <div className="summary-tab-panel">
        <div className="existing-note">{error ?? "Loading aggregate DPC evaluation details..."}</div>
      </div>
    );
  }

  return (
    <div className="summary-tab-panel summary-sop1-panel">
      <section className="summary-sop-intro">
        <p>SOP 3</p>
        <h2>Density-Peak-Based Deterministic Initialization</h2>
      </section>

      <section className="summary-controlled-strip" aria-label="Controlled SOP 3 settings">
        <div><span>Frozen cohort</span><strong>n = {run.cohort.parentN.toLocaleString()}</strong></div>
        <div><span>Control configuration</span><strong>No PCA • No NbClust • No DPC</strong></div>
        <div><span>Comparison configuration</span><strong>No PCA • No NbClust • DPC</strong></div>
        <div><span>Controlled change</span><strong>Only DPC initialization is introduced</strong></div>
      </section>

      <section className="summary-sop-comparison">
        <SopRunPanel
          side="existing"
          title="Baseline K-Means"
          subtitle="No PCA • No NbClust • No DPC"
          label="Control configuration"
          condition={fromSop1Condition(baselineCondition)}
          progress={existingProgress}
          onRun={() => replayRun("existing")}
        />
        <div className="summary-vs" aria-hidden="true">vs</div>
        <SopRunPanel
          side="enhanced"
          title="DPC-Only K-Means"
          subtitle="No PCA • No NbClust • DPC"
          label="Only DPC initialization is introduced"
          condition={fromSop3DpcResult(dpcDeterminism)}
          progress={enhancedProgress}
          onRun={() => replayRun("enhanced")}
          resultPending
        />
      </section>

      <section className="existing-card">
        <div className="existing-card-header">
          <div>
            <p>SOP 3 — DPC</p>
            <h2>Available DPC deterministic seed evidence</h2>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {run.initialization.selectedCentroids.map((centroid) => (
            <div key={centroid.candidateId} className="border-l-2 border-teal-700 bg-teal-50/50 px-4 py-3 text-sm">
              <div className="font-semibold text-ink">Cluster {centroid.assignedCluster} seed</div>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <div><dt className="text-muted">Density rho</dt><dd className="font-semibold tabular-nums">{centroid.rho.toFixed(5)}</dd></div>
                <div><dt className="text-muted">Separation delta</dt><dd className="font-semibold tabular-nums">{centroid.delta.toFixed(5)}</dd></div>
                <div><dt className="text-muted">Priority gamma</dt><dd className="font-semibold tabular-nums">{centroid.gamma.toFixed(5)}</dd></div>
              </dl>
            </div>
          ))}
        </div>
      </section>

      <section className="existing-card">
        <div className="existing-card-header">
          <div>
            <p>Controlled Initialization Finding</p>
            <h2>Random initialization/control versus DPC deterministic initialization</h2>
          </div>
        </div>
        <div className="mt-5 overflow-x-auto">
          <table className="research-table min-w-[640px]">
            <thead><tr><th>Metric</th><th className="text-right">Random/control mean</th><th className="text-right">DPC-only</th><th className="text-right">Assessment</th></tr></thead>
            <tbody>
              {(Object.keys(sopMetricLabels) as SopMetric[]).map((metric) => (
                <tr key={metric}>
                  <td className="font-medium">{sopMetricLabels[metric]}</td>
                  <td className="text-right tabular-nums">{formatSopMetric(metric, baselineCondition.metrics[metric].mean)}</td>
                  <td className="text-right tabular-nums">—</td>
                  <td className="text-right text-muted">Validated controlled result pending</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <FindingNote>
          DPC deterministic checks are available in the current aggregate contract, but the corrected no-PCA/no-NbClust DPC-only controlled result is pending. No metric improvement is claimed for SOP 3 here.
        </FindingNote>
      </section>
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
        <ol className="grid gap-x-8 sm:grid-cols-2">
          {run.clusterProfiles.smdRanking.slice(0, 10).map((row, index) => (
            <li key={row.variable} className="grid grid-cols-[2rem_1fr_auto] items-baseline gap-3 border-b border-line py-2.5 text-sm">
              <span className="text-[11px] font-semibold tabular-nums text-muted">{String(index + 1).padStart(2, "0")}</span>
              <span className="font-medium">{getMeasureLabel(row.variable)}</span>
              <span className="text-xs font-semibold tabular-nums text-muted">{row.standardizedMeanDifferenceCluster1Minus0.toFixed(5)}</span>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-right text-[11px] text-muted">Values shown as SMD (Cluster 1 minus Cluster 0).</p>
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
          <LongitudinalProgressionChart data={run.longitudinal.timeSeries} />
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
        Higher ADAS-Cog13 indicates greater cognitive impairment. Longitudinal differences are observational and do not establish causality or individual prognosis. No second longitudinal K-Means clustering is performed.
      </p>
    </div>
  );
};

const FullComparisonTab = ({ run }: { run: UnifiedResearchRun }) => (
  <>
    <OverviewTab run={run} />
    <MetricsTab run={run} />
  </>
);

const renderTab = (activeTab: SummaryTab, run: UnifiedResearchRun, evaluation: SopEvaluation | null, error: string | null) => {
  if (activeTab === "pca") return <PcaTab run={run} evaluation={evaluation} error={error} />;
  if (activeTab === "nbclust") return <NbClustTab run={run} evaluation={evaluation} error={error} />;
  if (activeTab === "dpc") return <DpcTab run={run} evaluation={evaluation} error={error} />;
  if (activeTab === "fullComparison") return <FullComparisonTab run={run} />;
  if (activeTab === "profiles") return <ProfilesTab run={run} />;
  return <LongitudinalTab run={run} />;
};

export const ClustersPage = ({ run }: ClustersPageProps) => {
  const [activeTab, setActiveTab] = useState<SummaryTab>("pca");
  const { evaluation, error } = useSopEvaluation();

  if (!run) return null;

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
        {renderTab(activeTab, run, evaluation, error)}
      </div>
      <ResearchPageNavigation currentPath="/summary-of-findings" />
    </div>
  );
};
