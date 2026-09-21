"""
clean_sensors.py
----------------
Removes ALL non-original fields from the sensors collection.
Keeps only what ESP32 / Node.js originally inserted.

Fields KEPT:
    _id, entryId, flowSensorData, pressureSensorData,
    tankLevelSensorData, turbiditySensorData, predictionData,
    createdAt, updatedAt, __v

Everything else is removed.

Run with:
    python clean_sensors.py
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))

from src.config.config import MONGO_URI, MONGO_DATABASE, MONGO_COLLECTION
from pymongo import MongoClient

# Only these fields belong in sensors collection
KEEP_FIELDS = {
    "_id", "entryId",
    "flowSensorData", "pressureSensorData",
    "tankLevelSensorData", "turbiditySensorData",
    "predictionData", "createdAt", "updatedAt", "__v"
}

client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
col    = client[MONGO_DATABASE][MONGO_COLLECTION]

total = col.count_documents({})
print(f"\n{'='*60}")
print(f"  Cleaning sensors collection")
print(f"  {MONGO_DATABASE}.{MONGO_COLLECTION}")
print(f"{'='*60}")
print(f"\n  Total documents : {total}")

if total == 0:
    print("  Collection is empty. Nothing to clean.")
    sys.exit(0)

# Find all field names that exist across all documents
all_fields = set()
for doc in col.find():
    all_fields.update(doc.keys())

# Fields to remove = everything NOT in KEEP_FIELDS
fields_to_remove = all_fields - KEEP_FIELDS
print(f"\n  Fields to KEEP  : {sorted(KEEP_FIELDS - {'_id'})}")
print(f"  Fields to REMOVE: {sorted(fields_to_remove)}")

if not fields_to_remove:
    print("\n  ✓ Collection is already clean. Nothing to remove.")
    sys.exit(0)

# Show sample before
sample_before = col.find_one()
print(f"\n  Sample document BEFORE cleaning:")
for k, v in sample_before.items():
    tag = " ← REMOVE" if k in fields_to_remove else " ← KEEP"
    print(f"    {k:<30}: {str(v)[:50]}{tag}")

confirm = input("\n  Proceed with cleanup? (yes/no): ").strip().lower()
if confirm != "yes":
    print("  Cancelled.")
    sys.exit(0)

# Remove all non-original fields in one pass
unset_fields = {field: "" for field in fields_to_remove}
result = col.update_many({}, {"$unset": unset_fields})
print(f"\n  ✓ Cleaned {result.modified_count} document(s).")

# Show sample after
sample_after = col.find_one()
print(f"\n  Sample document AFTER cleaning:")
for k, v in sample_after.items():
    print(f"    {k:<30}: {v}")

print(f"\n  ✓ Done. sensors collection contains only original ESP32 data.")
print(f"\n  Run the prediction pipeline — ML results go to ml_predictions:")
print(f"    python src/pipeline/prediction_pipeline.py\n")
