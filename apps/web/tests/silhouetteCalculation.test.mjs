import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const bundle = await build({ absWorkingDir: root, entryPoints: ["apps/web/src/components/SilhouetteCalculationCard.tsx"], bundle: true,
  write: false, platform: "node", format: "cjs", packages: "external", loader: { ".css": "empty" } });
const require = createRequire(import.meta.url), module = { exports: {} };
let state = [], cursor = 0, dependencies, pendingEffect;
const hookHost = { ...React,
  useState(initial) { const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], value => { state[i] = typeof value === "function" ? value(state[i]) : value; }]; },
  useEffect(effect, deps) { if (!dependencies || deps.some((value, i) => value !== dependencies[i])) { pendingEffect = effect; dependencies = deps; } }
};
vm.runInThisContext(`(function(require,module,exports){${bundle.outputFiles[0].text}\n})`)(name => name === "react" ? hookHost : require(name), module, module.exports);
const { SilhouetteCalculationCard: Card, SilhouetteParticipantTable: Table } = module.exports;
const children = node => {
  const found = [];
  function walk(value) {
    if (Array.isArray(value)) return value.forEach(walk);
    if (!React.isValidElement(value)) return;
    found.push(value); walk(value.props.children);
  }
  walk(node); return found;
};
let props;
const renderTable = () => {
  cursor = 0; let tree = Table(props);
  if (pendingEffect) { const effect = pendingEffect; pendingEffect = undefined; effect(); cursor = 0; tree = Table(props); }
  return tree;
};
const click = (tree, label) => {
  const button = children(tree).find(node => node.type === "button" && node.props.children === label);
  assert.ok(button, label); assert.ok(!button.props.disabled, `${label} enabled`); button.props.onClick();
};
const tableRows = tree => {
  const body = children(tree).find(node => node.type === "tbody");
  return React.Children.toArray(body.props.children).map(row => React.Children.toArray(row.props.children).map(cell => cell.props.children));
};
// Synthetic UI fixtures only: no analytical execution or production mock data.
const records = Array.from({ length: 23 }, (_, i) => ({ rid: String(1000 + i), cluster: i % 2, a: i + 0.1234567, b: i + 0.7654321, s: i / 100 }));
props = { rows: [...records].reverse(), n: records.length };
const snapshot = JSON.stringify(props.rows);
let tree = renderTable(), visited = [];
for (let page = 1; page <= 3; page++) {
  const rows = tableRows(tree); visited.push(...rows.map(row => row[0]));
  assert.equal(rows.length, page === 3 ? 3 : 10);
  for (const row of rows) {
    const source = records.find(record => record.rid === row[0]);
    assert.deepEqual(row.slice(1), [String(source.cluster), source.a.toFixed(6), source.b.toFixed(6), source.s.toFixed(6)]);
  }
  if (page < 3) { click(tree, "Next"); tree = renderTable(); }
}
assert.deepEqual(visited, records.map(row => row.rid));
assert.equal(new Set(visited).size, records.length);
assert.ok(children(tree).find(node => node.type === "button" && node.props.children === "Next").props.disabled);
assert.match(renderToStaticMarkup(tree), /Showing 21–23 of 23 participants/);
click(tree, "Previous"); tree = renderTable(); assert.match(renderToStaticMarkup(tree), /Showing 11–20/);
click(tree, "1"); tree = renderTable(); assert.ok(children(tree).find(node => node.type === "button" && node.props.children === "Previous").props.disabled);
click(tree, 3); tree = renderTable(); assert.match(renderToStaticMarkup(tree), /Showing 21–23/);
const sortButton = children(tree).find(node => node.type === "button" && React.Children.toArray(node.props.children)[0] === "Participant Silhouette value, s(i)");
sortButton.props.onClick(); tree = renderTable();
assert.equal(tableRows(tree)[0][0], "1000"); assert.match(renderToStaticMarkup(tree), /Showing 1–10/);
children(tree).find(node => node.type === "button" && React.Children.toArray(node.props.children)[0] === "Participant Silhouette value, s(i)").props.onClick();
tree = renderTable(); assert.equal(tableRows(tree)[0][0], "1022");
assert.equal(JSON.stringify(props.rows), snapshot, "sorting never changes source rows");
props = { ...props, rows: records }; tree = renderTable();
assert.equal(tableRows(tree)[0][0], "1000"); assert.match(renderToStaticMarkup(tree), /aria-sort="ascending"/);
const full = Array.from({ length: 2437 }, (_, i) => ({ rid: String(2000 + i), cluster: 0, a: 1, b: 2, s: 0.5 }));
props = { rows: full, n: full.length }; tree = renderTable(); click(tree, 244); tree = renderTable();
assert.equal(tableRows(tree).length, 7); assert.match(renderToStaticMarkup(tree), /Showing 2,431–2,437 of 2,437 participants/);
const calculation = { n: 23, k: 2, representation: "13 standardized features", seed: 4, exampleParticipant: { rid: "example-only", cluster: 1, a: 1, b: 2, s: 0.5 } };
const cardProps = { n: 23, k: 2, method: "Standard K-Means", representation: "13 standardized features", calculation, runCount: 30, value: "0.234567" };
const renderCard = p => renderToStaticMarkup(React.createElement(Card, p));
const unavailable = renderCard(cardProps);
assert.match(unavailable, /Representative values cannot populate this table/); assert.doesNotMatch(unavailable, /example-only|Showing|Previous|<details/);
assert.match(unavailable, /30-run aggregate/); assert.match(unavailable, /stored seed 4/); assert.match(unavailable, /<dd>0\.234567<\/dd>/);
for (const label of ["Participants (N)", "Clusters (K)", "Method", "Representation", "Evaluation Space"]) assert.ok(unavailable.includes(label));
assert.match(renderCard({ ...cardProps, participants: records.slice(0, 10) }), /Representative values cannot/);
assert.match(renderCard({ ...cardProps, participants: records.map(() => records[0]) }), /Representative values cannot/);
assert.match(renderCard({ ...cardProps, participants: records, calculation: { ...calculation, seed: undefined } }), /Representative values cannot/);
assert.match(renderCard({ ...cardProps, participants: records, n: 24 }), /Representative values cannot/);
assert.ok(children(Card({ ...cardProps, participants: records })).some(node => node.type === Table), "complete identified-run evidence enables the table");
assert.match(renderCard({ ...cardProps, calculation: undefined }), /Evaluation Space<\/dt><dd>Unavailable/);
console.log("PASS complete-run evidence gating; source values/precision; all pages without loss/duplication; sort, reset, first/last/previous/next controls; 2,437-record last page; unchanged aggregate and metadata");
