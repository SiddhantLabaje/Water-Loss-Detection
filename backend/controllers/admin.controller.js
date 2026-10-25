import { createHash, randomBytes } from "node:crypto";
import mongoose from "mongoose";
import AuditLog from "../models/auditLog.model.js";
import LeakEvent from "../models/leakEvent.model.js";
import PlumberProfile from "../models/plumberProfile.model.js";
import RepairAssignment from "../models/repairAssignment.model.js";
import RepairProposal from "../models/repairProposal.model.js";
import RepairRecord from "../models/repairRecord.model.js";
import Sensor from "../models/sensor.model.js";
import MlPrediction from "../models/mlPrediction.model.js";
import Notification from "../models/notification.model.js";
import User from "../models/user.model.js";
import { audit } from "../services/audit.service.js";
import {
  notifyAssignment,
  sendPlumberApproved,
  sendPlumberInvite,
  sendPlumberRejected,
} from "../services/notification.service.js";

const hashToken = (value) => createHash("sha256").update(value).digest("hex");
const safeUserFields = "name email accountStatus emailVerified createdAt";

export async function listPlumbers(req, res) {
  try {
    const filter = {};
    if (["pending", "approved", "rejected", "suspended"].includes(req.query.status)) {
      filter.approvalStatus = req.query.status;
    }
    const profiles = await PlumberProfile.find(filter)
      .sort({ createdAt: -1 })
      .limit(Math.min(Number(req.query.limit) || 50, 200))
      .populate("userId", safeUserFields)
      .lean();
    res.json(profiles);
  } catch (err) {
    console.error("[ADMIN] Plumber list failed:", err.message);
    res.status(500).json({ message: "Unable to load plumbers." });
  }
}

export async function getDashboard(_req, res) {
  try {
    const [
      sensorCount, latestSensor, latestPrediction, totalLeaks, leakStatusCounts,
      pendingPlumbers, proposalCount, activeAssignments, repairsAwaitingVerification,
      recoveredIncidents, notificationStats,
    ] = await Promise.all([
      Sensor.countDocuments(),
      Sensor.findOne().sort({ _id: -1 }).lean(),
      MlPrediction.findOne().sort({ _id: -1 }).lean(),
      LeakEvent.countDocuments(),
      LeakEvent.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      PlumberProfile.countDocuments({ approvalStatus: "pending" }),
      RepairProposal.countDocuments({ status: "submitted" }),
      RepairAssignment.countDocuments({ status: { $in: ["assigned", "accepted", "in_progress"] } }),
      RepairRecord.countDocuments({ recoveryVerificationStatus: { $in: ["pending", "verifying", "inconclusive"] } }),
      LeakEvent.countDocuments({ status: "RECOVERED" }),
      Notification.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    ]);

    res.json({
      counts: {
        sensors: sensorCount,
        leakIncidents: totalLeaks,
        pendingPlumbers,
        submittedProposals: proposalCount,
        activeAssignments,
        repairsAwaitingVerification,
        recoveredIncidents,
        leaksByStatus: Object.fromEntries(leakStatusCounts.map(({ _id, count }) => [_id, count])),
        notifications: Object.fromEntries(notificationStats.map(({ _id, count }) => [_id, count])),
      },
      latestSensor,
      latestPrediction,
    });
  } catch (err) {
    console.error("[ADMIN] Dashboard query failed:", err.message);
    res.status(500).json({ message: "Unable to load administrator dashboard." });
  }
}

