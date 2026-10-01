"""Compare evidence capture against the original function using real saved inputs.

Fits below are test-only; no historical artifact is enriched or overwritten.
"""
import copy
import csv
import json
from pathlib import Path
import subprocess
import sys
from unittest.mock import patch
import numpy as np

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'scripts/research/simulation'))
import evidence

old = {'__name__': 'original_evidence', '__file__': str(ROOT / 'scripts/research/simulation/evidence.py')}
exec(subprocess.check_output(['git', 'show', 'HEAD:scripts/research/simulation/evidence.py'], cwd=ROOT, text=True), old)
workspace = next(p.parent for p in (ROOT / 'apps/api/private/simulation-runs').glob('simulation-1-*/public-result.json')
                 if json.loads(p.read_text())['configurationKey'] == 'custom:100:auto')
def rows(name):
    with (workspace / 'data/interim' / name).open(encoding='utf-8-sig', newline='') as f:
        return list(csv.DictReader(f))
output = json.loads((workspace / 'result.json').read_text())
matrix = np.array([[float(row[f'PC{i}']) for i in range(1, output['enhanced']['pcaComponents'] + 1)] for row in rows('clustering_pca_scores.csv')])
assignments = rows('baseline_kmeans_assignments.csv')
standard = [[int(row['cluster_label']) for row in assignments if int(row['seed']) == seed] for seed in range(30)]
enhanced = [[point['enhanced'] for point in output['projection']['points']] for _ in range(3)]
eigenvalues = [float(row['explained_variance']) for row in rows('clustering_pca_explained_variance.csv')]
controls = evidence.baseline.run_baseline_replications(matrix, output['enhanced']['selectedK'], expected_shape=matrix.shape)
control = json.loads((workspace / 'random-control.json').read_text())
for reuse in (True, False):
    source = copy.deepcopy(output)
    if not reuse:
        source['existing']['selectedK'] = output['enhanced']['selectedK'] + 1
    original = evidence.baseline.run_baseline_replications
    with patch.object(evidence.baseline, 'run_baseline_replications', wraps=original) as fit:
        before = old['attach_evidence'](copy.deepcopy(source), matrix, eigenvalues, standard, enhanced, control)
        count_before = fit.call_count
    captured = {}
    with patch.object(evidence.baseline, 'run_baseline_replications', wraps=original) as fit:
        after = evidence.attach_evidence(copy.deepcopy(source), matrix, eigenvalues, standard, enhanced, control, controls, captured)
        assert fit.call_count == count_before
    assert before == after, 'Evidence capture changed an existing output'
    assert captured['seed'] == 0 and len(captured['labels']) == len(matrix)
    if reuse:
        np.testing.assert_array_equal(captured['labels'], controls[0].labels)
    print(f'PASS reuse={reuse}: identical pre/post metrics and outputs, unchanged fit count, captured existing seed labels.')
