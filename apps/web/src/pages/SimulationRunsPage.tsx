import { PartitionProjection } from "../components/charts/PartitionProjection";
import { PcaChart, NbClustChart, NbClustIndexDetails, SilhouetteChart } from "../components/SopFigures";
import { DpcCenterTable } from "../components/DpcCenterTable";
import { InitializationComparison } from "../components/InitializationComparison";
import { InternalValidationCalculationDetails } from "../components/InternalValidationCalculationDetails";
import { formatMetric } from "../components/MetricComparisonTable";
﻿import { useEffect, useState } from "react";
import { Check, Play, RefreshCw } from "lucide-react";
import { useRef } from "react";
import { Link } from "react-router-dom";
import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import { simulationParticipantLimit, simulationConfigurationKey, SimulationRunStateSchema, type SimulationRunState } from "../../../../packages/shared/src/simulation";
import { useSimulationMetadata } from "../hooks/useSimulationMetadata";
import { useSimulationCapabilities } from "../hooks/useSimulationCapabilities";
import { API_BASE_URL } from "../config/api";
import "./SimulationRunsPage.css";
import { CorrelationHeatmap } from "../components/charts/FinalFindingsCharts";
import { MethodCard, SopComparison, VariableChips, VarianceSummary, PcaContribution, ClusterDistribution } from "../components/SopComparison";

const format = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 6 });
const axisNumber = (value: number) => Number(value.toFixed(2)).toFixed(2);
const displayCoordinate = (value: number) => value.toFixed(4);
type Analysis = NonNullable<SimulationRunState["result"]>["analysis"];
const percent = (value: number) => `${(100 * value).toFixed(2)}%`;

// Methodology groups reflect coarse runtime boundaries, not separate backend stages.
const progressStages = [
  ["Preparing Sample", "Sampling participants", 0],
  ["Preprocessing", "Cleaning & standardization", 1],
  ["Standard Setup", "Feature scaling", 1],
  ["PCA", "Dimensionality reduction", 1],
  ["NbClust", "Cluster selection", 2],
  ["DPC", "Centroid initialization", 2],
  ["K-Means", "Clustering both methods", 2],
  ["Validation", "Computing metrics", 3],
  ["Complete", "Results ready", 4]
] as const;
export const SimulationProgress = ({ stage, interrupted }: { stage: number; interrupted: boolean }) => (
  <ol className="simulation-stepper" aria-label="Simulation run progress">
    {progressStages.map(([label, subtitle, runtimeStage]) => {
      const done = runtimeStage < stage || (stage === 4 && !interrupted);
      const active = !interrupted && stage < 4 && runtimeStage === stage;
      return <li key={label} aria-current={active ? "step" : undefined} className={"simulation-step " + (done ? "is-reached" : active ? "is-active" : "")}>
        <span className="simulation-step-node" aria-hidden="true">{done ? <Check size={16} /> : <span className="simulation-step-dot" />}</span>
        <span>{label}<span className="sr-only">: {done ? "complete" : active ? "in progress" : "pending"}</span><span className="simulation-step-subtitle">{subtitle}</span></span>
      </li>;
    })}
  </ol>
);

const CorrelationChart = ({ analysis }: { analysis: Analysis }) => analysis.correlation
  ? <CorrelationHeatmap correlation={{ features: analysis.enhanced.retainedVariables, matrix: analysis.correlation }} compact showKey={false}
      caption={`Pearson r (-1 to +1) of this sample's standardized retained features. n = ${analysis.existing.participantCount.toLocaleString()}. Constant-feature correlations are unavailable.`} />
  : <p className="simulation-unavailable">Correlation unavailable for this historical run.</p>;
