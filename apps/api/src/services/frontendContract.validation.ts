import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const webSource = path.join(repositoryRoot, "apps", "web", "src");
const read = (relative: string) => fs.readFileSync(path.join(webSource, relative), "utf8");
const app = read("App.tsx");
const shell = read("components/layout/AppShell.tsx");
const navigation = read("components/layout/researchNavigation.ts");
const pageNavigation = read("components/layout/ResearchPageNavigation.tsx");
const hook = read("hooks/useRunData.ts");
const overview = read("pages/OverviewPage.tsx");
const baseline = read("pages/BaselineVsEnhancedPage.tsx");
const enhanced = read("pages/EnhancedKMeansPage.tsx");
const clusters = read("pages/ClustersPage.tsx");
const longitudinal = read("pages/LongitudinalProgressionPage.tsx");
const longitudinalChart = read("components/charts/LongitudinalProgressionChart.tsx");
const upload = read("pages/UploadAndCluster.tsx");

const assertOrdered = (source: string, labels: string[], pageName: string) => {
  let previousIndex = -1;
  for (const label of labels) {
    const currentIndex = source.indexOf(label);
    if (currentIndex <= previousIndex) throw new Error(`${pageName} content hierarchy is invalid at: ${label}`);
    previousIndex = currentIndex;
  }
};

const requiredRoutes = [
  "/overview",
  "/enhanced-kmeans",
  "/cluster-findings",
  "/enhancement-evaluation",
  "/longitudinal-follow-up",
  "/clusters",
  "/baseline-vs-enhanced",
  "/longitudinal"
];
for (const route of requiredRoutes) if (!app.includes(`path=\"${route}\"`)) throw new Error(`Unified route missing: ${route}`);
for (const label of ["Overview", "Enhanced K-Means", "Cluster Findings", "Enhancement Evaluation", "Longitudinal Follow-Up"]) if (!navigation.includes(label)) throw new Error(`Primary navigation label missing: ${label}`);
for (const step of ["01", "02", "03", "04", "05"]) if (!navigation.includes(`step: \"${step}\"`)) throw new Error(`Primary navigation step missing: ${step}`);
if (!shell.includes("Run Analysis")) throw new Error("Primary Run Analysis action is missing");
if (shell.includes('label: "Data Preparation"') || shell.includes('label: "Validation / Limitations"')) throw new Error("Secondary content remains in primary navigation");
if (!enhanced.includes('id="data-preparation"') || !enhanced.includes("NbClust index voting")) throw new Error("Data preparation or NbClust terminology was not integrated into Enhanced K-Means");
if (!enhanced.includes("PCA-based representation") || !enhanced.includes("Density Peaks-based initialization") || !enhanced.includes("final Lloyd K-Means clustering")) throw new Error("Enhanced K-Means method summary wording is incomplete");
if (!enhanced.includes("received the highest number of votes") || /majority rule/i.test(enhanced)) throw new Error("Active NbClust result wording is invalid");
if (!enhanced.includes("Two Density Peaks-derived candidates were selected as the initial centroids for the final K-Means run.")) throw new Error("Density Peaks initialization wording is invalid");
if (!overview.includes("met the ≥3-observation rule") || !overview.includes("also met the ≥12-month follow-up rule")) throw new Error("Longitudinal eligibility wording is invalid");
if (!clusters.includes('title="Cluster Findings"')) throw new Error("Cluster Findings terminology was not applied");
if (!baseline.includes('title="Enhancement Evaluation"')) throw new Error("Enhancement Evaluation terminology was not applied");
if (!longitudinal.includes('title="Longitudinal Follow-Up"')) throw new Error("Longitudinal Follow-Up terminology was not applied");
for (const page of [overview, enhanced, clusters, baseline, longitudinal]) if (!page.includes("<ResearchPageNavigation")) throw new Error("A research page is missing Previous / Next navigation");
if (!pageNavigation.includes("Previous") || !pageNavigation.includes("Next") || !pageNavigation.includes('aria-label="Research page sequence"')) throw new Error("Research page sequence controls are incomplete");
if (shell.indexOf('to="/upload-run"') > shell.indexOf("navItems.map")) throw new Error("Run Analysis is not the first prominent desktop sidebar action");
if (!shell.includes("Seven-file unified pipeline") || !shell.includes("bg-teal-700")) throw new Error("Run Analysis is missing its unified primary-action treatment");
if (/Axis A|Axis B|selectedAxis/.test(`${app}\n${shell}\n${hook}\n${upload}`)) throw new Error("Active navigation or run workflow still exposes the legacy Axis model");
console.log("PASS frontend contract: unified routes and run selection contain no Axis navigation");

