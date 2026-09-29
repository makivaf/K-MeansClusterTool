"""Expose the existing baseline k-selection procedure for Chapter 1 SOP 2.

Run with Python from any directory. Only this module's four diagnostic outputs
are written; frozen pipeline artifacts and participant identifiers are not exported.
"""
from __future__ import annotations

import hashlib
import json
import math
import platform
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import sklearn

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from scripts.research.comparison import run_baseline_kmeans_comparison as baseline

OUTPUT_DIR = Path(__file__).resolve().parent / "outputs"
VERIFY_ATOL = 1e-12


def verify_protocol() -> None:
    observed = (baseline.EXPECTED_SHAPE, baseline.K_CANDIDATES,
                baseline.K_SELECTION_SEED, baseline.N_INIT, baseline.MAX_ITER,
                baseline.TOLERANCE, baseline.ALGORITHM)
    expected = ((2437, 13), tuple(range(2, 11)), 0, 1, 300, 1e-4, "lloyd")
    if observed != expected:
        raise RuntimeError(f"Existing baseline protocol differs from requested frozen protocol: {observed}")


def reconstruct_silhouette(X: np.ndarray, run: baseline.BaselineRun) -> pd.DataFrame:
    """Compute distances and all s(i) directly, without sklearn silhouette helpers."""
    labels = run.labels
    groups = {label: np.flatnonzero(labels == label) for label in np.unique(labels)}
    silhouettes = []
    example = None
    for i in range(len(X)):
        # Direct coordinate differences provide an independent Euclidean calculation.
        distances = np.sqrt(np.sum((X - X[i]) ** 2, axis=1))
        own_label = int(labels[i])
        own_others = groups[own_label][groups[own_label] != i]
        a = math.fsum(float(distances[j]) for j in own_others) / len(own_others) if len(own_others) else 0.0
        other_means = {
            int(label): math.fsum(float(distances[j]) for j in members) / len(members)
            for label, members in groups.items() if label != own_label
        }
        nearest_label = min(other_means, key=lambda label: (other_means[label], label))
        b = other_means[nearest_label]
        denominator = max(a, b)
        s = (b - a) / denominator if len(own_others) and denominator else 0.0
        silhouettes.append(s)
        if i == 0:
            example = {
                "input_row_zero_based": i, "input_csv_line_one_based": i + 2,
                "selected_k": run.k, "assigned_cluster": own_label,
                "assigned_cluster_size": len(groups[own_label]),
                "other_members_in_assigned_cluster": len(own_others),
                "nearest_other_cluster": nearest_label,
                "nearest_other_cluster_size": len(groups[nearest_label]),
                "a_i": a, "b_i": b, "numerator_b_minus_a": b - a,
                "denominator_max_a_b": denominator, "s_i": s,
            }
    overall = math.fsum(silhouettes) / len(silhouettes)
    difference = abs(overall - run.silhouette)
    if not math.isclose(overall, run.silhouette, rel_tol=0, abs_tol=VERIFY_ATOL):
        raise AssertionError(f"Independent Silhouette mismatch: {overall} vs {run.silhouette}; difference={difference}")
    if not np.isfinite(silhouettes).all() or np.any(np.abs(silhouettes) > 1 + VERIFY_ATOL):
        raise AssertionError("Invalid observation-level Silhouettes")
    assert example is not None
    example.update({
        "n_observations": len(silhouettes),
        "sum_observation_silhouettes": math.fsum(silhouettes),
        "independent_mean_silhouette": overall,
        "baseline_selected_silhouette": run.silhouette,
        "absolute_difference": difference,
        "verification_absolute_tolerance": VERIFY_ATOL,
        "verification_passed": True,
    })
    return pd.DataFrame([example])


def plot_candidates(results: pd.DataFrame, selected_k: int, destination: Path) -> None:
    with plt.rc_context({"font.family": "DejaVu Sans", "font.size": 11}):
        fig, ax = plt.subplots(figsize=(11, 7))
        fig.subplots_adjust(left=0.10, right=0.97, bottom=0.20, top=0.78)
        ax.plot(results.k, results.silhouette, color="#286084", marker="o",
                linewidth=1.8, markersize=6)
        selected = results.loc[results.k == selected_k].iloc[0]
        ax.scatter([selected_k], [selected.silhouette], color="#a84a13",
                   edgecolor="white", linewidth=1.3, s=120, zorder=4)
        for row in results.itertuples():
            label = f"{row.silhouette:.6f}"
            if row.k == selected_k:
                label += f"\nSelected maximum: k = {selected_k}"
            ax.annotate(label, (row.k, row.silhouette), xytext=(0, 12),
                        textcoords="offset points", ha="left" if row.k == selected_k else "center", fontsize=10,
                        bbox={"facecolor": "white", "edgecolor": "none", "alpha": 0.9, "pad": 1.5},
                        color="#923e0f" if row.k == selected_k else "#202b33")
        ax.set_xticks(range(2, 11))
        ax.set_xlim(1.6, 10.4)
        span = float(results.silhouette.max() - results.silhouette.min())
        ax.set_ylim(float(results.silhouette.min()) - max(0.025, span * 0.15),
                    float(results.silhouette.max()) + max(0.05, span * 0.35))
        ax.set_xlabel("Number of Clusters (k)", labelpad=12)
        ax.set_ylabel("Silhouette Coefficient", labelpad=12)
        ax.grid(axis="y", color="#e1e5e8", linewidth=0.8)
        ax.set_axisbelow(True)
        ax.spines[["top", "right"]].set_visible(False)
        fig.suptitle("Candidate Cluster-Number Evaluation of the Existing\n"
                     "K-Means Baseline on ADNI Data", fontsize=17,
                     fontweight="semibold", y=0.965)
        fig.text(0.5, 0.835, "2,437 participants · 13 standardized features · random seed 0",
                 ha="center", fontsize=11)
        fig.text(0.10, 0.085, "Baseline selection rule: Maximum Silhouette Coefficient",
                 fontsize=11)
        fig.text(0.10, 0.045, "One random initialization per candidate. Labels rounded to six decimals.",
                 fontsize=10, color="#444444")
        fig.savefig(destination, dpi=300, facecolor="white", bbox_inches="tight", pad_inches=0.25)
        plt.close(fig)


