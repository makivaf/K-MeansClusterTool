import { z } from "zod";

export const AxisSchema = z.enum(["Axis A", "Axis B"]);
export const ConditionSchema = z.enum(["baseline", "enhanced"]);

export const DatasetSummarySchema = z.object({
  name: z.string(),
  cohort: z.string(),
  feature_count: z.number().int().positive(),
  assessment_domain: z.string()
});

export const ExcludedVariableSchema = z.object({
  variable: z.string(),
  missing_rate: z.number().min(0).max(1),
  reason: z.string()
});

export const PreprocessingSummarySchema = z.object({
  missingness_threshold: z.number().min(0).max(1),
  initial_sample_size: z.number().int().positive(),
  retained_sample_size: z.number().int().positive(),
  imputation_strategy: z.string(),
  scaling_strategy: z.string(),
  excluded_variables: z.array(ExcludedVariableSchema)
});

export const ScreePointSchema = z.object({
  component: z.number().int().positive(),
  eigenvalue: z.number().nonnegative(),
  individual_variance: z.number().min(0).max(1),
  cumulative_variance: z.number().min(0).max(1)
});

export const PcaSummarySchema = z.object({
  n_components_selected: z.number().int().positive(),
  cumulative_explained_variance: z.number().min(0).max(1),
  scree_data: z.array(ScreePointSchema)
});

export const IndexVoteSchema = z.object({
  optimal_k: z.number().int().positive(),
  votes: z.number().int().nonnegative()
});

export const VoteSummarySchema = z.object({
  index_name: z.string(),
  optimal_k: z.number().int().positive(),
  criterion_value: z.number(),
  direction: z.enum(["higher", "lower", "maximum", "minimum"])
});

export const NbClustSummarySchema = z.object({
  candidate_k: z.array(z.number().int().positive()),
  selected_k: z.number().int().positive(),
  index_votes: z.array(IndexVoteSchema),
  vote_summary: z.array(VoteSummarySchema)
});

export const GammaValueSchema = z.object({
  candidate_id: z.string(),
  rho: z.number().nonnegative(),
  delta: z.number().nonnegative(),
  gamma: z.number().nonnegative()
});

export const SelectedCentroidSchema = z.object({
  centroid_rank: z.number().int().positive(),
  candidate_id: z.string(),
  gamma: z.number().nonnegative(),
  assigned_cluster: z.number().int().positive()
});

export const DpcInitSummarySchema = z.object({
  gamma_values: z.array(GammaValueSchema),
  selected_centroids: z.array(SelectedCentroidSchema)
});

export const ClusteringMetricsSchema = z.object({
  silhouette: z.number(),
  davies_bouldin: z.number(),
  calinski_harabasz: z.number()
});

export const PostHocSummarySchema = z.object({
  age: z.object({
    mean: z.number(),
    sd: z.number().nonnegative(),
    min: z.number(),
    max: z.number()
  }),
  diagnosis_distribution: z.record(z.string(), z.number().int().nonnegative()),
  apoe4_distribution: z.record(z.string(), z.number().int().nonnegative())
});

export const ClusterProfileSchema = z.object({
  cluster_id: z.number().int().positive(),
  n_members: z.number().int().nonnegative(),
  variable_means: z.record(z.string(), z.number()),
  post_hoc_summary: PostHocSummarySchema
});

export const ConditionResultSchema = z.object({
  condition: ConditionSchema,
  algorithm_label: z.string(),
  metrics: ClusteringMetricsSchema,
  cluster_profiles: z.array(ClusterProfileSchema)
});

export const ClusteringRunSchema = z.object({
  run_id: z.string(),
  axis: AxisSchema,
  title: z.string(),
  description: z.string(),
  created_at: z.string().datetime(),
  dataset: DatasetSummarySchema,
  preprocessing: PreprocessingSummarySchema,
  pca: PcaSummarySchema,
  nbclust: NbClustSummarySchema,
  dpc_init: DpcInitSummarySchema,
  conditions: z.tuple([
    ConditionResultSchema.extend({ condition: z.literal("baseline") }),
    ConditionResultSchema.extend({ condition: z.literal("enhanced") })
  ])
});

export const RunListResponseSchema = z.object({
  runs: z.array(ClusteringRunSchema)
});

export const RunResponseSchema = z.object({
  run: ClusteringRunSchema
});

export const UploadResponseSchema = z.object({
  upload_ref: z.string(),
  filenames: z.array(z.string()),
  file_count: z.number().int().positive()
});

export const ClusterRunRequestSchema = z.object({
  upload_ref: z.string().min(1)
});

export const ClusterRunResponseSchema = z.object({
  status: z.literal("complete"),
  run_id: z.string()
});

export type Axis = z.infer<typeof AxisSchema>;
export type Condition = z.infer<typeof ConditionSchema>;
export type DatasetSummary = z.infer<typeof DatasetSummarySchema>;
export type ExcludedVariable = z.infer<typeof ExcludedVariableSchema>;
export type PreprocessingSummary = z.infer<typeof PreprocessingSummarySchema>;
export type ScreePoint = z.infer<typeof ScreePointSchema>;
export type PcaSummary = z.infer<typeof PcaSummarySchema>;
export type IndexVote = z.infer<typeof IndexVoteSchema>;
export type VoteSummary = z.infer<typeof VoteSummarySchema>;
export type NbClustSummary = z.infer<typeof NbClustSummarySchema>;
export type GammaValue = z.infer<typeof GammaValueSchema>;
export type SelectedCentroid = z.infer<typeof SelectedCentroidSchema>;
export type DpcInitSummary = z.infer<typeof DpcInitSummarySchema>;
export type ClusteringMetrics = z.infer<typeof ClusteringMetricsSchema>;
export type PostHocSummary = z.infer<typeof PostHocSummarySchema>;
export type ClusterProfile = z.infer<typeof ClusterProfileSchema>;
export type ConditionResult = z.infer<typeof ConditionResultSchema>;
export type ClusteringRun = z.infer<typeof ClusteringRunSchema>;
export type RunListResponse = z.infer<typeof RunListResponseSchema>;
export type RunResponse = z.infer<typeof RunResponseSchema>;
export type UploadResponse = z.infer<typeof UploadResponseSchema>;
export type ClusterRunRequest = z.infer<typeof ClusterRunRequestSchema>;
export type ClusterRunResponse = z.infer<typeof ClusterRunResponseSchema>;
