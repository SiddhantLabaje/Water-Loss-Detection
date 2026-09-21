"""
training_pipeline.py
--------------------
Master training pipeline for the AI Smart Water Monitoring ML System.

Run with:
    python src/pipeline/training_pipeline.py

Steps performed:
  1.  Load the Excel dataset.
  2.  Display dataset size.
  3.  Display all column names.
  4.  Check missing values.
  5.  Check duplicate records.
  6.  Check invalid sensor values.
  7.  Check predictionData distribution.
  8.  Validate predictionData contains only 0 and 1.
  9.  Clean the dataset.
  10. Perform EDA (exploratory data analysis) — save plots.
  11. Sort chronologically and split (80/20).
  12. Train Random Forest Classifier (leak detection).
  13. Evaluate the classifier.
  14. Train Isolation Forest models (anomaly detection).
  15. Train Random Forest Regressor only when waterLossRate exists.
  16. Save all trained models.
  17. Save model metadata.
  18. Print final results summary.
"""

import sys
import logging
from pathlib import Path

# Make sure imports work when running from project root
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import seaborn as sns
import pandas as pd

from src.config.config import (
    print_config_summary,
    TRAIN_RATIO,
    LEAK_FEATURES,
    TURBIDITY_COLUMN,
    LEAK_RESULTS_DIR,
    ANOMALY_RESULTS_DIR,
)
from src.data.excel_loader import load_training_data
from src.data.preprocessing import (
    extract_features,
    sort_chronologically,
    time_series_split,
    check_water_loss_target,
)
from src.leak_detection.train import train_leak_detector, save_leak_model
from src.leak_detection.evaluate import evaluate_leak_detector
from src.anomaly_detection.train import train_anomaly_detectors, save_anomaly_models
from src.water_loss.train import train_water_loss_regressor, save_water_loss_model

# ---------------------------------------------------------------------------
# Logging setup
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# EDA helpers
# ---------------------------------------------------------------------------

def run_eda(df: pd.DataFrame):
    """
    Perform exploratory data analysis and save plots to results/leak_detection/.

    Plots generated:
      - Sensor distributions (histograms)
      - Sensor boxplots by prediction class
      - Correlation heatmap
      - Turbidity distribution (if available)
      - Class distribution bar chart
    """
    print("\n" + "=" * 60)
    print("  EXPLORATORY DATA ANALYSIS (EDA)")
    print("=" * 60)

    LEAK_RESULTS_DIR.mkdir(parents=True, exist_ok=True)

    # --- 1. Sensor histograms ---
    fig, axes = plt.subplots(1, len(LEAK_FEATURES), figsize=(14, 4))
    for ax, col in zip(axes, LEAK_FEATURES):
        df[col].hist(ax=ax, bins=30, color="steelblue", edgecolor="white")
        ax.set_title(f"Distribution: {col}")
        ax.set_xlabel("Value")
        ax.set_ylabel("Count")
    plt.suptitle("Sensor Value Distributions", y=1.02)
    plt.tight_layout()
    _save_plot(LEAK_RESULTS_DIR / "eda_sensor_distributions.png")

    # --- 2. Boxplots by class ---
    fig, axes = plt.subplots(1, len(LEAK_FEATURES), figsize=(14, 5))
    for ax, col in zip(axes, LEAK_FEATURES):
        df.boxplot(column=col, by="predictionData", ax=ax)
        ax.set_title(f"{col}")
        ax.set_xlabel("predictionData (0=NORMAL, 1=LEAK)")
    plt.suptitle("Sensor Values by Leak Class")
    plt.tight_layout()
    _save_plot(LEAK_RESULTS_DIR / "eda_boxplots_by_class.png")

    # --- 3. Correlation heatmap ---
    numeric_cols = df.select_dtypes(include="number").columns.tolist()
    corr = df[numeric_cols].corr()
    fig, ax = plt.subplots(figsize=(8, 6))
    sns.heatmap(corr, annot=True, fmt=".2f", cmap="coolwarm", ax=ax, square=True)
    ax.set_title("Feature Correlation Heatmap")
    plt.tight_layout()
    _save_plot(LEAK_RESULTS_DIR / "eda_correlation_heatmap.png")

    # --- 4. Class distribution ---
    fig, ax = plt.subplots(figsize=(5, 4))
    counts = df["predictionData"].value_counts().sort_index()
    bars = ax.bar(["NORMAL (0)", "LEAK (1)"], counts.values, color=["#2ecc71", "#e74c3c"])
    for bar, val in zip(bars, counts.values):
        ax.text(
            bar.get_x() + bar.get_width() / 2,
            bar.get_height() + 2,
            str(val),
            ha="center",
            fontsize=11,
        )
    ax.set_title("Class Distribution (predictionData)")
    ax.set_ylabel("Record Count")
    plt.tight_layout()
    _save_plot(LEAK_RESULTS_DIR / "eda_class_distribution.png")

    # --- 5. Turbidity distribution (if available) ---
    if TURBIDITY_COLUMN in df.columns:
        fig, ax = plt.subplots(figsize=(7, 4))
        df[TURBIDITY_COLUMN].hist(bins=30, ax=ax, color="darkorange", edgecolor="white")
        ax.axvline(30, color="green",  linestyle="--", label="Good/Moderate boundary (30)")
        ax.axvline(60, color="red",    linestyle="--", label="Moderate/Poor boundary (60)")
        ax.set_title("Turbidity Distribution")
        ax.set_xlabel("Turbidity (NTU)")
        ax.set_ylabel("Count")
        ax.legend()
        plt.tight_layout()
        _save_plot(LEAK_RESULTS_DIR / "eda_turbidity_distribution.png")

    print(f"\n  ✓ EDA plots saved to: {LEAK_RESULTS_DIR}")


