/**
 * repair.controller.js
 *
 * Handles repair lifecycle endpoints:
 *   GET  /api/repairs/history          — list all leak events
 *   GET  /api/repairs/:id              — single leak event detail
 *   POST /api/repairs/:id/verify-recovery — admin triggers recovery check
 *   GET  /api/repairs/:id/verification-history — audit trail for an event
 */

import LeakEvent       from "../models/leakEvent.model.js";
import RepairAssignment from "../models/repairAssignment.model.js";
import MlPrediction    from "../models/mlPrediction.model.js";
import { audit }       from "../services/audit.service.js";

// ---------------------------------------------------------------------------
// GET /api/repairs/history
// ---------------------------------------------------------------------------
export async function listRepairs(req, res) {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const skip  = (page - 1) * limit;

    const filter = {};
    if (req.query.status)   filter.status   = req.query.status;
    if (req.query.severity) filter.severity = req.query.severity;

    const [events, total] = await Promise.all([
      LeakEvent.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      LeakEvent.countDocuments(filter),
    ]);

    res.json({ events, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    console.error("[repair] listRepairs error:", err.message);
    res.status(500).json({ message: "Failed to fetch repairs." });
  }
}

// ---------------------------------------------------------------------------
// GET /api/repairs/:id
// ---------------------------------------------------------------------------
export async function getRepair(req, res) {
  try {
    const event = await LeakEvent.findById(req.params.id).lean();
    if (!event) return res.status(404).json({ message: "Repair event not found." });

    // Attach the assignment if one exists
    const assignment = await RepairAssignment.findOne({ leakEvent: event._id })
      .populate("plumber", "name email")
      .lean();

    res.json({ event, assignment: assignment || null });
  } catch (err) {
    console.error("[repair] getRepair error:", err.message);
    res.status(500).json({ message: "Failed to fetch repair." });
  }
}

// ---------------------------------------------------------------------------
// POST /api/repairs/:id/verify-recovery
// Admin-only: checks recent ML predictions to confirm the leak is resolved.
// ---------------------------------------------------------------------------
export async function verifyRecovery(req, res) {
  try {
    const event = await LeakEvent.findById(req.params.id);
    if (!event) return res.status(404).json({ message: "Repair event not found." });

    const REQUIRED = parseInt(process.env.RECOVERY_REQUIRED_READINGS || "3");
    const MAX_AGE  = parseInt(process.env.RECOVERY_MAX_AGE_MINUTES   || "5");
    const since    = new Date(Date.now() - MAX_AGE * 60 * 1000);

    const recentNormal = await MlPrediction.countDocuments({
      overallSystemStatus: "NORMAL",
      createdAt: { $gte: since },
    });

    if (recentNormal >= REQUIRED) {
      event.status = "RECOVERED";
      event.statusHistory.push({
        status:    "RECOVERED",
        changedBy: req.user._id,
        reason:    `${recentNormal} consecutive NORMAL readings in the last ${MAX_AGE} min.`,
        at:        new Date(),
      });
      await event.save();
      await audit(req.user._id, "RECOVERY_VERIFIED", { eventId: event._id, recentNormal });
      return res.json({ recovered: true, event });
    }

    res.json({
      recovered: false,
      message:   `Only ${recentNormal}/${REQUIRED} NORMAL readings in the last ${MAX_AGE} min. Recovery not yet confirmed.`,
    });
  } catch (err) {
    console.error("[repair] verifyRecovery error:", err.message);
    res.status(500).json({ message: "Recovery verification failed." });
  }
}

// ---------------------------------------------------------------------------
// GET /api/repairs/:id/verification-history
// ---------------------------------------------------------------------------
export async function getVerificationHistory(req, res) {
  try {
    const event = await LeakEvent.findById(req.params.id).lean();
    if (!event) return res.status(404).json({ message: "Repair event not found." });

    res.json({ statusHistory: event.statusHistory || [] });
  } catch (err) {
    console.error("[repair] getVerificationHistory error:", err.message);
    res.status(500).json({ message: "Failed to fetch verification history." });
  }
}
