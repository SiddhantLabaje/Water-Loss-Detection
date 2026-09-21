import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))

from src.config.config import MONGO_URI, MONGO_DATABASE, MONGO_COLLECTION
from pymongo import MongoClient

client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
client.admin.command("ping")
col = client[MONGO_DATABASE][MONGO_COLLECTION]

total = col.count_documents({})
print(f"Database   : {MONGO_DATABASE}")
print(f"Collection : {MONGO_COLLECTION}")
print(f"Total docs : {total}")

if total > 0:
    latest = col.find_one(sort=[("_id", -1)])
    print("\nLatest document:")
    for k, v in latest.items():
        print(f"  {k}: {v}")
else:
    print("\nCollection is EMPTY.")
