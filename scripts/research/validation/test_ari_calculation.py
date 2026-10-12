"""Small known ARI example, precision agreement, and ordered-cohort rejection."""
import unittest

from derive_partition_evidence import ari_calculation, ari_from_contingency, six_decimal_match


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

    def test_order_mismatch_fails(self):
        with self.assertRaisesRegex(ValueError, 'order mismatch'):
            ari_calculation([[0, 0, 1, 1], [0, 1, 0, 1]],
                            [['a', 'b', 'c', 'd'], ['b', 'a', 'c', 'd']])


if __name__ == '__main__':
    unittest.main()
