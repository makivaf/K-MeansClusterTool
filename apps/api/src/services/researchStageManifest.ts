export type ResearchAxis = "Axis A" | "Axis B";

export type ResearchStageGroup =
  | "shared/audit"
  | "Axis A preprocessing"
  | "Axis A k-selection"
  | "Axis A initialization"
  | "Axis A clustering"
  | "Axis A validation"
  | "Axis B longitudinal"
  | "Axis B k-selection"
  | "Axis B clustering"
  | "Axis B validation";

export type ResearchScriptManifestEntry = {
  script: string;
  group: ResearchStageGroup;
  executionAxis: ResearchAxis;
  kind: "entrypoint" | "module";
};

/**
 * Reviewed logical organization for the frozen flat scripts/research directory.
 * Array order is the validated execution order; paths deliberately remain flat.
 */
export const researchScriptManifest: readonly ResearchScriptManifestEntry[] = [
  { script: "audit_adni.py", group: "shared/audit", executionAxis: "Axis A", kind: "entrypoint" },
  { script: "audit_adni_candidate_mapping.py", group: "shared/audit", executionAxis: "Axis A", kind: "entrypoint" },
  { script: "reconcile_adni_dictionary.py", group: "shared/audit", executionAxis: "Axis A", kind: "entrypoint" },
  { script: "construct_axis_a_study_entry.py", group: "Axis A preprocessing", executionAxis: "Axis A", kind: "entrypoint" },
  { script: "audit_axis_a_scope_npiq.py", group: "Axis A preprocessing", executionAxis: "Axis A", kind: "entrypoint" },
  { script: "preprocess_axis_a.py", group: "Axis A preprocessing", executionAxis: "Axis A", kind: "entrypoint" },
  { script: "check_sop2_environment.py", group: "shared/audit", executionAxis: "Axis A", kind: "entrypoint" },
  { script: "select_axis_a_k_nbclust.py", group: "Axis A k-selection", executionAxis: "Axis A", kind: "entrypoint" },
  { script: "dpc_init_axis_a.py", group: "Axis A initialization", executionAxis: "Axis A", kind: "entrypoint" },
  { script: "run_axis_a_enhanced_kmeans.py", group: "Axis A clustering", executionAxis: "Axis A", kind: "entrypoint" },
  { script: "run_axis_a_baseline_comparison.py", group: "Axis A validation", executionAxis: "Axis A", kind: "entrypoint" },
  { script: "run_axis_a_dpc_ablation.py", group: "Axis A validation", executionAxis: "Axis A", kind: "entrypoint" },
  { script: "audit_axis_b_longitudinal.py", group: "Axis B longitudinal", executionAxis: "Axis B", kind: "entrypoint" },
  { script: "reconcile_axis_b_longitudinal_methodology.py", group: "Axis B longitudinal", executionAxis: "Axis B", kind: "entrypoint" },
  { script: "construct_axis_b_longitudinal_cohort.py", group: "Axis B longitudinal", executionAxis: "Axis B", kind: "entrypoint" },
  { script: "extract_axis_b_adas13_slopes.py", group: "Axis B longitudinal", executionAxis: "Axis B", kind: "entrypoint" },
  { script: "select_axis_b_k_nbclust.py", group: "Axis B k-selection", executionAxis: "Axis B", kind: "entrypoint" },
  { script: "select_axis_b_dpc_seeds.py", group: "Axis B validation", executionAxis: "Axis B", kind: "entrypoint" },
  { script: "reconcile_axis_b_dpc_methodology.py", group: "Axis B validation", executionAxis: "Axis B", kind: "entrypoint" },
  { script: "axis_b_final_common.py", group: "Axis B clustering", executionAxis: "Axis B", kind: "module" },
  { script: "run_axis_b_final_clustering.py", group: "Axis B clustering", executionAxis: "Axis B", kind: "entrypoint" },
  { script: "run_axis_b_random_ablation.py", group: "Axis B validation", executionAxis: "Axis B", kind: "entrypoint" },
  { script: "run_axis_b_sensitivity_analysis.py", group: "Axis B validation", executionAxis: "Axis B", kind: "entrypoint" },
  { script: "summarize_axis_b_results.py", group: "Axis B validation", executionAxis: "Axis B", kind: "entrypoint" }
] as const;

export const researchStageGroups = researchScriptManifest.reduce<Record<ResearchStageGroup, string[]>>(
  (groups, entry) => {
    groups[entry.group].push(entry.script);
    return groups;
  },
  {
    "shared/audit": [],
    "Axis A preprocessing": [],
    "Axis A k-selection": [],
    "Axis A initialization": [],
    "Axis A clustering": [],
    "Axis A validation": [],
    "Axis B longitudinal": [],
    "Axis B k-selection": [],
    "Axis B clustering": [],
    "Axis B validation": []
  }
);

const executableStages = researchScriptManifest.filter((entry) => entry.kind === "entrypoint");

export const getResearchExecutionPlan = (axis: ResearchAxis): readonly ResearchScriptManifestEntry[] => {
  if (axis === "Axis A") return executableStages.filter((entry) => entry.executionAxis === "Axis A");
  if (axis === "Axis B") return executableStages;
  return [];
};

export const approvedResearchScripts = new Set(executableStages.map((entry) => entry.script));
