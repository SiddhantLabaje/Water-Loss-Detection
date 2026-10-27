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

const total  = await db.collection("ml_predictions").countDocuments();
const crit   = await db.collection("ml_predictions").countDocuments({ overallSystemStatus: "CRITICAL", mlPredictionData: 1 });
const leaks  = await db.collection("leak_events").countDocuments();
const open   = await db.collection("leak_events").countDocuments({ status: "OPEN_FOR_PROPOSALS" });
const latest = await db.collection("ml_predictions").findOne({}, { sort: { _id: -1 } });

console.log(`ml_predictions total: ${total}`);
console.log(`CRITICAL + leak: ${crit}`);
console.log(`leak_events: ${leaks}, OPEN_FOR_PROPOSALS: ${open}`);
console.log("Latest prediction:", JSON.stringify({
  overallSystemStatus: latest?.overallSystemStatus,
  mlPredictionData: latest?.mlPredictionData,
  mlSeverity: latest?.mlSeverity,
  waterLossRate: latest?.waterLossRate,
  mlProbability: latest?.mlProbability,
}));

// Show breakdown of statuses
const byStatus = await db.collection("ml_predictions").aggregate([
  { $group: { _id: "$overallSystemStatus", count: { $sum: 1 } } }
]).toArray();
console.log("\nPredictions by status:", JSON.stringify(byStatus));

const bySeverity = await db.collection("ml_predictions").aggregate([
  { $group: { _id: "$mlSeverity", count: { $sum: 1 } } }
]).toArray();
console.log("Predictions by severity:", JSON.stringify(bySeverity));

// Check criticalLeak service isCriticalLeakAlert logic
// It needs: overallSystemStatus === "CRITICAL" AND mlPredictionData === 1
// Check a sample CRITICAL one
if (crit > 0) {
  const critSample = await db.collection("ml_predictions").findOne({ overallSystemStatus: "CRITICAL", mlPredictionData: 1 });
  console.log("\nSample CRITICAL+leak prediction:", JSON.stringify(critSample, null, 2));
}

await mongoose.disconnect();
