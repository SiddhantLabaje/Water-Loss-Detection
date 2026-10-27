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

// THE KEY QUESTION: what is the actual collection name for ML predictions?
const mlPredCount = await db.collection("ml_predictions").countDocuments();
const mlPredCountWrong = await db.collection("mlpredictions").countDocuments();
console.log("ml_predictions (correct name):", mlPredCount);
console.log("mlpredictions (wrong name):", mlPredCountWrong);

// Show all fields from ml_predictions
if (mlPredCount > 0) {
  const sample = await db.collection("ml_predictions").findOne({}, { sort: { _id: -1 } });
  console.log("\nLatest ml_prediction fields:", Object.keys(sample));
  console.log("overallSystemStatus:", sample.overallSystemStatus);
  console.log("mlPredictionData:", sample.mlPredictionData);
  console.log("mlSeverity:", sample.mlSeverity);
  console.log("mlProcessedAt:", sample.mlProcessedAt);
  console.log("waterLossRate:", sample.waterLossRate);
}

// Count critical+leak in ml_predictions
const critLeaks = await db.collection("ml_predictions").countDocuments({
  overallSystemStatus: "CRITICAL",
  mlPredictionData: 1
});
console.log(`\nCRITICAL + mlPredictionData=1 in ml_predictions: ${critLeaks}`);

// Count all by status in ml_predictions
const byStatus = await db.collection("ml_predictions").aggregate([
  { $group: { _id: "$overallSystemStatus", count: { $sum: 1 } } }
]).toArray();
console.log("\nml_predictions by overallSystemStatus:");
byStatus.forEach(s => console.log(` "${s._id}": ${s.count}`));

// The broadcaster service polls for predictions using Mongoose model
// MlPrediction.find({ _id: { $gt: lastSeenId } }) — this queries "ml_predictions"
// But the leak event predictionRef points to id: 6adc108f041b832c079cd051
// Let's check if that prediction still exists
const leakRef = await db.collection("ml_predictions").findOne({ _id: new mongoose.Types.ObjectId("6adc108f041b832c079cd051") });
console.log("\nPrediction referenced by existing leak event:", leakRef ? "EXISTS" : "NOT FOUND");

// Count ml_predictions total and recent
const total = await db.collection("ml_predictions").countDocuments();
const recent = await db.collection("ml_predictions").find({}).sort({ _id: -1 }).limit(3).toArray();
console.log(`\nTotal ml_predictions: ${total}`);
console.log("3 most recent IDs + statuses:");
recent.forEach(p => console.log(` _id=${p._id} status=${p.overallSystemStatus} leak=${p.mlPredictionData} ts=${p.mlProcessedAt}`));

// Check if broadcaster has seen these via lastSeenId — 
// It tracks lastSeenId, so new predictions after server restart would be picked up
// But: does the broadcaster call isCriticalLeakAlert which needs severity to be uppercase?
const severities = await db.collection("ml_predictions").aggregate([
  { $group: { _id: "$mlSeverity", count: { $sum: 1 } } }
]).toArray();
console.log("\nmlSeverity values in ml_predictions:");
severities.forEach(s => console.log(` "${s._id}": ${s.count}`));

await mongoose.disconnect();
