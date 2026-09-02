"""SOP 2 Axis B k-selection on the raw one-dimensional ADAS13 slope.

This script audits all 26 standard NbClust 3.0.1 indices individually on k=2
through k=10, records one-dimensional incompatibilities without substitution,
and calculates secondary deterministic diagnostic metrics. It does not run PCA,
standardize slopes, select DPC seeds, fit the final model, or save assignments.
"""

from __future__ import annotations

import hashlib
import importlib.metadata
import json
import math
import os
import shutil
import sys
from collections import Counter
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[4]
INPUT_PATH = ROOT / "data" / "legacy" / "old_longitudinal_clustering" / "axis_b_adas13_slopes.csv"
OUTPUT_PATH = ROOT / "data" / "legacy" / "old_longitudinal_clustering" / "axis_b_nbclust_k_selection.json"
EXPECTED_INPUT_SHA256 = "22cdd55303a873d62889a40190caf061f95c4ed81d7d7c82eb8f454886ed0280"
EXPECTED_ROWS = 1917
FEATURE = "beta1_slope_points_per_year"
CANDIDATE_K = tuple(range(2, 11))
DISTANCE = "euclidean"
METHOD = "kmeans"
RANDOM_SEED = 20260811

PCA_STATEMENT = (
    "PCA is not applicable to Axis B because the clustering representation "
    "contains exactly one progression-rate feature, so there is no multivariate "
    "dimensionality to reduce."
)

# Same standard index="all" set used by completed Axis A SOP 2. GAP, Gamma,
# Gplus, and Tau remain excluded because they belong only to "alllong".
NBCLUST_INDICES = (
    "kl", "ch", "hartigan", "ccc", "scott", "marriot", "trcovw", "tracew",
    "friedman", "rubin", "cindex", "db", "silhouette", "duda", "pseudot2",
    "beale", "ratkowsky", "ball", "ptbiserial", "frey", "mcclain", "dunn",
    "hubert", "sdindex", "dindex", "sdbw",
)


def _bootstrap_r_runtime() -> dict[str, str]:
    """Apply a process-local R DLL-path correction before importing rpy2."""
    r_executable = shutil.which("R.exe") or shutil.which("R")
    if not r_executable:
        raise RuntimeError("R executable is not available on PATH")
    r_home = Path(r_executable).resolve().parents[1]
    r_x64 = r_home / "bin" / "x64"
    if not (r_x64 / "R.dll").is_file():
        raise RuntimeError(f"R.dll was not found under {r_x64}")
    os.environ["R_HOME"] = str(r_home)
    path_entries = os.environ.get("PATH", "").split(os.pathsep)
    if str(r_x64) not in path_entries:
        os.environ["PATH"] = str(r_x64) + os.pathsep + os.environ.get("PATH", "")
    return {"r_executable": str(Path(r_executable).resolve()), "r_home": str(r_home), "r_x64": str(r_x64)}


R_BOOTSTRAP = _bootstrap_r_runtime()

import numpy as np
import pandas as pd
import rpy2.robjects as ro
from rpy2.robjects.packages import importr
from sklearn.cluster import KMeans
from sklearn.metrics import calinski_harabasz_score, davies_bouldin_score, silhouette_score


@dataclass(frozen=True)
class IndexResult:
    index: str
    status: str
    usable_vote: bool
    recommended_k: int | None
    criterion_value: float | None
    criterion_finite: bool | None
    reason: str
    warnings: str


