import { NbClustComparison } from "../components/NbClustComparison";
import { formatContinuous, formatPercent, formatInteger } from "../utils/numberFormatting";
import { PcaChart, SilhouetteChart } from "../components/SopFigures";
import { DpcCenterTable } from "../components/DpcCenterTable";
import { InitializationComparison } from "../components/InitializationComparison";
import { memo, useState } from "react";
import { CorrelationHeatmap } from "../components/charts/FinalFindingsCharts";
import { LongitudinalProgressionChart } from "../components/charts/LongitudinalProgressionChart";
import { MetricComparisonTable, metricDefinitions } from "../components/MetricComparisonTable";
import { InternalValidationCalculationDetails } from "../components/InternalValidationCalculationDetails";
import { Panel } from "../components/ui/Panel";
import { ResearchPageNavigation } from "../components/layout/ResearchPageNavigation";
import { Check, CheckCircle2, Database, Network } from "lucide-react";
import { Link } from "react-router-dom";
import { StudyEvidenceSchema, type UnifiedResearchRun, type UploadResponse } from "../../../../packages/shared/src/schema";
import type { AnalysisRunState } from "../hooks/useStudyFindings";
import { isDatasetReady } from "../utils/validatedDataset";
import { useSopEvaluation } from "../hooks/useSopEvaluation";
import { PartitionProjection } from "../components/charts/PartitionProjection";
import type { DefensePanel } from "../../../../packages/shared/src/schema";
import "./StudyFindingsPage.css";
import { PageHeading } from "./PageHeading";
import { MethodCard, SopComparison, VariableChips, VarianceSummary, PcaContribution, ClusterDistribution } from "../components/SopComparison";
import { getMeasureLabel } from "../utils/measureLabels";
import { StandardRunProgress } from "../components/StandardRunProgress";
import { EnhancedRunProgress } from "../components/StudyRunProgressCard";
import { PcaLoadingMatrix } from "../components/PcaLoadingMatrix";
import { readPcaLoadings } from "../utils/pcaLoadings";

// Loading initialization evidence should not rerender the retained charts.
const ProgressionChart = memo(LongitudinalProgressionChart);

const StudyProjection = ({ panel, label }: { panel?: DefensePanel; label: string }) => panel
  ? <PartitionProjection label={label} points={panel.observations.map(point => ({ x: point.pc1, y: point.pc2, cluster: point.cluster }))}
      centers={panel.markers.filter(marker => marker.type === "final").map(marker => ({ x: marker.pc1, y: marker.pc2, cluster: marker.cluster }))} />
  : <p className="text-sm text-muted">Validated projection unavailable.</p>;

const Fact = ({ label, value }: { label: string; value: string | number }) => <div>
  <dt className="text-xs text-muted">{label}</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">{value}</dd>
</div>;

const RunBadge = ({ status }: { status: string }) => <span className={`research-badge ${["completed", "running"].includes(status) ? "is-valid" : ""}`}>
  {status === "completed" ? "✓ Completed" : status === "error" ? "Error" : status[0].toUpperCase() + status.slice(1)}
</span>;

