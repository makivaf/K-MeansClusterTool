# Alzheimer's Clustering Thesis Dashboard

A local-first research dashboard for an Alzheimer's disease clustering thesis project. The app compares a standard K-Means baseline against an enhanced K-Means pipeline that uses PCA, NbClust k-selection, and DPC-init centroid initialization on ADNI-style cognitive assessment data.

The current implementation is a scaffold with realistic dummy aggregate results. It is designed so real Python pipeline outputs can later replace the dummy data without restructuring the frontend or API.

## Purpose

This dashboard supports thesis review and experimentation around two clustering axes:

- **Axis A**: Cross-sectional clustering using baseline-only cognitive assessment data.
- **Axis B**: Longitudinal clustering using decline trajectory features.

For each selected run, the app shows preprocessing decisions, PCA variance retention, NbClust votes, DPC-init centroid candidates, clustering metric comparisons, and aggregate cluster profiles.

## Important Data Use Boundary

Raw participant-level CSV files are sensitive research data and must stay local.

The app enforces this boundary in two ways:

- The upload and clustering routes are mounted only when `NODE_ENV !== "production"`.
- Uploaded CSV files are saved only to local disk under `apps/api/uploads/`, which is gitignored.

Do not persist raw CSV participant rows to PostgreSQL. Only final aggregate run JSON output matching the shared schema should ever be imported into the database.

The Cluster Profiles page also intentionally renders aggregate summaries only. It must not display participant IDs, subject-level rows, raw records, or row-level clinical data.

## Tech Stack

- **Frontend**: React, Vite, TypeScript
- **Styling**: Tailwind CSS
- **Backend**: Node.js, Express
- **Database**: PostgreSQL through Prisma ORM
- **Charts**: Recharts
- **Validation**: Zod
- **Shared contract**: Zod schemas and inferred TypeScript types in `packages/shared`

## Repository Layout

```text
apps/
  api/
    prisma/
      schema.prisma       PostgreSQL model for aggregate clustering runs
      seed.ts             Seeds dummy aggregate runs
    src/
      app.ts              Express app, middleware, route mounting
      server.ts           Starts the API server
      routes/
        cluster.ts        Local-only CSV upload and clustering stub routes
      services/
        runRepository.ts  Run listing, lookup, and aggregate import helper

  web/
    src/
      App.tsx             React routes
      components/         Layout, charts, tables, shared UI pieces
      config/
        api.ts            API base URL and local API detection
      hooks/
        useRunData.ts     Loads and selects clustering runs
      pages/              One page per dashboard route

packages/
  shared/
    src/
      schema.ts           Zod schemas and inferred TypeScript types
      dummyRuns.ts        Validated dummy aggregate clustering runs
```

## How the App Works

The app is split into three layers:

1. **Shared schema layer**
   `packages/shared/src/schema.ts` defines the run shape, API response validators, upload response validators, and TypeScript types inferred from Zod.

2. **API layer**
   `apps/api` serves precomputed aggregate JSON results. It can read from PostgreSQL when `DATABASE_URL` is configured. If the database is unavailable or not configured, it falls back to validated dummy runs.

3. **Frontend layer**
   `apps/web` fetches `/api/runs`, validates responses with Zod, stores the selected run in local React state, and renders the selected run across the dashboard pages.

## Default User Flow

The default landing route `/` redirects to:

```text
/upload-cluster
```

The intended workflow is:

1. Open the app.
2. Land on **Upload & Run**.
3. Select one or more local `.csv` files.
4. Click **Run Clustering**.
5. Watch the status move from idle to uploading to processing to done.
6. Open the resulting run in **Comparison** or **Cluster Profiles**.

At the moment, the clustering pipeline step is a placeholder. It waits briefly and returns an existing dummy run ID.

## Sidebar Pages

### Upload & Run

Primary entry-point action. This page allows local CSV uploads and starts the clustering workflow.

It includes:

- Multi-file CSV input
- Selected filename list
- Run button
- Status states: `idle`, `uploading`, `processing`, `done`, `error`
- Result links to Comparison and Cluster Profiles
- Production-disabled message when the configured API base URL is not local

Backend routes used:

```text
POST /api/upload
POST /api/cluster/run
POST /api/research/runs
GET /api/research/runs/:runId
```

These routes are local-only and are not mounted in production.

### Dashboard

Overview page for the selected run.

It shows:

