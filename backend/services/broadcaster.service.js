/**
 * Broadcaster service.
 *
 * Polls the database every 5 seconds and:
 *  1. Pushes a full "snapshot" SSE event to all connected browser clients
 *     whenever the latest prediction document ID changes.
 *  2. Auto-sends an alert email when a new CRITICAL or WARNING prediction
 *     arrives AND the saved email settings have alertOnCritical = true.
 */

import MlPrediction    from '../models/mlPrediction.model.js';
import DashboardAnalytics from '../models/dashboardAnalytics.model.js';
import EmailSettings   from '../models/emailSettings.model.js';
import { broadcast, clientCount } from './sse.service.js';
import { sendDashboardReport } from './email.service.js';

let lastSeenId        = null;   // _id of the last prediction we processed
let lastAlertedId     = null;   // _id of the last prediction we emailed about
let emailCooldownUntil = 0;     // timestamp — prevents spam if alerts fire rapidly
let startupAlertDone  = false;  // tracks whether we checked for an active alert on boot

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
 * Check for a new prediction, broadcast SSE snapshot, and fire alert email
 * if the prediction is CRITICAL or WARNING and alertOnCritical is enabled.
 */
async function tick() {
  try {
    const latest = await MlPrediction.findOne()
      .sort({ _id: -1 })
      .select('_id overallSystemStatus mlPredictionData')
      .lean();
    if (!latest) return;

    const currentId    = latest._id.toString();
    const isNew        = currentId !== lastSeenId;
    const isAlertStatus = ['CRITICAL', 'WARNING'].includes(latest.overallSystemStatus);

    // ── 1. SSE broadcast ────────────────────────────────────────────────────
    if (isNew) {
      lastSeenId = currentId;
      if (clientCount() > 0) {
        const snapshot = await buildSnapshot();
        broadcast('snapshot', snapshot);
        console.log(`[SSE] Broadcasted snapshot to ${clientCount()} client(s) — new prediction ${currentId}`);
      }
    }

    // ── 2. Auto alert email ─────────────────────────────────────────────────
    // Fire when:
    //   a) A brand-new CRITICAL/WARNING prediction arrived (isNew), OR
    //   b) On the first tick after startup if the latest record is already
    //      CRITICAL/WARNING and hasn't been alerted yet (!startupAlertDone)
    const shouldCheckAlert = isNew || !startupAlertDone;
    startupAlertDone = true; // only suppress the startup re-check once

    if (
      shouldCheckAlert &&
      isAlertStatus &&
      currentId !== lastAlertedId &&
      Date.now() > emailCooldownUntil
    ) {
      try {
        const settings = await EmailSettings.findOne().lean();

        if (settings?.alertOnCritical && settings?.recipientEmail) {
          lastAlertedId      = currentId;
          emailCooldownUntil = Date.now() + 5 * 60 * 1000; // 5-min cooldown

          sendDashboardReport({
            to:      settings.recipientEmail,
            name:    settings.recipientName || 'Dashboard User',
            cc:      settings.ccEmails || [],
            subject: `[${latest.overallSystemStatus}] Water Monitor Alert — Leak Detected`,
          }).then(result => {
            console.log(`[EMAIL] Auto-alert sent to ${settings.recipientEmail} — status: ${latest.overallSystemStatus} (msgId: ${result.messageId})`);
          }).catch(err => {
            console.error(`[EMAIL] Auto-alert failed: ${err.message}`);
            // Reset so it retries on the next new prediction
            lastAlertedId = null;
          });
        } else {
          console.log(`[EMAIL] Alert skipped — alertOnCritical=${settings?.alertOnCritical}, recipientEmail=${settings?.recipientEmail || 'not set'}`);
        }
      } catch (emailErr) {
        console.error('[EMAIL] Failed to load email settings:', emailErr.message);
      }
    }

  } catch (err) {
    console.error('[SSE] Broadcaster error:', err.message);
  }
}

/**
 * Called once on startup — sends the current snapshot immediately
 * when the first client connects (handled by the route), and also
 * starts the polling interval.
 *
 * We do NOT pre-seed lastAlertedId here — this means if the server
 * restarts and the latest record is still CRITICAL/WARNING and
 * alertOnCritical is enabled, one alert email will fire within the
 * first 5-second tick. That's the correct behaviour: Render redeploys
 * should not silently swallow an active alert.
 */
export async function getInitialSnapshot() {
  try {
    const snapshot = await buildSnapshot();
    if (snapshot.latest) {
      // Seed lastSeenId so SSE doesn't re-broadcast on the very first tick,
      // but do NOT seed lastAlertedId — let the first tick decide whether
      // an alert email is needed for the current state.
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
