"""D2 aggregate evidence from D1 labels and stored Standard/PCA-random labels."""
import csv
import hashlib
import json
from pathlib import Path
import numpy as np
from scipy.optimize import linear_sum_assignment
from sklearn.metrics import adjusted_rand_score
from sklearn.metrics.cluster import contingency_matrix
from derive_partition_evidence import derive

ROOT = Path(__file__).resolve().parents[3]


def read_labels(path, ids):
    with path.open(encoding='utf-8-sig', newline='') as handle:
        rows = list(csv.DictReader(handle))
    seeds = sorted({int(row['seed']) for row in rows})
    assert seeds == list(range(30))
    arrays = []
    for seed in seeds:
        selected = [row for row in rows if int(row['seed']) == seed]
        lookup = {row['RID']: int(row['cluster_label']) for row in selected}
        assert len(selected) == len(lookup) == len(ids) and set(lookup) == set(ids)
        arrays.append([lookup[rid] for rid in ids])
    return np.array(arrays)


def execute():
    folder = ROOT / 'apps/api/private/final-ui-evidence'
    path = folder / 'enhanced-30-partitions.npz'
    report = json.loads((folder / 'enhanced-30-report.json').read_text())
    assert hashlib.sha256(path.read_bytes()).hexdigest() == report['artifactSha256']
    for name, sha in report['sources'].items():
        assert hashlib.sha256((ROOT / name).read_bytes()).hexdigest() == sha
    with np.load(path, allow_pickle=False) as saved:
        ids, enhanced = saved['ids'].tolist(), saved['labels'].copy()
    sources = [ROOT / 'data/interim/baseline_kmeans_assignments.csv', ROOT / 'data/interim/dpc_comparison_random_assignments.csv']
    standard, random = [read_labels(source, ids) for source in sources]
    evidence = {'standard': derive(standard), 'pcaRandom': derive(random), 'enhanced': derive(enhanced, 1)}
    for method in evidence.values():
        matrix = np.asarray(method['pairwiseAriMatrix'])
        assert matrix.shape == (30, 30) and np.array_equal(matrix, matrix.T) and np.all(matrix.diagonal() == 1)
        assert method['pairwiseComparisons'] == 435
    table = contingency_matrix(standard[0], enhanced[0])
    rows, columns = linear_sum_assignment(-table)
    output = {'initializationEvidence': evidence,
              'standardSeed0VersusEnhanced': {'ari': float(adjusted_rand_score(standard[0], enhanced[0])),
                 'differingParticipants': len(ids) - int(table[rows, columns].sum())},
              'headline': {'standardModalPercent': evidence['standard']['modalPartitionPercent'],
                 'enhancedModalPercent': evidence['enhanced']['modalPartitionPercent'],
                 'differencePercentagePoints': evidence['enhanced']['modalPartitionPercent'] - evidence['standard']['modalPartitionPercent']},
              'sources': {str(source.relative_to(ROOT)): hashlib.sha256(source.read_bytes()).hexdigest() for source in [path, *sources]}}
    destination = ROOT / 'apps/web/src/data/finalUiEvidence.json'
    destination.write_text(json.dumps(output, indent=2, allow_nan=False) + '\n', encoding='utf-8')
    print(json.dumps({'methods': list(evidence), 'comparisonsPerMethod': 435, 'allMatricesValidated': True}))


if __name__ == '__main__':
    execute()
