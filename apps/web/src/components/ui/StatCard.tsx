import type { ReactNode } from "react";

type StatCardProps = {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  accent?: "teal" | "amber" | "slate";
};

const accents = {
  teal: "border-teal-100 bg-teal-50/60",
  amber: "border-amber-100 bg-amber-50/60",
  slate: "border-line bg-white"
};

export const StatCard = ({ label, value, detail, accent = "slate" }: StatCardProps) => (
  <div className={`rounded-xl border p-4 shadow-sm ${accents[accent]}`}>
    <div className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</div>
    <div className="mt-2 text-2xl font-semibold text-ink sm:text-3xl">{value}</div>
    {detail ? <div className="mt-2 text-xs leading-5 text-muted">{detail}</div> : null}
  </div>
);
