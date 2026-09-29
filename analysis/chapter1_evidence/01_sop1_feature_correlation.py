"""Chapter 1 SOP 1 diagnostic correlations; no changes to the frozen pipeline.

Run from any directory with Python. Outputs contain aggregates only.
The feature definition and imputed input path come from the existing pipeline.
"""

from __future__ import annotations

import hashlib
import io
import math
import platform
import sys
from itertools import combinations
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from scripts.research.study_entry import preprocess_study_entry as frozen

FEATURES = tuple(frozen.RETAINED_FEATURES)
INPUT_PATH = frozen.OUTPUT_PATHS["imputed"]
OUTPUT_DIR = Path(__file__).resolve().parent / "outputs"
TOLERANCE = 1e-12
LABELS = {
    "MMSE": "MMSE",
    "ADAS13": "ADAS-Cog13",
    "LMI": "Logical Memory: immediate",
    "LMD": "Logical Memory: delayed",
    "TMT_A": "Trail Making Test A",
    "TMT_B": "Trail Making Test B",
    "CATEGORY_FLUENCY_ANIMALS": "Category Fluency: animals",
    "RAVLT_IMMEDIATE": "RAVLT: immediate recall",
    "RAVLT_DELAYED": "RAVLT: delayed recall",
    "RAVLT_FORGETTING": "RAVLT: forgetting",
    "CDRSB": "CDR Sum of Boxes",
    "FAQ": "Functional Activities (FAQ)",
    "GDS": "Geriatric Depression (GDS)",
}


def load_validated_input() -> tuple[pd.DataFrame, str]:
    """Validate the entire input before computing any correlations."""
    if frozen.EXPECTED_COHORT_ROWS != 2437 or len(FEATURES) != 13:
        raise ValueError("Frozen cohort/feature definitions differ from 2,437 / 13")
    if len(set(FEATURES)) != 13 or set(LABELS) != set(FEATURES):
        raise ValueError("Feature definitions or display labels are inconsistent")
    raw_bytes = INPUT_PATH.read_bytes()
    input_hash = hashlib.sha256(raw_bytes).hexdigest()
    frame = pd.read_csv(
        io.BytesIO(raw_bytes), dtype=str, keep_default_na=False, encoding="utf-8-sig"
    )
    expected_columns = [*frozen.IDENTIFIERS, *FEATURES]
    if list(frame.columns) != expected_columns:
        raise ValueError(f"Expected exact identifier/feature schema: {expected_columns}")
    if len(frame) != 2437:
        raise ValueError(f"Expected 2,437 participants; found {len(frame)}")
    for identifier in frozen.IDENTIFIERS:
        values = frame[identifier].str.strip()
        if values.eq("").any() or values.duplicated().any():
            raise ValueError(f"Blank or duplicate {identifier}")
    features = frame.loc[:, list(FEATURES)].apply(pd.to_numeric, errors="raise")
    if features.shape != (2437, 13) or not np.isfinite(features.to_numpy()).all():
        raise ValueError("Input must be a finite, complete (2437, 13) matrix")
    if (features.nunique() < 2).any():
        raise ValueError("A constant feature would make Pearson correlation undefined")
    return features, input_hash


