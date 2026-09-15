import { ClusterDifferenceFigure, PcaVarianceFigure, NbClustVotesFigure } from "../components/charts/FinalFindingsCharts";
import { LongitudinalProgressionChart } from "../components/charts/LongitudinalProgressionChart";
import { MetricComparisonTable, metricDefinitions, formatMetric } from "../components/MetricComparisonTable";
import { Panel } from "../components/ui/Panel";
import { ResearchPageNavigation } from "../components/layout/ResearchPageNavigation";
import { useStudyFindings } from "../hooks/useStudyFindings";
import { useSopEvaluation } from "../hooks/useSopEvaluation";
import { countDpcMatches } from "../utils/studyFindings";
import { PageHeading } from "./PageHeading";

const Fact = ({ label, value }: { label: string; value: string | number }) => <div>
  <dt className="text-xs text-muted">{label}</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">{value}</dd>
</div>;

export const StudyFindingsPage = () => {
  const { run, error, loading } = useStudyFindings();
  const { evaluation, error: sopError } = useSopEvaluation(run);
  if (loading) return <><PageHeading title="Study Findings" /><p role="status">Loading validated study…</p></>;
  if (!run || error) return <><PageHeading title="Study Findings" /><p role="alert">{error ?? "Validated study unavailable."}</p></>;
  const existing = Object.fromEntries(run.baselineComparison.metrics.map((metric) => [metric.metric, metric.baselineValue]));
  const enhanced = Object.fromEntries(metricDefinitions.map(({ key, field }) => [key, run.enhancedClustering.metrics[field]]));
  const sop3 = evaluation?.sop3;
  const matches = sop3 ? countDpcMatches(sop3) : null;
  const model = run.longitudinal.mixedEffects;
  const result = model.primaryResult;

  return <>
    <PageHeading title="Study Findings" description={`Validated study cohort · n = ${run.cohort.parentN.toLocaleString()}`} />
    <div className="space-y-6">
      <Panel title="Overall Performance" variant="surface">
        <MetricComparisonTable existing={existing} enhanced={enhanced} />
        <p className="mt-3 text-xs text-muted">Existing: mean of {run.baselineComparison.baselineMethod.runCount} random-initialization runs. Enhanced: validated deterministic result.</p>
      </Panel>
      <Panel title="PCA" variant="surface">
        <dl className="mb-5 grid grid-cols-2 gap-5 sm:grid-cols-4">
          <Fact label="Input variables" value={run.preprocessing.retainedFeatures.length} />
          <Fact label="Components retained" value={run.pca.components} />
          <Fact label="Cumulative explained variance" value={`${(run.pca.cumulativeExplainedVariance * 100).toFixed(2)}%`} />
          <Fact label="Threshold" value="85%" />
        </dl>
        <PcaVarianceFigure run={run} compact />
      </Panel>
      <Panel title="NbClust" variant="surface">
        <dl className="mb-5 grid grid-cols-2 gap-5">
          <Fact label="Selected k" value={run.kSelection.selectedK} />
          <Fact label="Supporting indices" value={`${run.kSelection.votesForSelectedK} / ${run.kSelection.usableVotes} usable indices`} />
        </dl>
        <NbClustVotesFigure selection={run.kSelection} />
      </Panel>
      <Panel title="DPC Initialization" variant="surface">
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
      <Panel title="Final Clusters" variant="surface">
        <dl className="grid gap-5 sm:grid-cols-2">
          {[...run.enhancedClustering.clusterSizes].sort((a, b) => a.clusterId - b.clusterId).map((cluster) =>
            <Fact key={cluster.clusterId} label={`Cluster ${cluster.clusterId} · ${cluster.clusterId === 0 ? "lower" : "higher"} impairment`} value={cluster.nMembers.toLocaleString()} />)}
        </dl>
        <p className="mt-4 text-xs text-muted">Total: {run.cohort.parentN.toLocaleString()} · Selected k = {run.kSelection.selectedK}</p>
      </Panel>
      <Panel title="Cluster Profiles / SMD" variant="surface"><ClusterDifferenceFigure run={run} /></Panel>
      <Panel title="Longitudinal Progression" variant="surface">
        <p className="mb-4 text-sm text-muted">ADAS-Cog13: higher score = greater impairment. Original cluster assignments remain fixed.</p>
        <LongitudinalProgressionChart data={run.longitudinal.timeSeries} />
        <p className="mt-2 text-xs text-muted">Observed means by elapsed-year bin; bars describe available observations, not fitted model predictions.</p>
        <h3 className="mb-3 mt-6 font-semibold">Linear mixed-effects model</h3>
        <p className="mb-4 text-xs text-muted">{model.participantCount.toLocaleString()} eligible participants · {model.observationCount.toLocaleString()} observations · {model.estimationMethod}</p>
        <dl className="grid gap-5 sm:grid-cols-2">
          {model.estimatedAnnualChangeByOriginalCluster.map((entry) =>
            <Fact key={entry.clusterId} label={`Cluster ${entry.clusterId} · ${entry.clusterId === 0 ? "lower" : "higher"} impairment · ADAS-Cog13 points/year`} value={entry.estimate.toFixed(6)} />)}
        </dl>
        <div className="mt-5 overflow-x-auto"><table className="research-table">
          <thead><tr><th>Time × Cluster</th><th>Estimate</th><th>95% CI</th><th>p-value</th></tr></thead>
          <tbody><tr><td>Difference in annual change (Cluster 1 − Cluster 0)</td><td className="tabular-nums">{result.estimate.toFixed(6)}</td>
            <td className="whitespace-nowrap tabular-nums">{result.confidenceInterval95.lower.toFixed(6)} to {result.confidenceInterval95.upper.toFixed(6)}</td>
            <td>{result.pValue < 0.001 ? "<0.001" : result.pValue.toFixed(3)}</td></tr></tbody>
        </table></div>
      </Panel>
    </div>
    <ResearchPageNavigation currentPath="/study-findings" />
  </>;
};
