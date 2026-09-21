"""
water_loss/train.py
-------------------
Trains a RandomForestRegressor to predict water-loss rate in LITRES PER HOUR (L/hr).

Formulas used (exactly as specified):
─────────────────────────────────────────────────────────────────
  Flow Loss     = flowSensorData × LeakRatio × 3.6

  Pressure Loss = ExpectedFlow × (NormalPressure − ActualPressure)
                                  ─────────────────────────────────
                                         NormalPressure

  Total Water Loss Rate (L/hr) = 0.7 × FlowLoss + 0.3 × PressureLoss
─────────────────────────────────────────────────────────────────

Definitions
  LeakRatio     : fraction of detected flow that is leaking
                  = (NormalFlow − ActualFlow) / NormalFlow,  clamped [0, 1]
                  (0 when flow is at or above normal, 1 when flow = 0)

  ExpectedFlow  : the normal/reference flow value = NormalFlow mean from training
  NormalPressure: mean pressure of NORMAL records from training data
  ActualPressure: pressureSensorData reading in the current record

For NORMAL records (predictionData == 0):
  Total Water Loss Rate = 0.0  (no leak → no loss)

The RandomForestRegressor learns to map sensor inputs → L/hr
so the prediction pipeline outputs e.g. "23.4 L/hr" in real time.
"""

import logging

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

from src.config.config import (
    LEAK_FEATURES,
    TARGET_COLUMN,
    WATER_LOSS_TARGET,
    WATER_LOSS_MODEL_PATH,
)

logger = logging.getLogger(__name__)

# Regression features — all three sensor channels
REGRESSION_FEATURES = LEAK_FEATURES.copy()

# ── Reference constants (derived from NORMAL records in training data) ──────
# These represent what the sensor reads under healthy/normal operation.
NORMAL_FLOW_MEAN     = 67.8   # mean flowSensorData for NORMAL records (L/min equiv.)
NORMAL_PRESSURE_MEAN = 69.8   # mean pressureSensorData for NORMAL records


def derive_water_loss_rate(df: pd.DataFrame) -> pd.Series:
    """
    Derive waterLossRate (L/hr) using the three specified formulas.

    Formula 1 — Flow Loss:
        LeakRatio = clamp((NormalFlow - flowSensorData) / NormalFlow, 0, 1)
        FlowLoss  = flowSensorData × LeakRatio × 3.6

    Formula 2 — Pressure Loss:
        PressureLoss = ExpectedFlow × (NormalPressure - pressureSensorData)
                                       ─────────────────────────────────────
                                              NormalPressure
        (clamped to 0 when pressure is at or above normal)

    Formula 3 — Total Water Loss Rate:
        TotalWaterLossRate = 0.7 × FlowLoss + 0.3 × PressureLoss

    NORMAL records (predictionData == 0) → 0.0 L/hr (no leak)
    LEAK   records (predictionData == 1) → formula result

    Parameters
    ----------
    df : pd.DataFrame
        Must contain: flowSensorData, pressureSensorData, predictionData

    Returns
    -------
    pd.Series  waterLossRate in L/hr, rounded to 2 decimal places
    """
    flow   = df["flowSensorData"]
    press  = df["pressureSensorData"]

    # ── Formula 1: Flow Loss ─────────────────────────────────────────
    # LeakRatio = how much of the normal flow is missing (0=no leak, 1=total loss)
    leak_ratio = ((NORMAL_FLOW_MEAN - flow) / NORMAL_FLOW_MEAN).clip(lower=0.0, upper=1.0)
    flow_loss  = flow * leak_ratio * 3.6          # L/hr

    # ── Formula 2: Pressure Loss ─────────────────────────────────────
    # Only positive when actual pressure is below normal (pressure drop = loss)
    pressure_loss = (
        NORMAL_FLOW_MEAN                          # ExpectedFlow
        * ((NORMAL_PRESSURE_MEAN - press) / NORMAL_PRESSURE_MEAN)
    ).clip(lower=0.0)                             # no negative loss

    # ── Formula 3: Total Water Loss Rate ─────────────────────────────
    total_loss = 0.7 * flow_loss + 0.3 * pressure_loss

    # Zero out for NORMAL records — no leak means no water loss
    water_loss_rate = total_loss.where(df[TARGET_COLUMN] == 1, other=0.0)

    return water_loss_rate.round(2)


