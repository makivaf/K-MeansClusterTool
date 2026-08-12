# System Architecture Audit

> Historical baseline: this audit records the pre-integration scaffold at `origin/main`/`b054eb7`. Statements about the hard-coded run ID and placeholder endpoint are retained as evidence of the starting state; the integration branch replaces that behavior. See `THESIS_FINALIZATION_CHECKLIST.md` and `PRODUCT_MODEL_AND_CONTRACT_AUDIT.md` for current status.

## 1. Audit Scope

This audit covers the current system/integration layer of the Alzheimer's disease clustering thesis repository:

- React/Vite/TypeScript frontend in `apps/web/src`.
- Express/Node backend in `apps/api/src`.
- Prisma/PostgreSQL schema and seed flow in `apps/api/prisma`.
- Shared Zod schemas and dummy aggregate run payloads in `packages/shared/src`.
- Data-safety and research-boundary checks against `data/` and `scripts/research/`.

This audit does not modify or validate the research methodology itself. The research scripts under `scripts/research/` are treated as authoritative implementation artifacts.

## 2. Repository Verification

Initial Git state:

```text
branch: main
status: uncommitted changes existed in app integration files
```

Because `main` is not a dedicated integration branch, a new branch was created:

```text
integration-system-integration
```

The first requested branch name, `integration/system-integration`, could not be created in this sandboxed environment because Git could not create the nested ref path. The replacement name preserves the same intent without modifying branch history.

Existing uncommitted files before this audit:

- `apps/api/src/services/runRepository.ts`
- `apps/web/src/App.tsx`
- `apps/web/src/components/run/RunSelector.tsx`
- `apps/web/src/hooks/useRunData.ts`
- `apps/web/src/pages/RunLinkedPage.tsx`

Those files were not reverted, committed, or pushed.

## 3. Current Application Architecture

The application is a monorepo with three main runtime packages:

```text
apps/web
  React + Vite + TypeScript + Tailwind + Recharts

apps/api
  Express + TypeScript + Prisma + Multer

packages/shared
  Zod schemas, TypeScript types, dummy aggregate run data
```

The current application architecture is aggregate-result first:

```text
Frontend pages
  -> useRunData()
  -> GET /api/runs
  -> runRepository.listRuns()
  -> PostgreSQL ClusteringRun.payload when DATABASE_URL exists
  -> development dummyRuns fallback outside production
```

Prisma stores one validated JSON payload per clustering run in `apps/api/prisma/schema.prisma:10`. The payload shape is defined by `ClusteringRunSchema` in `packages/shared/src/schema.ts:110`.

## 4. Frontend Inventory

### Routing

Routes are defined in `apps/web/src/App.tsx:20-55`.

Implemented routes:

- `/` redirects to `/upload-cluster`.
- `/upload-cluster` renders `UploadAndCluster`.
- `/dashboard` renders `DashboardPage`.
- `/preprocessing` renders `PreprocessingPage`.
- `/pca` renders `PcaPage`.
- `/nbclust` renders `NbClustPage`.
- `/dpc-init` renders `DpcInitPage`.
- `/comparison` renders `ComparisonPage`.
- `/cluster-profiles` renders `ClusterProfilesPage`.
- `/runs/:runId/comparison` renders `RunLinkedPage` with `ComparisonPage`.
- `/runs/:runId/cluster-profiles` renders `RunLinkedPage` with `ClusterProfilesPage`.
- `*` redirects to `/upload-cluster`.

### Layout

`AppShell` provides the fixed sidebar, top run selector, and summary header in `apps/web/src/components/layout/AppShell.tsx`.

Sidebar order is currently:

```text
Upload & Run
Dashboard
Preprocessing
PCA
NbClust
DPC-init
Comparison
Cluster Profiles
```

Evidence: `navItems` in `apps/web/src/components/layout/AppShell.tsx:18-27`.

The sidebar summary uses aggregate selected-run fields only:

- dataset name
- retained participant count
- selected axis
- selected k
- cumulative explained variance
- feature count

Evidence: `apps/web/src/components/layout/AppShell.tsx:84-116`.

### Data Fetching

`useRunData` fetches `/api/runs`, validates the response with `RunListResponseSchema`, and manages selected axis/run state.

Evidence:

