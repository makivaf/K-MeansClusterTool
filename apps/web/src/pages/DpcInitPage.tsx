import type { ClusteringRun } from "../../../../packages/shared/src";
import { DpcGammaScatter } from "../components/charts/DpcGammaScatter";
import { DpcCentroidsTable } from "../components/tables/DpcCentroidsTable";
import { Panel } from "../components/ui/Panel";
import { PageHeading } from "./PageHeading";

type DpcInitPageProps = {
  run: ClusteringRun | null;
};

export const DpcInitPage = ({ run }: DpcInitPageProps) => {
  if (!run) return null;

  return (
    <>
      <PageHeading
        title="DPC-init"
        description="Density peaks candidate ranking and selected initial centroids for the enhanced K-Means condition."
      />
      <div className="grid grid-cols-12 gap-4">
        <Panel title="Gamma Values" className="col-span-8">
          <DpcGammaScatter gammaValues={run.dpc_init.gamma_values} selectedCentroids={run.dpc_init.selected_centroids} />
        </Panel>
        <Panel title="Selected Centroids" className="col-span-4">
          <DpcCentroidsTable centroids={run.dpc_init.selected_centroids} />
        </Panel>
      </div>
    </>
  );
};
