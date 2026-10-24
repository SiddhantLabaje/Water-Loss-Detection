import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import dashboardRoutes     from "./routes/dashboard.route.js";
import sensorRoutes        from "./routes/sensor.route.js";
import mlPredictionRoutes  from "./routes/mlPrediction.route.js";
import streamRoute         from "./routes/stream.route.js";
import emailRoutes         from "./routes/email.route.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app = express();

app.use(cors());
app.use(express.json());

// ── API Routes ────────────────────────────────────────────────────────────
app.use("/api/sensors",         sensorRoutes);
app.use("/api/ml-predictions",  mlPredictionRoutes);
app.use("/api/dashboard",       dashboardRoutes);
app.use("/api/stream",          streamRoute);
app.use("/api/email",           emailRoutes);

// ── Health check ──────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ── Serve frontend static files ───────────────────────────────────────────
// The frontend folder sits one level above the backend folder.
const frontendPath = path.join(__dirname, "..", "frontend");
app.use(express.static(frontendPath));

// Serve index.html for the root and any unmatched routes (SPA fallback)
app.get("/", (_req, res) => {
  res.sendFile(path.join(frontendPath, "pages", "index.html"));
});

app.get("*", (req, res) => {
  // Only fall back to index for non-API routes
  if (!req.path.startsWith("/api")) {
    res.sendFile(path.join(frontendPath, "pages", "index.html"));
  }
});

export default app;