- Fetch call: `apps/web/src/hooks/useRunData.ts:43`
- Zod response validation: `apps/web/src/hooks/useRunData.ts:47`
- URL run-id handling: `apps/web/src/hooks/useRunData.ts:33`
- invalid run guard: `apps/web/src/hooks/useRunData.ts:67-85`

### Upload/Input Components

`UploadAndCluster` provides local-only CSV selection and run triggering:

- file input accepts multiple `.csv` files
- calls `POST /api/upload`
- calls `POST /api/cluster/run`
- validates responses with shared Zod schemas
- links to `/runs/:runId/comparison` and `/runs/:runId/cluster-profiles`

Evidence:

- component: `apps/web/src/pages/UploadAndCluster.tsx:19`
- upload fetch: `apps/web/src/pages/UploadAndCluster.tsx:48`
- run fetch: `apps/web/src/pages/UploadAndCluster.tsx:61`
- completion links: `apps/web/src/pages/UploadAndCluster.tsx:160-171`

### Visualization Components

Current chart/table components are modular and consume shared aggregate types:

- `PcaScreeChart`: `apps/web/src/components/charts/PcaScreeChart.tsx:8`
- `NbClustVotesChart`: `apps/web/src/components/charts/NbClustVotesChart.tsx:9`
- `DpcGammaScatter`: `apps/web/src/components/charts/DpcGammaScatter.tsx:9`
- `MetricsBarChart`: `apps/web/src/components/charts/MetricsBarChart.tsx:9`
- `DistributionBars`: `apps/web/src/components/charts/DistributionBars.tsx:7`
- `MetricsTable`: `apps/web/src/components/tables/MetricsTable.tsx:9`
- `ClusterProfileTable`: `apps/web/src/components/tables/ClusterProfileTable.tsx:10`
- `PreprocessingTable`: `apps/web/src/components/tables/PreprocessingTable.tsx:7`
- `VoteSummaryTable`: `apps/web/src/components/tables/VoteSummaryTable.tsx:7`
- `DpcCentroidsTable`: `apps/web/src/components/tables/DpcCentroidsTable.tsx:7`

## 5. Backend/API Inventory

Backend setup is in `apps/api/src/app.ts`.

Mounted middleware:

- `cors()` at `apps/api/src/app.ts:10`
- `express.json()` at `apps/api/src/app.ts:11`
- local-only cluster router when `NODE_ENV !== "production"` at `apps/api/src/app.ts:39-40`
- global error handler at `apps/api/src/app.ts:43`

### Endpoint Inventory

| Method | Path | Source File | Purpose | Environment | Handler / Service | Input | Output | Status |
|---|---|---|---|---|---|---|---|---|
| GET | `/api/health` | `apps/api/src/app.ts:13` | Health check | All | inline Express handler | none | `{ ok: true }` | COMPLETE |
| GET | `/api/runs` | `apps/api/src/app.ts:17` | List aggregate clustering runs | All | `listRuns()` | none | `RunListResponseSchema` | PARTIAL |
| GET | `/api/runs/:runId` | `apps/api/src/app.ts:26` | Fetch one aggregate run by ID | All | `getRunById()` | URL `runId` | `RunResponseSchema` or 404 | PARTIAL |
| POST | `/api/upload` | `apps/api/src/routes/cluster.ts:80` and `:90` | Save local CSV uploads to filesystem | Local/dev only | Multer disk storage | multipart `files` | `UploadResponseSchema` | PARTIAL |
| POST | `/api/cluster/run` | `apps/api/src/routes/cluster.ts:106` | Simulate local pipeline run | Local/dev only | `runLocalPipelinePlaceholder()` | `{ upload_ref }` | `ClusterRunResponseSchema` | SCAFFOLD |

`GET /api/runs` and `GET /api/runs/:runId` are partial because they can serve persisted aggregate JSON, but the production research import path is not connected to the validated pipeline yet.

### Repository/Persistence

`runRepository`:

- reads from Prisma when `DATABASE_URL` exists
- validates stored payloads with `ClusteringRunSchema`
- refuses dummy fallback in production without DB access
- falls back to `dummyRuns` only outside production
- contains `importRun(payload)` for validated aggregate run persistence

Evidence:

