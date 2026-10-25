import AuditLog from "../models/auditLog.model.js";

/**
 * Record an audit log entry. Failures are logged rather than hidden.
 */
export async function audit(actorUserId, action, entityType = "", entityId = "", meta = {}, req = null) {
  try {
    await AuditLog.create({
      actorUserId: actorUserId || null,
      action,
      entityType,
      entityId: entityId ? String(entityId) : "",
      meta,
      ipAddress: req ? (req.ip || "") : "",
    });
  } catch (err) {
    console.error(`[AUDIT] Failed to record ${action}:`, err.message);
  }
}
