"""Read-only constructor profiling against an existing private cohort workspace."""
import argparse
import cProfile
import importlib.util
import io
from pathlib import Path
import pstats
import sys

ROOT = Path(__file__).resolve().parents[3]

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('workspace', type=Path)
    parser.add_argument('--limit', type=int, default=200)
    args = parser.parse_args()
    spec = importlib.util.spec_from_file_location('constructor', ROOT/'scripts/research/study_entry/construct_study_entry_cohort.py')
    module = importlib.util.module_from_spec(spec); sys.modules[spec.name] = module; spec.loader.exec_module(module)
    module.RAW_DIR = args.workspace/'data/raw/adni'
    module.INTERIM_DIR = args.workspace/'data/interim'
    frames = module.read_raw_frames()
    module.attach_visit_classes(frames, module.load_visit_lookup())
    evidence, _, _ = module.enrollment_evidence(frames)
    ids = sorted(evidence.RID.unique())[:args.limit]
    evidence = evidence.loc[evidence.RID.isin(ids)]
    frames = {key: frame.loc[frame.RID.isin(ids)] for key, frame in frames.items()}
    profile = cProfile.Profile()
    profile.runcall(module.construct_table, frames, evidence, module.load_missing_policy())
    pstats.Stats(profile).strip_dirs().sort_stats('cumulative').print_stats(30)
