/**
 * broadcaster.service.js
 *
 * Polls ml_predictions every 5 seconds and:
 *  1. For every NEW prediction:
 *     - If it is CRITICAL+leak and there is no active open incident,
 *       create one immediately (handles both transitions AND ongoing blocks
 *       after a server restart).
 *     - Broadcast an SSE snapshot to all connected dashboard clients.
 *  2. On startup: scan ALL existing predictions to catch any incidents that
 *     were never created while the server was down.
 */

import MlPrediction      from "../models/mlPrediction.model.js";
import LeakEvent         from "../models/leakEvent.model.js";
import DashboardAnalytics from "../models/dashboardAnalytics.model.js";
import { broadcast, clientCount } from "./sse.service.js";
import { sendCriticalAlert }      from "./email.service.js";
import { retryFailedNotifications } from "./notification.service.js";
import {
  createCriticalLeakEvent,
  isCriticalLeakPrediction,
  isCriticalLeakAlert,
} from "./criticalLeak.service.js";

// ── In-memory state (reset on restart) ────────────────────────────────────
let lastSeenId       = null;   // ObjectId string of last processed prediction
let lastSystemStatus = null;
let lastCriticalLeak = false;
let tickInProgress   = false;

// ── Snapshot builder ───────────────────────────────────────────────────────
async function buildSnapshot() {
  const [latest, history, alerts, countRes] = await Promise.all([
    MlPrediction.findOne().sort({ _id: -1 }).lean(),
    MlPrediction.find().sort({ _id: -1 }).limit(30).lean(),
    MlPrediction.find({ overallSystemStatus: { $in: ["CRITICAL", "WARNING"] } })
      .sort({ _id: -1 }).limit(10).lean(),
    Promise.all([
      MlPrediction.countDocuments(),
      MlPrediction.countDocuments({ mlPredictionData: 1 }),
      MlPrediction.countDocuments({ overallSystemStatus: "CRITICAL" }),
      MlPrediction.countDocuments({ overallSystemStatus: "WARNING" }),
      MlPrediction.aggregate([{
        $group: {
          _id: null,
          avgLeakProbability: { $avg: "$mlProbability" },
          avgWaterLossRate:   { $avg: "$waterLossRate" },
        },
      }]),
    ]),
  ]);

  const [total, leakCount, criticalCount, warningCount, agg] = countRes;
  const aggData = agg[0] || {};

  let analytics = null;
  try { analytics = await DashboardAnalytics.findOne().sort({ updatedAt: -1 }).lean(); } catch {}

  return {
    latest, history, alerts, analytics,
    stats: {
      total,
      leakCount,
      leakRate:           total > 0 ? parseFloat(((leakCount / total) * 100).toFixed(1)) : 0,
      criticalCount,
      warningCount,
      normalCount:        total - criticalCount - warningCount,
      avgLeakProbability: parseFloat((aggData.avgLeakProbability || 0).toFixed(1)),
      avgWaterLossRate:   parseFloat((aggData.avgWaterLossRate   || 0).toFixed(2)),
    },
    serverTime: new Date().toISOString(),
  };
}

// ── Core logic: ensure an open incident exists for a critical prediction ──
/**
 * Called every time we see a CRITICAL+leak prediction.
 * Uses findOneAndUpdate-style logic: creates an incident only if there is
 * no already-open incident whose last prediction is in the same continuous
 * critical block.
 *
 * "Same block" = no non-critical prediction exists between the open
 *               incident's criticalAlertRef and this prediction's _id.
 */
async function ensureOpenIncidentForPrediction(prediction) {
  // Is there already an OPEN_FOR_PROPOSALS or ASSIGNED incident whose
  // critical block includes this prediction?
  const activeIncident = await LeakEvent.findOne({
    status: { $in: ["OPEN_FOR_PROPOSALS", "DETECTED"] },
  }).sort({ createdAt: -1 }).select("_id incidentId criticalAlertRef").lean();

  if (activeIncident) {
    // Check if there's any non-critical gap between the active incident's
    // reference prediction and the current prediction.
    const gapExists = await MlPrediction.exists({
      _id: {
        $gt:  activeIncident.criticalAlertRef,
        $lte: prediction._id,
      },
      $or: [
        { overallSystemStatus: { $ne: "CRITICAL" } },
        { mlPredictionData:    { $ne: 1 } },
      ],
    });

    if (!gapExists) {
      // Still in the same continuous critical block → no new incident needed
      return null;
    }

    // There was a normal gap → this is genuinely a NEW critical event
    console.log(
      `[LEAK] Gap detected after ${activeIncident.incidentId} — new critical block, creating incident.`
    );
  }

  // No active open incident, or a gap was detected → create a new one
  return createCriticalLeakEvent(prediction);
}

