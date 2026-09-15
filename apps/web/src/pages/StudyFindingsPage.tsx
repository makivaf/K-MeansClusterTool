import { memo } from "react";
import { PcaVarianceFigure, NbClustVotesFigure } from "../components/charts/FinalFindingsCharts";
import { LongitudinalProgressionChart } from "../components/charts/LongitudinalProgressionChart";
import { MetricComparisonTable, metricDefinitions, formatMetric } from "../components/MetricComparisonTable";
import { Panel } from "../components/ui/Panel";
import { ResearchPageNavigation } from "../components/layout/ResearchPageNavigation";
import { CheckCircle2, Database, Loader2, Play } from "lucide-react";
import { Link } from "react-router-dom";
import type { UnifiedResearchRun, UploadResponse } from "../../../../packages/shared/src/schema";
import type { AnalysisRunState } from "../hooks/useStudyFindings";
import { isDatasetReady } from "../utils/validatedDataset";
import { useSopEvaluation } from "../hooks/useSopEvaluation";
import { countDpcMatches } from "../utils/studyFindings";
import { PageHeading } from "./PageHeading";
import { getMeasureLabel } from "../utils/measureLabels";

// Loading initialization evidence should not rerender the retained charts.
const PcaChart = memo(PcaVarianceFigure);
const VotesChart = memo(NbClustVotesFigure);
const ProgressionChart = memo(LongitudinalProgressionChart);

const Fact = ({ label, value }: { label: string; value: string | number }) => <div>
  <dt className="text-xs text-muted">{label}</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">{value}</dd>
</div>;

export const StudyFindingsPage = ({ analysis, dataset }: { analysis: AnalysisRunState; dataset: UploadResponse | null }) => {
  const ready = isDatasetReady(dataset);
  if (ready && analysis.status === "complete" && analysis.run) return <StudyResults run={analysis.run} />;
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
  const { evaluation, error: sopError } = useSopEvaluation(run);
  const existing = Object.fromEntries(run.baselineComparison.metrics.map((metric) => [metric.metric, metric.baselineValue]));
  const enhanced = Object.fromEntries(metricDefinitions.map(({ key, field }) => [key, run.enhancedClustering.metrics[field]]));
  const sop3 = evaluation?.sop3;
  const matches = sop3 ? countDpcMatches(sop3) : null;
  const profiles = new Map(run.clusterProfiles.profiles.map((profile) => [profile.clusterId, profile]));
  const model = run.longitudinal.mixedEffects;
  const result = model.primaryResult;

  return <div className="research-page">
    <PageHeading title="Study Findings" description={`Validated study cohort · n = ${run.cohort.parentN.toLocaleString()}`} />
    <div className="space-y-6">
      <Panel title="Internal Validation" variant="surface">
        <MetricComparisonTable existing={existing} enhanced={enhanced} />
        <p className="mt-3 text-xs text-muted">Existing: mean of {run.baselineComparison.baselineMethod.runCount} random-initialization runs. Enhanced: validated deterministic result.</p>
      </Panel>
      <Panel title="PCA Retention" variant="surface">
        <dl className="mb-5 grid grid-cols-2 gap-5 sm:grid-cols-4">
          <Fact label="Input variables" value={run.preprocessing.retainedFeatures.length} />
          <Fact label="Components retained" value={run.pca.components} />
          <Fact label="Cumulative explained variance" value={`${(run.pca.cumulativeExplainedVariance * 100).toFixed(2)}%`} />
          <Fact label="Threshold" value="85%" />
        </dl>
        <PcaChart run={run} compact />
      </Panel>
      <Panel title="NbClust Selection" variant="surface">
        <dl className="mb-5 grid grid-cols-2 gap-5">
          <Fact label="Selected k" value={run.kSelection.selectedK} />
          <Fact label="Supporting / usable indices" value={`${run.kSelection.votesForSelectedK} / ${run.kSelection.usableVotes}`} />
        </dl>
        <VotesChart selection={run.kSelection} />
      </Panel>
      <Panel title="DPC Initialization & Reproducibility" variant="surface">
        {sop3 ? <>
          <div className="mb-5 flex flex-wrap items-center gap-x-5 gap-y-2">
            <strong className="text-4xl font-semibold tabular-nums text-teal-800">{matches === null ? "—" : `${matches} / ${sop3.settings.randomSeeds.length}`}</strong>
            <div><p className="font-semibold">Random runs reached the DPC solution</p><p className="mt-1 text-xs text-muted">Matching validation metrics and label-invariant cluster sizes.</p></div>
          </div>
          <div className="overflow-x-auto"><table className="research-table">
            <thead><tr><th>Metric</th><th className="text-right">DPC</th><th className="text-right">Random mean</th><th className="text-right">SD</th></tr></thead>
            <tbody>{metricDefinitions.map(({ key, field, label }) => <tr key={key}>
              <td>{label}</td><td className="text-right tabular-nums">{formatMetric(sop3.dpcDeterminism.metrics[field])}</td>
              <td className="text-right tabular-nums">{formatMetric(sop3.randomRunSummary[key].mean)}</td>
              <td className="text-right tabular-nums">{formatMetric(sop3.randomRunSummary[key].standardDeviation)}</td>
            </tr>)}</tbody>
          </table></div>
          <p className="mt-3 text-xs text-muted">Deterministic initialization · identical initialization and output across {sop3.dpcDeterminism.repeatedChecks} repeated checks.</p>
        </> : <p role={sopError ? "alert" : "status"} className="text-sm text-muted">{sopError ?? "Loading validated initialization comparison…"}</p>}
      </Panel>
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
