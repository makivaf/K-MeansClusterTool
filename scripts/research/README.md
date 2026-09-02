# Unified Research Scripts

Python is the authoritative scientific implementation. The active orchestrator executes one ordered pipeline from study-entry cohort construction through enhanced K-Means and longitudinal mixed-effects comparison.

## Active structure

- `study_entry/` — input audits, cohort construction, preprocessing, PCA, NbClust index voting, DPC initialization, and enhanced K-Means.
- `comparison/` — complete-pipeline baseline and controlled DPC initialization comparisons.
- `longitudinal/` — longitudinal record audit, eligibility cohort, mixed-effects model, and aggregate consolidation.
- `validation/` — runtime environment checks.

The exact active order is defined only in `apps/api/src/services/researchStageManifest.ts`.

## Legacy

`legacy/old_longitudinal_clustering/` contains the historical independent slope-clustering implementation. It is excluded from the active allowlist and must not be invoked as part of the unified study.

## Provenance rules

- `data/interim/unified_cluster_assignments.csv` is the single authoritative fixed cluster-assignment artifact.
- Participant-level artifacts remain local and gitignored.
- The DPC initializer has a canonical LF SHA-256 gate.
- Missing or stale aggregate artifacts are fatal; no fallback substitution is allowed.
- No longitudinal NbClust, DPC suitability selection, or K-Means stage is permitted.
- See `docs/SCIENTIFIC_ARTIFACT_MIGRATION.md` for old-to-new path and SHA-256 mappings.