- production guard: `apps/api/src/services/runRepository.ts:21-22`
- Prisma read: `apps/api/src/services/runRepository.ts:27-31`
- development dummy fallback: `apps/api/src/services/runRepository.ts:35-37`
- import function: `apps/api/src/services/runRepository.ts:46`

Prisma model:

- `ClusteringRun` with `runId`, `axis`, `title`, JSON `payload`, and `createdAt`
- evidence: `apps/api/prisma/schema.prisma:10-18`

## 6. Current UI Flow

```text
DATA INPUT
  [PARTIAL][LOCAL ONLY]
  User selects CSV files in UploadAndCluster
  -> frontend sends multipart request to POST /api/upload
  -> Express/Multer saves files under apps/api/uploads
  -> response returns upload_ref, filenames, file_count

PROCESSING
  [SCAFFOLD][LOCAL ONLY]
  User clicks Run Clustering
  -> frontend sends upload_ref to POST /api/cluster/run
  -> backend validates upload_ref exists on local disk
  -> runLocalPipelinePlaceholder waits about 1.5s
  -> returns hardcoded run_id axis-a-baseline-2024-05-18

RESULTS
  [PARTIAL]
  Frontend fetches GET /api/runs
  -> backend listRuns reads PostgreSQL ClusteringRun.payload when available
  -> or uses development dummyRuns outside production
  -> payload is validated against RunListResponseSchema
  -> selectedRun is stored in useRunData

VISUALIZATIONS
  [IMPLEMENTED UI][SCAFFOLD DATA]
  selectedRun aggregates feed dashboard cards, PCA scree, NbClust votes,
  DPC gamma scatter, comparison metrics, and aggregate cluster profiles
```

## 7. Data Input Flow

Current implemented path:

```text
User
  -> UploadAndCluster file input
  -> browser File objects only
  -> FormData sent to `${API_BASE_URL}/api/upload`
  -> local-only Express clusterRouter
  -> multer fileFilter enforces `.csv`
  -> multer stores files to apps/api/uploads/<upload_ref>/
  -> UploadResponseSchema response
```

Evidence:

- frontend file input: `apps/web/src/pages/UploadAndCluster.tsx:103-112`
- upload request: `apps/web/src/pages/UploadAndCluster.tsx:48-51`
- router mounted outside production: `apps/api/src/app.ts:39-40`
- upload storage root: `apps/api/src/routes/cluster.ts:21`
- CSV filter: `apps/api/src/routes/cluster.ts:69-75`
- file limits: `apps/api/src/routes/cluster.ts:63-68`

Current limitation:

- The upload/run flow does not yet define a coordinated analysis workflow that executes both validated Axis A and Axis B analyses from one user action.
- The current placeholder is not tied to either validated Axis A execution or validated Axis B execution.
- Uploaded raw CSV files are not processed by the validated research pipeline yet.

## 8. Processing Flow

Current implemented path:

```text
POST /api/cluster/run
  -> ClusterRunRequestSchema.parse(request.body)
  -> getUploadDir(upload_ref)
  -> fs.existsSync(uploadDir)
  -> runLocalPipelinePlaceholder(upload_ref)
  -> hardcoded existing dummy run_id
```

Evidence:

- run endpoint: `apps/api/src/routes/cluster.ts:106-119`
- placeholder function: `apps/api/src/routes/cluster.ts:122-140`

The validated Axis A/Axis B pipelines are not currently executed by the application layer. The current placeholder does not orchestrate Axis A, Axis B, or a combined analysis session.

The existing code TODO describes only a generic single-output placeholder handoff:

```text
spawn run_pipeline.py <uploaded_file_path>
wait for run_*.json
validate with ClusteringRunSchema
import aggregate JSON via importRun
return real run_id
```

Evidence: `apps/api/src/routes/cluster.ts:127-134`.

That TODO is not the complete corrected future execution model. The corrected future model needs a coordinating orchestrator that can trigger separate validated Axis A and Axis B pipelines from one analysis request and persist distinct aggregate outputs for both.

## 9. Results Flow

Current implemented path:

```text
PostgreSQL ClusteringRun.payload or shared dummyRuns
  -> listRuns()
  -> GET /api/runs
  -> RunListResponseSchema.parse()
  -> useRunData()
  -> selectedRun
  -> pages/charts/tables
```

