import { dateWiseData, latestData, historyData } from "../controllers/dashboard.controller.js";
import {Router} from "express";
import { authenticate, requireMonitoringAccess } from "../middleware/auth.middleware.js";
const router=Router();

router.use(authenticate, requireMonitoringAccess);
router.route("/cleaned-sensor-data").get(dateWiseData);
router.route("/latest-analytics").get(latestData);
router.route("/analytics-history").get(historyData);

export default router