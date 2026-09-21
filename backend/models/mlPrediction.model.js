import mongoose from "mongoose";

/**
 * Mirrors the documents written by the Python ML pipeline
 * into the `ml_predictions` collection.
 *
 * Every document here links back to a `sensors` document via
 * `sensorDocumentId`.  Sensor values are copied for fast reads.
 */
const mlPredictionSchema = new mongoose.Schema(
  {
    // Link to the original sensors document
    sensorDocumentId: { type: mongoose.Schema.Types.ObjectId, ref: "Sensor" },

    // ── Sensor snapshot (copied from sensors collection) ────────────
    flowSensorData:      { type: Number },
    pressureSensorData:  { type: Number },
    tankLevelSensorData: { type: Number },
    turbiditySensorData: { type: Number },
    createdAt:           { type: mongoose.Schema.Types.Mixed }, // keep original string/date

    // ── Leak Detection (RandomForestClassifier) ──────────────────────
    mlPredictionData: { type: Number },   // 0 = NORMAL, 1 = LEAK
    mlProbability:    { type: Number },   // 0.0 – 100.0 %
    mlSeverity:       { type: String },   // LOW | MEDIUM | HIGH

    // ── Anomaly Detection (IsolationForest × 3) ─────────────────────
    flowAnomaly:      { type: String },   // NORMAL | ABNORMAL
    pressureAnomaly:  { type: String },
    tankLevelAnomaly: { type: String },

    // ── Water Quality (turbidity threshold) ─────────────────────────
    waterQualityStatus: { type: String }, // GOOD | MODERATE | POOR | UNKNOWN

    // ── Water Loss (RandomForestRegressor + formulas) ────────────────
    waterLossRate:          { type: Number }, // L/hr  (ML predicted)
    waterLossFlowLoss:      { type: Number }, // L/hr  (formula 1 component)
    waterLossVolumePerHour: { type: Number }, // L/hr  (same as rate, dashboard label)
    waterLossVolume:        { type: Number }, // Litres lost this interval
    waterLossUnit:          { type: String, default: "L/hr" },

    // ── Overall Status (rule-based) ──────────────────────────────────
    overallSystemStatus: { type: String }, // NORMAL | WARNING | CRITICAL

    // ── Error field (set when prediction fails) ──────────────────────
    mlError: { type: String },

    // ── Processing timestamp (UTC ISO string from Python) ────────────
    mlProcessedAt: { type: String },
  },
  {
    collection: "ml_predictions",
    // Disable Mongoose auto-timestamps — Python manages mlProcessedAt
    timestamps: false,
  }
);

// Index for fast "latest prediction" and "unprocessed" queries
mlPredictionSchema.index({ mlProcessedAt: -1 });
mlPredictionSchema.index({ sensorDocumentId: 1 });

const MlPrediction = mongoose.model("MlPrediction", mlPredictionSchema);

export default MlPrediction;
