# Research Integration Plan

## 1. Purpose

This plan defines what is still needed to safely connect the existing dashboard system to the already validated Alzheimer's disease clustering research pipeline.

The plan is intentionally limited to system/integration work. It does not propose rewriting or changing the research methodology.

## 2. Research/System Boundary

The validated research implementation is authoritative. The application layer must consume, orchestrate, or import its outputs.

Allowed system responsibilities:

- accept local-only raw CSV uploads during development
- invoke a coordinated orchestration boundary
- invoke separate Axis A and Axis B adapters
- validate distinct Axis A and Axis B aggregate run JSON outputs
- import aggregate run JSON outputs into PostgreSQL
- expose aggregate result APIs
- render aggregate visualizations

Disallowed system responsibilities:

- reimplement Axis A or Axis B algorithms in TypeScript
- merge Axis A and Axis B into one clustering dataset or one shared methodology
- redefine PCA, NbClust, DPC, K-Means, slope, cohort, missingness, imputation, or mapping rules
- persist raw ADNI CSV rows in PostgreSQL
- expose participant-level rows or identifiers through frontend/report APIs
- enable raw upload routes in production

## 3. Authoritative Research Components

The following repository files contain the authoritative research implementation and validation logic:

| Component | Authoritative File(s) |
|---|---|
| ADNI source/data workspace rules | `data/README.md` |
| ADNI audit | `scripts/research/audit_adni.py` |
| ADNI candidate variable mapping audit | `scripts/research/audit_adni_candidate_mapping.py` |
| ADNI dictionary reconciliation | `scripts/research/reconcile_adni_dictionary.py` |
| Axis A NPI-Q/scope audit | `scripts/research/audit_axis_a_scope_npiq.py` |
| Axis A cohort and study-entry construction | `scripts/research/construct_axis_a_study_entry.py` |
| Axis A missingness, imputation, scaling, PCA | `scripts/research/preprocess_axis_a.py` |
| Axis A NbClust k-selection | `scripts/research/select_axis_a_k_nbclust.py` |
| Axis A DPC initialization | `scripts/research/dpc_init_axis_a.py` |
| Axis A baseline comparison | `scripts/research/run_axis_a_baseline_comparison.py` |
| Axis A enhanced K-Means | `scripts/research/run_axis_a_enhanced_kmeans.py` |
| Axis A DPC ablation | `scripts/research/run_axis_a_dpc_ablation.py` |
| Axis B longitudinal audit | `scripts/research/audit_axis_b_longitudinal.py` |
| Axis B methodology reconciliation | `scripts/research/reconcile_axis_b_longitudinal_methodology.py` |
| Axis B cohort construction | `scripts/research/construct_axis_b_longitudinal_cohort.py` |
| Axis B ADAS-Cog13 slope extraction | `scripts/research/extract_axis_b_adas13_slopes.py` |
| Axis B NbClust k-selection | `scripts/research/select_axis_b_k_nbclust.py` |
| Axis B DPC methodology reconciliation | `scripts/research/reconcile_axis_b_dpc_methodology.py` |
| Axis B DPC seed audit | `scripts/research/select_axis_b_dpc_seeds.py` |
| Axis B final shared utilities | `scripts/research/axis_b_final_common.py` |
| Axis B final clustering | `scripts/research/run_axis_b_final_clustering.py` |
| Axis B random-init ablation | `scripts/research/run_axis_b_random_ablation.py` |
| Axis B sensitivity analysis | `scripts/research/run_axis_b_sensitivity_analysis.py` |
| Axis B final summary | `scripts/research/summarize_axis_b_results.py` |
| SOP 2 environment gate | `scripts/research/check_sop2_environment.py` |

## 4. Protected Research Components

The following are **PROTECTED - DO NOT MODIFY DURING NORMAL SYSTEM INTEGRATION**:

