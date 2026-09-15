"""Cheap contract checks; never run another simulation or repeat clustering."""
from pathlib import Path
import sys
import unittest
import numpy as np

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'scripts/research/simulation'))
from run_simulation import assert_membership
import preprocess_study_entry as prep
import run_enhanced_kmeans as enhanced
import run_baseline_kmeans_comparison as baseline


class SubsetContract(unittest.TestCase):
    def test_rejects_outsiders_duplicates_and_wrong_count(self):
        expected = [str(i) for i in range(1, 1950)]
        assert_membership(expected, expected)
        for actual in [expected[:-1], expected + ['9999'], expected[:-1] + ['9999'], expected[:-1] + [expected[0]]]:
            with self.assertRaises(AssertionError):
                assert_membership(actual, expected)

    def test_frozen_defaults_remain_locked(self):
        self.assertEqual(prep.EXPECTED_COHORT_ROWS, 2437)
        self.assertEqual(baseline.EXPECTED_SHAPE, (2437, 13))
        self.assertEqual(enhanced.EXPECTED_SHAPE, (2437, 6))
        self.assertEqual(baseline.BASELINE_SEEDS, tuple(range(30)))
        with self.assertRaises(AssertionError):
            enhanced.run_enhanced_kmeans(np.zeros((1949, 6)), np.zeros((2, 6)), 2)


if __name__ == '__main__':
    unittest.main()
