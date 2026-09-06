import { Link } from "react-router-dom";
import type { UnifiedResearchRun } from "../../../../packages/shared/src";
import { ResearchPageNavigation } from "../components/layout/ResearchPageNavigation";
import { Panel } from "../components/ui/Panel";
import { PageHeading } from "./PageHeading";

type RunHistoryPageProps = {
  runs: UnifiedResearchRun[];
  selectedRunId: string;
  onSelectRun: (runId: string) => void;
};

const formatDate = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));

export const RunHistoryPage = ({ runs, selectedRunId, onSelectRun }: RunHistoryPageProps) => (
  <>
    <PageHeading
      title="Run History"
      description="Previously validated unified research runs available to the frontend."
    />

    <Panel title="Available runs" variant="section">
      {runs.length === 0 ? (
        <p className="text-sm leading-6 text-muted">No validated unified runs are available yet.</p>
      ) : (
        <ol className="divide-y divide-line border-y border-line">
          {runs.map((run) => {
            const selected = run.run_id === selectedRunId;
            return (
              <li key={run.run_id} className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-semibold text-ink">{run.title}</h2>
                  <p className="mt-1 text-xs leading-5 text-muted">
                    {formatDate(run.created_at)} - {run.cohort.parentN.toLocaleString()} participants - k={run.kSelection.selectedK}
                  </p>
                  <p className="mt-1 break-all text-[11px] text-muted">{run.run_id}</p>
                </div>
                <div className="flex items-center gap-2">
                  {selected ? <span className="text-xs font-semibold text-teal-800">Selected</span> : null}
                  <Link
                    to={`/existing-algorithm?run_id=${encodeURIComponent(run.run_id)}`}
                    onClick={() => onSelectRun(run.run_id)}
                    className="inline-flex h-9 items-center rounded-sm border border-teal-700 px-3 text-xs font-semibold text-teal-800 transition hover:bg-teal-50"
                  >
                    Open
                  </Link>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Panel>

    <ResearchPageNavigation currentPath="/run-history" />
  </>
);
