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
  .strict()
  .superRefine((summary, context) => {
  if (!summary.candidate_k.includes(summary.selected_k)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["candidate_k"],
      message: "Candidate k values must include the selected k."
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
    selected_centroids: z.array(SelectedCentroidSchema).min(1)
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
    post_hoc_summary: PostHocSummarySchema.optional()
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
    cluster_profiles: z.array(AxisAClusterProfileSchema)
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
    cluster_profiles: z.array(AxisAClusterProfileSchema).min(1)
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
  missingness_threshold: z.literal(0.2),
  imputation_strategy: z.literal("Median imputation"),
  scaling_strategy: z.literal("Z-score standardization"),
  npiq_excluded: z.literal(true)
});

const AxisAPcaSummarySchema = PcaSummarySchema.superRefine((summary, context) => {
  if (summary.scree_data.length < summary.n_components_selected) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["scree_data"],
      message: "Axis A PCA must report every selected component."
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
    nbclust: NbClustSummarySchema,
    dpc_init: DpcInitSummarySchema,
    conditions: z.tuple([AxisABaselineConditionSchema, AxisAEnhancedConditionSchema])
  })
  .strict()
  .superRefine((run, context) => {
    if (run.preprocessing.retained_sample_size > run.preprocessing.initial_sample_size) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["preprocessing", "retained_sample_size"], message: "Retained sample size cannot exceed the initial sample size." });
    }
    if (run.dpc_init.selected_centroids.length !== run.nbclust.selected_k) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["dpc_init", "selected_centroids"], message: "DPC must provide one initial centroid per selected cluster." });
    }
    run.conditions.forEach((condition, index) => {
      if (condition.condition === "enhanced" && condition.cluster_profiles.length !== run.nbclust.selected_k) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["conditions", index, "cluster_profiles"], message: "Cluster profile count must equal the selected k." });
      }
      const members = condition.cluster_profiles.reduce((sum, profile) => sum + profile.n_members, 0);
      if (condition.cluster_profiles.length > 0 && members !== run.preprocessing.retained_sample_size) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["conditions", index, "cluster_profiles"], message: "Aggregate cluster sizes must equal the retained sample size." });
      }
    });
  });

const AxisBDatasetSummarySchema = DatasetSummarySchema.extend({
  feature_count: z.literal(1)
});

const AxisBPreprocessingSummarySchema = PreprocessingSummarySchema.extend({
  missingness_threshold: z.literal(0),
  imputation_strategy: z.literal("Not applicable"),
  scaling_strategy: z.literal("None; raw slopes used")
});

export const AxisBSlopeConstructionSchema = z
  .object({
    feature: z.literal("beta1_slope_points_per_year"),
    feature_label: z.literal("Participant-level ADAS-Cog13 slope"),
    participant_count: z.number().int().positive(),
    observation_count: z.number().int().positive(),
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

export const AxisBFinalClusteringSchema = z
  .object({
    algorithm: z.literal("lloyd_kmeans"),
    algorithm_label: z.string().min(1),
    selected_k: z.number().int().positive(),
    initialization: z
      .object({
        method: z.literal("fixed_seed_random"),
        random_seed: z.literal(0),
        n_init: z.literal(1)
      })
      .strict(),
    metrics: ClusteringMetricsSchema,
    cluster_profiles: z.array(AxisBClusterProfileSchema).min(1)
  })
  .strict();

export const AxisBClusteringRunSchema = z
  .object({
    ...RunMetadataShape,
    axis: z.literal("Axis B"),
    dataset: AxisBDatasetSummarySchema,
    preprocessing: AxisBPreprocessingSummarySchema,
    slope_construction: AxisBSlopeConstructionSchema,
    nbclust: NbClustSummarySchema,
    dpc_suitability: AxisBDpcSuitabilitySchema,
    final_clustering: AxisBFinalClusteringSchema
  })
  .strict()
  .superRefine((run, context) => {
    if (run.preprocessing.retained_sample_size > run.preprocessing.initial_sample_size) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["preprocessing", "retained_sample_size"], message: "Retained sample size cannot exceed the initial sample size." });
    }
    if (run.slope_construction.participant_count !== run.preprocessing.retained_sample_size) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["slope_construction", "participant_count"], message: "Slope participant count must equal the retained sample size." });
    }
    if (run.final_clustering.selected_k !== run.nbclust.selected_k) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["final_clustering", "selected_k"], message: "Final Axis B k must match the NbClust selection." });
    }
    if (run.final_clustering.cluster_profiles.length !== run.final_clustering.selected_k) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["final_clustering", "cluster_profiles"], message: "Cluster profile count must equal the selected k." });
    }
    const members = run.final_clustering.cluster_profiles.reduce((sum, profile) => sum + profile.n_members, 0);
    if (members !== run.preprocessing.retained_sample_size) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["final_clustering", "cluster_profiles"], message: "Aggregate cluster sizes must equal the retained sample size." });
    }
  });

/** Frozen thesis cardinalities belong at artifact validation, not the reusable run contract. */
export const FrozenAxisAStudyResultSchema = AxisAClusteringRunSchema.superRefine((run, context) => {
  if (run.preprocessing.retained_sample_size !== 2437) context.addIssue({ code: z.ZodIssueCode.custom, path: ["preprocessing", "retained_sample_size"], message: "Frozen Axis A study retained 2,437 participants." });
  if (run.pca.n_components_selected !== 6) context.addIssue({ code: z.ZodIssueCode.custom, path: ["pca", "n_components_selected"], message: "Frozen Axis A study selected six PCs." });
  if (run.nbclust.selected_k !== 2) context.addIssue({ code: z.ZodIssueCode.custom, path: ["nbclust", "selected_k"], message: "Frozen Axis A study selected k=2." });
});

