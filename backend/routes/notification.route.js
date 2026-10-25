import { Router } from "express";
import {
  getNotificationSettings,
  saveNotificationSettings,
} from "../controllers/notification.controller.js";

const router = Router();

router.get("/settings", getNotificationSettings);
router.put("/settings", saveNotificationSettings);

export default router;
