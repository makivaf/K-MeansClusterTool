# Product Model and Result Contract Audit

## Determination

The repository describes a **hybrid** application: it reports validated thesis analyses and also provides a local-only workflow for running the same authoritative methods on a newly supplied, compatible ADNI export batch. It is not a general arbitrary-CSV clustering tool.

Evidence:

- `README.md` describes precomputed aggregate results and validated development fixtures, while its Upload & Run workflow accepts local CSV files and starts clustering.
- `docs/SYSTEM_ARCHITECTURE_AUDIT.md` records that uploaded files are not yet processed and that one future user action must coordinate the distinct validated Axis A and Axis B pipelines.
- `docs/RESEARCH_INTEGRATION_PLAN.md` requires an input manifest, validated Axis A and Axis B execution, separate aggregate outputs, and persistence of both results.
- `data/README.md` identifies named ADNI source exports rather than an arbitrary tabular feature matrix.
- The authoritative research scripts resolve specific ADNI tables, columns, intermediate artifacts, and execution stages. The application therefore supports only inputs compatible with those entry points.

The exact input manifest is documented separately in `docs/ANALYSIS_INPUT_CONTRACT.md` after auditing all research entry points.

## Methodological invariants

The reusable application contract enforces properties that must remain true for every compatible run:

- Axis A has the 13-variable analysis domain, a 20% missingness rule, median imputation, z-score standardization, PCA, NbClust selection, DPC-derived initialization, and a 30-run controlled random baseline.
- The number of selected Axis A DPC centroids and aggregate cluster profiles must equal the run's selected `k`.
- Axis B has one participant-level ADAS-Cog13 slope dimension and no PCA.
- Axis B records DPC as evaluated but rejected for final initialization.
- Axis B final clustering uses fixed-seed (`random_seed=0`, `n_init=1`) standard Lloyd K-Means.
- Selected `k`, aggregate profile counts, participant counts, and retained sample sizes must be internally consistent.
- Public result payloads reject participant-level fields and identifiers.

## Frozen empirical outputs

The following are outcomes of the validated thesis datasets, not universal properties of a future compatible input batch:

- Axis A retained sample size: 2,437
- Axis A retained PCA components: 6
- Axis A selected `k`: 2
- Axis B retained participant count: 1,917
- Axis B selected `k`: 2
- Axis B final group sizes: 1,675 and 242
- All measured centroids, validation metrics, profile means, and other descriptive values

The reusable `AxisAClusteringRunSchema` and `AxisBClusteringRunSchema` therefore accept data-derived counts while enforcing methodological and cross-field consistency. `FrozenAxisAStudyResultSchema` and `FrozenAxisBStudyResultSchema` contain the known thesis-run cardinality checks for validating frozen artifacts. Development fixtures deliberately use small synthetic cardinalities and zero-valued descriptive placeholders, so they cannot pass as frozen thesis findings.

## Contract test boundary

`packages/shared/src/schema.contract.validation.ts` verifies both sides of the distinction:

- methodologically valid synthetic Axis A and Axis B aggregates are accepted;
- a data-derived, non-frozen Axis B `k` is accepted when all dependent fields agree;
- the development fixtures are rejected by frozen-study validators;
- Axis B with PCA or final DPC initialization is rejected;
- Axis A without PCA or DPC initialization is rejected;
- participant-level assignments and identifier-shaped DPC labels are rejected.