- Selected `k`
- PCA cumulative explained variance
- Enhanced metric values
- Delta badges comparing enhanced vs baseline
- PCA scree chart
- Compact metrics comparison table

### Preprocessing

Summarizes dataset filtering and preparation.

It shows:

- Missingness threshold
- Initial sample size
- Retained sample size
- Feature count
- Excluded variables
- Imputation strategy
- Scaling strategy

### PCA

Explains the dimensionality reduction output.

It shows:

- Number of retained principal components
- Cumulative explained variance
- Scree plot with individual variance bars
- Cumulative variance line overlay

### NbClust

Shows how the enhanced method selected the number of clusters.

It includes:

- Vote count by candidate `k`
- Highlighted selected `k`
- Table of index-level votes and criterion values

### DPC-init

Shows the density peaks initialization step used by the enhanced method.

It includes:

- Gamma scatter plot for centroid candidates
- Selected centroid table

### Comparison

Core thesis comparison page.

It compares baseline K-Means against enhanced K-Means using:

- Silhouette
- Davies-Bouldin
- Calinski-Harabasz

For Silhouette and Calinski-Harabasz, higher is better. For Davies-Bouldin, lower is better.

### Cluster Profiles

Aggregate-only cluster interpretation page.

It shows, per condition and cluster:

- Cluster ID
- Number of members
- Cognitive variable means
- Age summary
- Diagnosis distribution
- APOE4 distribution

Do not add participant-level fields to this page.

## API Routes

### Always Available

```text
GET /api/health
GET /api/runs
GET /api/runs/:runId
```

### Local-Only Routes

Mounted only when:

```ts
process.env.NODE_ENV !== "production"
```

Routes:

```text
POST /api/upload
POST /api/cluster/run
```

`POST /api/upload`:

- Accepts `multipart/form-data`
- Uses field name `files`
- Requires the exact seven-file ADNI CSV manifest documented in `docs/ANALYSIS_INPUT_CONTRACT.md`
- Rejects non-CSV files
- Limits file size to 500MB per file
- Saves files under `apps/api/uploads/<upload_ref>/`
- Does not write raw CSV data to PostgreSQL

`POST /api/cluster/run`:

- Accepts JSON body:

```json
{
  "upload_ref": "upload-..."
}
```

- Verifies the upload reference exists locally
- Runs the bounded Axis A and Axis B research orchestrator in an isolated local workspace
- Validates and maps separate aggregate results, then persists both together
- Returns:

```json
{
  "status": "complete",
  "persistence": "durable",
  "axis_a_run_id": "analysis-...-axis-a",
  "axis_b_run_id": "analysis-...-axis-b"
}
```

When `DATABASE_URL` is absent outside production, `persistence` is `memory_only`; results remain available only for the lifetime of that API process. Production refuses dummy fallback and does not mount upload/execution routes.

Raw CSV content should never be imported into PostgreSQL.

`POST /api/research/runs` is the axis-aware asynchronous lifecycle endpoint.
It accepts `{ "axis": "Axis A" | "Axis B", "upload_ref": "upload-...", "run_label"?: string }`,
returns `202 Accepted` with a queued job, and executes jobs one at a time.
`GET /api/research/runs/:runId` returns queued, running, complete, or failed
status. Complete jobs contain only a `result_run_id`; fetch the aggregate result
from `GET /api/runs/:resultRunId`. Failures are sanitized and never include
subprocess output, participant identifiers, or raw file contents.

Axis A runs execute the validated Axis A sequence only. Axis B runs execute the
complete validated Axis A prerequisite sequence before Axis B, but persist only
the requested Axis B aggregate result. The older coordinated `/api/cluster/run`
endpoint remains available for compatibility.

## Setup

Install dependencies:

```bash
npm install
```

Start both frontend and backend:

```bash
npm run dev
```

Default URLs:

```text
Frontend: http://localhost:5173
API:      http://localhost:4000
```

## Environment Variables

Create `apps/api/.env` from:

```text
apps/api/.env.example
```

