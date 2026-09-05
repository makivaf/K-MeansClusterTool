import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { UnifiedResearchRun } from "../../../../packages/shared/src";
import { ResearchPageNavigation } from "../components/layout/ResearchPageNavigation";

type OverviewPageProps = { run: UnifiedResearchRun | null };
type BaselineMetric = UnifiedResearchRun["baselineComparison"]["metrics"][number];

const K_MIN = 2;
const K_MAX = 10;

const metricLabels: Record<BaselineMetric["metric"], string> = {
  silhouette: "Silhouette",
  davies_bouldin: "Davies-Bouldin",
  calinski_harabasz: "Calinski-Harabasz"
};

const formatMetric = (metric: BaselineMetric) => metric.baselineValue.toFixed(5);

const baselineSteps = [
  {
    title: "Dataset input",
    description: "Use the retained study-entry cognitive and functional measures."
  },
  {
    title: "Manual k specification",
    description: "Choose a cluster count before fitting standard K-Means."
  },
  {
    title: "Random initialization",
    description: "Initialize centroids without PCA, NbClust, or DPC enhancement."
  },
  {
    title: "Lloyd iteration",
    description: "Assign observations and update centroids until convergence."
  },
  {
    title: "Internal validation",
    description: "Evaluate clustering geometry with aggregate validation metrics."
  }
];

const clusterColors = ["#0f7977", "#d88a00", "#2563eb", "#7c3aed", "#dc2626", "#16a34a", "#0891b2", "#ca8a04", "#be185d", "#475569"];

type ScatterPoint = {
  id: number;
  cluster: number;
  startX: number;
  startY: number;
  midX: number;
  midY: number;
  finalX: number;
  finalY: number;
};

const buildIllustrativePoints = (k: number): ScatterPoint[] => {
  const centerX = 50;
  const centerY = 52;
  return Array.from({ length: Math.max(72, k * 18) }, (_, index) => {
    const cluster = index % k;
    const clusterAngle = (cluster / k) * Math.PI * 2 - Math.PI / 2;
    const ring = 32 + (cluster % 2) * 5;
    const finalCenterX = centerX + Math.cos(clusterAngle) * ring;
    const finalCenterY = centerY + Math.sin(clusterAngle) * (ring * 0.72);
    const localAngle = ((index * 137.5) % 360) * (Math.PI / 180);
    const localRadius = 2 + ((index * 7) % 13) * 0.55;
    const startAngle = ((index * 41) % 360) * (Math.PI / 180);
    const startRadius = 6 + ((index * 11) % 27) * 0.82;

    return {
      id: index,
      cluster,
      startX: centerX + Math.cos(startAngle) * startRadius,
      startY: centerY + Math.sin(startAngle) * (startRadius * 0.78),
      midX: centerX + Math.cos(startAngle) * (startRadius * 1.25),
      midY: centerY + Math.sin(startAngle) * (startRadius * 0.95),
      finalX: finalCenterX + Math.cos(localAngle) * localRadius,
      finalY: finalCenterY + Math.sin(localAngle) * (localRadius * 0.72)
    };
  });
};

const easeOutCubic = (value: number) => 1 - Math.pow(1 - value, 3);

const assignmentColor = (cluster: number, id: number, progress: number) => {
  const revealThreshold = 0.2 + (id % 16) * 0.045;
  return progress >= 1 || progress >= revealThreshold
    ? clusterColors[cluster % clusterColors.length]
    : "#aebcbc";
};

