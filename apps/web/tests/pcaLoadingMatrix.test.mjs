import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const bundle = await build({ absWorkingDir: root, stdin: { contents: 'export * from "./apps/web/src/components/PcaLoadingMatrix"; export * from "./apps/web/src/utils/pcaLoadings"; export { SimulationResults } from "./apps/web/src/pages/SimulationRunsPage";', resolveDir: root }, bundle: true, write: false, platform: "node", format: "cjs", packages: "external", jsx: "automatic", loader: { ".css": "empty" }, define: { "import.meta.env.VITE_API_URL": "undefined" } });
const module = { exports: {} };
vm.runInThisContext(`(function(require,module,exports){${bundle.outputFiles[0].text}\n})`)(createRequire(import.meta.url), module, module.exports);
const { PcaLoadingMatrix, topLoadingRows, readPcaLoadings, SimulationResults } = module.exports;
// Synthetic test fixtures only; production receives no fabricated loadings.
const variables = Array.from({ length: 13 }, (_, index) => `Variable_${index + 1}`);
const components = Array.from({ length: 7 }, (_, index) => `PC${index + 1}`);
const values = variables.map((_, row) => components.map((_, column) => column === 6 ? 100 : (row - column - 5) / 20));
const evidence = { variables, components, values };
assert.equal(readPcaLoadings({}, variables, 6), undefined);
assert.equal(readPcaLoadings({ pcaLoadings: { ...evidence, variables: variables.slice(1) } }, variables, 6), undefined);
assert.equal(readPcaLoadings({ pcaLoadings: { ...evidence, components: [...components].reverse() } }, variables, 6), undefined);
assert.equal(readPcaLoadings({ pcaLoadings: { ...evidence, values: [[NaN]] } }, variables, 6), undefined);
assert.deepEqual(readPcaLoadings({ pcaLoadings: evidence }, variables, 6), evidence);
assert.deepEqual(topLoadingRows([[-0.9], [0.3], [-0.8], [0.7]], 0), [0, 2, 3]);
assert.deepEqual(topLoadingRows([[0.5], [-0.5], [0.5], [0.5]], 0), [0, 1, 2]);
const render = props => renderToStaticMarkup(React.createElement(PcaLoadingMatrix, props));
const placeholder = render({ variables, components: components.slice(0, 6) });
assert.equal((placeholder.match(/scope="row"/g) ?? []).length, 13);
assert.equal((placeholder.match(/scope="col"/g) ?? []).length, 7);
assert.equal((placeholder.match(/class="is-placeholder"/g) ?? []).length, 78);
assert.equal((placeholder.match(/>\u2014<\/td>/g) ?? []).length, 78);
assert.doesNotMatch(placeholder, /color-mix|is-strongest|top 3|Strong negative|[+-]\d+\.\d{6}/);
assert.match(placeholder, /Loading values will appear when PCA loading data is available\./);
assert.equal(render({ variables, components: components.slice(0, 6), values: [[1]] }), placeholder);
const html = render({ variables, components: components.slice(0, 6), values });
assert.equal((html.match(/scope="row"/g) ?? []).length, 13);
assert.equal((html.match(/scope="col"/g) ?? []).length, 7);
assert.equal((html.match(/class="is-strongest"/g) ?? []).length, 18);
assert.doesNotMatch(html, /PC7|100\.000000/);
assert.match(html, /\+0\.350000/); assert.match(html, /-0\.500000/);
assert.match(html, /--research-comparison/); assert.match(html, /--research-primary/);
assert.match(html, /pca-loading-scroll/); assert.match(html, /open=""/);
assert.match(html, /Show Loading Matrix/); assert.match(html, /Hide Loading Matrix/);
assert.doesNotMatch(render({ variables, components: components.slice(0, 6), values, defaultExpanded: false }), /open=""/);
const rows = [...html.matchAll(/<tr><th scope="row">[\s\S]*?<\/tr>/g)].map(match => [...match[0].matchAll(/<td([^>]*)>/g)].map(cell => cell[1]));
for (let column = 0; column < 6; column++) {
  assert.deepEqual(rows.flatMap((cells, row) => cells[column].includes('class="is-strongest"') ? [row] : []), topLoadingRows(values, column).sort((a, b) => a - b));
}
assert.deepEqual(values, evidence.values);
// Inspect the actual completed K-Means Comparison render tree. Only the
// Enhanced payload supplies loadings; no scientific execution is performed.
const simulation = { metadata: {}, comparison: [], analysis: {
  existing: { runs: [{ seed: 0, clusterSizes: [50, 50] }], participantCount: 100, selectedK: 2 },
  enhanced: { retainedVariables: variables, pcaComponents: 6, cumulativeExplainedVariance: 0.9,
    pcaVariance: [], nbclust: { indices: [], votes: [] }, dpc: { centers: [], centroidCount: 2 },
    participantCount: 100, selectedK: 2, clusterSizes: [50, 50], pcaLoadings: evidence }
} };
const findMatrix = tree => {
  const found = [];
  function walk(node) {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!React.isValidElement(node)) return;
    if (node.type === PcaLoadingMatrix) found.push(node);
    walk(node.props.children);
  }
  walk(tree); return found;
};
const matrices = findMatrix(SimulationResults({ result: simulation }));
assert.equal(matrices.length, 1);
assert.deepEqual(matrices[0].props.values, evidence.values);
assert.deepEqual(matrices[0].props.components, components.slice(0, 6));
assert.match(renderToStaticMarkup(matrices[0]), /Principal Components — Loading Matrix/);
delete simulation.analysis.enhanced.pcaLoadings;
const placeholders = findMatrix(SimulationResults({ result: simulation }));
assert.equal(placeholders.length, 1);
assert.equal(placeholders[0].props.values, undefined);
assert.match(renderToStaticMarkup(placeholders[0]), /Loading values will appear when PCA loading data is available/);
console.log("PASS completed K-Means Comparison reuses the shared matrix with supplied Enhanced evidence and shows placeholders when absent");
console.log("PASS missing/malformed evidence renders neutral placeholders, 13 rows, retained-only columns, signed precision, per-PC absolute rankings and ties, diverging colors, native disclosure markup");
