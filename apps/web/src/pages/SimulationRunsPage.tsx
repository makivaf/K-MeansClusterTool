import { NbClustComparison, StandardSelectionSummary } from "../components/NbClustComparison";
import { ComparisonRunProgress } from "../components/ComparisonRunProgress";
import { PcaLoadingMatrix } from "../components/PcaLoadingMatrix";
import { readPcaLoadings } from "../utils/pcaLoadings";
import { formatContinuous, formatInteger } from "../utils/numberFormatting";
import { PartitionProjection, projectionTick } from "../components/charts/PartitionProjection";
import { SilhouetteChart } from "../components/SopFigures";
import { FeatureRepresentationComparison } from "../components/FeatureRepresentationComparison";
import { DpcCenterTable } from "../components/DpcCenterTable";
import { InitializationComparison } from "../components/InitializationComparison";
import { sopText } from "../utils/sopText";
import { InternalValidationCalculationDetails } from "../components/InternalValidationCalculationDetails";
import { MetricComparisonTable, formatMetric } from "../components/MetricComparisonTable";
﻿import { useState } from "react";


import { Link } from "react-router-dom";
import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import { simulationParticipantLimit, SimulationAnalysisSchema, type SimulationRunState } from "../../../../packages/shared/src/simulation";
import { useSimulationMetadata } from "../hooks/useSimulationMetadata";
import { useSimulationCapabilities } from "../hooks/useSimulationCapabilities";
import { useMethodJobs } from "../hooks/useMethodJobs";
import { visibleMethodResult, methodPlaceholder } from "../utils/methodPresentation";
import type { MethodResult } from "../../../../packages/shared/src/methodExecution";
import { MethodExecutionControls } from "../components/MethodExecutionControls";
import { FreshStudyResults } from "../components/FreshStudyResults";
import { CommonSpaceValidation } from "../components/CommonSpaceValidation";
import "./SimulationRunsPage.css";
import { CorrelationHeatmap } from "../components/charts/FinalFindingsCharts";
import { MethodCard, VarianceSummary, PcaContribution, ClusterDistribution } from "../components/SopComparison";

const displayCoordinate = (value: number) => formatContinuous(value);
type Analysis = NonNullable<SimulationRunState["result"]>["analysis"];

export const SimulationProgress = ({ stage, interrupted }: { stage: number; interrupted: boolean }) => (
  <ComparisonRunProgress stage={stage} interrupted={interrupted} />
);

const CorrelationChart = ({ analysis }: { analysis: Analysis }) => analysis.correlation
  ? <CorrelationHeatmap correlation={{ features: analysis.enhanced.retainedVariables, matrix: analysis.correlation }} compact showKey={false} />
  : <p className="simulation-unavailable">Correlation unavailable for this historical run.</p>;
const DecisionGraph = ({ enhanced }: { enhanced: Analysis["enhanced"] }) => enhanced.dpc.decisionGraph ? <figure>
  <div className="simulation-chart-plot" role="img" aria-label="DPC rho delta decision graph; selected centers highlighted">
    <ResponsiveContainer width="100%" height="100%"><ScatterChart margin={{ top: 12, right: 24, bottom: 16, left: 20 }}>
      <CartesianGrid stroke="var(--research-border)" strokeDasharray="3 3" />
      <XAxis type="number" dataKey="rho" name="rho" allowDecimals={false} tickCount={5} minTickGap={24} tickFormatter={projectionTick} height={50} tickMargin={8}
        tick={{ fontSize: "var(--research-caption-size)", fill: "var(--research-muted)" }} axisLine={{ stroke: "var(--research-border)" }} tickLine={false}
        label={{ value: "rho", position: "insideBottom", offset: 0, fontSize: "var(--research-caption-size)", fill: "var(--research-muted)" }} />
      <YAxis type="number" dataKey="delta" name="delta" tickCount={5} minTickGap={16} tickFormatter={projectionTick} width={64} tickMargin={8}
        tick={{ fontSize: "var(--research-caption-size)", fill: "var(--research-muted)" }} axisLine={{ stroke: "var(--research-border)" }} tickLine={false}
        label={{ value: "delta", angle: -90, position: "left", offset: 12, style: { textAnchor: "middle" }, fontSize: "var(--research-caption-size)", fill: "var(--research-muted)" }} />
      <Tooltip formatter={(value: number, name: string) => [name === "rho" ? (Number.isInteger(value) ? formatInteger(value) : formatContinuous(value)) : displayCoordinate(value), name]} cursor={{ strokeDasharray: "3 3" }} />
      <Scatter name="Participants" data={enhanced.dpc.decisionGraph.filter(point => !point.selected)} fill="var(--research-selected-border)" isAnimationActive={false} />
      <Scatter name="DPC centers" data={enhanced.dpc.decisionGraph.filter(point => point.selected)} fill="var(--research-comparison)" shape="diamond" isAnimationActive={false} />
    </ScatterChart></ResponsiveContainer>
  </div>
  <ul className="projection-legend" aria-label="DPC decision graph legend">
    <li><span className="projection-legend-dot" style={{ backgroundColor: "var(--research-selected-border)" }} aria-hidden="true" />Participants</li>
    <li><span className="projection-legend-diamond" style={{ backgroundColor: "var(--research-comparison)" }} aria-hidden="true" />Selected DPC centers</li>
  </ul>
