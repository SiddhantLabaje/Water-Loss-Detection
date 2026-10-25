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

let lastSeenId        = null;   // _id of the last prediction we processed
let lastSystemStatus  = null;
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
    const latest = await MlPrediction.findOne()
      .sort({ _id: -1 })
      .select('_id overallSystemStatus mlPredictionData mlProbability mlSeverity flowSensorData pressureSensorData tankLevelSensorData turbiditySensorData waterLossRate mlProcessedAt')
      .lean();
    if (!latest) return;

    const currentId    = latest._id.toString();
    const isNew        = currentId !== lastSeenId;

    if (isNew) {
      lastSeenId = currentId;
      const previousStatus = lastSystemStatus;
      lastSystemStatus = latest.overallSystemStatus;

      if (latest.overallSystemStatus === 'CRITICAL' && previousStatus !== 'CRITICAL') {
        try {
          await sendCriticalAlert(latest);
        } catch (err) {
          console.error(`[EMAIL] Failed to send critical alert: ${err.message}`);
        }
      }

      if (clientCount() > 0) {
        const snapshot = await buildSnapshot();
        broadcast('snapshot', snapshot);
        console.log(`[SSE] Broadcasted snapshot to ${clientCount()} client(s) — new prediction ${currentId}`);
      }
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
    .select('_id overallSystemStatus')
    .lean();

  if (latest) {
    lastSeenId = latest._id.toString();
    lastSystemStatus = latest.overallSystemStatus;
  }

  setInterval(tick, 5000);
  console.log('SSE broadcaster started — polling every 5 seconds.');
}
