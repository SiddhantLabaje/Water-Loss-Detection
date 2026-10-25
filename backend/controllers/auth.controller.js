import { createHash, randomBytes } from "node:crypto";
import User from "../models/user.model.js";
import PlumberProfile from "../models/plumberProfile.model.js";
import { signToken } from "../middleware/auth.middleware.js";
import {
  sendEmailVerification,
  sendPasswordReset,
} from "../services/notification.service.js";

const SESSION_COOKIE = "token";
const verificationExpiryMs = 24 * 60 * 60 * 1000;
const resetExpiryMs = 60 * 60 * 1000;

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function setSessionCookie(res, user) {
  res.cookie(SESSION_COOKIE, signToken(user.id, user.role, user.tokenVersion), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  });
}

function publicUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    accountStatus: user.accountStatus,
    emailVerified: user.emailVerified,
  };
}

export async function register(req, res) {
  try {
    const email = req.body.email.trim().toLowerCase();
    if (await User.exists({ email })) {
      return res.status(409).json({ message: "An account with this email already exists." });
    }

    const verifyToken = randomBytes(32).toString("hex");
    const user = await User.create({
      name: req.body.name.trim(),
      email,
      passwordHash: await User.hashPassword(req.body.password),
      role: "plumber",
      accountStatus: "pending",
      emailVerifyToken: hashToken(verifyToken),
      emailVerifyExpires: new Date(Date.now() + verificationExpiryMs),
    });

    try {
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
        approvalStatus: "pending",
      });
    } catch (err) {
      await User.deleteOne({ _id: user._id });
      throw err;
    }

    try {
      await sendEmailVerification(user, verifyToken);
    } catch (err) {
      console.error(`[AUTH] Verification email failed for user ${user.id}: ${err.message}`);
      return res.status(503).json({
        message: "Account created but verification email could not be sent. Ask an administrator to check email configuration.",
      });
    }

    res.status(201).json({
      message: "Registration received. Verify your email; an administrator must approve your plumber account.",
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: "An account with this email already exists." });
    }
    console.error("[AUTH] Registration failed:", err.message);
    res.status(500).json({ message: "Unable to complete registration." });
  }
}

export async function login(req, res) {
  try {
    const user = await User.findOne({ email: req.body.email.trim().toLowerCase() });
    if (!user || !(await user.verifyPassword(req.body.password))) {
      return res.status(401).json({ message: "Invalid email or password." });
    }
    if (!user.emailVerified) {
      return res.status(403).json({ message: "Verify your email before signing in." });
    }
    if (user.accountStatus === "suspended" || user.accountStatus === "rejected") {
      return res.status(403).json({ message: "This account cannot sign in. Contact the administrator." });
    }

    user.lastLoginAt = new Date();
    await user.save();
    setSessionCookie(res, user);
    res.json({ user: publicUser(user) });
  } catch (err) {
    console.error("[AUTH] Login failed:", err.message);
    res.status(500).json({ message: "Unable to sign in." });
  }
}

export async function logout(req, res) {
  try {
    await User.updateOne({ _id: req.user._id }, { $inc: { tokenVersion: 1 } });
    res.clearCookie(SESSION_COOKIE, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
    });
    res.json({ message: "Signed out." });
  } catch (err) {
    console.error("[AUTH] Logout failed:", err.message);
    res.status(500).json({ message: "Unable to sign out." });
  }
}

export async function me(req, res) {
  res.json({ user: publicUser(req.user) });
}

export async function verifyEmail(req, res) {
  try {
    const user = await User.findOneAndUpdate(
      {
        emailVerifyToken: hashToken(req.body.token),
        emailVerifyExpires: { $gt: new Date() },
      },
      {
        $set: { emailVerified: true },
        $unset: { emailVerifyToken: 1, emailVerifyExpires: 1 },
      },
      { new: true }
    );
    if (!user) return res.status(400).json({ message: "Verification link is invalid or expired." });
    res.json({ message: "Email verified. Your plumber account is awaiting administrator approval." });
  } catch (err) {
    console.error("[AUTH] Email verification failed:", err.message);
    res.status(500).json({ message: "Unable to verify email." });
  }
}

export async function resendVerification(req, res) {
  const message = "If the account exists and is not verified, a new verification email will be sent.";
  try {
    const user = await User.findOne({
      email: req.body.email.trim().toLowerCase(),
      emailVerified: false,
    });
    if (!user) return res.json({ message });
    const token = randomBytes(32).toString("hex");
    user.emailVerifyToken = hashToken(token);
    user.emailVerifyExpires = new Date(Date.now() + verificationExpiryMs);
    await user.save();
    try {
      await sendEmailVerification(user, token);
    } catch (err) {
      console.error(`[AUTH] Verification resend failed for user ${user.id}: ${err.message}`);
      return res.status(503).json({ message: "Verification email could not be sent. Contact the administrator." });
    }
    res.json({ message });
  } catch (err) {
    console.error("[AUTH] Verification resend request failed:", err.message);
    res.status(500).json({ message: "Unable to process verification request." });
  }
}

export async function forgotPassword(req, res) {
  const genericMessage = "If the account exists, a password reset link will be sent.";
  try {
    const user = await User.findOne({ email: req.body.email.trim().toLowerCase() });
    if (!user) return res.json({ message: genericMessage });

    const token = randomBytes(32).toString("hex");
    user.passwordResetToken = hashToken(token);
    user.passwordResetExpires = new Date(Date.now() + resetExpiryMs);
    await user.save();
    try {
      await sendPasswordReset(user, token);
    } catch (err) {
      console.error(`[AUTH] Password reset email failed for user ${user.id}: ${err.message}`);
      return res.status(503).json({ message: "Password reset email could not be sent. Contact the administrator." });
    }
    res.json({ message: genericMessage });
  } catch (err) {
    console.error("[AUTH] Password reset request failed:", err.message);
    res.status(500).json({ message: "Unable to process password reset request." });
  }
}

export async function resetPassword(req, res) {
  try {
    const user = await User.findOne({
      passwordResetToken: hashToken(req.body.token),
      passwordResetExpires: { $gt: new Date() },
    });
    if (!user) return res.status(400).json({ message: "Password reset link is invalid or expired." });

    user.passwordHash = await User.hashPassword(req.body.password);
    user.passwordResetToken = null;
    user.passwordResetExpires = null;
    user.tokenVersion += 1;
    await user.save();
    res.json({ message: "Password reset successfully. Please sign in again." });
  } catch (err) {
    console.error("[AUTH] Password reset failed:", err.message);
    res.status(500).json({ message: "Unable to reset password." });
  }
}