def train_water_loss_regressor(
    df_train: pd.DataFrame,
    df_test: pd.DataFrame,
) -> tuple:
    """
    Train a RandomForestRegressor to predict waterLossRate in L/hr.

    If the dataset already has a genuine 'waterLossRate' column, it is used
    directly. Otherwise the physics-derived rate is computed automatically.

    Parameters
    ----------
    df_train : pd.DataFrame  Training split
    df_test  : pd.DataFrame  Test split

    Returns
    -------
    (model, metrics)
    """
    print("\n" + "=" * 60)
    print("  TRAINING — Water Loss Regressor (L/hr)")
    print("=" * 60)

    # ------------------------------------------------------------------
    # Determine target source
    # ------------------------------------------------------------------
    if WATER_LOSS_TARGET in df_train.columns:
        y_check = pd.to_numeric(df_train[WATER_LOSS_TARGET], errors="coerce").dropna()
        if len(y_check) >= 10 and np.isfinite(y_check.values).all():
            print(f"\n  Using existing '{WATER_LOSS_TARGET}' column from dataset.")
            target_source = "dataset"
        else:
            print(f"\n  '{WATER_LOSS_TARGET}' column found but invalid — using physics derivation.")
            target_source = "physics"
    else:
        print(f"\n  No '{WATER_LOSS_TARGET}' column found.")
        print(f"  Deriving waterLossRate from sensor physics (flow drop × pressure factor).")
        target_source = "physics"

    # ------------------------------------------------------------------
    # Build waterLossRate target
    # ------------------------------------------------------------------
    df_train = df_train.copy()
    df_test  = df_test.copy()

    if target_source == "physics":
        df_train[WATER_LOSS_TARGET] = derive_water_loss_rate(df_train)
        df_test[WATER_LOSS_TARGET]  = derive_water_loss_rate(df_test)

        # Show formula and derived rates
        leak_rates   = df_train.loc[df_train[TARGET_COLUMN] == 1, WATER_LOSS_TARGET]
        normal_rates = df_train.loc[df_train[TARGET_COLUMN] == 0, WATER_LOSS_TARGET]

        print(f"\n  Formulas applied:")
        print(f"    FlowLoss     = flowSensorData × LeakRatio × 3.6")
        print(f"    PressureLoss = ExpectedFlow × (NormalPressure − ActualPressure) / NormalPressure")
        print(f"    TotalRate    = 0.7 × FlowLoss + 0.3 × PressureLoss")
        print(f"\n  Reference constants:")
        print(f"    NormalFlow     = {NORMAL_FLOW_MEAN} (mean flow of NORMAL records)")
        print(f"    NormalPressure = {NORMAL_PRESSURE_MEAN} (mean pressure of NORMAL records)")
        print(f"    ExpectedFlow   = {NORMAL_FLOW_MEAN} (same as NormalFlow)")
        print(f"\n  Derived waterLossRate (L/hr) — training set:")
        print(f"    NORMAL records : 0.00 L/hr  ({len(normal_rates)} records)")
        print(f"    LEAK records   : min={leak_rates.min():.2f}  "
              f"max={leak_rates.max():.2f}  mean={leak_rates.mean():.2f} L/hr  "
              f"({len(leak_rates)} records)")
        print(f"\n  Example breakdown for LEAK records:")
        print(f"    {'Flow':>6}  {'Pressure':>9}  {'FlowLoss':>10}  {'PressLoss':>10}  {'Total(L/hr)':>12}")
        print(f"    {'─'*6}  {'─'*9}  {'─'*10}  {'─'*10}  {'─'*12}")
        sample_rows = df_train[df_train[TARGET_COLUMN] == 1].head(8)
        for _, r in sample_rows.iterrows():
            flow  = r["flowSensorData"]
            press = r["pressureSensorData"]
            lr    = max(0.0, min(1.0, (NORMAL_FLOW_MEAN - flow) / NORMAL_FLOW_MEAN))
            fl    = flow * lr * 3.6
            pl    = max(0.0, NORMAL_FLOW_MEAN * (NORMAL_PRESSURE_MEAN - press) / NORMAL_PRESSURE_MEAN)
            tot   = 0.7 * fl + 0.3 * pl
            print(f"    {flow:6.1f}  {press:9.1f}  {fl:10.2f}  {pl:10.2f}  {tot:12.2f}")
    else:
        print(f"  Using measured waterLossRate from dataset.")

    # ------------------------------------------------------------------
    # Train / test arrays
    # ------------------------------------------------------------------
    available = [c for c in REGRESSION_FEATURES if c in df_train.columns]
    X_train = df_train[available]
    y_train = df_train[WATER_LOSS_TARGET].astype(float)
    X_test  = df_test[available]
    y_test  = df_test[WATER_LOSS_TARGET].astype(float)

    print(f"\n  Features        : {available}")
    print(f"  Training samples: {len(X_train):,}  |  Test samples: {len(X_test):,}")

    # ------------------------------------------------------------------
    # Train
    # ------------------------------------------------------------------
    model = RandomForestRegressor(
        n_estimators=200,
        random_state=42,
        min_samples_leaf=2,
    )
    model.fit(X_train, y_train)
    print("\n  ✓ Water loss regressor trained.")

    # ------------------------------------------------------------------
    # Evaluate
    # ------------------------------------------------------------------
    y_pred = model.predict(X_test)
    mae  = mean_absolute_error(y_test, y_pred)
    rmse = np.sqrt(mean_squared_error(y_test, y_pred))
    r2   = r2_score(y_test, y_pred)

    print(f"\n  Regression Metrics (test split):")
    print(f"    MAE  : {mae:.2f} L/hr")
    print(f"    RMSE : {rmse:.2f} L/hr")
    print(f"    R²   : {r2:.4f}")

    # Show sample predictions vs actual
    print(f"\n  Sample predictions (test set, first 8):")
    print(f"    {'Flow':>6}  {'Press':>6}  {'Tank':>6}  {'Actual':>10}  {'Predicted':>10}")
    print(f"    {'─'*6}  {'─'*6}  {'─'*6}  {'─'*10}  {'─'*10}")
    for i in range(min(8, len(X_test))):
        row = X_test.iloc[i]
        print(f"    {row['flowSensorData']:6.1f}  {row['pressureSensorData']:6.1f}  "
              f"{row['tankLevelSensorData']:6.1f}  "
              f"{y_test.iloc[i]:8.2f} L/hr  {y_pred[i]:8.2f} L/hr")

    metrics = {
        "mae_lph":  round(float(mae), 2),
        "rmse_lph": round(float(rmse), 2),
        "r2":       round(float(r2), 4),
        "target_source": target_source,
        "unit": "L/hr",
    }

    return model, metrics


def save_water_loss_model(model):
    """Save the water-loss regressor to disk."""
    WATER_LOSS_MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, WATER_LOSS_MODEL_PATH)
    print(f"\n  Water loss model saved : {WATER_LOSS_MODEL_PATH}")


def load_water_loss_model():
    """
    Load the water-loss regressor from disk.
    Returns None if not found (pipeline continues without it).
    """
    if not WATER_LOSS_MODEL_PATH.exists():
        logger.warning(
            "Water loss model not found at %s — run training pipeline first.",
            WATER_LOSS_MODEL_PATH,
        )
        return None
    model = joblib.load(WATER_LOSS_MODEL_PATH)
    logger.info("Water loss model loaded from %s", WATER_LOSS_MODEL_PATH)
    return model
