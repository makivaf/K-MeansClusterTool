import { Link } from "react-router-dom";
import { Panel } from "./ui/Panel";
import audit from "../data/datasetMissingness.json";
import { formatNumber } from "../utils/formatNumber";

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

const names: Record<string, string> = { ADAS13: "ADAS-Cog 13", LMI: "Logical Memory Immediate", LMD: "Logical Memory Delayed", TMT_A: "Trail Making Test A", TMT_B: "Trail Making Test B", CATEGORY_FLUENCY_ANIMALS: "Animal Fluency", BNT: "Boston Naming Test", CDRSB: "CDR-SB", NPIQ: "NPI-Q", RAVLT_IMMEDIATE: "RAVLT Immediate", RAVLT_DELAYED: "RAVLT Delayed", RAVLT_FORGETTING: "RAVLT Forgetting" };
const rows = audit.rows.map(row => ({ ...row, label: names[row.variable] ?? row.variable }));
const total = rows[0].total, threshold = rows[0].threshold;
const excluded = rows.filter(row => row.excluded).length;
const x = (percent: number) => 240 + percent * 5;
export const StudyEntrySummary = () => <>
  <section className="research-panel dataset-cohort rounded-md border border-line bg-panel" aria-labelledby="study-entry-cohort">
    <div><h2 id="study-entry-cohort" className="text-base font-semibold text-teal-800">Study-Entry Cohort</h2><p className="mt-1 text-xs text-muted">Eligible participants retained for preprocessing.</p></div>
    <dl className="dataset-stats dataset-phase-stats">{[["participants", total], ["candidate variables", rows.length], ["retained", rows.length - excluded], ["excluded", excluded]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{formatNumber(Number(value), "count")}</dd></div>)}</dl>
  </section>
  <Panel title="Missingness Screening" variant="surface" className="dataset-screening mt-4">
    <p className="mb-4 text-xs text-muted">Variables above the {formatNumber(threshold, "count")}% missingness threshold are excluded.</p>
    <svg className="dataset-missingness-chart" viewBox={`0 0 800 ${rows.length * 28 + 40}`} role="img" aria-label="Percent missing by candidate variable">
      <line x1={x(threshold)} x2={x(threshold)} y1={24} y2={rows.length * 28 + 24} stroke="var(--research-comparison)" strokeDasharray="4 4" />
      <text x={x(threshold) + 5} y={14}>{formatNumber(threshold, "count")}% threshold</text>
      {rows.map((row, i) => <g key={row.variable}><title>{`${row.label}: ${formatNumber(row.percent, "percentage")} missing, ${row.excluded ? "Excluded" : "Retained"}`}</title>
        <text x={230} y={i * 28 + 43} textAnchor="end">{row.label}</text><rect x={240} y={i * 28 + 28} width={row.percent * 5} height={20} rx={3} fill={row.excluded ? "var(--research-comparison)" : "var(--research-slate, #64748B)"} />
        <text x={x(row.percent) + 6} y={i * 28 + 43}>{formatNumber(row.percent, "percentage")}</text></g>)}
    </svg>
    <details><summary className="research-text-action">Show counts</summary>
      <div className="dataset-audit overflow-x-auto" role="region" aria-label="Variable Missingness Audit" tabIndex={0}><table className="research-table">
        <caption className="pb-2 text-left text-xs font-semibold text-ink">Variable Missingness Audit</caption>
        <thead><tr>{["Variable", "Non-missing records", "Missing records", "Total records", "Missingness %", "Decision"].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
        <tbody>{rows.map(row => <tr key={row.variable} className={row.excluded ? "is-excluded" : undefined}><th scope="row">{row.label}</th><td>{formatNumber(row.observed, "count")}</td><td>{formatNumber(row.missing, "count")}</td><td>{formatNumber(row.total, "count")}</td><td>{formatNumber(row.percent, "percentage")}</td><td><span className={`research-badge dataset-decision ${row.excluded ? "is-excluded" : "is-valid"}`}>{row.excluded ? "Excluded" : "Retained"}</span></td></tr>)}</tbody>
      </table></div>
    </details>
    <dl className="dataset-stats dataset-screening-stats mt-4"><div><dt>Candidate variables</dt><dd>{formatNumber(rows.length, "count")}</dd></div><div className="is-emphasized"><dt>Retained variables</dt><dd>{formatNumber(rows.length - excluded, "count")}</dd></div><div><dt>Excluded variables</dt><dd>{formatNumber(excluded, "count")}</dd></div></dl>
  </Panel>
  <section className="research-panel dataset-ready mt-4 rounded-md border bg-panel" aria-labelledby="analysis-ready-dataset"><div className="flex flex-wrap items-center gap-3"><h2 id="analysis-ready-dataset" className="text-base font-semibold text-teal-800">Study-Entry Dataset</h2><span className="research-badge is-valid dataset-ready-badge">Ready</span></div><Link to="/study-findings" className="research-primary-button shrink-0">Continue to Study Findings</Link></section>
</>;
