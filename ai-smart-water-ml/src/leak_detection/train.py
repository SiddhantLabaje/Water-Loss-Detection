"""
leak_detection/train.py
-----------------------
Trains a RandomForestClassifier to detect water leaks.

Model configuration (from spec):
    RandomForestClassifier(
        n_estimators=100,
        random_state=42,
        class_weight="balanced",
    )

Features  : flowSensorData, pressureSensorData, tankLevelSensorData
Target    : predictionData  (0 = NORMAL, 1 = LEAK)

The 'balanced' class_weight ensures the model does not ignore minority
classes (e.g., rare leak events) by up-weighting them during training.
"""

import json
import logging
from datetime import datetime, timezone

import joblib
import pandas as pd
from sklearn.ensemble import RandomForestClassifier

from src.config.config import (
    RF_CLASSIFIER_CONFIG,
    LEAK_FEATURES,
    TARGET_COLUMN,
    LEAK_MODEL_PATH,
    LEAK_METADATA_PATH,
)

logger = logging.getLogger(__name__)


def train_leak_detector(
    X_train: pd.DataFrame,
    y_train: pd.Series,
) -> RandomForestClassifier:
    """
    Train the RandomForestClassifier on the training split.

    Parameters
    ----------
    X_train : pd.DataFrame   Feature matrix (training split)
    y_train : pd.Series      Target vector  (training split)

    Returns
    -------
    RandomForestClassifier  Fitted model instance.
    """
    print("\n" + "=" * 60)
    print("  TRAINING — Leak Detection (Random Forest Classifier)")
    print("=" * 60)
    print(f"\n  Features : {LEAK_FEATURES}")
    print(f"  Samples  : {len(X_train):,}")
    print(f"  Config   : {RF_CLASSIFIER_CONFIG}")

    model = RandomForestClassifier(**RF_CLASSIFIER_CONFIG)
    model.fit(X_train, y_train)

    print("\n  ✓ Leak detection model trained successfully.")
    return model


def save_leak_model(model: RandomForestClassifier, extra_meta: dict = None):
    """
    Persist the trained model and its metadata to disk.

    Files saved:
      - models/leak_detection/current_model.pkl   (model weights)
      - models/leak_detection/metadata.json        (training info)

    Parameters
    ----------
    model      : Fitted RandomForestClassifier
    extra_meta : Additional metadata to store (e.g., evaluation metrics)
    """
    # Ensure output directories exist
    LEAK_MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)

    # Save model
    joblib.dump(model, LEAK_MODEL_PATH)
    print(f"\n  Model saved  : {LEAK_MODEL_PATH}")

    # Build metadata
    meta = {
        "model_type": "RandomForestClassifier",
        "features": LEAK_FEATURES,
        "target": TARGET_COLUMN,
        "labels": {"0": "NORMAL", "1": "LEAK"},
        "config": RF_CLASSIFIER_CONFIG,
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "n_estimators": model.n_estimators,
        "n_features": model.n_features_in_,
    }
    if extra_meta:
        meta.update(extra_meta)

    with open(LEAK_METADATA_PATH, "w") as f:
        json.dump(meta, f, indent=2)

    print(f"  Metadata saved: {LEAK_METADATA_PATH}")


def load_leak_model() -> RandomForestClassifier:
    """
    Load the trained leak detection model from disk.

    Returns
    -------
    RandomForestClassifier

    Raises
    ------
    FileNotFoundError if the model file does not exist (train first).
    """
    if not LEAK_MODEL_PATH.exists():
        raise FileNotFoundError(
            f"[ERROR] Leak detection model not found: {LEAK_MODEL_PATH}\n"
            f"  → Run the training pipeline first:  python src/pipeline/training_pipeline.py"
        )
    model = joblib.load(LEAK_MODEL_PATH)
    logger.info("Leak detection model loaded from %s", LEAK_MODEL_PATH)
    return model
