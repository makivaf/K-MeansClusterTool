import csv
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest
import numpy as np

ROOT = Path(__file__).resolve().parents[3]
sys.path[:0] = [str(ROOT/'scripts/research/simulation'), str(ROOT/'scripts/research/study_entry')]
from common_space import aligned_agreement, pairwise, load_partitions, evaluate_common_spaces


class CommonSpaceTests(unittest.TestCase):
    def test_alignment_and_pairwise(self):
        a = np.array([0, 0, 1, 1]); b = 1-a
        self.assertEqual(aligned_agreement(a,b), dict(ari=1.0, agreementCount=4, disagreementCount=0, disagreementPercent=0.0))
        different_k = aligned_agreement(a, np.array([10, 11, 12, 12]))
        self.assertEqual(different_k['agreementCount'], 3)
        self.assertEqual(different_k['disagreementCount'], 1)
        self.assertEqual(pairwise([a,b,a])['exactMatches'], 3)
        self.assertEqual(aligned_agreement(a,np.array([0,1,0,1]))['disagreementCount'], 2)

    def test_assignment_provenance(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp)/'partitions.npz'; labels=np.tile([0,1,0,1], (30,1)); ids=['1','2','3','4']
            np.savez(p, ids=ids, labels=labels)
            result=dict(assignmentsHash=hashlib.sha256(p.read_bytes()).hexdigest(), labels=labels[0].tolist())
            np.testing.assert_array_equal(load_partitions(p,result,ids,30),labels)
            for order,count in [(ids[::-1],30),(ids,3)]:
                with self.assertRaises(AssertionError):load_partitions(p,result,order,count)
            result['assignmentsHash']='0'*64
            with self.assertRaises(AssertionError):load_partitions(p,result,ids,30)

    def test_verified_full_cohort(self):
        diagnostic=ROOT/'apps/api/private/methodology-diagnostics/2026-10-11-common-space-8d47434d/report.json'
        if not diagnostic.is_file():self.skipTest('Private verified diagnostic fixture unavailable')
        reference=json.loads(diagnostic.read_text())
        def rows(name):
            with (ROOT/'data/interim'/name).open(encoding='utf-8-sig') as f:return list(csv.DictReader(f))
        x=rows('clustering_features_standardized.csv'); ids=[r['RID'] for r in x]
        X=np.array([[float(r[k]) for k in list(x[0])[2:]] for r in x])
        z=rows('clustering_pca_scores.csv');self.assertEqual(ids,[r['RID'] for r in z])
        Z=np.array([[float(r[f'PC{i}']) for i in range(1,7)] for r in z])
        jobs=ROOT/'apps/api/private/method-runs'
        def labels(job,key='labels'):
            with np.load(jobs/job/'partitions.npz',allow_pickle=False) as a:
                self.assertEqual(a['ids'].tolist(),ids);return a[key].copy()
        standard=labels('eb728b68-dd53-4940-9242-510f0d51eace')
        enhanced=labels('9313513c-93d0-407b-9647-0570ad9fa54a')
        random=labels('8709b274-e2c1-4aaa-9f2b-c1d568316686','controlLabels')
        evidence=evaluate_common_spaces(X,Z,standard,random,enhanced,ids)
        self.assertEqual(evidence['version'], 'common-space-v2')
        for space, matrix in zip(evidence['spaces'], [X,Z]):
            self.assertEqual(space['matrixHash'], hashlib.sha256(np.ascontiguousarray(matrix,dtype='<f8').tobytes()).hexdigest())
            for key in ['silhouette','davies_bouldin','calinski_harabasz']:
                values=[row[key] for row in space['conditions']['standard']['runs']]
                self.assertEqual(min(values),space['conditions']['standard']['minimum'][key])
                self.assertEqual(max(values),space['conditions']['standard']['maximum'][key])
        for row in evidence['crossMethod']:
            self.assertEqual(row['enhancedRun'],1)
            self.assertEqual(row['agreementCount']+row['disagreementCount'],len(ids))
        for space,ref in zip(evidence['spaces'],['standardized_13','pca_6']):
            for method,old in [('standard','Standard'),('pcaRandom','PCA_random'),('enhanced','Enhanced')]:
                for metric,value in reference['spaces'][ref][old].items():
                    self.assertAlmostEqual(space['conditions'][method]['mean'][metric],value,delta=1e-12)
            self.assertEqual(space['conditions']['standard']['runCount'],30)
        for method,old in [('standard','Standard'),('pcaRandom','PCA_random')]:
            self.assertAlmostEqual(evidence['pairwise'][method]['mean'],reference['ari'][old]['pairwise']['mean'])
        self.assertEqual(evidence['pairwise']['enhanced']['exactMatches'],3)
        with self.assertRaises(AssertionError):evaluate_common_spaces(X,Z,standard[:-1],random,enhanced,ids)
        (ROOT/'apps/api/private/methodology-diagnostics/common-space-implementation-validation.json').write_text(json.dumps(evidence,indent=2)+'\n')


if __name__=='__main__':unittest.main()
