/* Pitwall — Pitwall: data, icons and small helpers used everywhere. Part of the renderer, split into files that load in order (see index.html). */
'use strict';
const D = window.F1DATA;

/* ------------------------------------------------------------------ utils */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const clone = (o) => JSON.parse(JSON.stringify(o));
const $ = (sel, root = document) => root.querySelector(sel);
// PLAYER_ID is the driver you create and race as. PLAYER is whoever the driver pages follow as "you": that same
// driver, or in a Team Principal career (My Team, not driving) the lead driver of your team. See syncPlayer().
const PLAYER_ID = 'PLAYER';
let PLAYER = PLAYER_ID;
const OUT = ['DNF', 'DNS', 'DSQ'];

function parseLap(str) {
  if (!str) return null;
  const s = String(str).trim().replace(',', '.');
  let m = s.match(/^(\d+):(\d{1,2})(?:\.(\d{1,3}))?$/);
  if (m) return (+m[1]) * 60000 + (+m[2]) * 1000 + (m[3] ? +m[3].padEnd(3, '0') : 0);
  m = s.match(/^(\d{1,3})(?:\.(\d{1,3}))?$/);
  if (m) return (+m[1]) * 1000 + (m[2] ? +m[2].padEnd(3, '0') : 0);
  return null;
}
function fmtLap(ms) {
  if (ms == null) return '';
  ms = Math.round(ms);
  const m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000), x = ms % 1000;
  return `${m}:${String(s).padStart(2, '0')}.${String(x).padStart(3, '0')}`;
}
/** "1:32:15.120", "+1:05.123", "+5.1" → milliseconds. */
function parseDur(str) {
  const t = String(str || '').trim().replace(/^\+\s*/, '').replace(',', '.');
  if (!/^\d+(?::\d{1,2}){0,2}(?:\.\d{1,3})?$/.test(t)) return null;
  const [main, frac = ''] = t.split('.');
  const sec = main.split(':').map(Number).reduce((a, v) => a * 60 + v, 0);
  return sec * 1000 + (frac ? +frac.padEnd(3, '0') : 0);
}
function fmtDur(ms, plus = false) {
  ms = Math.round(ms);
  const h = Math.floor(ms / 3600000), m = Math.floor(ms % 3600000 / 60000), s = Math.floor(ms % 60000 / 1000), x = ms % 1000;
  const ss = String(s).padStart(2, '0'), xs = String(x).padStart(3, '0');
  return (plus ? '+' : '') + (h ? `${h}:${String(m).padStart(2, '0')}:${ss}.${xs}` : m ? `${m}:${ss}.${xs}` : `${s}.${xs}`);
}
/**
 * Formats timing fields as you type, from the digits alone.
 * lap 1:11.111 and qgap +0.123 fill left to right; rgap (+M:SS.sss) and rtime (H:MM:SS.sss) fill from the
 * right, like a calculator, so a gap of any length works: 5123 → +5.123, 105123 → +1:05.123.
 */
function maskTime(kind, raw, deleting) {
  let d = String(raw).replace(/\D/g, '');
  if (!d) return '';
  const sep = (cond) => cond || !deleting;
  if (kind === 'lap') {
    d = d.slice(0, 6);
    return d[0] + (d.length > 1 || sep(false) ? ':' : '') + d.slice(1, 3) + (d.length > 3 || (d.length === 3 && sep(false)) ? '.' : '') + d.slice(3);
  }
  if (kind === 'qgap') {
    d = d.slice(0, 5);
    if (d.length === 5) return `+${d.slice(0, 2)}.${d.slice(2)}`;
    return `+${d[0]}${d.length > 1 || sep(false) ? '.' : ''}${d.slice(1)}`;
  }
  const n = (d = d.slice(0, kind === 'rtime' ? 9 : 7)).length;
  const p = kind === 'rgap' ? '+' : '';
  if (n <= 3) return p + d;
  if (n <= 5) return `${p}${d.slice(0, n - 3)}.${d.slice(n - 3)}`;
  if (n <= 7) return `${p}${d.slice(0, n - 5)}:${d.slice(n - 5, n - 3)}.${d.slice(n - 3)}`;
  return `${d.slice(0, n - 7)}:${d.slice(n - 7, n - 5)}:${d.slice(n - 5, n - 3)}.${d.slice(n - 3)}`;
}
const ord = (n) => n == null ? '–' : `P${n}`;
const avg = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
const fmtAvg = (v) => v == null ? '–' : v.toFixed(1);

function contrastInk(hex) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#0B0F17' : '#FFFFFF';
}

const ICON = {
  globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M10 9l5 3-5 3z"/></svg>',
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
  flag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 21V4M5 4h12l-2 4 2 4H5"/></svg>',
  trophy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4"/></svg>',
  vs: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h10M10 3l4 4-4 4M20 17H10M14 13l-4 4 4 4"/></svg>',
  stats: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  helmet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3 15a9 9 0 0 1 17.6-2.6L21 15v2a2 2 0 0 1-2 2H7a4 4 0 0 1-4-4z"/><path d="M11 12h10"/></svg>',
  track: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M5 20a2 2 0 0 1-2-2v-5a3 3 0 0 1 3-3h6a2 2 0 0 0 2-2V6a3 3 0 0 1 6 0v11a3 3 0 0 1-3 3z"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/></svg>',
  laurel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15l-3.5 2 1-4-3-2.7 4-.3L12 6l1.5 4 4 .3-3 2.7 1 4z"/><path d="M5 5c-2 4-1.5 9 3 13M19 5c2 4 1.5 9-3 13"/></svg>',
  mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 15l6-6 6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg>',
  left: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 6l-6 6 6 6"/></svg>',
  right: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 6l6 6-6 6"/></svg>',
  grip: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  logo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M3 17h7l3-10h8M7 12h5"/></svg>',
  garage: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3 21V9l9-5 9 5v12"/><path d="M7 21v-8h10v8M7 17h10"/></svg>',
  news: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 5h13v14a2 2 0 0 0 2 2H6a2 2 0 0 1-2-2z"/><path d="M17 9h3v10a2 2 0 0 1-2 2M8 9h5M8 13h5M8 17h3"/></svg>',
  forecast: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 20h18"/><path d="M5 16l4-5 4 3 6-8"/><path d="M15 6h4v4"/></svg>',
  gauge: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 17a8 8 0 1 1 16 0"/><path d="M12 17l4-5"/><circle cx="12" cy="17" r="1.2" fill="currentColor"/></svg>',
  medal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M8 3h8l-2 6h-4z"/><circle cx="12" cy="15" r="6"/><path d="M12 12.5l.8 1.6 1.7.2-1.3 1.2.4 1.7-1.6-.9-1.6.9.4-1.7-1.3-1.2 1.7-.2z"/></svg>',
  camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  swap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h14l-4-4M20 16H6l4 4"/></svg>',
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M10.5 18.5h3"/></svg>',
};
