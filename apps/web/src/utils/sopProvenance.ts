import type { SopEvaluation, UnifiedResearchRun, StudyEvidence } from "../../../../packages/shared/src/schema";

export const matchesFrozenSource = (source: string, runHash: string, frozenHash: string, evidence?: StudyEvidence | null) =>
  runHash === frozenHash || (source === "data/interim/study_entry_cohort_unimputed.csv" &&
    evidence?.provenance.sourceSha256[source] === frozenHash && runHash === evidence.provenance.canonicalCohortSha256);

export const hasSharedSopProvenance = (run: UnifiedResearchRun, evaluation: SopEvaluation, evidence?: StudyEvidence | null) => {
  const sharedSources = [
    "data/interim/study_entry_cohort_unimputed.csv",
    "data/interim/clustering_pca_explained_variance.csv"
  ];
  return sharedSources.every((source) => {
    const runHash = run.provenance.inputSha256[source];
    return Boolean(runHash) && matchesFrozenSource(source, runHash, evaluation.provenance.sourceSha256[source], evidence);
  }) && Object.entries({ ...evidence?.provenance.sourceSha256, ...evaluation.provenance.sourceSha256 }).every(([source, hash]) =>
    !run.provenance.inputSha256[source] || matchesFrozenSource(source, run.provenance.inputSha256[source], hash, evidence)
  );
};

