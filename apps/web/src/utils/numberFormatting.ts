// Display only. Percent inputs are already on the 0-100 scale.
const continuous = new Intl.NumberFormat("en-US", { minimumFractionDigits: 6, maximumFractionDigits: 6 });
const percentage = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const integer = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export const formatContinuous = (value: number | undefined, unavailable = "—") => value === undefined ? unavailable : continuous.format(value);
export const formatPercent = (value: number) => `${percentage.format(value)}%`;
export const formatInteger = (value: number) => integer.format(value);