// ── Ticker ──────────────────────────────────────────────────────────────────
async function tick() {
  if (tickInProgress) return;
  tickInProgress = true;

  try {
    const newPredictions = await MlPrediction.find(
      lastSeenId ? { _id: { $gt: lastSeenId } } : {}
    ).sort({ _id: 1 }).limit(100).lean();

    if (newPredictions.length === 0) {
      tickInProgress = false;
      return;
    }

    for (const prediction of newPredictions) {
      lastSeenId = prediction._id;
      const previousStatus      = lastSystemStatus;
      const previousCritical    = lastCriticalLeak;
      lastSystemStatus          = prediction.overallSystemStatus;
      lastCriticalLeak          = isCriticalLeakPrediction(prediction);

      // ── Create/ensure leak incident ──────────────────────────────────
      if (lastCriticalLeak) {
        // Use the robust "ensure open incident" logic that handles:
        //  a) New transitions (previousCritical = false)
        //  b) Ongoing blocks after server restart (previousCritical = true)
        //  c) New blocks after a brief normal gap
        try {
          const incident = await ensureOpenIncidentForPrediction(prediction);
          if (incident) {
            console.log(
              `[LEAK] ✓ Incident ${incident.incidentId} is open for proposals. ` +
              `waterLoss=${prediction.waterLossRate ?? "?"}L/hr prob=${prediction.mlProbability ?? "?"}%`
            );
          }
        } catch (err) {
          console.error(`[LEAK] Incident processing failed for ${prediction._id}: ${err.message}`);
        }
      }

      // ── Owner critical alert email (on new CRITICAL status) ──────────
      if (prediction.overallSystemStatus === "CRITICAL" && previousStatus !== "CRITICAL") {
        sendCriticalAlert(prediction).catch((err) => {
          console.error(`[EMAIL] Critical alert email failed: ${err.message}`);
        });
      }
    }

    // Broadcast updated snapshot to all SSE clients
    const snapshot = await buildSnapshot();
    broadcast("snapshot", snapshot);
    console.log(
      `[SSE] Snapshot broadcast to ${clientCount()} client(s). ` +
      `Processed ${newPredictions.length} new prediction(s).`
    );

  } catch (err) {
    console.error("[SSE] Broadcaster tick error:", err.message);
  } finally {
    tickInProgress = false;
  }
}

// ── Startup catch-up ────────────────────────────────────────────────────────
/**
 * Walk ALL predictions in chronological order and create any missing incidents.
 * Uses the transition-based logic so duplicates are impossible.
 * Called once at startup; safe to call multiple times.
 */
async function catchUpOnStartup() {
  const allPredictions = await MlPrediction.find({}).sort({ _id: 1 }).lean();

  if (allPredictions.length === 0) {
    console.log("[BROADCAST] No ML predictions yet — waiting for Python worker.");
    return;
  }

  let previousCritical = false;
  let created = 0;

  for (const prediction of allPredictions) {
    const isCritical = isCriticalLeakPrediction(prediction);
    // Only create on a NON-CRITICAL → CRITICAL transition
    if (isCriticalLeakAlert(prediction, previousCritical)) {
      try {
        await createCriticalLeakEvent(prediction);
        created++;
      } catch (err) {
        console.error(`[BROADCAST] Catch-up failed for prediction ${prediction._id}: ${err.message}`);
      }
    }
    previousCritical = isCritical;
  }

  // Also handle the case where the latest prediction is critical but its
  // block has no open incident (e.g. all incidents were closed/cancelled).
  const latest = allPredictions[allPredictions.length - 1];
  if (isCriticalLeakPrediction(latest)) {
    try {
      await ensureOpenIncidentForPrediction(latest);
    } catch (err) {
      console.error("[BROADCAST] Catch-up: ensureOpenIncident failed:", err.message);
    }
  }

  console.log(
    `[BROADCAST] Startup catch-up: ${allPredictions.length} predictions scanned, ` +
    `${created} incident(s) created/verified.`
  );
}

// ── Public API ──────────────────────────────────────────────────────────────
export async function getInitialSnapshot() {
  try {
    return await buildSnapshot();
  } catch (err) {
    console.error("[SSE] Initial snapshot error:", err.message);
    return null;
  }
}

export async function startBroadcaster() {
  console.log("[BROADCAST] Starting broadcaster…");

  // 1. Catch up on all existing predictions (handles offline gap)
  try {
    await catchUpOnStartup();
  } catch (err) {
    console.error("[BROADCAST] Startup catch-up error:", err.message);
  }

  // 2. Set in-memory state from the latest prediction so tick() knows
  //    whether we're already in a critical block
  const latest = await MlPrediction.findOne()
    .sort({ _id: -1 })
    .select("_id overallSystemStatus mlPredictionData")
    .lean();

  if (latest) {
    lastSeenId       = latest._id.toString();
    lastSystemStatus = latest.overallSystemStatus;
    lastCriticalLeak = isCriticalLeakPrediction(latest);
    console.log(
      `[BROADCAST] Resuming from prediction ${latest._id}. ` +
      `status=${latest.overallSystemStatus} critical=${lastCriticalLeak}`
    );
  } else {
    console.log("[BROADCAST] No predictions in DB — lastSeenId = null, will catch all new predictions.");
  }

  // 3. Start the polling ticker
  setInterval(tick, 5000);

  // 4. Retry failed email notifications every minute
  setInterval(() => {
    retryFailedNotifications().catch((err) => {
      console.error("[EMAIL] Retry cycle failed:", err.message);
    });
  }, 60_000);

  console.log("[BROADCAST] Ticker started — polling ML predictions every 5 seconds.");
}
