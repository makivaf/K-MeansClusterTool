import { useEffect, useState } from "react";
import {
  SopEvaluationResponseSchema,
  type SopEvaluation,
  type UnifiedResearchRun,
  type DefenseGeometry,
  type BaselineCandidateSweep
} from "../../../../packages/shared/src/schema";
import { API_BASE_URL } from "../config/api";

import { hasSharedSopProvenance } from "../utils/sopProvenance";
export { hasSharedSopProvenance } from "../utils/sopProvenance";

export const useSopEvaluation = (run: UnifiedResearchRun | null = null) => {
  const enabled = run !== null;
  const [evaluation, setEvaluation] = useState<SopEvaluation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [baselineSweep, setBaselineSweep] = useState<BaselineCandidateSweep | null>(null);
  const [defenseGeometry, setDefenseGeometry] = useState<DefenseGeometry | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const abortController = new AbortController();
    void (async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/sop-evaluation`, { signal: abortController.signal });
        if (!response.ok) throw new Error(`SOP evaluation API returned ${response.status}`);
        const payload = SopEvaluationResponseSchema.parse(await response.json());
        setEvaluation(payload.evaluation);
        setBaselineSweep(payload.baselineSweep ?? null);
        setDefenseGeometry(payload.defenseGeometry ?? null);
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setError(caught instanceof Error ? caught.message : "Unable to load the aggregate SOP evaluation");
      }
    })();
    return () => abortController.abort();
  }, [enabled]);

  const matches = run !== null && evaluation !== null && hasSharedSopProvenance(run, evaluation);
  // Compare shared scientific inputs across runs, not the recovery's output
  // reports (e.g. enhanced_kmeans_run_summary.csv contains per-execution
  // floating-point reproducibility diagnostics). The API still validates ALL
  // recovery-source hashes against the frozen artifacts, plus the geometry
  // checksum and SOP linkage. This remains frozen-study evidence, not run output.
  const geometryInputSources = [
    "data/interim/study_entry_cohort_unimputed.csv",
    "data/interim/clustering_features_standardized.csv",
    "data/interim/clustering_pca_scores.csv",
    "data/interim/clustering_pca_explained_variance.csv",
    "data/interim/clustering_pca_loadings.csv",
    "data/interim/clustering_selected_k.csv",
    "data/interim/clustering_dpc_selected_centroids.csv"
  ];
  const geometryMatches = matches && defenseGeometry !== null && geometryInputSources.every((source) => {
    const frozenHash = defenseGeometry.provenance.sourceSha256[source];
    const runHash = run.provenance.inputSha256[source];
    return Boolean(frozenHash) && (!runHash || runHash === frozenHash);
  });
  return {
    evaluation: matches ? evaluation : null,
    baselineSweep: matches ? baselineSweep : null,
    defenseGeometry: geometryMatches ? defenseGeometry : null,
    error: error ? "Frozen-study evaluation unavailable." : run && evaluation && !matches
      ? "Frozen-study evaluation unavailable: required shared provenance is missing or mismatched."
      : null
  };
};
