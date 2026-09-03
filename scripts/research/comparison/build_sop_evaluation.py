"""Build isolated aggregate artifacts for the proposal-defense SOP evaluation.

This script does not participate in, modify, or consolidate the frozen official
clustering and longitudinal pipeline. It consumes validated intermediates and
creates aggregate-only evidence for the defense UI:

* SOP 1 reuses the matched 30-run random-initialization outputs in the original
  standardized space and PC1--PC6, then adds correlation and distance summaries.
* SOP 2 runs the missing controlled k=2..10 demonstration in the frozen PCA
  representation with a single fixed random initialization.
* SOP 3 summarizes the existing controlled random-vs-DPC initialization outputs.

No participant identifiers, coordinates, assignments, or raw rows are written.
"""

from __future__ import annotations

import csv
import hashlib
import json
import math
import os
from pathlib import Path
from typing import Any, Iterable, Sequence

# Keep floating-point reductions byte-reproducible across regeneration runs.
for thread_variable in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS", "NUMEXPR_NUM_THREADS"):
    os.environ[thread_variable] = "1"

import numpy as np
from scipy.spatial.distance import pdist
from sklearn.cluster import KMeans
from sklearn.metrics import (
    calinski_harabasz_score,
    davies_bouldin_score,
    silhouette_score,
)


ROOT = Path(__file__).resolve().parents[3]
INTERIM = ROOT / "data" / "interim"

STANDARDIZED_PATH = INTERIM / "clustering_features_standardized.csv"
PCA_PATH = INTERIM / "clustering_pca_scores.csv"
PCA_VARIANCE_PATH = INTERIM / "clustering_pca_explained_variance.csv"
BASELINE_RUNS_PATH = INTERIM / "baseline_kmeans_runs.csv"
PCA_RANDOM_RUNS_PATH = INTERIM / "dpc_comparison_random_runs.csv"
PCA_RANDOM_SUMMARY_PATH = INTERIM / "dpc_comparison_random_summary.csv"
PCA_RANDOM_STABILITY_PATH = INTERIM / "dpc_comparison_random_stability.csv"
NBCLUST_SUMMARY_PATH = INTERIM / "clustering_nbclust_summary.csv"
SELECTED_K_PATH = INTERIM / "clustering_selected_k.csv"
DPC_DETERMINISM_PATH = INTERIM / "clustering_dpc_determinism_check.csv"
ENHANCED_METRICS_PATH = INTERIM / "enhanced_kmeans_metrics.csv"
ENHANCED_SUMMARY_PATH = INTERIM / "enhanced_kmeans_run_summary.csv"

SOP1_REDUNDANCY_PATH = INTERIM / "sop1_redundancy_distance_summary.csv"
SOP1_ABLATION_PATH = INTERIM / "sop1_pca_ablation_summary.csv"
SOP2_CANDIDATES_PATH = INTERIM / "sop2_pca_k_candidates.csv"
SUMMARY_PATH = INTERIM / "sop_evaluation_summary.json"
RUNTIME_SUMMARY_PATH = ROOT / "apps" / "api" / "artifacts" / "sop_evaluation_summary.json"

IDENTIFIERS = ("PTID", "RID")
FEATURES = (
    "MMSE",
    "ADAS13",
    "LMI",
    "LMD",
    "TMT_A",
    "TMT_B",
    "CATEGORY_FLUENCY_ANIMALS",
    "RAVLT_IMMEDIATE",
    "RAVLT_DELAYED",
    "RAVLT_FORGETTING",
    "CDRSB",
    "FAQ",
    "GDS",
)
PCS = tuple(f"PC{number}" for number in range(1, 7))
EXPECTED_N = 2437
SEEDS = tuple(range(30))
K_CANDIDATES = tuple(range(2, 11))
K_SELECTION_SEED = 0
N_INIT = 1
MAX_ITER = 300
TOLERANCE = 1e-4
ALGORITHM = "lloyd"
METRICS = ("silhouette", "davies_bouldin", "calinski_harabasz")