export const StudyFindingsPage = ({ analysis, dataset }: { analysis: AnalysisRunState; dataset: UploadResponse | null }) => {
  const ready = isDatasetReady(dataset);
  const standard = analysis.standard;
  const enhanced = analysis.enhanced;
  const comparison = standard.status === "completed" && enhanced.status === "completed" && enhanced.run !== null;
  const started = standard.status !== "idle";
  // Before a result exists, the shared frozen-study contract supplies its cohort
  // metadata. Once completed, always display the returned result's count.
  const cohort = standard.run?.cohort.parentN ?? (ready || started ? StudyEvidenceSchema.innerType().shape.cohortN.value : undefined);
  return <div className="research-page study-findings">
    <PageHeading title="Study Findings" description={cohort ? `Validated full-cohort analysis · n = ${formatInteger(cohort)}` : ready || started ? "Validated full-cohort analysis" : "Validate datasets to begin the study analysis."} />
    {!started ? <Panel title={ready ? "Ready to run analysis" : "Datasets required"} variant="surface" className="study-ready-card">
      <div className="study-readiness">
        <div className="flex min-w-0 items-start gap-3">
          <span className="research-status-icon" aria-hidden="true">{ready ? <CheckCircle2 size={18} /> : <Database size={18} />}</span>
          <div><p className="font-semibold">{ready ? "7 of 7 datasets validated" : "Validate all seven required datasets"}</p>
            <p className="mt-1 text-sm text-muted">{ready ? "Run Standard K-Means to begin the study analysis." : "Select and validate the CSV exports in Dataset Setup."}</p></div>
        </div>
        {ready ? <button type="button" className="research-primary-button" onClick={() => void analysis.start()}>Run Standard K-Means</button>
          : <Link className="research-primary-button" to="/dataset-setup">Go to Dataset Setup</Link>}
      </div>
    </Panel> : standard.status === "running" ? <StandardRunProgress status={analysis.status} stage={analysis.stage} /> : <>
      {standard.status === "completed" && enhanced.status === "running" ? <EnhancedRunProgress /> : <section className={`study-runs${comparison ? " is-completed" : ""}`} aria-label="Analysis Runs">
        <strong>Analysis Runs</strong>
        <div className="study-run-state">
          {comparison && <span className="research-status-icon study-method-icon" aria-hidden="true"><Network size={20} /></span>}
          <div className="study-run-details"><span>Standard K-Means</span><RunBadge status={standard.status} /></div>
        </div>
        <div className="study-run-state">
          {comparison && <span className="research-status-icon study-method-icon" aria-hidden="true"><Network size={20} /></span>}
          <div className="study-run-details"><span>Enhanced K-Means</span><RunBadge status={enhanced.status} /></div>
        </div>
        <div className="study-run-action">
          {comparison ? <span className="study-comparison-ready"><span aria-hidden="true"><Check size={19} strokeWidth={2.5} /></span>Comparison Ready</span> : standard.status === "completed" && ["ready", "error"].includes(enhanced.status)
            ? <button type="button" className="research-primary-button" onClick={() => void analysis.startEnhanced()}>{enhanced.status === "error" ? "Retry Enhanced K-Means" : "Run Enhanced K-Means"}</button>
            : standard.status === "error" && (ready || analysis.jobId) ? <button type="button" className="research-primary-button" onClick={() => void analysis.resume()}>Retry Standard K-Means</button> : null}
        </div>
        {comparison && <div className="study-completion-message" role="status">
          <span className="research-status-icon" aria-hidden="true"><Check size={18} strokeWidth={2.5} /></span>
          <div><p className="font-semibold">Both analyses completed successfully.</p><p className="mt-1 text-xs text-muted">Comparative Study Findings are now available below.</p></div>
        </div>}
        <span className="sr-only" role="status">{analysis.locked ? `Standard analysis ${analysis.stage?.replace(/_/g, " ") ?? analysis.status}` : enhanced.status === "running" ? "Loading and verifying Enhanced K-Means results" : comparison ? "Comparison ready" : standard.status === "error" ? "Standard analysis failed" : "Standard results ready"}</span>
      </section>}
      {(analysis.error || enhanced.error) && <p role="alert" className="study-run-error text-sm text-red-700">{analysis.error || enhanced.error}</p>}
      {analysis.error && <Link to="/dataset-setup" className="research-text-action mt-2 inline-block">Review datasets</Link>}
      {standard.run && <StudyResults run={enhanced.run ?? standard.run} standardRun={standard.run} comparison={comparison} />}
    </>}
  </div>;
};

