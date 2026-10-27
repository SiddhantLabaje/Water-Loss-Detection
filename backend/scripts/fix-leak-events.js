/**
 * fix-leak-events.js
 *
 * Reprocesses ALL ml_predictions to create any missing leak events.
 * This is a one-time catch-up script — the broadcaster does this automatically
 * going forward, but we need to run it once to fix the current gap.
 *
 * Run from backend/:  node scripts/fix-leak-events.js
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

// Import models
const { default: MlPrediction } = await import("../models/mlPrediction.model.js");
const { default: LeakEvent }    = await import("../models/leakEvent.model.js");

// Import service
const { 
  isCriticalLeakPrediction,
  isCriticalLeakAlert,
  createCriticalLeakEvent,
} = await import("../services/criticalLeak.service.js");

console.log("\n=== Fix-leak-events catch-up script ===\n");

// Get ALL predictions in chronological order
const allPredictions = await MlPrediction.find({})
  .sort({ _id: 1 })
  .lean();

console.log(`Processing ${allPredictions.length} predictions in chronological order...`);

let previousCriticalLeak = false;
let created = 0;
let skipped = 0;

for (const prediction of allPredictions) {
  const isCritical = isCriticalLeakPrediction(prediction);
  
  if (isCriticalLeakAlert(prediction, previousCriticalLeak)) {
    // New critical leak transition — create incident
    try {
      const leak = await createCriticalLeakEvent(prediction);
      // Check if it was newly created or already existed
      const age = Date.now() - new Date(leak.createdAt).getTime();
      if (age < 5000) { // created in last 5 seconds = new
        console.log(`  ✓ Created incident ${leak.incidentId} from prediction ${prediction._id}`);
        created++;
      } else {
        skipped++;
      }
    } catch (err) {
      console.error(`  ✗ Failed for prediction ${prediction._id}: ${err.message}`);
    }
  }
  
  previousCriticalLeak = isCritical;
}

const totalLeaks = await LeakEvent.countDocuments();
const openLeaks  = await LeakEvent.countDocuments({ status: "OPEN_FOR_PROPOSALS" });

console.log(`\n=== Results ===`);
console.log(`Incidents created: ${created}`);
console.log(`Already existed (skipped): ${skipped}`);
console.log(`Total leak events now: ${totalLeaks}`);
console.log(`Open for proposals: ${openLeaks}`);

if (openLeaks > 0) {
  const open = await LeakEvent.find({ status: "OPEN_FOR_PROPOSALS" })
    .sort({ createdAt: -1 })
    .lean();
  console.log("\nOpen incidents:");
  open.forEach(l => console.log(`  ${l.incidentId} | ${l.severity} | ${l.sensorSnapshot?.waterLossRate ?? "?"}L/hr | created ${l.createdAt}`));
}

await mongoose.disconnect();
console.log("\nDone.");
