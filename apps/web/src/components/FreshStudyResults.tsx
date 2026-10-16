import { formatNumber } from "../utils/formatNumber";
import { useId, useState, type ReactNode } from "react";
import { compatibleMethods, type MethodResult } from "../../../../packages/shared/src/methodExecution";
import { Panel } from "./ui/Panel";
import { CorrelationHeatmap } from "./charts/FinalFindingsCharts";
import { PartitionProjection } from "./charts/PartitionProjection";
import { MethodCard, VarianceSummary, ClusterDistribution } from "./SopComparison";
import { PcaLoadingMatrix } from "./PcaLoadingMatrix";
import { PcaChart, SilhouetteChart, NbClustIndexDetails } from "./SopFigures";
import { NbClustSummary, StandardSelectionSummary } from "./NbClustComparison";
import { InitializationComparison } from "./InitializationComparison";
import { DpcCenterTable } from "./DpcCenterTable";
import { MethodDecisionGraph } from "./MethodDecisionGraph";
import { CommonSpaceValidation } from "./CommonSpaceValidation";
import { ControlledSopEvidence } from "./ControlledSopEvidence";
import { sopText } from "../utils/sopText";
import { formatContinuous, formatPercent } from "../utils/numberFormatting";
import "../pages/StudyFindingsPage.css";

export const ResultPlaceholder = ({ method, state = "Not run yet" }: { method: "Standard" | "Enhanced"; state?: string }) =>
  <MethodCard title={method + " K-Means"} enhanced={method === "Enhanced"}><p role="status" className="study-results-placeholder">{state}</p></MethodCard>;

