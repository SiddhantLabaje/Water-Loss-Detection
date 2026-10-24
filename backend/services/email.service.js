/**
 * Email Service
 *
 * Builds a rich HTML dashboard report and sends it via Nodemailer (Gmail SMTP).
 *
 * Required .env variables:
 *   EMAIL_USER  — your Gmail address
 *   EMAIL_PASS  — Gmail App Password (not your login password)
 *
 * Generate an App Password at:
 *   https://myaccount.google.com/apppasswords
 */

import nodemailer from "nodemailer";
import MlPrediction from "../models/mlPrediction.model.js";
import DashboardAnalytics from "../models/dashboardAnalytics.model.js";

// ── SMTP transporter ──────────────────────────────────────────────────────────
function createTransporter() {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
}

// ── Data helpers ──────────────────────────────────────────────────────────────
function f1(v) {
  return v == null || isNaN(+v) ? "—" : (+v).toFixed(1);
}
function f2(v) {
  return v == null || isNaN(+v) ? "—" : (+v).toFixed(2);
}
function fmtTime(raw) {
  if (!raw) return "—";
  try {
    const d = new Date(raw);
    return isNaN(d) ? String(raw) : d.toLocaleString();
  } catch {
    return String(raw);
  }
}
function statusColor(s) {
  const map = { CRITICAL: "#b91c1c", WARNING: "#b45309", NORMAL: "#198038" };
  return map[(s || "").toUpperCase()] || "#6b7280";
}
function statusBg(s) {
  const map = { CRITICAL: "#fef2f2", WARNING: "#fffbeb", NORMAL: "#f0fdf4" };
  return map[(s || "").toUpperCase()] || "#f9fafb";
}
function wqColor(s) {
  const map = { GOOD: "#198038", MODERATE: "#b45309", POOR: "#b91c1c" };
  return map[(s || "").toUpperCase()] || "#6b7280";
}

// ── Gather dashboard data ─────────────────────────────────────────────────────
async function gatherData() {
  const [latest, analytics, alerts, countRes] = await Promise.all([
    MlPrediction.findOne().sort({ _id: -1 }).lean(),
    DashboardAnalytics.findOne().sort({ updatedAt: -1 }).lean(),
    MlPrediction.find({ overallSystemStatus: { $in: ["CRITICAL", "WARNING"] } })
      .sort({ _id: -1 })
      .limit(5)
      .lean(),
    Promise.all([
      MlPrediction.countDocuments(),
      MlPrediction.countDocuments({ mlPredictionData: 1 }),
      MlPrediction.countDocuments({ overallSystemStatus: "CRITICAL" }),
      MlPrediction.countDocuments({ overallSystemStatus: "WARNING" }),
      MlPrediction.aggregate([
        {
          $group: {
            _id: null,
            avgLeakProbability: { $avg: "$mlProbability" },
            avgWaterLossRate: { $avg: "$waterLossRate" },
          },
        },
      ]),
    ]),
  ]);

  const [total, leakCount, criticalCount, warningCount, agg] = countRes;
  const aggData = agg[0] || {};

  const stats = {
    total,
    leakCount,
    leakRate: total > 0 ? parseFloat(((leakCount / total) * 100).toFixed(1)) : 0,
    criticalCount,
    warningCount,
    normalCount: total - criticalCount - warningCount,
    avgLeakProbability: parseFloat((aggData.avgLeakProbability || 0).toFixed(1)),
    avgWaterLossRate: parseFloat((aggData.avgWaterLossRate || 0).toFixed(2)),
  };

  return { latest, analytics, alerts, stats };
}

