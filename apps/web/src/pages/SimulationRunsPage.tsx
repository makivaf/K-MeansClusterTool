import { useEffect, useState } from "react";
import { Check, Minus, Plus, Play, RefreshCw } from "lucide-react";
import { useRef } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { SimulationRunStateSchema, type SimulationRunState } from "../../../../packages/shared/src/simulation";
import { useSimulationMetadata } from "../hooks/useSimulationMetadata";
import { useSimulationCapabilities } from "../hooks/useSimulationCapabilities";
import { API_BASE_URL } from "../config/api";
import "./SimulationRunsPage.css";

const format = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 6 });
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
const PcaChart = ({ enhanced }: { enhanced: Analysis["enhanced"] }) => (<section className="simulation-chart"><h3 className="simulation-compact-title">Cumulative Explained Variance</h3>
          <div className="simulation-chart-plot" role="img" aria-label={`${enhanced.pcaComponents} retained PCA components explain ${percent(enhanced.cumulativeExplainedVariance)} variance`}>
            <ResponsiveContainer width="100%" height="100%"><LineChart data={enhanced.pcaVariance.filter(row => row.component <= enhanced.pcaComponents)} margin={{ top: 16, right: 16, bottom: 8, left: 0 }}>
              <CartesianGrid stroke="#e3edef" strokeDasharray="3 3" /><XAxis dataKey="component" tickFormatter={value => `PC${value}`} interval={0} tickLine={false} axisLine={false} /><YAxis domain={[0, 1]} ticks={[0, 0.25, 0.5, 0.75, 1]} tickFormatter={value => `${100 * value}%`} width={40} tickLine={false} axisLine={false} />
              <Tooltip formatter={(value: number) => [percent(value), "Cumulative variance"]} labelFormatter={value => `PC${value}`} /><Line type="linear" dataKey="cumulativeExplainedVariance" stroke="var(--simulation-teal)" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
            </LineChart></ResponsiveContainer>
          </div>
        </section>);
const NbClustChart = ({ enhanced }: { enhanced: Analysis["enhanced"] }) => {
  const usableIndices = enhanced.nbclust.indices.filter(index => index.status === "success").length;
  const supportingIndices = enhanced.nbclust.votes.find(vote => vote.k === enhanced.selectedK)?.count;
  return (<section className="simulation-chart"><h3 className="simulation-compact-title">NbClust Votes</h3>
          <div className="simulation-chart-plot" role="img" aria-label={`NbClust selected k=${enhanced.selectedK}, supported by ${supportingIndices ?? "unavailable"} of ${usableIndices} indices`}>
            <ResponsiveContainer width="100%" height="100%"><BarChart data={enhanced.nbclust.votes} margin={{ top: 16, right: 16, bottom: 8, left: 0 }}>
              <CartesianGrid vertical={false} stroke="#e3edef" strokeDasharray="3 3" /><XAxis dataKey="k" tickFormatter={value => `k=${value}`} interval={0} tickLine={false} axisLine={false} /><YAxis allowDecimals={false} width={30} tickLine={false} axisLine={false} />
              <Tooltip formatter={(value: number) => [value, "Votes"]} labelFormatter={value => `k=${value}`} /><Bar dataKey="count" radius={[2, 2, 0, 0]} isAnimationActive={false}>{enhanced.nbclust.votes.map(vote => <Cell key={vote.k} fill={vote.k === enhanced.selectedK ? "var(--simulation-teal)" : "#c7d9dc"} />)}</Bar>
            </BarChart></ResponsiveContainer>
          </div>
        </section>);
};
const metricTitles = { silhouette: "Silhouette Coefficient", davies_bouldin: "Davies-Bouldin Index", calinski_harabasz: "Calinski-Harabasz Index" };

