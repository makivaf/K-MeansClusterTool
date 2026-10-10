import { CheckCircle2, Loader2 } from "lucide-react";
import { Panel } from "./ui/Panel";
import { MethodProgressLane } from "./StudyRunProgressCard";
import { comparisonProgressSteps } from "./methodProgressSteps";

// The current comparison API reports only shared runtime boundaries (0–4).
// Method-specific stages remain unknown during clustering; never estimate them.
export const ComparisonRunProgress = ({ stage, interrupted, standardStage, enhancedStage }: {
  stage: number;
  interrupted: boolean;
  standardStage?: number;
  enhancedStage?: number;
}) => {
  const complete = stage === 4 && !interrupted;
  const knownSharedStage = stage === 0 || stage === 1;
  const sharedValidation = stage === 3;
  const standard = complete ? 5 : standardStage ?? (knownSharedStage ? stage : sharedValidation ? 4 : -1);
  const enhanced = complete ? 7 : enhancedStage ?? (knownSharedStage ? stage : sharedValidation ? 6 : -1);
  const unknownDetail = stage === 2 && !interrupted && (standardStage === undefined || enhancedStage === undefined);
  return <Panel title="Run K-Means Comparison" variant="surface" className="study-progress-card comparison-progress-card"
    action={<span className={`research-badge study-running-badge ${!interrupted ? "is-valid" : ""}`} role="status">
      {complete ? <><CheckCircle2 size={16} aria-hidden="true" />Comparison complete</>
        : interrupted ? stage < 0 ? "Ready to run" : "Comparison interrupted"
        : <><Loader2 size={16} className="animate-spin" aria-hidden="true" />Running...</>}
    </span>}>
    <p className="section-subtitle">Track Standard and Enhanced K-Means progress on the same validated input.</p>
    {(["Standard", "Enhanced"] as const).map(method => <section className="comparison-progress-lane" key={method}
      aria-label={`${method} K-Means progress lane`}>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-teal-800">{method} K-Means</h3>
      <MethodProgressLane method={method} steps={comparisonProgressSteps(method)}
        activeStage={method === "Standard" ? standard : enhanced} interrupted={interrupted}
        completedThrough={stage === 2 && (method === "Standard" ? standardStage : enhancedStage) === undefined ? 1 : undefined} />
    </section>)}
    {unknownDetail && <p className="study-progress-wait text-xs text-muted" role="status">
      Comparison is running. Detailed per-method stage progress is unavailable.
    </p>}
  </Panel>;
};
