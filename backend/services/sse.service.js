/**
 * Server-Sent Events (SSE) service.
 *
 * Keeps a set of connected client response objects and broadcasts
 * a payload to all of them whenever new data arrives.
 *
 * Usage:
 *   import { addClient, broadcast } from './sse.service.js';
 *
 *   // In a route handler:
 *   addClient(res);
 *
 *   // From anywhere (cron, change-stream, etc.):
 *   broadcast('prediction', payload);
 */

const clients = new Set();

/**
 * Register a new SSE client.
 * Sets the required headers and removes the client on disconnect.
 *
 * @param {import('express').Response} res
 */
export function addClient(res) {
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering if present
  res.flushHeaders();

  // Send an initial keep-alive comment so the browser knows the stream is live
  res.write(': connected\n\n');

  clients.add(res);

  res.on('close', () => {
    clients.delete(res);
  });
}

/**
 * Broadcast a named event + JSON payload to all connected clients.
 *
 * @param {string} event  – SSE event name (e.g. 'prediction', 'stats')
 * @param {object} data   – payload, will be JSON-serialised
 */
export function broadcast(event, data) {
  if (clients.size === 0) return;
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    try { res.write(msg); } catch { clients.delete(res); }
  }
}

/**
 * Returns the number of currently connected SSE clients.
 */
export function clientCount() {
  return clients.size;
}
