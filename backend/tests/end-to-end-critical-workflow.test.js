/**
 * End-to-End Critical Alert Workflow Test
 *
 * Simulates the complete workflow:
 * 1. Critical alert detected (mlPredictionData === 1 + overallSystemStatus === 'CRITICAL')
 * 2. LeakEvent created with status "OPEN_FOR_PROPOSALS"
 * 3. Emails sent to owner and all approved plumbers
 * 4. Plumber receives leak notification in dashboard
 * 5. Plumber submits cost estimate/proposal
 * 6. Admin reviews proposals and assigns best plumber
 * 7. Selected plumber receives assignment notification email
 * 8. Plumber accepts and completes repair
 */

import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

// Models
import MlPrediction from "../models/mlPrediction.model.js";
import LeakEvent from "../models/leakEvent.model.js";
import User from "../models/user.model.js";
import PlumberProfile from "../models/plumberProfile.model.js";
import RepairProposal from "../models/repairProposal.model.js";
import RepairAssignment from "../models/repairAssignment.model.js";
import Notification from "../models/notification.model.js";

// Services
import {
  isCriticalLeakAlert,
  createCriticalLeakEvent,
  isCriticalLeakPrediction,
} from "../services/criticalLeak.service.js";
import { notifyLeakEvent, notifyAssignment } from "../services/notification.service.js";

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/water_loss_detection_test";

// Setup database connection
async function setupDb() {
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
  }
}

// Cleanup after each test
async function cleanupDb() {
  if (mongoose.connection.readyState === 1) {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
      await collections[key].deleteMany({});
    }
  }
}

