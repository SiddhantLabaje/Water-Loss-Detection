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
const frontendRoot  = path.join(__dirname, "..", "frontend");
const frontendPages = path.join(frontendRoot, "pages");

// Serve shared assets (shared.css, live.js, stream.js) from frontend/
app.use(express.static(frontendRoot));

// Serve HTML pages directly from frontend/pages/
// e.g. /sensors.html  → frontend/pages/sensors.html
//      /index.html    → frontend/pages/index.html
app.use(express.static(frontendPages));

// Root "/" → dashboard
app.get("/", (_req, res) => {
  res.sendFile(path.join(frontendPages, "index.html"));
});

// Any other non-API, non-file route → 404 (don't silently redirect to dashboard)
app.use((req, res, next) => {
  if (req.path.startsWith("/api")) return next();
  res.status(404).sendFile(path.join(frontendPages, "index.html"));
});

export default app;
