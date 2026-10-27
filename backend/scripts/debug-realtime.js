/**
 * Real-time diagnostic: why does the new critical alert NOT create a new incident?
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

const mlTotal = await db.collection("ml_predictions").countDocuments();
const leakTotal = await db.collection("leak_events").countDocuments();
const openTotal = await db.collection("leak_events").countDocuments({ status: "OPEN_FOR_PROPOSALS" });

console.log(`ml_predictions: ${mlTotal} | leak_events: ${leakTotal} | open: ${openTotal}`);

// Get the latest 5 ml_predictions in order
const latest5 = await db.collection("ml_predictions")
  .find({}).sort({ _id: -1 }).limit(5).toArray();

console.log("\nLatest 5 ml_predictions (newest first):");
latest5.forEach((p, i) => console.log(
  `  [${i}] _id=${p._id} status=${p.overallSystemStatus} leak=${p.mlPredictionData} severity=${p.mlSeverity} ts=${p.mlProcessedAt}`
));

// Get the latest 3 leak_events
const latestLeaks = await db.collection("leak_events")
  .find({}).sort({ _id: -1 }).limit(3).toArray();

console.log("\nLatest 3 leak_events:");
latestLeaks.forEach((l, i) => console.log(
  `  [${i}] ${l.incidentId} | ${l.status} | critRef=${l.criticalAlertRef} | created=${l.createdAt}`
));

// KEY CHECK: Is the newest prediction already linked to a leak event?
if (latest5.length > 0) {
  const newest = latest5[0];
  const linked = await db.collection("leak_events").findOne({
    $or: [
      { criticalAlertRef: newest._id },
      { predictionRef:   newest._id },
    ]
  });
  console.log(`\nNewest prediction linked to leak? ${linked ? "YES → " + linked.incidentId : "NO"}`);

  // Check if there's a continuous critical block ending at the newest
  // The broadcaster uses lastCriticalLeak state — let's simulate it
  const allPreds = await db.collection("ml_predictions")
    .find({}).sort({ _id: 1 }).toArray();

  let prevCrit = false;
  let transitions = [];
  for (const p of allPreds) {
    const isCrit = p.overallSystemStatus === "CRITICAL" && p.mlPredictionData === 1;
    if (isCrit && !prevCrit) {
      transitions.push({ type: "START", id: p._id, ts: p.mlProcessedAt });
    } else if (!isCrit && prevCrit) {
      transitions.push({ type: "END", id: p._id, ts: p.mlProcessedAt });
    }
    prevCrit = isCrit;
  }
  console.log(`\nCritical→NonCritical transition count: ${transitions.length}`);
  console.log("Last 6 transitions:");
  transitions.slice(-6).forEach(t => console.log(`  ${t.type} id=${t.id} ts=${t.ts}`));

  // Is the very last prediction in a "continuing" critical block (no transition needed)?
  const lastPred = allPreds[allPreds.length - 1];
  const lastIsCrit = lastPred?.overallSystemStatus === "CRITICAL" && lastPred?.mlPredictionData === 1;
  console.log(`\nLast prediction is CRITICAL: ${lastIsCrit}`);

  // Count how many predictions form the current continuous critical block
  let block = 0;
  for (let i = allPreds.length - 1; i >= 0; i--) {
    const p = allPreds[i];
    if (p.overallSystemStatus === "CRITICAL" && p.mlPredictionData === 1) block++;
    else break;
  }
  console.log(`Current continuous critical block length: ${block} predictions`);
  console.log("→ The broadcaster only creates ONE incident per block, not one per prediction.");
  console.log("→ If the block has been continuous since the last incident was created,");
  console.log("  no new incident is needed — the existing one should be OPEN_FOR_PROPOSALS.");

  // What's the latest leak event's criticalAlertRef?
  const latestLeak = latestLeaks[0];
  if (latestLeak) {
    const refPred = await db.collection("ml_predictions").findOne({ _id: latestLeak.criticalAlertRef });
    console.log(`\nLatest leak event: ${latestLeak.incidentId}`);
    console.log(`  criticalAlertRef prediction ts: ${refPred?.mlProcessedAt}`);
    console.log(`  leak status: ${latestLeak.status}`);

    // Is there any NORMAL/non-critical prediction AFTER the latest leak event was created?
    const afterLeak = await db.collection("ml_predictions").find({
      _id: { $gt: latestLeak.criticalAlertRef },
      $or: [
        { overallSystemStatus: { $ne: "CRITICAL" } },
        { mlPredictionData: { $ne: 1 } },
      ]
    }).sort({ _id: 1 }).limit(1).toArray();

    if (afterLeak.length > 0) {
      console.log(`  Normal/non-leak prediction AFTER incident: ${afterLeak[0]._id} status=${afterLeak[0].overallSystemStatus}`);
      console.log("  → A new critical block started AFTER a normal reading → new incident SHOULD be created.");
    } else {
      console.log("  No normal readings after last incident — still in the same continuous critical block.");
      console.log("  → Correct behaviour: same incident. Problem is it should be visible in admin.");
    }
  }
}

await mongoose.disconnect();