test("Complete Critical Alert Workflow", async (t) => {
  await setupDb();

  // ────────────────────────────────────────────────────────────────────────
  // Step 1: Create admin and plumber users
  // ────────────────────────────────────────────────────────────────────────
  await t.test("1. Setup: Create admin user for notifications", async () => {
    const admin = await User.create({
      name: "Admin User",
      email: "admin@test.com",
      password: "hashed",
      role: "admin",
      accountStatus: "active",
      emailVerified: true,
    });
    assert.ok(admin._id);
    assert.equal(admin.role, "admin");
  });

  // ────────────────────────────────────────────────────────────────────────
  // Step 2: Create approved plumbers
  // ────────────────────────────────────────────────────────────────────────
  let plumber1, plumber2;
  await t.test("2. Setup: Create approved plumbers", async () => {
    const p1 = await User.create({
      name: "Plumber One",
      email: "plumber1@test.com",
      password: "hashed",
      role: "plumber",
      accountStatus: "active",
      emailVerified: true,
    });
    plumber1 = p1;

    const p2 = await User.create({
      name: "Plumber Two",
      email: "plumber2@test.com",
      password: "hashed",
      role: "plumber",
      accountStatus: "active",
      emailVerified: true,
    });
    plumber2 = p2;

    // Create plumber profiles with approval
    await PlumberProfile.create({
      userId: p1._id,
      approvalStatus: "approved",
      availability: "available",
      specialty: ["Leak detection", "Pipe replacement"],
    });

    await PlumberProfile.create({
      userId: p2._id,
      approvalStatus: "approved",
      availability: "available",
      specialty: ["Leak detection", "Pipe repair"],
    });

    assert.ok(plumber1._id);
    assert.ok(plumber2._id);
  });

  // ────────────────────────────────────────────────────────────────────────
  // Step 3: Detect critical leak prediction
  // ────────────────────────────────────────────────────────────────────────
  let prediction;
  await t.test("3. Critical Alert Detected: Create ML prediction with critical leak", async () => {
    prediction = await MlPrediction.create({
      flowSensorData: 85.5,
      pressureSensorData: 45,
      tankLevelSensorData: 35,
      turbidityData: 25,
      waterLossRate: 15.2,
      mlPredictionData: 1, // LEAK DETECTED
      mlProbability: 92.5,
      mlSeverity: "HIGH",
      overallSystemStatus: "CRITICAL", // CRITICAL STATUS
      createdAt: new Date(),
    });

    assert.equal(prediction.mlPredictionData, 1, "ML prediction should detect leak");
    assert.equal(
      prediction.overallSystemStatus,
      "CRITICAL",
      "System status should be CRITICAL"
    );
    assert.ok(isCriticalLeakPrediction(prediction), "Should be identified as critical leak");
  });

  // ────────────────────────────────────────────────────────────────────────
  // Step 4: Create LeakEvent (should auto-trigger from broadcaster)
  // ────────────────────────────────────────────────────────────────────────
  let leakEvent;
  await t.test("4. Leak Event Created: Generate repair incident from critical alert", async () => {
    // Check if alert is new (not duplicate)
    const isAlert = isCriticalLeakAlert(prediction, false); // No previous critical leak
    assert.ok(isAlert, "Should be identified as new critical alert");

    // Create the leak event
    leakEvent = await createCriticalLeakEvent(prediction);

    assert.ok(leakEvent._id);
    assert.equal(leakEvent.status, "OPEN_FOR_PROPOSALS", "Leak should be open for proposals");
    assert.ok(leakEvent.incidentId);
    assert.ok(
      leakEvent.incidentId.startsWith("WLD-"),
      "Incident ID should have WLD- prefix"
    );
  });

  // ────────────────────────────────────────────────────────────────────────
  // Step 5: Notify Admin and Plumbers
  // ────────────────────────────────────────────────────────────────────────
  await t.test("5. Notifications Created: Admin and plumbers notified of leak", async () => {
    await notifyLeakEvent(leakEvent);

    // Verify notifications were created for admin and both plumbers
    const notifications = await Notification.find({
      incidentId: leakEvent._id,
      type: "LEAK_DETECTED",
    });

    assert.ok(notifications.length >= 2, "Should have at least 2 notifications (admin + 1+ plumbers)");

    // Verify at least one is for plumber
    const plumberNotifications = notifications.filter((n) =>
      [plumber1._id, plumber2._id].includes(n.recipientUserId)
    );
    assert.ok(plumberNotifications.length >= 1, "Should have plumber notifications");

    console.log(`✓ Created ${notifications.length} notifications`);
  });

  // ────────────────────────────────────────────────────────────────────────
  // Step 6: Plumber receives alert in dashboard
  // ────────────────────────────────────────────────────────────────────────
  await t.test(
    "6. Plumber Dashboard Updated: Critical leak visible in repair requests",
    async () => {
      // Plumber should see the leak event as an available repair request
      const availableLeaks = await LeakEvent.find({
        status: "OPEN_FOR_PROPOSALS",
        severity: { $in: ["MEDIUM", "HIGH"] }, // Only show substantial incidents
      });

      assert.ok(availableLeaks.length > 0, "Plumber should see available repair requests");
      assert.ok(
        availableLeaks.some((l) => l._id.equals(leakEvent._id)),
        "Should see the critical leak in dashboard"
      );
    }
  );

  // ────────────────────────────────────────────────────────────────────────
  // Step 7: Plumber 1 submits proposal
  // ────────────────────────────────────────────────────────────────────────
  let proposal1;
  await t.test("7. Plumber Proposes: Submit cost estimate for repair", async () => {
    proposal1 = await RepairProposal.create({
      incidentId: leakEvent._id,
      plumberId: plumber1._id,
      repairMethod: "Excavate and replace 3m of burst copper pipe. Apply epoxy sealing.",
      labourCharges: 2500,
      materialCharges: 3000,
      visitCharges: 500,
      otherCharges: 0,
      totalEstimatedCharges: 6000,
      estimatedDurationHours: 4,
      earliestAvailability: new Date(Date.now() + 2 * 60 * 60 * 1000),
      warrantyDetails: "6-month warranty on all replaced parts",
      notes: "Can start immediately if approved",
      status: "submitted",
    });

    assert.ok(proposal1._id);
    assert.equal(proposal1.status, "submitted");
    assert.equal(proposal1.totalEstimatedCharges, 6000);
  });

  // ────────────────────────────────────────────────────────────────────────
  // Step 8: Plumber 2 submits proposal (higher cost)
  // ────────────────────────────────────────────────────────────────────────
  let proposal2;
  await t.test("8. Plumber Proposes: Second plumber submits alternative estimate", async () => {
    proposal2 = await RepairProposal.create({
      incidentId: leakEvent._id,
      plumberId: plumber2._id,
      repairMethod: "Use advanced PEX piping with no-dig trenchless method.",
      labourCharges: 3500,
      materialCharges: 4500,
      visitCharges: 500,
      otherCharges: 500,
      totalEstimatedCharges: 9000,
      estimatedDurationHours: 3,
      earliestAvailability: new Date(Date.now() + 3 * 60 * 60 * 1000),
      warrantyDetails: "12-month warranty, includes insurance",
      notes: "Premium trenchless method, minimal disruption",
      status: "submitted",
    });

    assert.ok(proposal2._id);
    assert.equal(proposal2.totalEstimatedCharges, 9000);

    // Verify both proposals exist
    const proposals = await RepairProposal.find({ incidentId: leakEvent._id });
    assert.equal(proposals.length, 2, "Should have 2 proposals");
  });

  // ────────────────────────────────────────────────────────────────────────
  // Step 9: Admin reviews and assigns best plumber
  // ────────────────────────────────────────────────────────────────────────
  let assignment;
  await t.test("9. Admin Decision: Assign best (cheapest) plumber proposal", async () => {
    // Admin selects the cheaper proposal (plumber1)
    const selectedProposal = await RepairProposal.findByIdAndUpdate(
      proposal1._id,
      { status: "selected" },
      { new: true }
    );

    // Mark other proposal as not selected
    await RepairProposal.findByIdAndUpdate(proposal2._id, {
      status: "not_selected",
      rejectionReason: "Alternative proposal selected for lower cost",
    });

    // Create assignment
    assignment = await RepairAssignment.create({
      incidentId: leakEvent._id,
      selectedProposalId: selectedProposal._id,
      plumberId: plumber1._id,
      assignedAt: new Date(),
      status: "assigned",
    });

    assert.ok(assignment._id);
    assert.equal(assignment.status, "assigned");
    assert.equal(
      assignment.plumberId.toString(),
      plumber1._id.toString(),
      "Should assign to plumber1"
    );

    // Update leak event status
    await LeakEvent.findByIdAndUpdate(leakEvent._id, {
      status: "ASSIGNED",
      selectedProposalId: selectedProposal._id,
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Step 10: Send assignment notification to selected plumber
  // ────────────────────────────────────────────────────────────────────────
  await t.test("10. Assignment Notification: Plumber notified of selection", async () => {
    await notifyAssignment(assignment);

    // Verify assignment notification was created
    const assignmentNotifications = await Notification.find({
      incidentId: leakEvent._id,
      relatedEntityId: assignment._id,
      type: "LEAK_ASSIGNED",
    });

    assert.ok(
      assignmentNotifications.length > 0,
      "Should have assignment notification for selected plumber"
    );
  });

  // ────────────────────────────────────────────────────────────────────────
  // Step 11: Plumber accepts assignment
  // ────────────────────────────────────────────────────────────────────────
  await t.test("11. Plumber Accepts: Repair assignment accepted", async () => {
    const updatedAssignment = await RepairAssignment.findByIdAndUpdate(
      assignment._id,
      { status: "accepted", acceptedAt: new Date() },
      { new: true }
    );

    assert.equal(updatedAssignment.status, "accepted");
    assert.ok(updatedAssignment.acceptedAt);
  });

  // ────────────────────────────────────────────────────────────────────────
  // Step 12: Plumber marks repair as in progress
  // ────────────────────────────────────────────────────────────────────────
  await t.test("12. Plumber Working: Repair marked as in progress", async () => {
    const updatedAssignment = await RepairAssignment.findByIdAndUpdate(
      assignment._id,
      { status: "in_progress", startedAt: new Date() },
      { new: true }
    );

    assert.equal(updatedAssignment.status, "in_progress");
    assert.ok(updatedAssignment.startedAt);
  });

  // ────────────────────────────────────────────────────────────────────────
  // Step 13: Plumber submits completion report
  // ────────────────────────────────────────────────────────────────────────
  await t.test("13. Plumber Completes: Submit completion report", async () => {
    const completionReport = {
      workDescription:
        "Successfully excavated 3m of burst copper pipe. Applied epoxy sealing on all joints. Pressure tested at 60 PSI.",
      partsUsed: "3m Copper pipe (15mm), 4x Compression fittings, Epoxy sealant",
      labourCharges: 2500,
      materialCharges: 3000,
      completionNotes: "Work completed on schedule. System pressure nominal.",
      furtherWorkRequired: false,
      completedAt: new Date(),
    };

    const updatedAssignment = await RepairAssignment.findByIdAndUpdate(
      assignment._id,
      {
        status: "completed",
        completionReport,
        ...completionReport,
      },
      { new: true }
    );

    assert.equal(updatedAssignment.status, "completed");
    assert.ok(updatedAssignment.completionNotes);
  });

  // ────────────────────────────────────────────────────────────────────────
  // Step 14: Verify complete workflow
  // ────────────────────────────────────────────────────────────────────────
  await t.test("14. Workflow Complete: Verify all states", async () => {
    // Get final states
    const finalLeakEvent = await LeakEvent.findById(leakEvent._id);
    const finalAssignment = await RepairAssignment.findById(assignment._id);
    const finalProposal = await RepairProposal.findById(proposal1._id);

    // Verify progression
    assert.equal(
      finalLeakEvent.status,
      "ASSIGNED",
      "Leak should be assigned"
    );
    assert.equal(
      finalAssignment.status,
      "completed",
      "Assignment should be completed"
    );
    assert.equal(
      finalProposal.status,
      "selected",
      "Proposal should be selected"
    );

    // Verify notification record
    const allNotifications = await Notification.find({
      incidentId: leakEvent._id,
    });
    console.log(`\n✓ Complete workflow verified with ${allNotifications.length} notifications`);
  });

  await cleanupDb();
});

// ──────────────────────────────────────────────────────────────────────────
// Test: Duplicate critical alerts should not create duplicate incidents
// ──────────────────────────────────────────────────────────────────────────
test("Duplicate Critical Alert Prevention", async (t) => {
  await setupDb();

  await t.test("Should not create duplicate incidents for sustained critical alerts", async () => {
    // Create first prediction
    const pred1 = await MlPrediction.create({
      flowSensorData: 85.5,
      pressureSensorData: 45,
      tankLevelSensorData: 35,
      turbidityData: 25,
      waterLossRate: 15.2,
      mlPredictionData: 1,
      mlProbability: 92.5,
      mlSeverity: "HIGH",
      overallSystemStatus: "CRITICAL",
      createdAt: new Date(),
    });

    // First alert should trigger incident
    const isFirstAlert = isCriticalLeakAlert(pred1, false);
    assert.ok(isFirstAlert, "First critical alert should be detected");

    // Create incident
    const leak1 = await createCriticalLeakEvent(pred1);
    assert.ok(leak1._id);

    // Create second prediction (sustained critical)
    const pred2 = await MlPrediction.create({
      flowSensorData: 85.2,
      pressureSensorData: 44.8,
      tankLevelSensorData: 34.5,
      turbidityData: 25.1,
      waterLossRate: 15.5,
      mlPredictionData: 1,
      mlProbability: 91.8,
      mlSeverity: "HIGH",
      overallSystemStatus: "CRITICAL",
      createdAt: new Date(),
    });

    // Second alert should NOT trigger duplicate (previousCriticalLeak = true)
    const isSecondAlert = isCriticalLeakAlert(pred2, true); // true = previously in critical state
    assert.ok(!isSecondAlert, "Sustained critical alert should not create duplicate");

    const leakCount = await LeakEvent.countDocuments();
    assert.equal(leakCount, 1, "Should only have 1 incident for sustained alert");
  });

  await cleanupDb();
});

// ──────────────────────────────────────────────────────────────────────────
// Test: Non-leak critical alerts should not create repair incidents
// ──────────────────────────────────────────────────────────────────────────
test("Non-Leak Critical Alerts", async (t) => {
  await setupDb();

  await t.test("Should not create repair incident for critical alert without leak", async () => {
    // Create critical alert WITHOUT leak detected
    const pred = await MlPrediction.create({
      flowSensorData: 45.5,
      pressureSensorData: 65,
      tankLevelSensorData: 95,
      turbidityData: 75,
      waterLossRate: 0.5,
      mlPredictionData: 0, // NO LEAK
      mlProbability: 5.2,
      mlSeverity: "LOW",
      overallSystemStatus: "CRITICAL", // But still CRITICAL
      createdAt: new Date(),
    });

    const isCritical = isCriticalLeakPrediction(pred);
    assert.ok(!isCritical, "Critical status without leak should not be treated as critical leak");

    // Should not create leak event
    const leakCount = await LeakEvent.countDocuments();
    assert.equal(leakCount, 0, "Should not create leak event without leak detection");
  });

  await cleanupDb();
});
