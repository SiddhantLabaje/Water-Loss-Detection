"""
excel_loader.py
---------------
Loads the Excel training dataset and performs all data-quality checks.

Steps performed:
  1. Load the Excel file with openpyxl engine.
  2. Display dataset size and column names.
  3. Check for missing values.
  4. Check for duplicate records.
  5. Check for invalid / out-of-range sensor values.
  6. Validate predictionData contains only 0 and 1.
  7. Check predictionData class distribution.
  8. Return the cleaned DataFrame.
"""

import sys
import pandas as pd
from pathlib import Path

from src.config.config import (
    TRAINING_FILE,
    LEAK_FEATURES,
    TARGET_COLUMN,
    TURBIDITY_COLUMN,
    TIMESTAMP_COLUMN,
    WATER_LOSS_TARGET,
)


# ---------------------------------------------------------------------------
# Sensor sanity ranges — adjust if your hardware has different limits
# ---------------------------------------------------------------------------
SENSOR_RANGES = {
    "flowSensorData": (0, 10_000),
    "pressureSensorData": (0, 10_000),
    "tankLevelSensorData": (0, 100),
    "turbiditySensorData": (0, 10_000),
}


def load_training_data(filepath: Path = TRAINING_FILE) -> pd.DataFrame:
    """
    Load and validate the Excel training dataset.

    Parameters
    ----------
    filepath : Path
        Path to the .xlsx training file.

    Returns
    -------
    pd.DataFrame
        Cleaned DataFrame ready for feature engineering and training.

    Raises
    ------
    FileNotFoundError
        If the Excel file does not exist at the given path.
    ValueError
        If critical columns are missing or predictionData is invalid.
    """
    print("\n" + "=" * 60)
    print("  LOADING TRAINING DATA")
    print("=" * 60)

    # ------------------------------------------------------------------
    # 1. Load the file
    # ------------------------------------------------------------------
    if not Path(filepath).exists():
        raise FileNotFoundError(
            f"\n[ERROR] Training file not found: {filepath}\n"
            f"  → Place your Excel file at that path, or set TRAINING_FILE in .env"
        )

    print(f"\n  File : {filepath}")
    df = pd.read_excel(filepath, engine="openpyxl")
    print(f"  Rows : {len(df):,}  |  Columns : {df.shape[1]}")

    # ------------------------------------------------------------------
    # 2. Display column names
    # ------------------------------------------------------------------
    print("\n  Columns found:")
    for col in df.columns:
        print(f"    - {col}")

    # ------------------------------------------------------------------
    # 3. Check required columns
    # ------------------------------------------------------------------
    required_cols = LEAK_FEATURES + [TARGET_COLUMN]
    missing_required = [c for c in required_cols if c not in df.columns]
    if missing_required:
        raise ValueError(
            f"\n[ERROR] Required columns missing from dataset: {missing_required}\n"
            f"  → The dataset MUST contain: {required_cols}"
        )

    optional_present = []
    if TURBIDITY_COLUMN in df.columns:
        optional_present.append(TURBIDITY_COLUMN)
    if TIMESTAMP_COLUMN in df.columns:
        optional_present.append(TIMESTAMP_COLUMN)
    if WATER_LOSS_TARGET in df.columns:
        optional_present.append(WATER_LOSS_TARGET)

    print(f"\n  Optional columns present : {optional_present if optional_present else 'none'}")

    # ------------------------------------------------------------------
    # 4. Missing value report
    # ------------------------------------------------------------------
    print("\n  Missing value check:")
    missing = df.isnull().sum()
    missing = missing[missing > 0]
    if missing.empty:
        print("    ✓ No missing values found.")
    else:
        print("    ⚠ Missing values detected:")
        for col, count in missing.items():
            print(f"      {col}: {count} missing ({count / len(df) * 100:.1f}%)")

    # ------------------------------------------------------------------
    # 5. Duplicate records
    # ------------------------------------------------------------------
    dup_count = df.duplicated().sum()
    print(f"\n  Duplicate row check  : {dup_count} duplicate(s) found.")

    # ------------------------------------------------------------------
    # 6. Invalid sensor value check
    # ------------------------------------------------------------------
    print("\n  Sensor range validation:")
    for col, (lo, hi) in SENSOR_RANGES.items():
        if col not in df.columns:
            continue
        out_of_range = df[(df[col] < lo) | (df[col] > hi)]
        if len(out_of_range) > 0:
            print(f"    ⚠ {col}: {len(out_of_range)} values outside [{lo}, {hi}]")
        else:
            print(f"    ✓ {col}: all values in range [{lo}, {hi}]")

    # ------------------------------------------------------------------
    # 7. predictionData distribution
    # ------------------------------------------------------------------
    print(f"\n  '{TARGET_COLUMN}' distribution:")
    dist = df[TARGET_COLUMN].value_counts(dropna=False)
    for label, count in dist.items():
        pct = count / len(df) * 100
        name = "NORMAL" if label == 0 else ("LEAK" if label == 1 else f"UNKNOWN({label})")
        print(f"    {label} ({name}): {count:,} records ({pct:.1f}%)")

    # ------------------------------------------------------------------
    # 8. Validate predictionData = only 0 and 1
    # ------------------------------------------------------------------
    valid_labels = {0, 1}
    actual_labels = set(df[TARGET_COLUMN].dropna().unique())
    invalid_labels = actual_labels - valid_labels
    if invalid_labels:
        raise ValueError(
            f"\n[ERROR] '{TARGET_COLUMN}' contains invalid values: {invalid_labels}\n"
            f"  → Only 0 (NORMAL) and 1 (LEAK) are allowed."
        )
    print(f"    ✓ '{TARGET_COLUMN}' contains only valid labels (0 and 1).")

    # ------------------------------------------------------------------
    # 9. Clean the dataset
    # ------------------------------------------------------------------
    print("\n  Cleaning dataset...")
    original_size = len(df)

    # Remove duplicates
    df = df.drop_duplicates()
    if len(df) < original_size:
        print(f"    Removed {original_size - len(df)} duplicate row(s).")

    # Drop rows missing critical columns (features + target)
    critical_cols = LEAK_FEATURES + [TARGET_COLUMN]
    before = len(df)
    df = df.dropna(subset=critical_cols)
    dropped = before - len(df)
    if dropped > 0:
        print(f"    Removed {dropped} row(s) with missing critical values.")

    # Parse createdAt to datetime if present
    if TIMESTAMP_COLUMN in df.columns:
        df[TIMESTAMP_COLUMN] = pd.to_datetime(df[TIMESTAMP_COLUMN], errors="coerce")
        bad_ts = df[TIMESTAMP_COLUMN].isna().sum()
        if bad_ts > 0:
            print(f"    ⚠ {bad_ts} unparseable timestamps — those rows will fall to the end during sort.")

    print(f"\n  Dataset after cleaning : {len(df):,} rows  ({original_size - len(df)} removed)")

    # ------------------------------------------------------------------
    # Final summary
    # ------------------------------------------------------------------
    print("\n  Dataset summary:")
    numeric_cols = df.select_dtypes(include="number").columns.tolist()
    print(df[numeric_cols].describe().to_string())
    print("\n  ✓ Training data loaded and validated successfully.\n")

    return df
