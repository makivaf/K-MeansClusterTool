import { AlertTriangle, ArrowDown, CheckCircle2 } from "lucide-react";
import type { UnifiedResearchRun } from "../../../../packages/shared/src";
import { LongitudinalProgressionChart } from "../components/charts/LongitudinalProgressionChart";
import { ResearchPageNavigation } from "../components/layout/ResearchPageNavigation";
import { Panel } from "../components/ui/Panel";
import { StatCard } from "../components/ui/StatCard";
import { PageHeading } from "./PageHeading";

type LongitudinalProgressionPageProps = { run: UnifiedResearchRun | null };

const flowLabels = {
  parent_clustered_cohort: "Parent clustered cohort",
  longitudinal_records_found: "Longitudinal records found",
  valid_dated_records: "Valid dated records",
  at_least_3_distinct_observations: "≥3 distinct observations",
  at_least_12_months_followup: "≥12 months follow-up"
};

const coefficientLabels = {
  intercept: "Intercept",
  time: "Time",
  cluster: "Original Cluster 1 vs 0",
  time_x_cluster: "Time × Cluster"
};

const checkLabels = {
  parentParticipantKeysUnique: "Parent participant keys are unique",
  parentPtidRidOneToOne: "PTID and RID linkage is one-to-one",
  allLongitudinalParticipantsInParentCohort: "All longitudinal participants belong to the clustered parent cohort",
  noParticipantInBothClusters: "No participant appears in both original clusters",
  noDuplicateParticipantDate: "No duplicate participant/date enters calculations",
  oneToOneAssignmentLinkageSucceeded: "Original assignment linkage succeeds",
  noSecondLongitudinalKMeans: "No second longitudinal K-Means is invoked"
};

const formatPValue = (value: number) => value === 0 ? "<1e-300" : value < 0.001 ? value.toExponential(2) : value.toFixed(3);

