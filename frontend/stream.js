/**
 * stream.js — shared SSE client
 *
 * Opens a single EventSource to /api/stream and dispatches
 * custom DOM events so each page can listen for the data it needs.
 *
 * Usage in any page:
 *   <script src="../stream.js"></script>
 *   window.addEventListener('wm:snapshot', e => { const d = e.detail; ... });
 *   window.addEventListener('wm:status',   e => { ... });  // connected/offline
 */

(function () {
  'use strict';

  const SSE_URL = 'http://localhost:5000/api/stream';
  let es        = null;
  let retryMs   = 2000;
  const MAX_RETRY = 30000;

  function dispatch(name, detail) {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  }

  function connect() {
    if (es) { es.close(); es = null; }

    dispatch('wm:status', { connected: false, label: 'Connecting...' });

    es = new EventSource(SSE_URL);

    es.addEventListener('connected', () => {
      retryMs = 2000; // reset backoff
      dispatch('wm:status', { connected: true, label: 'Live' });
    });

    es.addEventListener('snapshot', ev => {
      try {
        const data = JSON.parse(ev.data);
        dispatch('wm:snapshot', data);
        dispatch('wm:status',   { connected: true, label: 'Live' });
      } catch (e) {
        console.error('[SSE] parse error', e);
      }
    });

    es.onerror = () => {
      dispatch('wm:status', { connected: false, label: 'Reconnecting...' });
      es.close();
      es = null;
      // Exponential back-off, cap at 30 s
      setTimeout(connect, retryMs);
      retryMs = Math.min(retryMs * 1.5, MAX_RETRY);
    };
  }

  // Start on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', connect);
  } else {
    connect();
  }

  // Expose manual reconnect for debug
  window.__wmReconnect = connect;
})();
