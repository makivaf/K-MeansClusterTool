import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { fileURLToPath } from "node:url";

export type AxisBFrozenPrerequisiteName = "k_selection" | "dpc_seed_selection";

type JsonRecord = Record<string, unknown>;

export const AXIS_B_K_SELECTION_INERTIA_ABSOLUTE_TOLERANCE = 1e-11;

export type AxisBKSelectionInertiaComparison = {
  k: number;
  authoritative_inertia: number;
  runtime_inertia: number;
  absolute_difference: number;
  tolerance: number;
  equivalent: true;
};

export type AxisBKSelectionNumericalReproducibilityAudit = {
  field: "secondary_diagnostic_kmeans.metrics[].inertia";
  comparison: "absolute_difference";
  rationale: "multithreaded_openmp_floating_point_reduction";
  tolerance: number;
  comparisons: AxisBKSelectionInertiaComparison[];
};

type FrozenPrerequisiteSpec = {
  filename: string;
  producingStage: string;
  expectedSha256: string;
  runtimeAuditFilename: string;
  scientificContract: (document: JsonRecord) => JsonRecord;
  compareScientificContracts?: (
    runtime: JsonRecord,
    authoritative: JsonRecord
  ) => AxisBKSelectionNumericalReproducibilityAudit;
};

export type FrozenPrerequisiteAudit = {
  prerequisite: AxisBFrozenPrerequisiteName;
  producing_stage: string;
  runtime_artifact_role: "runtime reproduction artifact";
  runtime_generated_sha256: string;
  authoritative_artifact_role: "authoritative frozen artifact";
  authoritative_frozen_sha256: string;
  semantic_equivalence: true;
  byte_identical: boolean;
  authoritative_substitution_occurred: boolean;
  runtime_audit_path: string;
  numerical_reproducibility?: AxisBKSelectionNumericalReproducibilityAudit;
};

type ReconciliationDependencies = {
  authoritativeDirectory?: string;
  copyFile?: (source: string, destination: string) => void;
};

const serviceDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(serviceDirectory, "../../../..");
const authoritativeInterimDirectory = path.join(repositoryRoot, "data", "interim");
const auditDirectoryName = "runtime_reproduction";
const auditManifestFilename = "axis_b_frozen_prerequisite_audit.json";

export class AxisBFrozenPrerequisiteError extends Error {}

const requireRecord = (value: unknown, label: string): JsonRecord => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AxisBFrozenPrerequisiteError(`${label} is not a JSON object.`);
  }
  return value as JsonRecord;
};

const requireArray = (value: unknown, label: string): unknown[] => {
  if (!Array.isArray(value)) {
    throw new AxisBFrozenPrerequisiteError(`${label} is not an array.`);
  }
  return value;
};

const requireFiniteNumber = (value: unknown, label: string): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new AxisBFrozenPrerequisiteError(`${label} is not a finite number.`);
  }
  return value;
};

const requireField = (document: JsonRecord, field: string): unknown => {
  if (!Object.hasOwn(document, field)) {
    throw new AxisBFrozenPrerequisiteError(`Required scientific field is missing: ${field}.`);
  }
  return document[field];
};

const pickFields = (document: JsonRecord, fields: readonly string[]): JsonRecord =>
  Object.fromEntries(fields.map((field) => [field, requireField(document, field)]));

/** Explicit allowlist of scientific k-selection content. Machine-specific R and
 * Python paths plus the absolute output path are deliberately excluded. */
export const axisBKSelectionScientificContract = (document: JsonRecord): JsonRecord => {
  const environment = requireRecord(requireField(document, "environment_validation"), "environment_validation");
  return {
    ...pickFields(document, [
      "status",
      "files_read",
      "one_dimensional_input_validation",
      "PCA_applicability",
      "nbclust_configuration",
      "index_compatibility_results",
      "index_result_summary",
      "vote_distribution",
      "selection",
      "secondary_diagnostic_kmeans",
      "reproducibility",
      "stop_reasons",
      "input_immutability",
      "prohibited_outputs_created"
    ]),
    environment_validation: pickFields(environment, [
      "project_venv_active",
      "r_version",
      "rpy2_version",
      "nbclust_version",
      "stats_import",
      "cluster_import",
      "nbclust_import",
      "python_to_r_result_6_times_7",
      "small_matrix_nbclust_k",
      "small_matrix_execution",
      "system_configuration_changed"
    ])
  };
};

