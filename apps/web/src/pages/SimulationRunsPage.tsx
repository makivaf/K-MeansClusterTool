import { useState } from "react";
import { Link2, PieChart, Play, Users } from "lucide-react";
import { simulationIds } from "../../../../packages/shared/src/simulation";
import { useSimulationMetadata } from "../hooks/useSimulationMetadata";
import "./SimulationRunsPage.css";

export const SimulationRunsPage = () => {
  const [simulation, setSimulation] = useState<typeof simulationIds[number]>(1);
  const { metadata, loading, error, retry } = useSimulationMetadata();
  const selected = metadata?.simulations.find((entry) => entry.simulationId === simulation);

  return <div className="simulation-page">
    <header className="simulation-heading">
      <h1>Simulation Runs</h1>
    </header>
    <section className="simulation-surface simulation-controls" aria-label="Simulation selector" aria-busy={loading}>
      <div className="simulation-choices" role="group" aria-label="Simulations">
        {simulationIds.map((number) => <button key={number} type="button" aria-pressed={simulation === number}
          aria-label={`Simulation ${number}`} onClick={() => setSimulation(number)}
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
        <button type="button" disabled className="simulation-run-button" aria-describedby="simulation-analysis-status">
          <Play size={14} fill="currentColor" aria-hidden="true" />Run Simulation
        </button>
      </div>
      <div className="mt-6 text-sm text-muted">
        <p role="status">{loading ? "Loading sample metadata…" : error ? "Sample metadata unavailable." :
          selected?.sampleStatus === "sample_ready" ? "Sample ready" : "Sample metadata unavailable."}</p>
        {error && <div className="mt-2" role="alert">{error} <button type="button" className="underline" onClick={retry}>Retry</button></div>}
        <p id="simulation-analysis-status" className="mt-2">{(!selected || selected.analysisStatus === "analysis_unavailable") &&
          "Analysis unavailable. Analytical results are not available yet."}</p>
      </div>
    </section>
  </div>;
};
