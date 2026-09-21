/**
 * GET /api/stream
 *
 * Server-Sent Events endpoint.
 * Clients connect once and immediately receive a full snapshot,
 * then get pushed updates automatically whenever new ML predictions arrive.
 *
 * Events:
 *   connected  – handshake confirmation
 *   snapshot   – full dashboard data object (latest, stats, alerts, history, analytics)
 */

import { Router }              from 'express';
import { addClient }           from '../services/sse.service.js';
import { getInitialSnapshot }  from '../services/broadcaster.service.js';

const router = Router();

router.get('/', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Register client — sets SSE headers and keeps connection open
  addClient(res);

  // Immediately fire a "connected" handshake
  res.write(`event: connected\ndata: ${JSON.stringify({ ok: true })}\n\n`);

  // Immediately send the current snapshot so the UI populates instantly
  const snapshot = await getInitialSnapshot();
  if (snapshot) {
    res.write(`event: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`);
  }
});

export default router;
