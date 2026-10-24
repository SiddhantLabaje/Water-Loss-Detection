/**
 * live.js — shared live-refresh engine for all dashboard pages.
 *
 * Usage:
 *   import { startLive, setConn, fmtTime, f1, f2, f3, fN,
 *            anomBadge, sevBadge, statusBadge, wqBadge, cap } from '../live.js';
 *
 *   startLive({ interval: 15, onTick: doFetch });
 */

// ── Formatting helpers ────────────────────────────────────────────────────────
export const f1  = v => (v == null || isNaN(+v)) ? '—' : (+v).toFixed(1);
export const f2  = v => (v == null || isNaN(+v)) ? '—' : (+v).toFixed(2);
export const f3  = v => (v == null || isNaN(+v)) ? '—' : (+v).toFixed(3);
export const fN  = v => v == null ? '—' : String(v);
export const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';

export function fmtTime(raw) {
  if (!raw) return '—';
  try { const d = new Date(raw); return isNaN(d) ? String(raw) : d.toLocaleString(); }
  catch { return String(raw); }
}

// ── Badge helpers ─────────────────────────────────────────────────────────────
export const anomBadge   = v => v === 'ABNORMAL'
  ? '<span class="badge b-red">Abnormal</span>'
  : '<span class="badge b-green">Normal</span>';

export const sevBadge = s => s === 'high'
  ? '<span class="badge b-red">High</span>'
  : s === 'medium'
    ? '<span class="badge b-amber">Medium</span>'
    : s ? `<span class="badge b-green">${cap(s)}</span>` : '—';

export const statusBadge = s => s === 'critical'
  ? '<span class="badge b-red">Critical</span>'
  : s === 'warning'
    ? '<span class="badge b-amber">Warning</span>'
    : s === 'normal'
      ? '<span class="badge b-green">Normal</span>'
      : '<span class="badge b-grey">—</span>';

export const wqBadge = v => {
  if (!v) return '—';
  return `<span class="badge ${v === 'GOOD' ? 'b-green' : v === 'MODERATE' ? 'b-amber' : 'b-red'}">${cap(v.toLowerCase())}</span>`;
};

// ── Connection indicator ──────────────────────────────────────────────────────
export function setConn(ok) {
  const dot   = document.getElementById('conn-dot');
  const label = document.getElementById('conn-label');
  if (dot)   dot.className          = ok ? 'dot dot-ok' : 'dot dot-err';
  if (label) label.textContent      = ok ? 'Connected'  : 'Offline';
}

// ── API fetch wrapper ─────────────────────────────────────────────────────────
export async function apiFetch(base, path) {
  const r = await fetch(base + path);
  if (!r.ok) throw new Error(r.status);
  return r.json();
}

// ── Live-refresh engine ───────────────────────────────────────────────────────
/**
 * @param {object} opts
 * @param {number}   opts.interval  — seconds between auto-refreshes (default 15)
 * @param {Function} opts.onTick    — async function called when it's time to refresh
 * @returns {{ manualRefresh, togglePause }}
 */
export function startLive({ interval = 15, onTick }) {
  let remaining   = interval;
  let paused      = false;
  let fetching    = false;
  let timer       = null;

  const pill    = document.getElementById('live-pill');
  const cdEl    = document.getElementById('lp-cd');
  const barEl   = document.getElementById('live-bar');
  const updEl   = document.getElementById('updated');

  function updateBar() {
    if (!barEl) return;
    const pct = ((interval - remaining) / interval) * 100;
    barEl.style.transform = `scaleX(${(100 - pct) / 100})`;
  }

  function updateCountdown() {
    if (cdEl && !paused) cdEl.textContent = remaining + 's';
  }

  async function doFetch() {
    if (fetching) return;
    fetching = true;
    if (pill) pill.classList.add('fetching');
    try {
      await onTick();
      if (updEl) updEl.textContent = 'Last updated ' + new Date().toLocaleTimeString();
    } catch { /* caller handles errors */ }
    fetching = false;
    if (pill) pill.classList.remove('fetching');
    updateCountdown();
  }

  function tick() {
    if (paused || fetching) return;
    remaining--;
    updateBar();
    updateCountdown();
    if (remaining <= 0) { remaining = interval; doFetch(); }
  }

  function togglePause() {
    paused = !paused;
    if (pill) pill.classList.toggle('paused', paused);
    if (cdEl) cdEl.textContent = paused ? 'Paused' : remaining + 's';
    if (barEl) barEl.classList.toggle('paused', paused);
  }

  function manualRefresh() { remaining = interval; doFetch(); }

  // Wire the pill click if it exists
  if (pill) pill.addEventListener('click', togglePause);

  // Wire the "Refresh now" button if it exists (looks for .btn with onclick="manualRefresh()")
  // Pages call manualRefresh() directly — expose on window so inline onclick still works
  window.togglePause    = togglePause;
  window.manualRefresh  = manualRefresh;

  // Kick off
  doFetch();
  updateBar();
  timer = setInterval(tick, 1000);

  return { manualRefresh, togglePause };
}
