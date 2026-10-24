import { Router } from "express";
import {
  saveEmailSettings,
  getEmailSettings,
  sendReportNow,
} from "../controllers/email.controller.js";

const router = Router();

// GET  /api/email/settings    — fetch saved recipient settings
router.get("/settings", getEmailSettings);

// POST /api/email/settings    — save / update recipient email
router.post("/settings", saveEmailSettings);

// POST /api/email/send-report — send the dashboard report immediately
router.post("/send-report", sendReportNow);

export default router;
