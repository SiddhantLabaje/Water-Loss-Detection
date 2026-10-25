import { Router } from "express";
import {
  getNotificationSettings,
  saveNotificationSettings,
} from "../controllers/notification.controller.js";
import { authenticate, requireAdmin } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/settings", authenticate, requireAdmin, getNotificationSettings);
router.put("/settings", authenticate, requireAdmin, saveNotificationSettings);

export default router;
