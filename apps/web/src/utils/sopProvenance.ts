import type { SopEvaluation, UnifiedResearchRun } from "../../../../packages/shared/src/schema";

export const hasSharedSopProvenance = (run: UnifiedResearchRun, evaluation: SopEvaluation) => {
  const sharedSources = [
    "data/interim/study_entry_cohort_unimputed.csv",
    "data/interim/clustering_pca_explained_variance.csv"
  ];
  return sharedSources.every((source) => {
    const runHash = run.provenance.inputSha256[source];
    return Boolean(runHash) && runHash === evaluation.provenance.sourceSha256[source];
  }) && Object.entries(evaluation.provenance.sourceSha256).every(([source, hash]) =>
    !run.provenance.inputSha256[source] || run.provenance.inputSha256[source] === hash
  );
};

