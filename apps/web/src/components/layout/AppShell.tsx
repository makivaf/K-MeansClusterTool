import {
  Activity,
  BarChart3,
  Brain,
  GitCompare,
  Home,
  ScatterChart,
  TableProperties,
  UploadCloud,
  Users
} from "lucide-react";
import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import type { Axis } from "../../../../../packages/shared/src";
import type { RunDataState } from "../../hooks/useRunData";
import { RunSelector } from "../run/RunSelector";

const navItems = [
  { to: "/upload-cluster", label: "Upload & Run", icon: UploadCloud, primary: true },
  { to: "/dashboard", label: "Dashboard", icon: Home },
  { to: "/preprocessing", label: "Preprocessing", icon: Activity },
  { to: "/pca", label: "PCA", icon: BarChart3 },
  { to: "/nbclust", label: "NbClust", icon: TableProperties },
  { to: "/dpc-init", label: "DPC-init", icon: ScatterChart },
  { to: "/comparison", label: "Comparison", icon: GitCompare },
  { to: "/cluster-profiles", label: "Cluster Profiles", icon: Users }
];

type AppShellProps = RunDataState & {
  children: ReactNode;
};

export const AppShell = ({
  children,
  runs,
  selectedAxis,
  selectedRunId,
  selectedRun,
  isLoading,
  error,
  setSelectedAxis,
  setSelectedRunId
}: AppShellProps) => {
  const axisRuns = runs.filter((run) => run.axis === selectedAxis);

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <aside className="fixed inset-y-0 left-0 w-64 border-r border-line bg-white">
        <div className="flex h-full flex-col">
          <div className="flex h-20 items-center gap-3 border-b border-line px-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-teal-700 text-white">
              <Brain size={23} strokeWidth={2.2} />
            </div>
            <div>
              <div className="whitespace-nowrap text-lg font-semibold tracking-normal">AD Clustering Lab</div>
              <div className="text-xs font-medium text-muted">Thesis simulator</div>
            </div>
          </div>
          <nav className="flex-1 space-y-1 px-4 py-5">
            {navItems.map(({ to, label, icon: Icon, primary }) => (
              <div key={to}>
                <NavLink
                  to={to}
                  end
                  className={({ isActive }) =>
                    [
                      "flex h-11 items-center gap-3 rounded-md px-3 text-sm font-medium transition",
                      primary ? "border border-teal-700 bg-teal-700 text-white shadow-sm hover:bg-teal-900" : "",
                      primary && isActive ? "bg-teal-900 text-white" : "",
                      !primary && isActive ? "bg-teal-50 text-teal-900" : "",
                      !primary && !isActive ? "text-ink hover:bg-slate-50" : ""
                    ].join(" ")
                  }
                >
                  <Icon size={19} strokeWidth={1.8} />
                  {label}
                </NavLink>
                {primary ? <div className="my-4 border-t border-line" /> : null}
              </div>
            ))}
          </nav>
          <div className="m-4 rounded-md border border-line bg-canvas p-4 text-xs leading-5">
            <div className="font-semibold text-ink">Dataset</div>
            <div className="text-muted">{selectedRun?.dataset.name ?? "ADNI"}</div>
            <div className="mt-3 font-semibold text-ink">Participants</div>
            <div className="text-muted">{selectedRun?.preprocessing.retained_sample_size.toLocaleString() ?? "-"}</div>
            <div className="mt-3 font-semibold text-ink">Current axis</div>
            <div className="text-muted">{selectedAxis}</div>
          </div>
        </div>
      </aside>

      <main className="ml-64 min-h-screen">
        <header className="sticky top-0 z-10 border-b border-line bg-white/95 backdrop-blur">
          <div className="flex h-20 items-center justify-between px-6">
            <RunSelector
              runs={axisRuns}
              selectedAxis={selectedAxis}
              selectedRunId={selectedRunId}
              onAxisChange={(axis: Axis) => setSelectedAxis(axis)}
              onRunChange={setSelectedRunId}
            />
            <div className="grid grid-cols-3 gap-8 text-sm">
              <div>
                <div className="text-xs font-medium uppercase tracking-normal text-muted">Selected k</div>
                <div className="mt-1 text-xl font-semibold">{selectedRun?.nbclust.selected_k ?? "-"}</div>
              </div>
              <div>
                <div className="text-xs font-medium uppercase tracking-normal text-muted">PCA variance</div>
                <div className="mt-1 text-xl font-semibold">
                  {selectedRun?.axis === "Axis A"
                    ? `${(selectedRun.pca.cumulative_explained_variance * 100).toFixed(1)}%`
                    : selectedRun?.axis === "Axis B"
                      ? "Not applicable"
                      : "-"}
                </div>
              </div>
              <div>
                <div className="text-xs font-medium uppercase tracking-normal text-muted">Feature count</div>
                <div className="mt-1 text-xl font-semibold">{selectedRun?.dataset.feature_count ?? "-"}</div>
              </div>
            </div>
          </div>
        </header>

        <div className="p-6">
          {error ? <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}
          {isLoading ? <div className="rounded-md border border-line bg-white p-6 text-sm text-muted">Loading runs...</div> : children}
        </div>
      </main>
    </div>
  );
};
