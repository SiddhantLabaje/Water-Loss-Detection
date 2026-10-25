import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// Load .env: prefer backend/.env (service-specific overrides),
// fall back to the single shared .env at the repo root.
const localEnv = path.join(__dirname, ".env");
const rootEnv  = path.join(__dirname, "..", ".env");
dotenv.config({ path: existsSync(localEnv) ? localEnv : rootEnv });

import connectDatabase from "./config/db.js";
import app from "./app.js";
import { startBroadcaster } from "./services/broadcaster.service.js";

const PORT = process.env.PORT || 5000;

async function startServer() {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    console.warn(
      "[WARN] JWT_SECRET is not set or too short. " +
        "Auth endpoints will not work. Set JWT_SECRET in your .env file.\n" +
        '  Generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"'
    );
  }

  await connectDatabase();

  await import("./services/cronJob.service.js");
  await import("./services/keepAlive.service.js");
  await startBroadcaster();

  app.listen(PORT, () => {
    console.log(`Server running → http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Server startup failed:", err);
  process.exitCode = 1;
});
