import hashlib
import csv
import json
from pathlib import Path
import tempfile
import unittest
import numpy as np
from derive_partition_evidence import derive, load


class PartitionEvidenceTests(unittest.TestCase):
    def test_label_invariance_and_tie(self):
        e = derive([[0, 0, 1, 1], [9, 9, 4, 4], [0, 1, 0, 1], [8, 2, 8, 2]])
        self.assertEqual(e['uniqueFinalPartitions'], 2)
        self.assertEqual(e['modalReferenceRun'], 0)
        self.assertEqual(e['modalPartitionFrequency'], 2)
        self.assertEqual([r['adjustedRandIndex'] for r in e['modalPartitionAri']], [1, 1, -.5, -.5])
        self.assertEqual(e['pairwiseComparisons'], 6)
        self.assertEqual(e['minimumPairwiseAri'], -.5)
        self.assertEqual(e['meanPairwiseAri'], 0)
        self.assertEqual(e['maximumDifferingParticipants'], 2)

    def test_reference_is_not_necessarily_modal(self):
        e = derive([[0, 0, 1, 1], [0, 1, 0, 1], [2, 4, 2, 4]])
        self.assertEqual(e['modalReferenceRun'], 1)
        self.assertEqual(e['modalPartitionFrequency'], 2)
        self.assertEqual(e['modalPartitionAri'][0]['adjustedRandIndex'], -.5)

    def test_order_hash_and_completeness_rejection(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            ids = ['synthetic-a', 'synthetic-b', 'synthetic-c', 'synthetic-d']
            labels = np.array([[0, 0, 1, 1], [1, 1, 0, 0]])
            np.savez(folder/'partitions.npz', ids=ids, labels=labels)
            result = dict(assignmentsHash=hashlib.sha256((folder/'partitions.npz').read_bytes()).hexdigest(),
                          labels=labels[0].tolist(), common=dict(participantCount=4),
                          provenance=dict(participantsHash=hashlib.sha256(json.dumps(ids, separators=(',', ':')).encode()).hexdigest()))
            def save():
                (folder/'result.json').write_text(json.dumps(result))
                (folder/'job.json').write_text(json.dumps(dict(status='complete', result=result)))
            save()
            np.testing.assert_array_equal(load(folder, 'labels', 2, ids)[2], labels)
            for order, count in [(ids[::-1], 2), (ids, 3)]:
                with self.assertRaises(ValueError): load(folder, 'labels', count, order)
            result['assignmentsHash'] = '0'*64
            save()
            with self.assertRaises(ValueError): load(folder, 'labels', 2, ids)
            result['assignmentsHash'] = hashlib.sha256((folder/'partitions.npz').read_bytes()).hexdigest()
            result['provenance']['participantsHash'] = '0'*64
            save()
            with self.assertRaises(ValueError): load(folder, 'labels', 2, ids)

    def test_verified_historical_assignments(self):
        root = Path(__file__).resolve().parents[3]
        geometry_file = root/'apps/api/artifacts/defense_geometry.json'
        if not geometry_file.is_file(): self.skipTest('Historical geometry unavailable')
        geometry = json.loads(geometry_file.read_text())
        self.assertEqual(digest_file(geometry_file), (geometry_file.with_suffix('.sha256')).read_text().strip())
        def records(name):
            file = root/'data/interim'/name
            self.assertEqual(digest_file(file), geometry['provenance']['sourceSha256']['data/interim/'+name])
            with file.open(encoding='utf-8-sig') as f: return list(csv.DictReader(f))
        cohort = records('clustering_features_standardized.csv')
        ids = [r['RID'] for r in cohort]
        self.assertEqual(len(ids), 2437)
        self.assertTrue(len(set(ids)) == len(ids))
        for name, frequencies, minimum, mean, differences in [
            ('baseline_kmeans_assignments.csv', [22,8], .9917583536346767, .9966654488269048, 5),
            ('dpc_comparison_random_assignments.csv', [21,7,2], .99340465973853, .9976378643414584, 4)
        ]:
            rows = records(name)
            partitions = []
            for seed in range(30):
                run = [r for r in rows if r['seed'] == str(seed)]
                self.assertTrue([r['RID'] for r in run] == ids, 'Historical assignment order mismatch')
                partitions.append([int(r['cluster_label']) for r in run])
            e = derive(partitions)
            self.assertEqual([r['frequency'] for r in e['partitionFrequencies']], frequencies)
            self.assertAlmostEqual(e['minimumPairwiseAri'], minimum, delta=1e-12)
            self.assertAlmostEqual(e['meanPairwiseAri'], mean, delta=1e-12)
            self.assertEqual(e['maximumDifferingParticipants'], differences)

    def test_invalid_labels(self):
        for rows in [[[0, 1]], [[0, 1], [0]], [[0, -1], [1, 0]], [[0., 1.], [1., 0.]]]:
            with self.assertRaises(ValueError): derive(rows)


def digest_file(file): return hashlib.sha256(file.read_bytes()).hexdigest()


if __name__ == '__main__': unittest.main()