const DecisionGraph = ({ enhanced }: { enhanced: Analysis["enhanced"] }) => enhanced.dpc.decisionGraph ? <div className="simulation-chart-plot" role="img" aria-label="DPC rho delta decision graph; selected centers highlighted"><ResponsiveContainer width="100%" height="100%"><ScatterChart><CartesianGrid strokeDasharray="3 3" /><XAxis type="number" dataKey="rho" name="rho" allowDecimals={false} /><YAxis type="number" dataKey="delta" name="delta" tickFormatter={axisNumber} width={65} /><Tooltip formatter={(value: number, name: string) => [name === "rho" ? format(value) : displayCoordinate(value), name]} cursor={{ strokeDasharray: "3 3" }} /><Scatter name="Participants" data={enhanced.dpc.decisionGraph.filter(point => !point.selected)} fill="#b7d9d5" isAnimationActive={false} /><Scatter name="DPC centers" data={enhanced.dpc.decisionGraph.filter(point => point.selected)} fill="#e49b35" shape="diamond" isAnimationActive={false} /></ScatterChart></ResponsiveContainer></div> : <p className="simulation-unavailable">Decision graph unavailable for this historical run.</p>;
const ProjectionChart = ({ analysis, method }: { analysis: Analysis; method: "standard" | "enhanced" }) => {
  const projection = analysis.projection;
  if (!projection) return <p className="simulation-unavailable">Projection unavailable for this historical run.</p>;
  const centers = method === "standard" ? projection.standardCentroids : projection.enhancedCentroids;
  return <PartitionProjection points={projection.points.map(point => ({ x: point.x, y: point.y, cluster: point[method] }))} centers={centers} label={method} />;
};

const metricTitles = { silhouette: "Silhouette Coefficient", davies_bouldin: "Davies-Bouldin Index", calinski_harabasz: "Calinski-Harabasz Index" };

