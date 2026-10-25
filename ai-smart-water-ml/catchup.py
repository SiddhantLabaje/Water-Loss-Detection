"""
catchup.py — process all unprocessed sensor records immediately.
Run: python catchup.py
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

from dotenv import load_dotenv
load_dotenv()

from pymongo import MongoClient
from src.config.config import MONGO_URI, MONGO_DATABASE, MONGO_COLLECTION, PREDICTION_INTERVAL_SECONDS
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

client     = MongoClient(MONGO_URI, serverSelectionTimeoutMS=8000)
sensor_col = client[MONGO_DATABASE][MONGO_COLLECTION]
pred_col   = client[MONGO_DATABASE][ML_PREDICTIONS_COLLECTION]

processed_ids = set(d["sensorDocumentId"] for d in pred_col.find({}, {"sensorDocumentId": 1}))
unprocessed   = [r for r in sensor_col.find() if r["_id"] not in processed_ids]

print(f"Unprocessed records: {len(unprocessed)}")
if not unprocessed:
    print("Nothing to do.")
    sys.exit(0)

print("Loading models...")
leak_model     = load_leak_model()
anomaly_models = load_anomaly_models()
wl_model       = load_water_loss_model()
print("Models loaded. Processing...")

for i, rec in enumerate(unprocessed, 1):
    try:
        X      = record_to_dataframe(rec)
        lr     = predict_leak(leak_model, X)
        sev    = calculate_severity(lr["mlProbability"])
        anom   = predict_anomalies(anomaly_models, rec)
        wq     = calculate_water_quality(get_turbidity(rec))
        wl     = predict_water_loss(wl_model, rec, ml_prediction=lr["mlPredictionData"],
                                    monitoring_time_seconds=PREDICTION_INTERVAL_SECONDS)
        status = calculate_overall_status(
            lr["mlPredictionData"], sev,
            anom.get("flowAnomaly", "NORMAL"),
            anom.get("pressureAnomaly", "NORMAL"),
            anom.get("tankLevelAnomaly", "NORMAL"), wq
        )
        result = {**lr, "mlSeverity": sev, **anom,
                  "waterQualityStatus": wq, **wl, "overallSystemStatus": status}
        write_prediction_results(pred_col, rec, result)
        print(f"  [{i}/{len(unprocessed)}] flow={rec.get('flowSensorData')} "
              f"pressure={rec.get('pressureSensorData')} -> {status} ({lr['mlProbability']}%)")
    except Exception as e:
        print(f"  [{i}] ERROR: {e}")

print(f"\nDone. Processed {len(unprocessed)} records.")