- `scripts/research/construct_axis_a_study_entry.py`
- `scripts/research/preprocess_axis_a.py`
- `scripts/research/select_axis_a_k_nbclust.py`
- `scripts/research/dpc_init_axis_a.py`
- `scripts/research/run_axis_a_baseline_comparison.py`
- `scripts/research/run_axis_a_enhanced_kmeans.py`
- `scripts/research/run_axis_a_dpc_ablation.py`
- `scripts/research/construct_axis_b_longitudinal_cohort.py`
- `scripts/research/extract_axis_b_adas13_slopes.py`
- `scripts/research/select_axis_b_k_nbclust.py`
- `scripts/research/select_axis_b_dpc_seeds.py`
- `scripts/research/reconcile_axis_b_dpc_methodology.py`
- `scripts/research/axis_b_final_common.py`
- `scripts/research/run_axis_b_final_clustering.py`
- `scripts/research/run_axis_b_random_ablation.py`
- `scripts/research/run_axis_b_sensitivity_analysis.py`
- `scripts/research/summarize_axis_b_results.py`

Generated raw/interim/processed data are also protected from normal app changes:

- `data/raw/adni/`
- `data/interim/`
- `data/processed/`

## 5. Existing Integration Capabilities

Current system capabilities:

- shared aggregate run schema in `packages/shared/src/schema.ts`
- TypeScript types inferred from Zod schemas
- dummy aggregate runs in `packages/shared/src/dummyRuns.ts`
- Prisma `ClusteringRun` model with JSON payload storage
- `importRun(payload)` that validates and upserts aggregate run JSON
- `GET /api/runs` list endpoint
- `GET /api/runs/:runId` single-run endpoint
- local-only CSV upload route
- local-only cluster run stub
- frontend local-only disabled state for non-local API base URLs
- reporting pages that render aggregate result data only

## 6. Missing Backend/API Functionality

| Missing Capability | Current State | Required Behavior | Layer | Likely Files | Priority |
|---|---|---|---|---|---|
| Coordinated analysis run request | `/api/cluster/run` accepts only `upload_ref` and returns one hardcoded dummy `run_id` | Accept one analysis request and coordinate both validated Axis A and Axis B pipelines | API contract | `packages/shared/src/schema.ts`, `apps/api/src/routes/cluster.ts`, `apps/web/src/pages/UploadAndCluster.tsx` | HIGH |
| Research process orchestrator | `runLocalPipelinePlaceholder()` waits and returns hardcoded dummy run | Coordinate separate Axis A and Axis B adapters without rewriting research logic | Backend service | new `apps/api/src/services/researchPipelineOrchestrator.ts` or similar | HIGH |
| Axis A adapter | Not implemented | Invoke the authoritative Axis A scripts/wrapper and locate Axis A aggregate output | Backend service | new adapter service under `apps/api/src/services/` | HIGH |
| Axis B adapter | Not implemented | Invoke the authoritative Axis B scripts/wrapper and locate Axis B aggregate output | Backend service | new adapter service under `apps/api/src/services/` | HIGH |
| Python/R subprocess orchestration | TODO only | Spawn validated pipeline commands, capture safe stdout/stderr, exit codes, timeouts, and output paths for both axes | Backend service | new orchestrator/adapter services, `apps/api/src/routes/cluster.ts` | HIGH |
| Dual run JSON generation/import | `importRun(payload)` exists but is not called by cluster route | Read both Axis A and Axis B aggregate `run_*.json` outputs, validate each with `ClusteringRunSchema`, import each via `importRun`, return both run IDs | Backend service/repository | `apps/api/src/services/runRepository.ts`, new orchestrator/adapter | HIGH |
| Research artifact to UI schema mapping | Dummy data manually matches schema | Produce distinct Axis A and Axis B aggregate JSON outputs from validated research artifacts matching `ClusteringRunSchema` | Adapter/possibly research-export wrapper | new adapter/export script; avoid modifying protected methodology scripts | HIGH |
| Parent analysis/session association | Repository stores independent `ClusteringRun` rows only | Optionally associate the Axis A and Axis B outputs from one user action under a logical analysis/session ID | Database/API | `apps/api/prisma/schema.prisma`, repository, shared schemas | MEDIUM |
| Execution status persistence | Frontend-only request status | Track queued/running/complete/failed jobs and link to Axis A and Axis B run IDs after completion | API/database | Prisma schema, API route(s), frontend hook/page | MEDIUM |
| Failure handling and diagnostics | Global 500 and frontend error string | Return structured safe errors without raw row data or sensitive file contents | API/service/frontend | `apps/api/src/app.ts`, route/service files, upload page | MEDIUM |
| Input validation manifest | CSV extension and size only | Validate the uploaded input set and determine which files are required for Axis A and Axis B before invoking either pipeline | Orchestrator/API | new orchestrator/service, route schema | MEDIUM |
| Production import policy | Production can read DB but upload/cluster routes disabled | Define safe production path for importing aggregate results only, or keep import local/dev only | Architecture/API | docs, repository, deployment config | MEDIUM |
| Single-run frontend fetch | Run-linked pages use list endpoint, not `GET /api/runs/:runId` | Optional targeted fetch to reduce payload size and improve 404 semantics | Frontend/API | `useRunData`, potential `useRunById` | LOW |

