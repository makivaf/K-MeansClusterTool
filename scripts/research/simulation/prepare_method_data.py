"""Shared verified preprocessing/PCA; this module performs no clustering."""
from pathlib import Path
import csv
import hashlib
import json
import os
import sys
import numpy as np
ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT/'scripts/research/study_entry'))
import preprocess_study_entry as prep

def digest(value):
    return hashlib.sha256(value).hexdigest()


def write_json(path, value):
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(value, allow_nan=False), encoding='utf-8')
    os.replace(temporary, path)


def read_cache(directory, key, filenames):
    try:
        manifest = json.loads((directory/'manifest.json').read_text())
        return manifest['key'] == key and set(manifest['files']) == set(filenames) and all(
            digest((directory/name).read_bytes()) == manifest['files'][name] for name in filenames)
    except (OSError, ValueError, KeyError):
        return False


def seal_cache(directory, key, filenames):
    write_json(directory/'manifest.json', {'key': key, 'files': {name: digest((directory/name).read_bytes()) for name in filenames}})


def prepare_data(request, workspace, measured, stage, hits):
    key = request.get('preparationKey', request['compatibilityKey'])
    cache = Path(request['cacheDirectory']) / key
    cache.mkdir(parents=True, exist_ok=True)
    stage('preprocessing')
    def prepare():
        nonlocal ids
        files = ['standardized.csv', 'preparation.json', 'preprocessing.npz']
        if request.get('requirePrepared') and (not read_cache(cache, key, files) or
                digest(Path(request['sourcePath']).read_bytes()) != request['sourceHash']):
            raise AssertionError('Prepared cohort or matrix changed; return to Dataset Setup')
        if not read_cache(cache, key, files):
            source_bytes = Path(request['sourcePath']).read_bytes()
            if digest(source_bytes) != request['sourceHash']:
                raise AssertionError('Cohort source changed')
            source = prep.read_csv_as_text(Path(request['sourcePath']))
            if request['scope'] == 'study':
                prep.SCOPE_AUDIT = Path(request['sourcePath']).with_name(prep.SCOPE_AUDIT.name)
                prep.validate_scope_audit()
            if request.get('participantIds') is not None:
                ids = request['participantIds']
                source = source.set_index('RID').loc[ids].reset_index()
            else:
                source = source.loc[source.ENTRY_PHASE.isin(prep.SCOPE_PHASES)]
                ids = source.RID.tolist()
            if len(set(ids)) != len(ids) or not 100 <= len(ids) <= 2437:
                raise AssertionError('Invalid participant membership')
            expected = prep.EXPECTED_PHASE_COUNTS if request['scope'] == 'study' else source.ENTRY_PHASE.value_counts().to_dict()
            retained = prep.build_retained_feature_table(source, expected_phase_counts=expected, expected_rows=len(ids))
            if request['scope'] == 'study':
                # Full study: load the verified finalized 15-variable median-imputed dataset (no re-imputation).
                imputed, summary = prep.load_finalized_imputed_features(retained)
            else:
                # Simulation subsets: medians of the subset's own observed scores.
                missing = {f: int(retained[f].isna().sum()) for f in prep.RETAINED_FEATURES}
                imputed, summary = prep.median_impute_features(retained, expected_missing_counts=missing)
            standardized, summary, _ = prep.standardize_features(imputed, summary)
            standardized.to_csv(cache/'standardized.csv', index=False, encoding='utf-8-sig')
            np.savez(cache/'preprocessing.npz', ptids=retained.PTID.to_numpy(dtype=str),
                retained=retained.loc[:, prep.RETAINED_FEATURES].to_numpy(),
                imputed=imputed.loc[:, prep.RETAINED_FEATURES].to_numpy())
            write_json(cache/'preparation.json', {'ids': ids, 'summary': summary.to_dict(orient='records'),
                'phaseCounts': source.ENTRY_PHASE.value_counts().to_dict()})
            seal_cache(cache, key, files)
        else:
            hits['preprocessing'] = True
        info = json.loads((cache/'preparation.json').read_text())
        ids = info['ids']
        with (cache/'standardized.csv').open(encoding='utf-8-sig', newline='') as handle:
            rows = list(csv.DictReader(handle))
        assert [r['RID'] for r in rows] == ids
        X = np.array([[float(row[f]) for f in prep.RETAINED_FEATURES] for row in rows])
        return X, info
    ids = []
    X, info = measured('preprocessing', prepare)
    n = len(ids)
    # PCA also supplies the common 2D visualization. Standard never uses its
    # scores for selection/fitting. Its inexpensive transform is cached for Enhanced.
    stage('pca')
    def pca_data():
        directory = cache/'pca'
        directory.mkdir(exist_ok=True)
        pca_key = digest((key + digest((cache/'standardized.csv').read_bytes())).encode())
        if request.get('requirePrepared') and not read_cache(directory, pca_key, ['scores.npy', 'pca.json']):
            raise AssertionError('Prepared PCA changed; return to Dataset Setup')
        if not read_cache(directory, pca_key, ['scores.npy', 'pca.json']):
            import pandas as pd
            table = pd.DataFrame(X, columns=prep.RETAINED_FEATURES)
            with np.load(cache/'preprocessing.npz', allow_pickle=False) as inputs:
                table['RID'], table['PTID'] = ids, inputs['ptids'].tolist()
                retained = pd.DataFrame(inputs['retained'], columns=prep.RETAINED_FEATURES)
                imputed = pd.DataFrame(inputs['imputed'], columns=prep.RETAINED_FEATURES)
            for frame in (retained, imputed):
                frame['RID'], frame['PTID'] = table.RID, table.PTID
            scores, variance, loadings, model, count = prep.apply_pca(table, expected_rows=n)
            prep.validate_final_outputs(retained, imputed, table, scores, variance, count, expected_rows=n)
            np.save(directory/'scores.npy', scores[[f'PC{i}' for i in range(1, count+1)]].to_numpy())
            write_json(directory/'pca.json', {'pcaComponents': count,
                'cumulativeExplainedVariance': float(variance.iloc[count-1].cumulative_explained_variance),
                'pcaVariance': [{'component': int(r.component_number), 'eigenvalue': float(r.explained_variance),
                    'explainedVarianceRatio': float(r.explained_variance_ratio), 'cumulativeExplainedVariance': float(r.cumulative_explained_variance)} for r in variance.itertuples()],
                'pcaLoadings': {'variables': loadings.variable.tolist(), 'components': list(loadings.columns[1:]),
                    'values': loadings.iloc[:, 1:].to_numpy().tolist()}})
            seal_cache(directory, pca_key, ['scores.npy', 'pca.json'])
        else:
            hits['pca'] = True
        saved_pca = json.loads((directory/'pca.json').read_text())
        # Add a derived companion artifact without changing sealed PCA/scores.
        eigenvalues = [row['eigenvalue'] for row in saved_pca['pcaVariance']]
        eigenvalue_summary = {'eigenvalues': eigenvalues, 'totalVariance': float(np.sum(eigenvalues))}
        summary_path = directory/'eigenvalues.json'
        if summary_path.exists():
            if json.loads(summary_path.read_text()) != eigenvalue_summary:
                raise AssertionError('PCA eigenvalue summary differs from verified PCA artifact')
        else:
            write_json(summary_path, eigenvalue_summary)
        return np.load(directory/'scores.npy', allow_pickle=False), saved_pca
    Z, pca = measured('pca', pca_data)
    return X, Z, info, pca, ids, cache
