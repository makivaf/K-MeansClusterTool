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


def assert_membership(actual, expected):
    if len(actual) != 1949 or len(set(actual)) != 1949 or set(actual) != set(expected):
        raise AssertionError('Simulation membership changed')


def metrics(run):
    return {key: float(getattr(run, key)) for key in ('silhouette', 'davies_bouldin', 'calinski_harabasz')}


def main():
    request = json.loads((ROOT / 'request.json').read_text())
    # Refuse execution from the repository or any workspace without this marker.
    if request.get('isolatedSimulation') is not True or (ROOT / '.git').exists():
        raise AssertionError('An isolated simulation workspace is required')
    ids = request['sampleParticipantIds']
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
    scores, variance, loadings, _, components = prep.apply_pca(standardized, expected_rows=len(ids))
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
    k, candidates = baseline.select_baseline_k(X, expected_shape=X.shape)
    runs = baseline.run_baseline_replications(X, k, expected_shape=X.shape)
    # Reuse the canonical writer, including its summary and metric comparison.
    baseline.write_outputs(standardized.PTID.tolist(), baseline_ids, k, candidates, runs, {
        'silhouette_coefficient': result.silhouette,
        'davies_bouldin_index': result.davies_bouldin,
        'calinski_harabasz_index': result.calinski_harabasz,
    })
    existing = {
        'participantCount': len(ids), 'selectedK': k, 'initialization': 'random',
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
                'centers': [{'rho': initialization.rho[i], 'delta': initialization.delta[i], 'gamma': initialization.gamma[i]} for i in initialization.selected_indices]},
    }}
    (ROOT / 'result.json').write_text(json.dumps(output, allow_nan=False))
    digest = lambda values: hashlib.sha256(json.dumps(values, separators=(',', ':')).encode()).hexdigest()
    (ROOT / 'membership-proof.json').write_text(json.dumps({'sampleCount': len(ids), 'selected': digest(ids), 'existing': digest(baseline_ids), 'enhanced': digest(enhanced_ids), 'identical': baseline_ids == enhanced_ids == ids}))
    print('paired_complete', flush=True)


if __name__ == '__main__':
    main()
