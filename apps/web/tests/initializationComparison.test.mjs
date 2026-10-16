import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const bundle = await build({ absWorkingDir: root, stdin: { contents: `
  export { InitializationComparison, AriChart, PartitionFrequencyChart } from "./apps/web/src/components/InitializationComparison";
  export { DpcCenterTable } from "./apps/web/src/components/DpcCenterTable";
  export { SimulationResults } from "./apps/web/src/pages/SimulationRunsPage";
`, resolveDir: root }, bundle: true, write: false, platform: "node", format: "cjs", packages: "external",
  jsx: "automatic", loader: { ".css": "empty" }, define: { "import.meta.env.VITE_API_URL": "undefined" } });
const module = { exports: {} };
vm.runInThisContext(`(function(require,module,exports){${bundle.outputFiles[0].text}\n})`)(createRequire(import.meta.url), module, module.exports);
const { InitializationComparison, AriChart, PartitionFrequencyChart, DpcCenterTable, SimulationResults } = module.exports;
const center = { center: 1, candidateId: "candidate-A", rho: 12, delta: 2.1234567, gamma: 25.4814804 };
const props = { selectedCenters: 1,
  centerTable: React.createElement(DpcCenterTable, { centers: [center] }), decisionGraph: React.createElement("p", null, "Existing DPC calculation details") };
const render = p => renderToStaticMarkup(React.createElement(InitializationComparison, p));
let html = render(props);
const sections = ["Final Partition Frequency Across Executions", "ARI by Execution", "Initialization &amp; Reproducibility Summary", "Reproducibility Metrics", "DPC Initialization Evidence", "DPC Center-Selection Details"];
for (let i = 1; i < sections.length; i++) assert.ok(html.indexOf(sections[i - 1]) < html.indexOf(sections[i]));
assert.equal((html.match(/class="sop3-chart is-unavailable"/g) ?? []).length, 4);
const caption = "ARI = 1 indicates identical participant groupings, regardless of cluster labels. Each run is compared with its method&#x27;s modal partition.";
assert.equal(html.split(caption).length - 1, 1);
assert.match(html, /ARI by Random Seed/);
assert.match(html, /ARI by DPC Execution/);
assert.doesNotMatch(html, /Pairwise ARI summarizes agreement|The charts separately compare/);
assert.match(html, /<details class="sop3-metrics sop3-disclosure">/);
assert.doesNotMatch(html, /<details[^>]*\bopen\b/);
assert.match(html, /candidate-A/); assert.match(html, /2\.12346/); assert.match(html, /25\.48148/);
assert.match(html, /Existing DPC calculation details/);
for (const metric of ["Executions", "Pairwise ARI Comparisons", "Unique Final Partitions", "Modal Partition Frequency", "Minimum Pairwise ARI", "Mean Pairwise ARI", "Maximum Differing Participants", "Distinct Initial Centroid Sets"]) assert.ok(html.includes(metric));
// Synthetic presentation fixtures test formatting, including legitimate zero,
// without deriving scientific outcomes or importing mock values into production.
const evidence = { executions: 7, pairwiseComparisons: 18, uniqueFinalPartitions: 2, modalPartitionFrequency: 5,
  minimumPairwiseAri: 0.81234567, meanPairwiseAri: 0.92345678, maximumDifferingParticipants: 0, distinctInitialCentroidSets: 6,
  partitionFrequencies: [{ partition: "partition-A", frequency: 5 }, { partition: "partition-B", frequency: 2 }],
  modalPartitionAri: [{ seed: 8, adjustedRandIndex: 0.81234567 }, { seed: 9, adjustedRandIndex: 1 }] };