## 7. Missing Frontend Integration Functionality

| Missing Capability | Current State | Required Behavior | Layer | Likely Files | Priority |
|---|---|---|---|---|---|
| Single Run Analysis action | Uses selected files only and calls a placeholder run endpoint | Trigger the coordinated Axis A + Axis B workflow from one normal user action | Frontend | `apps/web/src/pages/UploadAndCluster.tsx` | HIGH |
| Real job status polling | Local state moves uploading -> processing -> done within one request | Poll or subscribe to persisted job status for long-running pipeline runs | Frontend/API | upload page, new status hook | MEDIUM |
| Refresh run list after dual import | Done links to one returned dummy run ID but run list may not refresh | Refresh `/api/runs` after import so selectors/pages include both Axis A and Axis B run outputs | Frontend | `useRunData`, upload page | MEDIUM |
| Results access for both axes | Done state links to one run ID | Show access to both Axis A and Axis B result sets after coordinated completion | Frontend | upload page, run-linked pages | MEDIUM |
| Safe pipeline error display | Displays generic route errors | Show sanitized execution errors without raw data values or file contents | Frontend | upload page, shared error schema | MEDIUM |
| Result availability guard | Run links work if returned ID exists in list | Ensure imported run is visible before routing or fetch single-run endpoint | Frontend/API | upload page, run-linked pages | MEDIUM |

Optional developer/testing capability:

- **OPTIONAL DEVELOPER/TESTING MODE**: a non-primary per-axis execution control may be useful for validating one adapter at a time. It must not become the normal thesis-system UX and must not imply that Axis A and Axis B share research logic.

## 8. Proposed Integration Architecture

```text
React Upload & Run page
  -> local-only POST /api/upload
  -> local-only POST /api/cluster/run { upload_ref, run_label? }
  -> researchPipelineOrchestrator.run({ upload_ref, run_label? })
       -> Axis A adapter
       -> Axis B adapter
       -> validated Axis A research scripts
       -> validated Axis B research scripts
       -> Axis A aggregate result JSON
       -> Axis B aggregate result JSON
  -> ClusteringRunSchema.parse(axisAJson)
  -> ClusteringRunSchema.parse(axisBJson)
  -> importRun(validatedAxisA)
  -> importRun(validatedAxisB)
  -> PostgreSQL ClusteringRun.payload rows
  -> GET /api/runs or GET /api/runs/:runId
  -> existing visualization pages for distinct Axis A and Axis B results
```

The orchestrator must be thin. It coordinates separate Axis A and Axis B adapters, but it must not contain PCA, NbClust, DPC, K-Means, slope, cohort, missingness, imputation, or variable-mapping logic.

## 9. Proposed Research Adapter/Orchestration Boundary

Recommended orchestrator responsibilities:

- resolve local upload directory from upload reference
- validate that the uploaded input set contains the files needed for both axes
- determine the Axis A and Axis B file requirements from a fixed manifest
- invoke an Axis A adapter for authoritative Axis A execution
- invoke an Axis B adapter for authoritative Axis B execution
- collect safe process metadata
- locate both generated aggregate `run_*.json` outputs
- validate both outputs with `ClusteringRunSchema`
- call `importRun` for each output
- optionally associate both outputs with one logical analysis/session
- return status plus both result run IDs

The orchestrator and adapters must not:

- parse participant-level CSV rows for research calculations
- implement PCA, NbClust, DPC, K-Means, slope extraction, cohort filtering, missingness, imputation, or mappings
- persist uploaded raw CSV content to PostgreSQL
- expose raw stdout/stderr if it can include participant-level data

## 10. Proposed End-to-End Flow

