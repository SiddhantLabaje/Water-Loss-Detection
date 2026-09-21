"""
analytics/severity.py
---------------------
Calculates leak severity from the ML leak probability.

This is a CALCULATED output — not a separate ML model.

Configurable thresholds (set in .env or config.py):
  Probability < SEVERITY_LOW_MAX   → LOW
  SEVERITY_LOW_MAX  ≤ prob < SEVERITY_MEDIUM_MAX → MEDIUM
  prob ≥ SEVERITY_MEDIUM_MAX       → HIGH

Default thresholds:
  LOW    : probability < 50%
  MEDIUM : 50% ≤ probability < 80%
  HIGH   : probability ≥ 80%

Note: Severity is only meaningful when prediction = LEAK (1).
      When prediction = NORMAL (0), severity is still calculated
      from the raw probability (which may be low but non-zero).
"""

from src.config.config import SEVERITY_LOW_MAX, SEVERITY_MEDIUM_MAX


def calculate_severity(probability_pct: float) -> str:
    """
    Determine leak severity from the leak probability percentage.

    Parameters
    ----------
    probability_pct : float
        Leak probability as a percentage (0.0 – 100.0).
        This is the 'mlProbability' value from predict_leak().

    Returns
    -------
    str   "LOW", "MEDIUM", or "HIGH"
    """
    # Convert percentage back to decimal for threshold comparison
    prob_decimal = probability_pct / 100.0

    if prob_decimal < SEVERITY_LOW_MAX:
        return "LOW"
    elif prob_decimal < SEVERITY_MEDIUM_MAX:
        return "MEDIUM"
    else:
        return "HIGH"
