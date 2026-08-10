import { useEffect, useMemo, useState } from "react";
import { RunListResponseSchema, type Axis, type ClusteringRun } from "../../../../packages/shared/src";
import { API_BASE_URL } from "../config/api";

export type RunDataState = {
  runs: ClusteringRun[];
  selectedAxis: Axis;
  selectedRunId: string;
  selectedRun: ClusteringRun | null;
  isLoading: boolean;
  error: string | null;
  setSelectedAxis: (axis: Axis) => void;
  setSelectedRunId: (runId: string) => void;
  selectRunById: (runId: string) => void;
};

const getRunIdFromLocation = () => {
  const runPathMatch = window.location.pathname.match(/^\/runs\/([^/]+)/);
  if (runPathMatch?.[1]) {
    return decodeURIComponent(runPathMatch[1]);
  }
  return new URLSearchParams(window.location.search).get("run_id");
};

export const useRunData = (): RunDataState => {
  const [runs, setRuns] = useState<ClusteringRun[]>([]);
  const [selectedAxis, setSelectedAxis] = useState<Axis>("Axis A");
  const [selectedRunId, setSelectedRunId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const abortController = new AbortController();

    const loadRuns = async () => {
      try {
        setIsLoading(true);
        setError(null);
        // TODO: Keep this API call, but point the backend repository at real Python pipeline output once it is available.
        const response = await fetch(`${API_BASE_URL}/api/runs`, { signal: abortController.signal });
        if (!response.ok) {
          throw new Error(`API returned ${response.status}`);
        }
        const payload = RunListResponseSchema.parse(await response.json());
        const requestedRunId = getRunIdFromLocation();
        const requestedRun = payload.runs.find((run) => run.run_id === requestedRunId);
        setRuns(payload.runs);
        setSelectedAxis(requestedRun?.axis ?? payload.runs[0]?.axis ?? "Axis A");
        setSelectedRunId(requestedRun?.run_id ?? payload.runs[0]?.run_id ?? "");
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") {
          return;
        }
        setError(caught instanceof Error ? caught.message : "Unable to load runs");
      } finally {
        setIsLoading(false);
      }
    };

    void loadRuns();
    return () => abortController.abort();
  }, []);

  const axisRuns = useMemo(() => runs.filter((run) => run.axis === selectedAxis), [runs, selectedAxis]);

  useEffect(() => {
    if (axisRuns.length > 0 && !axisRuns.some((run) => run.run_id === selectedRunId)) {
      setSelectedRunId(axisRuns[0].run_id);
    }
  }, [axisRuns, selectedRunId]);

  const selectedRun = useMemo(
    () => runs.find((run) => run.run_id === selectedRunId) ?? axisRuns[0] ?? null,
    [axisRuns, runs, selectedRunId]
  );

  const selectRunById = (runId: string) => {
    const run = runs.find((candidate) => candidate.run_id === runId);
    if (!run) {
      return;
    }
    setSelectedAxis(run.axis);
    setSelectedRunId(run.run_id);
  };

  return {
    runs,
    selectedAxis,
    selectedRunId,
    selectedRun,
    isLoading,
    error,
    setSelectedAxis,
    setSelectedRunId,
    selectRunById
  };
};