export const SimulationResults = ({ result, manualK = 2 }: { result: NonNullable<SimulationRunState["result"]>; manualK?: number }) => {
  const { existing, enhanced } = result.analysis;
  const selectedRun = existing.runs.find(run => run.seed === 0) ?? existing.runs[0];
  const iterations = existing.runs.map(run => run.iterations);
  const control = enhanced.dpc.randomControl;
  const usableIndices = enhanced.nbclust.indices.filter(index => index.status === "success").length;
  const support = enhanced.nbclust.votes.find(vote => vote.k === enhanced.selectedK)?.count;
  return <>
    <section className="simulation-surface simulation-results-section">
      <div className="simulation-section-heading"><h2 className="simulation-section-title">Feature Representation</h2><p>How each method represents the input feature space before clustering.</p></div>
      <div className="simulation-two-column">
        <section className="simulation-chart"><span className="simulation-result-badge">Standard K-Means</span><h3>Original Feature Representation</h3><p className="simulation-compact-note">{enhanced.retainedVariables.length} standardized input variables</p>
          <div className="simulation-variable-list">{enhanced.retainedVariables.map(variable => <span key={variable}>{variable}</span>)}</div>
          <p className="simulation-unavailable">Correlation heatmap unavailable for this run.</p>
        </section>
        <section className="simulation-chart"><span className="simulation-result-badge">Enhanced K-Means</span><h3>Principal Component Analysis</h3><p className="simulation-compact-note">{enhanced.retainedVariables.length} variables → {enhanced.pcaComponents} PCs · Cumulative variance = {percent(enhanced.cumulativeExplainedVariance)}</p><PcaChart enhanced={enhanced} /></section>
        <section className="simulation-chart"><h3>PCA Summary</h3><dl className="simulation-detail-list">
          <div><dt>Input variables</dt><dd>{enhanced.retainedVariables.length}</dd></div><div><dt>Components retained</dt><dd>{enhanced.pcaComponents}</dd></div><div><dt>Cumulative variance</dt><dd>{percent(enhanced.cumulativeExplainedVariance)}</dd></div><div><dt>Variance threshold</dt><dd>≥ 85%</dd></div>
        </dl></section>
        <section className="simulation-chart"><h3>Principal Components</h3><div className="simulation-table-container"><table className="simulation-comparison-table"><thead><tr><th>PC</th><th>Explained Var.</th><th>Cumulative Var.</th></tr></thead><tbody>{enhanced.pcaVariance.filter(row => row.component <= enhanced.pcaComponents).map(row => <tr key={row.component}><th>PC{row.component}</th><td>{percent(row.explainedVarianceRatio)}</td><td>{percent(row.cumulativeExplainedVariance)}</td></tr>)}</tbody></table></div></section>
      </div>
    </section>
    <section className="simulation-surface simulation-results-section">
      <div className="simulation-section-heading"><h2 className="simulation-section-title">Cluster Number Selection</h2><p>How each method determines the number of clusters (k).</p></div>
      {manualK !== 2 && <p className="simulation-preview-note">Exploratory configuration: manual k = {manualK}. Results retain the run's selected k; this preview does not override clustering.</p>}
      <div className="simulation-two-column">
        <section className="simulation-chart"><span className="simulation-result-badge">Standard K-Means</span><h3>Silhouette-Based Selection</h3><dl className="simulation-detail-list"><div><dt>Selection method</dt><dd>Silhouette Coefficient</dd></div><div><dt>Candidate k</dt><dd>2–10</dd></div><div><dt>Selected k</dt><dd>{existing.selectedK}</dd></div></dl></section>
        <section className="simulation-chart simulation-enhanced"><span className="simulation-result-badge">Enhanced K-Means</span><h3>NbClust Multi-Index</h3><dl className="simulation-detail-list"><div><dt>Usable indices</dt><dd>{usableIndices}</dd></div><div><dt>Selected k</dt><dd>{enhanced.selectedK}</dd></div><div><dt>Votes for k = {enhanced.selectedK}</dt><dd>{support ?? "Unavailable"} / {usableIndices}</dd></div></dl></section>
        <section className="simulation-chart"><h3>Silhouette by k</h3><p className="simulation-unavailable">Candidate-k silhouette scores are unavailable for this run.</p></section>
        <NbClustChart enhanced={enhanced} />
      </div>
    </section>
    <section className="simulation-surface simulation-results-section">
      <div className="simulation-section-heading"><h2 className="simulation-section-title">Initialization</h2><p>How each method determines the starting cluster centers.</p></div>
      <div className="simulation-two-column">
        <section className="simulation-chart"><span className="simulation-result-badge">Standard K-Means</span><h3>Random Initialization</h3>
          <dl className="simulation-detail-list"><div><dt>Random-start runs</dt><dd>{existing.runs.length}</dd></div><div><dt>Iteration range</dt><dd>{Math.min(...iterations)}–{Math.max(...iterations)}</dd></div><div><dt>Initialization</dt><dd>Stochastic</dd></div></dl>
          <p className="simulation-agreement">Solution agreement with DPC initialization: {control ? `${control.matchingRuns} of ${control.totalRandomRuns} random starts` : "Unavailable"}</p>
          {control && <><div className="simulation-distribution-track" role="img" aria-label={`${control.matchingRuns} of ${control.totalRandomRuns} random starts matched the DPC solution`}><div className="simulation-distribution-bar" style={{ width: `${100 * control.matchingRuns / control.totalRandomRuns}%` }} /></div>
          <h3>Random-Start Metrics</h3><div className="simulation-table-container"><table className="simulation-comparison-table"><thead><tr><th>Metric</th><th>Mean</th><th>SD</th></tr></thead><tbody>{result.comparison.map(row => <tr key={row.metric}><th>{metricTitles[row.metric]}</th><td>{format(control.randomMean[row.metric])}</td><td>{format(control.randomSd[row.metric])}</td></tr>)}</tbody></table></div></>}
        </section>
        <section className="simulation-chart simulation-enhanced"><span className="simulation-result-badge">Enhanced K-Means</span><h3>DPC Initialization</h3><dl className="simulation-detail-list"><div><dt>Initialization</dt><dd>Deterministic</dd></div><div><dt>Selected centers</dt><dd>{enhanced.dpc.centroidCount}</dd></div><div><dt>Method</dt><dd>Density-Peak</dd></div><div><dt>Same input → same initialization</dt><dd>{enhanced.dpc.determinismPassed ? "Verified" : "Not verified"}</dd></div></dl>
          <p className="simulation-unavailable">Full DPC decision graph unavailable for this run.</p><h3>Selected Centers</h3><div className="simulation-table-container"><table className="simulation-comparison-table"><thead><tr><th>Center</th><th>ρ</th><th>δ</th><th>γ = ρ × δ</th></tr></thead><tbody>{enhanced.dpc.centers.map((center, index) => <tr key={index}><th>{index + 1}</th><td>{format(center.rho)}</td><td>{format(center.delta)}</td><td>{format(center.gamma)}</td></tr>)}</tbody></table></div>
        </section>
      </div>
    </section>
    <section className="simulation-surface simulation-results-section">
      <div className="simulation-section-heading"><h2 className="simulation-section-title">Standard vs Enhanced Comparison</h2><p>Internal validation and cluster distributions for the actual run: n = {existing.participantCount.toLocaleString("en-US")}.</p></div>
      <section className="simulation-chart"><h3>Scatter Plot Comparison (PCA Space)</h3><div className="simulation-two-column">{(["Standard K-Means", "Enhanced K-Means"] as const).map((name, index) => <div key={name}><h4>{name}</h4><p className="simulation-unavailable">Participant and centroid projections unavailable for this run.</p><p className="simulation-compact-note">Initialization: {index ? "DPC (Deterministic)" : "Random"} · {index ? enhanced.iterations : selectedRun.iterations} iterations · Converged: {(index ? enhanced.convergedBeforeMaxIter : selectedRun.convergedBeforeMaxIter) ? "Yes" : "No"}{!index && " · Seed 0"}</p></div>)}</div><p className="simulation-compact-note">PC1 and PC2 are used only for 2D visualization.</p></section>
      <section className="simulation-chart"><h3>Internal Validation</h3><div className="simulation-table-container"><table className="simulation-comparison-table"><thead><tr><th>Metric</th><th>Standard K-Means</th><th>Enhanced K-Means</th><th>Relative Change</th></tr></thead><tbody>{result.comparison.map(row => <tr key={row.metric}><th>{metricTitles[row.metric]}<br /><span>{row.direction === "lower_is_better" ? "Lower is better" : "Higher is better"}</span></th><td className={row.favorableMethod === "existing" ? "simulation-favorable" : undefined}>{format(row.existing)}</td><td className={row.favorableMethod === "enhanced" ? "simulation-favorable" : undefined}>{format(row.enhanced)}</td><td>Unavailable</td></tr>)}</tbody></table></div><p className="simulation-compact-note">Relative change is not supplied with this run.</p></section>
      <section className="simulation-chart"><h3>Cluster Distribution</h3><div className="simulation-two-column"><ClusterDistribution title="Standard K-Means · Seed 0" sizes={selectedRun.clusterSizes} participants={existing.participantCount} /><ClusterDistribution title="Enhanced K-Means" sizes={enhanced.clusterSizes} participants={enhanced.participantCount} /></div></section>
    </section>
  </>;
};

export const SimulationRunsPage = () => {
  const simulation = 1;
  const [sampleMode, setSampleMode] = useState<"full" | "custom">("full");
  const [sampleCount, setSampleCount] = useState(1949);
  const [manualK, setManualK] = useState(2);
  const { metadata, loading, error, retry } = useSimulationMetadata();
  const selected = metadata?.simulations.find((entry) => entry.simulationId === simulation);
  const { capabilities } = useSimulationCapabilities();
  const [runState, setRunState] = useState<SimulationRunState | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [stage, setStage] = useState<number | null>(null);
  const [hasCompleted, setHasCompleted] = useState(false);
  const postAllowedAt = useRef(0);
  useEffect(() => {
    // Metadata (including a cached analysisStatus) never starts execution or
    // reveals results. Only the action button creates an attempt.
    if (attempt === 0) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const execute = async (method: "POST" | "GET", allowStart = false) => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/simulations/${simulation}/run`, { method, signal: controller.signal });
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
        if (state.simulationId !== simulation) throw new Error();
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
  }, [simulation, attempt]);

  const active = attempt > 0 && runState?.simulationId === simulation ? runState : null;
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
    setStage(0);
    setAttempt(value => value + 1);
  };

  return <div className="simulation-page">
    <header className="simulation-heading">
      <p className="simulation-eyebrow">Simulation Analysis</p><h1>Simulation Runs</h1>
      <p>Compare Standard and Enhanced K-Means using the ADNI study dataset and exploratory configurations.</p>
    </header>
    <section className="simulation-surface simulation-controls" aria-label="Configure Simulation" aria-busy={loading}>
      <div className="simulation-section-heading"><h2 className="simulation-section-title">Configure Simulation</h2><p>Review participant and cluster configuration, then run the simulation. Both methods use the same sampled participants.</p></div>
      <fieldset disabled={running} className="simulation-config-fields">
        <section className="simulation-chart"><h3 className="simulation-eyebrow">Participant Configuration</h3><div className="simulation-participant-layout">
          <div className="simulation-available"><span>Available participants</span><strong>2,437</strong><small>ADNI study-entry participants</small></div>
          <div className="simulation-sample-controls"><div className="simulation-sample-heading"><h4>Participant Sample Size</h4><div role="group" aria-label="Participant sample mode" className="simulation-mode-buttons"><button type="button" aria-pressed={sampleMode === "full"} className={`simulation-choice ${sampleMode === "full" ? "is-selected" : ""}`} onClick={() => setSampleMode("full")}>Full Dataset</button><button type="button" aria-pressed={sampleMode === "custom"} className={`simulation-choice ${sampleMode === "custom" ? "is-selected" : ""}`} onClick={() => setSampleMode("custom")}>Custom Sample</button></div></div>
          {sampleMode === "custom" ? <><div className="simulation-slider-label"><label htmlFor="simulation-sample-count">Drag to select</label><output htmlFor="simulation-sample-count">{sampleCount.toLocaleString("en-US")}</output></div><input id="simulation-sample-count" type="range" min={100} max={2437} value={sampleCount} onChange={event => setSampleCount(Number(event.target.value))} /><div className="simulation-slider-label"><span>100</span><span>2,437</span></div><p>Preview: {sampleCount.toLocaleString("en-US")} of 2,437 participants.</p></> : <p>Full dataset preview: all <strong>2,437</strong> participants.</p>}
          </div></div>
          <p className="simulation-preview-note">Participant controls are a configuration preview. Run Simulation uses the existing {selected ? selected.sampleSize.toLocaleString("en-US") : "—"}-participant sample; changing this preview does not change the run.</p>
        </section>
        <div className="simulation-two-column">
          <section className="simulation-chart"><h3 className="simulation-eyebrow">Standard K-Means</h3><p className="simulation-compact-note">Cluster selection</p><h4>Silhouette Coefficient</h4><p className="simulation-compact-note">Candidate k: 2–10 · Study baseline: k = 2</p><div className="simulation-manual-control"><label id="manual-k-label">Manual k (Exploratory)</label><div role="group" aria-labelledby="manual-k-label"><button type="button" aria-label="Decrease manual k" disabled={running || manualK <= 2} onClick={() => setManualK(value => value - 1)}><Minus size={14} /></button><output aria-live="polite">{manualK}</output><button type="button" aria-label="Increase manual k" disabled={running || manualK >= 10} onClick={() => setManualK(value => value + 1)}><Plus size={14} /></button></div><p className="simulation-compact-note">Manual k affects exploratory display/configuration only.</p></div></section>
          <section className="simulation-chart"><h3 className="simulation-eyebrow">Enhanced K-Means</h3><p className="simulation-compact-note">Cluster selection</p><h4>NbClust</h4><p className="simulation-compact-note">Multi-index consensus</p><dl className="simulation-detail-list"><div><dt>Mode</dt><dd>Automatic</dd></div><div><dt>Candidate k</dt><dd>2–10</dd></div><div><dt>Initialization</dt><dd>DPC (Deterministic)</dd></div></dl></section>
        </div>
      </fieldset>
      <div className="simulation-control-row">
        <button type="button" onClick={start} disabled={!selected || !capabilities?.executionAvailable || running} className="simulation-run-button" aria-describedby={stage !== null ? "simulation-analysis-status" : undefined}>
          {hasCompleted ? <RefreshCw size={14} aria-hidden="true" /> : <Play size={14} fill="currentColor" aria-hidden="true" />}{running ? "Running..." : hasCompleted ? "Rerun Simulation" : "Run Simulation"}
        </button>
      </div>
      <div className="mt-6 text-sm text-muted">
        <p role="status">{loading ? "Loading sample metadata…" : error ? "Sample metadata unavailable." :
          selected?.sampleStatus === "sample_ready" ? "Sample ready" : "Sample metadata unavailable."}</p>
        {error && <div className="mt-2" role="alert">{error} <button type="button" className="underline" onClick={retry}>Retry</button></div>}
        {stage !== null && <div id="simulation-analysis-status" className="mt-2" role="status">{result ? <><p>Paired analysis complete</p><p>Both methods used the same participant sample.</p></> : runError ? (runError.includes("HTTP 429") ? "Simulation request throttled." : "Unable to confirm simulation status.") : active?.status === "failed" ? "Paired analysis did not complete." : progressStages[stage]}</div>}
        {(runError || active?.status === "failed") && <p role="alert">{runError ?? active?.message ?? "Simulation analysis failed."} <button type="button" className="underline" onClick={start}>Retry</button></p>}
      </div>
    </section>
    {stage !== null && <section className="simulation-surface simulation-results-section" aria-label="Simulation Progress"><div className="simulation-section-heading"><h2 className="simulation-section-title">Simulation Progress</h2><p>Both methods use the same participant sample.</p>{result && <span className="simulation-result-badge">Simulation completed successfully</span>}</div><SimulationProgress stage={stage} interrupted={interrupted} /></section>}
    {result && <SimulationResults result={result} manualK={manualK} />}
  </div>;
};
