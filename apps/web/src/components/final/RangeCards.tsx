import { formatNumber } from "../../utils/formatNumber";
import type { MethodResult } from "../../../../../packages/shared/src/methodExecution";
import { metricDefinitions } from "../MetricComparisonTable";
import { CalculationDetails } from "./CalculationDetails";
import { T } from "./ui";
type Condition = NonNullable<MethodResult["commonSpace"]>["spaces"][number]["conditions"]["standard"];
export function RangePlot({ before, after, beforeLabel = "Standard", afterLabel = "Enhanced", spaceLabel = "15 standardized variables" }: { before: Condition; after: Condition; beforeLabel?: string; afterLabel?: string; spaceLabel?: string }) {
  return <div>{metricDefinitions.map(({ key, label, direction }) => {
    const values = [before.minimum[key], before.maximum[key], after.minimum[key], after.maximum[key]];
    const lo = Math.min(...values), hi = Math.max(...values), width = hi - lo || Math.abs(lo) * .01 || .01;
    const x = (v: number) => 20 + 360 * ((v - lo) / width + .1) / 1.2;
    return <div key={key} className="final-range-row"><div><strong>{label}</strong><small>{direction === "higher" ? "Higher is better" : "Lower is better"}</small></div>
      <svg viewBox="0 0 400 68" role="img" aria-label={`${label}: ${beforeLabel} range ${formatNumber(before.minimum[key])} to ${formatNumber(before.maximum[key])}; ${afterLabel} range ${formatNumber(after.minimum[key])} to ${formatNumber(after.maximum[key])}`}>
        <line x1={20} x2={380} y1={34} y2={34} stroke="#E2E8EC" />
        <rect x={x(before.minimum[key])} y={19} width={Math.max(1, x(before.maximum[key]) - x(before.minimum[key]))} height={12} fill={T.slate} opacity={.3} />
        <circle cx={x(before.mean[key])} cy={25} r={4} fill={T.slate} />
        <rect x={x(after.minimum[key])} y={37} width={Math.max(1, x(after.maximum[key]) - x(after.minimum[key]))} height={12} fill="none" stroke={T.teal} />
        <circle cx={x(after.mean[key])} cy={43} r={4} fill={T.teal} />
        <text x={20} y={65} fontSize={12} fill="#4F6672">{formatNumber(lo, "metric")}</text><text x={380} y={65} textAnchor="end" fontSize={12} fill="#4F6672">{formatNumber(hi, "metric")}</text>
      </svg><div><small>{beforeLabel}: {formatNumber(before.mean[key], "metric")}</small><small>{afterLabel}: {formatNumber(after.mean[key], "metric")}</small><strong>Difference {formatNumber(after.mean[key] - before.mean[key], "difference")}</strong></div></div>;
  })}<p className="final-caption">Slate band: {beforeLabel} · Teal outline: {afterLabel}. Bands show stored run minimum and maximum. Both scored on the same {spaceLabel}.</p></div>;
}
export function RangeCards({ comparison, experiment = "final" }: { comparison?: MethodResult; experiment?: "sop1" | "sop3" | "final" }) {
  const spaces = comparison?.commonSpace?.spaces.filter(s => experiment !== "sop3" || s.space === "retained_pcs");
  if (!spaces?.length) return <p role="status">Not available</p>;
  return <>{spaces.map(space => {
    const before = space.conditions[experiment === "sop3" ? "pcaRandom" : "standard"];
    const after = space.conditions[experiment === "sop1" ? "pcaRandom" : "enhanced"];
    const beforeLabel = experiment === "sop3" ? "PCA + random" : "Standard";
    const afterLabel = experiment === "sop1" ? "PCA + random" : "Enhanced";
    const spaceLabel = `${formatNumber(space.dimensions, "count")} ${space.space === "standardized_13" ? "standardized variables" : "PCs"}`;
    return <section key={space.space}><h4>{spaceLabel}</h4><RangePlot before={before} after={after} beforeLabel={beforeLabel} afterLabel={afterLabel} spaceLabel={spaceLabel} />
      <CalculationDetails before={before.calculation} after={after.calculation} beforeLabel={beforeLabel} afterLabel={afterLabel} /></section>;
  })}</>;
}

type Metrics = NonNullable<MethodResult["standard"]>["metrics"];
export function NativeMetricTable({ before, after, dimensions, components, pca = false }: { before?: Metrics; after?: Metrics; dimensions?: number; components?: number; pca?: boolean }) {
  return <><table><thead><tr><th>Metric</th><th>Standard K-Means ({formatNumber(dimensions, "count")} variables, mean of 30 seeds)</th><th>{pca ? "PCA + random" : "Enhanced K-Means"} ({formatNumber(components, "count")} PCs)</th><th>Improvement</th></tr></thead><tbody>
    {metricDefinitions.filter(({ key }) => !pca || key === "silhouette").map(({ key, label, direction }) => {
      const a = before?.[key], b = after?.[key];
      const change = a === undefined || b === undefined || a === 0 ? undefined : (b - a) / a * 100;
      return <tr key={key}><th>{label}<small style={{ display: "block" }}>{direction === "higher" ? "Higher is better" : "Lower is better"}</small></th><td>{formatNumber(a, "calculation", "Not available")}</td><td>{formatNumber(b, "calculation", "Not available")}</td><td>{change === undefined ? "Not available" : `${change >= 0 ? "+" : ""}${formatNumber(change, "percentage")}`}</td></tr>;
    })}</tbody></table></>;
}
