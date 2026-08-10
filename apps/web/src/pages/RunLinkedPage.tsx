import { useEffect } from "react";
import { useParams } from "react-router-dom";
import type { ClusteringRun } from "../../../../packages/shared/src";

type RunLinkedPageProps = {
  run: ClusteringRun | null;
  selectRunById: (runId: string) => void;
  children: React.ReactNode;
};

export const RunLinkedPage = ({ run, selectRunById, children }: RunLinkedPageProps) => {
  const { runId } = useParams();

  useEffect(() => {
    if (runId && run?.run_id !== runId) {
      selectRunById(runId);
    }
  }, [run?.run_id, runId, selectRunById]);

  return children;
};
