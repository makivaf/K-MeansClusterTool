import { z } from "zod";

export const AxisSchema = z.enum(["Axis A", "Axis B"]);
export const ResultSourceSchema = z.enum(["development_fixture", "validated_research_output"]);
export const ConditionSchema = z.enum(["baseline", "enhanced"]);

const participantLevelFieldPattern = /^(?:ptid|rid|participant(?:_id|_assignments?)?|subject_id|visit(?:_id|_rows?)?|raw_)/i;

const AggregateNumberRecordSchema = z.record(z.number()).superRefine((values, context) => {
  for (const key of Object.keys(values)) {
    if (participantLevelFieldPattern.test(key)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Participant-level field "${key}" is not allowed in aggregate results.`
      });
    }
  }
});

export const DatasetSummarySchema = z
  .object({
    name: z.string().min(1),
    cohort: z.string().min(1),
    feature_count: z.number().int().positive(),
    assessment_domain: z.string().min(1)
  })
  .strict();

export const ExcludedVariableSchema = z
  .object({
    variable: z.string().min(1),
    missing_rate: z.number().min(0).max(1).optional(),
    reason: z.string().min(1)
  })
  .strict();

export const PreprocessingSummarySchema = z
  .object({
    missingness_threshold: z.number().min(0).max(1),
    initial_sample_size: z.number().int().positive(),
    retained_sample_size: z.number().int().positive(),
    imputation_strategy: z.string().min(1),
    scaling_strategy: z.string().min(1),
    excluded_variables: z.array(ExcludedVariableSchema)
  })
  .strict();

export const ScreePointSchema = z
  .object({
    component: z.number().int().positive(),
    eigenvalue: z.number().nonnegative(),
    individual_variance: z.number().min(0).max(1),
    cumulative_variance: z.number().min(0).max(1)
  })
  .strict();

export const PcaSummarySchema = z
  .object({
    n_components_selected: z.number().int().positive(),
    cumulative_explained_variance: z.number().min(0).max(1),
    scree_data: z.array(ScreePointSchema)
  })
  .strict();

export const IndexVoteSchema = z
  .object({
    optimal_k: z.number().int().positive(),
    votes: z.number().int().nonnegative()
  })
  .strict();

export const VoteSummarySchema = z
  .object({
    index_name: z.string().min(1),
    optimal_k: z.number().int().positive(),
    criterion_value: z.number(),
    direction: z.enum(["higher", "lower", "maximum", "minimum"])
  })
  .strict();

export const NbClustSummarySchema = z
  .object({
    candidate_k: z.array(z.number().int().positive()).min(1),
    selected_k: z.number().int().positive(),
    index_votes: z.array(IndexVoteSchema),
    vote_summary: z.array(VoteSummarySchema)
  })
  .strict();

const AxisANbClustSummarySchema = NbClustSummarySchema.extend({
  selected_k: z.literal(2)
}).superRefine((summary, context) => {
  if (!summary.candidate_k.includes(2)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["candidate_k"],
      message: "Axis A candidate k values must include the selected k=2."
    });
  }
});

const AxisBNbClustSummarySchema = NbClustSummarySchema.extend({
  selected_k: z.literal(2)
}).superRefine((summary, context) => {
  if (!summary.candidate_k.includes(2)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["candidate_k"],
      message: "Axis B candidate k values must include the selected k=2."
    });
  }
});

const SafeCandidateIdSchema = z.string().regex(/^candidate-\d+$/, {
  message: "DPC candidate IDs must be aggregate-safe rank labels, not participant identifiers."
});

export const GammaValueSchema = z
  .object({
    candidate_id: SafeCandidateIdSchema,
    rho: z.number().nonnegative(),
    delta: z.number().nonnegative(),
    gamma: z.number().nonnegative()
  })
  .strict();

export const SelectedCentroidSchema = z
  .object({
    centroid_rank: z.number().int().positive(),
    candidate_id: SafeCandidateIdSchema,
    gamma: z.number().nonnegative(),
    assigned_cluster: z.number().int().positive()
  })
  .strict();

export const DpcInitSummarySchema = z
  .object({
    gamma_values: z.array(GammaValueSchema).min(2),
    selected_centroids: z.tuple([SelectedCentroidSchema, SelectedCentroidSchema])
  })
  .strict();

export const ClusteringMetricsSchema = z
  .object({
    silhouette: z.number(),
    davies_bouldin: z.number(),
    calinski_harabasz: z.number()
  })
  .strict();

export const PostHocSummarySchema = z
  .object({
    age: z
      .object({
        mean: z.number(),
        sd: z.number().nonnegative(),
        min: z.number(),
        max: z.number()
      })
      .strict(),
    diagnosis_distribution: z.record(z.string(), z.number().int().nonnegative()),
    apoe4_distribution: z.record(z.string(), z.number().int().nonnegative())
  })
  .strict();

const ClusterProfileCoreShape = {
  cluster_id: z.number().int().positive(),
  n_members: z.number().int().positive(),
  variable_means: AggregateNumberRecordSchema
};

export const AxisAClusterProfileSchema = z
  .object({
    ...ClusterProfileCoreShape,
    post_hoc_summary: PostHocSummarySchema
  })
  .strict();

export const AxisBClusterProfileSchema = z.object(ClusterProfileCoreShape).strict();
export const ClusterProfileSchema = z.union([AxisAClusterProfileSchema, AxisBClusterProfileSchema]);

const AxisABaselineConditionSchema = z
  .object({
    condition: z.literal("baseline"),
    algorithm_label: z.string().min(1),
    initialization: z
      .object({
        method: z.literal("random"),
        independent_runs: z.literal(30)
      })
      .strict(),
    metrics: ClusteringMetricsSchema,
    cluster_profiles: z.array(AxisAClusterProfileSchema).length(2)
  })
  .strict();

const AxisAEnhancedConditionSchema = z
  .object({
    condition: z.literal("enhanced"),
    algorithm_label: z.string().min(1),
    initialization: z
      .object({
        method: z.literal("dpc_derived_centroids")
      })
      .strict(),
    metrics: ClusteringMetricsSchema,
    cluster_profiles: z.array(AxisAClusterProfileSchema).length(2)
  })
  .strict();

export const ConditionResultSchema = z.discriminatedUnion("condition", [
  AxisABaselineConditionSchema,
  AxisAEnhancedConditionSchema
]);

const AxisADatasetSummarySchema = DatasetSummarySchema.extend({
  feature_count: z.literal(13)
});

const AxisAPreprocessingSummarySchema = PreprocessingSummarySchema.extend({
  retained_sample_size: z.literal(2437),
  imputation_strategy: z.literal("Median imputation"),
  scaling_strategy: z.literal("Z-score standardization"),
  npiq_excluded: z.literal(true)
});

const AxisAPcaSummarySchema = PcaSummarySchema.extend({
  n_components_selected: z.literal(6)
}).superRefine((summary, context) => {
  if (summary.scree_data.length < 6) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["scree_data"],
      message: "Axis A PCA must report at least PC1 through PC6."
    });
  }
});

const RunMetadataShape = {
  run_id: z.string().min(1),
  result_source: ResultSourceSchema,
  title: z.string().min(1),
  description: z.string().min(1),
  created_at: z.string().datetime()
};

export const AxisAClusteringRunSchema = z
  .object({
    ...RunMetadataShape,
    axis: z.literal("Axis A"),
    dataset: AxisADatasetSummarySchema,
    preprocessing: AxisAPreprocessingSummarySchema,
    pca: AxisAPcaSummarySchema,
    nbclust: AxisANbClustSummarySchema,
    dpc_init: DpcInitSummarySchema,
    conditions: z.tuple([AxisABaselineConditionSchema, AxisAEnhancedConditionSchema])
  })
  .strict();

const AxisBDatasetSummarySchema = DatasetSummarySchema.extend({
  feature_count: z.literal(1)
});

const AxisBPreprocessingSummarySchema = PreprocessingSummarySchema.extend({
  missingness_threshold: z.literal(0),
  retained_sample_size: z.literal(1917),
  imputation_strategy: z.literal("Not applicable"),
  scaling_strategy: z.literal("None; raw slopes used")
});

export const AxisBSlopeConstructionSchema = z
  .object({
    feature: z.literal("beta1_slope_points_per_year"),
    feature_label: z.literal("Participant-level ADAS-Cog13 slope"),
    participant_count: z.literal(1917),
    input_dimensions: z.literal(1),
    unit: z.literal("ADAS-Cog13 points per year")
  })
  .strict();

export const AxisBDpcSuitabilitySchema = z
  .object({
    evaluated: z.literal(true),
    used_for_final_initialization: z.literal(false),
    conclusion: z.literal("rejected_unstable_in_one_dimensional_slope_space"),
    summary: z.string().min(1)
  })
  .strict();

const AxisBFirstClusterProfileSchema = AxisBClusterProfileSchema.extend({
  cluster_id: z.literal(1),
  n_members: z.literal(1675)
});

const AxisBSecondClusterProfileSchema = AxisBClusterProfileSchema.extend({
  cluster_id: z.literal(2),
  n_members: z.literal(242)
});

export const AxisBFinalClusteringSchema = z
  .object({
    algorithm: z.literal("lloyd_kmeans"),
    algorithm_label: z.string().min(1),
    selected_k: z.literal(2),
    initialization: z
      .object({
        method: z.literal("fixed_seed_random"),
        random_seed: z.literal(0),
        n_init: z.literal(1)
      })
      .strict(),
    metrics: ClusteringMetricsSchema,
    cluster_profiles: z.tuple([AxisBFirstClusterProfileSchema, AxisBSecondClusterProfileSchema])
  })
  .strict();

export const AxisBClusteringRunSchema = z
  .object({
    ...RunMetadataShape,
    axis: z.literal("Axis B"),
    dataset: AxisBDatasetSummarySchema,
    preprocessing: AxisBPreprocessingSummarySchema,
    slope_construction: AxisBSlopeConstructionSchema,
    nbclust: AxisBNbClustSummarySchema,
    dpc_suitability: AxisBDpcSuitabilitySchema,
    final_clustering: AxisBFinalClusteringSchema
  })
  .strict();

export const ClusteringRunSchema = z.discriminatedUnion("axis", [
  AxisAClusteringRunSchema,
  AxisBClusteringRunSchema
]);

export const RunListResponseSchema = z
  .object({
    runs: z.array(ClusteringRunSchema)
  })
  .strict();

export const RunResponseSchema = z
  .object({
    run: ClusteringRunSchema
  })
  .strict();

export const UploadResponseSchema = z
  .object({
    upload_ref: z.string().min(1),
    filenames: z.array(z.string().min(1)),
    file_count: z.number().int().positive()
  })
  .strict();

export const ClusterRunRequestSchema = z
  .object({
    upload_ref: z.string().min(1),
    run_label: z.string().trim().min(1).max(120).optional()
  })
  .strict();

export const ClusterRunResponseSchema = z
  .object({
    status: z.literal("complete"),
    axis_a_run_id: z.string().min(1),
    axis_b_run_id: z.string().min(1)
  })
  .strict()
  .refine((response) => response.axis_a_run_id !== response.axis_b_run_id, {
    message: "Axis A and Axis B must reference separate result records."
  });

export type Axis = z.infer<typeof AxisSchema>;
export type ResultSource = z.infer<typeof ResultSourceSchema>;
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
export type AxisAClusterProfile = z.infer<typeof AxisAClusterProfileSchema>;
export type AxisBClusterProfile = z.infer<typeof AxisBClusterProfileSchema>;
export type ClusterProfile = z.infer<typeof ClusterProfileSchema>;
export type ConditionResult = z.infer<typeof ConditionResultSchema>;
export type AxisAClusteringRun = z.infer<typeof AxisAClusteringRunSchema>;
export type AxisBSlopeConstruction = z.infer<typeof AxisBSlopeConstructionSchema>;
export type AxisBDpcSuitability = z.infer<typeof AxisBDpcSuitabilitySchema>;
export type AxisBFinalClustering = z.infer<typeof AxisBFinalClusteringSchema>;
export type AxisBClusteringRun = z.infer<typeof AxisBClusteringRunSchema>;
export type ClusteringRun = z.infer<typeof ClusteringRunSchema>;
export type RunListResponse = z.infer<typeof RunListResponseSchema>;
export type RunResponse = z.infer<typeof RunResponseSchema>;
export type UploadResponse = z.infer<typeof UploadResponseSchema>;
export type ClusterRunRequest = z.infer<typeof ClusterRunRequestSchema>;
export type ClusterRunResponse = z.infer<typeof ClusterRunResponseSchema>;
