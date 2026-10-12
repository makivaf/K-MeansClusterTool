import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const require = createRequire(import.meta.url);
const bundle = await build({ absWorkingDir: root, stdin: { contents: `
 export { StudyResults, comparisonEnabled } from './apps/web/src/components/final/StudyResults';
 export { FinalResults, assignmentCaption, standardDifferenceCaption, integerScatterAxis } from './apps/web/src/components/final/FinalResults';
 export { RunsCard, timingText } from './apps/web/src/components/final/RunsCard';
 export { Reproducibility, Sop1, topLoadingRows, Sop2, AriCalculation } from './apps/web/src/components/final/SopPanels';
 export { ForestPlot, longitudinalBins, supportedLongitudinalBins } from './apps/web/src/components/final/FinalLongitudinal';
 export { FinalUiEvidenceSchema } from './packages/shared/src/finalUiEvidence';
 export { PartitionEvidenceSchema } from './packages/shared/src/partitionEvidence';
 export { methodFixture } from './apps/api/src/services/methodExecution.fixture';
`, resolveDir: root }, bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external', jsx: 'automatic', loader: { '.css': 'empty' }, define: { 'import.meta.env.VITE_API_URL': 'undefined' } });
const module = { exports: {} };
vm.runInThisContext(`(function(require,module,exports){${bundle.outputFiles[0].text}\n})`)(require, module, module.exports);
const { StudyResults, comparisonEnabled, assignmentCaption, RunsCard, timingText, Reproducibility, Sop1, topLoadingRows, ForestPlot, longitudinalBins, supportedLongitudinalBins, FinalUiEvidenceSchema, PartitionEvidenceSchema, methodFixture } = module.exports;
const s = methodFixture('standard'), e = methodFixture('enhanced');
const render = (Component, props) => renderToStaticMarkup(React.createElement(Component, props));
assert.deepEqual([...topLoadingRows([[.1], [-.9], [.8], [-.7], [.2]], 0)], [1, 2, 3]);
const sop1 = render(Sop1, { standard: s, enhanced: e, comparisonView: false });
assert.match(sop1, /Show PC composition \(loadings\)/);
assert.match(sop1, /Bold: 3 largest absolute loadings per PC/);
assert.equal((sop1.match(/<b>/g) ?? []).length, 3 * e.common.pca.pcaComponents);
const longitudinal = JSON.parse(fs.readFileSync(root + 'docs/verification/longitudinal.json', 'utf8'));
const chart = JSON.parse(fs.readFileSync(root + 'docs/verification/longitudinal_ui.json', 'utf8'));
for (const [name, hash] of Object.entries(chart.sources)) assert.equal(crypto.createHash('sha256').update(fs.readFileSync(root + name)).digest('hex'), hash);
FinalUiEvidenceSchema.parse({ observedMeans: chart.observedMeans, observedAnalysisSet: chart.observedAnalysisSet });
const bins = longitudinalBins(chart.observedMeans);
assert.equal(bins.reduce((sum, bin) => sum + bin.n0 + bin.n1, 0), longitudinal.observations);
assert.equal(chart.observedAnalysisSet.participantCount, longitudinal.participants);
const boundary = longitudinalBins([
  { clusterId: 0, yearStart: 0, observationCount: 20, participantCount: 10, meanAdas13: 2 },
  { clusterId: 1, yearStart: 0, observationCount: 20, participantCount: 10, meanAdas13: 3 },
  { clusterId: 0, yearStart: 1, observationCount: 19, participantCount: 10, meanAdas13: 2 },
  { clusterId: 1, yearStart: 1, observationCount: 20, participantCount: 10, meanAdas13: 3 },
  { clusterId: 0, yearStart: 3, observationCount: 20, participantCount: 10, meanAdas13: 2 }
]);
assert.deepEqual(boundary.map(row => [row.n0, row.n1]), [[20, 20], [19, 20], [0, 0], [20, 0]]);
assert.deepEqual(supportedLongitudinalBins(boundary).map(row => row.start), [0]);
const forest = render(ForestPlot, { models: { randomIntercept: longitudinal.randomIntercept.fixedEffects, randomSlope: longitudinal.randomSlope.fixedEffects } });
assert.match(forest, /No difference/);
assert.equal((forest.match(/95% CI/g) ?? []).length, 2);
assert.equal((forest.match(/Both models: faster progression/g) ?? []).length, 1);
assert.doesNotMatch(forest, /<p class="final-caption"/);
assert.equal(comparisonEnabled(s), false);
assert.equal(comparisonEnabled(s, e), true);
const different = structuredClone(e); different.provenance.sourceHash = '0'.repeat(64);
assert.equal(comparisonEnabled(s, different), false);
assert.match(render(StudyResults, { standard: s }), /disabled=""[^>]*>Comparison/);
assert.doesNotMatch(render(StudyResults, { standard: s, enhanced: e }), /disabled=""[^>]*>Comparison/);
assert.match(assignmentCaption(1, 1), /^1 participant assigned differently/);
assert.match(assignmentCaption(0, 1), /^0 participants assigned differently/);
assert.match(assignmentCaption(2, 1), /^2 participants assigned differently/);
assert.equal(assignmentCaption(undefined, 1), 'Not available');
assert.equal(timingText(.005), '< 0.01'); assert.equal(timingText(1.234), '1.23');
assert.equal(timingText(undefined), 'Not available'); assert.equal(timingText(0), '0.00');
const data = JSON.parse(fs.readFileSync(new URL('../src/data/finalUiEvidence.json', import.meta.url), 'utf8'));
FinalUiEvidenceSchema.parse(data);
for (const evidence of Object.values(data.initializationEvidence)) {
  PartitionEvidenceSchema.parse(evidence);
  assert.equal(evidence.pairwiseAriMatrix.length, 30);
  evidence.pairwiseAriMatrix.forEach((row, i) => { assert.equal(row[i], 1); row.forEach((v, j) => assert.equal(v, evidence.pairwiseAriMatrix[j][i])); });
  assert.equal(evidence.pairwiseComparisons, 435);
}
const malformed = structuredClone(data.initializationEvidence.standard); malformed.pairwiseAriMatrix[0][1] = -.9;
assert.equal(PartitionEvidenceSchema.safeParse(malformed).success, false);
const strip = render(Reproducibility, { evidence: data.initializationEvidence.standard });
assert.match(strip, /aria-label="Partition A: 22 runs \| Partition B: 8 runs"/);
assert.match(strip, /Pairwise ARI over 435 run pairs/); assert.doesNotMatch(strip, /Show run-level detail|final-strip/);
assert.match(strip, /Seed 0 vs Seed 1: ARI/);
assert.match(strip, /identical pairs 259 \(59.5%\)/);
assert.match(strip, /22 of 30 runs/);
assert.doesNotMatch(strip, />[AB]<\/span>/);
assert.match(strip, /0.990/); assert.match(strip, /1.000/);
const enhancedStrip = render(Reproducibility, { evidence: data.initializationEvidence.enhanced, enhanced: true });
assert.match(enhancedStrip, /1 partition: 30 runs/);
assert.match(enhancedStrip, /identical pairs 435 \(100%\)/);
assert.doesNotMatch(strip, /recharts|<svg/);
const unavailable = render(Reproducibility, { evidence: { executions: 3 } });
assert.match(unavailable, /Not available/); assert.doesNotMatch(unavailable, /data-partition=/);
const jobs = { jobs: {}, completed: {}, errors: {}, compatible: false, locked: false, submitting: null, uncertain: null, run() {} };
const runs = render(RunsCard, { state: jobs, ready: true });
assert.equal((runs.match(/<summary>Run details/g) ?? []).length, 1);
assert.match(runs, /System overhead/); assert.doesNotMatch(runs, /Comparison Ready|Cancel|live timer/);
const html = render(StudyResults, { standard: s, enhanced: e });
assert.doesNotMatch(html, /6-PC|6-component|Evaluated in the|Improvement|View Comparison|Comparison Ready|Stored Study Findings/);
// Exercise actual segmented/tab callbacks with a small hook host. All tab panels
// retain their keys and stay mounted while only hidden changes.
let cursor = 0; const slots = [];
const hosted = { exports: {} };
const react = { useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { slots[i] = value; }]; }, useId: () => 'host' };
const child = () => null;
const imports = { react, 'react/jsx-runtime': require('react/jsx-runtime'), '../../../../../packages/shared/src/methodExecution': { compatibleMethods: comparisonEnabled }, './SopPanels': { Sop1: child, Sop2: child, Sop3: child, Placeholder: child }, './FinalResults': { FinalResults: child }, './ui': { Panel: child }, './FinalUi.css': {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../src/components/final/StudyResults.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText, { exports: hosted.exports, require: key => { assert.ok(key in imports, key); return imports[key]; } });
const tree = props => { cursor = 0; return hosted.exports.StudyResults(props); };
const props = { standard: s, enhanced: e };
let element = tree(props);
element.props.children[1].props.children[2].props.onClick(); // SOP 3
element = tree(props); element.props.children[0].props.children[1].props.onClick(); // Comparison
element = tree(props);
assert.equal(slots[0], 'sop3'); assert.equal(slots[1], 'comparison');
const keys = element.props.children[2].map(panel => panel.key);
element.props.children[0].props.children[0].props.onClick();
element = tree(props); assert.equal(slots[0], 'sop3');
assert.deepEqual(element.props.children[2].map(panel => panel.key), keys);
const rerun = tree({ ...props, enhanced: undefined, enhancedState: 'Running' });
assert.equal(rerun.props.children[0].props.children[1].props.disabled, true);
const folder = new URL('../src/components/final/', import.meta.url);
for (const file of fs.readdirSync(folder).filter(name => name.endsWith('.tsx'))) {
  const source = fs.readFileSync(new URL(file, folder), 'utf8');
  assert.doesNotMatch(source, /0\.9934|0\.3318|4\s*,\s*5\s*,\s*16\s*,\s*18\s*,\s*21\s*,\s*22\s*,\s*24\s*,\s*26/);
}
console.log('PASS final UI gating, retained tab state, singular/plural, timings, validated 30-run matrices, strips and no mock/6-component views');

// Optional aggregate ARI arithmetic and cohort links must validate and render
// as a sibling disclosure, without participant identifiers or nested details.
for (const method of ['standard', 'enhanced']) {
  const ariEvidence = data.initializationEvidence[method];
  const ariRecord = ariEvidence.ariCalculation;
  assert.ok(ariRecord, `${method} ARI calculation exists`);
  assert.equal(ariRecord.match, true);
  assert.equal(ariRecord.cohort.identical, true);
  assert.equal(ariRecord.cohort.ridHashes[0], ariRecord.cohort.ridHashes[1]);
  assert.equal(ariRecord.ariRecalculated.toFixed(6), ariRecord.ariStored.toFixed(6));
  assert.equal(ariRecord.ariStored.toFixed(6), ariRecord.sklearnAri.toFixed(6));
  const ariHtml = render(Reproducibility, { evidence: ariEvidence, enhanced: method === 'enhanced' });
  assert.match(ariHtml, /<details><summary>Show ARI calculation<\/summary>/); assert.doesNotMatch(ariHtml, /<details>[\s\S]*?<details>/);
  assert.equal((ariHtml.match(/Show ARI calculation/g) ?? []).length, 1);
  assert.match(ariHtml, /ARI contingency counts/);
  assert.match(ariHtml, /ARI calculation terms/);
  assert.match(ariHtml, /Matches stored and scikit-learn ARI to 6 decimals/);
  assert.match(ariHtml, /Same cohort and participant order \(RID hash identical\)/);
  assert.ok(ariHtml.includes(ariRecord.ariRecalculated.toFixed(6)));
  const changedAri = structuredClone(ariEvidence); changedAri.ariCalculation.ariStored -= .00001;
  assert.equal(PartitionEvidenceSchema.safeParse(changedAri).success, false);
  const changedCohort = structuredClone(ariEvidence); changedCohort.ariCalculation.cohort.ridHashes[1] = '0'.repeat(64);
  assert.equal(PartitionEvidenceSchema.safeParse(changedCohort).success, false);
  const changedCell = structuredClone(ariEvidence); changedCell.ariCalculation.n_ij[0][0]++;
  assert.equal(PartitionEvidenceSchema.safeParse(changedCell).success, false);
}
assert.deepEqual(data.initializationEvidence.standard.ariCalculation.pair, {kind:'seed', first:0, second:4});
assert.deepEqual(data.initializationEvidence.standard.ariCalculation.n_ij, [[0,1554],[878,5]]);
assert.deepEqual(data.initializationEvidence.enhanced.ariCalculation.pair, {kind:'run', first:1, second:2});
console.log('PASS optional ARI formula evidence, stored/scikit-learn six-decimal match, ordered cohort hashes and sibling SOP 3 disclosures');

const { FinalResults, Sop2, AriCalculation, standardDifferenceCaption, integerScatterAxis } = module.exports;
const originalAriCalculation = JSON.stringify(data.initializationEvidence.standard.ariCalculation);
const matchedTable = render(AriCalculation, {calculation:data.initializationEvidence.standard.ariCalculation});
assert.ok(matchedTable.search(/Seed 4 [^<]*Cluster 1/) < matchedTable.search(/Seed 4 [^<]*Cluster 0/));
assert.equal((matchedTable.match(/data-off-diagonal="true"/g) ?? []).length, 2);
assert.match(matchedTable, /<td>1,554<\/td><td[^>]*data-off-diagonal="true"[^>]*>0<\/td>/);
assert.match(matchedTable, /Columns reordered by matching clusters; ARI does not depend on cluster numbering/);
assert.equal(JSON.stringify(data.initializationEvidence.standard.ariCalculation), originalAriCalculation);
assert.match(strip, /All pairs agree at ARI/);
assert.match(enhancedStrip, /All 435 pairs agree at ARI = 1/);
assert.doesNotMatch(strip, /Seed 0�29|Partitions A and B differ by at most|Show run-level detail/);
assert.doesNotMatch(enhancedStrip, /Every run produced the same partition|Show run-level detail/);
assert.ok(strip.indexOf('Partition A: 22 runs') < strip.indexOf('final-stats'));
assert.ok(strip.indexOf('final-stats') < strip.indexOf('Pairwise ARI over'));
assert.ok(strip.indexOf('Pairwise ARI over') < strip.indexOf('Pairwise ARI matrix'));
assert.ok(strip.indexOf('Pairwise ARI matrix') < strip.indexOf('Show ARI calculation'));
const finalResultHtml = render(FinalResults, {standard:s, enhanced:e});
assert.match(finalResultHtml, /Clustering quality: comparable/);
assert.doesNotMatch(finalResultHtml, /Clustering quality: no loss|Descriptive comparison in the same evaluation space|PCA scatter/);
assert.match(finalResultHtml, /<details><summary>Show cluster visualization<\/summary>/);
assert.equal((finalResultHtml.match(/<h3>What the two clusters look like<\/h3>/g) ?? []).length, 1);
assert.equal(standardDifferenceCaption(1), 'Standard seed 0 differs by 1 participant.');
assert.equal(standardDifferenceCaption(3), 'Standard seed 0 differs by 3 participants.');
for (const values of [[-3.7, 8.8], [-.5, .7], [-37, 63], []]) {
 const axis = integerScatterAxis(values);
 assert.ok(axis.ticks.every(Number.isInteger));
 assert.ok(values.every(value => value >= axis.domain[0] && value <= axis.domain[1]));
}
const recharts = require('recharts');
function chartNodes(node, type) {
 if (Array.isArray(node)) return node.flatMap(child => chartNodes(child, type));
 if (!React.isValidElement(node)) return [];
 return [...(node.type === type ? [node] : []), ...chartNodes(node.props.children, type)];
}
const sop2Tree = Sop2({standard:s, enhanced:e});
const votesChart = chartNodes(sop2Tree, recharts.BarChart)[0];
assert.deepEqual(votesChart.props.data.map(row => row.k), [2,3,4,5,6,7,8,9,10]);
assert.ok(votesChart.props.margin.top >= 40);
const votesYAxis = chartNodes(votesChart, recharts.YAxis)[0];
assert.deepEqual(votesYAxis.props.domain, [0,10]);
assert.deepEqual(votesYAxis.props.ticks, [0,3,6,9]);
assert.equal(chartNodes(votesChart, recharts.XAxis)[0].props.interval, 0);
assert.equal(chartNodes(votesChart, recharts.LabelList)[0].props.formatter(10), '10');
console.log('PASS unclipped NbClust chart configuration, SOP 3 ordered layout, matched presentation-only columns and Enhanced-only integer scatter');
