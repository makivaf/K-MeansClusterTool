import { useState } from "react";
import { Link } from "react-router-dom";
import type { UploadResponse } from "../../../../packages/shared/src";
import { MetricComparisonTable } from "../components/MetricComparisonTable";
import { Panel } from "../components/ui/Panel";
import { ResearchPageNavigation } from "../components/layout/ResearchPageNavigation";
import { useSimulationCapabilities } from "../hooks/useSimulationCapabilities";
import { PageHeading } from "./PageHeading";

const simulations = [1, 2, 3, 4, 5] as const;
const tabClass = (active: boolean) => `whitespace-nowrap border-b-2 px-4 py-3 text-sm font-semibold ${active ? "border-teal-700 text-teal-800" : "border-transparent text-muted hover:text-ink"}`;
const PendingFields = ({ labels }: { labels: string[] }) => <dl className="grid gap-4 sm:grid-cols-2">
  {labels.map((label) => <div key={label}><dt className="text-xs text-muted">{label}</dt><dd className="mt-1 text-lg">—</dd></div>)}
</dl>;

export const SimulationRunsPage = ({ dataset }: { dataset: UploadResponse | null }) => {
  const [simulation, setSimulation] = useState<typeof simulations[number]>(1);
  const [method, setMethod] = useState<"existing" | "enhanced">("existing");
  const { capabilities, error, loading, retry } = useSimulationCapabilities();
  return <>
    <PageHeading title="Simulation Runs" description="Existing vs Enhanced K-Means on participant subsamples." />
    <div className="mb-6 overflow-x-auto border-b border-line" role="tablist" aria-label="Simulations">
      {simulations.map((number) => <button key={number} id={`simulation-${number}`} type="button" role="tab"
        aria-selected={simulation === number} aria-controls="simulation-panel" className={tabClass(simulation === number)}
        onClick={() => { setSimulation(number); setMethod("existing"); }}>Simulation {number}</button>)}
    </div>
    <div id="simulation-panel" role="tabpanel" aria-labelledby={`simulation-${simulation}`} className="space-y-6">
      <Panel title={`Simulation ${simulation}`} variant="surface" action={<span className="text-xs font-medium text-muted">Not run</span>}>
        <dl className="grid gap-4 sm:grid-cols-2">
          <div><dt className="text-xs text-muted">Sample size</dt><dd className="mt-1 text-2xl font-semibold">—</dd></div>
          <div><dt className="text-xs text-muted">Planned sampling</dt><dd className="mt-1 text-sm">80% stratified participant subsample</dd></div>
        </dl>
        <p className="mt-3 text-xs text-muted">The same participant sample is required for both methods.</p>
        <div className="mt-5 flex flex-wrap items-center gap-4">
          <button type="button" disabled className="h-11 cursor-not-allowed rounded-sm bg-slate-200 px-5 text-sm font-semibold text-slate-500">Run Simulation</button>
          {!dataset ? <Link to="/dataset-setup" className="text-sm font-semibold text-teal-800 underline">Validate Dataset</Link> : null}
        </div>
        <p role={error ? "alert" : "status"} className="mt-3 text-sm text-muted">
          {loading ? "Checking simulation availability…" : error ?? capabilities?.message}
        </p>
        {error ? <button type="button" onClick={retry} className="mt-2 text-sm font-semibold text-teal-800 underline">Retry connection</button> : null}
      </Panel>
      <Panel title={`Existing vs Enhanced — Simulation ${simulation}`} variant="surface">
        <p className="mb-4 text-sm text-muted">No results. This simulation has not run.</p>
        <MetricComparisonTable />
        <div className="mb-5 mt-5 flex overflow-x-auto border-b border-line" role="tablist" aria-label="Simulation method">
          <button id="existing-method" type="button" role="tab" aria-selected={method === "existing"} aria-controls="method-panel" className={tabClass(method === "existing")} onClick={() => setMethod("existing")}>Existing K-Means</button>
          <button id="enhanced-method" type="button" role="tab" aria-selected={method === "enhanced"} aria-controls="method-panel" className={tabClass(method === "enhanced")} onClick={() => setMethod("enhanced")}>Enhanced K-Means</button>
        </div>
        <div id="method-panel" role="tabpanel" aria-labelledby={method === "existing" ? "existing-method" : "enhanced-method"}>
          {method === "existing" ? <>
            <p className="mb-4 text-xs text-muted">Planned initialization: Random</p>
            <PendingFields labels={["Selected k", "Iterations", "Cluster 0 size", "Cluster 1 size"]} />
          </> : <div className="grid gap-6 sm:grid-cols-2">
            <section><h3 className="mb-3 font-semibold">PCA</h3><PendingFields labels={["Input variables", "Components retained", "Cumulative explained variance"]} /></section>
            <section><h3 className="mb-3 font-semibold">NbClust</h3><PendingFields labels={["Selected k", "Supporting indices"]} /></section>
            <section><h3 className="mb-3 font-semibold">DPC</h3><p className="mb-3 text-xs text-muted">Planned initialization: Deterministic</p><PendingFields labels={["Centers selected"]} /></section>
            <section><h3 className="mb-3 font-semibold">K-Means</h3><PendingFields labels={["Iterations", "Cluster 0 size", "Cluster 1 size"]} /></section>
          </div>}
        </div>
      </Panel>
    </div>
    <ResearchPageNavigation currentPath="/simulation-runs" />
  </>;
};
