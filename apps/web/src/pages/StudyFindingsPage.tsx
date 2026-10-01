import { PcaChart, NbClustChart, NbClustIndexDetails, SilhouetteChart } from "../components/SopFigures";
import { DpcCenterTable } from "../components/DpcCenterTable";
import { InitializationComparison } from "../components/InitializationComparison";
import { memo, useState } from "react";
import { CorrelationHeatmap } from "../components/charts/FinalFindingsCharts";
import { LongitudinalProgressionChart } from "../components/charts/LongitudinalProgressionChart";
import { MetricComparisonTable, metricDefinitions } from "../components/MetricComparisonTable";
import { InternalValidationCalculationDetails } from "../components/InternalValidationCalculationDetails";
import { Panel } from "../components/ui/Panel";
import { ResearchPageNavigation } from "../components/layout/ResearchPageNavigation";
import { CheckCircle2, Database, Loader2, Play } from "lucide-react";
import { Link } from "react-router-dom";
import type { UnifiedResearchRun, UploadResponse } from "../../../../packages/shared/src/schema";
import type { AnalysisRunState } from "../hooks/useStudyFindings";
import { isDatasetReady } from "../utils/validatedDataset";
import { useSopEvaluation } from "../hooks/useSopEvaluation";
import { PartitionProjection } from "../components/charts/PartitionProjection";
import type { DefensePanel } from "../../../../packages/shared/src/schema";
import "./StudyFindingsPage.css";
import { PageHeading } from "./PageHeading";
import { MethodCard, SopComparison, VariableChips, VarianceSummary, PcaContribution, ClusterDistribution } from "../components/SopComparison";
import { getMeasureLabel } from "../utils/measureLabels";

// Loading initialization evidence should not rerender the retained charts.
const ProgressionChart = memo(LongitudinalProgressionChart);

const StudyProjection = ({ panel, label }: { panel?: DefensePanel; label: string }) => panel
  ? <PartitionProjection label={label} points={panel.observations.map(point => ({ x: point.pc1, y: point.pc2, cluster: point.cluster }))}
      centers={panel.markers.filter(marker => marker.type === "final").map(marker => ({ x: marker.pc1, y: marker.pc2, cluster: marker.cluster }))} />
  : <p className="text-sm text-muted">Validated projection unavailable.</p>;

const Fact = ({ label, value }: { label: string; value: string | number }) => <div>
  <dt className="text-xs text-muted">{label}</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">{value}</dd>
</div>;