def compute_correlations(features: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    matrix = features.corr(method="pearson", min_periods=len(features))
    values = matrix.to_numpy()
    if not np.isfinite(values).all() or np.any(np.abs(values) > 1 + TOLERANCE):
        raise AssertionError("Invalid Pearson correlation values")
    np.testing.assert_allclose(values, values.T, rtol=0, atol=TOLERANCE)
    np.testing.assert_allclose(np.diag(values), 1, rtol=0, atol=TOLERANCE)
    pairs = pd.DataFrame([
        {
            "variable_x": x, "variable_y": y, "n": len(features),
            "pearson_r": float(matrix.loc[x, y]),
            "absolute_pearson_r": abs(float(matrix.loc[x, y])),
        }
        for x, y in combinations(FEATURES, 2)
    ])
    # Stable sorting resolves exact magnitude ties in the original feature order.
    pairs = pairs.sort_values(
        "absolute_pearson_r", ascending=False, kind="stable"
    ).reset_index(drop=True)
    pairs.insert(0, "rank", np.arange(1, len(pairs) + 1))
    unique_pairs = {frozenset((row.variable_x, row.variable_y))
                    for row in pairs.itertuples()}
    if len(pairs) != 78 or len(unique_pairs) != 78:
        raise AssertionError("Expected exactly 78 unique non-diagonal variable pairs")
    return matrix, pairs


def reconstruct_pearson(features: pd.DataFrame, pair: pd.Series) -> pd.DataFrame:
    """Independently reconstruct r with Python math.fsum and centered sums."""
    x_name, y_name = str(pair["variable_x"]), str(pair["variable_y"])
    x, y = features[x_name].tolist(), features[y_name].tolist()
    n = len(x)
    mean_x, mean_y = math.fsum(x) / n, math.fsum(y) / n
    dx, dy = [v - mean_x for v in x], [v - mean_y for v in y]
    cross = math.fsum(a * b for a, b in zip(dx, dy))
    ss_x, ss_y = math.fsum(a * a for a in dx), math.fsum(b * b for b in dy)
    denominator = math.sqrt(ss_x * ss_y)
    reconstructed = cross / denominator
    matrix_r = float(pair["pearson_r"])
    if not math.isclose(reconstructed, matrix_r, rel_tol=0, abs_tol=TOLERANCE):
        raise AssertionError("Independently reconstructed Pearson r disagrees with matrix")
    return pd.DataFrame([{
        "variable_x": x_name, "variable_y": y_name, "n": n,
        "mean_x": mean_x, "mean_y": mean_y,
        "sum_centered_cross_products": cross,
        "sum_squared_deviations_x": ss_x,
        "sum_squared_deviations_y": ss_y,
        "denominator": denominator, "pearson_r": reconstructed,
        "matrix_pearson_r": matrix_r,
        "absolute_difference": abs(reconstructed - matrix_r),
        "verification_absolute_tolerance": TOLERANCE,
        "verification_passed": True,
    }])


def plot_heatmap(matrix: pd.DataFrame, destination: Path) -> None:
    """Plot all signed coefficients on a fixed -1 to +1 scale."""
    with plt.rc_context({"font.family": "DejaVu Sans", "font.size": 11}):
        fig, ax = plt.subplots(figsize=(15, 13))
        fig.subplots_adjust(left=0.24, right=0.89, bottom=0.25, top=0.87)
        cmap = plt.get_cmap("RdBu_r")
        heatmap = ax.imshow(matrix.to_numpy(), cmap=cmap, vmin=-1, vmax=1)
        labels = [LABELS[feature] for feature in FEATURES]
        ax.set_xticks(range(13), labels=labels, rotation=55, ha="right",
                      rotation_mode="anchor", fontsize=11)
        ax.set_yticks(range(13), labels=labels, fontsize=11)
        ax.tick_params(which="both", length=0, pad=8)
        ax.set_xticks(np.arange(-0.5, 13, 1), minor=True)
        ax.set_yticks(np.arange(-0.5, 13, 1), minor=True)
        ax.grid(which="minor", color="white", linewidth=0.7)
        for spine in ax.spines.values():
            spine.set_visible(False)
        for row in range(13):
            for col in range(13):
                value = float(matrix.iloc[row, col])
                red, green, blue, _ = cmap((value + 1) / 2)
                luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue
                ax.text(col, row, f"{value:.3f}", ha="center", va="center",
                        fontsize=9.5, color="white" if luminance < 0.5 else "#171717")
        colorbar = fig.colorbar(heatmap, ax=ax, fraction=0.035, pad=0.025,
                               ticks=np.linspace(-1, 1, 5))
        colorbar.set_label("Pearson correlation (r)", labelpad=12)
        colorbar.outline.set_visible(False)
        fig.suptitle(
            "Correlation Structure of the Retained ADNI Cognitive-Functional\n"
            "Variables Used by the Existing K-Means Baseline",
            fontsize=17, fontweight="semibold", y=0.965,
        )
        ax.set_title("Pearson correlation · 2,437 participants · 13 retained variables",
                     fontsize=12, pad=18)
        fig.text(0.24, 0.025,
                 "Input: median-imputed study-entry measures. Cell values rounded to three decimals.",
                 fontsize=10, color="#444444")
        fig.savefig(destination, dpi=300, facecolor="white", bbox_inches="tight",
                    pad_inches=0.25, metadata={"Title": "Retained ADNI variables: Pearson correlation"})
        plt.close(fig)


def main() -> None:
    features, input_hash = load_validated_input()
    matrix, pairs = compute_correlations(features)
    worked = reconstruct_pearson(features, pairs.iloc[0])
    if hashlib.sha256(INPUT_PATH.read_bytes()).hexdigest() != input_hash:
        raise RuntimeError("Input changed during computation; refusing to write outputs")
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    matrix.to_csv(OUTPUT_DIR / "sop1_correlation_matrix.csv", index_label="variable",
                  float_format="%.17g")
    pairs.to_csv(OUTPUT_DIR / "sop1_all_pairwise_correlations.csv", index=False,
                 float_format="%.17g")
    worked.to_csv(OUTPUT_DIR / "sop1_worked_correlation_example.csv", index=False,
                  float_format="%.17g")
    plot_heatmap(matrix, OUTPUT_DIR / "sop1_correlation_heatmap.png")
    lines = [
        "Chapter 1 SOP 1: empirical feature-correlation evidence",
        f"Exact input file: {INPUT_PATH.resolve()}",
        f"Repository-relative input: {INPUT_PATH.relative_to(ROOT).as_posix()}",
        "Feature definitions: scripts/research/study_entry/preprocess_study_entry.py::RETAINED_FEATURES",
        f"Participant count: {len(features)}", f"Feature count: {len(FEATURES)}",
        "Exact feature names (pipeline order): " + ", ".join(FEATURES),
        "Correlation method: Pearson product-moment correlation (pandas.DataFrame.corr)",
        "Input treatment: existing median-imputed values; no further transformation or selection",
        "Missing/non-finite values: none; every pair uses all 2,437 participants",
        f"Unique non-diagonal pairs: {len(pairs)}",
        "Sorting: descending absolute Pearson r; signed r preserved; stable feature-order tie break",
        "Five largest absolute correlations:",
    ]
    lines.extend(f"  {row.rank}. {row.variable_x} / {row.variable_y}: "
                 f"r={row.pearson_r:+.17g}; |r|={row.absolute_pearson_r:.17g}"
                 for row in pairs.head(5).itertuples())
    lines.extend([
        f"Input SHA-256: {input_hash}", f"Python version: {platform.python_version()}",
        f"Python executable: {sys.executable}", f"pandas version: {pd.__version__}",
        f"NumPy version: {np.__version__}", f"Plotting library: Matplotlib {matplotlib.__version__}",
        "Worked example: automatically selected rank 1; independent math.fsum centered-sums formula",
        f"Worked r: {worked.iloc[0]['pearson_r']:.17g}",
        f"Worked absolute difference from matrix: {worked.iloc[0]['absolute_difference']:.17g}",
        f"Worked verification: PASS (absolute tolerance={TOLERANCE}; relative tolerance=0)",
        "Heatmap: all 13 features in pipeline order; Pearson r annotations; fixed scale [-1, +1]; 300 DPI",
        "Interpretation: descriptive correlations only. No automatic redundancy conclusion or claim",
        "that PCA improved Silhouette, Davies-Bouldin, or Calinski-Harabasz scores is made.",
    ])
    summary = "\n".join(lines) + "\n"
    (OUTPUT_DIR / "sop1_computation_summary.txt").write_text(summary, encoding="utf-8")
    print(summary)
    print(f"Outputs: {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
