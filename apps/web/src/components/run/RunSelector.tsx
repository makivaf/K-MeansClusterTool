import type { Axis, ClusteringRun } from "../../../../../packages/shared/src";

type RunSelectorProps = {
  runs: ClusteringRun[];
  selectedAxis: Axis;
  selectedRunId: string;
  onAxisChange: (axis: Axis) => void;
  onRunChange: (runId: string) => void;
};

export const RunSelector = ({ runs, selectedAxis, selectedRunId, onAxisChange, onRunChange }: RunSelectorProps) => {
  const selectedRunMissing = Boolean(selectedRunId) && !runs.some((run) => run.run_id === selectedRunId);

  return (
    <div className="flex items-center gap-4">
      <label className="flex items-center gap-2 text-sm font-medium">
        Axis
        <select
          value={selectedAxis}
          onChange={(event) => onAxisChange(event.target.value as Axis)}
          className="h-11 rounded-md border border-line bg-white px-3 text-sm shadow-sm outline-none focus:border-teal-600"
        >
          <option>Axis A</option>
          <option>Axis B</option>
        </select>
      </label>
      <label className="flex items-center gap-2 text-sm font-medium">
        Run ID
        <select
          value={selectedRunId}
          onChange={(event) => onRunChange(event.target.value)}
          className="h-11 min-w-72 rounded-md border border-line bg-white px-3 text-sm shadow-sm outline-none focus:border-teal-600"
        >
          {selectedRunMissing ? <option value={selectedRunId}>Run not found</option> : null}
          {runs.map((run) => (
            <option key={run.run_id} value={run.run_id}>
              {run.run_id}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
};
