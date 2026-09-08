"""Build isolated aggregate artifacts for the proposal-defense SOP evaluation.

This script does not participate in, modify, or consolidate the frozen official
clustering and longitudinal pipeline. It consumes validated intermediates and
creates aggregate-only evidence for the defense UI:

* SOP 1 changes only the representation: standardized variables versus retained PCs.
* SOP 2 retains PCA and changes baseline k selection versus NbClust.
* SOP 3 retains PCA and NbClust and changes random versus DPC initialization.

No participant identifiers, coordinates, assignments, or raw rows are written.
"""

from __future__ import annotations

import csv
import hashlib
import json
import math
import os
import sys
from pathlib import Path
from typing import Any, Iterable, Sequence

# Keep floating-point reductions byte-reproducible across regeneration runs.
for thread_variable in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS", "NUMEXPR_NUM_THREADS"):
    os.environ[thread_variable] = "1"

import numpy as np
from scipy.spatial.distance import pdist



ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "scripts" / "research" / "study_entry"))
from dpc_initialize_clusters import dpc_init, STUDY_CUTOFF_PERCENTILE
import run_enhanced_kmeans as final_enhanced
import run_baseline_kmeans_comparison as baseline

INTERIM = ROOT / "data" / "interim"

STANDARDIZED_PATH = INTERIM / "clustering_features_standardized.csv"
PCA_PATH = INTERIM / "clustering_pca_scores.csv"
PCA_VARIANCE_PATH = INTERIM / "clustering_pca_explained_variance.csv"
SOP1_REDUNDANCY_PATH = INTERIM / "sop1_redundancy_distance_summary.csv"
SOP1_ABLATION_PATH = INTERIM / "sop1_pca_ablation_summary.csv"
SOP2_CANDIDATES_PATH = INTERIM / "sop2_pca_k_candidates.csv"
SUMMARY_PATH = INTERIM / "sop_evaluation_summary.json"
RUNTIME_SUMMARY_PATH = ROOT / "apps" / "api" / "artifacts" / "sop_evaluation_summary.json"

IDENTIFIERS = ("PTID", "RID")
FEATURES = baseline.FEATURES
PCS = tuple(f"PC{number}" for number in range(1, 7))
EXPECTED_N = baseline.EXPECTED_SHAPE[0]
SEEDS = baseline.BASELINE_SEEDS
K_CANDIDATES = baseline.K_CANDIDATES
K_SELECTION_SEED = baseline.K_SELECTION_SEED
N_INIT = baseline.N_INIT
MAX_ITER = baseline.MAX_ITER
TOLERANCE = baseline.TOLERANCE
ALGORITHM = baseline.ALGORITHM
BASELINE_SELECTION = "maximum silhouette; ties choose smaller k"

# Cumulative workflow: downstream SOPs retain the previously introduced stages.
PIPELINES = (
    ("SOP1", "Existing", False, False, False),
    ("SOP1", "Enhanced", True, False, False),
    ("SOP2", "Existing", True, False, False),
    ("SOP2", "Enhanced", True, True, False),
    ("SOP3", "Existing", True, True, False),
    ("SOP3", "Enhanced", True, True, True),
)


def run_sequential_conditions(standardized, pca):
    """Retain PCA and then NbClust as each successive SOP changes one stage."""
    import select_cluster_count_nbclust as nbclust
    results = {}
    for name, matrix in (("Existing", standardized), ("Enhanced", pca)):
        k, candidates = baseline.select_baseline_k(matrix)
        results["SOP1", name] = dict(k=k, candidates=candidates,
            runs=baseline.run_baseline_replications(matrix, k))
        print(f"SOP1/{name}: baseline-selected k={k}", flush=True)
    results["SOP2", "Existing"] = results["SOP1", "Enhanced"]
    selection = nbclust.select_k_nbclust(pca.tolist())
    k = selection.selected_k
    print(f"PCA NbClust selected k={k}", flush=True)
    random = dict(k=k, selection=selection, runs=baseline.run_baseline_replications(pca, k))
    results["SOP2", "Enhanced"] = random
    results["SOP3", "Existing"] = random
    initializations = [dpc_init(pca.tolist(), k=k) for _ in range(3)]
    runs = [final_enhanced.run_enhanced_kmeans(pca, np.asarray(seeds.centroid_matrix), k)
            for seeds in initializations]
    if any(seeds.centroid_matrix != initializations[0].centroid_matrix for seeds in initializations[1:]):
        raise AssertionError("PCA DPC initialization did not reproduce")
    final_enhanced.validate_reproducibility(runs)
    results["SOP3", "Enhanced"] = dict(k=k, selection=selection, runs=runs,
                                        initializations=initializations)
    return results


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


