import type { ClusteringRun } from "../../../../packages/shared/src";
import { PcaScreeChart } from "../components/charts/PcaScreeChart";
import { Panel } from "../components/ui/Panel";
import { PageHeading } from "./PageHeading";

type PcaPageProps = {
  run: ClusteringRun | null;
};

export const PcaPage = ({ run }: PcaPageProps) => {
  if (!run) return null;

  return (
    <>
      <PageHeading
        title="PCA"
        description="Scree plot and cumulative explained variance for the selected dimensionality-reduction output."
      />
      <div className="grid grid-cols-4 gap-4">
        <Panel title="Retained components">
          <div className="text-3xl font-semibold">{run.pca.n_components_selected}</div>
        </Panel>
        <Panel title="Explained variance">
          <div className="text-3xl font-semibold">{(run.pca.cumulative_explained_variance * 100).toFixed(1)}%</div>
        </Panel>
        <Panel title="First component">
          <div className="text-3xl font-semibold">{(run.pca.scree_data[0].individual_variance * 100).toFixed(1)}%</div>
        </Panel>
        <Panel title="Axis">
          <div className="text-3xl font-semibold">{run.axis}</div>
        </Panel>
      </div>
      <Panel title="Scree Plot" className="mt-4">
        <PcaScreeChart data={run.pca.scree_data} />
      </Panel>
    </>
  );
};
