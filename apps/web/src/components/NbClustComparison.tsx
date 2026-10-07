import type { ReactNode } from "react";
import { MethodCard, SopComparison } from "./SopComparison";
import { NbClustChart, NbClustIndexDetails } from "./SopFigures";

type Evidence = {
  candidateK: readonly number[];
  selectedK: number;
  usableIndices: number;
  votes: readonly { k: number; count?: number }[];
  indices: readonly { index: string; status: string; recommendedK?: number | null }[];
};

export const NbClustSummary = ({ candidateK, selectedK, usableIndices, votes }: Evidence) => {
  const chartVotes = candidateK.map(k => ({ k, count: votes.find(vote => vote.k === k)?.count }));
  const complete = chartVotes.length > 0 && chartVotes.every(vote => vote.count !== undefined);
  const highest = complete ? Math.max(...chartVotes.map(vote => vote.count!)) : undefined;
  const leaders = highest === undefined ? [] : chartVotes.filter(vote => vote.count === highest).map(vote => vote.k);
  const range = candidateK.length ? [...candidateK].sort((a, b) => a - b) : [];
  const contiguous = range.every((k, i) => i === 0 || k === range[i - 1] + 1);
  return <MethodCard simulation enhanced title="NbClust Multi-Index Selection">
    <dl className="simulation-detail-list">
      <div><dt>Selection method</dt><dd>NbClust Multi-Index Consensus</dd></div>
      <div><dt>Candidate k</dt><dd>{range.length ? contiguous && range.length > 1 ? `${range[0]}–${range[range.length - 1]}` : range.join(", ") : "Unavailable"}</dd></div>
      <div><dt>Usable indices</dt><dd>{usableIndices}</dd></div>
    </dl>
    <NbClustChart selectedK={selectedK} votes={chartVotes} usableIndices={usableIndices} supportingIndices={votes.find(vote => vote.k === selectedK)?.count} />
    <p className="simulation-compact-note nbclust-interpretation">{highest === undefined
      ? "The full vote distribution is unavailable. Missing vote counts are unavailable, not zero."
      : highest === 0 ? "No votes were reported for the candidate k values."
      : leaders.length > 1 ? `The highest vote count was tied across k = ${leaders.join(", ")}.`
      : `The largest number of usable NbClust indices supported k = ${leaders[0]}.`}</p>
    <h3 className="card-title simulation-compact-title">Vote Summary</h3>
    <dl className="simulation-detail-list nbclust-vote-summary">
      <div><dt>Highest vote count</dt><dd>{highest ?? "Unavailable"}</dd></div>
      <div><dt>Selected k</dt><dd>{selectedK}</dd></div>
    </dl>
  </MethodCard>;
};

// Both result pages use this same card and full-width disclosure arrangement.
export const NbClustComparison = ({ standard, standardOnly = false, ...evidence }: Evidence & { standard: ReactNode; standardOnly?: boolean }) =>
  <SopComparison simulation figures standardOnly={standardOnly} standard={standard} enhanced={<NbClustSummary {...evidence} />}>
    <NbClustIndexDetails indices={evidence.indices} />
  </SopComparison>;
