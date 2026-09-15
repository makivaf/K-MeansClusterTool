# Simulation Runs developer handoff

## Current status — 2026-09-16

Real paired Simulation Runs execution is fully integrated. The current-state sections above the historical snapshot are authoritative. Historical sections preserve earlier verification and provenance only; they do not describe the current execution UI or API capabilities.

### Completed

- Simulations 1–5 are implemented, executed, and validated.
- Each simulation uses a different fixed deterministic 80% stratified participant sample.
- Each simulation contains exactly 1,949 participants.
- Existing K-Means and Enhanced K-Means receive the exact same RID membership within each simulation.
- The canonical Existing and Enhanced analytical pipelines are reused; no separate simulation-specific reimplementation was introduced.
- Existing uses the canonical baseline workflow in the original standardized 13-feature space with 30 random-initialization runs.
- Enhanced uses the canonical PCA → NbClust → DPC → Lloyd K-Means workflow.
- Silhouette, Davies-Bouldin, and Calinski-Harabasz are calculated from the real simulation outputs.
- Real PCA, NbClust, DPC, convergence, and cluster-distribution outputs are returned for Enhanced.
- Simulation outputs remain isolated from the validated full-cohort Study Findings artifacts.
- Participant IDs remain backend-internal.

### Five-simulation validation

All five simulations passed membership, reproducibility, isolation, result-schema, API privacy, and metric-direction validation.

All simulations used:
- 1,949 participants
- Existing selected k = 2
- Enhanced NbClust selected k = 2
- 6 retained principal components
- successful K-Means convergence before the iteration limit

Enhanced produced more favorable Silhouette, Davies-Bouldin, and Calinski-Harabasz values in all five simulations.

Simulation-specific participant samples remain fixed so that runs are reproducible. Simulations 1–5 represent different input samples; rerunning a simulation is intended to reproduce the same experiment rather than generate a new sample.
## Current Simulation Runs frontend state

The Simulation Runs frontend is connected to the real paired-analysis backend. Frontend integration is substantially complete; manual browser QA and final UI verification remain.

- The Simulation 1–5 selector uses real metadata. Initial selection shows sample metadata / `Sample ready` and `Run Simulation`; the tracker, execution status, and analytical results are hidden, even when backend metadata reports cached completion.
- `Run Simulation` explicitly starts the selected simulation's request flow with `GET /api/simulations/:simulationId/run`. Completed results are recovered without POST or recomputation; running work resumes GET polling. Only a confirmed `sample_ready` or `failed` state can lead to POST to start execution, subject to any active throttling cooldown.
- The horizontal progress tracker appears after Run/Rerun with these labels:

  `Preparing Sample → Preprocessing → Running Algorithms → Evaluating Results → Complete`

- The action button is disabled while the frontend run is active. Analytical results are hidden during both initial execution and rerun, and remain hidden after a failed attempt.
- Progress is a frontend presentation, not backend stage telemetry. Short sequential transitions hold at Running Algorithms until the API confirms `complete`, then proceed through Evaluating Results to Complete. Cached success follows the same presentation.
- After success, the completed tracker, Existing vs Enhanced results, and method tabs remain visible; the button becomes `Rerun Simulation`. Starting another attempt hides the previous results until that attempt succeeds. Changing simulations resets the execution view.
- Rerun uses the same selected simulation, fixed participant sample, configured seeds, and analytical configuration. It does not generate new data or automatically refresh the page. The existing backend returns completed cached results rather than forcing recomputation.
- Existing and Enhanced tabs retain their compact layout and use real backend results. The comparison uses real Silhouette, Davies-Bouldin, and Calinski-Harabasz values; the `Favorable method` column has been removed.
- PCA cumulative explained variance, NbClust votes, and both cluster distributions use real simulation outputs. Mock analytical values are not used.
- Current status wording is `Sample ready`, then after success `Paired analysis complete` and `Both methods used the same participant sample.`

### Current DPC Initialization & Reproducibility UI

The Enhanced K-Means card shows:

- Initialization: `Deterministic`, from `enhanced.initialization: "DPC"`.
- Centers selected: the real `enhanced.dpc.centroidCount`.
- Reproducibility status: `Passed`, from persisted `enhanced.dpc.determinismPassed: true`.

The current card does not display a repeated-check count. Inspection of all five simulations' private `result.json`, public results, and completed caches confirmed that checks-performed/checks-passed counts and per-repeat tables are not persisted. The simulation adapter calls DPC `validate_repeated_runs` and Enhanced `validate_reproducibility`, but discards their returned check tables; only the DPC pass flag is stored. `enhanced.nbclust.reproducible: true` is separate NbClust evidence.

