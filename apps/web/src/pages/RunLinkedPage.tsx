import { useEffect } from "react";
import type { ReactNode } from "react";
import { useParams } from "react-router-dom";
import type { ClusteringRun } from "../../../../packages/shared/src";

type RunLinkedPageProps = {
  runs: ClusteringRun[];
  isLoading: boolean;
  error: string | null;
  selectRunById: (runId: string) => void;
  children: (run: ClusteringRun) => ReactNode;
};

export const RunLinkedPage = ({ runs, isLoading, error, selectRunById, children }: RunLinkedPageProps) => {
  const { runId } = useParams();
  const requestedRun = runs.find((run) => run.run_id === runId);

  useEffect(() => {
    if (requestedRun) {
      selectRunById(requestedRun.run_id);
    }
  }, [requestedRun, selectRunById]);

  if (isLoading) {
    return <div className="rounded-md border border-line bg-white p-6 text-sm text-muted">Loading requested run...</div>;
  }

  if (error) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Unable to load clustering runs: {error}
      </div>
    );
  }

  if (!runId || !requestedRun) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
        <div className="font-semibold">Run not found</div>
        <p className="mt-1 text-amber-800">
          The requested run ID does not exist in the loaded clustering results. No comparison or cluster profile data is shown.
        </p>
      </div>
    );
  }

  return children(requestedRun);
};
