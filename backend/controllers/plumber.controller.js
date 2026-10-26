import mongoose from "mongoose";
import LeakEvent from "../models/leakEvent.model.js";
import PlumberProfile from "../models/plumberProfile.model.js";
import RepairAssignment from "../models/repairAssignment.model.js";
import RepairProposal from "../models/repairProposal.model.js";
import RepairRecord from "../models/repairRecord.model.js";
import MlPrediction from "../models/mlPrediction.model.js";
import User from "../models/user.model.js";
import { audit } from "../services/audit.service.js";
import { sendRepairComplete } from "../services/notification.service.js";
import { ensureCurrentCriticalLeakIncident } from "../services/criticalLeak.service.js";

const safeFields = "name email accountStatus emailVerified";

export async function getProfile(req, res) {
  res.json({ user: req.user, profile: req.plumberProfile });
}

export async function updateProfile(req, res) {
  try {
    const fields = ["phone", "businessName", "address", "city", "state", "serviceArea", "workingHours"];
    for (const field of fields) {
      if (typeof req.body[field] === "string") req.plumberProfile[field] = req.body[field].trim();
    }
    if (req.body.serviceRadiusKm !== undefined) req.plumberProfile.serviceRadiusKm = Number(req.body.serviceRadiusKm);
    if (req.body.experienceYears !== undefined) req.plumberProfile.experienceYears = Number(req.body.experienceYears);
    if (req.body.skills !== undefined) req.plumberProfile.skills = req.body.skills;
    if (req.body.availability !== undefined) req.plumberProfile.availability = req.body.availability;
    await req.plumberProfile.save();
    res.json({ profile: req.plumberProfile });
  } catch (err) {
    console.error("[PLUMBER] Profile update failed:", err.message);
    res.status(400).json({ message: "Unable to update plumber profile." });
  }
}

export async function listRepairRequests(req, res) {
  try {
    await ensureCurrentCriticalLeakIncident();
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Number(req.query.limit) || 25, 100);
    const [items, total] = await Promise.all([
      LeakEvent.find({ status: "OPEN_FOR_PROPOSALS" })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select("-statusHistory")
        .lean(),
      LeakEvent.countDocuments({ status: "OPEN_FOR_PROPOSALS" }),
    ]);
    res.json({ data: items, page, limit, total, pages: Math.ceil(total / limit) });
  } catch (err) {
    console.error("[PLUMBER] Repair request list failed:", err.message);
    res.status(500).json({ message: "Unable to load repair requests." });
  }
}

export async function getRepairRequest(req, res) {
  try {
    const leak = await LeakEvent.findOne({ _id: req.params.id, status: "OPEN_FOR_PROPOSALS" })
      .select("-statusHistory")
      .lean();
    if (!leak) return res.status(404).json({ message: "Repair request is unavailable." });
    res.json(leak);
  } catch (err) {
    res.status(err instanceof mongoose.Error.CastError ? 400 : 500).json({
      message: err instanceof mongoose.Error.CastError ? "Invalid repair request ID." : "Unable to load repair request.",
    });
  }
}

export async function createProposal(req, res) {
  try {
    const leak = await LeakEvent.findOne({ _id: req.params.id, status: "OPEN_FOR_PROPOSALS" }).lean();
    if (!leak) return res.status(404).json({ message: "Repair request is unavailable." });
    const total = Number(req.body.labourCharges) +
      Number(req.body.materialCharges) +
      Number(req.body.visitCharges || 0) +
      Number(req.body.otherCharges || 0);
    const proposal = await RepairProposal.create({
      incidentId: leak._id,
      plumberId: req.user._id,
      repairMethod: req.body.repairMethod.trim(),
      labourCharges: Number(req.body.labourCharges),
      materialCharges: Number(req.body.materialCharges),
      visitCharges: Number(req.body.visitCharges || 0),
      otherCharges: Number(req.body.otherCharges || 0),
      totalEstimatedCharges: Math.round(total * 100) / 100,
      estimatedDurationHours: Number(req.body.estimatedDurationHours),
      earliestAvailability: new Date(req.body.earliestAvailability),
      warrantyDetails: req.body.warrantyDetails?.trim() || "",
      notes: req.body.notes?.trim() || "",
    });
    await audit(req.user._id, "PROPOSAL_SUBMITTED", "RepairProposal", proposal._id, { incidentId: leak._id }, req);
    res.status(201).json(proposal);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: "You already have an active proposal for this incident." });
    }
    console.error("[PLUMBER] Proposal creation failed:", err.message);
    res.status(400).json({ message: "Unable to submit proposal." });
  }
}