const StudyResults = memo(function StudyResults({ run, standardRun, comparison }: { run: UnifiedResearchRun; standardRun: UnifiedResearchRun; comparison: boolean }) {
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
  const pcaLoadings = readPcaLoadings(run.pca, run.preprocessing.retainedFeatures, run.pca.components);
  const existing = Object.fromEntries(standardRun.baselineComparison.metrics.map((metric) => [metric.metric, metric.baselineValue]));
  const enhanced = Object.fromEntries(metricDefinitions.map(({ key, field }) => [key, run.enhancedClustering.metrics[field]]));
  const baseline = standardRun.baselineComparison.baselineMethod;
  const relativeChange = Object.fromEntries(run.baselineComparison.metrics.map(metric => [metric.metric, metric.signedRelativeChangePercent]));
  const candidates = baselineSweep?.candidates.map(candidate => candidate.k) ?? standardRun.kSelection.candidateK;
  const candidateRange = `${candidates[0]}–${candidates.at(-1)}`;
  const variance = formatPercent(run.pca.cumulativeExplainedVariance * 100);
  const profiles = new Map(run.clusterProfiles.profiles.map((profile) => [profile.clusterId, profile]));
  const model = run.longitudinal.mixedEffects;
  const result = model.primaryResult;

  return <div className={comparison ? "study-results" : "study-results study-standard-results"}>
    {!comparison && <header className="study-result-heading"><div><h2 className="text-base font-semibold">Standard K-Means Results</h2><p className="mt-1 text-sm text-muted">Full validated cohort · n = {formatInteger(standardRun.cohort.parentN)}</p></div><span className="research-badge is-valid">Completed</span></header>}
    <div className="study-results-sections">
      {comparison && <Panel title="Method Comparison Overview" variant="surface" className="study-overview-card" action={<span className="research-badge is-valid">Validated Study Results</span>}>
        <p className="study-cohort text-sm text-muted">Full validated cohort · n = {formatInteger(run.cohort.parentN)}</p>
        <div className="overflow-x-auto"><table className="research-table study-overview">
          <thead><tr><th scope="col"><span className="sr-only">Methodology</span></th><th scope="col">Standard K-Means</th><th scope="col">Enhanced K-Means</th></tr></thead>
          <tbody>
            <tr><th scope="row">Feature representation</th><td>{standardRun.preprocessing.retainedFeatures.length} standardized variables</td><td>PCA · {run.pca.components} PCs · {variance} var.</td></tr>
            <tr><th scope="row">Cluster-number selection</th><td>Maximum Silhouette (k = {candidateRange})</td><td>NbClust multi-index · {run.kSelection.usableVotes} indices</td></tr>
            <tr><th scope="row">Selected k</th><td>{baseline.selectedK}</td><td>{run.kSelection.selectedK}</td></tr>
            <tr><th scope="row">Initialization</th><td>Random ({baseline.runCount} runs)</td><td>DPC {run.initialization.deterministic ? "deterministic" : ""}</td></tr>
          </tbody>
        </table></div>
      </Panel>}
      <div className="study-sop-tabs" role="tablist" aria-label="Study findings sections">
        {[
          ["sop1", "SOP 1", "Feature Representation"],
          ["sop2", "SOP 2", "Cluster Number Selection"],
          ["sop3", "SOP 3", "Initialization & Reproducibility"],
          ["final", "Final Results", comparison ? "Final Enhanced Clustering Results" : "Standard Clustering Results"]
        ].map(([id, label, title], index, tabs) => <button key={id} id={`study-tab-${id}`} type="button" role="tab"
          aria-selected={activeTab === id} aria-controls={`study-panel-${id}`} tabIndex={activeTab === id ? 0 : -1}
          onClick={() => setActiveTab(id)} onKeyDown={event => {
            const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null;
            if (next !== null) { event.preventDefault(); setActiveTab(tabs[next][0]); document.getElementById(`study-tab-${tabs[next][0]}`)?.focus(); }
          }}><span>{label}</span><strong>{title}</strong></button>)}
      </div>
      <div id={`study-panel-${activeTab}`} role="tabpanel" aria-labelledby={`study-tab-${activeTab}`} tabIndex={0} className="study-tab-content space-y-6">
      {activeTab === "sop1" && <Panel title="SOP 1 · Feature Representation" variant="surface">
        <p className="section-subtitle mb-4">How the input feature space is represented before clustering.</p>
        <SopComparison standardOnly={!comparison} simulation figures standard={<MethodCard simulation title="Original Feature Representation">
          <p className="simulation-compact-note">{standardRun.preprocessing.retainedFeatures.length} standardized input variables</p>
          {studyEvidence ? <CorrelationHeatmap correlation={studyEvidence.correlation} compact showKey={false} /> : <p className="text-sm text-muted">{sopError ?? "Loading validated correlation matrix…"}</p>}
          <VariableChips variables={standardRun.preprocessing.retainedFeatures} />
        </MethodCard>} enhanced={<MethodCard simulation title="Principal Component Analysis" enhanced>
          <p className="simulation-compact-note">{run.preprocessing.retainedFeatures.length} variables → {run.pca.components} PCs · Cumulative variance = {variance}</p>
          <PcaChart showAllComponents enhanced={{ pcaComponents: run.pca.components, cumulativeExplainedVariance: run.pca.cumulativeExplainedVariance, pcaVariance: run.pca.scree.map(row => ({ component: row.component, cumulativeExplainedVariance: row.cumulativeVariance })) }} />
          <dl className="simulation-detail-list sop-summary"><div><dt>Input variables</dt><dd>{run.preprocessing.retainedFeatures.length}</dd></div><div><dt>Components retained</dt><dd>{run.pca.components}</dd></div><div><dt>Cumulative variance</dt><dd>{variance}</dd></div><div><dt>Variance threshold</dt><dd>≥ 85.00%</dd></div></dl>
        </MethodCard>}>
          <VarianceSummary rows={run.pca.scree} retained={run.pca.components} loadingData={pcaLoadings} />
          <PcaLoadingMatrix variables={pcaLoadings?.variables ?? run.preprocessing.retainedFeatures}
            components={Array.from({ length: run.pca.components }, (_, index) => `PC${index + 1}`)} values={pcaLoadings?.values} />
          <PcaContribution dimensions={run.preprocessing.retainedFeatures.length} components={run.pca.components}
            n={ablation?.settings.cohortN ?? run.cohort.parentN} k={ablation?.settings.k}
            calculations={defenseGeometry ? { existing: studyEvidence?.calculations?.standard, enhanced: studyEvidence?.calculations?.pca } : undefined}
            runCount={ablation?.settings.seeds.length}
            existing={ablation ? Object.fromEntries(metricDefinitions.map(({ key }) => [key, ablation.conditions[0].metrics[key].mean])) : undefined}
            enhanced={ablation ? Object.fromEntries(metricDefinitions.map(({ key }) => [key, ablation.conditions[1].metrics[key].mean])) : undefined}
            relativeChange={ablation ? Object.fromEntries(metricDefinitions.map(({ key }) => [key, ablation.metricChanges[key].relativeMeanChangePercent])) : undefined}
            note={ablation ? `Held constant: k = ${ablation.settings.k}, Lloyd algorithm, random initialization, ${ablation.settings.seeds.length} seeds, n = ${formatInteger(ablation.settings.cohortN)}.` : sopError ?? "Loading validated PCA contribution…"} />
        </SopComparison>
      </Panel>}
      {activeTab === "sop2" && <Panel title="SOP 2 · Cluster Number Selection" variant="surface">
        <p className="section-subtitle mb-4">How each method determines the number of clusters (k).</p>
        <NbClustComparison standardOnly={!comparison} standard={<MethodCard simulation title="Silhouette-Based Selection">
          <p className="simulation-compact-note">Single-index criterion · k with highest average Silhouette selected</p>
          <dl className="simulation-detail-list"><div><dt>Selection method</dt><dd>Silhouette Coefficient</dd></div><div><dt>Candidate k</dt><dd>{candidateRange}</dd></div><div><dt>Selected k</dt><dd>{baseline.selectedK}</dd></div></dl><h3 className="card-title">Silhouette by k</h3>
          {baselineSweep ? <SilhouetteChart candidates={baselineSweep.candidates} /> : <p className="text-sm text-muted">{sopError ?? "Loading validated baseline sweep…"}</p>}
        </MethodCard>} candidateK={run.kSelection.candidateK} selectedK={run.kSelection.selectedK}
          usableIndices={run.kSelection.usableVotes} votes={run.kSelection.voteDistribution.map(row => ({ k: row.k, count: row.votes }))}
          indices={run.kSelection.indexResults} />
      </Panel>}
      {activeTab === "sop3" && <Panel title="Initialization & Reproducibility" variant="surface">
        <InitializationComparison standardOnly={!comparison} randomRuns={studyEvidence?.ariBySeed} dpcRuns={defenseGeometry ? studyEvidence?.dpcAriByRun : undefined}
          dpcUnavailable={dpcUnavailable}
          randomUnavailable={sopError ?? "Loading validated initialization comparison..."}
          selectedCenters={run.initialization.selectedCentroids.length}
          centerTable={<DpcCenterTable centers={run.initialization.selectedCentroids.map(center => ({ ...center, center: center.rank,
            rid: defenseGeometry ? studyEvidence?.dpcCenters?.find(row => row.center === center.rank && row.rho === center.rho &&
              Math.abs(row.delta - center.delta) < 1e-9 && Math.abs(row.gamma - center.gamma) < 1e-9)?.rid : undefined }))} />} />
      </Panel>}
      {activeTab === "final" && <>
      <Panel title={comparison ? "Standard vs Enhanced Comparison" : "Standard Clustering Results"} variant="surface">
        <h3 className="card-title mb-4">{comparison ? "Scatter Plot Comparison (PCA Space)" : "Standard Clustering (PCA Space)"}</h3>
        <div className={comparison ? "study-method-grid" : "study-single-method"}>
          <MethodCard title="Standard K-Means">
            <StudyProjection panel={defenseGeometry?.sop1.baseline} label="Standard K-Means" />
          </MethodCard>
          {comparison && <MethodCard title="Enhanced K-Means" enhanced>
            <StudyProjection panel={defenseGeometry?.sop3.dpc[0]} label="Enhanced K-Means" />
          </MethodCard>}
        </div>
        <p className="mt-4 text-xs text-muted">PC1 and PC2 are visualization only. Diamonds mark projected cluster means. Cluster labels are method-specific. Standard plot: seed {defenseGeometry?.sop1.seed ?? "—"}.</p>
        <section className="mt-6 border-t border-line pt-5" aria-label="Internal Validation">
          <MetricComparisonTable standardOnly={!comparison} existing={existing} enhanced={enhanced} relativeChange={relativeChange}
            footerNote={`Standard: mean of ${baseline.runCount} random-initialization runs.${comparison ? " Enhanced: validated deterministic result. Relative metric change, not statistical significance." : ""}`} />
          {comparison && <InternalValidationCalculationDetails standard={{ n: run.cohort.parentN, k: baseline.selectedK, metrics: existing, runCount: baseline.runCount, calculation: defenseGeometry ? studyEvidence?.calculations?.standard : undefined }} enhanced={{ n: run.cohort.parentN, k: run.kSelection.selectedK,
            metrics: enhanced, calculation: defenseGeometry ? studyEvidence?.calculations?.enhanced : undefined }} />}
        </section>
      </Panel>

      <Panel title="Cluster Distribution" variant="surface">
        <div className={comparison ? "study-method-grid" : "study-single-method"}>
          {defenseGeometry ? <ClusterDistribution title={`Standard K-Means - Seed ${defenseGeometry.sop1.seed}`} participants={run.cohort.parentN}
            sizes={[0, 1].map(cluster => defenseGeometry.sop1.baseline.observations.filter(point => point.cluster === cluster).length)} />
            : <p className="text-sm text-muted">{sopError ?? "Loading validated Standard cluster distribution..."}</p>}
          {comparison && <ClusterDistribution title="Enhanced K-Means" participants={run.cohort.parentN}
            sizes={[...run.enhancedClustering.clusterSizes].sort((a, b) => a.clusterId - b.clusterId).map(cluster => cluster.nMembers)} />}
        </div>
      </Panel>
      {comparison && <><Panel title="Final Cluster Profiles" variant="surface">
        <div className="overflow-x-auto" role="region" aria-label="Final cluster profile table" tabIndex={0}>
          <table className="research-table min-w-[560px]">
            <caption className="pb-4 text-left text-sm text-muted">Aggregate means · {run.clusterProfiles.scale}</caption>
            <thead><tr><th scope="col">Measure</th><th scope="col" className="text-right">Cluster 0 mean</th><th scope="col" className="text-right">Cluster 1 mean</th><th scope="col" className="text-right">SMD (1 − 0)</th></tr></thead>
            <tbody>{run.clusterProfiles.smdRanking.map((row) => <tr key={row.variable}>
              <th scope="row" className="text-left">{getMeasureLabel(row.variable)}</th>
              <td className="text-right tabular-nums">{formatContinuous(profiles.get(0)?.variableMeans[row.variable])}</td>
              <td className="text-right tabular-nums">{formatContinuous(profiles.get(1)?.variableMeans[row.variable])}</td>
              <td className="text-right tabular-nums">{formatContinuous(row.standardizedMeanDifferenceCluster1Minus0)}</td>
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
        <p className="mb-4 text-xs text-muted">{formatInteger(model.participantCount)} eligible participants · {formatInteger(model.observationCount)} observations · {model.estimationMethod}</p>
        <dl className="grid gap-5 sm:grid-cols-2">
          {model.estimatedAnnualChangeByOriginalCluster.map((entry) =>
            <Fact key={entry.clusterId} label={`Cluster ${entry.clusterId} · ${entry.clusterId === 0 ? "lower" : "higher"} impairment · ADAS-Cog13 points/year`} value={formatContinuous(entry.estimate)} />)}
        </dl>
        <div className="mt-5 overflow-x-auto" role="region" aria-label="LME results table" tabIndex={0}><table className="research-table min-w-[560px]">
          <thead><tr><th>Time × Cluster</th><th>Estimate</th><th>95% CI</th><th>p-value</th></tr></thead>
          <tbody><tr><td>Difference in annual change (Cluster 1 − Cluster 0)</td><td className="tabular-nums">{formatContinuous(result.estimate)}</td>
            <td className="whitespace-nowrap tabular-nums">{formatContinuous(result.confidenceInterval95.lower)} to {formatContinuous(result.confidenceInterval95.upper)}</td>
            <td>{result.pValue < 0.001 ? "<0.001000" : formatContinuous(result.pValue)}</td></tr></tbody>
        </table></div>
      </Panel></>}
      </>}
      </div>
    </div>
    <ResearchPageNavigation currentPath="/study-findings" />
  </div>;
});
