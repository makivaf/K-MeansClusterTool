# Unified Research Pipeline

## Migration status

The active architecture is one research run with two dependent scientific stages:

1. **Enhanced K-Means Cognitive-Functional Clustering**
2. **Longitudinal Progression Analysis** of eligible members of the original clusters

The previous “Axis A / Axis B” architecture treated longitudinal ADAS-Cog13 slopes as a second independent clustering experiment. That design is abandoned. Historical files and artifacts remain available for provenance audits but are not active application stages.

## Scientific rationale

The thesis enhancement creates two groups using the complete PCA + NbClust + DPC initialization + Lloyd K-Means procedure. Alzheimer-related longitudinal progression is therefore evaluated as a continuation of those algorithmic groups. Re-clustering slopes would answer a different question and break the linkage between the enhanced K-Means result and the progression analysis.

The unified design does not assign clinical labels, stages, or subtypes. It does not claim prediction or causation.

## Parent cohort and fixed assignments

The authoritative assignment artifact is `data/interim/unified_cluster_assignments.csv`. Its composite key is `PTID + RID` and is used locally only.

Validated invariants:

- 2,437 unique clustered participants
- ADNI1 = 819; ADNIGO = 130; ADNI2 = 789; ADNI3 = 699
- Cluster 0 = 1,553; Cluster 1 = 884
- PTID, RID, and composite keys are one-to-one in the assignment artifact
- every longitudinal participant links to exactly one parent assignment
- no participant appears in both clusters
- no duplicate participant/date enters longitudinal calculations

## Longitudinal subset rule

The observation-level source remains the validated ADAS-Cog13 `TOTAL13` cohort constructed from actual `VISDATE` values. Elapsed time is `(VISDATE - first valid VISDATE).days / 365.25`.

Two counts are always reported:

- at least 3 distinct valid dated observations: 1,917 participants
- at least 3 observations **and** at least 365.25 days follow-up: 1,845 participants

The final progression summaries use the 1,845-participant subset. Cluster membership remains the original enhanced assignment: Cluster 0 = 1,233 and Cluster 1 = 612.

## Authoritative outputs

The mixed-effects and unified stages write five local generated artifacts:

| Artifact | Role | Web exposure |
|---|---|---|
| `unified_longitudinal_participant_slopes.csv` | Local participant OLS diagnostics | Prohibited |
| `unified_longitudinal_cohort_audit.json` | Aggregate cohort flow and linkage checks | Aggregate-safe |
| `unified_longitudinal_mixed_model.json` | Aggregate primary MixedLM fit, diagnostics, and provenance | Aggregate-safe |
| `unified_longitudinal_mixed_model.csv` | Aggregate four-row coefficient table | Aggregate-safe |
| `unified_research_result.json` | Complete aggregate scientific result | API source of truth |

All five are under gitignored `data/interim/`. The API adapter reads the final aggregate JSON and verifies the reported SHA-256 values of both mixed-model artifacts.

## Scientific contents of one run

The strict unified contract contains:

- research metadata and provenance hashes
- parent and longitudinal cohort flow
- 15 candidate, 2 excluded, and 13 retained features
- median imputation and z-score standardization metadata
- PCA components and explained variance
- NbClust votes and selected k
- deterministic DPC centroid metadata
- enhanced K-Means sizes, metrics, and convergence
- original-scale aggregate cluster profiles and SMD ranking
- complete-pipeline baseline comparison with 30-run mean, SD, median, and range
- separate controlled DPC initialization comparison
- longitudinal eligibility and summaries by original cluster
- aggregate elapsed-year time series
- pre-specified mixed-effects model, optimizer attempts, fixed effects, variance components, fit statistics, diagnostics, and primary interpretation

Participant-level identifiers, assignments, visits, and trajectories are not part of the application contract.

## Backend architecture

- `researchStageManifest.ts` is the active ordered allowlist.
- `researchPipelineOrchestrator.ts` prepares an isolated workspace, verifies canonical DPC source bytes, runs the allowlisted stages, and refuses a missing aggregate artifact.
- `executeUnifiedResearch.ts` validates one aggregate artifact, persists one result, and removes the isolated workspace.
- `researchRunLifecycle.ts` reports queued, running, completed, and failed status with named scientific progress stages.
- `unifiedResultAdapter.ts` is the only adapter used by the active path.
- `runRepository.ts` serves the validated local aggregate in development and aggregate database rows in configured deployments.

The deprecated Axis adapters and import helper remain for audit compatibility. New routes do not require or accept an Axis selector.

## Frontend architecture

The active primary React routes are:

1. Overview
2. Enhanced K-Means (including expandable data preparation and PCA details)
3. Cluster Results
4. Baseline vs Enhanced
5. Longitudinal Progression (including expandable validation and limitations)

Run Analysis remains a separate action. Compatibility redirects preserve the former data-preparation and validation URLs without keeping duplicate pages.

All numeric results are read from the unified aggregate. React formats and visualizes values but does not reimplement scientific calculations.

## Key files added

- `scripts/research/longitudinal/consolidate_unified_results.py`
- `scripts/research/longitudinal/fit_longitudinal_mixed_model.py`
- `scripts/research/requirements-mixed-effects.txt`
- `apps/api/src/services/unifiedResultAdapter.ts`
- `apps/api/src/services/executeUnifiedResearch.ts`
- unified React page components and longitudinal chart
- `docs/UNIFIED_RESEARCH_PIPELINE.md`
- `docs/UNIFIED_RESULTS_AUDIT.md`

## Key files migrated

- shared Zod schemas and run lifecycle contracts
- research stage manifest and orchestrator
- repository persistence/listing
- local upload/run UI
- top-level routes, run selection, navigation, and responsive layout
- contract, orchestration, lifecycle, repository, adapter, and artifact validations
- root and research-script README files

## Deprecated but preserved

The independent slope-clustering files are listed in `deprecatedLongitudinalClusteringScripts`. In particular, the active plan does not invoke longitudinal slope extraction as a clustering feature, slope NbClust, longitudinal DPC seed selection/suitability, or final longitudinal K-Means.

Historical Axis-focused documentation remains as provenance. It should be read as a description of the superseded design unless explicitly updated.

The complete active/legacy script and artifact classification is maintained in `REPOSITORY_STRUCTURE_AUDIT.md`.

## Remaining scientific decisions

1. **Random-slope sensitivity model:** the primary model uses the approved participant random intercept only. A random time slope remains optional and must stay secondary if later approved.
2. **Covariate adjustment:** no demographic, diagnosis, medication, or other covariates were added. Any adjusted model or additional hypothesis requires a new scientific specification.
3. **Long-horizon plot interpretation:** later elapsed-year bins contain fewer participants and should not be interpreted as a balanced panel.

## Reproduction

Run the frozen prerequisites in the active manifest, or regenerate the final unified artifact after those inputs already exist:

```powershell
& '.venv\Scripts\python.exe' -m pip install -r 'scripts\research\requirements-mixed-effects.txt'
& '.venv\Scripts\python.exe' 'scripts\research\longitudinal\fit_longitudinal_mixed_model.py'
& '.venv\Scripts\python.exe' 'scripts\research\longitudinal\consolidate_unified_results.py'
npm run typecheck
npm run build
npm run dev
```

Do not execute the deprecated independent longitudinal clustering sequence as part of the unified study run.
