"""Comparable cold exact workloads, original and optimized implementations.

No fitted-result caches or frozen artifact writes. Run under the installed
research environment; report individual trials, not just favorable samples.
"""
from pathlib import Path
import os
for name in ('OMP_NUM_THREADS', 'OPENBLAS_NUM_THREADS', 'MKL_NUM_THREADS', 'NUMEXPR_NUM_THREADS'):
    os.environ[name] = '1'
import sys
ROOT = Path(__file__).resolve().parents[3]
sys.path[:0] = [str(ROOT/'scripts/research/study_entry'), str(ROOT/'scripts/research/comparison'), str(ROOT/'scripts/research/simulation')]
import argparse
import json
import hashlib
import platform
import multiprocessing
from dataclasses import replace
from time import perf_counter
import numpy as np
import sklearn
import scipy
from sklearn.metrics import silhouette_score, davies_bouldin_score, calinski_harabasz_score
import preprocess_study_entry as prep
import run_baseline_kmeans_comparison as baseline
import run_enhanced_kmeans as enhanced
import dpc_initialize_clusters as dpc
from exact_runtime import ExactMetrics, exact_dpc_init


class ReferenceMetrics:
    def __init__(self, X):
        self.X, self.seconds = X, 0.
    def __call__(self, labels):
        t = perf_counter()
        values = (float(silhouette_score(self.X, labels, metric='euclidean')),
                  float(davies_bouldin_score(self.X, labels)), float(calinski_harabasz_score(self.X, labels)))
        self.seconds += perf_counter()-t
        return values


def workload(source, ids, optimized, method):
    if method == 'enhanced':
        import select_cluster_count_nbclust as nb
    times = dict.fromkeys(['preprocessing', 'pca', 'k_selection', 'nbclust', 'dpc', 'lloyd', 'seed_evaluation', 'validation', 'evidence'], 0.)
    start = perf_counter()
    def timed(key, fn):
        t = perf_counter(); value = fn(); times[key] += perf_counter()-t; return value
    def prepare():
        selected = source.set_index('RID').loc[ids].reset_index()
        table = prep.build_retained_feature_table(selected, expected_rows=len(ids), expected_phase_counts=selected.ENTRY_PHASE.value_counts().to_dict())
        imputed, summary = prep.median_impute_features(table, expected_missing_counts={f: int(table[f].isna().sum()) for f in prep.RETAINED_FEATURES})
        return table, imputed, prep.standardize_features(imputed, summary)[0]
    retained, imputed, table = timed('preprocessing', prepare)
    scores, variance, loadings, model, count = timed('pca', lambda: prep.apply_pca(table, expected_rows=len(ids)))
    timed('validation', lambda: prep.validate_final_outputs(retained, imputed, table, scores, variance, count, expected_rows=len(ids)))
    X = table.loc[:, prep.RETAINED_FEATURES].to_numpy()
    Z = scores[[f'PC{i}' for i in range(1, count+1)]].to_numpy()
    evaluator = (ExactMetrics if optimized else ReferenceMetrics)(X if method == 'standard' else Z)
    selection = None; initializations = None
    if method == 'standard':
        def fit(k, seed):
            t = perf_counter(); before = evaluator.seconds if evaluator else 0
            run = baseline.fit_random_kmeans(X, k, seed, seed+1, expected_shape=X.shape, evaluate=evaluator)
            if evaluator: times['lloyd'] += perf_counter()-t-(evaluator.seconds-before)
            return run
        candidates = timed('k_selection', lambda: [fit(k, 0) for k in baseline.K_CANDIDATES])
        k = min(candidates, key=lambda r: (-r.silhouette, r.k)).k
        runs = timed('seed_evaluation', lambda: ([replace(next(r for r in candidates if r.k == k), run_number=1)] + [fit(k, s) for s in range(1,30)]) if optimized else [fit(k, s) for s in range(30)])
        matrix = X
    else:
        import select_cluster_count_nbclust as nb
        def select():
            a = nb.select_k_nbclust(Z.tolist(), expected_shape=Z.shape)
            b = nb.select_k_nbclust(Z.tolist(), expected_shape=Z.shape)
            assert a == b
            return a
        selection = timed('nbclust', select)
        k = selection.selected_k
        initializations = timed('dpc', lambda: [(exact_dpc_init if optimized else dpc.dpc_init)(Z.tolist(), k) for _ in range(3)])
        timed('validation', lambda: dpc.validate_repeated_runs(initializations))
        runs = timed('lloyd', lambda: [enhanced.run_enhanced_kmeans(Z, np.asarray(init.centroid_matrix), k, expected_shape=Z.shape, evaluate=evaluator) for init in initializations])
        timed('validation', lambda: enhanced.validate_reproducibility(runs))
        matrix = Z
    if evaluator:
        if method == 'enhanced': times['lloyd'] -= evaluator.seconds
        times['validation'] += evaluator.seconds
    # Baseline evidence historically recalculates distances in the API. Use an
    # independent evaluator in the reference workload; optimized reuses distances.
    evidence = timed('evidence', lambda: (evaluator if optimized else ExactMetrics(matrix)).calculation(runs[0].labels, ids, 'benchmark', 0))
    times['total'] = perf_counter()-start
    return times, runs, selection, initializations, evidence


