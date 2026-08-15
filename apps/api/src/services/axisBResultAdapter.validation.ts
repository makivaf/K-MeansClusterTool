import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { adaptAxisBResult } from "./axisBResultAdapter";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "axis-b-adapter-"));
const writeJson = (name: string, value: unknown) => fs.writeFileSync(path.join(root, name), JSON.stringify(value), "utf8");

const finalArtifact = {
  input: { participant_rows: 3, PCA_applied: false },
  configuration: { random_state: 0, n_init: 1 },
  result: { k: 2, silhouette: 0.7, davies_bouldin: 0.5, calinski_harabasz: 20 },
  cluster_profiles: [
    { ordered_cluster: 1, n: 2, centroid_slope: 0.7, mean_slope: 0.8, median_slope: 0.6, median_followup_years: 4, median_n_observations: 5 },
    { ordered_cluster: 2, n: 1, centroid_slope: 9, mean_slope: 9, median_slope: 9, median_followup_years: 2, median_n_observations: 3 }
  ]
};

try {
  writeJson("axis_b_final_clustering_metrics.json", finalArtifact);
  writeJson("axis_b_nbclust_k_selection.json", { selection: { selected_k: 2 }, nbclust_configuration: { candidate_k: [2, 3] }, vote_distribution: [{ k: 2, usable_nbclust_votes: 3 }, { k: 3, usable_nbclust_votes: 1 }] });
  writeJson("axis_b_dpc_methodology_reconciliation.json", { decision: { dpc_used_for_primary_axis_b_initialization: false, reason: "DPC seeds were unstable in one-dimensional slope space." } });
  writeJson("axis_b_longitudinal_cohort_validation.json", { participant_counts: { final_axis_b_longitudinal_participants: 3 }, filtering_flow: { final_retained_observations: 10 } });
  writeJson("axis_b_adas13_slopes_validation.json", { cohort_revalidation: { observations: 10 } });

  const result = adaptAxisBResult(root, { runId: "axis-b-test", createdAt: "2026-08-13T00:00:00.000Z" });
  if (result.axis !== "Axis B" || result.slope_construction.observation_count !== 10) throw new Error("Axis B mapping failed");
  if ("pca" in result || result.dpc_suitability.used_for_final_initialization) throw new Error("Axis B methodology was misrepresented");
  console.log("PASS Axis B adapter: one-dimensional final result mapped without PCA or DPC initialization");

  writeJson("axis_b_final_clustering_metrics.json", { ...finalArtifact, input: { participant_rows: 3, PCA_applied: true } });
  try { adaptAxisBResult(root); throw new Error("False PCA accepted"); } catch (error) {
    if (error instanceof Error && error.message === "False PCA accepted") throw error;
  }
  console.log("PASS Axis B adapter: false PCA rejected");

  writeJson("axis_b_final_clustering_metrics.json", { ...finalArtifact, result: { ...finalArtifact.result, k: 3 } });
  try { adaptAxisBResult(root); throw new Error("Inconsistent k accepted"); } catch (error) {
    if (error instanceof Error && error.message === "Inconsistent k accepted") throw error;
  }
  console.log("PASS Axis B adapter: inconsistent k rejected");
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
