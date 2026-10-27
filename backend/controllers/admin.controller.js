import crypto from "crypto";
import User from "../models/user.model.js";
import PlumberProfile from "../models/plumberProfile.model.js";
import LeakEvent from "../models/leakEvent.model.js";
import RepairProposal from "../models/repairProposal.model.js";
import RepairAssignment from "../models/repairAssignment.model.js";
import AuditLog from "../models/auditLog.model.js";
import MlPrediction from "../models/mlPrediction.model.js";
import { audit } from "../services/audit.service.js";
import { ensureCurrentCriticalLeakIncident } from "../services/criticalLeak.service.js";
import {
  sendPlumberInvite,
  sendPlumberApproved,
  sendPlumberRejected,
  sendProposalSelected,
  sendProposalNotSelected,
} from "../services/notification.service.js";

// GET /api/admin/dashboard
export async function getDashboard(req, res) {
  try {
    // Ensure the latest critical block has an incident before computing counts
    ensureCurrentCriticalLeakIncident().catch(() => {});

    const [
      totalSensors,
      totalPredictions,
      leakEvents,
      openForProposals,
      assigned,
      inProgress,
      pendingVerification,
      recovered,
      pendingPlumbers,
      latestPrediction,
      recentLeaks,
    ] = await Promise.all([
      // sensors count
      (await import("../models/sensor.model.js")).default.countDocuments(),
      MlPrediction.countDocuments(),
      LeakEvent.countDocuments(),
      LeakEvent.countDocuments({ status: "OPEN_FOR_PROPOSALS" }),
      LeakEvent.countDocuments({ status: "ASSIGNED" }),
      LeakEvent.countDocuments({ status: "REPAIR_IN_PROGRESS" }),
      LeakEvent.countDocuments({ status: "REPAIR_REPORTED_COMPLETE" }),
      LeakEvent.countDocuments({ status: "RECOVERED" }),
      PlumberProfile.countDocuments({ approvalStatus: "pending" }),
      MlPrediction.findOne().sort({ _id: -1 }).lean(),
      LeakEvent.find().sort({ createdAt: -1 }).limit(5).lean(),
    ]);

    // Count submitted proposals and active assignments for dashboard KPIs
    const [submittedProposals, activeAssignments, repairsAwaitingVerification] = await Promise.all([
      (await import("../models/repairProposal.model.js")).default.countDocuments({ status: "submitted" }),
      RepairAssignment.countDocuments({ status: { $in: ["assigned", "accepted", "in_progress"] } }),
      LeakEvent.countDocuments({ status: { $in: ["VERIFYING_RECOVERY", "REPAIR_REPORTED_COMPLETE"] } }),
    ]);

    res.json({
      // Flat counts shape consumed by admin.html
      counts: {
        sensors:                  totalSensors,
        leakIncidents:            leakEvents,
        pendingPlumbers,
        submittedProposals,
        activeAssignments,
        repairsAwaitingVerification,
        recoveredIncidents:       recovered,
      },
      // Extra detail for the sensor-status line
      latestPrediction,
      recentLeaks,
      // Structured breakdown (for any future use)
      leaks: { total: leakEvents, openForProposals, assigned, inProgress, pendingVerification: repairsAwaitingVerification, recovered },
      plumbers: { pendingApproval: pendingPlumbers },
    });
  } catch (err) {
    console.error("admin dashboard error:", err);
    res.status(500).json({ message: "Failed to load dashboard." });
  }
}

// GET /api/admin/plumbers
export async function listPlumbers(req, res) {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status) filter.approvalStatus = status;

    const skip = (Math.max(1, +page) - 1) * Math.min(100, +limit);
    const [profiles, total] = await Promise.all([
      PlumberProfile.find(filter)
        .populate("userId", "name email accountStatus createdAt")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(+limit)
        .lean(),
      PlumberProfile.countDocuments(filter),
    ]);

    res.json({ total, page: +page, limit: +limit, data: profiles });
  } catch (err) {
    res.status(500).json({ message: "Failed to list plumbers." });
  }
}

