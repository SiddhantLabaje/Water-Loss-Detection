import { Router } from "express";
import getSensorData, { getLatestSensor } from "../controllers/sensor.controller.js";
import { authenticate, requireMonitoringAccess } from "../middleware/auth.middleware.js";

const router = Router();

router.use(authenticate, requireMonitoringAccess);

// GET /api/sensors/sensor-data?limit=100&page=1
router.get("/sensor-data", getSensorData);

// GET /api/sensors/latest
router.get("/latest", getLatestSensor);

export default router;
