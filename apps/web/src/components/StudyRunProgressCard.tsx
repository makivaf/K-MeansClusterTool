import type { CSSProperties } from "react";
import { Loader2 } from "lucide-react";
import { Panel } from "./ui/Panel";
import { RunProgress } from "./RunProgress";

export const StudyRunProgressCard = ({ method, steps, activeStage, statusMessage }: {
  method: "Standard" | "Enhanced";
  steps: readonly (readonly [string, string, number])[];
  activeStage: number;
  statusMessage?: string;
}) => <Panel title={`Run ${method} K-Means`} variant="surface" className="study-progress-card"
  action={<span className="research-badge is-valid study-running-badge" role="status"><Loader2 size={16} className="animate-spin" aria-hidden="true" />Running...</span>}>
  <p className="section-subtitle">Track {method} K-Means analysis progress on the validated full cohort.</p>
  <div style={{ "--study-stage-count": steps.length } as CSSProperties}>
    <RunProgress steps={steps} stage={activeStage} completeStage={steps.length - 1} label={`${method} K-Means analysis progress`} className="study-stepper" />
  </div>
  {statusMessage && <p className="study-progress-wait text-xs text-muted" role="status">{statusMessage}</p>}
</Panel>;

const enhancedSteps = [
  ["Preparing Data", "Validated cohort ready", 0],
  ["Preprocessing", "Cleaning & standardization", 1],
  ["PCA", "Dimensionality reduction", 2],
  ["NbClust", "Cluster number selection", 3],
  ["DPC", "Centroid initialization", 4],
  ["K-Means", "Lloyd clustering", 5],
  ["Validation", "Computing clustering metrics", 6],
  ["Complete", "Enhanced results ready", 7]
] as const;

// Enhanced's current frontend operation retrieves and validates persisted output.
// It has no per-stage telemetry. Do not replay the earlier combined job's stages
// or label result retrieval as PCA, clustering, or metric computation.
export const EnhancedRunProgress = () => <StudyRunProgressCard method="Enhanced" steps={enhancedSteps} activeStage={-1}
  statusMessage="Loading and verifying Enhanced results. Detailed workflow stage progress is unavailable." />;
