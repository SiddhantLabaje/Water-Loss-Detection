"""
anomaly_detection/train.py
--------------------------
Trains three independent Isolation Forest models — one per sensor channel:
  1. Flow         (flowSensorData)
  2. Pressure     (pressureSensorData)
  3. Tank Level   (tankLevelSensorData)

Isolation Forest is an UNSUPERVISED algorithm — it does NOT use the
predictionData labels.  It learns the "normal" sensor distribution from
the training data and flags anything that deviates significantly.

These models are completely independent from the Random Forest
leak classifier.
"""

import logging
from datetime import datetime, timezone

import joblib
import pandas as pd
from sklearn.ensemble import IsolationForest

from src.config.config import (
    ISOLATION_FOREST_CONFIG,
    ANOMALY_FEATURES,
    FLOW_ANOMALY_MODEL_PATH,
    PRESSURE_ANOMALY_MODEL_PATH,
    TANK_ANOMALY_MODEL_PATH,
    ANOMALY_RESULTS_DIR,
)

logger = logging.getLogger(__name__)

# Map friendly names to model paths
_MODEL_PATHS = {
    "flow": FLOW_ANOMALY_MODEL_PATH,
    "pressure": PRESSURE_ANOMALY_MODEL_PATH,
    "tank_level": TANK_ANOMALY_MODEL_PATH,
}

_CHANNEL_LABELS = {
    "flow": "flowSensorData",
    "pressure": "pressureSensorData",
    "tank_level": "tankLevelSensorData",
}


def train_anomaly_detectors(df_train: pd.DataFrame) -> dict:
    """
    Train one Isolation Forest per sensor channel.

    Parameters
    ----------
    df_train : pd.DataFrame
        Training split (must contain flow, pressure, tank-level columns).

    Returns
    -------
    dict  {"flow": model, "pressure": model, "tank_level": model}
    """
    print("\n" + "=" * 60)
    print("  TRAINING — Anomaly Detection (Isolation Forest × 3)")
    print("=" * 60)
    print(f"\n  Config : {ISOLATION_FOREST_CONFIG}")

    models = {}

    for channel, cols in ANOMALY_FEATURES.items():
        available = [c for c in cols if c in df_train.columns]
        if not available:
            logger.warning("Skipping anomaly model '%s' — column(s) %s not found.", channel, cols)
            continue

        X = df_train[available].dropna()
        print(f"\n  Channel '{channel}' ({_CHANNEL_LABELS[channel]})")
        print(f"    Training samples : {len(X):,}")

        model = IsolationForest(**ISOLATION_FOREST_CONFIG)
        model.fit(X)

        models[channel] = model
        print(f"    ✓ Isolation Forest trained.")

    return models


def save_anomaly_models(models: dict):
    """
    Persist all anomaly detection models to disk.

    Parameters
    ----------
    models : dict  {"flow": model, "pressure": model, "tank_level": model}
    """
    for channel, model in models.items():
        path = _MODEL_PATHS[channel]
        path.parent.mkdir(parents=True, exist_ok=True)
        joblib.dump(model, path)
        print(f"  Anomaly model saved : {path}  [{channel}]")


def load_anomaly_models() -> dict:
    """
    Load all three anomaly detection models from disk.

    Returns
    -------
    dict  {"flow": model, "pressure": model, "tank_level": model}

    Raises
    ------
    FileNotFoundError if any model file is missing.
    """
    models = {}
    for channel, path in _MODEL_PATHS.items():
        if not path.exists():
            raise FileNotFoundError(
                f"[ERROR] Anomaly model '{channel}' not found: {path}\n"
                f"  → Run the training pipeline first."
            )
        models[channel] = joblib.load(path)
        logger.info("Anomaly model '%s' loaded from %s", channel, path)
    return models