// POST /api/admin/plumbers  (admin-registers a trusted plumber by invite)
export async function registerPlumber(req, res) {
  try {
    const { name, email, phone, serviceArea, city, state,
            serviceRadiusKm, experienceYears, skills } = req.body;

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ message: "A user with this email already exists." });
    }

    // Count admin-registered plumbers (trusted initial five limit)
    const adminRegCount = await PlumberProfile.countDocuments({ isAdminRegistered: true });
    if (adminRegCount >= 5) {
      return res.status(400).json({
        message: "The maximum of 5 admin-registered plumbers has been reached. Additional plumbers can self-register.",
      });
    }

    // Create user with a temporary placeholder password — plumber must set their own via invite
    const tempHash    = await User.hashPassword(crypto.randomBytes(32).toString("hex"));
    const inviteToken = crypto.randomBytes(32).toString("hex");

    const user = await User.create({
      name, email,
      passwordHash: tempHash,
      role: "plumber",
      emailVerified: false,
      accountStatus: "pending",
    });

    await PlumberProfile.create({
      userId: user._id,
      phone: phone || "",
      serviceArea: serviceArea || "",
      city: city || "",
      state: state || "",
      serviceRadiusKm: serviceRadiusKm || 25,
      experienceYears: experienceYears || 0,
      skills: Array.isArray(skills) ? skills : [],
      approvalStatus: "pending",
      isAdminRegistered: true,
      inviteToken,
      inviteExpires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    try { await sendPlumberInvite(email, name, inviteToken); } catch {}

    await audit(req.user._id, "ADMIN_REGISTERED_PLUMBER", "User", user._id, { email }, req);

    res.status(201).json({ message: "Plumber registered and invitation email sent.", id: user._id });
  } catch (err) {
    console.error("registerPlumber error:", err);
    res.status(500).json({ message: "Failed to register plumber." });
  }
}

// GET /api/admin/plumbers/:id
export async function getPlumber(req, res) {
  try {
    const profile = await PlumberProfile.findById(req.params.id)
      .populate("userId", "name email accountStatus createdAt lastLoginAt")
      .lean();
    if (!profile) return res.status(404).json({ message: "Plumber not found." });
    res.json(profile);
  } catch (err) {
    res.status(500).json({ message: "Failed to get plumber." });
  }
}

// PATCH /api/admin/plumbers/:id/approval
export async function updatePlumberApproval(req, res) {
  try {
    const { status, reason } = req.body; // "approved" | "rejected"

    const profile = await PlumberProfile.findById(req.params.id).populate("userId");
    if (!profile) return res.status(404).json({ message: "Plumber not found." });

    profile.approvalStatus  = status;
    if (status === "approved") {
      profile.approvedBy = req.user._id;
      profile.approvedAt = new Date();
      profile.userId.accountStatus = "active";
      await profile.userId.save();
    } else {
      profile.rejectionReason = reason || "";
      profile.userId.accountStatus = "rejected";
      await profile.userId.save();
    }
    await profile.save();

    await audit(req.user._id, `PLUMBER_${status.toUpperCase()}`, "PlumberProfile", profile._id, { reason }, req);

    res.json({ message: `Plumber ${status}.` });
    setImmediate(() => {
      const sendNotification = status === "approved"
        ? sendPlumberApproved(profile.userId)
        : sendPlumberRejected(profile.userId, reason);
      sendNotification.catch((err) => {
        console.error(`[EMAIL] Failed to send plumber ${status} notification:`, err.message);
      });
    });
  } catch (err) {
    console.error("updatePlumberApproval error:", err);
    res.status(500).json({ message: "Failed to update approval." });
  }
}

// PATCH /api/admin/plumbers/:id/status
export async function updatePlumberStatus(req, res) {
  try {
    const { status } = req.body; // "active" | "suspended"
    const profile = await PlumberProfile.findById(req.params.id).populate("userId");
    if (!profile) return res.status(404).json({ message: "Plumber not found." });

    profile.userId.accountStatus = status;
    if (status === "suspended") profile.approvalStatus = "suspended";
    await profile.userId.save();
    await profile.save();

    await audit(req.user._id, `PLUMBER_STATUS_${status.toUpperCase()}`, "User", profile.userId._id, {}, req);
    res.json({ message: `Account ${status}.` });
  } catch (err) {
    res.status(500).json({ message: "Failed to update status." });
  }
}

