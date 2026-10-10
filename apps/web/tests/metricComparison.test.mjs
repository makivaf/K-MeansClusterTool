import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const bundle = await build({ absWorkingDir: root, stdin: { contents: 'export * from "./apps/web/src/components/MetricComparisonTable"; export { PcaContribution } from "./apps/web/src/components/SopComparison"; export { InternalValidationCalculationDetails } from "./apps/web/src/components/InternalValidationCalculationDetails";', resolveDir: root },
  bundle: true, write: false, platform: "node", format: "cjs", packages: "external", jsx: "automatic", loader: { ".css": "empty" } });
const module = { exports: {} };
vm.runInThisContext(`(function(require,module,exports){${bundle.outputFiles[0].text}\n})`)(createRequire(import.meta.url), module, module.exports);
const { MetricComparisonTable, formatImprovement, formatMetric, PcaContribution, InternalValidationCalculationDetails } = module.exports;
const render = (component, props) => renderToStaticMarkup(React.createElement(component, props));
const values = { silhouette: 0.329681, davies_bouldin: 1.238391, calinski_harabasz: 1123.992 };
const changes = { silhouette: 12.42, davies_bouldin: -12.09, calinski_harabasz: 24.82 };
assert.equal(formatMetric(values.calinski_harabasz), "1,123.992000");
assert.equal(formatImprovement(12.424, "higher"), "+12.42%");
assert.equal(formatImprovement(-12.09, "lower"), "-12.09%");
assert.equal(formatImprovement(12.09, "lower", "direction-aware"), "-12.09%");
assert.equal(formatImprovement(-12.09, "lower", "direction-aware"), "+12.09%");
assert.equal(formatImprovement(-0, "lower", "direction-aware"), "0.00%");
assert.equal(formatImprovement(null, "lower"), "Unavailable");
assert.equal(formatImprovement(undefined, "higher"), "Unavailable");
const signed = render(MetricComparisonTable, { existing: values, enhanced: values, relativeChange: changes });
const directional = render(MetricComparisonTable, { existing: values, enhanced: values, relativeChange: { ...changes, davies_bouldin: 12.09 }, changeConvention: "direction-aware" });
assert.equal(signed, directional, "Both API conventions render identical signed changes");
assert.equal((signed.match(/scope="row"/g) ?? []).length, 3);
assert.match(signed, /0\.329681/); assert.match(signed, /1,123\.992000/);
assert.match(signed, /\+12\.42%<span[^>]*> ↑/); assert.match(signed, /-12\.09%<span[^>]*> ↓/);
assert.match(signed, /\+24\.82%<span[^>]*> ↑/);
assert.equal((signed.match(/internal-validation-enhanced font-semibold/g) ?? []).length, 6);
assert.match(signed, />Standard<\/th>/); assert.match(signed, />Enhanced<\/th>/); assert.match(signed, />Improvement<\/th>/);
const adverse = render(MetricComparisonTable, { relativeChange: { silhouette: -2, davies_bouldin: 2, calinski_harabasz: -2 } });
assert.equal((adverse.match(/internal-validation-enhanced font-semibold/g) ?? []).length, 3, "Only Enhanced metric cells are emphasized for adverse changes");
const pca = render(PcaContribution, { dimensions: 13, components: 6, existing: values, enhanced: values, relativeChange: changes, note: "Controlled random starts" });
assert.equal((pca.match(/scope="row"/g) ?? []).length, 1);
assert.doesNotMatch(pca, /Davies|Calinski/);
assert.match(pca, /View Calculation Details/); assert.match(pca, /<details/);
assert.match(pca, /Controlled random starts/);
const details = render(InternalValidationCalculationDetails, { standard: { n: 100, k: 2, metrics: values }, enhanced: { n: 100, k: 2, metrics: values } });
assert.match(details, /<details/); assert.match(details, /View Calculation Details/);
const standardOnly = render(MetricComparisonTable, { existing: values, standardOnly: true });
assert.doesNotMatch(standardOnly, />Enhanced<|>Improvement</);
console.log("PASS shared table rows, signed/direction-aware percentages, arrows, favorable styling, six/two-decimal formatting, PCA-only row and calculation disclosures");
const calculation = {
  seed: 0, representation: 'Standardized features',
  exampleParticipant: { rid: '6839', a: 4.329275, b: 6.459013, s: 0.329731 },
  daviesBouldin: { sigma0: 1.234567, sigma1: 2.345678, centroidDistance: 3.456789 },
  calinskiHarabasz: { ssb: 1234.567890, ssw: 2345.678901 }
};
const descriptiveSilhouette = ['Participant ID (RID)', 'Mean intra-cluster distance, a(i)',
  'Mean nearest-cluster distance, b(i)', 'Participant Silhouette value, s(i)', 'Overall Silhouette Coefficient'];
const descriptiveIndices = ['Cluster 0 average within-cluster scatter, σ0', 'Cluster 1 average within-cluster scatter, σ1',
  'Distance between cluster centroids, d(c0,c1)', 'Between-cluster sum of squares (SSB)',
  'Within-cluster sum of squares (SSW)', 'Number of participants (N)', 'Number of clusters (K)'];
const method = { n: 100, k: 2, metrics: values, calculation };
for (const props of [{ standard: method, enhanced: method }, { enhanced: method }]) {
  const html = render(InternalValidationCalculationDetails, props);
  for (const label of [...descriptiveSilhouette, ...descriptiveIndices]) assert.ok(html.includes(label), label);
  assert.doesNotMatch(html, /<dt>(RID|a\(i\)|b\(i\)|s\(i\)|σ0|σ1|d\(c0,c1\)|SSB|SSW|N|K)<\/dt>/);
  assert.deepEqual([...html.matchAll(/<dd>(.*?)<\/dd>/g)].map(match => match[1]), [
    '6839', '4.329275', '6.459013', '0.329731', '0.329681',
    '1.234567', '2.345678', '3.456789', '1.238391',
    '1,234.567890', '2,345.678901', '100', '2', '1,123.992000'
  ], 'descriptive labels leave all evidence values and six-decimal precision unchanged');
}
const pcaEvidence = render(PcaContribution, { dimensions: 13, components: 6, existing: values, enhanced: values,
  relativeChange: changes, note: 'Controlled random starts', n: 100, k: 2,
  calculations: { existing: calculation, enhanced: calculation } });
for (const label of descriptiveSilhouette) assert.ok(pcaEvidence.includes(label), label);
assert.match(pcaEvidence, /<dd>6839<\/dd>/); assert.match(pcaEvidence, /<dd>4\.329275<\/dd>/);
assert.match(pcaEvidence, /<dd>6\.459013<\/dd>/); assert.match(pcaEvidence, /<dd>0\.329731<\/dd>/);
assert.doesNotMatch(pcaEvidence, /<dt>(RID|a\(i\)|b\(i\)|s\(i\))<\/dt>/);
console.log('PASS descriptive Standard/Enhanced/PCA calculation labels, unchanged evidence values and precision, and no bare-symbol row labels');
