import { useState } from "react";
import { formatNumber } from "../../utils/formatNumber";
import { T } from "./ui";
const short: Record<string, string> = { CATEGORY_FLUENCY_ANIMALS: "Fluency", RAVLT_IMMEDIATE: "RAVLT-I", RAVLT_DELAYED: "RAVLT-D", RAVLT_FORGETTING: "RAVLT-F" };
export const shortVariableName = (variable: string) => short[variable] ?? variable;
export function Heatmap({ matrix, labels, ari = false, order }: { matrix: readonly (readonly (number | null)[])[]; labels: string[]; ari?: boolean; order?: number[] }) {
  const [hover, setHover] = useState<string | null>(null);
  const indices = order ?? labels.map((_, i) => i);
  const axisLabel = (i: number) => ari ? (Number(labels[i].split(" ")[1]) % 5 === 0 ? labels[i] : "") : shortVariableName(labels[i]);
  return <figure><div className={`final-heatmap${ari ? " final-ari" : ""}`}><table aria-label={ari ? "Pairwise ARI matrix" : "Correlation matrix"}>
    <thead><tr><th />{indices.map(i => <th key={i} title={labels[i]}>{axisLabel(i)}</th>)}</tr></thead>
    <tbody>{indices.map(i => <tr key={i}><th title={labels[i]}>{axisLabel(i)}</th>{indices.map(j => {
      const value = matrix[i]?.[j];
      const caption = ari ? `${labels[i]} vs ${labels[j]}: ARI ${formatNumber(value, "ari", "Not available")}` : `${labels[i]} vs ${labels[j]}: ${formatNumber(value, "correlationTooltip", "Not available")}`;
      const intensity = value == null ? 0 : ari ? Math.max(0, Math.min(1, (value - .990) / .010)) : Math.abs(value);
      return <td key={j} tabIndex={0} aria-label={caption} title={caption} onMouseEnter={() => setHover(caption)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(caption)} onBlur={() => setHover(null)}
        style={{ background: value == null ? T.zero : `color-mix(in srgb, ${ari ? T.teal : value < 0 ? T.negative : T.positive} ${intensity * 85}%, ${T.zero})`, color: intensity > .6 ? "white" : "#1A1A1A" }}>
        {ari ? "" : formatNumber(value, "correlation", "Not available")}</td>;
    })}</tr>)}</tbody>
  </table></div><figcaption className="final-caption" aria-live="polite">{hover ?? (ari ? "Hover a cell to inspect run agreement." : "Hover a cell to inspect the correlation.")}</figcaption>
  <div className="final-caption" style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}><span>{ari ? formatNumber(.990, "axis") : formatNumber(-1, "count")}</span><span style={{ width: 160, height: 8, background: ari ? `linear-gradient(90deg,${T.zero},${T.teal})` : `linear-gradient(90deg,${T.negative},${T.zero},${T.positive})` }} /><span>{ari ? formatNumber(1, "axis") : formatNumber(1, "count")}</span>{ari && <span>ARI</span>}</div></figure>;
}