Do not claim `3 / 3 identical` as a persisted result or infer a count from a configured repeat constant. This is missing persisted evidence, not merely a frontend contract omission. Do not copy the full-cohort 21/30 random-vs-DPC SOP 3 comparison into Simulation Runs.

### Execution and isolation

- `apps/api/src/services/simulationExecution.ts` resolves the unchanged deterministic sample, verifies the unimputed source against roster provenance, copies canonical research sources into `apps/api/private/simulation-runs/simulation-<id>-<uuid>/`, and runs the new `scripts/research/simulation/run_simulation.py` adapter.
- Default input: `apps/api/private/simulation-cohort/study_entry_cohort_unimputed.csv`. Alternatively set backend-only `SIMULATION_COHORT_SOURCE` to a file whose bytes match the published provenance hash. The local default was provisioned from the verified recovery cohort. No input path or participant IDs are accepted from HTTP clients.
- Filtering happens before canonical median imputation, scaling, and PCA. Existing receives the canonical standardized 13-variable table; Enhanced receives canonical PCA scores for exactly the same ordered RIDs. Explicit membership checks reject outsiders, duplicates, or counts other than 1,949.
- Canonical preprocessing and K-Means functions gained optional validation parameters. Frozen full-cohort defaults remain 2,437 rows, 13 baseline features, and 6 Enhanced components. Simulation PCA dimensions and selected k are data-derived. DPC source and its historical hash are unchanged. NbClust and DPC use their existing generic functions, including repeated reproducibility checks.
- Existing retains the canonical k sweep (2–10, seed 0, maximum Silhouette) and all 30 random initializations (seeds 0–29). Displayed Existing metrics are canonical means. Per-seed iterations, convergence-before-limit, cluster sizes, and metrics are returned; there is no best-run selection.
- No publication or full-study orchestrator stage is invoked. Run artifacts, logs, membership proof, before/after hashes, and public aggregate results live only in the private simulation workspace. Completed aggregate caches are separate and bound to sample/source hashes. Duplicate active requests are deduplicated within the API process; this is a single-process local execution service, not a distributed queue.
- `POST /api/simulations/:simulationId/run` starts work (202), or returns the existing completed result (200). `GET` on the same path returns `sample_ready`, `running`, `complete`, or `failed`. Capability discovery checks the verified source, Python executable, and canonical DPC source; Python/R package failures surface as safe failed status with private diagnostics.
- Simulation Runs uses its page and styles for the tracker, result gating, and real evidence presentation. It polls status and keeps scatter unavailable because the response does not expose a validated shared projection. These presentation refinements do not alter analytical logic or Study Findings artifacts.

### API and operational notes

These are local implementation details, not thesis methodology.

- Simulation POST execution is rate-limited: the observed and configured limit is **10 simulation POST requests/hour per client**, shared across simulation IDs. The in-memory limiter keys the client by request IP / remote address. POST requests for completed cached results also count toward the limit.
- `GET /api/simulations/:simulationId/run` can return a completed cached result without rerunning analysis and is not subject to this POST admission limiter. Metadata GET reflects the executor's current status; metadata completion alone does not reveal frontend results.
- Both HTTP 200 (`complete`, with a cached result) and HTTP 202 (`running`) are accepted by the frontend. Run/Rerun/Retry check GET status first: `complete` reveals results after progress presentation finishes, `running` resumes polling, and `sample_ready` or `failed` allows a POST when the cooldown permits. Subsequent polling never starts execution; a `failed` state returned by POST/polling shows the backend failure message. A failed GET does not trigger POST.
- HTTP **429 means request throttling, not analytical failure**. The observed response was `Too many simulation requests. Try again later.`, with remaining quota zero and a `Retry-After` header; contemporaneous GETs for all five simulations returned valid completed results and their execution logs ended with `paired_complete`.
- GET-first recovery and explicit HTTP 429 handling are implemented. Throttling shows `Simulation request throttled.` rather than reporting analytical failure; other request errors report that status could not be confirmed. Retry always checks GET/status before considering another POST, so completed or running work can be recovered without consuming POST quota.
- The existing CORS configuration exposes the `Retry-After` response header, allowing browser code on an allowed frontend origin to read it. The frontend accepts seconds or an HTTP date and blocks further POSTs until that deadline while continuing to allow GET-based recovery. When the header is absent or invalid, it shows a wait/retry message without inventing a cooldown duration. Sampling, analytical methods, result values, and the rate limit itself are unchanged.