export async function listProposals(req, res) {
  try {
    const proposals = await RepairProposal.find({ plumberId: req.user._id })
      .sort({ createdAt: -1 })
      .populate("incidentId", "incidentId severity status createdAt")
      .lean();
    res.json(proposals);
  } catch (err) {
    console.error("[PLUMBER] Proposal list failed:", err.message);
    res.status(500).json({ message: "Unable to load proposals." });
  }
}

export async function updateProposal(req, res) {
  try {
    const proposal = await RepairProposal.findOne({
      _id: req.params.id,
      plumberId: req.user._id,
      status: "submitted",
    });
    if (!proposal) return res.status(404).json({ message: "Editable proposal not found." });
    const incident = await LeakEvent.findOne({ _id: proposal.incidentId, status: "OPEN_FOR_PROPOSALS" }).lean();
    if (!incident) return res.status(409).json({ message: "The incident is no longer accepting proposals." });

    const fields = ["repairMethod", "labourCharges", "materialCharges", "visitCharges", "otherCharges",
      "estimatedDurationHours", "earliestAvailability", "warrantyDetails", "notes"];
    for (const key of fields) {
      if (req.body[key] !== undefined) proposal[key] = req.body[key];
    }
    proposal.totalEstimatedCharges = Math.round((
      Number(proposal.labourCharges) + Number(proposal.materialCharges) +
      Number(proposal.visitCharges || 0) + Number(proposal.otherCharges || 0)
    ) * 100) / 100;
    await proposal.save();
    await audit(req.user._id, "PROPOSAL_UPDATED", "RepairProposal", proposal._id, {}, req);
    res.json(proposal);
  } catch (err) {
    console.error("[PLUMBER] Proposal update failed:", err.message);
    res.status(400).json({ message: "Unable to update proposal." });
  }
}

export async function withdrawProposal(req, res) {
  try {
    const proposal = await RepairProposal.findOne({
      _id: req.params.id,
      plumberId: req.user._id,
      status: "submitted",
    });
    if (!proposal) return res.status(404).json({ message: "Withdrawable proposal not found." });
    const incident = await LeakEvent.findOne({ _id: proposal.incidentId, status: "OPEN_FOR_PROPOSALS" }).lean();
    if (!incident) return res.status(409).json({ message: "The incident is no longer accepting proposal changes." });
    proposal.status = "withdrawn";
    proposal.withdrawnAt = new Date();
    proposal.withdrawnReason = req.body.reason || "";
    await proposal.save();
    await audit(req.user._id, "PROPOSAL_WITHDRAWN", "RepairProposal", proposal._id, { reason: proposal.withdrawnReason }, req);
    res.json({ message: "Proposal withdrawn." });
  } catch (err) {
    console.error("[PLUMBER] Proposal withdrawal failed:", err.message);
    res.status(500).json({ message: "Unable to withdraw proposal." });
  }
}

export async function listAssignments(req, res) {
  try {
    const assignments = await RepairAssignment.find({ plumberId: req.user._id })
      .sort({ createdAt: -1 })
      .populate("incidentId")
      .populate("selectedProposalId")
      .lean();
    res.json(assignments);
  } catch (err) {
    console.error("[PLUMBER] Assignment list failed:", err.message);
    res.status(500).json({ message: "Unable to load assignments." });
  }
}

export async function getAssignment(req, res) {
  try {
    const assignment = await RepairAssignment.findOne({
      _id: req.params.id,
      plumberId: req.user._id,
    })
      .populate("incidentId")
      .populate("selectedProposalId")
      .lean();
    if (!assignment) return res.status(404).json({ message: "Assignment not found." });
    const completion = await RepairRecord.findOne({ assignmentId: assignment._id }).lean();
    res.json({ assignment, completion });
  } catch (err) {
    res.status(err instanceof mongoose.Error.CastError ? 400 : 500).json({
      message: err instanceof mongoose.Error.CastError ? "Invalid assignment ID." : "Unable to load assignment.",
    });
  }
}

const assignmentTransitions = {
  assigned: new Set(["accepted"]),
  accepted: new Set(["in_progress"]),
};

