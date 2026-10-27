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

// Show ALL collections in the DB
const cols = await db.listCollections().toArray();
console.log("ALL COLLECTIONS IN DB:");
cols.forEach(c => console.log(" ", c.name));

// Show all data in mlpredictions
const count = await db.collection("mlpredictions").countDocuments();
console.log(`\nmlpredictions total: ${count}`);
if (count > 0) {
  const sample = await db.collection("mlpredictions").findOne({}, { sort: { _id: -1 } });
  console.log("Latest mlprediction sample:");
  console.log(JSON.stringify(sample, null, 2));
}

// Check for sensors collection
const sensors = await db.collection("sensors").countDocuments();
console.log(`\nsensors total: ${sensors}`);
if (sensors > 0) {
  const s = await db.collection("sensors").findOne({}, { sort: { _id: -1 } });
  console.log("Latest sensor sample (field names):", Object.keys(s || {}));
}

// What does the leak event actually look like?
const leak = await db.collection("leak_events").findOne({}, { sort: { _id: -1 } });
console.log("\nLatest leak event:");
console.log(JSON.stringify(leak, null, 2));

// Check the admin listLeaks query — what status filter is used?
const openLeaks = await db.collection("leak_events").find({ status: "OPEN_FOR_PROPOSALS" }).toArray();
console.log(`\nQuery {status:'OPEN_FOR_PROPOSALS'} => ${openLeaks.length} results`);

await mongoose.disconnect();
