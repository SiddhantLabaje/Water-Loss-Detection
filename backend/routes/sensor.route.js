import {Router} from "express";
import getSensorData from "../controllers/sensor.controller.js";
const router=Router();

router.route("/sensor-data").post(getSensorData);



export default router