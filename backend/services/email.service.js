import nodemailer from "nodemailer";
import NotificationSettings from "../models/notificationSettings.model.js";

export async function sendCriticalAlert(prediction) {
  const settings = await NotificationSettings.findOne().lean();
  if (!settings?.ownerName || !settings?.ownerEmail) {
    console.warn("[EMAIL] NotificationSettings not configured - owner will not receive critical alerts. Configure ownerName and ownerEmail via admin portal.");
    return; // Don't throw - allow incident creation to proceed
  }

  const { EMAIL_USER, EMAIL_PASS } = process.env;
  if (!EMAIL_USER || !EMAIL_PASS) {
    console.warn("[EMAIL] EMAIL_USER or EMAIL_PASS not configured - owner critical alert cannot be sent.");
    return; // Don't throw - allow incident creation to proceed
  }

  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASS.replace(/\s/g, ""),
      },
    });

    await transporter.sendMail({
      from: `"Smart Water Monitor" <${EMAIL_USER}>`,
      to: settings.ownerEmail,
      subject: "[CRITICAL] Smart Water Monitor alert",
      text: [
        `Hello ${settings.ownerName},`,
        "",
        "A new CRITICAL water system alert was detected.",
        `Leak prediction: ${prediction.mlPredictionData === 1 ? "Detected" : "Not detected"}`,
        `Leak probability: ${prediction.mlProbability ?? "Unavailable"}%`,
        `Severity: ${prediction.mlSeverity ?? "Unavailable"}`,
        `Flow rate: ${prediction.flowSensorData ?? "Unavailable"} L/min`,
        `Pressure: ${prediction.pressureSensorData ?? "Unavailable"} PSI`,
        `Tank level: ${prediction.tankLevelSensorData ?? "Unavailable"}%`,
        `Turbidity: ${prediction.turbiditySensorData ?? "Unavailable"} NTU`,
        `Water loss: ${prediction.waterLossRate ?? "Unavailable"} L/hr`,
        `Detected at: ${prediction.mlProcessedAt ?? new Date().toISOString()}`,
      ].join("\n"),
    });

    console.log(`[EMAIL] ✅ Critical alert sent to ${settings.ownerEmail}.`);
  } catch (err) {
    console.error(`[EMAIL] ❌ Failed to send critical alert to owner: ${err.message}`);
    throw err;
  }
}
