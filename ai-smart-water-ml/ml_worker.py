"""
ml_worker.py
------------
Single-shot ML worker — called by the Node.js backend on a cron.

Flow:
  1. Connect to MongoDB
  2. Find sensor documents that have no prediction yet
  3. Run the full ML pipeline on each one
  4. Write results to ml_predictions
  5. Print a JSON summary to stdout and exit

Node.js reads the exit code:
  0  = success (0 or more records processed)
  1  = fatal error (MongoDB unreachable, model load failure, etc.)

Run manually with:
  python ml_worker.py
"""

import sys
import json
import logging
from pathlib import Path
from datetime import datetime, timezone

# Make src/ importable from this file's directory
sys.path.insert(0, str(Path(__file__).resolve().parent))

from pymongo import MongoClient

from src.config.config import (
    MONGO_URI,
    MONGO_DATABASE,
    MONGO_COLLECTION,
    PREDICTION_INTERVAL_SECONDS,
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

logging.basicConfig(level=logging.WARNING)  # suppress verbose logs when called by Node.js


def main():
    processed = 0
    errors    = 0
    skipped   = 0

    # ── Connect to MongoDB ────────────────────────────────────────────────
    try:
        client         = MongoClient(MONGO_URI, serverSelectionTimeoutMS=10_000)
        client.admin.command("ping")
        db             = client[MONGO_DATABASE]
        sensor_col     = db[MONGO_COLLECTION]
        prediction_col = db[ML_PREDICTIONS_COLLECTION]
    except Exception as e:
        print(json.dumps({"status": "error", "message": f"MongoDB connection failed: {e}"}))
        sys.exit(1)

    # ── Find unprocessed sensor records ───────────────────────────────────
    try:
        processed_ids = {
            doc["sensorDocumentId"]
            for doc in prediction_col.find({}, {"sensorDocumentId": 1})
            if doc.get("sensorDocumentId") is not None
        }
        all_sensors  = list(sensor_col.find())
        unprocessed  = [doc for doc in all_sensors if doc["_id"] not in processed_ids]
    except Exception as e:
        print(json.dumps({"status": "error", "message": f"MongoDB query failed: {e}"}))
        sys.exit(1)

    if not unprocessed:
        print(json.dumps({"status": "ok", "processed": 0, "errors": 0, "skipped": 0,
                          "message": "No new sensor records."}))
        sys.exit(0)

    # ── Load models once ──────────────────────────────────────────────────
    try:
        leak_model       = load_leak_model()
        anomaly_models   = load_anomaly_models()
        water_loss_model = load_water_loss_model()
    except Exception as e:
        print(json.dumps({"status": "error", "message": f"Model load failed: {e}"}))
        sys.exit(1)

    # ── Process each record ───────────────────────────────────────────────
    for record in unprocessed:
        doc_id = record["_id"]
        try:
            is_valid, missing_fields = validate_record(record)
            if not is_valid:
                result = {
                    "mlPredictionData":    None,
                    "mlProbability":       None,
                    "mlSeverity":          "UNKNOWN",
                    "flowAnomaly":         "UNKNOWN",
                    "pressureAnomaly":     "UNKNOWN",
                    "tankLevelAnomaly":    "UNKNOWN",
                    "waterQualityStatus":  "UNKNOWN",
                    "waterLossRate":       None,
                    "waterLossFlowLoss":   None,
                    "waterLossVolumePerHour": None,
                    "waterLossVolume":     None,
                    "waterLossUnit":       "L/hr",
                    "overallSystemStatus": "UNKNOWN",
                    "mlError":             f"Missing fields: {missing_fields}",
                }
                write_prediction_results(prediction_col, record, result)
                skipped += 1
                continue

            # Leak detection
            X              = record_to_dataframe(record)
            leak_result    = predict_leak(leak_model, X)
            ml_prediction  = leak_result["mlPredictionData"]
            ml_probability = leak_result["mlProbability"]
            ml_severity    = calculate_severity(ml_probability)

            # Anomaly detection
            anomaly_result   = predict_anomalies(anomaly_models, record)
            flow_anomaly     = anomaly_result.get("flowAnomaly",     "UNKNOWN")
            pressure_anomaly = anomaly_result.get("pressureAnomaly", "UNKNOWN")
            tank_anomaly     = anomaly_result.get("tankLevelAnomaly","UNKNOWN")

            # Water quality
            turbidity     = get_turbidity(record)
            water_quality = calculate_water_quality(turbidity)

            # Water loss
            wl_result = predict_water_loss(
                water_loss_model,
                record,
                ml_prediction=ml_prediction,
                monitoring_time_seconds=PREDICTION_INTERVAL_SECONDS,
            )

            # Overall status
            overall_status = calculate_overall_status(
                ml_prediction=ml_prediction,
                ml_severity=ml_severity,
                flow_anomaly=flow_anomaly,
                pressure_anomaly=pressure_anomaly,
                tank_level_anomaly=tank_anomaly,
                water_quality_status=water_quality,
            )

            result = {
                "mlPredictionData":       ml_prediction,
                "mlProbability":          ml_probability,
                "mlSeverity":             ml_severity,
                "flowAnomaly":            flow_anomaly,
                "pressureAnomaly":        pressure_anomaly,
                "tankLevelAnomaly":       tank_anomaly,
                "waterQualityStatus":     water_quality,
                "waterLossRate":          wl_result["waterLossRate"],
                "waterLossFlowLoss":      wl_result["waterLossFlowLoss"],
                "waterLossVolumePerHour": wl_result["waterLossVolumePerHour"],
                "waterLossVolume":        wl_result["waterLossVolume"],
                "waterLossUnit":          wl_result["waterLossUnit"],
                "overallSystemStatus":    overall_status,
            }

            write_prediction_results(prediction_col, record, result)
            processed += 1

        except Exception as e:
            errors += 1
            try:
                write_prediction_results(
                    prediction_col,
                    record,
                    {"mlError": str(e), "overallSystemStatus": "UNKNOWN"},
                )
            except Exception:
                pass

    print(json.dumps({
        "status":    "ok",
        "processed": processed,
        "errors":    errors,
        "skipped":   skipped,
        "total":     len(unprocessed),
        "ts":        datetime.now(timezone.utc).isoformat(),
    }))
    sys.exit(0)


if __name__ == "__main__":
    main()