def _condition_summary(
    name: str,
    dimensions: int,
    variance_retained: float,
    rows: Sequence[Any],
) -> dict[str, Any]:
    return {
        "representation": name,
        "dimensions": dimensions,
        "varianceRetained": variance_retained,
        "runCount": len(rows),
        "metrics": {
            metric: _describe([float(getattr(row, metric)) for row in rows]) for metric in METRICS
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


def _build_sop1(standardized: np.ndarray, pca: np.ndarray, control, enhanced) -> dict[str, Any]:
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

    variance_retained = _pca_variance_retained()
    baseline = _condition_summary("13 standardized features", 13, 1.0, control["runs"])
    pca_condition = _condition_summary("PC1-PC6", 6, variance_retained, enhanced["runs"])
    for condition, result in ((baseline, control), (pca_condition, enhanced)):
        condition["selectedK"] = result["k"]
        condition["baselineCandidates"] = [
            {"k": run.k, "silhouette": run.silhouette} for run in result["candidates"]]
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
                "k": control["k"],
                "kSelection": BASELINE_SELECTION,
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


def _build_nbclust_comparison(pca: np.ndarray, control, enhanced) -> dict[str, Any]:
    """Reuse both validated selectors and one common downstream Lloyd runner."""
    from dataclasses import asdict
    import run_baseline_kmeans_comparison as baseline
    import select_cluster_count_nbclust as nbclust

    baseline_k, candidates = control["k"], control["candidates"]
    matrix = pca.tolist()
    selection = enhanced["selection"]
    print(f"pca_space_nbclust_selected_k={selection.selected_k}; first_pass_complete=True", flush=True)
    repeated = nbclust.select_k_nbclust(matrix, expected_shape=(EXPECTED_N, len(PCS)))
    if selection != repeated:
        raise AssertionError("PCA-space NbClust selection did not reproduce exactly")
    print("pca_space_nbclust_reproducible=True", flush=True)

    control_runs = control["runs"]
    nbclust_runs = enhanced["runs"]
    if baseline_k == selection.selected_k and any(
        not np.array_equal(control.labels, enhanced.labels)
        for control, enhanced in zip(control_runs, nbclust_runs)
    ):
        raise AssertionError("Identical k and initialization must reproduce identical partitions")

    def summarize(k: int, runs: Sequence[Any]) -> dict[str, Any]:
        return {"selectedK": k, "representation": "PC1-PC6", "dimensions": 6,
                "runCount": len(runs),
                "metrics": {metric: _describe([float(getattr(run, metric)) for run in runs])
                            for metric in METRICS}}

    return {
        "settings": {
            "cohortN": EXPECTED_N, "representation": "PC1-PC6",
            "features": list(PCS), "pca": True, "dpc": False,
            "controlNbclust": False, "comparisonNbclust": True,
            "controlKSelection": "maximum silhouette; ties choose smaller k",
            "comparisonKSelection": "NbClust index voting; Chapter 3 rank-sum tie-break",
            "candidateK": list(K_CANDIDATES), "baselineSelectionSeed": baseline.K_SELECTION_SEED,
            "nbclustSelectionSeed": nbclust.RANDOM_SEED,
            "initialization": "random", "nInit": baseline.N_INIT, "maxIter": baseline.MAX_ITER,
            "tolerance": baseline.TOLERANCE, "algorithm": baseline.ALGORITHM,
            "randomSeeds": list(baseline.BASELINE_SEEDS), "inputSha256": _sha256(PCA_PATH),
        },
        "control": summarize(baseline_k, control_runs),
        "nbclustOnly": summarize(selection.selected_k, nbclust_runs),
        "baselineCandidates": [{"k": run.k, "silhouette": run.silhouette} for run in candidates],
        "selection": {
            "repeatedChecks": 2, "reproducible": True,
            "packageVersion": str(nbclust.ro.r('as.character(utils::packageVersion("NbClust"))')[0]),
            "usableIndices": sum(item.status == "success" for item in selection.index_results),
            "votesForSelectedK": dict(selection.vote_counts)[selection.selected_k],
            "voteDistribution": [{"k": k, "votes": count} for k, count in selection.vote_counts],
            "indexResults": [asdict(item) for item in selection.index_results],
            "leaders": list(selection.leaders), "tieBreakRows": list(selection.tie_break_rows),
        },
    }


def _candidate(run):
    return {"k": run.k, "clusterSizes": list(run.cluster_sizes),
            "silhouette": run.silhouette, "daviesBouldin": run.davies_bouldin,
            "calinskiHarabasz": run.calinski_harabasz,
            "inertia": run.inertia, "iterations": run.iterations}


def _build_sop2(pca, control, enhanced):
    controlled = _build_nbclust_comparison(pca, control, enhanced)
    candidates = [_candidate(run) for run in control["candidates"]]
    _write_csv(SOP2_CANDIDATES_PATH,
        ("k", "cluster_sizes", "silhouette", "davies_bouldin", "calinski_harabasz",
         "inertia", "iterations", "maximum_silhouette_selected"),
        ({"k": run.k, "cluster_sizes": "|".join(map(str, run.cluster_sizes)),
          **{metric: getattr(run, metric) for metric in (*METRICS, "inertia", "iterations")},
          "maximum_silhouette_selected": run.k == control["k"]}
         for run in control["candidates"]))
    return {
        "settings": {"cohortN": EXPECTED_N, "representation": "PC1-PC6",
            "seed": K_SELECTION_SEED, "initialization": "random", "nInit": N_INIT,
            "maxIter": MAX_ITER, "tolerance": TOLERANCE, "algorithm": ALGORITHM},
        "demonstratedK": [row for row in candidates if row["k"] in (2, 3, 5)],
        "candidates": candidates, "maximumSilhouetteSelectedK": control["k"],
        "nbclust": {"selectedK": enhanced["k"], **{key: controlled["selection"][key]
            for key in ("usableIndices", "votesForSelectedK", "voteDistribution")}},
        "controlledComparison": controlled,
    }


def _build_dpc_comparison(enhanced):
    run, seeds = enhanced["runs"][0], enhanced["initializations"][0]
    return {
        "settings": {
            "cohortN": EXPECTED_N, "representation": "PC1-PC6",
            "features": list(PCS), "pca": True, "nbclust": True,
            "k": enhanced["k"], "kSelection": "NbClust",
            "nInit": N_INIT, "maxIter": MAX_ITER, "tolerance": TOLERANCE,
            "algorithm": ALGORITHM, "controlInitialization": "random",
            "dpcInitialization": "deterministic DPC", "randomSeeds": list(SEEDS),
            "dpcRandomState": 0, "inputSha256": _sha256(PCA_PATH),
            "cutoffPercentile": STUDY_CUTOFF_PERCENTILE,
        },
        "repeatedChecks": len(enhanced["runs"]), "identicalInitialization": True,
        "identicalOutput": True, "clusterSizes": np.bincount(run.labels).tolist(),
        "iterations": run.iterations,
        "metrics": {"silhouette": run.silhouette, "daviesBouldin": run.davies_bouldin,
                    "calinskiHarabasz": run.calinski_harabasz},
        "selectedCentroids": [
            {"assignedCluster": position, "rho": seeds.rho[index],
             "delta": seeds.delta[index], "gamma": seeds.gamma[index]}
            for position, index in enumerate(seeds.selected_indices)],
    }


def _build_sop3(control, enhanced):
    runs = control["runs"]
    dpc = _build_dpc_comparison(enhanced)
    ari = [row["adjusted_rand_index"] for row in baseline._pairwise_ari(runs)]
    return {
        "settings": {"cohortN": EXPECTED_N, "representation": "PC1-PC6",
            "k": control["k"], "nInit": N_INIT, "maxIter": MAX_ITER,
            "tolerance": TOLERANCE, "algorithm": ALGORITHM, "randomSeeds": list(SEEDS)},
        "firstThreeRandomRuns": [
            {"runNumber": run.run_number, "seed": run.seed,
             **{key: value for key, value in _candidate(run).items() if key not in ("k", "inertia")}}
            for run in runs[:3]],
        "randomRunSummary": {metric: _describe([getattr(run, metric) for run in runs])
                             for metric in (*METRICS, "inertia", "iterations")},
        "partitionStability": {
            "distinctLabelInvariantPartitions": len({baseline.canonicalize_partition(run.labels) for run in runs}),
            "meanPairwiseAdjustedRandIndex": float(np.mean(ari)),
            "minimumPairwiseAdjustedRandIndex": float(np.min(ari)),
            "maximumPairwiseAdjustedRandIndex": float(np.max(ari))},
        "dpcDeterminism": {key: value for key, value in dpc.items()
                           if key not in ("settings", "selectedCentroids")},
        "controlledComparison": dpc,
    }


def _validate_preprocessing(standardized, pca):
    """Reproduce the common median/z-score input and existing retained-PC transform."""
    import preprocess_study_entry as prep
    retained = prep.build_retained_feature_table(prep.read_csv_as_text(prep.AUTHORITATIVE_INPUT))
    imputed, summary = prep.median_impute_features(retained)
    rebuilt, _, _ = prep.standardize_features(imputed, summary)
    scores, _, _, _, count = prep.apply_pca(rebuilt)
    keys = list(zip(rebuilt["PTID"].str.strip(), rebuilt["RID"].str.strip()))
    stored_keys, _ = _load_matrix(STANDARDIZED_PATH, FEATURES)
    if keys != stored_keys or count != len(PCS):
        raise AssertionError("Preprocessing cohort or retained PCA dimension drift")
    np.testing.assert_allclose(rebuilt.loc[:, FEATURES].to_numpy(), standardized, rtol=0, atol=1e-12)
    np.testing.assert_allclose(scores.loc[:, PCS].to_numpy(), pca, rtol=0, atol=1e-12)


def pipeline_manifest(sop1, sop2, sop3):
    """Attach the executable switch contract to the corresponding computed selections."""
    selected = [condition["selectedK"] for condition in sop1["ablation"]["conditions"]]
    selected += [sop2["maximumSilhouetteSelectedK"], sop2["nbclust"]["selectedK"],
                 sop3["settings"]["k"], sop3["controlledComparison"]["settings"]["k"]]
    return [
        {"sop": sop, "pipeline": pipeline, "pca": pca_on, "nbclust": nb_on,
         "dpc": dpc_on, "representation": "PC1-PC6" if pca_on else "13 standardized features",
         "selectedK": k, "kSelection": "NbClust" if nb_on else BASELINE_SELECTION}
        for (sop, pipeline, pca_on, nb_on, dpc_on), k in zip(PIPELINES, selected)]


def main() -> None:
    standardized_keys, standardized = _load_matrix(STANDARDIZED_PATH, FEATURES)
    if sys.argv[1:]:
        raise SystemExit("Regenerate the complete six-pipeline contract; no partial SOP updates")
    pca_keys, pca = _load_matrix(PCA_PATH, PCS)
    if standardized_keys != pca_keys:
        raise AssertionError("Standardized and PCA representations must share the ordered cohort")
    _validate_preprocessing(standardized, pca)
    results = run_sequential_conditions(standardized, pca)
    sop1 = _build_sop1(standardized, pca, results["SOP1", "Existing"], results["SOP1", "Enhanced"])
    sop2 = _build_sop2(pca, results["SOP2", "Existing"], results["SOP2", "Enhanced"])
    sop3 = _build_sop3(results["SOP3", "Existing"], results["SOP3", "Enhanced"])
    source_paths = (STANDARDIZED_PATH, PCA_PATH, PCA_VARIANCE_PATH,
                    INTERIM / "study_entry_cohort_unimputed.csv")
    payload = {
        "contractVersion": "sop-evaluation/v1",
        "scope": "Aggregate-only controlled evaluation; isolated from frozen official results",
        "cohortN": EXPECTED_N,
        "pipelines": pipeline_manifest(sop1, sop2, sop3),
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
