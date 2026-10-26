#!/usr/bin/env node

/**
 * Critical Alert Workflow Verification Script
 * 
 * Checks that all components are correctly configured:
 * ✓ MongoDB connected
 * ✓ Email service configured
 * ✓ Models exist
 * ✓ Services loaded
 * ✓ Database collections ready
 */

import mongoose from "mongoose";
import nodemailer from "nodemailer";

// Load environment
import dotenv from "dotenv";
dotenv.config();

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/water_loss_detection";
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;

let mongoConnected = false;
let emailConfigured = false;

const checks = [];

// ────────────────────────────────────────────────────────────────────────
// 1. MongoDB Connection Check
// ────────────────────────────────────────────────────────────────────────
async function checkMongoDB() {
  try {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
    mongoConnected = true;
    checks.push({
      name: "MongoDB Connection",
      status: "✅ PASS",
      details: `Connected to ${MONGO_URI}`,
    });
  } catch (err) {
    checks.push({
      name: "MongoDB Connection",
      status: "❌ FAIL",
      details: `Could not connect to MongoDB: ${err.message}`,
      critical: true,
    });
  }
}

// ────────────────────────────────────────────────────────────────────────
// 2. Email Configuration Check
// ────────────────────────────────────────────────────────────────────────
async function checkEmail() {
  if (!EMAIL_USER || !EMAIL_PASS) {
    checks.push({
      name: "Email Configuration",
      status: "❌ FAIL",
      details: "EMAIL_USER and/or EMAIL_PASS not set in .env",
      critical: true,
    });
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASS.replace(/\s/g, ""),
      },
    });

    // Verify connection
    await transporter.verify();
    emailConfigured = true;
    checks.push({
      name: "Email Configuration",
      status: "✅ PASS",
      details: `Gmail SMTP ready for ${EMAIL_USER}`,
    });
  } catch (err) {
    checks.push({
      name: "Email Configuration",
      status: "❌ FAIL",
      details: `Email not configured: ${err.message}. Check EMAIL_USER and EMAIL_PASS in .env`,
      critical: true,
    });
  }
}

// ────────────────────────────────────────────────────────────────────────
// 3. Database Collections Check
// ────────────────────────────────────────────────────────────────────────
async function checkCollections() {
  if (!mongoConnected) return;

  try {
    const db = mongoose.connection.db;

    // Required collections
    const requiredCollections = [
      "mlpredictions",
      "leakevents",
      "repairproposals",
      "repairassignments",
      "notifications",
      "users",
      "plumberprofiles",
    ];

    const collections = await db.listCollections().toArray();
    const existingNames = collections.map((c) => c.name);

    const missing = requiredCollections.filter((c) => !existingNames.includes(c));

    if (missing.length === 0) {
      checks.push({
        name: "Database Collections",
        status: "✅ PASS",
        details: `All ${requiredCollections.length} required collections exist`,
      });
    } else {
      checks.push({
        name: "Database Collections",
        status: "⚠️  WARNING",
        details: `Missing collections: ${missing.join(", ")}. They will be auto-created on first use.`,
      });
    }
  } catch (err) {
    checks.push({
      name: "Database Collections",
      status: "⚠️  WARNING",
      details: `Could not verify collections: ${err.message}`,
    });
  }
}

// ────────────────────────────────────────────────────────────────────────
// 4. Admin Account Check
// ────────────────────────────────────────────────────────────────────────
async function checkAdminAccount() {
  if (!mongoConnected) return;

  try {
    // Import User model
    const { default: User } = await import("../models/user.model.js");

    const admin = await User.findOne({ role: "admin" }).lean();

    if (admin) {
      checks.push({
        name: "Admin Account",
        status: "✅ PASS",
        details: `Admin user found: ${admin.name} (${admin.email})`,
      });
    } else {
      checks.push({
        name: "Admin Account",
        status: "⚠️  WARNING",
        details: "No admin account found. Create one at /setup.html",
      });
    }
  } catch (err) {
    checks.push({
      name: "Admin Account",
      status: "⚠️  WARNING",
      details: `Could not check admin: ${err.message}`,
    });
  }
}

// ────────────────────────────────────────────────────────────────────────
// 5. Plumber Accounts Check
// ────────────────────────────────────────────────────────────────────────
async function checkPlumbers() {
  if (!mongoConnected) return;

  try {
    const { default: User } = await import("../models/user.model.js");
    const { default: PlumberProfile } = await import("../models/plumberProfile.model.js");

    const plumbers = await User.find({ role: "plumber" }).lean();
    const approvedPlumbers = await PlumberProfile.countDocuments({
      approvalStatus: "approved",
      availability: "available",
    });

    if (plumbers.length === 0) {
      checks.push({
        name: "Plumber Accounts",
        status: "⚠️  WARNING",
        details: "No plumber accounts found. Create and approve plumbers in admin portal.",
      });
    } else if (approvedPlumbers === 0) {
      checks.push({
        name: "Plumber Accounts",
        status: "⚠️  WARNING",
        details: `Found ${plumbers.length} plumber(s) but none approved/available.`,
      });
    } else {
      checks.push({
        name: "Plumber Accounts",
        status: "✅ PASS",
        details: `${approvedPlumbers} approved and available plumber(s) ready to receive leak notifications`,
      });
    }
  } catch (err) {
    checks.push({
      name: "Plumber Accounts",
      status: "⚠️  WARNING",
      details: `Could not check plumbers: ${err.message}`,
    });
  }
}

