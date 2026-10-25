import { Router } from "express";
import { body } from "express-validator";
import { validate } from "../middleware/validate.middleware.js";
import { authenticate } from "../middleware/auth.middleware.js";
import {
  register,
  login,
  logout,
  getMe,
  verifyEmail,
  forgotPassword,
  resetPassword,
  adminBootstrap,
} from "../controllers/auth.controller.js";
import rateLimit from "express-rate-limit";

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { message: "Too many requests. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

// POST /api/auth/register
router.post("/register",
  authLimiter,
  [
    body("name").trim().notEmpty().withMessage("Name is required.").isLength({ max: 100 }),
    body("email").isEmail().withMessage("Valid email is required.").normalizeEmail(),
    body("password").isLength({ min: 8 }).withMessage("Password must be at least 8 characters."),
    body("phone").optional().trim(),
  ],
  validate,
  register
);

// POST /api/auth/login
router.post("/login",
  authLimiter,
  [
    body("email").isEmail().normalizeEmail(),
    body("password").notEmpty().withMessage("Password is required."),
  ],
  validate,
  login
);

// POST /api/auth/logout
router.post("/logout", logout);

// GET /api/auth/me
router.get("/me", authenticate, getMe);

// POST /api/auth/verify-email
router.post("/verify-email",
  [body("token").notEmpty().withMessage("Token is required.")],
  validate,
  verifyEmail
);

// POST /api/auth/forgot-password
router.post("/forgot-password",
  authLimiter,
  [body("email").isEmail().normalizeEmail()],
  validate,
  forgotPassword
);

// POST /api/auth/reset-password
router.post("/reset-password",
  authLimiter,
  [
    body("token").notEmpty(),
    body("password").isLength({ min: 8 }).withMessage("Password must be at least 8 characters."),
  ],
  validate,
  resetPassword
);

// POST /api/auth/bootstrap-admin  — one-time admin creation (requires ADMIN_BOOTSTRAP_KEY)
router.post("/bootstrap-admin",
  [
    body("bootstrapKey").notEmpty().withMessage("Bootstrap key required."),
    body("name").trim().notEmpty(),
    body("email").isEmail().normalizeEmail(),
    body("password").isLength({ min: 12 }).withMessage("Admin password must be at least 12 characters."),
  ],
  validate,
  adminBootstrap
);

export default router;