def _read_csv(path: Path) -> list[dict[str, str]]:
    if not path.is_file():
        raise FileNotFoundError(path)
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def _load_matrix(path: Path, columns: Sequence[str]) -> tuple[list[tuple[str, str]], np.ndarray]:
    rows = _read_csv(path)
    if len(rows) != EXPECTED_N:
        raise AssertionError(f"{path.name} has {len(rows)} rows; expected {EXPECTED_N}")
    expected_columns = [*IDENTIFIERS, *columns]
    if rows and list(rows[0]) != expected_columns:
        raise AssertionError(f"{path.name} columns differ from the locked contract")
    participant_keys = [(row["PTID"].strip(), row["RID"].strip()) for row in rows]
    if any(not ptid or not rid for ptid, rid in participant_keys):
        raise AssertionError(f"{path.name} contains a blank participant key")
    if len(set(participant_keys)) != EXPECTED_N:
        raise AssertionError(f"{path.name} participant keys are not unique")
    matrix = np.asarray([[float(row[column]) for column in columns] for row in rows])
    if matrix.shape != (EXPECTED_N, len(columns)) or not np.isfinite(matrix).all():
        raise AssertionError(f"{path.name} has an invalid matrix")
    return participant_keys, matrix


def _write_csv(path: Path, fieldnames: Iterable[str], rows: Iterable[dict[str, Any]]) -> None:
    columns = list(fieldnames)
    temporary = path.with_suffix(path.suffix + ".tmp")
    with temporary.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns, extrasaction="raise")
        writer.writeheader()
        writer.writerows(rows)
    os.replace(temporary, path)


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    with temporary.open("w", encoding="utf-8", newline="\n") as handle:
        json.dump(payload, handle, indent=2, sort_keys=False, allow_nan=False)
        handle.write("\n")
    os.replace(temporary, path)


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _describe(values: Sequence[float]) -> dict[str, float]:
    numeric = np.asarray(values, dtype=np.float64)
    if numeric.size == 0 or not np.isfinite(numeric).all():
        raise AssertionError("Cannot summarize empty or non-finite values")
    return {
        "mean": float(np.mean(numeric)),
        "standardDeviation": float(np.std(numeric, ddof=1)),
        "minimum": float(np.min(numeric)),
        "maximum": float(np.max(numeric)),
    }


def _distance_summary(name: str, matrix: np.ndarray) -> dict[str, Any]:
    distances = pdist(matrix, metric="euclidean")
    if not np.isfinite(distances).all() or np.any(distances <= 0):
        raise AssertionError(f"{name} pairwise distances are invalid")
    q05, median, q95 = np.quantile(distances, [0.05, 0.5, 0.95], method="linear")
    mean = float(np.mean(distances))
    standard_deviation = float(np.std(distances, ddof=1))
    return {
        "representation": name,
        "dimensions": int(matrix.shape[1]),
        "pairCount": int(distances.size),
        "mean": mean,
        "standardDeviation": standard_deviation,
        "coefficientOfVariation": standard_deviation / mean,
        "fifthPercentile": float(q05),
        "median": float(median),
        "ninetyFifthPercentile": float(q95),
    }


def _validate_run_protocol(rows: Sequence[dict[str, str]], k_field: str) -> None:
    if len(rows) != len(SEEDS):
        raise AssertionError("Controlled run artifact must contain exactly 30 rows")
    for expected_number, (expected_seed, row) in enumerate(zip(SEEDS, rows), start=1):
        expected = {
            "run_number": str(expected_number),
            "seed": str(expected_seed),
            k_field: "2",
            "init": "random",
            "n_init": str(N_INIT),
            "max_iter": str(MAX_ITER),
            "tol": str(TOLERANCE),
            "algorithm": ALGORITHM,
        }
        if any(row.get(key) != value for key, value in expected.items()):
            raise AssertionError(f"Controlled run protocol mismatch at seed {expected_seed}")


