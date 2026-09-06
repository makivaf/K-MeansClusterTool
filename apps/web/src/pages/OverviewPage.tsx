import type { UnifiedResearchRun } from "../../../../packages/shared/src";
import { ResearchPageNavigation } from "../components/layout/ResearchPageNavigation";
import { BaselineCandidateControl } from "../components/BaselineCandidateControl";
import { useSopEvaluation } from "../hooks/useSopEvaluation";

type OverviewPageProps = { run: UnifiedResearchRun | null };

export const OverviewPage = ({ run }: OverviewPageProps) => {
  const { baselineSweep, error } = useSopEvaluation();
  if (!run) return null;
  const baselineMethod = run.baselineComparison.baselineMethod;
  return (
    <div className="existing-algorithm-page">
      <section className="existing-hero">
        <div>
          <p className="existing-eyebrow">Baseline Method</p>
          <h1>Standard K-Means Clustering</h1>
          <p>Explore validated baseline candidates from k=2 to 10. Each uses the same 13 standardized study-entry measures, random initialization with seed 0, and Lloyd K-Means. The slider updates cluster membership counts and all three internal validation metrics together.</p>
        </div>
      </section>
      <section className="space-y-5">
        <article className="existing-card existing-card-large existing-cluster-card">
          <div className="existing-card-header">
            <div>
              <p>Dataset Information</p>
              <h2>Study-entry baseline matrix</h2>
            </div>
          </div>
          <dl className="existing-dataset-grid">
            <div>
              <dt>Participants</dt>
              <dd>{run.cohort.parentN.toLocaleString()}</dd>
            </div>
            <div>
              <dt>Input representation</dt>
              <dd>{baselineMethod.representation}</dd>
            </div>
            <div>
              <dt>Retained measures</dt>
              <dd>{run.preprocessing.retainedFeatures.length}</dd>
            </div>
            <div>
              <dt>Algorithm</dt>
              <dd>{baselineMethod.algorithm}</dd>
            </div>
          </dl>
        </article>


      </section>
      <BaselineCandidateControl sweep={baselineSweep} error={error} />
      <section className="existing-card">
        <div className="existing-card-header"><div><p>Manuscript comparison</p><h2>Defined final baseline</h2></div></div>
        <p className="text-sm text-muted">The final comparison selects k={baselineMethod.selectedK} by maximum Silhouette and summarizes all {baselineMethod.runCount} random-initialization runs. Its frozen values remain in Summary of Findings; the interactive candidate above is the selected single-seed result.</p>
      </section>
      <ResearchPageNavigation currentPath="/existing-algorithm" />
    </div>
  );
};
