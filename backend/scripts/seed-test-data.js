#!/usr/bin/env node

/**
 * Seed Database With Test Admin, Plumbers, and Owner Settings
 * 
 * This populates the database with:
 * 1. Admin account (for dashboard)
 * 2. 2 Plumber accounts (for receiving leak notifications)
 * 3. Owner email configuration (for receiving critical alerts)
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "../models/user.model.js";
import PlumberProfile from "../models/plumberProfile.model.js";
import NotificationSettings from "../models/notificationSettings.model.js";
import bcrypt from "bcryptjs";

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/water_loss_detection";

async function seed() {
  try {
    console.log("\n╔════════════════════════════════════════════════════════════╗");
    console.log("║  Seeding Test Data for Email & Dashboard                   ║");
    console.log("╚════════════════════════════════════════════════════════════╝\n");

    // Connect
    await mongoose.connect(MONGO_URI);
    console.log("✅ MongoDB connected\n");

    // Clear test data
    console.log("Clearing previous test data...");
    await User.deleteMany({ email: { $regex: /test-/ } });
    await PlumberProfile.deleteMany({});
    await NotificationSettings.deleteMany({});
    console.log("✅ Cleared\n");

    // 1. Create Admin Account
    console.log("Creating admin account...");
    const adminHash = await bcrypt.hash("admin123", 10);
    const admin = await User.create({
      name: "Admin User",
      email: "test-admin@example.com",
      passwordHash: adminHash,
      role: "admin",
      accountStatus: "active",
      emailVerified: true,
    });
    console.log(`✅ Admin created: ${admin.name} (${admin.email})\n`);

    // 2. Create Plumber Accounts
    console.log("Creating plumber accounts...");
    const plumberHash = await bcrypt.hash("plumber123", 10);

    const plumber1 = await User.create({
      name: "Plumber One - Cheap Option",
      email: "test-plumber1@example.com",
      passwordHash: plumberHash,
      role: "plumber",
      accountStatus: "active",
      emailVerified: true,
    });
    console.log(`✅ Plumber 1 created: ${plumber1.name} (${plumber1.email})`);

    const plumber2 = await User.create({
      name: "Plumber Two - Premium Service",
      email: "test-plumber2@example.com",
      passwordHash: plumberHash,
      role: "plumber",
      accountStatus: "active",
      emailVerified: true,
    });
    console.log(`✅ Plumber 2 created: ${plumber2.name} (${plumber2.email})\n`);

    // 3. Create Plumber Profiles & Approve Them
    console.log("Creating plumber profiles (approved & available)...");

    const profile1 = await PlumberProfile.create({
      userId: plumber1._id,
      approvalStatus: "approved",
      availability: "available",
      specialty: ["Leak detection", "Pipe replacement"],
      experienceYears: 5,
      areaOfService: "City center",
    });
    console.log(`✅ Profile 1 approved & available`);

    const profile2 = await PlumberProfile.create({
      userId: plumber2._id,
      approvalStatus: "approved",
      availability: "available",
      specialty: ["High-pressure repairs", "Emergency service"],
      experienceYears: 10,
      areaOfService: "All areas",
    });
    console.log(`✅ Profile 2 approved & available\n`);

    // 4. Configure Owner Email for Notifications
    console.log("Configuring owner email for critical alerts...");

    const ownerEmail = process.env.ADMIN_EMAIL || "labajesiddhant07@gmail.com";
    const ownerName = process.env.ADMIN_NAME || "Siddhant Labaje";

    await NotificationSettings.findOneAndUpdate(
      {},
      {
        ownerName,
        ownerEmail,
      },
      { upsert: true }
    );
    console.log(`✅ Owner configured: ${ownerName} <${ownerEmail}>\n`);

    // Summary
    console.log("╔════════════════════════════════════════════════════════════╗");
    console.log("║  ✅ Test Data Seeded Successfully                          ║");
    console.log("╚════════════════════════════════════════════════════════════╝\n");

    console.log("📋 What was created:\n");
    console.log("  Admin Account:");
    console.log(`    Email: test-admin@example.com`);
    console.log(`    Password: admin123`);
    console.log(`    Status: Active & Email Verified\n`);

    console.log("  Plumber Accounts (Both approved & available):");
    console.log(`    1. test-plumber1@example.com (Password: plumber123)`);
    console.log(`    2. test-plumber2@example.com (Password: plumber123)\n`);

    console.log("  Owner Email (for critical alerts):");
    console.log(`    ${ownerName} <${ownerEmail}>\n`);

    console.log("🚀 Next steps:\n");
    console.log("  1. Critical alert detected → LeakEvent created ✅");
    console.log("  2. Owner gets email: [CRITICAL] Smart Water Monitor alert");
    console.log("  3. Admin gets email: [LEAK DETECTED] New incident");
    console.log("  4. Both plumbers get emails: [NEW LEAK REQUEST] Submit estimate");
    console.log("  5. Admin portal shows critical leak with plumber proposals");
    console.log("  6. Plumber portal shows leak request\n");

    console.log("💾 Test in browser:\n");
    console.log("  1. Admin: http://localhost:5000/admin.html");
    console.log("     Email: test-admin@example.com");
    console.log("     Password: admin123\n");

    console.log("  2. Plumber: http://localhost:5000/plumber.html");
    console.log("     Email: test-plumber1@example.com");
    console.log("     Password: plumber123\n");

    console.log("📧 Check your email inbox for notifications once critical alert is triggered!\n");

    await mongoose.disconnect();

  } catch (err) {
    console.error("❌ Seeding failed:", err.message);
    process.exit(1);
  }
}

seed();
