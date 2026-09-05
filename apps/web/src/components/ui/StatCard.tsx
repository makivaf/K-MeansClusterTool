import type { ReactNode } from "react";

type StatCardProps = {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  accent?: "teal" | "amber" | "slate";
};

const accents = {
  teal: "border-line border-l-teal-600 bg-teal-50/40",
  amber: "border-line border-l-amber-500 bg-amber-50/40",
  slate: "border-line border-l-slate-300 bg-white"
};

export const StatCard = ({ label, value, detail, accent = "slate" }: StatCardProps) => (
  <div className={`min-w-0 rounded-sm border border-l-2 px-3.5 py-3 ${accents[accent]}`}>
    <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{label}</div>
    <div className="mt-1.5 break-words text-xl font-semibold tracking-tight text-ink tabular-nums sm:text-2xl">{value}</div>
    {detail ? <div className="mt-1.5 text-xs leading-5 text-muted">{detail}</div> : null}
  </div>
);