```text
[LOCAL ONLY] Data Input
  User selects CSVs
  -> POST /api/upload
  -> local filesystem upload_ref

[LOCAL ONLY] Processing
  POST /api/cluster/run { upload_ref, run_label? }
  -> orchestrator validates required input set
  -> Axis A adapter invokes authoritative Axis A pipeline wrapper
  -> Axis B adapter invokes authoritative Axis B pipeline wrapper
  -> Axis A aggregate run_*.json written
  -> Axis B aggregate run_*.json written

[IMPLEMENTED/PARTIAL] Results
  orchestrator validates both run_*.json outputs with ClusteringRunSchema
  -> importRun stores both aggregate payloads in PostgreSQL
  -> optional analysis/session association is recorded if implemented
  -> GET /api/runs/:runId returns each safe aggregate result

[IMPLEMENTED UI] Visualizations
  existing dashboard pages render aggregate fields for distinct Axis A and Axis B runs
```

## 11. Proposed API Contracts

### Existing: GET `/api/runs`

- Purpose: list available aggregate clustering runs
- Request: none
- Response: `RunListResponseSchema`
- Environment: all
- Data-safety: aggregate result payloads only

### Existing: GET `/api/runs/:runId`

- Purpose: fetch one aggregate clustering run
- Request: URL `runId`
- Response: `RunResponseSchema` or 404
- Environment: all
- Data-safety: aggregate result payload only

### Existing Local-Only: POST `/api/upload`

- Purpose: upload raw CSV files to local filesystem
- Request: multipart/form-data field `files`
- Response: `UploadResponseSchema`
- Environment: local/development only; not mounted in production
- Expected errors: non-CSV file, too many files, too-large file, missing file
- Data-safety: never persist raw files to PostgreSQL, never expose uploaded content in response

### Existing Scaffold Local-Only: POST `/api/cluster/run`

- Purpose: currently simulates pipeline execution
- Request: `{ upload_ref: string }`
- Response: `{ status: "complete", run_id: string }`
- Environment: local/development only; not mounted in production
- Expected errors: invalid upload reference, missing upload directory
- Data-safety: currently does not read or return raw file content

### PROPOSED - NOT YET IMPLEMENTED: POST `/api/cluster/run`

- Purpose: start one coordinated local analysis workflow for an uploaded dataset batch, executing both validated Axis A and Axis B pipelines as separate internal analyses.
- Request shape:

```ts
{
  upload_ref: string;
  run_label?: string;
}
```

- Response shape for synchronous MVP:

```ts
{
  status: "complete";
  axis_a_run_id: string;
  axis_b_run_id: string;
}
```

- Response shape for durable async version:

```ts
{
  status: "queued" | "running" | "complete" | "failed";
  job_id: string;
  axis_a_run_id?: string;
  axis_b_run_id?: string;
}
```

- A parent analysis/session ID would require a new persistence model and is **PROPOSED - NOT YET IMPLEMENTED**.
- Environment restriction: local/development only unless later changed to aggregate-only import.
- Expected errors: unknown upload reference, missing required files, Axis A pipeline exit failure, Axis B pipeline exit failure, missing output JSON, output schema validation failure, persistence failure.
- Data-safety considerations: error responses must not include raw row values, participant IDs, local raw file contents, or unredacted pipeline logs.

### PROPOSED - NOT YET IMPLEMENTED: GET `/api/cluster/jobs/:jobId`

- Purpose: poll long-running local research execution status
- Request: URL `jobId`
- Response shape:

```ts
{
  job_id: string;
  status: "queued" | "running" | "complete" | "failed";
  axis_a_run_id?: string;
  axis_b_run_id?: string;
  analysis_session_id?: string;
  message?: string;
  started_at?: string;
  finished_at?: string;
}
```

- `analysis_session_id` is **PROPOSED - NOT YET IMPLEMENTED** and depends on a future parent analysis/session model.
- Environment restriction: local/development only.
- Expected errors: job not found.
- Data-safety considerations: sanitized status only, no raw data or logs.

### PROPOSED - NOT YET IMPLEMENTED: POST `/api/runs/import`

- Purpose: import an already-generated aggregate `ClusteringRunSchema` JSON file or payload. In the coordinated workflow this would be called once per distinct Axis A/Axis B output, or replaced by a batch import contract.
- Request shape option A:

```ts
{
  payload: ClusteringRun;
}
```

- Request shape option B:

```ts
{
  local_result_path: string;
}
```

- Response shape:

```ts
{
  run_id: string;
  status: "imported";
}
```

