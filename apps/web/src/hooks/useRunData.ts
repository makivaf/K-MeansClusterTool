import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
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

const getRunIdFromLocation = (pathname: string, search: string) => {
  const runPathMatch = pathname.match(/^\/runs\/([^/]+)/);
  if (runPathMatch?.[1]) {
    return decodeURIComponent(runPathMatch[1]);
  }
  return new URLSearchParams(search).get("run_id");
};

export const useRunData = (): RunDataState => {
  const location = useLocation();
  const [runs, setRuns] = useState<ClusteringRun[]>([]);
  const [selectedAxis, setSelectedAxis] = useState<Axis>("Axis A");
  const [selectedRunId, setSelectedRunId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestedRunId = useMemo(() => getRunIdFromLocation(location.pathname, location.search), [location.pathname, location.search]);

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
        const requestedRun = payload.runs.find((run) => run.run_id === requestedRunId);
        setRuns(payload.runs);
        setSelectedAxis(requestedRun?.axis ?? payload.runs[0]?.axis ?? "Axis A");
        setSelectedRunId(requestedRun?.run_id ?? requestedRunId ?? payload.runs[0]?.run_id ?? "");
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
  const requestedRunMissing = Boolean(requestedRunId) && runs.length > 0 && !runs.some((run) => run.run_id === requestedRunId);

  useEffect(() => {
    if (requestedRunMissing) {
      return;
    }
    if (axisRuns.length > 0 && !axisRuns.some((run) => run.run_id === selectedRunId)) {
      setSelectedRunId(axisRuns[0].run_id);
    }
  }, [axisRuns, requestedRunMissing, selectedRunId]);

  const selectedRun = useMemo(
    () => {
      if (selectedRunId) {
        return runs.find((run) => run.run_id === selectedRunId) ?? null;
      }
      return axisRuns[0] ?? null;
    },
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