def file_hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def validate_and_load_input() -> tuple[pd.DataFrame, np.ndarray, dict[str, Any]]:
    if not INPUT_PATH.is_file():
        raise FileNotFoundError(INPUT_PATH)
    input_hash = file_hash(INPUT_PATH)
    if input_hash != EXPECTED_INPUT_SHA256:
        raise AssertionError(f"Slope input hash changed: {input_hash}")
    frame = pd.read_csv(INPUT_PATH, dtype={"PTID": str, "RID": str}, low_memory=False)
    if FEATURE not in frame.columns:
        raise KeyError(FEATURE)
    if len(frame) != EXPECTED_ROWS or frame["PTID"].nunique() != EXPECTED_ROWS:
        raise AssertionError(
            f"Slope input does not reconcile: rows={len(frame)}, PTID={frame['PTID'].nunique()}"
        )
    if frame["RID"].nunique() != EXPECTED_ROWS:
        raise AssertionError("RID is not unique in the slope input")
    slopes = pd.to_numeric(frame[FEATURE], errors="raise").to_numpy(np.float64)
    if not np.isfinite(slopes).all():
        raise AssertionError("Slope input contains non-finite beta1 values")
    matrix = slopes.reshape(-1, 1)
    duplicated = pd.Series(slopes).value_counts()
    duplicate_groups = duplicated.loc[duplicated.gt(1)]
    q1, median, q3 = np.quantile(slopes, [0.25, 0.5, 0.75])
    context = {
        "input_sha256": input_hash,
        "participant_rows": int(len(frame)),
        "unique_PTID": int(frame["PTID"].nunique()),
        "unique_RID": int(frame["RID"].nunique()),
        "input_shape": [int(matrix.shape[0]), int(matrix.shape[1])],
        "feature_columns_used": [FEATURE],
        "all_values_finite": True,
        "minimum": float(slopes.min()),
        "median": float(median),
        "mean": float(slopes.mean()),
        "maximum": float(slopes.max()),
        "standard_deviation_sample_ddof_1": float(slopes.std(ddof=1)),
        "interquartile_range": float(q3 - q1),
        "unique_slope_values": int(duplicated.size),
        "duplicate_slope_values_exist": bool(len(duplicate_groups)),
        "duplicate_value_groups": int(len(duplicate_groups)),
        "participants_in_duplicate_value_groups": int(duplicate_groups.sum()),
        "maximum_duplicate_value_multiplicity": int(duplicate_groups.max()) if len(duplicate_groups) else 1,
        "slopes_altered_jittered_or_excluded": False,
        "standardized": False,
    }
    return frame, matrix, context


def environment_validation() -> dict[str, Any]:
    stats_package = importr("stats")
    nbclust_package = importr("NbClust")
    cluster_package = importr("cluster")
    python_to_r = int(ro.r("as.integer(6L * 7L)")[0])
    small_matrix = ro.r(
        "matrix(c(0,0, 0,1, 1,0, 1,1, 8,8, 8,9, 9,8, 9,9, "
        "16,0, 16,1, 17,0, 17,1), ncol=2, byrow=TRUE)"
    )
    small = nbclust_package.NbClust(
        small_matrix,
        distance="euclidean",
        min_nc=2,
        max_nc=3,
        method="kmeans",
        index="silhouette",
    )
    small_k = int(small.rx2("Best.nc")[0])
    result = {
        **R_BOOTSTRAP,
        "python_executable": str(Path(sys.executable).resolve()),
        "project_venv_active": Path(sys.prefix).resolve() == (ROOT / ".venv").resolve(),
        "r_version": str(ro.r("paste(R.version$major, R.version$minor, sep='.')")[0]),
        "rpy2_version": importlib.metadata.version("rpy2"),
        "nbclust_version": str(ro.r("as.character(utils::packageVersion('NbClust'))")[0]),
        "stats_import": stats_package is not None,
        "cluster_import": cluster_package is not None,
        "nbclust_import": nbclust_package is not None,
        "python_to_r_result_6_times_7": python_to_r,
        "small_matrix_nbclust_k": small_k,
        "small_matrix_execution": "PASS",
        "process_local_runtime_correction": "R_HOME set and R bin/x64 prepended to PATH",
        "system_configuration_changed": False,
    }
    if (
        not result["project_venv_active"]
        or python_to_r != 42
        or small_k not in (2, 3)
        or result["nbclust_version"] != "3.0.1"
    ):
        raise AssertionError(f"R/rpy2/NbClust environment gate failed: {result}")
    return result


