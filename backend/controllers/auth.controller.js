import crypto from "crypto";
import User from "../models/user.model.js";
import PlumberProfile from "../models/plumberProfile.model.js";
import { signToken } from "../middleware/auth.middleware.js";
import { audit } from "../services/audit.service.js";
import {
  sendEmailVerification,
  sendPasswordReset,
} from "../services/notification.service.js";

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

function randomToken() {
  return crypto.randomBytes(32).toString("hex");
}

// POST /api/auth/register  (plumber self-registration)
export async function register(req, res) {
  try {
    const { name, email, password, phone, serviceArea, city, state,
            serviceRadiusKm, experienceYears, skills, businessName } = req.body;

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ message: "An account with this email already exists." });
    }

    const passwordHash     = await User.hashPassword(password);
    const emailVerifyToken = randomToken();

    const user = await User.create({
      name, email, passwordHash, role: "plumber",
      emailVerified: false,
      emailVerifyToken,
      emailVerifyExpires: new Date(Date.now() + 24 * 60 * 60 * 1000),
      accountStatus: "pending",
    });

    await PlumberProfile.create({
      userId: user._id,
      phone: phone || "",
      businessName: businessName || "",
      serviceArea: serviceArea || "",
      city: city || "",
      state: state || "",
      serviceRadiusKm: serviceRadiusKm || 25,
      experienceYears: experienceYears || 0,
      skills: Array.isArray(skills) ? skills : [],
      approvalStatus: "pending",
    });

    // Send verification email — don't crash if it fails
    try { await sendEmailVerification(user, emailVerifyToken); } catch {}

    await audit(user._id, "PLUMBER_REGISTERED", "User", user._id, {}, req);

    res.status(201).json({
      message: "Registration successful. Please check your email to verify your account.",
    });
  } catch (err) {
    console.error("register error:", err);
    res.status(500).json({ message: "Registration failed. Please try again." });
  }
}

// POST /api/auth/login
export async function login(req, res) {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    const valid = await user.verifyPassword(password);
    if (!valid) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    if (user.accountStatus === "suspended") {
      return res.status(403).json({ message: "This account has been suspended." });
    }

    // Allow login even without email verification so plumbers can check status
    const token = signToken(user._id, user.role);
    user.lastLoginAt = new Date();
    await user.save();

    await audit(user._id, "LOGIN", "User", user._id, { role: user.role }, req);

    res
      .cookie("token", token, COOKIE_OPTS)
      .json({
        message: "Logged in.",
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          emailVerified: user.emailVerified,
          accountStatus: user.accountStatus,
        },
      });
  } catch (err) {
    console.error("login error:", err);
    res.status(500).json({ message: "Login failed. Please try again." });
  }
}

// POST /api/auth/logout
export async function logout(req, res) {
  res.clearCookie("token").json({ message: "Logged out." });
}

// GET /api/auth/me
export async function getMe(req, res) {
  const user = req.user;
  let profile = null;
  if (user.role === "plumber") {
    profile = await PlumberProfile.findOne({ userId: user._id }).lean();
  }
  res.json({ user, profile });
}

// POST /api/auth/verify-email
export async function verifyEmail(req, res) {
  try {
    const { token } = req.body;
    const user = await User.findOne({
      emailVerifyToken: token,
      emailVerifyExpires: { $gt: new Date() },
    });

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired verification token." });
    }

    user.emailVerified      = true;
    user.emailVerifyToken   = null;
    user.emailVerifyExpires = null;
    await user.save();

    res.json({ message: "Email verified successfully." });
  } catch (err) {
    res.status(500).json({ message: "Verification failed." });
  }
}

// POST /api/auth/forgot-password
export async function forgotPassword(req, res) {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    // Always return success to prevent email enumeration
    if (user) {
      const resetToken = randomToken();
      user.passwordResetToken   = resetToken;
      user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      await user.save();
      try { await sendPasswordReset(user, resetToken); } catch {}
    }

    res.json({ message: "If an account with that email exists, a reset link has been sent." });
  } catch (err) {
    res.status(500).json({ message: "Request failed." });
  }
}

// POST /api/auth/reset-password
export async function resetPassword(req, res) {
  try {
    const { token, password } = req.body;
    const user = await User.findOne({
      passwordResetToken: token,
      passwordResetExpires: { $gt: new Date() },
    });

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired reset token." });
    }

    user.passwordHash          = await User.hashPassword(password);
    user.passwordResetToken    = null;
    user.passwordResetExpires  = null;
    await user.save();

    await audit(user._id, "PASSWORD_RESET", "User", user._id, {}, req);

    res.json({ message: "Password reset successfully. You can now log in." });
  } catch (err) {
    res.status(500).json({ message: "Password reset failed." });
  }
}

// POST /api/auth/bootstrap-admin  — one-time initial admin creation
export async function adminBootstrap(req, res) {
  try {
    const BOOTSTRAP_KEY = process.env.ADMIN_BOOTSTRAP_KEY;
    if (!BOOTSTRAP_KEY || BOOTSTRAP_KEY.length < 16) {
      return res.status(503).json({ message: "Bootstrap not configured on this server." });
    }

    if (req.body.bootstrapKey !== BOOTSTRAP_KEY) {
      return res.status(403).json({ message: "Invalid bootstrap key." });
    }

    const existingAdmin = await User.findOne({ role: "admin" });
    if (existingAdmin) {
      return res.status(409).json({ message: "An admin account already exists." });
    }

    const { name, email, password } = req.body;
    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ message: "Email already in use." });
    }

    const passwordHash = await User.hashPassword(password);
    const admin = await User.create({
      name, email, passwordHash, role: "admin",
      emailVerified: true,
      accountStatus: "active",
    });

    await audit(admin._id, "ADMIN_BOOTSTRAP", "User", admin._id, { email }, req);

    res.status(201).json({ message: "Admin account created successfully.", id: admin._id });
  } catch (err) {
    console.error("bootstrap error:", err);
    res.status(500).json({ message: "Bootstrap failed." });
  }
}
