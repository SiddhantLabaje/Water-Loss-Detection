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

// List EVERY collection and their document counts
const allCols = await db.listCollections().toArray();
console.log("ALL COLLECTIONS + COUNTS:");
for (const c of allCols) {
  const count = await db.collection(c.name).countDocuments();
  console.log(`  ${c.name}: ${count} docs`);
}

// The existing leak event has predictionRef pointing to some _id
// but ml_predictions collection has 0 docs — so where did predictions come from?
// Check sensors collection
const sensorSample = await db.collection("sensors").findOne({}, { sort: { _id: -1 } });
console.log("\nLatest sensor doc fields:", Object.keys(sensorSample || {}));
console.log("Latest sensor:", sensorSample);

// The live monitoring shows "Predictions: 105" and "84 LEAK EVENTS" -- 
// those must be in a different collection! Let's find it
for (const c of allCols) {
  const sample = await db.collection(c.name).findOne({}, { sort: { _id: -1 } });
  if (sample && (sample.mlPredictionData !== undefined || sample.overallSystemStatus !== undefined)) {
    console.log(`\n*** FOUND ML DATA IN: ${c.name}`);
    console.log("Fields:", Object.keys(sample));
    console.log("Sample:", JSON.stringify(sample, null, 2).slice(0, 500));
  }
}

// Also check what collection the frontend /api/ml-predictions/latest reads from
// by checking the mlPrediction route
await mongoose.disconnect();
