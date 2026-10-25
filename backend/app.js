import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import path from "path";
import { fileURLToPath } from "url";

// Existing routes (always present)
import dashboardRoutes    from "./routes/dashboard.route.js";
import sensorRoutes       from "./routes/sensor.route.js";
import mlPredictionRoutes from "./routes/mlPrediction.route.js";
import streamRoute        from "./routes/stream.route.js";
import notificationRoutes from "./routes/notification.route.js";

// New routes (auth / admin / plumber platform)
import authRoutes    from "./routes/auth.route.js";
import adminRoutes   from "./routes/admin.route.js";
import plumberRoutes from "./routes/plumber.route.js";
import repairRoutes  from "./routes/repair.route.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app = express();

app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors({ credentials: true, origin: true })); // allow all origins; tighten in production via WEB_ORIGINS
app.use(express.json({ limit: "32kb" }));
app.use(cookieParser());

// ── API Routes ────────────────────────────────────────────────────────────
// Auth (login, register, password reset, email verify)
app.use("/api/auth",    authRoutes);
// Admin portal
app.use("/api/admin",   adminRoutes);
// Plumber portal
app.use("/api/plumber", plumberRoutes);
// Repair lifecycle
app.use("/api/repairs", repairRoutes);
// Existing sensor/ML/dashboard routes — unchanged
app.use("/api/sensors",          sensorRoutes);
app.use("/api/ml-predictions",   mlPredictionRoutes);
app.use("/api/dashboard",        dashboardRoutes);
app.use("/api/stream",           streamRoute);
app.use("/api/notifications",    notificationRoutes);

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

app.use((err, _req, res, _next) => {
  console.error("Request failed:", err.message);
  if (res.headersSent) return;
  res.status(err.status || 500).json({
    message: err.status ? err.message : "An unexpected server error occurred.",
  });
});

export default app;