def _cluster_sizes(value: str) -> list[int]:
    sizes = [int(part.split(":", 1)[1]) for part in value.split("|")]
    if sum(sizes) != EXPECTED_N:
        raise AssertionError("Cluster sizes do not sum to the frozen cohort")
    return sizes


def _condition_summary(
    name: str,
    dimensions: int,
    variance_retained: float,
    rows: Sequence[dict[str, str]],
) -> dict[str, Any]:
    return {
        "representation": name,
        "dimensions": dimensions,
        "varianceRetained": variance_retained,
        "runCount": len(rows),
        "metrics": {
            metric: _describe([float(row[metric]) for row in rows]) for metric in METRICS
        },
    }


def _pca_variance_retained() -> float:
    rows = _read_csv(PCA_VARIANCE_PATH)
    retained = [row for row in rows if row.get("retained_for_85_percent") == "True"]
    if len(retained) != 6:
        raise AssertionError("The frozen PCA artifact must retain exactly six components")
    value = float(retained[-1]["cumulative_explained_variance"])
    if not math.isclose(value, 0.8747945923377831, rel_tol=0, abs_tol=1e-15):
        raise AssertionError("Frozen six-PC explained variance changed")
    return value


def _build_sop1(standardized: np.ndarray, pca: np.ndarray) -> dict[str, Any]:
    correlation = np.corrcoef(standardized, rowvar=False)
    upper = np.triu_indices(len(FEATURES), k=1)
    pairs = [
        {
            "featureA": FEATURES[left],
            "featureB": FEATURES[right],
            "correlation": float(correlation[left, right]),
            "absoluteCorrelation": float(abs(correlation[left, right])),
        }
        for left, right in zip(*upper)
    ]
    pairs.sort(key=lambda pair: (-pair["absoluteCorrelation"], pair["featureA"], pair["featureB"]))
    absolute = np.asarray([pair["absoluteCorrelation"] for pair in pairs])
    redundancy = {
        "featureCount": len(FEATURES),
        "pairCount": len(pairs),
        "meanAbsoluteCorrelation": float(np.mean(absolute)),
        "medianAbsoluteCorrelation": float(np.median(absolute)),
        "maximumAbsoluteCorrelation": float(np.max(absolute)),
        "pairsAtOrAbove050": int(np.count_nonzero(absolute >= 0.50)),
        "pairsAtOrAbove070": int(np.count_nonzero(absolute >= 0.70)),
        "topCorrelatedPairs": pairs[:8],
    }
    distances = [
        _distance_summary("13 standardized features", standardized),
        _distance_summary("6 principal components", pca),
    ]

    baseline_rows = _read_csv(BASELINE_RUNS_PATH)
    pca_rows = _read_csv(PCA_RANDOM_RUNS_PATH)
    _validate_run_protocol(baseline_rows, "baseline_k")
    _validate_run_protocol(pca_rows, "k")
    variance_retained = _pca_variance_retained()
    baseline = _condition_summary("13 standardized features", 13, 1.0, baseline_rows)
    pca_condition = _condition_summary("PC1-PC6", 6, variance_retained, pca_rows)
    metric_changes = {
        metric: {
            "absoluteMeanChange": pca_condition["metrics"][metric]["mean"]
            - baseline["metrics"][metric]["mean"],
            "relativeMeanChangePercent": 100.0
            * (pca_condition["metrics"][metric]["mean"] - baseline["metrics"][metric]["mean"])
            / abs(baseline["metrics"][metric]["mean"]),
        }
        for metric in METRICS
    }

    _write_csv(
        SOP1_REDUNDANCY_PATH,
        ("section", "name", "value", "detail"),
        [
            {"section": "correlation", "name": key, "value": value, "detail": ""}
            for key, value in redundancy.items()
            if key != "topCorrelatedPairs"
        ]
        + [
            {
                "section": "top_correlation_pair",
                "name": f"{pair['featureA']}|{pair['featureB']}",
                "value": pair["correlation"],
                "detail": pair["absoluteCorrelation"],
            }
            for pair in redundancy["topCorrelatedPairs"]
        ]
        + [
            {
                "section": "distance",
                "name": f"{item['representation']}|{key}",
                "value": value,
                "detail": "",
            }
            for item in distances
            for key, value in item.items()
            if key != "representation"
        ],
    )
    _write_csv(
        SOP1_ABLATION_PATH,
        (
            "representation", "dimensions", "variance_retained", "run_count", "metric",
            "mean", "standard_deviation", "minimum", "maximum", "absolute_mean_change_from_13d",
            "relative_mean_change_percent_from_13d",
        ),
        (
            {
                "representation": condition["representation"],
                "dimensions": condition["dimensions"],
                "variance_retained": condition["varianceRetained"],
                "run_count": condition["runCount"],
                "metric": metric,
                "mean": condition["metrics"][metric]["mean"],
                "standard_deviation": condition["metrics"][metric]["standardDeviation"],
                "minimum": condition["metrics"][metric]["minimum"],
                "maximum": condition["metrics"][metric]["maximum"],
                "absolute_mean_change_from_13d": 0.0 if index == 0 else metric_changes[metric]["absoluteMeanChange"],
                "relative_mean_change_percent_from_13d": 0.0 if index == 0 else metric_changes[metric]["relativeMeanChangePercent"],
            }
            for index, condition in enumerate((baseline, pca_condition))
            for metric in METRICS
        ),
    )
    return {
        "redundancy": redundancy,
        "distanceBehavior": distances,
        "ablation": {
            "settings": {
                "cohortN": EXPECTED_N,
                "k": 2,
                "initialization": "random",
                "nInit": N_INIT,
                "maxIter": MAX_ITER,
                "tolerance": TOLERANCE,
                "algorithm": ALGORITHM,
                "seeds": list(SEEDS),
            },
            "conditions": [baseline, pca_condition],
            "metricChanges": metric_changes,
        },
    }


