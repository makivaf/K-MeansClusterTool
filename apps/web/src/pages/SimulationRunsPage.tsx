import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Check, Link2, PieChart, Play, Users } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { simulationNumbers, simulationRunsMock, type SimulationNumber } from "./simulationRunsMock";
import "./SimulationRunsPage.css";

const chartPalette = { primary: "#0F766E", grid: "#e8eff1" };

const steps = ["Preparing Cohort", "PCA & Preprocessing", "NbClust & DPC", "K-Means Evaluation", "Complete"];
const card = "simulation-surface";
const detailCard = "simulation-summary";
const metrics = [
  { key: "silhouette", label: "Silhouette Coefficient", direction: "higher", digits: 5 },
  { key: "daviesBouldin", label: "Davies–Bouldin Index", direction: "lower", digits: 5 },
  { key: "calinskiHarabasz", label: "Calinski–Harabasz Index", direction: "higher", digits: 3 },
] as const;

const DetailGroup = ({ title, fields }: { title: string; fields: [string, string | number][] }) => (
  <section className={`${detailCard} simulation-stage`}>
    <h3 className="simulation-stage-title">{title}</h3>
    <dl className="space-y-2 text-xs">
      {fields.map(([label, value]) => <div key={label} className="flex flex-wrap justify-between gap-x-3 gap-y-1">
        <dt className="text-muted">{label}</dt><dd className="font-semibold tabular-nums">{value}</dd>
      </div>)}
    </dl>
  </section>
);

