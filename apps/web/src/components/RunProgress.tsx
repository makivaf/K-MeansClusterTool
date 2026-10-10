import { Check } from "lucide-react";
import "./RunProgress.css";

// Shared simulation stepper: stage numbers are reported runtime boundaries,
// never elapsed-time estimates. A negative stage leaves every step pending.
export const RunProgress = ({ steps, stage, interrupted = false, completeStage, completedThrough = stage - 1, label, className = "" }: {
  steps: readonly (readonly [string, string, number])[];
  stage: number;
  interrupted?: boolean;
  completeStage: number;
  completedThrough?: number;
  label: string;
  className?: string;
}) => <ol className={`simulation-stepper ${className}`} aria-label={label}>
  {steps.map(([title, subtitle, runtimeStage]) => {
    const done = runtimeStage <= completedThrough || (stage === completeStage && !interrupted);
    const active = !interrupted && stage < completeStage && runtimeStage === stage;
    return <li key={title} aria-current={active ? "step" : undefined} className={`simulation-step ${done ? "is-reached" : active ? "is-active" : ""}`}>
      <span className="simulation-step-node" aria-hidden="true">{done ? <Check size={16} /> : <span className="simulation-step-dot" />}</span>
      <span>{title}<span className="sr-only">: {done ? "complete" : active ? "in progress" : "pending"}</span><span className="simulation-step-subtitle">{subtitle}</span></span>
    </li>;
  })}
</ol>;
