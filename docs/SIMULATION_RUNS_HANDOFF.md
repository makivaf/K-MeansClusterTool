# Simulation Runs developer handoff

Verified 2026-09-16. Branch: `feat/simulation-runs-ui-refinement`; HEAD: `73ddf8f`.
This is a current-state snapshot, not a claim that simulation analysis is implemented.
Check `git status` before continuing: the DPC repair below is uncommitted, including two new source files. Preserve it when transferring this workspace; a branch checkout alone will not include those changes.

## Architecture and current UI

Flow: private canonical roster → deterministic backend sampler → aggregate metadata service/API → React metadata hook → Simulation Runs page.

| Responsibility | Repository path |
| --- | --- |
| Cohort validation, loading, immutable publication | `apps/api/src/services/simulationCohort.ts` |
| Dedicated cohort construction command | `apps/api/src/commands/publishSimulationCohort.ts` |
| Deterministic sampler | `apps/api/src/services/simulationSample.ts` |
| Public metadata allowlist | `apps/api/src/services/simulationMetadata.ts` |
| Metadata route | `apps/api/src/routes/simulations.ts`, mounted in `apps/api/src/app.ts` |
| Shared strict schemas | `packages/shared/src/simulation.ts` |
| Frontend metadata hook | `apps/web/src/hooks/useSimulationMetadata.ts` |
| Page and styling | `apps/web/src/pages/SimulationRunsPage.tsx`, `SimulationRunsPage.css` |

Simulation 1–5 selector is wired to React state and selects the corresponding API metadata; initial selection is 1. Metadata is real, derived from the private roster. Loading, failure, retry, and abort handling exist. Analytical results are unavailable and **Run Simulation is disabled**. The page renders no analytical metrics. `simulationRunsMock.ts` exists but is not imported by this page. `useSimulationCapabilities.ts` exists but the current page uses only the metadata hook.

## Canonical cohort and generation

Backend-internal files: `apps/api/private/simulation-cohort/roster.json` and `provenance.json`. Both exist locally and the real-roster sampler test passes. They are gitignored and will not arrive in a fresh clone. Roster rows contain only string `RID` and `ENTRY_PHASE`; loading verifies checksum, unique IDs, exact counts, scope, and deterministic numeric RID ordering.

| ENTRY_PHASE | Cohort | Each simulation |
| --- | ---: | ---: |
| ADNI1 | 819 | 655 |
| ADNIGO | 130 | 104 |
| ADNI2 | 789 | 631 |
| ADNI3 | 699 | 559 |
| **Total** | **2,437** | **1,949** |

Generate only through the dedicated command, from an explicit validated seven-file backend upload:

```text
npm run cohort:publish -w @ad-clustering/api -- <absolute-backend-upload-directory>
```

The directory must be a direct child of `apps/api/uploads` named `upload-<13 digits>-<12 lowercase hex characters>`; `analysisInputManifest.ts` defines the required inputs. The command copies inputs and canonical scripts into a temporary private workspace and runs, in order, `audit_adni_inputs.py`, `audit_candidate_mapping.py`, `reconcile_variable_dictionary.py`, and `construct_study_entry_cohort.py` from `scripts/research/study_entry/`. Python comes from `RESEARCH_PYTHON` or repository `.venv`. It publishes the ADNI1–ADNI3 scope from freshly constructed `study_entry_cohort_unimputed.csv`, excluding ADNI4/TEAM. Provenance records input/script/source/roster hashes. Publication is atomic and idempotent for identical evidence; replacement by a different cohort is forbidden. It does not generate clustering results.

## Deterministic sampling contract

Simulation seeds: **1 → 101; 2 → 202; 3 → 303; 4 → 404; 5 → 505**.

`getSimulationSample(id)` accepts integers 1–5 and loads the canonical roster. Sampling is 80% stratified by `ENTRY_PHASE`, without replacement, with per-phase rounding `floor(n * 0.8 + 0.5)`, giving the counts above. Each phase ranks members by SHA-256 of compact JSON `["simulation-phase-rank-v1", seed, phase, RID]`, with numeric RID tie-breaking. Selected string IDs are sorted numerically. The internal membership fingerprint hashes compact JSON of that sorted array, without a newline. Repeated calls reproduce the same membership; all five sets are distinct. No diagnosis or outcome influences sampling.

`sampleParticipantIds` and `fingerprint` are backend-internal. Pass the **same selected RID set unchanged to both methods**; it is not yet connected to an analysis runner.

## Public API

`GET /api/simulations/metadata` returns `Cache-Control: no-store` and an object with exactly five distinct entries, IDs 1–5. Each entry has this shape (shown for Simulation 1; the other four have their corresponding ID):

```json
{
  "simulationId": 1,
  "sampleSize": 1949,
  "samplingFraction": 0.8,
  "samplingMethod": "deterministic stratified random sampling by ENTRY_PHASE",
  "phaseSampleCounts": { "ADNI1": 655, "ADNIGO": 104, "ADNI2": 631, "ADNI3": 559 },
  "sampleStatus": "sample_ready",
  "analysisStatus": "analysis_unavailable"
}
```

Response wrapper: `{ "simulations": [/* five entries of the shape above */] }`. No IDs, seeds, fingerprints, private paths, or analytical results are exposed. Failure is HTTP 503 with `{ "code": "SIMULATION_METADATA_UNAVAILABLE", "message": "Simulation sample metadata is unavailable." }`.

`GET /api/simulations/capabilities` currently returns `executionAvailable: false`, `code: "SUBSAMPLE_RUNNER_UNAVAILABLE"`, and a message explaining that participant-subsample execution is unsupported. The strict schema permits only false. There is no simulation execution endpoint in the current simulation router.

