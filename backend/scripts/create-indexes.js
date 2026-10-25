import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import "../models/auditLog.model.js";
import "../models/dashboardAnalytics.model.js";
import "../models/leakEvent.model.js";
import "../models/mlPrediction.model.js";
import "../models/notification.model.js";
import "../models/notificationSettings.model.js";
import "../models/plumberProfile.model.js";
import "../models/repairAssignment.model.js";
import "../models/repairProposal.model.js";
import "../models/repairRecord.model.js";
import "../models/sensor.model.js";
import "../models/user.model.js";

async function createIndexes() {
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is required.");
  await mongoose.connect(process.env.MONGO_URI);
  for (const modelName of mongoose.modelNames()) {
    await mongoose.model(modelName).createIndexes();
    console.log(`Indexes ensured for ${modelName}.`);
  }
}

createIndexes()
  .catch((err) => {
    console.error("Index initialization failed:", err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
