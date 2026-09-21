"""
analytics/water_loss_volume.py
------------------------------
Calculates water-loss volume from rate and time.

This is a CALCULATED value — NOT an ML prediction.

Formula:
    waterLossVolume = waterLossRate × monitoring_time_seconds

This module is intentionally simple.  It exists as a separate file to
keep the analytics boundary clear: volume is derived from rate, not
predicted independently.
"""

from typing import Optional


def calculate_water_loss_volume(
    water_loss_rate: Optional[float],
    monitoring_time_seconds: float,
) -> Optional[float]:
    """
    Calculate the water-loss volume over the monitoring interval.

    Parameters
    ----------
    water_loss_rate        : float or None
        Predicted water-loss rate (from the regressor, or None if unavailable).
    monitoring_time_seconds: float
        The monitoring interval length in seconds.

    Returns
    -------
    float or None
        Calculated volume, or None if rate is unavailable.
    """
    if water_loss_rate is None:
        return None

    volume = water_loss_rate * monitoring_time_seconds
    return round(max(0.0, volume), 4)