## DPC provenance repair to preserve

Study Findings reads `sop3` from `apps/api/artifacts/sop_evaluation_summary.json` through `/api/sop-evaluation`. Its strict shared-provenance predicate previously rejected the stale field `provenance.sourceSha256["data/interim/study_entry_cohort_unimputed.csv"]`:

- Old: `b9983abfd068c4c00006750c2d08e547bc0c7b2769b60080ae9733b4841c04eb`
- Verified replacement: `eff5f9759f4e56e85408f08bd357cf2a0b67b42073cced73bed1d83e922fb6f3`

All three local saved completed runs agree with the replacement. The preserved cohort in `data/processed/sop-provenance-fix-20260915/data/interim/` hashes to it, and that recovery's SOP numerical payload is exactly equal to the published payload. Those recovery files are local-only, not portable fixtures.

Files touched by the repair:

- `apps/api/artifacts/sop_evaluation_summary.json`: cohort hash only.
- `apps/api/artifacts/defense_geometry.json`: matching cohort hash and dependent SOP checksum linkage only; geometry data unchanged.
- `apps/api/artifacts/defense_geometry.sha256`: refreshed checksum.
- `apps/web/src/hooks/useSopEvaluation.ts` and new `apps/web/src/utils/sopProvenance.ts`: moved the predicate verbatim for testing; strict validation remains unchanged.
- New `apps/api/src/services/dpcProvenance.validation.ts`: regression coverage, including original mismatch rejection and saved-run compatibility.

DPC Silhouette/DBI/CH remain **0.372700 / 1.075885 / 1800.024958**; random means remain **0.372770 / 1.075644 / 1800.016609**; random seeds remain **0–29** (distinct from simulation sampling seeds). All numerical payloads were verified exactly unchanged. The live SOP API returned 200 and the frontend predicate accepted all saved runs; browser rendering was not inspected for that repair.

## Verified tests and blockers

Commands run from repository root. This handoff changed documentation only.

| Command | Last verified result |
| --- | --- |
| `npm run test:simulation-cohort -w @ad-clustering/api` | PASS, rerun for this handoff |
| `npm run test:simulation-sample -w @ad-clustering/api` | PASS with real private roster, all five samples; rerun for this handoff |
| `npm run test:simulation-metadata -w @ad-clustering/api` | PASS API/privacy, safe failure, hook states, page rendering; rerun for this handoff |
| `npx tsx apps/api/src/services/dpcProvenance.validation.ts` | PASS during preceding DPC repair |
| `python scripts/research/validation/test_sop_sequential_contract.py` | PASS, 2 tests during DPC repair |
| `npm run typecheck -w @ad-clustering/api` | PASS after DPC repair |
| `npm run typecheck -w @ad-clustering/web` | PASS after DPC repair |
| `npm run test:sop-evaluation -w @ad-clustering/api` | Numerical/schema/seed checks passed; suite failed later copying missing private `data/interim/clustering_features_standardized.csv` |
| `npm run test:frontend-contract -w @ad-clustering/api` | Initial route/separation checks passed; suite failed because `data/interim/unified_research_result.json` is missing |

`data/interim` currently contains only `.gitkeep`. Do not describe the two incomplete suites as fully passing or fabricate fixtures to make them pass. Windows sandbox runs encountered esbuild `spawn EPERM`; execution outside that restriction allowed tests to run. A fresh environment needs dependencies, the private roster/provenance pair or authorized uploads for publication, and the canonical research Python environment/data for analytical integration. The roster alone contains no feature matrix.

The main implementation blocker is absence of a participant-subsample runner. Canonical scripts contain frozen full-cohort shape checks and output paths: for example `run_enhanced_kmeans.py` expects `(2437, 6)`. Reuse the canonical implementation with a deliberate sample-aware interface and isolated output workspace; do not simply invoke the full-cohort entrypoints against repository `data/interim` or globally relax their validated defaults.

## Next intended task

**Integrate and test Simulation 1 first before running all five.**

1. Wire its selected RID set into the canonical Existing pipeline (`scripts/research/comparison/run_baseline_kmeans_comparison.py`).
2. Wire the exact same RID set into the canonical Enhanced pipeline: `scripts/research/study_entry/preprocess_study_entry.py`, `select_cluster_count_nbclust.py`, `dpc_initialize_clusters.py`, and `run_enhanced_kmeans.py`.
3. Compute real Silhouette/DBI/CH and enhanced-stage outputs for that sample. Test membership equality, reproducibility, aggregate-only response contracts, and isolation from frozen outputs.
4. Implement truthful execution/status contracts and enable Run Simulation only when the paired runner works.
5. Render the paired Existing/Enhanced comparison from real results; then extend verified execution to simulations 2–5.

Read `apps/api/src/services/researchStageManifest.ts` and `researchPipelineOrchestrator.ts` for canonical stage ordering and existing workspace isolation. The full-study orchestrator is not itself a simulation runner. Frozen Study Findings artifacts must **never be overwritten by simulation runs**, including `apps/api/artifacts/*` and canonical full-cohort intermediates/results.

## Do not do

- Do not reimplement PCA, NbClust, DPC, or K-Means.
- Do not expose RIDs publicly; participant IDs must remain backend-internal.
- Do not use diagnosis/outcomes for sampling.
- Do not overwrite canonical full-cohort artifacts or the frozen roster.
- Do not fabricate simulation metrics or substitute full-study results for sampled analysis.
- Do not redesign unrelated pages.
