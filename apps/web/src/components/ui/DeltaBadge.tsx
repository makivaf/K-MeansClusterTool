import { ArrowDown, ArrowUp } from "lucide-react";

type DeltaBadgeProps = {
  value: number;
  improved: boolean;
  precision?: number;
};

export const DeltaBadge = ({ value, improved, precision = 3 }: DeltaBadgeProps) => {
  const Icon = value >= 0 ? ArrowUp : ArrowDown;
  return (
    <span
      className={[
        "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold",
        improved ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
      ].join(" ")}
    >
      <Icon size={14} strokeWidth={2.2} />
      {value >= 0 ? "+" : ""}
      {value.toFixed(precision)}
    </span>
  );
};