for (const dataset of ["ADAS", "CDR", "FAQ", "MMSE", "NEUROBAT", "NPI-Q", "GDSCALE"]) {
  if (!upload.includes(`[\"${dataset}\"`)) throw new Error(`Run Analysis is missing required dataset slot: ${dataset}`);
}
for (const state of ["Missing", "Selected", "Validating", "Valid", "Error"]) {
  if (!upload.includes(`\"${state}\"`)) throw new Error(`Run Analysis is missing file state: ${state}`);
}
for (const stage of [
  "preparing_inputs", "constructing_study_entry_cohort", "preprocessing", "pca", "selecting_k",
  "deterministic_initialization", "enhanced_kmeans", "baseline_comparison", "matching_longitudinal_records",
  "longitudinal_eligibility", "longitudinal_analysis", "aggregate_artifact_validation"
]) if (!upload.includes(`\"${stage}\"`)) throw new Error(`Run Analysis is missing observable stage mapping: ${stage}`);
if (!upload.includes("Uploading and validating inputs") || !upload.includes("No estimated completion time is available")) throw new Error("Run Analysis does not communicate indeterminate validation or long-running work");
if (/completedStages|totalStages|\bpercent(age)?\b|% complete/i.test(upload)) throw new Error("Run Analysis must not derive or display fake percentage progress");
if (!upload.includes("View Overview") || !upload.includes("aggregate result passed the required application contract validation")) throw new Error("Run Analysis completion state is incomplete");
if (!upload.includes("Resume status check") || !upload.includes("sessionStorage") || !upload.includes("RESEARCH_RUN_COMPLETE_EVENT")) throw new Error("Run Analysis lifecycle reconnection or run-selector refresh is missing");
if (!upload.includes('aria-live="polite"') || !upload.includes('aria-label="Frozen research pipeline stages"')) throw new Error("Run Analysis execution updates are not accessible");
if (!upload.includes("Participant-level rows, identifiers, scores, and histories are not displayed") || /CSV preview|raw rows\.map|PTID\s*[:=]/.test(upload)) throw new Error("Run Analysis participant-data protection copy or aggregate-only rendering is invalid");
if (!app.includes("allowWithoutRun") || !shell.includes("allowWithoutRun")) throw new Error("Run Analysis cannot bypass the empty aggregate guard");
console.log("PASS frontend contract: Run Analysis has seven-file validation, real stages, safe lifecycle recovery, and aggregate-only completion UX");

if (fs.existsSync(path.join(repositoryRoot, "apps", "web", "public", "pca-cluster-scatter.png"))) throw new Error("Participant-level PCA scatter remains publicly served");
for (const copy of ["PCA representation and aggregate reporting", "Participant-level PCA coordinates are not displayed", "validated aggregate cognitive-functional profiles", "run.pca.components", "run.pca.cumulativeExplainedVariance", "full six-dimensional PCA space"]) {
  if (!clusters.includes(copy)) throw new Error(`Aggregate-only PCA reporting is incomplete: ${copy}`);
}
if (/PcaClusterScatter|pca-cluster-scatter|PC1|PC2/.test(clusters)) throw new Error("Cluster Findings still references participant-level PCA plotting");
console.log("PASS frontend contract: PCA reporting uses validated aggregate summaries without participant-level coordinates");

