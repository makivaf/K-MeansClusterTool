import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const webSource = path.join(repositoryRoot, "apps", "web", "src");
const read = (relative: string) => fs.readFileSync(path.join(webSource, relative), "utf8");
const app = read("App.tsx");
const shell = read("components/layout/AppShell.tsx");
const hook = read("hooks/useRunData.ts");
const baseline = read("pages/BaselineVsEnhancedPage.tsx");
const enhanced = read("pages/EnhancedKMeansPage.tsx");
const clusters = read("pages/ClustersPage.tsx");
const pcaScatter = read("components/charts/PcaClusterScatter.tsx");
const longitudinal = read("pages/LongitudinalProgressionPage.tsx");
const longitudinalChart = read("components/charts/LongitudinalProgressionChart.tsx");
const upload = read("pages/UploadAndCluster.tsx");

const requiredRoutes = [
  "/overview",
  "/enhanced-kmeans",
  "/clusters",
  "/baseline-vs-enhanced",
  "/longitudinal"
];
for (const route of requiredRoutes) if (!app.includes(`path=\"${route}\"`)) throw new Error(`Unified route missing: ${route}`);
for (const label of ["Overview", "Enhanced K-Means", "Cluster Results", "Baseline vs Enhanced", "Longitudinal Progression", "Run Analysis"]) if (!shell.includes(label)) throw new Error(`Primary navigation label missing: ${label}`);
if (shell.includes('label: "Data Preparation"') || shell.includes('label: "Validation / Limitations"')) throw new Error("Secondary content remains in primary navigation");
if (!enhanced.includes('id="data-preparation"') || !enhanced.includes("NbClust index voting")) throw new Error("Data preparation or NbClust terminology was not integrated into Enhanced K-Means");
if (!enhanced.includes("PCA-based dimensionality reduction") || !enhanced.includes("Density Peaks-based initialization") || !enhanced.includes("final Lloyd K-Means clustering")) throw new Error("Enhanced K-Means subtitle wording is incomplete");
if (!enhanced.includes("received the highest number of votes") || /majority rule/i.test(enhanced)) throw new Error("Active NbClust result wording is invalid");
if (!enhanced.includes("Two Density Peaks-derived candidates were selected as the initial centroids for the final K-Means run.")) throw new Error("Density Peaks initialization wording is invalid");
if (!read("pages/OverviewPage.tsx").includes("met the ≥3-observation rule") || !read("pages/OverviewPage.tsx").includes("also met the ≥12-month follow-up rule")) throw new Error("Longitudinal eligibility wording is invalid");
if (!clusters.includes('title="Cluster Results"')) throw new Error("Cluster Results terminology was not applied");
if (shell.indexOf('to="/upload-run"') > shell.indexOf("navItems.map")) throw new Error("Run Analysis is not the first prominent desktop sidebar action");
if (!shell.includes("Seven-file unified pipeline") || !shell.includes("bg-teal-700")) throw new Error("Run Analysis is missing its unified primary-action treatment");
if (/Axis A|Axis B|selectedAxis/.test(`${app}\n${shell}\n${hook}\n${upload}`)) throw new Error("Active navigation or run workflow still exposes the legacy Axis model");
console.log("PASS frontend contract: unified routes and run selection contain no Axis navigation");

if (!clusters.includes("<PcaClusterScatter />") || !pcaScatter.includes('src="/pca-cluster-scatter.png"')) throw new Error("Cluster Results is missing the PCA cluster visualization");
for (const copy of ["PC1", "PC2", "2,437", "1,553", "884", "full six-dimensional PCA space"]) {
  if (!pcaScatter.includes(copy)) throw new Error(`PCA scatter accessibility or dimensionality copy is missing: ${copy}`);
}
const scatterImage = fs.readFileSync(path.join(repositoryRoot, "apps", "web", "public", "pca-cluster-scatter.png"));
if (scatterImage.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" || scatterImage.readUInt32BE(16) !== 1600 || scatterImage.readUInt32BE(20) !== 900) {
  throw new Error("PCA scatter raster is missing or has unexpected dimensions");
}
console.log("PASS frontend contract: prominent unified Run Analysis action and aggregate-safe PCA cluster raster are present");

for (const direction of ["Higher is better", "Lower is better"]) if (!baseline.includes(direction)) throw new Error(`Metric direction copy missing: ${direction}`);
if (!baseline.includes('title="Defined Baseline K-Means"') || !baseline.includes("NbClust index voting") || /Standard K-Means|NbClust majority rule/.test(baseline)) throw new Error("Baseline comparison terminology is invalid");
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
if (!longitudinal.includes("prediction, diagnosis, or causation")) throw new Error("Longitudinal interpretation caution is missing");
if (/pValue\s*[<>]=?|estimate\s*\+/.test(longitudinal)) throw new Error("React appears to recalculate inferential statistics");
if (!longitudinal.includes('id="validation-limitations"')) throw new Error("Validation and limitations were not preserved as progressive disclosure");
if (!longitudinalChart.includes("Scatter") || longitudinalChart.includes("<Line ") || !longitudinalChart.includes("participantCount") || !longitudinalChart.includes("observationCount")) throw new Error("Longitudinal chart must use unconnected descriptive points with support counts");
if (!hook.includes("requestedRunId") || !hook.includes("setSelectedRunId(requestedRunId)")) throw new Error("URL-linked refresh could select a different run");
if (!shell.includes("Loading unified research run") || !shell.includes("No validated unified aggregate")) throw new Error("Loading or empty states are missing");
console.log("PASS frontend contract: original-cluster linkage, aggregate-only inference rendering, refresh selection, loading, and empty states are explicit");
