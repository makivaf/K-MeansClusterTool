import {
  BarChart3,
  Brain,
  ClipboardList,
  PanelLeftClose,
  PanelLeftOpen,
  FlaskConical,
  History,
  Menu,
  UploadCloud
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import type { RunDataState } from "../../hooks/useRunData";
import { researchPages } from "./researchNavigation";

const navIcons = [ClipboardList, FlaskConical, BarChart3, History];
const navItems = researchPages.map((page, index) => ({ ...page, icon: navIcons[index] }));

type AppShellProps = RunDataState & { children: ReactNode; persistentContent?: ReactNode; allowWithoutRun?: boolean };

const navigationClass = ({ isActive }: { isActive: boolean }) => [
  "flex min-w-0 items-center gap-2 border-l-2 px-3 py-2.5 text-sm font-medium transition",
  isActive ? "border-teal-600 bg-teal-50/70 text-teal-900" : "border-transparent text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:text-ink"
].join(" ");

const collapsedNavigationClass = ({ isActive }: { isActive: boolean }) => [
  "flex h-11 w-11 items-center justify-center rounded-sm border-l-2 transition",
  isActive ? "border-teal-600 bg-teal-50/80 text-teal-900" : "border-transparent text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:text-ink"
].join(" ");

const runAnalysisClass = ({ isActive }: { isActive: boolean }) => [
  "inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-sm border border-teal-700 bg-teal-700 px-3 text-sm font-semibold text-white transition hover:bg-teal-900 focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 sm:px-4",
  isActive ? "outline outline-2 outline-offset-2 outline-teal-200" : ""
].join(" ");

export const AppShell = ({
  children,
  persistentContent,
  selectedRun,
  isLoading,
  error,
  allowWithoutRun = false
}: AppShellProps) => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const sidebarWidthClass = sidebarCollapsed ? "lg:w-[76px]" : "lg:w-[248px]";
  const mainOffsetClass = sidebarCollapsed ? "lg:ml-[76px]" : "lg:ml-[248px]";

  return (
  <div className="min-h-screen bg-canvas text-ink">
    <aside className={`fixed inset-y-0 left-0 z-20 hidden border-r border-line bg-white transition-[width] duration-200 lg:block ${sidebarWidthClass}`}>
      <div className="flex h-full flex-col">
        <div className={`flex h-[72px] items-center gap-3 border-b border-line ${sidebarCollapsed ? "justify-center px-3" : "px-5"}`}>
          <div className="flex h-9 w-9 items-center justify-center rounded-sm bg-teal-700 text-white">
            <Brain size={21} strokeWidth={2} />
          </div>
          <div className={sidebarCollapsed ? "sr-only" : ""}>
            <div className="whitespace-nowrap text-base font-semibold">AD Progression Lab</div>
            <div className="text-xs font-medium text-muted">Unified thesis pipeline</div>
          </div>
        </div>
        <nav className={`flex-1 space-y-1 py-4 ${sidebarCollapsed ? "px-4" : "px-3"}`} aria-label="Research sections">
          {navItems.map(({ path, step, label, icon: Icon }) => (
            <NavLink key={path} to={path} className={sidebarCollapsed ? collapsedNavigationClass : navigationClass} title={sidebarCollapsed ? `${step} ${label}` : undefined}>
              <Icon size={18} strokeWidth={1.9} />
              <span className={sidebarCollapsed ? "sr-only" : "truncate"}><span className="mr-2 text-[11px] tabular-nums text-muted">{step}</span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className={`border-t border-line p-3 ${sidebarCollapsed ? "" : "flex justify-end"}`}>
          <button
            type="button"
            className={`${sidebarCollapsed ? "w-full" : "w-10"} flex h-10 items-center justify-center rounded-sm text-sm font-semibold text-teal-800 transition hover:bg-teal-50 focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2`}
            onClick={() => setSidebarCollapsed((current) => !current)}
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            <span className="sr-only">{sidebarCollapsed ? "Expand" : "Collapse"}</span>
          </button>
        </div>
      </div>
    </aside>

    {mobileNavOpen ? <button type="button" className="fixed inset-0 z-20 bg-slate-950/30 lg:hidden" aria-label="Close navigation menu" onClick={() => setMobileNavOpen(false)} /> : null}
    <aside className={`fixed inset-y-0 left-0 z-30 w-[min(82vw,20rem)] border-r border-line bg-white transition-transform duration-200 lg:hidden ${mobileNavOpen ? "translate-x-0" : "-translate-x-full"}`}>
      <div className="flex h-[64px] items-center gap-3 border-b border-line px-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-sm bg-teal-700 text-white"><Brain size={20} /></div>
        <div><div className="text-base font-semibold">AD Progression Lab</div><div className="text-xs font-medium text-muted">Unified thesis pipeline</div></div>
      </div>
      <nav className="space-y-1 px-3 py-4" aria-label="Research sections">
        {navItems.map(({ path, step, label, icon: Icon }) => (
          <NavLink key={path} to={path} className={navigationClass} onClick={() => setMobileNavOpen(false)}>
            <Icon size={18} strokeWidth={1.9} />
            <span className="truncate"><span className="mr-2 text-[11px] tabular-nums text-muted">{step}</span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>

    <main className={`min-h-screen min-w-0 transition-[margin] duration-200 ${mainOffsetClass}`}>
      <header className="sticky top-0 z-10 border-b border-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex min-h-16 max-w-[1320px] items-center justify-between gap-3 px-4 py-2.5 sm:gap-5 sm:px-6 lg:h-[72px] lg:py-0">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-teal-700 text-white lg:hidden" onClick={() => setMobileNavOpen(true)} aria-label="Open navigation menu">
              <Menu size={19} />
            </button>
          </div>
          <NavLink to="/upload-run" className={runAnalysisClass}>
            <UploadCloud size={17} aria-hidden="true" />
            <span className="hidden sm:inline">Run Analysis</span>
            <span className="sm:hidden">Run</span>
          </NavLink>
        </div>
      </header>

      <div className="mx-auto max-w-[1320px] min-w-0 px-4 py-6 sm:px-6 sm:py-8">
        {persistentContent}
        {error ? <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}
        {isLoading ? (
          <div aria-live="polite" className="rounded-md border border-line bg-white p-6 text-sm text-muted">Loading unified research run...</div>
        ) : !selectedRun && !error && !allowWithoutRun ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
            <h1 className="text-base font-semibold text-amber-950">No validated unified run is available</h1>
            <p className="mt-2 leading-6">Run an analysis with the local scientific pipeline to generate the aggregate results used by these views.</p>
            <NavLink
              to="/upload-run"
              className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-sm bg-teal-700 px-4 text-sm font-semibold text-white transition hover:bg-teal-900 focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2"
            >
              <UploadCloud size={17} aria-hidden="true" />
              Run Analysis
            </NavLink>
          </div>
        ) : children}
      </div>
    </main>
  </div>
  );
};