Single-run route:

```text
GET /api/runs/:runId
  -> getRunById(runId)
  -> 404 if missing
  -> RunResponseSchema.parse({ run })
```

The frontend currently fetches the list endpoint for normal report pages. It does not currently use `GET /api/runs/:runId` for run-linked detail pages.

## 10. Visualization Flow

Aggregate fields used by screens:

- Dashboard: `nbclust.selected_k`, `pca.cumulative_explained_variance`, condition metrics.
- Preprocessing: missingness threshold, initial/retained sample sizes, excluded variables, imputation/scaling text.
- PCA: `pca.scree_data`, retained component count, cumulative variance.
- NbClust: `nbclust.index_votes`, `nbclust.vote_summary`, `selected_k`.
- DPC-init: `dpc_init.gamma_values`, `dpc_init.selected_centroids`.
- Comparison: baseline/enhanced `metrics`.
- Cluster Profiles: condition-level `cluster_profiles`, `n_members`, `variable_means`, `post_hoc_summary`.

No visualization component currently reads uploaded CSV content or participant-level rows.

## 11. Screen Completion Matrix

| Screen | Route | Component | Classification | Evidence / Reason |
|---|---|---|---|---|
| Upload & Run | `/upload-cluster` | `UploadAndCluster` | PARTIAL | UI and real upload calls exist, but pipeline execution is placeholder and always returns a dummy run ID. |
| Dashboard | `/dashboard` | `DashboardPage` | PARTIAL | Intended aggregate UI exists, but data source is dummy or preloaded JSON, not validated live pipeline output. |
| Preprocessing | `/preprocessing` | `PreprocessingPage` | PARTIAL | Renders required aggregate summary, but depends on current run payload being precomputed. |
| PCA | `/pca` | `PcaPage` | PARTIAL | Renders scree/cumulative summary from schema; no real pipeline import connected. |
| NbClust | `/nbclust` | `NbClustPage` | PARTIAL | Renders votes and summary; no real pipeline import connected. |
| DPC-init | `/dpc-init` | `DpcInitPage` | PARTIAL | Renders gamma and centroid aggregates; no real pipeline import connected. |
| Comparison | `/comparison`, `/runs/:runId/comparison` | `ComparisonPage`, `RunLinkedPage` | PARTIAL | Core UI works on aggregate run payloads; actual pipeline execution/import is missing. |
| Cluster Profiles | `/cluster-profiles`, `/runs/:runId/cluster-profiles` | `ClusterProfilesPage` | PARTIAL | Aggregate-only display is implemented; real result generation/import is missing. |

No expected screen from the current dashboard brief is fully not implemented. No screen should be marked COMPLETE because none has a full validated pipeline-to-database-to-UI integration yet.

## 12. Dummy/Scaffold Functionality

Dummy/scaffold elements:

- `packages/shared/src/dummyRuns.ts:189-366` defines three dummy aggregate runs.
- `apps/api/prisma/seed.ts:6-21` seeds dummy runs into PostgreSQL.
- `apps/api/src/services/runRepository.ts:19` contains a TODO to replace dummy fallback with real finalized pipeline outputs.
- `apps/api/src/routes/cluster.ts:122-140` simulates pipeline execution and returns a hardcoded dummy run ID.

## 13. Local-Only Functionality

Local-only functionality:

- `clusterRouter` is mounted only when `process.env.NODE_ENV !== "production"` in `apps/api/src/app.ts:39-40`.
- `apps/api/src/routes/cluster.ts:1-2` documents DUA compliance and raw CSV local-only handling.
- `POST /api/upload` writes raw CSV files to local disk under `apps/api/uploads`.
- `POST /api/cluster/run` accepts local upload references and returns a placeholder result.
- `apps/api/uploads` is gitignored.

Frontend production-disabled behavior:

- `isLocalApiBaseUrl` allows only localhost/127.0.0.1/::1 API base URLs in `apps/web/src/config/api.ts`.
- `UploadAndCluster` shows a disabled local-only message when the API base URL is not local.

## 14. Data-Safety Verification

Current finding: no confirmed raw ADNI participant-level data exposure through frontend or production-facing result APIs.

Evidence:

