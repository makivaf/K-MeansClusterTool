"""Verify cumulative SOP routing with deliberately different selector outputs."""
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "comparison"))
import build_sop_evaluation as sop
import numpy as np


class SequentialSopTests(unittest.TestCase):
    def test_six_cumulative_configurations(self):
        self.assertEqual(sop.PIPELINES, (
            ("SOP1", "Existing", False, False, False),
            ("SOP1", "Enhanced", True, False, False),
            ("SOP2", "Existing", True, False, False),
            ("SOP2", "Enhanced", True, True, False),
            ("SOP3", "Existing", True, True, False),
            ("SOP3", "Enhanced", True, True, True)))

    def test_actual_routing_retains_pca_and_nbclust_selection(self):
        original = np.arange(52, dtype=float).reshape(4, 13)
        pca = np.arange(24, dtype=float).reshape(4, 6)
        nb = SimpleNamespace(select_k_nbclust=Mock(return_value=SimpleNamespace(selected_k=4)))
        seeds = SimpleNamespace(centroid_matrix=pca.tolist())
        with patch.dict(sys.modules, {"select_cluster_count_nbclust": nb}), \
             patch.object(sop.baseline, "select_baseline_k", side_effect=[(2, []), (3, [])]) as select, \
             patch.object(sop.baseline, "run_baseline_replications", side_effect=[['13D'], ['PCA'], ['NbClust']]) as random, \
             patch.object(sop, "dpc_init", return_value=seeds) as dpc, \
             patch.object(sop.final_enhanced, "run_enhanced_kmeans", return_value=object()) as fit, \
             patch.object(sop.final_enhanced, "validate_reproducibility") as validate:
            results = sop.run_sequential_conditions(original, pca)
        self.assertEqual(select.call_count, 2)
        self.assertIs(select.call_args_list[0].args[0], original)
        self.assertIs(select.call_args_list[1].args[0], pca)
        nb.select_k_nbclust.assert_called_once_with(pca.tolist())
        self.assertEqual([call.args[1] for call in random.call_args_list], [2, 3, 4])
        self.assertIs(random.call_args_list[2].args[0], pca)
        self.assertIs(results['SOP2', 'Existing'], results['SOP1', 'Enhanced'])
        self.assertIs(results['SOP3', 'Existing'], results['SOP2', 'Enhanced'])
        self.assertEqual(results['SOP3', 'Enhanced']['k'], 4)
        self.assertEqual(dpc.call_count, 3)
        for call in dpc.call_args_list:
            self.assertEqual(call.args, (pca.tolist(),))
            self.assertEqual(call.kwargs, {'k': 4})
        for call in fit.call_args_list:
            self.assertIs(call.args[0], pca)
            np.testing.assert_array_equal(call.args[1], pca)
            self.assertEqual(call.args[2], 4)
        validate.assert_called_once()


if __name__ == '__main__':
    unittest.main()