- Batch import for one coordinated analysis/session is **PROPOSED - NOT YET IMPLEMENTED** and would require a reviewed contract before use.
- Environment restriction: local/development by default. Production should remain disabled unless deployment policy approves aggregate-only administrative import.
- Expected errors: schema validation failure, duplicate/import failure, unsafe path.
- Data-safety considerations: only aggregate JSON matching `ClusteringRunSchema`; no raw participant-level records.

## 12. Result/Persistence Requirements

Final application-facing outputs must:

- match `ClusteringRunSchema`
- contain no participant-level identifiers such as PTID, RID, subject IDs, row IDs, or visit-level records
- contain only aggregate summary fields needed by dashboard visualizations
- include enough metadata for axis, title, description, creation time, dataset summary, preprocessing summary, PCA summary, NbClust summary, DPC summary, condition metrics, and aggregate cluster profiles
- be persisted through `importRun(payload)` after validation
- remain distinct as Axis A and Axis B result payloads, even when produced by one coordinated user action

A logical parent analysis/session relationship may be useful for grouping the two outputs from one run request. That model is **PROPOSED - NOT YET IMPLEMENTED** because the current Prisma schema stores independent `ClusteringRun` rows only.

Raw CSV upload files must:

- remain in local filesystem upload directories
- not be stored in Prisma/PostgreSQL
- not be returned by any API endpoint
- not be served statically

## 13. Error-Handling Requirements

Backend errors should distinguish:

- upload validation failure
- missing upload reference
- missing Axis A required input
- missing Axis B required input
- Axis A research process failed
- Axis B research process failed
- Axis A research output missing
- Axis B research output missing
- Axis A research output schema invalid
- Axis B research output schema invalid
- database import failed
- result not found

Frontend errors should:

- show concise safe messages
- avoid raw data excerpts
- avoid participant identifiers
- keep the Upload & Run page disabled for non-local API base URLs
- provide a clear retry path for local development failures

## 14. Data-Safety Rules

Required rules for all future integration:

- Raw ADNI participant-level CSV files must never be sent to production API routes.
- Raw ADNI participant-level CSV files must never be persisted to PostgreSQL.
- Production APIs must return aggregate run payloads only.
- Frontend pages must render only `ClusteringRunSchema` aggregate fields.
- Cluster profiles must remain aggregate-only.
- Do not add participant IDs, PTID, RID, visit codes, row-level tables, assignment rows, or raw CSV previews to frontend pages.
- Pipeline logs returned to the browser must be sanitized or summarized.
- Any future schema expansion must be reviewed for participant-level leakage.

## 15. Production vs Local/Development Restrictions

Current restrictions:

- `clusterRouter` mounts only when `NODE_ENV !== "production"`.
- Upload page disables itself when `VITE_API_URL` is not local.
- Production dummy fallback is refused when no database is configured.

Future restrictions:

- Raw upload, pipeline execution, and job status endpoints should remain local/development only.
- Production should only read validated aggregate runs from PostgreSQL.
- Any production import pathway must be aggregate-only and explicitly reviewed.

## 16. Likely Files to Change

| File / Module | Expected Change | Purpose | Research Risk |
|---|---|---|---|
| `packages/shared/src/schema.ts` | Extend run request/status schemas | Add coordinated analysis execution contracts returning both Axis A and Axis B run IDs | LOW |
| `apps/api/src/routes/cluster.ts` | Replace placeholder call with adapter call; keep local-only guard | Connect upload_ref to validated execution boundary | LOW |
| `apps/api/src/services/runRepository.ts` | Reuse `importRun`; possibly add targeted queries | Persist validated aggregate results | LOW |
| `apps/api/prisma/schema.prisma` | Optional job-status and analysis/session model | Persist execution status and optionally group both axis results, not raw rows | LOW |
| `apps/api/src/services/researchPipelineOrchestrator.ts` | New orchestrator | Coordinate Axis A and Axis B adapters and import both aggregate JSON outputs | LOW |
| `apps/api/src/services/axisAAdapter.ts` | New adapter | Invoke authoritative Axis A pipeline wrapper | LOW |
| `apps/api/src/services/axisBAdapter.ts` | New adapter | Invoke authoritative Axis B pipeline wrapper | LOW |
| `apps/web/src/pages/UploadAndCluster.tsx` | Add coordinated Run Analysis status, result refresh, and links to both axis outputs | Complete local upload/run UX | LOW |
| `apps/web/src/hooks/useRunData.ts` | Optional refresh API or single-run fetch | Pick up imported runs after execution | LOW |
| `apps/web/src/App.tsx` | Optional route additions for job status/result detail | Navigate from jobs to result pages | LOW |
| `scripts/research/*` | No normal integration edits | Authoritative methodology implementation | PROTECTED - DO NOT MODIFY |
| `data/raw/adni/*` | No app edits | Raw ADNI local source data | PROTECTED - DO NOT MODIFY |
| `data/interim/*` | No normal app edits | Generated research artifacts | PROTECTED - DO NOT MODIFY |
| `data/processed/*` | No normal app edits | Generated research artifacts | PROTECTED - DO NOT MODIFY |