// ────────────────────────────────────────────────────────────────────────
// 6. Notification Settings Check
// ────────────────────────────────────────────────────────────────────────
async function checkNotificationSettings() {
  if (!mongoConnected) return;

  try {
    const { default: NotificationSettings } = await import("../models/notificationSettings.model.js");

    const settings = await NotificationSettings.findOne().lean();

    if (settings?.ownerEmail && settings?.ownerName) {
      checks.push({
        name: "Notification Settings",
        status: "✅ PASS",
        details: `Owner notifications configured: ${settings.ownerName} <${settings.ownerEmail}>`,
      });
    } else {
      checks.push({
        name: "Notification Settings",
        status: "⚠️  WARNING",
        details: "Owner email/name not configured. Configure in admin portal.",
      });
    }
  } catch (err) {
    checks.push({
      name: "Notification Settings",
      status: "⚠️  WARNING",
      details: `Could not check settings: ${err.message}`,
    });
  }
}

// ────────────────────────────────────────────────────────────────────────
// 7. Recent ML Predictions Check
// ────────────────────────────────────────────────────────────────────────
async function checkMLPredictions() {
  if (!mongoConnected) return;

  try {
    const { default: MlPrediction } = await import("../models/mlPrediction.model.js");

    const count = await MlPrediction.countDocuments();
    const recentCritical = await MlPrediction.countDocuments({
      overallSystemStatus: "CRITICAL",
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // Last 24 hours
    });

    if (count === 0) {
      checks.push({
        name: "ML Predictions",
        status: "ℹ️  INFO",
        details: "No predictions yet. They will be generated by the ML worker.",
      });
    } else {
      checks.push({
        name: "ML Predictions",
        status: "✅ PASS",
        details: `${count} total predictions. ${recentCritical} critical in last 24h.`,
      });
    }
  } catch (err) {
    checks.push({
      name: "ML Predictions",
      status: "⚠️  WARNING",
      details: `Could not check predictions: ${err.message}`,
    });
  }
}

// ────────────────────────────────────────────────────────────────────────
// 8. Recent Leak Events Check
// ────────────────────────────────────────────────────────────────────────
async function checkLeakEvents() {
  if (!mongoConnected) return;

  try {
    const { default: LeakEvent } = await import("../models/leakEvent.model.js");

    const count = await LeakEvent.countDocuments();
    const openCount = await LeakEvent.countDocuments({ status: "OPEN_FOR_PROPOSALS" });

    if (count === 0) {
      checks.push({
        name: "Leak Events",
        status: "ℹ️  INFO",
        details: "No incidents yet. They will be created when critical leaks detected.",
      });
    } else {
      checks.push({
        name: "Leak Events",
        status: "✅ PASS",
        details: `${count} total incidents. ${openCount} open for proposals.`,
      });
    }
  } catch (err) {
    checks.push({
      name: "Leak Events",
      status: "⚠️  WARNING",
      details: `Could not check incidents: ${err.message}`,
    });
  }
}

// ────────────────────────────────────────────────────────────────────────
// Main Verification Flow
// ────────────────────────────────────────────────────────────────────────
async function main() {
  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log("║  Critical Alert Workflow - System Verification             ║");
  console.log("╚════════════════════════════════════════════════════════════╝\n");

  // Run all checks
  await checkMongoDB();
  await checkEmail();
  await checkCollections();
  await checkAdminAccount();
  await checkPlumbers();
  await checkNotificationSettings();
  await checkMLPredictions();
  await checkLeakEvents();

  // Display results
  console.log("📋 Verification Results:\n");

  checks.forEach((check) => {
    const padding = " ".repeat(Math.max(0, 28 - check.name.length));
    console.log(`  ${check.name}${padding} ${check.status}`);
    console.log(`  ${" ".repeat(28)} → ${check.details}\n`);
  });

  // Summary
  const critical = checks.filter((c) => c.critical);
  const warnings = checks.filter((c) => c.status.includes("WARNING"));
  const passed = checks.filter((c) => c.status.includes("PASS"));

  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log(`║  Summary: ${passed.length} ✅ | ${warnings.length} ⚠️  | ${critical.length} ❌              ║`);
  console.log("╚════════════════════════════════════════════════════════════╝\n");

  if (critical.length > 0) {
    console.log("⛔ CRITICAL ISSUES - Fix before testing:\n");
    critical.forEach((c) => console.log(`  • ${c.name}: ${c.details}`));
    console.log();
    process.exit(1);
  }

  if (warnings.length > 0) {
    console.log("⚠️  WARNINGS - Not critical but recommended:\n");
    warnings.forEach((w) => console.log(`  • ${w.name}: ${w.details}`));
    console.log();
  }

  console.log("✅ System is ready for testing!\n");
  console.log("📖 Next steps:");
  console.log("  1. Create admin account: http://localhost:5000/setup.html");
  console.log("  2. Create & approve plumbers in admin portal");
  console.log("  3. Insert test prediction to trigger critical alert");
  console.log("  4. Check email inbox for notifications");
  console.log("  5. Run plumber workflow in portal");
  console.log("\n📚 See CRITICAL_WORKFLOW_SETUP.md for detailed instructions.\n");

  // Cleanup
  if (mongoConnected) {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error("❌ Verification failed:", err.message);
  process.exit(1);
});
