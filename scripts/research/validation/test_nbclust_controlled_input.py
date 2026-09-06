"""Protect the PCA default and original-feature input adapter without rerunning indices."""

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "study_entry"))
import select_cluster_count_nbclust as nbclust


class NbClustControlledInputTests(unittest.TestCase):
    def test_r_conversion_preserves_every_value_in_six_and_thirteen_columns(self):
        for columns in (6, 13):
            matrix = [[float(row * columns + col) for col in range(columns)] for row in range(3)]
            converted = nbclust._as_r_matrix(matrix)
            self.assertEqual((converted.nrow, converted.ncol), (3, columns))
            for row in range(3):
                for col in range(columns):
                    self.assertEqual(float(converted.rx(row + 1, col + 1)[0]), matrix[row][col])

    def test_default_still_requires_locked_pca_shape(self):
        with self.assertRaisesRegex(AssertionError, "expected.*2437, 6"):
            nbclust.select_k_nbclust([[0.0] * 13 for _ in range(2437)])

    def test_explicit_shape_reuses_all_existing_indices(self):
        observed = []

        def run_index(matrix, index, seed):
            observed.append((matrix.nrow, matrix.ncol, index, seed))
            return nbclust.IndexResult(index, "success", 2, 1.0, "", "")

        with patch.object(nbclust, "importr"), patch.object(nbclust, "_install_r_helpers"), patch.object(nbclust, "_run_index", run_index):
            for columns in (6, 13):
                matrix = [[float(col) for col in range(columns)] for _ in range(2437)]
                observed.clear()
                result = nbclust.select_k_nbclust(matrix, **({"expected_shape": (2437, 13)} if columns == 13 else {}))
                self.assertEqual(result.selected_k, 2)
                self.assertEqual(observed, [(2437, columns, index, nbclust.RANDOM_SEED) for index in nbclust.NBCLUST_INDICES])

    def test_ragged_and_nonfinite_inputs_are_rejected(self):
        for bad_row in ([0.0] * 12, [float("nan")] * 13, [float("inf")] * 13):
            matrix = [[0.0] * 13 for _ in range(2437)]
            matrix[-1] = bad_row
            with self.assertRaisesRegex(AssertionError, "ragged or non-finite"):
                nbclust.select_k_nbclust(matrix, expected_shape=(2437, 13))


if __name__ == "__main__":
    unittest.main()
