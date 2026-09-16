"""Read a saved simulation PCA result; run only canonical SOP 3 random controls.

No analytical files are written. Per-run aggregates travel to the private API
adapter on stdout for the shared Study Findings match rule, then are discarded.
"""
import csv
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[3]
sys.path[:0] = [str(ROOT / 'scripts/research/comparison'), str(ROOT / 'scripts/research/study_entry')]
import numpy as np
import run_dpc_initialization_comparison as sop3
import run_enhanced_kmeans as enhanced


def main():
    workspace = Path(sys.argv[1]).resolve()
    private_root = (ROOT / 'apps/api/private/simulation-runs').resolve()
    if workspace.parent != private_root or not workspace.name.startswith('simulation-'):
        raise AssertionError('A private simulation workspace is required')
    request = json.loads((workspace / 'request.json').read_text())
    analysis = json.loads((workspace / 'result.json').read_text())['enhanced']
    ids = request['sampleParticipantIds']
    if request.get('isolatedSimulation') is not True or len(ids) != 1949 or len(set(ids)) != 1949:
        raise AssertionError('Invalid simulation sample')
    components, k = analysis['pcaComponents'], analysis['selectedK']
    with (workspace / 'data/interim/clustering_pca_scores.csv').open(newline='', encoding='utf-8-sig') as handle:
        reader = csv.DictReader(handle)
        features = [f'PC{i}' for i in range(1, components + 1)]
        if reader.fieldnames != ['PTID', 'RID', *features]:
            raise AssertionError('Saved PCA representation differs from DPC')
        rows = list(reader)
    if [row['RID'] for row in rows] != ids or analysis['participantCount'] != len(ids):
        raise AssertionError('Saved PCA membership differs from simulation')
    matrix = np.asarray([[float(row[key]) for key in features] for row in rows])
    if matrix.shape != (1949, components) or not np.isfinite(matrix).all():
        raise AssertionError('Invalid saved PCA matrix')
    if k != analysis['dpc']['centroidCount'] or components != analysis['dpc']['dimensions']:
        raise AssertionError('DPC settings differ from saved PCA/k')
    for key in ('N_INIT', 'MAX_ITER', 'TOLERANCE', 'ALGORITHM'):
        if getattr(sop3, key) != getattr(enhanced, key):
            raise AssertionError(f'Control and DPC settings differ: {key}')
    if sop3.SEEDS != tuple(range(30)):
        raise AssertionError('SOP 3 seeds must be exactly 0–29')
    runs = []
    for seed in sop3.SEEDS:
        runs.append(sop3.fit_random_pca_kmeans(matrix, seed, seed + 1,
                    expected_shape=matrix.shape, selected_k=k))
        print(f'Completed random control seed {seed}', file=sys.stderr, flush=True)
    keys = ('silhouette', 'davies_bouldin', 'calinski_harabasz')
    summaries = {key: sop3._descriptive([getattr(run, key) for run in runs]) for key in keys}
    print(json.dumps({
        'sampleFingerprint': hashlib.sha256(json.dumps(ids, separators=(',', ':')).encode()).hexdigest(),
        'participantCount': len(ids), 'pcaComponents': components, 'selectedK': k,
        'settings': {'nInit': sop3.N_INIT, 'maxIter': sop3.MAX_ITER, 'tolerance': sop3.TOLERANCE, 'algorithm': sop3.ALGORITHM},
        'runs': [{'seed': run.seed, 'clusterSizes': list(run.cluster_sizes),
                  'metrics': {key: float(getattr(run, key)) for key in keys}} for run in runs],
        'randomMean': {key: summaries[key]['mean'] for key in keys},
        'randomSd': {key: summaries[key]['standard_deviation_ddof_1'] for key in keys}
    }, allow_nan=False))


if __name__ == '__main__':
    main()
