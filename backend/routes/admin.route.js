import { Router } from "express";
import { body, param } from "express-validator";
import { authenticate, requireAdmin } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import {
  getDashboard,
  listPlumbers,
  registerPlumber,
  getPlumber,
  updatePlumberApproval,
  updatePlumberStatus,
  listLeaks,
  getLeakDetail,
  updateLeakStatus,
  getLeakProposals,
  assignPlumber,
  reassignPlumber,
  listAssignments,
  getAuditLogs,
} from "../controllers/admin.controller.js";

const router = Router();
router.use(authenticate, requireAdmin);

// Dashboard
router.get("/dashboard", getDashboard);

// Plumber management
router.get("/plumbers", listPlumbers);
router.post("/plumbers",
  [
    body("name").trim().notEmpty(),
    body("email").isEmail().normalizeEmail(),
    body("phone").trim().notEmpty(),
    body("serviceArea").trim().notEmpty(),
    body("experienceYears").isInt({ min: 0 }),
  ],
  validate,
  registerPlumber
);
router.get("/plumbers/:id", [param("id").isMongoId()], validate, getPlumber);
router.patch("/plumbers/:id/approval",
  [param("id").isMongoId(), body("status").isIn(["approved", "rejected"])],
  validate,
  updatePlumberApproval
);
router.patch("/plumbers/:id/status",
  [param("id").isMongoId(), body("status").isIn(["active", "suspended"])],
  validate,
  updatePlumberStatus
);

// Leak management
router.get("/leaks", listLeaks);
router.get("/leaks/:id", [param("id").isMongoId()], validate, getLeakDetail);
router.patch("/leaks/:id/status",
  [param("id").isMongoId(), body("status").notEmpty()],
  validate,
  updateLeakStatus
);
router.get("/leaks/:id/proposals", [param("id").isMongoId()], validate, getLeakProposals);
router.post("/leaks/:id/assign",
  [param("id").isMongoId(), body("proposalId").isMongoId()],
  validate,
  assignPlumber
);

// Assignment management
router.get("/assignments", listAssignments);
router.post("/assignments/:id/reassign",
  [param("id").isMongoId(), body("reason").trim().notEmpty()],
  validate,
  reassignPlumber
);

// Audit logs
router.get("/audit-logs", getAuditLogs);

export default router;
