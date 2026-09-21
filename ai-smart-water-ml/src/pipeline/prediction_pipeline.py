"""
prediction_pipeline.py
-----------------------
Continuous real-time prediction pipeline.

READ  from : sensors          (raw ESP32 data inserted by Node.js)
WRITE to   : ml_predictions   (ML results stored in a separate collection)

The sensors collection is NEVER modified.

Run with:
    python src/pipeline/prediction_pipeline.py
"""

import sys
import time
import logging
from pathlib import Path
from datetime import datetime, timezone

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from src.config.config import (
    print_config_summary,
    PREDICTION_INTERVAL_SECONDS,
    TURBIDITY_COLUMN,
)
from src.data.mongo_loader import (
    MongoConnectionManager,
    fetch_unprocessed_records,
    fetch_latest_sensor_record,
    fetch_latest_prediction,
    write_prediction_results,
)
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

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Model loading
# ---------------------------------------------------------------------------

def load_all_models() -> dict:
    print("\n" + "=" * 60)
    print("  LOADING TRAINED MODELS")
    print("=" * 60)

    leak_model = load_leak_model()
    print("  ✓ Leak detection model loaded")

    anomaly_models = load_anomaly_models()
    print(f"  ✓ Anomaly detection models loaded: {list(anomaly_models.keys())}")

    water_loss_model = load_water_loss_model()
    if water_loss_model is not None:
        print("  ✓ Water loss model loaded")
    else:
        print("  ⚠ Water loss model not available")

    return {
        "leak":       leak_model,
        "anomaly":    anomaly_models,
        "water_loss": water_loss_model,
    }


# ---------------------------------------------------------------------------
# Single-record prediction
# ---------------------------------------------------------------------------