const kSelectionMetricsWithoutInertia = (
  contract: JsonRecord,
  label: string
): { exactContract: JsonRecord; metrics: JsonRecord[] } => {
  const diagnostics = requireRecord(
    requireField(contract, "secondary_diagnostic_kmeans"),
    `${label}.secondary_diagnostic_kmeans`
  );
  const metrics = requireArray(
    requireField(diagnostics, "metrics"),
    `${label}.secondary_diagnostic_kmeans.metrics`
  ).map((value, index) => requireRecord(value, `${label}.secondary_diagnostic_kmeans.metrics[${index}]`));
  const exactMetrics = metrics.map((metric, index) => {
    requireFiniteNumber(requireField(metric, "inertia"), `${label}.secondary_diagnostic_kmeans.metrics[${index}].inertia`);
    return Object.fromEntries(Object.entries(metric).filter(([field]) => field !== "inertia"));
  });
  return {
    metrics,
    exactContract: {
      ...contract,
      secondary_diagnostic_kmeans: {
        ...diagnostics,
        metrics: exactMetrics
      }
    }
  };
};

/** All k-selection fields remain exact except the documented secondary
 * diagnostic inertia. The inertia exception is candidate-specific, finite,
 * and bounded by the approved absolute threshold. */
export const compareAxisBKSelectionScientificContracts = (
  runtime: JsonRecord,
  authoritative: JsonRecord
): AxisBKSelectionNumericalReproducibilityAudit => {
  const runtimeView = kSelectionMetricsWithoutInertia(runtime, "runtime k-selection contract");
  const authoritativeView = kSelectionMetricsWithoutInertia(authoritative, "authoritative k-selection contract");
  if (!isDeepStrictEqual(runtimeView.exactContract, authoritativeView.exactContract)) {
    throw new AxisBFrozenPrerequisiteError("Runtime scientific equivalence failed: axis_b_nbclust_k_selection.json.");
  }

  const comparisons = runtimeView.metrics.map((runtimeMetric, index): AxisBKSelectionInertiaComparison => {
    const authoritativeMetric = authoritativeView.metrics[index];
    if (!authoritativeMetric) {
      throw new AxisBFrozenPrerequisiteError("Runtime scientific equivalence failed: axis_b_nbclust_k_selection.json.");
    }
    const k = requireFiniteNumber(requireField(runtimeMetric, "k"), `runtime k-selection metric ${index} k`);
    const authoritativeK = requireFiniteNumber(requireField(authoritativeMetric, "k"), `authoritative k-selection metric ${index} k`);
    if (k !== authoritativeK) {
      throw new AxisBFrozenPrerequisiteError("Runtime scientific equivalence failed: axis_b_nbclust_k_selection.json.");
    }
    const runtimeInertia = requireFiniteNumber(requireField(runtimeMetric, "inertia"), `runtime k-selection metric ${index} inertia`);
    const authoritativeInertia = requireFiniteNumber(requireField(authoritativeMetric, "inertia"), `authoritative k-selection metric ${index} inertia`);
    const absoluteDifference = Math.abs(runtimeInertia - authoritativeInertia);
    if (absoluteDifference > AXIS_B_K_SELECTION_INERTIA_ABSOLUTE_TOLERANCE) {
      throw new AxisBFrozenPrerequisiteError("Runtime scientific equivalence failed: axis_b_nbclust_k_selection.json.");
    }
    return {
      k,
      authoritative_inertia: authoritativeInertia,
      runtime_inertia: runtimeInertia,
      absolute_difference: absoluteDifference,
      tolerance: AXIS_B_K_SELECTION_INERTIA_ABSOLUTE_TOLERANCE,
      equivalent: true
    };
  });

  if (comparisons.length !== authoritativeView.metrics.length) {
    throw new AxisBFrozenPrerequisiteError("Runtime scientific equivalence failed: axis_b_nbclust_k_selection.json.");
  }
  return {
    field: "secondary_diagnostic_kmeans.metrics[].inertia",
    comparison: "absolute_difference",
    rationale: "multithreaded_openmp_floating_point_reduction",
    tolerance: AXIS_B_K_SELECTION_INERTIA_ABSOLUTE_TOLERANCE,
    comparisons
  };
};

