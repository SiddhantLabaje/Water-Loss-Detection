import { Router } from "express";
import { body, param, query } from "express-validator";
import {
  authenticate,
  requireApprovedPlumber,
} from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import {
  createProposal,
  getAssignment,
  getProfile,
  getRepairRequest,
  listAssignments,
  listProposals,
  listRepairRequests,
  submitCompletionReport,
  updateAssignmentStatus,
  updateProfile,
  updateProposal,
  withdrawProposal,
} from "../controllers/plumber.controller.js";

const router = Router();
router.use(authenticate, requireApprovedPlumber);

router.get("/profile", getProfile);
router.patch(
  "/profile",
  body("phone").optional().isString().trim().isLength({ min: 7, max: 30 }),
  body("businessName").optional().isString().trim().isLength({ max: 120 }),
  body("address").optional().isString().trim().isLength({ max: 200 }),
  body("city").optional().isString().trim().isLength({ max: 100 }),
  body("state").optional().isString().trim().isLength({ max: 100 }),
  body("serviceArea").optional().isString().trim().isLength({ max: 200 }),
  body("workingHours").optional().isString().trim().isLength({ max: 200 }),
  body("serviceRadiusKm").optional().isFloat({ min: 1, max: 500 }),
  body("experienceYears").optional().isInt({ min: 0, max: 80 }),
  body("skills").optional().isArray({ min: 1, max: 20 }),
  body("skills.*").optional().isString().trim().isLength({ min: 2, max: 60 }),
  body("availability").optional().isIn(["available", "busy", "unavailable"]),
  validate,
  updateProfile
);
router.get(
  "/repair-requests",
  query("page").optional().isInt({ min: 1 }),
  query("limit").optional().isInt({ min: 1, max: 100 }),
  validate,
  listRepairRequests
);
router.get("/repair-requests/:id", param("id").isMongoId(), validate, getRepairRequest);
router.post(
  "/repair-requests/:id/proposals",
  param("id").isMongoId(),
  body("repairMethod").isString().trim().isLength({ min: 5, max: 1000 }),
  body("labourCharges").isFloat({ min: 0, max: 100000000 }),
  body("materialCharges").isFloat({ min: 0, max: 100000000 }),
  body("visitCharges").optional().isFloat({ min: 0, max: 100000000 }),
  body("otherCharges").optional().isFloat({ min: 0, max: 100000000 }),
  body("estimatedDurationHours").isFloat({ gt: 0, max: 8760 }),
  body("earliestAvailability").isISO8601().toDate(),
  body("warrantyDetails").optional().isString().trim().isLength({ max: 1000 }),
  body("notes").optional().isString().trim().isLength({ max: 2000 }),
  validate,
  createProposal
);
router.get("/proposals", listProposals);
router.patch(
  "/proposals/:id",
  param("id").isMongoId(),
  body("repairMethod").optional().isString().trim().isLength({ min: 5, max: 1000 }),
  body("labourCharges").optional().isFloat({ min: 0, max: 100000000 }),
  body("materialCharges").optional().isFloat({ min: 0, max: 100000000 }),
  body("visitCharges").optional().isFloat({ min: 0, max: 100000000 }),
  body("otherCharges").optional().isFloat({ min: 0, max: 100000000 }),
  body("estimatedDurationHours").optional().isFloat({ gt: 0, max: 8760 }),
  body("earliestAvailability").optional().isISO8601().toDate(),
  body("warrantyDetails").optional().isString().trim().isLength({ max: 1000 }),
  body("notes").optional().isString().trim().isLength({ max: 2000 }),
  validate,
  updateProposal
);
router.post(
  "/proposals/:id/withdraw",
  param("id").isMongoId(),
  body("reason").optional().isString().trim().isLength({ max: 500 }),
  validate,
  withdrawProposal
);
router.get("/assignments", listAssignments);
router.get("/assignments/:id", param("id").isMongoId(), validate, getAssignment);
router.patch(
  "/assignments/:id/status",
  param("id").isMongoId(),
  body("status").isIn(["accepted", "in_progress"]),
  validate,
  updateAssignmentStatus
);
router.post(
  "/assignments/:id/completion-report",
  param("id").isMongoId(),
  body("workDescription").isString().trim().isLength({ min: 5, max: 5000 }),
  body("partsUsed").optional().isString().trim().isLength({ max: 2000 }),
  body("labourCharges").isFloat({ min: 0, max: 100000000 }),
  body("materialCharges").isFloat({ min: 0, max: 100000000 }),
  body("completionNotes").optional().isString().trim().isLength({ max: 5000 }),
  body("furtherWorkRequired").optional().isBoolean().toBoolean(),
  validate,
  submitCompletionReport
);

export default router;
