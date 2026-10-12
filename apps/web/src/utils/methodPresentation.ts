import type { Method, MethodJob } from "../../../../packages/shared/src/methodExecution";
type PresentationJobs = {
  jobs: Partial<Record<Method, MethodJob>>; completed: Partial<Record<Method, MethodJob>>; submitting: Method | null;
  uncertain?: Method | null;
};
/** A persisted prior success is retained for recovery, but cannot populate an active rerun column. */
export function visibleMethodResult(state: PresentationJobs, method: "standard" | "enhanced") {
  const latest = state.jobs[method];
  if (state.submitting === method || state.uncertain === method || latest && latest.status !== "complete") return undefined;
  return state.completed[method]?.result ?? undefined;
}
export function methodPlaceholder(state: PresentationJobs, method: "standard" | "enhanced") {
  return state.submitting === method || state.uncertain === method || ["running", "queued"].includes(state.jobs[method]?.status ?? "") ? "Running" : "Not run yet";
}
