import { Router } from "express";
import { body, param, query } from "express-validator";
import { authenticate, requireAdmin } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import {
  assignProposal,
  auditLogs,
  createPlumberInvite,
  getDashboard,
  getLeak,
  listAssignments,
  listLeaks,
  listPlumbers,
  listProposals,
  reassignAssignment,
  setLeakStatus,
  setPlumberApproval,
  setPlumberStatus,
} from "../controllers/admin.controller.js";
import { verifyRecovery } from "../controllers/plumber.controller.js";

const router = Router();
router.use(authenticate, requireAdmin);

router.get("/dashboard", getDashboard);
router.get("/plumbers", query("status").optional().isIn(["pending", "approved", "rejected", "suspended"]), validate, listPlumbers);
router.post(
  "/plumbers",
  body("name").isString().trim().isLength({ min: 2, max: 100 }),
  body("email").isEmail().normalizeEmail(),
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
  validate,
  createPlumberInvite
);
router.patch(
  "/plumbers/:id/approval",
  param("id").isMongoId(),
  body("status").isIn(["approved", "rejected"]),
  body("reason").optional().isString().trim().isLength({ max: 500 }),
  validate,
  setPlumberApproval
);
router.patch(
  "/plumbers/:id/status",
  param("id").isMongoId(),
  body("status").isIn(["active", "suspended"]),
  validate,
  setPlumberStatus
);
router.get("/leaks", query("limit").optional().isInt({ min: 1, max: 200 }), validate, listLeaks);
router.get("/leaks/:id", param("id").isMongoId(), validate, getLeak);
router.patch(
  "/leaks/:id/status",
  param("id").isMongoId(),
  body("status").isIn(["OPEN_FOR_PROPOSALS", "CANCELLED", "VERIFYING_RECOVERY"]),
  body("reason").optional().isString().trim().isLength({ max: 500 }),
  validate,
  setLeakStatus
);
router.get("/leaks/:id/proposals", param("id").isMongoId(), validate, listProposals);
router.post(
  "/leaks/:id/assign",
  param("id").isMongoId(),
  body("proposalId").isMongoId(),
  validate,
  assignProposal
);
router.post("/leaks/:id/verify-recovery", param("id").isMongoId(), validate, verifyRecovery);
router.get("/assignments", query("limit").optional().isInt({ min: 1, max: 200 }), validate, listAssignments);
router.post(
  "/assignments/:id/reassign",
  param("id").isMongoId(),
  body("proposalId").isMongoId(),
  body("reason").isString().trim().isLength({ min: 5, max: 500 }),
  validate,
  reassignAssignment
);
router.get("/audit-logs", query("limit").optional().isInt({ min: 1, max: 500 }), validate, auditLogs);

export default router;
