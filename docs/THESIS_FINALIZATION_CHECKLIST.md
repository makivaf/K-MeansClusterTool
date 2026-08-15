# Thesis Finalization Checklist

Status reflects repository evidence as of the integration branch. “Complete” means repository work is complete, not that external academic approval has occurred.

## Research

| Item | Status | Evidence / next action |
| --- | --- | --- |
| Axis A implementation | COMPLETE | Frozen scripts and aggregate artifacts; research source unchanged |
| Axis B implementation | COMPLETE | Frozen final Path B scripts and aggregate artifacts |
| Aggregate adapter validation | COMPLETE | Actual local Axis A/B artifacts pass frozen-study validators |
| Full post-integration research E2E | PARTIAL | One controlled run reached the Axis A environment gate; gate subsequently fixed and passed in isolation; no second full scientific rerun performed |
| Final result consolidation | READY FOR HUMAN REVIEW | `AXIS_A_AXIS_B_FINAL_RESULTS.md`; Axis A public-safe profile means remain unavailable |

## Application

| Item | Status | Evidence / next action |
| --- | --- | --- |
| Axis-aware result contract | COMPLETE | Reusable method constraints separated from frozen empirical validators |
| Input contract | COMPLETE | Exact seven-file manifest and header validation |
| Bounded orchestrator | COMPLETE | Fixed stage allowlist, direct spawn, timeout, isolated workspace, sanitized errors |
| Axis A adapter | COMPLETE | Aggregate mapping; identifiers stripped; consistency tests |
| Axis B adapter | COMPLETE | 1D/no-PCA/DPC-rejected mapping; consistency tests |
| Persistence | COMPLETE | Dual validation/import; PostgreSQL transaction or explicit memory-only mode |
| Real `/api/cluster/run` | COMPLETE | Placeholder removed; returns two real run IDs |
| Frontend workflow | COMPLETE | Exact input copy, processing/error/success state, both result links, durability notice |
| Automated integration validation | COMPLETE | Contract, manifest, process-mock, adapters, repository, coordinated-service tests |
| Browser/API full E2E after complete research run | PARTIAL | Requires one successful post-fix local execution and rendered-page verification |

## Manuscript

| Item | Status | Evidence / next action |
| --- | --- | --- |
| Chapter 3 wording | READY FOR HUMAN REVIEW | `MANUSCRIPT_UPDATE_PACKAGE.md` |
| Chapter 4 wording | READY FOR HUMAN REVIEW | Evidence-backed prose; do not add unavailable Axis A profile claims |
| Limitations | READY FOR HUMAN REVIEW | Study and implementation limitations separated |
| Adviser confirmation | REQUIRES EXTERNAL HUMAN ACTION | `ADVISER_CONFIRMATION_REQUIRED.md` |
| Expert review | REQUIRES EXTERNAL HUMAN ACTION | Packet prepared; no review claimed |

## Defense

| Item | Status | Evidence / next action |
| --- | --- | --- |
| Algorithm traceability | READY FOR HUMAN REVIEW | `DEFENSE_ALGORITHM_TRACEABILITY.md` |
| Axis comparison/results table | READY FOR HUMAN REVIEW | `AXIS_A_AXIS_B_FINAL_RESULTS.md` |
| Expert-review evidence | REQUIRES EXTERNAL HUMAN ACTION | Obtain completed reviewer record |
| Slide wording and speaker rehearsal | REQUIRES EXTERNAL HUMAN ACTION | Use cautious enhancement and non-diagnosis language |
| Local demo | PARTIAL | Configure `RESEARCH_PYTHON`, `RESEARCH_R_HOME`, and PostgreSQL if durable results are required; complete one post-fix rehearsal |

## Before submission or defense

1. Adviser reviews every tagged confirmation and signs off final wording.
2. A qualified expert reviews the aggregate packet; retain the completed record.
3. Researchers transfer approved text into the manuscript and reconcile tables/figures.
4. Perform one full local post-fix upload-to-results rehearsal with authorized ADNI files, then verify both axis pages.
5. Conduct normal PR review and merge only after privacy and research-integrity checks remain clean.
