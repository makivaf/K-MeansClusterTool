"""Independent observed-score audit. Never invokes or writes pipeline stages.

Run from the repository root with .venv/Scripts/python.exe.
All checks finish before any outputs are created; discrepancies are fatal.
"""
from __future__ import annotations

import hashlib
import importlib.util
import json
import re
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'apps/api/private/simulation-cohort/study_entry_cohort_unimputed.csv'
OUT = ROOT / 'data/interim/powerbi_observed_audit'
EXPECTED_HASH = 'eff5f9759f4e56e85408f08bd357cf2a0b67b42073cced73bed1d83e922fb6f3'


def require(condition, message):
    if not condition:
        raise ValueError('AUDIT STOPPED: ' + message)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def module(name):
    import sys
    spec = importlib.util.spec_from_file_location(name, ROOT / f'scripts/research/study_entry/{name}.py')
    loaded = importlib.util.module_from_spec(spec)
    sys.modules[name] = loaded
    spec.loader.exec_module(loaded)
    return loaded


def stats(values):
    valid = values.dropna()
    q1, q3 = valid.quantile([.25, .75])
    iqr = q3 - q1
    return dict(n_observed=len(valid), n_missing=int(values.isna().sum()),
                missing_percent=100 * values.isna().mean(), mean=valid.mean(),
                median=valid.median(), sd_sample=valid.std(ddof=1),
                minimum=valid.min(), q1=q1, q3=q3, maximum=valid.max(),
                iqr=iqr, skewness=valid.skew(), excess_kurtosis=valid.kurt(),
                n_zero=int(valid.eq(0).sum()), n_negative=int(valid.lt(0).sum()),
                n_outside_1_5_iqr=int(((valid < q1 - 1.5 * iqr) | (valid > q3 + 1.5 * iqr)).sum()))


