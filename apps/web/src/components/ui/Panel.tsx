import type { ReactNode } from "react";

type PanelProps = {
  title: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
};

export const Panel = ({ title, children, action, className = "" }: PanelProps) => (
  <section className={`rounded-md border border-line bg-panel shadow-panel ${className}`}>
    <div className="flex min-h-14 items-center justify-between border-b border-line px-4">
      <h2 className="text-base font-semibold tracking-normal">{title}</h2>
      {action}
    </div>
    <div className="p-4">{children}</div>
  </section>
);
