#!/usr/bin/env node

/**
 * Diagnose Email & Dashboard Rendering Issues
 * 
 * When a critical alert is detected but emails don't send and dashboard 
 * doesn't update, this script checks:
 * 1. NotificationSettings configured?
 * 2. Admin accounts exist and email verified?
 * 3. Plumber profiles approved and available?
 * 4. Email credentials in .env valid?
 * 5. What happened to the most recent critical alert?
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "../models/user.model.js";
import PlumberProfile from "../models/plumberProfile.model.js";
import NotificationSettings from "../models/notificationSettings.model.js";
import MlPrediction from "../models/mlPrediction.model.js";
import LeakEvent from "../models/leakEvent.model.js";
import Notification from "../models/notification.model.js";

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/water_loss_detection";

async function diagnose() {
  try {
    console.log("\n╔════════════════════════════════════════════════════════════╗");
    console.log("║  Email & Dashboard Diagnostic                              ║");
    console.log("╚════════════════════════════════════════════════════════════╝\n");

    // Connect
    await mongoose.connect(MONGO_URI);
    console.log("✅ MongoDB connected\n");

    // 1. Check NotificationSettings
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("1️⃣  NOTIFICATION SETTINGS (for owner critical alerts)");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    const settings = await NotificationSettings.findOne().lean();
    if (!settings || !settings.ownerEmail || !settings.ownerName) {
      console.log("❌ ISSUE: NotificationSettings not configured");
      console.log("   Owner will NOT receive critical alert emails\n");
      console.log("   FIX: Go to admin portal → Configure owner email\n");
    } else {
      console.log(`✅ Owner: ${settings.ownerName} <${settings.ownerEmail}>\n`);
    }

    // 2. Check Email Credentials
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("2️⃣  EMAIL CREDENTIALS (from .env)");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    if (!process.env.EMAIL_USER) {
      console.log("❌ EMAIL_USER not set\n");
    } else {
      console.log(`✅ EMAIL_USER: ${process.env.EMAIL_USER}\n`);
    }

    if (!process.env.EMAIL_PASS) {
      console.log("❌ EMAIL_PASS not set\n");
    } else {
      console.log(`✅ EMAIL_PASS: [configured, ${(process.env.EMAIL_PASS || "").length} chars]\n`);
    }

    // 3. Check Admin Accounts
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("3️⃣  ADMIN ACCOUNTS (for plumber notifications)");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    const admins = await User.find({ role: "admin" }).select("name email accountStatus emailVerified");
    if (admins.length === 0) {
      console.log("❌ No admin accounts found\n");
    } else {
      admins.forEach((admin) => {
        const status = admin.accountStatus === "active" && admin.emailVerified
          ? "✅ ELIGIBLE"
          : `❌ NOT ELIGIBLE (status: ${admin.accountStatus}, verified: ${admin.emailVerified})`;
        console.log(`  ${status} - ${admin.name} <${admin.email}>`);
      });
      console.log();
    }

    // 4. Check Plumber Accounts
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("4️⃣  PLUMBER ACCOUNTS (for leak notifications)");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    const plumbers = await User.find({ role: "plumber" }).select("name email accountStatus emailVerified");
    const plumberProfiles = await PlumberProfile.find().populate("userId", "name email accountStatus emailVerified");

    if (plumbers.length === 0) {
      console.log("❌ No plumber accounts found\n");
    } else {
      plumbers.forEach((plumber) => {
        const profile = plumberProfiles.find(p => p.userId?._id?.equals(plumber._id));
        const eligible = plumber.accountStatus === "active" && plumber.emailVerified && profile?.approvalStatus === "approved" && profile?.availability === "available"
          ? "✅"
          : "❌";
        const reason = !(plumber.accountStatus === "active") ? "inactive account" : !(plumber.emailVerified) ? "email not verified" : !(profile?.approvalStatus === "approved") ? "not approved" : !(profile?.availability === "available") ? "not available" : "";
        console.log(`  ${eligible} ${plumber.name} <${plumber.email}> ${reason ? `(${reason})` : "(ELIGIBLE)"}`);
      });
      console.log();
    }

    // 5. Check Recent Critical Predictions
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("5️⃣  RECENT CRITICAL PREDICTIONS");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    const predictions = await MlPrediction.find({
      overallSystemStatus: "CRITICAL",
      mlPredictionData: 1,
    })
      .sort({ _id: -1 })
      .limit(5);

    if (predictions.length === 0) {
      console.log("ℹ️  No critical leak predictions found\n");
    } else {
      predictions.forEach((pred) => {
        console.log(`  • ${pred._id}`);
        console.log(`    Detected: ${pred.createdAt}`);
        console.log(`    Water loss: ${pred.waterLossRate} L/hr`);
      });
      console.log();
    }

    // 6. Check Recent Leak Events
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("6️⃣  RECENT LEAK EVENTS (incidents created)");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    const leaks = await LeakEvent.find()
      .sort({ _id: -1 })
      .limit(5);

    if (leaks.length === 0) {
      console.log("ℹ️  No leak events found\n");
    } else {
      leaks.forEach((leak) => {
        console.log(`  • ${leak.incidentId}`);
        console.log(`    Status: ${leak.status}`);
        console.log(`    Severity: ${leak.severity}`);
        console.log(`    Created: ${leak.createdAt}`);
      });
      console.log();
    }

    // 7. Check Notifications Sent
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("7️⃣  NOTIFICATIONS SENT");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    const notificationStats = await Notification.aggregate([
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);

    if (notificationStats.length === 0) {
      console.log("ℹ️  No notifications recorded\n");
    } else {
      notificationStats.forEach((stat) => {
        const icon = stat._id === "sent" ? "✅" : stat._id === "failed" ? "❌" : "⏳";
        console.log(`  ${icon} ${stat._id}: ${stat.count}`);
      });

      // Show recent failed notifications
      const failed = await Notification.find({ status: "failed" })
        .sort({ _id: -1 })
        .limit(3);

      if (failed.length > 0) {
        console.log("\n  Recent failures:");
        failed.forEach((notif) => {
          console.log(`    ❌ ${notif.type} - Error: ${notif.errorCode}`);
        });
      }
      console.log();
    }

    // Summary & Recommendations
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📋 SUMMARY & RECOMMENDATIONS");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    const issues = [];

    if (!settings?.ownerEmail) issues.push("✗ Owner email not configured");
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) issues.push("✗ Email credentials missing from .env");
    if (admins.filter(a => a.accountStatus === "active" && a.emailVerified).length === 0) issues.push("✗ No active admin accounts");
    if (plumberProfiles.filter(p => p.approvalStatus === "approved" && p.availability === "available" && p.userId?.accountStatus === "active").length === 0) issues.push("✗ No approved/available plumbers");

    if (issues.length === 0) {
      console.log("✅ All systems look good! Critical alerts should work.\n");
      console.log("Next step: Trigger a critical prediction and check email.\n");
    } else {
      console.log("⚠️  Issues found:\n");
      issues.forEach(issue => console.log(`  ${issue}`));
      console.log("\n✅ Fixes needed:\n");
      console.log("  1. Go to http://localhost:5000/admin.html");
      console.log("  2. Configure owner email (Settings section)");
      console.log("  3. Create and approve plumber accounts");
      console.log("  4. Verify email credentials in .env\n");
    }

    await mongoose.disconnect();

  } catch (err) {
    console.error("❌ Diagnostic failed:", err.message);
    process.exit(1);
  }
}

diagnose();
