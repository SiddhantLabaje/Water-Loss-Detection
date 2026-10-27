/**
 * Broadcaster service.
 *
 * Polls the database every 5 seconds and:
 *  1. Pushes a full "snapshot" SSE event to all connected browser clients
 *     whenever the latest prediction document ID changes.
 */

import MlPrediction    from '../models/mlPrediction.model.js';
import DashboardAnalytics from '../models/dashboardAnalytics.model.js';
import { broadcast, clientCount } from './sse.service.js';
import { sendCriticalAlert } from './email.service.js';
import { retryFailedNotifications } from './notification.service.js';
import {
  createCriticalLeakEvent,
  ensureCurrentCriticalLeakIncident,
  isCriticalLeakAlert,
  isCriticalLeakPrediction,
} from "./criticalLeak.service.js";

let lastSeenId        = null;   // _id of the last prediction we processed
let lastSystemStatus  = null;
let lastCriticalLeak  = false;
let tickInProgress    = false;

/**
 * Collect all data needed for a full dashboard snapshot in one shot.
 */
async function buildSnapshot() {
  const [latest, history, alerts, countRes] = await Promise.all([
    MlPrediction.findOne().sort({ _id: -1 }).lean(),
    MlPrediction.find().sort({ _id: -1 }).limit(30).lean(),
    MlPrediction.find({ overallSystemStatus: { $in: ['CRITICAL', 'WARNING'] } })
      .sort({ _id: -1 }).limit(10).lean(),

    // Stats aggregation
    Promise.all([
      MlPrediction.countDocuments(),
      MlPrediction.countDocuments({ mlPredictionData: 1 }),
      MlPrediction.countDocuments({ overallSystemStatus: 'CRITICAL' }),
      MlPrediction.countDocuments({ overallSystemStatus: 'WARNING' }),
      MlPrediction.aggregate([{
        $group: {
          _id: null,
          avgLeakProbability: { $avg: '$mlProbability' },
          avgWaterLossRate:   { $avg: '$waterLossRate' },
        },
      }]),
    ]),
  ]);

  const [total, leakCount, criticalCount, warningCount, agg] = countRes;
  const aggData = agg[0] || {};

  const stats = {
    total,
    leakCount,
    leakRate:           total > 0 ? parseFloat(((leakCount / total) * 100).toFixed(1)) : 0,
    criticalCount,
    warningCount,
    normalCount:        total - criticalCount - warningCount,
    avgLeakProbability: parseFloat((aggData.avgLeakProbability || 0).toFixed(1)),
    avgWaterLossRate:   parseFloat((aggData.avgWaterLossRate   || 0).toFixed(2)),
  };

  // Analytics (today)
  let analytics = null;
  try {
    analytics = await DashboardAnalytics.findOne().sort({ updatedAt: -1 }).lean();
  } catch { /* optional — doesn't block the stream */ }

  return { latest, stats, alerts, history, analytics, serverTime: new Date().toISOString() };
}

/**
 * Check for a new prediction and broadcast an SSE snapshot.
 */
async function tick() {
  if (tickInProgress) return;
  tickInProgress = true;

  try {
    const predictions = await MlPrediction.find(
      lastSeenId ? { _id: { $gt: lastSeenId } } : {}
    )
      .sort({ _id: 1 })
      .limit(100)
      .lean();
    let foundNew = false;

    for (const prediction of predictions) {
      foundNew = true;
      lastSeenId = prediction._id;
      const previousStatus = lastSystemStatus;
      const previousCriticalLeak = lastCriticalLeak;
      lastSystemStatus = prediction.overallSystemStatus;
      lastCriticalLeak = isCriticalLeakPrediction(prediction);

      if (isCriticalLeakAlert(prediction, previousCriticalLeak)) {
        try {
          await createCriticalLeakEvent(prediction);
        } catch (err) {
          console.error(`[LEAK] Incident processing failed for prediction ${prediction._id}: ${err.message}`);
        }
      }

      if (prediction.overallSystemStatus === 'CRITICAL' && previousStatus !== 'CRITICAL') {
        sendCriticalAlert(prediction).catch((err) => {
          console.error(`[EMAIL] Failed to send owner critical alert: ${err.message}`);
        });
      }
    }

    if (foundNew) {
      const snapshot = await buildSnapshot();
      broadcast('snapshot', snapshot);
      console.log(`[SSE] Broadcasted snapshot to ${clientCount()} client(s) after processing new predictions.`);
    }

  } catch (err) {
    console.error('[SSE] Broadcaster error:', err.message);
  } finally {
    tickInProgress = false;
  }

}

/**
 * Called once on startup — sends the current snapshot immediately
 * when the first client connects (handled by the route), and also
 * starts the polling interval.
 */
export async function getInitialSnapshot() {
  try {
    return await buildSnapshot();
  } catch (err) {
    console.error('[SSE] Initial snapshot error:', err.message);
    return null;
  }
}

export async function startBroadcaster() {
  const latest = await MlPrediction.findOne()
    .sort({ _id: -1 })
    .select('_id overallSystemStatus mlPredictionData')
    .lean();

  if (latest) {
    // On startup, reprocess ALL predictions from the beginning to catch
    // any leak events that were never created (e.g. because the server was
    // restarted after the ML worker had already written predictions).
    console.log('[BROADCAST] Catching up on existing predictions at startup…');
    try {
      await reprocessAllPredictions();
    } catch (err) {
      console.error('[BROADCAST] Startup catch-up failed:', err.message);
    }

    // After catch-up, set lastSeenId so the ticker only processes NEW predictions
    lastSeenId       = latest._id.toString();
    lastSystemStatus = latest.overallSystemStatus;
    lastCriticalLeak = isCriticalLeakPrediction(latest);
  }

  setInterval(tick, 5000);
  setInterval(() => {
    retryFailedNotifications().catch((err) => {
      console.error("[EMAIL] Failed notification retry cycle:", err.message);
    });
  }, 60_000);
  console.log('[BROADCAST] Ticker started, polling ML predictions every 5 seconds.');
}

/**
 * Walk ALL existing predictions in chronological order and create any
 * missing LeakEvent documents. Safe to call multiple times — duplicate
 * detection is handled inside createCriticalLeakEvent.
 */
async function reprocessAllPredictions() {
  const predictions = await MlPrediction.find({})
    .sort({ _id: 1 })
    .lean();

  if (predictions.length === 0) {
    console.log('[BROADCAST] No ML predictions found — waiting for Python worker to run.');
    return;
  }

  let previousCriticalLeak = false;
  let created = 0;

  for (const prediction of predictions) {
    const isCritical = isCriticalLeakPrediction(prediction);
    if (isCriticalLeakAlert(prediction, previousCriticalLeak)) {
      try {
        await createCriticalLeakEvent(prediction);
        created++;
      } catch (err) {
        console.error(`[BROADCAST] Catch-up failed for prediction ${prediction._id}: ${err.message}`);
      }
    }
    previousCriticalLeak = isCritical;
  }

  if (created > 0) {
    console.log(`[BROADCAST] Catch-up complete: created/verified ${created} leak incident(s).`);
  } else {
    console.log(`[BROADCAST] Catch-up complete: no new incidents needed.`);
  }
}
