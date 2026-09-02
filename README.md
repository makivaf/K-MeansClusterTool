# AD Progression Lab

Research software for the undergraduate thesis:

> **An Enhancement of the K-Means Clustering Algorithm Applied to Modeling Alzheimer's Disease Progression Using Cognitive Data**

The active scientific design is one continuous pipeline. Enhanced K-Means first defines Cluster 0 and Cluster 1 in the 2,437-participant study-entry cohort. Eligible members of those same fixed groups are then followed using dated ADAS-Cog13 records and compared longitudinally. Longitudinal slopes are not clustered.

## Active pipeline

```text
Study-entry cohort
  -> 13 retained cognitive/functional variables
  -> median imputation and z-score standardization
  -> PCA (6 retained components)
  -> NbClust (k = 2)
  -> deterministic DPC initialization
  -> Lloyd K-Means
  -> Cluster 0 / Cluster 1 assignments
  -> longitudinal ADAS-Cog13 linkage
  -> >=3 dated observations and >=365.25 days follow-up
  -> progression summaries by original cluster
  -> random-intercept mixed-effects comparison of Time × Cluster
  -> aggregate-only unified research artifact
```

The former separate cross-sectional “Axis A” and independent slope-clustering “Axis B” implementation is retained only for provenance and historical audit. The active orchestrator never invokes the deprecated longitudinal NbClust, DPC suitability, or K-Means scripts.

## Validated headline results

- Parent clustered cohort: 2,437 participants
- Final enhanced cluster sizes: Cluster 0 = 1,553; Cluster 1 = 884
- PCA: 6 components; 87.479459% cumulative explained variance
- NbClust: k = 2; 9 of 24 usable votes
- Longitudinal audit: 1,917 participants with at least 3 observations
- Final longitudinal subset: 1,845 participants with at least 365.25 days follow-up
- Eligible by original cluster: Cluster 0 = 1,233; Cluster 1 = 612
- Primary Time × Cluster estimate: +1.469681 ADAS-Cog13 points/year for original Cluster 1 relative to Cluster 0; 95% CI 1.364061–1.575300

See [Unified Research Pipeline](docs/UNIFIED_RESEARCH_PIPELINE.md), [Unified Results Audit](docs/UNIFIED_RESULTS_AUDIT.md), and [Repository Structure Audit](docs/REPOSITORY_STRUCTURE_AUDIT.md) for the current contract, results, and file/artifact classification.

## Repository structure

```text
apps/web/                  React research dashboard
apps/api/                  Express orchestration and aggregate API
packages/shared/           Zod contracts and shared TypeScript types
scripts/research/          Authoritative Python research stages
data/raw/                  Local ADNI inputs; never committed
data/interim/              Local generated artifacts; never committed
docs/                      Architecture, audit, and migration notes
```

## Local commands

```powershell
npm install
& '.venv\Scripts\python.exe' -m pip install -r 'scripts\research\requirements-mixed-effects.txt'
npm run typecheck
npm run build
npm run dev
```

Generate the unified scientific artifact from an already validated local research workspace:

```powershell
& '.venv\Scripts\python.exe' 'scripts\research\longitudinal\fit_longitudinal_mixed_model.py'
& '.venv\Scripts\python.exe' 'scripts\research\longitudinal\consolidate_unified_results.py'
```

The Python stage writes participant-level diagnostics only under gitignored `data/interim/`. The API adapter reads only `data/interim/unified_research_result.json`, whose strict schema contains aggregates and provenance metadata but no participant rows or identifiers.

## Data handling

Raw ADNI exports and generated participant-level artifacts are local-only and ignored by Git. Production routes expose validated aggregate payloads only. Do not commit or publish ADNI participant-level data.
