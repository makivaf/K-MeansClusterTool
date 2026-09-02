export type ResearchStageGroup =
  | "constructing_study_entry_cohort"
  | "preprocessing"
  | "pca"
  | "selecting_k"
  | "deterministic_initialization"
  | "enhanced_kmeans"
  | "cluster_profiling"
  | "baseline_comparison"
  | "matching_longitudinal_records"
  | "longitudinal_eligibility"
  | "longitudinal_analysis";

export type ResearchScriptManifestEntry = {
  script: string;
  group: ResearchStageGroup;
  kind: "entrypoint" | "module";
};

/** Active one-run execution order. No independent longitudinal clustering is present. */
export const researchScriptManifest: readonly ResearchScriptManifestEntry[] = [
  { script: "study_entry/audit_adni_inputs.py", group: "constructing_study_entry_cohort", kind: "entrypoint" },
  { script: "study_entry/audit_candidate_mapping.py", group: "constructing_study_entry_cohort", kind: "entrypoint" },
  { script: "study_entry/reconcile_variable_dictionary.py", group: "constructing_study_entry_cohort", kind: "entrypoint" },
  { script: "study_entry/construct_study_entry_cohort.py", group: "constructing_study_entry_cohort", kind: "entrypoint" },
  { script: "study_entry/audit_study_entry_scope_npiq.py", group: "preprocessing", kind: "entrypoint" },
  { script: "study_entry/preprocess_study_entry.py", group: "pca", kind: "entrypoint" },
  { script: "validation/check_clustering_environment.py", group: "selecting_k", kind: "entrypoint" },
  { script: "study_entry/select_cluster_count_nbclust.py", group: "selecting_k", kind: "entrypoint" },
  { script: "study_entry/dpc_initialize_clusters.py", group: "deterministic_initialization", kind: "entrypoint" },
  { script: "study_entry/run_enhanced_kmeans.py", group: "enhanced_kmeans", kind: "entrypoint" },
  { script: "comparison/run_baseline_kmeans_comparison.py", group: "baseline_comparison", kind: "entrypoint" },
  { script: "comparison/run_dpc_initialization_comparison.py", group: "baseline_comparison", kind: "entrypoint" },
  { script: "longitudinal/audit_longitudinal_records.py", group: "matching_longitudinal_records", kind: "entrypoint" },
  { script: "longitudinal/reconcile_longitudinal_methodology.py", group: "matching_longitudinal_records", kind: "entrypoint" },
  { script: "longitudinal/construct_longitudinal_cohort.py", group: "longitudinal_eligibility", kind: "entrypoint" },
  { script: "longitudinal/fit_longitudinal_mixed_model.py", group: "longitudinal_analysis", kind: "entrypoint" },
  { script: "longitudinal/consolidate_unified_results.py", group: "longitudinal_analysis", kind: "entrypoint" }
] as const;

/** Audit-only inventory of the abandoned independent slope-clustering design. */
export const deprecatedLongitudinalClusteringScripts = [
  "legacy/old_longitudinal_clustering/extract_axis_b_adas13_slopes.py",
  "legacy/old_longitudinal_clustering/select_axis_b_k_nbclust.py",
  "legacy/old_longitudinal_clustering/select_axis_b_dpc_seeds.py",
  "legacy/old_longitudinal_clustering/reconcile_axis_b_dpc_methodology.py",
  "legacy/old_longitudinal_clustering/axis_b_final_common.py",
  "legacy/old_longitudinal_clustering/run_axis_b_final_clustering.py",
  "legacy/old_longitudinal_clustering/run_axis_b_random_ablation.py",
  "legacy/old_longitudinal_clustering/run_axis_b_sensitivity_analysis.py",
  "legacy/old_longitudinal_clustering/summarize_axis_b_results.py"
] as const;

export const getResearchExecutionPlan = (): readonly ResearchScriptManifestEntry[] =>
  researchScriptManifest.filter((entry) => entry.kind === "entrypoint");

export const approvedResearchScripts = new Set(getResearchExecutionPlan().map((entry) => entry.script));
