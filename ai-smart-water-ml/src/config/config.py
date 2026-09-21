"""
config.py
---------
Central configuration for the AI Smart Water Monitoring ML System.

All configurable values are loaded from environment variables (via .env).
This module is the ONLY place where configuration is defined — all other
modules import from here.
"""

import os
from pathlib import Path
from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# Locate the project root (two levels above this file: src/config/config.py)
# ---------------------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent

# Load .env from the project root if it exists
_env_path = PROJECT_ROOT / ".env"
load_dotenv(dotenv_path=_env_path)

# ---------------------------------------------------------------------------
# MongoDB
# ---------------------------------------------------------------------------
MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
MONGO_DATABASE = os.getenv("MONGO_DATABASE", "smart_water_db")
MONGO_COLLECTION = os.getenv("MONGO_COLLECTION", "sensors")

# ---------------------------------------------------------------------------
# Training data
# ---------------------------------------------------------------------------
_training_file_env = os.getenv("TRAINING_FILE", "data/training/water_sensor_data.xlsx")
TRAINING_FILE = PROJECT_ROOT / _training_file_env

# ---------------------------------------------------------------------------
# Real-time monitoring
# ---------------------------------------------------------------------------
PREDICTION_INTERVAL_SECONDS = int(os.getenv("PREDICTION_INTERVAL_SECONDS", "10"))

# ---------------------------------------------------------------------------
# Feature columns used by all models
# ---------------------------------------------------------------------------
LEAK_FEATURES = ["flowSensorData", "pressureSensorData", "tankLevelSensorData"]
ANOMALY_FEATURES = {
    "flow": ["flowSensorData"],
    "pressure": ["pressureSensorData"],
    "tank_level": ["tankLevelSensorData"],
}
TARGET_COLUMN = "predictionData"
TURBIDITY_COLUMN = "turbiditySensorData"
TIMESTAMP_COLUMN = "createdAt"
WATER_LOSS_TARGET = "waterLossRate"

# ---------------------------------------------------------------------------
# Leak severity thresholds  (probability as a decimal, e.g. 0.50 = 50%)
# ---------------------------------------------------------------------------
SEVERITY_LOW_MAX = float(os.getenv("SEVERITY_LOW_MAX", "0.50"))     # < 50% → LOW
SEVERITY_MEDIUM_MAX = float(os.getenv("SEVERITY_MEDIUM_MAX", "0.80"))  # 50–80% → MEDIUM
# >= SEVERITY_MEDIUM_MAX → HIGH

# ---------------------------------------------------------------------------
# Water-quality (turbidity) thresholds  (sensor units)
# ---------------------------------------------------------------------------
TURBIDITY_GOOD_MAX = float(os.getenv("TURBIDITY_GOOD_MAX", "30"))       # 0–30 → GOOD
TURBIDITY_MODERATE_MAX = float(os.getenv("TURBIDITY_MODERATE_MAX", "60"))  # 31–60 → MODERATE
# > 60 → POOR

# ---------------------------------------------------------------------------
# Model persistence paths
# ---------------------------------------------------------------------------
MODELS_DIR = PROJECT_ROOT / "models"
LEAK_MODEL_PATH = MODELS_DIR / "leak_detection" / "current_model.pkl"
LEAK_METADATA_PATH = MODELS_DIR / "leak_detection" / "metadata.json"
FLOW_ANOMALY_MODEL_PATH = MODELS_DIR / "anomaly_detection" / "flow_model.pkl"
PRESSURE_ANOMALY_MODEL_PATH = MODELS_DIR / "anomaly_detection" / "pressure_model.pkl"
TANK_ANOMALY_MODEL_PATH = MODELS_DIR / "anomaly_detection" / "tank_level_model.pkl"
WATER_LOSS_MODEL_PATH = MODELS_DIR / "water_loss" / "current_model.pkl"

# ---------------------------------------------------------------------------
# Results / plots output paths
# ---------------------------------------------------------------------------
RESULTS_DIR = PROJECT_ROOT / "results"
LEAK_RESULTS_DIR = RESULTS_DIR / "leak_detection"
ANOMALY_RESULTS_DIR = RESULTS_DIR / "anomaly_detection"
WATER_LOSS_RESULTS_DIR = RESULTS_DIR / "water_loss"

# ---------------------------------------------------------------------------
# Random Forest Classifier configuration
# ---------------------------------------------------------------------------
RF_CLASSIFIER_CONFIG = {
    "n_estimators": 100,
    "random_state": 42,
    "class_weight": "balanced",
}

# ---------------------------------------------------------------------------
# Isolation Forest configuration
# ---------------------------------------------------------------------------
ISOLATION_FOREST_CONFIG = {
    "n_estimators": 100,
    "contamination": "auto",
    "random_state": 42,
}

# ---------------------------------------------------------------------------
# Train / test split ratio (time-series — NOT random shuffle)
# ---------------------------------------------------------------------------
TRAIN_RATIO = 0.80  # 80% oldest → train, 20% newest → test


def print_config_summary():
    """Print a summary of the active configuration (safe — no secrets shown)."""
    print("\n" + "=" * 60)
    print("  AI Smart Water Monitoring ML System — Configuration")
    print("=" * 60)
    # Mask the URI password if present
    safe_uri = MONGO_URI
    if "@" in MONGO_URI:
        parts = MONGO_URI.split("@")
        safe_uri = "mongodb://****:****@" + parts[-1]
    print(f"  MongoDB URI      : {safe_uri}")
    print(f"  Database         : {MONGO_DATABASE}")
    print(f"  Collection       : {MONGO_COLLECTION}")
    print(f"  Training file    : {TRAINING_FILE}")
    print(f"  Poll interval    : {PREDICTION_INTERVAL_SECONDS}s")
    print(f"  Severity LOW  <  : {SEVERITY_LOW_MAX * 100:.0f}%")
    print(f"  Severity MED  <  : {SEVERITY_MEDIUM_MAX * 100:.0f}%")
    print(f"  Turbidity GOOD ≤ : {TURBIDITY_GOOD_MAX}")
    print(f"  Turbidity MOD  ≤ : {TURBIDITY_MODERATE_MAX}")
    print("=" * 60 + "\n")