### Simulation 1 verified results

| Metric | Existing (30-run mean) | Enhanced |
| --- | ---: | ---: |
| Silhouette | 0.32968077027813375 | 0.37063788413933707 |
| Davies–Bouldin | 1.2383905392806753 | 1.0885578897462729 |
| Calinski–Harabasz | 1123.9917838268052 | 1402.9491192358148 |

- Both: 1,949 participants, k=2. Enhanced favorable metrics: 3/3, computed using metric direction.
- Existing: 5–15 iterations, all 30 before the 300-iteration limit. Unordered size patterns: 695/1,254 (24 runs), 690/1,259 (3), 689/1,260 (3). Individual label order is retained in the API.
- Enhanced: 14 iterations; clusters 695 and 1,254. 13 retained variables (BNT/NPIQ excluded); 6 PCs retain 87.36705559585914% variance.
- NbClust: 24 usable indices; votes k2=9, k3=7, k4=4, k5–7=0, k8=1, k9=1, k10=2. No tie; repeat selection passed. Hubert and Dindex unavailable.
- DPC: 2 observation-based centroids in 6 dimensions; 2nd-percentile cutoff 1.363629175064057; 1,898,326 pairwise distances. Three-run determinism passed; Enhanced three-fit reproducibility passed. Centers' aggregate rho/delta/gamma: 184/10.841187209751121/1994.7784465942063 and 155/1.1278682837600085/174.8195839828013. IDs remain private.

The three-run/three-fit statement above records internal pipeline validation; it is not a persisted count field in the simulation result.

### Validation and limitations

The following integration validations were recorded before the latest UI refinements; they were not rerun for this documentation update.

- `npm run test:simulation-execution -w @ad-clustering/api` PASS at analytical integration. This is a real-artifact integration test requiring the completed private Simulation 1 cache; it never launches analysis. It checks exact ordered membership in all four preprocessing/PCA tables and all 30 baseline assignment sets, identical input fingerprints, strict public API privacy, comparison directions/ties, duplicate execution, failure sanitization, and rendered real-result/control states.
- **227 protected files** under `apps/api/artifacts`, `data/interim`, `data/processed`, and `apps/api/private/simulation-cohort` have equal before/after SHA-256 values. The test also compares current files against that snapshot. Membership fingerprints in the private proof agree with the unchanged sampler.
- Simulation cohort, sample, and metadata suites PASS. Root `npm run typecheck` PASS (shared/API/web). `test_simulation_subset.py` PASS (2 tests); `test_sop_sequential_contract.py` PASS (2 tests).
- Windows `spawn EPERM` required running affected TypeScript tests and analysis outside the sandbox.
- Browser rendering/interaction QA was blocked: Browser runtime reported `No browser is available` and an empty browser list. Actual component rendering was checked with the real result, including both detail sections, ready/running/failed states and stale-selection isolation. No browser screenshots or browser interaction claims.
- The historical full frontend-contract and SOP artifact suites still depend on missing canonical `data/interim` fixtures, as described below. Their full suites were not claimed passing. The frontend-contract capability assertion was updated for real execution support.
- Private inputs/results are gitignored and are not portable fixtures. Completed results are cached; to intentionally recompute after an algorithm change, invalidate the selected simulation's private cache while its API process is stopped. A failed process can leave diagnostic workspaces; there is no automatic simulation-data retention policy in this change.

The latest execution-suite attempt stopped at the frozen-file snapshot comparison because two additional local run-history files were absent from the original snapshot. A read-only comparison found no changed or missing snapshot-listed files. Do not modify analytical artifacts, caches, or the snapshot to work around this limitation.

Latest execution-state UI verification recorded PASS for `npm run typecheck -w @ad-clustering/web`, `node apps/web/src/pages/SimulationRunsPage.validation.cjs`, and `npm run test:simulation-metadata -w @ad-clustering/api`. The frontend regression check covered initial state with cached metadata, sequential progress, Run/Rerun result gating, completion/failure, fixed requests, and stale-response isolation. These are recorded results from that revision, not a claim that tests or browser QA were rerun during this documentation-only update.

### Files changed by the original analytical integration (historical inventory)