export const FrozenAxisBStudyResultSchema = AxisBClusteringRunSchema.superRefine((run, context) => {
  if (run.preprocessing.retained_sample_size !== 1917) context.addIssue({ code: z.ZodIssueCode.custom, path: ["preprocessing", "retained_sample_size"], message: "Frozen Axis B study retained 1,917 participants." });
  if (run.nbclust.selected_k !== 2) context.addIssue({ code: z.ZodIssueCode.custom, path: ["nbclust", "selected_k"], message: "Frozen Axis B study selected k=2." });
  const sizes = run.final_clustering.cluster_profiles.map((profile) => profile.n_members).sort((a, b) => b - a);
  if (sizes.length !== 2 || sizes[0] !== 1675 || sizes[1] !== 242) context.addIssue({ code: z.ZodIssueCode.custom, path: ["final_clustering", "cluster_profiles"], message: "Frozen Axis B study cluster sizes were 1,675 and 242." });
});

export const UnifiedClusterIdSchema = z.union([z.literal(0), z.literal(1)]);

export const DistributionSummarySchema = z
  .object({
    n: z.number().int().positive(),
    mean: z.number(),
    median: z.number(),
    standardDeviation: z.number().nonnegative(),
    q1: z.number(),
    q3: z.number(),
    interquartileRange: z.number().nonnegative(),
    minimum: z.number(),
    maximum: z.number()
  })
  .strict()
  .superRefine((summary, context) => {
    if (!(summary.minimum <= summary.q1 && summary.q1 <= summary.median && summary.median <= summary.q3 && summary.q3 <= summary.maximum)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Distribution quantiles must be ordered." });
    }
  });

const UnifiedCohortFlowSchema = z
  .object({
    stage: z.enum([
      "parent_clustered_cohort",
      "longitudinal_records_found",
      "valid_dated_records",
      "at_least_3_distinct_observations",
      "at_least_12_months_followup"
    ]),
    participantCount: z.number().int().nonnegative(),
    observationCount: z.number().int().nonnegative().optional()
  })
  .strict();

const UnifiedClusterFlowSchema = z
  .object({
    clusterId: UnifiedClusterIdSchema,
    parentParticipants: z.number().int().positive(),
    atLeast3ObservationParticipants: z.number().int().positive(),
    atLeast12MonthParticipants: z.number().int().positive(),
    eligibleObservationCount: z.number().int().positive()
  })
  .strict();

const UnifiedLinkageChecksSchema = z
  .object({
    parentParticipantKeysUnique: z.literal(true),
    parentPtidRidOneToOne: z.literal(true),
    allLongitudinalParticipantsInParentCohort: z.literal(true),
    noParticipantInBothClusters: z.literal(true),
    noDuplicateParticipantDate: z.literal(true),
    oneToOneAssignmentLinkageSucceeded: z.literal(true),
    noSecondLongitudinalKMeans: z.literal(true)
  })
  .strict();

const UnifiedCohortSchema = z
  .object({
    parentN: z.number().int().positive(),
    studyEntryPhaseCounts: z.record(z.number().int().nonnegative()),
    longitudinalEligibleN: z.number().int().positive(),
    atLeast3ObservationN: z.number().int().positive(),
    atLeast12MonthN: z.number().int().positive(),
    flow: z.array(UnifiedCohortFlowSchema).length(5),
    byOriginalCluster: z.array(UnifiedClusterFlowSchema).length(2),
    exclusions: z.array(z.object({ reason: z.string().min(1), participantCount: z.number().int().nonnegative() }).strict()),
    linkageChecks: UnifiedLinkageChecksSchema
  })
  .strict()
  .superRefine((cohort, context) => {
    const uniqueClusters = new Set(cohort.byOriginalCluster.map((entry) => entry.clusterId));
    if (uniqueClusters.size !== 2) context.addIssue({ code: z.ZodIssueCode.custom, path: ["byOriginalCluster"], message: "Both original clusters must be represented exactly once." });
    if (cohort.atLeast12MonthN !== cohort.longitudinalEligibleN || cohort.atLeast12MonthN > cohort.atLeast3ObservationN || cohort.atLeast3ObservationN > cohort.parentN) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["longitudinalEligibleN"], message: "Longitudinal cohort counts must form a nested subset of the clustered parent cohort." });
    }
    const parentTotal = cohort.byOriginalCluster.reduce((sum, entry) => sum + entry.parentParticipants, 0);
    const atLeast3Total = cohort.byOriginalCluster.reduce((sum, entry) => sum + entry.atLeast3ObservationParticipants, 0);
    const eligibleTotal = cohort.byOriginalCluster.reduce((sum, entry) => sum + entry.atLeast12MonthParticipants, 0);
    if (parentTotal !== cohort.parentN || atLeast3Total !== cohort.atLeast3ObservationN || eligibleTotal !== cohort.longitudinalEligibleN) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["byOriginalCluster"], message: "Cluster-specific cohort counts must sum to the corresponding cohort totals." });
    }
  });

const UnifiedPreprocessingSchema = z
  .object({
    candidateFeatures: z.array(z.string().min(1)).length(15),
    excludedFeatures: z.array(z.object({ feature: z.string().min(1), missingPercent: z.number().min(0).max(100), reason: z.string().min(1) }).strict()).length(2),
    retainedFeatures: z.array(z.string().min(1)).length(13),
    missingnessThresholdPercent: z.literal(20),
    imputation: z.literal("Median imputation"),
    standardization: z.literal("Z-score standardization")
  })
  .strict();

const UnifiedPcaSchema = z
  .object({
    components: z.number().int().positive(),
    cumulativeExplainedVariance: z.number().min(0).max(1),
    scree: z.array(z.object({
      component: z.number().int().positive(),
      eigenvalue: z.number().nonnegative(),
      individualVariance: z.number().min(0).max(1),
      cumulativeVariance: z.number().min(0).max(1),
      retained: z.boolean()
    }).strict()).min(1)
  })
  .strict();

const UnifiedKSelectionSchema = z
  .object({
    method: z.literal("NbClust index voting"),
    candidateK: z.array(z.number().int().positive()).min(1),
    selectedK: z.number().int().positive(),
    usableVotes: z.number().int().positive(),
    votesForSelectedK: z.number().int().positive(),
    voteDistribution: z.array(z.object({ k: z.number().int().positive(), votes: z.number().int().nonnegative() }).strict()).min(1),
    indexResults: z.array(z.object({ index: z.string().min(1), status: z.string().min(1), recommendedK: z.number().int().positive().optional() }).strict()).min(1)
  })
  .strict();

