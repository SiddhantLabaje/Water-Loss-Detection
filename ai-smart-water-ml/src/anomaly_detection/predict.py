"""
anomaly_detection/predict.py
-----------------------------
Run anomaly detection on a single real-time sensor record using the
three trained Isolation Forest models.

Isolation Forest convention:
  predict() returns:
     1  →  NORMAL   (inlier)
    -1  →  ABNORMAL (outlier / anomaly)

Outputs
-------
  flowAnomaly       : "NORMAL" or "ABNORMAL"
  pressureAnomaly   : "NORMAL" or "ABNORMAL"
  tankLevelAnomaly  : "NORMAL" or "ABNORMAL"
"""

import logging
from typing import Optional

import pandas as pd

logger = logging.getLogger(__name__)

# Column names per channel
_CHANNEL_COLUMNS = {
    "flow": "flowSensorData",
    "pressure": "pressureSensorData",
    "tank_level": "tankLevelSensorData",
}

# Output field names per channel
_OUTPUT_FIELDS = {
    "flow": "flowAnomaly",
    "pressure": "pressureAnomaly",
    "tank_level": "tankLevelAnomaly",
}


def predict_anomalies(models: dict, record: dict) -> dict:
    """
    Predict anomaly status for each sensor channel.

    Parameters
    ----------
    models : dict
        {"flow": IsolationForest, "pressure": IsolationForest, "tank_level": IsolationForest}
    record : dict
        Single MongoDB sensor document.

    Returns
    -------
    dict
        {
            "flowAnomaly"     : "NORMAL" or "ABNORMAL",
            "pressureAnomaly" : "NORMAL" or "ABNORMAL",
            "tankLevelAnomaly": "NORMAL" or "ABNORMAL",
        }
    """
    results = {}

    for channel, model in models.items():
        col = _CHANNEL_COLUMNS[channel]
        output_field = _OUTPUT_FIELDS[channel]

        raw_value = record.get(col)
        if raw_value is None:
            logger.warning("Field '%s' missing in record — marking as ABNORMAL.", col)
            results[output_field] = "ABNORMAL"
            continue

        try:
            value = float(raw_value)
        except (TypeError, ValueError):
            logger.warning("Field '%s' is non-numeric (%r) — marking as ABNORMAL.", col, raw_value)
            results[output_field] = "ABNORMAL"
            continue

        # Isolation Forest expects a 2D array: shape (1, 1)
        X = pd.DataFrame([[value]], columns=[col])
        iso_result = model.predict(X)[0]

        # 1 = inlier (NORMAL), -1 = outlier (ABNORMAL)
        status = "NORMAL" if iso_result == 1 else "ABNORMAL"
        results[output_field] = status

        logger.debug("Anomaly '%s': value=%.2f  →  %s", channel, value, status)

    return results
