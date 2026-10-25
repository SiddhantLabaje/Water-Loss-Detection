import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// Load .env: prefer backend/.env, fall back to repo-root .env
const localEnv = path.join(__dirname, "..", ".env");
const rootEnv  = path.join(__dirname, "..", "..", ".env");
dotenv.config({ path: existsSync(localEnv) ? localEnv : rootEnv });

import mongoose from "mongoose";
import User from "../models/user.model.js";

async function bootstrapAdmin() {
  const { MONGO_URI, ADMIN_EMAIL, ADMIN_NAME, ADMIN_PASSWORD } = process.env;
  if (!MONGO_URI || !ADMIN_EMAIL || !ADMIN_NAME || !ADMIN_PASSWORD) {
    throw new Error("Set MONGO_URI, ADMIN_EMAIL, ADMIN_NAME, and ADMIN_PASSWORD before bootstrapping.");
  }
  if (ADMIN_PASSWORD.length < 12 || ADMIN_PASSWORD.length > 128) {
    throw new Error("ADMIN_PASSWORD must be between 12 and 128 characters.");
  }
  if (ADMIN_PASSWORD.toLowerCase().includes("replace_with") || ADMIN_EMAIL.endsWith("@example.com")) {
    throw new Error("Replace the sample admin values before bootstrapping.");
  }

  await mongoose.connect(MONGO_URI);
  const email = ADMIN_EMAIL.trim().toLowerCase();
  const existingAdmin = await User.exists({ role: "admin" });
  if (existingAdmin) throw new Error("An admin account already exists; bootstrap is one-time only.");
  if (await User.exists({ email })) throw new Error("That email is already registered.");

  await User.create({
    name: ADMIN_NAME.trim(),
    email,
    passwordHash: await User.hashPassword(ADMIN_PASSWORD),
    role: "admin",
    emailVerified: true,
    accountStatus: "active",
  });
  console.log(`Initial admin created for ${email}. Remove bootstrap credentials from the environment.`);
}

bootstrapAdmin()
  .catch((err) => {
    console.error("Admin bootstrap failed:", err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
