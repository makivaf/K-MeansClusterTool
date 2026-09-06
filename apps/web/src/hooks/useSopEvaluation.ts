import { useEffect, useState } from "react";
import {
  SopEvaluationResponseSchema,
  type SopEvaluation,
  type BaselineCandidateSweep
} from "../../../../packages/shared/src";
import { API_BASE_URL } from "../config/api";

export const useSopEvaluation = () => {
  const [evaluation, setEvaluation] = useState<SopEvaluation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [baselineSweep, setBaselineSweep] = useState<BaselineCandidateSweep | null>(null);

  useEffect(() => {
    const abortController = new AbortController();
    void (async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/sop-evaluation`, { signal: abortController.signal });
        if (!response.ok) throw new Error(`SOP evaluation API returned ${response.status}`);
        const payload = SopEvaluationResponseSchema.parse(await response.json());
        setEvaluation(payload.evaluation);
        setBaselineSweep(payload.baselineSweep ?? null);
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setError(caught instanceof Error ? caught.message : "Unable to load the aggregate SOP evaluation");
      }
    })();
    return () => abortController.abort();
  }, []);

  return { evaluation, baselineSweep, error };
};
