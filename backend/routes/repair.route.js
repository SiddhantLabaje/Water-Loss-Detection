import { Router } from "express";
import { param } from "express-validator";
import { authenticate, requireAdmin } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import {
  listRepairs,
  getRepair,
  verifyRecovery,
  getVerificationHistory,
} from "../controllers/repair.controller.js";

const router = Router();
router.use(authenticate);

router.get("/history", listRepairs);
router.get("/:id", [param("id").isMongoId()], validate, getRepair);
router.post("/:id/verify-recovery",
  requireAdmin,
  [param("id").isMongoId()],
  validate,
  verifyRecovery
);
router.get("/:id/verification-history",
  [param("id").isMongoId()],
  validate,
  getVerificationHistory
);

export default router;
