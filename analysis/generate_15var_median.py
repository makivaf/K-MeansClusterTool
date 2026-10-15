
from pathlib import Path
import pandas as pd

SOURCE = Path(
    "data/interim/powerbi_observed_audit/"
    "imputation_comparison/participant_scores.csv"
)

OUTPUT = Path("data/interim/final_15var_median")
OUTPUT.mkdir(parents=True, exist_ok=True)

df = pd.read_csv(SOURCE)

required = {"RID", "ENTRY_PHASE", "feature", "observed_score"}
assert required.issubset(df.columns)

assert len(df) == 36555
assert df["RID"].nunique() == 2437
assert df["feature"].nunique() == 15
assert not df.duplicated(["RID", "feature"]).any()

df["observed_score"] = pd.to_numeric(
    df["observed_score"], errors="raise"
)

missing_count = int(df["observed_score"].isna().sum())
assert missing_count == 2369

medians = df.groupby("feature")["observed_score"].median()
assert medians.notna().all()

df["Was_Imputed"] = df["observed_score"].isna()
df["Score"] = df["observed_score"].fillna(
    df["feature"].map(medians)
)

assert df["Score"].notna().all()
assert df.groupby("RID")["feature"].nunique().eq(15).all()
assert df.loc[~df["Was_Imputed"], "Score"].equals(
    df.loc[~df["Was_Imputed"], "observed_score"]
)

df = df.rename(columns={"feature": "Variable"})

long_data = df[["RID", "ENTRY_PHASE", "Variable", "Score"]]
long_data.to_csv(
    OUTPUT / "ADNI_15var_median_imputed_long.csv",
    index=False,
)

audit = df[
    ["RID", "ENTRY_PHASE", "Variable",
     "observed_score", "Score", "Was_Imputed"]
]
audit.to_csv(
    OUTPUT / "ADNI_15var_median_imputation_audit.csv",
    index=False,
)

wide_data = long_data.pivot(
    index=["RID", "ENTRY_PHASE"],
    columns="Variable",
    values="Score",
).reset_index()

wide_data.columns.name = None
assert len(wide_data) == 2437
assert wide_data.shape[1] == 17

wide_data.to_csv(
    OUTPUT / "ADNI_15var_median_imputed_wide.csv",
    index=False,
)

medians.rename("median_value").to_csv(
    OUTPUT / "ADNI_15var_medians.csv"
)

print("SUCCESS")
print("Participants:", df["RID"].nunique())
print("Variables:", df["Variable"].nunique())
print("Long-format rows:", len(long_data))
print("Original missing values filled:", missing_count)
print("Remaining missing values:", df["Score"].isna().sum())
print("Wide-format rows:", len(wide_data))
