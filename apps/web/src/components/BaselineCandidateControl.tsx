import { useId, useState, type CSSProperties } from "react";
import type { BaselineCandidateSweep } from "../../../../packages/shared/src";
import { BASELINE_K_MAX, BASELINE_K_MIN, selectBaselineCandidate } from "../utils/baselineCandidate";
import { chartPalette } from "./charts/chartPalette";

export const BaselineCandidateControl = ({ sweep, error }: { sweep: BaselineCandidateSweep | null; error?: string | null }) => {
  const [k, setK] = useState(BASELINE_K_MIN);
  const id = useId();
  const candidate = selectBaselineCandidate(sweep, k);
  return (
    <article className="existing-card">
      <div className="existing-card-header"><div><p>Interactive baseline candidate</p><h2>Baseline K-Means · k={k}</h2></div></div>
      <p className="mb-4 text-sm text-muted">No PCA · No NbClust · No DPC. Validated 13-feature candidate sweep, random initialization, seed {sweep?.seed ?? "—"}. Selecting k displays its stored result immediately.</p>
      <label htmlFor={id} className="text-base font-semibold">Manual cluster count: {k}</label>
      <div className="baseline-k-slider-shell">
        <input id={id} aria-label="Baseline candidate cluster count" className="baseline-k-slider" type="range" min={BASELINE_K_MIN} max={BASELINE_K_MAX} step={1} value={k} disabled={!sweep}
          onChange={(event) => { const next = Number(event.target.value); selectBaselineCandidate(sweep, next); setK(next); }}
          style={{ "--slider-fill": `${((k - BASELINE_K_MIN) / (BASELINE_K_MAX - BASELINE_K_MIN)) * 100}%` } as CSSProperties} />
        <div className="existing-k-ticks" aria-hidden="true">{sweep?.candidates.map((row) => <span key={row.k}>{row.k}</span>)}</div>
      </div>
      {candidate ? <>
        <h3 className="mt-5 text-base font-semibold">Cluster membership counts · k={candidate.k}</h3>
        <div className="mt-3 space-y-2" aria-label={`Validated cluster sizes for baseline k=${candidate.k}`}>
          {candidate.clusterSizes.map((size, cluster) => <div key={cluster} className="grid grid-cols-[5rem_1fr_4rem] items-center gap-3 text-sm">
            <span>Cluster {cluster}</span><div className="h-4 bg-slate-100"><div className="h-full" style={{ width: `${size / candidate.clusterSizes.reduce((a, b) => a + b, 0) * 100}%`, backgroundColor: cluster % 2 === 0 ? chartPalette.primary : chartPalette.comparison }} /></div><strong className="text-right tabular-nums">{size.toLocaleString()}</strong>
          </div>)}
        </div>
        <h3 className="mt-5 text-base font-semibold">Internal validation · k={candidate.k}</h3>
        <div className="existing-metrics">
          {[["Silhouette", candidate.silhouette, "Higher is better"], ["Davies-Bouldin", candidate.daviesBouldin, "Lower is better"], ["Calinski-Harabasz", candidate.calinskiHarabasz, "Higher is better"]].map(([label, value, direction]) => <div key={label}><span>{label}</span><strong>{Number(value).toFixed(5)}</strong><small>{direction}</small></div>)}
        </div>
        <p className="mt-4 text-sm text-muted">{candidate.iterations} Lloyd iterations. Counts show the actual candidate assignments in aggregate; cluster numbers are arbitrary within each k. These single-seed candidate metrics are separate from the frozen 30-run manuscript comparison.</p>
      </> : <p role="status" className="existing-note">{error ?? "Validated baseline candidate values are not available yet."}</p>}
    </article>
  );
};
