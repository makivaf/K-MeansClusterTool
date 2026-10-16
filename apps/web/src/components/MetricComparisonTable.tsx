import "./MetricComparisonTable.css";
import { formatNumber } from "../utils/formatNumber";
export const metricDefinitions = [
  { key: "silhouette", field: "silhouette", label: "Silhouette Coefficient", direction: "higher" },
  { key: "davies_bouldin", field: "daviesBouldin", label: "Davies–Bouldin Index", direction: "lower" },
  { key: "calinski_harabasz", field: "calinskiHarabasz", label: "Calinski–Harabasz Index", direction: "higher" }
] as const;
export type MetricKey = typeof metricDefinitions[number]["key"];
export const formatMetric = (value: number | undefined, _useGrouping = false) => formatNumber(value, "metric");

// Percentage fields remain compatible with immutable legacy artifacts, but are never rendered.
export const MetricComparisonTable = ({ existing = {}, enhanced = {}, absoluteDifference, existingLabel = "Standard (mean of 30 runs)", enhancedLabel = "Enhanced", metrics, standardOnly = false, footerNote, existingSD, title = "Internal Validation", subtitle }: {
  title?: string | null; subtitle?: string;
  standardOnly?: boolean; existing?: Partial<Record<MetricKey, number>>; enhanced?: Partial<Record<MetricKey, number>>;
  existingSD?: Partial<Record<MetricKey, number>>;
  relativeChange?: Partial<Record<MetricKey, number | null>>; absoluteDifference?: Partial<Record<MetricKey, number>>;
  existingLabel?: string; enhancedLabel?: string; metrics?: readonly MetricKey[];
  changeConvention?: "signed" | "direction-aware"; footerNote?: string;
}) => <div className="internal-validation">
  {title && <h3 className="card-title">{title}</h3>}
  {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
  {standardOnly && <p className="internal-validation-helper">Clustering metrics for {existingLabel}.</p>}
  <div className="overflow-x-auto" role="region" aria-label="Internal validation metrics" tabIndex={0}>
    <table className={`internal-validation-table${standardOnly ? " is-standard-only" : ""}`}>
      {!standardOnly && <caption className="text-xs text-muted">{enhancedLabel} minus {existingLabel.replace(" (mean of 30 runs)", "")}</caption>}
      <thead><tr><th scope="col">Metric</th><th scope="col">{existingLabel}{existingSD && <small className="block">mean (SD)</small>}</th>{!standardOnly && <><th scope="col">{enhancedLabel}</th><th scope="col">Difference</th></>}</tr></thead>
      <tbody>{metricDefinitions.filter(({ key }) => !metrics || metrics.includes(key)).map(({ key, label, direction }) => <tr key={key}>
        <th scope="row"><span className="font-semibold">{label}</span><span className="internal-validation-hint">{direction === "higher" ? "Higher is better" : "Lower is better"}</span></th>
        <td className="tabular-nums">{formatMetric(existing[key])}{existingSD?.[key] !== undefined && ` (${formatMetric(existingSD[key])})`}</td>
        {!standardOnly && <><td className="tabular-nums">{formatMetric(enhanced[key])}</td><td className="tabular-nums">{formatMetric(absoluteDifference?.[key])}</td></>}
      </tr>)}</tbody>
    </table>
  </div>
  {footerNote && <p className="internal-validation-note">{footerNote}</p>}
</div>;
