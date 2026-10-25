import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    recipientUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    incidentId: { type: mongoose.Schema.Types.ObjectId, ref: "LeakEvent", required: true },
    relatedEntityId: { type: mongoose.Schema.Types.ObjectId, ref: "RepairAssignment", default: null },
    type: { type: String, required: true, enum: ["LEAK_DETECTED", "LEAK_ASSIGNED", "REPAIR_UPDATE"] },
    channel: { type: String, required: true, enum: ["email"], default: "email" },
    status: { type: String, required: true, enum: ["pending", "sent", "failed"], default: "pending" },
    dedupeKey: { type: String, required: true, unique: true },
    attemptedAt: { type: Date, default: null },
    sentAt: { type: Date, default: null },
    retryCount: { type: Number, default: 0 },
    errorCode: { type: String, default: "" },
  },
  { collection: "notifications", timestamps: true }
);

notificationSchema.index({ status: 1, retryCount: 1, updatedAt: 1 });
notificationSchema.index({ recipientUserId: 1, createdAt: -1 });

const Notification = mongoose.model("Notification", notificationSchema);
export default Notification;