export const LongitudinalProgressionPage = ({ run }: LongitudinalProgressionPageProps) => {
  if (!run) return null;
  const summaries = [...run.longitudinal.byOriginalCluster].sort((left, right) => left.clusterId - right.clusterId);
  const mixedModel = run.longitudinal.mixedEffects;
  const primary = mixedModel.primaryResult;
  const annualChangeByCluster = new Map(mixedModel.estimatedAnnualChangeByOriginalCluster.map((entry) => [entry.clusterId, entry]));
  return (
    <>
      <PageHeading title="Longitudinal Follow-Up" description="Eligible members of the original enhanced K-Means clusters are followed over actual assessment dates and compared using ADAS-Cog13. No second clustering is performed." />

      <Panel title="Primary longitudinal result" variant="result">
        <div className="grid gap-3 lg:grid-cols-3">
          <StatCard label="Cluster 0" value={`${annualChangeByCluster.get(0)?.estimate.toFixed(3)} points/year`} detail={`${summaries[0]?.eligibleParticipants.toLocaleString()} participants`} accent="teal" />
          <StatCard label="Cluster 1" value={`${annualChangeByCluster.get(1)?.estimate.toFixed(3)} points/year`} detail={`${summaries[1]?.eligibleParticipants.toLocaleString()} participants`} accent="amber" />
          <StatCard label="Difference in annual change" value={`+${primary.estimate.toFixed(3)} points/year`} detail={`95% CI ${primary.confidenceInterval95.lower.toFixed(3)}–${primary.confidenceInterval95.upper.toFixed(3)} · p < .001`} />
        </div>
        <p className="mt-4 text-sm leading-6 text-ink">Among longitudinally eligible participants, Cluster 1 showed a significantly greater average annual increase in ADAS-Cog13 than Cluster 0.</p>
        <p className="mt-1 text-sm leading-6 text-muted">Higher ADAS-Cog13 indicates poorer cognitive performance.</p>
        <p className="mt-1 text-xs leading-5 text-muted">These are observed group differences. They do not establish causation, individual prediction, clinical diagnosis, or prognosis.</p>
      </Panel>

      <Panel title="Assignment-preserving continuation" className="mt-8" variant="section">
        <div className="grid items-center gap-3 text-sm md:grid-cols-[1fr_auto_1fr_auto_1fr]">
          <div className="border-l-2 border-teal-600 bg-teal-50/60 px-4 py-3 font-semibold text-teal-950">Enhanced K-Means creates Cluster 0 and Cluster 1</div>
          <ArrowDown className="mx-auto text-slate-400 md:-rotate-90" size={18} aria-hidden="true" />
          <div className="border-l-2 border-slate-300 px-4 py-3 font-semibold">Eligible members of those same clusters are followed over time</div>
          <ArrowDown className="mx-auto text-slate-400 md:-rotate-90" size={18} aria-hidden="true" />
          <div className="border-l-2 border-slate-300 px-4 py-3 font-semibold">ADAS-Cog13 progression patterns are compared by original cluster</div>
        </div>
        <div className="mt-4 flex items-center justify-center gap-2 text-sm font-medium text-emerald-700"><CheckCircle2 size={18} />Original assignments preserved; longitudinal K-Means not invoked</div>
      </Panel>

      <Panel title="Auditable cohort flow" className="mt-8" variant="section">
        <ol className="grid gap-x-5 md:grid-cols-5">
          {run.cohort.flow.map((stage, index) => (
            <li key={stage.stage} className="relative border-l-2 border-line pb-5 pl-8 last:pb-0 md:border-l-0 md:border-t-2 md:pb-0 md:pl-0 md:pt-5">
              <span className="absolute -left-[9px] top-0 h-4 w-4 rounded-full border-2 border-teal-600 bg-canvas md:-top-[9px] md:left-0" aria-hidden="true" />
              <div className="text-[10px] font-semibold tabular-nums text-muted">{String(index + 1).padStart(2, "0")}</div>
              <div className="mt-1 text-xs font-semibold leading-5 text-muted">{flowLabels[stage.stage]}</div>
              <div className="mt-1 text-xl font-semibold tabular-nums">{stage.participantCount.toLocaleString()}</div>
              {stage.observationCount !== undefined ? <div className="mt-0.5 text-xs tabular-nums text-muted">{stage.observationCount.toLocaleString()} records</div> : null}
            </li>
          ))}
        </ol>
        <p className="mt-4 text-xs leading-5 text-muted">Eligibility rule: {run.longitudinal.eligibilityRule}. Time: {run.longitudinal.timeDefinition}.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <StatCard label="Eligible Cluster 0" value={summaries[0]?.eligibleParticipants.toLocaleString()} accent="teal" />
          <StatCard label="Eligible Cluster 1" value={summaries[1]?.eligibleParticipants.toLocaleString()} accent="amber" />
          <StatCard label="Total observations" value={mixedModel.observationCount.toLocaleString()} />
        </div>
      </Panel>

      <Panel title="Primary mixed-effects model" className="mt-8" variant="section">
        <code className="block overflow-x-auto rounded-sm bg-slate-950 px-4 py-3 text-xs text-slate-100">{mixedModel.modelFormula}</code>
        <p className="mt-4 text-sm leading-6 text-ink">The mixed-effects model indicated a statistically significant difference in annual ADAS-Cog13 change between the two original clusters. Cluster 1 had an estimated {primary.estimate.toFixed(6)}-point/year greater annual increase than Cluster 0.</p>
        <p className="mt-2 text-xs leading-5 text-muted">{mixedModel.interpretation.causalCaution}</p>

        <details className="research-disclosure">
          <summary>Fixed effects and model diagnostics</summary>
          <div className="py-5">
            <div className="flex flex-col gap-3 border-l-2 border-emerald-600 bg-emerald-50 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
              <div><div className="flex items-center gap-2 font-semibold text-emerald-950"><CheckCircle2 size={19} />Primary random-intercept model converged</div><p className="mt-1 text-sm leading-6 text-emerald-900">{mixedModel.library.name} {mixedModel.library.version} · optimizer {mixedModel.selectedOptimizer} · α = {mixedModel.alpha}</p></div>
              <div className="text-sm font-semibold text-emerald-900">{mixedModel.participantCount.toLocaleString()} participants · {mixedModel.observationCount.toLocaleString()} observations</div>
            </div>
            <div className="overflow-x-auto">
              <table className="research-table min-w-[720px]">
                <thead><tr><th>Term</th><th className="text-right">Estimate</th><th className="text-right">SE</th><th className="text-right">95% CI</th><th className="text-right">z</th><th className="text-right">p</th></tr></thead>
                <tbody>{mixedModel.fixedEffects.map((effect) => <tr key={effect.term}><td className="font-medium">{coefficientLabels[effect.term]}</td><td className="text-right tabular-nums">{effect.estimate.toFixed(6)}</td><td className="text-right tabular-nums">{effect.standardError.toFixed(6)}</td><td className="text-right tabular-nums">{effect.confidenceInterval95.lower.toFixed(6)} to {effect.confidenceInterval95.upper.toFixed(6)}</td><td className="text-right tabular-nums">{effect.zStatistic.toFixed(3)}</td><td className="text-right tabular-nums">{formatPValue(effect.pValue)}</td></tr>)}</tbody>
              </table>
            </div>
            <dl className="mt-4 grid gap-3 border-l-2 border-slate-300 bg-slate-50 p-4 text-sm sm:grid-cols-2 xl:grid-cols-4">
              <div><dt className="text-muted">Random-intercept variance</dt><dd className="mt-1 font-semibold tabular-nums">{mixedModel.varianceComponents.randomInterceptVariance.toFixed(4)}</dd></div>
              <div><dt className="text-muted">Residual variance</dt><dd className="mt-1 font-semibold tabular-nums">{mixedModel.varianceComponents.residualVariance.toFixed(4)}</dd></div>
              <div><dt className="text-muted">AIC / BIC</dt><dd className="mt-1 font-semibold tabular-nums">{mixedModel.fitStatistics.aic.toFixed(2)} / {mixedModel.fitStatistics.bic.toFixed(2)}</dd></div>
              <div><dt className="text-muted">Boundary warning</dt><dd className="mt-1 font-semibold">{mixedModel.diagnostics.randomEffectBoundaryDetected ? "Detected; review required" : "Not detected"}</dd></div>
            </dl>
          </div>
        </details>
      </Panel>

      <section className="mt-8" aria-labelledby="descriptive-ols-heading">
        <div className="mb-3 border-l-2 border-slate-400 bg-slate-50 px-4 py-3">
          <h2 id="descriptive-ols-heading" className="font-semibold">Descriptive participant-level OLS summaries</h2>
          <p className="mt-1 text-sm leading-6 text-muted"><span className="font-semibold text-ink">Descriptive only:</span> these slopes support interpretation but are not the primary inferential model and were not reclustered.</p>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          {summaries.map((summary) => (
            <Panel key={summary.clusterId} title={`Original Cluster ${summary.clusterId} longitudinal subset`} variant="section">
              <div className="grid gap-3 sm:grid-cols-2">
                <StatCard label="Eligible participants" value={summary.eligibleParticipants.toLocaleString()} accent={summary.clusterId === 0 ? "teal" : "amber"} />
                <StatCard label="Observations" value={summary.observationCount.toLocaleString()} />
                <StatCard label="Mean descriptive OLS slope" value={summary.slopePointsPerYear.mean.toFixed(3)} detail={`Participant-level descriptive estimate · median ${summary.slopePointsPerYear.median.toFixed(3)} points/year`} />
                <StatCard label="Mean follow-up" value={`${summary.followupYears.mean.toFixed(2)} y`} detail={`Median ${summary.followupYears.median.toFixed(2)} years`} />
              </div>
              <dl className="mt-4 grid gap-3 border-l-2 border-slate-300 bg-slate-50 p-4 text-sm sm:grid-cols-2">
                <div><dt className="text-muted">Slope SD / IQR</dt><dd className="mt-1 font-semibold">{summary.slopePointsPerYear.standardDeviation.toFixed(3)} / {summary.slopePointsPerYear.interquartileRange.toFixed(3)}</dd></div>
                <div><dt className="text-muted">Slope range</dt><dd className="mt-1 font-semibold">{summary.slopePointsPerYear.minimum.toFixed(3)} to {summary.slopePointsPerYear.maximum.toFixed(3)}</dd></div>
                <div><dt className="text-muted">Baseline ADAS-Cog13</dt><dd className="mt-1 font-semibold">Mean {summary.baselineAdas13.mean.toFixed(2)} · median {summary.baselineAdas13.median.toFixed(2)}</dd></div>
                <div><dt className="text-muted">Model diagnostics</dt><dd className="mt-1 font-semibold">Median R² {summary.rSquared.median.toFixed(3)} · RMSE {summary.rmse.median.toFixed(3)}</dd></div>
              </dl>
            </Panel>
          ))}
        </div>
      </section>

      <Panel title="Descriptive mean ADAS-Cog13 by elapsed-time bin" className="mt-8" variant="section">
        <LongitudinalProgressionChart data={run.longitudinal.timeSeries} />
        <p className="mt-3 text-xs leading-5 text-muted">Each dot is a descriptive year-bin summary. Dots are intentionally not connected because participant support becomes sparse at later follow-up and unsupported gaps must not look like continuous trajectories.</p>
        <details className="research-disclosure">
          <summary>Participant and observation support by year bin</summary>
          <div className="max-h-80 overflow-auto py-4">
            <table className="research-table min-w-[560px]">
              <thead className="sticky top-0"><tr><th>Cluster</th><th>Year bin</th><th className="text-right">Participants</th><th className="text-right">Observations</th><th className="text-right">Mean ADAS-Cog13</th></tr></thead>
              <tbody>{run.longitudinal.timeSeries.map((point) => <tr key={`${point.clusterId}-${point.yearStart}`}><td>Cluster {point.clusterId}</td><td>{point.yearStart}–{point.yearEnd}</td><td className="text-right tabular-nums">{point.participantCount.toLocaleString()}</td><td className="text-right tabular-nums">{point.observationCount.toLocaleString()}</td><td className="text-right tabular-nums">{point.meanAdas13.toFixed(2)}</td></tr>)}</tbody>
            </table>
          </div>
        </details>
      </Panel>

      <details id="validation-limitations" className="research-disclosure scroll-mt-28">
        <summary>Validation, provenance, and interpretation limits</summary>
        <div className="grid gap-5 py-5 xl:grid-cols-2">
          <div><h2 className="text-sm font-semibold">Cohort and linkage checks</h2><ul className="mt-3 space-y-2">{Object.entries(run.cohort.linkageChecks).map(([key, passed]) => <li key={key} className="flex items-start gap-2 text-sm leading-6"><CheckCircle2 className="mt-1 shrink-0 text-emerald-600" size={16} /><span>{checkLabels[key as keyof typeof checkLabels]}{passed ? "" : " — failed"}</span></li>)}</ul></div>
          <div><h2 className="text-sm font-semibold">Interpretation limits</h2><ul className="mt-3 space-y-2">{run.longitudinal.limitations.map((limitation) => <li key={limitation} className="flex items-start gap-2 text-sm leading-6 text-muted"><AlertTriangle className="mt-1 shrink-0 text-amber-500" size={16} /><span>{limitation}</span></li>)}</ul></div>
          <dl className="grid gap-3 border-l-2 border-slate-300 bg-slate-50 p-4 text-sm sm:grid-cols-2 xl:col-span-2"><div><dt className="text-muted">Participant-level output</dt><dd className="mt-1 font-semibold">Local-only, gitignored, not web-exposed</dd></div><div><dt className="text-muted">Web result</dt><dd className="mt-1 font-semibold">Aggregate-only validated contract</dd></div><div><dt className="text-muted">Assignment source</dt><dd className="mt-1 break-all font-semibold">{run.provenance.assignmentArtifactAuthoritative}</dd></div><div><dt className="text-muted">Mixed-model artifacts</dt><dd className="mt-1 font-semibold">SHA-256 validated</dd></div></dl>
        </div>
      </details>
      <ResearchPageNavigation currentPath="/longitudinal-follow-up" />
    </>
  );
};
