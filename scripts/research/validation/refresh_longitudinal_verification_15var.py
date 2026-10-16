"""Refresh the longitudinal verification evidence for the 15-variable revision.

Reuses the locked longitudinal() routine of verify_pipeline_oct12.py, pointed at
the current data/interim artifacts instead of the archived 13-variable snapshot.
Only the random-intercept reference and random-slope sensitivity MixedLM fits
are executed; no clustering, PCA or NbClust. Outputs: docs/verification/
longitudinal.json (+ source_manifest.json hashes). Run
derive_longitudinal_ui_counts.py afterwards for longitudinal_ui.json.
"""
from pathlib import Path
import hashlib
import importlib.util
import json

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'docs/verification'


def main():
    spec = importlib.util.spec_from_file_location('verify_oct12', ROOT / 'scripts/research/validation/verify_pipeline_oct12.py')
    verify = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(verify)
    verify.SNAP = ROOT  # current artifacts: ROOT/data/interim/...
    result = verify.longitudinal()
    if result['participants'] != 1845 or result['observations'] != 11111:
        raise AssertionError('Longitudinal analysis set drifted')
    if not result['referenceMatchesAt1e8']:
        raise AssertionError('Refit does not reproduce the stored reference mixed-model artifact')
    manifest_path = OUT / 'source_manifest.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    for name in result['sources'].values():
        data = (ROOT / name).read_bytes()
        if name.endswith('.py'):  # canonical LF form, matching the API loader
            data = data.replace(b'\r\n', b'\n')
        manifest['sha256'][name] = hashlib.sha256(data).hexdigest()
    manifest_path.write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    effect = next(v for k, v in result['randomIntercept']['fixedEffects'].items() if ':' in k)
    print(json.dumps({'participants': result['participants'], 'observations': result['observations'],
                      'timeByCluster': effect['estimate'], 'ci95': effect['ci95'],
                      'referenceMaxAbsoluteError': result['referenceMaxAbsoluteError']}))


if __name__ == '__main__':
    main()
