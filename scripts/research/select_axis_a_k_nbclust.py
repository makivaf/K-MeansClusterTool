"""SOP 2: select Axis A cluster count by NbClust majority rule.

This module consumes only the locked SOP 1 PCA scores, runs every validity
index exposed by NbClust 3.0.1 independently, records failures without hiding
successful results, and applies the Chapter 3 deterministic tie-break when
needed. It does not run DPC-init or either study K-Means analysis.
"""

from __future__ import annotations

import csv
import math
import os
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

import rpy2.robjects as ro
from rpy2.robjects.packages import importr


ROOT = Path(__file__).resolve().parents[2]
INPUT_PATH = ROOT / "data" / "interim" / "axis_a_pca_scores.csv"
INTERIM = ROOT / "data" / "interim"
VOTES_PATH = INTERIM / "axis_a_nbclust_votes.csv"
SUMMARY_PATH = INTERIM / "axis_a_nbclust_summary.csv"
TIE_BREAK_PATH = INTERIM / "axis_a_nbclust_tie_break.csv"
SELECTED_K_PATH = INTERIM / "axis_a_selected_k.csv"

IDENTIFIERS = ("PTID", "RID")
FEATURES = tuple(f"PC{number}" for number in range(1, 7))
EXPECTED_SHAPE = (2437, 6)
CANDIDATE_K = tuple(range(2, 11))
DISTANCE = "euclidean"
METHOD = "kmeans"
RANDOM_SEED = 20260811

# The 26-index set represented by NbClust 3.0.1's standard ``index="all"``.
# It deliberately excludes GAP, Gamma, Gplus, and Tau, which belong only to
# NbClust's separate ``alllong`` mode. Each standard index is run separately
# here so failures cannot hide the other index recommendations.
NBCLUST_INDICES = (
    "kl",
    "ch",
    "hartigan",
    "ccc",
    "scott",
    "marriot",
    "trcovw",
    "tracew",
    "friedman",
    "rubin",
    "cindex",
    "db",
    "silhouette",
    "duda",
    "pseudot2",
    "beale",
    "ratkowsky",
    "ball",
    "ptbiserial",
    "frey",
    "mcclain",
    "dunn",
    "hubert",
    "sdindex",
    "dindex",
    "sdbw",
)


@dataclass(frozen=True)
class IndexResult:
    index: str
    status: str
    recommended_k: int | None
    criterion_value: float | None
    reason: str
    warnings: str


@dataclass(frozen=True)
class SelectionResult:
    index_results: tuple[IndexResult, ...]
    vote_counts: tuple[tuple[int, int], ...]
    leaders: tuple[int, ...]
    tie_break_rows: tuple[dict[str, Any], ...]
    selected_k: int


def load_pca_matrix(path: Path = INPUT_PATH) -> tuple[list[str], list[str], list[list[float]]]:
    """Read and strictly validate the sole SOP 2 analytical input."""
    if not path.is_file():
        raise FileNotFoundError(path)

    ptids: list[str] = []
    rids: list[str] = []
    matrix: list[list[float]] = []
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        expected_columns = [*IDENTIFIERS, *FEATURES]
        if reader.fieldnames != expected_columns:
            raise AssertionError(
                f"PCA input columns are {reader.fieldnames}; expected {expected_columns}"
            )
        for line_number, row in enumerate(reader, start=2):
            ptid = row["PTID"].strip()
            rid = row["RID"].strip()
            if not ptid or not rid:
                raise AssertionError(f"Blank identifier at CSV line {line_number}")
            try:
                values = [float(row[feature]) for feature in FEATURES]
            except (TypeError, ValueError) as exc:
                raise AssertionError(f"Non-numeric PCA value at CSV line {line_number}") from exc
            if not all(math.isfinite(value) for value in values):
                raise AssertionError(f"Non-finite PCA value at CSV line {line_number}")
            ptids.append(ptid)
            rids.append(rid)
            matrix.append(values)

    shape = (len(matrix), len(matrix[0]) if matrix else 0)
    if shape != EXPECTED_SHAPE:
        raise AssertionError(f"PCA input matrix shape is {shape}; expected {EXPECTED_SHAPE}")
    if len(set(ptids)) != len(ptids):
        raise AssertionError("Duplicate PTID found in PCA input")
    if len(set(rids)) != len(rids):
        raise AssertionError("Duplicate RID found in PCA input")
    return ptids, rids, matrix


