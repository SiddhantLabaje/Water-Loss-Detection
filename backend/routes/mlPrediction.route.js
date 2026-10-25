import { Router } from "express";
import {
  getLatestPrediction,
  getPredictionHistory,
  getPredictionStats,
  getAlerts,
} from "../controllers/mlPrediction.controller.js";
import { authenticate, requireMonitoringAccess } from "../middleware/auth.middleware.js";

const router = Router();

router.use(authenticate, requireMonitoringAccess);

// Latest single prediction (used by live dashboard)
router.get("/latest", getLatestPrediction);

// Paginated history  GET /api/ml-predictions/history?limit=50&page=1
router.get("/history", getPredictionHistory);

// Aggregated stats summary for dashboard cards
router.get("/stats", getPredictionStats);

// Recent CRITICAL / WARNING alerts
router.get("/alerts", getAlerts);

export default router;
