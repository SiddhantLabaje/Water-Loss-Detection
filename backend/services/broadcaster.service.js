/**
 * Broadcaster service.
 *
 * Polls the database every 5 seconds and pushes a full "snapshot"
 * event to all connected SSE clients whenever the latest prediction
 * document ID changes (i.e. new data from the ML pipeline).
 *
 * This fires independently of the ThingSpeak cron so the frontend
 * always gets the freshest ML result as soon as it lands in Mongo.
 */

import MlPrediction    from '../models/mlPrediction.model.js';
import DashboardAnalytics from '../models/dashboardAnalytics.model.js';
import { broadcast, clientCount } from './sse.service.js';

let lastSeenId = null;   // _id string of the last prediction we broadcasted

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
 * Check for a new prediction and broadcast if changed.
 */
async function tick() {
  try {
    // Nothing to do if nobody is listening
    if (clientCount() === 0) return;

    const latest = await MlPrediction.findOne().sort({ _id: -1 }).select('_id').lean();
    if (!latest) return;

    const currentId = latest._id.toString();
    if (currentId === lastSeenId) return; // no new data

    lastSeenId = currentId;

    const snapshot = await buildSnapshot();
    broadcast('snapshot', snapshot);

    console.log(`[SSE] Broadcasted snapshot to ${clientCount()} client(s) — new prediction ${currentId}`);
  } catch (err) {
    console.error('[SSE] Broadcaster error:', err.message);
  }
}

/**
 * Called once on startup — sends the current snapshot immediately
 * when the first client connects (handled by the route), and also
 * starts the polling interval.
 */
export async function getInitialSnapshot() {
  try {
    const snapshot = await buildSnapshot();
    if (snapshot.latest) {
      lastSeenId = snapshot.latest._id.toString();
    }
    return snapshot;
  } catch (err) {
    console.error('[SSE] Initial snapshot error:', err.message);
    return null;
  }
}

// Poll every 5 seconds — fast enough to feel real-time,
// light enough to not hammer MongoDB.
setInterval(tick, 5000);

console.log('SSE broadcaster started — polling every 5 seconds.');
