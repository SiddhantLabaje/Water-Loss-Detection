import mongoose from "mongoose";

const notificationSettingsSchema = new mongoose.Schema(
  {
    ownerName: {
      type: String,
      required: true,
      trim: true,
    },
    ownerEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
  },
  {
    collection: "notification_settings",
    timestamps: true,
  }
);

const NotificationSettings = mongoose.model(
  "NotificationSettings",
  notificationSettingsSchema
);

export default NotificationSettings;
