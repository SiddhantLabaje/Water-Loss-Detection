import dotenv from "dotenv";
dotenv.config();

import connectDatabase from "./config/db.js";
import app from "./app.js";
import { startBroadcaster } from "./services/broadcaster.service.js";

const PORT = process.env.PORT || 5000;

async function startServer() {
  // JWT_SECRET must be set — warn clearly but don't crash so Render deploy succeeds
  // Add JWT_SECRET to your Render environment variables
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    console.warn(
      "[WARN] JWT_SECRET is not set or too short. " +
      "Auth endpoints will not work. Add JWT_SECRET to your environment variables."
    );
  }

  await connectDatabase();

  await import("./services/cronJob.service.js");
  await import("./services/keepAlive.service.js");
  await startBroadcaster();

  app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Server startup failed:", err);
  process.exitCode = 1;
});