def install_r_wrapper() -> None:
    ro.r(
        r'''
        .axis_b_run_nb_index <- function(data, index_name, seed) {
          warnings_seen <- character()
          plot_file <- tempfile(fileext = ".pdf")
          grDevices::pdf(plot_file)
          on.exit({
            if (grDevices::dev.cur() > 1L) grDevices::dev.off()
            unlink(plot_file)
          }, add = TRUE)

          result <- NULL
          error_seen <- NULL
          invisible(capture.output({
            result <- withCallingHandlers(
              tryCatch({
                set.seed(seed)
                NbClust::NbClust(
                  data = data,
                  distance = "euclidean",
                  min.nc = 2,
                  max.nc = 10,
                  method = "kmeans",
                  index = index_name
                )
              }, error = function(e) {
                error_seen <<- conditionMessage(e)
                NULL
              }),
              warning = function(w) {
                warnings_seen <<- c(warnings_seen, conditionMessage(w))
                invokeRestart("muffleWarning")
              }
            )
          }, type = "output"))

          warning_text <- paste(unique(warnings_seen), collapse = " | ")
          if (!is.null(error_seen)) {
            return(list(status = "error", recommended_k = NA_integer_,
                        criterion_value = NA_real_, criterion_finite = NA,
                        reason = error_seen, warnings = warning_text))
          }
          if (is.null(result$Best.nc) || length(result$Best.nc) < 1L) {
            graphical <- index_name %in% c("hubert", "dindex")
            return(list(
              status = if (graphical) "graphical_non_numerical" else "undefined_no_recommendation",
              recommended_k = NA_integer_, criterion_value = NA_real_,
              criterion_finite = NA,
              reason = paste0("NbClust completed index '", index_name,
                              "' but returned no Best.nc numerical recommendation."),
              warnings = warning_text
            ))
          }
          best <- suppressWarnings(as.numeric(result$Best.nc))
          recommended_k <- suppressWarnings(as.integer(best[1L]))
          criterion_value <- if (length(best) >= 2L) best[2L] else NA_real_
          criterion_finite <- is.finite(criterion_value)
          if (is.na(recommended_k) || !(recommended_k %in% 2:10)) {
            return(list(
              status = "nonfinite_or_invalid_recommendation",
              recommended_k = NA_integer_, criterion_value = criterion_value,
              criterion_finite = criterion_finite,
              reason = paste0("NbClust returned invalid Best.nc: ", paste(best, collapse = ", ")),
              warnings = warning_text
            ))
          }
          list(status = "success_numeric_recommendation",
               recommended_k = recommended_k,
               criterion_value = criterion_value,
               criterion_finite = criterion_finite,
               reason = if (criterion_finite) "" else "Recommendation is numerical; criterion value is non-finite.",
               warnings = warning_text)
        }
        '''
    )


def as_r_matrix(matrix: np.ndarray) -> ro.vectors.Matrix:
    return ro.r["matrix"](
        ro.FloatVector(matrix.ravel(order="C")),
        nrow=matrix.shape[0],
        ncol=1,
        byrow=True,
    )


def scalar(result: ro.vectors.ListVector, name: str) -> Any:
    return result.rx2(name)[0]


def run_index(r_matrix: ro.vectors.Matrix, index: str) -> IndexResult:
    result = ro.globalenv[".axis_b_run_nb_index"](r_matrix, index, RANDOM_SEED)
    status = str(scalar(result, "status"))
    recommended_raw = scalar(result, "recommended_k")
    criterion_raw = scalar(result, "criterion_value")
    finite_raw = scalar(result, "criterion_finite")
    recommended = None if ro.r["is.na"](recommended_raw)[0] else int(recommended_raw)
    criterion = None if ro.r["is.na"](criterion_raw)[0] else float(criterion_raw)
    criterion_finite = None if ro.r["is.na"](finite_raw)[0] else bool(finite_raw)
    return IndexResult(
        index=index,
        status=status,
        usable_vote=status == "success_numeric_recommendation" and recommended is not None,
        recommended_k=recommended,
        criterion_value=criterion,
        criterion_finite=criterion_finite,
        reason=str(scalar(result, "reason")),
        warnings=str(scalar(result, "warnings")),
    )


def run_nbclust_pass(matrix: np.ndarray) -> tuple[IndexResult, ...]:
    install_r_wrapper()
    r_matrix = as_r_matrix(matrix)
    return tuple(run_index(r_matrix, index) for index in NBCLUST_INDICES)


def diagnostic_metrics(matrix: np.ndarray) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for k in CANDIDATE_K:
        model = KMeans(
            n_clusters=k,
            init="k-means++",
            n_init=50,
            max_iter=300,
            algorithm="lloyd",
            random_state=RANDOM_SEED,
        )
        labels = model.fit_predict(matrix)
        rows.append({
            "k": k,
            "silhouette": float(silhouette_score(matrix, labels, metric="euclidean")),
            "calinski_harabasz": float(calinski_harabasz_score(matrix, labels)),
            "davies_bouldin": float(davies_bouldin_score(matrix, labels)),
            "inertia": float(model.inertia_),
            "iterations": int(model.n_iter_),
        })
    return rows


