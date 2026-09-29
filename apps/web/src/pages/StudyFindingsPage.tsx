import { memo, type ReactNode } from "react";
import { PcaVarianceFigure, NbClustVotesFigure, CorrelationHeatmap, SilhouetteByKFigure, AriBySeedFigure } from "../components/charts/FinalFindingsCharts";
import { LongitudinalProgressionChart } from "../components/charts/LongitudinalProgressionChart";
import { MetricComparisonTable, metricDefinitions } from "../components/MetricComparisonTable";
import { Panel } from "../components/ui/Panel";
import { ResearchPageNavigation } from "../components/layout/ResearchPageNavigation";
import { CheckCircle2, Database, Loader2, Play } from "lucide-react";
import { Link } from "react-router-dom";
import type { UnifiedResearchRun, UploadResponse } from "../../../../packages/shared/src/schema";
import type { AnalysisRunState } from "../hooks/useStudyFindings";
import { isDatasetReady } from "../utils/validatedDataset";
import { useSopEvaluation } from "../hooks/useSopEvaluation";
import { DefenseScatter } from "../components/charts/DefenseScatter";
import "./StudyFindingsPage.css";
import { PageHeading } from "./PageHeading";
import { getMeasureLabel } from "../utils/measureLabels";

// Loading initialization evidence should not rerender the retained charts.
const PcaChart = memo(PcaVarianceFigure);
const VotesChart = memo(NbClustVotesFigure);
const ProgressionChart = memo(LongitudinalProgressionChart);

