"""Read stored matrices/labels only; write private participant sidecars, never fit."""
import hashlib
import json
import os
import sys
from pathlib import Path
import numpy as np
import pandas as pd
from sklearn.metrics import silhouette_samples
from sklearn.metrics.pairwise import euclidean_distances

def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()

def participant_rows(matrix, ids, labels, expected):
    distances = euclidean_distances(matrix)
    np.fill_diagonal(distances, 0)
    groups = [np.flatnonzero(labels == c) for c in sorted(set(labels))]
    clusters = sorted(set(labels))
    sizes = np.array([len(g) for g in groups])
    own = np.array([clusters.index(v) for v in labels])
    sums = np.column_stack([distances[:, g].sum(axis=1) for g in groups])
    a = sums[np.arange(len(ids)), own] / np.maximum(sizes[own] - 1, 1)
    means = sums / sizes
    means[np.arange(len(ids)), own] = np.inf
    b = means.min(axis=1)
    s = np.divide(b-a, np.maximum(a, b), out=np.zeros(len(ids)), where=np.maximum(a, b) != 0)
    s[sizes[own] == 1] = 0
    checked = silhouette_samples(matrix, labels, metric='euclidean')
    if abs(float(s.mean()) - expected) > 1e-9 or np.max(np.abs(s-checked)) > 1e-9:
        raise ValueError('Stored Silhouette validation failed')
    return dict(rows=[dict(rid=str(rid), cluster=int(c), a=float(av), b=float(bv), s=float(sv))
                      for rid, c, av, bv, sv in zip(ids, labels, a, b, s)],
                validation=dict(count=len(ids), meanError=abs(float(s.mean())-expected),
                                sklearnMaxError=float(np.max(np.abs(s-checked)))))

def derive(folder):
    folder = Path(folder).resolve()
    result = json.loads((folder/'result.json').read_text())
    request = json.loads((folder/'request.json').read_text())
    cache = Path(request['cacheDirectory']) / request.get('preparationKey', request['compatibilityKey'])
    matrix_path = cache/'standardized.csv'
    scores_path = cache/'pca/scores.npy'
    if sha(matrix_path) != result['provenance']['preprocessingHash'] or sha(scores_path) != result['provenance']['pcaHash']:
        raise ValueError('Evaluation matrix provenance mismatch')
    data = pd.read_csv(matrix_path, dtype={'RID':str,'PTID':str})
    ids = data.RID.tolist()
    if len(ids) != result['common']['participantCount'] or len(set(ids)) != len(ids) or hashlib.sha256(json.dumps(ids, separators=(',', ':')).encode()).hexdigest() != result['provenance']['participantsHash']:
        raise ValueError('Participant membership provenance mismatch')
    X = data[result['common']['retainedVariables']].to_numpy(float)
    Z = np.load(scores_path, allow_pickle=False)
    with np.load(folder/'partitions.npz', allow_pickle=False) as saved:
        if saved['ids'].tolist() != ids or saved['labels'][0].tolist() != result['labels']:
            raise ValueError('Stored label alignment mismatch')
        labels = saved['labels'][0].copy()
        random = saved['controlLabels'][0].copy() if result['method']=='comparison' else None
    if result.get('assignmentsHash') and sha(folder/'partitions.npz') != result['assignmentsHash']:
        raise ValueError('Stored label provenance mismatch')
    variants = {}
    if result.get('calculation'):
        calculation = result['calculation']
        matrix = X if result['method']=='standard' else Z
        variants['native'] = participant_rows(matrix, ids, labels, calculation['metrics']['silhouette'])
    if result.get('commonSpace'):
        standard = json.loads(Path(request['standardResult']).read_text())
        enhanced = json.loads(Path(request['enhancedResult']).read_text())
        for space in result['commonSpace']['spaces']:
            matrix = X if space['primary'] else Z
            for method, condition in space['conditions'].items():
                source = standard if method=='standard' else enhanced if method=='enhanced' else None
                if source is not None:
                    expected_hash = result['comparisonSources'][method]['resultHash']
                    if sha(Path(request[method+'Result'])) != expected_hash:
                        raise ValueError('Comparison source provenance mismatch')
                current = np.array(standard['labels'] if method=='standard' else enhanced['labels'] if method=='enhanced' else random)
                variants[space['space']+'_'+method] = participant_rows(matrix, ids, current, condition['calculation']['metrics']['silhouette'])
    payload = dict(version=1, sources={name:sha(folder/name) for name in ['result.json','partitions.npz','request.json']},
                   matrixSources={str(matrix_path):sha(matrix_path),str(scores_path):sha(scores_path)}, variants=variants)
    target = folder/'participant-calculations.json'
    temp = target.with_suffix('.tmp')
    temp.write_text(json.dumps(payload,allow_nan=False),encoding='utf-8')
    os.replace(temp,target)
    target.with_suffix('.sha256').write_text(sha(target), encoding='ascii')
    return dict(path=target.name,sha256=sha(target),variants={key:value['validation'] for key,value in variants.items()})

if __name__=='__main__':
    try:
        print(json.dumps(derive(sys.argv[1])))
    except Exception:
        print('Participant calculation sidecar validation failed',file=sys.stderr)
        sys.exit(1)