- Production does not mount upload/cluster raw-data routes: `apps/api/src/app.ts:39-40`.
- Uploaded files stay in local filesystem only: `apps/api/src/routes/cluster.ts:1-2`, `apps/api/src/routes/cluster.ts:21`.
- No backend route serves files from `apps/api/uploads`.
- Prisma stores only `ClusteringRun.payload` JSON, not raw CSV rows: `apps/api/prisma/schema.prisma:15`.
- Shared result schema contains aggregate fields and does not define participant IDs or row-level records: `packages/shared/src/schema.ts:6-126`.
- Cluster profile UI renders aggregate `n_members`, `variable_means`, and post-hoc distributions only: `apps/web/src/components/tables/ClusterProfileTable.tsx:10-47`.
- Raw data directory is gitignored and documented as local-only: `.gitignore` and `data/README.md`.

Potential risk:

- Future `importRun(payload)` will persist whatever aggregate JSON passes `ClusteringRunSchema`. The current schema does not include participant-level IDs, which is good. Future schema expansion must preserve that boundary.

No Critical Data-Safety Finding was confirmed during this audit.

## 15. Research-Logic Duplication Verification

Current finding: the React/Express application layer does not implement or rewrite the validated research methodology.

Application-layer search found:

- display formatting for PCA/NbClust/DPC/K-Means labels and charts
- metric delta display helper in `apps/web/src/utils/metrics.ts`
- a placeholder orchestration TODO in `apps/api/src/routes/cluster.ts`
- dummy aggregate data in `packages/shared/src/dummyRuns.ts`

No TypeScript implementation of PCA, NbClust, DPC cutoff logic, k-selection, ADAS-Cog13 slope calculation, cohort construction, imputation, missingness logic, or K-Means fitting was found in `apps/`.

The authoritative research logic is in `scripts/research/`, including:

- Axis A cohort/variable construction: `scripts/research/construct_axis_a_study_entry.py`
- Axis A preprocessing/PCA/imputation/scaling: `scripts/research/preprocess_axis_a.py`
- Axis A NbClust k-selection: `scripts/research/select_axis_a_k_nbclust.py`
- Axis A DPC-init: `scripts/research/dpc_init_axis_a.py`
- Axis A final enhanced K-Means: `scripts/research/run_axis_a_enhanced_kmeans.py`
- Axis A baseline comparison/ablation: `scripts/research/run_axis_a_baseline_comparison.py`, `scripts/research/run_axis_a_dpc_ablation.py`
- Axis B cohort construction: `scripts/research/construct_axis_b_longitudinal_cohort.py`
- Axis B ADAS-Cog13 slope extraction: `scripts/research/extract_axis_b_adas13_slopes.py`
- Axis B NbClust k-selection: `scripts/research/select_axis_b_k_nbclust.py`
- Axis B DPC seed audit: `scripts/research/select_axis_b_dpc_seeds.py`
- Axis B final clustering common utilities: `scripts/research/axis_b_final_common.py`
- Axis B final clustering and summaries: `scripts/research/run_axis_b_final_clustering.py`, `scripts/research/summarize_axis_b_results.py`

Desired integration boundary remains:

```text
Application layer
  -> adapter/orchestrator
  -> separate authoritative Axis A and Axis B research implementations
  -> distinct aggregate JSON outputs matching ClusteringRunSchema
```

Axis A and Axis B must remain methodologically separate inside that boundary. A future user-facing "Run Analysis" action may coordinate both pipelines, but it must not merge their datasets, PCA/clustering operations, or validated research logic.

## 16. Architecture Findings

### Finding 1: Reporting UI is broadly scaffolded but not fully integrated

All expected dashboard/report screens exist and render schema-shaped aggregate run data. They are partial because they do not yet consume output from a validated pipeline execution triggered by the app.

### Finding 2: Backend has result retrieval and persistence primitives

The backend can list runs, retrieve a run by ID, validate API responses, and upsert aggregate JSON payloads. This is a useful base for integration.

### Finding 3: Pipeline execution is explicitly placeholder

`POST /api/cluster/run` validates an upload reference and waits, but it does not spawn or invoke research scripts. It returns `axis-a-baseline-2024-05-18` regardless of input.

### Finding 4: Local-only raw upload boundary is present

Upload routes are not mounted in production and raw CSVs are filesystem-only. This matches the DUA safety intent at the scaffold layer.