export async function createPlumberInvite(req, res) {
  let user;
  try {
    const email = req.body.email.trim().toLowerCase();
    if (await User.exists({ email })) {
      return res.status(409).json({ message: "An account with this email already exists." });
    }

    const inviteToken = randomBytes(32).toString("hex");
    user = await User.create({
      name: req.body.name.trim(),
      email,
      passwordHash: await User.hashPassword(randomBytes(48).toString("hex")),
      role: "plumber",
      emailVerified: false,
      accountStatus: "pending",
    });
    await PlumberProfile.create({
      userId: user._id,
      phone: req.body.phone.trim(),
      businessName: req.body.businessName?.trim() || "",
      address: req.body.address.trim(),
      city: req.body.city.trim(),
      state: req.body.state.trim(),
      serviceArea: `${req.body.city.trim()}, ${req.body.state.trim()}`,
      serviceRadiusKm: Number(req.body.serviceRadiusKm),
      experienceYears: Number(req.body.experienceYears),
      skills: req.body.skills,
      workingHours: req.body.workingHours?.trim() || "",
      approvalStatus: "approved",
      approvedBy: req.user._id,
      approvedAt: new Date(),
      isAdminRegistered: true,
      inviteToken: hashToken(inviteToken),
      inviteExpires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    await sendPlumberInvite(email, user.name, inviteToken);
    await audit(req.user._id, "PLUMBER_INVITED", "User", user._id, {}, req);
    res.status(201).json({ message: "Plumber invitation sent." });
  } catch (err) {
    if (user?._id) {
      await PlumberProfile.deleteOne({ userId: user._id });
      await User.deleteOne({ _id: user._id });
    }
    if (err.code === 11000) return res.status(409).json({ message: "An account with this email already exists." });
    console.error("[ADMIN] Plumber invitation failed:", err.message);
    res.status(503).json({ message: "Unable to create and send the plumber invitation. Check email configuration and retry." });
  }
}

export async function setPlumberApproval(req, res) {
  try {
    const { status, reason = "" } = req.body;
    const profile = await PlumberProfile.findById(req.params.id);
    if (!profile) return res.status(404).json({ message: "Plumber not found." });
    if (profile.isAdminRegistered) {
      return res.status(409).json({ message: "Invited plumbers are approved through their invitation." });
    }
    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({ message: "Approval status must be approved or rejected." });
    }

    profile.approvalStatus = status;
    profile.approvedBy = status === "approved" ? req.user._id : null;
    profile.approvedAt = status === "approved" ? new Date() : null;
    profile.rejectionReason = status === "rejected" ? reason.trim() : "";
    await profile.save();
    await User.updateOne(
      { _id: profile.userId },
      { $set: { accountStatus: status === "approved" ? "active" : "rejected" } }
    );
    const user = await User.findById(profile.userId).select("name email");
    try {
      if (status === "approved") await sendPlumberApproved(user);
      else await sendPlumberRejected(user, reason);
    } catch (err) {
      console.error(`[EMAIL] Plumber ${status} notice failed for ${user?.id}: ${err.message}`);
    }
    await audit(req.user._id, `PLUMBER_${status.toUpperCase()}`, "PlumberProfile", profile._id, { reason }, req);
    res.json({ message: `Plumber ${status}.` });
  } catch (err) {
    console.error("[ADMIN] Plumber approval update failed:", err.message);
    res.status(500).json({ message: "Unable to update plumber approval." });
  }
}

export async function setPlumberStatus(req, res) {
  try {
    const { status } = req.body;
    const profile = await PlumberProfile.findById(req.params.id);
    if (!profile) return res.status(404).json({ message: "Plumber not found." });
    if (!["approved", "suspended"].includes(profile.approvalStatus)) {
      return res.status(409).json({ message: "Only approved plumbers can be activated or suspended." });
    }
    if (!["active", "suspended"].includes(status)) {
      return res.status(400).json({ message: "Status must be active or suspended." });
    }
    profile.approvalStatus = status === "active" ? "approved" : "suspended";
    await profile.save();
    await User.updateOne({ _id: profile.userId }, { $set: { accountStatus: status } });
    await audit(req.user._id, `PLUMBER_${status.toUpperCase()}`, "PlumberProfile", profile._id, {}, req);
    res.json({ message: `Plumber account ${status}.` });
  } catch (err) {
    console.error("[ADMIN] Plumber status update failed:", err.message);
    res.status(500).json({ message: "Unable to update plumber status." });
  }
}

export async function listLeaks(req, res) {
  try {
    const query = {};
    if (typeof req.query.status === "string") query.status = req.query.status;
    const leaks = await LeakEvent.find(query)
      .sort({ createdAt: -1 })
      .limit(Math.min(Number(req.query.limit) || 50, 200))
      .populate("predictionRef")
      .lean();
    res.json(leaks);
  } catch (err) {
    console.error("[ADMIN] Leak list failed:", err.message);
    res.status(500).json({ message: "Unable to load leak incidents." });
  }
}

export async function getLeak(req, res) {
  try {
    const leak = await LeakEvent.findById(req.params.id).populate("predictionRef").lean();
    if (!leak) return res.status(404).json({ message: "Leak incident not found." });
    res.json(leak);
  } catch (err) {
    res.status(err instanceof mongoose.Error.CastError ? 400 : 500).json({
      message: err instanceof mongoose.Error.CastError ? "Invalid incident ID." : "Unable to load leak incident.",
    });
  }
}

export async function setLeakStatus(req, res) {
  try {
    const allowed = new Set([
      "DETECTED:OPEN_FOR_PROPOSALS",
      "OPEN_FOR_PROPOSALS:CANCELLED",
      "RECOVERY_FAILED:VERIFYING_RECOVERY",
      "AWAITING_INSPECTION:VERIFYING_RECOVERY",
    ]);
    const leak = await LeakEvent.findById(req.params.id);
    if (!leak) return res.status(404).json({ message: "Leak incident not found." });
    if (!allowed.has(`${leak.status}:${req.body.status}`)) {
      return res.status(409).json({ message: "That incident status transition is not allowed." });
    }
    leak.status = req.body.status;
    if (req.body.status === "CANCELLED") leak.activeKey = undefined;
    leak.statusHistory.push({ status: req.body.status, changedBy: req.user._id, reason: req.body.reason || "" });
    await leak.save();
    await audit(req.user._id, "LEAK_STATUS_CHANGED", "LeakEvent", leak._id, { status: leak.status, reason: req.body.reason || "" }, req);
    res.json(leak);
  } catch (err) {
    console.error("[ADMIN] Leak status update failed:", err.message);
    res.status(500).json({ message: "Unable to update leak status." });
  }
}

export async function listProposals(req, res) {
  try {
    const proposals = await RepairProposal.find({ incidentId: req.params.id })
      .sort({ totalEstimatedCharges: 1, createdAt: 1 })
      .populate("plumberId", safeUserFields)
      .lean();
    res.json(proposals);
  } catch (err) {
    console.error("[ADMIN] Proposal list failed:", err.message);
    res.status(500).json({ message: "Unable to load proposals." });
  }
}

export async function assignProposal(req, res) {
  const session = await mongoose.startSession();
  try {
    let assignment;
    await session.withTransaction(async () => {
      const leak = await LeakEvent.findById(req.params.id).session(session);
      if (!leak || leak.status !== "OPEN_FOR_PROPOSALS") {
        const error = new Error("Incident is not open for assignment.");
        error.status = 409;
        throw error;
      }
      const proposal = await RepairProposal.findOne({
        _id: req.body.proposalId,
        incidentId: leak._id,
        status: "submitted",
      }).session(session);
      if (!proposal) {
        const error = new Error("Eligible proposal not found.");
        error.status = 404;
        throw error;
      }
      const plumber = await User.findOne({
        _id: proposal.plumberId,
        role: "plumber",
        accountStatus: "active",
      }).session(session);
      const profile = plumber && await PlumberProfile.findOne({
        userId: plumber._id,
        approvalStatus: "approved",
        availability: "available",
      }).session(session);
      if (!profile) {
        const error = new Error("The proposed plumber is not currently approved and active.");
        error.status = 409;
        throw error;
      }
      if (proposal.earliestAvailability < new Date()) {
        const error = new Error("The proposal availability date has expired; request an updated proposal.");
        error.status = 409;
        throw error;
      }

      [assignment] = await RepairAssignment.create([{
        incidentId: leak._id,
        selectedProposalId: proposal._id,
        plumberId: proposal.plumberId,
        assignedBy: req.user._id,
      }], { session });
      proposal.status = "selected";
      await proposal.save({ session });
      await RepairProposal.updateMany(
        { incidentId: leak._id, _id: { $ne: proposal._id }, status: "submitted" },
        { $set: { status: "not_selected" } },
        { session }
      );
      leak.status = "ASSIGNED";
      leak.statusHistory.push({ status: "ASSIGNED", changedBy: req.user._id, reason: "Proposal selected by administrator." });
      await leak.save({ session });
    });
    await audit(req.user._id, "REPAIR_ASSIGNED", "RepairAssignment", assignment._id, { incidentId: req.params.id }, req);
    let notificationWarning = null;
    try {
      await notifyAssignment(assignment);
    } catch (err) {
      notificationWarning = "Assignment completed, but email notification preparation failed.";
      console.error(`[EMAIL] Assignment notification setup failed for ${assignment._id}: ${err.message}`);
    }
    res.status(201).json({ assignment, notificationWarning });
  } catch (err) {
    console.error("[ADMIN] Assignment failed:", err.message);
    res.status(err.status || 500).json({
      message: err.status ? err.message : "Unable to assign proposal.",
    });
  } finally {
    await session.endSession();
  }
}

export async function reassignAssignment(req, res) {
  const session = await mongoose.startSession();
  try {
    let replacement;
    await session.withTransaction(async () => {
      const current = await RepairAssignment.findById(req.params.id).session(session);
      if (!current || !["assigned", "accepted", "in_progress"].includes(current.status)) {
        const error = new Error("No active assignment is available to reassign.");
        error.status = 404;
        throw error;
      }
      const leak = await LeakEvent.findById(current.incidentId).session(session);
      if (!leak || ["RECOVERED", "CANCELLED"].includes(leak.status)) {
        const error = new Error("Incident is not eligible for reassignment.");
        error.status = 409;
        throw error;
      }
      const proposal = await RepairProposal.findOne({
        _id: req.body.proposalId,
        incidentId: leak._id,
        status: { $in: ["submitted", "not_selected"] },
      }).session(session);
      if (!proposal || String(proposal.plumberId) === String(current.plumberId)) {
        const error = new Error("A different eligible proposal is required.");
        error.status = 409;
        throw error;
      }
      const profile = await PlumberProfile.findOne({
        userId: proposal.plumberId,
        approvalStatus: "approved",
        availability: "available",
      }).session(session);
      if (!profile) {
        const error = new Error("The replacement plumber is not approved and available.");
        error.status = 409;
        throw error;
      }
      await RepairProposal.updateOne(
        { _id: current.selectedProposalId, status: "selected" },
        { $set: { status: "not_selected" } },
        { session }
      );

      current.status = "reassigned";
      current.reassignmentReason = req.body.reason.trim();
      current.statusHistory.push({
        status: "reassigned",
        changedBy: req.user._id,
        reason: req.body.reason.trim(),
      });
      await current.save({ session });
      [replacement] = await RepairAssignment.create([{
        incidentId: leak._id,
        selectedProposalId: proposal._id,
        plumberId: proposal.plumberId,
        assignedBy: req.user._id,
        reassignmentReason: req.body.reason.trim(),
      }], { session });
      proposal.status = "selected";
      await proposal.save({ session });
      await RepairProposal.updateMany(
        { incidentId: leak._id, _id: { $ne: proposal._id }, status: "submitted" },
        { $set: { status: "not_selected" } },
        { session }
      );
      leak.status = "ASSIGNED";
      leak.statusHistory.push({ status: "ASSIGNED", changedBy: req.user._id, reason: req.body.reason.trim() });
      await leak.save({ session });
    });
    await audit(req.user._id, "REPAIR_REASSIGNED", "RepairAssignment", replacement._id, { reason: req.body.reason }, req);
    let notificationWarning = null;
    try {
      await notifyAssignment(replacement);
    } catch (err) {
      notificationWarning = "Reassignment completed, but email notification preparation failed.";
      console.error(`[EMAIL] Reassignment notification setup failed for ${replacement._id}: ${err.message}`);
    }
    res.status(201).json({ assignment: replacement, notificationWarning });
  } catch (err) {
    console.error("[ADMIN] Reassignment failed:", err.message);
    res.status(err.status || 500).json({
      message: err.status ? err.message : "Unable to reassign repair.",
    });
  } finally {
    await session.endSession();
  }
}

export async function listAssignments(req, res) {
  try {
    const assignments = await RepairAssignment.find()
      .sort({ createdAt: -1 })
      .limit(Math.min(Number(req.query.limit) || 50, 200))
      .populate("incidentId")
      .populate("plumberId", safeUserFields)
      .populate("selectedProposalId")
      .lean();
    res.json(assignments);
  } catch (err) {
    console.error("[ADMIN] Assignment list failed:", err.message);
    res.status(500).json({ message: "Unable to load assignments." });
  }
}

export async function auditLogs(req, res) {
  try {
    const entries = await AuditLog.find()
      .sort({ createdAt: -1 })
      .limit(Math.min(Number(req.query.limit) || 100, 500))
      .populate("actorUserId", "name email role")
      .lean();
    res.json(entries);
  } catch (err) {
    console.error("[ADMIN] Audit log retrieval failed:", err.message);
    res.status(500).json({ message: "Unable to load audit logs." });
  }
}

export async function acceptPlumberInvite(req, res) {
  try {
    const tokenHash = hashToken(req.body.token);
    const profile = await PlumberProfile.findOne({
      inviteToken: tokenHash,
      inviteExpires: { $gt: new Date() },
      isAdminRegistered: true,
    });
    if (!profile) return res.status(400).json({ message: "Invitation is invalid or expired." });

    const user = await User.findById(profile.userId);
    if (!user || !user.email) return res.status(400).json({ message: "Invitation account is unavailable." });
    user.passwordHash = await User.hashPassword(req.body.password);
    user.emailVerified = true;
    user.accountStatus = "active";
    user.tokenVersion += 1;
    await user.save();
    profile.inviteToken = null;
    profile.inviteExpires = null;
    await profile.save();
    res.json({ message: "Invitation accepted. You can now sign in." });
  } catch (err) {
    console.error("[AUTH] Invitation acceptance failed:", err.message);
    res.status(500).json({ message: "Unable to accept invitation." });
  }
}
