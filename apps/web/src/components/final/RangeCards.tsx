import { formatNumber } from "../../utils/formatNumber";
import type { MethodResult } from "../../../../../packages/shared/src/methodExecution";
import { metricDefinitions } from "../MetricComparisonTable";
import { CalculationDetails } from "./CalculationDetails";
import { T } from "./ui";
type Condition = NonNullable<MethodResult["commonSpace"]>["spaces"][number]["conditions"]["standard"];
export function RangePlot({ before, after, beforeLabel = "Standard", afterLabel = "Enhanced" }: { before: Condition; after: Condition; beforeLabel?: string; afterLabel?: string }) {
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
  })}<p className="final-caption">Slate band: {beforeLabel} · Teal outline: {afterLabel}. Bands show stored run minimum and maximum. Both scored on the same 13 standardized variables.</p></div>;
}
export function RangeCards({ comparison, experiment = "final" }: { comparison?: MethodResult; experiment?: "sop1" | "sop3" | "final" }) {
  const space = comparison?.commonSpace?.spaces.find(s => s.primary && s.space === "standardized_13");
  if (!space) return <p role="status">Not available</p>;
  const before = space.conditions[experiment === "sop3" ? "pcaRandom" : "standard"];
  const after = space.conditions[experiment === "sop1" ? "pcaRandom" : "enhanced"];
  const beforeLabel = experiment === "sop3" ? "PCA + random" : "Standard";
  const afterLabel = experiment === "sop1" ? "PCA + random" : "Enhanced";
  return <><RangePlot before={before} after={after} beforeLabel={beforeLabel} afterLabel={afterLabel} />
    <CalculationDetails before={before} after={after} beforeLabel={beforeLabel} afterLabel={afterLabel} />
  </>;
}