/** Explicit allowlist of the complete scientific DPC audit. Its output path is
 * operational metadata and is not part of the scientific comparison. */
export const axisBDpcScientificContract = (document: JsonRecord): JsonRecord =>
  pickFields(document, [
    "status",
    "scope",
    "files_read",
    "input_validation",
    "inherited_axis_a_implementation",
    "pairwise_distance_audit",
    "primary_2_percent_audit",
    "extreme_value_safety_check",
    "cutoff_sensitivity_audit",
    "one_dimensional_diagnostics",
    "determinism_validation",
    "stop_reasons_before_final_clustering",
    "blocker_remains_before_final_axis_b_enhanced_kmeans",
    "input_immutability",
    "prohibited_outputs_created"
  ]);

export const axisBFrozenPrerequisites: Readonly<Record<AxisBFrozenPrerequisiteName, FrozenPrerequisiteSpec>> = {
  k_selection: {
    filename: "axis_b_nbclust_k_selection.json",
    producingStage: "select_axis_b_k_nbclust.py",
    expectedSha256: "f26ebeda169479c64cfa42859f97595ba1c0e9501f33a4631117274724b4943c",
    runtimeAuditFilename: "axis_b_nbclust_k_selection.runtime.json",
    scientificContract: axisBKSelectionScientificContract,
    compareScientificContracts: compareAxisBKSelectionScientificContracts
  },
  dpc_seed_selection: {
    filename: "axis_b_dpc_seed_selection.json",
    producingStage: "select_axis_b_dpc_seeds.py",
    expectedSha256: "782afd7dc4759d8875fe6517d6cc03204e9f49929817e5eae1ccdf7390b1c6d3",
    runtimeAuditFilename: "axis_b_dpc_seed_selection.runtime.json",
    scientificContract: axisBDpcScientificContract
  }
};

export const sha256File = (filename: string): string =>
  crypto.createHash("sha256").update(fs.readFileSync(filename)).digest("hex");

const readJson = (filename: string, label: string): JsonRecord => {
  try {
    return requireRecord(JSON.parse(fs.readFileSync(filename, "utf8")), label);
  } catch (error) {
    if (error instanceof AxisBFrozenPrerequisiteError) throw error;
    throw new AxisBFrozenPrerequisiteError(`${label} could not be parsed.`);
  }
};

const controlledWorkspacePath = (workspace: string, ...segments: string[]): string => {
  const workspaceRoot = path.resolve(workspace);
  const resolved = path.resolve(workspaceRoot, ...segments);
  if (!resolved.startsWith(`${workspaceRoot}${path.sep}`)) {
    throw new AxisBFrozenPrerequisiteError("A frozen prerequisite path escaped the execution workspace.");
  }
  return resolved;
};