def _as_r_matrix(matrix: list[list[float]]) -> ro.vectors.Matrix:
    flattened = [value for row in matrix for value in row]
    return ro.r["matrix"](
        ro.FloatVector(flattened),
        nrow=len(matrix),
        ncol=len(FEATURES),
        byrow=True,
    )


def _install_r_helpers() -> None:
    """Define quiet, structured R wrappers around NbClust and tie metrics."""
    ro.r(
        r'''
        .sop2_run_nb_index <- function(data, index_name, seed) {
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
            return(list(status = "failed", recommended_k = NA_integer_,
                        criterion_value = NA_real_, reason = error_seen,
                        warnings = warning_text))
          }
          if (is.null(result$Best.nc) || length(result$Best.nc) < 1L) {
            return(list(
              status = "unavailable",
              recommended_k = NA_integer_,
              criterion_value = NA_real_,
              reason = paste0(
                "NbClust completed index '", index_name,
                "' but returned no Best.nc recommendation (graphical index)."
              ),
              warnings = warning_text
            ))
          }

          best <- as.numeric(result$Best.nc)
          recommended_k <- suppressWarnings(as.integer(best[1L]))
          criterion_value <- if (length(best) >= 2L) best[2L] else NA_real_
          if (is.na(recommended_k) || !(recommended_k %in% 2:10)) {
            return(list(
              status = "unavailable", recommended_k = NA_integer_,
              criterion_value = criterion_value,
              reason = paste0("NbClust returned an invalid Best.nc recommendation: ",
                              paste(best, collapse = ", ")),
              warnings = warning_text
            ))
          }
          list(status = "success", recommended_k = recommended_k,
               criterion_value = criterion_value, reason = "",
               warnings = warning_text)
        }

        .sop2_tie_metrics <- function(data, k, seed) {
          set.seed(seed)
          fit <- stats::kmeans(data, centers = k, iter.max = 100,
                               nstart = 50, algorithm = "Hartigan-Wong")
          labels <- fit$cluster
          sil <- mean(cluster::silhouette(labels, stats::dist(data))[, "sil_width"])

          centers <- fit$centers
          within_scatter <- numeric(k)
          cluster_diameter <- numeric(k)
          for (cluster_id in seq_len(k)) {
            members <- data[labels == cluster_id, , drop = FALSE]
            distances <- sqrt(rowSums((members - matrix(
              centers[cluster_id, ], nrow(members), ncol(data), byrow = TRUE
            ))^2))
            within_scatter[cluster_id] <- mean(distances)
            if (nrow(members) > 1L) {
              cluster_diameter[cluster_id] <- max(stats::dist(members))
            }
          }
          center_distances <- as.matrix(stats::dist(centers))
          diag(center_distances) <- Inf
          db_terms <- numeric(k)
          for (cluster_id in seq_len(k)) {
            db_terms[cluster_id] <- max(
              (within_scatter[cluster_id] + within_scatter) /
                center_distances[cluster_id, ]
            )
          }
          db <- mean(db_terms)

          n <- nrow(data)
          overall_center <- colMeans(data)
          between_ss <- sum(vapply(seq_len(k), function(cluster_id) {
            members <- sum(labels == cluster_id)
            members * sum((centers[cluster_id, ] - overall_center)^2)
          }, numeric(1L)))
          within_ss <- sum(fit$withinss)
          ch <- (between_ss / (k - 1L)) / (within_ss / (n - k))
          c(silhouette = sil, davies_bouldin = db, calinski_harabasz = ch)
        }
        '''
    )


def _scalar(result: ro.vectors.ListVector, name: str) -> Any:
    value = result.rx2(name)[0]
    return value


