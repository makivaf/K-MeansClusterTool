import type { ClusteringRun } from "../../../../packages/shared/src";
import { ClusterProfileTable } from "../components/tables/ClusterProfileTable";
import { Panel } from "../components/ui/Panel";
import { PageHeading } from "./PageHeading";

type ClusterProfilesPageProps = {
  run: ClusteringRun | null;
};

export const ClusterProfilesPage = ({ run }: ClusterProfilesPageProps) => {
  if (!run) return null;

  return (
    <>
      <PageHeading
        title="Cluster Profiles"
        description="Aggregate-only profile summaries for each cluster. This screen intentionally avoids participant-level records or identifiers."
      />
      <div className="space-y-4">
        {run.conditions.map((condition) => (
          <Panel key={condition.condition} title={condition.condition === "baseline" ? "Baseline Condition" : "Enhanced Condition"}>
            <ClusterProfileTable condition={condition} />
          </Panel>
        ))}
      </div>
    </>
  );
};