export const OverviewPage = ({ run }: OverviewPageProps) => {
  const [manualK, setManualK] = useState(run?.baselineComparison.baselineMethod.selectedK ?? K_MIN);
  const [attemptedK, setAttemptedK] = useState<number | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [executionProgress, setExecutionProgress] = useState(0);
  const [completedK, setCompletedK] = useState<number | null>(null);
  const [runStartedAt, setRunStartedAt] = useState<number | null>(null);
  const [runCompletedAt, setRunCompletedAt] = useState<number | null>(null);
  const intervalRef = useRef<number | null>(null);

  const baselineComparison = run?.baselineComparison;
  const baselineMethod = baselineComparison?.baselineMethod;
  const selectedK = baselineMethod?.selectedK;
  const showVisualizationStatus = attemptedK !== null && !isRunning;
  const sliderFill = useMemo(
    () => `${((manualK - K_MIN) / (K_MAX - K_MIN)) * 100}%`,
    [manualK]
  );
  const rawAnimationPosition = executionProgress / 100;
  const activeStageIndex = executionProgress === 100
    ? baselineSteps.length - 1
    : Math.min(baselineSteps.length - 1, Math.floor(executionProgress / (100 / baselineSteps.length)));
  const scatterPoints = useMemo(() => buildIllustrativePoints(manualK), [manualK]);
  const displayRuntime = runStartedAt
    ? (((runCompletedAt ?? Date.now()) - runStartedAt) / 1000).toFixed(1)
    : "0.0";

  useEffect(() => () => {
    if (intervalRef.current !== null) window.clearInterval(intervalRef.current);
  }, []);

  const resetVisualization = (nextK = manualK) => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setManualK(nextK);
    setAttemptedK(null);
    setCompletedK(null);
    setIsRunning(false);
    setExecutionProgress(0);
    setRunStartedAt(null);
    setRunCompletedAt(null);
  };

  const runIllustrativeWorkflow = () => {
    if (intervalRef.current !== null) window.clearInterval(intervalRef.current);
    setAttemptedK(manualK);
    setCompletedK(null);
    setExecutionProgress(0);
    setIsRunning(true);
    const startedAt = Date.now();
    setRunStartedAt(startedAt);
    setRunCompletedAt(null);
    intervalRef.current = window.setInterval(() => {
      setExecutionProgress((current) => {
        const next = Math.min(100, current + 4);
        if (next === 100 && intervalRef.current !== null) {
          window.clearInterval(intervalRef.current);
          intervalRef.current = null;
          setIsRunning(false);
          setCompletedK(manualK);
          setRunCompletedAt(Date.now());
        }
        return next;
      });
    }, 140);
  };

  if (!run || !baselineComparison || !baselineMethod) return null;

  return (
    <div className="existing-algorithm-page">
      <section className="existing-hero">
        <div>
          <p className="existing-eyebrow">Baseline Method</p>
          <h1>Standard K-Means Clustering</h1>
          <p>
            This view represents the existing baseline K-Means workflow: retained
            standardized measures, manually specified cluster count, random
            initialization, Lloyd iteration, and aggregate internal validation.
          </p>
        </div>
        <div className="existing-hero-summary" aria-label="Baseline method summary">
          <span>Current validated baseline</span>
          <strong>k={selectedK}</strong>
          <small>{baselineMethod.runCount} retained random-initialization runs</small>
        </div>
      </section>

      <section className="existing-grid">
        <article className="existing-card existing-card-large existing-cluster-card">
          <div className="existing-card-header">
            <div>
              <p>Dataset Information</p>
              <h2>Study-entry baseline matrix</h2>
            </div>
          </div>
          <dl className="existing-dataset-grid">
            <div>
              <dt>Participants</dt>
              <dd>{run.cohort.parentN.toLocaleString()}</dd>
            </div>
            <div>
              <dt>Input representation</dt>
              <dd>{baselineMethod.representation}</dd>
            </div>
            <div>
              <dt>Retained measures</dt>
              <dd>{run.preprocessing.retainedFeatures.length}</dd>
            </div>
            <div>
              <dt>Algorithm</dt>
              <dd>{baselineMethod.algorithm}</dd>
            </div>
          </dl>
        </article>

        <article className="existing-card">
          <div className="existing-card-header">
            <div>
              <p>K Specification (Manual Input)</p>
              <h2>Selected k: {manualK}</h2>
            </div>
          </div>
          <div className="existing-slider-value">
            <span>{K_MIN}</span>
            <strong>k={manualK}</strong>
            <span>{K_MAX}</span>
          </div>
          <input
            aria-label="Manual cluster count"
            className="baseline-k-slider"
            type="range"
            min={K_MIN}
            max={K_MAX}
            step={1}
            value={manualK}
            disabled={isRunning}
            onChange={(event) => resetVisualization(Number(event.target.value))}
            style={{ "--slider-fill": sliderFill } as CSSProperties}
          />
          <div className="existing-k-ticks" aria-hidden="true">
            {Array.from({ length: K_MAX - K_MIN + 1 }, (_, index) => (
              <span key={K_MIN + index}>{K_MIN + index}</span>
            ))}
          </div>
          <button
            type="button"
            className="existing-run-button"
            disabled={isRunning}
            onClick={runIllustrativeWorkflow}
          >
            {isRunning ? "Running Workflow..." : "Run Algorithm"}
          </button>
          {showVisualizationStatus ? (
            <p className="existing-run-status" role="status">
              Workflow visualization completed for k={attemptedK}. Validated
              baseline metrics remain tied to frozen k={selectedK} outputs.
            </p>
          ) : null}
        </article>
      </section>

      <section className="existing-card">
        <div className="existing-card-header">
          <div>
            <p>Pipeline Execution</p>
            <h2>Standard K-Means flow</h2>
          </div>
        </div>
        <div className="existing-progress" aria-label={`Pipeline progress ${executionProgress}%`}>
          <div><span style={{ width: `${executionProgress}%` }} /></div>
          <strong>{executionProgress}%</strong>
        </div>
        <ol className="existing-flow" aria-label="Baseline K-Means pipeline">
          {baselineSteps.map((step, index) => (
            <li
              key={step.title}
              className={executionProgress === 100 || index < activeStageIndex ? "is-complete" : index === activeStageIndex && isRunning ? "is-active" : ""}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="existing-results-grid">
        <article className="existing-card existing-card-large">
          <div className="existing-card-header">
            <div>
              <p>Final Cluster Visualization</p>
              <h2>Scatter projection and centroid reveal</h2>
            </div>
          </div>
          <div className="existing-clustering-layout">
            <div className="existing-cluster-main">
              <div
                className="existing-scatter-plot"
                aria-label={`Illustrative scatter plot grouped into ${manualK} clusters`}
              >
                <div className="existing-scatter-grid" aria-hidden="true" />
                <span className="existing-axis-label existing-axis-label-x">Projection Dimension 1</span>
                <span className="existing-axis-label existing-axis-label-y">Projection Dimension 2</span>
                {Array.from({ length: manualK }, (_, index) => {
                  const angle = (index / manualK) * Math.PI * 2 - Math.PI / 2;
                  const finalLeft = 50 + Math.cos(angle) * (32 + (index % 2) * 5);
                  const finalTop = 52 + Math.sin(angle) * ((32 + (index % 2) * 5) * 0.72);
                  return (
                    <span
                      key={`centroid-${index}`}
                      className="existing-centroid"
                      style={{
                        left: `${finalLeft}%`,
                        top: `${finalTop}%`,
                        opacity: rawAnimationPosition >= 0.75 ? 1 : 0
                      } as CSSProperties}
                    >
                      ★
                    </span>
                  );
                })}
                {scatterPoints.map((point) => (
                  <span
                    key={point.id}
                    className="existing-scatter-point"
                    style={{
                      "--point-color": assignmentColor(point.cluster, point.id, rawAnimationPosition),
                      left: `${point.finalX}%`,
                      top: `${point.finalY}%`,
                      transitionDelay: `${(point.id % 11) * 12}ms`
                    } as CSSProperties}
                  />
                ))}
              </div>
              <div className="existing-cluster-legend" aria-label="Selected cluster legend">
                {Array.from({ length: manualK }, (_, index) => (
                  <div key={index}>
                    <span aria-hidden="true" style={{ backgroundColor: clusterColors[index % clusterColors.length] }} />
                    <strong>Cluster {index}</strong>
                  </div>
                ))}
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
            <aside className="existing-run-details" aria-label="Run visualization details">
              <div>
                <span>Selected k</span>
                <strong>{attemptedK ?? manualK}</strong>
              </div>
              <div>
                <span>Iteration count</span>
                <strong>—</strong>
                <small>Not exposed for selected-k replay</small>
              </div>
              <div>
                <span>Runtime</span>
                <strong>{displayRuntime}s</strong>
                <small>Browser animation time</small>
              </div>
              <div>
                <span>Configuration</span>
                <p>{baselineMethod.algorithm}, random initialization, manual k range {K_MIN}-{K_MAX}</p>
              </div>
              <div>
                <span>Run state</span>
                <p>{isRunning ? "Running" : completedK ? `Complete for k=${completedK}` : "Ready"}</p>
              </div>
            </aside>
          </div>
        </article>

        <article className="existing-card">
          <div className="existing-card-header">
            <div>
              <p>Internal Validation</p>
              <h2>Frozen baseline metrics</h2>
            </div>
          </div>
          <div className="existing-metrics">
            {baselineComparison.metrics.map((metric) => (
              <div key={metric.metric}>
                <span>{metricLabels[metric.metric]}</span>
                <strong>{formatMetric(metric)}</strong>
                <small>
                  {metric.direction === "lower" ? "Lower is better" : "Higher is better"}
                  {" "}- SD {metric.baselineStandardDeviation.toFixed(5)}
                </small>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="existing-card">
        <div className="existing-card-header">
          <div>
            <p>Baseline Method Details</p>
            <h2>Validated configuration</h2>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="research-table min-w-[680px]">
            <thead>
              <tr>
                <th>Configuration</th>
                <th>Validated baseline value</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(baselineMethod).map(([key, value]) => (
                <tr key={key}>
                  <td className="font-medium capitalize">{key.replace(/([A-Z])/g, " $1")}</td>
                  <td>{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <ResearchPageNavigation currentPath="/existing-algorithm" />
    </div>
  );
};
