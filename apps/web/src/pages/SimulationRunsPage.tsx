import { useEffect, useState } from "react";
import { Check, GitBranch, Link2, PieChart, Play, RefreshCw, Sun, Users } from "lucide-react";
import { useRef } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { simulationIds, SimulationRunStateSchema, type SimulationRunState } from "../../../../packages/shared/src/simulation";
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

export const SimulationTabPanel = ({ analysis, method }: { analysis: Analysis; method: "existing" | "enhanced" }) => {
  const existing = analysis.existing;
  const enhanced = analysis.enhanced;
  const selectedRun = existing.runs.find(run => run.seed === 0) ?? existing.runs[0];
  const iterations = existing.runs.map(run => run.iterations);
  const minimum = Math.min(...iterations), maximum = Math.max(...iterations);
  const iterationRange = minimum === maximum ? String(minimum) : `${minimum}–${maximum}`;
  const converged = existing.runs.filter(run => run.convergedBeforeMaxIter).length;
  const usableIndices = enhanced.nbclust.indices.filter(index => index.status === "success").length;
  const supportingIndices = enhanced.nbclust.votes.find(vote => vote.k === enhanced.selectedK)?.count;
  const cards = [
    { label: "Participants", value: analysis[method].participantCount.toLocaleString("en-US"), Icon: Users },
    { label: "Selected k", value: analysis[method].selectedK, Icon: GitBranch },
    { label: "Initialization", value: analysis[method].initialization === "random" ? "Random" : "DPC / Deterministic", Icon: Sun },
    { label: method === "existing" ? "Iterations (range)" : "Iterations", value: method === "existing" ? iterationRange : enhanced.iterations, Icon: RefreshCw }
  ];
  return <div className="simulation-compact-panel">
    <dl className="simulation-configuration">{cards.map(({ label, value, Icon }) => <div className="simulation-compact-stat" key={label}><Icon size={20} aria-hidden="true" /><div><dt>{label}</dt><dd>{value}</dd></div></div>)}</dl>
    {method === "existing" ? <section className="simulation-chart">
      <ClusterDistribution title="Cluster Distribution" sizes={selectedRun.clusterSizes} participants={existing.participantCount} />
    </section> : <>
      <section>
        <h3 className="simulation-compact-title">Enhancement Evidence</h3>
        <div className="simulation-compact-evidence">
          <section className="simulation-summary simulation-stage"><h4>PCA</h4><dl><div><dt>Retained input variables</dt><dd>{enhanced.retainedVariables.length}</dd></div><div><dt>Components retained</dt><dd>{enhanced.pcaComponents}</dd></div><div><dt>Cumulative variance</dt><dd>{percent(enhanced.cumulativeExplainedVariance)}</dd></div></dl></section>
          <section className="simulation-summary simulation-stage"><h4>NbClust</h4><dl><div><dt>Selected k</dt><dd>{enhanced.selectedK}</dd></div><div><dt>Supporting / usable indices</dt><dd>{supportingIndices ?? "Unavailable"} of {usableIndices}</dd></div><div><dt>Repeated selection</dt><dd>{enhanced.nbclust.reproducible ? "Reproduced" : "Not verified"}</dd></div></dl></section>
          <section className="simulation-summary simulation-stage"><h4>DPC Initialization &amp; Reproducibility</h4><dl><div><dt>Initialization</dt><dd>{enhanced.initialization === "DPC" ? "Deterministic" : enhanced.initialization}</dd></div><div><dt>Centers selected</dt><dd>{enhanced.dpc.centroidCount}</dd></div><div><dt>Reproducibility status</dt><dd>{enhanced.dpc.determinismPassed ? "Passed" : "Not verified"}</dd></div></dl></section>
        </div>
      </section>
      <div className="simulation-compact-charts">
        <section className="simulation-chart"><h3 className="simulation-compact-title">Cumulative Explained Variance</h3>
          <div className="simulation-chart-plot" role="img" aria-label={`${enhanced.pcaComponents} retained PCA components explain ${percent(enhanced.cumulativeExplainedVariance)} variance`}>
            <ResponsiveContainer width="100%" height="100%"><LineChart data={enhanced.pcaVariance.filter(row => row.component <= enhanced.pcaComponents)} margin={{ top: 16, right: 16, bottom: 8, left: 0 }}>
              <CartesianGrid stroke="#e3edef" strokeDasharray="3 3" /><XAxis dataKey="component" tickFormatter={value => `PC${value}`} interval={0} tickLine={false} axisLine={false} /><YAxis domain={[0, 1]} ticks={[0, 0.25, 0.5, 0.75, 1]} tickFormatter={value => `${100 * value}%`} width={40} tickLine={false} axisLine={false} />
              <Tooltip formatter={(value: number) => [percent(value), "Cumulative variance"]} labelFormatter={value => `PC${value}`} /><Line type="linear" dataKey="cumulativeExplainedVariance" stroke="var(--simulation-teal)" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
            </LineChart></ResponsiveContainer>
          </div>
        </section>
        <section className="simulation-chart"><h3 className="simulation-compact-title">NbClust Votes</h3>
          <div className="simulation-chart-plot" role="img" aria-label={`NbClust selected k=${enhanced.selectedK}, supported by ${supportingIndices ?? "unavailable"} of ${usableIndices} indices`}>
            <ResponsiveContainer width="100%" height="100%"><BarChart data={enhanced.nbclust.votes} margin={{ top: 16, right: 16, bottom: 8, left: 0 }}>
              <CartesianGrid vertical={false} stroke="#e3edef" strokeDasharray="3 3" /><XAxis dataKey="k" tickFormatter={value => `k=${value}`} interval={0} tickLine={false} axisLine={false} /><YAxis allowDecimals={false} width={30} tickLine={false} axisLine={false} />
              <Tooltip formatter={(value: number) => [value, "Votes"]} labelFormatter={value => `k=${value}`} /><Bar dataKey="count" radius={[2, 2, 0, 0]} isAnimationActive={false}>{enhanced.nbclust.votes.map(vote => <Cell key={vote.k} fill={vote.k === enhanced.selectedK ? "var(--simulation-teal)" : "#c7d9dc"} />)}</Bar>
            </BarChart></ResponsiveContainer>
          </div>
        </section>
      </div>
      <section className="simulation-chart"><ClusterDistribution title="Enhanced Cluster Distribution" sizes={enhanced.clusterSizes} participants={enhanced.participantCount} /></section>
    </>}
  </div>;
};
export const SimulationResults = ({ result }: { result: NonNullable<SimulationRunState["result"]> }) => {
  const [method, setMethod] = useState<"existing" | "enhanced">("enhanced");
  const { analysis } = result;
  return <>
    <section className="simulation-surface simulation-comparison">
      <div className="simulation-section-heading"><h2 className="simulation-section-title">Existing vs Enhanced</h2>
        </div>
      <table className="simulation-comparison-table"><thead><tr><th>Metric</th><th>Existing</th><th>Enhanced</th></tr></thead>
        <tbody>{result.comparison.map(row => <tr key={row.metric}><th>{({ silhouette: "Silhouette", davies_bouldin: "Davies-Bouldin", calinski_harabasz: "Calinski-Harabasz" })[row.metric]}<br /><span>{row.direction === "lower_is_better" ? "Lower is better" : "Higher is better"}</span></th><td>{format(row.existing)}</td><td>{format(row.enhanced)}</td></tr>)}</tbody></table>
    </section>
    <section className="simulation-surface">
      <div className="simulation-method-tabs" role="group" aria-label="Method details">{(["existing", "enhanced"] as const).map(value => <button key={value} type="button" aria-pressed={method === value} className={`simulation-method-tab ${method === value ? "is-active" : ""}`} onClick={() => setMethod(value)}>{value === "existing" ? "Existing" : "Enhanced"} K-means</button>)}</div>
      <div className="simulation-method-content">
        <SimulationTabPanel key={result.metadata.simulationId} analysis={analysis} method={method} />
      </div>
    </section>
  </>;
};

