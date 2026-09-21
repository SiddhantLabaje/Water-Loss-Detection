"""
run_once_predict.py
-------------------
Reads the LAST document from the MongoDB sensors collection,
runs the full ML prediction pipeline on it, writes the results
back to MongoDB, and prints everything.

No Excel. No manual input. Pure MongoDB → ML → MongoDB.

Run with:
    python run_once_predict.py
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))

from pymongo import MongoClient

from src.config.config import (
    MONGO_URI, MONGO_DATABASE, MONGO_COLLECTION,
    PREDICTION_INTERVAL_SECONDS,
    print_config_summary,
)
from src.data.mongo_loader import write_prediction_results, ML_PREDICTIONS_COLLECTION
from src.data.preprocessing import validate_record, record_to_dataframe, get_turbidity
from src.leak_detection.train import load_leak_model
from src.leak_detection.predict import predict_leak
from src.anomaly_detection.train import load_anomaly_models
from src.anomaly_detection.predict import predict_anomalies
from src.water_loss.train import load_water_loss_model
from src.water_loss.predict import predict_water_loss
from src.analytics.severity import calculate_severity
from src.analytics.water_quality import calculate_water_quality
from src.analytics.overall_status import calculate_overall_status


def main():
    print("\n" + "=" * 60)
    print("  AI Smart Water Monitoring — ONE-SHOT PIPELINE TEST")
    print("  Source: Last document in MongoDB sensors collection")
    print("=" * 60)

    print_config_summary()

    # ------------------------------------------------------------------
    # STEP 1 — Connect to MongoDB
    # ------------------------------------------------------------------
    print("  [1/6] Connecting to MongoDB...")
    client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=8000)
    client.admin.command("ping")
    sensor_col     = client[MONGO_DATABASE][MONGO_COLLECTION]
    prediction_col = client[MONGO_DATABASE][ML_PREDICTIONS_COLLECTION]
    total = sensor_col.count_documents({})
    print(f"        ✓ Connected")
    print(f"        Reading from  : {MONGO_DATABASE}.{MONGO_COLLECTION}")
    print(f"        Writing to    : {MONGO_DATABASE}.{ML_PREDICTIONS_COLLECTION}")
    print(f"        Sensor documents: {total}")

    if total == 0:
        print("\n  ✗ Sensors collection is EMPTY.")
        print("  Wait for ESP32 / Node.js to send sensor data.")
        return

    # ------------------------------------------------------------------
    # STEP 2 — Fetch last sensor document
    # ------------------------------------------------------------------
    print(f"\n  [2/6] Fetching last document from sensors collection...")
    record = sensor_col.find_one(sort=[("_id", -1)])

    print(f"\n        Document _id : {record['_id']}")
    print(f"        {'─' * 44}")
    sensor_fields = [
        "flowSensorData", "pressureSensorData",
        "tankLevelSensorData", "turbiditySensorData", "createdAt"
    ]
    for f in sensor_fields:
        val = record.get(f, "— not present —")
        print(f"          {f:<25}: {val}")

    already_processed = prediction_col.count_documents(
        {"sensorDocumentId": record["_id"]}
    ) > 0
    if already_processed:
        print(f"\n        ⚠ A prediction already exists for this sensor document.")
        print(f"        Running again and inserting a new prediction record...")
    print(f"        {'─' * 44}")

    # ------------------------------------------------------------------
    # STEP 3 — Load trained models
    # ------------------------------------------------------------------
    print(f"\n  [3/6] Loading trained ML models...")
    leak_model       = load_leak_model()
    anomaly_models   = load_anomaly_models()
    water_loss_model = load_water_loss_model()
    print(f"        ✓ Leak detection model")
    print(f"        ✓ Anomaly models: {list(anomaly_models.keys())}")
    print(f"        {'✓' if water_loss_model else '⚠'} Water loss model: "
          f"{'loaded' if water_loss_model else 'not available (no waterLossRate in training data)'}")

    # ------------------------------------------------------------------
    # STEP 4 — Validate sensor fields
    # ------------------------------------------------------------------
    print(f"\n  [4/6] Validating sensor fields...")
    is_valid, missing = validate_record(record)
    if not is_valid:
        print(f"        ✗ Missing / invalid fields: {missing}")
        print(f"        Cannot predict. Ensure the document contains all sensor fields.")
        return
    print(f"        ✓ All required fields present and numeric.")

    # ------------------------------------------------------------------
    # STEP 5 — Run full prediction pipeline
    # ------------------------------------------------------------------
    print(f"\n  [5/6] Running ML prediction pipeline...")

    # Leak detection (Random Forest Classifier)
    X            = record_to_dataframe(record)
    leak_result  = predict_leak(leak_model, X)
    ml_pred      = leak_result["mlPredictionData"]
    ml_prob      = leak_result["mlProbability"]
    ml_label     = leak_result["mlLabel"]

    # Severity (calculated from probability)
    ml_severity = calculate_severity(ml_prob)

    # Anomaly detection (Isolation Forest × 3)
    anomaly_result   = predict_anomalies(anomaly_models, record)
    flow_anomaly     = anomaly_result.get("flowAnomaly", "UNKNOWN")
    pressure_anomaly = anomaly_result.get("pressureAnomaly", "UNKNOWN")
    tank_anomaly     = anomaly_result.get("tankLevelAnomaly", "UNKNOWN")

    # Water quality (turbidity threshold)
    turbidity     = get_turbidity(record)
    water_quality = calculate_water_quality(turbidity)

    # Water loss (regression — only if model trained)
    wl_result = predict_water_loss(water_loss_model, record, ml_prediction=ml_pred, monitoring_time_seconds=PREDICTION_INTERVAL_SECONDS)
    wl_rate   = wl_result.get("waterLossRate")
    wl_volume = wl_result.get("waterLossVolume")

    # Overall system status (rule-based)
    overall_status = calculate_overall_status(
        ml_prediction=ml_pred,
        ml_severity=ml_severity,
        flow_anomaly=flow_anomaly,
        pressure_anomaly=pressure_anomaly,
        tank_level_anomaly=tank_anomaly,
        water_quality_status=water_quality,
    )

    result = {
        "mlPredictionData":   ml_pred,
        "mlProbability":      ml_prob,
        "mlSeverity":         ml_severity,
        "flowAnomaly":        flow_anomaly,
        "pressureAnomaly":    pressure_anomaly,
        "tankLevelAnomaly":   tank_anomaly,
        "waterQualityStatus": water_quality,
        "waterLossRate":      wl_rate,
        "waterLossVolume":    wl_volume,
        "overallSystemStatus": overall_status,
    }
    print(f"        ✓ Prediction complete.")

    # ------------------------------------------------------------------
    # STEP 6 — Write results to ml_predictions collection
    # ------------------------------------------------------------------
    print(f"\n  [6/6] Writing results to ml_predictions collection...")
    success = write_prediction_results(prediction_col, record, result)
    print(f"        {'✓ Prediction document inserted.' if success else '✗ Insert not acknowledged.'}")

    # ------------------------------------------------------------------
    # FULL RESULT DISPLAY
    # ------------------------------------------------------------------
    print("\n" + "=" * 60)
    print("  PREDICTION RESULT")
    print("=" * 60)

    print(f"\n  ┌─ Sensor Input (read from MongoDB) ─────────────────┐")
    print(f"  │  _id                 : {record['_id']}")
    print(f"  │  flowSensorData      : {record.get('flowSensorData', 'N/A')}")
    print(f"  │  pressureSensorData  : {record.get('pressureSensorData', 'N/A')}")
    print(f"  │  tankLevelSensorData : {record.get('tankLevelSensorData', 'N/A')}")
    print(f"  │  turbiditySensorData : {record.get('turbiditySensorData', 'N/A')}")
    print(f"  │  createdAt           : {record.get('createdAt', 'N/A')}")
    print(f"  └────────────────────────────────────────────────────┘")

    print(f"\n  ┌─ ML Predictions ───────────────────────────────────┐")
    leak_icon = "🚨 LEAK" if ml_pred == 1 else "✅ NORMAL"
    print(f"  │  Leak Detection      : {leak_icon}")
    print(f"  │  Leak Probability    : {ml_prob:.1f}%")
    print(f"  │  Leak Severity       : {ml_severity}")
    print(f"  └────────────────────────────────────────────────────┘")

    print(f"\n  ┌─ Anomaly Detection (Isolation Forest) ─────────────┐")
    fa_icon = "🔴 ABNORMAL" if flow_anomaly     == "ABNORMAL" else "🟢 NORMAL"
    pa_icon = "🔴 ABNORMAL" if pressure_anomaly == "ABNORMAL" else "🟢 NORMAL"
    ta_icon = "🔴 ABNORMAL" if tank_anomaly     == "ABNORMAL" else "🟢 NORMAL"
    print(f"  │  Flow Anomaly        : {fa_icon}")
    print(f"  │  Pressure Anomaly    : {pa_icon}")
    print(f"  │  Tank Level Anomaly  : {ta_icon}")
    print(f"  └────────────────────────────────────────────────────┘")

    wq_icons = {"GOOD": "🟢 GOOD", "MODERATE": "🟡 MODERATE",
                "POOR": "🔴 POOR", "UNKNOWN": "⚪ UNKNOWN"}
    print(f"\n  ┌─ Water Quality ─────────────────────────────────────┐")
    print(f"  │  Turbidity Value     : {turbidity if turbidity is not None else 'N/A'}")
    print(f"  │  Water Quality       : {wq_icons.get(water_quality, water_quality)}")
    print(f"  └────────────────────────────────────────────────────┘")

    print(f"\n  ┌─ Water Loss (Formulas) ─────────────────────────────┐")
    if wl_rate is not None and wl_rate > 0:
        flow_val  = float(record.get("flowSensorData", 0))
        press_val = float(record.get("pressureSensorData", 0))
        # Show formula breakdown
        lr  = max(0.0, min(1.0, (67.8 - flow_val) / 67.8))
        fl  = flow_val * lr * 3.6
        pl  = max(0.0, 67.8 * (69.8 - press_val) / 69.8)
        tot = 0.7 * fl + 0.3 * pl
        print(f"  │  Formula 1 — Flow Loss")
        print(f"  │    LeakRatio     = ({67.8:.1f} - {flow_val}) / {67.8:.1f} = {lr:.4f}")
        print(f"  │    FlowLoss      = {flow_val} × {lr:.4f} × 3.6 = {fl:.2f} L/hr")
        print(f"  │  Formula 2 — Pressure Loss")
        print(f"  │    PressureLoss  = {67.8:.1f} × ({69.8:.1f} - {press_val}) / {69.8:.1f} = {pl:.2f} L/hr")
        print(f"  │  Formula 3 — Total Water Loss Rate")
        print(f"  │    Total         = 0.7 × {fl:.2f} + 0.3 × {pl:.2f} = {tot:.2f} L/hr")
        print(f"  │  ─────────────────────────────────────────────────")
        print(f"  │  ML Predicted Rate   : {wl_rate:.2f} L/hr")
        print(f"  │  Volume (per hour)   : {wl_rate:.2f} L/hr")
        print(f"  │  Volume (per interval): {wl_volume:.4f} Litres in {PREDICTION_INTERVAL_SECONDS}s")
    elif wl_rate == 0.0:
        print(f"  │  No leak → Water Loss Rate : 0.00 L/hr")
    else:
        print(f"  │  Water Loss Rate : N/A (model not available)")
    print(f"  └────────────────────────────────────────────────────┘")

    os_icons = {"NORMAL": "✅ NORMAL", "WARNING": "⚠️  WARNING", "CRITICAL": "🚨 CRITICAL"}
    print(f"\n  ┌─ Overall System Status ─────────────────────────────┐")
    print(f"  │  Status              : {os_icons.get(overall_status, overall_status)}")
    print(f"  └────────────────────────────────────────────────────┘")

    # Confirm what is now stored in ml_predictions
    updated = prediction_col.find_one(
        {"sensorDocumentId": record["_id"]},
        sort=[("_id", -1)]
    )
    print(f"\n  ┌─ Saved in ml_predictions collection ───────────────┐")
    print(f"  │  sensorDocumentId         : {record['_id']}")
    ml_output_fields = [
        "mlPredictionData", "mlProbability", "mlSeverity",
        "flowAnomaly", "pressureAnomaly", "tankLevelAnomaly",
        "waterQualityStatus", "waterLossRate", "waterLossVolume",
        "overallSystemStatus", "mlProcessedAt",
    ]
    for field in ml_output_fields:
        print(f"  │  {field:<25}: {updated.get(field, '—')}")
    print(f"  └────────────────────────────────────────────────────┘")

    print(f"\n  ✓ Done. The pipeline is working correctly.")
    print(f"  When ESP32 sends new sensor data via Node.js → MongoDB,")
    print(f"  run:  python src/pipeline/prediction_pipeline.py\n")


if __name__ == "__main__":
    main()
