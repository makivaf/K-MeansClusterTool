import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
const root = fileURLToPath(new URL("../../../", import.meta.url));
const bundle = await build({ absWorkingDir: root, stdin: { contents: 'export { NbClustComparison, NbClustSummary } from "./apps/web/src/components/NbClustComparison"; export { SimulationResults } from "./apps/web/src/pages/SimulationRunsPage";', resolveDir: root }, bundle: true, write: false, platform: "node", format: "cjs", packages: "external", jsx: "automatic", loader: { ".css": "empty" }, define: { "import.meta.env.VITE_API_URL": "undefined" } });
const module = { exports: {} };
vm.runInThisContext(`(function(require,module,exports){${bundle.outputFiles[0].text}\n})`)(createRequire(import.meta.url), module, module.exports);
const { NbClustComparison, NbClustSummary } = module.exports;
const props = { candidateK: [2,3,4], selectedK: 3, usableIndices: 7, votes: [{k:2,count:1},{k:3,count:4},{k:4,count:2}], indices: [{index:"CH",status:"success",recommendedK:3},{index:"Unknown",status:"failed",recommendedK:null}], standard: React.createElement("p",null,"Standard silhouette evidence") };
const render = p => renderToStaticMarkup(React.createElement(NbClustComparison,p));
const snapshot = JSON.stringify(props.votes);
const html = render(props);
for (const text of ["Standard silhouette evidence", "Candidate k", "NbClust Votes", "supported k = 3", "Vote Summary", "Highest vote count", "Selected k", "View NbClust Index Details", "Hide NbClust Index Details", "What it assesses", "Favorable / selection rule", "Suggested k", "Reference unavailable"]) assert.ok(html.includes(text),text);
assert.ok(html.indexOf("NbClust Votes") < html.indexOf("supported k = 3"));
assert.ok(html.indexOf("supported k = 3") < html.indexOf("Vote Summary"));
assert.ok(html.indexOf("Selected k") < html.indexOf("<details"));
assert.match(html, /<details class="nbclust-index-details">/); // Native keyboard-accessible, initially collapsed.
assert.match(render({...props,votes:[{k:2,count:4},{k:3,count:4},{k:4,count:0}]}), /tied across k = 2, 3/);
assert.match(render({...props,votes:[{k:3,count:4}]}), /Missing vote counts are unavailable, not zero/);
assert.doesNotMatch(render({...props,votes:[{k:3,count:4}]}), /largest number/);
assert.doesNotMatch(render({...props,standardOnly:true}), /NbClust Votes|nbclust-index-details/);
assert.match(render({...props,indices:[]}), /Per-index results are unavailable/);
assert.equal(JSON.stringify(props.votes),snapshot);
// Inspect the actual chart props: absent counts remain undefined, never zero-filled.
const tree = NbClustSummary({...props,votes:[{k:3,count:4}]});
const chart = tree.props.children.find(child => React.isValidElement(child) && child.props.votes);
assert.deepEqual(chart.props.votes,[{k:2,count:undefined},{k:3,count:4},{k:4,count:undefined}]);
assert.equal(chart.props.selectedK,3);
console.log("PASS shared NbClust layout, actual data, ties, missing counts, native disclosure, and Standard-only gating");

const simulation = { metadata: {}, comparison: [], analysis: {
  existing: { runs: [{ seed: 0, clusterSizes: [50,50] }], participantCount: 100, selectedK: 2 },
  enhanced: { retainedVariables: [], pcaComponents: 2, cumulativeExplainedVariance: 0.9, pcaVariance: [],
    nbclust: { indices: props.indices, votes: props.votes }, dpc: { centers: [], centroidCount: 3 }, participantCount: 100, selectedK: 3, clusterSizes: [30,30,40] }
} };
const found = [];
function walk(node) {
  if (Array.isArray(node)) return node.forEach(walk);
  if (!React.isValidElement(node)) return;
  if (node.type === NbClustComparison) found.push(node);
  walk(node.props.children);
}
walk(module.exports.SimulationResults({result:simulation}));
assert.equal(found.length,1);
assert.equal(found[0].props.votes,simulation.analysis.enhanced.nbclust.votes);
assert.equal(found[0].props.indices,simulation.analysis.enhanced.nbclust.indices);
assert.equal(found[0].props.selectedK,3);
assert.equal(found[0].props.usableIndices,1);
assert.deepEqual(found[0].props.candidateK,[2,3,4,5,6,7,8,9,10]);
console.log("PASS completed K-Means Comparison uses shared evidence with unchanged result bindings");
const standardHtml = renderToStaticMarkup(found[0].props.standard);
assert.ok(standardHtml.indexOf('Silhouette by k') < standardHtml.indexOf('Selection Summary'));
assert.ok(standardHtml.indexOf('Candidate-k scores unavailable') < standardHtml.indexOf('Selection Summary'));
assert.ok(standardHtml.indexOf('Selection Summary') < standardHtml.indexOf('Selected k'));
assert.equal((standardHtml.match(/<dt>Selected k<\/dt>/g) ?? []).length, 1);
assert.match(standardHtml, /<dt>Selected k<\/dt><dd>2<\/dd>/);
// A populated chart and a different selected k must keep the same ordering.
simulation.analysis.existing.selectedK = 4;
simulation.analysis.existing.silhouetteByK = [{ k: 2, silhouette: 0.2 }, { k: 4, silhouette: 0.4 }];
found.length = 0;
walk(module.exports.SimulationResults({ result: simulation }));
const withChart = renderToStaticMarkup(found[0].props.standard);
assert.doesNotMatch(withChart, /Candidate-k scores unavailable/);
assert.ok(withChart.indexOf('Silhouette by k') < withChart.indexOf('Selection Summary'));
assert.ok(withChart.indexOf('Selection Summary') < withChart.indexOf('Selected k'));
assert.match(withChart, /<dt>Selected k<\/dt><dd>4<\/dd>/);
console.log('PASS Standard selection summary follows available/unavailable Silhouette evidence and preserves dynamic selected k');
