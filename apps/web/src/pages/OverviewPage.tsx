import type { UnifiedResearchRun } from "../../../../packages/shared/src";
import { ResearchPageNavigation } from "../components/layout/ResearchPageNavigation";
import { BaselineCandidateControl } from "../components/BaselineCandidateControl";
import { useSopEvaluation } from "../hooks/useSopEvaluation";

type OverviewPageProps = { run: UnifiedResearchRun | null };

export const OverviewPage = ({ run }: OverviewPageProps) => {
  const { baselineSweep, error } = useSopEvaluation(run);
  if (!run) return null;
  const baselineMethod = run.baselineComparison.baselineMethod;
  return (
    <div className="existing-algorithm-page">
      <section className="existing-hero">
        <div>
          <p className="existing-eyebrow">Baseline Method</p>
          <h1>Standard K-Means Clustering</h1>
          <p>View the current run's dataset information and available frozen-study baseline evaluation.</p>
        </div>
      </section>
      <section className="space-y-5">
        <article className="existing-card existing-card-large existing-cluster-card">
          <div className="existing-card-header">
            <div>
              <p>Current run: dataset information</p>
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
      {baselineSweep ? <>
        <p className="existing-note">Validated frozen-study baseline evidence. The active run matches the cohort and PCA-variance source hashes; this does not establish full provenance identity or link these candidate experiments to the run.</p>
        <BaselineCandidateControl sweep={baselineSweep} error={error} />
      </> : <p className="existing-note">{error ?? "Frozen-study baseline evaluation pending."}</p>}
      
      <ResearchPageNavigation currentPath="/study-findings" />
    </div>
  );
};