const UnifiedInitializationSchema = z
  .object({
    method: z.literal("Density Peaks Clustering-derived observation centroids"),
    deterministic: z.literal(true),
    selectedCentroids: z.array(z.object({
      rank: z.number().int().positive(),
      candidateId: SafeCandidateIdSchema,
      rho: z.number().nonnegative(),
      delta: z.number().nonnegative(),
      gamma: z.number().nonnegative(),
      assignedCluster: UnifiedClusterIdSchema
    }).strict()).length(2),
    reproducibilityRuns: z.number().int().positive(),
    reproducibilityPassed: z.literal(true)
  })
  .strict();

const UnifiedClusteringMetricsSchema = z
  .object({
    silhouette: z.number(),
    daviesBouldin: z.number(),
    calinskiHarabasz: z.number()
  })
  .strict();

const UnifiedEnhancedClusteringSchema = z
  .object({
    algorithm: z.literal("Lloyd K-Means"),
    representation: z.string().min(1),
    clusterSizes: z.array(z.object({ clusterId: UnifiedClusterIdSchema, nMembers: z.number().int().positive() }).strict()).length(2),
    metrics: UnifiedClusteringMetricsSchema,
    iterations: z.number().int().positive(),
    converged: z.literal(true),
    inertia: z.number().positive()
  })
  .strict();

const UnifiedClusterProfilesSchema = z
  .object({
    scale: z.string().min(1),
    profiles: z.array(z.object({
      clusterId: UnifiedClusterIdSchema,
      nMembers: z.number().int().positive(),
      variableMeans: AggregateNumberRecordSchema,
      variableStandardDeviations: AggregateNumberRecordSchema
    }).strict()).length(2),
    smdRanking: z.array(z.object({
      variable: z.string().min(1),
      standardizedMeanDifferenceCluster1Minus0: z.number(),
      absoluteSmd: z.number().nonnegative(),
      rank: z.number().int().positive()
    }).strict()).length(13)
  })
  .strict();

const MetricNameSchema = z.enum(["silhouette", "davies_bouldin", "calinski_harabasz"]);
const MetricDirectionSchema = z.enum(["higher", "lower"]);

const UnifiedBaselineComparisonSchema = z
  .object({
    baselineMethod: z.object({
      representation: z.string().min(1),
      kSelection: z.string().min(1),
      selectedK: z.number().int().positive(),
      initialization: z.string().min(1),
      algorithm: z.literal("Lloyd K-Means"),
      runCount: z.number().int().positive()
    }).strict(),
    enhancedMethod: z.object({
      representation: z.string().min(1),
      kSelection: z.string().min(1),
      initialization: z.string().min(1),
      algorithm: z.literal("Lloyd K-Means")
    }).strict(),
    metrics: z.array(z.object({
      metric: MetricNameSchema,
      direction: MetricDirectionSchema,
      baselineValue: z.number(),
      baselineStandardDeviation: z.number().nonnegative(),
      baselineMedian: z.number(),
      baselineMinimum: z.number(),
      baselineMaximum: z.number(),
      enhancedValue: z.number(),
      signedRelativeChangePercent: z.number(),
      improved: z.literal(true)
    }).strict()).length(3),
    caution: z.string().min(1),
    controlledDpcInitializationComparison: z.object({
      scope: z.string().min(1),
      purpose: z.string().min(1),
      metrics: z.array(z.object({
        metric: MetricNameSchema,
        direction: MetricDirectionSchema,
        dpcValue: z.number(),
        randomMean: z.number(),
        signedRelativeChangePercent: z.number(),
        dpcAssessment: z.enum(["better", "worse", "equal"])
      }).strict()).length(3)
    }).strict()
  })
  .strict()
  .superRefine((comparison, context) => {
    const expectedDirections: Record<z.infer<typeof MetricNameSchema>, z.infer<typeof MetricDirectionSchema>> = {
      silhouette: "higher",
      davies_bouldin: "lower",
      calinski_harabasz: "higher"
    };
    comparison.metrics.forEach((metric, index) => {
      if (metric.direction !== expectedDirections[metric.metric]) context.addIssue({ code: z.ZodIssueCode.custom, path: ["metrics", index, "direction"], message: "Metric improvement direction is invalid." });
      if (metric.baselineMinimum > metric.baselineMedian || metric.baselineMedian > metric.baselineMaximum) context.addIssue({ code: z.ZodIssueCode.custom, path: ["metrics", index], message: "Baseline run variability must have an ordered minimum, median, and maximum." });
    });
  });

const UnifiedLongitudinalClusterSummarySchema = z
  .object({
    clusterId: UnifiedClusterIdSchema,
    eligibleParticipants: z.number().int().positive(),
    observationCount: z.number().int().positive(),
    observationsPerParticipant: DistributionSummarySchema,
    followupYears: DistributionSummarySchema,
    baselineAdas13: DistributionSummarySchema,
    slopePointsPerYear: DistributionSummarySchema,
    intercept: DistributionSummarySchema,
    rSquared: DistributionSummarySchema,
    rmse: DistributionSummarySchema
  })
  .strict();

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const finiteNumberSchema = z.number().finite();
const MixedEffectsTermSchema = z.enum(["intercept", "time", "cluster", "time_x_cluster"]);
const MixedEffectsOptimizerSchema = z.enum(["lbfgs", "bfgs", "cg"]);

const MixedEffectsCoefficientBaseSchema = z
  .object({
    term: MixedEffectsTermSchema,
    parameterName: z.string().min(1),
    estimate: finiteNumberSchema,
    standardError: finiteNumberSchema.nonnegative(),
    confidenceInterval95: z.object({ lower: finiteNumberSchema, upper: finiteNumberSchema }).strict(),
    zStatistic: finiteNumberSchema,
    pValue: finiteNumberSchema.min(0).max(1)
  })
  .strict();

const MixedEffectsCoefficientSchema = MixedEffectsCoefficientBaseSchema
  .superRefine((coefficient, context) => {
    if (coefficient.confidenceInterval95.lower > coefficient.confidenceInterval95.upper) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["confidenceInterval95"], message: "A coefficient confidence interval must be ordered." });
    }
  });

