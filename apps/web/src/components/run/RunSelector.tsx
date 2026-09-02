import type { UnifiedResearchRun } from "../../../../../packages/shared/src";

type RunSelectorProps = {
  runs: UnifiedResearchRun[];
  selectedRunId: string;
  onRunChange: (runId: string) => void;
};

export const RunSelector = ({ runs, selectedRunId, onRunChange }: RunSelectorProps) => {
  const selectedRunMissing = Boolean(selectedRunId) && !runs.some((run) => run.run_id === selectedRunId);

  return (
    <label className="flex min-w-0 items-center gap-2 text-sm font-medium">
      <span className="hidden text-muted sm:inline">Research run</span>
      <select
        aria-label="Research run"
        value={selectedRunId}
        onChange={(event) => onRunChange(event.target.value)}
        className="h-10 min-w-0 max-w-80 rounded-lg border border-line bg-white px-3 text-sm shadow-sm outline-none focus:border-teal-600"
      >
        {selectedRunMissing ? <option value={selectedRunId}>Run not found</option> : null}
        {runs.length === 0 ? <option value="">No unified run available</option> : null}
        {runs.map((run) => (
          <option key={run.run_id} value={run.run_id}>
            {run.title}
          </option>
        ))}
      </select>
    </label>
  );
};
