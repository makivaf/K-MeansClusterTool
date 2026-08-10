import type { ClusteringRun } from "../../../../packages/shared/src";
import { NbClustVotesChart } from "../components/charts/NbClustVotesChart";
import { VoteSummaryTable } from "../components/tables/VoteSummaryTable";
import { Panel } from "../components/ui/Panel";
import { PageHeading } from "./PageHeading";

type NbClustPageProps = {
  run: ClusteringRun | null;
};

export const NbClustPage = ({ run }: NbClustPageProps) => {
  if (!run) return null;

  return (
    <>
      <PageHeading
        title="NbClust"
        description="Candidate cluster counts and index vote summary used to select k before enhanced K-Means."
      />
      <div className="grid grid-cols-12 gap-4">
        <Panel title="Index Votes by k" className="col-span-7" action={<span className="text-sm font-semibold text-teal-700">Selected k = {run.nbclust.selected_k}</span>}>
          <NbClustVotesChart data={run.nbclust.index_votes} selectedK={run.nbclust.selected_k} />
        </Panel>
        <Panel title="Vote Summary" className="col-span-5">
          <VoteSummaryTable rows={run.nbclust.vote_summary} />
        </Panel>
      </div>
    </>
  );
};
