import type { CSSProperties } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Panel } from "./ui/Panel";
import { RunProgress } from "./RunProgress";
import { enhancedProgressSteps } from "./methodProgressSteps";

export const MethodProgressLane = ({ method, steps, activeStage, interrupted = false, completedThrough }: {
  method: "Standard" | "Enhanced";
  steps: readonly (readonly [string, string, number])[];
  activeStage: number;
  interrupted?: boolean;
  completedThrough?: number;
}) => <div className="method-progress-scroll" role="region" aria-label={`${method} K-Means stages`} tabIndex={0}
  style={{ "--study-stage-count": steps.length } as CSSProperties}>
  <RunProgress steps={steps} stage={activeStage} interrupted={interrupted} completedThrough={completedThrough}
    completeStage={steps.length - 1} label={`${method} K-Means analysis progress`} className="study-stepper" />
</div>;

export const StudyRunProgressCard = ({ method, steps, activeStage, statusMessage }: {
  method: "Standard" | "Enhanced";
  steps: readonly (readonly [string, string, number])[];
  activeStage: number;
  statusMessage?: string;
}) => <Panel title={`Run ${method} K-Means`} variant="surface" className="study-progress-card"
  action={<span className="research-badge is-valid study-running-badge" role="status">{activeStage === steps.length - 1
    ? <><CheckCircle2 size={16} aria-hidden="true" />{method} K-Means complete</>
    : <><Loader2 size={16} className="animate-spin" aria-hidden="true" />Running {method} K-Means</>}</span>}>
  <p className="section-subtitle">Track {method} K-Means analysis progress on the validated full cohort.</p>
  <MethodProgressLane method={method} steps={steps} activeStage={activeStage} />
  {statusMessage && <p className="study-progress-wait text-xs text-muted" role="status">{statusMessage}</p>}
</Panel>;


// Enhanced's current frontend operation retrieves and validates persisted output.
// It has no per-stage telemetry. Do not replay the earlier combined job's stages
// or label result retrieval as PCA, clustering, or metric computation.
export const EnhancedRunProgress = () => <StudyRunProgressCard method="Enhanced" steps={enhancedProgressSteps} activeStage={-1}
  statusMessage="Loading and verifying Enhanced results. Detailed workflow stage progress is unavailable." />;
