export const metricDefinitions = [
  { key: "silhouette", field: "silhouette", label: "Silhouette Coefficient", direction: "higher" },
  { key: "davies_bouldin", field: "daviesBouldin", label: "Davies–Bouldin Index", direction: "lower" },
  { key: "calinski_harabasz", field: "calinskiHarabasz", label: "Calinski–Harabasz Index", direction: "higher" }
] as const;
export type MetricKey = typeof metricDefinitions[number]["key"];
export const formatMetric = (value: number | undefined, useGrouping = false) => value === undefined ? "—" : useGrouping
  ? value.toLocaleString("en-US", { minimumFractionDigits: 6, maximumFractionDigits: 6 })
  : value.toFixed(6);

export const MetricComparisonTable = ({ existing = {}, enhanced = {}, relativeChange, existingLabel = "Standard K-Means", enhancedLabel = "Enhanced K-Means", metrics }: {
  existing?: Partial<Record<MetricKey, number>>;
  enhanced?: Partial<Record<MetricKey, number>>;
  relativeChange?: Partial<Record<MetricKey, number>>;
  existingLabel?: string;
  enhancedLabel?: string;
  metrics?: readonly MetricKey[];
}) => <div className="overflow-x-auto"><table className="research-table">
  <thead><tr><th>Metric</th><th className="text-right">{existingLabel}</th><th className="text-right">{enhancedLabel}</th>{relativeChange && <th className="text-right">Relative Change</th>}</tr></thead>
  <tbody>{metricDefinitions.filter(({ key }) => !metrics || metrics.includes(key)).map(({ key, label, direction }) => <tr key={key}>
    <td><span className="font-medium">{label}</span><span className="mt-1 block text-xs text-muted">{direction} is better</span></td>
    <td className="text-right tabular-nums">{formatMetric(existing[key])}</td>
    <td className={`text-right tabular-nums ${relativeChange ? "font-semibold text-teal-800" : ""}`}>{formatMetric(enhanced[key])}</td>
    {relativeChange && <td className="text-right font-semibold tabular-nums text-teal-800">{relativeChange[key] === undefined ? "—" : relativeChange[key]! < 0
      ? `${Math.abs(relativeChange[key]!).toFixed(2)}% lower` : `+${relativeChange[key]!.toFixed(2)}%`}</td>}
  </tr>)}</tbody>
</table></div>;