Example:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/ad_clustering_thesis?schema=public"
PORT=4000
RESEARCH_PYTHON="C:\\path\\to\\K-MeansClusterTool\\.venv\\Scripts\\python.exe"
AXIS_B_SLOPE_PYTHON="C:\\path\\to\\Python313\\python.exe"
RESEARCH_R_HOME="C:\\Program Files\\R\\R-4.6.1"
```

`RESEARCH_PYTHON` remains the interpreter for the validated pipeline. The
optional `AXIS_B_SLOPE_PYTHON` override applies only to
`extract_axis_b_adas13_slopes.py`, whose generated CSV is checked against its
authoritative exact SHA-256 before Axis B k-selection. If the override is
unset, that one stage falls back to `RESEARCH_PYTHON`; if it is configured but
is not an absolute executable file path, an Axis B run fails with a sanitized
environment error. See `scripts/research/README.md` for the recovered numerical
environment and reproducibility rationale.

Axis B also distinguishes newly generated runtime reproduction artifacts from
the authoritative frozen prerequisite bytes required by final research scripts.
Runtime k-selection and DPC stages always execute. Machine-path-only JSON
differences are excluded from scientific comparison. Axis B secondary
candidate-k inertia is compared candidate by candidate with the reviewed
absolute threshold `1e-11`, reflecting demonstrated last-bit OpenMP reduction
variation in the recovered scikit-learn 1.9.0 environment. No other numeric
field uses that threshold. The generated file and per-k comparison are retained
in a workspace audit before the verified, repository-controlled authoritative
artifact is copied into the downstream workspace path. An over-threshold
inertia difference or any exact scientific-field difference fails the run. No
upload path can supply or replace an authoritative prerequisite.

Frozen Python research sources are also provenance-gated inside each disposable
execution workspace. Git stores the reviewed sources with LF line endings, but
a Windows checkout may expose identical text as CRLF. Workspace preparation
therefore canonicalizes only copied `scripts/research/*.py` source bytes to LF
and verifies `dpc_init_axis_a.py` against the historical committed SHA-256
`bda58cfd431934c7c2077bc0fdc583a9fe5a5a771f18682d7d14a4edd9bec513`
before any research stage starts. Repository files, uploads, CSV/JSON artifacts,
binary files, and authoritative data are never normalized by this mechanism.

Frontend API URL can be overridden with:

```env
VITE_API_URL=http://localhost:4000
```

If `VITE_API_URL` points to a non-local host, the Upload & Run page displays a disabled local-only state.

## PostgreSQL and Prisma

Generate the Prisma client:

```bash
npm run prisma:generate
```

Seed dummy aggregate runs:

```bash
npm run prisma:seed
```

The Prisma model stores aggregate run JSON only:

```prisma
model ClusteringRun {
  id        String   @id @default(cuid())
  runId     String   @unique
  axis      String
  title     String
  payload   Json
  createdAt DateTime @default(now())
}
```

If `DATABASE_URL` is not configured, the API uses `packages/shared/src/dummyRuns.ts`.

## Shared Schema and Validation

The shared package is the source of truth for data contracts.

Important schemas include:

- `ClusteringRunSchema`
- `RunListResponseSchema`
- `RunResponseSchema`
- `UploadResponseSchema`
- `ClusterRunRequestSchema`
- `ClusterRunResponseSchema`

The frontend validates API responses before rendering them. The backend also validates outgoing run payloads and upload responses.

## Useful Commands

Build everything:

```bash
npm run build
```

Typecheck everything:

```bash
npm run typecheck
```

Run only the API:

```bash
npm run dev -w @ad-clustering/api
```

Run only the frontend:

```bash
npm run dev -w @ad-clustering/web
```

Build only the shared package:

```bash
npm run build -w @ad-clustering/shared
```

## Development Fixtures

The scaffold includes two clearly labeled, schema-valid development fixtures:

- `dev-fixture-axis-a`
- `dev-fixture-axis-b`

Their zero-valued descriptive metrics are not thesis findings. Real local execution returns separate validated aggregate results.

## Development Notes

- Keep page components modular.
- Keep chart components separate from page containers.
- Keep the research process allowlist and aggregate adapter boundary narrow.
- Keep Upload & Run disabled for non-local API URLs.
- Do not add authentication yet unless the project requirements change.
- Do not add participant-level rendering to frontend pages.
- Do not commit files from `apps/api/uploads/`.

## Safety Checklist Before Using Real Data

- Confirm the API is running locally.
- Confirm `NODE_ENV` is not `production` for upload testing.
- Confirm `VITE_API_URL` points to `localhost` or `127.0.0.1`.
- Confirm raw CSV files are written only under `apps/api/uploads/`.
- Confirm only aggregate JSON output is imported into PostgreSQL.
- Confirm Cluster Profiles still renders aggregate summaries only.
