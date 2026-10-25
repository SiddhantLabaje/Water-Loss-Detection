import dotenv from "dotenv";
dotenv.config();

import connectDatabase from "./config/db.js";
import app from "./app.js";

import { startBroadcaster } from "./services/broadcaster.service.js";

const PORT = process.env.PORT || 5000;

async function startServer() {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32 ||
      process.env.JWT_SECRET.toLowerCase().includes("replace_with")) {
    throw new Error("JWT_SECRET must be configured with at least 32 characters.");
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is listening on port ${PORT}`);
  });

  try {
    await connectDatabase();
    await import("./services/cronJob.service.js");
    await import("./services/keepAlive.service.js");
    await startBroadcaster();
  } catch (err) {
    server.close();
    throw err;
  }
}

startServer().catch((err) => {
  console.error("Server startup failed:", err);
  process.exitCode = 1;
});