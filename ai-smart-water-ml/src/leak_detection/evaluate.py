"""
leak_detection/evaluate.py
--------------------------
Evaluates the trained RandomForestClassifier on the held-out test set.

Metrics calculated (in priority order per spec):
  1. Recall          — most important: catch every real leak
  2. F1-score        — balance of precision and recall
  3. Precision       — avoid false alarms
  4. Accuracy        — overall correctness

Also produces:
  - Confusion matrix (printed + saved as PNG)
  - Feature importance chart (saved as PNG)

IMPORTANT: We report the ACTUAL test metrics — no fabricated scores.
"""

import logging
from pathlib import Path

import matplotlib
matplotlib.use("Agg")  # Non-interactive backend for server environments
import matplotlib.pyplot as plt
import seaborn as sns
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
)

from src.config.config import LEAK_FEATURES, LEAK_RESULTS_DIR

logger = logging.getLogger(__name__)


def evaluate_leak_detector(
    model: RandomForestClassifier,
    X_test: pd.DataFrame,
    y_test: pd.Series,
) -> dict:
    """
    Evaluate the leak detection model on the test split.

    Parameters
    ----------
    model  : Fitted RandomForestClassifier
    X_test : Feature matrix (test split)
    y_test : True labels    (test split)

    Returns
    -------
    dict  with keys: accuracy, precision, recall, f1
    """
    print("\n" + "=" * 60)
    print("  EVALUATION — Leak Detection Model")
    print("=" * 60)
    print(f"\n  Test samples : {len(X_test):,}")

    y_pred = model.predict(X_test)

    # ------------------------------------------------------------------
    # Core metrics (using macro average so both classes are weighted equally)
    # ------------------------------------------------------------------
    recall    = recall_score(y_test, y_pred, average="macro", zero_division=0)
    f1        = f1_score(y_test, y_pred, average="macro", zero_division=0)
    precision = precision_score(y_test, y_pred, average="macro", zero_division=0)
    accuracy  = accuracy_score(y_test, y_pred)

    print(f"\n  Results (priority order):")
    print(f"    1. Recall    : {recall * 100:.2f}%")
    print(f"    2. F1-Score  : {f1 * 100:.2f}%")
    print(f"    3. Precision : {precision * 100:.2f}%")
    print(f"    4. Accuracy  : {accuracy * 100:.2f}%")

    # ------------------------------------------------------------------
    # Full classification report
    # ------------------------------------------------------------------
    print("\n  Full Classification Report:")
    print(
        classification_report(
            y_test,
            y_pred,
            target_names=["NORMAL (0)", "LEAK (1)"],
            zero_division=0,
        )
    )

    # ------------------------------------------------------------------
    # Confusion matrix
    # ------------------------------------------------------------------
    cm = confusion_matrix(y_test, y_pred)
    print("  Confusion Matrix (rows=Actual, cols=Predicted):")
    print(f"                NORMAL  LEAK")
    for i, row_label in enumerate(["NORMAL", "LEAK  "]):
        print(f"    {row_label}     {cm[i]}")

    _save_confusion_matrix(cm)
    _save_feature_importance(model)

    metrics = {
        "recall": round(float(recall), 4),
        "f1_score": round(float(f1), 4),
        "precision": round(float(precision), 4),
        "accuracy": round(float(accuracy), 4),
    }

    print("\n  ✓ Evaluation complete.")
    return metrics


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _save_confusion_matrix(cm: np.ndarray):
    """Save a heatmap of the confusion matrix to the results directory."""
    LEAK_RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    save_path = LEAK_RESULTS_DIR / "confusion_matrix.png"

    fig, ax = plt.subplots(figsize=(6, 5))
    sns.heatmap(
        cm,
        annot=True,
        fmt="d",
        cmap="Blues",
        xticklabels=["NORMAL (0)", "LEAK (1)"],
        yticklabels=["NORMAL (0)", "LEAK (1)"],
        ax=ax,
    )
    ax.set_xlabel("Predicted Label")
    ax.set_ylabel("Actual Label")
    ax.set_title("Leak Detection — Confusion Matrix")
    plt.tight_layout()
    plt.savefig(save_path, dpi=150)
    plt.close(fig)

    print(f"\n  Confusion matrix saved : {save_path}")


def _save_feature_importance(model: RandomForestClassifier):
    """Save a feature importance bar chart to the results directory."""
    LEAK_RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    save_path = LEAK_RESULTS_DIR / "feature_importance.png"

    importances = model.feature_importances_
    indices = np.argsort(importances)[::-1]
    sorted_features = [LEAK_FEATURES[i] for i in indices]
    sorted_importances = importances[indices]

    fig, ax = plt.subplots(figsize=(8, 4))
    bars = ax.barh(sorted_features[::-1], sorted_importances[::-1], color="steelblue")
    ax.set_xlabel("Importance")
    ax.set_title("Random Forest — Feature Importance (Leak Detection)")
    for bar, imp in zip(bars, sorted_importances[::-1]):
        ax.text(bar.get_width() + 0.005, bar.get_y() + bar.get_height() / 2,
                f"{imp:.3f}", va="center", fontsize=9)
    plt.tight_layout()
    plt.savefig(save_path, dpi=150)
    plt.close(fig)

    print(f"  Feature importance saved: {save_path}")
