"""D1: repeat only DPC and Lloyd using locked prepared inputs.

Never overwrites source artifacts, runs NbClust, or derives new quality metrics.
The first repetition estimates the full runtime before the remaining fits.
Outputs contain participant labels only in the private NPZ, never stdout.
"""
import csv
import hashlib
import json
import sys
from pathlib import Path
from time import perf_counter

ROOT = Path(__file__).resolve().parents[3]
sys.path[:0] = [str(ROOT / 'scripts/research/study_entry'), str(ROOT / 'scripts/research/simulation')]
import numpy as np
from sklearn.metrics import adjusted_rand_score
import run_enhanced_kmeans as enhanced
from exact_runtime import exact_dpc_init

OUTPUT = ROOT / 'apps/api/private/final-ui-evidence'


def assert_partition(reference, labels):
    ari = float(adjusted_rand_score(reference, labels))
    if ari != 1:
        raise AssertionError(f'Enhanced partition differs from stored result (ARI {ari:.12g}); stop D1.')
    return ari


def execute():
    started = perf_counter()
    _, ids, matrix, k, _, _ = enhanced.load_locked_inputs()
    with enhanced.ASSIGNMENTS_PATH.open(encoding='utf-8-sig', newline='') as handle:
        rows = list(csv.DictReader(handle))
    lookup = {row['RID']: int(row['cluster_label']) for row in rows}
    assert len(lookup) == len(ids) and set(lookup) == set(ids), 'Stored assignment cohort mismatch'
    reference = np.array([lookup[rid] for rid in ids])
    with enhanced.METRICS_PATH.open(encoding='utf-8-sig', newline='') as handle:
        metrics = {row['metric']: float(row['value']) for row in csv.DictReader(handle)}
    stored_metrics = tuple(metrics[key] for key in ('silhouette_coefficient', 'davies_bouldin_index', 'calinski_harabasz_index'))
    def stored_evaluation(labels):
        assert_partition(reference, labels)
        return stored_metrics
    repetitions, timings = [], []
    for number in range(1, 31):
        run_started = perf_counter()
        init_started = perf_counter()
        initialization = exact_dpc_init(matrix.tolist(), k)
        dpc_seconds = perf_counter() - init_started
        fit_started = perf_counter()
        result = enhanced.run_enhanced_kmeans(matrix, np.asarray(initialization.centroid_matrix), k,
                                              evaluate=stored_evaluation)
        lloyd_seconds = perf_counter() - fit_started
        assert_partition(reference, result.labels)
        repetitions.append(result.labels.copy())
        timings.append({'run': number, 'dpcSeconds': dpc_seconds, 'lloydSeconds': lloyd_seconds})
        if number == 1:
            estimate = (perf_counter() - run_started) * 30
            print(json.dumps({'estimatedSeconds': estimate, 'firstRunAri': 1}), flush=True)
            if estimate > 600:
                raise RuntimeError(f'Estimated 30-run runtime {estimate:.2f}s exceeds 10 minutes; stop before remaining fits.')
    OUTPUT.mkdir(parents=True, exist_ok=True)
    artifact = OUTPUT / 'enhanced-30-partitions.npz'
    if artifact.exists():
        raise FileExistsError('D1 artifact already exists; resume from progress file instead of overwriting')
    np.savez_compressed(artifact, ids=np.array(ids), labels=np.array(repetitions))
    sources = [enhanced.PCA_PATH, enhanced.SELECTED_K_PATH, enhanced.ASSIGNMENTS_PATH, enhanced.METRICS_PATH]
    report = {'runs': len(repetitions), 'allAriEqualOne': True, 'seconds': perf_counter() - started,
              'nbclust': 'stored selected k reused; no NbClust execution', 'selectedK': k,
              'timings': timings, 'artifactSha256': hashlib.sha256(artifact.read_bytes()).hexdigest(),
              'sources': {str(path.relative_to(ROOT)): hashlib.sha256(path.read_bytes()).hexdigest() for path in sources}}
    (OUTPUT / 'enhanced-30-report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps({key: report[key] for key in ('runs', 'allAriEqualOne', 'seconds')}), flush=True)


if __name__ == '__main__':
    execute()
