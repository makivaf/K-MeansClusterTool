import type { UnifiedResearchRun } from "../../../../../packages/shared/src";

type RunSelectorProps = {
  runs: UnifiedResearchRun[];
  selectedRunId: string;
  onRunChange: (runId: string) => void;
};

export const RunSelector = ({ runs, selectedRunId, onRunChange }: RunSelectorProps) => {
  const selectedRunMissing = Boolean(selectedRunId) && !runs.some((run) => run.run_id === selectedRunId);

  return (
    <label className="grid min-w-0 gap-1 text-sm font-medium">
      <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Research run</span>
      <select
        aria-label="Research run"
        value={selectedRunId}
        onChange={(event) => onRunChange(event.target.value)}
        className="h-9 w-[min(32rem,68vw)] min-w-0 rounded-sm border border-line bg-white px-3 text-sm text-ink outline-none focus:border-teal-600 sm:w-[clamp(16rem,34vw,32rem)]"
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
