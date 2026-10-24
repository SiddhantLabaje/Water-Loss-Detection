import mongoose from "mongoose";

/**
 * Stores the recipient email address(es) for dashboard reports.
 * Only one document is kept (upsert pattern — singleton config).
 */
const emailSettingsSchema = new mongoose.Schema(
  {
    recipientEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    // Optional: CC list as comma-separated or array
    ccEmails: {
      type: [String],
      default: [],
    },
    // Label / name for the recipient (display purposes)
    recipientName: {
      type: String,
      trim: true,
      default: "Dashboard User",
    },
    // Whether to auto-send when a leak prediction is detected
    alertOnCritical: {
      type: Boolean,
      default: false,
    },
  },
  {
    collection: "email_settings",
    timestamps: true,
  }
);

const EmailSettings = mongoose.model("EmailSettings", emailSettingsSchema);
export default EmailSettings;
