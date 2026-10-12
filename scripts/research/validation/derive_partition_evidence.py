"""Read-only aggregate evidence from immutable, hash-linked method assignments."""
import hashlib
import json
import sys
from itertools import combinations
from pathlib import Path
import numpy as np
from sklearn.metrics import adjusted_rand_score
from sklearn.metrics.cluster import contingency_matrix
from scipy.optimize import linear_sum_assignment


def six_decimal_match(*values):
    return len({format(float(value), '.6f') for value in values}) == 1


def ari_from_contingency(table):
    """Exact integer combination terms; floating division only at the end."""
    table = np.asarray(table)
    if table.shape != (2, 2) or not np.issubdtype(table.dtype, np.integer) or np.any(table < 0):
        raise ValueError('ARI calculation requires a two-by-two count table')
    choose2 = lambda n: int(n) * (int(n) - 1) // 2
    rows, columns = table.sum(axis=1), table.sum(axis=0)
    n = int(table.sum())
    if n < 2:
        raise ValueError('Incomplete ARI cohort')
    cells = sum(choose2(value) for value in table.flat)
    a = sum(choose2(value) for value in rows)
    b = sum(choose2(value) for value in columns)
    total = choose2(n)
    expected = a * b / total
    maximum = (a + b) / 2
    ari = (cells - expected) / (maximum - expected) if maximum != expected else 1.0
    return dict(n_ij=table.tolist(), a_i=rows.tolist(), b_j=columns.tolist(), N=n,
                terms=dict(sumCellChoose2=cells, sumRowChoose2=a, sumColumnChoose2=b,
                           totalChoose2=total, expectedIndex=expected, maxIndex=maximum),
                ariRecalculated=ari)


def ari_calculation(labels, ids_by_run, first_run=0, stored_matrix=None):
    """One aggregate calculation; reject differently ordered cohorts."""
    labels = np.asarray(labels)
    if len(ids_by_run) != len(labels) or any(len(ids) != labels.shape[1] or len(set(ids)) != len(ids) for ids in ids_by_run):
        raise ValueError('Incomplete ARI ordered cohort')
    hashes = [hashlib.sha256(json.dumps(list(ids), separators=(',', ':')).encode()).hexdigest() for ids in ids_by_run]
    if len(set(hashes)) != 1:
        raise ValueError('ARI cohort or participant order mismatch')
    if first_run == 1:
        left, right = 0, 1
    else:
        # Earliest seed pair breaks ties in the minimum stored ARI.
        left, right = min(combinations(range(len(labels)), 2),
                          key=lambda pair: (float(stored_matrix[pair[0]][pair[1]]) if stored_matrix is not None
                                            else float(adjusted_rand_score(labels[pair[0]], labels[pair[1]])), pair))
    table = contingency_matrix(labels[left], labels[right])
    calculation = ari_from_contingency(table)
    sklearn_ari = float(adjusted_rand_score(labels[left], labels[right]))
    stored_ari = float(stored_matrix[left][right]) if stored_matrix is not None else sklearn_ari
    match = six_decimal_match(calculation['ariRecalculated'], stored_ari, sklearn_ari)
    if not match:
        raise ValueError('ARI calculation does not match stored and scikit-learn ARI to six decimals')
    calculation.update(pair=dict(kind='run' if first_run == 1 else 'seed', first=left + first_run, second=right + first_run),
                       ariStored=stored_ari, sklearnAri=sklearn_ari, match=match,
                       cohort=dict(ridHashes=[hashes[left], hashes[right]], identical=hashes[left] == hashes[right]))
    return calculation


def enhanced_repetitions(result, ids, labels):
    """Use D1 only for the same prepared geometry and stored partition.

    A subset or another dataset retains its own existing repetitions.
    """
    root = Path(__file__).resolve().parents[3]
    folder = root / 'apps/api/private/final-ui-evidence'
    if not (folder / 'enhanced-30-report.json').exists():
        return labels
    report = json.loads((folder / 'enhanced-30-report.json').read_text())
    artifact = folder / 'enhanced-30-partitions.npz'
    if digest(artifact) != report['artifactSha256'] or any(digest(root / name) != sha for name, sha in report['sources'].items()):
        raise ValueError('D1 evidence source drift')
    with np.load(artifact, allow_pickle=False) as saved:
        stored_ids, repeated = saved['ids'].tolist(), saved['labels'].copy()
    if set(ids) != set(stored_ids):
        return labels
    import csv
    with (root / 'data/interim/clustering_pca_scores.csv').open(encoding='utf-8-sig', newline='') as handle:
        geometry = {row['RID']: [float(row['PC1']), float(row['PC2'])] for row in csv.DictReader(handle)}
    if not np.allclose(result['common']['xy'], [geometry[rid] for rid in ids], rtol=1e-12, atol=1e-12):
        return labels
    ordered = repeated[:, [stored_ids.index(rid) for rid in ids]]
    if not all(adjusted_rand_score(ordered[0], row) == 1 for row in labels):
        return labels
    return ordered