export const SimulationResults = ({ result }: { result: NonNullable<SimulationRunState["result"]> }) => {
  const { existing, enhanced } = result.analysis;
  const exploratory = result.metadata.configuration?.manualK != null;
  const selectedRun = existing.runs.find(run => run.seed === 0) ?? existing.runs[0];
  const usableIndices = enhanced.nbclust.indices.filter(index => index.status === "success").length;
  const support = enhanced.nbclust.votes.find(vote => vote.k === enhanced.selectedK)?.count;
  return <>
    <section className="simulation-surface simulation-results-section">
      <div className="simulation-section-heading"><h2 className="simulation-section-title">Feature Representation</h2><p>How each method represents the input feature space before clustering.</p></div>
      <SopComparison simulation figures standard={<MethodCard simulation title="Original Feature Representation">
        <p className="simulation-compact-note">{enhanced.retainedVariables.length} standardized input variables</p>
        <CorrelationChart analysis={result.analysis} />
        <VariableChips variables={enhanced.retainedVariables} />
      </MethodCard>} enhanced={<MethodCard simulation enhanced title="Principal Component Analysis">
        <p className="simulation-compact-note">{enhanced.retainedVariables.length} variables → {enhanced.pcaComponents} PCs · Cumulative variance = {percent(enhanced.cumulativeExplainedVariance)}</p>
        <PcaChart enhanced={enhanced} />
        <dl className="simulation-detail-list sop-summary"><div><dt>Input variables</dt><dd>{enhanced.retainedVariables.length}</dd></div><div><dt>Components retained</dt><dd>{enhanced.pcaComponents}</dd></div><div><dt>Cumulative variance</dt><dd>{percent(enhanced.cumulativeExplainedVariance)}</dd></div><div><dt>Variance threshold</dt><dd>≥ 85%</dd></div></dl>
      </MethodCard>}>
        <VarianceSummary retained={enhanced.pcaComponents} rows={enhanced.pcaVariance.map(row => ({ component: row.component, eigenvalue: row.eigenvalue, cumulativeVariance: row.cumulativeExplainedVariance }))} />
        <PcaContribution dimensions={enhanced.retainedVariables.length} components={enhanced.pcaComponents}
          n={existing.participantCount} k={result.analysis.pcaContribution?.k ?? existing.selectedK}
          calculations={{ existing: result.analysis.calculations?.standard, enhanced: result.analysis.calculations?.pca }} runCount={result.analysis.pcaContribution?.runCount}
          existing={result.analysis.pcaContribution?.existing} enhanced={result.analysis.pcaContribution?.enhanced}
          relativeChange={result.analysis.pcaContribution ? Object.fromEntries(Object.entries(result.analysis.pcaContribution.relativeChange).filter(([, value]) => value !== null)) : undefined}
          note={result.analysis.pcaContribution ? `Held constant: k = ${result.analysis.pcaContribution.k}, Lloyd algorithm, random initialization, ${result.analysis.pcaContribution.runCount} seeds, n = ${existing.participantCount.toLocaleString()}.` : "Controlled PCA-only metrics are unavailable for this simulation. The overall method comparison below includes all enhancements."} />
      </SopComparison>
    </section>
    <section className="simulation-surface simulation-results-section">
      <div className="simulation-section-heading"><h2 className="simulation-section-title">Cluster Number Selection</h2><p>How each method determines the number of clusters (k).</p></div>
      {exploratory && <p className="simulation-preview-note">Exploratory Standard manual k = {existing.selectedK}. The canonical study baseline uses Silhouette selection over k = 2–10; this sample's Silhouette choice is {existing.silhouetteSelectedK}. Enhanced remains automatic.</p>}
      <SopComparison simulation figures standard={
        <MethodCard simulation title="Silhouette-Based Selection"><p className="simulation-compact-note">Single-index criterion · k with highest average Silhouette selected</p><dl className="simulation-detail-list"><div><dt>Selection method</dt><dd>{exploratory ? "Exploratory manual k" : "Silhouette Coefficient"}</dd></div><div><dt>Candidate k</dt><dd>2–10</dd></div><div><dt>Selected k</dt><dd>{existing.selectedK}</dd></div></dl><h3 className="card-title">Silhouette by k</h3>{existing.silhouetteByK ? <SilhouetteChart candidates={existing.silhouetteByK} /> : <p className="simulation-unavailable">Candidate-k scores unavailable for this historical run.</p>}</MethodCard>} enhanced={<MethodCard simulation enhanced title="NbClust Multi-Index Selection"><p className="simulation-compact-note">Usable indices evaluated · highest vote count determines k</p><dl className="simulation-detail-list"><div><dt>Usable indices</dt><dd>{usableIndices}</dd></div><div><dt>Selected k</dt><dd>{enhanced.selectedK}</dd></div><div><dt>Votes for k = {enhanced.selectedK}</dt><dd>{support ?? "Unavailable"} / {usableIndices}</dd></div></dl><NbClustChart selectedK={enhanced.selectedK} votes={enhanced.nbclust.votes} usableIndices={usableIndices} supportingIndices={support} /><NbClustIndexDetails indices={enhanced.nbclust.indices} /></MethodCard>} />
    </section>
    <section className="simulation-surface simulation-results-section">
      <div className="simulation-section-heading"><h2 className="simulation-section-title">Initialization &amp; Reproducibility</h2></div>
      <InitializationComparison simulation randomRuns={existing.ariBySeed} dpcRuns={enhanced.dpc.ariByRun} selectedCenters={enhanced.dpc.centroidCount}
        centerTable={<DpcCenterTable centers={enhanced.dpc.centers.map((center, index) => ({ ...center, center: index + 1 }))} />}
        decisionGraph={<>
          <DecisionGraph enhanced={enhanced} />
          <div className="simulation-table-container"><table className="simulation-comparison-table">
            <caption className="text-left text-sm font-semibold">Selected-center PCA coordinates</caption>
            <thead><tr><th scope="col">Center</th><th scope="col">PCA coordinates</th></tr></thead>
            <tbody>{enhanced.dpc.centers.map((center, index) => <tr key={index}><th scope="row">{index + 1}</th><td>{center.coordinates?.map(displayCoordinate).join(", ") ?? "Unavailable"}</td></tr>)}</tbody>
          </table></div>
        </>} />
    </section>
    <section className="simulation-surface simulation-results-section">
      <div className="simulation-section-heading"><h2 className="simulation-section-title">Standard vs Enhanced Comparison</h2><p>Internal validation and cluster distributions for the actual run: n = {existing.participantCount.toLocaleString("en-US")}.</p></div>
      <section className="simulation-chart"><h3 className="card-title">Scatter Plot Comparison (PCA Space)</h3><div className="simulation-two-column">{(["Standard K-Means", "Enhanced K-Means"] as const).map((name, index) => <div key={name}><h4>{name}</h4><ProjectionChart analysis={result.analysis} method={index ? "enhanced" : "standard"} /><p className="simulation-compact-note">Initialization: {index ? "DPC (Deterministic)" : "Random"} · {index ? enhanced.iterations : selectedRun.iterations} iterations · Converged: {(index ? enhanced.convergedBeforeMaxIter : selectedRun.convergedBeforeMaxIter) ? "Yes" : "No"}{!index && " · Seed 0"}</p></div>)}</div><p className="simulation-compact-note">PC1 and PC2 are used only for 2D visualization. Both plots share coordinates and axes; diamonds mark projected cluster means. Cluster numbers are method-specific.</p></section>
      <section className="simulation-chart"><h3 className="card-title">{exploratory ? "Internal Validation (Exploratory Override)" : "Internal Validation"}</h3>{exploratory && <p className="simulation-preview-note">These relative changes compare an exploratory Standard k override with automatic Enhanced clustering. They are not the canonical enhancement comparison.</p>}<div className="simulation-table-container"><table className="simulation-comparison-table"><thead><tr><th>Metric</th><th>Standard K-Means</th><th>Enhanced K-Means</th><th>{exploratory ? "Relative Change (Exploratory)" : "Relative Change"}</th></tr></thead><tbody>{result.comparison.map(row => <tr key={row.metric}><th>{metricTitles[row.metric]}<br /><span>{row.direction === "lower_is_better" ? "Lower is better" : "Higher is better"}</span></th><td className={row.favorableMethod === "existing" ? "simulation-favorable" : undefined}>{format(row.existing)}</td><td className={row.favorableMethod === "enhanced" ? "simulation-favorable" : undefined}>{format(row.enhanced)}</td><td>{row.relativeImprovementPercent == null ? "Undefined (zero baseline) or unavailable" : `${format(row.relativeImprovementPercent)}%`}</td></tr>)}</tbody></table></div><p className="simulation-compact-note">Direction-aware relative metric change, not statistical significance. Standard metrics are the mean of 30 runs; the scatter and distribution show seed 0.</p>
        <InternalValidationCalculationDetails
          standard={{ n: existing.participantCount, k: existing.selectedK, runCount: existing.runs.length, calculation: result.analysis.calculations?.standard,
            metrics: Object.fromEntries(result.comparison.map(row => [row.metric, row.existing])) }}
          enhanced={{ n: enhanced.participantCount, k: enhanced.selectedK, calculation: result.analysis.calculations?.enhanced,
            metrics: Object.fromEntries(result.comparison.map(row => [row.metric, row.enhanced])) }}
          formatValue={value => formatMetric(value, true)} />
      </section>
      <section className="simulation-chart"><h3 className="card-title">Cluster Distribution</h3><div className="simulation-two-column"><ClusterDistribution title="Standard K-Means · Seed 0" sizes={selectedRun.clusterSizes} participants={existing.participantCount} /><ClusterDistribution title="Enhanced K-Means" sizes={enhanced.clusterSizes} participants={enhanced.participantCount} /></div></section>
    </section>
  </>;
};

export const SimulationRunsPage = () => {
  const simulation = 1;
  const sampleMode = "custom" as const;
  const [sampleCount, setSampleCount] = useState(100);
  const { metadata, loading, error, retry } = useSimulationMetadata();
  const selected = metadata?.simulations.find((entry) => entry.simulationId === simulation);
  const { capabilities } = useSimulationCapabilities();
  const [runState, setRunState] = useState<SimulationRunState | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [stage, setStage] = useState<number | null>(null);
  const [hasCompleted, setHasCompleted] = useState(false);
  const postAllowedAt = useRef(0);
  const runLocked = useRef(false);
  const configuration = { sampleMode, sampleCount, manualK: null };
  const availableParticipantCount = metadata?.availableParticipantCount ?? simulationParticipantLimit;
  const changeSampleCount = (value: string) => setSampleCount(Math.min(availableParticipantCount, Math.max(100, Math.trunc(Number(value)) || 100)));
  const configurationKey = simulationConfigurationKey(configuration);
  const [requestedKey, setRequestedKey] = useState<string | null>(null);
  useEffect(() => {
    runLocked.current = false;
    setAttempt(0); setRunState(null); setStage(null); setRunError(null); setHasCompleted(false);
  }, [configurationKey]);
  useEffect(() => {
    // Metadata (including a cached analysisStatus) never starts execution or
    // reveals results. Only the action button creates an attempt.
    if (attempt === 0 || requestedKey !== configurationKey) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let backendRunning = false;
    const execute = async (method: "POST" | "GET", allowStart = false) => {
      try {
        const query = new URLSearchParams({ sampleMode, sampleCount: String(configuration.sampleCount) });
        if (configuration.manualK !== null) query.set("manualK", String(configuration.manualK));
        const response = await fetch(`${API_BASE_URL}/api/simulations/${simulation}/run${method === "GET" ? `?${query}` : ""}`, {
          method, signal: controller.signal, cache: "no-store",
          ...(method === "POST" ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(configuration) } : {})
        });
        if (controller.signal.aborted) return;
        if (response.status === 429) {
          const retryAfter = response.headers.get("Retry-After");
          const seconds = retryAfter && /^\d+$/.test(retryAfter) ? Number(retryAfter) : null;
          const retryAt = seconds !== null ? Date.now() + seconds * 1000 : Date.parse(retryAfter ?? "");
          postAllowedAt.current = Number.isFinite(retryAt) ? retryAt : 0;
          setRunError(`Simulation request throttled (HTTP 429). Analysis has not been reported as failed.${postAllowedAt.current > Date.now() ? ` New execution requests can be retried after ${new Date(postAllowedAt.current).toLocaleTimeString()}.` : " Please wait before requesting execution again."} Retry checks the existing status first.`);
          if (backendRunning) timer = setTimeout(() => void execute("GET"), 2000);
          return;
        }
        if (!response.ok) throw new Error(`Unable to ${method === "GET" ? "check simulation status" : "request simulation execution"} (HTTP ${response.status}). Retry checks status first.`);
        const state = SimulationRunStateSchema.parse(await response.json());
        if (state.simulationId !== simulation || state.configurationKey !== configurationKey) throw new Error();
        if (!controller.signal.aborted) {
          if (allowStart && (state.status === "sample_ready" || state.status === "failed")) {
            if (postAllowedAt.current > Date.now()) {
              setRunError(`Simulation execution requests are throttled (HTTP 429). Please wait until ${new Date(postAllowedAt.current).toLocaleTimeString()} before starting another execution. Retry checks the existing status first.`);
              return;
            }
            await execute("POST");
            return;
          }
          setRunError(null);
          backendRunning = state.status === "running";
          setRunState(state);
          if (state.status === "running" || state.status === "sample_ready") timer = setTimeout(() => void execute("GET"), 2000);
        }
      } catch (caught) {
        if (!controller.signal.aborted) {
          setRunError(caught instanceof Error && caught.message.startsWith("Unable to ") ? caught.message : "Unable to verify simulation status. Retry checks status before requesting execution.");
          if (backendRunning) timer = setTimeout(() => void execute("GET"), 2000);
        }
      }
    };
    // Recover completed/running work without consuming POST admission quota.
    // Only the initial status check may start work; polling never restarts it.
    void execute("GET", true);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [simulation, attempt, configurationKey, requestedKey]);

  const active = attempt > 0 && requestedKey === configurationKey && runState?.configurationKey === configurationKey && runState?.simulationId === simulation ? runState : null;
  const interrupted = (!!runError && active?.status !== "running") || active?.status === "failed";
  useEffect(() => {
    if ((interrupted && active?.status !== "running") || stage === 4) runLocked.current = false;
  }, [interrupted, stage, active?.status]);
  useEffect(() => {
    if (!active) return;
    if (active.status === "complete") { setStage(4); setHasCompleted(true); }
    else if (active.status === "running") setStage(active.stage ?? 2);
  }, [active?.status, active?.stage]);
  const running = active?.status === "running" || (stage !== null && stage < 4 && !interrupted);
  const result = stage === 4 && !interrupted && active?.status === "complete" ? active.result : null;
  const start = () => {
    if (running || runLocked.current) return;
    runLocked.current = true;
    setRunError(null);
    setRunState(null);
    setRequestedKey(configurationKey);
    setStage(0);
    setAttempt(value => value + 1);
  };

  return <div className="simulation-page">
    <header className="simulation-heading">
      <p className="page-eyebrow">K-Means Comparison</p><h1 className="page-title">Standard K-Means vs Enhanced K-Means</h1>
      <p className="page-subtitle">Compare Standard and Enhanced K-Means on a reproducible custom participant sample.</p>
    </header>
    <section className="simulation-surface simulation-controls" aria-label="Configure Simulation" aria-busy={loading}>
      <div className="simulation-section-heading"><h2 className="simulation-section-title">Configure Simulation</h2><p>Review participant and cluster configuration, then run the simulation. Both methods use the same sampled participants.</p></div>
      <fieldset disabled={running} className="simulation-config-fields">
        <section className="simulation-chart"><h3 className="simulation-eyebrow">Participant Configuration — Custom Sample</h3><div className="simulation-participant-layout">
          <div className="simulation-available"><span>Available participants</span><strong>{availableParticipantCount.toLocaleString("en-US")}</strong><small>ADNI study-entry participants</small></div>
          <div className="simulation-sample-controls"><div className="simulation-sample-heading"><label htmlFor="simulation-sample-number" className="font-semibold">Participant Sample Size</label><div className="simulation-sample-input"><input id="simulation-sample-number" className="simulation-sample-number" type="number" min={100} max={availableParticipantCount} step={1} value={sampleCount} onChange={event => changeSampleCount(event.target.value)} /><span>/ {availableParticipantCount.toLocaleString("en-US")}</span></div></div>
          <div className="simulation-slider-label"><label htmlFor="simulation-sample-count">Drag to select</label></div><input id="simulation-sample-count" type="range" min={100} max={availableParticipantCount} value={sampleCount} onChange={event => changeSampleCount(event.target.value)} /><div className="simulation-slider-label"><span>100</span><span>{availableParticipantCount.toLocaleString("en-US")} - Full dataset</span></div>
          </div></div>
          <p className="simulation-compact-note mt-2"><Link to="/study-findings" className="research-text-action">Full-cohort validated results are available in Study Findings.</Link></p>
        </section>
        <div className="simulation-two-column">
          <section className="simulation-chart"><h3 className="simulation-eyebrow">Standard K-Means</h3><p className="simulation-compact-note">Cluster selection</p><h4>Silhouette Coefficient</h4><dl className="simulation-detail-list"><div><dt>Selection rule</dt><dd>Highest average Silhouette over k = 2–10</dd></div><div><dt>Initialization</dt><dd>Random</dd></div></dl></section>
          <section className="simulation-chart"><h3 className="simulation-eyebrow">Enhanced K-Means</h3><p className="simulation-compact-note">Cluster selection</p><h4>NbClust</h4><dl className="simulation-detail-list"><div><dt>Selection rule</dt><dd>Multi-index consensus</dd></div><div><dt>Candidate k</dt><dd>2–10</dd></div><div><dt>Initialization</dt><dd>DPC (Deterministic)</dd></div></dl></section>
        </div>
      </fieldset>
      <div className="simulation-control-row">
        <button type="button" onClick={start} disabled={!selected || !capabilities?.executionAvailable || running} className="simulation-run-button" aria-describedby={stage !== null ? "simulation-analysis-status" : undefined}>
          {hasCompleted ? <RefreshCw size={14} aria-hidden="true" /> : <Play size={14} fill="currentColor" aria-hidden="true" />}{running ? "Running..." : hasCompleted ? "Rerun" : "Run Simulation"}
        </button>
      </div>
      {(error || runError || active?.status === "failed") && <div className="mt-6 text-sm text-muted">
        {error && <div role="alert">{error} <button type="button" className="underline" onClick={retry}>Retry</button></div>}
        {(runError || active?.status === "failed") && <p role="alert">{runError ?? active?.message ?? "Simulation analysis failed."} <button type="button" className="underline" onClick={start}>Retry</button></p>}
      </div>}
    </section>
    <section id="simulation-analysis-status" className="simulation-surface simulation-results-section" aria-label="Simulation Progress"><div className="simulation-progress-heading"><div className="simulation-section-heading"><h2 className="simulation-section-title">Run Simulation</h2><p>Track simulation progress. Both methods use the same participant sample.</p></div>{stage === null && <span className="simulation-progress-ready">Ready to run</span>}{result && <span className="simulation-result-badge">Simulation completed successfully</span>}</div><SimulationProgress stage={stage ?? -1} interrupted={stage === null || interrupted} /></section>
    {result && <SimulationResults result={result} />}
  </div>;
};
