import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server.js';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const bundle = await build({ absWorkingDir: root, entryPoints: ['apps/web/src/pages/StudyFindingsPage.tsx'],
  bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external', loader: { '.css': 'empty' },
  plugins: [{ name: 'lme-ui-test', setup(b) {
    b.onLoad({ filter: /useSopEvaluation\.ts$/ }, () => ({ contents: 'export const useSopEvaluation = () => ({ dpcStatus: "unavailable" });', loader: 'ts' }));
    b.onLoad({ filter: /StudyFindingsPage\.tsx$/ }, args => ({
      contents: readFileSync(args.path, 'utf8').replace('useState("sop1")', 'useState("final")'), loader: 'tsx'
    }));
  } }] });
const require = createRequire(import.meta.url), module = { exports: {} };
vm.runInThisContext(`(function(require,module,exports){${bundle.outputFiles[0].text}\n})`)(require, module, module.exports);
const { StudyFindingsPage } = module.exports;
for (const values of [
  { n: 1845, observations: 11111, lower: 0.566467, higher: 2.036148, effect: 1.469681, ci: [1.364061, 1.575300], p: 0.00001 },
  { n: 321, observations: 987, lower: 0.123456, higher: 1.654321, effect: 1.530865, ci: [1.250001, 1.811729], p: 0.024321 }
]) {
  // Controlled UI inputs only; no analytical execution or artifact changes.
  const run = { cohort: { parentN: 2437 }, preprocessing: { retainedFeatures: [] },
    baselineComparison: { metrics: [], baselineMethod: { selectedK: 2, runCount: 30 } },
    enhancedClustering: { metrics: {}, clusterSizes: [] }, kSelection: { candidateK: [2, 3], selectedK: 2 },
    pca: { components: 1, cumulativeExplainedVariance: 0.9 }, clusterProfiles: { profiles: [], smdRanking: [] },
    initialization: { deterministic: true }, longitudinal: { timeSeries: [], mixedEffects: {
      participantCount: values.n, observationCount: values.observations,
      estimationMethod: 'Maximum likelihood (ML); random intercept only',
      estimatedAnnualChangeByOriginalCluster: [
        { clusterId: 1, estimate: values.higher, unit: 'ADAS-Cog13 points/year' },
        { clusterId: 0, estimate: values.lower, unit: 'ADAS-Cog13 points/year' }
      ], primaryResult: { estimate: values.effect, confidenceInterval95: { lower: values.ci[0], upper: values.ci[1] }, pValue: values.p }
    } } };
  const html = renderToStaticMarkup(React.createElement(StaticRouter, {}, React.createElement(StudyFindingsPage, {
    dataset: null, analysis: { standard: { status: 'completed', run }, enhanced: { status: 'completed', run } }
  })));
  const lme = html.match(/<section class="research-panel[^"]*study-lme">[\s\S]*?<\/dl><\/section><\/div><\/section>/)?.[0];
  assert.ok(lme);
  assert.ok(lme.includes(`${values.n.toLocaleString('en-US')} eligible participants · ${values.observations.toLocaleString('en-US')} repeated ADAS-Cog13 observations`));
  assert.match(lme, /Maximum likelihood \(ML\) · Random intercept only/);
  assert.match(lme, /Annual ADAS-Cog13 Change/);
  assert.ok(lme.indexOf('Cluster 0') < lme.indexOf('Cluster 1'));
  assert.match(lme, /Lower impairment/); assert.match(lme, /Higher impairment/);
  for (const value of [values.lower, values.higher, values.effect, ...values.ci]) assert.ok(lme.includes(value.toFixed(6)));
  assert.ok(lme.includes(values.p < 0.001 ? '&lt;0.001' : values.p.toFixed(6)));
  assert.equal((lme.match(/ADAS-Cog13 points\/year/g) ?? []).length, 2);
  assert.equal((lme.match(/study-lme-slope-value/g) ?? []).length, 2);
  assert.doesNotMatch(lme, /<table|<svg|Cluster 1 shows a greater annual increase/);
  assert.doesNotMatch(html, /LME results table/);
  assert.match(html, /ADAS-Cog13 Longitudinal Progression/);
  assert.match(html, /Observed means by elapsed-year bin; bars describe available observations, not fitted model predictions/);
}
console.log('PASS dynamic LME metadata, slopes, effect, CI and both p-value formats; ordered cards; preserved chart context; no duplicate table or info strip');
