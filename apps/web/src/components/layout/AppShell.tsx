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

const navItems = [
  { to: "/overview", label: "Overview", icon: Home },
  { to: "/enhanced-kmeans", label: "Enhanced K-Means", icon: BarChart3 },
  { to: "/clusters", label: "Cluster Results", icon: Users },
  { to: "/baseline-vs-enhanced", label: "Baseline vs Enhanced", icon: GitCompare },
  { to: "/longitudinal", label: "Longitudinal Progression", icon: Activity }
];

type AppShellProps = RunDataState & { children: ReactNode };

const navigationClass = ({ isActive }: { isActive: boolean }) => [
  "flex shrink-0 items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition",
  isActive ? "bg-teal-50 text-teal-900" : "text-slate-600 hover:bg-slate-50 hover:text-ink"
].join(" ");

const primaryActionClass = ({ isActive }: { isActive: boolean }) => [
  "flex shrink-0 items-center gap-3 rounded-xl border border-teal-700 bg-teal-700 px-3 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-900",
  isActive ? "ring-2 ring-teal-200 ring-offset-2" : ""
].join(" ");

export const AppShell = ({
  children,
  runs,
  selectedRunId,
  selectedRun,
  isLoading,
  error,
  setSelectedRunId
}: AppShellProps) => (
  <div className="min-h-screen bg-canvas text-ink">
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 border-r border-line bg-white lg:block">
      <div className="flex h-full flex-col">
        <div className="flex h-20 items-center gap-3 border-b border-line px-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-700 text-white shadow-sm">
            <Brain size={23} strokeWidth={2.2} />
          </div>
          <div>
            <div className="whitespace-nowrap text-base font-semibold">AD Progression Lab</div>
            <div className="text-xs font-medium text-muted">Unified thesis pipeline</div>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-4 py-5" aria-label="Research sections">
          <NavLink to="/upload-run" className={primaryActionClass}>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/15" aria-hidden="true">
              <UploadCloud size={19} strokeWidth={2} />
            </span>
            <span>
              <span className="block">Run Analysis</span>
              <span className="mt-0.5 block text-xs font-medium text-teal-50">Seven-file unified pipeline</span>
            </span>
          </NavLink>
          <div className="my-4 border-t border-line" />
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={navigationClass}>
              <Icon size={18} strokeWidth={1.9} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="m-4 rounded-xl border border-line bg-canvas p-4 text-xs leading-5">
          <div className="font-semibold text-ink">Parent cohort</div>
          <div className="text-muted">{selectedRun?.cohort.parentN.toLocaleString() ?? "—"} clustered participants</div>
          <div className="mt-3 font-semibold text-ink">Longitudinal subset</div>
          <div className="text-muted">{selectedRun?.cohort.longitudinalEligibleN.toLocaleString() ?? "—"} eligible participants</div>
        </div>
      </div>
    </aside>

    <main className="min-h-screen lg:ml-64">
      <header className="sticky top-0 z-10 border-b border-line bg-white/95 backdrop-blur">
        <div className="flex min-h-16 items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:h-20 lg:py-0">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-700 text-white lg:hidden">
              <Brain size={20} />
            </div>
            <RunSelector runs={runs} selectedRunId={selectedRunId} onRunChange={setSelectedRunId} />
          </div>
          <div className="hidden grid-cols-3 gap-6 text-sm md:grid">
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-muted">Selected k</div>
              <div className="mt-1 text-lg font-semibold">{selectedRun?.kSelection.selectedK ?? "—"}</div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-muted">PCA variance</div>
              <div className="mt-1 text-lg font-semibold">{selectedRun ? `${(selectedRun.pca.cumulativeExplainedVariance * 100).toFixed(1)}%` : "—"}</div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-muted">Eligible</div>
              <div className="mt-1 text-lg font-semibold">{selectedRun?.longitudinal.eligibleParticipants.toLocaleString() ?? "—"}</div>
            </div>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto border-t border-line px-3 py-2 lg:hidden" aria-label="Research sections">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={navigationClass}>
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
          <NavLink to="/upload-run" className={primaryActionClass}>
            <UploadCloud size={16} />
            Run Analysis
          </NavLink>
        </nav>
      </header>

      <div className="mx-auto max-w-[1500px] p-4 sm:p-6">
        {error ? <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}
        {isLoading ? (
          <div aria-live="polite" className="rounded-xl border border-line bg-white p-6 text-sm text-muted">Loading unified research run…</div>
        ) : !selectedRun && !error ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
            No validated unified aggregate is available. Run the local scientific pipeline first.
          </div>
        ) : children}
      </div>
    </main>
  </div>
);