export const StudyFindingsPage = ({ analysis, dataset }: { analysis: AnalysisRunState; dataset: UploadResponse | null }) => {
  const ready = isDatasetReady(dataset);
  if (analysis.status === "complete" && analysis.run) return <StudyResults run={analysis.run} />;
  const running = analysis.locked;
  const interrupted = analysis.status === "interrupted";
  return <div className="research-page">
    <PageHeading title="Study Findings" description="Compare the existing and enhanced K-Means results." />
    <Panel title={running ? "Comparison in progress" : ready ? "Ready for comparison" : "Datasets required"} variant="surface">
      <div className="study-readiness" aria-busy={running}>
        <div className="flex min-w-0 items-start gap-3">
          <span className="research-status-icon" aria-hidden="true">{running ? <Loader2 size={22} className="animate-spin" /> : ready ? <CheckCircle2 size={22} /> : <Database size={22} />}</span>
          <div role="status">
            <p className="font-semibold">{ready ? "7 of 7 datasets validated" : "Validate all seven required datasets"}</p>
            <p className="mt-1 text-sm text-muted">{running ? "Running comparison. Findings will appear when complete." : ready ? "Run Comparison to generate study findings." : "Select and validate the CSV exports in Dataset Setup."}</p>
          </div>
        </div>
        {ready ? <button type="button" className="research-primary-button" disabled={running}
          onClick={() => { void (interrupted ? analysis.resume() : analysis.start()); }}>
          {running ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
          {running ? (analysis.status === "verifying" ? "Checking Results…" : "Running Comparison…") : interrupted ? "Resume Comparison" : "Run Comparison"}
        </button> : <Link className="research-primary-button" to="/dataset-setup">Go to Dataset Setup</Link>}
      </div>
      {analysis.error && ready ? <div className="mt-5 border-t border-line pt-4">
        <p role="alert" className="text-sm text-red-700">{analysis.error}</p>
        <Link to="/dataset-setup" className="research-text-action mt-2 inline-block">Review datasets</Link>
      </div> : null}
    </Panel>
  </div>;
};

const StudyResults = memo(function StudyResults({ run }: { run: UnifiedResearchRun }) {
  const { evaluation, baselineSweep, studyEvidence, defenseGeometry, error: sopError, dpcStatus } = useSopEvaluation(run);
  const dpcUnavailable = {
    loading: "Loading validated DPC reproducibility evidence...",
    "request-error": "The study evidence request failed. DPC reproducibility evidence could not be loaded.",
    "validation-error": "The study evidence response failed validation. DPC reproducibility evidence cannot be shown.",
    "provenance-rejected": "DPC reproducibility evidence was rejected because required study provenance or geometry did not match.",
    unavailable: "Verified DPC geometry or per-run ARI evidence is not supplied by this study response.",
    ready: undefined
  }[dpcStatus];
  const [activeTab, setActiveTab] = useState("sop1");
  const ablation = evaluation?.sop1.ablation;
  const existing = Object.fromEntries(run.baselineComparison.metrics.map((metric) => [metric.metric, metric.baselineValue]));
  const enhanced = Object.fromEntries(metricDefinitions.map(({ key, field }) => [key, run.enhancedClustering.metrics[field]]));
  const baseline = run.baselineComparison.baselineMethod;
  const relativeChange = Object.fromEntries(run.baselineComparison.metrics.map(metric => [metric.metric, metric.signedRelativeChangePercent]));
  const candidateRange = `${run.kSelection.candidateK[0]}–${run.kSelection.candidateK.at(-1)}`;
  const variance = `${(run.pca.cumulativeExplainedVariance * 100).toFixed(2)}%`;
  const profiles = new Map(run.clusterProfiles.profiles.map((profile) => [profile.clusterId, profile]));
  const model = run.longitudinal.mixedEffects;
  const result = model.primaryResult;

  return <div className="research-page study-findings">
    <PageHeading title="Study Findings" description={`Validated full-cohort analysis · n = ${run.cohort.parentN.toLocaleString()}`} />
    <div className="space-y-6">
      <Panel title="Method Comparison Overview" variant="surface">
        <div className="overflow-x-auto"><table className="research-table study-overview">
          <thead><tr><th scope="col">Methodology</th><th scope="col">Standard K-Means</th><th scope="col">Enhanced K-Means</th></tr></thead>
          <tbody>
            <tr><th scope="row">Feature representation</th><td>{run.preprocessing.retainedFeatures.length} standardized retained variables</td><td>PCA · {run.pca.components} PCs · {variance}</td></tr>
            <tr><th scope="row">Cluster-number selection</th><td>Maximum Silhouette, k = {candidateRange}</td><td>NbClust multi-index voting</td></tr>
            <tr><th scope="row">Selected k</th><td>{baseline.selectedK}</td><td>{run.kSelection.selectedK}</td></tr>
            <tr><th scope="row">Initialization</th><td>Random</td><td>DPC {run.initialization.deterministic ? "deterministic" : ""}</td></tr>
          </tbody>
        </table></div>
      </Panel>
      <div className="study-sop-tabs" role="tablist" aria-label="Study findings sections">
        {[
          ["sop1", "SOP 1", "Feature Representation"],
          ["sop2", "SOP 2", "Cluster Number Selection"],
          ["sop3", "SOP 3", "Initialization & Reproducibility"],
          ["final", "Final Results", "Final Enhanced Clustering Results"]
        ].map(([id, label, title], index, tabs) => <button key={id} id={`study-tab-${id}`} type="button" role="tab"
          aria-selected={activeTab === id} aria-controls={`study-panel-${id}`} tabIndex={activeTab === id ? 0 : -1}
          onClick={() => setActiveTab(id)} onKeyDown={event => {
            const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null;
            if (next !== null) { event.preventDefault(); setActiveTab(tabs[next][0]); document.getElementById(`study-tab-${tabs[next][0]}`)?.focus(); }
          }}><span>{label}</span><strong>{title}</strong></button>)}
      </div>
      <div id={`study-panel-${activeTab}`} role="tabpanel" aria-labelledby={`study-tab-${activeTab}`} tabIndex={0} className="study-tab-content space-y-6">
      {activeTab === "sop1" && <Panel title="SOP 1 · Feature Representation" variant="surface">
        <p className="section-subtitle mb-4">How each method represents the input feature space before clustering.</p>
        <SopComparison simulation figures standard={<MethodCard simulation title="Original Feature Representation">
          <p className="simulation-compact-note">{run.preprocessing.retainedFeatures.length} standardized input variables</p>
          {studyEvidence ? <CorrelationHeatmap correlation={studyEvidence.correlation} compact showKey={false} /> : <p className="text-sm text-muted">{sopError ?? "Loading validated correlation matrix…"}</p>}
          <VariableChips variables={run.preprocessing.retainedFeatures} />
        </MethodCard>} enhanced={<MethodCard simulation title="Principal Component Analysis" enhanced>
          <p className="simulation-compact-note">{run.preprocessing.retainedFeatures.length} variables → {run.pca.components} PCs · Cumulative variance = {variance}</p>
          <PcaChart enhanced={{ pcaComponents: run.pca.components, cumulativeExplainedVariance: run.pca.cumulativeExplainedVariance, pcaVariance: run.pca.scree.map(row => ({ component: row.component, cumulativeExplainedVariance: row.cumulativeVariance })) }} />
          <dl className="simulation-detail-list sop-summary"><div><dt>Input variables</dt><dd>{run.preprocessing.retainedFeatures.length}</dd></div><div><dt>Components retained</dt><dd>{run.pca.components}</dd></div><div><dt>Cumulative variance</dt><dd>{variance}</dd></div><div><dt>Variance threshold</dt><dd>≥ 85%</dd></div></dl>
        </MethodCard>}>
          <VarianceSummary rows={run.pca.scree} retained={run.pca.components} />
          <PcaContribution dimensions={run.preprocessing.retainedFeatures.length} components={run.pca.components}
            n={ablation?.settings.cohortN ?? run.cohort.parentN} k={ablation?.settings.k}
            calculations={defenseGeometry ? { existing: studyEvidence?.calculations?.standard, enhanced: studyEvidence?.calculations?.pca } : undefined}
            runCount={ablation?.settings.seeds.length}
            existing={ablation ? Object.fromEntries(metricDefinitions.map(({ key }) => [key, ablation.conditions[0].metrics[key].mean])) : undefined}
            enhanced={ablation ? Object.fromEntries(metricDefinitions.map(({ key }) => [key, ablation.conditions[1].metrics[key].mean])) : undefined}
            relativeChange={ablation ? Object.fromEntries(metricDefinitions.map(({ key }) => [key, ablation.metricChanges[key].relativeMeanChangePercent])) : undefined}
            note={ablation ? `Held constant: k = ${ablation.settings.k}, Lloyd algorithm, random initialization, ${ablation.settings.seeds.length} seeds, n = ${ablation.settings.cohortN.toLocaleString()}.` : sopError ?? "Loading validated PCA contribution…"} />
        </SopComparison>
      </Panel>}
      {activeTab === "sop2" && <Panel title="SOP 2 · Cluster Number Selection" variant="surface">
        <p className="section-subtitle mb-4">How each method determines the number of clusters (k).</p>
        <SopComparison simulation figures standard={<MethodCard simulation title="Silhouette-Based Selection">
          <p className="simulation-compact-note">Single-index criterion · k with highest average Silhouette selected</p>
          <dl className="simulation-detail-list"><div><dt>Selection method</dt><dd>Silhouette Coefficient</dd></div><div><dt>Candidate k</dt><dd>{candidateRange}</dd></div><div><dt>Selected k</dt><dd>{baseline.selectedK}</dd></div></dl><h3 className="card-title">Silhouette by k</h3>
          {baselineSweep ? <SilhouetteChart candidates={baselineSweep.candidates} /> : <p className="text-sm text-muted">{sopError ?? "Loading validated baseline sweep…"}</p>}
        </MethodCard>} enhanced={<MethodCard simulation title="NbClust Multi-Index Selection" enhanced>
          <p className="simulation-compact-note">Usable indices evaluated · highest vote count determines k</p>
          <dl className="simulation-detail-list"><div><dt>Usable indices</dt><dd>{run.kSelection.usableVotes}</dd></div><div><dt>Selected k</dt><dd>{run.kSelection.selectedK}</dd></div><div><dt>Votes for k = {run.kSelection.selectedK}</dt><dd>{run.kSelection.votesForSelectedK} / {run.kSelection.usableVotes}</dd></div></dl>
          <NbClustChart selectedK={run.kSelection.selectedK} votes={run.kSelection.candidateK.map(k => ({ k, count: run.kSelection.voteDistribution.find(row => row.k === k)?.votes }))} usableIndices={run.kSelection.usableVotes} supportingIndices={run.kSelection.votesForSelectedK} />
          <NbClustIndexDetails indices={run.kSelection.indexResults} />
          {run.kSelection.candidateK.some(k => !run.kSelection.voteDistribution.some(row => row.k === k)) && <p className="simulation-compact-note">Missing vote counts are unavailable, not zero.</p>}
        </MethodCard>} />
      </Panel>}
      {activeTab === "sop3" && <Panel title="Initialization & Reproducibility" variant="surface">
        <InitializationComparison randomRuns={studyEvidence?.ariBySeed} dpcRuns={defenseGeometry ? studyEvidence?.dpcAriByRun : undefined}
          dpcUnavailable={dpcUnavailable}
          randomUnavailable={sopError ?? "Loading validated initialization comparison..."}
          selectedCenters={run.initialization.selectedCentroids.length}
          centerTable={<DpcCenterTable centers={run.initialization.selectedCentroids.map(center => ({ ...center, center: center.rank,
            rid: defenseGeometry ? studyEvidence?.dpcCenters?.find(row => row.center === center.rank && row.rho === center.rho &&
              Math.abs(row.delta - center.delta) < 1e-9 && Math.abs(row.gamma - center.gamma) < 1e-9)?.rid : undefined }))} />} />
      </Panel>}
      {activeTab === "final" && <>
      <Panel title="Standard vs Enhanced Comparison" variant="surface">
        <h3 className="card-title mb-4">Scatter Plot Comparison (PCA Space)</h3>
        <div className="study-method-grid">
          <MethodCard title="Standard K-Means">
            <StudyProjection panel={defenseGeometry?.sop1.baseline} label="Standard K-Means" />
          </MethodCard>
          <MethodCard title="Enhanced K-Means" enhanced>
            <StudyProjection panel={defenseGeometry?.sop3.dpc[0]} label="Enhanced K-Means" />
          </MethodCard>
        </div>
        <p className="mt-4 text-xs text-muted">PC1 and PC2 are visualization only. Both plots use the same axes; diamonds mark projected cluster means. Cluster labels are method-specific. Standard plot: seed {defenseGeometry?.sop1.seed ?? "—"}.</p>
        <section className="mt-6 border-t border-line pt-5" aria-label="Internal Validation">
          <h3 className="card-title mb-4">Internal Validation</h3>
          <MetricComparisonTable existing={existing} enhanced={enhanced} relativeChange={relativeChange} />
          <p className="mt-3 text-xs text-muted">Standard: mean of {baseline.runCount} random-initialization runs. Enhanced: validated deterministic result. Relative metric change, not statistical significance.</p>
          <InternalValidationCalculationDetails standard={{ n: run.cohort.parentN, k: baseline.selectedK, metrics: existing, runCount: baseline.runCount, calculation: defenseGeometry ? studyEvidence?.calculations?.standard : undefined }} enhanced={{ n: run.cohort.parentN, k: run.kSelection.selectedK,
            metrics: enhanced, calculation: defenseGeometry ? studyEvidence?.calculations?.enhanced : undefined }} />
        </section>
      </Panel>

      <Panel title="Cluster Distribution" variant="surface">
        <div className="study-method-grid">
          {defenseGeometry ? <ClusterDistribution title={`Standard K-Means - Seed ${defenseGeometry.sop1.seed}`} participants={run.cohort.parentN}
            sizes={[0, 1].map(cluster => defenseGeometry.sop1.baseline.observations.filter(point => point.cluster === cluster).length)} />
            : <p className="text-sm text-muted">{sopError ?? "Loading validated Standard cluster distribution..."}</p>}
          <ClusterDistribution title="Enhanced K-Means" participants={run.cohort.parentN}
            sizes={[...run.enhancedClustering.clusterSizes].sort((a, b) => a.clusterId - b.clusterId).map(cluster => cluster.nMembers)} />
        </div>
      </Panel>
      <Panel title="Final Cluster Profiles" variant="surface">
        <div className="overflow-x-auto" role="region" aria-label="Final cluster profile table" tabIndex={0}>
          <table className="research-table min-w-[560px]">
            <caption className="pb-4 text-left text-sm text-muted">Aggregate means · {run.clusterProfiles.scale}</caption>
            <thead><tr><th scope="col">Measure</th><th scope="col" className="text-right">Cluster 0 mean</th><th scope="col" className="text-right">Cluster 1 mean</th><th scope="col" className="text-right">SMD (1 − 0)</th></tr></thead>
            <tbody>{run.clusterProfiles.smdRanking.map((row) => <tr key={row.variable}>
              <th scope="row" className="text-left">{getMeasureLabel(row.variable)}</th>
              <td className="text-right tabular-nums">{profiles.get(0)?.variableMeans[row.variable]?.toFixed(5) ?? "—"}</td>
              <td className="text-right tabular-nums">{profiles.get(1)?.variableMeans[row.variable]?.toFixed(5) ?? "—"}</td>
              <td className="text-right tabular-nums">{row.standardizedMeanDifferenceCluster1Minus0.toFixed(5)}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted">SMD: standardized mean difference, Cluster 1 minus Cluster 0. Profiles describe groups, not clinical diagnoses.</p>
      </Panel>
      <Panel title="ADAS-Cog13 Longitudinal Progression" variant="surface">
        <p className="mb-4 text-sm text-muted">ADAS-Cog13: higher score = greater impairment. Original cluster assignments remain fixed.</p>
        <ProgressionChart data={run.longitudinal.timeSeries} />
        <p className="mt-2 text-xs text-muted">Observed means by elapsed-year bin; bars describe available observations, not fitted model predictions.</p>
      </Panel>
      <Panel title="Linear Mixed-Effects Model (LME)" variant="surface">
        <p className="mb-4 text-xs text-muted">{model.participantCount.toLocaleString()} eligible participants · {model.observationCount.toLocaleString()} observations · {model.estimationMethod}</p>
        <dl className="grid gap-5 sm:grid-cols-2">
          {model.estimatedAnnualChangeByOriginalCluster.map((entry) =>
            <Fact key={entry.clusterId} label={`Cluster ${entry.clusterId} · ${entry.clusterId === 0 ? "lower" : "higher"} impairment · ADAS-Cog13 points/year`} value={entry.estimate.toFixed(6)} />)}
        </dl>
        <div className="mt-5 overflow-x-auto" role="region" aria-label="LME results table" tabIndex={0}><table className="research-table min-w-[560px]">
          <thead><tr><th>Time × Cluster</th><th>Estimate</th><th>95% CI</th><th>p-value</th></tr></thead>
          <tbody><tr><td>Difference in annual change (Cluster 1 − Cluster 0)</td><td className="tabular-nums">{result.estimate.toFixed(6)}</td>
            <td className="whitespace-nowrap tabular-nums">{result.confidenceInterval95.lower.toFixed(6)} to {result.confidenceInterval95.upper.toFixed(6)}</td>
            <td>{result.pValue < 0.001 ? "<0.001" : result.pValue.toFixed(3)}</td></tr></tbody>
        </table></div>
      </Panel>
      </>}
      </div>
    </div>
    <ResearchPageNavigation currentPath="/study-findings" />
  </div>;
});
