import { ClusteringRunSchema, type ClusteringRun } from "./schema";

const metricSet = {
  axisA1Baseline: {
    silhouette: 0.462,
    davies_bouldin: 0.912,
    calinski_harabasz: 1842.6
  },
  axisA1Enhanced: {
    silhouette: 0.623,
    davies_bouldin: 0.571,
    calinski_harabasz: 2965.3
  },
  axisA2Baseline: {
    silhouette: 0.418,
    davies_bouldin: 1.037,
    calinski_harabasz: 1510.8
  },
  axisA2Enhanced: {
    silhouette: 0.552,
    davies_bouldin: 0.694,
    calinski_harabasz: 2298.4
  },
  axisBBaseline: {
    silhouette: 0.381,
    davies_bouldin: 1.144,
    calinski_harabasz: 1216.5
  },
  axisBEnhanced: {
    silhouette: 0.497,
    davies_bouldin: 0.801,
    calinski_harabasz: 1889.7
  }
};

const axisAScree = [
  [1, 6.1, 0.228, 0.228],
  [2, 3.4, 0.127, 0.355],
  [3, 2.7, 0.101, 0.456],
  [4, 1.9, 0.071, 0.527],
  [5, 1.55, 0.058, 0.585],
  [6, 1.2, 0.045, 0.63],
  [7, 0.98, 0.037, 0.667],
  [8, 0.82, 0.031, 0.698],
  [9, 0.68, 0.025, 0.723],
  [10, 0.56, 0.021, 0.744],
  [11, 0.47, 0.018, 0.762],
  [12, 0.4, 0.015, 0.777],
  [13, 0.35, 0.013, 0.79],
  [14, 0.31, 0.012, 0.802]
];

const axisBScree = [
  [1, 4.8, 0.194, 0.194],
  [2, 3.1, 0.125, 0.319],
  [3, 2.4, 0.097, 0.416],
  [4, 1.8, 0.073, 0.489],
  [5, 1.45, 0.059, 0.548],
  [6, 1.22, 0.049, 0.597],
  [7, 0.98, 0.04, 0.637],
  [8, 0.82, 0.033, 0.67],
  [9, 0.68, 0.027, 0.697],
  [10, 0.59, 0.024, 0.721],
  [11, 0.48, 0.019, 0.74],
  [12, 0.42, 0.017, 0.757]
];

const toScree = (rows: number[][]) =>
  rows.map(([component, eigenvalue, individual_variance, cumulative_variance]) => ({
    component,
    eigenvalue,
    individual_variance,
    cumulative_variance
  }));

const gamma = [
  ["C-014", 11.2, 7.8, 87.36],
  ["C-037", 10.8, 6.5, 70.2],
  ["C-052", 9.4, 6.1, 57.34],
  ["C-086", 8.1, 5.4, 43.74],
  ["C-117", 7.8, 4.6, 35.88],
  ["C-141", 6.2, 4.9, 30.38],
  ["C-173", 5.6, 4.1, 22.96],
  ["C-205", 4.9, 3.8, 18.62],
  ["C-228", 4.1, 3.2, 13.12],
  ["C-266", 3.6, 2.9, 10.44]
].map(([candidate_id, rho, delta, gamma]) => ({
  candidate_id: String(candidate_id),
  rho: Number(rho),
  delta: Number(delta),
  gamma: Number(gamma)
}));

const profilesA = [
  {
    cluster_id: 1,
    n_members: 461,
    variable_means: { MMSE: 28.2, ADAS13: 12.6, CDRSB: 1.1, RAVLT_immediate: 42.5 },
    post_hoc_summary: {
      age: { mean: 70.8, sd: 6.2, min: 57.0, max: 84.0 },
      diagnosis_distribution: { CN: 304, MCI: 142, AD: 15 },
      apoe4_distribution: { "0 copies": 246, "1 copy": 174, "2 copies": 41 }
    }
  },
  {
    cluster_id: 2,
    n_members: 516,
    variable_means: { MMSE: 25.9, ADAS13: 20.8, CDRSB: 2.4, RAVLT_immediate: 31.7 },
    post_hoc_summary: {
      age: { mean: 73.4, sd: 7.1, min: 58.0, max: 88.0 },
      diagnosis_distribution: { CN: 88, MCI: 339, AD: 89 },
      apoe4_distribution: { "0 copies": 203, "1 copy": 235, "2 copies": 78 }
    }
  },
  {
    cluster_id: 3,
    n_members: 438,
    variable_means: { MMSE: 22.7, ADAS13: 31.9, CDRSB: 4.7, RAVLT_immediate: 21.6 },
    post_hoc_summary: {
      age: { mean: 75.2, sd: 7.8, min: 60.0, max: 90.0 },
      diagnosis_distribution: { CN: 20, MCI: 191, AD: 227 },
      apoe4_distribution: { "0 copies": 126, "1 copy": 211, "2 copies": 101 }
    }
  },
  {
    cluster_id: 4,
    n_members: 427,
    variable_means: { MMSE: 18.9, ADAS13: 43.5, CDRSB: 7.2, RAVLT_immediate: 14.2 },
    post_hoc_summary: {
      age: { mean: 76.9, sd: 8.4, min: 62.0, max: 91.0 },
      diagnosis_distribution: { CN: 4, MCI: 98, AD: 325 },
      apoe4_distribution: { "0 copies": 105, "1 copy": 197, "2 copies": 125 }
    }
  }
];

