"""
mongo_loader.py
---------------
Handles all MongoDB interactions for the real-time prediction pipeline.

Flow:
  READ  → from 'sensors' collection      (raw ESP32 data from Node.js)
  WRITE → to   'ml_predictions' collection (ML results stored separately)

The 'sensors' collection is NEVER modified.
Each prediction document in 'ml_predictions' links back to the original
sensor document via 'sensorDocumentId'.
"""

import logging
from datetime import datetime, timezone
from typing import Optional

from pymongo import MongoClient, errors as mongo_errors
from pymongo.collection import Collection

from src.config.config import MONGO_URI, MONGO_DATABASE, MONGO_COLLECTION

logger = logging.getLogger(__name__)

# Predictions are stored in a separate collection
ML_PREDICTIONS_COLLECTION = "ml_predictions"


# ---------------------------------------------------------------------------
# Connection management
# ---------------------------------------------------------------------------

class MongoConnectionManager:
    """
    Maintains two live MongoDB collection references:
      - sensor_col      : reads raw sensor data (sensors)
      - prediction_col  : writes ML results     (ml_predictions)

    Reconnects automatically if the connection is lost.
    """

    def __init__(
        self,
        uri: str = MONGO_URI,
        database: str = MONGO_DATABASE,
        sensor_collection: str = MONGO_COLLECTION,
        prediction_collection: str = ML_PREDICTIONS_COLLECTION,
    ):
        self._uri                  = uri
        self._database             = database
        self._sensor_col_name      = sensor_collection
        self._prediction_col_name  = prediction_collection
        self._client: Optional[MongoClient] = None
        self._sensor_col: Optional[Collection] = None
        self._prediction_col: Optional[Collection] = None

    def get_collections(self) -> tuple[Collection, Collection]:
        """
        Return (sensor_collection, prediction_collection).
        Reconnects if the connection dropped.
        """
        if self._client is None:
            self._connect()
        else:
            try:
                self._client.admin.command("ping")
            except (mongo_errors.ConnectionFailure, mongo_errors.ServerSelectionTimeoutError):
                logger.warning("MongoDB connection lost — reconnecting...")
                self._connect()
        return self._sensor_col, self._prediction_col

    def _connect(self):
        self._client = MongoClient(self._uri, serverSelectionTimeoutMS=10_000)
        self._client.admin.command("ping")
        db = self._client[self._database]
        self._sensor_col     = db[self._sensor_col_name]
        self._prediction_col = db[self._prediction_col_name]
        logger.info(
            "MongoDB connected: %s  |  read=%s  write=%s",
            self._database,
            self._sensor_col_name,
            self._prediction_col_name,
        )
        print(f"  ✓ MongoDB connected")
        print(f"    Reading from  : {self._database}.{self._sensor_col_name}")
        print(f"    Writing to    : {self._database}.{self._prediction_col_name}")


# ---------------------------------------------------------------------------
# Fetching unprocessed sensor records
# ---------------------------------------------------------------------------

def fetch_unprocessed_records(
    sensor_col: Collection,
    prediction_col: Collection,
) -> list[dict]:
    """
    Return sensor documents that have NOT yet been processed.

    A sensor document is considered processed if a prediction document
    already exists in ml_predictions with a matching sensorDocumentId.

    Parameters
    ----------
    sensor_col     : the sensors collection (read)
    prediction_col : the ml_predictions collection (check for duplicates)

    Returns
    -------
    list[dict]  Unprocessed sensor documents
    """
    # Get all sensor _ids that have already been predicted
    processed_ids = set(
        doc["sensorDocumentId"]
        for doc in prediction_col.find({}, {"sensorDocumentId": 1})
    )

    # Return sensor documents not yet predicted
    all_sensors = list(sensor_col.find())
    unprocessed = [doc for doc in all_sensors if doc["_id"] not in processed_ids]
    return unprocessed


def fetch_latest_sensor_record(sensor_col: Collection) -> dict | None:
    """
    Return the most recently inserted sensor document.
    Used to show live status when there are no new records.
    """
    return sensor_col.find_one(sort=[("_id", -1)])


def fetch_latest_prediction(prediction_col: Collection) -> dict | None:
    """
    Return the most recently written prediction document.
    """
    return prediction_col.find_one(sort=[("_id", -1)])


# ---------------------------------------------------------------------------
# Writing prediction results to ml_predictions collection
# ---------------------------------------------------------------------------

def write_prediction_results(
    prediction_col: Collection,
    sensor_record: dict,
    results: dict,
) -> bool:
    """
    Insert a new document into the ml_predictions collection.

    The document contains:
      - All original sensor values (copied for easy dashboard access)
      - sensorDocumentId  → links back to the original sensors document
      - All ML prediction fields
      - mlProcessedAt     → UTC timestamp

    The sensors collection is NEVER touched.

    Parameters
    ----------
    prediction_col : ml_predictions collection
    sensor_record  : original sensor document from sensors collection
    results        : ML output fields dict

    Returns
    -------
    bool  True if insert was acknowledged
    """
    now = datetime.now(timezone.utc).isoformat()

    prediction_doc = {
        # Link to the original sensor document
        "sensorDocumentId":    sensor_record["_id"],

        # Copy sensor values for easy dashboard access
        "flowSensorData":      sensor_record.get("flowSensorData"),
        "pressureSensorData":  sensor_record.get("pressureSensorData"),
        "tankLevelSensorData": sensor_record.get("tankLevelSensorData"),
        "turbiditySensorData": sensor_record.get("turbiditySensorData"),
        "createdAt":           sensor_record.get("createdAt"),

        # All ML prediction fields
        **results,

        # Processing timestamp
        "mlProcessedAt": now,
    }

    outcome = prediction_col.insert_one(prediction_doc)
    return outcome.acknowledged
