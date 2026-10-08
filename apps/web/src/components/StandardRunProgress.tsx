import { FileChartColumn, Info } from "lucide-react";
import type { ResearchProgressStage } from "../../../../packages/shared/src/schema";
import type { AnalysisRunState } from "../hooks/useStudyFindings";
import { StudyRunProgressCard } from "./StudyRunProgressCard";

const steps = [
  ["Preparing Data", "Dataset ready", 0],
  ["Preprocessing", "Cleaning & standardization", 1],
  ["Standard Setup", "Feature space ready", 2],
  ["K-Means", "Random initialization · 30 runs", 3],
  ["Validation", "Computing metrics & reproducibility evidence", 4],
  ["Complete", "Results ready", 5]
] as const;

// The unchanged API executes one combined pipeline. Do not mistake its
// enhanced_kmeans stage for the later Standard random-initialization sweep.
const standardStages: Record<ResearchProgressStage, number> = {
  preparing_inputs: 0,
  constructing_study_entry_cohort: 0,
  preprocessing: 1,
  pca: 2,
  selecting_k: 2,
  deterministic_initialization: 2,
  enhanced_kmeans: 2,
  cluster_profiling: 2,
  baseline_comparison: 3,
  matching_longitudinal_records: 4,
  longitudinal_eligibility: 4,
  longitudinal_analysis: 4,
  aggregate_artifact_validation: 4
};

export const StandardRunProgress = ({ status, stage }: Pick<AnalysisRunState, "status" | "stage">) => {
  const activeStage = status === "running" && stage && Object.prototype.hasOwnProperty.call(standardStages, stage)
    ? standardStages[stage as ResearchProgressStage] : -1;
  return <div className="study-running-view">
    <StudyRunProgressCard method="Standard" steps={steps} activeStage={activeStage}
      statusMessage={activeStage < 0 ? status === "queued" ? "Waiting for analysis to start." : status === "submitting" ? "Submitting analysis request." : "Checking analysis status and results." : undefined} />
    <section className="study-next-card" aria-labelledby="study-next-title">
      <Info size={22} aria-hidden="true" />
      <div><h2 id="study-next-title" className="card-title">What happens next</h2>
        <ol>{["Standard results will appear first.", "You can then run Enhanced K-Means.", "The full Study Findings view unlocks after both complete."].map((item, index) =>
          <li key={item}><span aria-hidden="true">{index + 1}</span><p>{item}</p></li>)}</ol>
      </div>
    </section>
    <section className="study-results-placeholder" aria-labelledby="study-placeholder-title">
      <FileChartColumn size={44} strokeWidth={1.5} aria-hidden="true" />
      <h2 id="study-placeholder-title" className="card-title">Results will appear here</h2>
      <p className="text-sm text-muted">SOP 1, SOP 2, SOP 3, and Final Results will be available after the Standard K-Means analysis completes.</p>
    </section>
  </div>;
};
