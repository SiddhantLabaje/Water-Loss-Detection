/**
 * Comprehensive root-cause diagnostic for the
 * "critical leak visible in Live Monitoring but NOT in Admin → Leak Incidents" bug.
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
const db = mongoose.connection.db;

console.log("\n=== SENSORS (has predictionData from ThingSpeak) ===");
const sensorCount = await db.collection("sensors").countDocuments();
const sensorLeaks = await db.collection("sensors").countDocuments({ predictionData: 1 });
const latestSensor = await db.collection("sensors").findOne({}, { sort: { _id: -1 } });
console.log(`Total sensors: ${sensorCount}, with predictionData=1: ${sensorLeaks}`);
console.log("Latest sensor:", JSON.stringify(latestSensor));

console.log("\n=== ML PREDICTIONS (should be written by Python worker) ===");
const mlCount = await db.collection("ml_predictions").countDocuments();
console.log(`Total ml_predictions: ${mlCount}`);
if (mlCount > 0) {
  const latest = await db.collection("ml_predictions").findOne({}, { sort: { _id: -1 } });
  console.log("Latest:", JSON.stringify(latest, null, 2));
}

console.log("\n=== ROOT CAUSE ANALYSIS ===");
if (mlCount === 0 && sensorCount > 0) {
  console.log("✗ CONFIRMED: ml_predictions collection is EMPTY but sensors has data.");
  console.log("  The Python ML worker has never run or is writing to the wrong DB/collection.");
  console.log("  The broadcaster polls ml_predictions — nothing to detect → no leak events created.");
  console.log("");
  console.log("  WHY Live Monitoring shows data:");
  console.log("  The MonitoringPage reads /api/ml-predictions/stats which returns 0s.");
  console.log("  BUT the screenshot shows 105 predictions → there must be a different env/db.");
}

// Check if this is the deployed DB vs local DB
console.log("\n=== ENV ===");
console.log("MONGO_URI:", process.env.MONGO_URI?.replace(/\/\/[^:]+:[^@]+@/, "//****:****@"));
console.log("MONGO_DATABASE:", process.env.MONGO_DATABASE);

// Check notification settings (was the owner email saved?)
const ns = await db.collection("notification_settings").findOne({});
console.log("\n=== NOTIFICATION SETTINGS ===");
console.log(JSON.stringify(ns));

// Check the existing leak event - was it created by the ml_worker somehow?
const leak = await db.collection("leak_events").findOne({}, { sort: { _id: -1 } });
console.log("\n=== EXISTING LEAK EVENT ===");
console.log(JSON.stringify(leak, null, 2));

// Now: can we manually trigger the ml_worker to process existing sensors?
// Check if the python ml_worker script exists and what models are available
import { existsSync as fe } from "fs";
const mlWorkerPath = path.join(__dirname, "..", "..", "ai-smart-water-ml", "ml_worker.py");
console.log("\n=== ML WORKER ===");
console.log("ml_worker.py exists:", fe(mlWorkerPath));

const modelPaths = [
  "ai-smart-water-ml/models/leak_detection/current_model.pkl",
  "ai-smart-water-ml/models/anomaly_detection/flow_model.pkl",
  "ai-smart-water-ml/models/water_loss/current_model.pkl",
].map(p => path.join(__dirname, "..", "..", p));
for (const mp of modelPaths) {
  console.log(`${path.basename(mp)}: ${fe(mp) ? "EXISTS" : "MISSING"}`);
}

await mongoose.disconnect();
