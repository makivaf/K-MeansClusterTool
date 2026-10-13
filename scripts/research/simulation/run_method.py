"""Independent method worker. Writes only its private workspace/cache.

Comparison controls are a third, explicitly downstream job. They never delay
publication of Standard or Enhanced. Frozen-study artifacts are never inputs
to a newly executed result (other than a verified, requested cohort source).
"""
from pathlib import Path
import csv
import hashlib
import json
import os
import sys
from dataclasses import asdict, replace
from time import perf_counter

ROOT = Path(__file__).resolve().parents[3]
sys.path[:0] = [str(ROOT/'scripts/research/study_entry'), str(ROOT/'scripts/research/comparison'), str(ROOT/'scripts/research/validation')]
import numpy as np
from sklearn.metrics import adjusted_rand_score
import preprocess_study_entry as prep
import run_baseline_kmeans_comparison as baseline
import run_enhanced_kmeans as enhanced
import dpc_initialize_clusters as dpc
from exact_runtime import ExactMetrics, exact_dpc_init, KEYS
from common_space import evaluate_common_spaces, load_partitions
from prepare_method_data import prepare_data
from derive_partition_evidence import derive, assert_identical_partitions


def digest(value):
    return hashlib.sha256(value).hexdigest()


def write_json(path, value):
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(value, allow_nan=False), encoding='utf-8')
    os.replace(temporary, path)


def metrics(run):
    return {key: float(getattr(run, key)) for key in KEYS}


def average(runs):
    return {key: baseline._descriptive([getattr(run, key) for run in runs])['mean'] for key in KEYS}


def read_cache(directory, key, filenames):
    try:
        manifest = json.loads((directory/'manifest.json').read_text())
        return manifest['key'] == key and set(manifest['files']) == set(filenames) and all(
            digest((directory/name).read_bytes()) == manifest['files'][name] for name in filenames)
    except (OSError, ValueError, KeyError):
        return False


def seal_cache(directory, key, filenames):
    write_json(directory/'manifest.json', {'key': key, 'files': {name: digest((directory/name).read_bytes()) for name in filenames}})


