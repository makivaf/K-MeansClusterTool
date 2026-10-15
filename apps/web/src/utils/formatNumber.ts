export type NumberKind = "metric" | "sd" | "difference" | "ari" | "calculation" | "percentage" | "percentage1" | "correlation" | "correlationCell" | "correlationTooltip" | "loading" | "eigenvalue" | "delta" | "gamma" | "rho" | "lme" | "pValue" | "count" | "axis" | "axis2" | "axisTick2" | "axisPercentage" | "duration";
const digits: Record<NumberKind, number> = { metric: 5, sd: 5, difference: 5, ari: 5, calculation: 6, percentage: 5, percentage1: 5, correlation: 5, correlationCell: 2, correlationTooltip: 5, loading: 5, eigenvalue: 5, delta: 5, gamma: 5, rho: 5, lme: 5, pValue: 5, count: 0, axis: 3, axis2: 5, axisTick2: 2, axisPercentage: 2, duration: 5 };
const formats = new Map<NumberKind, Intl.NumberFormat>();
export function formatNumber(value: number | undefined | null, kind: NumberKind = "metric", unavailable = "—"): string {
  if (value == null || !Number.isFinite(value)) return unavailable;
  if (kind === "rho" && Number.isInteger(value)) return formatNumber(value, "count", unavailable);
  const precision = digits[kind];
  const normalized = Math.abs(value) < 0.5 * 10 ** -precision ? 0 : value;
  let formatter = formats.get(kind);
  if (!formatter) {
    formatter = new Intl.NumberFormat("en-US", { minimumFractionDigits: precision, maximumFractionDigits: precision, useGrouping: kind !== "pValue" });
    formats.set(kind, formatter);
  }
  return formatter.format(normalized) + (kind === "percentage" || kind === "percentage1" || kind === "axisPercentage" ? "%" : "");
}