export const UnifiedMixedEffectsModelSchema = z
  .object({
    contractVersion: z.literal("unified-longitudinal-mixed-model/v1"),
    status: z.literal("converged"),
    modelRole: z.literal("primary_inferential_longitudinal_model"),
    modelFormula: z.literal("ADAS13 ~ time + cluster + time:cluster + (1 | participant)"),
    implementationFormula: z.literal("adas13 ~ time_years * original_cluster"),
    estimationMethod: z.literal("Maximum likelihood (ML); random intercept only"),
    library: z.object({ name: z.literal("statsmodels"), version: z.string().min(1) }).strict(),
    alpha: z.literal(0.05),
    confidenceLevel: z.literal(0.95),
    referenceCluster: z.literal(0),
    participantCount: z.literal(1845),
    participantCountsByOriginalCluster: z.array(z.object({ clusterId: UnifiedClusterIdSchema, participantCount: z.number().int().positive() }).strict()).length(2),
    observationCount: z.literal(11111),
    groupingVariable: z.literal("private participant composite key (not exported)"),
    randomEffectsStructure: z.literal("participant-level random intercept"),
    selectedOptimizer: MixedEffectsOptimizerSchema,
    optimizerAttempts: z.array(z.object({
      optimizer: MixedEffectsOptimizerSchema,
      converged: z.boolean(),
      warnings: z.array(z.string()),
      error: z.string().min(1).nullable()
    }).strict()).min(1).max(3),
    converged: z.literal(true),
    fixedEffects: z.array(MixedEffectsCoefficientSchema).length(4),
    primaryTerm: z.literal("time_x_cluster"),
    primaryResult: MixedEffectsCoefficientBaseSchema.extend({
      term: z.literal("time_x_cluster"),
      significantAtAlpha: z.boolean(),
      coefficientMeaning: z.literal("Difference in annual ADAS-Cog13 change for original Cluster 1 relative to original Cluster 0")
    }).strict(),
    estimatedAnnualChangeByOriginalCluster: z.array(z.object({
      clusterId: UnifiedClusterIdSchema,
      estimate: finiteNumberSchema,
      unit: z.literal("ADAS-Cog13 points/year")
    }).strict()).length(2),
    varianceComponents: z.object({
      randomInterceptVariance: finiteNumberSchema.nonnegative(),
      residualVariance: finiteNumberSchema.positive()
    }).strict(),
    fitStatistics: z.object({
      logLikelihood: finiteNumberSchema,
      aic: finiteNumberSchema,
      bic: finiteNumberSchema
    }).strict(),
    diagnostics: z.object({
      coefficientStructureComplete: z.literal(true),
      allEstimatesFinite: z.literal(true),
      timeClusterEstimable: z.literal(true),
      randomEffectBoundaryDetected: z.boolean(),
      randomEffectBoundaryThreshold: finiteNumberSchema.positive(),
      selectedFitWarnings: z.array(z.string())
    }).strict(),
    interpretation: z.object({
      summary: z.string().min(1),
      coefficientMeaning: z.literal("The Time × Cluster coefficient estimates how much the annual ADAS-Cog13 rate differs between the original enhanced K-Means groups."),
      causalCaution: z.literal("The model compares observed trajectories of algorithmic groups and does not establish prediction or causation.")
    }).strict(),
    provenance: z.object({
      inputSha256: z.record(sha256Schema),
      originalAssignmentsFixed: z.literal(true),
      eligibleCohortFrozen: z.literal(true),
      participantLevelRowsExported: z.literal(false),
      longitudinalClusteringInvoked: z.literal(false)
    }).strict()
  })
  .strict()
  .superRefine((model, context) => {
    const clusterCounts = Object.fromEntries(model.participantCountsByOriginalCluster.map((entry) => [entry.clusterId, entry.participantCount]));
    if (clusterCounts[0] !== 1233 || clusterCounts[1] !== 612) context.addIssue({ code: z.ZodIssueCode.custom, path: ["participantCountsByOriginalCluster"], message: "The mixed-effects model must use the frozen original-cluster counts 1,233 and 612." });
    const attempts = model.optimizerAttempts.filter((attempt) => attempt.optimizer === model.selectedOptimizer);
    if (attempts.length !== 1 || !attempts[0].converged || attempts[0].error !== null) context.addIssue({ code: z.ZodIssueCode.custom, path: ["optimizerAttempts"], message: "The selected optimizer must have exactly one successful recorded attempt." });
    const effects = Object.fromEntries(model.fixedEffects.map((effect) => [effect.term, effect]));
    if (Object.keys(effects).length !== 4 || !effects.intercept || !effects.time || !effects.cluster || !effects.time_x_cluster) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["fixedEffects"], message: "All four pre-specified fixed effects must be present exactly once." });
      return;
    }
    const primary = effects.time_x_cluster;
    const matchesPrimary = ["estimate", "standardError", "zStatistic", "pValue"].every((key) => model.primaryResult[key as keyof typeof model.primaryResult] === primary[key as keyof typeof primary])
      && model.primaryResult.confidenceInterval95.lower === primary.confidenceInterval95.lower
      && model.primaryResult.confidenceInterval95.upper === primary.confidenceInterval95.upper;
    if (!matchesPrimary) context.addIssue({ code: z.ZodIssueCode.custom, path: ["primaryResult"], message: "The primary result must exactly reference the Time × Cluster coefficient." });
    if (model.primaryResult.significantAtAlpha !== (model.primaryResult.pValue < model.alpha)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["primaryResult", "significantAtAlpha"], message: "Primary significance must be derived from the declared alpha." });
    const annualChanges = Object.fromEntries(model.estimatedAnnualChangeByOriginalCluster.map((entry) => [entry.clusterId, entry.estimate]));
    if (Math.abs(annualChanges[0] - effects.time.estimate) > 1e-12 || Math.abs(annualChanges[1] - (effects.time.estimate + primary.estimate)) > 1e-12) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["estimatedAnnualChangeByOriginalCluster"], message: "Annual changes must be derived from the fitted fixed effects." });
    }
  });

