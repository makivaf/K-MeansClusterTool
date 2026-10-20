"""D1 assertion and D2 invariants; no scientific stages are rerun."""
import hashlib
import json
from pathlib import Path
import unittest
import numpy as np
from derive_partition_evidence import derive
from repeat_enhanced_final_ui import assert_partition
from derive_final_ui_evidence import read_labels

ROOT = Path(__file__).resolve().parents[3]


class FinalUiEvidenceTests(unittest.TestCase):
    def test_d1_accepts_label_permutation_and_stops_on_changed_partition(self):
        self.assertEqual(assert_partition([0, 0, 1, 1], [9, 9, 4, 4]), 1)
        with self.assertRaisesRegex(AssertionError, 'stop D1'):
            assert_partition([0, 0, 1, 1], [0, 1, 0, 1])

    def test_d2_symmetry_diagonal_membership_modal_order_and_alignment(self):
        result = derive([[0, 0, 1, 1], [0, 1, 0, 1], [8, 2, 8, 2]])
        matrix = np.asarray(result['pairwiseAriMatrix'])
        np.testing.assert_array_equal(matrix, matrix.T)
        np.testing.assert_array_equal(matrix.diagonal(), [1, 1, 1])
        self.assertEqual(result['partitionMembership'], ['B', 'A', 'A'])
        self.assertEqual(result['maximumDifferingParticipants'], 2)
        self.assertAlmostEqual(result['modalPartitionPercent'], 200 / 3)

    def test_stored_d1_and_d2_artifacts_have_complete_hash_linked_repetitions(self):
        folder = ROOT / 'apps/api/private/final-ui-evidence'
        report = json.loads((folder / 'enhanced-30-report.json').read_text())
        source = folder / 'enhanced-30-partitions.npz'
        self.assertEqual(hashlib.sha256(source.read_bytes()).hexdigest(), report['artifactSha256'])
        for name, expected in report['sources'].items():
            self.assertEqual(hashlib.sha256((ROOT / name).read_bytes()).hexdigest(), expected)
        with np.load(source, allow_pickle=False) as saved:
            ids = saved['ids'].tolist()
            repeated = saved['labels'].copy()
        self.assertEqual(repeated.shape, (30, len(ids)))
        for labels in repeated: self.assertEqual(assert_partition(repeated[0], labels), 1)
        stored = json.loads((ROOT / 'apps/web/src/data/finalUiEvidence.json').read_text())
        standard = read_labels(ROOT / 'data/interim/baseline_kmeans_assignments.csv', ids)
        self.assertEqual(derive(standard), stored['initializationEvidence']['standard'])
        self.assertEqual(derive(repeated, 1), stored['initializationEvidence']['enhanced'])
        for evidence in stored['initializationEvidence'].values():
            matrix = np.asarray(evidence['pairwiseAriMatrix'])
            self.assertEqual(matrix.shape, (30, 30))
            np.testing.assert_array_equal(matrix, matrix.T)
            np.testing.assert_array_equal(matrix.diagonal(), np.ones(30))
            self.assertEqual(evidence['pairwiseComparisons'], 435)


if __name__ == '__main__':
    unittest.main()
