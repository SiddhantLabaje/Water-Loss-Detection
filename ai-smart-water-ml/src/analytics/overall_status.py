"""
analytics/overall_status.py
----------------------------
Determines the overall system status using transparent decision rules.

This is a RULE-BASED calculated output — NOT a separate ML model.

Output values: "NORMAL", "WARNING", "CRITICAL"

Decision Rules (evaluated in order — first match wins):
─────────────────────────────────────────────────────────────────────
CRITICAL if ANY of:
  • mlPredictionData == 1 (LEAK detected) AND mlSeverity == "HIGH"
  • mlPredictionData == 1 (LEAK detected) AND mlSeverity == "MEDIUM"
    AND any anomaly is ABNORMAL
  • Two or more sensor anomalies are ABNORMAL simultaneously
  • waterQualityStatus == "POOR" AND mlPredictionData == 1

WARNING if ANY of:
  • mlPredictionData == 1 (LEAK detected) AND mlSeverity == "LOW"
  • mlPredictionData == 1 (LEAK detected) AND mlSeverity == "MEDIUM"
    AND all anomalies are NORMAL
  • Exactly one sensor anomaly is ABNORMAL
  • waterQualityStatus == "POOR" (without leak)
  • waterQualityStatus == "MODERATE" AND mlPredictionData == 1

NORMAL:
  • Everything else (no leak, all sensors normal, water quality ok)
─────────────────────────────────────────────────────────────────────
These rules are documented here and NOT encoded elsewhere.
"""


def calculate_overall_status(
    ml_prediction: int,
    ml_severity: str,
    flow_anomaly: str,
    pressure_anomaly: str,
    tank_level_anomaly: str,
    water_quality_status: str,
) -> str:
    """
    Apply the documented decision rules to produce the overall system status.

    Parameters
    ----------
    ml_prediction        : int   0 = NORMAL, 1 = LEAK
    ml_severity          : str   "LOW", "MEDIUM", or "HIGH"
    flow_anomaly         : str   "NORMAL" or "ABNORMAL"
    pressure_anomaly     : str   "NORMAL" or "ABNORMAL"
    tank_level_anomaly   : str   "NORMAL" or "ABNORMAL"
    water_quality_status : str   "GOOD", "MODERATE", "POOR", or "UNKNOWN"

    Returns
    -------
    str   "NORMAL", "WARNING", or "CRITICAL"
    """
    # --- Count anomalies ---
    anomaly_count = sum([
        flow_anomaly == "ABNORMAL",
        pressure_anomaly == "ABNORMAL",
        tank_level_anomaly == "ABNORMAL",
    ])

    has_leak      = ml_prediction == 1
    is_high       = ml_severity == "HIGH"
    is_medium     = ml_severity == "MEDIUM"
    is_poor_water = water_quality_status == "POOR"
    any_anomaly   = anomaly_count >= 1
    multi_anomaly = anomaly_count >= 2

    # ---------------------------------------------------------------
    # CRITICAL rules
    # ---------------------------------------------------------------
    if has_leak and is_high:
        return "CRITICAL"

    if has_leak and is_medium and any_anomaly:
        return "CRITICAL"

    if multi_anomaly:
        return "CRITICAL"

    if is_poor_water and has_leak:
        return "CRITICAL"

    # ---------------------------------------------------------------
    # WARNING rules
    # ---------------------------------------------------------------
    if has_leak and ml_severity == "LOW":
        return "WARNING"

    if has_leak and is_medium:
        # Reaches here only if all anomalies are NORMAL
        return "WARNING"

    if anomaly_count == 1:
        return "WARNING"

    if is_poor_water:
        return "WARNING"

    if water_quality_status == "MODERATE" and has_leak:
        return "WARNING"

    # ---------------------------------------------------------------
    # NORMAL — everything else
    # ---------------------------------------------------------------
    return "NORMAL"