export const SimulationRunsPage = () => {
  const [simulation, setSimulation] = useState<typeof simulationIds[number]>(1);
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
      <h1>Simulation Runs</h1>
    </header>
    <section className="simulation-surface simulation-controls" aria-label="Simulation selector" aria-busy={loading}>
      <div className="simulation-choices" role="group" aria-label="Simulations">
        {simulationIds.map((number) => <button key={number} type="button" aria-pressed={simulation === number}
          aria-label={`Simulation ${number}`} onClick={() => { if (number !== simulation) { setAttempt(0); setStage(null); setRunState(null); setRunError(null); setHasCompleted(false); } setSimulation(number); }}
          className={`simulation-choice ${simulation === number ? "is-selected" : ""}`}>
          Simulation {number}
        </button>)}
      </div>
      <div className="simulation-control-row">
        <dl className="simulation-metadata">
          <div className="simulation-metadata-group">
            <Users className="simulation-metadata-icon" size={22} aria-hidden="true" />
            <div><dt>Sample size</dt><dd>{selected ? selected.sampleSize.toLocaleString("en-US") : "—"}</dd></div>
          </div>
          <div className="simulation-metadata-group">
            <PieChart className="simulation-metadata-icon" size={22} aria-hidden="true" />
            <div><dt>Sampling</dt><dd>{selected ? `${Math.round(selected.samplingFraction * 100)}% stratified participant subsample` : "—"}</dd></div>
          </div>
          <div className="simulation-metadata-group">
            <Link2 className="simulation-metadata-icon" size={22} aria-hidden="true" />
            <div><dt>Same participant sample</dt><dd>Used for both methods</dd></div>
          </div>
        </dl>
        <button type="button" onClick={start} disabled={!selected || !capabilities?.executionAvailable || running} className="simulation-run-button" aria-describedby={stage !== null ? "simulation-analysis-status" : undefined}>
          {hasCompleted ? <RefreshCw size={14} aria-hidden="true" /> : <Play size={14} fill="currentColor" aria-hidden="true" />}{running ? "Running…" : hasCompleted ? "Rerun Simulation" : "Run Simulation"}
        </button>
      </div>
      <div className="mt-6 text-sm text-muted">
        <p role="status">{loading ? "Loading sample metadata…" : error ? "Sample metadata unavailable." :
          selected?.sampleStatus === "sample_ready" ? "Sample ready" : "Sample metadata unavailable."}</p>
        {error && <div className="mt-2" role="alert">{error} <button type="button" className="underline" onClick={retry}>Retry</button></div>}
        {stage !== null && <div id="simulation-analysis-status" className="mt-2" role="status">{result ? <><p>Paired analysis complete</p><p>Both methods used the same participant sample.</p></> : runError ? (runError.includes("HTTP 429") ? "Simulation request throttled." : "Unable to confirm simulation status.") : active?.status === "failed" ? "Paired analysis did not complete." : progressStages[stage]}</div>}
        {(runError || active?.status === "failed") && <p role="alert">{runError ?? active?.message ?? "Simulation analysis failed."} <button type="button" className="underline" onClick={start}>Retry</button></p>}
      </div>
      {stage !== null && <SimulationProgress stage={stage} interrupted={interrupted} />}
    </section>
    {result && <SimulationResults result={result} />}
  </div>;
};
