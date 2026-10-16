"""Read-only walkthrough of verified full-study method runs; output stays private.

Run from the repository root with .venv/Scripts/python.exe. Optional
--standard-run and --enhanced-run select particular completed job directories.
Only the first cohort participant is used as a worked example. DPC center
vectors and the requested center's density/distance record are also included.
"""
from __future__ import annotations

import argparse
import hashlib
import inspect
import json
import math
import os
from pathlib import Path
import subprocess
import sys
from unittest.mock import patch

for name in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS"):
    os.environ[name] = "1"
os.environ["PYTHONDONTWRITEBYTECODE"] = "1"
sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[3]
sys.path[:0] = [str(ROOT / "scripts/research/simulation"),
               str(ROOT / "scripts/research/study_entry"),
               str(ROOT / "scripts/research/comparison")]

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
import sklearn.cluster._kmeans as sklearn_kmeans
from exact_runtime import ExactMetrics, exact_dpc_init
from prepare_method_data import prepare_data
import preprocess_study_entry as prep
import run_baseline_kmeans_comparison as baseline
import run_enhanced_kmeans as enhanced
import dpc_initialize_clusters as dpc_code

RUNS = ROOT / "apps/api/private/method-runs"
OUTPUT = ROOT / "apps/api/private/calculation_walkthrough.md"


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read_run(folder, method):
    job = json.loads((folder / "job.json").read_text(encoding="utf-8"))
    result = json.loads((folder / "result.json").read_text(encoding="utf-8"))
    assert job["status"] == "complete" and job["result"] == result, "Incomplete or changed job"
    assert result["method"] == method and result["common"]["participantCount"] == 2437
    assert job["input"]["scope"] == "study", "Full-study job required"
    assert sha(folder / "partitions.npz") == result["assignmentsHash"], "Assignments changed"
    with np.load(folder / "partitions.npz", allow_pickle=False) as saved:
        ids, labels = saved["ids"].tolist(), saved["labels"].copy()
    assert labels.shape[1] == len(ids) and np.array_equal(labels[0], result["labels"])
    assert hashlib.sha256(json.dumps(ids, separators=(",", ":")).encode()).hexdigest() == result["provenance"]["participantsHash"]
    request = json.loads((folder / "request.json").read_text(encoding="utf-8"))
    return folder, result, request, ids, labels


def candidates(method, selected):
    if selected:
        yield read_run(Path(selected).resolve(), method)
        return
    output = []
    for folder in RUNS.iterdir():
        if not (folder / "job.json").exists():
            continue
        job = json.loads((folder / "job.json").read_text(encoding="utf-8"))
        if job["status"] == "complete" and job["method"] == method and job["input"]["scope"] == "study" and job["result"]["common"]["participantCount"] == 2437 and job["result"].get("assignmentsHash"):
            output.append((job["finishedAt"], folder))
    for _, folder in sorted(output, reverse=True):
        yield read_run(folder, method)


def select_runs(args):
    fields = ("sourceHash", "participantsHash", "preprocessingHash", "pcaHash", "dependenciesHash")
    for standard in candidates("standard", args.standard_run):
        for improved in candidates("enhanced", args.enhanced_run):
            if all(standard[1]["provenance"][key] == improved[1]["provenance"][key] for key in fields) and standard[3] == improved[3]:
                return standard, improved
    raise AssertionError("No compatible completed full-study Standard/Enhanced runs available")


def trace_fit(matrix, fit):
    """Observe the installed sklearn routines without replacing their arithmetic."""
    init_function = KMeans._init_centroids
    iteration_function = sklearn_kmeans.lloyd_iter_chunked_dense
    iteration_signature = inspect.signature(iteration_function)
    mean = matrix.mean(axis=0)
    trace = {"steps": 0}
    previous = None

    def capture_init(model, *args, **kwargs):
        centers = init_function(model, *args, **kwargs)
        trace["model"] = model
        trace["initial"] = centers.copy() + mean
        return centers

    def capture_iteration(*args, **kwargs):
        nonlocal previous
        bound = iteration_signature.bind(*args, **kwargs)
        bound.apply_defaults()
        iteration_function(*args, **kwargs)
        values = bound.arguments
        if values["update_centers"]:
            labels = values["labels"].copy()
            trace["steps"] += 1
            if trace["steps"] == 1:
                trace["iteration1"] = values["centers_new"].copy() + mean
                trace["example_initial_assignment"] = int(labels[0])
            trace["strict"] = previous is not None and np.array_equal(labels, previous)
            trace["shift_squared"] = float(np.sum(values["center_shift"] ** 2))
            previous = labels

    with patch.object(KMeans, "_init_centroids", capture_init), patch.object(sklearn_kmeans, "lloyd_iter_chunked_dense", capture_iteration):
        run = fit()
    model = trace["model"]
    assert trace["steps"] == run.iterations == model.n_iter_
    trace["final"] = model.cluster_centers_.copy()
    trace["tolerance"] = float(model._tol)
    trace["example_distances"] = np.linalg.norm(matrix[0] - trace["initial"], axis=1)
    assert int(np.argmin(trace["example_distances"])) == trace["example_initial_assignment"]
    assert trace["strict"] or trace["shift_squared"] <= trace["tolerance"], "Run did not converge"
    return run, trace