export async function updateAssignmentStatus(req, res) {
  const session = await mongoose.startSession();
  try {
    let assignment;
    await session.withTransaction(async () => {
      const fromStatus = req.body.status === "accepted" ? "assigned" : "accepted";
      assignment = await RepairAssignment.findOne({
        _id: req.params.id,
        plumberId: req.user._id,
        status: fromStatus,
      }).session(session);
      if (!assignment) {
        const exists = await RepairAssignment.exists({ _id: req.params.id, plumberId: req.user._id }).session(session);
        const error = new Error(exists ? "That assignment status transition is not allowed." : "Assignment not found.");
        error.status = exists ? 409 : 404;
        throw error;
      }
      if (!assignmentTransitions[assignment.status]?.has(req.body.status)) {
        const error = new Error("That assignment status transition is not allowed.");
        error.status = 409;
        throw error;
      }
      assignment.status = req.body.status;
      assignment.statusHistory.push({ status: req.body.status, changedBy: req.user._id });
      await assignment.save({ session });
      if (req.body.status === "in_progress") {
        const result = await LeakEvent.updateOne(
          { _id: assignment.incidentId, status: "ASSIGNED" },
          {
            $set: { status: "REPAIR_IN_PROGRESS" },
            $push: { statusHistory: { status: "REPAIR_IN_PROGRESS", changedBy: req.user._id } },
          },
          { session }
        );
        if (result.matchedCount !== 1) {
          const error = new Error("Incident is not eligible to start repair.");
          error.status = 409;
          throw error;
        }
      }
    });
    await audit(req.user._id, "ASSIGNMENT_STATUS_CHANGED", "RepairAssignment", assignment._id, { status: assignment.status }, req);
    res.json(assignment);
  } catch (err) {
    console.error("[PLUMBER] Assignment status update failed:", err.message);
    res.status(err.status || 500).json({ message: err.status ? err.message : "Unable to update assignment." });
  } finally {
    await session.endSession();
  }
}

export async function submitCompletionReport(req, res) {
  const session = await mongoose.startSession();
  try {
    let record;
    await session.withTransaction(async () => {
      const assignment = await RepairAssignment.findOne({
        _id: req.params.id,
        plumberId: req.user._id,
        status: "in_progress",
      }).session(session);
      if (!assignment) {
        const error = new Error("Active repair assignment not found.");
        error.status = 404;
        throw error;
      }

      const finalAmount = Math.round((
        Number(req.body.labourCharges) + Number(req.body.materialCharges)
      ) * 100) / 100;
      [record] = await RepairRecord.create([{
        assignmentId: assignment._id,
        incidentId: assignment.incidentId,
        plumberId: req.user._id,
        workDescription: req.body.workDescription.trim(),
        partsUsed: req.body.partsUsed?.trim() || "",
        labourCharges: Number(req.body.labourCharges),
        materialCharges: Number(req.body.materialCharges),
        finalAmount,
        completionNotes: req.body.completionNotes?.trim() || "",
        completionReportedAt: new Date(),
        furtherWorkRequired: Boolean(req.body.furtherWorkRequired),
      }], { session });
      assignment.status = "completed";
      assignment.statusHistory.push({ status: "completed", changedBy: req.user._id });
      await assignment.save({ session });
      const status = req.body.furtherWorkRequired ? "AWAITING_INSPECTION" : "VERIFYING_RECOVERY";
      const result = await LeakEvent.updateOne(
        { _id: assignment.incidentId, status: "REPAIR_IN_PROGRESS" },
        { $set: { status }, $push: { statusHistory: { status, changedBy: req.user._id } } },
        { session }
      );
      if (result.matchedCount !== 1) {
        const error = new Error("Incident is not in repair progress.");
        error.status = 409;
        throw error;
      }
    });
    await audit(req.user._id, "COMPLETION_REPORT_SUBMITTED", "RepairRecord", record._id, {}, req);

    // Notify all admins that repair is complete and awaiting verification
    try {
      const leakEvent = await LeakEvent.findById(record.incidentId).lean();
      const admins    = await User.find({ role: "admin", accountStatus: "active", emailVerified: true })
        .select("name email").lean();
      for (const admin of admins) {
        sendRepairComplete(admin.email, admin.name, leakEvent, record).catch(() => {});
      }
    } catch { /* non-critical — don't block the response */ }

    res.status(201).json({
      message: "Completion report submitted. Sensor-based recovery verification is still required.",
      record,
    });
  } catch (err) {
    console.error("[PLUMBER] Completion report failed:", err.message);
    res.status(err.status || 400).json({ message: err.status ? err.message : "Unable to submit completion report." });
  } finally {
    await session.endSession();
  }
}