const profilesB = [
  {
    cluster_id: 1,
    n_members: 332,
    variable_means: { "MMSE_slope": -0.4, "ADAS13_slope": 1.1, "CDRSB_slope": 0.18, "RAVLT_slope": -0.9 },
    post_hoc_summary: {
      age: { mean: 69.9, sd: 6.6, min: 56.0, max: 84.0 },
      diagnosis_distribution: { CN: 184, MCI: 132, AD: 16 },
      apoe4_distribution: { "0 copies": 189, "1 copy": 116, "2 copies": 27 }
    }
  },
  {
    cluster_id: 2,
    n_members: 407,
    variable_means: { "MMSE_slope": -1.2, "ADAS13_slope": 3.7, "CDRSB_slope": 0.52, "RAVLT_slope": -2.4 },
    post_hoc_summary: {
      age: { mean: 73.1, sd: 7.4, min: 58.0, max: 89.0 },
      diagnosis_distribution: { CN: 58, MCI: 276, AD: 73 },
      apoe4_distribution: { "0 copies": 142, "1 copy": 197, "2 copies": 68 }
    }
  },
  {
    cluster_id: 3,
    n_members: 361,
    variable_means: { "MMSE_slope": -2.1, "ADAS13_slope": 6.2, "CDRSB_slope": 0.91, "RAVLT_slope": -3.8 },
    post_hoc_summary: {
      age: { mean: 75.8, sd: 8.1, min: 60.0, max: 91.0 },
      diagnosis_distribution: { CN: 17, MCI: 169, AD: 175 },
      apoe4_distribution: { "0 copies": 102, "1 copy": 168, "2 copies": 91 }
    }
  }
];

const makeVotes = (selected_k: number) => ({
  candidate_k: [2, 3, 4, 5, 6],
  selected_k,
  index_votes: [
    { optimal_k: 2, votes: selected_k === 2 ? 6 : 2 },
    { optimal_k: 3, votes: selected_k === 3 ? 10 : 5 },
    { optimal_k: 4, votes: selected_k === 4 ? 13 : 7 },
    { optimal_k: 5, votes: selected_k === 5 ? 9 : 3 },
    { optimal_k: 6, votes: selected_k === 6 ? 8 : 1 }
  ],
  vote_summary: [
    { index_name: "Silhouette", optimal_k: selected_k, criterion_value: 0.61, direction: "higher" },
    { index_name: "Calinski-Harabasz", optimal_k: selected_k, criterion_value: 2965.3, direction: "higher" },
    { index_name: "Davies-Bouldin", optimal_k: selected_k, criterion_value: 0.57, direction: "lower" },
    { index_name: "Dunn", optimal_k: selected_k, criterion_value: 0.22, direction: "higher" },
    { index_name: "Gap Statistic", optimal_k: selected_k, criterion_value: 1.18, direction: "maximum" }
  ]
});

