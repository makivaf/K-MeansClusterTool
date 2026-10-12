export type NumberKind = "metric" | "sd" | "difference" | "ari" | "calculation" | "percentage" | "percentage1" | "correlation" | "correlationTooltip" | "loading" | "eigenvalue" | "delta" | "gamma" | "rho" | "lme" | "pValue" | "count" | "axis" | "axis2" | "duration";
const digits: Record<NumberKind, number> = { metric: 4, sd: 4, difference: 4, ari: 4, calculation: 6, percentage: 2, percentage1: 1, correlation: 2, correlationTooltip: 4, loading: 3, eigenvalue: 3, delta: 4, gamma: 2, rho: 0, lme: 3, pValue: 3, count: 0, axis: 3, axis2: 2, duration: 3 };
const formats = new Map<NumberKind, Intl.NumberFormat>();
export function formatNumber(value: number | undefined | null, kind: NumberKind = "metric", unavailable = "—"): string {
  if (value == null || !Number.isFinite(value)) return unavailable;
  if (kind === "pValue" && value < 0.001) return "< 0.001";
  const precision = digits[kind];
  const normalized = Math.abs(value) < 0.5 * 10 ** -precision ? 0 : value;
  let formatter = formats.get(kind);
  if (!formatter) {
    formatter = new Intl.NumberFormat("en-US", { minimumFractionDigits: precision, maximumFractionDigits: precision, useGrouping: kind !== "pValue" });
    formats.set(kind, formatter);
  }
  return formatter.format(normalized) + (kind === "percentage" || kind === "percentage1" ? "%" : "");
}
