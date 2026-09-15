export const metricDefinitions = [
  { key: "silhouette", field: "silhouette", label: "Silhouette Coefficient", direction: "higher" },
  { key: "davies_bouldin", field: "daviesBouldin", label: "Davies–Bouldin Index", direction: "lower" },
  { key: "calinski_harabasz", field: "calinskiHarabasz", label: "Calinski–Harabasz Index", direction: "higher" }
] as const;
export type MetricKey = typeof metricDefinitions[number]["key"];
export const formatMetric = (value: number | undefined) => value === undefined ? "—" : value.toFixed(6);

export const MetricComparisonTable = ({ existing = {}, enhanced = {} }: {
  existing?: Partial<Record<MetricKey, number>>;
  enhanced?: Partial<Record<MetricKey, number>>;
}) => <div className="overflow-x-auto"><table className="research-table">
  <thead><tr><th>Metric</th><th className="text-right">Existing</th><th className="text-right">Enhanced</th></tr></thead>
  <tbody>{metricDefinitions.map(({ key, label, direction }) => <tr key={key}>
    <td><span className="font-medium">{label}</span><span className="mt-1 block text-xs text-muted">{direction} is better</span></td>
    <td className="text-right tabular-nums">{formatMetric(existing[key])}</td>
    <td className="text-right tabular-nums">{formatMetric(enhanced[key])}</td>
  </tr>)}</tbody>
</table></div>;
