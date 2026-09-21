"""
preprocessing.py
----------------
Shared preprocessing utilities used by BOTH the training pipeline and
the real-time prediction pipeline.

The same transformations must be applied in both contexts to avoid
training-serving skew (where training and prediction data are treated
differently, causing poor real-time performance).

Functions
---------
- extract_features()     → select and validate feature columns
- validate_record()      → check a single real-time record for missing fields
- record_to_dataframe()  → convert a MongoDB document dict to a feature DataFrame
"""

import logging
from typing import Optional

import pandas as pd
import numpy as np

from src.config.config import (
    LEAK_FEATURES,
    TURBIDITY_COLUMN,
    TIMESTAMP_COLUMN,
    WATER_LOSS_TARGET,
    TARGET_COLUMN,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Training-time preprocessing
# ---------------------------------------------------------------------------

def extract_features(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.Series]:
    """
    Extract the feature matrix (X) and target vector (y) from the
    cleaned training DataFrame.

    Parameters
    ----------
    df : pd.DataFrame
        Cleaned training data from excel_loader.

    Returns
    -------
    X : pd.DataFrame   Feature matrix  (columns = LEAK_FEATURES)
    y : pd.Series      Target vector   (predictionData: 0 or 1)
    """
    X = df[LEAK_FEATURES].copy()
    y = df[TARGET_COLUMN].copy().astype(int)
    return X, y


def sort_chronologically(df: pd.DataFrame) -> pd.DataFrame:
    """
    Sort the DataFrame by createdAt (oldest first) for time-series splitting.
    If createdAt is absent, return the DataFrame as-is (original order preserved).

    Parameters
    ----------
    df : pd.DataFrame

    Returns
    -------
    pd.DataFrame  Sorted DataFrame with reset index.
    """
    if TIMESTAMP_COLUMN in df.columns:
        df = df.sort_values(TIMESTAMP_COLUMN, ascending=True).reset_index(drop=True)
        logger.info("Dataset sorted chronologically by '%s'.", TIMESTAMP_COLUMN)
    else:
        logger.warning(
            "'%s' column not found — using original row order for splitting.",
            TIMESTAMP_COLUMN,
        )
    return df


def time_series_split(
    df: pd.DataFrame,
    train_ratio: float = 0.80,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """
    Split the dataset into training and test sets using a time-based cutoff.

    The OLDEST `train_ratio` fraction of records becomes the training set.
    The NEWEST `(1 - train_ratio)` fraction becomes the test set.

    No random shuffling is applied — this respects the temporal order of
    time-series sensor data.

    Parameters
    ----------
    df : pd.DataFrame
        Chronologically sorted DataFrame.
    train_ratio : float
        Fraction of records to use for training (default 0.80).

    Returns
    -------
    train_df : pd.DataFrame
    test_df  : pd.DataFrame
    """
    split_idx = int(len(df) * train_ratio)
    train_df = df.iloc[:split_idx].copy()
    test_df = df.iloc[split_idx:].copy()

    print(f"\n  Train / test split (time-series):")
    print(f"    Total records : {len(df):,}")
    print(f"    Training set  : {len(train_df):,} records ({train_ratio * 100:.0f}%)")
    print(f"    Test set      : {len(test_df):,} records ({(1 - train_ratio) * 100:.0f}%)")

    return train_df, test_df


def check_water_loss_target(df: pd.DataFrame) -> bool:
    """
    Always returns True — the water-loss regressor is always trained.

    If the dataset has a genuine 'waterLossRate' column it is used directly.
    Otherwise the physics-based derivation in water_loss/train.py generates
    the target automatically from flowSensorData and pressureSensorData.

    Parameters
    ----------
    df : pd.DataFrame

    Returns
    -------
    bool  Always True
    """
    return True


# ---------------------------------------------------------------------------
# Real-time preprocessing (single record from MongoDB)
# ---------------------------------------------------------------------------

def validate_record(record: dict) -> tuple[bool, list[str]]:
    """
    Validate a single MongoDB sensor document before prediction.

    Checks that all required feature fields are present and non-null.

    Parameters
    ----------
    record : dict
        Raw MongoDB document.

    Returns
    -------
    is_valid : bool
    missing_fields : list[str]  (empty if valid)
    """
    missing = []
    for field in LEAK_FEATURES:
        value = record.get(field)
        if value is None:
            missing.append(field)
        else:
            try:
                float(value)
            except (TypeError, ValueError):
                missing.append(f"{field} (non-numeric: {value!r})")

    return (len(missing) == 0), missing


def record_to_dataframe(record: dict) -> pd.DataFrame:
    """
    Convert a single MongoDB sensor document into a one-row feature DataFrame.

    Only the columns in LEAK_FEATURES are extracted.
    The returned DataFrame is suitable for model.predict() / predict_proba().

    Parameters
    ----------
    record : dict
        MongoDB document with sensor readings.

    Returns
    -------
    pd.DataFrame  Shape (1, len(LEAK_FEATURES))
    """
    row = {}
    for feature in LEAK_FEATURES:
        row[feature] = float(record.get(feature, 0.0))

    return pd.DataFrame([row], columns=LEAK_FEATURES)


def get_turbidity(record: dict) -> Optional[float]:
    """
    Safely extract the turbidity value from a MongoDB record.

    Returns None if the field is absent or non-numeric.

    Parameters
    ----------
    record : dict

    Returns
    -------
    float or None
    """
    raw = record.get(TURBIDITY_COLUMN)
    if raw is None:
        return None
    try:
        return float(raw)
    except (TypeError, ValueError):
        return None
