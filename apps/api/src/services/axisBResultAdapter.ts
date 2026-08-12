import crypto from "node:crypto";
import { AxisBClusteringRunSchema, type AxisBClusteringRun } from "../../../../packages/shared/src/schema";
import { ArtifactValidationError, finiteNumber, positiveInteger, readJsonArtifact } from "./artifactReaders";

type AdapterOptions = { runId?: string; title?: string; createdAt?: string };
type JsonObject = Record<string, any>;

const objectAt = (value: unknown, key: string): JsonObject => {
  if (!value || typeof value !== "object" || Array.isArray(value) || !(key in value)) throw new ArtifactValidationError(`Axis B aggregate JSON is missing ${key}.`);
  const child = (value as JsonObject)[key];
  if (!child || typeof child !== "object" || Array.isArray(child)) throw new ArtifactValidationError(`Axis B aggregate JSON has invalid ${key}.`);
  return child as JsonObject;
};

const arrayAt = (value: unknown, key: string): JsonObject[] => {
  if (!value || typeof value !== "object" || !Array.isArray((value as JsonObject)[key])) throw new ArtifactValidationError(`Axis B aggregate JSON is missing ${key}.`);
  return (value as JsonObject)[key] as JsonObject[];
};

export const adaptAxisBResult = (artifactDirectory: string, options: AdapterOptions = {}): AxisBClusteringRun => {
  const finalArtifact = readJsonArtifact<JsonObject>(artifactDirectory, "axis_b_final_clustering_metrics.json");
  const kArtifact = readJsonArtifact<JsonObject>(artifactDirectory, "axis_b_nbclust_k_selection.json");
  const dpcArtifact = readJsonArtifact<JsonObject>(artifactDirectory, "axis_b_dpc_methodology_reconciliation.json");
  const cohortArtifact = readJsonArtifact<JsonObject>(artifactDirectory, "axis_b_longitudinal_cohort_validation.json");
  const slopeArtifact = readJsonArtifact<JsonObject>(artifactDirectory, "axis_b_adas13_slopes_validation.json");

  const input = objectAt(finalArtifact, "input");
  const result = objectAt(finalArtifact, "result");
  const configuration = objectAt(finalArtifact, "configuration");
  const selection = objectAt(kArtifact, "selection");
  const nbConfiguration = objectAt(kArtifact, "nbclust_configuration");
  const dpcDecision = objectAt(dpcArtifact, "decision");
  const participantCounts = objectAt(cohortArtifact, "participant_counts");
  const filtering = objectAt(cohortArtifact, "filtering_flow");
  const cohortRevalidation = objectAt(slopeArtifact, "cohort_revalidation");
  const profiles = arrayAt(finalArtifact, "cluster_profiles");
  const voteDistribution = arrayAt(kArtifact, "vote_distribution");

  const participants = positiveInteger(input.participant_rows, "Axis B participants");
  const observations = positiveInteger(cohortRevalidation.observations ?? filtering.final_retained_observations, "Axis B observations");
  const selectedK = positiveInteger(selection.selected_k, "Axis B selected k");
  if (participantCounts.final_axis_b_longitudinal_participants !== participants) throw new ArtifactValidationError("Axis B cohort and clustering participant counts differ.");
  if (result.k !== selectedK || profiles.length !== selectedK) throw new ArtifactValidationError("Axis B selected k is inconsistent across aggregate artifacts.");
  if (input.PCA_applied !== false || dpcDecision.dpc_used_for_primary_axis_b_initialization !== false) throw new ArtifactValidationError("Axis B aggregate artifacts claim a prohibited PCA or DPC-final configuration.");

  return AxisBClusteringRunSchema.parse({
    run_id: options.runId ?? `axis-b-${crypto.randomUUID()}`,
    result_source: "validated_research_output",
    axis: "Axis B",
    title: options.title ?? "Axis B longitudinal progression analysis",
    description: "Validated one-dimensional ADAS-Cog13 slope clustering result mapped from aggregate research artifacts.",
    created_at: options.createdAt ?? new Date().toISOString(),
    dataset: { name: "ADNI Axis B", cohort: "Longitudinal ADAS-Cog13 slope cohort", feature_count: 1, assessment_domain: "Participant-level ADAS-Cog13 progression rate" },
    preprocessing: { missingness_threshold: 0, initial_sample_size: participants, retained_sample_size: participants, imputation_strategy: "Not applicable", scaling_strategy: "None; raw slopes used", excluded_variables: [] },
    slope_construction: { feature: "beta1_slope_points_per_year", feature_label: "Participant-level ADAS-Cog13 slope", participant_count: participants, observation_count: observations, input_dimensions: 1, unit: "ADAS-Cog13 points per year" },
    nbclust: {
      candidate_k: (nbConfiguration.candidate_k as unknown[]).map((value) => positiveInteger(value, "Axis B candidate k")),
      selected_k: selectedK,
      index_votes: voteDistribution.map((vote) => ({ optimal_k: positiveInteger(vote.k, "Axis B vote k"), votes: Number(vote.usable_nbclust_votes) })),
      vote_summary: []
    },
    dpc_suitability: { evaluated: true, used_for_final_initialization: false, conclusion: "rejected_unstable_in_one_dimensional_slope_space", summary: String(dpcDecision.reason) },
    final_clustering: {
      algorithm: "lloyd_kmeans",
      algorithm_label: "Fixed-seed standard Lloyd K-Means on raw participant slopes",
      selected_k: selectedK,
      initialization: { method: "fixed_seed_random", random_seed: finiteNumber(configuration.random_state, "Axis B random seed"), n_init: finiteNumber(configuration.n_init, "Axis B n_init") },
      metrics: { silhouette: finiteNumber(result.silhouette, "Axis B silhouette"), davies_bouldin: finiteNumber(result.davies_bouldin, "Axis B Davies-Bouldin"), calinski_harabasz: finiteNumber(result.calinski_harabasz, "Axis B Calinski-Harabasz") },
      cluster_profiles: profiles.map((profile) => ({
        cluster_id: positiveInteger(profile.ordered_cluster, "Axis B ordered cluster"),
        n_members: positiveInteger(profile.n, "Axis B cluster size"),
        variable_means: {
          centroid_slope: finiteNumber(profile.centroid_slope, "Axis B centroid slope"),
          mean_slope: finiteNumber(profile.mean_slope, "Axis B mean slope"),
          median_slope: finiteNumber(profile.median_slope, "Axis B median slope"),
          median_followup_years: finiteNumber(profile.median_followup_years, "Axis B median follow-up"),
          median_n_observations: finiteNumber(profile.median_n_observations, "Axis B median observations")
        }
      }))
    }
  });
};