def main() -> None:
    input_hash_before = file_hash(INPUT_PATH)
    _, matrix, input_context = validate_and_load_input()
    environment = environment_validation()
    first = run_nbclust_pass(matrix)
    second = run_nbclust_pass(matrix)
    reproducible = first == second

    usable = [result for result in first if result.usable_vote]
    if not usable:
        raise RuntimeError("NbClust produced zero usable numerical recommendations in one dimension")
    counts = Counter(result.recommended_k for result in usable)
    votes = [{"k": k, "usable_nbclust_votes": int(counts.get(k, 0))} for k in CANDIDATE_K]
    highest_vote = max(row["usable_nbclust_votes"] for row in votes)
    leaders = [row["k"] for row in votes if row["usable_nbclust_votes"] == highest_vote]
    ordered_counts = sorted(((row["usable_nbclust_votes"], row["k"]) for row in votes), reverse=True)
    second_highest_vote = next((count for count, _ in ordered_counts if count < highest_vote), None)
    second_place_k = (
        sorted(k for count, k in ordered_counts if count == second_highest_vote)
        if second_highest_vote is not None else []
    )

    status_counts = Counter(result.status for result in first)
    unusable = [asdict(result) for result in first if not result.usable_vote]
    diagnostics = diagnostic_metrics(matrix)
    stop_reasons: list[str] = []
    if not reproducible:
        stop_reasons.append("Repeated identical seeded NbClust passes differed.")
    if len(leaders) > 1:
        stop_reasons.append(f"Highest NbClust vote is tied across k={leaders}.")

    summary = {
        "status": "STOP_K_SELECTION_REVIEW_REQUIRED" if stop_reasons else "K_SELECTION_COMPLETE",
        "files_read": {str(INPUT_PATH.relative_to(ROOT)): input_hash_before},
        "one_dimensional_input_validation": input_context,
        "PCA_applicability": PCA_STATEMENT,
        "environment_validation": environment,
        "nbclust_configuration": {
            "package": "NbClust",
            "distance": DISTANCE,
            "method": METHOD,
            "min_nc": 2,
            "max_nc": 10,
            "candidate_k": list(CANDIDATE_K),
            "feature": FEATURE,
            "feature_unit": "ADAS-Cog13 points per year",
            "standard_index_set": list(NBCLUST_INDICES),
            "indices_attempted": len(NBCLUST_INDICES),
            "random_seed_reset_before_each_index": RANDOM_SEED,
            "alllong_indices_not_added": ["gap", "gamma", "gplus", "tau"],
        },
        "index_compatibility_results": [asdict(result) for result in first],
        "index_result_summary": {
            "attempted": len(first),
            "usable_numerical_votes": len(usable),
            "unusable_nonvoting": len(unusable),
            "status_counts": dict(sorted(status_counts.items())),
            "unusable_results": unusable,
        },
        "vote_distribution": votes,
        "selection": {
            "highest_vote_count": highest_vote,
            "leaders": leaders,
            "tie_for_highest": len(leaders) > 1,
            "selected_k": leaders[0] if len(leaders) == 1 and reproducible else None,
            "second_highest_vote_count": second_highest_vote,
            "second_place_k": second_place_k,
            "tie_break_rule_applied": False,
            "primary_method_overridden_by_secondary_diagnostics": False,
        },
        "secondary_diagnostic_kmeans": {
            "role": "descriptive only; does not override NbClust",
            "configuration": {
                "implementation": "sklearn.cluster.KMeans",
                "input_features": 1,
                "raw_unstandardized_beta1": True,
                "init": "k-means++",
                "n_init": 50,
                "max_iter": 300,
                "algorithm": "lloyd",
                "random_state": RANDOM_SEED,
                "assignments_saved": False,
            },
            "metrics": diagnostics,
        },
        "reproducibility": {
            "two_identical_seeded_nbclust_passes_exact_match": reproducible,
            "random_initialization_detected": True,
            "randomness_control": "set.seed reset before every index call; identical full pass repeated",
            "material_vote_distribution_difference": not reproducible,
        },
        "stop_reasons": stop_reasons,
        "outputs": {"summary_path": str(OUTPUT_PATH)},
        "input_immutability": {"slope_input_sha256_unchanged": True},
        "prohibited_outputs_created": [],
    }
    if file_hash(INPUT_PATH) != input_hash_before:
        raise AssertionError("Authoritative slope input changed during k-selection")
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(summary, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({
        "summary": str(OUTPUT_PATH),
        "indices_attempted": len(first),
        "usable_votes": len(usable),
        "votes": votes,
        "leaders": leaders,
        "selected_k": summary["selection"]["selected_k"],
        "reproducible": reproducible,
        "stop_reasons": stop_reasons,
        "final_assignments_created": False,
    }, indent=2))


if __name__ == "__main__":
    main()