</figure> : <p className="simulation-unavailable">Decision graph unavailable for this historical run.</p>;
const ProjectionChart = ({ analysis, method }: { analysis: Analysis; method: "standard" | "enhanced" }) => {
  const projection = analysis.projection;
  if (!projection) return <p className="simulation-unavailable">Projection unavailable for this historical run.</p>;
  const centers = method === "standard" ? projection.standardCentroids : projection.enhancedCentroids;
  return <PartitionProjection points={projection.points.map(point => ({ x: point.x, y: point.y, cluster: point[method] }))} centers={centers} label={method} />;
};


export const SimulationResults = ({ result, comparisonEvidence }: { result: Pick<NonNullable<SimulationRunState["result"]>, "analysis" | "comparison"> & { metadata: { configuration?: { manualK: number | null } } }; comparisonEvidence?: MethodResult }) => {
  const { existing, enhanced } = result.analysis;
  const pcaLoadings = readPcaLoadings(enhanced, enhanced.retainedVariables, enhanced.pcaComponents);
  const exploratory = result.metadata.configuration?.manualK != null;
  const selectedRun = existing.runs.find(run => run.seed === 0) ?? existing.runs[0];
  const usableIndices = enhanced.nbclust.indices.filter(index => index.status === "success").length;
  return <>
    <section className="simulation-surface simulation-results-section">
      <div className="simulation-section-heading"><h2 className="simulation-section-title">{sopText.sop1.heading}</h2><p>{sopText.sop1.description}</p></div>
      <FeatureRepresentationComparison standardVariables={enhanced.retainedVariables} enhancedVariables={enhanced.retainedVariables}
        standardFigure={<CorrelationChart analysis={result.analysis} />} enhanced={enhanced}>
        <VarianceSummary retained={enhanced.pcaComponents} loadingData={pcaLoadings} rows={enhanced.pcaVariance.map(row => ({ component: row.component, eigenvalue: row.eigenvalue, cumulativeVariance: row.cumulativeExplainedVariance }))} />
        <PcaLoadingMatrix variables={pcaLoadings?.variables ?? enhanced.retainedVariables}
            components={Array.from({ length: enhanced.pcaComponents }, (_, index) => `PC${index + 1}`)} values={pcaLoadings?.values} />
        <PcaContribution dimensions={enhanced.retainedVariables.length} components={enhanced.pcaComponents}
          n={existing.participantCount} k={result.analysis.pcaContribution?.k ?? existing.selectedK}
          calculations={{ existing: result.analysis.calculations?.standard, enhanced: result.analysis.calculations?.pca }} runCount={result.analysis.pcaContribution?.runCount}
          existing={result.analysis.pcaContribution?.existing} enhanced={result.analysis.pcaContribution?.enhanced}
          relativeChange={result.analysis.pcaContribution ? Object.fromEntries(Object.entries(result.analysis.pcaContribution.relativeChange).filter(([, value]) => value !== null)) : undefined}
          note={result.analysis.pcaContribution ? `Held constant: k = ${result.analysis.pcaContribution.k}, Lloyd algorithm, random initialization, ${result.analysis.pcaContribution.runCount} seeds, n = ${formatInteger(existing.participantCount)}.` : "Controlled PCA-only metrics are unavailable. The overall comparison includes all enhancements."} />
      </FeatureRepresentationComparison>
    </section>
    <section className="simulation-surface simulation-results-section">
      <div className="simulation-section-heading"><h2 className="simulation-section-title">{sopText.sop2.heading}</h2><p>{sopText.sop2.description}</p></div>
      {exploratory && <p className="simulation-preview-note">Exploratory Standard manual k = {existing.selectedK}. The canonical study baseline uses Silhouette selection over k = 2–10; this sample's Silhouette choice is {existing.silhouetteSelectedK}. Enhanced remains automatic.</p>}
      <NbClustComparison standard={
        <MethodCard simulation title="Silhouette-Based Selection"><p className="simulation-compact-note">Selects k with the highest mean Silhouette.</p><dl className="simulation-detail-list"><div><dt>Selection method</dt><dd>{exploratory ? "Exploratory manual k" : "Silhouette Coefficient"}</dd></div><div><dt>Candidate k</dt><dd>2–10</dd></div></dl><h3 className="card-title">Silhouette by k</h3>{existing.silhouetteByK ? <SilhouetteChart candidates={existing.silhouetteByK} /> : <p className="simulation-unavailable">Candidate-k scores unavailable for this historical run.</p>}<StandardSelectionSummary selectedK={existing.selectedK} /></MethodCard>} candidateK={Array.from({ length: 9 }, (_, i) => i + 2)} selectedK={enhanced.selectedK}
          usableIndices={usableIndices} votes={enhanced.nbclust.votes} indices={enhanced.nbclust.indices} />
    </section>
    <section className="simulation-surface simulation-results-section">
      <div className="simulation-section-heading"><h2 className="simulation-section-title">{sopText.sop3.heading}</h2><p>{sopText.sop3.description}</p></div>
      {/* Current-run reference-seed ARI and historical DPC checks are not
          modal-partition evidence. Only supplied execution counts are shown. */}
      <InitializationComparison simulation controlled={!!comparisonEvidence?.sopControls}
        standard={comparisonEvidence?.sopControls ? comparisonEvidence.initializationEvidence?.pcaRandom : { executions: existing.runs.length }}
        enhanced={comparisonEvidence?.initializationEvidence?.enhanced} baseline={comparisonEvidence?.initializationEvidence?.standard}
        randomRuns={comparisonEvidence ? existing.ariBySeed : undefined} dpcRuns={comparisonEvidence ? enhanced.dpc.ariByRun : undefined} controlledRuns={comparisonEvidence?.sopControls?.randomAriBySeed}
        selectedCenters={enhanced.dpc.centroidCount}
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
      <div className="simulation-section-heading"><h2 className="simulation-section-title">Standard vs Enhanced Comparison</h2><p>n = {formatInteger(existing.participantCount)}</p></div>
      <section className="simulation-chart"><h3 className="card-title">Scatter Plot Comparison (PCA Space)</h3><div className="projection-comparison-grid">{(["Standard K-Means", "Enhanced K-Means"] as const).map((name, index) => <div key={name} className="projection-method-panel"><h4>{name}</h4><ProjectionChart analysis={result.analysis} method={index ? "enhanced" : "standard"} /><p className="simulation-compact-note projection-method-metadata">Initialization: {index ? "DPC (Deterministic)" : "Random"} · {index ? enhanced.iterations : selectedRun.iterations} iterations · Converged: {(index ? enhanced.convergedBeforeMaxIter : selectedRun.convergedBeforeMaxIter) ? "Yes" : "No"}{!index && " · Seed 0"}</p></div>)}</div></section>
      <section className="simulation-chart">
        {exploratory && <p className="simulation-preview-note">This compares an exploratory Standard k override with automatic Enhanced clustering. It is not the canonical enhancement comparison.</p>}
        {comparisonEvidence?.commonSpace ? <CommonSpaceValidation comparison={comparisonEvidence} standardK={existing.selectedK} enhancedK={enhanced.selectedK} /> : <p role="status">Compatible common-space validation is unavailable for this stored result.</p>}
        <details className="pca-calculation-details"><summary>Supplementary native-space metrics</summary>
        <MetricComparisonTable existing={existing.metrics ?? {}}
          enhanced={enhanced.metrics ?? {}}
          footerNote="Supplementary native-space metrics: Standard uses standardized features; Enhanced uses retained PCs. These values do not establish cross-space improvement." />
        <InternalValidationCalculationDetails
          standard={{ n: existing.participantCount, k: existing.selectedK, representation: `${enhanced.retainedVariables.length} standardized features`, runCount: existing.runs.length, calculation: result.analysis.calculations?.standard,
            metrics: existing.metrics ?? {} }}
          enhanced={{ n: enhanced.participantCount, k: enhanced.selectedK, representation: `${enhanced.pcaComponents} principal components`, calculation: result.analysis.calculations?.enhanced,
            metrics: enhanced.metrics ?? {} }}
          formatValue={value => formatMetric(value, true)} />
        </details>
      </section>
      <section className="simulation-chart"><h3 className="card-title">Cluster Distribution</h3><div className="sop-distribution-grid is-comparison"><ClusterDistribution title="Standard K-Means" metadata={`Seed ${selectedRun.seed}`} sizes={selectedRun.clusterSizes} participants={existing.participantCount} /><ClusterDistribution title="Enhanced K-Means" sizes={enhanced.clusterSizes} participants={enhanced.participantCount} /></div></section>
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
  const configuration = { sampleMode, sampleCount, manualK: null };
  const availableParticipantCount = metadata?.availableParticipantCount ?? simulationParticipantLimit;
  const changeSampleCount = (value: string) => setSampleCount(Math.min(availableParticipantCount, Math.max(100, Math.trunc(Number(value)) || 100)));
  const jobs = useMethodJobs({ scope: "simulation", simulationId: simulation, configuration });
  const comparison = jobs.comparison?.result;
  const running = jobs.locked;

  return <div className="simulation-page">
    <header className="simulation-heading">
      <p className="page-eyebrow">K-Means Comparison</p><h1 className="page-title">Standard K-Means vs Enhanced K-Means</h1>
      <p className="page-subtitle">Compare Standard and Enhanced K-Means on a reproducible custom participant sample.</p>
    </header>
    <section className="simulation-surface simulation-controls" aria-label="Configure Simulation" aria-busy={loading}>
      <div className="simulation-section-heading"><h2 className="simulation-section-title">Configure Simulation</h2><p>Review participant and cluster configuration, then run the simulation. Both methods use the same sampled participants.</p></div>
      <fieldset disabled={running} className="simulation-config-fields">
        <section className="simulation-chart"><h3 className="simulation-eyebrow">Participant Configuration — Custom Sample</h3><div className="simulation-participant-layout">
          <div className="simulation-available"><span>Available participants</span><strong>{formatInteger(availableParticipantCount)}</strong><small>ADNI study-entry participants</small></div>
          <div className="simulation-sample-controls"><div className="simulation-sample-heading"><label htmlFor="simulation-sample-number" className="font-semibold">Participant Sample Size</label><div className="simulation-sample-input"><input id="simulation-sample-number" className="simulation-sample-number" type="number" min={100} max={availableParticipantCount} step={1} value={sampleCount} onChange={event => changeSampleCount(event.target.value)} /><span>/ {formatInteger(availableParticipantCount)}</span></div></div>
          <div className="simulation-slider-label"><label htmlFor="simulation-sample-count">Drag to select</label></div><input id="simulation-sample-count" type="range" min={100} max={availableParticipantCount} value={sampleCount} onChange={event => changeSampleCount(event.target.value)} /><div className="simulation-slider-label"><span>100</span><span>{formatInteger(availableParticipantCount)} - Full dataset</span></div>
          </div></div>
          <p className="simulation-compact-note mt-2"><Link to="/study-findings" className="research-text-action">Full-cohort validated results are available in Study Findings.</Link></p>
        </section>
        <div className="simulation-two-column">
          <section className="simulation-chart"><h3 className="simulation-eyebrow">Standard K-Means</h3><p className="simulation-compact-note">Cluster selection</p><h4>Silhouette Coefficient</h4><dl className="simulation-detail-list"><div><dt>Selection rule</dt><dd>Highest average Silhouette over k = 2–10</dd></div><div><dt>Initialization</dt><dd>Random</dd></div></dl></section>
          <section className="simulation-chart"><h3 className="simulation-eyebrow">Enhanced K-Means</h3><p className="simulation-compact-note">Cluster selection</p><h4>NbClust</h4><dl className="simulation-detail-list"><div><dt>Selection rule</dt><dd>Multi-index consensus</dd></div><div><dt>Candidate k</dt><dd>2–10</dd></div><div><dt>Initialization</dt><dd>DPC (Deterministic)</dd></div></dl></section>
        </div>
      </fieldset>
      {error && <div role="alert">{error} <button type="button" className="underline" onClick={retry}>Retry</button></div>}
    </section>
    <MethodExecutionControls state={jobs} ready={!!selected && !!capabilities?.executionAvailable} />
    <FreshStudyResults standard={visibleMethodResult(jobs, "standard")} enhanced={visibleMethodResult(jobs, "enhanced")}
      comparison={comparison ?? undefined} standardState={methodPlaceholder(jobs, "standard")} enhancedState={methodPlaceholder(jobs, "enhanced")} />
  </div>;
};