export async function verifyRecovery(req, res) {
  try {
    const leak = await LeakEvent.findById(req.params.id);
    if (!leak) return res.status(404).json({ message: "Leak incident not found." });
    if (leak.status !== "VERIFYING_RECOVERY") {
      return res.status(409).json({ message: "Incident is not awaiting recovery verification." });
    }
    const record = await RepairRecord.findOne({ incidentId: leak._id });
    if (!record) return res.status(409).json({ message: "Completion report is missing." });

    const required = Math.max(1, Math.min(Number(process.env.RECOVERY_REQUIRED_READINGS) || 3, 20));
    const maxAgeMinutes = Math.max(1, Number(process.env.RECOVERY_MAX_AGE_MINUTES) || 5);
    const readings = await MlPrediction
      .find({ mlProcessedAt: { $gt: record.completionReportedAt.toISOString() } })
      .sort({ _id: -1 })
      .limit(required)
      .lean();
    const fresh = readings.length === required && readings.every((reading) => {
      const timestamp = new Date(reading.mlProcessedAt);
      return Number.isFinite(timestamp.getTime()) &&
        timestamp > record.completionReportedAt &&
        Date.now() - timestamp.getTime() <= maxAgeMinutes * 60 * 1000;
    });
    const readingsValid = readings.length === required && readings.every((reading) =>
      Number.isFinite(reading.flowSensorData) &&
      Number.isFinite(reading.pressureSensorData) &&
      Number.isFinite(reading.tankLevelSensorData) &&
      Number.isFinite(reading.turbiditySensorData) &&
      Number.isFinite(reading.mlProbability) &&
      !reading.mlError
    );
    const passed = fresh && readingsValid && readings.every((reading) =>
      reading.overallSystemStatus === "NORMAL" && reading.mlPredictionData === 0
    );

    record.verificationAttempts.push(...readings.map((reading) => ({
      attemptedAt: new Date(),
      flowSensorData: reading.flowSensorData,
      pressureSensorData: reading.pressureSensorData,
      tankLevelSensorData: reading.tankLevelSensorData,
      turbiditySensorData: reading.turbiditySensorData,
      mlProbability: reading.mlProbability,
      overallSystemStatus: reading.overallSystemStatus,
      passed: reading.overallSystemStatus === "NORMAL" && reading.mlPredictionData === 0 && !reading.mlError,
      reason: !fresh ? "Sensor prediction is stale or unavailable." :
        !readingsValid ? "Sensor readings are missing or invalid." :
          reading.overallSystemStatus === "NORMAL" && reading.mlPredictionData === 0
            ? "Existing ML status is normal." : "Existing ML status still indicates an issue.",
    })));

    if (passed) {
      record.recoveryVerificationStatus = "verified";
      record.verifiedAt = new Date();
      record.verifiedBy = req.user._id;
      leak.status = "RECOVERED";
      leak.activeKey = undefined;
      leak.statusHistory.push({ status: "RECOVERED", changedBy: req.user._id, reason: `${required} consecutive fresh normal predictions.` });
    } else if (!fresh || !readingsValid) {
      record.recoveryVerificationStatus = "inconclusive";
      record.verifiedBy = req.user._id;
    } else {
      record.recoveryVerificationStatus = "failed";
      record.verifiedBy = req.user._id;
      leak.status = "RECOVERY_FAILED";
      leak.statusHistory.push({ status: "RECOVERY_FAILED", changedBy: req.user._id, reason: "Post-repair predictions did not meet recovery criteria." });
    }
    await record.save();
    await leak.save();
    await audit(req.user._id, "RECOVERY_VERIFICATION_RUN", "LeakEvent", leak._id, { result: record.recoveryVerificationStatus }, req);
    res.json({
      status: record.recoveryVerificationStatus,
      incidentStatus: leak.status,
      requiredReadings: required,
      readingsChecked: readings.length,
      message: passed
        ? "Recovery verified from fresh normal predictions."
        : "Recovery has not been verified; additional readings or inspection are required.",
    });
  } catch (err) {
    console.error("[ADMIN] Recovery verification failed:", err.message);
    res.status(500).json({ message: "Unable to verify recovery." });
  }
}

// ---------------------------------------------------------------------------
// Aliases to match the names used in plumber.route.js
// ---------------------------------------------------------------------------
export const submitProposal    = createProposal;
export const listMyProposals   = listProposals;
export const listMyAssignments = listAssignments;
