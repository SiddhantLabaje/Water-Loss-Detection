"""
leak_detection/predict.py
-------------------------
Run leak-detection inference on a single real-time sensor record.

Returns:
  - prediction  : int   (0 = NORMAL, 1 = LEAK)
  - probability : float (0.0 – 100.0, rounded to 1 decimal place)
  - label       : str   ("NORMAL" or "LEAK")
"""

import logging

import pandas as pd
from sklearn.ensemble import RandomForestClassifier

from src.config.config import LEAK_FEATURES

logger = logging.getLogger(__name__)


def predict_leak(
    model: RandomForestClassifier,
    X: pd.DataFrame,
) -> dict:
    """
    Predict whether a sensor reading indicates a leak.

    Parameters
    ----------
    model : Fitted RandomForestClassifier
    X     : pd.DataFrame  — one row, columns = LEAK_FEATURES

    Returns
    -------
    dict
        {
            "mlPredictionData": 0 or 1,
            "mlProbability"   : float (0.0–100.0),
            "mlLabel"         : "NORMAL" or "LEAK",
        }
    """
    if X.empty:
        raise ValueError("Feature DataFrame is empty — cannot run prediction.")

    # Ensure column order matches training
    X = X[LEAK_FEATURES]

    # predict_proba returns [[prob_class0, prob_class1]]
    proba = model.predict_proba(X)[0]
    leak_probability = proba[1]  # probability of class 1 (LEAK)

    prediction = int(model.predict(X)[0])
    label = "LEAK" if prediction == 1 else "NORMAL"
    probability_pct = round(float(leak_probability) * 100, 1)

    logger.debug(
        "Leak prediction: %s  |  Probability: %.1f%%", label, probability_pct
    )

    return {
        "mlPredictionData": prediction,
        "mlProbability": probability_pct,
        "mlLabel": label,
    }
