/**
 * criticalLeak.service.js
 *
 * Creates and manages LeakEvent documents from ML predictions.
 *
 * Key rule:
 *   ONE incident per continuous CRITICAL+leak block.
 *   A new incident is created only when:
 *     - A CRITICAL+leak prediction follows a non-critical one (transition)
 *     - OR the server restarted and there is no open incident for the
 *       current critical block (handled by ensureCurrentCriticalLeakIncident)
 */

import { randomBytes } from "node:crypto";
import LeakEvent     from "../models/leakEvent.model.js";
import MlPrediction  from "../models/mlPrediction.model.js";
import { notifyLeakEvent } from "./notification.service.js";

// ── Helpers ────────────────────────────────────────────────────────────────

export function isCriticalLeakPrediction(prediction) {
  return (
    prediction.overallSystemStatus === "CRITICAL" &&
    prediction.mlPredictionData === 1
  );
}

/** True only on a non-critical → critical TRANSITION. */
export function isCriticalLeakAlert(prediction, previousAlert) {
  return isCriticalLeakPrediction(prediction) && !previousAlert;
}

// ── Core creator ───────────────────────────────────────────────────────────

/**
 * Create a new LeakEvent for a critical prediction, or return the existing
 * one if this prediction is already linked to an event.
 *
 * Idempotent: safe to call multiple times for the same prediction.
 */
export async function createCriticalLeakEvent(prediction) {
  // Return existing event if already linked to this prediction
  const existing = await LeakEvent.findOne({
    $or: [
      { criticalAlertRef: prediction._id },
      { predictionRef:    prediction._id },
    ],
  }).lean();
  if (existing) return existing;

  const severity = String(prediction.mlSeverity || "").toUpperCase();
  if (!["LOW", "MEDIUM", "HIGH"].includes(severity)) {
    throw new Error(
      `Prediction ${prediction._id} has invalid severity "${prediction.mlSeverity}".`
    );
  }

  const now        = new Date();
  const incidentId =
    `WLD-${now.toISOString().slice(0, 10).replace(/-/g, "")}-` +
    randomBytes(3).toString("hex").toUpperCase();

  let leak;
  try {
    leak = await LeakEvent.create({
      incidentId,
      criticalAlertRef:         prediction._id,
      predictionRef:            prediction._id,
      lastProcessedPredictionId: prediction._id,
      severity,
      status: "OPEN_FOR_PROPOSALS",
      sensorSnapshot: {
        flowSensorData:      prediction.flowSensorData,
        pressureSensorData:  prediction.pressureSensorData,
        tankLevelSensorData: prediction.tankLevelSensorData,
        turbiditySensorData: prediction.turbiditySensorData,
        mlProbability:       prediction.mlProbability,
        mlSeverity:          prediction.mlSeverity,
        waterLossRate:       prediction.waterLossRate,
        overallSystemStatus: prediction.overallSystemStatus,
        detectedAt:          prediction.mlProcessedAt
          ? new Date(prediction.mlProcessedAt)
          : now,
      },
      statusHistory: [{
        status: "OPEN_FOR_PROPOSALS",
        reason: "Automatically created from a critical leak alert.",
        at: now,
      }],
    });
  } catch (err) {
    if (err.code === 11000) {
      // Race condition — another process inserted concurrently
      const dup = await LeakEvent.findOne({
        $or: [
          { criticalAlertRef: prediction._id },
          { predictionRef:    prediction._id },
        ],
      }).lean();
      if (dup) return dup;
    }
    throw err;
  }

  console.log(
    `[LEAK] ✓ Created incident ${leak.incidentId} | severity=${severity} | ` +
    `loss=${prediction.waterLossRate ?? "?"}L/hr | prob=${prediction.mlProbability ?? "?"}%`
  );

  // Fire-and-forget — never block the response waiting for email
  notifyLeakEvent(leak).catch((err) => {
    console.error(
      `[EMAIL] Notification failed for ${leak.incidentId}: ${err.message}`
    );
  });

  return leak;
}

// ── Startup recovery ───────────────────────────────────────────────────────

/**
 * Called on server startup and by the admin listLeaks endpoint.
 *
 * If the LATEST prediction is CRITICAL+leak, ensure there is an open
 * incident for its current continuous critical block.
 *
 * Logic:
 *  1. Find the latest critical+leak prediction.
 *  2. Walk backwards to find the first non-critical/non-leak prediction
 *     (= the start of the current block).
 *  3. Find the first critical+leak prediction after that break.
 *  4. If no open incident references a prediction in this block, create one.
 */
export async function ensureCurrentCriticalLeakIncident() {
  const latest = await MlPrediction.findOne()
    .sort({ _id: -1 })
    .select("_id overallSystemStatus mlPredictionData mlSeverity waterLossRate mlProbability")
    .lean();

  if (!latest || !isCriticalLeakPrediction(latest)) return null;

  // Find the last non-critical prediction before the current block
  const blockStart = await MlPrediction.findOne({
    _id: { $lt: latest._id },
    $or: [
      { overallSystemStatus: { $ne: "CRITICAL" } },
      { mlPredictionData:    { $ne: 1 } },
    ],
  })
    .sort({ _id: -1 })
    .select("_id")
    .lean();

  // The trigger prediction is the FIRST critical one after blockStart
  const triggerQuery = {
    overallSystemStatus: "CRITICAL",
    mlPredictionData:    1,
    ...(blockStart ? { _id: { $gt: blockStart._id } } : {}),
  };
  const triggerPrediction = await MlPrediction.findOne(triggerQuery)
    .sort({ _id: 1 })
    .lean();

  if (!triggerPrediction) return null;

  // Is there already an open incident for this block?
  const openIncident = await LeakEvent.findOne({
    status: { $in: ["OPEN_FOR_PROPOSALS", "DETECTED"] },
    criticalAlertRef: triggerPrediction._id,
  }).lean();

  if (openIncident) {
    console.log(
      `[LEAK] Open incident ${openIncident.incidentId} already covers current critical block.`
    );
    return openIncident;
  }

  // No open incident for this trigger → create one now
  console.log(
    `[LEAK] No open incident for current critical block starting at ${triggerPrediction._id}. Creating…`
  );
  return createCriticalLeakEvent(triggerPrediction);
}
