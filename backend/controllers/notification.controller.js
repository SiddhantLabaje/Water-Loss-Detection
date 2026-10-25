import NotificationSettings from "../models/notificationSettings.model.js";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const getNotificationSettings = async (_req, res) => {
  try {
    const settings = await NotificationSettings.findOne().lean();
    if (!settings) {
      return res.status(404).json({ message: "Owner notification settings are not configured." });
    }

    res.json({ ownerName: settings.ownerName, ownerEmail: settings.ownerEmail });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const saveNotificationSettings = async (req, res) => {
  try {
    const ownerName = typeof req.body.ownerName === "string" ? req.body.ownerName.trim() : "";
    const ownerEmail = typeof req.body.ownerEmail === "string"
      ? req.body.ownerEmail.trim().toLowerCase()
      : "";

    if (!ownerName) {
      return res.status(400).json({ message: "Owner name is required." });
    }
    if (!emailPattern.test(ownerEmail)) {
      return res.status(400).json({ message: "A valid owner email address is required." });
    }

    const settings = await NotificationSettings.findOneAndUpdate(
      {},
      { ownerName, ownerEmail },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    ).lean();

    res.json({
      message: "Critical alert email recipient saved.",
      settings: { ownerName: settings.ownerName, ownerEmail: settings.ownerEmail },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
