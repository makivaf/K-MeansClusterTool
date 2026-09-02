# Adviser Confirmation Required

> **LEGACY / HISTORICAL — NOT CURRENT METHODOLOGY:** This packet records questions from the superseded two-axis design. It is retained for provenance and must not be used as the active pipeline specification. See `UNIFIED_RESEARCH_PIPELINE.md`.

The research implementation below is frozen. These items seek confirmation of manuscript characterization or interpretation; they do not authorize reopening completed code.

| Issue | Current implementation and evidence | Proposed wording | Decision type | Why confirmation is needed / impact |
| --- | --- | --- | --- | --- |
| Axis A enhancement claim | PCA, NbClust, DPC observation-based initialization, then standard Lloyd updates (`preprocess_axis_a.py`, `select_axis_a_k_nbclust.py`, `dpc_init_axis_a.py`, `run_axis_a_enhanced_kmeans.py`) | “The enhancement modifies representation, cluster-number selection, and initialization; the Lloyd assignment/update rule is preserved.” | Wording/novelty | Prevents overstating algorithmic novelty; affects Chapter 3 and defense answer. |
| Axis A ablation interpretation | DPC metrics are within the 30-run random range and are not uniformly better (`axis_a_dpc_ablation_comparison.csv`) | “DPC provides deterministic observation-based initialization, but did not show uniform internal-validity superiority over random initialization.” | Interpretation | Required for an evidence-faithful Chapter 4 conclusion. |
| Axis A profile labels | No final public-safe authoritative cluster-by-feature profile table was consolidated | Defer clinical labels until an aggregate table is approved and reviewed. | Interpretation | Prevents labels inferred from private assignments or memory. |
| BNT and NPI-Q exclusion wording | Both exceed 20% in the locked ADNI1-ADNI3 scope (`axis_a_final_exclusion_preview.csv`) | “BNT and NPI-Q were excluded under the >20% rule; 13 measures remained.” | Wording | The short project summary often names NPI-Q only; manuscript must match final artifacts. |
| Axis B PCA statement | One raw slope feature; no PCA (`axis_b_nbclust_k_selection.json`) | “PCA was not applicable because Axis B had no multivariate dimensionality to reduce.” | Wording | Confirms a correct axis-specific exception without implying an omitted method step. |
| Axis B DPC exception | DPC candidates tied/nearly coincided and changed across nearby cutoffs; final DPC use is false (`axis_b_dpc_seed_selection.json`, reconciliation JSON) | “DPC was evaluated but not retained for the one-dimensional Axis B representation; Axis A is unchanged.” | Method characterization | Implementation is frozen; manuscript characterization needs adviser signoff. |
| Axis B reporting seed | Final K-Means uses `random_state=0`, `n_init=1`; seed 0 is first in the pre-existing 0-29 convention, not metric-selected (`axis_b_final_clustering_metrics.json`) | “Seed 0 was fixed in advance and was not chosen after metric inspection.” | Wording | Prevents a best-run selection claim. |
| Axis B labels | Aggregate groups have centroids 0.7674 and 9.5888 points/year | Use “lower-slope progression group” and “higher-slope progression group”; explicitly reject stage/diagnosis language. | Interpretation | Determines tables, Chapter 4 prose, dashboard labels, and expert-review language. |
| ADNI generalizability | Single research source and eligibility rules | State that findings may not generalize to broader clinical populations. | Interpretation/limitations | Appropriate scope of conclusions needs adviser review. |

## Already frozen; do not reopen through this register

- Axis A has 2,437 participants, 13 retained variables, PC1-PC6, `k=2`, and DPC-initialized Lloyd K-Means.
- The controlled Axis A initialization comparator uses seeds 0-29, random `n_init=1`, and the same PCA space and Lloyd parameters.
- K-Means|| is not part of the implemented thesis enhancement.
- Axis B has 1,917 participant slopes from 11,327 dated observations, one dimension, no PCA, and `k=2`.
- Axis B final clustering is fixed-seed standard Lloyd K-Means; DPC is not its final initializer.

Confirmation may change exposition, cautious labels, or interpretation. It must not silently change the frozen scripts or empirical results.
