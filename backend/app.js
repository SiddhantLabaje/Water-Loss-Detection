import express from "express";
import cors from "cors";
import dashboardRoutes     from "./routes/dashboard.route.js";
import sensorRoutes        from "./routes/sensor.route.js";
import mlPredictionRoutes  from "./routes/mlPrediction.route.js";
import streamRoute         from "./routes/stream.route.js";

const app = express();

app.use(cors());
app.use(express.json());

// ── Routes ────────────────────────────────────────────────────────────────
// Raw sensor data (inserted from ThingSpeak via cron job)
app.use("/api/sensors", sensorRoutes);

// ML prediction results (written by Python pipeline)
app.use("/api/ml-predictions", mlPredictionRoutes);

// Legacy dashboard analytics (DashboardAnalytics collection)
app.use("/api/dashboard", dashboardRoutes);

// Server-Sent Events — real-time push stream for the frontend
app.use("/api/stream", streamRoute);

// ── Health check ──────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

export default app;