### Finding 5: Coordinated dual-axis orchestration contract is missing

The system currently lacks an orchestration contract for executing both validated Axis A and Axis B analyses as part of one analysis workflow.

This is future integration work, not current functionality. Axis A and Axis B must remain separate internally, but the intended future system may trigger both from one normal user action and then present their distinct aggregate result sets together.

### Finding 6: Result transformation contract is missing

The repository has many validated research artifacts and a UI result schema, but no adapter currently maps actual research outputs into `ClusteringRunSchema`.

### Finding 7: Execution status model is too thin for real pipeline runs

Current upload/run status is frontend-local and request-bound. There is no persisted job status, logs, progress, failure details, cancellation, or retry model.

## 17. Current Integration Risks

- Accidentally reimplementing research logic in TypeScript instead of invoking the validated scripts.
- Accidentally persisting raw uploaded CSV rows in PostgreSQL during future import work.
- Returning dummy/scaffold run IDs after a real upload, which could mislead reviewers if not clearly marked.
- Missing coordinated Axis A + Axis B execution/session contract for one normal "Run Analysis" workflow.
- No durable execution status for long-running research scripts.
- No documented mapping from research artifact files to `ClusteringRunSchema`.
- No production result-import policy beyond current Prisma payload validation.

## 18. Audit Conclusion

The application currently contains a solid reporting scaffold and local-only upload shell. It does not yet execute the validated Axis A or Axis B research pipeline, and it does not yet coordinate both pipelines as one analysis workflow. The frontend and backend currently consume aggregate result payloads and do not expose raw ADNI participant-level data to reporting pages or production result APIs.

The next integration work should define and implement a coordinating orchestrator around separate Axis A and Axis B adapters for the existing `scripts/research/` artifacts, not rewrite PCA, NbClust, DPC, K-Means, slope calculation, cohort construction, variable mappings, missingness, or imputation logic in the app layer.

## 19. Checklist Verification

### Inspection Tasks

| Item | Status | Evidence |
|---|---|---|
| Review existing frontend pages/components and current backend routes. | READY TO CHECK | Inventoried `apps/web/src` pages/components and `apps/api/src` routes. |
| Map current UI flow: data input -> processing -> results -> visualizations. | READY TO CHECK | See sections 6-10. |
| Identify which screens are complete and which are placeholders. | READY TO CHECK | See section 11. |
| Identify what backend/API functionality is missing for executing the validated research pipeline. | READY TO CHECK | See architecture findings and integration plan. |

### Research Safety Constraints

| Item | Status | Evidence |
|---|---|---|
| Axis A/Axis B algorithms were not rewritten. | READY TO CHECK | No app-layer algorithm implementation found; scripts remain in `scripts/research/`. |
| Variable mappings were not changed. | READY TO CHECK | No app changes to `scripts/research/construct_axis_a_study_entry.py` or mapping/audit scripts. |
| k-selection rules were not changed. | READY TO CHECK | NbClust logic remains in `scripts/research/select_axis_a_k_nbclust.py` and `scripts/research/select_axis_b_k_nbclust.py`. |
| PCA logic was not changed. | READY TO CHECK | PCA logic remains in `scripts/research/preprocess_axis_a.py`; frontend only charts PCA summaries. |
| DPC logic was not changed. | READY TO CHECK | DPC logic remains in `scripts/research/dpc_init_axis_a.py` and Axis B DPC audit/reconciliation scripts. |
| Slope calculation was not changed. | READY TO CHECK | Slope logic remains in `scripts/research/extract_axis_b_adas13_slopes.py`. |
| Cohort rules were not changed. | READY TO CHECK | Cohort logic remains in `construct_axis_a_study_entry.py` and `construct_axis_b_longitudinal_cohort.py`. |
| Raw ADNI participant-level data is not exposed through the frontend. | READY TO CHECK | UI consumes aggregate schema only; upload route local-only and not mounted in production. |

### Workflow Safety

| Item | Status | Evidence |
|---|---|---|
| Work is on a separate integration branch. | READY TO CHECK | Current branch is `integration-system-integration`. |
| Architecture findings were documented before major integration changes. | READY TO CHECK | This document and `RESEARCH_INTEGRATION_PLAN.md` are documentation-only deliverables. |
