"""Evaluate saved partitions; never fit or relabel the stored assignments."""
import hashlib
from itertools import combinations
import numpy as np
from scipy.optimize import linear_sum_assignment
from sklearn.metrics import adjusted_rand_score
from sklearn.metrics.cluster import contingency_matrix
from exact_runtime import ExactMetrics, KEYS


def pairwise(labels):
    values = [float(adjusted_rand_score(a, b)) for a, b in combinations(labels, 2)]
    return dict(runCount=len(labels), pairCount=len(values), mean=float(np.mean(values)),
                minimum=min(values), maximum=max(values), median=float(np.median(values)),
                exactMatches=sum(v == 1 for v in values))


def aligned_agreement(reference, candidate):
    table = contingency_matrix(reference, candidate)
    a, b = linear_sum_assignment(-table)
    matched = int(table[a, b].sum())
    return dict(ari=float(adjusted_rand_score(reference, candidate)),
                agreementCount=matched,
                disagreementCount=len(reference)-matched,
                disagreementPercent=100*(len(reference)-matched)/len(reference))


def load_partitions(path, result, ids, count):
    if hashlib.sha256(path.read_bytes()).hexdigest() != result.get('assignmentsHash'):
        raise AssertionError('Assignment artifact hash mismatch or missing provenance')
    with np.load(path, allow_pickle=False) as saved:
        labels = saved['labels'].copy()
        if saved['ids'].tolist() != ids or labels.shape != (count, len(ids)):
            raise AssertionError('Assignment order or repetition count mismatch')
    if not np.issubdtype(labels.dtype, np.integer) or np.any(labels < 0):
        raise AssertionError('Invalid assignment labels')
    if labels[0].tolist() != result['labels']:
        raise AssertionError('Result and assignment artifact disagree')
    return labels


def evaluate_common_spaces(X, Z, standard, random, enhanced, ids):
    if len(standard) != 30 or len(random) != 30 or len(enhanced) != 3:
        raise AssertionError('All required repetitions must be evaluated')
    if not all(np.array_equal(enhanced[0], row) for row in enhanced):
        raise AssertionError('DPC repetitions changed assignments')
    output = []
    for name, matrix in [('standardized_13', X), ('retained_pcs', Z)]:
        evaluator = ExactMetrics(matrix)
        conditions = {}
        for method, labels in [('standard', standard), ('pcaRandom', random), ('enhanced', enhanced)]:
            values = np.array([evaluator(row) for row in labels])
            conditions[method] = dict(runCount=len(labels),
                mean=dict(zip(KEYS, values.mean(axis=0).tolist())),
                minimum=dict(zip(KEYS, values.min(axis=0).tolist())),
                maximum=dict(zip(KEYS, values.max(axis=0).tolist())),
                runs=[dict(zip(KEYS, row.tolist())) for row in values],
                calculation=evaluator.calculation(labels[0], ids, name, 0))
        a, b = conditions['standard']['mean'], conditions['enhanced']['mean']
        comparison = []
        for key in KEYS:
            favorable = a[key]-b[key] if key == 'davies_bouldin' else b[key]-a[key]
            comparison.append(dict(metric=key, direction='lower_is_better' if key == 'davies_bouldin' else 'higher_is_better',
                existing=a[key], enhanced=b[key], difference=b[key]-a[key],
                relativeImprovementPercent=None if a[key] == 0 else 100*favorable/abs(a[key]),
                favorableMethod='equal' if favorable == 0 else 'enhanced' if favorable > 0 else 'existing'))
        matrix_hash = hashlib.sha256(np.ascontiguousarray(matrix, dtype='<f8').tobytes()).hexdigest()
        output.append(dict(space=name, dimensions=matrix.shape[1], primary=name=='standardized_13', matrixHash=matrix_hash,
                           conditions=conditions, comparison=comparison))
    return dict(version='common-space-v2', spaces=output,
        pairwise={name: pairwise(labels) for name, labels in [('standard', standard), ('pcaRandom', random), ('enhanced', enhanced)]},
        crossMethod=[dict(seed=i, enhancedRun=1, **aligned_agreement(row, enhanced[0])) for i, row in enumerate(standard)],
        randomVersusDpc=[dict(seed=i, adjustedRandIndex=float(adjusted_rand_score(row, enhanced[0]))) for i,row in enumerate(random)],
        dpcAssignmentsIdentical=True)
