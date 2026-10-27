// debug-leaks.js — run from backend/ with: node scripts/debug-leaks.js
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

console.log("\n============================================================");
console.log("DB DIAGNOSTIC — LEAK EVENTS vs ML PREDICTIONS");
console.log("============================================================\n");

// 1. All leak events
const leaks = await db.collection("leak_events").find({}).sort({ _id: -1 }).toArray();
console.log(`LEAK EVENTS total: ${leaks.length}`);
leaks.forEach(l =>
  console.log(`  [${l.status}] ${l.incidentId} sev=${l.severity} created=${l.createdAt}`)
);

// 2. Breakdown by status
const statuses = await db.collection("leak_events").aggregate([
  { $group: { _id: "$status", count: { $sum: 1 } } }
]).toArray();
console.log("\nLeak events by STATUS:");
statuses.forEach(s => console.log(`  ${s._id}: ${s.count}`));

// 3. Critical ML predictions
const critCount = await db.collection("mlpredictions").countDocuments({
  overallSystemStatus: "CRITICAL", mlPredictionData: 1
});
console.log(`\nML PREDICTIONS — CRITICAL+leak: ${critCount}`);

const recentCrit = await db.collection("mlpredictions")
  .find({ overallSystemStatus: "CRITICAL", mlPredictionData: 1 })
  .sort({ _id: -1 }).limit(5).toArray();
recentCrit.forEach(p =>
  console.log(`  _id=${p._id} severity=${p.mlSeverity} created=${p.createdAt || p.mlProcessedAt}`)
);

// 4. Check if any prediction is already linked to a leak event
if (recentCrit.length > 0) {
  const linked = await db.collection("leak_events").find({
    $or: [
      { criticalAlertRef: recentCrit[0]._id },
      { predictionRef: recentCrit[0]._id },
    ]
  }).toArray();
  console.log(`\nLatest critical prediction linked to ${linked.length} leak event(s)`);
}

// 5. Check mlSeverity values to see if they match enum
const severities = await db.collection("mlpredictions").aggregate([
  { $group: { _id: "$mlSeverity", count: { $sum: 1 } } }
]).toArray();
console.log("\nML prediction mlSeverity values in DB:");
severities.forEach(s => console.log(`  "${s._id}": ${s.count}`));

// 6. Check what overallSystemStatus values exist
const systemStatuses = await db.collection("mlpredictions").aggregate([
  { $group: { _id: "$overallSystemStatus", count: { $sum: 1 } } }
]).toArray();
console.log("\nML prediction overallSystemStatus values in DB:");
systemStatuses.forEach(s => console.log(`  "${s._id}": ${s.count}`));

// 7. Check if notifications were created
const notifs = await db.collection("notifications").find({}).sort({ _id: -1 }).limit(5).toArray();
console.log(`\nNOTIFICATIONS total: ${await db.collection("notifications").countDocuments()}`);
notifs.forEach(n => console.log(`  type=${n.type} status=${n.status} dedupeKey=${n.dedupeKey}`));

// 8. Raw sample of a critical prediction to see all field names
if (recentCrit.length > 0) {
  console.log("\nRAW sample critical prediction (field names):");
  console.log(JSON.stringify(recentCrit[0], null, 2));
}

await mongoose.disconnect();
