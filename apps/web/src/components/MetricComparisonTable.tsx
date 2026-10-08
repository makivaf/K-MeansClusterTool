import "./MetricComparisonTable.css";
import { formatContinuous, formatPercent } from "../utils/numberFormatting";
export const metricDefinitions = [
  { key: "silhouette", field: "silhouette", label: "Silhouette Coefficient", direction: "higher" },
  { key: "davies_bouldin", field: "daviesBouldin", label: "Davies–Bouldin Index", direction: "lower" },
  { key: "calinski_harabasz", field: "calinskiHarabasz", label: "Calinski–Harabasz Index", direction: "higher" }
] as const;
export type MetricKey = typeof metricDefinitions[number]["key"];
// Retain the legacy argument for callers; shared formatting now owns grouping.
export const formatMetric = (value: number | undefined, _useGrouping = false) => formatContinuous(value);

// API percentages are either signed changes or direction-aware improvements.
// Normalize only their displayed sign; never derive percentages from metrics.
export const formatImprovement = (value: number | null | undefined, direction: "higher" | "lower", convention: "signed" | "direction-aware" = "signed") => {
  if (value == null) return "Unavailable";
  const signed = convention === "direction-aware" && direction === "lower" ? -value : value;
  return `${signed > 0 ? "+" : ""}${formatPercent(signed === 0 ? 0 : signed)}`;
};

export const MetricComparisonTable = ({ existing = {}, enhanced = {}, relativeChange, existingLabel = "Standard", enhancedLabel = "Enhanced", metrics, standardOnly = false, changeConvention = "signed", footerNote }: {
  standardOnly?: boolean;
  existing?: Partial<Record<MetricKey, number>>;
  enhanced?: Partial<Record<MetricKey, number>>;
  relativeChange?: Partial<Record<MetricKey, number | null>>;
  existingLabel?: string;
  enhancedLabel?: string;
  metrics?: readonly MetricKey[];
  changeConvention?: "signed" | "direction-aware";
  footerNote?: string;
}) => <div className="internal-validation">
  <h3 className="card-title">Internal Validation</h3>
  <p className="internal-validation-helper">{standardOnly ? "Clustering metrics for Standard K-Means." : metrics?.length === 1 && metrics[0] === "silhouette" ? "Silhouette Coefficient comparison." : "Silhouette Coefficient, Davies-Bouldin Index, and Calinski-Harabasz Index comparison."}</p>
  <div className="overflow-x-auto"><table className="internal-validation-table">
    <thead><tr><th scope="col">Metric</th><th scope="col">{existingLabel}</th>{!standardOnly && <><th scope="col" className="internal-validation-enhanced">{enhancedLabel}</th><th scope="col" className="internal-validation-enhanced">Improvement</th></>}</tr></thead>
    <tbody>{metricDefinitions.filter(({ key }) => !metrics || metrics.includes(key)).map(({ key, label, direction }) => {
      const change = relativeChange?.[key];
      const signed = change == null ? undefined : changeConvention === "direction-aware" && direction === "lower" ? -change : change;
      const favorable = signed !== undefined && (direction === "lower" ? signed < 0 : signed > 0);
      return <tr key={key}>
        <th scope="row"><span className="font-semibold">{label} <span className="internal-validation-direction" aria-label={direction === "higher" ? "Higher is better" : "Lower is better"}>{direction === "higher" ? "\u2191" : "\u2193"}</span></span><span className="internal-validation-hint">{direction === "higher" ? "Higher is better" : "Lower is better"}</span></th>
        <td className="tabular-nums">{formatMetric(existing[key])}</td>
        {!standardOnly && <><td className="internal-validation-enhanced font-semibold tabular-nums">{formatMetric(enhanced[key])}</td>
          <td className={`tabular-nums ${favorable ? "internal-validation-enhanced font-semibold" : ""}`}>{formatImprovement(change, direction, changeConvention)}{change != null && <span aria-hidden="true"> {direction === "higher" ? "\u2191" : "\u2193"}</span>}</td></>}
      </tr>;
    })}</tbody>
  </table></div>
  {footerNote && <p className="internal-validation-note">{footerNote}</p>}
</div>;