def _save_plot(path: Path):
    """Save the current matplotlib figure and close it."""
    plt.savefig(path, dpi=150, bbox_inches="tight")
    plt.close("all")
    print(f"    Saved: {path.name}")


# ---------------------------------------------------------------------------
# Main pipeline
# ---------------------------------------------------------------------------

def main():
    print("\n" + "=" * 60)
    print("  AI Smart Water Monitoring ML System")
    print("  TRAINING PIPELINE")
    print("=" * 60)

    print_config_summary()

    # ------------------------------------------------------------------
    # Steps 1–9: Load and clean data (handled inside excel_loader)
    # ------------------------------------------------------------------
    df = load_training_data()

    # ------------------------------------------------------------------
    # Step 10: EDA
    # ------------------------------------------------------------------
    run_eda(df)

    # ------------------------------------------------------------------
    # Step 11: Sort chronologically and split
    # ------------------------------------------------------------------
    df = sort_chronologically(df)
    df_train, df_test = time_series_split(df, train_ratio=TRAIN_RATIO)

    # ------------------------------------------------------------------
    # Steps 12–13: Leak detection — train and evaluate
    # ------------------------------------------------------------------
    X_train, y_train = extract_features(df_train)
    X_test,  y_test  = extract_features(df_test)

    leak_model = train_leak_detector(X_train, y_train)
    metrics    = evaluate_leak_detector(leak_model, X_test, y_test)

    # ------------------------------------------------------------------
    # Step 14: Anomaly detection — train all three channels
    # ------------------------------------------------------------------
    anomaly_models = train_anomaly_detectors(df_train)

    # ------------------------------------------------------------------
    # Step 15: Water-loss regressor (only if valid target exists)
    # ------------------------------------------------------------------
    has_water_loss = check_water_loss_target(df_train)
    water_loss_model = None
    water_loss_metrics = {}

    if has_water_loss:
        water_loss_model, water_loss_metrics = train_water_loss_regressor(df_train, df_test)
    else:
        print("\n" + "=" * 60)
        print("  WATER LOSS REGRESSION — SKIPPED")
        print("=" * 60)
        print("\n  ⚠  No valid 'waterLossRate' column found in dataset.")
        print("  Water-loss regression model will NOT be trained.")
        print("  This is expected — add a genuine waterLossRate column to enable it.")

    # ------------------------------------------------------------------
    # Steps 16–17: Save all models
    # ------------------------------------------------------------------
    print("\n" + "=" * 60)
    print("  SAVING MODELS")
    print("=" * 60)

    save_leak_model(leak_model, extra_meta=metrics)
    save_anomaly_models(anomaly_models)

    if water_loss_model is not None:
        save_water_loss_model(water_loss_model)

    # ------------------------------------------------------------------
    # Step 18: Final summary
    # ------------------------------------------------------------------
    print("\n" + "=" * 60)
    print("  TRAINING COMPLETE — FINAL SUMMARY")
    print("=" * 60)
    print(f"\n  Leak Detection Model")
    print(f"    Recall    : {metrics.get('recall', 'N/A')}")
    print(f"    F1-Score  : {metrics.get('f1_score', 'N/A')}")
    print(f"    Precision : {metrics.get('precision', 'N/A')}")
    print(f"    Accuracy  : {metrics.get('accuracy', 'N/A')}")

    print(f"\n  Anomaly Detection Models : {list(anomaly_models.keys())}")

    if water_loss_model is not None:
        print(f"\n  Water Loss Regressor")
        print(f"    MAE  : {water_loss_metrics.get('mae', 'N/A')}")
        print(f"    RMSE : {water_loss_metrics.get('rmse', 'N/A')}")
        print(f"    R²   : {water_loss_metrics.get('r2', 'N/A')}")
    else:
        print(f"\n  Water Loss Regressor : NOT TRAINED (no valid target)")

    print(f"\n  Models saved to : models/")
    print(f"  Plots saved to  : results/")
    print("\n  ✓ Run the prediction pipeline to start real-time monitoring:")
    print("    python src/pipeline/prediction_pipeline.py\n")


if __name__ == "__main__":
    main()