def _build_sop2(pca: np.ndarray) -> dict[str, Any]:
    candidates: list[dict[str, Any]] = []
    for k in K_CANDIDATES:
        model = KMeans(
            n_clusters=k,
            init="random",
            n_init=N_INIT,
            random_state=K_SELECTION_SEED,
            max_iter=MAX_ITER,
            tol=TOLERANCE,
            algorithm=ALGORITHM,
        )
        labels = np.asarray(model.fit_predict(pca), dtype=np.int64)
        sizes = [int(np.count_nonzero(labels == label)) for label in range(k)]
        row = {
            "k": k,
            "clusterSizes": sizes,
            "silhouette": float(silhouette_score(pca, labels, metric="euclidean")),
            "daviesBouldin": float(davies_bouldin_score(pca, labels)),
            "calinskiHarabasz": float(calinski_harabasz_score(pca, labels)),
            "inertia": float(model.inertia_),
            "iterations": int(model.n_iter_),
        }
        if sum(sizes) != EXPECTED_N or not all(math.isfinite(value) for key, value in row.items() if key not in {"k", "clusterSizes"}):
            raise AssertionError(f"Invalid PCA candidate result for k={k}")
        candidates.append(row)
    silhouette_selected_k = min(candidates, key=lambda row: (-row["silhouette"], row["k"]))["k"]

    vote_rows = _read_csv(NBCLUST_SUMMARY_PATH)
    votes = [
        {"k": int(row["k"]), "votes": int(row["vote_count"])} for row in vote_rows
    ]
    selection_rows = _read_csv(SELECTED_K_PATH)
    if len(selection_rows) != 1:
        raise AssertionError("Expected one frozen selected-k row")
    selection = selection_rows[0]
    nbclust_selected_k = int(selection["selected_k"])
    usable_votes = int(selection["total_usable_indices"])
    selected_votes = next(item["votes"] for item in votes if item["k"] == nbclust_selected_k)
    if (silhouette_selected_k, nbclust_selected_k, usable_votes, selected_votes) != (2, 2, 24, 9):
        raise AssertionError("SOP 2 selections differ from the frozen result")

    _write_csv(
        SOP2_CANDIDATES_PATH,
        ("k", "cluster_sizes", "silhouette", "davies_bouldin", "calinski_harabasz", "inertia", "iterations", "maximum_silhouette_selected"),
        (
            {
                "k": row["k"],
                "cluster_sizes": "|".join(str(size) for size in row["clusterSizes"]),
                "silhouette": row["silhouette"],
                "davies_bouldin": row["daviesBouldin"],
                "calinski_harabasz": row["calinskiHarabasz"],
                "inertia": row["inertia"],
                "iterations": row["iterations"],
                "maximum_silhouette_selected": row["k"] == silhouette_selected_k,
            }
            for row in candidates
        ),
    )
    return {
        "settings": {
            "cohortN": EXPECTED_N,
            "representation": "PC1-PC6",
            "seed": K_SELECTION_SEED,
            "initialization": "random",
            "nInit": N_INIT,
            "maxIter": MAX_ITER,
            "tolerance": TOLERANCE,
            "algorithm": ALGORITHM,
        },
        "demonstratedK": [next(row for row in candidates if row["k"] == k) for k in (2, 3, 5)],
        "candidates": candidates,
        "maximumSilhouetteSelectedK": silhouette_selected_k,
        "nbclust": {
            "selectedK": nbclust_selected_k,
            "usableIndices": usable_votes,
            "votesForSelectedK": selected_votes,
            "voteDistribution": votes,
        },
    }


