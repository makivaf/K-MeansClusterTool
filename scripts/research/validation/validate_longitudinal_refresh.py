"""Isolated approved longitudinal refresh; never writes frozen artifacts."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import uuid
import warnings

ROOT = Path(__file__).resolve().parents[3]


def main():
    import numpy as np
    job = ROOT/'apps/api/private/method-runs/9313513c-93d0-407b-9647-0570ad9fa54a'
    request = json.loads((job/'request.json').read_text())
    required = [ROOT/'data/raw/adni/ADAS.csv', Path(request['sourcePath']), job/'partitions.npz']
    if any(not p.is_file() for p in required):
        raise FileNotFoundError([str(p) for p in required if not p.is_file()])
    if hashlib.sha256(required[1].read_bytes()).hexdigest() != request['sourceHash']:
        raise AssertionError('Clustering cohort source hash changed')
    snapshot_adas = required[1].parents[1]/'raw/adni/ADAS.csv'
    if required[0].read_bytes() != snapshot_adas.read_bytes():
        raise AssertionError('ADAS source differs from the clustering input snapshot')
    work = ROOT/'apps/api/private/longitudinal-refresh'/str(uuid.uuid4())
    interim = work/'data/interim'; interim.mkdir(parents=True)
    raw = work/'data/raw/adni'; raw.mkdir(parents=True)
    scripts = work/'scripts/research/longitudinal'; scripts.mkdir(parents=True)
    for p in (ROOT/'scripts/research/longitudinal').glob('*.py'):
        (scripts/p.name).write_bytes(p.read_bytes().replace(b'\r\n', b'\n'))
    shutil.copyfile(required[0], raw/'ADAS.csv')
    shutil.copyfile(required[1], interim/'study_entry_cohort_unimputed.csv')
    # Verify exact labeled membership against the reference assignment file.
    import csv
    with (ROOT/'data/interim/unified_cluster_assignments.csv').open(encoding='utf-8-sig') as f:
        assignments = list(csv.DictReader(f))
    saved = np.load(required[2], allow_pickle=False)
    assert saved['labels'].shape == (3, 2437)
    assert saved['ids'].tolist() == [row['RID'] for row in assignments]
    assert all(np.array_equal(labels, [int(row['cluster_label']) for row in assignments]) for labels in saved['labels'])
    shutil.copyfile(ROOT/'data/interim/unified_cluster_assignments.csv', interim/'unified_cluster_assignments.csv')
    print('WORKSPACE', work, flush=True)
    env = dict(os.environ, OMP_NUM_THREADS='1', OPENBLAS_NUM_THREADS='1', MKL_NUM_THREADS='1')
    for name in ['audit_longitudinal_records.py', 'reconcile_longitudinal_methodology.py', 'construct_longitudinal_cohort.py', 'fit_longitudinal_mixed_model.py']:
        with (work/(name+'.log')).open('w') as log:
            subprocess.run([sys.executable, '-B', str(scripts/name)], env=env, stdout=log, stderr=subprocess.STDOUT, check=True)
        print('PASSED', name, flush=True)
    model = json.loads((interim/'unified_longitudinal_mixed_model.json').read_text())
    history = [json.loads(p.read_text()) for p in (ROOT/'data/processed/run-history').glob('*.json')]
    reference = max(history, key=lambda doc: doc['created_at'])['longitudinal']['mixedEffects']
    errors = {row['term']: {key: row[key]-next(v for v in reference['fixedEffects'] if v['term']==row['term'])[key]
        for key in ['estimate', 'standardError', 'zStatistic', 'pValue']} for row in model['fixedEffects']}
    spec = importlib.util.spec_from_file_location('approved_model', scripts/'fit_longitudinal_mixed_model.py')
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    data = module.validate_and_prepare_model_data()
    import statsmodels.formula.api as smf
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter('always')
        fitted = smf.mixedlm(module.IMPLEMENTATION_FORMULA, data, groups=data.participant_group,
            re_formula='1 + time_years', missing='raise').fit(reml=False, method='lbfgs', maxiter=2000, disp=False)
    supported = bool(fitted.converged and np.isfinite(fitted.params).all() and
        np.linalg.eigvalsh(fitted.cov_re).min() > 1e-8 and np.linalg.matrix_rank(fitted.model.exog) == fitted.model.exog.shape[1])
    sensitivity = dict(numericallySupported=supported, formula='adas13 ~ time_years * original_cluster + (1 + time_years | participant)',
        estimation='ML', optimizer='lbfgs', converged=bool(fitted.converged),
        randomCovarianceEigenvalues=np.linalg.eigvalsh(fitted.cov_re).tolist(),
        warnings=[str(w.message) for w in caught], fixedEffects={k: float(v) for k,v in fitted.fe_params.items()},
        confidenceIntervals=fitted.conf_int().to_dict(), logLikelihood=float(fitted.llf), aic=float(fitted.aic),
        role='separate sensitivity; does not replace approved random-intercept model')
    report = dict(workspace=str(work), assignmentJob=str(job), sourceHashes={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in required},
        scriptHashes={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in scripts.glob('*.py')},
        referenceInputHashesMatch=model['provenance']['inputSha256']==reference['provenance']['inputSha256'],
        referenceParity=all(abs(value)<1e-8 for row in errors.values() for value in row.values()),
        originalModel=model, referenceCoefficientErrors=errors, sensitivity=sensitivity)
    (work/'verification.json').write_text(json.dumps(report, indent=2, allow_nan=False)+'\n')
    print(json.dumps({'coefficientErrors': errors, 'sensitivity': sensitivity}, indent=2), flush=True)


if __name__ == '__main__':
    main()
