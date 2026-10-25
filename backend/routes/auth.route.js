import { Router } from "express";
import rateLimit from "express-rate-limit";
import { body } from "express-validator";
import { authenticate } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import {
  forgotPassword,
  login,
  logout,
  me,
  register,
  resendVerification,
  resetPassword,
  verifyEmail,
} from "../controllers/auth.controller.js";
import { acceptPlumberInvite } from "../controllers/admin.controller.js";

const router = Router();
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { message: "Too many authentication attempts. Try again later." },
});

const email = body("email").isEmail().normalizeEmail().withMessage("A valid email is required.");
const password = body("password")
  .isString()
  .isLength({ min: 12, max: 128 })
  .withMessage("Password must be between 12 and 128 characters.");

router.post(
  "/register",
  authLimiter,
  body("name").isString().trim().isLength({ min: 2, max: 100 }),
  email,
  password,
  body("phone").isString().trim().isLength({ min: 7, max: 30 }),
  body("address").isString().trim().isLength({ min: 3, max: 200 }),
  body("city").isString().trim().isLength({ min: 2, max: 100 }),
  body("state").isString().trim().isLength({ min: 2, max: 100 }),
  body("serviceRadiusKm").isFloat({ min: 1, max: 500 }),
  body("experienceYears").isInt({ min: 0, max: 80 }),
  body("skills").isArray({ min: 1, max: 20 }),
  body("skills.*").isString().trim().isLength({ min: 2, max: 60 }),
  body("businessName").optional().isString().trim().isLength({ max: 120 }),
  body("workingHours").optional().isString().trim().isLength({ max: 200 }),
  body("termsAccepted").equals("true").withMessage("Agreement to the terms and privacy policy is required."),
  validate,
  register
);
router.post("/login", authLimiter, email, body("password").isString().isLength({ min: 1, max: 128 }), validate, login);
router.post("/logout", authenticate, logout);
router.get("/me", authenticate, me);
router.post("/verify-email", authLimiter, body("token").isHexadecimal().isLength({ min: 64, max: 64 }), validate, verifyEmail);
router.post("/resend-verification", authLimiter, email, validate, resendVerification);
router.post(
  "/accept-invite",
  authLimiter,
  body("token").isHexadecimal().isLength({ min: 64, max: 64 }),
  password,
  validate,
  acceptPlumberInvite
);
router.post("/forgot-password", authLimiter, email, validate, forgotPassword);
router.post(
  "/reset-password",
  authLimiter,
  body("token").isHexadecimal().isLength({ min: 64, max: 64 }),
  password,
  validate,
  resetPassword
);

export default router;
