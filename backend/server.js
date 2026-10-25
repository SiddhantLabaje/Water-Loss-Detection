import dotenv from "dotenv";
dotenv.config();

import connectDatabase from "./config/db.js";
import app from "./app.js";

import "./services/cronJob.service.js";
import "./services/keepAlive.service.js";    // prevents Render free-tier sleep
import { startBroadcaster } from "./services/broadcaster.service.js";

const PORT = process.env.PORT || 5000;

async function startServer() {
  await connectDatabase();
  await startBroadcaster();

  app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Server startup failed:", err);
  process.exitCode = 1;
});