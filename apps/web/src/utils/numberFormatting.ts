// Display only. Percent inputs are already on the 0-100 scale.
import { formatNumber } from "./formatNumber";

export const formatContinuous = (value: number | undefined, unavailable = "—") => formatNumber(value, "calculation", unavailable);
export const formatPercent = (value: number) => formatNumber(value, "percentage");
export const formatInteger = (value: number) => formatNumber(value, "count");
