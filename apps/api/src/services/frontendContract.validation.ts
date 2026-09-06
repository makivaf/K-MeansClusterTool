import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { researchPages } from "../../../web/src/components/layout/researchNavigation";
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const read = (relative: string) => fs.readFileSync(path.join(repositoryRoot, "apps/web/src", relative), "utf8");
const app = read("App.tsx");
const shell = read("components/layout/AppShell.tsx");
const upload = read("pages/UploadAndCluster.tsx");
const hook = read("hooks/useRunData.ts");
const overview = read("pages/OverviewPage.tsx");
const clusters = read("pages/ClustersPage.tsx");
const charts = read("components/charts/FinalFindingsCharts.tsx");
const control = read("components/BaselineCandidateControl.tsx");
assert.deepEqual(researchPages.map(({ label }) => label), ["Existing Algorithm", "Enhanced Algorithm", "Summary of Findings", "Run History"]);
for (const page of researchPages) assert.ok(app.includes('path="' + page.path + '"'));
assert.ok(shell.includes("Run Analysis"));
assert.ok(!/Axis A|Axis B|selectedAxis/.test([app, shell, hook, upload, overview, clusters, charts, control].join("\n")));
console.log("PASS frontend contract: redesigned four-page navigation and unified run action preserved");

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


for (const tab of ["pca", "nbclust", "dpc", "fullComparison", "profiles", "longitudinal"]) assert.ok(clusters.includes('id: "' + tab + '"'));
for (const page of [overview, clusters]) assert.ok(page.includes("<BaselineCandidateControl sweep={baselineSweep}"));
assert.ok(!/buildIllustrativePoints|buildSopScatterPoints|Frozen baseline metrics/.test(overview + clusters));
assert.ok(control.includes("selectBaselineCandidate(sweep, k)"));
assert.ok(control.includes("candidate.clusterSizes.map"));
assert.ok(control.includes("candidate.silhouette") && control.includes("candidate.daviesBouldin") && control.includes("candidate.calinskiHarabasz"));
assert.equal((clusters.match(/<FinalNbClustFigure /g) ?? []).length, 1);
assert.ok(!clusters.includes("votes.map"));
assert.ok(charts.includes("data={run.pca.scree}"));
assert.ok(charts.includes("<ReferenceLine y={0.85}"));
assert.ok(charts.includes("<ReferenceDot x={run.pca.components}"));
assert.ok(charts.includes("const selection = run.kSelection"));
assert.ok(!/majority/i.test(charts));
assert.ok(clusters.includes("controlled?.selection") && clusters.includes("Controlled ablation: original-feature NbClust"));
assert.ok(charts.includes("run.initialization.selectedCentroids") && charts.includes("projection is unavailable"));
assert.ok(charts.includes("run.baselineComparison.metrics"));
assert.ok(charts.includes("run.clusterProfiles.smdRanking"));
assert.ok(clusters.includes("data={run.longitudinal.timeSeries}"));
assert.ok(clusters.includes("same study-entry cluster assignments") && clusters.includes("No second longitudinal K-Means"));
assert.ok(!/PTID|RID|participantId|coordinates=/.test(charts + control));
assert.ok(charts.includes("chartPalette") && read("components/charts/LongitudinalProgressionChart.tsx").includes("chartPalette"));
assert.ok(!fs.existsSync(path.join(repositoryRoot, "apps/web/public/pca-cluster-scatter.png")));
console.log("PASS Summary contracts: distinct frozen/controlled sources, shared candidate control, one final vote chart, full PCA threshold curve, aggregate-only figures and fixed longitudinal assignments");
