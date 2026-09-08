"""Recover defense-only geometry; never invoke PCA, NbClust or artifact writers.

Exactly three random fits (seeds 0--2) and two fixed-seed DPC fits are allowed.
No output is written until every comparison against frozen evidence passes.
"""
from __future__ import annotations

import csv
import hashlib
import json
import os
import platform
import sys
from datetime import datetime, timezone
from pathlib import Path

for name in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS", "NUMEXPR_NUM_THREADS"):
    os.environ[name] = "1"

import numpy as np
import scipy
import sklearn
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score, davies_bouldin_score, calinski_harabasz_score

ROOT = Path(__file__).resolve().parents[3]
INTERIM = ROOT / "data/interim"
sys.path.insert(0, str(ROOT / "scripts/research/study_entry"))
import run_enhanced_kmeans as enhanced


def read(name):
    with (INTERIM / name).open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def close(actual, expected, label):
    require(np.allclose(actual, expected, rtol=1e-12, atol=1e-12), f"STOP: {label} mismatch")


def main():
    source_names = [
        "clustering_pca_scores.csv", "clustering_pca_explained_variance.csv",
        "clustering_features_standardized.csv", "clustering_pca_loadings.csv",
        "study_entry_cohort_unimputed.csv", "clustering_selected_k.csv",
        "baseline_kmeans_assignments.csv", "baseline_kmeans_runs.csv",
        "dpc_comparison_random_assignments.csv", "dpc_comparison_random_runs.csv",
        "unified_cluster_assignments.csv", "enhanced_kmeans_centroids.csv",
        "clustering_dpc_selected_centroids.csv", "enhanced_kmeans_metrics.csv",
        "enhanced_kmeans_run_summary.csv", "enhanced_kmeans_reproducibility.csv",
        "clustering_dpc_determinism_check.csv"
    ]
    hashes = {f"data/interim/{name}": digest(INTERIM / name) for name in source_names}
    evaluation_path = ROOT / "apps/api/artifacts/sop_evaluation_summary.json"
    evaluation_hash = digest(evaluation_path)
    evaluation = json.loads(evaluation_path.read_text())
    require(all(hashes[source] == value for source, value in evaluation["provenance"]["sourceSha256"].items()), "SOP source drift")
    runtime = {"python": platform.python_version(), "numpy": np.__version__, "scipy": scipy.__version__, "sklearn": sklearn.__version__}
    saved_runtime = {row["metric"]: row["value"] for row in read("enhanced_kmeans_run_summary.csv")}
    for key, saved in (("python", "python_version"), ("numpy", "numpy_version"), ("scipy", "scipy_version"), ("sklearn", "scikit_learn_version")):
        require(runtime[key] == saved_runtime[saved], f"Frozen {key} runtime differs")

    ptids, rids, X, k, dpc_initial, _ = enhanced.load_locked_inputs()
    keys = list(zip(ptids, rids))
    require(len(keys) == len(set(keys)) == 2437, "Common cohort cardinality")

    def labels(name, run_number=None):
        rows = [row for row in read(name) if run_number is None or int(row["run_number"]) == run_number]
        keyed = {(row["PTID"], row["RID"]): row for row in rows}
        require(len(rows) == len(keyed) == 2437 and set(keyed) == set(keys), f"{name}: cohort mismatch")
        if run_number is not None:
            require(all(int(row["seed"]) == run_number - 1 for row in rows), f"{name}: seed mismatch")
        result = np.array([int(keyed[key]["cluster_label"]) for key in keys])
        require(set(result.tolist()) == {0, 1}, "Invalid labels")
        return result

    def observations(assignments):
        return [{"pc1": float(point[0]), "pc2": float(point[1]), "cluster": int(cluster)} for point, cluster in zip(X, assignments)]

    def markers(matrix, kind):
        return [{"pc1": float(point[0]), "pc2": float(point[1]), "cluster": cluster, "type": kind} for cluster, point in enumerate(matrix)]

    def panel(assignments, final, initial=None):
        require(np.isfinite(final).all(), "Nonfinite marker")
        return {"observations": observations(assignments), "markers":
                ([] if initial is None else markers(initial, "initial")) + markers(final, "final")}

    # Verify the fixed linear projection, without fitting PCA or preprocessing.
    standardized_rows = read("clustering_features_standardized.csv")
    standardized = {(row["PTID"], row["RID"]): row for row in standardized_rows}
    loadings = read("clustering_pca_loadings.csv")
    variables = [row["variable"] for row in loadings]
    Z = np.array([[float(standardized[key][name]) for name in variables] for key in keys])
    W = np.array([[float(row["PC1"]), float(row["PC2"])] for row in loadings])
    close((Z - Z.mean(axis=0)) @ W, X[:, :2], "saved PCA linear projection")
    baseline = labels("baseline_kmeans_assignments.csv", 1)
    pca_only = labels("dpc_comparison_random_assignments.csv", 1)
    means = lambda assignments: np.array([X[assignments == cluster, :2].mean(axis=0) for cluster in range(k)])
    baseline_means, pca_means = means(baseline), means(pca_only)
    for cluster in range(k):
        close((Z[baseline == cluster].mean(axis=0) - Z.mean(axis=0)) @ W, baseline_means[cluster], "projected baseline cluster mean")
    print("PASS SOP 1: projected final-assignment means derived; fixed linear projection verified; no fit", flush=True)

    # Capture sklearn's actual initialization, including its internal centering.
    class CapturedKMeans(KMeans):
        def _init_centroids(self, *args, **kwargs):
            centers = super()._init_centroids(*args, **kwargs)
            self.captured_initial = centers.copy() + X.mean(axis=0)
            return centers

    random_panels = []
    saved_random = read("dpc_comparison_random_runs.csv")
    for seed in (0, 1, 2):
        expected = saved_random[seed]
        require(int(expected["run_number"]) == seed + 1 and int(expected["seed"]) == seed, "Saved run ordering")
        require((expected["k"], expected["init"], expected["n_init"], expected["max_iter"], float(expected["tol"]), expected["algorithm"]) == ("2", "random", "1", "300", 0.0001, "lloyd"), "Saved random settings differ")
        model = CapturedKMeans(n_clusters=2, init="random", n_init=1, max_iter=300, tol=1e-4, algorithm="lloyd", random_state=seed)
        actual = model.fit_predict(X)
        require(np.array_equal(actual, labels("dpc_comparison_random_assignments.csv", seed + 1)), f"STOP: random seed {seed} assignments mismatch")
        require(model.n_iter_ == int(expected["iterations"]), f"STOP: random seed {seed} iterations mismatch")
        sizes = "|".join(f"{cluster}:{int(np.sum(actual == cluster))}" for cluster in range(k))
        require(sizes == expected["cluster_sizes"], f"STOP: random seed {seed} sizes mismatch")
        for name, function in (("silhouette", silhouette_score), ("davies_bouldin", davies_bouldin_score), ("calinski_harabasz", calinski_harabasz_score)):
            close(function(X, actual), float(expected[name]), f"random seed {seed} {name}")
        for center in model.captured_initial:
            close(X[np.argmin(np.linalg.norm(X - center, axis=1))], center, "actual random observation seed")
        random_panels.append({"runNumber": seed + 1, "seed": seed, **panel(actual, model.cluster_centers_, model.captured_initial)})
        print(f"PASS random seed {seed}: saved assignments, metrics, iterations and sizes; actual initial/final markers", flush=True)

    reference_labels = labels("unified_cluster_assignments.csv")
    reference_rows = sorted(read("enhanced_kmeans_centroids.csv"), key=lambda row: int(row["cluster_label"]))
    reference_final = np.array([[float(row[f"final_PC{i}"]) for i in range(1, 7)] for row in reference_rows])
    reference_initial = np.array([[float(row[f"initial_PC{i}"]) for i in range(1, 7)] for row in reference_rows])
    require(np.array_equal(reference_initial, dpc_initial), "DPC saved seed equality")
    require(all(row["overall_pass"] == "True" for row in read("enhanced_kmeans_reproducibility.csv")), "Historical DPC checks failed")
    dpc_panels = [{"checkNumber": 1, "origin": "saved_reference", **panel(reference_labels, reference_final, dpc_initial)}]
    saved_metrics = {row["metric"]: float(row["value"]) for row in read("enhanced_kmeans_metrics.csv")}
    for check in (2, 3):
        run = enhanced.run_enhanced_kmeans(X, dpc_initial, k)
        require(np.array_equal(run.initial_centroids, reference_initial), f"STOP: DPC check {check} seed mismatch")
        require(np.array_equal(run.labels, reference_labels), f"STOP: DPC check {check} assignment mismatch")
        require(run.iterations == int(saved_runtime["iterations"]), "DPC iteration mismatch")
        close(run.final_centroids, reference_final, f"DPC check {check} final centroids")
        for field, metric in (("silhouette", "silhouette_coefficient"), ("davies_bouldin", "davies_bouldin_index"), ("calinski_harabasz", "calinski_harabasz_index")):
            close(getattr(run, field), saved_metrics[metric], f"DPC check {check} {field}")
        dpc_panels.append({"checkNumber": check, "origin": "reconstructed_check", **panel(run.labels, run.final_centroids, run.initial_centroids)})
        print(f"PASS reconstructed DPC check {check}: seeds, labels, metrics, iterations and centroid tolerance", flush=True)

    require(all(digest(ROOT / name) == value for name, value in hashes.items()) and digest(evaluation_path) == evaluation_hash, "Frozen input changed during recovery")
    artifact = {
        "contractVersion": "defense-geometry/v1", "scope": "Frozen-study defense visualization only",
        "sop1": {"seed": 0, "centroidMethod": "mean_of_saved_final_assignment_projection", "baseline": panel(baseline, baseline_means), "pcaOnly": panel(pca_only, pca_means)},
        "sop3": {"random": random_panels, "dpc": dpc_panels},
        "provenance": {"generatedAt": datetime.now(timezone.utc).isoformat(), "sourceSha256": hashes,
            "evaluationSha256": evaluation_hash, "runtime": runtime, "randomOrigin": "replayed_seeds_0_1_2_validated_against_saved_evidence",
            "dpcOrigin": "saved_reference_and_reconstructed_checks_2_3", "assignmentsExact": True,
            "metricRtol": 1e-12, "metricAtol": 1e-12, "centroidRtol": 1e-12, "centroidAtol": 1e-12}
    }
    # Fixed public allowlist; identifiers are used only for private joins above.
    panels = [artifact["sop1"]["baseline"], artifact["sop1"]["pcaOnly"], *random_panels, *dpc_panels]
    for current in panels:
        require(len(current["observations"]) == 2437, "Observation count")
        require(all(set(point) == {"pc1", "pc2", "cluster"} for point in current["observations"]), "Observation allowlist")
        require(all(set(marker) == {"pc1", "pc2", "cluster", "type"} for marker in current["markers"]), "Marker allowlist")
    output = ROOT / "apps/api/artifacts/defense_geometry.json"
    serialized = json.dumps(artifact, separators=(",", ":"), allow_nan=False) + "\n"
    output.write_text(serialized, encoding="utf-8")
    output.with_suffix(".sha256").write_text(digest(output) + "\n", encoding="utf-8")
    print("PASS packaged eight complete de-identified panels; all frozen source hashes unchanged", flush=True)


if __name__ == "__main__":
    main()