def walkthrough(args):
    standard, improved = select_runs(args)
    sf, sr, request, ids, standard_labels = standard
    ef, er, _, enhanced_ids, enhanced_labels = improved
    assert ids == enhanced_ids and standard_labels.shape == (30, len(ids))
    assert sr["standard"]["selectedK"] == er["enhanced"]["selectedK"] == 2
    key = request.get("preparationKey", request["compatibilityKey"])
    cache = Path(request["cacheDirectory"]) / key
    protected = [folder / name for folder in (sf, ef) for name in ("job.json", "result.json", "request.json", "partitions.npz")]
    protected += [cache / name for name in ("standardized.csv", "preprocessing.npz", "preparation.json", "manifest.json", "pca/scores.npy", "pca/pca.json", "pca/manifest.json")]
    protected.append(Path(request["sourcePath"]))
    before = {path: sha(path) for path in protected}
    request = {**request, "requirePrepared": True}
    hits = {"preprocessing": False, "pca": False}
    X, Z, info, pca, prepared_ids, actual_cache = prepare_data(request, sf, lambda _, fn: fn(), lambda _: None, hits)
    assert prepared_ids == ids and hits == {"preprocessing": True, "pca": True}
    assert X.shape == (2437, 13) and Z.shape == (2437, 6)
    assert sha(actual_cache / "standardized.csv") == sr["provenance"]["preprocessingHash"]
    assert sha(actual_cache / "pca/scores.npy") == sr["provenance"]["pcaHash"]
    assert pca == sr["common"]["pca"] == er["common"]["pca"]
    lines = ["# Calculation walkthrough", "", f"Standard source job: {sf.name}", f"Enhanced source job: {ef.name}",
             f"Example participant: first RID in cohort order, {ids[0]}", "",
             "Binary64 values use 17 significant digits. Numerical assertions use rtol=1e-12 and atol=1e-12; partitions require exact label equality.", ""]
    number = lambda value: format(float(value), ".17g")

    def heading(title):
        lines.extend([f"## {title}", ""])

    def value(label, data):
        lines.append(f"{label}: {data}")

    def vector(label, values, names):
        lines.append(label + ":")
        lines.extend(f"  {name} = {number(v)}" for name, v in zip(names, values))

    heading("1. Preprocessing: standardized values")
    vector(f"Example RID {ids[0]}", X[0], prep.RETAINED_FEATURES)
    heading("2. Pearson correlation: MMSE versus ADAS-Cog13 (ADAS13)")
    left, right = [list(prep.RETAINED_FEATURES).index(name) for name in ("MMSE", "ADAS13")]
    a, b = X[:, left], X[:, right]
    da, db = a - a.mean(), b - b.mean()
    cross, ss_a, ss_b = float(da @ db), float(da @ da), float(db @ db)
    r = cross / math.sqrt(ss_a * ss_b)
    for label, data in (("n", len(ids)), ("Mean MMSE (standardized)", number(a.mean())), ("Mean ADAS-Cog13 (standardized)", number(b.mean())),
                        ("Sum of centered cross-products", number(cross)), ("MMSE sum of centered squares", number(ss_a)),
                        ("ADAS-Cog13 sum of centered squares", number(ss_b)), ("r = cross-products / sqrt(SS_MMSE × SS_ADAS13)", number(r))):
        value(label, data)
    np.testing.assert_allclose(r, sr["common"]["correlation"][left][right], rtol=1e-12, atol=1e-12)
    value("Heatmap equality assertion", "PASS")
    heading("3. Principal component analysis")
    frame = pd.DataFrame(X, columns=prep.RETAINED_FEATURES)
    frame["RID"] = ids
    with np.load(cache / "preprocessing.npz", allow_pickle=False) as saved:
        frame["PTID"] = saved["ptids"].tolist()
    scores, variance, loadings, model, count = prep.apply_pca(frame, expected_rows=len(ids))
    coefficients = np.array(pca["pcaLoadings"]["values"])
    assert count == 6
    np.testing.assert_allclose(loadings.iloc[:, 1:].to_numpy(), coefficients, rtol=1e-12, atol=1e-12)
    np.testing.assert_allclose(scores[[f"PC{i}" for i in range(1, 7)]].to_numpy(), Z, rtol=1e-12, atol=1e-12)
    lines.append("PC | Eigenvalue | Explained variance ratio | Cumulative variance ratio")
    for row in pca["pcaVariance"]:
        i = row["component"] - 1
        np.testing.assert_allclose(model.explained_variance_[i], row["eigenvalue"], rtol=1e-12, atol=1e-12)
        lines.append(f"PC{i+1} | {number(row['eigenvalue'])} | {number(row['explainedVarianceRatio'])} | {number(row['cumulativeExplainedVariance'])}")
    lines.extend(["", "Variable | " + " | ".join(f"PC{i}" for i in range(1, 7))])
    for name, row in zip(prep.RETAINED_FEATURES, coefficients[:, :6]):
        lines.append(name + " | " + " | ".join(number(v) for v in row))
    dot_scores = X[0] @ coefficients[:, :6]
    lines.extend(["", "PC1 dot-product terms:"])
    for name, x, coefficient in zip(prep.RETAINED_FEATURES, X[0], coefficients[:, 0]):
        lines.append(f"  {name}: {number(x)} × {number(coefficient)} = {number(x * coefficient)}")
    vector("Example PC scores: standardized values dot loadings", dot_scores, [f"PC{i}" for i in range(1, 7)])
    vector("Stored example PC scores", Z[0], [f"PC{i}" for i in range(1, 7)])
    np.testing.assert_allclose(dot_scores, Z[0], rtol=1e-12, atol=1e-12)
    lines.append("PCA internally centers the residual floating-point column means; the raw standardized dot product agrees with stored scores within the stated tolerance.")
    value("PCA loadings, eigenvalues, full score matrix and example dot-product assertions", "PASS")

    def clustering(title, matrix, stored_labels, fit, expected_iterations, feature_names):
        heading(title)
        run, trace = trace_fit(matrix, fit)
        np.testing.assert_array_equal(run.labels, stored_labels)
        assert run.iterations == expected_iterations
        for i, center in enumerate(trace["initial"]):
            vector(f"Initial centroid {i}", center, feature_names)
            value(f"Example RID {ids[0]} distance to initial centroid {i}", number(trace["example_distances"][i]))
        value("Example participant initial assignment", trace["example_initial_assignment"])
        for i, center in enumerate(trace["iteration1"]):
            vector(f"Centroid {i} after iteration 1", center, feature_names)
        value("Iterations to convergence", run.iterations)
        value("Configured relative tolerance", number(baseline.TOLERANCE if title.startswith("4.") else enhanced.TOLERANCE))
        value("Effective variance-scaled squared-shift tolerance", number(trace["tolerance"]))
        value("Final sum of squared centroid shifts", number(trace["shift_squared"]))
        value("Convergence criterion", "Unchanged labels (strict convergence)" if trace["strict"] else "Sum of squared centroid shifts <= effective tolerance")
        lines.append("sklearn checks unchanged labels first, then sum(center_shift²) <= mean(feature variances) × configured tolerance; max_iter = 300.")
        for i, center in enumerate(trace["final"]):
            vector(f"Final centroid {i}", center, feature_names)
        value("Exact stored-partition and iteration-count assertions", "PASS")
        return run, trace

    standard_run, _ = clustering("4. Standard K-Means: seed 0", X, standard_labels[0],
        lambda: baseline.fit_random_kmeans(X, 2, 0, 1, expected_shape=X.shape, evaluate=ExactMetrics(X)),
        sr["standard"]["runs"][0]["iterations"], prep.RETAINED_FEATURES)
    np.testing.assert_allclose([standard_run.silhouette, standard_run.davies_bouldin, standard_run.calinski_harabasz],
        [sr["standard"]["runs"][0]["metrics"][key] for key in ("silhouette", "davies_bouldin", "calinski_harabasz")], rtol=1e-12, atol=1e-12)
    heading("5. DPC initialization in six retained PCs")
    percentile_details = {}
    percentile_function = dpc_code._linear_percentile

    def capture_percentile(values, percentile):
        if percentile == dpc_code.STUDY_CUTOFF_PERCENTILE:
            position = (len(values) - 1) * percentile
            lower, upper = math.floor(position), math.ceil(position)
            percentile_details.update(count=len(values), position=position, lower=values[lower],
                                      upper=values[upper], weight=position-lower)
        return percentile_function(values, percentile)

    with patch.object(dpc_code, "_linear_percentile", capture_percentile):
        dpc = exact_dpc_init(Z.tolist(), 2)
    index = ids.index("1086")
    distances = [math.dist(Z[index], row) for row in Z]
    neighbors = sum(i != index and distance < dpc.d_c for i, distance in enumerate(distances))
    denser = [i for i, rho in enumerate(dpc.rho) if rho > dpc.rho[index]]
    reference = min(denser, key=lambda i: (distances[i], i)) if denser else max(range(len(ids)), key=lambda i: (distances[i], -i))
    assert neighbors == dpc.rho[index]
    np.testing.assert_allclose([distances[reference], neighbors * distances[reference]], [dpc.delta[index], dpc.gamma[index]], rtol=1e-12, atol=1e-12)
    value("Cutoff distance d_c", number(dpc.d_c))
    value("Cutoff percentile", number(dpc.cutoff_percentile))
    value("Unordered participant pairs", dpc.pairwise_distance_count)
    value("Strictly positive distances used for cutoff", percentile_details["count"])
    value("Interpolated zero-based position", number(percentile_details["position"]))
    value("Lower bracketing distance", number(percentile_details["lower"]))
    value("Upper bracketing distance", number(percentile_details["upper"]))
    value("Interpolation weight", number(percentile_details["weight"]))
    lines.append("d_c is the linearly interpolated type-7 percentile of sorted strictly positive pairwise math.dist distances: position = (count − 1) × percentile. Density excludes self and uses distance < d_c (strict inequality).")
    value("Center RID", "1086")
    value("Local density ρ (neighbor count within d_c)", neighbors)
    if denser:
        value("Distance δ to nearest strictly denser participant", number(distances[reference]))
        value("Nearest strictly denser participant RID", ids[reference])
    else:
        value("Nearest strictly denser participant RID", "None: no participant has a strictly greater local density")
        value("Distance δ (highest-density exception: farthest participant)", number(distances[reference]))
        value("Farthest participant RID (distance reference only)", ids[reference])
        lines.append("The real DPC definition gives every tied maximum-density participant its maximum distance; no nearest-denser RID exists for this center.")
    value("Center score γ = ρ × δ", f"{neighbors} × {number(distances[reference])} = {number(dpc.gamma[index])}")
    centers = np.array(dpc.centroid_matrix)
    saved_centers = er["enhanced"]["dpc"]["centers"]
    assert [ids[i] for i in dpc.selected_indices] == [row["rid"] for row in saved_centers]
    np.testing.assert_array_equal(centers, [row["coordinates"] for row in saved_centers])
    saved_center = next(row for row in saved_centers if row["rid"] == "1086")
    np.testing.assert_allclose([neighbors, dpc.delta[index], dpc.gamma[index]],
                              [saved_center["rho"], saved_center["delta"], saved_center["gamma"]], rtol=1e-12, atol=1e-12)
    for i, center in enumerate(centers):
        vector(f"DPC center {i}, RID {ids[dpc.selected_indices[i]]}", center, enhanced.FEATURES)
    value("DPC center-vector and requested density/distance assertions", "PASS")
    enhanced_run, trace = clustering("6. Enhanced K-Means: DPC initial centroids", Z, enhanced_labels[0],
        lambda: enhanced.run_enhanced_kmeans(Z, centers, 2, expected_shape=Z.shape, evaluate=ExactMetrics(Z)),
        er["enhanced"]["iterations"], enhanced.FEATURES)
    np.testing.assert_allclose(trace["initial"], centers, rtol=1e-12, atol=1e-12)
    np.testing.assert_allclose(enhanced_run.final_centroids, trace["final"], rtol=1e-12, atol=1e-12)
    np.testing.assert_allclose([enhanced_run.silhouette, enhanced_run.davies_bouldin, enhanced_run.calinski_harabasz],
        [er["enhanced"]["metrics"][key] for key in ("silhouette", "davies_bouldin", "calinski_harabasz")], rtol=1e-12, atol=1e-12)
    assert all(sha(path) == expected for path, expected in before.items()), "A source artifact changed"
    lines.extend(["", "All assertions passed. Prepared inputs, stored jobs, results and partitions remain byte-for-byte unchanged.", ""])
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--standard-run", help="Completed full-study Standard job directory")
    parser.add_argument("--enhanced-run", help="Compatible completed Enhanced job directory")
    args = parser.parse_args()
    ignored = subprocess.run(["git", "check-ignore", "--quiet", str(OUTPUT.relative_to(ROOT))], cwd=ROOT,
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, **({"creationflags": subprocess.CREATE_NO_WINDOW} if os.name == "nt" else {}))
    assert ignored.returncode == 0, "Walkthrough output must remain git-ignored"
    report = walkthrough(args)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(report, encoding="utf-8")
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    print(report)
    print(f"Private UTF-8 copy: {OUTPUT}")


if __name__ == "__main__":
    main()