const UnifiedLongitudinalSchema = z
  .object({
    measure: z.literal("ADAS-Cog13 TOTAL13"),
    timeDefinition: z.string().min(1),
    eligibilityRule: z.string().min(1),
    assignmentSource: z.string().min(1),
    eligibleParticipants: z.number().int().positive(),
    observationCount: z.number().int().positive(),
    byOriginalCluster: z.array(UnifiedLongitudinalClusterSummarySchema).length(2),
    timeSeries: z.array(z.object({
      clusterId: UnifiedClusterIdSchema,
      yearStart: z.number().int().nonnegative(),
      yearEnd: z.number().int().positive(),
      participantCount: z.number().int().positive(),
      observationCount: z.number().int().positive(),
      meanElapsedYears: z.number().nonnegative(),
      meanAdas13: z.number().nonnegative(),
      medianAdas13: z.number().nonnegative(),
      standardDeviationAdas13: z.number().nonnegative()
    }).strict()).min(2),
    participantSlopeMethod: z.string().min(1),
    mixedEffects: UnifiedMixedEffectsModelSchema,
    limitations: z.array(z.string().min(1)).min(1)
  })
  .strict()
  .superRefine((longitudinal, context) => {
    const uniqueClusters = new Set(longitudinal.byOriginalCluster.map((entry) => entry.clusterId));
    const participantTotal = longitudinal.byOriginalCluster.reduce((sum, entry) => sum + entry.eligibleParticipants, 0);
    const observationTotal = longitudinal.byOriginalCluster.reduce((sum, entry) => sum + entry.observationCount, 0);
    if (uniqueClusters.size !== 2 || participantTotal !== longitudinal.eligibleParticipants || observationTotal !== longitudinal.observationCount) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["byOriginalCluster"], message: "Longitudinal cluster summaries must cover both original clusters and sum to the reported totals." });
    }
  });

const UnifiedProvenanceSchema = z
  .object({
    inputSha256: z.record(sha256Schema),
    assignmentArtifactAuthoritative: z.string().min(1),
    legacyArtifactsPreservedForAudit: z.literal(true),
    participantLevelOutput: z.object({ path: z.string().min(1), sha256: sha256Schema, webExposed: z.literal(false), gitignored: z.literal(true) }).strict(),
    cohortAuditOutput: z.object({ path: z.string().min(1), sha256: sha256Schema }).strict(),
    mixedModelOutput: z.object({
      jsonPath: z.string().min(1),
      jsonSha256: sha256Schema,
      csvPath: z.string().min(1),
      csvSha256: sha256Schema,
      aggregateOnly: z.literal(true),
      webExposed: z.literal(true)
    }).strict(),
    prohibitedLongitudinalOperations: z.object({ nbclustInvoked: z.literal(false), dpcSuitabilityInvoked: z.literal(false), kmeansInvoked: z.literal(false) }).strict()
  })
  .strict();

export const UnifiedResearchArtifactSchema = z
  .object({
    contractVersion: z.literal("unified-research-run/v1"),
    research: z.object({
      title: z.string().min(1),
      design: z.literal("one_continuous_pipeline"),
      stage1: z.literal("Enhanced K-Means Cognitive-Functional Clustering"),
      stage2: z.literal("Longitudinal Progression Analysis"),
      interpretation: z.string().min(1)
    }).strict(),
    cohort: UnifiedCohortSchema,
    preprocessing: UnifiedPreprocessingSchema,
    pca: UnifiedPcaSchema,
    kSelection: UnifiedKSelectionSchema,
    initialization: UnifiedInitializationSchema,
    enhancedClustering: UnifiedEnhancedClusteringSchema,
    clusterProfiles: UnifiedClusterProfilesSchema,
    baselineComparison: UnifiedBaselineComparisonSchema,
    longitudinal: UnifiedLongitudinalSchema,
    provenance: UnifiedProvenanceSchema
  })
  .strict();

export const UnifiedResearchRunSchema = UnifiedResearchArtifactSchema
  .extend({
    ...RunMetadataShape,
    pipeline: z.literal("unified")
  })
  .superRefine((run, context) => {
    const clusterSizeTotal = run.enhancedClustering.clusterSizes.reduce((sum, entry) => sum + entry.nMembers, 0);
    if (clusterSizeTotal !== run.cohort.parentN) context.addIssue({ code: z.ZodIssueCode.custom, path: ["enhancedClustering", "clusterSizes"], message: "Enhanced cluster sizes must sum to the parent cohort." });
    if (run.longitudinal.eligibleParticipants !== run.cohort.longitudinalEligibleN) context.addIssue({ code: z.ZodIssueCode.custom, path: ["longitudinal", "eligibleParticipants"], message: "Longitudinal and cohort eligibility totals must match." });
  });

