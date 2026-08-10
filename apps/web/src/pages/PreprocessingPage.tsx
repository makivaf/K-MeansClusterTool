import type { ClusteringRun } from "../../../../packages/shared/src";
import { PreprocessingTable } from "../components/tables/PreprocessingTable";
import { Panel } from "../components/ui/Panel";
import { PageHeading } from "./PageHeading";

type PreprocessingPageProps = {
  run: ClusteringRun | null;
};

export const PreprocessingPage = ({ run }: PreprocessingPageProps) => {
  if (!run) return null;

  return (
    <>
      <PageHeading
        title="Preprocessing"
        description="Missingness filtering, retained sample size, and feature preparation summary for the selected run."
      />
      <div className="grid grid-cols-4 gap-4">
        <Panel title="Missingness threshold">
          <div className="text-3xl font-semibold">{(run.preprocessing.missingness_threshold * 100).toFixed(0)}%</div>
        </Panel>
        <Panel title="Initial sample">
          <div className="text-3xl font-semibold">{run.preprocessing.initial_sample_size.toLocaleString()}</div>
        </Panel>
        <Panel title="Sample retained">
          <div className="text-3xl font-semibold">{run.preprocessing.retained_sample_size.toLocaleString()}</div>
        </Panel>
        <Panel title="Feature count">
          <div className="text-3xl font-semibold">{run.dataset.feature_count}</div>
        </Panel>
      </div>
      <div className="mt-4 grid grid-cols-12 gap-4">
        <Panel title="Excluded Variables" className="col-span-8">
          <PreprocessingTable rows={run.preprocessing.excluded_variables} />
        </Panel>
        <Panel title="Transform Plan" className="col-span-4">
          <dl className="space-y-4 text-sm">
            <div>
              <dt className="font-semibold">Imputation</dt>
              <dd className="mt-1 text-muted">{run.preprocessing.imputation_strategy}</dd>
            </div>
            <div>
              <dt className="font-semibold">Scaling</dt>
              <dd className="mt-1 text-muted">{run.preprocessing.scaling_strategy}</dd>
            </div>
            <div>
              <dt className="font-semibold">Assessment domain</dt>
              <dd className="mt-1 text-muted">{run.dataset.assessment_domain}</dd>
            </div>
          </dl>
        </Panel>
      </div>
    </>
  );
};
