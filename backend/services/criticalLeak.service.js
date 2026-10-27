import LeakEvent from "../models/leakEvent.model.js";
import MlPrediction from "../models/mlPrediction.model.js";
import { randomBytes } from "node:crypto";
import { notifyLeakEvent } from "./notification.service.js";

export function isCriticalLeakPrediction(prediction) {
  return prediction.overallSystemStatus === "CRITICAL" &&
    prediction.mlPredictionData === 1;
}

export function isCriticalLeakAlert(prediction, previousAlert) {
  return isCriticalLeakPrediction(prediction) && !previousAlert;
}

export async function createCriticalLeakEvent(prediction) {
  const existing = await LeakEvent.findOne({
    $or: [
      { criticalAlertRef: prediction._id },
      { predictionRef: prediction._id },
    ],
  }).lean();
  if (existing) return existing;

  const severity = String(prediction.mlSeverity || "").toUpperCase();
  if (!["LOW", "MEDIUM", "HIGH"].includes(severity)) {
    throw new Error(`Critical alert ${prediction._id} has an invalid severity.`);
  }

  const now = new Date();
  const incidentId = `WLD-${now.toISOString().slice(0, 10).replace(/-/g, "")}-${randomBytes(3).toString("hex").toUpperCase()}`;
  let leak;
  try {
    leak = await LeakEvent.create({
      incidentId,
      criticalAlertRef: prediction._id,
      predictionRef: prediction._id,
      lastProcessedPredictionId: prediction._id,
      severity,
      status: "OPEN_FOR_PROPOSALS",
      sensorSnapshot: {
        flowSensorData: prediction.flowSensorData,
        pressureSensorData: prediction.pressureSensorData,
        tankLevelSensorData: prediction.tankLevelSensorData,
        turbiditySensorData: prediction.turbiditySensorData,
        mlProbability: prediction.mlProbability,
        mlSeverity: prediction.mlSeverity,
        waterLossRate: prediction.waterLossRate,
        overallSystemStatus: prediction.overallSystemStatus,
        detectedAt: prediction.mlProcessedAt ? new Date(prediction.mlProcessedAt) : now,
      },
      statusHistory: [{
        status: "OPEN_FOR_PROPOSALS",
        reason: "Automatically created from a critical leak alert.",
      }],
    });
  } catch (err) {
    if (err.code === 11000) {
      const duplicate = await LeakEvent.findOne({
        $or: [
          { criticalAlertRef: prediction._id },
          { predictionRef: prediction._id },
        ],
      }).lean();
      if (duplicate) return duplicate;
    }
    throw err;
  }

  console.log(`[LEAK] Created repair incident ${leak.incidentId} from critical alert ${prediction._id}. severity=${severity} waterLoss=${prediction.waterLossRate ?? "?"} L/hr`);
  notifyLeakEvent(leak).catch((err) => {
    console.error(`[EMAIL] Leak notification preparation failed for ${leak.incidentId}: ${err.message}`);
  });
  return leak;
}

export async function ensureCurrentCriticalLeakIncident() {
  const latest = await MlPrediction.findOne()
    .sort({ _id: -1 })
    .select("_id overallSystemStatus mlPredictionData")
    .lean();
  if (!latest || !isCriticalLeakPrediction(latest)) return null;

  const previousNonAlert = await MlPrediction.findOne({
    _id: { $lt: latest._id },
    $or: [
      { overallSystemStatus: { $ne: "CRITICAL" } },
      { mlPredictionData: { $ne: 1 } },
    ],
  })
    .sort({ _id: -1 })
    .select("_id overallSystemStatus mlPredictionData")
    .lean();
  const firstCriticalLeak = await MlPrediction.findOne({
    _id: {
      ...(previousNonAlert ? { $gt: previousNonAlert._id } : {}),
      $lte: latest._id,
    },
    overallSystemStatus: "CRITICAL",
    mlPredictionData: 1,
  })
    .sort({ _id: 1 })
    .lean();

  if (!firstCriticalLeak || !isCriticalLeakAlert(
    firstCriticalLeak,
    previousNonAlert ? isCriticalLeakPrediction(previousNonAlert) : false
  )) {
    return null;
  }

  return createCriticalLeakEvent(firstCriticalLeak);
}