export const FrozenUnifiedStudyResultSchema = UnifiedResearchRunSchema.superRefine((run, context) => {
  const expectClose = (actual: number, expected: number, path: (string | number)[], message: string): void => {
    if (Math.abs(actual - expected) > 1e-12) context.addIssue({ code: z.ZodIssueCode.custom, path, message });
  };
  if (run.cohort.parentN !== 2437) context.addIssue({ code: z.ZodIssueCode.custom, path: ["cohort", "parentN"], message: "Frozen parent cohort contains 2,437 participants." });
  if (run.cohort.atLeast3ObservationN !== 1917) context.addIssue({ code: z.ZodIssueCode.custom, path: ["cohort", "atLeast3ObservationN"], message: "Frozen >=3-observation audit contains 1,917 participants." });
  if (run.cohort.atLeast12MonthN !== 1845) context.addIssue({ code: z.ZodIssueCode.custom, path: ["cohort", "atLeast12MonthN"], message: "Frozen >=12-month audit contains 1,845 participants." });
  const expectedPhaseCounts = { ADNI1: 819, ADNIGO: 130, ADNI2: 789, ADNI3: 699 };
  for (const [phase, expected] of Object.entries(expectedPhaseCounts)) {
    if (run.cohort.studyEntryPhaseCounts[phase] !== expected) context.addIssue({ code: z.ZodIssueCode.custom, path: ["cohort", "studyEntryPhaseCounts", phase], message: `Frozen ${phase} count is ${expected}.` });
  }
  const sizes = [...run.enhancedClustering.clusterSizes].sort((left, right) => left.clusterId - right.clusterId).map((entry) => entry.nMembers);
  if (sizes[0] !== 1553 || sizes[1] !== 884) context.addIssue({ code: z.ZodIssueCode.custom, path: ["enhancedClustering", "clusterSizes"], message: "Frozen original cluster sizes are 1,553 and 884." });
  if (run.pca.components !== 6 || run.kSelection.selectedK !== 2 || run.kSelection.usableVotes !== 24 || run.kSelection.votesForSelectedK !== 9) context.addIssue({ code: z.ZodIssueCode.custom, message: "Frozen PCA/k-selection result disagrees." });
  expectClose(run.pca.cumulativeExplainedVariance, 0.8747945923377831, ["pca", "cumulativeExplainedVariance"], "Frozen PCA explained variance disagrees.");
  const enhanced = run.enhancedClustering.metrics;
  expectClose(enhanced.silhouette, 0.3727004724250328, ["enhancedClustering", "metrics", "silhouette"], "Frozen enhanced silhouette disagrees.");
  expectClose(enhanced.daviesBouldin, 1.0758850311620256, ["enhancedClustering", "metrics", "daviesBouldin"], "Frozen enhanced Davies-Bouldin score disagrees.");
  expectClose(enhanced.calinskiHarabasz, 1800.0249578026046, ["enhancedClustering", "metrics", "calinskiHarabasz"], "Frozen enhanced Calinski-Harabasz score disagrees.");
  const comparisons = Object.fromEntries(run.baselineComparison.metrics.map((metric) => [metric.metric, metric]));
  const expectedComparisons = {
    silhouette: [0.33187500971522454, 0.00023426851518023573, 0.33173611492709726, 0.33173611492709726, 0.33225697038257485, 0.3727004724250328, 12.30145733022796],
    davies_bouldin: [1.2241160774005175, 0.00042412698636601766, 1.224367536833148, 1.2234245639607837, 1.224367536833148, 1.0758850311620256, -12.109231222031596],
    calinski_harabasz: [1442.0231320417006, 0.013837712047094214, 1442.0313362431123, 1442.0005704878185, 1442.0313362431123, 1800.0249578026046, 24.826358038655325]
  } as const;
  for (const [metric, [baseline, standardDeviation, median, minimum, maximum, enhancedValue, change]] of Object.entries(expectedComparisons)) {
    const comparison = comparisons[metric];
    if (!comparison) continue;
    expectClose(comparison.baselineValue, baseline, ["baselineComparison", "metrics", metric, "baselineValue"], `Frozen ${metric} baseline disagrees.`);
    expectClose(comparison.baselineStandardDeviation, standardDeviation, ["baselineComparison", "metrics", metric, "baselineStandardDeviation"], `Frozen ${metric} baseline variability disagrees.`);
    expectClose(comparison.baselineMedian, median, ["baselineComparison", "metrics", metric, "baselineMedian"], `Frozen ${metric} baseline median disagrees.`);
    expectClose(comparison.baselineMinimum, minimum, ["baselineComparison", "metrics", metric, "baselineMinimum"], `Frozen ${metric} baseline minimum disagrees.`);
    expectClose(comparison.baselineMaximum, maximum, ["baselineComparison", "metrics", metric, "baselineMaximum"], `Frozen ${metric} baseline maximum disagrees.`);
    expectClose(comparison.enhancedValue, enhancedValue, ["baselineComparison", "metrics", metric, "enhancedValue"], `Frozen ${metric} enhanced result disagrees.`);
    expectClose(comparison.signedRelativeChangePercent, change, ["baselineComparison", "metrics", metric, "signedRelativeChangePercent"], `Frozen ${metric} relative change disagrees.`);
  }
  const clusterFlow = [...run.cohort.byOriginalCluster].sort((left, right) => left.clusterId - right.clusterId);
  const expectedFlow = [[1553, 1244, 1233, 7967], [884, 673, 612, 3144]] as const;
  clusterFlow.forEach((entry, index) => {
    const actual = [entry.parentParticipants, entry.atLeast3ObservationParticipants, entry.atLeast12MonthParticipants, entry.eligibleObservationCount];
    if (actual.some((value, position) => value !== expectedFlow[index][position])) context.addIssue({ code: z.ZodIssueCode.custom, path: ["cohort", "byOriginalCluster", index], message: `Frozen longitudinal cohort flow for cluster ${index} disagrees.` });
  });
  const longitudinalSummaries = [...run.longitudinal.byOriginalCluster].sort((left, right) => left.clusterId - right.clusterId);
  const expectedLongitudinal = [
    {
      eligibleParticipants: 1233,
      observationCount: 7967,
      observationsPerParticipant: { mean: 6.461476074614761 },
      followupYears: { mean: 6.5189337481188385, median: 6.0041067761806985 },
      baselineAdas13: { mean: 10.360567719754608, median: 10 },
      slopePointsPerYear: { mean: 0.6432478685184373, median: 0.3450201017664959, standardDeviation: 1.712191241785866, interquartileRange: 1.1964188275255674, minimum: -8.650638551275676, maximum: 11.937889601157178 },
      rSquared: { median: 0.33095285113384065 },
      rmse: { median: 1.9089760904921544 }
    },
    {
      eligibleParticipants: 612,
      observationCount: 3144,
      observationsPerParticipant: { mean: 5.137254901960785 },
      followupYears: { mean: 3.309802132123669, median: 2.2039698836413417 },
      baselineAdas13: { mean: 24.384411760342665, median: 23.67 },
      slopePointsPerYear: { mean: 3.9532932593320345, median: 2.9744747397017415, standardDeviation: 4.453372925169758, interquartileRange: 4.82103688257269, minimum: -11.444912282051082, maximum: 29.997604534624987 },
      rSquared: { median: 0.7041541531087447 },
      rmse: { median: 2.2574482517371157 }
    }
  ] as const;
  longitudinalSummaries.forEach((entry, index) => {
    const expected = expectedLongitudinal[index];
    if (entry.eligibleParticipants !== expected.eligibleParticipants || entry.observationCount !== expected.observationCount) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["longitudinal", "byOriginalCluster", index], message: `Frozen longitudinal totals for cluster ${entry.clusterId} disagree.` });
    }
    for (const [summaryName, expectedValues] of Object.entries(expected).filter(([name]) => name !== "eligibleParticipants" && name !== "observationCount")) {
      const actualValues = entry[summaryName as keyof typeof entry] as Record<string, number>;
      for (const [statistic, expectedValue] of Object.entries(expectedValues as Record<string, number>)) {
        expectClose(actualValues[statistic], expectedValue, ["longitudinal", "byOriginalCluster", index, summaryName, statistic], `Frozen cluster ${entry.clusterId} ${summaryName} ${statistic} disagrees.`);
      }
    }
  });
  if (run.longitudinal.observationCount !== 11111) context.addIssue({ code: z.ZodIssueCode.custom, path: ["longitudinal", "observationCount"], message: "Frozen longitudinal cohort contains 11,111 observations." });
});

