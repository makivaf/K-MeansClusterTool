"""Reconcile the tied-density DPC issue and freeze the Axis B decision.

This script preserves the original Axis B DPC audit. It does not fit K-Means,
alter Axis A, or invent an alternative DPC seed rule.
"""

from __future__ import annotations

import json
from pathlib import Path

from axis_b_final_common import (
    INTERIM,
    ORIGINAL_DPC_AUDIT_PATH,
    RECONCILIATION_PATH,
    ROOT,
    file_hash,
    frozen_hashes,
    tree_manifest,
    atomic_write_json,
)


AXIS_A_DPC_SCRIPT = ROOT / "scripts" / "research" / "study_entry" / "dpc_initialize_clusters.py"


def main() -> None:
    hashes = frozen_hashes()
    with ORIGINAL_DPC_AUDIT_PATH.open("r", encoding="utf-8") as handle:
        audit = json.load(handle)

    primary = audit["primary_2_percent_audit"]
    diagnostics = audit["one_dimensional_diagnostics"]
    cutoff = audit["cutoff_sensitivity_audit"]
    selected = primary["selected_two_seeds"]
    if primary["global_maximum_rho_observations"] != 2:
        raise AssertionError("The frozen DPC audit no longer has two maximum-rho observations")
    if not diagnostics["selected_both_global_maximum_rho"]:
        raise AssertionError("Frozen audit no longer identifies both seeds as maximum-rho")
    if diagnostics["selected_seed_absolute_separation"] >= primary["d_c"]:
        raise AssertionError("Frozen DPC seeds are no longer within one d_c neighborhood")
    if cutoff["primary_pair_stable_at_all_nearby_cutoffs"]:
        raise AssertionError("Frozen DPC cutoff audit unexpectedly became stable")

    result = {
        "status": "DPC_RECONCILIATION_COMPLETE_PATH_B",
        "decision_date": "2026-08-12",
        "scope": "Axis B only; Axis A implementation and outputs remain unchanged",
        "authoritative_method_sources": [
            {
                "citation": "Rodriguez A, Laio A. Clustering by fast search and find of density peaks. Science. 2014;344(6191):1492-1496.",
                "doi": "https://doi.org/10.1126/science.1242072",
                "methodological_point": (
                    "For an ordinary observation, delta is the minimum distance to an observation "
                    "with strictly higher rho. The farthest-neighbor convention is stated for the "
                    "point with highest density, singular; multiple tied global maxima are not resolved."
                ),
            },
            {
                "citation": "SISSA institutional record for Rodriguez and Laio (2014)",
                "url": "https://iris.sissa.it/handle/20.500.11767/14183",
                "methodological_point": "Institutional bibliographic record and author affiliation source for the original method.",
            },
            {
                "citation": "ELKI CFSFDP implementation tutorial",
                "url": "https://elki-project.github.io/tutorial/cfsfdp",
                "methodological_point": (
                    "Independent implementation analysis explicitly notes that integer densities can tie, "
                    "the original authors assumed a unique maximum, and the paper omits this detail."
                ),
            },
        ],
        "original_definition": {
            "ordinary_delta": "delta_i = min_{j: rho_j > rho_i} d_ij",
            "special_case": "for the point with highest density, delta_i = max_j d_ij",
            "tie_case_explicitly_defined": False,
            "unique_highest_density_assumed": True,
        },
        "inherited_axis_a_behavior_inspected": {
            "script": AXIS_A_DPC_SCRIPT.relative_to(ROOT).as_posix(),
            "script_sha256": file_hash(AXIS_A_DPC_SCRIPT),
            "behavior": (
                "Every observation tied at the global maximum rho receives its own "
                "farthest-neighbor delta; gamma is then ranked by descending value and row index."
            ),
            "classification": "B_IMPLEMENTATION_SPECIFIC_EXTENSION_FOR_RHO_TIES",
            "classification_explanation": (
                "The extension makes delta finite for all tied maxima, but it is not explicitly "
                "supported by the original singular highest-density convention. Describing it as a "
                "direct application of the original definition would be inappropriate (category C)."
            ),
            "axis_a_changed": False,
        },
        "axis_b_evidence": {
            "cutoff_percentile_primary": primary["cutoff_percentile"],
            "d_c": primary["d_c"],
            "global_maximum_rho": primary["global_maximum_rho"],
            "global_maximum_rho_observations": primary["global_maximum_rho_observations"],
            "selected_seed_slopes": [row["beta1_slope_points_per_year"] for row in selected],
            "selected_seed_absolute_separation": diagnostics["selected_seed_absolute_separation"],
            "selected_seed_separation_as_fraction_of_d_c": diagnostics["selected_seed_separation_as_fraction_of_d_c"],
            "maximum_slope_tail_drives_both_selected_delta_values": diagnostics["maximum_slope_tail_drives_both_selected_delta_values"],
            "first_gamma_to_third_gamma_ratio": diagnostics["first_gamma_to_third_gamma_ratio"],
            "nearby_cutoffs_audited": [row["cutoff_percentile"] for row in cutoff["comparisons"]],
            "cutoffs_with_non_equivalent_seed_pair": cutoff["cutoffs_with_non_equivalent_seed_pair"],
            "primary_pair_stable_at_all_nearby_cutoffs": cutoff["primary_pair_stable_at_all_nearby_cutoffs"],
            "inherited_procedure_deterministic": audit["determinism_validation"]["overall_pass"],
        },
        "alternatives_rejected_before_final_kmeans": [
            {
                "alternative": "Give the farthest-neighbor branch to every tied maximum",
                "reason": "This is the audited inherited extension and yields nearly coincident seeds dominated by one isolated tail distance.",
            },
            {
                "alternative": "Select one tied maximum by CSV row order or participant identifier",
                "reason": "Deterministic but scientifically arbitrary and not supplied by the DPC method.",
            },
            {
                "alternative": "Break the rho tie by slope coordinate or add jitter",
                "reason": "Introduces a new unvalidated rule or changes the frozen clustering feature.",
            },
            {
                "alternative": "Choose 1%, 3%, or 5% because its seeds or final K-Means look better",
                "reason": "Would be result-driven cutoff optimization; the primary cutoff remains 2%.",
            },
            {
                "alternative": "Collapse a tied density plateau and select a component representative",
                "reason": "Potentially reasonable new algorithm, but not the pre-specified hard-cutoff DPC-init and would require independent validation.",
            },
        ],
        "decision": {
            "path": "B",
            "dpc_used_for_primary_axis_b_initialization": False,
            "dpc_ablation_applicable": False,
            "reason": (
                "The one-dimensional hard-cutoff representation does not yield two defensible, "
                "separated, cutoff-stable DPC seeds without an arbitrary tie rule or a new algorithm. "
                "DPC-init is therefore methodologically non-applicable to final Axis B clustering."
            ),
            "primary_replacement": (
                "Standard sklearn Lloyd K-Means on raw slopes with init='random', n_init=1, "
                "random_state=0, max_iter=300, tol=1e-4; seed 0 is fixed in advance as the first "
                "member of the existing 0-29 baseline convention and is not metric-selected."
            ),
            "manuscript_adviser_confirmation_required": True,
        },
        "provenance": {
            "original_dpc_audit_preserved": True,
            "original_dpc_audit_path": ORIGINAL_DPC_AUDIT_PATH.relative_to(ROOT).as_posix(),
            "frozen_axis_b_hashes": hashes,
            "axis_a_interim_manifest_before_final_axis_b_runs": tree_manifest(INTERIM, "axis_a_*"),
            "raw_data_manifest_before_final_axis_b_runs": tree_manifest(ROOT / "data" / "raw"),
        },
        "prohibited_actions": {
            "axis_a_modified": False,
            "raw_adni_modified": False,
            "adnimerge2_processed": False,
            "application_integration_performed": False,
            "clinical_labels_used": False,
        },
    }
    atomic_write_json(RECONCILIATION_PATH, result)
    print(json.dumps({
        "output": str(RECONCILIATION_PATH),
        "path": result["decision"]["path"],
        "dpc_primary": False,
        "frozen_hashes_verified": True,
    }, indent=2))


if __name__ == "__main__":
    main()
