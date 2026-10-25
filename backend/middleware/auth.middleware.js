import jwt from "jsonwebtoken";
import User from "../models/user.model.js";
import PlumberProfile from "../models/plumberProfile.model.js";

function getJwtSecret() {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32 ||
      process.env.JWT_SECRET.toLowerCase().includes("replace_with")) {
    throw new Error("JWT_SECRET must be configured with at least 32 characters.");
  }
  return process.env.JWT_SECRET;
}

/**
 * Attach the authenticated user to req.user.
 * Reads JWT from Authorization: Bearer <token> header OR httpOnly cookie.
 */
export async function authenticate(req, res, next) {
  try {
    let token = null;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.slice(7);
    } else if (req.cookies?.token) {
      token = req.cookies.token;
    }

    if (!token) {
      if (req.pageRequest) return res.redirect("/login.html");
      return res.status(401).json({ message: "Authentication required." });
    }

    const payload = jwt.verify(token, getJwtSecret());
    const user = await User.findById(payload.id).select(
      "-passwordHash -passwordResetToken -passwordResetExpires -emailVerifyToken -emailVerifyExpires"
    );

    if (!user) {
      if (req.pageRequest) return res.redirect("/login.html");
      return res.status(401).json({ message: "User no longer exists." });
    }

    if (user.accountStatus === "suspended") {
      if (req.pageRequest) return res.redirect("/login.html");
      return res.status(403).json({ message: "Account is suspended." });
    }

    if (payload.tokenVersion !== user.tokenVersion) {
      if (req.pageRequest) return res.redirect("/login.html");
      return res.status(401).json({ message: "Session is no longer valid. Please log in again." });
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      if (req.pageRequest) return res.redirect("/login.html");
      return res.status(401).json({ message: "Session expired. Please log in again." });
    }
    if (err instanceof jwt.JsonWebTokenError) {
      if (req.pageRequest) return res.redirect("/login.html");
      return res.status(401).json({ message: "Invalid token." });
    }
    console.error("[AUTH] Session verification failed:", err.message);
    return res.status(500).json({ message: "Unable to verify session." });
  }
}

export function authenticatePage(req, res, next) {
  req.pageRequest = true;
  return authenticate(req, res, next);
}

/** Require role: "admin" */
export function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "admin") {
    if (req.pageRequest) return res.redirect(req.user?.role === "plumber" ? "/plumber.html" : "/login.html");
    return res.status(403).json({ message: "Admin access required." });
  }
  next();
}

/** Require role: "plumber" */
export function requirePlumber(req, res, next) {
  if (!req.user || req.user.role !== "plumber") {
    if (req.pageRequest) return res.redirect(req.user?.role === "admin" ? "/admin.html" : "/login.html");
    return res.status(403).json({ message: "Plumber access required." });
  }
  next();
}

/** Require approved plumber */
export async function requireApprovedPlumber(req, res, next) {
  if (!req.user || req.user.role !== "plumber") {
    if (req.pageRequest) return res.redirect("/login.html");
    return res.status(403).json({ message: "Plumber access required." });
  }
  try {
    const profile = await PlumberProfile.findOne({ userId: req.user._id });
    if (!profile || profile.approvalStatus !== "approved" || req.user.accountStatus !== "active") {
      if (req.pageRequest) return res.redirect("/plumber.html");
      return res.status(403).json({ message: "Account is not approved for repair requests." });
    }
    req.plumberProfile = profile;
    next();
  } catch (err) {
    console.error("[AUTH] Plumber approval lookup failed:", err.message);
    res.status(500).json({ message: "Unable to verify plumber account status." });
  }
}

/** Require an administrator or an approved plumber for monitoring data. */
export function requireMonitoringAccess(req, res, next) {
  if (req.user?.role === "admin") return next();
  return requireApprovedPlumber(req, res, next);
}

/** Sign a JWT for a user */
export function signToken(userId, role, tokenVersion = 0) {
  return jwt.sign({ id: userId, role, tokenVersion }, getJwtSecret(), { expiresIn: "7d" });
}
