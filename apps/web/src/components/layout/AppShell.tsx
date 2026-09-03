import {
  Activity,
  BarChart3,
  Brain,
  GitCompare,
  Home,
  UploadCloud,
  Users
} from "lucide-react";
import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import type { RunDataState } from "../../hooks/useRunData";
import { RunSelector } from "../run/RunSelector";
import { researchPages } from "./researchNavigation";

const navIcons = [Home, BarChart3, Users, GitCompare, Activity];
const navItems = researchPages.map((page, index) => ({ ...page, icon: navIcons[index] }));

type AppShellProps = RunDataState & { children: ReactNode; allowWithoutRun?: boolean };

const navigationClass = ({ isActive }: { isActive: boolean }) => [
  "flex min-w-0 items-center gap-2 border-l-2 px-3 py-2 text-sm font-medium transition",
  isActive ? "border-teal-600 bg-teal-50/70 text-teal-900" : "border-transparent text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:text-ink"
].join(" ");

const primaryActionClass = ({ isActive }: { isActive: boolean }) => [
  "flex shrink-0 items-center gap-3 rounded-sm border border-teal-700 bg-teal-700 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-900 focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2",
  isActive ? "outline outline-2 outline-offset-2 outline-teal-200" : ""
].join(" ");

export const AppShell = ({
  children,
  runs,
  selectedRunId,
  selectedRun,
  isLoading,
  error,
  setSelectedRunId,
  allowWithoutRun = false
}: AppShellProps) => (
  <div className="min-h-screen bg-canvas text-ink">
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-[248px] border-r border-line bg-white lg:block">
      <div className="flex h-full flex-col">
        <div className="flex h-[72px] items-center gap-3 border-b border-line px-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-sm bg-teal-700 text-white">
            <Brain size={21} strokeWidth={2} />
          </div>
          <div>
            <div className="whitespace-nowrap text-base font-semibold">AD Progression Lab</div>
            <div className="text-xs font-medium text-muted">Unified thesis pipeline</div>
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 px-3 py-4" aria-label="Research sections">
          <NavLink to="/upload-run" className={primaryActionClass}>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center border border-white/20" aria-hidden="true">
              <UploadCloud size={19} strokeWidth={2} />
            </span>
            <span>
              <span className="block">Run Analysis</span>
              <span className="mt-0.5 block text-xs font-medium text-teal-50">Seven-file unified pipeline</span>
            </span>
          </NavLink>
          <div className="my-3 border-t border-line" />
          {navItems.map(({ path, step, label, icon: Icon }) => (
            <NavLink key={path} to={path} className={navigationClass}>
              <Icon size={18} strokeWidth={1.9} />
              <span className="truncate"><span className="mr-2 text-[11px] tabular-nums text-muted">{step}</span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="mx-4 mb-4 border-t border-line pt-4 text-xs leading-5">
          <div className="font-semibold text-ink">Parent cohort</div>
          <div className="text-muted">{selectedRun?.cohort.parentN.toLocaleString() ?? "—"} clustered participants</div>
          <div className="mt-3 font-semibold text-ink">Longitudinal subset</div>
          <div className="text-muted">{selectedRun?.cohort.longitudinalEligibleN.toLocaleString() ?? "—"} eligible participants</div>
        </div>
      </div>
    </aside>

    <main className="min-h-screen lg:ml-[248px]">
      <header className="sticky top-0 z-10 border-b border-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex min-h-16 max-w-[1320px] items-center justify-between gap-5 px-4 py-2.5 sm:px-6 lg:h-[72px] lg:py-0">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-teal-700 text-white lg:hidden">
              <Brain size={20} />
            </div>
            <RunSelector runs={runs} selectedRunId={selectedRunId} onRunChange={setSelectedRunId} />
          </div>
          <dl className="hidden grid-cols-3 divide-x divide-line text-sm md:grid">
            <div className="px-4">
              <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">Selected k</dt>
              <dd className="mt-0.5 font-semibold tabular-nums">{selectedRun?.kSelection.selectedK ?? "—"}</dd>
            </div>
            <div className="px-4">
              <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">PCA variance</dt>
              <dd className="mt-0.5 font-semibold tabular-nums">{selectedRun ? `${(selectedRun.pca.cumulativeExplainedVariance * 100).toFixed(1)}%` : "—"}</dd>
            </div>
            <div className="px-4 pr-0">
              <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">Eligible</dt>
              <dd className="mt-0.5 font-semibold tabular-nums">{selectedRun?.longitudinal.eligibleParticipants.toLocaleString() ?? "—"}</dd>
            </div>
          </dl>
        </div>
        <div className="border-t border-line px-3 py-2 lg:hidden">
          <NavLink to="/upload-run" className={primaryActionClass}>
            <UploadCloud size={16} />
            Run Analysis
          </NavLink>
        </div>
        <nav className="grid grid-cols-2 gap-1 border-t border-line px-3 py-2 sm:grid-cols-3 lg:hidden" aria-label="Research sections">
          {navItems.map(({ path, step, label, icon: Icon }) => (
            <NavLink key={path} to={path} className={navigationClass}>
              <Icon size={16} />
              <span className="min-w-0 leading-5"><span className="mr-1.5 text-[10px] tabular-nums text-muted">{step}</span>{label}</span>
            </NavLink>
          ))}
        </nav>
      </header>

      <div className="mx-auto max-w-[1320px] px-4 py-6 sm:px-6 sm:py-8">
        {error ? <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}
        {isLoading ? (
          <div aria-live="polite" className="rounded-xl border border-line bg-white p-6 text-sm text-muted">Loading unified research run…</div>
        ) : !selectedRun && !error && !allowWithoutRun ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
            No validated unified aggregate is available. Run the local scientific pipeline first.
          </div>
        ) : children}
      </div>
    </main>
  </div>
);
