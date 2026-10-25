import { Router } from "express";
import { body, param } from "express-validator";
import { authenticate, requirePlumber } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import {
  getProfile,
  updateProfile,
  listRepairRequests,
  getRepairRequest,
  submitProposal,
  updateProposal,
  withdrawProposal,
  listMyProposals,
  listMyAssignments,
  getAssignment,
  updateAssignmentStatus,
  submitCompletionReport,
} from "../controllers/plumber.controller.js";

const router = Router();
router.use(authenticate, requirePlumber);

// Profile
router.get("/profile", getProfile);
router.patch("/profile", updateProfile);

// Repair requests visible to this plumber
router.get("/repair-requests", listRepairRequests);
router.get("/repair-requests/:id", [param("id").isMongoId()], validate, getRepairRequest);

// Proposals
router.post("/repair-requests/:id/proposals",
  [
    param("id").isMongoId(),
    body("repairMethod").trim().notEmpty(),
    body("labourCharges").isFloat({ min: 0 }),
    body("materialCharges").isFloat({ min: 0 }),
    body("visitCharges").optional().isFloat({ min: 0 }),
    body("otherCharges").optional().isFloat({ min: 0 }),
    body("estimatedDurationHours").isFloat({ min: 0 }),
    body("earliestAvailability").isISO8601(),
  ],
  validate,
  submitProposal
);
router.patch("/proposals/:id",
  [param("id").isMongoId()],
  validate,
  updateProposal
);
router.post("/proposals/:id/withdraw",
  [param("id").isMongoId(), body("reason").optional().trim()],
  validate,
  withdrawProposal
);
router.get("/proposals", listMyProposals);

// Assignments
router.get("/assignments", listMyAssignments);
router.get("/assignments/:id", [param("id").isMongoId()], validate, getAssignment);
router.patch("/assignments/:id/status",
  [param("id").isMongoId(), body("status").notEmpty()],
  validate,
  updateAssignmentStatus
);
router.post("/assignments/:id/completion-report",
  [
    param("id").isMongoId(),
    body("workDescription").trim().notEmpty(),
    body("labourCharges").isFloat({ min: 0 }),
    body("materialCharges").isFloat({ min: 0 }),
    body("finalAmount").isFloat({ min: 0 }),
  ],
  validate,
  submitCompletionReport
);

export default router;
