import { useEffect, useState } from "react";
import { Check, Minus, Plus, Play, RefreshCw } from "lucide-react";
import { useRef } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import { simulationConfigurationKey, SimulationRunStateSchema, type SimulationRunState } from "../../../../packages/shared/src/simulation";
import { useSimulationMetadata } from "../hooks/useSimulationMetadata";
import { useSimulationCapabilities } from "../hooks/useSimulationCapabilities";
import { API_BASE_URL } from "../config/api";
import "./SimulationRunsPage.css";

const format = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 6 });
const axisNumber = (value: number) => Number(value.toFixed(2)).toFixed(2);
const displayCoordinate = (value: number) => value.toFixed(4);
type Analysis = NonNullable<SimulationRunState["result"]>["analysis"];
const percent = (value: number) => `${(100 * value).toFixed(2)}%`;

const progressStages = ["Preparing Sample", "Preprocessing", "Running Algorithms", "Evaluating Results", "Complete"];
export const SimulationProgress = ({ stage, interrupted }: { stage: number; interrupted: boolean }) => {
  return <div>
    <ol className="simulation-stepper" aria-label="Simulation run progress">
      {progressStages.map((label, index) => {
        const done = index < stage || (stage === 4 && !interrupted);
        const active = !interrupted && stage < 4 && index === stage;
        return <li key={label} aria-current={active ? "step" : undefined} className={`simulation-step ${done ? "is-reached" : active ? "is-active" : ""}`}>
          {index > 0 && <span className="simulation-step-connector" aria-hidden="true" />}
          <span className="simulation-step-node" aria-hidden="true">{done && <Check size={16} />}</span>
          <span>{label}<span className="sr-only">: {done ? "complete" : active ? "in progress" : "pending"}</span></span>
        </li>;
      })}
    </ol>
    {stage < 4 && !interrupted && <p className="simulation-progress-note">Run progress presentation; individual analytical stage progress is unavailable.</p>}
  </div>;
};

const ClusterDistribution = ({ sizes, participants, title }: { sizes: number[]; participants: number; title: string }) => <div>
  <h3 className="simulation-compact-title">{title}</h3>
  {sizes.map((size, index) => <div className="simulation-compact-cluster" key={index}>
    <div className="simulation-distribution-values"><span>Cluster {index} <small>{size.toLocaleString("en-US")} participants</small></span><strong>{(100 * size / participants).toFixed(1)}%</strong></div>
    <div className="simulation-distribution-track"><div className={`simulation-distribution-bar ${index % 2 ? "is-light" : ""}`} style={{ width: `${100 * size / participants}%` }} /></div>
  </div>)}
</div>;

// Reuse the page's existing charts with the same result bindings.
const PcaChart = ({ enhanced }: { enhanced: Analysis["enhanced"] }) => (<div><h3 className="simulation-compact-title">Cumulative Explained Variance</h3>
          <div className="simulation-chart-plot" role="img" aria-label={`${enhanced.pcaComponents} retained PCA components explain ${percent(enhanced.cumulativeExplainedVariance)} variance`}>
            <ResponsiveContainer width="100%" height="100%"><LineChart data={enhanced.pcaVariance.filter(row => row.component <= enhanced.pcaComponents)} margin={{ top: 16, right: 16, bottom: 8, left: 0 }}>
              <CartesianGrid stroke="#e3edef" strokeDasharray="3 3" /><XAxis dataKey="component" tickFormatter={value => `PC${value}`} interval={0} tickLine={false} axisLine={false} /><YAxis domain={[0, 1]} ticks={[0, 0.25, 0.5, 0.75, 1]} tickFormatter={value => `${100 * value}%`} width={40} tickLine={false} axisLine={false} />
              <Tooltip formatter={(value: number) => [percent(value), "Cumulative variance"]} labelFormatter={value => `PC${value}`} /><Line type="linear" dataKey="cumulativeExplainedVariance" stroke="var(--simulation-teal)" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
            </LineChart></ResponsiveContainer>
          </div>
        </div>);
