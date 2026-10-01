"""Populate aggregate evidence from existing fits or an isolated saved workspace.

Never fits PCA or invokes NbClust. Participant labels remain private.
"""
from pathlib import Path
import csv
import json
import sys
import numpy as np
from sklearn.metrics import adjusted_rand_score

SOURCE_ROOT = Path(__file__).resolve().parents[3]
sys.path[:0] = [str(SOURCE_ROOT / 'scripts/research/study_entry'), str(SOURCE_ROOT / 'scripts/research/comparison')]
import run_baseline_kmeans_comparison as baseline
import run_enhanced_kmeans as enhanced
import dpc_initialize_clusters as dpc
import run_dpc_initialization_comparison as sop3


def attach_evidence(output, matrix, eigenvalues, standard_labels, enhanced_labels, random_control=None,
                    control_runs=None, calculation_partition=None):
    assert len(standard_labels) == 30 and len(enhanced_labels) == enhanced.REPRODUCIBILITY_RUNS
    n = output['existing']['participantCount']
    assert all(len(labels) == n for labels in [*standard_labels, *enhanced_labels])
    output['existing']['ariBySeed'] = [
        {'seed': seed, 'adjustedRandIndex': float(adjusted_rand_score(standard_labels[0], labels))}
        for seed, labels in enumerate(standard_labels)]
    output['enhanced']['dpc']['ariByRun'] = [
        {'seed': run, 'adjustedRandIndex': float(adjusted_rand_score(enhanced_labels[0], labels))}
        for run, labels in enumerate(enhanced_labels, 1)]
    assert len(eigenvalues) == len(output['enhanced']['pcaVariance']) == 13
    for row, eigenvalue in zip(output['enhanced']['pcaVariance'], eigenvalues):
        row['eigenvalue'] = float(eigenvalue)
    # Same k, seeds 0..29, n_init=1, tolerance and Lloyd procedure on both
    # representations. Reuse the existing PCA random control when k agrees.
    assert (baseline.N_INIT, baseline.MAX_ITER, baseline.TOLERANCE, baseline.ALGORITHM) == (
        sop3.N_INIT, sop3.MAX_ITER, sop3.TOLERANCE, sop3.ALGORITHM)
    k = output['existing']['selectedK']
    keys = ('silhouette', 'davies_bouldin', 'calinski_harabasz')
    if random_control is not None and k == output['enhanced']['selectedK']:
        pca_mean = random_control['randomMean']
        example_run = control_runs[0] if control_runs is not None else None
    else:
        fits = baseline.run_baseline_replications(matrix, k, expected_shape=matrix.shape)
        pca_mean = {key: baseline._descriptive([getattr(run, key) for run in fits])['mean'] for key in keys}
        example_run = fits[0]
    # Capture an already computed fit only. Historical controls without labels
    # remain unavailable; no fit is added for calculation display.
    if calculation_partition is not None and example_run is not None:
        calculation_partition.update({'seed': int(example_run.seed), 'k': k,
            'labels': [int(label) for label in example_run.labels],
            'metrics': {key: float(getattr(example_run, key)) for key in keys}})
    original_mean = output['existing']['metrics']
    output['pcaContribution'] = {'k': k, 'runCount': 30, 'existing': original_mean,
        'enhanced': pca_mean, 'relativeChange': {
            key: None if original_mean[key] == 0 else 100 * (pca_mean[key] - original_mean[key]) / abs(original_mean[key])
            for key in keys}}
    return output


def enrich_workspace(workspace):
    workspace = Path(workspace).resolve()
    request = json.loads((workspace / 'request.json').read_text())
    if request.get('isolatedSimulation') is not True or (workspace / '.git').exists():
        raise AssertionError('An isolated simulation workspace is required')
    def rows(name):
        with (workspace / 'data/interim' / name).open(encoding='utf-8-sig', newline='') as handle:
            return list(csv.DictReader(handle))
    output = json.loads((workspace / 'result.json').read_text())
    ids = request['sampleParticipantIds']
    pca = rows('clustering_pca_scores.csv')
    assert [row['RID'] for row in pca] == ids
    matrix = np.asarray([[float(row[f'PC{i}']) for i in range(1, output['enhanced']['pcaComponents'] + 1)] for row in pca])
    assignments = rows('baseline_kmeans_assignments.csv')
    standard_labels = []
    for seed in baseline.BASELINE_SEEDS:
        selected = [row for row in assignments if int(row['seed']) == seed]
        assert [row['RID'] for row in selected] == ids
        standard_labels.append([int(row['cluster_label']) for row in selected])
        assert np.bincount(standard_labels[-1]).tolist() == output['existing']['runs'][seed]['clusterSizes']
    assert standard_labels[0] == [point['standard'] for point in output['projection']['points']]
    # Original repeated labels were not persisted. Repeat only DPC + Lloyd
    # using the saved PCA matrix and saved selected k; no preprocessing/R.
    k = output['enhanced']['selectedK']
    initializations = [dpc.dpc_init(matrix.tolist(), k, cutoff_percentile=dpc.STUDY_CUTOFF_PERCENTILE)
                       for _ in range(enhanced.REPRODUCIBILITY_RUNS)]
    dpc.validate_repeated_runs(initializations)
    fits = [enhanced.run_enhanced_kmeans(matrix, np.asarray(init.centroid_matrix), k, expected_shape=matrix.shape)
            for init in initializations]
    enhanced.validate_reproducibility(fits)
    reference = [point['enhanced'] for point in output['projection']['points']]
    assert adjusted_rand_score(reference, fits[0].labels) == 1
    for key in ('silhouette', 'davies_bouldin', 'calinski_harabasz'):
        assert np.isclose(getattr(fits[0], key), output['enhanced']['metrics'][key], rtol=1e-12, atol=1e-12)
    control_path = workspace / 'random-control.json'
    control = json.loads(control_path.read_text()) if control_path.exists() else None
    result = attach_evidence(output, matrix, [float(row['explained_variance']) for row in rows('clustering_pca_explained_variance.csv')],
                             standard_labels, [run.labels for run in fits], control)
    (workspace / 'evidence-result.json').write_text(json.dumps(result, allow_nan=False))


if __name__ == '__main__':
    enrich_workspace(sys.argv[1])