def _run_index(r_matrix: ro.vectors.Matrix, index: str, seed: int) -> IndexResult:
    result = ro.globalenv[".sop2_run_nb_index"](r_matrix, index, seed)
    status = str(_scalar(result, "status"))
    recommended_raw = _scalar(result, "recommended_k")
    criterion_raw = _scalar(result, "criterion_value")
    recommended_k = None if ro.r["is.na"](recommended_raw)[0] else int(recommended_raw)
    criterion_value = None if ro.r["is.na"](criterion_raw)[0] else float(criterion_raw)
    return IndexResult(
        index=index,
        status=status,
        recommended_k=recommended_k,
        criterion_value=criterion_value,
        reason=str(_scalar(result, "reason")),
        warnings=str(_scalar(result, "warnings")),
    )


def _average_ranks(values: dict[int, float], descending: bool) -> dict[int, float]:
    ordered = sorted(values.items(), key=lambda item: item[1], reverse=descending)
    ranks: dict[int, float] = {}
    position = 0
    while position < len(ordered):
        end = position + 1
        while end < len(ordered) and math.isclose(
            ordered[end][1], ordered[position][1], rel_tol=1e-12, abs_tol=1e-12
        ):
            end += 1
        average_rank = ((position + 1) + end) / 2.0
        for k, _ in ordered[position:end]:
            ranks[k] = average_rank
        position = end
    return ranks


def _apply_tie_break(
    r_matrix: ro.vectors.Matrix, leaders: tuple[int, ...], seed: int
) -> tuple[tuple[dict[str, Any], ...], int]:
    metrics: dict[int, dict[str, float]] = {}
    for k in leaders:
        raw = ro.globalenv[".sop2_tie_metrics"](r_matrix, k, seed)
        values = [float(value) for value in raw]
        if len(values) != 3 or not all(math.isfinite(value) for value in values):
            raise AssertionError(f"Non-finite tie-break metrics returned for k={k}: {values}")
        metrics[k] = {
            "silhouette": values[0],
            "davies_bouldin": values[1],
            "calinski_harabasz": values[2],
        }

    silhouette_ranks = _average_ranks(
        {k: metrics[k]["silhouette"] for k in leaders}, descending=True
    )
    db_ranks = _average_ranks(
        {k: metrics[k]["davies_bouldin"] for k in leaders}, descending=False
    )
    ch_ranks = _average_ranks(
        {k: metrics[k]["calinski_harabasz"] for k in leaders}, descending=True
    )

    rows: list[dict[str, Any]] = []
    for k in leaders:
        rank_sum = silhouette_ranks[k] + db_ranks[k] + ch_ranks[k]
        rows.append(
            {
                "k": k,
                **metrics[k],
                "silhouette_rank": silhouette_ranks[k],
                "davies_bouldin_rank": db_ranks[k],
                "calinski_harabasz_rank": ch_ranks[k],
                "rank_sum": rank_sum,
            }
        )
    selected_k = min(rows, key=lambda row: (row["rank_sum"], row["k"]))["k"]
    for row in rows:
        row["selected"] = row["k"] == selected_k
    return tuple(rows), int(selected_k)


def select_k_nbclust(
    matrix: list[list[float]], seed: int = RANDOM_SEED
) -> SelectionResult:
    """Run SOP 2 and return the majority-rule cluster count selection."""
    shape = (len(matrix), len(matrix[0]) if matrix else 0)
    if shape != EXPECTED_SHAPE:
        raise AssertionError(f"NbClust matrix shape is {shape}; expected {EXPECTED_SHAPE}")

    importr("stats")
    importr("cluster")
    importr("NbClust")
    _install_r_helpers()
    r_matrix = _as_r_matrix(matrix)

    index_results = tuple(
        _run_index(r_matrix, index, seed) for index in NBCLUST_INDICES
    )
    usable = [result for result in index_results if result.status == "success"]
    if not usable:
        failures = "; ".join(f"{r.index}: {r.reason}" for r in index_results)
        raise RuntimeError(f"No usable NbClust recommendations. {failures}")

    counts = Counter(result.recommended_k for result in usable)
    vote_counts = tuple((k, int(counts.get(k, 0))) for k in CANDIDATE_K)
    highest_vote = max(count for _, count in vote_counts)
    leaders = tuple(k for k, count in vote_counts if count == highest_vote)
    if len(leaders) == 1:
        tie_break_rows: tuple[dict[str, Any], ...] = ()
        selected_k = leaders[0]
    else:
        tie_break_rows, selected_k = _apply_tie_break(r_matrix, leaders, seed)

    return SelectionResult(
        index_results=index_results,
        vote_counts=vote_counts,
        leaders=leaders,
        tie_break_rows=tie_break_rows,
        selected_k=selected_k,
    )