def execute(request, workspace):
    if request.get('isolatedMethod') is not True or (workspace/'.git').exists():
        raise AssertionError('Private method workspace required')
    start = perf_counter()
    timings = dict.fromkeys(['preprocessing', 'pca', 'k_selection', 'nbclust', 'dpc', 'lloyd',
                            'seed_evaluation', 'validation', 'evidence'], 0.0)
    hits = {'preprocessing': False, 'pca': False}
    def stage(name):
        print(json.dumps({'stage': name}), flush=True)
    def measured(name, function):
        t = perf_counter()
        result = function()
        timings[name] = timings.get(name, 0) + perf_counter() - t
        return result
    X, Z, info, pca, ids, cache = prepare_data(request, workspace, measured, stage, hits)
    n = len(ids)
    if request['method'] == 'preparation':
        output = dict(participantCount=n, retainedVariables=list(prep.RETAINED_FEATURES),
            sourceHash=request['sourceHash'], preprocessingHash=digest((cache/'standardized.csv').read_bytes()),
            pcaHash=digest((cache/'pca/scores.npy').read_bytes()), timings=timings, cacheHits=hits)
        write_json(workspace/'prepared.json', output)
        return output
    xy = np.column_stack((Z[:, 0], Z[:, 1] if Z.shape[1] > 1 else np.zeros(n)))
    correlation = np.corrcoef(X, rowvar=False)
    common = {'participantCount': n, 'retainedVariables': list(prep.RETAINED_FEATURES),
        'excludedVariables': ['BNT', 'NPIQ'], 'phaseCounts': info['phaseCounts'],
        'correlation': [[float(v) if np.isfinite(v) else None for v in row] for row in correlation],
        'pca': pca, 'xy': xy.tolist()}
    provenance = {'compatibilityKey': request['compatibilityKey'], 'sourceHash': request['sourceHash'],
        'participantsHash': digest(json.dumps(ids, separators=(',', ':')).encode()),
        'preprocessingHash': digest((cache/'standardized.csv').read_bytes()),
        'pcaHash': digest((cache/'pca/scores.npy').read_bytes()), 'implementationHash': request['implementationHash'],
        'dependenciesHash': request['dependenciesHash'], 'evaluationVersion': 'euclidean-full-lloyd-v1'}
    provenance['configurationHash'] = digest(json.dumps({'manualK': request.get('manualK'),
        'scope': request['scope'], 'seeds': list(range(30)), 'dpcRepetitions': 30}, sort_keys=True).encode())
    provenance['datasetHash'] = request.get('datasetHash', request['sourceHash'])
    if request.get('preparationKey'):
        provenance['preparationKey'] = request['preparationKey']
    result = {'method': request['method'], 'common': common, 'provenance': provenance}
    if request['method'] == 'standard':
        evaluate = ExactMetrics(X)
        def fit(k, seed):
            t = perf_counter(); before = evaluate.seconds
            run = baseline.fit_random_kmeans(X, k, seed, seed+1, expected_shape=X.shape, evaluate=evaluate)
            timings['lloyd'] += perf_counter()-t-(evaluate.seconds-before)
            return run
        stage('k_selection')
        candidates = measured('k_selection', lambda: [fit(k, 0) for k in baseline.K_CANDIDATES])
        selected = min(candidates, key=lambda r: (-r.silhouette, r.k)).k
        k = request.get('manualK') or selected
        stage('seed_evaluation')
        runs = measured('seed_evaluation', lambda: [replace(next(r for r in candidates if r.k == k), run_number=1)] +
                        [fit(k, seed) for seed in baseline.BASELINE_SEEDS[1:]])
        assert len(runs) == 30 and [r.seed for r in runs] == list(range(30))
        result['standard'] = {'participantCount': n, 'selectedK': k, 'silhouetteSelectedK': selected, 'initialization': 'random',
            'silhouetteByK': [{'k': r.k, 'silhouette': r.silhouette} for r in candidates], 'metrics': average(runs),
            'runs': [{'seed': r.seed, 'iterations': r.iterations, 'convergedBeforeMaxIter': r.iterations < baseline.MAX_ITER,
                      'clusterSizes': list(r.cluster_sizes), 'metrics': metrics(r)} for r in runs],
            'ariBySeed': [{'seed': r.seed, 'adjustedRandIndex': float(adjusted_rand_score(runs[0].labels, r.labels))} for r in runs]}
        labels = runs[0].labels
        stage('evidence')
        result['calculation'] = measured('evidence', lambda: evaluate.calculation(labels, ids, '13 standardized features', 0))
        np.savez(workspace/'partitions.npz', ids=np.array(ids), labels=np.array([r.labels for r in runs]))
        timings['validation'] = evaluate.seconds
    elif request['method'] == 'enhanced':
        stage('nbclust')
        import select_cluster_count_nbclust as nb
        def select():
            first = nb.select_k_nbclust(Z.tolist(), expected_shape=Z.shape)
            write_json(workspace/'nbclust-checks.json', [asdict(first)])
            return first
        selection = measured('nbclust', select)
        k = selection.selected_k
        stage('dpc')
        initializations = measured('dpc', lambda: [exact_dpc_init(Z.tolist(), k) for _ in range(3)])
        repetition_start = perf_counter()
        initializations += measured('dpc', lambda: [exact_dpc_init(Z.tolist(), k) for _ in range(27)])
        added_repetition_seconds = perf_counter() - repetition_start
        measured('validation', lambda: [dpc.validate_repeated_runs(initializations[i:i+3]) for i in range(0, 30, 3)])
        initialization = initializations[0]
        evaluate = ExactMetrics(Z)
        stage('lloyd')
        def fit_initializations(values):
            return [enhanced.run_enhanced_kmeans(Z, np.asarray(init.centroid_matrix), k,
                expected_shape=Z.shape, evaluate=evaluate) for init in values]
        runs = measured('lloyd', lambda: fit_initializations(initializations[:3]))
        repetition_start = perf_counter()
        runs += measured('lloyd', lambda: fit_initializations(initializations[3:]))
        added_repetition_seconds += perf_counter() - repetition_start
        timings['additional_enhanced_repetitions'] = added_repetition_seconds
        timings['lloyd'] -= evaluate.seconds
        measured('validation', lambda: [enhanced.validate_reproducibility(runs[i:i+3]) for i in range(0, 30, 3)])
        write_json(workspace/'enhanced-repetitions.json', {
            'dpc': [asdict(init) for init in initializations],
            'lloyd': [{'iterations': run.iterations, 'inertia': run.inertia, 'metrics': metrics(run)} for run in runs]})
        timings['validation'] += evaluate.seconds
        r = runs[0]; labels = r.labels
        assert_identical_partitions([run.labels for run in runs], labels)
        result['enhanced'] = {**pca, 'participantCount': n, 'selectedK': k, 'initialization': 'DPC',
            'iterations': r.iterations, 'convergedBeforeMaxIter': r.iterations < enhanced.MAX_ITER,
            'clusterSizes': np.bincount(labels).tolist(), 'metrics': metrics(r),
            'retainedVariables': list(prep.RETAINED_FEATURES), 'excludedVariables': ['BNT', 'NPIQ'],
            'nbclust': {'votes': [{'k': k, 'count': count} for k, count in selection.vote_counts],
                'indices': [{'index': item.index, 'status': item.status, 'recommendedK': item.recommended_k} for item in selection.index_results],
                'tieOccurred': len(selection.leaders)>1, 'reproducible': True},
            'dpc': {'cutoffPercentile': initialization.cutoff_percentile, 'distanceCutoff': initialization.d_c,
                'centroidCount': k, 'dimensions': Z.shape[1], 'pairwiseDistanceCount': initialization.pairwise_distance_count,
                'determinismPassed': True, 'ariByRun': [{'seed': i+1, 'adjustedRandIndex': float(adjusted_rand_score(labels, run.labels))} for i, run in enumerate(runs[:3])],
                'decisionGraph': [{'rho': initialization.rho[i], 'delta': initialization.delta[i], 'gamma': initialization.gamma[i],
                    'selected': i in initialization.selected_indices} for i in range(n)],
                'centers': [{'rid': ids[i], 'coordinates': list(initialization.centroid_matrix[pos]), 'rho': initialization.rho[i],
                    'delta': initialization.delta[i], 'gamma': initialization.gamma[i]} for pos, i in enumerate(initialization.selected_indices)]}}
        stage('evidence')
        result['calculation'] = measured('evidence', lambda: evaluate.calculation(labels, ids, f'{Z.shape[1]} principal components'))
        np.savez(workspace/'partitions.npz', ids=np.array(ids), labels=np.array([r.labels for r in runs]))
    elif request['method'] == 'comparison':
        for field in ['standardResult', 'enhancedResult']:
            if digest(Path(request[field]).read_bytes()) != request.get(field+'Hash'):
                raise AssertionError('Completed result artifact changed before comparison')
        standard = json.loads(Path(request['standardResult']).read_text())
        enhanced_result = json.loads(Path(request['enhancedResult']).read_text())
        assert standard['provenance'] == enhanced_result['provenance'] == provenance
        standard_labels = load_partitions(Path(request['standardResult']).parent/'partitions.npz', standard, ids, 30)
        enhanced_labels = load_partitions(Path(request['enhancedResult']).parent/'partitions.npz', enhanced_result, ids, 30)[:3]
        k = standard['standard']['selectedK']; dk = enhanced_result['enhanced']['selectedK']
        evaluate = ExactMetrics(Z)
        stage('k_selection')
        candidates = measured('k_selection', lambda: [baseline.fit_random_kmeans(Z, candidate, 0, 1,
            expected_shape=Z.shape, evaluate=evaluate) for candidate in baseline.K_CANDIDATES])
        pca_k = min(candidates, key=lambda run: (-run.silhouette, run.k)).k
        stage('seed_evaluation')
        fitted = {}
        def fits(k):
            if k not in fitted:
                fitted[k] = [replace(next(run for run in candidates if run.k == k), run_number=1)] + [
                    baseline.fit_random_kmeans(Z, k, seed, seed+1, expected_shape=Z.shape, evaluate=evaluate) for seed in baseline.BASELINE_SEEDS[1:]]
            return fitted[k]
        runs = measured('seed_evaluation', lambda: fits(k))
        pca_runs = measured('seed_evaluation', lambda: fits(pca_k))
        controls = measured('seed_evaluation', lambda: fits(dk))
        original, transformed = standard['standard']['metrics'], average(runs)
        result['pcaContribution'] = {'k': k, 'runCount': 30, 'existing': original, 'enhanced': transformed,
            'relativeChange': {key: None for key in KEYS}}
        saved = np.load(Path(request['enhancedResult']).parent/'partitions.npz', allow_pickle=False)
        assert saved['ids'].tolist() == ids
        result['randomControl'] = {'totalRandomRuns': 30,
            'matchingRuns': sum(adjusted_rand_score(saved['labels'][0], run.labels) == 1 for run in controls),
            'randomMean': average(controls), 'randomSd': {key: float(np.std([getattr(r, key) for r in controls], ddof=1)) for key in KEYS}}
        stage('evidence')
        result['calculation'] = measured('evidence', lambda: evaluate.calculation(runs[0].labels, ids, f'{Z.shape[1]} principal components', 0))
        def condition(k, runs):
            return {'k': k, 'runCount': len(runs), 'metrics': average(runs),
                'calculation': evaluate.calculation(runs[0].labels, ids, f'{Z.shape[1]} principal components', 0)}
        def change(a, b):
            return {key: None if a[key] == 0 else 100*(b[key]-a[key])/abs(a[key]) for key in KEYS}
        def sequential_evidence():
            pca_condition, nb_condition = condition(pca_k, pca_runs), condition(dk, controls)
            return {'pcaSilhouetteByK': [{'k': r.k, 'silhouette': r.silhouette} for r in candidates],
                'pcaRandom': pca_condition, 'nbclustRandom': nb_condition,
                'relativeChange': {'sop1': {key: None for key in KEYS},
                    'sop2': change(pca_condition['metrics'], nb_condition['metrics']),
                    'sop3': change(nb_condition['metrics'], enhanced_result['enhanced']['metrics'])},
                'randomAriBySeed': [{'seed': run.seed, 'adjustedRandIndex': float(adjusted_rand_score(saved['labels'][0], run.labels))} for run in controls]}
        result['sopControls'] = measured('evidence', sequential_evidence)
        result['commonSpace'] = measured('common_space', lambda: evaluate_common_spaces(
            X, Z, standard_labels, np.array([r.labels for r in controls]), enhanced_labels, ids))
        result['comparison'] = result['commonSpace']['spaces'][0]['comparison']
        result['comparisonSources'] = {name: {'resultHash': digest(Path(request[field]).read_bytes()),
            'assignmentsHash': source['assignmentsHash']} for name, field, source in
            [('standard', 'standardResult', standard), ('enhanced', 'enhancedResult', enhanced_result)]}
        for field in ['standardResult', 'enhancedResult']:
            if digest(Path(request[field]).read_bytes()) != request[field+'Hash']:
                raise AssertionError('Completed result artifact changed during comparison')
        np.savez(workspace/'partitions.npz', ids=np.array(ids), labels=np.array([r.labels for r in runs]),
                 pcaSelectedLabels=np.array([r.labels for r in pca_runs]), controlLabels=np.array([r.labels for r in controls]))
        labels = runs[0].labels
        timings['validation'] = evaluate.seconds
    else:
        raise AssertionError('Invalid method')
    result['labels'] = labels.tolist()
    result['assignmentsHash'] = digest((workspace/'partitions.npz').read_bytes())
    result['nativeSpace'] = 'standardized_13' if request['method'] == 'standard' else 'retained_pcs'
    if request['method'] != 'comparison':
        result['initializationEvidence'] = measured('evidence', lambda: {request['method']: derive([run.labels for run in runs], 1 if request['method'] == 'enhanced' else 0, ids)})
        result['fitEvidence'] = [{'run': i, 'inertia': float(run.inertia), 'iterations': run.iterations} for i, run in enumerate(runs)]
    result['centroids'] = [{'cluster': c, 'x': float(xy[labels == c, 0].mean()), 'y': float(xy[labels == c, 1].mean())} for c in range(k)]
    result['timings'] = timings
    result['cacheHits'] = hits
    timings['total'] = perf_counter()-start
    write_json(workspace/'result.json', result)
    return result


if __name__ == '__main__':
    workspace = Path(sys.argv[1]).resolve()
    execute(json.loads((workspace/'request.json').read_text()), workspace)
