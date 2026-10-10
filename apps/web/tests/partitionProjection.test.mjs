import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import React from 'react';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const bundle = await build({ absWorkingDir: root, entryPoints: ['apps/web/src/components/charts/PartitionProjection.tsx'],
  bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external', jsx: 'automatic', loader: { '.css': 'empty' } });
const require = createRequire(import.meta.url), module = { exports: {} };
vm.runInThisContext(`(function(require,module,exports){${bundle.outputFiles[0].text}\n})`)(require, module, module.exports);
const { PartitionProjection } = module.exports;
const points = [{ x: -12.123456, y: -8.456789, cluster: 0 }, { x: 3.123456, y: 5.456789, cluster: 1 }, { x: 1, y: 2, cluster: 1 }];
const centers = [{ x: -12.123456, y: -8.456789, cluster: 0 }, { x: 2.061728, y: 3.7283945, cluster: 1 }];
const before = JSON.stringify({ points, centers });
const chart = data => PartitionProjection(data).props.children.props.children;
const standard = chart({ points, centers, label: 'Standard K-Means' });
const enhanced = chart({ points: points.map(point => ({ ...point, cluster: 1 - point.cluster })), centers, label: 'Enhanced K-Means' });
const children = tree => React.Children.toArray(tree.props.children);
const axis = (tree, name) => children(tree).find(node => node.props.name === name);
assert.deepEqual(standard.props.margin, enhanced.props.margin);
assert.deepEqual(standard.props.margin, { top: 20, right: 52, bottom: 20, left: 12 });
for (const name of ['PC1', 'PC2']) {
  assert.deepEqual(axis(standard, name).props.domain, axis(enhanced, name).props.domain);
  assert.equal(axis(standard, name).props.tickCount, 5);
  assert.equal(axis(standard, name).props.tickFormatter(1.234567), '1.234567');
}
assert.deepEqual(axis(standard, 'PC1').props.domain, [-12.123456, 3.123456]);
assert.deepEqual(axis(standard, 'PC2').props.domain, [-8.456789, 5.456789]);
assert.equal(axis(standard, 'PC1').props.interval, 'preserveStartEnd');
const diamonds = children(standard).find(node => node.props.name === 'Projected centroids');
assert.equal(diamonds.props.data, centers);
assert.equal(diamonds.props.shape, 'diamond');
assert.deepEqual(children(standard).filter(node => node.props.name?.startsWith('Cluster ')).flatMap(node => node.props.data), points);
assert.equal(JSON.stringify({ points, centers }), before);
console.log('PASS identical comparison domains/margins, readable tick configuration, unchanged points/assignments/centroid diamonds and six-decimal tick formatting');
