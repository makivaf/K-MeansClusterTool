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
- Accepts multiple `.csv` files
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
- Simulates pipeline processing
- Returns:

```json
{
  "status": "complete",
  "run_id": "axis-a-baseline-2024-05-18"
}
```

## Future Pipeline Integration

The backend currently contains a TODO block in `apps/api/src/routes/cluster.ts` for replacing the placeholder with the real Python workflow.

The intended future flow is:

1. Resolve uploaded CSV file paths from `upload_ref`.
2. Spawn the Python pipeline with `child_process.spawn`.
3. Run something like:

```bash
python run_pipeline.py <uploaded_file_path>
```

4. Wait for Python to write a `run_*.json` file.
5. Validate the JSON with `ClusteringRunSchema`.
6. Import only aggregate JSON into PostgreSQL with `importRun`.
7. Return the real `run_id` to the frontend.

Raw CSV content should never be imported into PostgreSQL.

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
```

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

## Current Dummy Runs

The scaffold includes three validated dummy runs:

- `axis-a-baseline-2024-05-18`
- `axis-a-sensitivity-2024-06-02`
- `axis-b-decline-2024-06-16`

These are realistic placeholders for UI development and thesis review demos. Replace them with real aggregate pipeline output once the Python pipeline is ready.

## Development Notes

- Keep page components modular.
- Keep chart components separate from page containers.
- Add real pipeline integration behind the local-only API boundary.
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
