import mongoose from "mongoose";

const leakEventSchema = new mongoose.Schema(
  {
    incidentId: {
      type: String, required: true, unique: true,
      // Format: WLD-YYYYMMDD-XXXX
    },
    activeKey: { type: String, default: undefined },
    // Reference to the ml_predictions document that triggered this
    predictionRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MlPrediction",
      required: true,
    },
    // Sensor snapshot at detection time
    sensorSnapshot: {
      flowSensorData:      { type: Number },
      pressureSensorData:  { type: Number },
      tankLevelSensorData: { type: Number },
      turbiditySensorData: { type: Number },
      mlProbability:       { type: Number },
      mlSeverity:          { type: String },
      waterLossRate:       { type: Number },
      overallSystemStatus: { type: String },
      detectedAt:          { type: Date },
    },
    severity: {
      type: String,
      enum: ["LOW", "MEDIUM", "HIGH"],
      required: true,
    },
    status: {
      type: String,
      enum: [
        "DETECTED",
        "OPEN_FOR_PROPOSALS",
        "ASSIGNED",
        "REPAIR_IN_PROGRESS",
        "REPAIR_REPORTED_COMPLETE",
        "VERIFYING_RECOVERY",
        "RECOVERED",
        "CANCELLED",
        "RECOVERY_FAILED",
        "AWAITING_INSPECTION",
      ],
      default: "DETECTED",
    },
    // Notification tracking
    notificationStatus: {
      adminNotified: { type: Boolean, default: false },
      plumbersNotified: { type: Number, default: 0 },
      lastNotifiedAt: { type: Date, default: null },
    },
    // Deduplication — track the prediction ID that opened this event
    // to prevent re-opening for the same continuous leak
    lastProcessedPredictionId: { type: mongoose.Schema.Types.ObjectId, default: null },
    statusHistory: [
      {
        status: String,
        changedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        reason: String,
        at: { type: Date, default: Date.now },
      },
    ],
  },
  { collection: "leak_events", timestamps: true }
);

leakEventSchema.index({ status: 1 });
leakEventSchema.index({ severity: 1 });
leakEventSchema.index({ createdAt: -1 });
leakEventSchema.index({ incidentId: 1 }, { unique: true });
leakEventSchema.index({ activeKey: 1 }, { unique: true, sparse: true });

const LeakEvent = mongoose.model("LeakEvent", leakEventSchema);
export default LeakEvent;
