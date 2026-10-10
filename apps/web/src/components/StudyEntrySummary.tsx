import { Link } from "react-router-dom";
import { Panel } from "./ui/Panel";

// Presentation values supplied for the thesis UI; no dataset processing occurs here.
const candidateMappings: Record<string, readonly [string, string][]> = {
  ADAS: [["ADAS-Cog 13", "TOTAL13"]],
  CDR: [["CDR-SB", "CDRSB"]],
  FAQ: [["FAQ", "FAQTOTAL"]],
  MMSE: [["MMSE", "MMSCORE"]],
  NEUROBAT: [
    ["Logical Memory Immediate", "LIMMTOTAL"],
    ["Logical Memory Delayed", "LDELTOTAL"],
    ["Trail Making Test A", "TRAASCOR"],
    ["Trail Making Test B", "TRABSCOR"],
    ["Animal Fluency", "CATANIMSC"],
    ["Boston Naming Test", "BNTTOTAL"],
    ["RAVLT Immediate", "AVTOT1–AVTOT5"],
    ["RAVLT Delayed", "AVDEL30MIN"],
    ["RAVLT Forgetting", "AVTOT5 − AVDEL30MIN"]
  ],
  "NPI-Q": [["NPI-Q", "NPISCORE"]],
  GDS: [["GDS", "GDTOTAL"]]
};

export const CandidateVariables = ({ dataset }: { dataset: string }) => {
  const variables = candidateMappings[dataset];
  if (dataset === "NEUROBAT") return <>
    <span className="font-medium">9 candidate variables</span>
    <details className="dataset-candidates">
      <summary className="research-text-action">View variables</summary>
      <dl>{variables.map(([label, field]) => <div key={label}>
        <dt>{label}</dt><dd><code>{field}</code></dd>
      </div>)}</dl>
    </details>
  </>;
  return <><span className="block font-medium">{variables[0][0]}</span>
    <code className="dataset-source-field">{variables[0][1]}</code></>;
};

const phaseCounts = [["ADNI-1", "819"], ["ADNI-GO", "130"], ["ADNI-2", "789"], ["ADNI-3", "699"]] as const;
const missingnessRows = [
  ["MMSE", "2,350", "87", "3.57%", false],
  ["ADAS-Cog 13", "2,312", "125", "5.13%", false],
  ["Logical Memory Immediate", "2,298", "139", "5.70%", false],
  ["Logical Memory Delayed", "2,296", "141", "5.79%", false],
  ["Trail Making Test A", "2,310", "127", "5.21%", false],
  ["Trail Making Test B", "2,303", "134", "5.50%", false],
  ["Animal Fluency", "2,320", "117", "4.80%", false],
  ["Boston Naming Test", "1,730", "707", "29.01%", true],
  ["CDR-SB", "2,318", "119", "4.88%", false],
  ["FAQ", "2,309", "128", "5.25%", false],
  ["NPI-Q", "949", "1,488", "61.06%", true],
  ["GDS", "2,322", "115", "4.72%", false],
  ["RAVLT Immediate", "2,300", "137", "5.62%", false],
  ["RAVLT Delayed", "2,297", "140", "5.75%", false],
  ["RAVLT Forgetting", "2,306", "131", "5.38%", false]
] as const;

export const StudyEntrySummary = () => <>
  <section className="research-panel dataset-cohort rounded-md border border-line bg-panel" aria-labelledby="study-entry-cohort">
    <div>
      <h2 id="study-entry-cohort" className="text-base font-semibold text-teal-800">Study-Entry Cohort</h2>
      <p className="mt-1 text-xs text-muted">Eligible participants retained for preprocessing.</p>
    </div>
    <dl className="dataset-stats dataset-phase-stats">
      <div className="is-emphasized"><dt>participants</dt><dd>2,437</dd></div>
      {phaseCounts.map(([label, count]) => <div key={label}><dt>{label}</dt><dd>{count}</dd></div>)}
    </dl>
  </section>
  <Panel title="Missingness Screening" variant="surface" className="dataset-screening mt-4">
    <p className="mb-4 text-xs text-muted">Variables above the 20% missingness threshold are excluded.</p>
    <div className="dataset-audit overflow-x-auto" role="region" aria-label="Variable Missingness Audit" tabIndex={0}>
      <table className="research-table">
        <caption className="pb-2 text-left text-xs font-semibold text-ink">Variable Missingness Audit</caption>
        <thead><tr>{["Variable", "Non-missing records", "Missing records", "Total records", "Missingness %", "Decision"].map(label =>
          <th scope="col" key={label}>{label}</th>)}</tr></thead>
        <tbody>{missingnessRows.map(([label, nonMissing, missing, percent, excluded]) =>
          <tr key={label} className={excluded ? "is-excluded" : undefined}>
            <th scope="row">{label}</th><td>{nonMissing}</td><td>{missing}</td><td>2,437</td><td>{percent}</td>
            <td><span className={`research-badge dataset-decision ${excluded ? "is-excluded" : "is-valid"}`}>
              {excluded ? "Excluded" : "Retained"}
            </span></td>
          </tr>)}</tbody>
      </table>
    </div>
    <dl className="dataset-stats dataset-screening-stats mt-4">
      <div><dt>Candidate variables</dt><dd>15</dd></div>
      <div className="is-emphasized"><dt>Retained variables</dt><dd>13</dd></div>
      <div><dt>Excluded variables</dt><dd>2</dd></div>
    </dl>
  </Panel>
  <section className="research-panel dataset-ready mt-4 rounded-md border bg-panel" aria-labelledby="analysis-ready-dataset">
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="analysis-ready-dataset" className="text-base font-semibold text-teal-800">Analysis-Ready Study-Entry Dataset</h2>
        <span className="research-badge is-valid dataset-ready-badge">Ready</span>
      </div>
      <p className="mt-2 text-xl font-semibold tracking-tight">2,437 participants × 13 retained variables</p>
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
        <span>15 candidate variables → 13 retained variables</span>
        <span>2 variables excluded for &gt;20% missingness</span>
      </div>
      <p className="mt-2 text-xs text-muted">Median imputation and z-score standardization are applied before analysis.</p>
    </div>
    <Link to="/study-findings" className="research-primary-button shrink-0">Continue to Study Findings</Link>
  </section>
</>;
