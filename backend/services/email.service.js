/**
 * Email Service — concise dashboard report.
 * Sends only the essential system status snapshot.
 *
 * Required .env:
 *   EMAIL_USER  — Gmail address
 *   EMAIL_PASS  — Gmail App Password
 */

import nodemailer from "nodemailer";
import MlPrediction from "../models/mlPrediction.model.js";

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

// ── Formatters ────────────────────────────────────────────────────────────────
const f1 = v => (v == null || isNaN(+v)) ? "—" : (+v).toFixed(1);
const f2 = v => (v == null || isNaN(+v)) ? "—" : (+v).toFixed(2);
function fmtTime(raw) {
  if (!raw) return "—";
  try { const d = new Date(raw); return isNaN(d) ? String(raw) : d.toLocaleString(); }
  catch { return String(raw); }
}

// Status colours
const STATUS_COLOR = { CRITICAL: "#b91c1c", WARNING: "#b45309", NORMAL: "#198038" };
const STATUS_BG    = { CRITICAL: "#fef2f2", WARNING: "#fffbeb", NORMAL:  "#f0fdf4" };
const STATUS_ICON  = { CRITICAL: "🚨", WARNING: "⚠️", NORMAL: "✅" };

// ── Gather only what we need ──────────────────────────────────────────────────
async function gatherData() {
  return MlPrediction.findOne().sort({ _id: -1 }).lean();
}