## 17. Files That Must Remain Untouched

During normal system integration, do not modify:

- `scripts/research/audit_adni.py`
- `scripts/research/audit_adni_candidate_mapping.py`
- `scripts/research/reconcile_adni_dictionary.py`
- `scripts/research/audit_axis_a_scope_npiq.py`
- `scripts/research/construct_axis_a_study_entry.py`
- `scripts/research/preprocess_axis_a.py`
- `scripts/research/select_axis_a_k_nbclust.py`
- `scripts/research/dpc_init_axis_a.py`
- `scripts/research/run_axis_a_baseline_comparison.py`
- `scripts/research/run_axis_a_enhanced_kmeans.py`
- `scripts/research/run_axis_a_dpc_ablation.py`
- `scripts/research/audit_axis_b_longitudinal.py`
- `scripts/research/reconcile_axis_b_longitudinal_methodology.py`
- `scripts/research/construct_axis_b_longitudinal_cohort.py`
- `scripts/research/extract_axis_b_adas13_slopes.py`
- `scripts/research/select_axis_b_k_nbclust.py`
- `scripts/research/reconcile_axis_b_dpc_methodology.py`
- `scripts/research/select_axis_b_dpc_seeds.py`
- `scripts/research/axis_b_final_common.py`
- `scripts/research/run_axis_b_final_clustering.py`
- `scripts/research/run_axis_b_random_ablation.py`
- `scripts/research/run_axis_b_sensitivity_analysis.py`
- `scripts/research/summarize_axis_b_results.py`
- `scripts/research/check_sop2_environment.py`
- `data/raw/adni/*`
- `data/interim/*`
- `data/processed/*`

These files are **PROTECTED - DO NOT MODIFY DURING NORMAL SYSTEM INTEGRATION**.

## 18. Implementation Work Breakdown

### Phase 1 - Coordinated Integration Contract

- Objective: define how one local analysis request represents both Axis A and Axis B execution.
- Dependencies: current shared Zod schema and UI fields.
- Likely files: `packages/shared/src/schema.ts`, documentation.
- Deliverable: reviewed API contract with no research-method changes.
- Acceptance criteria: contract includes upload reference, optional run label, status, Axis A run ID, Axis B run ID, safe errors, and aggregate-only result rules.

### Phase 2 - Research Orchestrator

- Objective: create a thin backend orchestration layer that invokes separate Axis A and Axis B adapters.
- Dependencies: Phase 1 contract; confirmed local research environment.
- Likely files: new `apps/api/src/services/researchPipelineOrchestrator.ts`, new axis adapter files, `apps/api/src/routes/cluster.ts`.
- Deliverable: orchestrator stub with fixed command allowlists and safe process handling for both axes.
- Acceptance criteria: no PCA/NbClust/DPC/K-Means/slope/cohort logic is implemented in TypeScript.

### Phase 3 - Axis A / Axis B Aggregate Output Mapping

- Objective: safely convert each validated pipeline's outputs into application-facing aggregate schemas without changing research logic.
- Dependencies: Phase 2 orchestrator can invoke both axis adapters.
- Likely files: new adapter/export wrapper files; protected research files remain untouched.
- Deliverable: one Axis A aggregate JSON and one Axis B aggregate JSON, each matching `ClusteringRunSchema`.
- Acceptance criteria: Axis A and Axis B remain distinct and no participant-level identifiers enter application-facing JSON.

### Phase 4 - Persistence

