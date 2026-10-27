/**
 * criticalLeak.service.js
 *
 * One incident per continuous CRITICAL+leak block.
 * A new incident is created only when a genuinely NEW critical block starts
 * (non-critical → critical transition), or when the server restarts and there
 * is no OPEN_FOR_PROPOSALS incident covering the current block.
 */

import { randomBytes } from "node:crypto";
import LeakEvent    from "../models/leakEvent.model.js";
import MlPrediction from "../models/mlPrediction.model.js";
import { notifyLeakEvent } from "./notification.service.js";

// ── Helpers ────────────────────────────────────────────────────────────────

export function isCriticalLeakPrediction(p) {
  return p.overallSystemStatus === "CRITICAL" && p.mlPredictionData === 1;
}

export function isCriticalLeakAlert(prediction, previousWasCritical) {
  return isCriticalLeakPrediction(prediction) && !previousWasCritical;
}

// ── Core creator ───────────────────────────────────────────────────────────

/**
 * Create a new LeakEvent for `prediction`, or return the one that already
 * exists for it. Idempotent — safe to call multiple times.
 */
export async function createCriticalLeakEvent(prediction) {
  // Already linked?
  const existing = await LeakEvent.findOne({
    $or: [
      { criticalAlertRef: prediction._id },
      { predictionRef:    prediction._id },
    ],
  }).lean();
  if (existing) return existing;

  const severity = String(prediction.mlSeverity || "").toUpperCase();
  if (!["LOW", "MEDIUM", "HIGH"].includes(severity)) {
    throw new Error(`Prediction ${prediction._id} has invalid severity "${prediction.mlSeverity}".`);
  }

  const now        = new Date();
  const incidentId = `WLD-${now.toISOString().slice(0, 10).replace(/-/g, "")}-${randomBytes(3).toString("hex").toUpperCase()}`;

  let leak;
  try {
    leak = await LeakEvent.create({
      incidentId,
      criticalAlertRef:          prediction._id,
      predictionRef:             prediction._id,
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
        detectedAt:          prediction.mlProcessedAt ? new Date(prediction.mlProcessedAt) : now,
      },
      statusHistory: [{ status: "OPEN_FOR_PROPOSALS", reason: "Automatically created from a critical leak alert.", at: now }],
    });
  } catch (err) {
    // Concurrent insert race — return the winner
    if (err.code === 11000) {
      const dup = await LeakEvent.findOne({
        $or: [{ criticalAlertRef: prediction._id }, { predictionRef: prediction._id }],
      }).lean();
      if (dup) return dup;
    }
    throw err;
  }

  console.log(
    `[LEAK] ✓ New incident ${leak.incidentId} | ${severity} | ` +
    `loss=${prediction.waterLossRate ?? "?"}L/hr | prob=${prediction.mlProbability ?? "?"}%`
  );

  notifyLeakEvent(leak).catch((err) =>
    console.error(`[EMAIL] Notification failed for ${leak.incidentId}: ${err.message}`)
  );
  return leak;
}

// ── Startup / on-demand recovery ──────────────────────────────────────────

// Prevent concurrent calls from stacking up (e.g. multiple API requests firing at once)
let _ensureInFlight = null;

/**
 * Ensure there is an OPEN_FOR_PROPOSALS incident for the CURRENT continuous
 * critical block, if one exists.
 *
 * Logic:
 *   1. Latest prediction must be CRITICAL+leak, else nothing to do.
 *   2. Find the most recent non-critical prediction (= block boundary).
 *   3. Look for any open incident whose criticalAlertRef falls WITHIN
 *      this block (after the boundary, at or before the latest prediction).
 *   4. If found → done, log and return it.
 *   5. If not found → find the FIRST critical prediction of the block
 *      and create the incident from it.
 *
 * Deduplication: concurrent calls share the same Promise so only one
 * set of DB queries runs at a time.
 */
export function ensureCurrentCriticalLeakIncident() {
  if (_ensureInFlight) return _ensureInFlight;

  _ensureInFlight = _doEnsure().finally(() => {
    _ensureInFlight = null;
  });

  return _ensureInFlight;
}

async function _doEnsure() {
  // Step 1: latest prediction must be critical
  const latest = await MlPrediction.findOne()
    .sort({ _id: -1 })
    .select("_id overallSystemStatus mlPredictionData")
    .lean();

  if (!latest || !isCriticalLeakPrediction(latest)) return null;

  // Step 2: find block boundary (last non-critical prediction before latest)
  const blockBoundary = await MlPrediction.findOne({
    _id: { $lt: latest._id },
    $or: [
      { overallSystemStatus: { $ne: "CRITICAL" } },
      { mlPredictionData:    { $ne: 1 } },
    ],
  })
    .sort({ _id: -1 })
    .select("_id")
    .lean();

  const blockStartId = blockBoundary?._id ?? null;

  // Step 3: is there already an open incident whose trigger is within this block?
  const openQuery = {
    status: { $in: ["OPEN_FOR_PROPOSALS", "DETECTED"] },
    ...(blockStartId
      ? { criticalAlertRef: { $gt: blockStartId, $lte: latest._id } }
      : { criticalAlertRef: { $lte: latest._id } }),
  };
  const openIncident = await LeakEvent.findOne(openQuery)
    .sort({ createdAt: -1 })
    .lean();

  if (openIncident) {
    // Already have an open incident for this block — no action needed
    return openIncident;
  }

  // Step 4: find the FIRST critical prediction of this block (the trigger)
  const triggerQuery = {
    overallSystemStatus: "CRITICAL",
    mlPredictionData:    1,
    _id: {
      ...(blockStartId ? { $gt: blockStartId } : {}),
      $lte: latest._id,
    },
  };
  const trigger = await MlPrediction.findOne(triggerQuery).sort({ _id: 1 }).lean();

  if (!trigger) return null;

  console.log(
    `[LEAK] No open incident for current block starting at ${trigger._id}. Creating…`
  );
  return createCriticalLeakEvent(trigger);
}