def main() -> None:
    verify_protocol()
    input_hash = hashlib.sha256(baseline.STANDARDIZED_PATH.read_bytes()).hexdigest()
    _ptids, _rids, X = baseline.load_baseline_input()
    if X.shape != (2437, 13):
        raise AssertionError(f"Unexpected input shape: {X.shape}")
    print(f"Validated input shape: {X.shape}; executing existing select_baseline_k()", flush=True)
    selected_k, runs = baseline.select_baseline_k(X)
    if tuple(run.k for run in runs) != tuple(range(2, 11)) or any(run.seed != 0 for run in runs):
        raise AssertionError("Candidate runs do not follow the frozen k/seed protocol")
    for run in runs:
        print(f"k={run.k}: Silhouette={run.silhouette:.17g}", flush=True)
    if selected_k != 2:
        raise RuntimeError(f"STOP: reproduced selected k={selected_k}, frozen thesis k=2. No parameters changed.")
    selected = next(run for run in runs if run.k == selected_k)
    worked = reconstruct_silhouette(X, selected)
    if hashlib.sha256(baseline.STANDARDIZED_PATH.read_bytes()).hexdigest() != input_hash:
        raise RuntimeError("Input changed during computation")
    results = pd.DataFrame([{
        "k": run.k, "silhouette": run.silhouette,
        "davies_bouldin": run.davies_bouldin, "calinski_harabasz": run.calinski_harabasz,
        "iterations": run.iterations,
        "cluster_sizes": json.dumps({label: size for label, size in enumerate(run.cluster_sizes)}),
        "seed": run.seed, "selected": run.k == selected_k,
    } for run in runs])
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    results.to_csv(OUTPUT_DIR / "sop2_candidate_k_results.csv", index=False, float_format="%.17g")
    worked.to_csv(OUTPUT_DIR / "sop2_worked_silhouette_example.csv", index=False, float_format="%.17g")
    plot_candidates(results, selected_k, OUTPUT_DIR / "sop2_candidate_k_silhouette.png")
    lines = [
        "Chapter 1 SOP 2: existing baseline cluster-number selection",
        f"Exact input file: {baseline.STANDARDIZED_PATH.resolve()}",
        f"Input SHA-256: {input_hash}", "n=2437", "p=13",
        "Features: " + ", ".join(baseline.FEATURES),
        "Implementation: scripts/research/comparison/run_baseline_kmeans_comparison.py",
        "Reused functions: load_baseline_input(); select_baseline_k() calls fit_random_kmeans()",
        "Candidates: k=2,3,4,5,6,7,8,9,10", "random_state=0", 'init="random"',
        "n_init=1", "max_iter=300", "tol=0.0001", 'algorithm="lloyd"',
        "Distance: Euclidean in the existing standardized 13-feature space",
        "Selection: maximum Silhouette only; exact ties select smaller k; no seed averaging",
        "Davies-Bouldin and Calinski-Harabasz are exported for audit, not used for selection.",
        "All nine candidate Silhouette values:",
        *[f"  k={run.k}: {run.silhouette:.17g}" for run in runs],
        f"Selected k: {selected_k}", f"Selected Silhouette: {selected.silhouette:.17g}",
        "Agreement with frozen thesis k=2: PASS",
        "Independent verification: direct coordinate-difference Euclidean distances for all rows;",
        "a(i) excludes self; b(i) is the minimum other-cluster mean distance;",
        "s(i)=(b(i)-a(i))/max(a(i),b(i)); S=math.fsum(s(i))/n.",
        "Singleton or zero-denominator observations receive s(i)=0.",
        "Worked example: first input observation (zero-based row 0, CSV line 2); no RID/PTID exported",
        f"Independent overall Silhouette: {worked.iloc[0]['independent_mean_silhouette']:.17g}",
        f"Absolute verification difference: {worked.iloc[0]['absolute_difference']:.17g}",
        f"Verification: PASS; absolute tolerance={VERIFY_ATOL}; relative tolerance=0",
        f"Python version: {platform.python_version()}", f"Python executable: {sys.executable}",
        f"scikit-learn version: {sklearn.__version__}", f"NumPy version: {np.__version__}",
        f"pandas version: {pd.__version__}", f"Matplotlib version: {matplotlib.__version__}",
        "Interpretation: the existing baseline systematically selects k outside the K-Means fit",
        "using one internal validation criterion. This provides a methodological comparison",
        "with later NbClust multi-index voting; it does not establish clinical correctness,",
        "universal optimality, or that NbClust will select a better or different numerical k.",
    ]
    summary = "\n".join(lines) + "\n"
    (OUTPUT_DIR / "sop2_selected_k_summary.txt").write_text(summary, encoding="utf-8")
    print(summary)
    print(f"Outputs: {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
