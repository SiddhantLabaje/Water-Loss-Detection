/**
 * broadcaster.service.js
 *
 * Polls ml_predictions every 5 seconds.
 * - On a CRITICAL+leak transition (non-critical → critical): create incident.
 * - Always: broadcast SSE snapshot to connected clients.
 * - On startup: scan all predictions to catch any missing incidents.
 */

import MlPrediction       from "../models/mlPrediction.model.js";
import DashboardAnalytics from "../models/dashboardAnalytics.model.js";
import { broadcast, clientCount }   from "./sse.service.js";
import { sendCriticalAlert }        from "./email.service.js";
import { retryFailedNotifications } from "./notification.service.js";
import {
  createCriticalLeakEvent,
  isCriticalLeakPrediction,
  isCriticalLeakAlert,
} from "./criticalLeak.service.js";

// ── In-memory cursor ───────────────────────────────────────────────────────
let lastSeenId       = null;
let lastSystemStatus = null;
let lastCriticalLeak = false;
let tickInProgress   = false;

// ── Snapshot ───────────────────────────────────────────────────────────────
async function buildSnapshot() {
  const [latest, history, alerts, counts] = await Promise.all([
    MlPrediction.findOne().sort({ _id: -1 }).lean(),
    MlPrediction.find().sort({ _id: -1 }).limit(30).lean(),
    MlPrediction.find({ overallSystemStatus: { $in: ["CRITICAL", "WARNING"] } })
      .sort({ _id: -1 }).limit(10).lean(),
    Promise.all([
      MlPrediction.countDocuments(),
      MlPrediction.countDocuments({ mlPredictionData: 1 }),
      MlPrediction.countDocuments({ overallSystemStatus: "CRITICAL" }),
      MlPrediction.countDocuments({ overallSystemStatus: "WARNING" }),
      MlPrediction.aggregate([{ $group: { _id: null, avgLP: { $avg: "$mlProbability" }, avgWL: { $avg: "$waterLossRate" } } }]),
    ]),
  ]);

  const [total, leakCount, criticalCount, warningCount, agg] = counts;
  const a = agg[0] || {};

  let analytics = null;
  try { analytics = await DashboardAnalytics.findOne().sort({ updatedAt: -1 }).lean(); } catch {}

  return {
    latest, history, alerts, analytics,
    stats: {
      total, leakCount, criticalCount, warningCount,
      normalCount:        total - criticalCount - warningCount,
      leakRate:           total > 0 ? parseFloat(((leakCount / total) * 100).toFixed(1)) : 0,
      avgLeakProbability: parseFloat((a.avgLP || 0).toFixed(1)),
      avgWaterLossRate:   parseFloat((a.avgWL  || 0).toFixed(2)),
    },
    serverTime: new Date().toISOString(),
  };
}

// ── Ticker ─────────────────────────────────────────────────────────────────
async function tick() {
  if (tickInProgress) return;
  tickInProgress = true;

  try {
    const newPreds = await MlPrediction.find(
      lastSeenId ? { _id: { $gt: lastSeenId } } : {}
    ).sort({ _id: 1 }).limit(100).lean();

    if (newPreds.length === 0) return;

    for (const p of newPreds) {
      const prevStatus   = lastSystemStatus;
      const prevCritical = lastCriticalLeak;
      lastSeenId       = p._id;
      lastSystemStatus = p.overallSystemStatus;
      lastCriticalLeak = isCriticalLeakPrediction(p);

      // Create incident ONLY on a non-critical → critical transition
      if (isCriticalLeakAlert(p, prevCritical)) {
        createCriticalLeakEvent(p).then(incident => {
          console.log(`[LEAK] ✓ Incident ${incident.incidentId} opened for proposals.`);
        }).catch(err => {
          console.error(`[LEAK] Incident creation failed: ${err.message}`);
        });
      }

      // Send owner email on status change to CRITICAL
      if (p.overallSystemStatus === "CRITICAL" && prevStatus !== "CRITICAL") {
        sendCriticalAlert(p).catch(err =>
          console.error(`[EMAIL] Critical alert email failed: ${err.message}`)
        );
      }
    }

    // Broadcast snapshot
    const snapshot = await buildSnapshot();
    broadcast("snapshot", snapshot);

  } catch (err) {
    console.error("[SSE] Tick error:", err.message);
  } finally {
    tickInProgress = false;
  }
}

// ── Startup catch-up ───────────────────────────────────────────────────────
/**
 * Walk all predictions once at startup, creating any incident that was missed
 * while the server was down. Uses transition logic — one incident per block.
 */
async function catchUpOnStartup() {
  const all = await MlPrediction.find({}).sort({ _id: 1 }).lean();

  if (all.length === 0) {
    console.log("[BROADCAST] No ML predictions yet — Python worker not run yet.");
    return;
  }

  let prevCrit = false;
  let created  = 0;

  for (const p of all) {
    if (isCriticalLeakAlert(p, prevCrit)) {
      try {
        await createCriticalLeakEvent(p);
        created++;
      } catch (err) {
        console.error(`[BROADCAST] Catch-up error for ${p._id}: ${err.message}`);
      }
    }
    prevCrit = isCriticalLeakPrediction(p);
  }

  console.log(
    `[BROADCAST] Startup catch-up: ${all.length} predictions scanned, ` +
    `${created} incident(s) created/verified.`
  );
}

// ── Public ─────────────────────────────────────────────────────────────────
export async function getInitialSnapshot() {
  try { return await buildSnapshot(); } catch { return null; }
}

export async function startBroadcaster() {
  console.log("[BROADCAST] Starting broadcaster…");

  await catchUpOnStartup().catch(err =>
    console.error("[BROADCAST] Catch-up error:", err.message)
  );

  const latest = await MlPrediction.findOne()
    .sort({ _id: -1 })
    .select("_id overallSystemStatus mlPredictionData")
    .lean();

  if (latest) {
    lastSeenId       = latest._id.toString();
    lastSystemStatus = latest.overallSystemStatus;
    lastCriticalLeak = isCriticalLeakPrediction(latest);
    console.log(
      `[BROADCAST] Resuming from ${latest._id}. ` +
      `status=${latest.overallSystemStatus} critical=${lastCriticalLeak}`
    );
  }

  setInterval(tick, 5000);
  setInterval(() => retryFailedNotifications().catch(() => {}), 60_000);
  console.log("[BROADCAST] Ticker started — polling every 5 seconds.");
}
