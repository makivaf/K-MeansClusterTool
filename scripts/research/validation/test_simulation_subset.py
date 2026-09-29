"""Cheap contract checks; never run another simulation or repeat clustering."""
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
from io import StringIO
import json
import numpy as np

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'scripts/research/simulation'))
from run_simulation import assert_membership, select_standard_k
import preprocess_study_entry as prep
import run_enhanced_kmeans as enhanced
import run_baseline_kmeans_comparison as baseline
import evaluate_dpc_control as control


class DpcControlSavedInputContract(unittest.TestCase):
    def check_saved_input(self, count, *, duplicate=False, reverse=False, analysis_count=None, nonfinite=False):
        ids = [str(i) for i in range(count)]
        if duplicate:
            ids[-1] = ids[0]
        request = {'isolatedSimulation': True, 'sampleParticipantIds': ids}
        analysis = {'enhanced': {'participantCount': count if analysis_count is None else analysis_count,
                    'pcaComponents': 2, 'selectedK': 2, 'dpc': {'centroidCount': 2, 'dimensions': 2}}}
        ordered = list(reversed(ids)) if reverse else ids
        csv = 'PTID,RID,PC1,PC2\n' + ''.join(f'test,{rid},{"nan" if nonfinite else "1"},2\n' for rid in ordered)
        workspace = control.ROOT / 'apps/api/private/simulation-runs/simulation-contract-test'
        class ReachedFitter(Exception):
            pass
        with patch.object(sys, 'argv', ['evaluate_dpc_control.py', str(workspace)]), \
                patch.object(Path, 'read_text', side_effect=[json.dumps(request), json.dumps(analysis)]), \
                patch.object(Path, 'open', return_value=StringIO(csv)), \
                patch.object(control.sop3, 'fit_random_pca_kmeans', side_effect=ReachedFitter) as fitter:
            if duplicate or reverse or nonfinite or not 100 <= count <= 2437 or analysis_count is not None:
                with self.assertRaises(AssertionError):
                    control.main()
                fitter.assert_not_called()
            else:
                # Stop at the first fit: validate real input checks without executing algorithms.
                with self.assertRaises(ReachedFitter):
                    control.main()
                self.assertEqual(fitter.call_args.args[0].shape, (count, 2))
                self.assertEqual(fitter.call_args.kwargs['expected_shape'], (count, 2))

    def test_dynamic_count_and_shape_without_fitting(self):
        for count in (100, 101, 2437):
            self.check_saved_input(count)

    def test_rejects_invalid_membership_and_matrix_without_fitting(self):
        for count in (99, 2438):
            self.check_saved_input(count)
        for kwargs in ({'duplicate': True}, {'reverse': True}, {'analysis_count': 101}, {'nonfinite': True}):
            self.check_saved_input(100, **kwargs)


class SubsetContract(unittest.TestCase):
    def test_standard_k_defaults_to_silhouette_and_override_is_explicit(self):
        for selected in range(2, 11):
            self.assertEqual(select_standard_k(None, selected), selected)
            self.assertEqual(select_standard_k({}, selected), selected)
            self.assertEqual(select_standard_k({'manualK': None}, selected), selected)
            self.assertEqual(select_standard_k({'manualK': 3}, selected), 3)

    def test_configurable_membership_limits(self):
        for count in (100, 101, 500, 1949, 2437):
            ids = [str(i) for i in range(count)]
            assert_membership(ids, ids)
        for count in (99, 2438):
            ids = [str(i) for i in range(count)]
            with self.assertRaises(AssertionError):
                assert_membership(ids, ids)

    @unittest.skipUnless(prep.AUTHORITATIVE_INPUT.exists(), 'Local study-entry cohort required')
    def test_real_sample_size_and_manual_k_reach_canonical_fitter(self):
        source = prep.read_csv_as_text(prep.AUTHORITATIVE_INPUT)
        source = source.loc[source.ENTRY_PHASE.isin(prep.EXPECTED_PHASE_COUNTS)]
        for count in (100, 101):
            selected = source.iloc[:count].copy()
            phases = selected.ENTRY_PHASE.value_counts().to_dict()
            retained = prep.build_retained_feature_table(selected, expected_phase_counts=phases, expected_rows=count)
            missing = {name: int(retained[name].isna().sum()) for name in prep.RETAINED_FEATURES}
            imputed, summary = prep.median_impute_features(retained, expected_missing_counts=missing)
            standardized, _, _ = prep.standardize_features(imputed, summary)
            matrix = standardized.loc[:, prep.RETAINED_FEATURES].to_numpy(dtype=float)
            self.assertEqual(matrix.shape, (count, 13))
            for k in (2, 3):
                run = baseline.fit_random_kmeans(matrix, k, 0, 1, expected_shape=matrix.shape)
                self.assertEqual(len(run.labels), count)
                self.assertEqual(len(run.cluster_sizes), k)
                self.assertEqual(sum(run.cluster_sizes), count)
                self.assertTrue(np.isfinite([run.silhouette, run.davies_bouldin, run.calinski_harabasz]).all())

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