export const ClusteringRunSchema = z.union([
  AxisAClusteringRunSchema,
  AxisBClusteringRunSchema
]);

export const ResearchResultSchema = z.union([UnifiedResearchRunSchema, ClusteringRunSchema]);

export const RunListResponseSchema = z
  .object({
    runs: z.array(ResearchResultSchema)
  })
  .strict();

export const RunResponseSchema = z
  .object({
    run: ResearchResultSchema
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
    persistence: z.enum(["durable", "memory_only"]),
    run_id: z.string().min(1)
  })
  .strict();

const ResearchRunRequestBaseShape = {
  upload_ref: z.string().min(1),
  run_label: z.string().trim().min(1).max(120).optional()
};

export const ResearchRunRequestSchema = z.object(ResearchRunRequestBaseShape).strict();

const ResearchRunBaseShape = {
  run_id: z.string().min(1),
  pipeline: z.literal("unified"),
  created_at: z.string().datetime()
};

export const ResearchProgressStageSchema = z.enum([
  "preparing_inputs",
  "constructing_study_entry_cohort",
  "preprocessing",
  "pca",
  "selecting_k",
  "deterministic_initialization",
  "enhanced_kmeans",
  "cluster_profiling",
  "baseline_comparison",
  "matching_longitudinal_records",
  "longitudinal_eligibility",
  "longitudinal_analysis",
  "aggregate_artifact_validation"
]);

export const ResearchProgressSchema = z
  .object({
    stage: ResearchProgressStageSchema,
    completedStages: z.number().int().nonnegative(),
    totalStages: z.number().int().positive()
  })
  .strict();

export const ResearchRunQueuedSchema = z
  .object({
    ...ResearchRunBaseShape,
    status: z.literal("queued")
  })
  .strict();

export const ResearchRunRunningSchema = z
  .object({
    ...ResearchRunBaseShape,
    status: z.literal("running"),
    started_at: z.string().datetime(),
    progress: ResearchProgressSchema
  })
  .strict();

export const ResearchRunCompleteSchema = z
  .object({
    ...ResearchRunBaseShape,
    status: z.literal("complete"),
    started_at: z.string().datetime(),
    finished_at: z.string().datetime(),
    result_run_id: z.string().min(1),
    persistence: z.enum(["durable", "memory_only"])
  })
  .strict();

export const ResearchRunFailureCodeSchema = z.enum([
  "INVALID_INPUT",
  "ENVIRONMENT_FAILURE",
  "EXECUTION_FAILURE",
  "EXECUTION_TIMEOUT",
  "ARTIFACT_VALIDATION_FAILURE",
  "PERSISTENCE_FAILURE"
]);

export const ResearchRunFailedSchema = z
  .object({
    ...ResearchRunBaseShape,
    status: z.literal("failed"),
    started_at: z.string().datetime().optional(),
    finished_at: z.string().datetime(),
    error: z
      .object({
        code: ResearchRunFailureCodeSchema,
        message: z.string().min(1)
      })
      .strict()
  })
  .strict();

export const ResearchRunStatusSchema = z.discriminatedUnion("status", [
  ResearchRunQueuedSchema,
  ResearchRunRunningSchema,
  ResearchRunCompleteSchema,
  ResearchRunFailedSchema
]);

export const ResearchRunResponseSchema = z
  .object({
    run: ResearchRunStatusSchema
  })
  .strict();

const SopMetricSummarySchema = z.object({
  mean: z.number(),
  standardDeviation: z.number().nonnegative(),
  minimum: z.number(),
  maximum: z.number()
}).strict();

const SopClusteringMetricsSchema = z.object({
  silhouette: z.number(),
  daviesBouldin: z.number(),
  calinskiHarabasz: z.number()
}).strict();

const SopCandidateSchema = SopClusteringMetricsSchema.extend({
  k: z.number().int().min(2).max(10),
  clusterSizes: z.array(z.number().int().positive()).min(2),
  inertia: z.number().positive(),
  iterations: z.number().int().positive()
}).strict().superRefine((candidate, context) => {
  if (candidate.clusterSizes.length !== candidate.k || candidate.clusterSizes.reduce((sum, size) => sum + size, 0) !== 2437) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["clusterSizes"], message: "SOP candidate cluster sizes must cover the frozen cohort." });
  }
});

