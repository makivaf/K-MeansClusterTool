import { Bar, BarChart, CartesianGrid, Cell, LabelList, Line, LineChart, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { UnifiedResearchRun } from "../../../../../packages/shared/src";
import { getMeasureLabel } from "../../utils/measureLabels";

import { chartPalette } from "./chartPalette";
const teal = chartPalette.primary;
const slate = chartPalette.neutral;
const tick = { fontSize: 14, fill: chartPalette.text };
const percent = (value: number) => `${(value * 100).toFixed(2)}%`;

export const DpcSeedFigure = ({ run }: { run: UnifiedResearchRun }) => (
  <section className="existing-card">
    <div className="existing-card-header"><div><p>Final enhanced initialization</p><h2>Deterministic DPC seed priority</h2></div></div>
    <figure>
      <div className="h-80 w-full" role="img" aria-label="Validated gamma priority of the two DPC-selected initial seeds, by assigned final cluster.">
        <ResponsiveContainer>
          <BarChart data={run.initialization.selectedCentroids.map((seed) => ({ ...seed, label: `Cluster ${seed.assignedCluster} seed` }))} margin={{ top: 30, right: 20, bottom: 20, left: 30 }}>
            <CartesianGrid vertical={false} stroke={chartPalette.grid} />
            <XAxis dataKey="label" tick={tick} />
            <YAxis tick={tick} label={{ value: "Gamma priority", angle: -90, position: "insideLeft", fontSize: 14 }} />
            <Tooltip formatter={(value: number) => [value.toFixed(5), "Gamma"]} />
            <Bar dataKey="gamma" isAnimationActive={false}>
              {run.initialization.selectedCentroids.map((seed) => <Cell key={seed.assignedCluster} fill={seed.assignedCluster === 0 ? teal : chartPalette.comparison} />)}
              <LabelList dataKey="gamma" position="top" formatter={(value: number) => value.toFixed(2)} fontSize={14} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="text-base text-muted">Final PCA-based DPC seed statistics. The current validated API does not expose PC1/PC2 observation or seed coordinates, so the requested projection is unavailable. No synthetic scatter is shown.</figcaption>
    </figure>
  </section>
);

export const PcaVarianceFigure = ({ run }: { run: UnifiedResearchRun }) => (
  <figure>
    <div className="overflow-x-auto"><div className="h-96 min-w-[720px] w-full" role="img" aria-label={`PCA cumulative explained variance; ${run.pca.components} PCs selected, ${percent(run.pca.cumulativeExplainedVariance)} retained.`}>
      <ResponsiveContainer>
        <LineChart data={run.pca.scree} margin={{ top: 30, right: 38, bottom: 30, left: 10 }}>
          <CartesianGrid vertical={false} stroke={chartPalette.grid} />
          <XAxis dataKey="component" tick={tick} interval={0} tickFormatter={(value) => `PC${value}`} label={{ value: "Principal component count", position: "bottom", fontSize: 14 }} />
          <YAxis domain={[0, 1]} tick={tick} tickFormatter={(value: number) => `${value * 100}%`} />
          <Tooltip formatter={(value: number) => [percent(value), "Cumulative variance"]} labelFormatter={(value) => `PC${value}`} />
          <ReferenceLine x={run.pca.components} stroke={teal} strokeDasharray="5 4" label={{ value: "Selected", position: "top", fill: teal, fontSize: 14 }} />
          <ReferenceLine y={0.85} stroke={chartPalette.comparison} strokeWidth={2} strokeDasharray="6 4" label={{ value: "85% retention threshold", position: "insideBottomRight", fill: chartPalette.text, fontSize: 14 }} />
          <Line type="linear" dataKey="cumulativeVariance" stroke={teal} strokeWidth={3} dot={{ r: 5 }} isAnimationActive={false} />
          <ReferenceDot x={run.pca.components} y={run.pca.cumulativeExplainedVariance} r={8} fill={teal} stroke="white" strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div></div>
    <figcaption className="mt-3 text-base text-muted"><strong>{run.pca.components} PCs retained · {percent(run.pca.cumulativeExplainedVariance)} cumulative explained variance.</strong> {run.pca.scree.find((point) => point.cumulativeVariance >= 0.85)?.component === run.pca.components ? `PC${run.pca.components} is the first component count satisfying the ≥85% criterion.` : ""}</figcaption>
  </figure>
);

export const FinalNbClustFigure = ({ run }: { run: UnifiedResearchRun }) => {
  const selection = run.kSelection;
  // Missing recommendations remain missing, rather than being presented as zero votes.
  const data = selection.candidateK.map((k) => ({ k, votes: selection.voteDistribution.find((row) => row.k === k)?.votes }));
  return (
    <section className="existing-card">
      <div className="existing-card-header"><div><p>Frozen enhanced result</p><h2>Final Enhanced NbClust Vote Distribution</h2></div></div>
      <figure>
        <div className="h-80 w-full" role="img" aria-label={`Final NbClust votes. Selected k=${selection.selectedK}: ${selection.votesForSelectedK} of ${selection.usableVotes} usable index recommendations.`}>
          <ResponsiveContainer>
            <BarChart data={data} margin={{ top: 30, right: 20, bottom: 30, left: 5 }}>
              <CartesianGrid vertical={false} stroke={chartPalette.grid} />
              <XAxis dataKey="k" tick={tick} tickFormatter={(value) => `k=${value}`} interval={0} label={{ value: "Candidate cluster count", position: "bottom", fontSize: 14 }} />
              <YAxis allowDecimals={false} tick={tick} label={{ value: "Votes", angle: -90, position: "insideLeft", fontSize: 14 }} />
              <Tooltip formatter={(value: number) => [value, "Index recommendations"]} labelFormatter={(value) => `k=${value}`} />
              <Bar dataKey="votes" isAnimationActive={false}>
                {data.map((row) => <Cell key={row.k} fill={row.k === selection.selectedK ? teal : slate} />)}
                <LabelList dataKey="votes" position="top" fontSize={16} fill="#334155" />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <figcaption className="mt-3 text-base text-muted">Selected <strong>k = {selection.selectedK}</strong>, with <strong>{selection.votesForSelectedK} of {selection.usableVotes}</strong> usable index recommendations. This is the final PCA-based enhanced result.</figcaption>
        {data.some((row) => row.votes === undefined) ? <p className="existing-note">Vote counts not exposed for: {data.filter((row) => row.votes === undefined).map((row) => `k=${row.k}`).join(", ")}. Missing bars do not indicate zero votes.</p> : null}
      </figure>
    </section>
  );
};

const metricTitles = { silhouette: "Silhouette Coefficient", davies_bouldin: "Davies-Bouldin Index", calinski_harabasz: "Calinski-Harabasz Index" };

export const InternalValidationFigure = ({ run }: { run: UnifiedResearchRun }) => (
  <figure className="mb-6">
    <div className="grid gap-6 xl:grid-cols-3">
      {run.baselineComparison.metrics.map((metric) => (
        <div key={metric.metric}>
          <h3 className="text-base font-semibold">{metricTitles[metric.metric]}</h3>
          <p className="mb-3 text-sm text-muted">{metric.direction === "lower" ? "Lower" : "Higher"} is better</p>
          <div className="h-64 w-full" role="img" aria-label={`${metricTitles[metric.metric]}: standard baseline ${metric.baselineValue.toFixed(5)}; enhanced ${metric.enhancedValue.toFixed(5)}.`}>
            <ResponsiveContainer>
              <BarChart data={[{ method: "Baseline", value: metric.baselineValue }, { method: "Enhanced", value: metric.enhancedValue }]} margin={{ top: 30, right: 15, bottom: 5, left: 5 }}>
                <CartesianGrid vertical={false} stroke={chartPalette.grid} />
                <XAxis dataKey="method" tick={tick} />
                <YAxis tick={tick} width={65} domain={[(min: number) => Math.min(0, min), "auto"]} />
                <Tooltip formatter={(value: number) => value.toFixed(5)} />
                <Bar dataKey="value" isAnimationActive={false}><Cell fill={chartPalette.comparison} /><Cell fill={teal} /><LabelList dataKey="value" position="top" formatter={(value: number) => value.toFixed(5)} fontSize={14} /></Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      ))}
    </div>
    <figcaption className="mt-4 text-base text-muted">Standard K-Means baseline: mean of {run.baselineComparison.baselineMethod.runCount} runs, k = {run.baselineComparison.baselineMethod.selectedK}, {run.baselineComparison.baselineMethod.representation}. Enhanced: final PCA + NbClust + DPC result, k = {run.kSelection.selectedK}. Each metric has its own scale.</figcaption>
  </figure>
);

export const ClusterDifferenceFigure = ({ run }: { run: UnifiedResearchRun }) => {
  const data = [...run.clusterProfiles.smdRanking].sort((a, b) => a.rank - b.rank).slice(0, 10).map((row) => ({ ...row, label: row.variable === "CATEGORY_FLUENCY_ANIMALS" ? "Animal fluency" : row.variable.replace(/_/g, " ") }));
  return (
    <figure>
      <div className="overflow-x-auto">
        <div className="h-[520px] min-w-[640px]" role="img" aria-label="Ten strongest cognitive and functional differences, ranked by validated absolute standardized mean difference. Signed values are Cluster 1 minus Cluster 0.">
          <ResponsiveContainer>
            <BarChart layout="vertical" data={data} margin={{ top: 10, right: 65, bottom: 35, left: 10 }}>
              <CartesianGrid horizontal={false} stroke={chartPalette.grid} />
              <XAxis type="number" tick={tick} label={{ value: "SMD (Cluster 1 − Cluster 0)", position: "bottom", fontSize: 14 }} />
              <YAxis type="category" dataKey="label" width={190} tick={tick} interval={0} />
              <ReferenceLine x={0} stroke="#475569" />
              <Tooltip labelFormatter={(_label, payload) => getMeasureLabel(payload[0]?.payload.variable ?? "")} formatter={(value: number) => [value.toFixed(5), "SMD (1 − 0)"]} />
              <Bar dataKey="standardizedMeanDifferenceCluster1Minus0" fill={teal} isAnimationActive={false}>
                {data.map((row) => <Cell key={row.variable} fill={row.standardizedMeanDifferenceCluster1Minus0 > 0 ? chartPalette.comparison : teal} />)}
                <LabelList dataKey="standardizedMeanDifferenceCluster1Minus0" position="right" formatter={(value: number) => value.toFixed(3)} fontSize={14} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <figcaption className="mt-3 text-base text-muted">Orange/positive: higher mean in Cluster 1; teal/negative: higher mean in Cluster 0. Descriptive post-hoc characterization only; these differences do not establish diagnoses or clinical subtypes.</figcaption>
    </figure>
  );
};
