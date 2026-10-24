/**
 * Email Settings Controller
 *
 * POST /api/email/settings      — save/update recipient email
 * GET  /api/email/settings      — retrieve current settings
 * POST /api/email/send-report   — send the dashboard report now
 */

import EmailSettings from "../models/emailSettings.model.js";
import { sendDashboardReport } from "../services/email.service.js";
import MlPrediction from "../models/mlPrediction.model.js";

// ── Save / update recipient settings ─────────────────────────────────────────
export const saveEmailSettings = async (req, res) => {
  try {
    const { recipientEmail, recipientName, ccEmails, alertOnCritical } = req.body;

    if (!recipientEmail) {
      return res.status(400).json({ message: "recipientEmail is required." });
    }

    // Basic email format validation
    const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRx.test(recipientEmail)) {
      return res.status(400).json({ message: "Invalid email address format." });
    }

    // Validate CC emails if provided
    if (ccEmails && Array.isArray(ccEmails)) {
      for (const cc of ccEmails) {
        if (cc && !emailRx.test(cc.trim())) {
          return res
            .status(400)
            .json({ message: `Invalid CC email address: ${cc}` });
        }
      }
    }

    // Upsert — only one settings document at a time
    const settings = await EmailSettings.findOneAndUpdate(
      {},  // match any
      {
        recipientEmail: recipientEmail.trim().toLowerCase(),
        recipientName: recipientName?.trim() || "Dashboard User",
        ccEmails: Array.isArray(ccEmails)
          ? ccEmails.map((e) => e.trim().toLowerCase()).filter(Boolean)
          : [],
        alertOnCritical: Boolean(alertOnCritical),
      },
      { upsert: true, new: true, runValidators: true }
    );

    res.json({
      message: "Email settings saved successfully.",
      settings,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── Get current settings ──────────────────────────────────────────────────────
export const getEmailSettings = async (req, res) => {
  try {
    const settings = await EmailSettings.findOne();
    if (!settings) {
      return res.status(404).json({ message: "No email settings configured yet." });
    }
    res.json(settings);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── Send dashboard report NOW ─────────────────────────────────────────────────
export const sendReportNow = async (req, res) => {
  try {
    let { recipientEmail, recipientName, ccEmails } = req.body;

    if (!recipientEmail) {
      const settings = await EmailSettings.findOne();
      if (!settings) {
        return res.status(400).json({
          message:
            "No recipient email provided and no saved settings found. " +
            "Please save email settings first (POST /api/email/settings).",
        });
      }
      recipientEmail = settings.recipientEmail;
      recipientName  = settings.recipientName;
      ccEmails       = settings.ccEmails;
    }

    const result = await sendDashboardReport({
      to:   recipientEmail,
      name: recipientName || "Dashboard User",
      cc:   Array.isArray(ccEmails) ? ccEmails : [],
    });

    res.json({
      message: `Report sent successfully to ${recipientEmail}.`,
      messageId: result.messageId,
      accepted:  result.accepted,
      rejected:  result.rejected,
    });
  } catch (err) {
    const isAuth = err.message?.includes("Invalid login") || err.code === "EAUTH";
    res.status(500).json({
      message: isAuth
        ? "SMTP authentication failed. Check EMAIL_USER and EMAIL_PASS in your .env file. " +
          "Make sure you are using a Gmail App Password, not your regular password."
        : err.message,
    });
  }
};

// ── Test auto-alert (fires immediately using saved settings) ──────────────────
export const testAlert = async (req, res) => {
  try {
    const settings = await EmailSettings.findOne();
    if (!settings?.recipientEmail) {
      return res.status(400).json({ message: "No saved email settings found. Save settings first." });
    }

    const latest = await MlPrediction.findOne().sort({ _id: -1 }).lean();
    const status  = latest?.overallSystemStatus || "UNKNOWN";

    const result = await sendDashboardReport({
      to:      settings.recipientEmail,
      name:    settings.recipientName || "Dashboard User",
      cc:      settings.ccEmails || [],
      subject: `[TEST] Water Monitor Alert — ${status}`,
    });

    res.json({
      message:   `Test alert sent to ${settings.recipientEmail}.`,
      status,
      messageId: result.messageId,
      accepted:  result.accepted,
    });
  } catch (err) {
    const isAuth = err.message?.includes("Invalid login") || err.code === "EAUTH";
    res.status(500).json({
      message: isAuth
        ? "SMTP authentication failed. Check EMAIL_USER and EMAIL_PASS in .env."
        : err.message,
    });
  }
};
