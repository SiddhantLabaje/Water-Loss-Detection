import mongoose from "mongoose";

const auditLogSchema = new mongoose.Schema(
  {
    actorUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    action: { type: String, required: true, trim: true },
    entityType: { type: String, trim: true, default: "" },
    entityId: { type: String, trim: true, default: "" },
    reason: { type: String, trim: true, default: "" },
    // Safe metadata — no passwords, tokens, or secrets
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
    ipAddress: { type: String, default: "" },
  },
  { collection: "audit_logs", timestamps: true }
);

auditLogSchema.index({ actorUserId: 1 });
auditLogSchema.index({ entityType: 1, entityId: 1 });
auditLogSchema.index({ createdAt: -1 });

const AuditLog = mongoose.model("AuditLog", auditLogSchema);
export default AuditLog;