export function FreshStudyResults({ standard: savedStandard, enhanced: savedEnhanced, comparison, initialTab = "sop1", historical,
  standardState = "Not run yet", enhancedState = "Not run yet" }: {
  standard?: MethodResult; enhanced?: MethodResult; comparison?: MethodResult; initialTab?: string; historical?: ReactNode;
  standardState?: string; enhancedState?: string;
}) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const tabId = useId();
  const standard = standardState === "Running" ? undefined : savedStandard;
  const enhanced = enhancedState === "Running" ? undefined : savedEnhanced;
  const current = standard ?? enhanced;
  if (!current && standardState !== "Running" && enhancedState !== "Running") return null;
  const bothComplete = compatibleMethods(standard, enhanced);
  const paired = bothComplete && comparison?.method === "comparison" && !!comparison.commonSpace &&
    Object.entries(standard!.provenance).every(([key, value]) => comparison.provenance[key as keyof typeof comparison.provenance] === value);
  const s = standard?.standard, e = enhanced?.enhanced;
  const pca = enhanced?.common.pca, n = current?.common.participantCount;
  const standardPlaceholder = <ResultPlaceholder method="Standard" state={standardState} />;
  const enhancedPlaceholder = <ResultPlaceholder method="Enhanced" state={enhancedState} />;
  const grid = (a: ReactNode, b: ReactNode) => <div className="simulation-two-column study-method-grid">{a}{b}</div>;
  const projection = (result: MethodResult, name: string) => <PartitionProjection label={name}
    points={result.common.xy.map(([x, y], i) => ({ x, y, cluster: result.labels[i] }))} centers={result.centroids} />;
  const scatter = <details className="sop3-disclosure"><summary>Cluster visualization — Seed 0</summary>
    {grid(standard ? <MethodCard title="Standard K-Means · Seed 0">{projection(standard, "Standard K-Means · Seed 0")}</MethodCard> : standardPlaceholder,
      enhanced ? <MethodCard title="Enhanced K-Means" enhanced>{projection(enhanced, "Enhanced K-Means")}</MethodCard> : enhancedPlaceholder)}
    {paired && comparison!.commonSpace!.crossMethod[0] && <p className="sop3-note">
      Standard seed 0 versus Enhanced: ARI {formatNumber(comparison!.commonSpace!.crossMethod[0].ari, "ari")}; {formatNumber(comparison!.commonSpace!.crossMethod[0].disagreementCount, "count")} participants assigned differently after label alignment.
    </p>}
  </details>;
  return <div className="study-results">
    {bothComplete && <Panel title="Method Comparison Overview" variant="surface" className="study-overview-card">
      <table className="research-table study-overview"><thead><tr><th>Methodology</th><th>Standard K-Means</th><th>Enhanced K-Means</th></tr></thead><tbody>
        <tr><th>Feature representation</th><td>15 standardized variables</td><td>PCA · {pca!.pcaComponents} PCs · {formatPercent(pca!.cumulativeExplainedVariance * 100)} variance</td></tr>
        <tr><th>Selected k</th><td>{s!.selectedK}</td><td>{e!.selectedK}</td></tr>
        <tr><th>Initialization</th><td>Random ({s!.runs.length} runs)</td><td>DPC deterministic</td></tr>
      </tbody></table>
    </Panel>}
    <div className="study-results-sections">
      <div className="study-sop-tabs" role="tablist" aria-label="Study findings sections">
        {[["sop1", "SOP 1", sopText.sop1.title], ["sop2", "SOP 2", sopText.sop2.title], ["sop3", "SOP 3", sopText.sop3.title], ["final", "Final Results", "Clustering Results"]].map(([id, label, title], index, tabs) =>
          <button key={id} id={`${tabId}-tab-${id}`} aria-controls={`${tabId}-panel-${id}`} type="button" role="tab" aria-selected={activeTab === id} tabIndex={activeTab === id ? 0 : -1}
            onClick={() => setActiveTab(id)} onKeyDown={event => {
              const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null;
              if (next !== null) { event.preventDefault(); setActiveTab(tabs[next][0]); (event.currentTarget.parentElement?.children[next] as HTMLButtonElement)?.focus(); }
            }}><span>{label}</span><strong>{title}</strong></button>)}
      </div>
      <div id={`${tabId}-panel-${activeTab}`} role="tabpanel" aria-labelledby={`${tabId}-tab-${activeTab}`} tabIndex={0} className="study-tab-content space-y-6">
        {activeTab === "sop1" && <Panel title={sopText.sop1.heading} variant="surface">
          {grid(standard ? <MethodCard title="Original Feature Representation"><p className="simulation-compact-note">{standard.common.retainedVariables.length} standardized variables</p>
              <CorrelationHeatmap correlation={{ features: standard.common.retainedVariables, matrix: standard.common.correlation }} compact showKey={false} />
            </MethodCard> : standardPlaceholder,
            enhanced && pca ? <MethodCard enhanced title="Principal Component Analysis">
              <p className="simulation-compact-note">{enhanced.common.retainedVariables.length} variables {" -> "}{pca.pcaComponents} PCs, {formatNumber(pca.cumulativeExplainedVariance * 100, "percentage")} variance</p>
              <PcaChart enhanced={pca} />
              <VarianceSummary rows={pca.pcaVariance.map(row => ({ ...row, cumulativeVariance: row.cumulativeExplainedVariance }))} retained={pca.pcaComponents} loadingData={pca.pcaLoadings} />
              <PcaLoadingMatrix {...pca.pcaLoadings} components={pca.pcaLoadings.components.slice(0, pca.pcaComponents)} />
            </MethodCard> : enhancedPlaceholder)}
          {paired && <ControlledSopEvidence standard={standard!} enhanced={enhanced!} comparison={comparison!} sop="sop1" />}
        </Panel>}
        {activeTab === "sop2" && <Panel title={sopText.sop2.heading} variant="surface">
          {grid(s ? <MethodCard title="Silhouette-Based Selection"><h3 className="card-title">Silhouette by k</h3>
              <SilhouetteChart candidates={s.silhouetteByK} /><StandardSelectionSummary selectedK={s.selectedK} />
            </MethodCard> : standardPlaceholder,
            e ? <NbClustSummary candidateK={Array.from({ length: 9 }, (_, i) => i + 2)} selectedK={e.selectedK}
              usableIndices={e.nbclust.indices.filter(row => row.status === "success").length} votes={e.nbclust.votes} indices={e.nbclust.indices} /> : enhancedPlaceholder)}
          {e && <NbClustIndexDetails indices={e.nbclust.indices} />}
        </Panel>}
        {activeTab === "sop3" && <Panel title={sopText.sop3.heading} variant="surface">
          <InitializationComparison simulation standardAvailable={!!s} enhancedAvailable={!!e} standardState={standardState} enhancedState={enhancedState}
            standard={paired ? comparison?.initializationEvidence?.standard : standard?.initializationEvidence?.standard}
            enhanced={paired ? comparison?.initializationEvidence?.enhanced : enhanced?.initializationEvidence?.enhanced}
            randomRuns={s?.ariBySeed} dpcRuns={e?.dpc.ariByRun} selectedCenters={e?.dpc.centroidCount ?? 0}
            centerTable={e && <DpcCenterTable centers={e.dpc.centers.map((center, i) => ({ ...center, center: i + 1 }))} />}
            decisionGraph={e && <MethodDecisionGraph enhanced={e} />} />
          {paired && <p className="sop3-note">Standard pairwise ARI: mean {formatNumber(comparison!.commonSpace!.pairwise.standard.mean, "ari")}, minimum {formatNumber(comparison!.commonSpace!.pairwise.standard.minimum, "ari")}.
            Enhanced pairwise ARI: mean {formatNumber(comparison!.commonSpace!.pairwise.enhanced.mean, "ari")}, minimum {formatNumber(comparison!.commonSpace!.pairwise.enhanced.minimum, "ari")}.</p>}
          {scatter}
          {paired && <ControlledSopEvidence standard={standard!} enhanced={enhanced!} comparison={comparison!} sop="sop3" />}
        </Panel>}
        {activeTab === "final" && (bothComplete ? <>
          <Panel title="Internal Validation" variant="surface">{paired
            ? <CommonSpaceValidation comparison={comparison!} standardK={s!.selectedK} enhancedK={e!.selectedK} />
            : <p role="status">Not available — common-space comparison evidence is pending.</p>}</Panel>
          <Panel title="Cluster Distribution" variant="surface">{grid(
            <ClusterDistribution title="Standard K-Means · Seed 0" participants={n!} sizes={s!.runs[0].clusterSizes} />,
            <ClusterDistribution title="Enhanced K-Means" participants={n!} metadata="DPC run 1" sizes={e!.clusterSizes} />
          )}</Panel>
          {historical}
          {scatter}
        </> : <Panel title="Final Results" variant="surface"><p role="status">Complete both methods to view Final Results.</p>{grid(
          <ResultPlaceholder method="Standard" state={standard ? "Completed" : standardState} />,
          <ResultPlaceholder method="Enhanced" state={enhanced ? "Completed" : enhancedState} />
        )}</Panel>)}
      </div>
    </div>
  </div>;
}
