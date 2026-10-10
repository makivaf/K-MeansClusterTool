import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server.js';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const bundle = await build({ absWorkingDir: root, stdin: {
  contents: 'export { ComparisonRunProgress } from "./apps/web/src/components/ComparisonRunProgress"; export { StudyRunProgressCard } from "./apps/web/src/components/StudyRunProgressCard"; export * from "./apps/web/src/components/methodProgressSteps";', resolveDir: root
}, bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external', jsx: 'automatic', loader: { '.css': 'empty' } });
const require = createRequire(import.meta.url), module = { exports: {} };
vm.runInThisContext(`(function(require,module,exports){${bundle.outputFiles[0].text}\n})`)(require, module, module.exports);
const { ComparisonRunProgress, StudyRunProgressCard, standardProgressSteps, enhancedProgressSteps } = module.exports;
const render = (component, props) => renderToStaticMarkup(React.createElement(StaticRouter, {}, React.createElement(component, props)));
const lane = (html, method) => html.match(new RegExp(`<ol[^>]*aria-label="${method} K-Means analysis progress"[^>]*>([\\s\\S]*?)</ol>`))?.[1];
const active = html => [...html.matchAll(/<li[^>]*aria-current="step"[^>]*>([\s\S]*?)<\/li>/g)].map(match => match[1]);

let html = render(ComparisonRunProgress, { stage: -1, interrupted: true });
assert.match(html, /Run K-Means Comparison/);
assert.match(html, /Ready to run/);
assert.doesNotMatch(html.replace(/<[^>]*>/g, ''), /simulation|Preparing Data|Cleaning &amp; standardization/i);
assert.equal((lane(html, 'Standard').match(/<li\b/g) ?? []).length, 6);
assert.equal((lane(html, 'Enhanced').match(/<li\b/g) ?? []).length, 8);
assert.equal((html.match(/: pending/g) ?? []).length, 14);

for (const stage of [0, 1, 3]) {
  html = render(ComparisonRunProgress, { stage, interrupted: false });
  assert.equal(active(html).length, 2);
  assert.ok(active(lane(html, 'Standard'))[0].includes(stage === 0 ? 'Preparing Run' : stage === 1 ? 'Preprocessing' : 'Validation'));
  assert.ok(active(lane(html, 'Enhanced'))[0].includes(stage === 0 ? 'Preparing Run' : stage === 1 ? 'Preprocessing' : 'Validation'));
}
html = render(ComparisonRunProgress, { stage: 2, interrupted: false });
assert.equal(active(html).length, 0, 'coarse telemetry cannot invent method-specific activity');
assert.equal((html.match(/: complete/g) ?? []).length, 4, 'only shared preparation boundaries have completed');
assert.match(html, /Detailed per-method stage progress is unavailable/);

html = render(ComparisonRunProgress, { stage: 2, interrupted: false, standardStage: 3, enhancedStage: 3 });
assert.ok(active(lane(html, 'Standard'))[0].includes('K-Means'));
assert.ok(active(lane(html, 'Enhanced'))[0].includes('NbClust'));
assert.equal((lane(html, 'Standard').match(/: complete/g) ?? []).length, 3);
assert.equal((lane(html, 'Enhanced').match(/: complete/g) ?? []).length, 3);
html = render(ComparisonRunProgress, { stage: 2, interrupted: false, standardStage: 5, enhancedStage: 4 });
assert.equal((lane(html, 'Standard').match(/: complete/g) ?? []).length, 6);
assert.ok(active(lane(html, 'Enhanced'))[0].includes('DPC'));

html = render(ComparisonRunProgress, { stage: 4, interrupted: false });
assert.match(html, /Comparison complete/);
assert.equal((html.match(/: complete/g) ?? []).length, 14);
assert.equal(active(html).length, 0);
html = render(ComparisonRunProgress, { stage: 2, interrupted: true });
assert.match(html, /Comparison interrupted/);
assert.equal(active(html).length, 0);
assert.doesNotMatch(html, /Comparison complete/);

for (const [method, steps] of [['Standard', standardProgressSteps], ['Enhanced', enhancedProgressSteps]]) {
  html = render(StudyRunProgressCard, { method, steps, activeStage: steps.length - 1 });
  assert.ok(html.includes(`${method} K-Means complete`));
  assert.equal((html.match(/: complete/g) ?? []).length, steps.length);
  assert.equal(active(html).length, 0);
}
console.log('PASS six/eight shared stages, independent lanes, truthful coarse telemetry, pending/running/interrupted/completed states, and method completion badges');
