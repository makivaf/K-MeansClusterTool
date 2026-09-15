import { useEffect, useState } from "react";
import { SimulationMetadataResponseSchema, type SimulationMetadataResponse } from "../../../../packages/shared/src/simulation";
import { API_BASE_URL } from "../config/api";

export const useSimulationMetadata = () => {
  const [metadata, setMetadata] = useState<SimulationMetadataResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(null); setMetadata(null);
    void (async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/simulations/metadata`, { signal: controller.signal });
        if (!response.ok) throw new Error("Metadata unavailable");
        const payload = SimulationMetadataResponseSchema.parse(await response.json());
        if (!controller.signal.aborted) setMetadata(payload);
      } catch {
        if (!controller.signal.aborted) setError("Unable to load simulation sample metadata.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [attempt]);
  return { metadata, error, loading, retry: () => setAttempt((current) => current + 1) };
};
