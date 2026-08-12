import {
  AxisAClusteringRunSchema,
  AxisBClusteringRunSchema,
  type ClusteringRun
} from "./schema.js";

const fixtureMetrics = {
  silhouette: 0,
  davies_bouldin: 0,
  calinski_harabasz: 0
};

const fixturePostHoc = {
  age: { mean: 0, sd: 0, min: 0, max: 0 },
  diagnosis_distribution: {},
  apoe4_distribution: {}
};

const axisAProfiles = [
  {
    cluster_id: 1,
    n_members: 1,
    variable_means: {},
    post_hoc_summary: fixturePostHoc
  },
  {
    cluster_id: 2,
    n_members: 1,
    variable_means: {},
    post_hoc_summary: fixturePostHoc
  }
];

const selectedKFixture = {
  candidate_k: [2],
  selected_k: 2,
  index_votes: [{ optimal_k: 2, votes: 1 }],
  vote_summary: []
};

/**
 * Development-only schema fixture. Zero-valued descriptive metrics are
 * intentional placeholders and are not validated thesis findings.
 */
export const axisADevelopmentFixture = AxisAClusteringRunSchema.parse({
  run_id: "dev-fixture-axis-a",
  result_source: "development_fixture",
  axis: "Axis A",
  title: "Development fixture — Axis A contract",
  description:
    "Schema-valid aggregate development fixture for the locked Axis A structure; descriptive values are not research findings.",
  created_at: "2026-08-13T00:00:00.000Z",
  dataset: {
    name: "ADNI development fixture",
    cohort: "ADNI1–ADNI3 study-entry cohort structure",
    feature_count: 13,
    assessment_domain: "Cognitive and functional variables"
  },
  preprocessing: {
    missingness_threshold: 0.2,
    initial_sample_size: 2,
    retained_sample_size: 2,
    imputation_strategy: "Median imputation",
    scaling_strategy: "Z-score standardization",
    npiq_excluded: true,
    excluded_variables: [
      { variable: "NPIQ", reason: "Excluded by the validated Axis A scope decision" },
      { variable: "BNT", reason: "Excluded by the validated Axis A scope decision" }
    ]
  },
  pca: {
    n_components_selected: 2,
    cumulative_explained_variance: 1,
    scree_data: [
      { component: 1, eigenvalue: 1, individual_variance: 0.6, cumulative_variance: 0.6 },
      { component: 2, eigenvalue: 1, individual_variance: 0.4, cumulative_variance: 1 }
    ]
  },
  nbclust: selectedKFixture,
  dpc_init: {
    gamma_values: [
      { candidate_id: "candidate-1", rho: 1, delta: 1, gamma: 1 },
      { candidate_id: "candidate-2", rho: 1, delta: 1, gamma: 1 }
    ],
    selected_centroids: [
      { centroid_rank: 1, candidate_id: "candidate-1", gamma: 1, assigned_cluster: 1 },
      { centroid_rank: 2, candidate_id: "candidate-2", gamma: 1, assigned_cluster: 2 }
    ]
  },
  conditions: [
    {
      condition: "baseline",
      algorithm_label: "Development fixture — 30-run random baseline",
      initialization: { method: "random", independent_runs: 30 },
      metrics: fixtureMetrics,
      cluster_profiles: axisAProfiles
    },
    {
      condition: "enhanced",
      algorithm_label: "Development fixture — PCA + NbClust + DPC-init Lloyd K-Means",
      initialization: { method: "dpc_derived_centroids" },
      metrics: fixtureMetrics,
      cluster_profiles: axisAProfiles
    }
  ]
});

/**
 * Development-only schema fixture. It intentionally has no PCA, DPC-init, or
 * Axis A-style enhanced condition. Zero-valued metrics are not research findings.
 */
export const axisBDevelopmentFixture = AxisBClusteringRunSchema.parse({
  run_id: "dev-fixture-axis-b",
  result_source: "development_fixture",
  axis: "Axis B",
  title: "Development fixture — Axis B contract",
  description:
    "Schema-valid aggregate development fixture for the locked final Axis B structure; descriptive values are not research findings.",
  created_at: "2026-08-13T00:00:00.000Z",
  dataset: {
    name: "ADNI development fixture",
    cohort: "Longitudinal ADAS-Cog13 slope cohort structure",
    feature_count: 1,
    assessment_domain: "Participant-level ADAS-Cog13 progression rate"
  },
  preprocessing: {
    missingness_threshold: 0,
    initial_sample_size: 3,
    retained_sample_size: 3,
    imputation_strategy: "Not applicable",
    scaling_strategy: "None; raw slopes used",
    excluded_variables: []
  },
  slope_construction: {
    feature: "beta1_slope_points_per_year",
    feature_label: "Participant-level ADAS-Cog13 slope",
    participant_count: 3,
    input_dimensions: 1,
    unit: "ADAS-Cog13 points per year"
  },
  nbclust: selectedKFixture,
  dpc_suitability: {
    evaluated: true,
    used_for_final_initialization: false,
    conclusion: "rejected_unstable_in_one_dimensional_slope_space",
    summary:
      "DPC suitability was evaluated and rejected for final Axis B initialization because the inherited result was unstable in one-dimensional slope space."
  },
  final_clustering: {
    algorithm: "lloyd_kmeans",
    algorithm_label: "Fixed-seed standard Lloyd K-Means",
    selected_k: 2,
    initialization: {
      method: "fixed_seed_random",
      random_seed: 0,
      n_init: 1
    },
    metrics: fixtureMetrics,
    cluster_profiles: [
      { cluster_id: 1, n_members: 2, variable_means: {} },
      { cluster_id: 2, n_members: 1, variable_means: {} }
    ]
  }
});

export const dummyRuns: ClusteringRun[] = [axisADevelopmentFixture, axisBDevelopmentFixture];
