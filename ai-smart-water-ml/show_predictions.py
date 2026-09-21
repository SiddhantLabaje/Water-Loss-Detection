"""
show_predictions.py
-------------------
Shows the latest prediction documents from the ml_predictions collection.

Run with:
    python show_predictions.py
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))

from src.config.config import MONGO_URI, MONGO_DATABASE, MONGO_COLLECTION
from src.data.mongo_loader import ML_PREDICTIONS_COLLECTION
from pymongo import MongoClient

client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
db     = client[MONGO_DATABASE]

sensor_col     = db[MONGO_COLLECTION]
prediction_col = db[ML_PREDICTIONS_COLLECTION]

sensor_count     = sensor_col.count_documents({})
prediction_count = prediction_col.count_documents({})

print(f"\n{'='*60}")
print(f"  MongoDB  →  {MONGO_DATABASE}")
print(f"{'='*60}")
print(f"  sensors          : {sensor_count} document(s)   ← raw ESP32 data (untouched)")
print(f"  ml_predictions   : {prediction_count} document(s)   ← ML results (separate collection)")

docs = list(prediction_col.find(sort=[("mlProcessedAt", -1)], limit=5))

if not docs:
    print("\n  No predictions yet. Run the prediction pipeline first.")
else:
    print(f"\n  Last {len(docs)} prediction(s):\n")
    for i, doc in enumerate(docs, 1):
        pred  = doc.get("mlPredictionData")
        label = "LEAK" if pred == 1 else ("NORMAL" if pred == 0 else "?")
        print(f"  [{i}] Prediction _id    : {doc['_id']}")
        print(f"      sensorDocumentId  : {doc.get('sensorDocumentId','?')}  ← links to sensors collection")
        print(f"      createdAt         : {doc.get('createdAt','?')}")
        print(f"      ── Sensor Values ───────────────────────────")
        print(f"      flowSensorData    : {doc.get('flowSensorData','?')}")
        print(f"      pressureSensorData: {doc.get('pressureSensorData','?')}")
        print(f"      tankLevelSensorData:{doc.get('tankLevelSensorData','?')}")
        print(f"      turbiditySensorData:{doc.get('turbiditySensorData','?')}")
        print(f"      ── ML Results ──────────────────────────────")
        print(f"      mlPredictionData  : {pred}  ({label})")
        print(f"      mlProbability     : {doc.get('mlProbability','?')} %")
        print(f"      mlSeverity        : {doc.get('mlSeverity','?')}")
        print(f"      flowAnomaly       : {doc.get('flowAnomaly','?')}")
        print(f"      pressureAnomaly   : {doc.get('pressureAnomaly','?')}")
        print(f"      tankLevelAnomaly  : {doc.get('tankLevelAnomaly','?')}")
        print(f"      waterQualityStatus: {doc.get('waterQualityStatus','?')}")
        print(f"      waterLossRate     : {doc.get('waterLossRate','?')} L/hr")
        print(f"      waterLossVolume   : {doc.get('waterLossVolume','?')} Litres")
        print(f"      overallSystemStatus:{doc.get('overallSystemStatus','?')}")
        print(f"      mlProcessedAt     : {doc.get('mlProcessedAt','?')}")
        print()