// ── HTML email template ───────────────────────────────────────────────────────
function buildHtml({ latest, analytics, alerts, stats, recipientName }) {
  const status = (latest?.overallSystemStatus || "UNKNOWN").toUpperCase();
  const sBg = statusBg(status);
  const sColor = statusColor(status);
  const now = new Date().toLocaleString();

  // Sensor section
  const sensorRows = latest
    ? `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">Flow Rate</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-weight:600">${f1(latest.flowSensorData)} L/min</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:${latest.flowAnomaly === "ABNORMAL" ? "#b91c1c" : "#198038"}">${latest.flowAnomaly || "—"}</td>
    </tr>
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">Pressure</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-weight:600">${f1(latest.pressureSensorData)} PSI</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:${latest.pressureAnomaly === "ABNORMAL" ? "#b91c1c" : "#198038"}">${latest.pressureAnomaly || "—"}</td>
    </tr>
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">Tank Level</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-weight:600">${f1(latest.tankLevelSensorData)} %</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:${latest.tankLevelAnomaly === "ABNORMAL" ? "#b91c1c" : "#198038"}">${latest.tankLevelAnomaly || "—"}</td>
    </tr>
    <tr>
      <td style="padding:8px 12px;">Turbidity</td>
      <td style="padding:8px 12px;font-weight:600">${f1(latest.turbiditySensorData)} NTU</td>
      <td style="padding:8px 12px;color:${wqColor(latest.waterQualityStatus)}">${latest.waterQualityStatus || "—"}</td>
    </tr>`
    : `<tr><td colspan="3" style="padding:12px;color:#6b7280;">No sensor data available</td></tr>`;

  // Recent alerts section
  const alertRows =
    alerts && alerts.length > 0
      ? alerts
          .map(
            (a, i) => `
    <tr style="background:${i % 2 === 0 ? "#ffffff" : "#f9fafb"}">
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:12px;color:#6b7280;">${fmtTime(a.mlProcessedAt)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">
        <span style="background:${statusColor(a.overallSystemStatus)};color:#fff;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:600">${a.overallSystemStatus}</span>
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${a.mlPredictionData === 1 ? "🔴 Leak" : "🟢 Normal"}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${f1(a.mlProbability)}%</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${f2(a.waterLossRate)} L/hr</td>
    </tr>`
          )
          .join("")
      : `<tr><td colspan="5" style="padding:12px;color:#198038;">✅ No recent critical or warning alerts</td></tr>`;

  // Analytics section
  const analyticsSection = analytics
    ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:8px;">
      <tr>
        <td width="50%" style="padding:0 8px 0 0;vertical-align:top;">
          <table width="100%" style="background:#f9fafb;border-radius:8px;padding:12px;border-collapse:collapse;">
            <tr><td colspan="2" style="padding-bottom:8px;font-weight:700;color:#374151;font-size:13px;">Consumption Today</td></tr>
            <tr><td style="padding:4px 0;color:#6b7280;font-size:13px;">Total Litres</td><td style="text-align:right;font-weight:600;font-size:13px;">${f1(analytics.consumptionToday?.totalLitres)} L</td></tr>
            <tr><td style="padding:4px 0;color:#6b7280;font-size:13px;">Estimated Loss</td><td style="text-align:right;font-weight:600;font-size:13px;color:#b91c1c;">${f1(analytics.consumptionToday?.estimatedLossL)} L</td></tr>
            <tr><td style="padding:4px 0;color:#6b7280;font-size:13px;">Loss %</td><td style="text-align:right;font-weight:600;font-size:13px;color:#b91c1c;">${f1(analytics.consumptionToday?.lossPercentage)}%</td></tr>
          </table>
        </td>
        <td width="50%" style="padding:0 0 0 8px;vertical-align:top;">
          <table width="100%" style="background:#f9fafb;border-radius:8px;padding:12px;border-collapse:collapse;">
            <tr><td colspan="2" style="padding-bottom:8px;font-weight:700;color:#374151;font-size:13px;">Tomorrow's Forecast</td></tr>
            <tr><td style="padding:4px 0;color:#6b7280;font-size:13px;">Predicted Litres</td><td style="text-align:right;font-weight:600;font-size:13px;">${f1(analytics.forecast?.predictedTomorrowLitres)} L</td></tr>
            <tr><td style="padding:4px 0;color:#6b7280;font-size:13px;">Expected Loss</td><td style="text-align:right;font-weight:600;font-size:13px;color:#b91c1c;">${f1(analytics.forecast?.expectedLossLitres)} L</td></tr>
            <tr><td style="padding:4px 0;color:#6b7280;font-size:13px;">History Used</td><td style="text-align:right;font-weight:600;font-size:13px;">${analytics.forecast?.daysOfHistoryUsed ?? "—"} days</td></tr>
          </table>
        </td>
      </tr>
    </table>`
    : `<p style="color:#6b7280;font-size:13px;">No daily analytics data available yet.</p>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Smart Water Monitor — Dashboard Report</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">

  <!-- Wrapper -->
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#0f62fe 0%,#0043ce 100%);border-radius:12px 12px 0 0;padding:28px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <div style="color:#ffffff;font-size:22px;font-weight:700;line-height:1.2;">💧 Smart Water Monitor</div>
                    <div style="color:#a6c8ff;font-size:13px;margin-top:4px;">AI-powered leak & water loss detection</div>
                  </td>
                  <td align="right" valign="middle">
                    <div style="color:#a6c8ff;font-size:12px;">Report generated</div>
                    <div style="color:#ffffff;font-size:12px;font-weight:600;">${now}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- System Status Banner -->
          <tr>
            <td style="background:${sBg};border:2px solid ${sColor};padding:16px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <span style="font-size:18px;font-weight:700;color:${sColor}">
                      ${status === "CRITICAL" ? "🚨" : status === "WARNING" ? "⚠️" : "✅"} System Status: ${status}
                    </span>
                    <div style="color:#374151;font-size:13px;margin-top:6px;">
                      Hello ${recipientName} — here is your latest water system dashboard summary.
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background:#ffffff;padding:24px 32px;">

              <!-- Live Sensor Readings -->
              <h2 style="font-size:15px;font-weight:700;color:#111827;margin:0 0 12px 0;padding-bottom:8px;border-bottom:2px solid #e5e7eb;">
                📡 Live Sensor Readings
              </h2>
              <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:24px;">
                <thead>
                  <tr style="background:#f9fafb;">
                    <th style="padding:10px 12px;text-align:left;font-size:12px;font-weight:600;color:#6b7280;border-bottom:1px solid #e5e7eb;">SENSOR</th>
                    <th style="padding:10px 12px;text-align:left;font-size:12px;font-weight:600;color:#6b7280;border-bottom:1px solid #e5e7eb;">VALUE</th>
                    <th style="padding:10px 12px;text-align:left;font-size:12px;font-weight:600;color:#6b7280;border-bottom:1px solid #e5e7eb;">ANOMALY STATUS</th>
                  </tr>
                </thead>
                <tbody>${sensorRows}</tbody>
              </table>

              <!-- Leak Detection -->
              <h2 style="font-size:15px;font-weight:700;color:#111827;margin:0 0 12px 0;padding-bottom:8px;border-bottom:2px solid #e5e7eb;">
                🔍 Leak Detection
              </h2>
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                  <td width="33%" style="padding:0 8px 0 0;">
                    <div style="background:#f9fafb;border-radius:8px;padding:16px;text-align:center;">
                      <div style="font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;margin-bottom:4px;">Leak Detected</div>
                      <div style="font-size:24px;font-weight:700;color:${latest?.mlPredictionData === 1 ? "#b91c1c" : "#198038"}">
                        ${latest?.mlPredictionData === 1 ? "YES" : "NO"}
                      </div>
                    </div>
                  </td>
                  <td width="33%" style="padding:0 4px;">
                    <div style="background:#f9fafb;border-radius:8px;padding:16px;text-align:center;">
                      <div style="font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;margin-bottom:4px;">Probability</div>
                      <div style="font-size:24px;font-weight:700;color:#0f62fe">${f1(latest?.mlProbability)}%</div>
                    </div>
                  </td>
                  <td width="33%" style="padding:0 0 0 8px;">
                    <div style="background:#f9fafb;border-radius:8px;padding:16px;text-align:center;">
                      <div style="font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;margin-bottom:4px;">Severity</div>
                      <div style="font-size:24px;font-weight:700;color:${latest?.mlSeverity === "HIGH" ? "#b91c1c" : latest?.mlSeverity === "MEDIUM" ? "#b45309" : "#198038"}">
                        ${latest?.mlSeverity || "—"}
                      </div>
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Water Loss Analysis -->
              <h2 style="font-size:15px;font-weight:700;color:#111827;margin:0 0 12px 0;padding-bottom:8px;border-bottom:2px solid #e5e7eb;">
                💧 Water Loss Analysis
              </h2>
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                  <td width="33%" style="padding:0 8px 0 0;">
                    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;text-align:center;">
                      <div style="font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;margin-bottom:4px;">ML Loss Rate</div>
                      <div style="font-size:22px;font-weight:700;color:#b91c1c">${f2(latest?.waterLossRate)}</div>
                      <div style="font-size:11px;color:#6b7280;margin-top:2px;">L/hr</div>
                    </div>
                  </td>
                  <td width="33%" style="padding:0 4px;">
                    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:16px;text-align:center;">
                      <div style="font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;margin-bottom:4px;">Flow Loss</div>
                      <div style="font-size:22px;font-weight:700;color:#b45309">${f2(latest?.waterLossFlowLoss)}</div>
                      <div style="font-size:11px;color:#6b7280;margin-top:2px;">L/hr</div>
                    </div>
                  </td>
                  <td width="33%" style="padding:0 0 0 8px;">
                    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;text-align:center;">
                      <div style="font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;margin-bottom:4px;">Volume Lost</div>
                      <div style="font-size:22px;font-weight:700;color:#198038">${f2(latest?.waterLossVolume)}</div>
                      <div style="font-size:11px;color:#6b7280;margin-top:2px;">Litres</div>
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Statistics -->
              <h2 style="font-size:15px;font-weight:700;color:#111827;margin:0 0 12px 0;padding-bottom:8px;border-bottom:2px solid #e5e7eb;">
                📊 Overall Statistics
              </h2>
              <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:24px;">
                <tr style="background:#f9fafb;">
                  <td style="padding:10px 16px;border-right:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb;">
                    <div style="font-size:11px;color:#6b7280;text-transform:uppercase;font-weight:600;">Total Records</div>
                    <div style="font-size:22px;font-weight:700;color:#0f62fe;">${stats.total}</div>
                  </td>
                  <td style="padding:10px 16px;border-right:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb;">
                    <div style="font-size:11px;color:#6b7280;text-transform:uppercase;font-weight:600;">Leak Events</div>
                    <div style="font-size:22px;font-weight:700;color:#b91c1c;">${stats.leakCount} <span style="font-size:13px;font-weight:400;">(${stats.leakRate}%)</span></div>
                  </td>
                  <td style="padding:10px 16px;border-right:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb;">
                    <div style="font-size:11px;color:#6b7280;text-transform:uppercase;font-weight:600;">Critical Alerts</div>
                    <div style="font-size:22px;font-weight:700;color:#b91c1c;">${stats.criticalCount}</div>
                  </td>
                  <td style="padding:10px 16px;border-bottom:1px solid #e5e7eb;">
                    <div style="font-size:11px;color:#6b7280;text-transform:uppercase;font-weight:600;">Avg Loss Rate</div>
                    <div style="font-size:22px;font-weight:700;color:#198038;">${stats.avgWaterLossRate} L/hr</div>
                  </td>
                </tr>
                <tr>
                  <td colspan="4" style="padding:10px 16px;">
                    <div style="font-size:11px;color:#6b7280;text-transform:uppercase;font-weight:600;">Warning Alerts</div>
                    <div style="font-size:18px;font-weight:700;color:#b45309;">${stats.warningCount}</div>
                  </td>
                </tr>
              </table>

              <!-- Daily Analytics -->
              <h2 style="font-size:15px;font-weight:700;color:#111827;margin:0 0 12px 0;padding-bottom:8px;border-bottom:2px solid #e5e7eb;">
                📅 Daily Analytics
              </h2>
              <div style="margin-bottom:24px;">${analyticsSection}</div>

              <!-- Recent Alerts -->
              <h2 style="font-size:15px;font-weight:700;color:#111827;margin:0 0 12px 0;padding-bottom:8px;border-bottom:2px solid #e5e7eb;">
                🚨 Recent Critical / Warning Alerts (Last 5)
              </h2>
              <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:24px;">
                <thead>
                  <tr style="background:#f9fafb;">
                    <th style="padding:10px 12px;text-align:left;font-size:12px;font-weight:600;color:#6b7280;border-bottom:1px solid #e5e7eb;">TIME</th>
                    <th style="padding:10px 12px;text-align:left;font-size:12px;font-weight:600;color:#6b7280;border-bottom:1px solid #e5e7eb;">STATUS</th>
                    <th style="padding:10px 12px;text-align:left;font-size:12px;font-weight:600;color:#6b7280;border-bottom:1px solid #e5e7eb;">LEAK</th>
                    <th style="padding:10px 12px;text-align:left;font-size:12px;font-weight:600;color:#6b7280;border-bottom:1px solid #e5e7eb;">PROBABILITY</th>
                    <th style="padding:10px 12px;text-align:left;font-size:12px;font-weight:600;color:#6b7280;border-bottom:1px solid #e5e7eb;">LOSS RATE</th>
                  </tr>
                </thead>
                <tbody>${alertRows}</tbody>
              </table>

              <!-- Last updated -->
              <p style="font-size:12px;color:#6b7280;margin:0;">
                Data as of: <strong>${fmtTime(latest?.mlProcessedAt)}</strong>
              </p>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#1f2937;border-radius:0 0 12px 12px;padding:20px 32px;text-align:center;">
              <p style="color:#9ca3af;font-size:12px;margin:0;">
                Smart Water Monitor — AI Water Loss Detection System<br>
                This is an automated report. Do not reply to this email.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>`;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Send a dashboard report email to the given recipient.
 *
 * @param {object} opts
 * @param {string} opts.to             – recipient address
 * @param {string} [opts.name]         – recipient name
 * @param {string[]} [opts.cc]         – CC addresses
 * @param {string} [opts.subject]      – custom subject override
 */
export async function sendDashboardReport({ to, name = "Dashboard User", cc = [], subject }) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    throw new Error(
      "EMAIL_USER and EMAIL_PASS must be set in .env before sending reports."
    );
  }

  // Gather live data from MongoDB
  const { latest, analytics, alerts, stats } = await gatherData();

  const status = (latest?.overallSystemStatus || "UNKNOWN").toUpperCase();
  const defaultSubject = `[${status}] Smart Water Monitor Report — ${new Date().toLocaleDateString()}`;

  const html = buildHtml({ latest, analytics, alerts, stats, recipientName: name });

  const transporter = createTransporter();

  const info = await transporter.sendMail({
    from: `"Smart Water Monitor" <${process.env.EMAIL_USER}>`,
    to,
    cc: cc.length > 0 ? cc.join(", ") : undefined,
    subject: subject || defaultSubject,
    html,
  });

  return {
    messageId: info.messageId,
    accepted: info.accepted,
    rejected: info.rejected,
  };
}
