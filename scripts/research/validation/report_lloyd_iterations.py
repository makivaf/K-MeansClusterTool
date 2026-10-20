"""F6: report stored Standard iterations and replay only Enhanced Lloyd.

Reuse the frozen PCA matrix, k and initial DPC centroids. Do not run DPC,
preprocessing, PCA, NbClust, quality evaluation or model fitting. Only the
aggregate verification report is written; private labels stay private.
"""
import csv
import hashlib
import json
from pathlib import Path
import sys

import numpy as np
from sklearn.cluster import KMeans
from threadpoolctl import threadpool_limits

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'scripts/research/study_entry'))
import run_enhanced_kmeans as enhanced


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def summary(runs):
    values = np.array([row['iterations'] for row in runs])
    return dict(min=int(values.min()), median=float(np.median(values)),
                max=int(values.max()), mean=float(values.mean()))


def execute():
    standard_path = ROOT / 'data/interim/baseline_kmeans_runs.csv'
    partitions = ROOT / 'apps/api/private/final-ui-evidence/enhanced-30-partitions.npz'
    d1_report = ROOT / 'apps/api/private/final-ui-evidence/enhanced-30-report.json'
    initial_path = ROOT / 'data/interim/clustering_dpc_selected_centroids.csv'
    paths = [standard_path, partitions, d1_report, initial_path, enhanced.PCA_PATH,
             enhanced.SELECTED_K_PATH, enhanced.ASSIGNMENTS_PATH, enhanced.METRICS_PATH,
             ROOT / 'scripts/research/study_entry/run_enhanced_kmeans.py']
    hashes = {p.relative_to(ROOT).as_posix(): sha(p) for p in paths}
    report = json.loads(d1_report.read_text())
    assert report['artifactSha256'] == sha(partitions)
    for name, expected in report['sources'].items():
        assert sha(ROOT / name) == expected
    with standard_path.open(encoding='utf-8-sig', newline='') as handle:
        stored = sorted(csv.DictReader(handle), key=lambda row: int(row['seed']))
    assert [int(row['seed']) for row in stored] == list(range(30))
    standard = [dict(seed=int(row['seed']), iterations=int(row['iterations'])) for row in stored]
    assert all(row['converged_before_max_iter'] == 'True' and int(row['iterations']) < int(row['max_iter']) for row in stored)
    _, ids, matrix, k, initial, _ = enhanced.load_locked_inputs()
    with np.load(partitions, allow_pickle=False) as saved:
        assert saved['ids'].tolist() == ids
        reference = saved['labels'].copy()
    assert reference.shape == (30, len(ids))
    repetitions = []
    with threadpool_limits(limits=1):
        for index in range(30):
            model = KMeans(n_clusters=k, init=np.array(initial, copy=True), n_init=enhanced.N_INIT,
                           max_iter=enhanced.MAX_ITER, tol=enhanced.TOLERANCE, algorithm=enhanced.ALGORITHM)
            labels = model.fit_predict(matrix)
            assert np.array_equal(labels, reference[index]), 'Lloyd replay changed an Enhanced assignment'
            assert model.n_iter_ < enhanced.MAX_ITER
            repetitions.append(dict(run=index + 1, iterations=int(model.n_iter_)))
    assert all(sha(ROOT / name) == expected for name, expected in hashes.items()), 'Source mutation'
    output = dict(standard=dict(origin='stored runs', runs=standard, summary=summary(standard)),
                  enhanced=dict(origin='Lloyd-only replay with stored initial DPC centroids', runs=repetitions,
                                summary=summary(repetitions), exactAssignmentParityForAllRuns=True),
                  sources=hashes, sourceArtifactsUnchanged=True)
    (ROOT / 'docs/verification/lloyd_iterations.json').write_text(json.dumps(output, indent=2) + '\n')
    print(json.dumps({method: output[method]['summary'] for method in ['standard', 'enhanced']}))


if __name__ == '__main__':
    execute()
