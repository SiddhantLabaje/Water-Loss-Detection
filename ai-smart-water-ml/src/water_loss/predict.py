"""
water_loss/predict.py
---------------------
Predicts water-loss rate in LITRES PER HOUR (L/hr) using the trained
RandomForestRegressor, which was trained on targets derived from:

  Formula 1 — Flow Loss:
      LeakRatio = clamp((NormalFlow − flowSensorData) / NormalFlow,  0, 1)
      FlowLoss  = flowSensorData × LeakRatio × 3.6

  Formula 2 — Pressure Loss:
      PressureLoss = ExpectedFlow × (NormalPressure − ActualPressure)
                                     ──────────────────────────────────
                                            NormalPressure
                     (clamped to 0 when pressure ≥ normal)

  Formula 3 — Total Water Loss Rate:
      TotalWaterLossRate (L/hr) = 0.7 × FlowLoss + 0.3 × PressureLoss

Output fields
─────────────
  waterLossRate          : float   Total water loss rate in L/hr  (ML predicted)
  waterLossFlowLoss      : float   Flow Loss component in L/hr    (formula breakdown)
  waterLossPressureLoss  : float   Pressure Loss component in L/hr (formula breakdown)
  waterLossVolumePerHour : float   Same as waterLossRate (L/hr)   — dashboard label
  waterLossVolume        : float   Litres lost in this polling interval
                                   = rate / 3600 × monitoring_time_seconds
  waterLossUnit          : str     "L/hr"

All outputs are 0.0 when mlPrediction = 0 (NORMAL — no leak).
"""

import logging

import pandas as pd

from src.config.config import LEAK_FEATURES, PREDICTION_INTERVAL_SECONDS

logger = logging.getLogger(__name__)

REGRESSION_FEATURES  = LEAK_FEATURES.copy()

# Same reference constants used during training
NORMAL_FLOW_MEAN     = 67.8
NORMAL_PRESSURE_MEAN = 69.8


def _formula_breakdown(flow: float, pressure: float) -> dict:
    """
    Calculate the three formula components for a single sensor reading.

    Parameters
    ----------
    flow     : flowSensorData value
    pressure : pressureSensorData value

    Returns
    -------
    dict  {flow_loss, pressure_loss, total_rate}  all in L/hr
    """
    # Formula 1 — Flow Loss
    leak_ratio = max(0.0, min(1.0, (NORMAL_FLOW_MEAN - flow) / NORMAL_FLOW_MEAN))
    flow_loss  = flow * leak_ratio * 3.6

    # Formula 2 — Pressure Loss
    pressure_loss = max(
        0.0,
        NORMAL_FLOW_MEAN * (NORMAL_PRESSURE_MEAN - pressure) / NORMAL_PRESSURE_MEAN
    )

    # Formula 3 — Total Water Loss Rate
    total_rate = 0.7 * flow_loss + 0.3 * pressure_loss

    return {
        "flow_loss":     round(flow_loss, 2),
        "pressure_loss": round(pressure_loss, 2),
        "total_rate":    round(total_rate, 2),
    }


def predict_water_loss(
    model,                           # RandomForestRegressor or None
    record: dict,
    ml_prediction: int = None,       # 0 = NORMAL, 1 = LEAK
    monitoring_time_seconds: int = PREDICTION_INTERVAL_SECONDS,
) -> dict:
    """
    Predict water-loss rate (L/hr) using the ML model, with formula breakdown.

    When ml_prediction == 0 (NORMAL): all outputs are 0.0 — no water loss.
    When ml_prediction == 1 (LEAK):   ML model predicts the rate in L/hr.

    The formula components (FlowLoss, PressureLoss) are always calculated
    and returned for transparency / dashboard display.

    Parameters
    ----------
    model                   : Fitted RandomForestRegressor or None
    record                  : MongoDB sensor document (dict)
    ml_prediction           : Output of the leak classifier (0 or 1)
    monitoring_time_seconds : Polling interval in seconds

    Returns
    -------
    dict
        waterLossRate          : float  L/hr  (ML predicted, or formula if no model)
        waterLossFlowLoss      : float  L/hr  (Formula 1 component)
        waterLossVolumePerHour : float  L/hr  (same as waterLossRate, dashboard label)
        waterLossVolume        : float  Litres lost in this interval
        waterLossUnit          : str    "L/hr"
    """
    flow     = float(record.get("flowSensorData", 0.0))
    pressure = float(record.get("pressureSensorData", 0.0))

    # Always calculate formula breakdown for transparency
    breakdown = _formula_breakdown(flow, pressure)

    # NORMAL → zero loss, no further calculation needed
    if ml_prediction == 0:
        return {
            "waterLossRate":          0.0,
            "waterLossFlowLoss":      0.0,
            "waterLossVolumePerHour": 0.0,
            "waterLossVolume":        0.0,
            "waterLossUnit":          "L/hr",
        }

    # LEAK → predict with ML model if available, else fall back to formula
    try:
        if model is not None:
            row    = {col: float(record.get(col, 0.0)) for col in REGRESSION_FEATURES}
            X      = pd.DataFrame([row], columns=REGRESSION_FEATURES)
            rate   = max(0.0, round(float(model.predict(X)[0]), 2))
        else:
            # No model — use formula 3 directly
            rate = breakdown["total_rate"]
            logger.warning("Water loss model not loaded — using formula directly: %.2f L/hr", rate)

        # Volume lost in this polling interval
        # rate is L/hr → ÷3600 gives L/s → ×seconds gives Litres
        volume = round(rate / 3600.0 * monitoring_time_seconds, 4)

        logger.debug(
            "WaterLoss: FlowLoss=%.2f L/hr  PressLoss=%.2f L/hr  "
            "Total=%.2f L/hr  Volume=%.4f L in %ds",
            breakdown["flow_loss"], breakdown["pressure_loss"],
            rate, volume, monitoring_time_seconds,
        )

        return {
            "waterLossRate":          rate,
            "waterLossFlowLoss":      breakdown["flow_loss"],
            "waterLossVolumePerHour": rate,
            "waterLossVolume":        volume,
            "waterLossUnit":          "L/hr",
        }

    except Exception as e:
        logger.error("Water-loss prediction failed: %s", e)
        return {
            "waterLossRate":          None,
            "waterLossFlowLoss":      None,
            "waterLossVolumePerHour": None,
            "waterLossVolume":        None,
            "waterLossUnit":          "L/hr",
        }
