"""Private, isolated adapter to canonical algorithms; no study publication stages.

The API copies research sources and a checksum-verified cohort into a fresh
workspace. Optional shape parameters leave every full-study default intact.
"""
from pathlib import Path
import hashlib
import json
import sys

ROOT = Path(__file__).resolve().parents[3]
sys.path[:0] = [str(ROOT / 'scripts/research/study_entry'), str(ROOT / 'scripts/research/comparison')]
import numpy as np
import preprocess_study_entry as prep
import run_baseline_kmeans_comparison as baseline
import run_enhanced_kmeans as enhanced
import dpc_initialize_clusters as dpc
import run_dpc_initialization_comparison as sop3


def assert_membership(actual, expected):
    if not 100 <= len(expected) <= 2437 or len(actual) != len(expected) or len(set(actual)) != len(expected) or set(actual) != set(expected):
        raise AssertionError('Simulation membership changed')


def metrics(run):
    return {key: float(getattr(run, key)) for key in ('silhouette', 'davies_bouldin', 'calinski_harabasz')}


def select_standard_k(configuration, silhouette_k):
    return configuration['manualK'] if configuration and configuration.get('manualK') is not None else silhouette_k


def main():
    request = json.loads((ROOT / 'request.json').read_text())
    # Refuse execution from the repository or any workspace without this marker.
    if request.get('isolatedSimulation') is not True or (ROOT / '.git').exists():
        raise AssertionError('An isolated simulation workspace is required')
    configuration = request.get('configuration')
    ids = request['sampleParticipantIds']
    if configuration is not None:
        if (configuration.get('sampleMode') not in ('full', 'custom')
                or type(configuration.get('sampleCount')) is not int
                or configuration['sampleCount'] != len(ids)
                or (configuration['sampleMode'] == 'full' and len(ids) != 2437)
                or (configuration.get('manualK') is not None and
                    (type(configuration['manualK']) is not int or not 2 <= configuration['manualK'] <= 10))):
            raise AssertionError('Invalid runtime configuration')
    assert_membership(ids, ids)
    source = prep.read_csv_as_text(prep.AUTHORITATIVE_INPUT)
    selected = source.loc[source.RID.isin(ids)].copy()
    assert_membership(selected.RID.tolist(), ids)
    selected = selected.set_index('RID').loc[ids].reset_index()
    phases = selected.ENTRY_PHASE.value_counts().to_dict()
    if phases != request['phaseSampleCounts']:
        raise AssertionError('Simulation phase membership changed')
    retained = prep.build_retained_feature_table(selected, expected_phase_counts=phases, expected_rows=len(ids))
    missing = {name: int(retained[name].isna().sum()) for name in prep.RETAINED_FEATURES}
    imputed, summary = prep.median_impute_features(retained, expected_missing_counts=missing)
    standardized, summary, _ = prep.standardize_features(imputed, summary)
    scores, variance, loadings, pca, components = prep.apply_pca(standardized, expected_rows=len(ids))
    prep.validate_final_outputs(retained, imputed, standardized, scores, variance, components, expected_rows=len(ids))
    prep.write_outputs(retained, imputed, standardized, scores, variance, loadings, summary)
    print('preprocessing_complete', flush=True)

    # Canonical file loader validates the baseline schema; Enhanced uses the
    # canonical PCA table directly so its component count is data-derived.
    _, baseline_ids, X = baseline.load_baseline_input(expected_shape=(len(ids), 13))
    enhanced_ids = scores.RID.tolist()
    assert_membership(baseline_ids, ids)
    assert_membership(enhanced_ids, ids)
    if baseline_ids != enhanced_ids:
        raise AssertionError('Paired input order differs')
    matrix = scores.loc[:, [f'PC{i}' for i in range(1, components + 1)]].to_numpy(dtype=float)
    import select_cluster_count_nbclust as nb
    selection = nb.select_k_nbclust(matrix.tolist(), expected_shape=matrix.shape)
    if selection != nb.select_k_nbclust(matrix.tolist(), expected_shape=matrix.shape):
        raise AssertionError('NbClust reproducibility failed')
    print('nbclust_complete', flush=True)
    initializations = [dpc.dpc_init(matrix.tolist(), selection.selected_k, cutoff_percentile=dpc.STUDY_CUTOFF_PERCENTILE) for _ in range(dpc.DETERMINISM_RUNS)]
    dpc.validate_repeated_runs(initializations)
    initialization = initializations[0]
    enhanced_runs = [enhanced.run_enhanced_kmeans(matrix, np.asarray(initialization.centroid_matrix), selection.selected_k, expected_shape=matrix.shape) for _ in range(enhanced.REPRODUCIBILITY_RUNS)]
    enhanced.validate_reproducibility(enhanced_runs)
    result = enhanced_runs[0]
    print('enhanced_complete', flush=True)
    silhouette_k, candidates = baseline.select_baseline_k(X, expected_shape=X.shape)
    k = select_standard_k(configuration, silhouette_k)
    runs = baseline.run_baseline_replications(X, k, expected_shape=X.shape)
    # Reuse the canonical writer, including its summary and metric comparison.
    baseline.write_outputs(standardized.PTID.tolist(), baseline_ids, k, candidates, runs, {
        'silhouette_coefficient': result.silhouette,
        'davies_bouldin_index': result.davies_bouldin,
        'calinski_harabasz_index': result.calinski_harabasz,
    })
    existing = {
        'participantCount': len(ids), 'selectedK': k, 'initialization': 'random',
        'silhouetteSelectedK': silhouette_k,
        'silhouetteByK': [{'k': run.k, 'silhouette': run.silhouette} for run in candidates],
        'metrics': {key: baseline._descriptive([metrics(run)[key] for run in runs])['mean'] for key in metrics(result)},
        'runs': [{'seed': run.seed, 'iterations': run.iterations, 'convergedBeforeMaxIter': run.iterations < baseline.MAX_ITER,
                  'clusterSizes': list(run.cluster_sizes), 'metrics': metrics(run)} for run in runs],
    }
    output = {'existing': existing, 'enhanced': {
        'participantCount': len(ids), 'selectedK': selection.selected_k, 'initialization': 'DPC',
        'iterations': result.iterations, 'convergedBeforeMaxIter': result.iterations < enhanced.MAX_ITER,
        'clusterSizes': np.bincount(result.labels).tolist(), 'metrics': metrics(result),
        'retainedVariables': list(prep.RETAINED_FEATURES), 'excludedVariables': ['BNT', 'NPIQ'],
        'pcaComponents': components, 'cumulativeExplainedVariance': float(variance.iloc[components - 1].cumulative_explained_variance),
        'pcaVariance': [{'component': int(row.component_number), 'explainedVarianceRatio': float(row.explained_variance_ratio), 'cumulativeExplainedVariance': float(row.cumulative_explained_variance)} for row in variance.itertuples()],
        'nbclust': {'votes': [{'k': k, 'count': count} for k, count in selection.vote_counts],
                    'indices': [{'index': item.index, 'status': item.status, 'recommendedK': item.recommended_k} for item in selection.index_results],
                    'tieOccurred': len(selection.leaders) > 1, 'reproducible': True},
        'dpc': {'cutoffPercentile': initialization.cutoff_percentile, 'distanceCutoff': initialization.d_c,
                'centroidCount': len(initialization.selected_indices), 'dimensions': initialization.dimensionality,
                'pairwiseDistanceCount': initialization.pairwise_distance_count, 'determinismPassed': True,
                'decisionGraph': [{'rho': initialization.rho[i], 'delta': initialization.delta[i], 'gamma': initialization.gamma[i], 'selected': i in initialization.selected_indices} for i in range(len(ids))],
                'centers': [{'coordinates': list(initialization.centroid_matrix[position]), 'rho': initialization.rho[i], 'delta': initialization.delta[i], 'gamma': initialization.gamma[i]} for position, i in enumerate(initialization.selected_indices)]},
    }}
    # One common projection; labels remain those fitted in each canonical space.
    xy = pca.transform(X)[:, :2]
    def centroids(labels, cluster_count):
        return [{'cluster': cluster, 'x': float(xy[labels == cluster, 0].mean()),
                 'y': float(xy[labels == cluster, 1].mean())} for cluster in range(cluster_count)]
    correlation = np.corrcoef(X, rowvar=False)
    output['correlation'] = [[float(value) if np.isfinite(value) else None for value in row] for row in correlation]
    output['projection'] = {
        'standardSeed': runs[0].seed,
        'points': [{'x': float(point[0]), 'y': float(point[1]), 'standard': int(runs[0].labels[i]),
                    'enhanced': int(result.labels[i])} for i, point in enumerate(xy)],
        'standardCentroids': centroids(runs[0].labels, k),
        'enhancedCentroids': centroids(result.labels, selection.selected_k),
    }
    if configuration:
        # Existing SOP 3 fitter; same PCA, automatic k, and canonical parameters.
        controls = [sop3.fit_random_pca_kmeans(matrix, seed, seed + 1,
                    expected_shape=matrix.shape, selected_k=selection.selected_k) for seed in sop3.SEEDS]
        keys = tuple(metrics(result))
        summaries = {key: sop3._descriptive([getattr(run, key) for run in controls]) for key in keys}
        (ROOT / 'random-control.json').write_text(json.dumps({
            'runs': [{'metrics': metrics(run), 'clusterSizes': list(run.cluster_sizes)} for run in controls],
            'randomMean': {key: summaries[key]['mean'] for key in keys},
            'randomSd': {key: summaries[key]['standard_deviation_ddof_1'] for key in keys}
        }, allow_nan=False))
    (ROOT / 'result.json').write_text(json.dumps(output, allow_nan=False))
    digest = lambda values: hashlib.sha256(json.dumps(values, separators=(',', ':')).encode()).hexdigest()
    (ROOT / 'membership-proof.json').write_text(json.dumps({'sampleCount': len(ids), 'selected': digest(ids), 'existing': digest(baseline_ids), 'enhanced': digest(enhanced_ids), 'identical': baseline_ids == enhanced_ids == ids}))
    print('paired_complete', flush=True)


if __name__ == '__main__':
    main()
