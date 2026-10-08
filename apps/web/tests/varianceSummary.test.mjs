import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const bundle = await build({ absWorkingDir: root, stdin: { contents: 'export { VarianceSummary } from "./apps/web/src/components/SopComparison";', resolveDir: root }, bundle: true, write: false, platform: "node", format: "cjs", packages: "external", jsx: "automatic", loader: { ".css": "empty" } });
const require = createRequire(import.meta.url);
let expanded = null;
const module = { exports: {} };
// Exercise the real event handlers with a minimal state host, then render the
// resulting element tree; no browser or scientific execution is needed.
vm.runInThisContext(`(function(require,module,exports){${bundle.outputFiles[0].text}\n})`)(id => id === "react" ? {
  ...React, useId: () => "test-pc", useState: () => [expanded, update => { expanded = typeof update === "function" ? update(expanded) : update; }]
} : require(id), module, module.exports);
const rows = Array.from({ length: 7 }, (_, i) => ({ component: i + 1, eigenvalue: 1.234567, cumulativeVariance: (i + 1) / 7 }));
const loadingData = { variables: ["A", "B", "C", "D"], components: rows.map(row => `PC${row.component}`), values: [[-0.9, 0.1], [0.3, -0.8], [-0.8, 0.7], [0.7, -0.6]].map(row => [...row, 0.1, 0.2, 0.3, 0.4, 0.5]) };
const props = { rows, retained: 6, loadingData };
const tree = () => module.exports.VarianceSummary(props);
const buttons = node => {
  const found = [];
  function walk(value) {
    if (Array.isArray(value)) return value.forEach(walk);
    if (!React.isValidElement(value)) return;
    if (value.type === "button") found.push(value);
    walk(value.props.children);
  }
  walk(node); return found;
};
assert.equal(buttons(tree()).length, 6);
for (let i = 0; i < 6; i++) {
  buttons(tree())[i].props.onClick();
  const html = renderToStaticMarkup(tree());
  assert.equal((html.match(/aria-expanded="true"/g) ?? []).length, 1);
  assert.match(html, new RegExp(`<tr id="test-pc-${i + 1}" class="pca-variance-details">`));
  assert.match(html, /1\.234567/);
  assert.match(html, /PC6 ★/);
  assert.doesNotMatch(html, />PC7/);
  buttons(tree())[i].props.onClick(); assert.equal(expanded, null);
}
buttons(tree())[0].props.onClick();
const first = renderToStaticMarkup(tree()).match(/<tr id="test-pc-1"[\s\S]*?<\/tr>/)[0];
assert.ok(first.indexOf(">A<") < first.indexOf(">C<"));
assert.ok(first.indexOf(">C<") < first.indexOf(">D<"));
assert.doesNotMatch(first, />B</);
assert.match(first, /-0\.900000/); assert.match(first, /\+0\.700000/);
buttons(tree())[1].props.onClick(); assert.equal(expanded, 2);
const empty = renderToStaticMarkup(module.exports.VarianceSummary({ rows, retained: 6 }));
assert.match(empty, /Loading values will appear when PCA loading data is available/);
assert.doesNotMatch(empty, /pca-top-loadings/);
console.log("PASS six PC disclosures, close/switch behavior, signed absolute top-three contributors, retained marker, unchanged precision and neutral missing-data details");

