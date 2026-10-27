/**
 * Test that ensureCurrentCriticalLeakIncident correctly handles
 * the case where a new critical prediction arrives after a server restart.
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";
import mongoose from "mongoose";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootEnv = path.join(__dirname, "..", "..", ".env");
const localEnv = path.join(__dirname, "..", ".env");
dotenv.config({ path: existsSync(localEnv) ? localEnv : rootEnv });

await mongoose.connect(process.env.MONGO_URI);

const { default: LeakEvent }    = await import("../models/leakEvent.model.js");
const { default: MlPrediction } = await import("../models/mlPrediction.model.js");
const { ensureCurrentCriticalLeakIncident, isCriticalLeakPrediction } = await import("../services/criticalLeak.service.js");

console.log("=== Real-time incident test ===\n");

const mlTotal   = await MlPrediction.countDocuments();
const leakTotal = await LeakEvent.countDocuments();
const openTotal = await LeakEvent.countDocuments({ status: "OPEN_FOR_PROPOSALS" });

console.log(`ml_predictions: ${mlTotal}`);
console.log(`leak_events: ${leakTotal}, open: ${openTotal}`);

const latest = await MlPrediction.findOne().sort({ _id: -1 }).lean();
console.log(`\nLatest prediction: status=${latest?.overallSystemStatus} leak=${latest?.mlPredictionData}`);
console.log(`Is CRITICAL: ${isCriticalLeakPrediction(latest)}`);

// Test ensureCurrentCriticalLeakIncident
console.log("\nRunning ensureCurrentCriticalLeakIncident()...");
const result = await ensureCurrentCriticalLeakIncident();
if (result) {
  console.log(`→ Incident ensured: ${result.incidentId} | status=${result.status}`);
} else {
  console.log("→ No action needed (system not in critical state)");
}

// Final state
const openFinal = await LeakEvent.countDocuments({ status: "OPEN_FOR_PROPOSALS" });
console.log(`\nFinal open incidents: ${openFinal}`);

const allOpen = await LeakEvent.find({ status: "OPEN_FOR_PROPOSALS" })
  .sort({ createdAt: -1 })
  .lean();
console.log("Open incidents (newest first):");
allOpen.forEach(l => console.log(
  `  ${l.incidentId} | ${l.severity} | loss=${l.sensorSnapshot?.waterLossRate ?? "?"}L/hr | ${l.createdAt}`
));

await mongoose.disconnect();
