"""Exact reusable validation and vectorized DPC bookkeeping.

No approximate distances, sampling, changed seeds, or cached fits. The DPC
distance primitive remains math.dist, including its floating-point behavior.
"""
import math
from time import perf_counter
import numpy as np
from scipy.spatial.distance import squareform
from sklearn.metrics import silhouette_samples, davies_bouldin_score, calinski_harabasz_score
from sklearn.metrics.pairwise import euclidean_distances
import dpc_initialize_clusters as dpc


KEYS = ('silhouette', 'davies_bouldin', 'calinski_harabasz')


class ExactMetrics:
    def __init__(self, X):
        self.X = X
        self.distances = None
        self.cache = {}
        self.seconds = 0.0

    def __call__(self, labels):
        started = perf_counter()
        # Label permutations represent the same partition and the same metrics.
        _, first, inverse = np.unique(labels, return_index=True, return_inverse=True)
        order = np.argsort(np.argsort(first))
        key = order[inverse].tobytes()
        if key not in self.cache:
            if self.distances is None:
                self.distances = euclidean_distances(self.X)
                np.fill_diagonal(self.distances, 0)
            samples = silhouette_samples(self.distances, labels, metric='precomputed')
            self.cache[key] = (float(samples.mean()), float(davies_bouldin_score(self.X, labels)),
                               float(calinski_harabasz_score(self.X, labels)))
        self.seconds += perf_counter() - started
        return self.cache[key]

    def calculation(self, labels, ids, representation, seed=None):
        values = self(labels)
        k = len(set(labels))
        groups = [np.flatnonzero(labels == c) for c in range(k)]
        centers = np.array([self.X[g].mean(axis=0) for g in groups])
        scatter = [float(np.linalg.norm(self.X[g] - centers[c], axis=1).mean()) for c, g in enumerate(groups)]
        ssw = float(sum(np.sum((self.X[g] - centers[c]) ** 2) for c, g in enumerate(groups)))
        ssb = float(sum(len(g) * np.sum((centers[c] - self.X.mean(axis=0)) ** 2) for c, g in enumerate(groups)))
        sums = np.column_stack([self.distances[:, g].sum(axis=1) for g in groups])
        sizes = np.bincount(labels)
        own = sizes[labels]
        a = sums[np.arange(len(labels)), labels] / np.maximum(own - 1, 1)
        means = sums / sizes
        means[np.arange(len(labels)), labels] = np.inf
        b = means.min(axis=1)
        s = np.divide(b - a, np.maximum(a, b), out=np.zeros(len(labels)), where=np.maximum(a, b) != 0)
        s[own == 1] = 0
        assert np.isclose(s.mean(), values[0], rtol=1e-12, atol=1e-12)
        index = min(range(len(ids)), key=lambda i: (abs(s[i] - values[0]), int(ids[i])))
        result = dict(n=len(ids), k=k, representation=representation,
            exampleParticipant=dict(rid=ids[index], cluster=int(labels[index]), a=float(a[index]), b=float(b[index]),
                                    s=float(s[index]), singleton=bool(own[index] == 1)),
            daviesBouldin=dict(sigma0=scatter[0], sigma1=scatter[1], centroidDistance=float(np.linalg.norm(centers[0]-centers[1]))),
            calinskiHarabasz=dict(ssb=ssb, ssw=ssw), metrics=dict(zip(KEYS, values)))
        if seed is not None:
            result['seed'] = seed
        return result


def exact_dpc_init(X, k, cutoff_percentile=dpc.STUDY_CUTOFF_PERCENTILE):
    dpc._validate_matrix(X, k)
    if not 0 < cutoff_percentile < 1:
        raise ValueError('Invalid cutoff percentile')
    n = len(X)
    condensed = np.fromiter((math.dist(X[i], X[j]) for i in range(n-1) for j in range(i+1, n)),
                            dtype=np.float64, count=n*(n-1)//2)
    if not np.isfinite(condensed).all():
        raise AssertionError('Nonfinite DPC distances')
    nonzero = np.sort(condensed[condensed > 0]).tolist()
    if not nonzero:
        raise AssertionError('No nonzero DPC distances')
    cutoff = dpc._linear_percentile(nonzero, cutoff_percentile)
    distances = squareform(condensed)
    rho = (distances < cutoff).sum(axis=1) - 1
    delta = np.array([distances[i, rho > rho[i]].min() if np.any(rho > rho[i]) else distances[i].max() for i in range(n)])
    gamma = rho * delta
    ranked = tuple(sorted(range(n), key=lambda i: (-gamma[i], i)))
    selected = ranked[:k]
    return dpc.DPCResult(n, len(X[0]), len(condensed), cutoff_percentile, cutoff,
        nonzero[0], dpc._linear_percentile(nonzero, 0.5), nonzero[-1],
        tuple(map(int, rho)), tuple(map(float, delta)), tuple(map(float, gamma)), ranked, selected,
        tuple(tuple(map(float, X[i])) for i in selected))
