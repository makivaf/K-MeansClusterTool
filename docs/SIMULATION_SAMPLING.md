# Simulation Runs participant sampling

`getSimulationSample(simulationId)` in `apps/api/src/services/simulationSample.ts`
loads the frozen canonical roster using `loadSimulationCohort()` on every call.
All existing integrity, unique-RID, field, phase, and cohort-count validations
remain in that loader. Missing or invalid publication fails; there is no fallback.

IDs 1–5 use seeds 101, 202, 303, 404, and 505 respectively. Other IDs are rejected.
Sampling uses only RID and original `ENTRY_PHASE`. For each phase, round 80% to
the nearest integer with `Math.floor(n * 0.80 + 0.5)` (half up). This yields:

| Phase | Source | Sample, for each simulation |
| --- | ---: | ---: |
| ADNI1 | 819 | 655 |
| ADNIGO | 130 | 104 |
| ADNI2 | 789 | 631 |
| ADNI3 | 699 | 559 |
| Total | 2,437 | 1,949 |

## Reproducibility contract

Within each phase, compute SHA-256 over UTF-8 compact JSON of
`["simulation-phase-rank-v1", seed, phase, RID]`. Sort the hexadecimal hashes
ascending, breaking any collision by numeric RID, then take the required count.
This seeded pseudorandom permutation samples without replacement and is independent
of input row order, process state, locale, and other simulation requests. Participants
can overlap between simulations. Changing the rank algorithm/version changes samples
and must be treated as an explicit reproducibility-contract change.

Combine selected RIDs and sort numerically while preserving their string values.
The fingerprint is SHA-256 of the UTF-8 compact JSON array of these sorted strings,
with no newline. It identifies the participant set, not a pipeline execution.

The service returns configuration, source/sample totals, per-phase source/sample
counts, `sampleParticipantIds`, and `fingerprint`. The IDs are backend-internal;
future existing and enhanced runners should receive the same `sampleParticipantIds`
list unchanged. No public endpoint, frontend behavior, pipeline execution, or
execution capability flag is added or changed.

## Validation

Run `npm run test:simulation-sample -w @ad-clustering/api` from the repository root.
This is an integration test requiring the published canonical roster; it never
creates a substitute or writes to that roster. It checks all five samples, replay,
independent fingerprint calculation, scope/membership, counts/rounding, uniqueness,
sorting, invalid IDs, caller-mutation isolation, and the sampler's narrow imports
and data dependencies. Output includes only aggregate counts and fingerprints.