const NbClustChart = ({ enhanced }: { enhanced: Analysis["enhanced"] }) => {
  const usableIndices = enhanced.nbclust.indices.filter(index => index.status === "success").length;
  const supportingIndices = enhanced.nbclust.votes.find(vote => vote.k === enhanced.selectedK)?.count;
  return (<div><h3 className="simulation-compact-title">NbClust Votes</h3>
          <div className="simulation-chart-plot" role="img" aria-label={`NbClust selected k=${enhanced.selectedK}, supported by ${supportingIndices ?? "unavailable"} of ${usableIndices} indices`}>
            <ResponsiveContainer width="100%" height="100%"><BarChart data={enhanced.nbclust.votes} margin={{ top: 16, right: 16, bottom: 8, left: 0 }}>
              <CartesianGrid vertical={false} stroke="#e3edef" strokeDasharray="3 3" /><XAxis dataKey="k" tickFormatter={value => `k=${value}`} interval={0} tickLine={false} axisLine={false} /><YAxis allowDecimals={false} width={30} tickLine={false} axisLine={false} />
              <Tooltip formatter={(value: number) => [value, "Votes"]} labelFormatter={value => `k=${value}`} /><Bar dataKey="count" radius={[2, 2, 0, 0]} isAnimationActive={false}>{enhanced.nbclust.votes.map(vote => <Cell key={vote.k} fill={vote.k === enhanced.selectedK ? "var(--simulation-teal)" : "#c7d9dc"} />)}</Bar>
            </BarChart></ResponsiveContainer>
          </div>
        </div>);
};
const palette = ["#087f8c", "#e49b35", "#7866b0", "#d76673", "#559a54", "#3675b5", "#a27850", "#aa57a1", "#718333", "#607785"];
const CorrelationChart = ({ analysis }: { analysis: Analysis }) => analysis.correlation ? <div className="simulation-table-container"><table className="simulation-correlation" aria-label="Retained feature correlation matrix"><thead><tr><th>Feature</th>{analysis.enhanced.retainedVariables.map((name, i) => <th key={name} title={name}>{i + 1}</th>)}</tr></thead><tbody>{analysis.correlation.map((row, i) => <tr key={i}><th>{i + 1}. {analysis.enhanced.retainedVariables[i]}</th>{row.map((value, j) => <td key={j} title={`${analysis.enhanced.retainedVariables[i]} / ${analysis.enhanced.retainedVariables[j]}: ${value ?? "undefined (constant feature)"}`} style={{ background: value === null ? "#eee" : value >= 0 ? `rgba(8,127,140,${Math.abs(value) * .7})` : `rgba(228,155,53,${Math.abs(value) * .7})` }}>{value === null ? "—" : value.toFixed(2)}</td>)}</tr>)}</tbody></table><p className="simulation-compact-note">Pearson correlation of this sample's standardized retained features. Undefined constant-feature correlations appear as —.</p></div> : <p className="simulation-unavailable">Correlation unavailable for this historical run.</p>;
const DecisionGraph = ({ enhanced }: { enhanced: Analysis["enhanced"] }) => enhanced.dpc.decisionGraph ? <div className="simulation-chart-plot" role="img" aria-label="DPC rho delta decision graph; selected centers highlighted"><ResponsiveContainer width="100%" height="100%"><ScatterChart><CartesianGrid strokeDasharray="3 3" /><XAxis type="number" dataKey="rho" name="rho" allowDecimals={false} /><YAxis type="number" dataKey="delta" name="delta" tickFormatter={axisNumber} width={65} /><Tooltip formatter={(value: number, name: string) => [name === "rho" ? format(value) : displayCoordinate(value), name]} cursor={{ strokeDasharray: "3 3" }} /><Scatter name="Participants" data={enhanced.dpc.decisionGraph.filter(point => !point.selected)} fill="#b7d9d5" isAnimationActive={false} /><Scatter name="DPC centers" data={enhanced.dpc.decisionGraph.filter(point => point.selected)} fill="#e49b35" shape="diamond" isAnimationActive={false} /></ScatterChart></ResponsiveContainer></div> : <p className="simulation-unavailable">Decision graph unavailable for this historical run.</p>;
const ProjectionChart = ({ analysis, method }: { analysis: Analysis; method: "standard" | "enhanced" }) => {
  const projection = analysis.projection;
  if (!projection) return <p className="simulation-unavailable">Projection unavailable for this historical run.</p>;
  const xs = projection.points.map(point => point.x), ys = projection.points.map(point => point.y);
  const k = method === "standard" ? analysis.existing.selectedK : analysis.enhanced.selectedK;
  const centers = method === "standard" ? projection.standardCentroids : projection.enhancedCentroids;
  return <div className="simulation-chart-plot" role="img" aria-label={`${method} assignments on common PC1–PC2 coordinates; diamonds are projected cluster means`}><ResponsiveContainer width="100%" height="100%"><ScatterChart><CartesianGrid strokeDasharray="3 3" /><XAxis type="number" dataKey="x" name="PC1" minTickGap={24} tickFormatter={axisNumber} domain={[Math.min(...xs), Math.max(...xs)]} /><YAxis type="number" dataKey="y" name="PC2" tickFormatter={axisNumber} width={70} domain={[Math.min(...ys), Math.max(...ys)]} /><Tooltip formatter={(value: number, name: string) => [displayCoordinate(value), name]} />{Array.from({ length: k }, (_, cluster) => <Scatter key={cluster} name={`Cluster ${cluster}`} data={projection.points.filter(point => point[method] === cluster)} fill={palette[cluster]} fillOpacity={.55} isAnimationActive={false} />)}<Scatter name="Projected centroids" data={centers} fill="#142d38" shape="diamond" isAnimationActive={false} /></ScatterChart></ResponsiveContainer></div>;
};

