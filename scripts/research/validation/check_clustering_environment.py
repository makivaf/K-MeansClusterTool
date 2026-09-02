"""Run the functional environment gate required before SOP 2 NbClust selection."""

from __future__ import annotations

import os
import sys
from importlib.metadata import version
from pathlib import Path

import rpy2.robjects as ro
from rpy2.robjects.packages import importr


ROOT = Path(__file__).resolve().parents[3]
EXPECTED_VENV = (ROOT / ".venv").resolve()


def main() -> None:
    executable = Path(sys.executable).resolve()
    active_prefix = Path(sys.prefix).resolve()
    venv_active = active_prefix == EXPECTED_VENV and sys.prefix != sys.base_prefix

    r_version = str(ro.r("paste(R.version$major, R.version$minor, sep='.')")[0])
    r_home_python = os.environ.get("R_HOME", "")
    r_home_runtime = str(ro.r("R.home()")[0])
    nbclust_version = str(ro.r("as.character(utils::packageVersion('NbClust'))")[0])

    python_to_r = int(ro.r("as.integer(6L * 7L)")[0])
    stats_package = importr("stats")
    nbclust_package = importr("NbClust")
    stats_loaded = stats_package is not None
    nbclust_loaded = nbclust_package is not None

    small_matrix = ro.r(
        "matrix(c(0,0, 0,1, 1,0, 1,1, "
        "8,8, 8,9, 9,8, 9,9, "
        "16,0, 16,1, 17,0, 17,1), ncol=2, byrow=TRUE)"
    )
    nb_result = nbclust_package.NbClust(
        small_matrix,
        distance="euclidean",
        min_nc=2,
        max_nc=3,
        method="kmeans",
        index="silhouette",
    )
    best_nc = nb_result.rx2("Best.nc")
    small_matrix_k = int(best_nc[0])

    checks = {
        "python_executable": str(executable),
        "python_version": sys.version.split()[0],
        "project_venv_expected": str(EXPECTED_VENV),
        "project_venv_active": venv_active,
        "r_version": r_version,
        "r_home_environment": r_home_python,
        "r_home_runtime": r_home_runtime,
        "rpy2_version": version("rpy2"),
        "nbclust_version": nbclust_version,
        "python_to_r_result_6_times_7": python_to_r,
        "stats_import": stats_loaded,
        "nbclust_import": nbclust_loaded,
        "small_matrix_nbclust_k": small_matrix_k,
        "small_matrix_nbclust_execution": "PASS",
    }
    for key, value in checks.items():
        print(f"{key}={value}")

    if not venv_active:
        raise AssertionError("The running interpreter is not the project .venv")
    if python_to_r != 42:
        raise AssertionError("Python-to-R invocation returned an unexpected value")
    if not stats_loaded:
        raise AssertionError("R package 'stats' did not load")
    if not nbclust_loaded:
        raise AssertionError("R package 'NbClust' did not load")
    if small_matrix_k not in (2, 3):
        raise AssertionError("Small-matrix NbClust returned an invalid candidate k")


if __name__ == "__main__":
    main()
