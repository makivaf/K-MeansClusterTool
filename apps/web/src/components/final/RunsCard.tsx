import { useEffect, useRef } from "react";
import type { MethodJobs } from "../../hooks/useMethodJobs";
import { formatNumber } from "../../utils/formatNumber";
import { MethodPill, Panel } from "./ui";

const steps = [
  ["Preprocessing", "preprocessing", true, true], ["PCA", "pca", false, true],
  ["k selection (Silhouette)", "k_selection", true, false], ["NbClust", "nbclust", false, true],
  ["DPC initialization", "dpc", false, true], ["Lloyd K-Means", "lloyd", true, true],
  ["Seed evaluation (30 runs)", "seed_evaluation", true, false], ["Validation", "validation", true, true],
  ["Evidence", "evidence", true, true], ["Computation total", "total", true, true], ["Elapsed time", "application_wall", true, true]
] as const;
const overhead = [["Admission and snapshot", "admission_and_snapshot"], ["Queue wait", "queue_and_capacity_wait"],
  ["Environment checks", "environment_and_code_checks"], ["Prepared cohort verification", "prepared_cohort_verification"],
  ["Worker input preparation", "worker_input_preparation"],
  ["Worker startup and transport", "worker_startup_and_transport"], ["Result persistence", "result_persistence"]] as const;
export const timingText = (seconds?: number) => seconds === undefined ? "Not available" : seconds > 0 && seconds < .01 ? "< 0.01" : formatNumber(seconds, "axis2", "Not available");

export function RunsCard({ state, ready }: { state: MethodJobs; ready: boolean }) {
  const pair = `${state.completed.standard?.id ?? ""}:${state.completed.enhanced?.id ?? ""}`;
  const requested = useRef("");
  useEffect(() => {
    if (!state.compatible || state.comparison || state.locked || requested.current === pair) return;
    requested.current = pair; void state.run("comparison");
  }, [pair, state.compatible, state.locked, state.comparison]);
  const timing = (key: string, method: "standard" | "enhanced") => state.jobs[method]?.status === "complete"
    ? state.completed[method]?.result?.timings[key] : undefined;
  return <Panel title="Analysis Runs" expand={false}>
    <div className="final-grid">{(["standard", "enhanced"] as const).map(method => {
      const job = state.jobs[method], saved = state.completed[method];
      const name = method === "standard" ? "Standard" : "Enhanced";
      const active = state.submitting ?? state.uncertain ?? (["standard", "enhanced", "comparison"] as const).find(key => ["running", "queued"].includes(state.jobs[key]?.status ?? ""));
      const waiting = active && active !== method ? `Waiting for ${active === "standard" ? "Standard" : active === "enhanced" ? "Enhanced" : "comparison"} to finish` : null;
      const busy = state.submitting === method || ["running", "queued"].includes(job?.status ?? "");
      const retryUncertain = state.uncertain === method && !state.submitting && !Object.values(state.jobs).some(value => ["running", "queued"].includes(value.status));
      return <div key={method} className="final-run-column"><MethodPill kind={method} />
        <span className="final-run-status" role="status">{busy ? "Running" : state.uncertain === method ? "Checking request" : job?.status === "complete" ? "Complete" : job?.status === "failed" ? "Failed" : "Not run yet"}</span>
        <small>{saved?.finishedAt && job?.status === "complete" ? `Computed ${new Date(saved.finishedAt).toLocaleString("en-PH", { timeZone: "Asia/Manila" })}` : "\u00a0"}</small>
        <button type="button" disabled={!ready || (state.locked && !retryUncertain)} onClick={() => void state.run(method)}>{waiting ?? (busy ? "Running" : retryUncertain ? `Retry ${name} K-Means` : saved ? `Rerun ${name} K-Means` : `Run ${name} K-Means`)}</button>
        {(state.errors[method] || job?.error) && <p role="alert">{state.errors[method] ?? job?.error}</p>}
      </div>;
    })}</div>
    <details><summary>Run details</summary><table><thead><tr><th>Step</th><th>Standard (seconds)</th><th>Enhanced (seconds)</th></tr></thead>
      <tbody>{steps.map(([label, key, standard, enhanced]) => <tr key={key}><th>{label}</th><td>{standard ? timingText(timing(key, "standard")) : "-"}</td><td>{enhanced ? timingText(timing(key, "enhanced")) : "-"}</td></tr>)}
      <tr><th colSpan={3}>System overhead</th></tr>{overhead.map(([label, key]) => <tr key={key}><th>{label}</th><td>{timingText(timing(key, "standard"))}</td><td>{timingText(timing(key, "enhanced"))}</td></tr>)}</tbody></table>
      <p className="final-caption">Seed evaluation includes Lloyd and validation; enclosing timings overlap and must not be added.</p>
    </details>
    {(state.errors.comparison || state.jobs.comparison?.error) && <p role="alert">{state.errors.comparison ?? state.jobs.comparison?.error}<button type="button" disabled={state.locked} onClick={() => void state.run("comparison")}>Retry comparison evidence</button></p>}
    {state.completed.standard && state.completed.enhanced && !state.compatible && <p role="alert">These results have incompatible provenance. Rerun the older method on the current input.</p>}
  </Panel>;
}