def _build_sop3() -> dict[str, Any]:
    runs = _read_csv(PCA_RANDOM_RUNS_PATH)
    _validate_run_protocol(runs, "k")
    first_three = [
        {
            "runNumber": int(row["run_number"]),
            "seed": int(row["seed"]),
            "clusterSizes": _cluster_sizes(row["cluster_sizes"]),
            "silhouette": float(row["silhouette"]),
            "daviesBouldin": float(row["davies_bouldin"]),
            "calinskiHarabasz": float(row["calinski_harabasz"]),
            "iterations": int(row["iterations"]),
        }
        for row in runs[:3]
    ]
    summary_rows = _read_csv(PCA_RANDOM_SUMMARY_PATH)
    summary = {
        row["metric"]: {
            "mean": float(row["mean"]),
            "standardDeviation": float(row["standard_deviation_ddof_1"]),
            "minimum": float(row["minimum"]),
            "maximum": float(row["maximum"]),
        }
        for row in summary_rows
    }
    stability_rows = _read_csv(PCA_RANDOM_STABILITY_PATH)
    stability = {
        row["statistic"]: float(row["value"])
        for row in stability_rows
        if row["record_type"] == "summary"
    }
    partition_rows = [
        row for row in stability_rows
        if row["record_type"] == "summary" and row["statistic"] == "distinct_label_invariant_partitions"
    ]
    if len(partition_rows) != 1 or "label permutations share one canonical tuple" not in partition_rows[0]["canonicalization_method"]:
        raise AssertionError("SOP 3 partition count is not explicitly label-invariant")
    determinism = _read_csv(DPC_DETERMINISM_PATH)
    if len(determinism) != 3 or any(row["overall_pass"] != "True" for row in determinism):
        raise AssertionError("DPC determinism checks did not pass three times")
    metric_rows = _read_csv(ENHANCED_METRICS_PATH)
    metric_lookup = {row["metric"]: float(row["value"]) for row in metric_rows}
    enhanced_summary = {row["metric"]: row["value"] for row in _read_csv(ENHANCED_SUMMARY_PATH)}
    return {
        "settings": {
            "cohortN": EXPECTED_N,
            "representation": "PC1-PC6",
            "k": 2,
            "nInit": N_INIT,
            "maxIter": MAX_ITER,
            "tolerance": TOLERANCE,
            "algorithm": ALGORITHM,
            "randomSeeds": list(SEEDS),
        },
        "firstThreeRandomRuns": first_three,
        "randomRunSummary": summary,
        "partitionStability": {
            "distinctLabelInvariantPartitions": int(stability["distinct_label_invariant_partitions"]),
            "meanPairwiseAdjustedRandIndex": stability["mean_pairwise_ari"],
            "minimumPairwiseAdjustedRandIndex": stability["minimum_pairwise_ari"],
            "maximumPairwiseAdjustedRandIndex": stability["maximum_pairwise_ari"],
        },
        "dpcDeterminism": {
            "repeatedChecks": len(determinism),
            "identicalInitialization": all(row["centroid_matrix_exact"] == "True" for row in determinism),
            "identicalOutput": all(row["overall_pass"] == "True" for row in determinism),
            "clusterSizes": [int(enhanced_summary["cluster_0_size"]), int(enhanced_summary["cluster_1_size"])],
            "iterations": int(enhanced_summary["iterations"]),
            "metrics": {
                "silhouette": metric_lookup["silhouette_coefficient"],
                "daviesBouldin": metric_lookup["davies_bouldin_index"],
                "calinskiHarabasz": metric_lookup["calinski_harabasz_index"],
            },
        },
    }