export const SimulationRunsPage = () => {
  const [simulation, setSimulation] = useState<SimulationNumber>(1);
  const [method, setMethod] = useState<"existing" | "enhanced">("existing");
  // -1 = idle; 0–4 = visible progress steps; 5 = completed.
  const [progress, setProgress] = useState<Record<SimulationNumber, number>>({ 1: -1, 2: -1, 3: -1, 4: -1, 5: -1 });
  const hasRunning = simulationNumbers.some((number) => progress[number] >= 0 && progress[number] < steps.length);
  useEffect(() => {
    if (!hasRunning) return;
    const timer = window.setInterval(() => setProgress((current) => {
      const next = { ...current };
      for (const number of simulationNumbers) {
        if (next[number] >= 0 && next[number] < steps.length) next[number] += 1;
      }
      return next;
    }), 800);
    return () => window.clearInterval(timer);
  }, [hasRunning]);

  const step = progress[simulation];
  const completed = step === steps.length;
  const result = simulationRunsMock[simulation];
  const variance = result.cumulativeVariance.map((value, index) => ({ component: `PC${index + 1}`, value }));
  const votes = result.votes.map((count, index) => ({ k: index + 2, votes: count }));

  return <div className="simulation-page">
    <header className="simulation-heading">
      <h1>Simulation Runs</h1>
    </header>
    <section className={`${card} simulation-controls`} aria-label="Simulation selector">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Simulations">
        {simulationNumbers.map((number) => <button key={number} type="button" aria-pressed={simulation === number}
          aria-label={`Simulation ${number}${progress[number] === steps.length ? ", completed" : progress[number] >= 0 ? ", running" : ""}`}
          onClick={() => { setSimulation(number); setMethod("existing"); }}
          className={`simulation-choice ${simulation === number ? "is-selected" : ""}`}>
          Simulation {number}
          {progress[number] === steps.length && <Check size={13} aria-hidden="true" className={simulation === number ? "text-white" : "text-teal-600"} />}
        </button>)}
      </div>
      <div className="simulation-control-row">
        <dl className="simulation-metadata">
          <div className="simulation-metadata-group">
            <Users className="simulation-metadata-icon" size={22} aria-hidden="true" />
            <div><dt>Sample size</dt><dd>~{result.sampleSize.toLocaleString("en-US")}</dd></div>
          </div>
          <div className="simulation-metadata-group">
            <PieChart className="simulation-metadata-icon" size={22} aria-hidden="true" />
            <div><dt>Sampling</dt><dd>80% stratified participant subsample</dd></div>
          </div>
          <div className="simulation-metadata-group">
            <Link2 className="simulation-metadata-icon" size={22} aria-hidden="true" />
            <div><dt>Same participant sample</dt><dd>Used for both methods</dd></div>
          </div>
        </dl>
        {step === -1 && <button type="button" onClick={() => setProgress((current) => ({ ...current, [simulation]: 0 }))}
          className="simulation-run-button">
          <Play size={14} fill="currentColor" aria-hidden="true" />Run Simulation
        </button>}
      </div>
      {step >= 0 && !completed && <ol className="simulation-stepper" aria-label="Simulation progress">
        {steps.map((label, index) => <li key={label} aria-current={step === index ? "step" : undefined}
          className={`simulation-step ${index <= step ? "is-reached" : ""}`}>
          {index > 0 && <span aria-hidden="true" className="simulation-step-connector" />}
          <span aria-hidden="true" className="simulation-step-node">{index < step && <Check size={16} strokeWidth={2.5} />}</span>
          <span>{label}</span>
        </li>)}
      </ol>}
      <span className="sr-only" role="status">{step >= 0 ? `Simulation ${simulation}: ${completed ? "Complete" : steps[step]}` : ""}</span>
    </section>

    {completed && <>
      <section className={`${card} simulation-comparison`} aria-labelledby="simulation-comparison-heading">
        <div className="simulation-section-heading">
          <h2 id="simulation-comparison-heading" className="simulation-section-title">Existing vs Enhanced</h2>
          <span className="text-sm text-muted">Simulation {simulation} · n ≈ {result.sampleSize.toLocaleString("en-US")}</span>
        </div>
        <div className="simulation-table-container"><table className="simulation-comparison-table">
          <thead className="border-b border-line text-xs text-muted"><tr>
            <th scope="col" className="px-2 py-2 font-normal sm:px-3">Metric</th>
            <th scope="col" className="px-2 py-2 text-right font-normal sm:px-3">Existing K-Means</th>
            <th scope="col" className="px-2 py-2 text-right font-normal sm:px-3">Enhanced K-Means</th>
            <th scope="col" className="simulation-result-heading">Result</th>
          </tr></thead>
          <tbody>{metrics.map(({ key, label, direction, digits }) => <tr key={key} className="border-b border-slate-100">
            <th scope="row" className="px-2 py-2.5 font-normal sm:px-3">{label}<span className="mt-0.5 block text-[10px] text-muted">{direction} is better</span></th>
            <td className="px-2 py-2.5 text-right sm:px-3">{result.existing[key].toFixed(digits)}</td>
            <td className="px-2 py-2.5 text-right font-semibold text-teal-600 sm:px-3">{result.enhanced[key].toFixed(digits)}</td>
            <td><span className="simulation-result-badge">
              {direction === "higher" ? <ArrowUp size={14} aria-hidden="true" /> : <ArrowDown size={14} aria-hidden="true" />}
              {direction === "higher" ? "Higher" : "Lower"}
            </span></td>
          </tr>)}</tbody>
        </table></div>
      </section>
      <section className={card} aria-label="Analysis details">
        <div role="tablist" aria-label="Simulation method" className="simulation-method-tabs">
          {(["existing", "enhanced"] as const).map((value) => <button key={value} type="button" role="tab"
            id={`${value}-method`} aria-selected={method === value} tabIndex={method === value ? 0 : -1}
            aria-controls="simulation-method-panel" onClick={() => setMethod(value)}
            onKeyDown={(event) => {
              if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
              event.preventDefault();
              const next = event.key === "Home" ? "existing" : event.key === "End" ? "enhanced" : value === "existing" ? "enhanced" : "existing";
              setMethod(next);
              document.getElementById(`${next}-method`)?.focus();
            }}
            className={`simulation-method-tab ${method === value ? "is-active" : ""}`}>
            {value === "existing" ? "Existing" : "Enhanced"} K-Means
          </button>)}
        </div>
        <div id="simulation-method-panel" role="tabpanel" tabIndex={0} aria-labelledby={`${method}-method`} className="simulation-method-content">
          {method === "existing" ? <dl className="simulation-existing-summaries">
            {([ ["Selected k", result.selectedK], ["Iterations", result.existing.iterations], ["Cluster 0", result.existing.clusterSizes[0]],
              ["Cluster 1", result.existing.clusterSizes[1]], ["Initialization", "Random"] ] as const).map(([label, value]) => <div key={label} className={detailCard}>
              <dt className="text-xs text-muted">{label}</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{typeof value === "number" ? value.toLocaleString("en-US") : value}</dd>
            </div>)}
          </dl> : <div className="space-y-6">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <DetailGroup title="PCA" fields={[["Input variables", result.inputVariables], ["Components retained", variance.length], ["Cumulative variance", `${result.cumulativeVariance[variance.length - 1].toFixed(2)}%`]]} />
              <DetailGroup title="NbClust" fields={[["Selected k", result.selectedK], ["Supporting indices", `${result.votes[result.selectedK - 2]} of ${result.votes.reduce((sum, count) => sum + count, 0)}`]]} />
              <DetailGroup title="DPC" fields={[["Centers selected", result.selectedK], ["Initialization", "Deterministic"]]} />
              <DetailGroup title="K-Means" fields={[["Iterations", result.enhanced.iterations], ["Cluster 0", result.enhanced.clusterSizes[0]], ["Cluster 1", result.enhanced.clusterSizes[1]]]} />
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <figure className="simulation-chart">
                <figcaption className="mb-4 text-base font-semibold">Cumulative Explained Variance</figcaption>
                <div className="simulation-chart-plot" role="img" aria-label={`Mock cumulative variance from PC1 to PC6: ${result.cumulativeVariance.join(", ")} percent. Threshold: 85 percent.`}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={variance} margin={{ top: 16, right: 16, bottom: 8, left: 0 }}>
                      <CartesianGrid vertical={false} stroke={chartPalette.grid} strokeDasharray="3 3" />
                      <XAxis dataKey="component" tickLine={false} axisLine={false} interval={0} />
                      <YAxis width={44} domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(value: number) => `${value}%`} tickLine={false} axisLine={false} />
                      <Tooltip formatter={(value: number) => [`${value.toFixed(2)}%`, "Cumulative variance"]} />
                      <ReferenceLine y={85} stroke="#E58A00" strokeDasharray="4 3" label={{ value: "85%", position: "insideTopRight", fontSize: 11, fill: "#E58A00" }} />
                      <Line dataKey="value" type="linear" stroke={chartPalette.primary} strokeWidth={2} dot={{ r: 3, fill: chartPalette.primary }} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </figure>
              <figure className="simulation-chart">
                <figcaption className="mb-4 text-base font-semibold">NbClust Votes</figcaption>
                <div className="simulation-chart-plot" role="img" aria-label={`Mock NbClust votes: ${votes.map((row) => `k=${row.k}: ${row.votes}`).join(", ")}. Selected k=${result.selectedK}.`}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={votes} margin={{ top: 16, right: 8, bottom: 8, left: 0 }}>
                      <CartesianGrid vertical={false} stroke={chartPalette.grid} strokeDasharray="3 3" />
                      <XAxis dataKey="k" tickFormatter={(value: number) => `k=${value}`} interval={0} tickLine={false} axisLine={false} />
                      <YAxis width={44} domain={[0, 12]} ticks={[0, 3, 6, 9, 12]} allowDecimals={false} tickLine={false} axisLine={false} />
                      <Tooltip labelFormatter={(value) => `k=${value}`} formatter={(value: number) => [value, "Votes"]} />
                      <Bar dataKey="votes" radius={[2, 2, 0, 0]} isAnimationActive={false}>
                        {votes.map((row) => <Cell key={row.k} fill={row.k === result.selectedK ? chartPalette.primary : "#d1d5db"} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </figure>
            </div>
          </div>}
        </div>
      </section>
    </>}
  </div>;
};
