"""Read the exact verified LME analysis set and emit aggregate chart evidence.

No model fitting, source mutation, or participant-level output.
"""
import hashlib
import importlib.util
import json
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[3]


def execute():
    verification = json.loads((ROOT / 'docs/verification/longitudinal.json').read_text())
    manifest = json.loads((ROOT / 'docs/verification/source_manifest.json').read_text())
    sources = verification['sources']
    for name in sources.values():
        assert hashlib.sha256((ROOT / name).read_bytes()).hexdigest() == manifest['sha256'][name]
    spec = importlib.util.spec_from_file_location('locked_lme', ROOT / sources['implementation'])
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.ASSIGNMENTS_PATH = ROOT / sources['assignments']
    module.LONGITUDINAL_COHORT_PATH = ROOT / sources['input']
    frame = module.validate_and_prepare_model_data()  # validation/filtering only
    assert frame.participant_group.nunique() == verification['participants']
    assert len(frame) == verification['observations']
    frame['bin'] = np.floor(frame.time_years + 1e-12).astype(int)
    rows = []
    for (cluster, year), group in frame.groupby(['original_cluster', 'bin'], observed=True):
        rows.append(dict(clusterId=int(cluster), yearStart=int(year), yearEnd=int(year + 1),
                         participantCount=int(group.participant_group.nunique()),
                         observationCount=len(group), meanElapsedYears=float(group.time_years.mean()),
                         meanAdas13=float(group.adas13.mean())))
    assert sum(row['observationCount'] for row in rows) == verification['observations']
    history = [json.loads(p.read_text()) for p in (ROOT / 'data/processed/run-history').glob('*.json')]
    stored = max(history, key=lambda run: run['created_at'])['longitudinal']['timeSeries']
    lookup = {(r['clusterId'], r['yearStart']): r for r in stored}
    matches = len(stored) == len(rows) and all(
        (row['clusterId'], row['yearStart']) in lookup and
        all(abs(row[key] - lookup[(row['clusterId'], row['yearStart'])][key]) < 1e-8
            for key in ['participantCount', 'observationCount', 'meanAdas13']) for row in rows)
    output = dict(observedMeans=rows,
                  observedAnalysisSet=dict(participantCount=verification['participants'],
                                           observationCount=verification['observations'],
                                           countUnit='observations', analysisSet='LME analysis set'),
                  reconciliation=dict(storedChartMatchesLmeSet=matches,
                                      binObservationTotal=sum(r['observationCount'] for r in rows),
                                      participantCountsAcrossBinsAreNonAdditive=True),
                  sources={name: manifest['sha256'][name] for name in sources.values()})
    (ROOT / 'docs/verification/longitudinal_ui.json').write_text(json.dumps(output, indent=2) + '\n')
    print(json.dumps(dict(participants=verification['participants'], observations=verification['observations'],
                         storedChartMatchesLmeSet=matches, bins=len({r['yearStart'] for r in rows}))))


if __name__ == '__main__':
    execute()
