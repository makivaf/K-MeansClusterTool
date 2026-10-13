"""Small known ARI example, precision agreement, and ordered-cohort rejection."""
import unittest

from derive_partition_evidence import ari_calculation, ari_from_contingency, six_decimal_match, derive, assert_identical_partitions


class AriCalculationTests(unittest.TestCase):
    def test_known_crossed_partition_formula(self):
        result = ari_calculation([[0, 0, 1, 1], [0, 1, 0, 1]], [['a', 'b', 'c', 'd']] * 2,
                                 stored_matrix=[[1, -.5], [-.5, 1]])
        self.assertEqual(result['n_ij'], [[1, 1], [1, 1]])
        self.assertEqual(result['a_i'], [2, 2])
        self.assertEqual(result['b_j'], [2, 2])
        self.assertEqual(result['N'], 4)
        terms = result['terms']
        self.assertEqual(terms['sumCellChoose2'], 0)
        self.assertEqual(terms['sumRowChoose2'], 2)
        self.assertEqual(terms['sumColumnChoose2'], 2)
        self.assertEqual(terms['totalChoose2'], 6)
        self.assertAlmostEqual(terms['expectedIndex'], 2 / 3)
        self.assertEqual(terms['maxIndex'], 2)
        self.assertAlmostEqual(result['ariRecalculated'], -.5)
        self.assertTrue(result['match'])
        self.assertTrue(result['cohort']['identical'])

    def test_six_decimal_match_and_failure(self):
        self.assertTrue(six_decimal_match(.1234561, .1234562, .1234563))
        self.assertFalse(six_decimal_match(.1234561, .1234571, .1234563))
        with self.assertRaisesRegex(ValueError, 'six decimals'):
            ari_calculation([[0, 0, 1, 1], [0, 1, 0, 1]], [['a', 'b', 'c', 'd']] * 2,
                            stored_matrix=[[1, -.499999], [-.499999, 1]])

    def test_enhanced_pair_and_identity(self):
        result = ari_calculation([[0, 0, 1, 1]] * 3, [['a', 'b', 'c', 'd']] * 3, 1)
        self.assertEqual(result['pair'], dict(kind='run', first=1, second=2))
        self.assertEqual(result['ariRecalculated'], 1)
        self.assertEqual(ari_from_contingency([[4, 0], [0, 0]])['ariRecalculated'], 1)

    def test_own_thirty_run_evidence(self):
        labels = [[0, 0, 1, 1]] * 30
        assert_identical_partitions(labels, labels[0])
        record = derive(labels, 1, ['a', 'b', 'c', 'd'])
        self.assertEqual(record['executions'], 30)
        self.assertEqual(record['pairwiseComparisons'], 435)
        self.assertEqual(record['modalPartitionFrequency'], 30)
        self.assertEqual(record['minimumPairwiseAri'], 1)
        self.assertEqual(record['maximumDifferingParticipants'], 0)
        self.assertEqual(record['ariCalculation']['pair']['kind'], 'run')
        self.assertEqual(len(record['pairwiseAriMatrix']), 30)

    def test_enhanced_changed_partition_fails(self):
        labels = [[0, 0, 1, 1]] * 29 + [[0, 1, 0, 1]]
        with self.assertRaisesRegex(AssertionError, 'job partition'):
            assert_identical_partitions(labels, labels[0])
        with self.assertRaises(AssertionError):
            assert_identical_partitions(labels[:3], labels[0])
        with self.assertRaises(AssertionError):
            assert_identical_partitions([[1, 1, 0, 0]] * 30, labels[0])

    def test_order_mismatch_fails(self):
        with self.assertRaisesRegex(ValueError, 'order mismatch'):
            ari_calculation([[0, 0, 1, 1], [0, 1, 0, 1]],
                            [['a', 'b', 'c', 'd'], ['b', 'a', 'c', 'd']])


if __name__ == '__main__':
    unittest.main()