const writeAuditManifest = (workspace: string, audit: FrozenPrerequisiteAudit): void => {
  const auditDirectory = controlledWorkspacePath(workspace, "data", "interim", auditDirectoryName);
  const manifestPath = path.join(auditDirectory, auditManifestFilename);
  let entries: FrozenPrerequisiteAudit[] = [];
  if (fs.existsSync(manifestPath)) {
    const existing = requireRecord(JSON.parse(fs.readFileSync(manifestPath, "utf8")), "frozen prerequisite audit manifest");
    if (!Array.isArray(existing.entries)) throw new AxisBFrozenPrerequisiteError("Frozen prerequisite audit manifest is invalid.");
    entries = existing.entries as FrozenPrerequisiteAudit[];
  }
  const document = {
    purpose: "Runtime reproduction artifacts validated before authoritative frozen artifact substitution.",
    entries: [...entries.filter((entry) => entry.prerequisite !== audit.prerequisite), audit]
  };
  fs.writeFileSync(manifestPath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
};

export const reconcileAxisBFrozenPrerequisite = (
  workspace: string,
  prerequisite: AxisBFrozenPrerequisiteName,
  dependencies: ReconciliationDependencies = {}
): FrozenPrerequisiteAudit => {
  const spec = axisBFrozenPrerequisites[prerequisite];
  const workspaceArtifact = controlledWorkspacePath(workspace, "data", "interim", spec.filename);
  if (!fs.existsSync(workspaceArtifact) || !fs.statSync(workspaceArtifact).isFile()) {
    throw new AxisBFrozenPrerequisiteError(`Runtime prerequisite is missing: ${spec.filename}.`);
  }
  const runtimeHash = sha256File(workspaceArtifact);
  const authoritativeDirectory = dependencies.authoritativeDirectory ?? authoritativeInterimDirectory;
  const authoritativeArtifact = path.join(authoritativeDirectory, spec.filename);
  if (!fs.existsSync(authoritativeArtifact) || !fs.statSync(authoritativeArtifact).isFile()) {
    throw new AxisBFrozenPrerequisiteError(`Authoritative prerequisite is missing: ${spec.filename}.`);
  }
  const authoritativeHash = sha256File(authoritativeArtifact);
  if (authoritativeHash !== spec.expectedSha256) {
    throw new AxisBFrozenPrerequisiteError(`Authoritative prerequisite hash is invalid: ${spec.filename}.`);
  }

  const runtimeContract = spec.scientificContract(readJson(workspaceArtifact, `runtime ${spec.filename}`));
  const authoritativeContract = spec.scientificContract(readJson(authoritativeArtifact, `authoritative ${spec.filename}`));
  const numericalReproducibility = spec.compareScientificContracts?.(runtimeContract, authoritativeContract);
  if (!spec.compareScientificContracts && !isDeepStrictEqual(runtimeContract, authoritativeContract)) {
    throw new AxisBFrozenPrerequisiteError(`Runtime scientific equivalence failed: ${spec.filename}.`);
  }

  const auditDirectory = controlledWorkspacePath(workspace, "data", "interim", auditDirectoryName);
  fs.mkdirSync(auditDirectory, { recursive: true });
  const runtimeAuditArtifact = path.join(auditDirectory, spec.runtimeAuditFilename);
  fs.copyFileSync(workspaceArtifact, runtimeAuditArtifact);
  if (sha256File(runtimeAuditArtifact) !== runtimeHash) {
    throw new AxisBFrozenPrerequisiteError(`Runtime audit copy hash is invalid: ${spec.filename}.`);
  }

  const byteIdentical = runtimeHash === authoritativeHash;
  if (!byteIdentical) {
    (dependencies.copyFile ?? fs.copyFileSync)(authoritativeArtifact, workspaceArtifact);
  }
  if (sha256File(workspaceArtifact) !== spec.expectedSha256) {
    throw new AxisBFrozenPrerequisiteError(`Workspace authoritative copy hash is invalid: ${spec.filename}.`);
  }

  const audit: FrozenPrerequisiteAudit = {
    prerequisite,
    producing_stage: spec.producingStage,
    runtime_artifact_role: "runtime reproduction artifact",
    runtime_generated_sha256: runtimeHash,
    authoritative_artifact_role: "authoritative frozen artifact",
    authoritative_frozen_sha256: authoritativeHash,
    semantic_equivalence: true,
    byte_identical: byteIdentical,
    authoritative_substitution_occurred: !byteIdentical,
    runtime_audit_path: path.posix.join("data", "interim", auditDirectoryName, spec.runtimeAuditFilename),
    ...(numericalReproducibility ? { numerical_reproducibility: numericalReproducibility } : {})
  };
  writeAuditManifest(workspace, audit);
  return audit;
};