def process_record(record: dict, models: dict) -> dict:
    """
    Run the full ML pipeline on one sensor document.
    Returns the prediction result dict (does NOT write to MongoDB here).
    """
    # Validate
    is_valid, missing_fields = validate_record(record)
    if not is_valid:
        logger.warning("Record %s missing fields: %s", record.get("_id"), missing_fields)
        return {
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

    # Leak detection
    X              = record_to_dataframe(record)
    leak_result    = predict_leak(models["leak"], X)
    ml_prediction  = leak_result["mlPredictionData"]
    ml_probability = leak_result["mlProbability"]
    ml_severity    = calculate_severity(ml_probability)

    # Anomaly detection
    anomaly_result   = predict_anomalies(models["anomaly"], record)
    flow_anomaly     = anomaly_result.get("flowAnomaly",     "UNKNOWN")
    pressure_anomaly = anomaly_result.get("pressureAnomaly", "UNKNOWN")
    tank_anomaly     = anomaly_result.get("tankLevelAnomaly","UNKNOWN")

    # Water quality
    turbidity    = get_turbidity(record)
    water_quality = calculate_water_quality(turbidity)

    # Water loss
    water_loss_result = predict_water_loss(
        models["water_loss"],
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

    return {
        "mlPredictionData":       ml_prediction,
        "mlProbability":          ml_probability,
        "mlSeverity":             ml_severity,
        "flowAnomaly":            flow_anomaly,
        "pressureAnomaly":        pressure_anomaly,
        "tankLevelAnomaly":       tank_anomaly,
        "waterQualityStatus":     water_quality,
        "waterLossRate":          water_loss_result["waterLossRate"],
        "waterLossFlowLoss":      water_loss_result["waterLossFlowLoss"],
        "waterLossVolumePerHour": water_loss_result["waterLossVolumePerHour"],
        "waterLossVolume":        water_loss_result["waterLossVolume"],
        "waterLossUnit":          water_loss_result["waterLossUnit"],
        "overallSystemStatus":    overall_status,
    }


# ---------------------------------------------------------------------------
# Monitoring loop
# ---------------------------------------------------------------------------

def run_prediction_pipeline():
    print("\n" + "=" * 60)
    print("  AI Smart Water Monitoring ML System")
    print("  REAL-TIME PREDICTION PIPELINE")
    print("=" * 60)

    print_config_summary()

    models    = load_all_models()
    mongo_mgr = MongoConnectionManager()

    print(f"\n  Polling every {PREDICTION_INTERVAL_SECONDS}s.")
    print(f"  Sensor data   → read  from : sensors")
    print(f"  ML results    → saved into : ml_predictions")
    print(f"  Press Ctrl+C to stop.\n")

    total_processed = 0
    total_errors    = 0

    while True:
        try:
            sensor_col, prediction_col = mongo_mgr.get_collections()

            # Fetch sensor docs that don't have a prediction yet
            records = fetch_unprocessed_records(sensor_col, prediction_col)

            if records:
                print(f"[{_now()}]  Found {len(records)} new record(s).")

                for record in records:
                    doc_id = record["_id"]
                    try:
                        result  = process_record(record, models)
                        success = write_prediction_results(prediction_col, record, result)

                        if success:
                            total_processed += 1
                            _print_result(record, result)
                        else:
                            logger.warning("Insert not acknowledged for sensor doc %s", doc_id)

                    except Exception as e:
                        total_errors += 1
                        logger.error("Error on record %s: %s", doc_id, e, exc_info=True)
                        # Write an error prediction so this record is not retried
                        try:
                            write_prediction_results(
                                prediction_col,
                                record,
                                {"mlError": str(e), "overallSystemStatus": "UNKNOWN"},
                            )
                        except Exception:
                            pass

            else:
                # No new sensor data — show latest prediction
                latest_pred = fetch_latest_prediction(prediction_col)
                latest_sensor = fetch_latest_sensor_record(sensor_col)

                if latest_pred is not None:
                    _print_latest_status(latest_pred)
                elif latest_sensor is not None:
                    print(f"[{_now()}]  [NO NEW DATA]  Latest sensor: "
                          f"Flow={latest_sensor.get('flowSensorData','?')}  "
                          f"Pressure={latest_sensor.get('pressureSensorData','?')}  "
                          f"Tank={latest_sensor.get('tankLevelSensorData','?')}  "
                          f"(not yet predicted)")
                else:
                    print(f"[{_now()}]  No sensor records yet — waiting...")

        except KeyboardInterrupt:
            print(f"\n\n  Monitoring stopped.")
            print(f"  Total processed : {total_processed}")
            print(f"  Total errors    : {total_errors}")
            break

        except Exception as e:
            logger.error("Pipeline error: %s — retrying in %ds", e, PREDICTION_INTERVAL_SECONDS)
            print(f"[{_now()}]  ⚠ ERROR: {e}  (retrying in {PREDICTION_INTERVAL_SECONDS}s...)")

        time.sleep(PREDICTION_INTERVAL_SECONDS)


# ---------------------------------------------------------------------------
# Console output helpers
# ---------------------------------------------------------------------------

def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def _print_result(record: dict, result: dict):
    pred     = result.get("mlPredictionData")
    prob     = result.get("mlProbability")
    label    = "LEAK" if pred == 1 else ("NORMAL" if pred == 0 else "?")
    prob_str = f"{prob:.1f}%" if prob is not None else "N/A"

    print(
        f"  [{_now()}]  "
        f"Flow={record.get('flowSensorData','?')}  "
        f"Pressure={record.get('pressureSensorData','?')}  "
        f"Tank={record.get('tankLevelSensorData','?')}  "
        f"Turbidity={record.get('turbiditySensorData','?')}  "
        f"→  {label}  {prob_str}  Severity={result.get('mlSeverity','?')}  |  "
        f"FlowA={result.get('flowAnomaly','?')}  "
        f"PressA={result.get('pressureAnomaly','?')}  "
        f"TankA={result.get('tankLevelAnomaly','?')}  |  "
        f"WQ={result.get('waterQualityStatus','?')}  "
        f"WaterLoss={result.get('waterLossRate','N/A')} L/hr  |  "
        f"Status={result.get('overallSystemStatus','?')}  "
        f"→ saved to ml_predictions"
    )


def _print_latest_status(pred_doc: dict):
    pred     = pred_doc.get("mlPredictionData")
    prob     = pred_doc.get("mlProbability")
    label    = "LEAK" if pred == 1 else ("NORMAL" if pred == 0 else "?")
    prob_str = f"{prob:.1f}%" if isinstance(prob, (int, float)) else "N/A"

    print(
        f"[{_now()}]  [NO NEW DATA — latest prediction]  "
        f"createdAt={pred_doc.get('createdAt','?')}  "
        f"Flow={pred_doc.get('flowSensorData','?')}  "
        f"Pressure={pred_doc.get('pressureSensorData','?')}  "
        f"Tank={pred_doc.get('tankLevelSensorData','?')}  "
        f"Turbidity={pred_doc.get('turbiditySensorData','?')}\n"
        f"             →  {label}  {prob_str}  "
        f"Severity={pred_doc.get('mlSeverity','?')}  "
        f"WaterLoss={pred_doc.get('waterLossRate','N/A')} L/hr  "
        f"Status={pred_doc.get('overallSystemStatus','?')}  "
        f"processedAt={pred_doc.get('mlProcessedAt','?')}"
    )


if __name__ == "__main__":
    run_prediction_pipeline()
