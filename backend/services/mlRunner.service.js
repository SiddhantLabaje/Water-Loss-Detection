/**
 * mlRunner.service.js
 *
 * Spawns the Python ML worker (ai-smart-water-ml/ml_worker.py) on a
 * regular interval so the Node.js web service is the ONLY deployed
 * service — no separate background worker needed.
 *
 * The Python script:
 *  - reads unprocessed sensor records from MongoDB
 *  - runs the full ML pipeline (leak detection, anomaly, water loss, etc.)
 *  - writes results to ml_predictions
 *  - prints a JSON summary to stdout and exits
 *
 * This service just schedules and launches that script.
 */

import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// Path to the Python worker script (relative to this file: backend/services/ → ../../ai-smart-water-ml/)
const ML_WORKER_DIR    = path.join(__dirname, "..", "..", "ai-smart-water-ml");
const ML_WORKER_SCRIPT = path.join(ML_WORKER_DIR, "ml_worker.py");

// How often to run the ML pipeline (ms). Default: 15 seconds.
const RUN_INTERVAL_MS = parseInt(process.env.ML_RUN_INTERVAL_MS || "15000");

// Which Python executable to use. "python3" on Linux/Render, "python" on Windows.
const PYTHON_BIN = process.env.PYTHON_BIN || (process.platform === "win32" ? "python" : "python3");

let isRunning = false;

/**
 * Spawn the Python ML worker as a child process.
 * Logs its JSON output. Ignores concurrent calls (non-reentrant).
 */
function runMlWorker() {
  if (isRunning) {
    console.log("[ML] Previous run still in progress — skipping this cycle.");
    return;
  }

  isRunning = true;

  const child = spawn(PYTHON_BIN, [ML_WORKER_SCRIPT], {
    cwd: ML_WORKER_DIR,
    env: {
      ...process.env,
      // Pass required env vars explicitly so the Python script picks them up
      MONGO_URI:                    process.env.MONGO_URI,
      MONGO_DATABASE:               process.env.MONGO_DATABASE               || "water_loss_detection",
      MONGO_COLLECTION:             process.env.MONGO_COLLECTION             || "sensors",
      PREDICTION_INTERVAL_SECONDS:  process.env.PREDICTION_INTERVAL_SECONDS  || "10",
      SEVERITY_LOW_MAX:             process.env.SEVERITY_LOW_MAX             || "0.50",
      SEVERITY_MEDIUM_MAX:          process.env.SEVERITY_MEDIUM_MAX          || "0.80",
      TURBIDITY_GOOD_MAX:           process.env.TURBIDITY_GOOD_MAX           || "30",
      TURBIDITY_MODERATE_MAX:       process.env.TURBIDITY_MODERATE_MAX       || "60",
    },
    // Capture stdout/stderr instead of inheriting them
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";

  child.stdout.on("data", (d) => { stdout += d.toString(); });
  child.stderr.on("data", (d) => { stderr += d.toString(); });

  child.on("close", (code) => {
    isRunning = false;

    if (code === 0) {
      // Parse the JSON summary printed by ml_worker.py
      try {
        const result = JSON.parse(stdout.trim());
        if (result.processed > 0 || result.errors > 0) {
          console.log(
            `[ML] Processed ${result.processed} record(s)` +
            (result.errors  > 0 ? `, ${result.errors} error(s)` : "") +
            (result.skipped > 0 ? `, ${result.skipped} skipped` : "")
          );
        }
        // Silently ignore "no new sensor records" (expected most of the time)
      } catch {
        if (stdout.trim()) console.log("[ML] Worker output:", stdout.trim());
      }
    } else {
      console.error(`[ML] Worker exited with code ${code}.`);
      if (stderr.trim()) console.error("[ML] stderr:", stderr.trim());
      if (stdout.trim()) console.error("[ML] stdout:", stdout.trim());
    }
  });

  child.on("error", (err) => {
    isRunning = false;
    if (err.code === "ENOENT") {
      console.error(
        `[ML] Python not found at "${PYTHON_BIN}". ` +
        `Set PYTHON_BIN env var to the correct python executable path.`
      );
    } else {
      console.error("[ML] Failed to start worker:", err.message);
    }
  });
}

/**
 * Start the ML runner. Called once on server startup.
 */
export function startMlRunner() {
  // Run once immediately on startup (process any backlog)
  runMlWorker();

  // Then on a fixed interval
  setInterval(runMlWorker, RUN_INTERVAL_MS);

  console.log(`[ML] Runner started — spawning Python worker every ${RUN_INTERVAL_MS / 1000}s.`);
  console.log(`[ML] Python: ${PYTHON_BIN}  Script: ${ML_WORKER_SCRIPT}`);
}
