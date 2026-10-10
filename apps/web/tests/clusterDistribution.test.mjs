import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const bundle = await build({ absWorkingDir: root, stdin: {
  contents: 'export { ClusterDistribution } from "./apps/web/src/components/SopComparison"; export { SimulationResults } from "./apps/web/src/pages/SimulationRunsPage";', resolveDir: root
}, bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external', jsx: 'automatic', loader: { '.css': 'empty' }, define: { 'import.meta.env.VITE_API_URL': 'undefined' } });
const require = createRequire(import.meta.url), module = { exports: {} };
vm.runInThisContext(`(function(require,module,exports){${bundle.outputFiles[0].text}\n})`)(require, module, module.exports);
const { ClusterDistribution, SimulationResults } = module.exports;
const render = props => renderToStaticMarkup(React.createElement(ClusterDistribution, props));
let html = render({ title: 'Standard K-Means', participants: 100, sizes: [37, 63], metadata: 'Seed 4' });
assert.match(html, /Seed 4/);
assert.match(html, /class="sop-cluster-count">37/);
assert.match(html, /participants · 37.00%/);
assert.match(html, /width:37%/);
assert.match(html, /participants · 63.00%/);
assert.doesNotMatch(html, /impairment|distribution unavailable/,'no invented interpretations');
html = render({ title: 'Enhanced K-Means', participants: 100, sizes: [37, 63], interpretations: ['Lower impairment', 'Higher impairment'] });
assert.match(html, /Lower impairment/); assert.match(html, /Higher impairment/);
html = render({ title: 'Standard K-Means', participants: 100, unavailableMessage: 'Required shared provenance is missing or mismatched.' });
assert.match(html, /Standard distribution unavailable/);
assert.doesNotMatch(html, /sop-cluster-count|sop-distribution-track/);

// Render existing saved comparison output read-only; do not execute analysis.
const cache = new URL('../../api/private/simulation-runs/', import.meta.url);
const result = readdirSync(cache).filter(name => /^runtime-v2-1-.*\.json$/.test(name))
  .map(name => JSON.parse(readFileSync(new URL(name, cache), 'utf8')).state)
  .find(state => state?.status === 'complete' && state.result)?.result;
assert.ok(result, 'saved comparison result available for regression verification');
html = renderToStaticMarkup(React.createElement(SimulationResults, { result }));
assert.match(html, /sop-distribution-grid is-comparison/);
const selected = result.analysis.existing.runs.find(row => row.seed === 0) ?? result.analysis.existing.runs[0];
for (const [method, sizes, participants] of [
  ['Standard', selected.clusterSizes, result.analysis.existing.participantCount],
  ['Enhanced', result.analysis.enhanced.clusterSizes, result.analysis.enhanced.participantCount]
]) {
  const panel = html.match(new RegExp(`<section class="sop-distribution" aria-label="${method} K-Means cluster distribution">([\\s\\S]*?)</section>`))?.[1];
  assert.ok(panel);
  assert.equal((panel.match(/class="sop-cluster"/g) ?? []).length, sizes.length);
  for (const size of sizes) {
    assert.ok(panel.includes(size.toLocaleString('en-US')));
    assert.ok(panel.includes(`${(100 * size / participants).toFixed(2)}%`));
    assert.ok(panel.includes(`width:${100 * size / participants}%`));
  }
  if (method === 'Standard') assert.ok(panel.includes(`Seed ${selected.seed}`));
}
assert.match(html, /Cluster labels are method-specific/);
console.log('PASS shared distribution cards, dynamic counts/percentages/bars, optional interpretations, unavailable state, and saved comparison result/seed bindings');
