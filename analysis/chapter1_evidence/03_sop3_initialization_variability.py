"""Expose frozen random-initialization comparison as Chapter 1 SOP 3 evidence.

Only the three evidence outputs are written; the comparison's frozen output
writer is deliberately not invoked. Historical counts are verification gates.
"""
from __future__ import annotations

import csv
import hashlib
import platform
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.ticker import FormatStrFormatter
import numpy as np
import sklearn

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from scripts.research.comparison import run_dpc_initialization_comparison as comparison
from scripts.research.study_entry import run_enhanced_kmeans as enhanced

OUTPUT_DIR = Path(__file__).resolve().parent / "outputs"
TITLE = "Run-to-Run Variation of the Existing K-Means Procedure Across Random Initialization Seeds"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    observed = (comparison.EXPECTED_SHAPE, comparison.FEATURES,
                comparison.EXPECTED_K, comparison.SEEDS, comparison.N_INIT,
                comparison.MAX_ITER, comparison.TOLERANCE, comparison.ALGORITHM)
    expected = ((2437, 6), tuple(f"PC{i}" for i in range(1, 7)), 2,
                tuple(range(30)), 1, 300, 1e-4, "lloyd")
    if observed != expected:
        raise AssertionError(f"STOP: frozen comparison protocol differs: {observed}")

    inputs = [comparison.PCA_PATH, comparison.SELECTED_K_PATH,
              comparison.ENHANCED_METRICS_PATH, comparison.ENHANCED_SUMMARY_PATH,
              comparison.ENHANCED_REPRO_PATH, enhanced.ASSIGNMENTS_PATH]
    sources = [Path(__file__).resolve(), Path(comparison.__file__), Path(enhanced.__file__)]
    hashes = {path: sha256(path) for path in inputs + sources}
    ptids, rids, X, k, metrics, summary = comparison.load_locked_inputs()
    for field, value in {"n_init": comparison.N_INIT, "max_iter": comparison.MAX_ITER,
                         "algorithm": comparison.ALGORITHM,
                         "initialization": "explicit_DPC_observation_centroids"}.items():
        if summary[field] != str(value):
            raise AssertionError(f"STOP: DPC reference {field} differs")
    if float(summary["tol"]) != comparison.TOLERANCE:
        raise AssertionError("STOP: DPC reference tolerance differs")
    with enhanced.ASSIGNMENTS_PATH.open(encoding="utf-8-sig", newline="") as handle:
        assignments = list(csv.DictReader(handle))
    if [(row["PTID"], row["RID"]) for row in assignments] != list(zip(ptids, rids)):
        raise AssertionError("STOP: reference participant identities/order differ from PCA")
    labels = [int(row["cluster_label"]) for row in assignments]
    reference = comparison.canonicalize_partition(labels)
    reference_sizes = tuple(labels.count(label) for label in range(k))
    if set(labels) != set(range(k)) or reference_sizes != tuple(
        int(summary[f"cluster_{label}_size"]) for label in range(k)
    ):
        raise AssertionError("STOP: reference assignment sizes differ from summary")
    metric_mapping = {"silhouette": "silhouette_coefficient",
                      "davies_bouldin": "davies_bouldin_index",
                      "calinski_harabasz": "calinski_harabasz_index"}
    runs = []
    records = []
    partitions = set()
    max_matching_differences = dict.fromkeys(metric_mapping, 0.0)
    for run_number, seed in enumerate(comparison.SEEDS, start=1):
        run = comparison.fit_random_pca_kmeans(X, seed, run_number)
        runs.append(run)
        partition = comparison.canonicalize_partition(run.labels)
        partitions.add(partition)
        equivalent = partition == reference
        if equivalent:
            if sorted(run.cluster_sizes) != sorted(reference_sizes):
                raise AssertionError(f"STOP: seed {seed} matching partition sizes differ")
            for attribute, metric in metric_mapping.items():
                actual, target = getattr(run, attribute), metrics[metric]
                if not np.isclose(actual, target, rtol=enhanced.METRIC_RTOL,
                                  atol=enhanced.METRIC_ATOL):
                    raise AssertionError(f"STOP: seed {seed} matching {attribute} differs: {actual} vs {target}")
                max_matching_differences[attribute] = max(
                    max_matching_differences[attribute], abs(actual - target))
        records.append({
            "seed": seed, "iterations": run.iterations,
            "cluster_0_size": run.cluster_sizes[0], "cluster_1_size": run.cluster_sizes[1],
            "smaller_cluster_size": min(run.cluster_sizes),
            "larger_cluster_size": max(run.cluster_sizes),
            "silhouette": run.silhouette, "davies_bouldin": run.davies_bouldin,
            "calinski_harabasz": run.calinski_harabasz,
            "dpc_equivalent_partition": equivalent,
        })
        print(f"seed={seed}; dpc_equivalent={equivalent}", flush=True)
    matching = sum(row["dpc_equivalent_partition"] for row in records)
    different = len(records) - matching
    if (matching, different) != (21, 9):
        raise AssertionError(f"STOP: historical count discrepancy: {matching}/30 equivalent, {different}/30 different; expected 21/9")
    if any(sha256(path) != digest for path, digest in hashes.items()):
        raise AssertionError("STOP: an input or implementation changed during execution")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    csv_path = OUTPUT_DIR / "sop3_random_initialization_runs.csv"
    with csv_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(records[0]))
        writer.writeheader()
        writer.writerows(records)

    fig, ax = plt.subplots(figsize=(13, 6.4))
    fig.suptitle(TITLE, fontsize=12, y=0.97)
    ax.axhline(metrics["silhouette_coefficient"], color="#475569", linestyle="--",
               linewidth=1.5, label="Deterministic DPC reference", zorder=1)
    for equivalent, color, marker, label in [
        (True, "#007C91", "o", "DPC-equivalent partition"),
        (False, "#C65D17", "D", "Different partition"),
    ]:
        subset = [row for row in records if row["dpc_equivalent_partition"] == equivalent]
        ax.scatter([row["seed"] for row in subset], [row["silhouette"] for row in subset],
                   c=color, marker=marker, s=58, edgecolors="white", linewidths=0.6,
                   label=label, zorder=3)
    ax.set(xlabel="Random seed", ylabel="Silhouette Coefficient", xlim=(-0.7, 29.7))
    ax.set_xticks(comparison.SEEDS)
    ax.yaxis.set_major_formatter(FormatStrFormatter("%.6f"))
    ax.margins(y=0.22)
    ax.grid(axis="y", alpha=0.2)
    ax.spines[["top", "right"]].set_visible(False)
    ax.legend(loc="upper center", bbox_to_anchor=(0.5, -0.17), ncol=3, frameon=False)
    annotation = f"{matching}/30 random starts reproduced the DPC-equivalent solution; {different}/30 differed."
    fig.text(0.5, 0.09, annotation, ha="center", fontsize=11)
    fig.text(0.5, 0.045, "Expanded y-axis shows small metric differences; partition equivalence uses participant assignments.",
             ha="center", fontsize=9, color="#475569")
    fig.subplots_adjust(left=0.11, right=0.98, top=0.88, bottom=0.29)
    fig.savefig(OUTPUT_DIR / "sop3_initialization_variability.png", dpi=200)
    plt.close(fig)

    lines = ["Chapter 1 SOP 3: initialization variability", "Historical verification: PASS",
             "Implementation reused: comparison.load_locked_inputs / fit_random_pca_kmeans / canonicalize_partition",
             f"n={len(X)}", f"PC dimensions={','.join(comparison.FEATURES)}", f"k={k}",
             f"seeds={','.join(map(str, comparison.SEEDS))}",
             f"init=random; n_init={comparison.N_INIT}; max_iter={comparison.MAX_ITER}; tol={comparison.TOLERANCE}; algorithm={comparison.ALGORITHM}",
             "Controlled factor: initialization; all 30 seeds retained, no best-run selection.",
             f"DPC reference: explicit observation centroids; iterations={summary['iterations']}; cluster sizes={reference_sizes}",
             f"DPC reference metrics={metrics}",
             f"matching={matching}/30 ({100 * matching / 30:.1f}%)",
             f"nonmatching={different}/30 ({100 * different / 30:.1f}%)",
             f"unique_label_invariant_partitions={len(partitions)}",
             "Matching partitions: exact equality of existing canonicalize_partition tuples.",
             f"Matching metrics: PASS, existing enhanced reference tolerances rtol={enhanced.METRIC_RTOL}, atol={enhanced.METRIC_ATOL}",
             f"Maximum matching metric absolute differences={max_matching_differences}"]
    for field in ("iterations", "smaller_cluster_size", "larger_cluster_size",
                  "silhouette", "davies_bouldin", "calinski_harabasz"):
        values = [row[field] for row in records]
        lines.append(f"{field}_range={min(values)} to {max(values)}")
    sizes = [size for run in runs for size in run.cluster_sizes]
    lines.extend([f"all_cluster_sizes_range={min(sizes)} to {max(sizes)}",
                  "Cluster-size ranges use smaller/larger clusters to avoid label-permutation ambiguity.",
                  f"Python={platform.python_version()}; NumPy={np.__version__}; scikit-learn={sklearn.__version__}",
                  "Interpretation: random initialization is seed dependent and does not guarantee the same partition across runs.",
                  "Different partitions are not failures. These results do not establish that DPC necessarily improves internal validity metrics.",
                  "Input/source SHA-256 (unchanged throughout computation):"])
    lines.extend(f"{path.relative_to(ROOT).as_posix()}  {digest}" for path, digest in hashes.items())
    (OUTPUT_DIR / "sop3_computation_summary.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines[:23]), flush=True)


if __name__ == "__main__":
    main()
