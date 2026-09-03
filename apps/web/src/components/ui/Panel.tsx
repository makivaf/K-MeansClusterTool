import type { ReactNode } from "react";

type PanelProps = {
  title: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
  variant?: "legacy" | "surface" | "result" | "section";
};

const panelStyles = {
  legacy: "rounded-xl border border-line bg-panel shadow-panel",
  surface: "rounded-md border border-line bg-panel",
  result: "rounded-md border border-teal-100 bg-panel shadow-[inset_3px_0_0_#0f7977]",
  section: "border-t border-line bg-transparent"
};

const headerStyles = {
  legacy: "min-h-14 border-b border-line px-4",
  surface: "min-h-12 border-b border-line px-4 sm:px-5",
  result: "min-h-12 border-b border-line px-4 sm:px-5",
  section: "pt-5"
};

const bodyStyles = {
  legacy: "p-4",
  surface: "p-4 sm:p-5",
  result: "p-4 sm:p-5",
  section: "pt-4"
};

export const Panel = ({ title, children, action, className = "", variant = "legacy" }: PanelProps) => (
  <section className={`${panelStyles[variant]} ${className}`}>
    <div className={`flex items-center justify-between ${headerStyles[variant]}`}>
      <h2 className={variant === "result" ? "text-lg font-semibold tracking-tight text-teal-900" : "text-base font-semibold tracking-tight"}>{title}</h2>
      {action}
    </div>
    <div className={bodyStyles[variant]}>{children}</div>
  </section>
);
