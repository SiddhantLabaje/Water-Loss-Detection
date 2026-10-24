/**
 * Email Settings Controller
 *
 * POST /api/email/settings      — save/update recipient email
 * GET  /api/email/settings      — retrieve current settings
 * POST /api/email/send-report   — send the dashboard report now
 */

import EmailSettings from "../models/emailSettings.model.js";
import { sendDashboardReport } from "../services/email.service.js";

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
    // Allow overriding recipient via request body, or fall back to saved settings
    let { recipientEmail, recipientName, ccEmails } = req.body;

    if (!recipientEmail) {
      // Load from saved settings
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
    // Provide a friendly message for common SMTP errors
    const isAuth = err.message?.includes("Invalid login") || err.code === "EAUTH";
    res.status(500).json({
      message: isAuth
        ? "SMTP authentication failed. Check EMAIL_USER and EMAIL_PASS in your .env file. " +
          "Make sure you are using a Gmail App Password, not your regular password."
        : err.message,
    });
  }
};