const snapshot = JSON.stringify(evidence);
html = render({ ...props, standard: evidence, enhanced: { executions: 9 } });
assert.equal((html.match(/class="sop3-chart"/g) ?? []).length, 2);
assert.equal((html.match(/class="sop3-chart is-unavailable"/g) ?? []).length, 2);
const complete = render({ ...props, standard: evidence, enhanced: evidence });
assert.equal((complete.match(/class="sop3-chart"/g) ?? []).length, 4);
assert.doesNotMatch(complete, /sop3-chart is-unavailable/);
for (const rows of [undefined, []]) {
  assert.match(renderToStaticMarkup(React.createElement(PartitionFrequencyChart, { rows })), /sop3-chart is-unavailable/);
  assert.match(renderToStaticMarkup(React.createElement(AriChart, { runs: rows, axisLabel: "Execution", minimum: 0.85 })), /sop3-chart is-unavailable/);
}
assert.match(html, /5 \/ 7/); assert.match(html, /0\.81235/); assert.match(html, /0\.92346/);
assert.match(html, /Maximum Differing Participants<\/th><td>0<\/td><td>Unavailable/);
assert.equal(JSON.stringify(evidence), snapshot);
assert.match(render({ ...props, standard: { modalPartitionFrequency: 5 } }), /Modal Partition Frequency<\/th><td>Unavailable/);
// Inspect chart inputs to verify exact supplied partitions and observations,
// shared axes and the reference line even where SSR has no layout dimensions.
const charts = [];
function walk(node) {
  if (Array.isArray(node)) return node.forEach(walk);
  if (!React.isValidElement(node)) return;
  if (node.type === AriChart || node.type === PartitionFrequencyChart || node.type === InitializationComparison) return walk(node.type(node.props));
  if (node.props.data && node.props.margin) charts.push(node);
  if (node.props.standard) walk(node.props.standard);
  if (node.props.enhanced) walk(node.props.enhanced);
  walk(node.props.children);
}
walk(InitializationComparison({ ...props, standard: evidence, enhanced: { ...evidence, modalPartitionAri: [{ seed: 1, adjustedRandIndex: 0.9 }] } }));
assert.equal(charts.length, 4);
assert.deepEqual(charts[0].props.data, evidence.partitionFrequencies);
assert.deepEqual(charts[2].props.data, evidence.modalPartitionAri);
const childProps = chart => React.Children.toArray(chart.props.children).map(child => child.props);
assert.deepEqual(childProps(charts[2]).find(p => p.domain?.[1] === 1).domain, childProps(charts[3]).find(p => p.domain?.[1] === 1).domain);
for (const chart of charts.slice(2)) assert.ok(childProps(chart).some(p => p.y === 1));
// Each comparison consumes only its current-run counts and centers. The old
// reference ARI and three-run DPC series must never fill the revised charts.
const result = { metadata: {}, comparison: [], analysis: {
  existing: { participantCount: 123, selectedK: 2, runs: [{ seed: 0, clusterSizes: [60, 63] }], ariBySeed: evidence.modalPartitionAri },
  enhanced: { participantCount: 123, selectedK: 2, retainedVariables: [], pcaComponents: 5, cumulativeExplainedVariance: 0.9, pcaVariance: [],
    clusterSizes: [60, 63], nbclust: { indices: [], votes: [] }, dpc: { centroidCount: 1,
      centers: [{ ...center, rid: "9876" }], ariByRun: [{ seed: 1, adjustedRandIndex: 1 }, { seed: 2, adjustedRandIndex: 1 }, { seed: 3, adjustedRandIndex: 1 }] } }
} };
html = renderToStaticMarkup(React.createElement(SimulationResults, { result }));
const sop3 = html.slice(html.indexOf("SOP 3"), html.indexOf("Standard vs Enhanced Comparison"));
assert.match(sop3, /Executions<\/th><td>1<\/td><td>Unavailable/);
assert.match(sop3, /<\/h2><p>Evaluates the consistency of clustering results across repeated executions using random initialization and deterministic Density Peaks Clustering \(DPC\) initialization\.<\/p><\/div>/);
assert.doesNotMatch(sop3, /sop3-methodology|Standard executions:|Enhanced executions:/);
assert.match(sop3, /verified modal-partition ARI is not supplied/);
assert.match(sop3, /verified final-partition frequencies are not supplied/);
assert.match(sop3, /9876/); assert.match(sop3, /2\.12346/);
assert.doesNotMatch(sop3, /3 \/ 3|reference-equivalent partition/);
assert.match(render({ ...props, standardOnly: true }), /Enhanced K-Means/);
assert.match(render({ ...props, standardOnly: true }), /Not run yet/);
assert.doesNotMatch(render({ ...props, standardOnly: true }), /DPC Initialization Evidence/);
console.log("PASS SOP 3 order, formatting, missing fields, exact chart bindings, independent current-run evidence, legacy exclusion, and Standard-only behavior");
