import { Router } from "express";
import getSensorData, { getLatestSensor } from "../controllers/sensor.controller.js";

const router = Router();

// GET /api/sensors/sensor-data?limit=100&page=1
router.get("/sensor-data", getSensorData);

// GET /api/sensors/latest
router.get("/latest", getLatestSensor);

export default router;
