import { useId, useState, type ReactNode } from "react";
import { compatibleMethods, type MethodResult } from "../../../../../packages/shared/src/methodExecution";
import { Sop1, Sop2, Sop3, Placeholder } from "./SopPanels";
import { FinalResults } from "./FinalResults";
import { Panel } from "./ui";
import "./FinalUi.css";
export const comparisonEnabled = (standard?: MethodResult, enhanced?: MethodResult) => compatibleMethods(standard, enhanced);
export function StudyResults({ standard, enhanced, comparison, standardState = "Not run yet", enhancedState = "Not run yet", historical, initialTab = "sop1" }: {
  standard?: MethodResult; enhanced?: MethodResult; comparison?: MethodResult; standardState?: string; enhancedState?: string; historical?: ReactNode; initialTab?: string;
}) {
  const [tab, setTab] = useState(initialTab), [view, setView] = useState("individual");
  const id = useId();
  const complete = comparisonEnabled(standard, enhanced);
  const compatibleComparison = complete && comparison?.method === "comparison" && Object.entries(standard!.provenance).every(([key, value]) => comparison.provenance[key as keyof typeof comparison.provenance] === value) ? comparison : undefined;
  const comparisonView = view === "comparison" && complete;
  if (!standard && !enhanced && standardState !== "Running" && enhancedState !== "Running") return null;
  const props = { standard, enhanced, comparison: compatibleComparison, comparisonView, standardState, enhancedState };
  const tabs = [["sop1", "SOP 1", "Feature representation"], ["sop2", "SOP 2", "Cluster-number selection"], ["sop3", "SOP 3", "Initialization & reproducibility"], ["final", "Final Results", "Clustering results"]];
  return <div className="final-stack"><div className="final-segment" role="group" aria-label="Results view"><button type="button" aria-pressed={!comparisonView} onClick={() => setView("individual")}>Individual results</button><button type="button" disabled={!complete} aria-pressed={comparisonView} onClick={() => setView("comparison")}>Comparison</button></div>
    <div className="final-tabs" role="tablist" aria-label="Study findings sections">{tabs.map(([key, label, title], index) => <button key={key} id={`${id}-${key}`} type="button" role="tab" aria-selected={tab === key} aria-controls={`${id}-${key}-panel`} tabIndex={tab === key ? 0 : -1} onClick={() => setTab(key)} onKeyDown={event => { const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null; if (next !== null) { event.preventDefault(); setTab(tabs[next][0]); (event.currentTarget.parentElement?.children[next] as HTMLButtonElement)?.focus(); } }}><span>{label}</span><strong>{title}</strong></button>)}</div>
    {tabs.map(([key]) => <div key={key} id={`${id}-${key}-panel`} role="tabpanel" aria-labelledby={`${id}-${key}`} hidden={tab !== key} tabIndex={0}>
      {key === "sop1" && <Sop1 {...props} />}{key === "sop2" && <Sop2 {...props} />}{key === "sop3" && <Sop3 {...props} />}
      {key === "final" && (complete ? <FinalResults standard={standard!} enhanced={enhanced!} comparison={compatibleComparison} longitudinal={historical} /> : <Panel title="Final Results" expand={false}><p>Complete both methods to view Final Results.</p><div className="final-grid"><Placeholder method="standard" state={standard ? "Completed" : standardState} /><Placeholder method="enhanced" state={enhanced ? "Completed" : enhancedState} /></div></Panel>)}
    </div>)}
  </div>;
}
