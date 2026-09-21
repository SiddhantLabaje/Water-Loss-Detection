"""
seed_last_record.py
-------------------
Takes the LAST row from the training Excel dataset and inserts it into
MongoDB as if it came from the ESP32 / Node.js pipeline.

This lets you verify the full prediction pipeline is working correctly
before any live ESP32 data arrives.

Run ONCE:
    python seed_last_record.py

Then start the prediction pipeline:
    python src/pipeline/prediction_pipeline.py
"""

import sys
from pathlib import Path
from datetime import datetime, timezone

sys.path.insert(0, str(Path(__file__).resolve().parent))

from src.config.config import MONGO_URI, MONGO_DATABASE, MONGO_COLLECTION, TRAINING_FILE
from src.data.excel_loader import load_training_data
from pymongo import MongoClient


def seed():
    print("\n" + "=" * 60)
    print("  SEEDING MongoDB with last training record")
    print("=" * 60)

    # Load training data
    print(f"\n  Loading: {TRAINING_FILE}")
    df = load_training_data()

    # Take the very last row
    last_row = df.iloc[-1].to_dict()

    # Build the document — mimic what Node.js / ESP32 would send
    # Keep only the raw sensor fields (NO predictionData, NO ml* fields)
    doc = {
        "flowSensorData":      float(last_row.get("flowSensorData", 0)),
        "pressureSensorData":  float(last_row.get("pressureSensorData", 0)),
        "tankLevelSensorData": float(last_row.get("tankLevelSensorData", 0)),
        "turbiditySensorData": float(last_row.get("turbiditySensorData", 0)),
        "createdAt":           str(last_row.get("createdAt", datetime.now(timezone.utc).isoformat())),
        "_seededFromExcel":    True,   # marker so you know this is test data
    }

    print(f"\n  Document to insert:")
    for k, v in doc.items():
        print(f"    {k:<25}: {v}")

    # Connect and insert
    client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=8000)
    client.admin.command("ping")
    col = client[MONGO_DATABASE][MONGO_COLLECTION]

    result = col.insert_one(doc)
    print(f"\n  ✓ Inserted with _id: {result.inserted_id}")
    print(f"\n  Collection now has {col.count_documents({})} document(s).")
    print(f"\n  Now run the prediction pipeline:")
    print(f"    python src/pipeline/prediction_pipeline.py")
    print("=" * 60 + "\n")


if __name__ == "__main__":
    seed()