const MethodCard = ({ title, enhanced = false, children }: { title: string; enhanced?: boolean; children: ReactNode }) =>
  <section className={`study-method-card ${enhanced ? "is-enhanced" : ""}`}>
    <span className={`research-badge ${enhanced ? "is-valid" : ""}`}>{enhanced ? "Enhanced K-Means" : "Existing K-Means"}</span>
    <h3 className="mb-3 mt-3 text-base font-semibold">{title}</h3>
    {children}
  </section>;

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
  const { evaluation, baselineSweep, studyEvidence, defenseGeometry, error: sopError } = useSopEvaluation(run);
  const existing = Object.fromEntries(run.baselineComparison.metrics.map((metric) => [metric.metric, metric.baselineValue]));
  const enhanced = Object.fromEntries(metricDefinitions.map(({ key, field }) => [key, run.enhancedClustering.metrics[field]]));
  const sop3 = evaluation?.sop3;
  const matches = studyEvidence?.ariBySeed.filter(row => row.adjustedRandIndex === 1).length;
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
          <thead><tr><th scope="col">Methodology</th><th scope="col">Existing K-Means</th><th scope="col">Enhanced K-Means</th></tr></thead>
          <tbody>
            <tr><th scope="row">Feature representation</th><td>{run.preprocessing.retainedFeatures.length} standardized retained variables</td><td>PCA · {run.pca.components} PCs · {variance}</td></tr>
            <tr><th scope="row">Cluster-number selection</th><td>Maximum Silhouette, k = {candidateRange}</td><td>NbClust multi-index voting</td></tr>
            <tr><th scope="row">Selected k</th><td>{baseline.selectedK}</td><td>{run.kSelection.selectedK}</td></tr>
            <tr><th scope="row">Initialization</th><td>Random</td><td>DPC {run.initialization.deterministic ? "deterministic" : ""}</td></tr>
          </tbody>
        </table></div>
      </Panel>
      <Panel title="SOP 1 — Feature Representation" variant="surface">
        <div className="study-method-grid">
          <MethodCard title="Original Feature Representation">
            <p className="mb-4 text-xs text-muted">{run.preprocessing.retainedFeatures.length} retained standardized variables · pre-PCA correlation</p>
            {studyEvidence ? <CorrelationHeatmap correlation={studyEvidence.correlation} compact /> : <p className="text-sm text-muted">{sopError ?? "Loading validated correlation matrix…"}</p>}
          </MethodCard>
          <MethodCard title="Principal Component Analysis" enhanced>
            <p className="mb-4 text-xs text-muted">{run.preprocessing.retainedFeatures.length} variables → {run.pca.components} PCs · {variance} cumulative explained variance</p>
            <PcaChart run={run} compact />
            <dl className="mt-5 grid gap-4 border-t border-line pt-4 sm:grid-cols-3">
              <Fact label="PCs retained" value={run.pca.components} />
              <Fact label="Cumulative variance" value={variance} />
              <Fact label="Threshold" value="85%" />
            </dl>
          </MethodCard>
        </div>
      </Panel>
      <Panel title="SOP 2 — Cluster Number Selection" variant="surface">
        <div className="study-method-grid">
          <MethodCard title="Silhouette by k">
            <dl className="mb-5 grid grid-cols-2 gap-5">
              <Fact label="Selected k" value={baseline.selectedK} />
              <Fact label="Candidate range" value={candidateRange} />
            </dl>
            {baselineSweep ? <SilhouetteByKFigure sweep={baselineSweep} /> : <p className="text-sm text-muted">{sopError ?? "Loading validated baseline sweep…"}</p>}
          </MethodCard>
          <MethodCard title="NbClust Selection" enhanced>
            <dl className="mb-5 grid grid-cols-2 gap-5">
              <Fact label="Selected k" value={run.kSelection.selectedK} />
              <Fact label="Supporting / usable indices" value={`${run.kSelection.votesForSelectedK} / ${run.kSelection.usableVotes}`} />
            </dl>
            <VotesChart selection={run.kSelection} />
          </MethodCard>
        </div>
      </Panel>
      <Panel title="SOP 3 — Initialization & Reproducibility" variant="surface">
        <div className="study-method-grid">
          <MethodCard title="Random Initialization">
            {sop3 && studyEvidence ? <>
              <div className="mb-4 flex flex-wrap items-baseline gap-3">
                <strong className="text-3xl font-semibold tabular-nums text-teal-800">{matches} / {sop3.settings.randomSeeds.length}</strong>
                <span className="text-sm">random starts match the DPC-equivalent partition</span>
              </div>
              <p className="mb-4 text-xs text-muted">Seed-dependent · controlled comparison on {sop3.settings.representation}, k = {sop3.settings.k}.</p>
              <h4 className="text-sm font-semibold">ARI by Random Seed</h4>
              <AriBySeedFigure runs={studyEvidence.ariBySeed} />
            </> : <p role={sopError ? "alert" : "status"} className="text-sm text-muted">{sopError ?? "Loading validated initialization comparison…"}</p>}
          </MethodCard>
          <MethodCard title="DPC Initialization" enhanced>
            <dl className="mb-5 grid grid-cols-2 gap-5">
              <Fact label="Initialization" value={run.initialization.deterministic ? "Deterministic" : "Unavailable"} />
              <Fact label="Selected centers" value={run.initialization.selectedCentroids.length} />
            </dl>
            <h4 className="mb-3 text-sm font-semibold">Density-Peak Selected Centers</h4>
            <div className="overflow-x-auto"><table className="research-table">
              <thead><tr><th scope="col">Center</th><th scope="col">ρ</th><th scope="col">δ</th><th scope="col">γ = ρ × δ</th></tr></thead>
              <tbody>{run.initialization.selectedCentroids.map(center => <tr key={center.rank}>
                <th scope="row">{center.rank}</th><td className="tabular-nums">{center.rho}</td>
                <td className="tabular-nums">{center.delta.toFixed(4)}</td><td className="tabular-nums">{center.gamma.toFixed(4)}</td>
              </tr>)}</tbody>
            </table></div>
            <p className="mt-4 text-xs text-muted">Same frozen input → same initialization · {run.initialization.reproducibilityPassed ? "verified" : "unavailable"} across {run.initialization.reproducibilityRuns} repeated checks.</p>
          </MethodCard>
        </div>
      </Panel>
      <Panel title="Standard vs Enhanced Comparison" variant="surface">
        <div className="study-method-grid">
          <MethodCard title="Standard / Existing K-Means">
            <DefenseScatter panel={defenseGeometry?.sop1.baseline ?? null} label="Existing K-Means" />
          </MethodCard>
          <MethodCard title="Enhanced K-Means" enhanced>
            <DefenseScatter panel={defenseGeometry?.sop3.dpc[0] ?? null} label="Enhanced K-Means" />
          </MethodCard>
        </div>
        <p className="mt-4 text-xs text-muted">PC1 and PC2 are visualization only. Both plots use the same axes; cluster labels are method-specific. Existing plot: seed {defenseGeometry?.sop1.seed ?? "—"}.</p>
        <section className="mt-6 border-t border-line pt-5" aria-label="Internal Validation">
          <h3 className="mb-4 text-base font-semibold">Internal Validation</h3>
          <MetricComparisonTable existing={existing} enhanced={enhanced} relativeChange={relativeChange} />
          <p className="mt-3 text-xs text-muted">Existing: mean of {baseline.runCount} random-initialization runs. Enhanced: validated deterministic result. Relative metric change, not statistical significance.</p>
        </section>
      </Panel>
      <div className="border-t border-line px-1 pt-6"><h2 className="text-[22px] font-semibold tracking-tight">Final Enhanced Solution</h2></div>
      <Panel title="Final Cluster Distribution" variant="surface">
        <dl className="grid gap-5 sm:grid-cols-2">
          {[...run.enhancedClustering.clusterSizes].sort((a, b) => a.clusterId - b.clusterId).map((cluster) =>
            <Fact key={cluster.clusterId} label={`Cluster ${cluster.clusterId} · ${cluster.clusterId === 0 ? "lower" : "higher"} impairment`} value={cluster.nMembers.toLocaleString()} />)}
        </dl>
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
    </div>
    <ResearchPageNavigation currentPath="/study-findings" />
  </div>;
});
