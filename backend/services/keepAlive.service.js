/**
 * keepAlive.service.js
 *
 * Pings the app's own /api/health endpoint every 10 minutes so Render's
 * free tier doesn't spin the server down after 15 minutes of inactivity.
 *
 * Only runs in production (NODE_ENV === 'production').
 */

import https from "https";
import http  from "http";

const INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

function ping() {
  const url = process.env.RENDER_EXTERNAL_URL || process.env.APP_URL;
  if (!url) return; // no URL configured — skip

  const target = `${url}/api/health`;
  const mod    = target.startsWith("https") ? https : http;

  mod.get(target, (res) => {
    console.log(`[KeepAlive] Pinged ${target} → ${res.statusCode}`);
  }).on("error", (err) => {
    console.warn(`[KeepAlive] Ping failed: ${err.message}`);
  });
}

if (process.env.NODE_ENV === "production") {
  // First ping after 5 min (give server time to fully start)
  setTimeout(ping, 5 * 60 * 1000);
  setInterval(ping, INTERVAL_MS);
  console.log("KeepAlive service started — pinging every 10 minutes.");
}
