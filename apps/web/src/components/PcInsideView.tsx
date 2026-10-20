import { useId, useMemo, useState } from "react";
import type { PcaLoadingEvidence } from "../utils/pcaLoadings";
import { getMeasureLabel } from "../utils/measureLabels";
import { formatPercent } from "../utils/numberFormatting";
import "./PcInsideView.css";

const shortName: Record<string, string> = {
  CATEGORY_FLUENCY_ANIMALS: "Category Fluency", RAVLT_IMMEDIATE: "RAVLT Immediate", RAVLT_DELAYED: "RAVLT Delayed",
  RAVLT_FORGETTING: "RAVLT Forgetting", TMT_A: "TMT-A", TMT_B: "TMT-B", ADAS13: "ADAS-Cog13", CDRSB: "CDR-SB", NPIQ: "NPI-Q"
};
const nameOf = (variable: string) => shortName[variable] ?? variable;
export const STRONG_LOADING = 0.4;

export type ScreeRow = { component: number; eigenvalue?: number; individualVariance?: number; cumulativeVariance: number };

/** Share of each standardized variable's variance reproduced by the first `retained` components. */
export const retainedShareByVariable = (loadings: PcaLoadingEvidence, scree: readonly ScreeRow[], retained: number): number[] | undefined => {
  const eigen = loadings.components.map((_, index) => scree.find(row => row.component === index + 1)?.eigenvalue);
  if (eigen.some(value => value === undefined || !Number.isFinite(value))) return undefined;
  return loadings.values.map(row => {
    const parts = row.map((value, index) => value * value * (eigen[index] as number));
    const total = parts.reduce((sum, value) => sum + value, 0);
    return total > 0 ? parts.slice(0, retained).reduce((sum, value) => sum + value, 0) / total : 0;
  });
};

export const PcInsideView = ({ loadings, scree, retained }: {
  loadings: PcaLoadingEvidence; scree: readonly ScreeRow[]; retained: number;
}) => {
  const [selected, setSelected] = useState(0);
  const headingId = useId();
  const share = useMemo(() => retainedShareByVariable(loadings, scree, retained), [loadings, scree, retained]);
  const kept = scree.find(row => row.component === retained)?.cumulativeVariance;
  if (retained < 1 || loadings.components.length < retained) return null;
  const column = Math.min(selected, retained - 1);
  const eigenvalue = scree.find(row => row.component === column + 1)?.eigenvalue;
  if (eigenvalue === undefined || !Number.isFinite(eigenvalue) || eigenvalue < 0) return null;
  const bars = loadings.variables.map((variable, index) => ({ variable, value: loadings.values[index][column] * Math.sqrt(scree.find(row => row.component === column + 1)!.individualVariance! * loadings.variables.length) }))
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  const scale = 1;
  const shares = share ? loadings.variables.map((variable, index) => ({ variable, share: share[index] }))
    .sort((a, b) => a.share - b.share) : [];

  return <section className="sop-support-card pc-inside" aria-labelledby={headingId}>
    <h3 id={headingId} className="card-title mb-1">What Is Inside Each Principal Component</h3>
    <p className="text-xs text-muted mb-3">Bars show loadings (correlation between each standardized variable and the component). Bold rows are |loading| ≥ 0.40. Component signs are arbitrary; only relative signs within a component are interpretable.</p>

    <div className="pc-inside-tabs" role="tablist" aria-label="Retained principal components">
      {loadings.components.slice(0, retained).map((label, index) => {
        const variance = scree.find(entry => entry.component === index + 1)?.individualVariance;
        return <button key={label} type="button" role="tab" aria-selected={column === index}
          className={column === index ? "is-active" : undefined} onClick={() => setSelected(index)}>
          <strong>{label}</strong>{variance !== undefined && <span>{(variance * 100).toFixed(2)}%</span>}
        </button>;
      })}
    </div>

    <p className="text-xs text-muted">PC{column + 1}: {bars.filter(bar => Math.abs(bar.value) >= STRONG_LOADING).length} of {bars.length} |loading| ≥ {STRONG_LOADING.toFixed(2)}</p>
    <div className="pc-inside-body" role="tabpanel" aria-label={`PC${column + 1} contents`}>
      <ol className="pc-inside-bars" aria-label={`Loadings on PC${column + 1}, largest first; axis range -1 to 1`}>
        {bars.map(bar => {
          const width = 50 * Math.abs(bar.value) / scale;
          const isStrong = Math.abs(bar.value) >= STRONG_LOADING;
          return <li key={bar.variable} className={isStrong ? "is-strong" : undefined}
            title={`${getMeasureLabel(bar.variable)} · loading ${bar.value > 0 ? "+" : ""}${bar.value.toFixed(3)}`}>
            <span className="pc-inside-name">{nameOf(bar.variable)}</span>
            <span className="pc-inside-track" aria-hidden="true">
              <i className="pc-inside-axis" />
              <i className="pc-inside-threshold is-left" style={{ left: `${50 - 50 * STRONG_LOADING / scale}%` }} />
              <i className="pc-inside-threshold is-right" style={{ left: `${50 + 50 * STRONG_LOADING / scale}%` }} />
              <b className={bar.value < 0 ? "is-negative" : "is-positive"}
                style={bar.value < 0 ? { right: "50%", width: `${width}%` } : { left: "50%", width: `${width}%` }} />
            </span>
            <span className="pc-inside-value tabular-nums">{bar.value > 0 ? "+" : ""}{bar.value.toFixed(3)}</span>
          </li>;
        })}
      </ol>
    </div>

    {share && <div className="pc-inside-kept">
      <h4 className="card-title mb-2">How much of each test PC1–PC{retained} keep{kept !== undefined && <span className="text-xs text-muted"> · overall {formatPercent(kept * 100)}</span>}</h4>
      <ol className="pc-inside-shares">
        {shares.map(entry => <li key={entry.variable} title={getMeasureLabel(entry.variable)}>
          <span className="pc-inside-name">{nameOf(entry.variable)}</span>
          <span className="pc-inside-share-track" aria-hidden="true"><b style={{ width: `${100 * entry.share}%` }} /></span>
          <span className="pc-inside-value tabular-nums">{formatPercent(entry.share * 100)}</span>
        </li>)}
      </ol>
    </div>}
  </section>;
};