def main():
    constructor = module('construct_study_entry_cohort')
    policy = module('reconcile_variable_dictionary')
    frozen = module('preprocess_study_entry')
    require(digest(SOURCE) == EXPECTED_HASH, 'source SHA-256 differs')
    provenance_path = SOURCE.with_name('provenance.json')
    roster_path = SOURCE.with_name('roster.json')
    provenance = json.loads(provenance_path.read_text())
    require(provenance['source']['sha256'] == EXPECTED_HASH, 'published source hash differs')
    require(digest(roster_path) == provenance['rosterSha256'], 'frozen roster hash differs')
    source = pd.read_csv(SOURCE, dtype=str, keep_default_na=False, na_filter=False)
    counts = dict(frozen.EXPECTED_PHASE_COUNTS, ADNI4=536, TEAM=28)
    require(len(source) == 3001 and source.RID.nunique() == 3001, 'source participant count differs')
    require(source.ENTRY_PHASE.value_counts().to_dict() == counts, 'source phase counts differ')
    scoped = source.loc[source.ENTRY_PHASE.isin(frozen.SCOPE_PHASES)].copy()
    require(len(scoped) == 2437 and scoped.RID.nunique() == 2437, 'selected participant count differs')
    roster = json.loads(roster_path.read_text())
    actual = scoped[['RID', 'ENTRY_PHASE']].sort_values('RID', key=lambda x: x.astype(int)).to_dict('records')
    require(actual == roster, 'selected RID/ENTRY_PHASE records differ from frozen roster')
    features = constructor.OUTPUT_VARIABLES
    require(len(features) == 15 and len(policy.VARIABLES) == 15, 'candidate feature count differs')
    require([x for x in features if x not in ('BNT', 'NPIQ')] == list(frozen.RETAINED_FEATURES), 'retained feature mapping differs')
    numeric = pd.DataFrame(index=scoped.index)
    mappings = []
    reasons = []
    for spec, definition in zip(constructor.VARIABLES, policy.VARIABLES):
        feature = spec.output
        require(spec.file_key == definition['file_key'] and list(spec.fields) == definition['source_fields'], f'{feature}: constructor/dictionary mapping differs')
        require(all(field in policy.LIKELY_FIELDS[spec.file_key] for field in spec.fields), f'{feature}: missing-code policy fields differ')
        text = scoped[feature]
        missing = text.eq('')
        value = pd.to_numeric(text.mask(missing), errors='coerce')
        require(not (text.ne('') & value.isna()).any(), f'{feature}: unexpected nonnumeric score')
        require(np.isfinite(value.dropna()).all(), f'{feature}: non-finite score')
        reason = scoped[feature + '_MISSING_REASON']
        require(reason.loc[~missing].eq('').all(), f'{feature}: observed score has missing reason')
        require(reason.loc[missing].isin(constructor.REASON_COLUMNS).all(), f'{feature}: unrecognized missing reason')
        if spec.mode == 'direct':
            require(not value.isin([-1, -4]).any(), f'{feature}: unnormalized missing code')
        # Existing alias contract: docs/ANALYSIS_INPUT_CONTRACT.md and
        # apps/api/src/services/simulationCohort.ts. Preserve original labels.
        source_labels = scoped[feature + '_SOURCE_FILE']
        canonical_labels = source_labels.map(lambda label: re.sub(
            r'^All_Subjects_(ADAS|CDR|FAQ|MMSE|NEUROBAT|NPIQ|GDSCALE)_(?:10Aug2026|Aug102026)\.csv$', r'\1.csv', label))
        require(canonical_labels.eq(constructor.FILES[spec.file_key]).all(), f'{feature}: source file mapping differs')
        require(source_labels.isin([item['filename'] for item in provenance['source']['inputs']]).all(), f'{feature}: source file absent from published provenance')
        populated = scoped[feature + '_SOURCE_PHASE'].ne('')
        require(scoped.loc[populated, feature + '_SOURCE_PHASE'].eq(scoped.loc[populated, 'ENTRY_PHASE']).all(), f'{feature}: selected source phase differs')
        valid = ~missing
        allowed_classes = constructor.intended_classes(spec)
        require(scoped.loc[valid, feature + '_SOURCE_VISIT_CLASS'].isin(allowed_classes).all(), f'{feature}: selected visit class differs')
        numeric[feature] = value
        for phase, group in [('ALL', scoped), *scoped.groupby('ENTRY_PHASE', sort=True)]:
            for code, count in group[feature + '_MISSING_REASON'].value_counts().items():
                reasons.append(dict(scope=phase, feature=feature, missing_reason=code or 'OBSERVED', participant_count=int(count)))
        mappings.append(dict(feature=feature, source_file=constructor.FILES[spec.file_key],
                             original_source_filenames=' | '.join(sorted(source_labels.unique())),
                             source_fields=' | '.join(spec.fields), visit_kind=spec.visit_kind,
                             derivation_mode=spec.mode, validated_pipeline_retained=feature in frozen.RETAINED_FEATURES,
                             **{key: ' | '.join(val) if isinstance(val, list) else val for key, val in definition.items() if key not in ('file_key', 'source_fields')}))
    observed_missing = {f: int(numeric[f].isna().sum()) for f in frozen.RETAINED_FEATURES}
    require(observed_missing == frozen.EXPECTED_MISSING_COUNTS, 'validated retained-feature missing counts differ')
    require(int(numeric.BNT.isna().sum()) == 707 and int(numeric.NPIQ.isna().sum()) == 1488, 'excluded-feature missing counts differ')
    # Comparison is an isolated sensitivity scenario, never an analytical input.
    medians = numeric.median()
    filled = numeric.fillna(medians)
    require(filled.notna().all().all(), 'comparison median unavailable')
    require(filled.where(numeric.notna()).equals(numeric), 'observed scores changed in comparison')
    descriptive, comparison, long_rows, correlations = [], [], [], []
    for scope, group in [('ALL', scoped), *scoped.groupby('ENTRY_PHASE', sort=True)]:
        for feature in features:
            before = numeric.loc[group.index, feature]
            after = filled.loc[group.index, feature]
            descriptive.append(dict(scope=scope, feature=feature, n_participants=len(group), **stats(before)))
            comparison.append(dict(scope=scope, feature=feature, scenario='overall_cohort_median_sensitivity',
                                   pipeline_status='VALIDATED_RETAINED_FEATURE' if feature in frozen.RETAINED_FEATURES else 'EXPLORATORY_ONLY_EXCLUDED_FEATURE',
                                   median_used=medians[feature], imputed_count=int(before.isna().sum()),
                                   **{'observed_' + k: v for k, v in stats(before).items()},
                                   **{'comparison_' + k: v for k, v in stats(after).items()},
                                   mean_delta=after.mean() - before.mean(), sd_delta=after.std() - before.std()))
    for feature in features:
        for idx in scoped.index:
            row = dict(RID=scoped.at[idx, 'RID'], ENTRY_PHASE=scoped.at[idx, 'ENTRY_PHASE'], feature=feature,
                       observed_score=numeric.at[idx, feature],
                       missing_reason=scoped.at[idx, feature + '_MISSING_REASON'],
                       was_imputed=bool(pd.isna(numeric.at[idx, feature])),
                       comparison_score=filled.at[idx, feature], median_used=medians[feature],
                       pipeline_retained=feature in frozen.RETAINED_FEATURES)
            long_rows.append(row)
    for method in ('pearson', 'spearman'):
        raw_corr = numeric.corr(method=method, min_periods=3)
        sensitivity_corr = filled.corr(method=method, min_periods=3)
        for a, feature_a in enumerate(features):
            for feature_b in features[a + 1:]:
                correlations.append(dict(method=method, feature_a=feature_a, feature_b=feature_b,
                                         observed_pair_n=int(numeric[[feature_a, feature_b]].notna().all(axis=1).sum()),
                                         observed_correlation=raw_corr.at[feature_a, feature_b],
                                         comparison_pair_n=len(scoped), comparison_correlation=sensitivity_corr.at[feature_a, feature_b]))
    # Do not replace an earlier audit accidentally.
    require(not OUT.exists(), f'output directory already exists: {OUT}')
    files = {
        'original/participants.csv': scoped[['RID', 'PTID', 'ENTRY_PHASE']],
        'original/cohort_observed_wide.csv': scoped,
        'descriptive/feature_mapping.csv': pd.DataFrame(mappings),
        'descriptive/observed_statistics.csv': pd.DataFrame(descriptive),
        'descriptive/missing_reasons.csv': pd.DataFrame(reasons),
        'imputation_comparison/participant_scores.csv': pd.DataFrame(long_rows),
        'imputation_comparison/statistics.csv': pd.DataFrame(comparison),
        'imputation_comparison/correlations.csv': pd.DataFrame(correlations),
    }
    for relative, frame in files.items():
        path = OUT / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        frame.to_csv(path, index=False, encoding='utf-8-sig', na_rep='')
        saved = pd.read_csv(path, dtype=str, keep_default_na=False)
        require(len(saved) == len(frame) and saved.columns.tolist() == frame.columns.tolist(), f'export verification failed: {relative}')
    saved_original = pd.read_csv(OUT / 'original/cohort_observed_wide.csv', dtype=str, keep_default_na=False)
    require(saved_original.equals(scoped.reset_index(drop=True)), 'original export differs from selected source records')
    require(digest(SOURCE) == EXPECTED_HASH, 'source changed during audit')
    manifest = dict(source=str(SOURCE.relative_to(ROOT)), source_sha256=EXPECTED_HASH,
                    source_rows=len(source), selected_rows=len(scoped), selected_unique_rids=scoped.RID.nunique(),
                    phase_counts=scoped.ENTRY_PHASE.value_counts().to_dict(),
                    checks='PASS: source hash; frozen roster hash and exact records; mappings; provenance; missing counts; exports; source unchanged',
                    policy_note='Missingness uses existing cohort blanks and reason columns; no raw code reinterpretation. Negative derived forgetting is preserved.',
                    code_hashes={str(p.relative_to(ROOT)): digest(p) for p in [Path(__file__), *[ROOT / f'scripts/research/study_entry/{n}.py' for n in ('construct_study_entry_cohort', 'reconcile_variable_dictionary', 'preprocess_study_entry')]]},
                    outputs={name: dict(rows=len(frame), sha256=digest(OUT / name)) for name, frame in files.items()})
    (OUT / 'manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    (OUT / 'README.md').write_text(README, encoding='utf-8')
    print(json.dumps(dict(output=str(OUT), checks=manifest['checks'], selected_rows=len(scoped)), indent=2))
    print(pd.DataFrame(descriptive).query("scope == 'ALL'")[['feature', 'n_observed', 'n_missing', 'missing_percent']].to_string(index=False))


README = """# Exploratory observed-score Power BI audit

The original folder contains exactly 2,437 selected participants, all 15 candidate
features and their existing provenance. These are unimputed constructed study-entry
scores, not raw instrument exports. No source or pipeline artifact was overwritten.
The manifest records hashes and validation checks. The frozen roster verifies every
selected RID and ENTRY_PHASE; the exact source hash anchors all selected score records.

Import each CSV separately using UTF-8, comma separator and the first row as headers.
Set RID and PTID to Text; set score/statistic columns to Decimal Number and counts to
Whole Number. Empty score cells are null, never zero. Use participants as the RID
dimension and feature_mapping as the feature dimension. Avoid joining summary tables
to participant rows; doing so duplicates totals. Original wide has one row per RID;
comparison participant_scores has one row per RID and feature (36,555 rows).

Descriptive statistics use only original observed scores. ALL and phase summaries
are separate scopes; select one scope to avoid double counting. SD uses n-1;
quartiles use pandas linear interpolation; skewness and excess kurtosis use pandas
bias-corrected estimates. IQR flags use strict 1.5-IQR fences and are descriptive;
no scores are removed, winsorized, capped, or reoriented. Zeros and negative derived
RAVLT forgetting values remain observed scores. Missing reason counts reconcile
to each scope; OBSERVED indicates a nonmissing original score.

Comparison files use a deterministic sensitivity scenario: fill each feature's
missing cells with its observed median across the full 2,437-person cohort. Phase
comparisons use those same overall medians. Observed cells are unchanged. For the
13 retained features this matches the validated median rule; this audit does not
claim comparison with a separately saved imputed thesis matrix. BNT and NPI-Q fills
are hypothetical and explicitly excluded from the validated pipeline. Their high,
phase-dependent absence makes pooled imputation particularly misleading; comparison
results are sensitivity evidence, not support for retaining these features.

Correlations include all 105 distinct feature pairs for Pearson and Spearman.
Observed coefficients use pairwise-complete original scores and report each pair's
sample size. Comparison coefficients use all 2,437 median-filled rows. No inferential
p-values, causal claims, diagnostic classifications, or clinical decisions are made.
Do not substitute median-filled correlations for observed-score evidence.

Mapping and missing policies were checked against repository constructor,
reconciled dictionary, and frozen preprocessing constants. Recorded-field blank,
-1 and -4 missing codes have already been normalized in the supplied cohort;
this audit preserves its blank cells and missing reasons. It does not infer new
missing values or substitute MINT for BNT or later visits for baseline NPI-Q.
Generated participant outputs remain local under the existing data/interim ignore.
"""


if __name__ == '__main__':
    main()