- Objective: persist both result sets and, if needed, define a logical parent analysis/session relationship.
- Dependencies: Phases 1-3.
- Likely files: `apps/api/src/services/runRepository.ts`, optional Prisma job/session model.
- Deliverable: validated aggregate import through `ClusteringRunSchema` and `importRun` for both outputs.
- Acceptance criteria: raw CSV content is never inserted into PostgreSQL; parent analysis/session model is documented as **PROPOSED - NOT YET IMPLEMENTED** until implemented.

### Phase 5 - Backend API Integration

- Objective: replace `/api/cluster/run` placeholder behavior with coordinated Axis A + Axis B execution.
- Dependencies: Phases 1-4.
- Likely files: `apps/api/src/routes/cluster.ts`, app error handler, shared schemas.
- Deliverable: local-only run endpoint returning both real run IDs or safe failures.
- Acceptance criteria: route remains unmounted in production; failed pipeline output does not leak raw data.

### Phase 6 - Frontend Integration

- Objective: make "Run Analysis" trigger the coordinated workflow and display access to both Axis A and Axis B results.
- Dependencies: Phase 5 API behavior.
- Likely files: `apps/web/src/pages/UploadAndCluster.tsx`, `apps/web/src/hooks/useRunData.ts`.
- Deliverable: user can upload locally, run one coordinated analysis, and open both resulting aggregate reports.
- Acceptance criteria: page remains disabled for non-local API base URLs; result pages render only aggregate fields.

### Phase 7 - End-to-End Verification

- Objective: verify upload -> run analysis -> Axis A completes -> Axis B completes -> both aggregate outputs persist -> both result views display correctly.
- Dependencies: Phases 1-6 and local authorized ADNI data.
- Likely files: test scripts, docs, maybe local verification notes.
- Deliverable: documented local run producing distinct validated Axis A and Axis B aggregate outputs visible in dashboard/result pages.
- Acceptance criteria: raw data remains local, production result APIs expose only aggregate JSON, and protected research files are unchanged.

## 19. Dependencies Between Implementation Tasks

```text
Contract review
  -> coordinated orchestrator boundary
  -> separate Axis A and Axis B adapters
  -> aggregate JSON mapping/export
  -> dual importRun persistence
  -> local-only API replacement
  -> frontend status/result refresh
  -> end-to-end verification
```

The orchestrator boundary should be reviewed before any route begins invoking research scripts.

## 20. Acceptance Criteria

Future integration should be accepted only when:

- Axis A and Axis B research scripts are invoked, not rewritten.
- Axis A and Axis B remain methodologically separate while being coordinated by one normal user action.
- PCA, NbClust, DPC, slope, cohort, variable mapping, missingness, and imputation rules remain unchanged.
- Raw ADNI files remain local-only.
- Production does not mount upload or raw-processing routes.
- PostgreSQL contains only aggregate `ClusteringRunSchema` payloads and optional sanitized job metadata.
- Frontend pages render only aggregate run fields.
- Upload & Run can execute a coordinated local analysis and navigate to both Axis A and Axis B result sets.
- Invalid runs and failed executions show safe errors.
- `GET /api/runs` and `GET /api/runs/:runId` return validated aggregate schemas.
- Documentation is updated with the final orchestrator command(s), adapter boundaries, and result-output locations.

## 21. Checklist Verification

### Inspection Tasks

| Item | Status |
|---|---|
| Review existing frontend pages/components and current backend routes. | READY TO CHECK |
| Map current UI flow: data input -> processing -> results -> visualizations. | READY TO CHECK |
| Identify which screens are complete and which are placeholders. | READY TO CHECK |
| Identify what backend/API functionality is missing for executing the validated research pipeline. | READY TO CHECK |

### Research Safety Constraints

| Item | Status |
|---|---|
| Axis A/Axis B algorithms were not rewritten. | READY TO CHECK |
| Variable mappings were not changed. | READY TO CHECK |
| k-selection rules were not changed. | READY TO CHECK |
| PCA logic was not changed. | READY TO CHECK |
| DPC logic was not changed. | READY TO CHECK |
| Slope calculation was not changed. | READY TO CHECK |
| Cohort rules were not changed. | READY TO CHECK |
| Raw ADNI participant-level data is not exposed through the frontend. | READY TO CHECK |

### Workflow Safety

| Item | Status |
|---|---|
| Work is on a separate integration branch. | READY TO CHECK |
| Architecture findings were documented before major integration changes. | READY TO CHECK |
