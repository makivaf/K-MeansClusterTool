"""Execute the production repetition block on saved samples, without PCA/R."""
import ast
import csv
import json
from pathlib import Path
import sys
from types import SimpleNamespace
from unittest.mock import patch
import numpy as np
from sklearn.metrics import adjusted_rand_score

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'scripts/research/study_entry'))
import dpc_initialize_clusters as dpc
import run_enhanced_kmeans as enhanced

tree = ast.parse((ROOT / 'scripts/research/simulation/run_simulation.py').read_text(encoding='utf-8-sig'))
main = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == 'main')
start = next(i for i, node in enumerate(main.body) if isinstance(node, ast.Assign) and isinstance(node.targets[0], ast.Name) and node.targets[0].id == 'initializations')
end = next(i for i in range(start, len(main.body)) if isinstance(main.body[i], ast.Assign) and isinstance(main.body[i].targets[0], ast.Name) and main.body[i].targets[0].id == 'result')
block = compile(ast.Module(body=main.body[start:end], type_ignores=[]), '<production DPC repetitions>', 'exec')
for n in (100, 1020):
    candidates = []
    for directory in (ROOT / 'apps/api/private/simulation-runs').glob('simulation-1-*'):
        public = directory / 'public-result.json'
        if public.exists() and json.loads(public.read_text())['configurationKey'] == f'custom:{n}:auto':
            candidates.append(directory)
    assert candidates, f'Missing completed n={n} workspace'
    directory = candidates[-1]
    output = json.loads((directory / 'result.json').read_text())
    with (directory / 'data/interim/clustering_pca_scores.csv').open(encoding='utf-8-sig', newline='') as handle:
        rows = list(csv.DictReader(handle))
    matrix = np.asarray([[float(row[f'PC{i}']) for i in range(1, output['enhanced']['pcaComponents'] + 1)] for row in rows])
    initializations, fits = [], []
    original_init, original_fit = dpc.dpc_init, enhanced.run_enhanced_kmeans
    def init(*args, **kwargs):
        value = original_init(*args, **kwargs)
        initializations.append(value)
        return value
    def fit(values, centers, *args, **kwargs):
        # Match the ordinal initialization consumed by each real Lloyd call.
        np.testing.assert_array_equal(centers, initializations[len(fits)].centroid_matrix)
        result = original_fit(values, centers, *args, **kwargs)
        assert all(not np.shares_memory(result.labels, previous.labels) for previous in fits)
        fits.append(result)
        return result
    with patch.object(dpc, 'dpc_init', init), patch.object(enhanced, 'run_enhanced_kmeans', fit):
        scope = dict(dpc=dpc, enhanced=enhanced, np=np, matrix=matrix, selection=SimpleNamespace(selected_k=output['enhanced']['selectedK']))
        exec(block, scope)
    assert len(initializations) == len(fits) == 3
    assert len({id(value) for value in initializations}) == 3
    ari = [adjusted_rand_score(fits[0].labels, run.labels) for run in fits]
    reference = [point['enhanced'] for point in output['projection']['points']]
    assert adjusted_rand_score(reference, fits[0].labels) == 1
    assert all(value == 1 for value in ari)
    print(f'PASS n={n}: production block executed 3 DPC calls and 3 separately paired Lloyd fits; distinct label arrays; calculated ARIs={ari}; no PCA/NbClust rerun.', flush=True)
