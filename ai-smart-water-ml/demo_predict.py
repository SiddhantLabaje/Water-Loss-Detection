"""
demo_predict.py
---------------
Runs a one-shot prediction on the LAST record of the training Excel dataset.

Use this to verify the trained models are working correctly before
any live data arrives from ESP32 / Node.js / MongoDB.

No MongoDB connection required.
No manual sensor entry required.

Run with:
    python demo_predict.py
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))

from src.config.config import TRAINING_FILE, PREDICTION_INTERVAL_SECONDS, print_config_summary
from src.data.excel_loader import load_training_data
from src.data.preprocessing import record_to_dataframe, get_turbidity, validate_record
from src.leak_detection.train import load_leak_model
from src.leak_detection.predict import predict_leak
from src.anomaly_detection.train import load_anomaly_models
from src.anomaly_detection.predict import predict_anomalies
from src.water_loss.train import load_water_loss_model
from src.water_loss.predict import predict_water_loss
from src.analytics.severity import calculate_severity
from src.analytics.water_quality import calculate_water_quality
from src.analytics.overall_status import calculate_overall_status


def run_demo():
    print("\n" + "=" * 60)
    print("  AI Smart Water Monitoring — DEMO PREDICTION")
    print("  (Last record from training Excel dataset)")
    print("=" * 60)

    print_config_summary()

    # ------------------------------------------------------------------
    # 1. Load training data and take the very last row
    # ------------------------------------------------------------------
    print(f"  Loading dataset: {TRAINING_FILE}")
    df = load_training_data()

    last_row = df.iloc[-1]
    print(f"\n  Using last record (row index {df.index[-1]}):")
    print(f"  {'─' * 48}")
    for col, val in last_row.items():
        print(f"    {col:<25}: {val}")
    print(f"  {'─' * 48}")

    # Convert to a dict (simulates what MongoDB would send)
    record = last_row.to_dict()

    # ------------------------------------------------------------------
    # 2. Load all trained models
    # ------------------------------------------------------------------
    print("\n  Loading trained models...")
    leak_model       = load_leak_model()
    anomaly_models   = load_anomaly_models()
    water_loss_model = load_water_loss_model()
    print("  ✓ Models loaded.")

    # ------------------------------------------------------------------
    # 3. Validate record
    # ------------------------------------------------------------------
    is_valid, missing = validate_record(record)
    if not is_valid:
        print(f"\n  ⚠ Record has missing/invalid fields: {missing}")
        print("  Cannot run prediction on incomplete data.")
        return

    # ------------------------------------------------------------------
    # 4. Run full prediction pipeline
    # ------------------------------------------------------------------
    print("\n  Running prediction pipeline...")

    # Leak detection
    X = record_to_dataframe(record)
    leak_result  = predict_leak(leak_model, X)
    ml_pred      = leak_result["mlPredictionData"]
    ml_prob      = leak_result["mlProbability"]
    ml_label     = leak_result["mlLabel"]

    # Severity
    ml_severity = calculate_severity(ml_prob)

    # Anomaly detection
    anomaly_result   = predict_anomalies(anomaly_models, record)
    flow_anomaly     = anomaly_result.get("flowAnomaly", "UNKNOWN")
    pressure_anomaly = anomaly_result.get("pressureAnomaly", "UNKNOWN")
    tank_anomaly     = anomaly_result.get("tankLevelAnomaly", "UNKNOWN")

    # Water quality
    turbidity    = get_turbidity(record)
    water_quality = calculate_water_quality(turbidity)

    # Water loss
    wl_result = predict_water_loss(
        water_loss_model,
        record,
        monitoring_time_seconds=PREDICTION_INTERVAL_SECONDS,
    )

    # Overall status
    overall_status = calculate_overall_status(
        ml_prediction=ml_pred,
        ml_severity=ml_severity,
        flow_anomaly=flow_anomaly,
        pressure_anomaly=pressure_anomaly,
        tank_level_anomaly=tank_anomaly,
        water_quality_status=water_quality,
    )

    # ------------------------------------------------------------------
    # 5. Print full result
    # ------------------------------------------------------------------
    print("\n" + "=" * 60)
    print("  PREDICTION RESULT")
    print("=" * 60)

    print(f"\n  ── Sensor Input ──────────────────────────────────")
    print(f"    Flow          : {record.get('flowSensorData', '?')}")
    print(f"    Pressure      : {record.get('pressureSensorData', '?')}")
    print(f"    Tank Level    : {record.get('tankLevelSensorData', '?')}")
    print(f"    Turbidity     : {record.get('turbiditySensorData', '?')}")
    print(f"    Timestamp     : {record.get('createdAt', '?')}")

    print(f"\n  ── ML Predictions ────────────────────────────────")
    print(f"    Leak Detection : {ml_label} ({ml_pred})")
    print(f"    Probability    : {ml_prob:.1f}%")
    print(f"    Severity       : {ml_severity}")

    print(f"\n  ── Anomaly Detection (Isolation Forest) ──────────")
    print(f"    Flow Anomaly      : {flow_anomaly}")
    print(f"    Pressure Anomaly  : {pressure_anomaly}")
    print(f"    Tank Level Anomaly: {tank_anomaly}")

    print(f"\n  ── Water Quality (Turbidity Threshold) ───────────")
    print(f"    Turbidity Value   : {turbidity if turbidity is not None else 'N/A'}")
    print(f"    Water Quality     : {water_quality}")

    print(f"\n  ── Water Loss ────────────────────────────────────")
    wl_rate   = wl_result.get("waterLossRate")
    wl_volume = wl_result.get("waterLossVolume")
    if wl_rate is not None:
        print(f"    Water Loss Rate   : {wl_rate}")
        print(f"    Water Loss Volume : {wl_volume}  (rate × {PREDICTION_INTERVAL_SECONDS}s)")
    else:
        print(f"    Water Loss Rate   : N/A  (model not trained — no waterLossRate in dataset)")
        print(f"    Water Loss Volume : N/A")

    print(f"\n  ── Overall System Status ─────────────────────────")
    status_colors = {"NORMAL": "✅", "WARNING": "⚠️ ", "CRITICAL": "🚨"}
    icon = status_colors.get(overall_status, "❓")
    print(f"    {icon}  {overall_status}")

    # Also show the ground-truth label if available (training data only)
    if "predictionData" in record:
        gt = record["predictionData"]
        gt_label = "LEAK" if gt == 1 else "NORMAL"
        match = "✓ MATCH" if int(gt) == ml_pred else "✗ MISMATCH"
        print(f"\n  ── Ground Truth (from training data) ─────────────")
        print(f"    predictionData : {gt_label} ({int(gt)})  {match}")

    print("\n" + "=" * 60)
    print("  Demo complete.")
    print("  When live ESP32 data arrives in MongoDB, run:")
    print("    python src/pipeline/prediction_pipeline.py")
    print("=" * 60 + "\n")


if __name__ == "__main__":
    run_demo()