for (const direction of ["Higher is better", "Lower is better"]) if (!baseline.includes(direction)) throw new Error(`Metric direction copy missing: ${direction}`);
if (!baseline.includes("Defined Baseline K-Means") || !baseline.includes("NbClust index voting") || /Standard K-Means|NbClust majority rule/.test(baseline)) throw new Error("Baseline comparison terminology is invalid");
if (!baseline.includes("comparison.caution") || !baseline.includes("controlledDpcInitializationComparison")) throw new Error("Baseline page omitted integrated-comparison caution or controlled DPC separation");
if (!baseline.includes("baselineStandardDeviation") || !baseline.includes("baselineMinimum") || !baseline.includes("baselineMaximum")) throw new Error("Baseline run variability is not rendered");
console.log("PASS frontend contract: Baseline vs Enhanced renders direction metadata and DPC caution separately");

if (!longitudinal.includes("original enhanced K-Means clusters") || !longitudinal.includes("No second clustering is performed")) throw new Error("Longitudinal view is not explicitly tied to original clusters");
for (const aggregateField of ["primaryResult", "estimatedAnnualChangeByOriginalCluster", "modelFormula", "participantCount", "observationCount"]) {
  if (!longitudinal.includes(aggregateField)) throw new Error(`Inferential model field is not rendered from the aggregate: ${aggregateField}`);
}
if (!longitudinal.includes("Mean descriptive OLS slope") || !longitudinal.includes("Participant-level descriptive estimate")) throw new Error("Descriptive OLS summaries are not clearly labelled");
if (!longitudinal.includes("Descriptive mean ADAS-Cog13 by elapsed-time bin")) throw new Error("Longitudinal chart title is not explicitly descriptive");
if (!longitudinal.includes("The mixed-effects model indicated a statistically significant difference in annual ADAS-Cog13 change between the two original clusters.")) throw new Error("Primary mixed-effects interpretation wording is missing");
for (const limitation of ["causation", "individual prediction", "clinical diagnosis", "prognosis"]) if (!longitudinal.includes(limitation)) throw new Error(`Longitudinal interpretation caution is missing: ${limitation}`);
if (/pValue\s*[<>]=?|estimate\s*\+/.test(longitudinal)) throw new Error("React appears to recalculate inferential statistics");
if (!longitudinal.includes('id="validation-limitations"')) throw new Error("Validation and limitations were not preserved as progressive disclosure");
if (!longitudinalChart.includes("Scatter") || longitudinalChart.includes("<Line ") || !longitudinalChart.includes("participantCount") || !longitudinalChart.includes("observationCount")) throw new Error("Longitudinal chart must use unconnected descriptive points with support counts");
if (!hook.includes("requestedRunId") || !hook.includes("setSelectedRunId(requestedRunId)")) throw new Error("URL-linked refresh could select a different run");
if (!shell.includes("Loading unified research run") || !shell.includes("No validated unified aggregate")) throw new Error("Loading or empty states are missing");
console.log("PASS frontend contract: original-cluster linkage, aggregate-only inference rendering, refresh selection, loading, and empty states are explicit");

assertOrdered(overview, ["Primary study summary", "Continuous scientific flow", "Core study findings", "Technical pipeline summary"], "Overview");
assertOrdered(enhanced, ["Primary method summary", "1. PCA representation", "2. NbClust selection", "3. DPC initialization", "Final Lloyd K-Means result", "Supporting evidence: NbClust index voting", "Data preparation and PCA details", "Density Peaks seed statistics", "Final clustering convergence details"], "Enhanced K-Means");
assertOrdered(clusters, ["Cluster 0", "algorithmically identified groups", "Simple interpretation", "Strongest observed profile differences", "PCA representation and aggregate reporting", "Full original-scale cognitive-functional profile table"], "Cluster Findings");
assertOrdered(baseline, ["Primary finding", "comparison.metrics.map", "Simple interpretation", "Complete-pipeline attribution limitation", "Secondary evidence: controlled DPC initialization comparison", "Methods and repeated-run diagnostics"], "Enhancement Evaluation");
assertOrdered(longitudinal, ["Primary longitudinal result", "Assignment-preserving continuation", "Auditable cohort flow", "Primary mixed-effects model", "Descriptive participant-level OLS summaries", "Descriptive mean ADAS-Cog13 by elapsed-time bin", "validation-limitations"], "Longitudinal Follow-Up");
console.log("PASS frontend contract: all five research pages preserve the approved finding-to-detail hierarchy");