def derive(partitions, first_run=0, ids=None):
    labels = np.asarray(partitions)
    if labels.ndim != 2 or min(labels.shape) < 2 or not np.issubdtype(labels.dtype, np.integer) or np.any(labels < 0):
        raise ValueError('Incomplete aligned partitions')
    groups = {}
    keys = []
    for i, row in enumerate(labels):
        mapping = {}
        key = tuple(mapping.setdefault(int(v), len(mapping)) for v in row)
        keys.append(key)
        if key not in groups:
            groups[key] = [i, 0]
        groups[key][1] += 1
    ordered = sorted(groups.values(), key=lambda g: (-g[1], g[0]))
    names = {keys[i]: chr(65 + rank) for rank, (i, _) in enumerate(ordered)}
    modal, frequency = ordered[0]
    pairs = [float(adjusted_rand_score(a, b)) for a, b in combinations(labels, 2)]
    differences = []
    for a, b in combinations(labels, 2):
        table = contingency_matrix(a, b)
        rows, columns = linear_sum_assignment(-table)
        differences.append(len(a) - int(table[rows, columns].sum()))
    output = dict(executions=len(labels),
                pairwiseAriMatrix=[[float(adjusted_rand_score(a, b)) for b in labels] for a in labels],
                partitionMembership=[names[key] for key in keys],
                modalPartitionPercent=100 * frequency / len(labels),
                partitionFrequencies=[dict(partition=f'Partition {i+first_run}', frequency=n) for i, n in ordered],
                modalReferenceRun=modal+first_run,
                modalPartitionAri=[dict(seed=i+first_run, adjustedRandIndex=float(adjusted_rand_score(labels[modal], row))) for i, row in enumerate(labels)],
                pairwiseComparisons=len(pairs), uniqueFinalPartitions=len(ordered), modalPartitionFrequency=frequency,
                minimumPairwiseAri=min(pairs), meanPairwiseAri=float(np.mean(pairs)), maximumDifferingParticipants=max(differences))
    if ids is not None and all(len(np.unique(row)) == 2 for row in labels):
        output['ariCalculation'] = ari_calculation(labels, [ids] * len(labels), first_run, output['pairwiseAriMatrix'])
    return output


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load(folder, key, count, expected_ids=None):
    result = json.loads((folder/'result.json').read_text())
    job = json.loads((folder/'job.json').read_text())
    if job['status'] != 'complete' or job['result'] != result or digest(folder/'partitions.npz') != result.get('assignmentsHash'):
        raise ValueError('Completed assignment provenance mismatch')
    with np.load(folder/'partitions.npz', allow_pickle=False) as saved:
        ids = saved['ids'].tolist()
        labels = saved[key].copy()
        if saved['labels'][0].tolist() != result['labels']:
            raise ValueError('Result partition mismatch')
    if len(ids) != result['common']['participantCount'] or len(set(ids)) != len(ids) or any(not v for v in ids) or labels.shape != (count, len(ids)):
        raise ValueError('Incomplete assignment cohort')
    if expected_ids is not None and ids != expected_ids:
        raise ValueError('Assignment order mismatch')
    if hashlib.sha256(json.dumps(ids, separators=(',', ':')).encode()).hexdigest() != result['provenance']['participantsHash']:
        raise ValueError('Participant provenance mismatch')
    return result, ids, labels


