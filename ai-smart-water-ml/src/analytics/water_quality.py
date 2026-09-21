"""
analytics/water_quality.py
--------------------------
Determines water quality status from the turbidity sensor reading.

This is a THRESHOLD-BASED calculated output — not an ML model.

Configurable thresholds (set in .env or config.py):
  0 – TURBIDITY_GOOD_MAX              → GOOD
  TURBIDITY_GOOD_MAX+1 – TURBIDITY_MODERATE_MAX → MODERATE
  Above TURBIDITY_MODERATE_MAX        → POOR

Default thresholds:
  GOOD     : turbidity 0–30
  MODERATE : turbidity 31–60
  POOR     : turbidity > 60

If turbidity is missing or invalid:
  waterQualityStatus = "UNKNOWN"
  (We NEVER fabricate missing turbidity values)
"""

from typing import Optional

from src.config.config import TURBIDITY_GOOD_MAX, TURBIDITY_MODERATE_MAX


def calculate_water_quality(turbidity: Optional[float]) -> str:
    """
    Determine water quality based on turbidity value.

    Parameters
    ----------
    turbidity : float or None
        Raw turbidity sensor reading.
        Pass None if the field was absent in the MongoDB document.

    Returns
    -------
    str   "GOOD", "MODERATE", "POOR", or "UNKNOWN"
    """
    if turbidity is None:
        return "UNKNOWN"

    if turbidity <= TURBIDITY_GOOD_MAX:
        return "GOOD"
    elif turbidity <= TURBIDITY_MODERATE_MAX:
        return "MODERATE"
    else:
        return "POOR"
