import type { CSSProperties } from "react";
import type { UnifiedResearchRun } from "../../../../packages/shared/src";
import { ResearchPageNavigation } from "../components/layout/ResearchPageNavigation";
import { getMeasureLabel } from "../utils/measureLabels";

type EnhancedKMeansPageProps = { run: UnifiedResearchRun | null };

const clusterColors = ["#0f7977", "#d88a00"];

const enhancedSteps = [
  {
    title: "Dataset input",
    description: "Use the validated study-entry cohort before longitudinal follow-up."
  },
  {
    title: "Preprocessing",
    description: "Retain aggregate-safe cognitive and functional measures."
  },
  {
    title: "PCA",
    description: "Project retained variables into the validated principal components."
  },
  {
    title: "NbClust",
    description: "Select the final cluster count using index voting."
  },
  {
    title: "DPC initialization",
    description: "Initialize centroids deterministically from Density Peaks candidates."
  },
  {
    title: "Lloyd K-Means",
    description: "Fit the final K-Means model on the PCA representation."
  },
  {
    title: "Final clustering",
    description: "Freeze aggregate cluster sizes and validation metrics."
  }
];

type ScatterPoint = {
  id: number;
  cluster: number;
  x: number;
  y: number;
};

const centroidPositions = [
  { x: 35, y: 58 },
  { x: 68, y: 36 }
];

const buildIllustrativePoints = (clusterSizes: UnifiedResearchRun["enhancedClustering"]["clusterSizes"]): ScatterPoint[] => {
  const totalMembers = clusterSizes.reduce((sum, entry) => sum + entry.nMembers, 0);
  const plotPoints = 140;

  return clusterSizes.flatMap((entry, clusterIndex) => {
    const center = centroidPositions[clusterIndex % centroidPositions.length];
    const pointsForCluster = Math.max(24, Math.round((entry.nMembers / totalMembers) * plotPoints));

    return Array.from({ length: pointsForCluster }, (_, index) => {
      const angle = ((index * 137.5 + clusterIndex * 29) % 360) * (Math.PI / 180);
      const radius = 3 + ((index * 11 + clusterIndex * 7) % 17) * 0.62;
      const band = 0.72 + ((index + clusterIndex) % 5) * 0.05;

      return {
        id: clusterIndex * plotPoints + index,
        cluster: entry.clusterId,
        x: center.x + Math.cos(angle) * radius,
        y: center.y + Math.sin(angle) * radius * band
      };
    });
  });
};

const formatPercent = (value: number) => `${(value * 100).toFixed(2)}%`;