def process_workload(connection, ids, optimized, method):
    try:
        source = prep.read_csv_as_text(ROOT/'data/interim/study_entry_cohort_unimputed.csv')
        connection.send(workload(source, ids, optimized, method))
    finally:
        connection.close()


def fresh_workload(ids, optimized, method):
    receiver, sender = multiprocessing.Pipe(duplex=False)
    worker = multiprocessing.get_context('spawn').Process(target=process_workload, args=(sender, ids, optimized, method))
    started = perf_counter()
    worker.start()
    sender.close()
    try:
        result = receiver.recv()
    finally:
        receiver.close()
        worker.join()
    assert worker.exitcode == 0
    result[0]['process_wall'] = perf_counter()-started
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--sample', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--trials', type=int, default=3)
    parser.add_argument('--method', choices=['standard','enhanced','both'], default='both')
    parser.add_argument('--fresh-processes', action='store_true')
    args = parser.parse_args()
    source = prep.read_csv_as_text(ROOT/'data/interim/study_entry_cohort_unimputed.csv')
    ids = json.loads(Path(args.sample).read_text())
    report = {'n': len(ids), 'sampleHash': hashlib.sha256(json.dumps(ids).encode()).hexdigest(),
        'environment': {'python': platform.python_version(), 'numpy': np.__version__, 'scipy': scipy.__version__, 'sklearn': sklearn.__version__},
        'cache': 'cold; no reused preprocessing, PCA or metric cache between workloads', 'freshProcesses': args.fresh_processes,
        'note': 'Stage timings include nested validation time. Reference evidence uses exact vectorized calculations, conservatively excluding the slower historical JS overhead.', 'trials': []}
    for method in (['standard','enhanced'] if args.method == 'both' else [args.method]):
        for trial in range(args.trials):
            results = {}
            for optimized in ([False, True] if trial % 2 == 0 else [True, False]):
                results[optimized] = fresh_workload(ids, optimized, method) if args.fresh_processes else workload(source, ids, optimized, method)
                print(json.dumps({'method': method, 'trial': trial, 'optimized': optimized, 'times': results[optimized][0]}), flush=True)
            before, after = results[False], results[True]
            assert len(before[1]) == len(after[1]) == (30 if method == 'standard' else 3)
            for a,b in zip(before[1], after[1]):
                assert np.array_equal(a.labels,b.labels) and a.iterations == b.iterations
                np.testing.assert_allclose([a.silhouette,a.davies_bouldin,a.calinski_harabasz,a.inertia], [b.silhouette,b.davies_bouldin,b.calinski_harabasz,b.inertia], rtol=1e-12,atol=1e-12)
            if before[2] is not None:
                a,b = before[2],after[2]
                assert (a.vote_counts,a.leaders,a.selected_k) == (b.vote_counts,b.leaders,b.selected_k)
                assert len(a.tie_break_rows) == len(b.tie_break_rows)
                for x,y in zip(a.tie_break_rows,b.tie_break_rows):
                    assert x.keys() == y.keys()
                    for key in x:
                        if isinstance(x[key], (int,float)):
                            np.testing.assert_allclose(x[key],y[key],rtol=1e-12,atol=1e-12)
                        else: assert x[key] == y[key]
                for x,y in zip(a.index_results,b.index_results):
                    assert (x.index,x.status,x.recommended_k,x.reason,x.warnings) == (y.index,y.status,y.recommended_k,y.reason,y.warnings)
                    if x.criterion_value is None: assert y.criterion_value is None
                    else: np.testing.assert_allclose(x.criterion_value,y.criterion_value,rtol=1e-12,atol=1e-12)
            assert before[3] == after[3], 'DPC parity failed'
            report['trials'].append({'method': method, 'trial': trial, 'before': before[0], 'after': after[0], 'parity': True})
            Path(args.output).write_text(json.dumps(report, indent=2))
    print('PASS exact labels, iterations, NbClust results, complete DPC outputs and metric tolerances')


if __name__ == '__main__':
    main()
