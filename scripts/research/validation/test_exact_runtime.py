"""Exactness checks for runtime optimizations; no frozen output writes."""
from pathlib import Path
import sys
import unittest
import numpy as np
from sklearn.metrics import silhouette_score, davies_bouldin_score, calinski_harabasz_score

ROOT = Path(__file__).resolve().parents[3]
sys.path[:0] = [str(ROOT/'scripts/research/study_entry'), str(ROOT/'scripts/research/simulation')]
import dpc_initialize_clusters as canonical
from exact_runtime import ExactMetrics, exact_dpc_init


class ExactRuntimeTests(unittest.TestCase):
    def test_dpc_ties_duplicate_points_and_random_inputs(self):
        matrices = [[[0.,0.],[0.,0.],[1.,0.],[0.,1.],[1.,1.]],
                    [[-1.],[0.],[1.],[2.],[3.]],
                    np.random.default_rng(19).normal(size=(100,6)).tolist()]
        for matrix in matrices:
            for k in (2,3):
                self.assertEqual(canonical.dpc_init(matrix,k),exact_dpc_init(matrix,k))

    def test_metrics_and_formula_evidence_with_singletons_and_label_permutation(self):
        X = np.random.default_rng(37).normal(size=(101,6))
        labels = np.array([0]*50+[1]*50+[2])
        evaluator = ExactMetrics(X)
        expected = (silhouette_score(X,labels),davies_bouldin_score(X,labels),calinski_harabasz_score(X,labels))
        np.testing.assert_allclose(evaluator(labels),expected,rtol=1e-12,atol=1e-12)
        np.testing.assert_allclose(evaluator(2-labels),expected,rtol=1e-12,atol=1e-12)
        self.assertEqual(len(evaluator.cache),1)
        evidence = evaluator.calculation(labels,[str(i) for i in range(len(X))],'fixture')
        row = evidence['exampleParticipant']; i = int(row['rid'])
        own = np.flatnonzero(labels==labels[i]); other = [np.flatnonzero(labels==c) for c in set(labels) if c!=labels[i]]
        a = np.linalg.norm(X[own]-X[i],axis=1).sum()/max(len(own)-1,1)
        b = min(np.linalg.norm(X[g]-X[i],axis=1).mean() for g in other)
        np.testing.assert_allclose([row['a'],row['b']],[a,b],rtol=1e-12,atol=1e-12)
        sums=evidence['calinskiHarabasz']
        self.assertAlmostEqual(sums['ssb']/(3-1)/(sums['ssw']/(len(X)-3)),expected[2])


if __name__ == '__main__':
    unittest.main()