// ── Email HTML ────────────────────────────────────────────────────────────────
function buildHtml(latest, recipientName) {
  const status  = (latest?.overallSystemStatus || "UNKNOWN").toUpperCase();
  const color   = STATUS_COLOR[status] || "#6b7280";
  const bg      = STATUS_BG[status]    || "#f9fafb";
  const icon    = STATUS_ICON[status]  || "ℹ️";
  const isLeak  = latest?.mlPredictionData === 1;
  const now     = new Date().toLocaleString();

  // Anomaly dot helper
  const dot = v => v === "ABNORMAL"
    ? `<span style="color:#b91c1c;font-weight:700">● Abnormal</span>`
    : `<span style="color:#198038;font-weight:700">● Normal</span>`;

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:28px 0;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

  <!-- Header -->
  <tr>
    <td style="background:linear-gradient(135deg,#0f62fe,#0043ce);border-radius:10px 10px 0 0;padding:22px 28px;">
      <table width="100%" cellpadding="0" cellspacing="0"><tr>
        <td>
          <div style="color:#fff;font-size:18px;font-weight:700;">💧 Smart Water Monitor</div>
          <div style="color:#a6c8ff;font-size:12px;margin-top:2px;">AI Leak &amp; Water Loss Detection</div>
        </td>
        <td align="right" style="color:#a6c8ff;font-size:11px;">${now}</td>
      </tr></table>
    </td>
  </tr>

  <!-- Status banner -->
  <tr>
    <td style="background:${bg};border-left:4px solid ${color};padding:16px 28px;">
      <div style="font-size:17px;font-weight:700;color:${color};">${icon} System Status: ${status}</div>
      <div style="font-size:13px;color:#374151;margin-top:4px;">Hi ${recipientName}, here is your water system snapshot.</div>
    </td>
  </tr>

  <!-- Body -->
  <tr><td style="background:#fff;padding:22px 28px;">

    <!-- Leak result -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
      <tr>
        <td width="33%" style="padding-right:8px;">
          <div style="background:${isLeak ? "#fef2f2" : "#f0fdf4"};border-radius:8px;padding:14px;text-align:center;">
            <div style="font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;margin-bottom:4px;">Leak</div>
            <div style="font-size:20px;font-weight:700;color:${isLeak ? "#b91c1c" : "#198038"};">${isLeak ? "YES" : "NO"}</div>
          </div>
        </td>
        <td width="33%" style="padding:0 4px;">
          <div style="background:#eff6ff;border-radius:8px;padding:14px;text-align:center;">
            <div style="font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;margin-bottom:4px;">Probability</div>
            <div style="font-size:20px;font-weight:700;color:#0f62fe;">${f1(latest?.mlProbability)}%</div>
          </div>
        </td>
        <td width="33%" style="padding-left:8px;">
          <div style="background:#f9fafb;border-radius:8px;padding:14px;text-align:center;">
            <div style="font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;margin-bottom:4px;">Severity</div>
            <div style="font-size:20px;font-weight:700;color:${
              latest?.mlSeverity === "HIGH" ? "#b91c1c" :
              latest?.mlSeverity === "MEDIUM" ? "#b45309" : "#198038"
            };">${latest?.mlSeverity || "—"}</div>
          </div>
        </td>
      </tr>
    </table>

    <!-- Sensor readings -->
    <div style="font-size:13px;font-weight:700;color:#111827;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid #e5e7eb;">📡 Sensor Readings</div>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;border-collapse:collapse;">
      <tr style="background:#f9fafb;">
        <th style="padding:7px 10px;text-align:left;font-size:11px;color:#6b7280;font-weight:600;">SENSOR</th>
        <th style="padding:7px 10px;text-align:left;font-size:11px;color:#6b7280;font-weight:600;">VALUE</th>
        <th style="padding:7px 10px;text-align:left;font-size:11px;color:#6b7280;font-weight:600;">STATUS</th>
      </tr>
      <tr style="border-bottom:1px solid #f3f4f6;">
        <td style="padding:7px 10px;font-size:13px;color:#374151;">Flow Rate</td>
        <td style="padding:7px 10px;font-size:13px;font-weight:600;">${f1(latest?.flowSensorData)} L/min</td>
        <td style="padding:7px 10px;font-size:13px;">${dot(latest?.flowAnomaly)}</td>
      </tr>
      <tr style="border-bottom:1px solid #f3f4f6;">
        <td style="padding:7px 10px;font-size:13px;color:#374151;">Pressure</td>
        <td style="padding:7px 10px;font-size:13px;font-weight:600;">${f1(latest?.pressureSensorData)} PSI</td>
        <td style="padding:7px 10px;font-size:13px;">${dot(latest?.pressureAnomaly)}</td>
      </tr>
      <tr style="border-bottom:1px solid #f3f4f6;">
        <td style="padding:7px 10px;font-size:13px;color:#374151;">Tank Level</td>
        <td style="padding:7px 10px;font-size:13px;font-weight:600;">${f1(latest?.tankLevelSensorData)} %</td>
        <td style="padding:7px 10px;font-size:13px;">${dot(latest?.tankLevelAnomaly)}</td>
      </tr>
      <tr>
        <td style="padding:7px 10px;font-size:13px;color:#374151;">Turbidity</td>
        <td style="padding:7px 10px;font-size:13px;font-weight:600;">${f1(latest?.turbiditySensorData)} NTU</td>
        <td style="padding:7px 10px;font-size:13px;color:${
          latest?.waterQualityStatus === "GOOD" ? "#198038" :
          latest?.waterQualityStatus === "POOR" ? "#b91c1c" : "#b45309"
        };font-weight:600;">${latest?.waterQualityStatus || "—"}</td>
      </tr>
    </table>

    <!-- Water loss -->
    <div style="font-size:13px;font-weight:700;color:#111827;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid #e5e7eb;">💧 Water Loss</div>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
      <tr>
        <td width="50%" style="padding-right:8px;">
          <div style="background:#fef2f2;border-radius:8px;padding:12px;text-align:center;">
            <div style="font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;margin-bottom:4px;">Loss Rate (ML)</div>
            <div style="font-size:20px;font-weight:700;color:#b91c1c;">${f2(latest?.waterLossRate)} <span style="font-size:12px;">L/hr</span></div>
          </div>
        </td>
        <td width="50%" style="padding-left:8px;">
          <div style="background:#f0fdf4;border-radius:8px;padding:12px;text-align:center;">
            <div style="font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;margin-bottom:4px;">Water Quality</div>
            <div style="font-size:20px;font-weight:700;color:${
              latest?.waterQualityStatus === "GOOD" ? "#198038" :
              latest?.waterQualityStatus === "POOR" ? "#b91c1c" : "#b45309"
            };">${latest?.waterQualityStatus || "—"}</div>
          </div>
        </td>
      </tr>
    </table>

    <p style="font-size:11px;color:#9ca3af;margin:0;">Data as of: ${fmtTime(latest?.mlProcessedAt)}</p>

  </td></tr>

  <!-- Footer -->
  <tr>
    <td style="background:#1f2937;border-radius:0 0 10px 10px;padding:14px 28px;text-align:center;">
      <p style="color:#9ca3af;font-size:11px;margin:0;">Smart Water Monitor · Automated report · Do not reply</p>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

// ── Main export ───────────────────────────────────────────────────────────────
export async function sendDashboardReport({ to, name = "Dashboard User", cc = [], subject }) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    throw new Error("EMAIL_USER and EMAIL_PASS must be set in .env before sending reports.");
  }

  const latest = await gatherData();
  const status = (latest?.overallSystemStatus || "UNKNOWN").toUpperCase();
  const defaultSubject = `[${status}] Water Monitor Alert — ${new Date().toLocaleDateString()}`;

  const transporter = createTransporter();
  const info = await transporter.sendMail({
    from: `"Smart Water Monitor" <${process.env.EMAIL_USER}>`,
    to,
    cc: cc.length > 0 ? cc.join(", ") : undefined,
    subject: subject || defaultSubject,
    html: buildHtml(latest, name),
  });

  return {
    messageId: info.messageId,
    accepted:  info.accepted,
    rejected:  info.rejected,
  };
}