- `apps/api/package.json`
- `apps/api/src/app.ts`
- `apps/api/src/routes/simulations.ts`
- `apps/api/src/services/simulationExecution.ts` (new)
- `apps/api/src/services/simulationExecution.validation.ts` (new)
- `apps/api/src/services/simulationMetadata.validation.ts`
- `apps/api/src/services/frontendContract.validation.ts`
- `packages/shared/src/simulation.ts`
- `apps/web/src/pages/SimulationRunsPage.tsx`
- `scripts/research/study_entry/preprocess_study_entry.py`
- `scripts/research/study_entry/run_enhanced_kmeans.py`
- `scripts/research/comparison/run_baseline_kmeans_comparison.py`
- `scripts/research/simulation/run_simulation.py` (new)
- `scripts/research/validation/test_simulation_subset.py` (new)
- `docs/SIMULATION_RUNS_HANDOFF.md`

## Historical metadata-only snapshot

Verified 2026-09-16. Branch: `feat/simulation-runs-ui-refinement`; HEAD: `73ddf8f`.
This section and its subsections are historical and superseded as descriptions of execution capability. They preserve the earlier metadata-only architecture, verification, numerical results, and technical provenance. At that snapshot, the DPC repair below was uncommitted, including two new source files. Check the actual current `git status` before transferring the workspace; do not assume this historical file inventory is current.

### Historical architecture and metadata-only UI

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

At this earlier stage, the Simulation 1–5 selector used real roster-derived metadata, with loading, failure, retry, and abort handling; initial selection was 1. Analytical execution was unavailable and Run Simulation was disabled. Those capability/UI statements are superseded by the current implementation above. The page did not import `simulationRunsMock.ts` and then used only the metadata hook; the current page also uses `useSimulationCapabilities` and the execution endpoint.

### Canonical cohort and generation reference

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

### Deterministic sampling contract reference

Simulation seeds: **1 → 101; 2 → 202; 3 → 303; 4 → 404; 5 → 505**.

`getSimulationSample(id)` accepts integers 1–5 and loads the canonical roster. Sampling is 80% stratified by `ENTRY_PHASE`, without replacement, with per-phase rounding `floor(n * 0.8 + 0.5)`, giving the counts above. Each phase ranks members by SHA-256 of compact JSON `["simulation-phase-rank-v1", seed, phase, RID]`, with numeric RID tie-breaking. Selected string IDs are sorted numerically. The internal membership fingerprint hashes compact JSON of that sorted array, without a newline. Repeated calls reproduce the same membership; all five sets are distinct. No diagnosis or outcome influences sampling.

`sampleParticipantIds` and `fingerprint` are backend-internal. Pass the **same selected RID set unchanged to both methods**; The same selected RID set is now passed unchanged to both the Existing and Enhanced simulation pipelines.

### Historical metadata-only public API (superseded)

The payload below is retained as a historical example only. Its `analysisStatus: analysis_unavailable` is not the current execution state: the current metadata route uses `executor.get(...).status`, and execution/status endpoints are documented above.

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


### Historical DPC provenance repair to preserve

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

### Historical verified tests and blockers

Commands below were run from repository root for the historical snapshot. References to reruns describe that earlier verification, not this documentation update.

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

Canonical scripts contain frozen full-cohort shape checks and output paths: for example `run_enhanced_kmeans.py` expects `(2437, 6)`. Reuse the canonical implementation with a deliberate sample-aware interface and isolated output workspace; do not simply invoke the full-cohort entrypoints against repository `data/interim` or globally relax their validated defaults.


## Current next steps

- Backend and analytical integration are complete for Simulations 1–5.
- Frontend integration is substantially complete: the tracker, DPC pass-flag card, Run/Rerun behavior, status wording, and comparison-column removal are implemented.
- Remaining work is manual browser QA / final UI verification across all five simulations, including initial state, success, rerun, failures, cached responses, and selection changes.
- GET-first recovery, explicit throttling presentation, and CORS exposure of `Retry-After` are implemented. Include them in final browser verification; do not treat request throttling as analytical failure.
- Repeated-check counts are not persisted. Do not fabricate them or describe their exposure as already implemented.

Do not rerun or modify the analytical pipeline unless a genuine analytical defect is discovered.

## Do not do

- Do not reimplement PCA, NbClust, DPC, or K-Means.
- Do not expose RIDs publicly; participant IDs must remain backend-internal.
- Do not use diagnosis/outcomes for sampling.
- Do not overwrite canonical full-cohort artifacts or the frozen roster.
- Do not fabricate simulation metrics or substitute full-study results for sampled analysis.
- Do not redesign unrelated pages.