export const dummyRuns: ClusteringRun[] = [
  {
    run_id: "axis-a-baseline-2024-05-18",
    axis: "Axis A",
    title: "Axis A baseline cognition clustering",
    description: "Cross-sectional baseline-only ADNI cognitive assessment clustering.",
    created_at: "2024-05-18T09:30:00.000Z",
    dataset: {
      name: "ADNI",
      cohort: "Baseline visits only",
      feature_count: 34,
      assessment_domain: "Cognitive scores and clinical summaries"
    },
    preprocessing: {
      missingness_threshold: 0.25,
      initial_sample_size: 2148,
      retained_sample_size: 1842,
      imputation_strategy: "Median imputation by diagnosis stratum",
      scaling_strategy: "Z-score scaling after winsorization",
      excluded_variables: [
        { variable: "FAQTOTAL_bl", missing_rate: 0.31, reason: "Above missingness threshold" },
        { variable: "MOCADEL_bl", missing_rate: 0.28, reason: "Sparse delayed recall entries" },
        { variable: "TRABSCOR_bl", missing_rate: 0.27, reason: "Visit form unavailable for subset" }
      ]
    },
    pca: {
      n_components_selected: 8,
      cumulative_explained_variance: 0.698,
      scree_data: toScree(axisAScree)
    },
    nbclust: makeVotes(4),
    dpc_init: {
      gamma_values: gamma,
      selected_centroids: gamma.slice(0, 4).map((row, index) => ({
        centroid_rank: index + 1,
        candidate_id: row.candidate_id,
        gamma: row.gamma,
        assigned_cluster: index + 1
      }))
    },
    conditions: [
      {
        condition: "baseline",
        algorithm_label: "Baseline K-Means",
        metrics: metricSet.axisA1Baseline,
        cluster_profiles: profilesA
      },
      {
        condition: "enhanced",
        algorithm_label: "Enhanced K-Means (PCA + NbClust + DPC-init)",
        metrics: metricSet.axisA1Enhanced,
        cluster_profiles: profilesA.map((profile, index) => ({
          ...profile,
          n_members: profile.n_members + [18, -24, 31, -25][index],
          variable_means: {
            ...profile.variable_means,
            MMSE: profile.variable_means.MMSE + [0.3, -0.2, 0.1, -0.1][index]
          }
        }))
      }
    ]
  },
  {
    run_id: "axis-a-sensitivity-2024-06-02",
    axis: "Axis A",
    title: "Axis A sensitivity run",
    description: "Cross-sectional run using a stricter missingness filter and alternate PCA retention.",
    created_at: "2024-06-02T13:20:00.000Z",
    dataset: {
      name: "ADNI",
      cohort: "Baseline visits, strict missingness cohort",
      feature_count: 31,
      assessment_domain: "Cognitive scores and clinical summaries"
    },
    preprocessing: {
      missingness_threshold: 0.2,
      initial_sample_size: 2148,
      retained_sample_size: 1716,
      imputation_strategy: "Median imputation with chained sensitivity checks",
      scaling_strategy: "Robust scaling",
      excluded_variables: [
        { variable: "FAQTOTAL_bl", missing_rate: 0.31, reason: "Above missingness threshold" },
        { variable: "MOCADEL_bl", missing_rate: 0.28, reason: "Above missingness threshold" },
        { variable: "TRABSCOR_bl", missing_rate: 0.27, reason: "Above missingness threshold" },
        { variable: "DIGITSCOR_bl", missing_rate: 0.22, reason: "Above missingness threshold" }
      ]
    },
    pca: {
      n_components_selected: 7,
      cumulative_explained_variance: 0.667,
      scree_data: toScree(axisAScree.slice(0, 12))
    },
    nbclust: makeVotes(3),
    dpc_init: {
      gamma_values: gamma.slice(0, 8),
      selected_centroids: gamma.slice(0, 3).map((row, index) => ({
        centroid_rank: index + 1,
        candidate_id: row.candidate_id,
        gamma: row.gamma,
        assigned_cluster: index + 1
      }))
    },
    conditions: [
      {
        condition: "baseline",
        algorithm_label: "Baseline K-Means",
        metrics: metricSet.axisA2Baseline,
        cluster_profiles: profilesA.slice(0, 3)
      },
      {
        condition: "enhanced",
        algorithm_label: "Enhanced K-Means (PCA + NbClust + DPC-init)",
        metrics: metricSet.axisA2Enhanced,
        cluster_profiles: profilesA.slice(0, 3).map((profile, index) => ({
          ...profile,
          n_members: profile.n_members + [11, 17, -28][index]
        }))
      }
    ]
  },
  {
    run_id: "axis-b-decline-2024-06-16",
    axis: "Axis B",
    title: "Axis B longitudinal decline trajectories",
    description: "Longitudinal slope-based clustering of cognitive decline trajectories.",
    created_at: "2024-06-16T10:10:00.000Z",
    dataset: {
      name: "ADNI",
      cohort: "Participants with at least three longitudinal visits",
      feature_count: 28,
      assessment_domain: "Longitudinal cognitive decline slopes"
    },
    preprocessing: {
      missingness_threshold: 0.3,
      initial_sample_size: 1562,
      retained_sample_size: 1100,
      imputation_strategy: "Linear mixed-model slope extraction, median imputation for residual gaps",
      scaling_strategy: "Z-score scaling of annualized slopes",
      excluded_variables: [
        { variable: "ADAS11_slope", missing_rate: 0.34, reason: "Insufficient repeated observations" },
        { variable: "EcogSPMemory_slope", missing_rate: 0.32, reason: "Follow-up form missingness" },
        { variable: "CDGLOBAL_slope", missing_rate: 0.31, reason: "Sparse visit coverage" }
      ]
    },
    pca: {
      n_components_selected: 8,
      cumulative_explained_variance: 0.67,
      scree_data: toScree(axisBScree)
    },
    nbclust: makeVotes(3),
    dpc_init: {
      gamma_values: gamma.slice(1, 9),
      selected_centroids: gamma.slice(1, 4).map((row, index) => ({
        centroid_rank: index + 1,
        candidate_id: row.candidate_id,
        gamma: row.gamma,
        assigned_cluster: index + 1
      }))
    },
    conditions: [
      {
        condition: "baseline",
        algorithm_label: "Baseline K-Means",
        metrics: metricSet.axisBBaseline,
        cluster_profiles: profilesB
      },
      {
        condition: "enhanced",
        algorithm_label: "Enhanced K-Means (PCA + NbClust + DPC-init)",
        metrics: metricSet.axisBEnhanced,
        cluster_profiles: profilesB.map((profile, index) => ({
          ...profile,
          n_members: profile.n_members + [21, -8, -13][index]
        }))
      }
    ]
  }
].map((run) => ClusteringRunSchema.parse(run));