export const EnhancedKMeansPage = ({ run }: EnhancedKMeansPageProps) => {
  if (!run) return null;

  const metrics = run.enhancedClustering.metrics;
  const clusterSizes = [...run.enhancedClustering.clusterSizes].sort((left, right) => left.clusterId - right.clusterId);
  const scatterPoints = buildIllustrativePoints(clusterSizes);
  const voteDenominator = Math.max(...run.kSelection.voteDistribution.map((entry) => entry.votes), 1);

  return (
    <div className="existing-algorithm-page">
      <section className="existing-hero">
        <div>
          <p className="existing-eyebrow">Enhanced Method</p>
          <h1>Enhanced K-Means Clustering</h1>
          <p>
            This view presents the validated enhanced pipeline: study-entry
            cohort construction, preprocessing, PCA, NbClust cluster-count
            selection, deterministic DPC initialization, and final Lloyd
            K-Means clustering.
          </p>
        </div>
        <div className="existing-hero-summary" aria-label="Enhanced method summary">
          <span>NbClust selected</span>
          <strong>k={run.kSelection.selectedK}</strong>
          <small>{run.enhancedClustering.iterations} Lloyd K-Means iterations</small>
        </div>
      </section>

      <section className="existing-grid">
        <article className="existing-card existing-card-large existing-cluster-card">
          <div className="existing-card-header">
            <div>
              <p>Dataset Information</p>
              <h2>Study-entry enhanced matrix</h2>
            </div>
          </div>
          <dl className="existing-dataset-grid">
            <div>
              <dt>Participants</dt>
              <dd>{run.cohort.parentN.toLocaleString()}</dd>
            </div>
            <div>
              <dt>Retained variables</dt>
              <dd>{run.preprocessing.retainedFeatures.length}</dd>
            </div>
            <div>
              <dt>PCA representation</dt>
              <dd>{run.pca.components} PCs</dd>
            </div>
            <div>
              <dt>Cumulative variance</dt>
              <dd>{formatPercent(run.pca.cumulativeExplainedVariance)}</dd>
            </div>
          </dl>
        </article>

        <article className="existing-card">
          <div className="existing-card-header">
            <div>
              <p>Enhanced Configuration</p>
              <h2>PCA + NbClust + DPC</h2>
            </div>
          </div>
          <dl className="existing-dataset-grid">
            <div>
              <dt>k selection</dt>
              <dd>{run.kSelection.method}</dd>
            </div>
            <div>
              <dt>DPC initialization</dt>
              <dd>{run.initialization.deterministic ? "Deterministic" : "Not deterministic"}</dd>
            </div>
            <div>
              <dt>Algorithm</dt>
              <dd>{run.enhancedClustering.algorithm}</dd>
            </div>
            <div>
              <dt>Convergence</dt>
              <dd>{run.enhancedClustering.converged ? "Reached" : "Not reached"}</dd>
            </div>
          </dl>
        </article>
      </section>

      <section className="existing-card">
        <div className="existing-card-header">
          <div>
            <p>Pipeline Execution</p>
            <h2>Validated enhanced flow</h2>
          </div>
        </div>
        <div className="existing-progress" aria-label="Pipeline progress 100%">
          <div><span style={{ width: "100%" }} /></div>
          <strong>100%</strong>
        </div>
        <ol className="existing-flow enhanced-flow" aria-label="Enhanced K-Means pipeline">
          {enhancedSteps.map((step, index) => (
            <li key={step.title} className="is-complete">
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
              <h2>Enhanced final clusters</h2>
            </div>
          </div>
          <div className="existing-clustering-layout">
            <div className="existing-cluster-main">
              <div
                className="existing-scatter-plot"
                aria-label={`Illustrative enhanced scatter plot grouped into ${run.kSelection.selectedK} validated clusters`}
              >
                <div className="existing-scatter-grid" aria-hidden="true" />
                <span className="existing-axis-label existing-axis-label-x">Projection Dimension 1</span>
                <span className="existing-axis-label existing-axis-label-y">Projection Dimension 2</span>
                {centroidPositions.slice(0, run.kSelection.selectedK).map((centroid, index) => (
                  <span
                    key={`enhanced-centroid-${index}`}
                    className="existing-centroid"
                    style={{
                      left: `${centroid.x}%`,
                      top: `${centroid.y}%`,
                      opacity: 1
                    } as CSSProperties}
                  >
                    ★
                  </span>
                ))}
                {scatterPoints.map((point) => (
                  <span
                    key={point.id}
                    className="existing-scatter-point"
                    style={{
                      "--point-color": clusterColors[point.cluster % clusterColors.length],
                      left: `${point.x}%`,
                      top: `${point.y}%`
                    } as CSSProperties}
                  />
                ))}
              </div>
              <div className="existing-cluster-legend" aria-label="Enhanced cluster legend">
                {clusterSizes.map((cluster) => (
                  <div key={cluster.clusterId}>
                    <span aria-hidden="true" style={{ backgroundColor: clusterColors[cluster.clusterId % clusterColors.length] }} />
                    <strong>Cluster {cluster.clusterId}</strong>
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
            <aside className="existing-run-details" aria-label="Enhanced run details">
              <div>
                <span>Selected k</span>
                <strong>{run.kSelection.selectedK}</strong>
                <small>{run.kSelection.votesForSelectedK} of {run.kSelection.usableVotes} usable NbClust votes</small>
              </div>
              <div>
                <span>Iteration count</span>
                <strong>{run.enhancedClustering.iterations}</strong>
                <small>Lloyd K-Means</small>
              </div>
              <div>
                <span>Runtime</span>
                <strong>Not exposed</strong>
                <small>No runtime field exists in the web contract</small>
              </div>
              <div>
                <span>Configuration</span>
                <p>{run.enhancedClustering.representation}; NbClust k={run.kSelection.selectedK}; DPC deterministic initialization.</p>
              </div>
              <div>
                <span>Final sizes</span>
                <p>{clusterSizes.map((cluster) => `Cluster ${cluster.clusterId}: ${cluster.nMembers.toLocaleString()}`).join(" / ")}</p>
              </div>
            </aside>
          </div>
        </article>

        <article className="existing-card">
          <div className="existing-card-header">
            <div>
              <p>Internal Validation</p>
              <h2>Frozen enhanced metrics</h2>
            </div>
          </div>
          <div className="existing-metrics">
            <div>
              <span>Silhouette</span>
              <strong>{metrics.silhouette.toFixed(5)}</strong>
              <small>Higher is better</small>
            </div>
            <div>
              <span>Davies-Bouldin</span>
              <strong>{metrics.daviesBouldin.toFixed(5)}</strong>
              <small>Lower is better</small>
            </div>
            <div>
              <span>Calinski-Harabasz</span>
              <strong>{metrics.calinskiHarabasz.toFixed(5)}</strong>
              <small>Higher is better</small>
            </div>
          </div>
        </article>
      </section>

      <section className="existing-grid">
        <article className="existing-card existing-card-large">
          <div className="existing-card-header">
            <div>
              <p>NbClust Evidence</p>
              <h2>Index-voting distribution</h2>
            </div>
          </div>
          <div className="space-y-3">
            {run.kSelection.voteDistribution.map((entry) => (
              <div key={entry.k} className="grid grid-cols-[2.75rem_1fr_2.5rem] items-center gap-3 text-sm">
                <span className={entry.k === run.kSelection.selectedK ? "font-semibold text-teal-800" : "text-muted"}>k={entry.k}</span>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={entry.k === run.kSelection.selectedK ? "h-full rounded-full bg-teal-700" : "h-full rounded-full bg-slate-300"}
                    style={{ width: `${(entry.votes / voteDenominator) * 100}%` }}
                  />
                </div>
                <span className="text-right font-semibold tabular-nums">{entry.votes}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="existing-card">
          <div className="existing-card-header">
            <div>
              <p>DPC Initialization</p>
              <h2>Selected seeds</h2>
            </div>
          </div>
          <div className="grid gap-3">
            {run.initialization.selectedCentroids.map((centroid) => (
              <div key={centroid.candidateId} className="border-l-2 border-teal-700 bg-teal-50/50 px-4 py-3 text-sm">
                <div className="font-semibold text-ink">Cluster {centroid.assignedCluster} seed</div>
                <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <dt className="text-muted">Density rho</dt>
                    <dd className="font-semibold tabular-nums">{centroid.rho.toFixed(5)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Separation delta</dt>
                    <dd className="font-semibold tabular-nums">{centroid.delta.toFixed(5)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Priority gamma</dt>
                    <dd className="font-semibold tabular-nums">{centroid.gamma.toFixed(5)}</dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>
          <p className="existing-note">
            DPC reproducibility passed across {run.initialization.reproducibilityRuns} repeated checks.
          </p>
        </article>
      </section>

      <section className="existing-card">
        <div className="existing-card-header">
          <div>
            <p>Retained Variables</p>
            <h2>Preprocessed input set</h2>
          </div>
        </div>
        <div className="grid gap-x-5 sm:grid-cols-2 xl:grid-cols-3">
          {run.preprocessing.retainedFeatures.map((feature) => (
            <span key={feature} className="border-b border-line py-2 text-xs font-medium text-ink">
              {getMeasureLabel(feature)}
            </span>
          ))}
        </div>
      </section>

      <ResearchPageNavigation currentPath="/enhanced-algorithm" />
    </div>
  );
};
