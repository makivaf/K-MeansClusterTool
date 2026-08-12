import crypto from "node:crypto";
import {
  AxisAClusteringRunSchema,
  type AxisAClusteringRun
} from "../../../../packages/shared/src/schema";
import { finiteNumber, positiveInteger, readCsvRecords } from "./artifactReaders";

type AdapterOptions = { runId?: string; title?: string; createdAt?: string };

const metricMap = (rows: Record<string, string>[]) => Object.fromEntries(rows.map((row) => [row.metric, row.value]));

export const adaptAxisAResult = (artifactDirectory: string, options: AdapterOptions = {}): AxisAClusteringRun => {
  const preprocessing = readCsvRecords(artifactDirectory, "axis_a_preprocessing_summary.csv");
  const exclusions = readCsvRecords(artifactDirectory, "axis_a_final_exclusion_preview.csv");
  const variance = readCsvRecords(artifactDirectory, "axis_a_pca_explained_variance.csv");
  const votes = readCsvRecords(artifactDirectory, "axis_a_nbclust_summary.csv");
  const dpcSummary = metricMap(readCsvRecords(artifactDirectory, "axis_a_dpc_summary.csv"));
  const selectedCentroids = readCsvRecords(artifactDirectory, "axis_a_dpc_selected_centroids.csv");
  const enhancedMetrics = metricMap(readCsvRecords(artifactDirectory, "axis_a_enhanced_metrics.csv"));
  const enhancedSummary = metricMap(readCsvRecords(artifactDirectory, "axis_a_enhanced_run_summary.csv"));
  const comparison = readCsvRecords(artifactDirectory, "axis_a_dpc_ablation_comparison.csv");

  const selectedK = positiveInteger(dpcSummary.selected_k, "Axis A selected k");
  const retainedComponents = variance.filter((row) => row.retained_for_85_percent.toLowerCase() === "true");
  const retainedSampleSize = positiveInteger(enhancedSummary.input_rows, "Axis A retained sample size");
  if (preprocessing.length !== 13) throw new Error("Axis A aggregate artifact does not contain 13 retained variables.");
  if (selectedCentroids.length !== selectedK) throw new Error("Axis A DPC centroid count does not match selected k.");
  const clusterSizes = Array.from({ length: selectedK }, (_, index) => positiveInteger(enhancedSummary[`cluster_${index}_size`], `Axis A cluster ${index + 1} size`));

  const byMetric = (metric: string) => {
    const row = comparison.find((candidate) => candidate.metric === metric);
    if (!row) throw new Error(`Axis A comparison is missing ${metric}.`);
    return finiteNumber(row.random_mean, `Axis A random mean ${metric}`);
  };

  return AxisAClusteringRunSchema.parse({
    run_id: options.runId ?? `axis-a-${crypto.randomUUID()}`,
    result_source: "validated_research_output",
    axis: "Axis A",
    title: options.title ?? "Axis A cognitive-profile analysis",
    description: "Validated cross-sectional cognitive/functional clustering result mapped from aggregate research artifacts.",
    created_at: options.createdAt ?? new Date().toISOString(),
    dataset: { name: "ADNI Axis A", cohort: "ADNI1-ADNI3 study-entry cohort", feature_count: 13, assessment_domain: "Cognitive and functional variables" },
    preprocessing: {
      missingness_threshold: 0.2,
      initial_sample_size: retainedSampleSize,
      retained_sample_size: retainedSampleSize,
      imputation_strategy: "Median imputation",
      scaling_strategy: "Z-score standardization",
      npiq_excluded: true,
      excluded_variables: exclusions.map((row) => ({ variable: row.candidate_variable, missing_rate: finiteNumber(row.missing_percentage, `${row.candidate_variable} missing percentage`) / 100, reason: row.explanation }))
    },
    pca: {
      n_components_selected: retainedComponents.length,
      cumulative_explained_variance: finiteNumber(retainedComponents.at(-1)?.cumulative_explained_variance, "Axis A cumulative explained variance"),
      scree_data: variance.map((row) => ({ component: positiveInteger(row.component_number, "PCA component"), eigenvalue: finiteNumber(row.explained_variance, "PCA eigenvalue"), individual_variance: finiteNumber(row.explained_variance_ratio, "PCA variance ratio"), cumulative_variance: finiteNumber(row.cumulative_explained_variance, "PCA cumulative variance") }))
    },
    nbclust: {
      candidate_k: votes.map((row) => positiveInteger(row.k, "Axis A candidate k")),
      selected_k: selectedK,
      index_votes: votes.map((row) => ({ optimal_k: positiveInteger(row.k, "Axis A vote k"), votes: Number(row.vote_count) })),
      vote_summary: []
    },
    dpc_init: {
      gamma_values: selectedCentroids.map((row, index) => ({ candidate_id: `candidate-${index + 1}`, rho: finiteNumber(row.rho, "DPC rho"), delta: finiteNumber(row.delta, "DPC delta"), gamma: finiteNumber(row.gamma, "DPC gamma") })),
      selected_centroids: selectedCentroids.map((row, index) => ({ centroid_rank: index + 1, candidate_id: `candidate-${index + 1}`, gamma: finiteNumber(row.gamma, "DPC gamma"), assigned_cluster: index + 1 }))
    },
    conditions: [
      { condition: "baseline", algorithm_label: "30-run random initialization comparator in the same PCA space", initialization: { method: "random", independent_runs: 30 }, metrics: { silhouette: byMetric("silhouette"), davies_bouldin: byMetric("davies_bouldin"), calinski_harabasz: byMetric("calinski_harabasz") }, cluster_profiles: [] },
      { condition: "enhanced", algorithm_label: "PCA + NbClust + DPC-derived initialization + Lloyd K-Means", initialization: { method: "dpc_derived_centroids" }, metrics: { silhouette: finiteNumber(enhancedMetrics.silhouette_coefficient, "Axis A silhouette"), davies_bouldin: finiteNumber(enhancedMetrics.davies_bouldin_index, "Axis A Davies-Bouldin"), calinski_harabasz: finiteNumber(enhancedMetrics.calinski_harabasz_index, "Axis A Calinski-Harabasz") }, cluster_profiles: clusterSizes.map((n_members, index) => ({ cluster_id: index + 1, n_members, variable_means: {} })) }
    ]
  });
};
