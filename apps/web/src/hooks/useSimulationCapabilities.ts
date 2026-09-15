import { useEffect, useState } from "react";
import { SimulationCapabilitiesSchema, type SimulationCapabilities } from "../../../../packages/shared/src/simulation";
import { API_BASE_URL } from "../config/api";

export const useSimulationCapabilities = () => {
  const [capabilities, setCapabilities] = useState<SimulationCapabilities | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(null); setCapabilities(null);
    void (async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/simulations/capabilities`, { signal: controller.signal });
        if (!response.ok) throw new Error("Simulation service unavailable.");
        setCapabilities(SimulationCapabilitiesSchema.parse(await response.json()));
      } catch {
        if (!controller.signal.aborted) setError("Unable to check simulation availability.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [attempt]);
  return { capabilities, error, loading, retry: () => setAttempt((current) => current + 1) };
};