def main() -> None:
    standardized_keys, standardized = _load_matrix(STANDARDIZED_PATH, FEATURES)
    pca_keys, pca = _load_matrix(PCA_PATH, PCS)
    if standardized_keys != pca_keys:
        raise AssertionError("The standardized and PCA representations do not contain the same ordered cohort")
    sop1 = _build_sop1(standardized, pca)
    sop2 = _build_sop2(pca)
    sop3 = _build_sop3()
    source_paths = (
        STANDARDIZED_PATH, PCA_PATH, PCA_VARIANCE_PATH, BASELINE_RUNS_PATH,
        PCA_RANDOM_RUNS_PATH, PCA_RANDOM_SUMMARY_PATH, PCA_RANDOM_STABILITY_PATH,
        NBCLUST_SUMMARY_PATH, SELECTED_K_PATH, DPC_DETERMINISM_PATH,
        ENHANCED_METRICS_PATH, ENHANCED_SUMMARY_PATH,
    )
    payload = {
        "contractVersion": "sop-evaluation/v1",
        "scope": "Aggregate-only controlled evaluation; isolated from frozen official results",
        "cohortN": EXPECTED_N,
        "sop1": sop1,
        "sop2": sop2,
        "sop3": sop3,
        "provenance": {
            "officialResultsModified": False,
            "participantLevelOutput": False,
            "sourceSha256": {str(path.relative_to(ROOT)).replace("\\", "/"): _sha256(path) for path in source_paths},
        },
    }
    _write_json(SUMMARY_PATH, payload)
    _write_json(RUNTIME_SUMMARY_PATH, payload)
    print(f"wrote={SOP1_REDUNDANCY_PATH.relative_to(ROOT)}")
    print(f"wrote={SOP1_ABLATION_PATH.relative_to(ROOT)}")
    print(f"wrote={SOP2_CANDIDATES_PATH.relative_to(ROOT)}")
    print(f"wrote={SUMMARY_PATH.relative_to(ROOT)}")
    print(f"wrote={RUNTIME_SUMMARY_PATH.relative_to(ROOT)}")
    print("official_results_modified=False")
    print("participant_level_output=False")


if __name__ == "__main__":
    main()