// GET /api/admin/leaks
export async function listLeaks(req, res) {
  try {
    // Always make sure the current critical block has an open incident.
    // This is fast (a few indexed queries) and ensures the admin sees
    // real-time incidents even if the broadcaster hasn't ticked yet.
    ensureCurrentCriticalLeakIncident().catch((err) => {
      console.warn("[ADMIN] ensureCurrentCriticalLeakIncident warning:", err.message);
    });

    const { status, severity, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (status)   filter.status   = status;
    if (severity) filter.severity = severity;

    const skip = (Math.max(1, +page) - 1) * Math.min(100, +limit);
    const [data, total] = await Promise.all([
      LeakEvent.find(filter).sort({ createdAt: -1 }).skip(skip).limit(+limit).lean(),
      LeakEvent.countDocuments(filter),
    ]);

    console.log(
      `[ADMIN] listLeaks status="${status || "all"}" → ${total} total, ${data.length} returned`
    );
    res.json({ total, page: +page, limit: +limit, data });
  } catch (err) {
    console.error("[ADMIN] listLeaks error:", err.message);
    res.status(500).json({ message: "Failed to list leak incidents." });
  }
}

// GET /api/admin/leaks/:id
export async function getLeakDetail(req, res) {
  try {
    const leak = await LeakEvent.findById(req.params.id).lean();
    if (!leak) return res.status(404).json({ message: "Incident not found." });

    const [proposals, assignment] = await Promise.all([
      RepairProposal.find({ incidentId: leak._id })
        .populate("plumberId", "name email")
        .lean(),
      RepairAssignment.findOne({ incidentId: leak._id, status: { $ne: "cancelled" } })
        .populate("plumberId", "name email")
        .lean(),
    ]);

    res.json({ leak, proposals, assignment });
  } catch (err) {
    res.status(500).json({ message: "Failed to get incident." });
  }
}

// PATCH /api/admin/leaks/:id/status
export async function updateLeakStatus(req, res) {
  try {
    const { status, reason } = req.body;
    const leak = await LeakEvent.findById(req.params.id);
    if (!leak) return res.status(404).json({ message: "Incident not found." });

    leak.statusHistory.push({ status, changedBy: req.user._id, reason, at: new Date() });
    leak.status = status;
    await leak.save();

    await audit(req.user._id, "LEAK_STATUS_UPDATED", "LeakEvent", leak._id, { status, reason }, req);
    res.json({ message: "Status updated.", status });
  } catch (err) {
    res.status(500).json({ message: "Failed to update status." });
  }
}

// GET /api/admin/leaks/:id/proposals
export async function getLeakProposals(req, res) {
  try {
    const proposals = await RepairProposal.find({ incidentId: req.params.id })
      .populate("plumberId", "name email")
      .sort({ totalEstimatedCharges: 1 })
      .lean();

    // Attach plumber profile to each
    const enriched = await Promise.all(proposals.map(async (p) => {
      const profile = await PlumberProfile.findOne({ userId: p.plumberId?._id }).lean();
      return { ...p, plumberProfile: profile };
    }));

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ message: "Failed to get proposals." });
  }
}

