import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { adaptAxisAResult } from "./axisAResultAdapter";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "axis-a-adapter-"));
const write = (name: string, contents: string) => fs.writeFileSync(path.join(root, name), contents, "utf8");

try {
  write("axis_a_preprocessing_summary.csv", `variable\n${Array.from({ length: 13 }, (_, index) => `V${index + 1}`).join("\n")}\n`);
  write("axis_a_final_exclusion_preview.csv", "candidate_variable,missing_percentage,explanation\nBNT,29,Excluded above threshold\nNPIQ,61,Excluded above threshold\n");
  write("axis_a_pca_explained_variance.csv", "component,component_number,explained_variance,explained_variance_ratio,cumulative_explained_variance,retained_for_85_percent\nPC1,1,2,0.6,0.6,True\nPC2,2,1,0.4,1,True\n");
  write("axis_a_nbclust_summary.csv", "k,vote_count\n2,9\n3,2\n");
  write("axis_a_dpc_summary.csv", "metric,value\nselected_k,2\n");
  write("axis_a_dpc_selected_centroids.csv", "PTID,rho,delta,gamma\nSECRET-1,4,2,8\nSECRET-2,3,2,6\n");
  write("axis_a_enhanced_metrics.csv", "metric,value\nsilhouette_coefficient,0.5\ndavies_bouldin_index,0.7\ncalinski_harabasz_index,10\n");
  write("axis_a_enhanced_run_summary.csv", "metric,value\ninput_rows,3\ncluster_0_size,2\ncluster_1_size,1\n");
  write("axis_a_dpc_ablation_comparison.csv", "metric,random_mean\nsilhouette,0.4\ndavies_bouldin,0.8\ncalinski_harabasz,9\n");

  const result = adaptAxisAResult(root, { runId: "axis-a-test", createdAt: "2026-08-13T00:00:00.000Z" });
  if (result.axis !== "Axis A" || result.preprocessing.retained_sample_size !== 3) throw new Error("Axis A mapping failed");
  if (JSON.stringify(result).includes("SECRET") || JSON.stringify(result).includes("PTID")) throw new Error("Participant-level field escaped adapter");
  console.log("PASS Axis A adapter: valid aggregates mapped without participant identifiers");

  fs.rmSync(path.join(root, "axis_a_enhanced_metrics.csv"));
  try { adaptAxisAResult(root); throw new Error("Missing artifact accepted"); } catch (error) {
    if (error instanceof Error && error.message === "Missing artifact accepted") throw error;
  }
  console.log("PASS Axis A adapter: missing artifact rejected");
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