const metricTitles = { silhouette: "Silhouette Coefficient", davies_bouldin: "Davies-Bouldin Index", calinski_harabasz: "Calinski-Harabasz Index" };

export const SimulationResults = ({ result }: { result: NonNullable<SimulationRunState["result"]> }) => {
  const { existing, enhanced } = result.analysis;
  const exploratory = result.metadata.configuration?.manualK != null;
  const selectedRun = existing.runs.find(run => run.seed === 0) ?? existing.runs[0];
  const iterations = existing.runs.map(run => run.iterations);
  const control = enhanced.dpc.randomControl;
  const usableIndices = enhanced.nbclust.indices.filter(index => index.status === "success").length;
  const support = enhanced.nbclust.votes.find(vote => vote.k === enhanced.selectedK)?.count;
  return <>
    <section className="simulation-surface simulation-results-section">
      <div className="simulation-section-heading"><h2 className="simulation-section-title">Feature Representation</h2><p>How each method represents the input feature space before clustering.</p></div>
      <div className="simulation-two-column">
        <section className="simulation-chart"><span className="research-badge">Standard K-Means</span><h3>Original Feature Representation</h3><p className="simulation-compact-note">{enhanced.retainedVariables.length} standardized input variables</p>
          <div className="simulation-variable-list">{enhanced.retainedVariables.map(variable => <span key={variable}>{variable}</span>)}</div>
          <CorrelationChart analysis={result.analysis} />
        </section>
        <section className="simulation-chart simulation-enhanced"><span className="research-badge is-valid">Enhanced K-Means</span><h3>Principal Component Analysis</h3><p className="simulation-compact-note">{enhanced.retainedVariables.length} variables → {enhanced.pcaComponents} PCs · Cumulative variance = {percent(enhanced.cumulativeExplainedVariance)}</p><PcaChart enhanced={enhanced} /><h3>PCA Summary</h3><dl className="simulation-detail-list">
          <div><dt>Input variables</dt><dd>{enhanced.retainedVariables.length}</dd></div><div><dt>Components retained</dt><dd>{enhanced.pcaComponents}</dd></div><div><dt>Cumulative variance</dt><dd>{percent(enhanced.cumulativeExplainedVariance)}</dd></div><div><dt>Variance threshold</dt><dd>≥ 85%</dd></div>
        </dl><details><summary>Principal Components</summary><div className="simulation-table-container"><table className="simulation-comparison-table"><thead><tr><th>PC</th><th>Explained Var.</th><th>Cumulative Var.</th></tr></thead><tbody>{enhanced.pcaVariance.filter(row => row.component <= enhanced.pcaComponents).map(row => <tr key={row.component}><th>PC{row.component}</th><td>{percent(row.explainedVarianceRatio)}</td><td>{percent(row.cumulativeExplainedVariance)}</td></tr>)}</tbody></table></div></details></section>
      </div>
    </section>
    <section className="simulation-surface simulation-results-section">
      <div className="simulation-section-heading"><h2 className="simulation-section-title">Cluster Number Selection</h2><p>How each method determines the number of clusters (k).</p></div>
      {exploratory && <p className="simulation-preview-note">Exploratory Standard manual k = {existing.selectedK}. The canonical study baseline uses Silhouette selection over k = 2–10; this sample's Silhouette choice is {existing.silhouetteSelectedK}. Enhanced remains automatic.</p>}
      <div className="simulation-two-column">
        <section className="simulation-chart"><span className="research-badge">Standard K-Means</span><h3>Standard Cluster Selection</h3><dl className="simulation-detail-list"><div><dt>Selection method</dt><dd>{exploratory ? "Exploratory manual k" : "Silhouette Coefficient"}</dd></div><div><dt>Candidate k</dt><dd>2–10</dd></div><div><dt>Selected k</dt><dd>{existing.selectedK}</dd></div></dl><h3>Silhouette by k</h3>{existing.silhouetteByK ? <div className="simulation-chart-plot"><ResponsiveContainer width="100%" height="100%"><LineChart data={existing.silhouetteByK}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="k" /><YAxis tickFormatter={axisNumber} width={56} /><Tooltip /><Line dataKey="silhouette" stroke="var(--simulation-teal)" isAnimationActive={false} /></LineChart></ResponsiveContainer></div> : <p className="simulation-unavailable">Candidate-k scores unavailable for this historical run.</p>}</section>
        <section className="simulation-chart simulation-enhanced"><span className="research-badge is-valid">Enhanced K-Means</span><h3>NbClust Multi-Index</h3><dl className="simulation-detail-list"><div><dt>Usable indices</dt><dd>{usableIndices}</dd></div><div><dt>Selected k</dt><dd>{enhanced.selectedK}</dd></div><div><dt>Votes for k = {enhanced.selectedK}</dt><dd>{support ?? "Unavailable"} / {usableIndices}</dd></div></dl><NbClustChart enhanced={enhanced} /><details><summary>NbClust index results</summary><div className="simulation-table-container"><table className="simulation-comparison-table"><thead><tr><th>Index</th><th>Status</th><th>Recommended k</th></tr></thead><tbody>{enhanced.nbclust.indices.map(row => <tr key={row.index}><th>{row.index}</th><td>{row.status}</td><td>{row.recommendedK ?? "Unavailable"}</td></tr>)}</tbody></table></div></details></section>
      </div>
    </section>
    <section className="simulation-surface simulation-results-section">
      <div className="simulation-section-heading"><h2 className="simulation-section-title">Initialization</h2><p>How each method determines the starting cluster centers.</p></div>
      <div className="simulation-two-column">
        <section className="simulation-chart"><span className="research-badge">Standard K-Means</span><h3>Random Initialization</h3>
          <dl className="simulation-detail-list"><div><dt>Random-start runs</dt><dd>{existing.runs.length}</dd></div><div><dt>Iteration range</dt><dd>{Math.min(...iterations)}–{Math.max(...iterations)}</dd></div><div><dt>Initialization</dt><dd>Stochastic</dd></div></dl>
          <details><summary>Standard random-start variability (seeds 0–29)</summary><div className="simulation-table-container"><table className="simulation-comparison-table"><thead><tr><th>Seed</th><th>Iterations</th><th>Converged before limit</th><th>Cluster sizes</th><th>Silhouette</th><th>Davies-Bouldin</th><th>Calinski-Harabasz</th></tr></thead><tbody>{existing.runs.map(run => <tr key={run.seed}><th>{run.seed}</th><td>{run.iterations}</td><td>{run.convergedBeforeMaxIter ? "Yes" : "No"}</td><td>{run.clusterSizes.join(", ")}</td><td>{format(run.metrics.silhouette)}</td><td>{format(run.metrics.davies_bouldin)}</td><td>{format(run.metrics.calinski_harabasz)}</td></tr>)}</tbody></table></div></details>
          <p className="simulation-agreement">PCA-space random-start agreement with DPC solution: {control ? `${control.matchingRuns} of ${control.totalRandomRuns} random starts` : "Unavailable"}</p>
          {control && <><div className="simulation-distribution-track" role="img" aria-label={`${control.matchingRuns} of ${control.totalRandomRuns} random starts matched the DPC solution`}><div className="simulation-distribution-bar" style={{ width: `${100 * control.matchingRuns / control.totalRandomRuns}%` }} /></div>
          <p className="simulation-compact-note">Controlled random starts use Enhanced's PCA representation and automatic k. Agreement compares metrics and cluster sizes, not participant-level partition identity.</p><h3>PCA Control Random-Start Metrics</h3><div className="simulation-table-container"><table className="simulation-comparison-table"><thead><tr><th>Metric</th><th>Mean</th><th>SD</th></tr></thead><tbody>{result.comparison.map(row => <tr key={row.metric}><th>{metricTitles[row.metric]}</th><td>{format(control.randomMean[row.metric])}</td><td>{format(control.randomSd[row.metric])}</td></tr>)}</tbody></table></div></>}
        </section>
        <section className="simulation-chart simulation-enhanced"><span className="research-badge is-valid">Enhanced K-Means</span><h3>DPC Initialization</h3><dl className="simulation-detail-list"><div><dt>Initialization</dt><dd>Deterministic</dd></div><div><dt>Selected centers</dt><dd>{enhanced.dpc.centroidCount}</dd></div><div><dt>Method</dt><dd>Density-Peak</dd></div><div><dt>Same input → same initialization</dt><dd>{enhanced.dpc.determinismPassed ? "Verified" : "Not verified"}</dd></div></dl>
          <DecisionGraph enhanced={enhanced} /><h3>Selected Centers</h3><div className="simulation-table-container"><table className="simulation-comparison-table simulation-dpc-centers"><thead><tr><th>Center</th><th>ρ</th><th>δ</th><th>γ = ρ × δ</th><th>PCA coordinates</th></tr></thead><tbody>{enhanced.dpc.centers.map((center, index) => <tr key={index}><th>{index + 1}</th><td>{format(center.rho)}</td><td>{displayCoordinate(center.delta)}</td><td>{displayCoordinate(center.gamma)}</td><td>{center.coordinates?.map(displayCoordinate).join(", ") ?? "Unavailable"}</td></tr>)}</tbody></table></div>
        </section>
      </div>
    </section>
    <section className="simulation-surface simulation-results-section">
      <div className="simulation-section-heading"><h2 className="simulation-section-title">Standard vs Enhanced Comparison</h2><p>Internal validation and cluster distributions for the actual run: n = {existing.participantCount.toLocaleString("en-US")}.</p></div>
      <section className="simulation-chart"><h3>Scatter Plot Comparison (PCA Space)</h3><div className="simulation-two-column">{(["Standard K-Means", "Enhanced K-Means"] as const).map((name, index) => <div key={name}><h4>{name}</h4><ProjectionChart analysis={result.analysis} method={index ? "enhanced" : "standard"} /><p className="simulation-compact-note">Initialization: {index ? "DPC (Deterministic)" : "Random"} · {index ? enhanced.iterations : selectedRun.iterations} iterations · Converged: {(index ? enhanced.convergedBeforeMaxIter : selectedRun.convergedBeforeMaxIter) ? "Yes" : "No"}{!index && " · Seed 0"}</p></div>)}</div><p className="simulation-compact-note">PC1 and PC2 are used only for 2D visualization. Both plots share coordinates and axes; diamonds mark projected cluster means. Cluster numbers are method-specific.</p></section>
      <section className="simulation-chart"><h3>{exploratory ? "Internal Validation (Exploratory Override)" : "Internal Validation"}</h3>{exploratory && <p className="simulation-preview-note">These relative changes compare an exploratory Standard k override with automatic Enhanced clustering. They are not the canonical enhancement comparison.</p>}<div className="simulation-table-container"><table className="simulation-comparison-table"><thead><tr><th>Metric</th><th>Standard K-Means</th><th>Enhanced K-Means</th><th>{exploratory ? "Relative Change (Exploratory)" : "Relative Change"}</th></tr></thead><tbody>{result.comparison.map(row => <tr key={row.metric}><th>{metricTitles[row.metric]}<br /><span>{row.direction === "lower_is_better" ? "Lower is better" : "Higher is better"}</span></th><td className={row.favorableMethod === "existing" ? "simulation-favorable" : undefined}>{format(row.existing)}</td><td className={row.favorableMethod === "enhanced" ? "simulation-favorable" : undefined}>{format(row.enhanced)}</td><td>{row.relativeImprovementPercent == null ? "Undefined (zero baseline) or unavailable" : `${format(row.relativeImprovementPercent)}%`}</td></tr>)}</tbody></table></div><p className="simulation-compact-note">Direction-aware relative metric change, not statistical significance. Standard metrics are the mean of 30 runs; the scatter and distribution show seed 0.</p></section>
      <section className="simulation-chart"><h3>Cluster Distribution</h3><div className="simulation-two-column"><ClusterDistribution title="Standard K-Means · Seed 0" sizes={selectedRun.clusterSizes} participants={existing.participantCount} /><ClusterDistribution title="Enhanced K-Means" sizes={enhanced.clusterSizes} participants={enhanced.participantCount} /></div></section>
    </section>
  </>;
};

export const SimulationRunsPage = () => {
  const simulation = 1;
  const sampleMode = "custom" as const;
  const [sampleCount, setSampleCount] = useState(100);
  const [manualK, setManualK] = useState(2);
  const [overrideK, setOverrideK] = useState(false);
  const { metadata, loading, error, retry } = useSimulationMetadata();
  const selected = metadata?.simulations.find((entry) => entry.simulationId === simulation);
  const { capabilities } = useSimulationCapabilities();
  const [runState, setRunState] = useState<SimulationRunState | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [stage, setStage] = useState<number | null>(null);
  const [hasCompleted, setHasCompleted] = useState(false);
  const postAllowedAt = useRef(0);
  const configuration = { sampleMode, sampleCount, manualK: overrideK ? manualK : null };
  const changeSampleCount = (value: string) => setSampleCount(Math.min(2436, Math.max(100, Math.trunc(Number(value)) || 100)));
  const configurationKey = simulationConfigurationKey(configuration);
  const [requestedKey, setRequestedKey] = useState<string | null>(null);
  useEffect(() => {
    setAttempt(0); setRunState(null); setStage(null); setRunError(null);
  }, [configurationKey]);
  useEffect(() => {
    // Metadata (including a cached analysisStatus) never starts execution or
    // reveals results. Only the action button creates an attempt.
    if (attempt === 0 || requestedKey !== configurationKey) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
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
          setRunState(state);
          if (state.status === "running" || state.status === "sample_ready") timer = setTimeout(() => void execute("GET"), 2000);
        }
      } catch (caught) { if (!controller.signal.aborted) setRunError(caught instanceof Error && caught.message.startsWith("Unable to ") ? caught.message : "Unable to verify simulation status. Retry checks status before requesting execution."); }
    };
    // Recover completed/running work without consuming POST admission quota.
    // Only the initial status check may start work; polling never restarts it.
    void execute("GET", true);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [simulation, attempt, configurationKey, requestedKey]);

  const active = attempt > 0 && requestedKey === configurationKey && runState?.configurationKey === configurationKey && runState?.simulationId === simulation ? runState : null;
  const interrupted = !!runError || active?.status === "failed";
  useEffect(() => {
    if (stage === null || stage === 4 || interrupted) return;
    // These short transitions present the frontend workflow, not backend
    // telemetry. Hold at Running Algorithms until the API confirms success,
    // including when POST immediately returns a cached completed result.
    if (stage >= 2 && active?.status !== "complete") return;
    const timer = setTimeout(() => {
      setStage(stage + 1);
      if (stage === 3) setHasCompleted(true);
    }, 400);
    return () => clearTimeout(timer);
  }, [stage, active?.status, interrupted]);
  const running = stage !== null && stage < 4 && !interrupted;
  const result = stage === 4 && !interrupted && active?.status === "complete" ? active.result : null;
  const start = () => {
    if (running) return;
    setRunError(null);
    setRunState(null);
    setRequestedKey(configurationKey);
    setStage(0);
    setAttempt(value => value + 1);
  };

  return <div className="simulation-page">
    <header className="simulation-heading">
      <p className="simulation-eyebrow">Simulation Analysis</p><h1>Simulation Runs</h1>
      <p>Compare Standard and Enhanced K-Means on a reproducible custom participant sample.</p>
    </header>
    <section className="simulation-surface simulation-controls" aria-label="Configure Simulation" aria-busy={loading}>
      <div className="simulation-section-heading"><h2 className="simulation-section-title">Configure Simulation</h2><p>Review participant and cluster configuration, then run the simulation. Both methods use the same sampled participants.</p></div>
      <fieldset disabled={running} className="simulation-config-fields">
        <section className="simulation-chart"><h3 className="simulation-eyebrow">Participant Configuration — Custom Sample</h3><div className="simulation-participant-layout">
          <div className="simulation-available"><span>Available participants</span><strong>2,437</strong><small>ADNI study-entry participants</small></div>
          <div className="simulation-sample-controls"><div className="simulation-sample-heading"><label htmlFor="simulation-sample-number" className="font-semibold">Participant Sample Size</label><input id="simulation-sample-number" className="simulation-sample-number" type="number" min={100} max={2436} step={1} value={sampleCount} onChange={event => changeSampleCount(event.target.value)} /></div>
          <div className="simulation-slider-label"><label htmlFor="simulation-sample-count">Drag to select</label><output htmlFor="simulation-sample-count">{sampleCount.toLocaleString("en-US")}</output></div><input id="simulation-sample-count" type="range" min={100} max={2436} value={sampleCount} onChange={event => changeSampleCount(event.target.value)} /><div className="simulation-slider-label"><span>100</span><span>2,436 max</span></div><p>Selected: {sampleCount.toLocaleString("en-US")} of 2,437 participants.</p>
          </div></div>
          <p className="simulation-compact-note">Deterministic sampling without replacement. Both methods receive exactly the same participants; rerunning the same configuration reuses its verified result.</p>
          <p className="simulation-compact-note mt-2"><Link to="/study-findings" className="research-text-action">Full-cohort validated results are available in Study Findings.</Link></p>
        </section>
        <div className="simulation-two-column">
          <section className="simulation-chart"><h3 className="simulation-eyebrow">Standard K-Means</h3><p className="simulation-compact-note">Cluster selection</p><h4>Silhouette Coefficient</h4><p className="simulation-compact-note">Automatic: highest Silhouette over k = 2–10</p><div className="simulation-manual-control"><label><input type="checkbox" checked={overrideK} onChange={event => setOverrideK(event.target.checked)} /> Override k for exploration</label>{overrideK && <div className="simulation-manual-fields"><label id="manual-k-label">Manual k (Exploratory)</label><div role="group" aria-labelledby="manual-k-label"><button type="button" aria-label="Decrease manual k" disabled={running || manualK <= 2} onClick={() => setManualK(value => value - 1)}><Minus size={14} /></button><output aria-live="polite">{manualK}</output><button type="button" aria-label="Increase manual k" disabled={running || manualK >= 10} onClick={() => setManualK(value => value + 1)}><Plus size={14} /></button></div><p className="simulation-compact-note">Manual k applies to the Standard runtime only. Enhanced uses NbClust automatically.</p></div>}</div></section>
          <section className="simulation-chart"><h3 className="simulation-eyebrow">Enhanced K-Means</h3><p className="simulation-compact-note">Cluster selection</p><h4>NbClust</h4><p className="simulation-compact-note">Multi-index consensus</p><dl className="simulation-detail-list"><div><dt>Mode</dt><dd>Automatic</dd></div><div><dt>Candidate k</dt><dd>2–10</dd></div><div><dt>Initialization</dt><dd>DPC (Deterministic)</dd></div></dl></section>
        </div>
      </fieldset>
      <div className="simulation-control-row">
        <button type="button" onClick={start} disabled={!selected || !capabilities?.executionAvailable || running} className="simulation-run-button" aria-describedby={stage !== null ? "simulation-analysis-status" : undefined}>
          {hasCompleted ? <RefreshCw size={14} aria-hidden="true" /> : <Play size={14} fill="currentColor" aria-hidden="true" />}{running ? "Running..." : hasCompleted ? "Rerun" : "Run Simulation"}
        </button>
      </div>
      <div className="mt-6 text-sm text-muted">
        <p role="status">{loading ? "Loading sample metadata…" : error ? "Sample metadata unavailable." :
          selected?.sampleStatus === "sample_ready" ? "Sample ready" : "Sample metadata unavailable."}</p>
        {error && <div className="mt-2" role="alert">{error} <button type="button" className="underline" onClick={retry}>Retry</button></div>}
        {stage !== null && <div id="simulation-analysis-status" className="mt-2" role="status">{result ? <><p>Paired analysis complete</p><p>Both methods used the same participant sample.</p></> : runError ? (runError.includes("HTTP 429") ? "Simulation request throttled." : "Unable to confirm simulation status.") : active?.status === "failed" ? "Paired analysis did not complete." : progressStages[stage]}</div>}
        {result && <details className="mt-3"><summary>Run Details</summary><dl className="simulation-detail-list">
          <div><dt>Sampling seed</dt><dd>{result.metadata.seed}</dd></div>
          <div><dt>Sample fingerprint</dt><dd>{result.metadata.sampleFingerprint}</dd></div>
        </dl></details>}
        {(runError || active?.status === "failed") && <p role="alert">{runError ?? active?.message ?? "Simulation analysis failed."} <button type="button" className="underline" onClick={start}>Retry</button></p>}
      </div>
    </section>
    {stage !== null && <section className="simulation-surface simulation-results-section" aria-label="Simulation Progress"><div className="simulation-section-heading"><h2 className="simulation-section-title">Simulation Progress</h2><p>Both methods use the same participant sample.</p>{result && <span className="simulation-result-badge">Simulation completed successfully</span>}</div><SimulationProgress stage={stage} interrupted={interrupted} /></section>}
    {result && <SimulationResults result={result} />}
  </div>;
};
