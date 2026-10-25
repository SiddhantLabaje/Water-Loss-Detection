/**
 * notification.service.js
 * Centralised email notification service for the repair management platform.
 * All templates return plain-text bodies for reliability + deliverability.
 */
import nodemailer from "nodemailer";
import User from "../models/user.model.js";
import PlumberProfile from "../models/plumberProfile.model.js";
import Notification from "../models/notification.model.js";
import RepairAssignment from "../models/repairAssignment.model.js";
import RepairProposal from "../models/repairProposal.model.js";
import LeakEvent from "../models/leakEvent.model.js";

function createTransport() {
  const pass = (process.env.EMAIL_PASS || "").replace(/\s/g, "");
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user: process.env.EMAIL_USER, pass },
  });
}

async function send({ to, subject, text }) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    throw new Error("Email delivery is not configured.");
  }
  const t = createTransport();
  return t.sendMail({
    from: `"Smart Water Monitor" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    text,
  });
}

const configuredBaseUrl = process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || "http://localhost:5000";
const BASE_URL = `${/^https?:\/\//i.test(configuredBaseUrl) ? "" : "https://"}${configuredBaseUrl}`
  .replace(/\/+$/, "");

// ── Templates ──────────────────────────────────────────────────────────────

export async function sendEmailVerification(user, token) {
  const link = `${BASE_URL}/verify-email.html?token=${token}`;
  await send({
    to: user.email,
    subject: "Verify your Smart Water Monitor account",
    text: `Hello ${user.name},\n\nPlease verify your email address by visiting:\n${link}\n\nThis link expires in 24 hours.\n\nIf you did not create this account, ignore this email.\n\nSmart Water Monitor`,
  });
}

export async function sendPasswordReset(user, token) {
  const link = `${BASE_URL}/reset-password.html?token=${token}`;
  await send({
    to: user.email,
    subject: "Reset your Smart Water Monitor password",
    text: `Hello ${user.name},\n\nA password reset was requested for this account.\n\nReset your password here:\n${link}\n\nThis link expires in 1 hour. If you did not request this, ignore this email.\n\nSmart Water Monitor`,
  });
}

export async function sendPlumberInvite(plumberEmail, plumberName, token) {
  const link = `${BASE_URL}/accept-invite.html?token=${token}`;
  await send({
    to: plumberEmail,
    subject: "You have been registered as a plumber on Smart Water Monitor",
    text: `Hello ${plumberName},\n\nYou have been added as a trusted plumber on the Smart Water Monitor platform.\n\nPlease set your password and activate your account:\n${link}\n\nThis invitation expires in 7 days.\n\nSmart Water Monitor`,
  });
}

export async function sendPlumberApproved(user) {
  await send({
    to: user.email,
    subject: "Your plumber account has been approved",
    text: `Hello ${user.name},\n\nYour plumber registration has been approved. You can now log in to view and submit proposals for repair requests.\n\n${BASE_URL}/login.html\n\nSmart Water Monitor`,
  });
}

export async function sendPlumberRejected(user, reason) {
  await send({
    to: user.email,
    subject: "Your plumber registration was not approved",
    text: `Hello ${user.name},\n\nUnfortunately your plumber registration was not approved at this time.\n\nReason: ${reason || "No reason provided."}\n\nIf you believe this is an error, please contact support.\n\nSmart Water Monitor`,
  });
}

export async function sendLeakAlertToPlumber(user, leakEvent) {
  await send({
    to: user.email,
    subject: `[NEW LEAK REQUEST] Incident ${leakEvent.incidentId} — ${leakEvent.severity} severity`,
    text: `Hello ${user.name},\n\nA new water leak repair request is available for your review.\n\nIncident ID: ${leakEvent.incidentId}\nSeverity: ${leakEvent.severity}\nDetected: ${leakEvent.sensorSnapshot?.detectedAt?.toISOString() || "Unknown"}\nFlow Rate: ${leakEvent.sensorSnapshot?.flowSensorData ?? "—"} L/min\nPressure: ${leakEvent.sensorSnapshot?.pressureSensorData ?? "—"} PSI\nWater Loss: ${leakEvent.sensorSnapshot?.waterLossRate ?? "—"} L/hr\n\nLog in to review the request and submit a proposal:\n${BASE_URL}/plumber.html\n\nSmart Water Monitor`,
  });
}

export async function sendLeakAlertToAdmin(adminEmail, adminName, leakEvent) {
  await send({
    to: adminEmail,
    subject: `[LEAK DETECTED] Incident ${leakEvent.incidentId} — ${leakEvent.severity}`,
    text: `Hello ${adminName},\n\nA new water leak has been detected and an incident created.\n\nIncident ID: ${leakEvent.incidentId}\nSeverity: ${leakEvent.severity}\nDetected: ${leakEvent.sensorSnapshot?.detectedAt?.toISOString() || "Unknown"}\nML Probability: ${leakEvent.sensorSnapshot?.mlProbability ?? "—"}%\nFlow: ${leakEvent.sensorSnapshot?.flowSensorData ?? "—"} L/min  Pressure: ${leakEvent.sensorSnapshot?.pressureSensorData ?? "—"} PSI\nWater Loss: ${leakEvent.sensorSnapshot?.waterLossRate ?? "—"} L/hr\n\nReview the incident:\n${BASE_URL}/admin.html\n\nSmart Water Monitor`,
  });
}

export async function sendProposalSelected(plumberUser, leakEvent, proposal) {
  await send({
    to: plumberUser.email,
    subject: `[ASSIGNED] Your proposal for incident ${leakEvent.incidentId} was selected`,
    text: `Hello ${plumberUser.name},\n\nCongratulations! Your repair proposal for incident ${leakEvent.incidentId} has been selected.\n\nEstimated total: ${proposal.totalEstimatedCharges}\nPlease log in to accept the assignment and begin the repair:\n${BASE_URL}/plumber.html\n\nSmart Water Monitor`,
  });
}

export async function sendProposalNotSelected(plumberUser, leakEvent) {
  await send({
    to: plumberUser.email,
    subject: `[UPDATE] Incident ${leakEvent.incidentId} has been assigned`,
    text: `Hello ${plumberUser.name},\n\nThank you for your proposal for incident ${leakEvent.incidentId}. The admin has selected another plumber for this repair.\n\nPlease check the portal for new available requests:\n${BASE_URL}/plumber.html\n\nSmart Water Monitor`,
  });
}

export async function sendRepairComplete(adminEmail, adminName, leakEvent, record) {
  await send({
    to: adminEmail,
    subject: `[REPAIR COMPLETE] Incident ${leakEvent.incidentId} — pending verification`,
    text: `Hello ${adminName},\n\nThe plumber has submitted a completion report for incident ${leakEvent.incidentId}.\n\nFinal amount: ${record.finalAmount}\nWork: ${record.workDescription}\nNotes: ${record.completionNotes || "None"}\n\nRecovery verification must be run by an administrator. Check the admin portal for results:\n${BASE_URL}/admin.html\n\nSmart Water Monitor`,
  });
}

export async function sendRecoveryResult(adminEmail, adminName, leakEvent, status) {
  const statusLabel = status === "verified" ? "RECOVERED" : "FAILED / INCONCLUSIVE";
  await send({
    to: adminEmail,
    subject: `[RECOVERY ${statusLabel}] Incident ${leakEvent.incidentId}`,
    text: `Hello ${adminName},\n\nRecovery verification for incident ${leakEvent.incidentId} completed with status: ${statusLabel}.\n\nReview details:\n${BASE_URL}/admin.html\n\nSmart Water Monitor`,
  });
}

export async function notifyLeakEvent(leakEvent) {
  const [admins, plumberProfiles] = await Promise.all([
    User.find({ role: "admin", accountStatus: "active", emailVerified: true }).select("_id name email").lean(),
    PlumberProfile.find({ approvalStatus: "approved", availability: "available" })
      .populate({ path: "userId", match: { role: "plumber", accountStatus: "active", emailVerified: true }, select: "_id name email" })
      .lean(),
  ]);
  const recipients = [
    ...admins.map((user) => ({ user, type: "LEAK_DETECTED" })),
    ...plumberProfiles.filter((profile) => profile.userId).map((profile) => ({ user: profile.userId, type: "LEAK_DETECTED" })),
  ];

  for (const { user, type } of recipients) {
    const dedupeKey = `${leakEvent._id}:${user._id}:${type}:${leakEvent.severity}`;
    let notification;
    try {
      [notification] = await Notification.create([{
        recipientUserId: user._id,
        incidentId: leakEvent._id,
        type,
        dedupeKey,
      }]);
    } catch (err) {
      if (err.code === 11000) continue;
      throw err;
    }
    await deliverLeakNotification(notification, user, leakEvent);
  }
}

async function deliverLeakNotification(notification, user, leakEvent) {
  notification.status = "pending";
  notification.attemptedAt = new Date();
  notification.retryCount += 1;
  notification.errorCode = "";
  await notification.save();
  try {
    if (user.role === "admin") {
      await sendLeakAlertToAdmin(user.email, user.name, leakEvent);
    } else {
      await sendLeakAlertToPlumber(user, leakEvent);
    }
    notification.status = "sent";
    notification.sentAt = new Date();
    await notification.save();
  } catch (err) {
    notification.status = "failed";
    notification.errorCode = err.code || "DELIVERY_FAILED";
    await notification.save();
    console.error(`[EMAIL] Leak notification ${notification._id} failed: ${err.message}`);
  }
}

export async function notifyAssignment(assignment) {
  const proposals = await RepairProposal.find({
    incidentId: assignment.incidentId,
    status: { $in: ["selected", "not_selected"] },
  }).populate("plumberId", "name email role accountStatus emailVerified").lean();
  const leakEvent = await LeakEvent.findById(assignment.incidentId);
  if (!leakEvent) throw new Error("Assignment incident is unavailable for notification.");
  const recipients = new Map(
    proposals.filter((proposal) => proposal.plumberId).map(({ plumberId }) => [String(plumberId._id), plumberId])
  );
  for (const [userId, user] of recipients) {
    const dedupeKey = `${assignment._id}:${userId}:LEAK_ASSIGNED`;
    try {
      const notification = await Notification.create({
        recipientUserId: userId,
        incidentId: assignment.incidentId,
        relatedEntityId: assignment._id,
        type: "LEAK_ASSIGNED",
        dedupeKey,
      });
      await deliverAssignmentNotification(notification, user, leakEvent);
    } catch (err) {
      if (err.code === 11000) continue;
      throw err;
    }
  }
}

export async function retryFailedNotifications() {
  const failed = await Notification.find({ status: "failed", retryCount: { $lt: 5 } })
    .sort({ updatedAt: 1 })
    .limit(25)
    .populate("recipientUserId", "name email role accountStatus emailVerified")
    .populate("incidentId")
    .populate("relatedEntityId");
  for (const item of failed) {
    if (!item.recipientUserId || !item.incidentId ||
        item.recipientUserId.accountStatus !== "active" ||
        !item.recipientUserId.emailVerified) continue;
    if (item.type === "LEAK_DETECTED") {
      await deliverLeakNotification(item, item.recipientUserId, item.incidentId);
    } else if (item.type === "LEAK_ASSIGNED") {
      await deliverAssignmentNotification(item, item.recipientUserId, item.incidentId);
    }
  }
}

async function deliverAssignmentNotification(notification, user, leakEvent) {
  notification.status = "pending";
  notification.attemptedAt = new Date();
  notification.retryCount += 1;
  notification.errorCode = "";
  await notification.save();
  try {
    const assignment = await RepairAssignment.findById(notification.relatedEntityId)
      .populate("selectedProposalId");
    if (!assignment) throw new Error("Assignment notification target is unavailable.");
    if (String(assignment.plumberId) === String(user._id)) {
      await sendProposalSelected(user, leakEvent, assignment.selectedProposalId);
    } else {
      await sendProposalNotSelected(user, leakEvent);
    }
    notification.status = "sent";
    notification.sentAt = new Date();
    await notification.save();
  } catch (err) {
    notification.status = "failed";
    notification.errorCode = err.code || "DELIVERY_FAILED";
    await notification.save();
    console.error(`[EMAIL] Assignment notification ${notification._id} failed: ${err.message}`);
  }
}