export const SopEvaluationSchema = z.object({
  contractVersion: z.literal("sop-evaluation/v1"),
  scope: z.literal("Aggregate-only controlled evaluation; isolated from frozen official results"),
  cohortN: z.literal(2437),
  sop1: z.object({
    redundancy: z.object({
      featureCount: z.literal(13),
      pairCount: z.literal(78),
      meanAbsoluteCorrelation: z.number().min(0).max(1),
      medianAbsoluteCorrelation: z.number().min(0).max(1),
      maximumAbsoluteCorrelation: z.number().min(0).max(1),
      pairsAtOrAbove050: z.number().int().nonnegative(),
      pairsAtOrAbove070: z.number().int().nonnegative(),
      topCorrelatedPairs: z.array(z.object({
        featureA: z.string().min(1),
        featureB: z.string().min(1),
        correlation: z.number().min(-1).max(1),
        absoluteCorrelation: z.number().min(0).max(1)
      }).strict()).length(8)
    }).strict(),
    distanceBehavior: z.array(z.object({
      representation: z.string().min(1),
      dimensions: z.number().int().positive(),
      pairCount: z.number().int().positive(),
      mean: z.number().positive(),
      standardDeviation: z.number().positive(),
      coefficientOfVariation: z.number().positive(),
      fifthPercentile: z.number().positive(),
      median: z.number().positive(),
      ninetyFifthPercentile: z.number().positive()
    }).strict()).length(2),
    ablation: z.object({
      settings: z.object({
        cohortN: z.literal(2437), k: z.literal(2), initialization: z.literal("random"), nInit: z.literal(1),
        maxIter: z.literal(300), tolerance: z.literal(0.0001), algorithm: z.literal("lloyd"),
        seeds: z.array(z.number().int().min(0).max(29)).length(30)
      }).strict(),
      conditions: z.array(z.object({
        representation: z.string().min(1), dimensions: z.number().int().positive(),
        varianceRetained: z.number().min(0).max(1), runCount: z.literal(30),
        metrics: z.object({
          silhouette: SopMetricSummarySchema,
          davies_bouldin: SopMetricSummarySchema,
          calinski_harabasz: SopMetricSummarySchema
        }).strict()
      }).strict()).length(2),
      metricChanges: z.object({
        silhouette: z.object({ absoluteMeanChange: z.number(), relativeMeanChangePercent: z.number() }).strict(),
        davies_bouldin: z.object({ absoluteMeanChange: z.number(), relativeMeanChangePercent: z.number() }).strict(),
        calinski_harabasz: z.object({ absoluteMeanChange: z.number(), relativeMeanChangePercent: z.number() }).strict()
      }).strict()
    }).strict()
  }).strict(),
  sop2: z.object({
    settings: z.object({
      cohortN: z.literal(2437), representation: z.literal("PC1-PC6"), seed: z.literal(0),
      initialization: z.literal("random"), nInit: z.literal(1), maxIter: z.literal(300),
      tolerance: z.literal(0.0001), algorithm: z.literal("lloyd")
    }).strict(),
    demonstratedK: z.array(SopCandidateSchema).length(3),
    candidates: z.array(SopCandidateSchema).length(9),
    maximumSilhouetteSelectedK: z.literal(2),
    nbclust: z.object({
      selectedK: z.literal(2), usableIndices: z.literal(24), votesForSelectedK: z.literal(9),
      voteDistribution: z.array(z.object({ k: z.number().int().min(2).max(10), votes: z.number().int().nonnegative() }).strict()).length(9)
    }).strict()
  }).strict(),
  sop3: z.object({
    settings: z.object({
      cohortN: z.literal(2437), representation: z.literal("PC1-PC6"), k: z.literal(2), nInit: z.literal(1),
      maxIter: z.literal(300), tolerance: z.literal(0.0001), algorithm: z.literal("lloyd"),
      randomSeeds: z.array(z.number().int().min(0).max(29)).length(30)
    }).strict(),
    firstThreeRandomRuns: z.array(SopClusteringMetricsSchema.extend({
      runNumber: z.number().int().min(1).max(3), seed: z.number().int().min(0).max(2),
      clusterSizes: z.array(z.number().int().positive()).length(2), iterations: z.number().int().positive()
    }).strict()).length(3),
    randomRunSummary: z.object({
      silhouette: SopMetricSummarySchema,
      davies_bouldin: SopMetricSummarySchema,
      calinski_harabasz: SopMetricSummarySchema,
      inertia: SopMetricSummarySchema,
      iterations: SopMetricSummarySchema
    }).strict(),
    partitionStability: z.object({
      distinctLabelInvariantPartitions: z.number().int().positive(),
      meanPairwiseAdjustedRandIndex: z.number().min(-1).max(1),
      minimumPairwiseAdjustedRandIndex: z.number().min(-1).max(1),
      maximumPairwiseAdjustedRandIndex: z.number().min(-1).max(1)
    }).strict(),
    dpcDeterminism: z.object({
      repeatedChecks: z.literal(3), identicalInitialization: z.literal(true), identicalOutput: z.literal(true),
      clusterSizes: z.array(z.number().int().positive()).length(2), iterations: z.number().int().positive(),
      metrics: SopClusteringMetricsSchema
    }).strict()
  }).strict(),
  provenance: z.object({
    officialResultsModified: z.literal(false),
    participantLevelOutput: z.literal(false),
    sourceSha256: z.record(sha256Schema)
  }).strict()
}).strict();

export const SopEvaluationResponseSchema = z.object({ evaluation: SopEvaluationSchema }).strict();

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
export type UnifiedClusterId = z.infer<typeof UnifiedClusterIdSchema>;
export type DistributionSummary = z.infer<typeof DistributionSummarySchema>;
export type UnifiedMixedEffectsModel = z.infer<typeof UnifiedMixedEffectsModelSchema>;
export type UnifiedResearchArtifact = z.infer<typeof UnifiedResearchArtifactSchema>;
export type UnifiedResearchRun = z.infer<typeof UnifiedResearchRunSchema>;
export type ResearchResult = z.infer<typeof ResearchResultSchema>;
export type RunListResponse = z.infer<typeof RunListResponseSchema>;
export type RunResponse = z.infer<typeof RunResponseSchema>;
export type UploadResponse = z.infer<typeof UploadResponseSchema>;
export type ClusterRunRequest = z.infer<typeof ClusterRunRequestSchema>;
export type ClusterRunResponse = z.infer<typeof ClusterRunResponseSchema>;
export type ResearchRunRequest = z.infer<typeof ResearchRunRequestSchema>;
export type ResearchProgressStage = z.infer<typeof ResearchProgressStageSchema>;
export type ResearchProgress = z.infer<typeof ResearchProgressSchema>;
export type ResearchRunQueued = z.infer<typeof ResearchRunQueuedSchema>;
export type ResearchRunRunning = z.infer<typeof ResearchRunRunningSchema>;
export type ResearchRunComplete = z.infer<typeof ResearchRunCompleteSchema>;
export type ResearchRunFailureCode = z.infer<typeof ResearchRunFailureCodeSchema>;
export type ResearchRunFailed = z.infer<typeof ResearchRunFailedSchema>;
export type ResearchRunStatus = z.infer<typeof ResearchRunStatusSchema>;
export type ResearchRunResponse = z.infer<typeof ResearchRunResponseSchema>;
export type SopEvaluation = z.infer<typeof SopEvaluationSchema>;
export type SopEvaluationResponse = z.infer<typeof SopEvaluationResponseSchema>;
