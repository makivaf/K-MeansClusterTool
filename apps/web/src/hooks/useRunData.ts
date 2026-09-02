import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  RunListResponseSchema,
  type UnifiedResearchRun
} from "../../../../packages/shared/src";
import { API_BASE_URL } from "../config/api";

export type RunDataState = {
  runs: UnifiedResearchRun[];
  selectedRunId: string;
  selectedRun: UnifiedResearchRun | null;
  isLoading: boolean;
  error: string | null;
  setSelectedRunId: (runId: string) => void;
  selectRunById: (runId: string) => void;
};

const getRunIdFromLocation = (pathname: string, search: string) => {
  const runPathMatch = pathname.match(/^\/runs\/([^/]+)/);
  if (runPathMatch?.[1]) return decodeURIComponent(runPathMatch[1]);
  return new URLSearchParams(search).get("run_id");
};

export const useRunData = (): RunDataState => {
  const location = useLocation();
  const [runs, setRuns] = useState<UnifiedResearchRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestedRunId = useMemo(
    () => getRunIdFromLocation(location.pathname, location.search),
    [location.pathname, location.search]
  );

  useEffect(() => {
    const abortController = new AbortController();
    const loadRuns = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const response = await fetch(`${API_BASE_URL}/api/runs`, { signal: abortController.signal });
        if (!response.ok) throw new Error(`API returned ${response.status}`);
        const payload = RunListResponseSchema.parse(await response.json());
        const unifiedRuns = payload.runs.filter(
          (run): run is UnifiedResearchRun => "pipeline" in run && run.pipeline === "unified"
        );
        setRuns(unifiedRuns);
        const requestedRun = unifiedRuns.find((run) => run.run_id === requestedRunId);
        setSelectedRunId(requestedRun?.run_id ?? unifiedRuns[0]?.run_id ?? requestedRunId ?? "");
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setError(caught instanceof Error ? caught.message : "Unable to load unified research runs");
      } finally {
        if (!abortController.signal.aborted) setIsLoading(false);
      }
    };
    void loadRuns();
    return () => abortController.abort();
  }, []);

  useEffect(() => {
    if (requestedRunId && runs.some((run) => run.run_id === requestedRunId)) {
      setSelectedRunId(requestedRunId);
    }
  }, [requestedRunId, runs]);

  const selectedRun = useMemo(
    () => runs.find((run) => run.run_id === selectedRunId) ?? null,
    [runs, selectedRunId]
  );

  const selectRunById = useCallback((runId: string) => {
    if (runs.some((run) => run.run_id === runId)) setSelectedRunId(runId);
  }, [runs]);

  return {
    runs,
    selectedRunId,
    selectedRun,
    isLoading,
    error,
    setSelectedRunId,
    selectRunById
  };
};