// POST /api/admin/leaks/:id/assign
export async function assignPlumber(req, res) {
  try {
    const { proposalId } = req.body;
    const leak = await LeakEvent.findById(req.params.id);
    if (!leak) return res.status(404).json({ message: "Incident not found." });

    if (!["OPEN_FOR_PROPOSALS", "DETECTED"].includes(leak.status)) {
      return res.status(400).json({ message: "Incident is not available for assignment." });
    }

    const proposal = await RepairProposal.findById(proposalId);
    if (!proposal || proposal.incidentId.toString() !== leak._id.toString()) {
      return res.status(400).json({ message: "Invalid proposal." });
    }
    if (proposal.status !== "submitted") {
      return res.status(400).json({ message: "Proposal is no longer available." });
    }

    const plumber = await User.findById(proposal.plumberId);
    if (!plumber || plumber.accountStatus !== "active") {
      return res.status(400).json({ message: "Plumber is not active." });
    }

    // Check for existing active assignment
    const existing = await RepairAssignment.findOne({
      incidentId: leak._id,
      status: { $nin: ["cancelled", "reassigned"] },
    });
    if (existing) {
      return res.status(409).json({ message: "An active assignment already exists for this incident." });
    }

    // Create assignment
    const assignment = await RepairAssignment.create({
      incidentId: leak._id,
      selectedProposalId: proposal._id,
      plumberId: plumber._id,
      assignedBy: req.user._id,
    });

    // Mark selected proposal
    proposal.status = "selected";
    await proposal.save();

    // Mark all other proposals as not_selected
    await RepairProposal.updateMany(
      { incidentId: leak._id, _id: { $ne: proposal._id }, status: "submitted" },
      { $set: { status: "not_selected" } }
    );

    // Update leak status
    leak.status = "ASSIGNED";
    leak.statusHistory.push({ status: "ASSIGNED", changedBy: req.user._id, at: new Date() });
    await leak.save();

    // Notifications
    try { await sendProposalSelected(plumber, leak, proposal); } catch {}

    // Notify other plumbers (no price info shared)
    const otherProposals = await RepairProposal.find({
      incidentId: leak._id,
      status: "not_selected",
    }).populate("plumberId", "name email");
    for (const op of otherProposals) {
      try { await sendProposalNotSelected(op.plumberId, leak); } catch {}
    }

    await audit(req.user._id, "PLUMBER_ASSIGNED", "LeakEvent", leak._id, {
      proposalId: proposal._id,
      plumberId: plumber._id,
    }, req);

    res.json({ message: "Plumber assigned successfully.", assignment });
  } catch (err) {
    console.error("assignPlumber error:", err);
    res.status(500).json({ message: "Assignment failed." });
  }
}

// POST /api/admin/assignments/:id/reassign
export async function reassignPlumber(req, res) {
  try {
    const { reason } = req.body;
    const assignment = await RepairAssignment.findById(req.params.id);
    if (!assignment) return res.status(404).json({ message: "Assignment not found." });

    assignment.status = "reassigned";
    assignment.reassignmentReason = reason;
    assignment.statusHistory.push({ status: "reassigned", changedBy: req.user._id, reason, at: new Date() });
    await assignment.save();

    // Re-open the leak
    const leak = await LeakEvent.findById(assignment.incidentId);
    if (leak) {
      leak.status = "OPEN_FOR_PROPOSALS";
      leak.statusHistory.push({ status: "OPEN_FOR_PROPOSALS", changedBy: req.user._id, reason, at: new Date() });
      await leak.save();
    }

    await audit(req.user._id, "ASSIGNMENT_REASSIGNED", "RepairAssignment", assignment._id, { reason }, req);
    res.json({ message: "Assignment cancelled. Incident reopened for proposals." });
  } catch (err) {
    res.status(500).json({ message: "Reassignment failed." });
  }
}

// GET /api/admin/assignments
export async function listAssignments(req, res) {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    const skip = (Math.max(1, +page) - 1) * Math.min(100, +limit);
    const [data, total] = await Promise.all([
      RepairAssignment.find(filter)
        .populate("plumberId", "name email")
        .populate("incidentId", "incidentId severity status")
        .sort({ createdAt: -1 })
        .skip(skip).limit(+limit).lean(),
      RepairAssignment.countDocuments(filter),
    ]);
    res.json({ total, page: +page, limit: +limit, data });
  } catch (err) {
    res.status(500).json({ message: "Failed to list assignments." });
  }
}

// GET /api/admin/audit-logs
export async function getAuditLogs(req, res) {
  try {
    const { page = 1, limit = 50 } = req.query;
    const skip = (Math.max(1, +page) - 1) * Math.min(200, +limit);
    const [data, total] = await Promise.all([
      AuditLog.find().sort({ createdAt: -1 }).skip(skip).limit(+limit)
        .populate("actorUserId", "name email role").lean(),
      AuditLog.countDocuments(),
    ]);
    res.json({ total, page: +page, limit: +limit, data });
  } catch (err) {
    res.status(500).json({ message: "Failed to get audit logs." });
  }
}
