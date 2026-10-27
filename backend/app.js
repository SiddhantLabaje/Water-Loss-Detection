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
// These were used for the old HTML page server-side auth guards.
// Kept in case middleware is needed elsewhere; unused now that React SPA handles routing.
// eslint-disable-next-line no-unused-vars
import {
  authenticatePage,
  requireAdmin,
  requireMonitoringAccess,
  requirePlumber,
} from "./middleware/auth.middleware.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app = express();

app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));

// CORS: in production restrict to WEB_ORIGINS (comma-separated list).
// In dev (no WEB_ORIGINS set) allow all origins for convenience.
const _rawOrigins = process.env.WEB_ORIGINS;
const _corsOrigin = _rawOrigins
  ? _rawOrigins.split(",").map((o) => o.trim()).filter(Boolean)
  : true;
app.use(cors({ credentials: true, origin: _corsOrigin }));
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
// Sensor, ML, and dashboard data requires an approved plumber or administrator.
app.use("/api/sensors",          sensorRoutes);
app.use("/api/ml-predictions",   mlPredictionRoutes);
app.use("/api/dashboard",        dashboardRoutes);
app.use("/api/stream",           streamRoute);
app.use("/api/notifications",    notificationRoutes);

// ── Health check ──────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ── Serve React SPA (Vite build output: frontend/dist) ───────────────────
// Page-level auth is now handled client-side by React Router.
// The backend only protects /api routes.
const frontendDist = path.join(__dirname, "..", "frontend", "dist");

// Static assets (hashed JS/CSS bundles, images, fonts)
app.use(express.static(frontendDist));

// SPA catch-all — serve index.html for every non-API GET so React Router works
app.get("/{*path}", (req, res, next) => {
  if (req.path.startsWith("/api")) return next();
  const index = path.join(frontendDist, "index.html");
  res.sendFile(index, (err) => {
    if (err) {
      res.status(503).send(
        "Frontend not built yet.\nRun:  cd frontend && npm install && npm run build"
      );
    }
  });
});

app.use((err, _req, res, _next) => {
  console.error("Request failed:", err.message);
  if (res.headersSent) return;
  res.status(err.status || 500).json({
    message: err.status ? err.message : "An unexpected server error occurred.",
  });
});

export default app;
