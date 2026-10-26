/**
 * Broadcaster service.
 *
 * Polls the database every 5 seconds and:
 *  1. Pushes a full "snapshot" SSE event to all connected browser clients
 *     whenever the latest prediction document ID changes.
 */

import MlPrediction    from '../models/mlPrediction.model.js';
import DashboardAnalytics from '../models/dashboardAnalytics.model.js';
import LeakEvent from '../models/leakEvent.model.js';
import { broadcast, clientCount } from './sse.service.js';
import { sendCriticalAlert } from './email.service.js';
import { notifyLeakEvent, retryFailedNotifications } from './notification.service.js';
import { randomBytes } from 'node:crypto';

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

export function isCriticalLeakPrediction(prediction) {
  return prediction.overallSystemStatus === "CRITICAL" &&
    prediction.mlPredictionData === 1;
}

export function isCriticalLeakAlert(prediction, previousAlert) {
  return isCriticalLeakPrediction(prediction) && !previousAlert;
}

async function createCriticalLeakEvent(prediction) {
  const existing = await LeakEvent.findOne({ criticalAlertRef: prediction._id }).lean();
  if (existing) return;

  const severity = String(prediction.mlSeverity || "").toUpperCase();
  if (!["LOW", "MEDIUM", "HIGH"].includes(severity)) {
    console.error(`[LEAK] Skipping prediction ${prediction._id}: severity is unavailable.`);
    return;
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
      statusHistory: [{ status: "OPEN_FOR_PROPOSALS", reason: "Automatically created from a critical leak alert." }],
    });
  } catch (err) {
    if (err.code === 11000) {
      console.error(`[LEAK] Incident already exists for critical alert ${prediction._id}.`);
      return;
    }
    throw err;
  }

  console.log(`[LEAK] Created repair incident ${leak.incidentId} from critical alert ${prediction._id}.`);
  notifyLeakEvent(leak).catch((err) => {
    console.error(`[EMAIL] Leak notification preparation failed for ${leak.incidentId}: ${err.message}`);
  });
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

    if (foundNew && clientCount() > 0) {
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
    lastSeenId       = latest._id.toString();
    lastSystemStatus = latest.overallSystemStatus;
    lastCriticalLeak = isCriticalLeakPrediction(latest);

    if (lastCriticalLeak) {
      try {
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

        if (firstCriticalLeak && isCriticalLeakAlert(
          firstCriticalLeak,
          previousNonAlert ? isCriticalLeakPrediction(previousNonAlert) : false
        )) {
          await createCriticalLeakEvent(firstCriticalLeak);
        }
      } catch (err) {
        console.error(`[LEAK] Startup: failed to recover the current critical alert: ${err.message}`);
      }
    }
  }

  setInterval(tick, 5000);
  setInterval(() => {
    retryFailedNotifications().catch((err) => {
      console.error("[EMAIL] Failed notification retry cycle:", err.message);
    });
  }, 60_000);
  console.log('SSE broadcaster started — polling every 5 seconds.');
}