def evidence(folder, final_ui=False):
    result = json.loads((folder/'result.json').read_text())
    method = result['method']
    result, ids, labels = load(folder, 'controlLabels' if method == 'comparison' else 'labels', 3 if method == 'enhanced' else 30)
    if method != 'comparison':
        rows = result['standard']['ariBySeed'] if method == 'standard' else result['enhanced']['dpc']['ariByRun']
        if any(abs(float(adjusted_rand_score(labels[0], row)) - rows[i]['adjustedRandIndex']) > 1e-12 for i, row in enumerate(labels)):
            raise ValueError('Designated reference ARI mismatch')
        return {method: derive(enhanced_repetitions(result, ids, labels) if method == 'enhanced' and final_ui else labels, 1 if method == 'enhanced' else 0, ids)}
    job = json.loads((folder/'job.json').read_text())
    output = {'pcaRandom': derive(labels, ids=ids)}
    for name, count in [('standard', 30), ('enhanced', 3)]:
        source = folder.parent/job[name+'Id']
        other, _, assignments = load(source, 'labels', count, ids)
        hashes = result['comparisonSources'][name]
        if other['provenance'] != result['provenance'] or digest(source/'result.json') != hashes['resultHash'] or other['assignmentsHash'] != hashes['assignmentsHash']:
            raise ValueError('Comparison source mismatch')
        output[name] = derive(assignments, 1 if name == 'enhanced' else 0, ids)
    if result['sopControls']['nbclustRandom']['k'] != other['enhanced']['selectedK']:
        raise ValueError('Controlled initialization k mismatch')
    for i, row in enumerate(labels):
        expected = result['sopControls']['randomAriBySeed'][i]['adjustedRandIndex']
        if abs(float(adjusted_rand_score(assignments[0], row)) - expected) > 1e-12:
            raise ValueError('Controlled designated reference ARI mismatch')
    for name, derived in output.items():
        pair = result['commonSpace']['pairwise'][name]
        if derived['pairwiseComparisons'] != pair['pairCount'] or abs(derived['minimumPairwiseAri'] - pair['minimum']) > 1e-12 or abs(derived['meanPairwiseAri'] - pair['mean']) > 1e-12:
            raise ValueError('Pairwise reference summary mismatch')
    if final_ui:
        output['enhanced'] = derive(enhanced_repetitions(other, ids, assignments), 1, ids)
    return output


def add_stored_ari_calculations():
    """Enrich only the optional record; preserve every stored result value."""
    import csv
    import copy
    root = Path(__file__).resolve().parents[3]
    path = root / 'apps/web/src/data/finalUiEvidence.json'
    saved = json.loads(path.read_text())
    original = copy.deepcopy(saved)
    for name, expected in saved['sources'].items():
        if digest(root / name) != expected:
            raise ValueError('Stored ARI source drift')
    for method, source in [('standard', 'baseline_kmeans_assignments.csv'), ('pcaRandom', 'dpc_comparison_random_assignments.csv')]:
        with (root / 'data/interim' / source).open(encoding='utf-8-sig', newline='') as handle:
            records = list(csv.DictReader(handle))
        seeds = sorted({int(row['seed']) for row in records})
        if seeds != list(range(30)):
            raise ValueError('Incomplete stored seed sets')
        runs = [[row for row in records if int(row['seed']) == seed] for seed in seeds]
        ids = [[row['RID'] for row in rows] for rows in runs]
        labels = [[int(row['cluster_label']) for row in rows] for rows in runs]
        saved['initializationEvidence'][method]['ariCalculation'] = ari_calculation(
            labels, ids, stored_matrix=saved['initializationEvidence'][method]['pairwiseAriMatrix'])
    with np.load(root / 'apps/api/private/final-ui-evidence/enhanced-30-partitions.npz', allow_pickle=False) as source:
        labels, ids = source['labels'].copy(), source['ids'].tolist()
    saved['initializationEvidence']['enhanced']['ariCalculation'] = ari_calculation(
        labels, [ids] * len(labels), 1, saved['initializationEvidence']['enhanced']['pairwiseAriMatrix'])
    stripped = copy.deepcopy(saved)
    for method in stripped['initializationEvidence']:
        stripped['initializationEvidence'][method].pop('ariCalculation', None)
        original['initializationEvidence'][method].pop('ariCalculation', None)
    if stripped != original:
        raise ValueError('An existing evidence value changed')
    for name, expected in saved['sources'].items():
        if digest(root / name) != expected:
            raise ValueError('Source artifact changed')
    path.write_text(json.dumps(saved, indent=2, allow_nan=False) + '\n', encoding='utf-8')
    # Only pair identifiers and aggregate counts are emitted.
    calculation = saved['initializationEvidence']['standard']['ariCalculation']
    print(json.dumps({key: calculation[key] for key in ['pair', 'n_ij', 'ariRecalculated', 'match', 'cohort']}))


if __name__ == '__main__':
    try:
        if sys.argv[1:] == ['--ari-calculations']:
            add_stored_ari_calculations()
        else:
            print(json.dumps(evidence(Path(sys.argv[1]), '--final-ui' in sys.argv[2:])))
    except Exception:
        sys.stderr.write('Saved partition evidence failed provenance or completeness validation.\n')
        sys.exit(1)