def _write_csv(path: Path, fieldnames: Iterable[str], rows: Iterable[dict[str, Any]]) -> None:
    fieldnames = list(fieldnames)
    temporary = path.with_suffix(path.suffix + ".tmp")
    with temporary.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, extrasaction="raise")
        writer.writeheader()
        writer.writerows(rows)
    os.replace(temporary, path)


def write_outputs(result: SelectionResult, reproducible: bool) -> None:
    """Write the four required, aggregate-only SOP 2 artifacts."""
    usable_count = sum(item.status == "success" for item in result.index_results)
    _write_csv(
        VOTES_PATH,
        ("index", "status", "recommended_k", "criterion_value", "reason", "warnings"),
        (
            {
                "index": item.index,
                "status": item.status,
                "recommended_k": "" if item.recommended_k is None else item.recommended_k,
                "criterion_value": "" if item.criterion_value is None else item.criterion_value,
                "reason": item.reason,
                "warnings": item.warnings,
            }
            for item in result.index_results
        ),
    )
    highest_vote = max(count for _, count in result.vote_counts)
    _write_csv(
        SUMMARY_PATH,
        ("k", "vote_count", "is_vote_leader", "total_usable_indices"),
        (
            {
                "k": k,
                "vote_count": count,
                "is_vote_leader": count == highest_vote,
                "total_usable_indices": usable_count,
            }
            for k, count in result.vote_counts
        ),
    )
    _write_csv(
        TIE_BREAK_PATH,
        (
            "k",
            "silhouette",
            "davies_bouldin",
            "calinski_harabasz",
            "silhouette_rank",
            "davies_bouldin_rank",
            "calinski_harabasz_rank",
            "rank_sum",
            "selected",
        ),
        result.tie_break_rows,
    )
    _write_csv(
        SELECTED_K_PATH,
        (
            "selected_k",
            "selection_rule",
            "tie_occurred",
            "tied_k",
            "total_usable_indices",
            "reproducible",
            "random_seed",
            "distance",
            "method",
            "candidate_k_min",
            "candidate_k_max",
            "input_rows",
            "input_features",
        ),
        (
            {
                "selected_k": result.selected_k,
                "selection_rule": (
                    "majority_rule" if len(result.leaders) == 1
                    else "majority_rule_then_chapter_3_rank_sum"
                ),
                "tie_occurred": len(result.leaders) > 1,
                "tied_k": "|".join(str(k) for k in result.leaders) if len(result.leaders) > 1 else "",
                "total_usable_indices": usable_count,
                "reproducible": reproducible,
                "random_seed": RANDOM_SEED,
                "distance": DISTANCE,
                "method": METHOD,
                "candidate_k_min": min(CANDIDATE_K),
                "candidate_k_max": max(CANDIDATE_K),
                "input_rows": EXPECTED_SHAPE[0],
                "input_features": EXPECTED_SHAPE[1],
            },
        ),
    )


def main() -> None:
    _, _, matrix = load_pca_matrix()
    print(f"validated_input_shape={EXPECTED_SHAPE}", flush=True)
    first = select_k_nbclust(matrix)
    print("first_selection_complete=True", flush=True)
    second = select_k_nbclust(matrix)
    print("second_selection_complete=True", flush=True)
    reproducible = first == second
    if not reproducible:
        raise AssertionError("The repeated SOP 2 selection did not reproduce exactly")
    write_outputs(first, reproducible=True)

    print(f"usable_indices={sum(r.status == 'success' for r in first.index_results)}")
    print("votes=" + ",".join(f"k{k}:{count}" for k, count in first.vote_counts))
    print(f"tie_occurred={len(first.leaders) > 1}")
    print(f"leaders={first.leaders}")
    print(f"selected_k={first.selected_k}")
    print("reproducible=True")
    for item in first.index_results:
        print(
            f"index={item.index};status={item.status};"
            f"recommended_k={item.recommended_k};reason={item.reason}"
        )


if __name__ == "__main__":
    main()
