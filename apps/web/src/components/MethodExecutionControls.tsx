import { useEffect, useRef } from "react";
import { formatNumber } from "../utils/formatNumber";
import type { MethodJobs } from "../hooks/useMethodJobs";
import { Panel } from "./ui/Panel";
import { StudyRunProgressCard } from "./StudyRunProgressCard";
import { standardProgressSteps, enhancedProgressSteps } from "./methodProgressSteps";

export const methodStage = (method: "standard" | "enhanced", stage?: string) => {
  const stages = method === "standard"
    ? { preparing_inputs: 0, constructing_study_entry_cohort: 1, preprocessing: 1, pca: 1, k_selection: 2, seed_evaluation: 3, evidence: 4, complete: 5 }
    : { preparing_inputs: 0, constructing_study_entry_cohort: 1, preprocessing: 1, pca: 2, nbclust: 3, dpc: 4, lloyd: 5, evidence: 6, complete: 7 };
  return stages[stage as keyof typeof stages] ?? -1;
};

// Uses the validated job hook; presentation retains the existing run cards and progress lanes.
export function MethodExecutionControls({ state, ready }: { state: MethodJobs; ready: boolean }) {
  const pair = `${state.completed.standard?.id ?? ""}:${state.completed.enhanced?.id ?? ""}`;
  const requested = useRef("");
  useEffect(() => {
    if (!state.compatible || state.comparison || state.locked || requested.current === pair) return;
    requested.current = pair;
    void state.run("comparison");
  }, [pair, state.compatible, state.locked, state.comparison]);
  return <>
    <Panel title="Analysis Runs" variant="surface">
      <div className="study-runs">
        {(["standard", "enhanced"] as const).map(method => {
          const job = state.jobs[method], saved = state.completed[method];
          const name = method === "standard" ? "Standard" : "Enhanced";
          const busy = job?.status === "running" || job?.status === "queued";
          const active = state.submitting ?? state.uncertain ?? (["standard", "enhanced", "comparison"] as const).find(key => ["running", "queued"].includes(state.jobs[key]?.status ?? ""));
          const retryUncertain = state.uncertain === method && state.submitting === null && !Object.values(state.jobs).some(value => ["running", "queued"].includes(value.status));
          const waiting = active && active !== method ? `Waiting for ${active === "standard" ? "Standard" : active === "enhanced" ? "Enhanced" : "comparison"} to finish` : null;
          return <div className="study-run-state" key={method}>
            <div className="study-run-details"><span>{name} K-Means</span>
              <span className="research-badge">{state.submitting === method ? "Submitting" : state.uncertain === method ? "Checking request" : job?.status ?? "Ready"}</span>
              {saved && job?.status === "complete" && state.uncertain !== method && <small>Computed {new Date(saved.finishedAt!).toLocaleString()}</small>}
            </div>
            <button type="button" className="research-primary-button" disabled={!ready || state.locked && !retryUncertain} onClick={() => void state.run(method)}>
              {waiting ?? (retryUncertain ? `Retry ${name} K-Means` : state.submitting === method || busy ? `Running ${name}` : job?.status === "failed" || job?.status === "cancelled" ? `Retry ${name} K-Means` : saved ? `Rerun ${name} K-Means` : `Run ${name} K-Means`)}
            </button>
            {saved?.result && <details className="sop3-disclosure"><summary>Run details</summary>
              <dl>{Object.entries(saved.result.timings).map(([name, seconds]) => <div key={name}><dt>{name.replace(/_/g, " ")}</dt><dd>{formatNumber(seconds, "duration")} seconds</dd></div>)}</dl>
            </details>}
            {busy && <button type="button" className="research-text-action" onClick={() => void state.cancel(method)}>Cancel {name}</button>}
            {(state.errors[method] || job?.error) && <p role="alert">{state.errors[method] ?? job?.error}</p>}
            {state.errors[method] && <button type="button" className="research-text-action" onClick={() => void state.refresh(method)}>Refresh status</button>}
          </div>;
        })}
      </div>
      {state.completed.standard && state.completed.enhanced && !state.compatible && <p role="alert">These results have incompatible provenance. Rerun the older method on the current input.</p>}
      {state.compatible && !state.comparison && <p role="status">Both methods finished. {state.jobs.comparison?.status === "running" || state.jobs.comparison?.status === "queued" ? "Computing controlled SOP comparison evidence." : "Controlled comparison evidence is pending."}</p>}
      {state.comparison && <span className="study-comparison-ready">Comparison Ready</span>}
      {(state.errors.comparison || state.jobs.comparison?.error) && <p role="alert">{state.errors.comparison ?? state.jobs.comparison?.error} <button type="button" disabled={state.locked && state.uncertain !== "comparison"} onClick={() => void state.run("comparison")}>Retry comparison evidence</button></p>}
    </Panel>
    {(["standard", "enhanced"] as const).map(method => state.jobs[method]?.status === "running" &&
      <StudyRunProgressCard key={method} method={method === "standard" ? "Standard" : "Enhanced"}
        steps={method === "standard" ? standardProgressSteps : enhancedProgressSteps} activeStage={methodStage(method, state.jobs[method]?.stage)} />)}
  </>;
}
