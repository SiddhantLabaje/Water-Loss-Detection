import { dateWiseData, latestData, historyData } from "../controllers/dashboard.controller.js";
import {Router} from "express";
const router=Router();

router.route("/cleaned-sensor-data").get(dateWiseData);
router.route("/latest-analytics").get(latestData);
router.route("/analytics-history").get(historyData);

export default router