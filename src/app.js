/* Pitwall — F1 25 career tracker (renderer). Vanilla JS, no build step. */
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

/* --------------------------------------------------------------- storage */
/* The save file on the computer is the shared copy. `rev` is the version of it this device last agreed with and
   `baseJson` that version's contents: a save based on an older version is refused by the computer and merged. */
const store = {
  rev: null, baseJson: null,
  setBase(s, rev) { this.baseJson = JSON.stringify(s); this.rev = rev; },
  dirty() { return this.baseJson != null && JSON.stringify(state) !== this.baseJson; },
  async load() {
    if (window.api) {
      const r = await window.api.load();
      this.setBase(r?.base ?? r?.state ?? null, r?.rev ?? null);
      return r?.state ?? null;
    }
    try { return JSON.parse(localStorage.getItem('pitwall-state')); } catch { return null; }
  },
  _t: null, _busy: false, _again: false,
  save() { clearTimeout(this._t); this._t = setTimeout(() => { try { syncNumbers(career()); } catch { } this.flush(); }, 250); },
  async flush() {
    if (!window.api) { try { localStorage.setItem('pitwall-state', JSON.stringify(state)); } catch (e) { toast('Could not save: ' + e.message); } return; }
    if (this._busy) { this._again = true; return; }
    this._busy = true;
    try {
      const snap = JSON.stringify(state);
      const r = await window.api.save(JSON.parse(snap), this.rev);
      if (r?.conflict) { pendingRemote = { state: r.state, rev: r.rev }; flushRemote(); }
      else if (r?.ok) { this.baseJson = snap; this.rev = r.rev; }
      // r.queued: the phone/tablet is offline; the edit is kept on the device and sent when it reconnects
    } catch (e) { toast('Could not save: ' + e.message); }
    this._busy = false;
    if (this._again) { this._again = false; this.flush(); }
  },
};

/* --------------------------------------------------------------- merging */
// When the computer and a phone/tablet were both edited apart, the two copies are merged against the last version
// both had. Each side's changes are kept; where both changed the same thing, this device's version is used for now
// and the clash is listed so the player can pick. Lists of things with an id (careers, rounds, goals, articles…)
// merge item by item; a session is one unit, since two finishing orders can't be blended.
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const keyOf = (x) => isObj(x) ? (x.id ?? (typeof x.index === 'number' ? x.index : null)) : null;
const keyed = (a) => Array.isArray(a) && a.length > 0 && a.every(x => keyOf(x) != null);
function merge3(b, l, r, path = [], out = []) {
  const jl = JSON.stringify(l), jr = JSON.stringify(r);
  if (jl === jr) return l;
  const jb = JSON.stringify(b);
  if (jb === jl) return r;
  if (jb === jr) return l;
  const atomic = path.length >= 2 && path[path.length - 2] === 'sessions';
  if (!atomic && isObj(l) && isObj(r)) {
    const bo = isObj(b) ? b : {}; const res = {};
    for (const k of new Set([...Object.keys(l), ...Object.keys(r)])) {
      const v = merge3(bo[k], l[k], r[k], [...path, k], out);
      if (v !== undefined) res[k] = v;
    }
    return res;
  }
  if (!atomic && Array.isArray(l) && Array.isArray(r) && (keyed(l) || keyed(r)) && l.concat(r).every(x => keyOf(x) != null)) {
    const map = (a) => new Map((Array.isArray(a) ? a : []).filter(x => keyOf(x) != null).map(x => [keyOf(x), x]));
    const bm = map(b), lm = map(l), rm = map(r);
    const order = [...lm.keys(), ...[...rm.keys()].filter(k => !lm.has(k))];
    const res = [];
    for (const k of order) { const v = merge3(bm.get(k), lm.get(k), rm.get(k), [...path, { id: k }], out); if (v !== undefined) res.push(v); }
    return res;
  }
  out.push({ path, local: l, remote: r, pick: 'local' });
  return l;
}
const stepIn = (cur, seg) => cur == null ? undefined : typeof seg === 'object' ? (Array.isArray(cur) ? cur.find(x => keyOf(x) === seg.id) : undefined) : cur[seg];
function setAt(root, path, v) {
  let cur = root;
  for (const seg of path.slice(0, -1)) { cur = stepIn(cur, seg); if (cur == null) return; }
  const last = path[path.length - 1];
  if (typeof last === 'object') {
    const i = cur.findIndex(x => keyOf(x) === last.id);
    if (v === undefined) { if (i >= 0) cur.splice(i, 1); } else if (i >= 0) cur[i] = v; else cur.push(v);
  } else if (v === undefined) delete cur[last]; else cur[last] = v;
}
/** "Driver career · 2025 · Bahrain · Qualifying" for a path into the save. */
function pathLabel(root, path) {
  const parts = []; let cur = root, career = null, season = null;
  path.forEach((seg, i) => {
    const prev = path[i - 1];
    const next = stepIn(cur, seg);
    if (prev === 'careers' && next) { career = next; parts.push(`${next.profile?.first || ''} ${next.profile?.last || ''}`.trim() || 'Career'); }
    else if (prev === 'seasons' && next) { season = next; parts.push(String(next.year)); }
    else if (prev === 'weekends') parts.push(season?.calendar?.find(r => r.id === seg)?.name || String(seg).toUpperCase());
    else if (prev === 'sessions') parts.push(SESSION_LABEL[seg] || seg);
    else if (prev === 'drivers' && path[i - 2] === 'images') parts.push(`Photo of ${D.DRIVERS[seg]?.name || seg}`);
    else if (prev === 'teams' && path[i - 2] === 'images') parts.push(`Logo of ${D.TEAMS?.[seg]?.name || seg}`);
    else if (typeof seg === 'string' && !['careers', 'seasons', 'weekends', 'sessions', 'images', 'drivers', 'teams'].includes(seg) && i === path.length - 1) parts.push(seg.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, ch => ch.toUpperCase()));
    else if (typeof seg === 'string' && ['profile', 'goals', 'media', 'myTeam', 'calendar', 'prefs'].includes(seg)) parts.push({ profile: 'Driver profile', goals: 'Goals', media: 'Media', myTeam: 'My Team', calendar: 'Calendar', prefs: 'Preferences' }[seg]);
    cur = next;
  });
  return [...new Set(parts)].join(' · ') || 'Career data';
}
const sides = () => window.api?.companion === true ? ['This device', 'Your computer'] : ['This computer', 'Phone / tablet'];
function conflictModal(list) {
  ui.conflicts = list;
  const [here, there] = sides();
  modal(`<div class="modal-h"><h2>Changed in two places</h2></div>
    <div class="modal-b"><p class="muted">These were edited both here and on the other device while they weren’t connected. Everything else has been combined. Pick which version of each to keep.</p>
      <div class="stack">${list.map((x, i) => `<div class="conflict"><b>${esc(pathLabel(state, x.path))}</b>
        <div class="seg">${[['local', here], ['remote', there]].map(([v, l]) => `<button data-act="conflict-pick" data-i="${i}" data-v="${v}" class="${x.pick === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>`).join('')}</div>
      ${list.length > 1 ? `<div class="row"><button class="btn sm ghost" data-act="conflict-all" data-v="local">All from ${here.toLowerCase()}</button><button class="btn sm ghost" data-act="conflict-all" data-v="remote">All from ${there.toLowerCase()}</button></div>` : ''}
    </div>
    <div class="modal-f"><button class="btn primary" data-act="conflict-done">Keep these</button></div>`);
}

let state = { version: 1, careers: [], activeCareerId: null };
let settings = { hasKey: false, model: 'claude-sonnet-5-5' };
let companion = null; // desktop only: the phone/tablet link's status

/* Edits from the other device (desktop ↔ phone/tablet). Held back while someone is typing or a dialog is open,
   so a sync never wipes a half-entered lap time. */
let pendingRemote = null;
function applyRemote(msg) {
  if (!msg || !msg.state || !Array.isArray(msg.state.careers)) return;
  if (msg.rev === store.rev) { if (store.dirty()) store.save(); return; } // nothing new over there; send ours
  pendingRemote = msg; flushRemote();
}
function flushRemote() {
  if (!pendingRemote) return;
  const a = document.activeElement;
  if ($('#modal-root').innerHTML || (a && a.matches('input, textarea, select'))) return;
  const { state: inc, rev } = pendingRemote; pendingRemote = null;
  let conflicts = [];
  if (!store.dirty()) { store.setBase(inc, rev); window.api?.adopted?.(inc, rev); state = hydrateState(inc); if (store.dirty()) store.save(); }
  else {
    // both sides changed: combine them, then save the result on top of the other side's version
    state = hydrateState(merge3(JSON.parse(store.baseJson), state, inc, [], conflicts));
    store.setBase(inc, rev); store.save();
  }
  if (!state.careers.length) { ui.view = 'setup'; ui.setup ||= defaultSetup(); }
  else {
    if (!career()) state.activeCareerId = state.careers[0].id;
    if (ui.view === 'setup') ui.view = 'dashboard';
    if (ui.seasonIdx != null && ui.seasonIdx >= career().seasons.length) ui.seasonIdx = null;
  }
  render();
  if (conflicts.length) conflictModal(conflicts);
}
document.addEventListener('focusout', () => setTimeout(flushRemote, 0));
const ui = {
  view: 'dashboard', seasonIdx: null, round: null, session: null,
  tap: null, standingsTab: 'drivers', h2h: { scope: 'cur', a: null, b: null },
  setup: null, mediaOpen: null, busy: false, dragIdx: null,
  driverId: null, trackId: null, trackAll: false, drv: { sort: 'wins', scope: 'grid' },
  mt: 'overview', hof: { view: 'champions', sort: 'titles' },
  teamId: null, tms: { sort: 'conTitles', scope: 'grid' }, fc: 'driver', stories: 'all', lb: { sort: 'pts', scope: 'full' }, perf: 'season',
};

/* ----------------------------------------------------------- career model */
const career = () => state.careers.find(c => c.id === state.activeCareerId) || null;
const curSeason = () => { const c = career(); if (!c) return null; const i = ui.seasonIdx ?? c.seasons.length - 1; return c.seasons[i] || c.seasons[c.seasons.length - 1]; };
const latestSeason = () => { const c = career(); return c ? c.seasons[c.seasons.length - 1] : null; };

/* ---------------------------------------------------------------- history */
// Every career opens with the real seasons from 2016 (src/history.js): read-only, with their own results, points and
// line-ups. They're rebuilt from the bundled data on load and saved as a stub, so a save stays small. Totals
// elsewhere start from each driver's and team's record before 2016, so real seasons plus career add up.
const H = window.F1HIST;
const HIST_FROM = H.from, HIST_TO = H.to;
const isHist = (s) => !!s?.historic;
/** The circuit a round is held at (the Styrian GP is at the Red Bull Ring, say). */
const trackOf = (r) => r ? r.track || H.roundTrack[r.id] || r.id : null;
const playedSeasons = (c) => c.seasons.filter(s => !isHist(s));
const firstPlayed = (c) => c.seasons.find(s => !isHist(s)) || c.seasons[c.seasons.length - 1];
// drivers who announced their retirement at the end of that season (the rest of those leaving were left without a seat)
const REAL_RETIREMENTS = { 2016: ['ROS', 'BUT', 'MAS'], 2017: ['MAS'], 2018: ['ALO'], 2021: ['RAI'], 2022: ['VET'] };

/** Swap the end-of-2024 reference figures for the record before 2016: the real seasons supply the rest. */
(function useHistoryBaseline() {
  const KEYS = ['starts', 'wins', 'podiums', 'poles', 'fls', 'pts'];
  for (const [id, b] of Object.entries(H.bios)) {
    const cur = D.DRIVER_BIO[id] || {}; const base = H.base.drivers[id] || {};
    D.DRIVER_BIO[id] = { ...cur, nat: cur.nat || b.nat, born: cur.born || b.born, debut: cur.debut || b.debut, firstWin: cur.firstWin || b.firstWin || undefined,
      teams: b.teamsPre, career: b.teams, ...Object.fromEntries(KEYS.map(k => [k, base[k] || 0])), titles: base.titles || [], bestChamp: base.bestChamp ?? null, bestFinish: base.bestFinish ?? null };
  }
  for (const [id, b] of Object.entries(D.DRIVER_BIO)) if (!H.bios[id] && !b.fictional) Object.assign(b, { starts: 0, wins: 0, podiums: 0, poles: 0, fls: 0, pts: 0, titles: [], bestChamp: null, bestFinish: null });
  for (const [tid, b] of Object.entries(H.oldTeams)) D.TEAM_BIO[tid] ||= { ...b };
  for (const bio of Object.values(D.TEAM_BIO)) {
    if (bio.lineage || bio.fictional) continue;
    const id = Object.keys(D.TEAM_BIO).find(k => D.TEAM_BIO[k] === bio); const base = H.base.teams[id] || {};
    Object.assign(bio, { starts: base.starts || 0, wins: base.wins || 0, poles: base.poles || 0, podiums: base.podiums || 0, fls: base.fls || 0,
      conTitles: base.conTitles || [], drvTitles: base.drvTitles || 0, bestFinish: base.bestFinish ?? null, bestCon: base.bestCon ?? null });
  }
  D.RECORDS = H.records; D.STREAKS_2025 = H.streaks;
  D.CHAMPIONS = D.CHAMPIONS.filter(([y]) => y < HIST_FROM);
  for (const t of Object.values(D.TRACKS)) t.history = (t.history || []).filter(h => h[0] < HIST_FROM);
  for (const [id, t] of Object.entries(H.oldTracks)) D.TRACKS[id] ||= { ...t, history: [], former: true };
})();

/** A real season as Pitwall season data. Saved as { index, year, historic } and rebuilt on load. */
function histSeason(year, index) {
  const h = H.seasons[year];
  const drivers = {};
  for (const [id, [name, number, code]] of Object.entries(h.drivers)) drivers[id] = { id, name, abbr: code, number };
  const calendar = [], weekends = {}, raceTeams = {};
  for (const r of h.rounds) {
    calendar.push({ id: r.id, name: r.name, venue: r.venue, sprint: !!r.sprint, off: false, ...(r.track ? { track: r.track } : {}), laps: r.laps, date: r.date });
    const pole = parseLap(r.q[0]?.[1]);
    const Q = { results: r.q.map(([d, lap, st], i) => { const ms = parseLap(lap); return { d, lap, gap: i && pole != null && ms != null ? '+' + ((ms - pole) / 1000).toFixed(3) : '', st }; }), fl: null, done: true, pole: r.pole };
    const row = ([d, gap, st, down, pts]) => ({ d, lap: '', gap, st, laps: down || '', pts });
    const R = { results: r.r.map(row), fl: r.fl, done: true };
    const flRow = R.results.find(x => x.d === r.fl); if (flRow) flRow.lap = r.flLap;
    const sessions = { Q, R };
    if (r.s) sessions.SPR = { results: r.s.map(row), fl: null, done: true };
    weekends[r.id] = { sessions, notes: '', raceLength: 100 };
    raceTeams[r.id] = Object.fromEntries([...(r.s || []), ...r.r].map(x => [x[0], x[5]]));
  }
  const s = { index, year, historic: 'real', teams: h.teams.map(t => ({ ...t, drivers: [...t.drivers] })), drivers, calendar, benched: null, playerTeamId: null,
    format: { practice: 'none' }, goals: [], weekends, completed: true, raceTeams, transfers: [],
    scoring: { fl: year >= 2019 && year <= 2024 ? 1 : 0, spr: year === 2021 ? [3, 2, 1] : null } };
  Object.defineProperty(s, 'toJSON', { value: () => ({ index, year, historic: 'real' }) });
  return s;
}
/** Each team's line-up at one race of a real season, with stand-ins (three races or fewer for the team that year)
 *  swapped for the driver they stood in for. { teamId: [driver, driver] } */
function lineupAt(year, ri) {
  const rs = H.seasons[year]?.rounds; if (!rs) return null;
  const races = {};
  for (const r of rs) for (const x of r.r) { const k = x[5] + '|' + x[0]; races[k] = (races[k] || 0) + 1; }
  const out = {};
  for (const x of rs[ri < 0 ? rs.length + ri : ri].r) (out[x[5]] ||= []).push(x[0]);
  for (const [tid, ds] of Object.entries(out)) {
    const regulars = Object.keys(races).filter(k => k.startsWith(tid + '|')).map(k => k.split('|')[1]).sort((a, b) => races[tid + '|' + b] - races[tid + '|' + a]);
    out[tid] = ds.map(d => races[tid + '|' + d] > 3 ? d : regulars.find(r => !ds.includes(r) && races[tid + '|' + r] > 3) || d);
  }
  return out;
}
/** Each team's line-up at the start of a real season (F1 25's grids for 2025 and 2026). */
function realLineup(year) {
  if (year === 2025) return Object.fromEntries(D.GRID_2025.filter(t => t.id !== 'apxgp').map(t => [t.id, [...t.drivers]]));
  if (year === 2026) return Object.fromEntries(D.GRID_2026.map(t => [t.id, [...t.drivers]]));
  return lineupAt(year, 0);
}
/** Who was in which car at the end of a real season. */
const finalLineup = (year) => lineupAt(year, -1);
/** A team's regular drivers in a real season (more than three races). */
function regularsOf(year, tid) {
  const n = {}; for (const r of H.seasons[year].rounds) for (const x of r.r) if (x[5] === tid) n[x[0]] = (n[x[0]] || 0) + 1;
  return Object.keys(n).filter(d => n[d] > 3);
}
/** The real driver market as transfer records, so the press covers it like any other move. */
function realTransfers(c) {
  const byYear = Object.fromEntries(c.seasons.map(s => [s.year, s]));
  for (const s of c.seasons) if (s.historic === 'real') s.transfers = s.transfers.filter(t => !t.real);
  const mk = (id, at, effective, date, steps) => ({ id, at, effective, createdAt: date ? new Date(Date.parse(date) + 864e5).toISOString() : new Date(0).toISOString(), steps, real: true, before: null });
  const step = (driver, from, to, replaces = null) => ({ kind: 'move', driver, from, to, replaces, until: null, prevUntil: null, wasPending: false });
  for (let y = HIST_FROM; y <= HIST_TO; y++) {
    const s = byYear[y]; if (s?.historic !== 'real') continue;
    const rs = H.seasons[y].rounds;
    // during the season
    // (a regular coming back after missing races, or starting late, isn't news)
    (H.moves[y] || []).filter(m => m.at > 0 && !(m.from == null && regularsOf(y, m.to).includes(m.driver) && Object.values(lineupAt(y, 0)).flat().includes(m.driver))).forEach((m, k) => {
      const prevTeam = Object.entries(s.raceTeams[rs[m.at - 1].id]).filter(([, t]) => t === m.to).map(([d]) => d);
      const nowTeam = Object.entries(s.raceTeams[rs[m.at].id]).filter(([, t]) => t === m.to).map(([d]) => d);
      s.transfers.push(mk(`real-${y}-${k}`, m.at, 'now', rs[m.at - 1].date, [step(m.driver, m.from, m.to, prevTeam.find(d => !nowTeam.includes(d)) || null)]));
    });
    // over the winter into the next season (which always starts from the real grid after a real season)
    if (!byYear[y + 1]) continue;
    // into a season you play, compare with the grid it started from (F1 25's, say); with you back out of your seat
    const ns = byYear[y + 1];
    const after = isHist(ns) ? (ns.historic === 'sim' ? Object.fromEntries(ns.teams.map(t => [t.id, t.drivers.filter(Boolean)])) : realLineup(y + 1))
      : Object.fromEntries(ns.teams.filter(t => t.id !== MYTEAM).map(t => [t.id, t.drivers.map(d => d === PLAYER_ID ? ns.benched : d).filter(Boolean)]));
    const before = finalLineup(y); if (!after) continue;
    const teamIn = (L, d) => Object.keys(L).find(t => L[t].includes(d)) || null;
    const date = rs[rs.length - 1].date; let k = 0;
    for (const [tid, ds] of Object.entries(after)) for (const d of ds) {
      const from = teamIn(before, d);
      if (from === tid) continue;
      const replaces = (before[tid] || []).find(x => !ds.includes(x)) || null;
      s.transfers.push(mk(`real-${y}w-${k++}`, rs.length, 'next', date, [step(d, from, tid, replaces)]));
    }
    for (const [tid, ds] of Object.entries(before)) for (const d of ds) {
      if (teamIn(after, d)) continue;
      s.transfers.push(mk(`real-${y}w-${k++}`, rs.length, 'next', date, [step(d, tid, (REAL_RETIREMENTS[y] || []).includes(d) ? 'retire' : 'free')]));
    }
  }
}
/** Put every season reference in a career forward by n (older saves get the real seasons in front of them). */
function shiftSeasonRefs(c, n) {
  for (const s of c.seasons) s.index += n;
  for (const m of c.media || []) if (m.seasonIdx != null) m.seasonIdx += n;
  for (const r of c.rumours || []) if (r.seasonIdx != null) r.seasonIdx += n;
  for (const p of Object.values(c.pending || {})) if (p?.seasonIdx != null) p.seasonIdx += n;
  for (const k of ['ledger', 'upgrades', 'sponsors']) for (const e of c.myTeam?.[k] || []) if (e.seasonIdx != null) e.seasonIdx += n;
}
/** Fill in the real seasons of a loaded career (and give an older save its 2016 onwards). */
function hydrateCareer(c) {
  if (!c?.seasons?.length) return;
  if (!c.seasons.some(isHist) && c.seasons[0].year > HIST_FROM) {
    const n = Math.min(c.seasons[0].year, HIST_TO + 1) - HIST_FROM;
    shiftSeasonRefs(c, n);
    c.seasons.unshift(...Array.from({ length: n }, (_, i) => ({ index: i, year: HIST_FROM + i, historic: 'real' })));
  }
  c.seasons = c.seasons.map(s => s.historic === 'real' && !s.teams ? histSeason(s.year, s.index) : s);
  c.startYear ||= firstPlayed(c).year;
  // older saves that started in 2025 had APXGP as standard
  if (c.extraTeam2025 === undefined && c.startYear >= 2025) c.extraTeam2025 = c.startYear === 2025 ? ['apxgp', 'konnersport'].find(x => firstPlayed(c).teams.some(t => t.id === x)) || null : null;
  feederBios(c);
  realTransfers(c);
}
function hydrateState(st) { for (const c of st?.careers || []) hydrateCareer(c); return st; }

/* F1 25 lets a career add an 11th team for 2025 only: APXGP or Konnersport (c.extraTeam2025: 'apxgp' | 'konnersport' |
   null; undefined while a career that started earlier hasn't reached 2025 and been asked). My Team careers have
   your team as the 11th instead. */
const EXTRA_TEAMS = [['', 'Neither', 'The real ten-team grid'], ['apxgp', 'APXGP', 'Sonny Hayes and Joshua Pearce, from the F1 film'], ['konnersport', 'Konnersport', 'Aiden Jackson and Callie Mayer, from Braking Point']];
const extra2025 = (c) => c?.extraTeam2025 && c?.type !== 'myteam' && D.EXTRA_2025[c.extraTeam2025] ? [D.EXTRA_2025[c.extraTeam2025]] : [];
const extraPicker = (sel, act) => `<div class="choices">${EXTRA_TEAMS.map(([id, n, b]) => `<button class="choice ${(sel || '') === id ? 'on' : ''}" data-act="${act}" data-k="extra" data-v="${id}"><b>${n}</b><small>${b}</small></button>`).join('')}</div>`;
/** The grid and calendar a season starts from when it follows real life, or the grid you laid out for a career that
 *  starts later (null otherwise: the grid carries over). */
function templateFor(year, c = career()) {
  if (c?.startGrid && year === c.startYear) return { grid: c.startGrid, cal: c.startCal, nums: {} };
  // F1 25's grid (with APXGP) is for careers that start in 2025: reaching 2025 from an earlier start, it's the real one
  if (year === 2025 && (!c || c.startYear === 2025)) return { grid: [...D.GRID_2025, ...extra2025(c)], cal: D.CAL_2025, nums: {} };
  if (year === 2026) return { grid: D.GRID_2026, cal: D.CAL_2026, nums: D.NUMBERS_2026 };
  const h = H.seasons[year]; if (!h) return null;
  const lineup = realLineup(year);
  const grid = h.teams.filter(t => lineup[t.id]).map(t => ({ id: t.id, name: t.name, color: t.color, drivers: lineup[t.id].slice(0, 2) }));
  const nums = Object.fromEntries(Object.entries(h.drivers).map(([id, v]) => [id, v[1]]));
  const cal = h.rounds.map(r => [r.id, r.name, r.venue, !!r.sprint, r.track || null, r.date]);
  if (year === 2025) grid.push(...extra2025(c));
  return { grid, cal, nums, drivers: Object.fromEntries(Object.entries(h.drivers).map(([id, [name, number, abbr]]) => [id, { id, name, abbr, number }])) };
}

/* ------------------------------------------------------- random numbers */
/** A repeatable random sequence: the same career and year always simulate the same way. */
function mulberry(seed) {
  let a = 0; for (const ch of String(seed)) a = Math.imul(a ^ ch.charCodeAt(0), 2654435761) >>> 0;
  return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const gauss = (rnd) => { let u = 0; while (!u) u = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd()); };

/* ----------------------------------------------------------- driver pool */
// Who can be signed besides the grid: the F2 and F3 fields, the drivers you add yourself, and everyone who has raced
// since 2016 (free agents if they raced in the last two seasons and are under 44, otherwise retired).
// From 2025 each career keeps its own F2 (22 drivers) and F3 (30) fields, starting from the real 2024–25 grids: a
// driver who reaches F1 is replaced by a newly generated one, F3 drivers step up to F2 after two years, and anyone
// not in F1 after two years in F2 (four in all, coming through F3) drops off the list.
const F2_SIZE = 22, F3_SIZE = 30, RETIRE_AGE = 44;
const FEEDER = {};
for (const [name, abbr, nat, series, note] of window.F1POOL.FEEDER) {
  const id = 'X' + abbr; // never clashes with a three-letter F1 id
  const [level, yr] = series.split(' ');
  // no data in F1 yet: a talent rating (ms off the pace, lower is quicker), with feeder champions a little quicker
  const skill = Math.round(100 + gauss(mulberry('talent-' + id)) * 75 - (/champion/.test(note) ? 50 : 0));
  FEEDER[id] = { id, name, abbr, number: null, nat, series, note, feeder: true, level, joined: +yr, bornEst: `${+yr - (level === 'F2' ? 21 : 18)}-06-01`, skill };
  D.DRIVER_BIO[id] ||= { nat, note: `${series}${note ? '. ' + note : ''}.`, starts: 0, wins: 0, podiums: 0, poles: 0, fls: 0, pts: 0, titles: [], feeder: series };
}
/** A career's F2 and F3 fields: { year, list: [{ id, level, joined, f2 }] }, from the real grids in 2025. */
function feederOf(c) {
  return c.feeder ||= { year: 2025, list: Object.values(FEEDER).map(f => ({ id: f.id, level: f.level, joined: f.joined, f2: f.level === 'F2' ? f.joined : null })) };
}
/** "F2" / "F3" / "F2 2025" for a feeder driver, or null. */
const feederLabel = (c, id) => { const x = c?.feeder?.list.find(f => f.id === id); return x ? `${x.level} · ${x.level === 'F3' ? x.joined : x.f2 ?? x.joined} entry` : FEEDER[id]?.series || null; };
// names for generated drivers, by nationality: [weight, first names, family names]
const GEN_NAMES = {
  British: [6, ['Oliver', 'Harry', 'Jack', 'George', 'Charlie', 'Thomas', 'Alfie', 'Freddie', 'Lewis', 'Callum', 'Archie', 'Max'], ['Walker', 'Hughes', 'Bennett', 'Carter', 'Fletcher', 'Holt', 'Marsh', 'Pryce', 'Lambert', 'Reid', 'Shaw', 'Turner', 'Ashby', 'Whitlock']],
  Italian: [4, ['Luca', 'Marco', 'Matteo', 'Andrea', 'Lorenzo', 'Gabriele', 'Tommaso', 'Riccardo', 'Davide', 'Edoardo'], ['Rossi', 'Bianchi', 'Ferraro', 'Conti', 'Galli', 'Marino', 'Rinaldi', 'Moretti', 'Lombardi', 'Greco', 'Colombo', 'Barone']],
  French: [3, ['Hugo', 'Théo', 'Lucas', 'Mathis', 'Arthur', 'Louis', 'Enzo', 'Raphaël', 'Nathan', 'Jules'], ['Moreau', 'Laurent', 'Girard', 'Lefèvre', 'Fontaine', 'Rousseau', 'Garnier', 'Chevalier', 'Faure', 'Mercier', 'Perrin']],
  Spanish: [2, ['Pablo', 'Álvaro', 'Diego', 'Javier', 'Marc', 'Sergio', 'Adrián', 'Iker'], ['García', 'Navarro', 'Ortega', 'Romero', 'Serrano', 'Molina', 'Castillo', 'Vidal', 'Ruiz']],
  German: [3, ['Leon', 'Finn', 'Jonas', 'Elias', 'Paul', 'Moritz', 'Felix', 'Niklas', 'Lukas'], ['Becker', 'Hoffmann', 'Schäfer', 'Krüger', 'Wagner', 'Vogel', 'Brandt', 'Seidel', 'Lorenz', 'Kessler']],
  Dutch: [2, ['Daan', 'Sem', 'Bram', 'Thijs', 'Jesse', 'Ruben', 'Lars'], ['de Jong', 'Bakker', 'Visser', 'Smit', 'Meijer', 'Mulder', 'van Dijk', 'Kok']],
  Brazilian: [2, ['Gabriel', 'Rafael', 'Pedro', 'Enzo', 'Felipe', 'Caio', 'Bruno'], ['Oliveira', 'Santos', 'Ferreira', 'Almeida', 'Carvalho', 'Ribeiro', 'Moura']],
  American: [2, ['Jackson', 'Tyler', 'Cole', 'Logan', 'Hunter', 'Mason', 'Ryan'], ['Miller', 'Brooks', 'Hayes', 'Reynolds', 'Coleman', 'Parker', 'Sullivan']],
  Japanese: [1, ['Ren', 'Haruto', 'Sora', 'Kaito', 'Yuto', 'Riku'], ['Sato', 'Takahashi', 'Nakamura', 'Kobayashi', 'Yamamoto', 'Ito']],
  Australian: [2, ['Liam', 'Noah', 'Cooper', 'Jett', 'Hamish', 'Riley'], ['Mitchell', 'Barnes', 'Doyle', 'Kerr', 'Lawson', 'Pearce', 'Quinn']],
  Mexican: [1, ['Santiago', 'Emiliano', 'Mateo', 'Diego', 'Leonardo'], ['Hernández', 'Ramírez', 'Torres', 'Vargas', 'Mendoza']],
  Danish: [1, ['Magnus', 'Oscar', 'Emil', 'Frederik'], ['Nielsen', 'Jensen', 'Kristensen', 'Lund']],
  Finnish: [1, ['Eetu', 'Aleksi', 'Onni', 'Väinö'], ['Virtanen', 'Korhonen', 'Mäkinen', 'Lehtonen']],
  Polish: [1, ['Jakub', 'Kacper', 'Filip', 'Szymon'], ['Nowak', 'Kowalski', 'Wójcik', 'Zieliński']],
  Chinese: [1, ['Haoran', 'Yuxuan', 'Zihan', 'Jiahao'], ['Wang', 'Li', 'Chen', 'Liu', 'Zhang']],
  Indian: [1, ['Arjun', 'Rohan', 'Kabir', 'Aarav'], ['Sharma', 'Mehta', 'Kapoor', 'Iyer']],
  Argentine: [1, ['Thiago', 'Lautaro', 'Benjamín', 'Joaquín'], ['Gómez', 'Fernández', 'Sosa', 'Acosta']],
  Belgian: [1, ['Arthur', 'Lucas', 'Milan', 'Lars'], ['Peeters', 'Janssens', 'Maes', 'Claes']],
};
/** A new F2 or F3 driver for `year`: name, nationality, age and a hidden talent rating (some are gems). */
function genDriver(taken, level, year, rnd) {
  const nats = Object.entries(GEN_NAMES), total = nats.reduce((a, [, v]) => a + v[0], 0);
  for (let attempt = 0; attempt < 50; attempt++) {
    let p = rnd() * total; const [nat, [, firsts, lasts]] = nats.find(([, v]) => (p -= v[0]) < 0) || nats[0];
    const name = `${firsts[Math.floor(rnd() * firsts.length)]} ${lasts[Math.floor(rnd() * lasts.length)]}`;
    if (taken.has(name)) continue;
    taken.add(name);
    const family = lastName(name).replace(/^(de|van) /, '');
    const abbr = family.normalize('NFD').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase();
    const age = level === 'F2' ? 19 + Math.floor(rnd() * 3) : 16 + Math.floor(rnd() * 2);
    const born = `${year - age}-${String(1 + Math.floor(rnd() * 12)).padStart(2, '0')}-${String(1 + Math.floor(rnd() * 28)).padStart(2, '0')}`;
    return { id: 'G' + Math.floor(rnd() * 2 ** 40).toString(36), name, abbr, nat, born, skill: Math.round(125 + gauss(rnd) * 85), number: null, generated: true };
  }
  return null;
}
/** Bios for a career's generated drivers, so ages, flags and cards work like everyone else's. */
function feederBios(c) {
  for (const g of Object.values(c.generated || {})) D.DRIVER_BIO[g.id] ||= { nat: g.nat, born: g.born, starts: 0, wins: 0, podiums: 0, poles: 0, fls: 0, pts: 0, titles: [], generated: true, note: 'A product of the junior series in your career.' };
  for (const x of c.feeder?.list || []) if (D.DRIVER_BIO[x.id]) D.DRIVER_BIO[x.id].feeder = feederLabel(c, x.id);
}
/**
 * Move a career's F2 and F3 fields on to `year`: whoever is on the F1 grid leaves, F3 drivers step up after two years,
 * anyone out of time drops off, and new drivers fill both fields back up. `keep`: drivers who must stay available.
 */
function feederTick(c, year, grid, keep = new Set()) {
  if (year < 2026) return;
  const F = feederOf(c); c.generated ||= {};
  const taken = new Set([...Object.values(FEEDER), ...Object.values(c.generated)].map(x => x.name).concat(Object.values(H.bios).map(b => b.name)));
  for (let y = F.year + 1; y <= year; y++) {
    const rnd = mulberry(`${c.id}-feeder-${y}`);
    F.list = F.list.filter(x => !grid.has(x.id));
    F.list = F.list.filter(x => keep.has(x.id) || (x.level === 'F3' ? y - x.joined < 4 : y - (x.f2 ?? x.joined) < 2));
    const ready = F.list.filter(x => x.level === 'F3' && y - x.joined >= 2).sort((a, b) => priorSkill(c, a.id) - priorSkill(c, b.id));
    for (const x of ready) { if (F.list.filter(z => z.level === 'F2').length >= F2_SIZE) break; x.level = 'F2'; x.f2 = y; }
    for (const level of ['F2', 'F3']) {
      for (let n = F.list.filter(x => x.level === level).length; n < (level === 'F2' ? F2_SIZE : F3_SIZE); n++) {
        const g = genDriver(taken, level, y, rnd); if (!g) break;
        c.generated[g.id] = g; F.list.push({ id: g.id, level, joined: y, f2: level === 'F2' ? y : null });
      }
    }
    F.year = y;
  }
  feederBios(c);
}
/** The drivers off the grid, by kind: { free, retired, feeder, custom } (each a list of ids). */
function driverPool(c, s = latestSeason()) {
  const grid = new Set(gridIds(s));
  const lastRaced = {};
  for (const se of c.seasons) if (se.index <= s.index) for (const id of Object.keys(seasonStatsCache(se))) if (seasonStatsCache(se)[id].starts) lastRaced[id] = se.year;
  const out = { free: [], retired: [], feeder: [], custom: [] };
  const old = (id) => (turnsIn(c, id, s.year) ?? 0) >= RETIRE_AGE;
  for (const cd of c.customDrivers || []) if (!grid.has(cd.id) && cd.id !== PLAYER_ID) out.custom.push(cd.id);
  for (const [id, y] of Object.entries(lastRaced)) {
    if (grid.has(id) || id === PLAYER_ID || out.custom.includes(id)) continue;
    (c.retired?.[id] != null || old(id) || s.year - y > 3 || Object.entries(REAL_RETIREMENTS).some(([ry, ids]) => ids.includes(id) && +ry >= y) ? out.retired : out.free).push(id);
  }
  if (s.year <= 2025) for (const id of ['PER', 'BOT', 'LIN', 'DOO']) if (!grid.has(id) && !lastRaced[id] && !out.free.includes(id) && !old(id)) out.free.push(id);
  // the feeder fields are for seasons from 2025 (in 2018 most of today's F2 drivers were still karting)
  if (s.year >= 2025) {
    const list = c.feeder ? c.feeder.list.slice().sort((a, b) => a.level.localeCompare(b.level)).map(x => x.id) : Object.keys(FEEDER);
    for (const id of list) if (!grid.has(id) && !lastRaced[id] && !(c.removedPool || []).includes(id)) out.feeder.push(id);
  }
  return out;
}

/* ------------------------------------------------------------- simulation */
// A career that starts after 2026 needs the years in between. Each is simulated race by race: the car order carries
// over from the year before (drifting back towards the pack, with the odd big leap), drivers keep the pace they
// showed against their teammates (rising in their early twenties, fading in their mid-thirties), nobody races past
// 44, and the driver market moves everyone towards the grid you laid out.
/** A driver's pace before any F1 data (ms, lower is quicker): F2/F3 or generated talent, or an average rookie. */
const priorSkill = (c, id) => c.generated?.[id]?.skill ?? FEEDER[id]?.skill ?? c.customDrivers?.find(d => d.id === id)?.skill ?? 90;
/**
 * Each driver's qualifying pace against the car (ms, negative = quicker), from every teammate battle of the last four
 * seasons. Teammates link up across teams and years (Verstappen v Pérez, Pérez v Stroll, …) into one scale, so beating
 * a strong teammate counts for more than beating a weak one. Drivers with few comparisons lean on their prior.
 */
function driverSkills(c) {
  const adj = {};
  c.seasons.slice(-4).forEach((s, k) => {
    const w = (k + 1) / 4;
    activeRounds(s).forEach((r, ri) => {
      const q = qualiTimes(s, r); if (!q) return;
      const byTeam = {};
      for (const [d, o] of Object.entries(q.drivers)) if (o.t != null) { const t = teamAt(s, d, ri)?.id; if (t) (byTeam[t] ||= []).push([d, o.t]); }
      for (const p of Object.values(byTeam)) if (p.length === 2 && Math.abs(p[0][1] - p[1][1]) < 1500) {
        const [[a, ta], [b, tb]] = p;
        (adj[a] ||= []).push([b, ta - tb, w]); (adj[b] ||= []).push([a, tb - ta, w]);
      }
    });
  });
  const ids = Object.keys(adj); const sk = {}, prior = {};
  for (const id of ids) sk[id] = prior[id] = priorSkill(c, id);
  const LAMBDA = 3; // how many comparisons the prior is worth
  for (let it = 0; it < 40; it++) for (const id of ids) {
    let num = LAMBDA * prior[id], den = LAMBDA;
    for (const [j, g, w] of adj[id]) { num += w * (sk[j] + g); den += w; }
    sk[id] = num / den;
  }
  return Object.fromEntries(ids.map(id => [id, Math.max(-250, Math.min(500, sk[id]))]));
}
/** Pace by age: raw before 24, at the peak to 33, then fading (ms added to a lap). */
function ageEffect(a) { if (a == null) return 0; if (a <= 21) return 45; if (a <= 23) return 20; if (a <= 33) return 0; return (a - 33) * 16 + Math.max(0, a - 37) * 18; }
/** A driver's simulated pace in a given year. */
const skillOf = (c, skills, id, year) => (skills[id] ?? priorSkill(c, id)) + ageEffect(ageIn(c, id, year));
/** Each team's qualifying gap to the fastest car in ms, from a season's laps (or F1 25's estimate). */
function teamPaceOf(s) {
  const out = {};
  if (s) for (const o of paceTable(s, 'quali', false).rows) if (o.rel != null) out[o.team.id] = o.rel;
  return out;
}
// The big four stay the big four: McLaren, Red Bull, Mercedes and Ferrari have the budgets to stay at the front
const BIG_FOUR = ['mclaren', 'redbull', 'mercedes', 'ferrari'];
/**
 * Next year's car order. Each car keeps most of its gap and drifts towards the rest of its tier: the big four (plus
 * any team that has climbed among them) at the front, everyone else behind. Now and then a midfield team finds a
 * concept that works and leaps into the top tier, where it can stay; a big team can have a bad year, but it recovers.
 */
function evolvePace(pace, teams, rnd) {
  const cur = Object.fromEntries(teams.map(t => [t.id, pace[t.id] ?? (D.BASE_PACE[t.id] ?? 0.9) * 1000]));
  const bigs = teams.filter(t => BIG_FOUR.includes(t.id));
  const topLine = bigs.length ? Math.max(...bigs.map(t => cur[t.id])) : 300;
  // a team that has climbed among them is top tier, though most slip back within a few years
  const climbed = Object.fromEntries(teams.filter(t => !BIG_FOUR.includes(t.id)).map(t => [t.id, cur[t.id] <= topLine && rnd() > 0.2]));
  const top = (t) => BIG_FOUR.includes(t.id) || !!climbed[t.id];
  const tierMean = (isTop) => avg(teams.filter(t => top(t) === isTop).map(t => cur[t.id])) ?? (isTop ? 150 : 650);
  const frontMean = tierMean(true), packMean = Math.max(tierMean(false), frontMean + 350);
  const out = {};
  for (const t of teams) {
    let v = cur[t.id] * 0.65 + (top(t) ? frontMean : packMean) * 0.35 + gauss(rnd) * (top(t) ? 110 : 150);
    if (!top(t) && rnd() < 0.01) v -= 450 + rnd() * 450; // a midfield team finds a concept that works: rare
    if (BIG_FOUR.includes(t.id) && rnd() < 0.04) v += 250 + rnd() * 250; // a big team gets a new car wrong
    out[t.id] = v;
  }
  const best = Math.min(...Object.values(out));
  for (const k of Object.keys(out)) out[k] = Math.max(0, out[k] - best);
  return out;
}
/** The age a driver turns during a year (44 means out), or null. */
function turnsIn(c, id, year) { const b = bornOf(c, id) || FEEDER[id]?.bornEst; return b ? year - +b.slice(0, 4) : null; }
/** Age on 1 March of a year, or null (F2/F3 drivers without a known birthday get an estimate). */
function ageIn(c, id, year) { const b = bornOf(c, id) || FEEDER[id]?.bornEst; return b ? year - +b.slice(0, 4) - (b.slice(5) > '03-01' ? 1 : 0) : null; }
/** A driver's roster entry for a simulated season, with a race number nobody else on that grid uses. */
function simEntry(c, id, used) {
  const e = { ...(driverEntry(c, id) || FEEDER[id] || { id, name: id, abbr: id.slice(-3), number: null }) };
  for (const k of ['feeder', 'series', 'note', 'nat', 'level', 'joined', 'bornEst', 'skill', 'generated', 'born']) delete e[k];
  if (!e.number || used.has(e.number)) e.number = [...Array(98).keys()].map(k => k + 2).find(k => !used.has(k) && k !== 17);
  used.add(e.number);
  return e;
}
/** One simulated season, every session of every round. */
function simSeason(c, year, index, teams, calendar, pace, skills, rnd) {
  const used = new Set(); const drivers = {};
  for (const t of teams) for (const d of t.drivers) if (d) drivers[d] = simEntry(c, d, used);
  const s = { index, year, historic: 'sim', teams, drivers, calendar: calendar.map(r => ({ ...r, off: false })), benched: null, playerTeamId: null, format: { practice: 'none' }, goals: [], weekends: {}, completed: true, transfers: [], simPace: pace };
  const sk = Object.fromEntries(teams.flatMap(t => t.drivers.filter(Boolean)).map(d => [d, skillOf(c, skills, d, year)]));
  for (const r of s.calendar) {
    const t = D.TRACKS[trackOf(r)];
    const base = (parseLap(t?.record?.[0]) || 90000) * 1.012, laps = t?.laps || 57;
    const field = teams.flatMap(tm => tm.drivers.filter(Boolean).map(d => ({ d, car: pace[tm.id] ?? 1200, sk: sk[d] })));
    const form = Object.fromEntries(field.map(x => [x.d, gauss(rnd) * 70]));
    const q = field.map(x => ({ d: x.d, t: base + x.car + x.sk + form[x.d] + gauss(rnd) * 90 + (rnd() < 0.03 ? 800 + rnd() * 1500 : 0) })).sort((a, b) => a.t - b.t);
    const grid = q.map(x => x.d);
    const Q = { results: q.map((x, i) => ({ d: x.d, lap: fmtLap(x.t), gap: i ? '+' + ((x.t - q[0].t) / 1000).toFixed(3) : '', st: 'FIN' })), fl: null, done: true };
    const race = (n, dnfP) => {
      const lapT = base * 1.045;
      const rows = field.map(x => {
        const per = lapT + x.car * 0.9 + x.sk + form[x.d] + gauss(rnd) * 60;
        const total = per * n + grid.indexOf(x.d) * 420 + Math.abs(gauss(rnd)) * 3500 * n / laps + (rnd() < 0.07 ? (8000 + rnd() * 20000) * n / laps : 0);
        return { d: x.d, per, total, out: rnd() < dnfP * (1 + x.car / 2500), fl: per - 900 + gauss(rnd) * 300 };
      });
      const fin = rows.filter(x => !x.out).sort((a, b) => a.total - b.total), outs = rows.filter(x => x.out).sort(() => rnd() - 0.5);
      const win = fin[0];
      const results = [...fin.map((x, i) => {
        const down = i ? Math.floor((x.total - win.total) / win.per) : 0;
        return { d: x.d, lap: '', gap: i === 0 ? fmtDur(win.total) : down ? '' : fmtDur(x.total - win.total, true), st: 'FIN', laps: down || '' };
      }), ...outs.map(x => ({ d: x.d, lap: '', gap: '', st: 'DNF', laps: '' }))];
      const flx = fin.slice(0, 12).sort((a, b) => a.fl - b.fl)[0];
      if (flx) results.find(x => x.d === flx.d).lap = fmtLap(flx.fl);
      return { results, fl: flx?.d || null, done: true };
    };
    const sessions = { Q, R: race(laps, 0.07) };
    if (r.sprint) sessions.SPR = race(Math.ceil(laps / 3), 0.025);
    s.weekends[r.id] = { sessions, notes: '', raceLength: 100 };
  }
  return s;
}
/** A driver who beat the car: finished well above it in the championship, or matched it and beat the teammate. */
function isTopDriver(s, id) {
  const st = seasonStatsCache(s); const ds = driverStandings(s, st); const cs = constructorStandings(s, st);
  const pos = ds.find(x => x.id === id)?.pos; const t = teamOf(s, id); if (!pos || !t) return false;
  const expect = (cs.find(x => x.team.id === t.id)?.pos || 6) * 2 - 0.5;
  const mate = t.drivers.find(d => d && d !== id); const matePos = ds.find(x => x.id === mate)?.pos ?? 99;
  return expect - pos >= 2.5 || (expect - pos >= -1 && pos < matePos);
}
/**
 * A driver's race pace against their teammate over their last two seasons (ms per lap, positive = slower), or null
 * without data. More than 0.3 s down is underperforming.
 */
function racePaceDeficit(c, id, upto) {
  let sum = 0, n = 0;
  for (const s of c.seasons.slice(0, upto + 1).filter(x => gridIds(x).includes(id)).slice(-2)) {
    const mate = teammateOf(s, id); if (!mate) continue;
    const g = teammateGaps(s, id, mate);
    if (g.r != null && g.rn >= 3) { sum += g.r * g.rn; n += g.rn; }
  }
  return n ? sum / n : null;
}
const UNDERPERFORM = 300; // ms per lap slower than the teammate, over two seasons
const UNDERPERFORM_YOUNG = 600; // the bar for a driver under 30: young drivers get time
const DROP_CHANCE = 0.4; // even then, most teams stick with their driver
/**
 * One winter of the driver market. Anyone who turns 44 this year retires first. Then, while your first season is
 * still more than two winters away (or with no `target` at all), the market moves on its own:
 * - drivers retire with age, more and more from 37 (and good drivers stop on their own terms: only a driver more than
 *   0.3 s a lap slower than the teammate over two seasons is dropped and left a free agent);
 * - drivers who beat their car move up to a top team, replacing a driver there who is underperforming or only just
 *   matching the car, who in turn takes the seat that was left (or is out, if he was well off the pace);
 * - now and then a midfield team does the same with a standout from further back.
 * With a `target` (the grid you laid out) everyone also moves towards it, all of it settled by the last winter.
 * F2 and F3 drivers fill whatever seats are left. Returns the new line-ups and the moves, as transfer steps.
 */
function simWinter(c, prevS, year, lineup, target, rnd) {
  lineup = Object.fromEntries(Object.entries(lineup).map(([t, ds]) => [t, [...ds]]));
  const steps = [];
  const teamIn = (d) => Object.keys(lineup).find(t => lineup[t].includes(d)) || null;
  const onGrid = () => new Set(Object.values(lineup).flat().filter(Boolean));
  const step = (driver, from, to, replaces = null) => steps.push({ kind: 'move', driver, from, to, replaces, until: to === 'free' || to === 'retire' ? null : year + Math.floor(rnd() * 3), prevUntil: null, wasPending: false });
  const leave = (d, to) => { const t = teamIn(d); if (!t) return; lineup[t][lineup[t].indexOf(d)] = null; step(d, t, to); };
  const join = (d, t, replaces = null) => {
    const from = teamIn(d); if (from) lineup[from][lineup[from].indexOf(d)] = null;
    let k = replaces ? lineup[t].indexOf(replaces) : -1; if (k < 0) k = lineup[t].indexOf(null); if (k < 0) k = lineup[t].length < 2 ? lineup[t].length : 1;
    const out = lineup[t][k]; lineup[t][k] = d; step(d, from, t, out || null);
    return out;
  };
  const want = {}; if (target) for (const [t, ds] of Object.entries(target.lineup)) for (const d of ds) if (d) want[d] = t;
  const locked = (d) => d === PLAYER_ID || (c.type === 'myteam' && teamIn(d) === MYTEAM);
  const age = (d) => ageIn(c, d, year);
  const skills = driverSkills(c); const sk = (d) => skillOf(c, skills, d, year);
  const deficitCache = {}; const deficit = (d) => (deficitCache[d] ??= racePaceDeficit(c, d, prevS.index));
  const under = (d) => (deficit(d) ?? 0) > UNDERPERFORM;
  // off the pace enough to lose the seat: 0.3 s a lap over two seasons, or 0.6 s for a driver under 30
  const droppable = (d) => (deficit(d) ?? 0) > ((age(d) ?? 25) < 30 ? UNDERPERFORM_YOUNG : UNDERPERFORM);
  // a good driver who has to make way stops on his own terms once he's in his thirties; otherwise he's a free agent
  const exit = (d) => !droppable(d) && (age(d) ?? 0) >= 33 ? 'retire' : 'free';
  const rank = constructorStandings(prevS).map(x => x.team.id).filter(t => lineup[t]);
  const pool = driverPool(c, prevS);
  // free agents who have been out for more than three seasons, or turn 44, call it a day
  const lastRaced = {}; for (const s of c.seasons.filter(x => x.index <= prevS.index)) for (const [d, o] of Object.entries(seasonStatsCache(s))) if (o.starts) lastRaced[d] = s.year;
  for (const d of pool.free) if (d !== PLAYER_ID && (year - (lastRaced[d] ?? year) > 3 || (turnsIn(c, d, year) ?? 0) >= RETIRE_AGE)) step(d, null, 'retire');
  const winters = target ? Math.max(1, target.year - year + 1) : Infinity; // winters left before your first season
  // nobody races in the year they turn 44
  for (const t of Object.keys(lineup)) for (const d of [...lineup[t]]) if (d && d !== PLAYER_ID && (turnsIn(c, d, year) ?? 0) >= RETIRE_AGE) leave(d, 'retire');
  if (winters >= 3) {
    // retirement: from the mid-thirties, rising every year (drivers on your grid stay to race it)
    for (const t of Object.keys(lineup)) for (const d of [...lineup[t]]) {
      if (!d || locked(d) || want[d]) continue;
      const a = age(d) || 25;
      if ((a >= 37 && rnd() < 0.15 + 0.11 * (a - 37)) || (a >= 33 && a < 37 && rnd() < 0.04)) leave(d, 'retire');
    }
    // dropped: only for being well off the pace, and even then not always (the real field changes slowly)
    for (const t of Object.keys(lineup)) for (const d of [...lineup[t]]) if (d && !locked(d) && droppable(d) && rnd() < DROP_CHANCE) leave(d, 'free');
    // a rare comeback: a good free agent (one who matched or beat his last teammate) takes the seat of someone struggling
    if (rnd() < 0.12) {
      const back = pool.free.filter(d => !onGrid().has(d) && (age(d) ?? 30) < 40 && (deficit(d) ?? 999) <= 0 && (turnsIn(c, d, year) ?? 0) < RETIRE_AGE).sort((a, b) => sk(a) - sk(b))[0];
      const poor = back && Object.keys(lineup).flatMap(t => lineup[t]).filter(d => d && !locked(d) && !want[d] && under(d)).sort((a, b) => (deficit(b) ?? 0) - (deficit(a) ?? 0))[0];
      if (poor) { join(back, teamIn(poor), poor); step(poor, null, 'free'); }
    }
    // drivers who beat their car move up, replacing someone who doesn't
    const moved = new Set();
    const upgrade = (teams, from, chance) => {
      for (const t of teams) {
        if (rnd() > chance) continue;
        const ds = lineup[t].filter(d => d && !locked(d) && !moved.has(d));
        const weak = ds.filter(d => !isTopDriver(prevS, d) && (deficit(d) ?? 0) > 50).sort((a, b) => (deficit(b) ?? 0) - (deficit(a) ?? 0))[0];
        if (lineup[t].filter(Boolean).length === 2 && !weak) continue;
        const star = from(t).flatMap(u => lineup[u]).filter(d => d && !locked(d) && !moved.has(d) && isTopDriver(prevS, d) && !under(d) && (age(d) ?? 25) < 38).sort((a, b) => sk(a) - sk(b))[0];
        if (!star) continue;
        const home = teamIn(star); join(star, t, weak || null); moved.add(star);
        if (weak) { moved.add(weak); if (droppable(weak) && rnd() < DROP_CHANCE) step(weak, null, 'free'); else join(weak, home); } // he takes the seat that was left
      }
    };
    upgrade(rank.slice(0, 4), (t) => rank.slice(rank.indexOf(t) + 1), 0.22);
    upgrade(rank.slice(4, 8), (t) => rank.slice(Math.max(rank.indexOf(t) + 1, 6)), 0.15);
  }
  if (target) {
    // towards your grid: the rest of the field leaves, and everyone on it heads for their seat
    // (a driver who isn't on it only goes early if he's off the pace or old enough to stop; the rest go at the end)
    for (const t of Object.keys(lineup)) for (const d of [...lineup[t]]) if (d && !want[d] && (winters === 1 || droppable(d) || (age(d) || 0) >= 35) && rnd() < 1 / winters) leave(d, exit(d));
    for (const [d, t] of Object.entries(want)) if (lineup[t] && teamIn(d) !== t && rnd() < 1 / winters) {
      const victim = lineup[t].find(x => x && want[x] !== t) || null;
      if (victim || lineup[t].includes(null) || lineup[t].length < 2) {
        const from = teamIn(d);
        if (victim && winters > 1 && !droppable(victim) && !from) continue; // nobody's seat to give him yet: wait for a later winter
        const out = join(d, t, victim);
        // whoever made way takes the seat that was left, unless he was off the pace or it's the last winter
        if (out && !want[out]) { if (winters > 1 && !droppable(out) && from && lineup[from].includes(null)) join(out, from); else step(out, null, exit(out)); }
      }
    }
  }
  // empty seats: whoever is due at the team, then the quickest F2/F3 driver (free agents only if nobody else is left)
  const targetIds = Object.keys(want);
  const avail = (free = false) => [...pool.feeder, ...pool.custom, ...(free ? pool.free : [])].filter(d => !onGrid().has(d) && d !== PLAYER_ID && (age(d) ?? 25) < 40 && !steps.some(st => st.driver === d && st.to === 'retire') && (!want[d] || lineup[want[d]]));
  for (const t of rank.concat(Object.keys(lineup).filter(x => !rank.includes(x)))) {
    while (lineup[t].filter(Boolean).length < 2) {
      const due = target ? (target.lineup[t] || []).find(d => d && !onGrid().has(d)) : null;
      let cands = avail().filter(d => !want[d] || want[d] === t);
      if (!cands.length) cands = avail(true).filter(d => !want[d] || want[d] === t);
      cands = cands.map(d => [d, sk(d) + gauss(rnd) * 50]).sort((a, b) => a[1] - b[1]);
      const d = due || cands[Math.floor(rnd() * Math.min(3, cands.length))]?.[0];
      if (!d) break;
      join(d, t);
    }
  }
  return { lineup, steps };
}
/** Simulate the seasons between the real data and a career's first season, ending on the grid you laid out. */
function simulateGap(c, startYear, targetGrid, targetCal) {
  const target = { year: startYear, lineup: Object.fromEntries(targetGrid.map(t => [t.id, t.drivers.filter(Boolean)])) };
  const keep = new Set(Object.values(target.lineup).flat());
  let prev = c.seasons[c.seasons.length - 1];
  let lineup = realLineup(HIST_TO + 1);
  feederTick(c, HIST_TO + 1, new Set(Object.values(lineup).flat()), keep);
  let pace = Object.fromEntries(D.GRID_2026.map(t => [t.id, (D.BASE_PACE[t.id] ?? 0.9) * 1000]));
  for (let y = HIST_TO + 1; y < startYear; y++) {
    const rnd = mulberry(`${c.id}-${y}`);
    if (y > HIST_TO + 1) {
      const w = simWinter(c, prev, y, lineup, target, rnd);
      lineup = w.lineup;
      feederTick(c, y, new Set(Object.values(lineup).flat()), keep);
      const date = roundDate(prev, activeRounds(prev).slice(-1)[0]);
      prev.transfers.push(...w.steps.map((st, k) => ({ id: `sim-${y}-${k}`, at: activeRounds(prev).length, effective: 'next', createdAt: new Date((date?.getTime() || 0) + DAY).toISOString(), steps: [st], sim: true, before: null })));
      pace = evolvePace(prev.simPace || teamPaceOf(prev), prev.teams, rnd);
    }
    const tpl = y === 2026 ? D.GRID_2026 : prev.teams;
    const teams = tpl.filter(t => lineup[t.id]).map(t => ({ id: t.id, name: t.name, color: t.color, drivers: lineup[t.id].slice(0, 2) }));
    const cal = (y === 2026 ? D.CAL_2026.map(([id, name, venue, sprint]) => ({ id, name, venue, sprint })) : targetCal.map(r => ({ id: r.id, name: r.name, venue: r.venue, sprint: r.sprint, ...(r.track ? { track: r.track } : {}) })));
    const s = simSeason(c, y, c.seasons.length, teams, cal, pace, driverSkills(c), rnd);
    c.seasons.push(s); prev = s;
  }
  // the last winter: everyone takes their seat for your first season
  const w = simWinter(c, prev, startYear, lineup, { ...target, year: startYear }, mulberry(`${c.id}-${startYear}`));
  feederTick(c, startYear, keep);
  const date = roundDate(prev, activeRounds(prev).slice(-1)[0]);
  // the winter's moves, plus joining a team that's new on your grid and leaving for anyone not on it
  const was = (d) => Object.keys(lineup).find(u => lineup[u].includes(d)) || null;
  const steps = [...w.steps];
  for (const t of targetGrid) if (!lineup[t.id]) for (const d of t.drivers) if (d && d !== PLAYER_ID) steps.push({ kind: 'move', driver: d, from: was(d), to: t.id, replaces: null, until: startYear + 1, prevUntil: null, wasPending: false });
  for (const d of Object.values(lineup).flat()) if (d && !keep.has(d) && !steps.some(x => x.driver === d)) steps.push({ kind: 'move', driver: d, from: was(d), to: (racePaceDeficit(c, d, prev.index) ?? 0) <= UNDERPERFORM && (ageIn(c, d, startYear) || 0) >= 33 ? 'retire' : 'free', replaces: null, until: null, prevUntil: null, wasPending: false });
  prev.transfers.push(...steps.map((st, k) => ({ id: `sim-${startYear}-${k}`, at: activeRounds(prev).length, effective: 'next', createdAt: new Date((date?.getTime() || 0) + DAY).toISOString(), steps: [st], sim: true, before: null })));
}

function playerDriver(c) {
  const p = c.profile;
  return { id: PLAYER_ID, name: `${p.first} ${p.last}`.trim(), abbr: p.abbr, number: +p.number, isPlayer: true };
}

/** A driver's roster entry from wherever Pitwall knows them (the real grid, your own drivers, earlier seasons). */
function driverEntry(c, id) {
  const cd = c.customDrivers?.find(x => x.id === id);
  if (cd) return { ...cd };
  for (let i = c.seasons.length - 1; i >= 0; i--) if (c.seasons[i].drivers[id]) return { ...c.seasons[i].drivers[id] };
  if (D.DRIVERS[id]) return { ...D.DRIVERS[id] };
  const g = c.generated?.[id] || FEEDER[id];
  if (g) return { id: g.id, name: g.name, abbr: g.abbr, number: g.number ?? null };
  return null;
}

/** Build the roster a season starts from, before the player is placed. */
function baseRoster(c, index, prev) {
  let out;
  const year = prev ? prev.year + 1 : c.startYear;
  const tpl = templateFor(year, c);
  if (!tpl && prev) {
    const teams = clone(prev.teams);
    const drivers = clone(prev.drivers);
    // put back the driver the player replaced last year, then take the player out
    for (const t of teams) {
      const i = t.drivers.indexOf(PLAYER_ID);
      if (i >= 0) t.drivers[i] = prev.benched && drivers[prev.benched] ? prev.benched : null;
    }
    out = { teams, drivers, calendar: clone(prev.calendar).map(r => ({ ...r })) };
    // past the real data the rest of the market moves on its own: retirements, top teams signing drivers who beat
    // their car, rookies from F2 and F3. The same moves every time for the same career and year.
    if (year > 2026) {
      const w = simWinter(c, prev, year, Object.fromEntries(teams.map(t => [t.id, [...t.drivers]])), null, mulberry(`${c.id}-${year}`));
      for (const t of teams) t.drivers = w.lineup[t.id];
      const used = new Set(Object.values(drivers).map(d => d.number));
      for (const d of teams.flatMap(t => t.drivers)) if (d && !drivers[d]) drivers[d] = simEntry(c, d, used);
      out.aiSteps = w.steps;
    }
  } else {
    // real life: that year's real grid (F1 25's for 2025 and 2026)
    const teams = tpl.grid.map(t => ({ ...t, drivers: [...t.drivers] }));
    if (c.type === 'myteam') addMyTeam(c, teams, prev);
    const drivers = {};
    for (const t of teams) for (const id of t.drivers) {
      const e = id && (tpl.drivers?.[id] || D.DRIVERS[id] || driverEntry(c, id));
      if (e) drivers[id] = { ...e, number: tpl.nums[id] ?? e.number };
    }
    for (const cd of c.customDrivers || []) drivers[cd.id] = { ...cd };
    const calendar = tpl.cal.map(([id, name, venue, sprint, track, date]) => ({ id, name, venue, sprint, off: false, ...(track ? { track } : {}), ...(date ? { date } : {}) }));
    out = { teams, drivers, calendar };
    // drivers your career retired stay retired, whatever they did in real life
    if (prev) for (const id of Object.keys(c.retired || {})) for (const t of out.teams) { const k = t.drivers.indexOf(id); if (k >= 0) t.drivers[k] = null; }
  }
  // your career's driver market carries over: moves signed for next season, and (onto a fresh real grid) last year's
  // moves too. Real seasons' moves are already in the real grid. (Your own moves aren't replayed here: you are placed
  // in your seat when the season starts.)
  for (const tr of prev && !isHist(prev) ? prev.transfers || [] : []) {
    if (tr.effective === 'next' || (tpl && tr.effective === 'now')) for (const m of tr.steps) if (m.driver !== PLAYER_ID) applyMove(c, out.teams, out.drivers, m);
  }
  if (c.type === 'myteam') { const t = out.teams.find(x => x.id === MYTEAM); if (t) Object.assign(t, myTeamRow(c), { drivers: t.drivers }); }
  return out;
}

/** One link of a transfer chain: the driver leaves their seat and takes one at `to` (or leaves the grid). */
function applyMove(c, teams, drivers, m) {
  if (m.kind === 'extend') return;
  for (const t of teams) { const k = t.drivers.indexOf(m.driver); if (k >= 0) t.drivers[k] = null; }
  const t = teams.find(x => x.id === m.to);
  if (!t) return; // free agent, retired, or a team that isn't on this grid
  let k = m.replaces ? t.drivers.indexOf(m.replaces) : -1;
  if (k < 0) k = t.drivers.findIndex(d => !d);
  if (k < 0) k = t.drivers.length < 2 ? t.drivers.length : 1;
  t.drivers[k] = m.driver;
  if (!drivers[m.driver]) { const e = driverEntry(c, m.driver); if (e) drivers[m.driver] = e; }
}

/* My Team: the player's own team takes APXGP's slot in 2025 and stays on as an extra team in 2026.
   As owner-driver you race for it alongside a teammate; as team principal you run it and sign both drivers. */
const MYTEAM = 'myteam';
const FREE_AGENTS = ['PER', 'BOT', 'LIN', 'DOO', 'HAY', 'PEA'];
const isPrincipal = (c) => c?.type === 'myteam' && c.myTeam?.role === 'principal';
function myTeamRow(c) { const m = c.myTeam; return { id: MYTEAM, name: m.name, color: m.color, color2: m.color2, custom: true }; }
function addMyTeam(c, teams, prev) {
  for (const x of ['apxgp', 'konnersport']) { const ax = teams.findIndex(t => t.id === x); if (ax >= 0) teams.splice(ax, 1); }
  const last = prev?.teams.find(t => t.id === MYTEAM)?.drivers.filter(d => d && d !== PLAYER_ID) || [];
  // keep last year's line-up, otherwise the drivers signed at setup
  const seats = isPrincipal(c) ? (last.length ? last : c.myTeam.seats || []).slice(0, 2) : [null, last[0] || c.myTeam.mate || null];
  // a driver signed from another team leaves a seat there for a reserve: someone who raced last season and is
  // without a seat (the usual 2025 reserves otherwise)
  const lastYear = prev ? Object.entries(seasonStatsCache(prev)).filter(([, o]) => o.starts).sort((a, b) => b[1].starts - a[1].starts).map(([id]) => id).filter(id => id !== PLAYER_ID) : [];
  for (const id of seats) if (id) for (const t of teams) {
    const k = t.drivers.indexOf(id);
    if (k < 0) continue;
    const used = new Set(teams.flatMap(x => x.drivers).concat(seats));
    t.drivers[k] = [...lastYear, ...(prev && prev.year < 2024 ? [] : FREE_AGENTS)].find(f => !used.has(f)) || null;
  }
  while (seats.length < 2) seats.push(null);
  teams.push({ ...myTeamRow(c), drivers: seats });
}
/* The number 1: last season's champion may run it; everyone else races their own number. */
/** The champion of the year before season s ({ id, year }), from your career or, before it, the real record. */
function titleHolderFor(c, s) {
  const prev = c.seasons[s.index - 1];
  if (prev) { const m = titleMath(prev, 'driver'); return m.decided && m.rows[0] ? { id: m.rows[0].id, year: prev.year } : null; }
  const id = Object.entries(D.DRIVER_BIO).find(([, b]) => b.titles?.includes(s.year - 1))?.[0];
  return id ? { id, year: s.year - 1 } : null;
}
/** Unless you choose, a real champion does what they did in real life (Hamilton kept 44), anyone else runs the 1. */
const usesNumberOne = (c, h) => !!h && (c.numberOne?.[h.year] ?? (H.seasons[h.year + 1]?.drivers[h.id] ? H.seasons[h.year + 1].drivers[h.id][1] === 1 : true));
/** A driver's own race number, the one they go back to without the number 1. */
function ownNumber(c, s, id) {
  if (id === PLAYER_ID) return +c.profile.number || null;
  const cd = c.customDrivers?.find(x => x.id === id); if (cd) return cd.number || null;
  if (id === 'VER') return s.year >= 2026 ? 3 : 33; // 33 until 2025; he chose 3 for 2026
  return D.DRIVERS[id]?.number ?? null;
}
/** Give every season's grid the right numbers. Returns true if anything changed. */
function syncNumbers(c) {
  let changed = false;
  for (const s of c?.seasons || []) {
    if (isHist(s)) continue; // real seasons keep their real numbers
    const h = titleHolderFor(c, s); const one = usesNumberOne(c, h) ? h.id : null;
    for (const [id, d] of Object.entries(s.drivers)) {
      const n = id === one ? 1 : ownNumber(c, s, id) ?? d.number;
      if (n != null && d.number !== n) { d.number = n; changed = true; }
    }
  }
  return changed;
}
/**
 * On the reigning champion's profile: whether they run the number 1. It shows for this season's number-1 holder
 * (last year's champion) and, once this season's title is decided, for the new champion's next season.
 */
function numberOneToggle(c, id) {
  const latest = latestSeason(); if (!latest) return '';
  const rows = [];
  const holder = titleHolderFor(c, latest);
  if (holder?.id === id) rows.push({ year: holder.year, season: latest.year });
  const m = titleMath(latest, 'driver');
  if (m.decided && m.rows[0]?.id === id && !c.seasons[latest.index + 1]) rows.push({ year: latest.year, season: latest.year + 1 });
  if (!rows.length) return '';
  const own = ownNumber(c, latest, id);
  return `<div class="panel"><div class="panel-b stack" style="gap:8px">${rows.map(r => `<label class="check"><input type="checkbox" data-ch="num-one" data-year="${r.year}" ${usesNumberOne(c, { year: r.year }) ? 'checked' : ''}>
    <span><b>Race with the number 1 in ${r.season}</b> <span class="muted">· ${r.year} world champion${own ? `. Otherwise #${own}` : ''}</span></span></label>`).join('')}</div></div>`;
}
/** Point PLAYER at the driver the pages follow: you, or your team's lead driver when you're the team principal. */
function syncPlayer() {
  const c = career();
  PLAYER = PLAYER_ID;
  if (!isPrincipal(c)) return;
  const seats = curSeason()?.teams.find(t => t.id === MYTEAM)?.drivers.filter(Boolean) || [];
  PLAYER = seats.includes(c.myTeam.lead) ? c.myTeam.lead : seats[0] || PLAYER_ID;
}
/** Push identity edits (name, colours) into every season's copy of the team. */
function syncMyTeam(c) {
  for (const s of c.seasons) { const t = s.teams.find(x => x.id === MYTEAM); if (t) Object.assign(t, myTeamRow(c), { drivers: t.drivers }); }
}

function placePlayer(season, c, teamId, seatDriverId) {
  const team = season.teams.find(t => t.id === teamId);
  let i = team.drivers.indexOf(seatDriverId);
  if (i < 0) i = team.drivers.findIndex(d => !d);
  if (i < 0) i = 1;
  season.benched = team.drivers[i] || null;
  team.drivers[i] = PLAYER_ID;
  season.drivers[PLAYER_ID] = playerDriver(c);
  season.playerTeamId = teamId;
}

function newSeason(c, index, { teamId, seatDriverId, goals, practice }) {
  const prev = c.seasons[index - 1];
  const base = baseRoster(c, index, prev);
  const s = {
    index, year: prev ? prev.year + 1 : c.startYear,
    teams: base.teams, drivers: base.drivers, calendar: base.calendar,
    benched: null, playerTeamId: null,
    format: { practice: practice || prev?.format?.practice || 'full' },
    goals: goals || [], weekends: {}, completed: false,
  };
  const taken = {};
  for (const id of gridIds(s)) { const d = s.drivers[id]; if (!d?.number) continue; if (taken[d.number] && !D.DRIVERS[id]) d.number = null; else taken[d.number] = id; }
  for (const id of gridIds(s)) { const d = s.drivers[id]; if (d && !d.number) { d.number = [...Array(98).keys()].map(k => k + 2).find(k => !taken[k] && k !== 17); taken[d.number] = id; } }
  if (isPrincipal(c)) s.playerTeamId = teamId; // you run the team; both seats are your signings
  else placePlayer(s, c, teamId, seatDriverId);
  // a new season moves the F2 and F3 fields on: whoever reached F1 is replaced by new talent
  feederTick(c, s.year, new Set(gridIds(s)));
  // the winter's other moves go on record in the season just finished, so the press covers them
  if (prev && base.aiSteps?.length) {
    const last = activeRounds(prev); const d = roundDate(prev, last[last.length - 1]);
    (prev.transfers ||= []).push(...base.aiSteps.map((st, k) => ({ id: `ai-${s.year}-${k}-${uid()}`, at: last.length, effective: 'next', createdAt: new Date((d?.getTime() || Date.now()) + DAY).toISOString(), steps: [st], ai: true, before: null })));
  }
  return s;
}

const teamOf = (s, did) => s.teams.find(t => t.drivers.includes(did)) || null;
/** The team a driver raced for at round index ri: today's line-up with this season's later mid-season moves undone. */
function teamAt(s, did, ri) {
  if (s.raceTeams) { const tid = s.raceTeams[activeRounds(s)[ri]?.id]?.[did]; if (tid) return s.teams.find(t => t.id === tid) || null; }
  let tid = teamOf(s, did)?.id ?? null;
  const later = (s.transfers || []).filter(tr => tr.effective === 'now' && tr.at > ri);
  for (let i = later.length - 1; i >= 0; i--) for (let j = later[i].steps.length - 1; j >= 0; j--) {
    const m = later[i].steps[j];
    if (m.kind !== 'extend' && m.driver === did) tid = m.from ?? null;
  }
  return tid ? s.teams.find(t => t.id === tid) || null : null;
}
const teamColor = (s, did) => teamOf(s, did)?.color || '#5E6A82';
const dName = (s, did) => s.drivers[did]?.name || did || '—';
const dAbbr = (s, did) => s.drivers[did]?.abbr || did || '—';
const gridIds = (s) => s.teams.flatMap(t => t.drivers).filter(Boolean);
const teammateOf = (s, did = PLAYER) => { const t = teamOf(s, did); return t ? t.drivers.find(x => x && x !== did) || null : null; };
const activeRounds = (s) => s.calendar.filter(r => !r.off);

const SESSION_LABEL = { FP1: 'Practice 1', FP2: 'Practice 2', FP3: 'Practice 3', FP: 'Practice', SQ: 'Sprint Qualifying', SPR: 'Sprint', Q: 'Qualifying', R: 'Race' };
const SESSION_SHORT = { FP1: 'FP1', FP2: 'FP2', FP3: 'FP3', FP: 'FP', SQ: 'SQ', SPR: 'Sprint', Q: 'Quali', R: 'Race' };
function sessionsFor(s, round) {
  const p = s.format.practice;
  const out = [];
  if (round.sprint) {
    if (p !== 'none') out.push('FP1');
    out.push('SQ', 'SPR', 'Q', 'R');
  } else {
    if (p === 'full') out.push('FP1', 'FP2', 'FP3');
    else if (p === 'short') out.push('FP');
    out.push('Q', 'R');
  }
  return out;
}
const isRaceKind = (k) => k === 'R' || k === 'SPR';

function weekend(s, roundId, create = false) {
  if (!s.weekends[roundId] && create) s.weekends[roundId] = { sessions: {}, notes: '' };
  return s.weekends[roundId] || null;
}
function sessionData(s, roundId, key, create = false) {
  const w = weekend(s, roundId, create);
  if (!w) return null;
  if (!w.sessions[key] && create) {
    w.sessions[key] = { results: gridIds(s).map(d => ({ d, lap: '', gap: '', st: 'FIN' })), fl: null, done: false };
  }
  const sd = w.sessions[key];
  if (sd && create && !sd.done) {
    // until a session has results, keep it in sync with roster edits
    const ids = new Set(gridIds(s));
    sd.results = sd.results.filter(r => ids.has(r.d));
    for (const id of ids) if (!sd.results.some(r => r.d === id)) sd.results.push({ d: id, lap: '', gap: '', st: 'FIN' });
  }
  return sd || null;
}
function fastestOf(sd) {
  if (!sd) return null;
  if (sd.fl) return sd.fl;
  let best = null, who = null;
  for (const r of sd.results) { const ms = parseLap(r.lap); if (ms != null && (best == null || ms < best)) { best = ms; who = r.d; } }
  return who;
}
function pointsFor(kind, pos, st, pts) {
  if (OUT.includes(st)) return 0;
  if (pts != null && pts !== '') return +pts; // real seasons carry their own points (old sprint scoring, fastest-lap points, half points)
  const table = kind === 'R' ? D.RACE_POINTS : kind === 'SPR' ? D.SPRINT_POINTS : [];
  return table[pos - 1] || 0;
}

/* ---------------------------------------------------------------- stats */
function emptyStat() { return { pts: 0, wins: 0, podiums: 0, poles: 0, fls: 0, dnfs: 0, starts: 0, finPos: [], qPos: [], best: null, bestQ: null, sprintWins: 0, sprintPts: 0, posCount: Array(30).fill(0), byRound: {} }; }

/** Stats for a season; `upto` counts only the first n rounds (standings as they stood before round n+1). */
function seasonStats(s, upto = Infinity) {
  const st = {};
  const teams = {};
  Object.defineProperty(st, 'teams', { value: teams, enumerable: false }); // per-team totals, kept out of the driver keys
  const get = (id) => (st[id] ||= emptyStat());
  for (const id of gridIds(s)) get(id);
  for (const [ri, r] of activeRounds(s).entries()) {
    if (ri >= upto) break;
    const w = s.weekends[r.id];
    if (!w) continue;
    const q = w.sessions.Q;
    if (q?.done) q.results.forEach((x, i) => {
      const o = get(x.d); const pos = i + 1;
      if (OUT.includes(x.st)) return;
      o.qPos.push(pos); o.bestQ = o.bestQ == null ? pos : Math.min(o.bestQ, pos);
      if (q.pole === undefined ? pos === 1 : q.pole === x.d) o.poles++; // real seasons: the official pole (who started first)
      (o.byRound[r.id] ||= {}).q = pos;
    });
    for (const k of ['SPR', 'R']) {
      const sd = w.sessions[k];
      if (!sd?.done) continue;
      const fl = k === 'R' ? fastestOf(sd) : null;
      sd.results.forEach((x, i) => {
        const o = get(x.d); const pos = i + 1;
        const pts = pointsFor(k, pos, x.st, x.pts);
        o.pts += pts;
        // constructors' points stay with the team the driver raced for that weekend, even after a move
        const tid = teamAt(s, x.d, ri)?.id;
        if (tid) { const T = (teams[tid] ||= { pts: 0, wins: 0, podiums: 0 }); T.pts += pts; if (k === 'R' && !OUT.includes(x.st)) { if (pos === 1) T.wins++; if (pos <= 3) T.podiums++; } }
        (o.byRound[r.id] ||= {});
        if (k === 'R') {
          if (x.st === 'DNS') { o.byRound[r.id].r = 'DNS'; return; }
          o.starts++;
          o.byRound[r.id].r = OUT.includes(x.st) ? x.st : pos;
          o.byRound[r.id].fl = fl === x.d;
          if (OUT.includes(x.st)) { o.dnfs++; return; }
          o.finPos.push(pos); o.posCount[pos - 1]++;
          o.best = o.best == null ? pos : Math.min(o.best, pos);
          if (pos === 1) o.wins++;
          if (pos <= 3) o.podiums++;
        } else {
          o.sprintPts += pts;
          o.byRound[r.id].s = OUT.includes(x.st) ? x.st : pos;
          if (pos === 1 && !OUT.includes(x.st)) o.sprintWins++;
        }
      });
      if (fl) get(fl).fls++;
    }
  }
  return st;
}

function driverStandings(s, stats = seasonStats(s)) {
  const ids = Object.keys(stats).filter(id => s.drivers[id]);
  ids.sort((a, b) => {
    const A = stats[a], B = stats[b];
    if (B.pts !== A.pts) return B.pts - A.pts;
    for (let i = 0; i < 30; i++) if (B.posCount[i] !== A.posCount[i]) return B.posCount[i] - A.posCount[i];
    return 0;
  });
  return ids.map((id, i) => ({ id, pos: i + 1, ...stats[id] }));
}
function constructorStandings(s, stats = seasonStats(s)) {
  const rows = s.teams.map(t => {
    if (stats.teams) { const T = stats.teams[t.id] || { pts: 0, wins: 0, podiums: 0 }; return { team: t, ...T }; }
    const ids = Object.keys(stats).filter(id => teamOf(s, id)?.id === t.id);
    return { team: t, pts: ids.reduce((a, id) => a + stats[id].pts, 0), wins: ids.reduce((a, id) => a + stats[id].wins, 0), podiums: ids.reduce((a, id) => a + stats[id].podiums, 0) };
  });
  rows.sort((a, b) => b.pts - a.pts || b.wins - a.wins);
  return rows.map((r, i) => ({ ...r, pos: i + 1 }));
}
function roundsDone(s) { return activeRounds(s).filter(r => s.weekends[r.id]?.sessions?.R?.done).length; }
function nextRound(s) { return activeRounds(s).find(r => !s.weekends[r.id]?.sessions?.R?.done) || null; }

function h2hCompare(seasons, a, b) {
  const out = { q: [0, 0], r: [0, 0], s: [0, 0], pts: [0, 0], wins: [0, 0], podiums: [0, 0], poles: [0, 0], fls: [0, 0], dnfs: [0, 0], qPos: [[], []], finPos: [[], []], best: [null, null], bestQ: [null, null], rounds: [] };
  for (const s of seasons) {
    const st = seasonStats(s);
    const A = st[a], B = st[b];
    [[A, 0], [B, 1]].forEach(([o, i]) => {
      if (!o) return;
      out.pts[i] += o.pts; out.wins[i] += o.wins; out.podiums[i] += o.podiums; out.poles[i] += o.poles; out.fls[i] += o.fls; out.dnfs[i] += o.dnfs;
      out.qPos[i].push(...o.qPos); out.finPos[i].push(...o.finPos);
      if (o.best != null) out.best[i] = out.best[i] == null ? o.best : Math.min(out.best[i], o.best);
      if (o.bestQ != null) out.bestQ[i] = out.bestQ[i] == null ? o.bestQ : Math.min(out.bestQ[i], o.bestQ);
    });
    for (const r of activeRounds(s)) {
      const ra = A?.byRound[r.id] || {}, rb = B?.byRound[r.id] || {};
      const num = (v) => typeof v === 'number' ? v : (v ? 99 : null);
      if (ra.q != null && rb.q != null) out.q[ra.q < rb.q ? 0 : 1]++;
      const xa = num(ra.r), xb = num(rb.r);
      if (xa != null && xb != null && !(xa === 99 && xb === 99)) out.r[xa < xb ? 0 : 1]++;
      const sa = num(ra.s), sb = num(rb.s);
      if (sa != null && sb != null && !(sa === 99 && sb === 99)) out.s[sa < sb ? 0 : 1]++;
      if (ra.r != null || rb.r != null) out.rounds.push({ label: `${s.year} ${r.name}`, short: r.id.toUpperCase(), a: ra.r, b: rb.r, aq: ra.q, bq: rb.q });
    }
  }
  return out;
}

/* ----------------------------------------------------------------- goals */
/** A goal is the team's or one driver's (yours, or one of your drivers in My Team). Older goals had no scope. */
const goalScope = (g) => g.scope || (D.GOAL_TYPES.find(x => x.id === g.type)?.scope === 'team' ? 'team' : 'driver');
function evalGoal(g, s) {
  const stats = seasonStatsCache(s);
  const d = g.driver && s.drivers[g.driver] ? g.driver : PLAYER;
  const me = stats[d] || emptyStat();
  const ds = driverStandings(s, stats);
  const myPos = ds.find(x => x.id === d)?.pos ?? null;
  const mate = teammateOf(s, d);
  const cs = constructorStandings(s, stats);
  const row = cs.find(x => x.team.id === s.playerTeamId) || { pts: 0, wins: 0, podiums: 0, pos: null };
  const t = +g.target || 0;
  const res = (value, ok, pct, text) => ({ value, ok, pct: Math.max(0, Math.min(100, pct)), text });
  const upTo = (have, want, unit) => res(have, have >= want, want ? have / want * 100 : 100, `${have} / ${want} ${unit}`);
  switch (g.type) {
    case 'champ_pos': return res(myPos, myPos != null && myPos <= t, myPos ? (myPos <= t ? 100 : Math.max(5, 100 - (myPos - t) * 12)) : 0, `Currently ${ord(myPos)} · target top ${t}`);
    case 'beat_teammate': {
      const mp = stats[mate]?.pts || 0;
      return res(me.pts - mp, me.pts > mp, me.pts + mp === 0 ? 50 : (me.pts / (me.pts + mp)) * 100, `${me.pts} pts vs ${dAbbr(s, mate)} ${mp} pts`);
    }
    case 'wins': return upTo(me.wins, t, 'wins');
    case 'podiums': return upTo(me.podiums, t, 'podiums');
    case 'poles': return upTo(me.poles, t, 'poles');
    case 'points': return upTo(me.pts, t, 'points');
    case 'quali_h2h': {
      const h = h2hCompare([s], d, mate);
      const tot = h.q[0] + h.q[1];
      return res(h.q[0], h.q[0] > h.q[1], tot ? h.q[0] / tot * 100 : 50, `${h.q[0]}–${h.q[1]} vs ${dAbbr(s, mate)}`);
    }
    case 'constructor_pos': { const p = row.pos; return res(p, p != null && p <= t, p ? (p <= t ? 100 : Math.max(5, 100 - (p - t) * 12)) : 0, `Team is ${ord(p)} · target top ${t}`); }
    case 'team_points': return upTo(row.pts, t, 'points');
    case 'team_wins': return upTo(row.wins, t, 'wins');
    case 'team_podiums': return upTo(row.podiums, t, 'podiums');
    case 'beat_team': {
      const o = cs.find(x => x.team.id === g.team);
      if (!o) return res(null, false, 0, 'That team is not on the grid');
      return res(row.pts - o.pts, row.pos != null && row.pos < o.pos, row.pts + o.pts ? row.pts / (row.pts + o.pts) * 100 : 50, `${row.pts} pts vs ${o.team.name} ${o.pts} pts`);
    }
    default: return res(null, !!g.done, g.done ? 100 : 0, g.done ? 'Marked as achieved' : 'Tick when achieved');
  }
}
function goalTitle(g, s = curSeason()) {
  const gt = D.GOAL_TYPES.find(x => x.id === g.type);
  let txt;
  if (g.type === 'custom') txt = g.text || 'Custom goal';
  else if (g.type === 'beat_team') txt = `Finish ahead of ${(s?.teams.find(x => x.id === g.team) || teamMeta(career(), g.team))?.name || 'a rival team'}`;
  else if (g.type === 'champ_pos' || g.type === 'constructor_pos') txt = `${gt.label} ${g.target}`;
  else if (gt?.needsTarget) txt = `${g.target} ${gt.unit === 'points' ? (goalScope(g) === 'team' ? 'constructors’ points' : 'championship points') : gt.label.toLowerCase()}`;
  else txt = gt?.label || g.type;
  return g.driver && g.driver !== PLAYER_ID && goalScope(g) === 'driver' && s ? `${lastName(dName(s, g.driver))}: ${txt}` : txt;
}
/** The season's goals on the dashboard: the team's, then the drivers'. */
function goalsPanel(c, s) {
  const done = roundsDone(s);
  const row = (g) => { const e = evalGoal(g, s); return `<div class="goal">
    <div><div style="font-weight:600">${esc(goalTitle(g, s))}</div><div class="muted" style="font-size:12px">${esc(e.text)}</div></div>
    <div class="row">${g.type === 'custom' ? `<label class="check"><input type="checkbox" data-ch="goal-done" data-id="${g.id}" ${g.done ? 'checked' : ''}> Done</label>` : `<span class="status-dot ${e.ok ? 'ok' : done ? 'warn' : ''}"></span><span class="muted" style="font-size:12px">${e.ok ? 'On target' : done ? 'Behind' : 'Not started'}</span>`}</div>
    <div class="bar-track"><div class="bar-fill ${e.ok ? 'ok' : ''}" style="width:${e.pct}%"></div></div></div>`; };
  const team = s.goals.filter(g => goalScope(g) === 'team'), drv = s.goals.filter(g => goalScope(g) !== 'team');
  return `<div class="panel"><div class="panel-h"><h2>${s.year} goals</h2><button class="btn sm" data-act="edit-goals">Edit goals</button></div>
    ${s.goals.length ? `${team.length ? `<div class="panel-b"><span class="label">Team</span>${team.map(row).join('')}</div>` : ''}${drv.length ? `<div class="panel-b" ${team.length ? 'style="border-top:1px solid var(--line)"' : ''}><span class="label">${isPrincipal(c) ? 'Drivers' : 'You'}</span>${drv.map(row).join('')}</div>` : ''}`
      : `<div class="empty">No goals set for ${s.year}.<button class="btn sm" data-act="edit-goals">Set goals</button></div>`}</div>`;
}

/* --------------------------------------------------------------- render */
/* ---------------------------------------------------------------- themes */
function mixHex(a, b, t) {
  const p = (h) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const A = p(a), B = p(b);
  return '#' + A.map((v, i) => hex2(Math.round(v + (B[i] - v) * t))).join('');
}
/** A theme for a team we have no preset for (your own team, or a renamed one): derived from its colours. */
function themeFromTeam(t) {
  return { name: t.name, accent: t.color, accent2: t.color2 || '#FFFFFF', base: mixHex('#090B10', t.color, 0.07) };
}
function teamTheme(c, s, teamId) {
  const t = s?.teams.find(x => x.id === teamId);
  if (teamId === MYTEAM && c?.myTeam) return themeFromTeam(c.myTeam);
  if (D.THEMES[teamId]) return { ...D.THEMES[teamId], accent: t?.color || D.THEMES[teamId].accent };
  return t ? themeFromTeam(t) : D.THEMES.classic;
}
function activeTheme() {
  const pref = state.prefs?.theme || 'auto';
  const c = career(); const s = curSeason();
  if (pref === 'auto') return s ? teamTheme(c, s, s.playerTeamId) : D.THEMES.classic;
  if (pref === MYTEAM) return c?.myTeam ? themeFromTeam(c.myTeam) : D.THEMES.classic;
  return D.THEMES[pref] || D.THEMES.classic;
}
const THEME_VARS = ['--bg', '--panel', '--panel-2', '--panel-3', '--line', '--rail'];
function applyTheme() {
  const th = activeTheme();
  const st = document.documentElement.style;
  st.setProperty('--team', th.accent);
  st.setProperty('--team-ink', contrastInk(th.accent));
  st.setProperty('--team-2', th.accent2);
  if (!th.base) { THEME_VARS.forEach(v => st.removeProperty(v)); return; }
  // lift the panels from the team's dark base, with a hint of the accent so they read as one palette
  const lift = mixHex('#FFFFFF', th.accent, 0.3);
  const vals = [th.base, mixHex(th.base, lift, 0.045), mixHex(th.base, lift, 0.075), mixHex(th.base, lift, 0.11), mixHex(th.base, lift, 0.155), mixHex(th.base, '#000000', 0.35)];
  THEME_VARS.forEach((v, i) => st.setProperty(v, vals[i]));
}

function render() {
  renderGen++;
  syncPlayer();
  applyTheme();
  const main = $('#main');
  const keepScroll = main.dataset.view === viewKey();
  const top = main.scrollTop;
  $('#rail').innerHTML = renderRail();
  $('#topbar').innerHTML = renderTopbar();
  main.innerHTML = (ui.view === 'setup' ? '' : gameNoticeHtml()) + renderView();
  main.dataset.view = viewKey();
  main.scrollTop = keepScroll ? top : 0;
}
const viewKey = () => `${ui.view}|${ui.round}|${ui.session}|${ui.seasonIdx}|${ui.driverId}|${ui.trackId}|${ui.teamId}`;

const NAV = [
  ['dashboard', 'Dashboard', 'home'],
  ['calendar', 'Season', 'flag'],
  ['standings', 'Standings', 'trophy'],
  ['now', 'Current Weekend', 'flag'],
  ['forecast', 'Title Forecast', 'forecast'],
  ['performance', 'Performance', 'gauge'],
  ['stories', 'Stories', 'news'],
  ['transfers', 'Transfers', 'swap'],
  ['h2h', 'Head to Head', 'vs'],
  ['stats', 'Career Stats', 'stats'],
  ['drivers', 'Drivers', 'helmet'],
  ['teams', 'Teams', 'garage'],
  ['tracks', 'Circuits', 'track'],
  ['hof', 'Hall of Fame', 'laurel'],
  ['records', 'Records', 'medal'],
  ['media', 'Media', 'mic'],
  ['settings', 'Settings', 'gear'],
];
const navActive = () => ({ weekend: 'calendar', driver: 'drivers', track: 'tracks', team: 'teams', review: 'stats' }[ui.view] || ui.view);
const setNavOpen = (on) => document.body.classList.toggle('nav-open', on);

/** Small screens: a bar with the menu button and the page name; the rail slides in as a drawer. */
function renderTopbar() {
  const c = career();
  const here = NAV.find(n => n[0] === navActive());
  const title = ui.view === 'weekend' && ui.round ? (curSeason()?.calendar.find(r => r.id === ui.round)?.name || 'Weekend') : here ? here[1] : 'Pitwall';
  return `${c ? `<button class="icon-btn menu-btn" data-act="nav-toggle" aria-label="Menu">${ICON.menu}</button>` : ''}
    <div class="brand-mark" style="color:var(--team-ink)">${ICON.logo}</div>
    <div class="topbar-title">${esc(c ? title : 'Pitwall')}</div>`;
}

function renderRail() {
  const c = career();
  const s = curSeason();
  const nav = NAV.map(([id, label, ic]) => [id, label, ICON[ic]]);
  return `
    <div class="brand"><div class="brand-mark" style="color:var(--team-ink)">${ICON.logo}</div><div class="brand-name">PITWALL</div></div>
    ${c ? `<div class="career-pill">
      ${c.myTeam ? `<div class="row" style="gap:8px;flex-wrap:nowrap">${teamBadge(c.myTeam, 28)}<span class="label">My Team · ${esc(c.myTeam.name)}</span></div>` : '<span class="label">Driver Career</span>'}
      ${isPrincipal(c) ? `<span class="who"><span class="n" style="font-size:12px">TP</span>${esc(c.profile.first)} ${esc(c.profile.last)}</span>`
        : `<span class="who">${avatar(c, s, PLAYER, 26)}<span class="n">${esc(c.profile.number)}</span>${esc(c.profile.first)} ${esc(c.profile.last)}</span>`}
      <span class="muted" style="font-size:12px">${esc(s?.teams.find(t => t.id === s.playerTeamId)?.name || '')} · ${s?.year || ''}</span>
    </div>` : ''}
    ${c ? `<nav class="nav">${nav.map(([id, label, ic]) => `<button data-act="nav" data-view="${id}" class="${navActive() === id ? 'active' : ''}">${ic}<span>${label}</span></button>`).join('')}</nav>` : ''}
    <div class="rail-foot">
      ${state.careers.length > 1 ? `<label class="field"><span>Career save</span><select data-ch="switch-career">${state.careers.map(x => `<option value="${x.id}" ${x.id === state.activeCareerId ? 'selected' : ''}>${esc(x.profile.first)} ${esc(x.profile.last)} · ${x.seasons.length} season${x.seasons.length > 1 ? 's' : ''}</option>`).join('')}</select></label>` : ''}
      <button class="btn ghost sm" data-act="new-career">+ New career</button>
    </div>`;
}

function renderView() {
  if (ui.view === 'setup' || !career()) return renderSetup();
  switch (ui.view) {
    case 'calendar': return renderCalendar();
    case 'weekend': return renderWeekend();
    case 'standings': return renderStandings();
    case 'h2h': return renderH2H();
    case 'stats': return renderStats();
    case 'drivers': return renderDrivers();
    case 'driver': return renderDriver();
    case 'teams': return renderTeams();
    case 'team': return renderTeam();
    case 'forecast': return renderForecast();
    case 'now': return renderCurrentWeekend();
    case 'performance': return renderPerformance();
    case 'stories': return renderStories();
    case 'transfers': return renderTransfers();
    case 'tracks': return renderTracks();
    case 'track': return renderTrack();
    case 'myteam': ui.view = 'dashboard'; return renderDashboard();
    case 'hof': return renderHof();
    case 'records': return renderRecords();
    case 'review': return renderReview();
    case 'media': return renderMedia();
    case 'settings': return renderSettings();
    default: return renderDashboard();
  }
}

function seasonPicker(c, idx, act = 'pick-season') {
  if (c.seasons.length < 2) return '';
  if (c.seasons.length > 5) return `<select class="season-sel" data-ch="season-sel" data-to="${act}" style="width:auto" title="Season">${c.seasons.slice().reverse().map(s => `<option value="${s.index}" ${s.index === idx ? 'selected' : ''}>${s.year}${s.historic === 'sim' ? ' · simulated' : s.historic ? ' · real' : ''}</option>`).join('')}</select>`;
  return `<div class="seg">${c.seasons.map((s, i) => `<button data-act="${act}" data-idx="${i}" class="${i === idx ? 'on' : ''}">${s.year}</button>`).join('')}</div>`;
}

function drvCell(s, id, opts = {}) {
  return `<div class="drv">${avatar(career(), s, id, opts.size || 24)}
    <span class="ab">${esc(dAbbr(s, id))}</span><span class="nm">${esc(dName(s, id))}</span>
    ${opts.team ? `<span class="tm">${esc(teamOf(s, id)?.name || '')}</span>` : ''}</div>`;
}

/* --------------------------------------------------------------- pictures */
// Photos and logos you upload. Real drivers and teams share one set across every career;
// your own driver, custom drivers and My Team keep theirs on the career.
const imgStore = () => (state.images ||= { drivers: {}, teams: {} });
function driverPhoto(c, id) {
  if (id === PLAYER_ID) return c?.profile.photo || null;
  const cd = c?.customDrivers?.find(x => x.id === id);
  return cd ? cd.photo || null : state.images?.drivers?.[id] || null;
}
function setDriverPhoto(c, id, url) {
  if (id === PLAYER_ID) { c.profile.photo = url; return; }
  const cd = c.customDrivers?.find(x => x.id === id);
  if (cd) cd.photo = url;
  else if (url) imgStore().drivers[id] = url;
  else delete imgStore().drivers[id];
}
const teamLogoUrl = (c, id) => id === MYTEAM ? c?.myTeam?.logo || null : state.images?.teams?.[id] || null;
function initials(name) {
  const w = String(name || '?').replace(/[^\p{L}\s-]/gu, '').split(/[\s-]+/).filter(Boolean);
  return ((w[0]?.[0] || '?') + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase();
}
/** Round driver picture: the uploaded photo, or initials in the team's colours. */
function avatar(c, s, id, size = 28) {
  const col = (s && teamOf(s, id)?.color) || '#5E6A82';
  const url = driverPhoto(c, id);
  const st = `width:${size}px;height:${size}px;--c:${col}`;
  if (url) return `<img class="avatar" src="${esc(url)}" alt="" style="${st}">`;
  const name = id === PLAYER_ID && c ? `${c.profile.first} ${c.profile.last}` : s?.drivers[id]?.name || D.DRIVERS[id]?.name || c?.customDrivers?.find(x => x.id === id)?.name || D.HIST_DRIVERS[id] || id;
  return `<span class="avatar gen" style="${st};color:${contrastInk(col)};font-size:${Math.max(9, Math.round(size * 0.36))}px" aria-hidden="true">${esc(initials(name))}</span>`;
}
/** Team logo: the uploaded one, or a badge in the team's colours. */
function teamLogo(c, t, size = 22) {
  if (!t) return '';
  const bio = D.TEAM_BIO[t.id];
  const meta = t.id === MYTEAM && c?.myTeam ? { ...t, ...c.myTeam } : { ...t, short: bio?.short, color2: bio?.color2 };
  return teamBadge({ ...meta, logo: teamLogoUrl(c, t.id) }, size);
}

function readImage(file, { max = 256, square = false, type = 'image/png' } = {}) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) { reject(new Error('Pick an image file (PNG, JPG, SVG or WebP)')); return; }
    const fr = new FileReader();
    fr.onerror = () => reject(new Error('That file could not be read'));
    fr.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('That image could not be read'));
      img.onload = () => {
        const w0 = img.naturalWidth || max, h0 = img.naturalHeight || max;
        // photos: crop to a square, keeping the top of portrait shots where the face usually is
        const side = Math.min(w0, h0);
        const [sx, sy, sw, sh] = square ? [(w0 - side) / 2, 0, side, side] : [0, 0, w0, h0];
        const k = Math.min(1, max / Math.max(sw, sh));
        const cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(sw * k)); cv.height = Math.max(1, Math.round(sh * k));
        cv.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, cv.width, cv.height);
        resolve(cv.toDataURL(type, 0.9));
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}
const readLogo = (file) => readImage(file, { max: 256 });
const readPhoto = (file) => readImage(file, { max: 220, square: true, type: 'image/webp' });

/** Upload / remove controls for a driver photo or team logo. kind: driver | team | setup */
function pictureControls(kind, id, has, label = kind === 'team' ? 'logo' : 'photo') {
  return `<label class="btn sm file-btn">${ICON.camera} ${has ? 'Replace' : 'Upload'} ${label}<input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp,image/gif" data-ch="pic-upload" data-kind="${kind}" data-id="${esc(id)}" hidden></label>
    ${has ? `<button class="btn sm ghost danger" data-act="pic-clear" data-kind="${kind}" data-id="${esc(id)}">Remove</button>` : ''}`;
}
function photoModal(id) { ui.modal = { kind: 'photo', id }; drawPhotoModal(); }
function drawPhotoModal() {
  const c = career(); const s = latestSeason(); const id = ui.modal.id;
  const name = id === PLAYER_ID ? `${c.profile.first} ${c.profile.last}` : allKnownDrivers(c, s)[id]?.name || id;
  const has = !!driverPhoto(c, id);
  modal(`<div class="modal-h"><h2>Add a photo for ${esc(name)}</h2><button class="icon-btn" data-act="modal-close">${ICON.x}</button></div>
    <div class="modal-b"><div class="row" style="gap:18px;flex-wrap:nowrap">${avatar(c, s, id, 96)}
      <div class="stack" style="gap:10px"><p class="muted">Real drivers can be given photos from their profile page. Drivers you create need one from you: a square head-and-shoulders shot works best. Images are cropped to a square and kept in your save file.</p>
      <div class="row">${pictureControls('driver', id, has)}</div>
      <label class="row muted" style="gap:8px">Date of birth <input type="date" data-ch="dob" data-id="${id}" value="${esc(bornOf(c, id) || '')}" style="width:auto"></label>
      <span class="muted" style="font-size:12px">Used for ages and age records such as youngest winner.</span></div></div></div>
    <div class="modal-f"><button class="btn ${has ? 'primary' : 'ghost'}" data-act="modal-close">${has ? 'Done' : 'Skip for now'}</button></div>`);
}

/* ------------------------------------------------------------- dashboard */
function renderDashboard() {
  const c = career(); const s = curSeason();
  if (c.type === 'myteam' && c.myTeam) return renderMyTeam();
  const stats = seasonStats(s);
  const ds = driverStandings(s, stats);
  const me = stats[PLAYER] || emptyStat();
  const myRow = ds.find(x => x.id === PLAYER);
  const team = s.teams.find(t => t.id === s.playerTeamId);
  const mate = teammateOf(s);
  const nr = nextRound(s);
  const done = roundsDone(s);
  const total = activeRounds(s).length;
  const arch = D.ARCHETYPES.find(a => a.id === c.profile.archetype);
  const leader = ds[0];
  const gap = myRow && leader ? leader.pts - myRow.pts : 0;
  const h = h2hCompare([s], PLAYER, mate);
  const lastArticle = [...c.media].reverse().find(m => m.article && m.seasonIdx === s.index);
  const top = ds.slice(0, 6);
  if (myRow && !top.some(x => x.id === PLAYER)) top.push(myRow);

  return `<div class="page">
    <section class="hero">
      <div class="stripes"></div>
      <div class="hero-pic">${avatar(c, s, PLAYER, 96)}<div class="big-num">${esc(s.drivers[PLAYER]?.number ?? c.profile.number)}</div></div>
      <div style="position:relative;z-index:1;min-width:0">
        <span class="label">${s.year} season · ${esc(team?.name)}${isPrincipal(c) ? ' · lead driver' : ''}</span>
        <div class="name">${esc(dName(s, PLAYER))}</div>
        <div class="meta">${isPrincipal(c) ? `<span>Team principal: ${esc(c.profile.first)} ${esc(c.profile.last)}</span>` : `<span>${esc(arch?.name || '')}</span>`}<span>Teammate: ${esc(dName(s, mate))}</span>${(() => { const a = !isPrincipal(c) && archRivalOf(c, s); return a ? `<span>Archrival: ${esc(dName(s, a))}</span>` : ''; })()}</div>
      </div>
      <div class="next-card">
        ${nr ? `<span class="label">Next up · Round ${activeRounds(s).indexOf(nr) + 1} of ${total}</span>
          <div style="font-family:var(--font-display);font-size:20px;font-weight:600">${esc(nr.name)} ${nr.sprint ? '<span class="tag sprint">Sprint</span>' : ''}</div>
          <span class="muted">${esc(nr.venue)} · ${weekendTxt(s, nr)}</span>
          <button class="btn primary" data-act="open-round" data-round="${nr.id}">Log weekend</button>`
        : `<span class="label">Season complete</span><div style="font-family:var(--font-display);font-size:20px;font-weight:600">All ${total} rounds logged</div>
           <button class="btn" data-act="open-review" data-idx="${s.index}">Season review</button>
           ${s.index === c.seasons.length - 1 ? `<button class="btn primary" data-act="next-season">Start ${s.year + 1} season</button>` : ''}`}
      </div>
    </section>

    <div class="tiles">
      <div class="tile"><span class="label">Championship</span><span class="v">${myRow && done ? 'P' + myRow.pos : '–'}<small> / ${ds.length}</small></span></div>
      <div class="tile"><span class="label">Points</span><span class="v">${me.pts}<small>${gap > 0 ? ` −${gap}` : ''}</small></span></div>
      <div class="tile"><span class="label">Wins</span><span class="v">${me.wins}</span></div>
      <div class="tile"><span class="label">Podiums</span><span class="v">${me.podiums}</span></div>
      <div class="tile"><span class="label">Poles</span><span class="v">${me.poles}</span></div>
      <div class="tile"><span class="label">Rounds</span><span class="v">${done}<small> / ${total}</small></span></div>
    </div>

    <div class="grid-main">
      <div class="stack">
        ${goalsPanel(c, s)}

        <div class="panel">
          <div class="panel-h"><h2>Recent results</h2><button class="btn sm ghost" data-act="nav" data-view="calendar">Full calendar</button></div>
          <div class="panel-b tight table-wrap"><table>
            <thead><tr><th>Rnd</th><th>Grand Prix</th><th class="num">Quali</th><th class="num">Sprint</th><th class="num">Race</th><th class="num">Pts</th></tr></thead>
            <tbody>${(() => {
              const rows = activeRounds(s).map((r, i) => ({ r, i, br: me.byRound[r.id] })).filter(x => x.br && (x.br.r != null || x.br.q != null)).slice(-6).reverse();
              if (!rows.length) return `<tr><td colspan="6"><div class="empty">No sessions logged yet.</div></td></tr>`;
              return rows.map(({ r, i, br }) => {
                const w = s.weekends[r.id];
                const pts = ['R', 'SPR'].reduce((a, k) => { const sd = w.sessions[k]; if (!sd?.done) return a; const ix = sd.results.findIndex(x => x.d === PLAYER); return a + (ix >= 0 ? pointsFor(k, ix + 1, sd.results[ix].st, sd.results[ix].pts) : 0); }, 0);
                return `<tr data-act="open-round" data-round="${r.id}" style="cursor:pointer"><td class="muted num">${i + 1}</td><td>${esc(r.name)}</td><td class="num">${br.q ? 'P' + br.q : '–'}</td><td class="num">${br.s != null ? (typeof br.s === 'number' ? 'P' + br.s : br.s) : '–'}</td><td class="num">${br.r != null ? (typeof br.r === 'number' ? `<b>P${br.r}</b>` : `<span class="tag dnf">${br.r}</span>`) : '–'}${br.fl ? ' <span class="fl-tag">FL</span>' : ''}</td><td class="num">${pts}</td></tr>`;
              }).join('');
            })()}</tbody></table></div>
        </div>
      </div>

      <div class="stack">
        <div class="panel">
          <div class="panel-h"><h2>Drivers' standings</h2><button class="btn sm ghost" data-act="nav" data-view="standings">All</button></div>
          <div class="panel-b tight"><table><tbody>${top.map(x => `<tr class="${x.id === PLAYER ? 'me' : ''}"><td class="pos ${x.pos <= 3 ? 'p' + x.pos : ''}">${x.pos}</td><td>${drvCell(s, x.id)}</td><td class="num"><b>${x.pts}</b></td></tr>`).join('')}</tbody></table></div>
        </div>
        ${rivalryPanel(c, s)}
        <div class="panel">
          <div class="panel-h"><h2>Teammate battle</h2><button class="btn sm ghost" data-act="nav" data-view="h2h">Details</button></div>
          <div class="panel-b stack">
            ${miniH2H('Qualifying', h.q[0], h.q[1], s, mate)}
            ${miniH2H('Race', h.r[0], h.r[1], s, mate)}
            ${miniH2H('Points', h.pts[0], h.pts[1], s, mate)}
          </div>
        </div>
        <div class="panel">
          <div class="panel-h"><h2>Latest from the paddock</h2><button class="btn sm ghost" data-act="nav" data-view="media">Media</button></div>
          ${lastArticle ? `<div class="article"><span class="outlet">${esc(lastArticle.article.outlet)}</span><div class="headline" style="font-size:18px">${esc(lastArticle.article.headline)}</div><div class="body" style="font-size:13px">${esc(lastArticle.article.summary || lastArticle.article.body?.[0] || '')}</div></div>`
          : `<div class="empty">No media sessions yet. Face the press after a qualifying or race.<button class="btn sm" data-act="new-media">Start a media session</button></div>`}
        </div>
      </div>
    </div>
  </div>`;
}
function miniH2H(label, a, b, s, mate) {
  const tot = a + b || 1;
  return `<div style="display:grid;gap:6px">
    <div class="row" style="justify-content:space-between"><span><b class="tnum">${a}</b> <span class="muted">You</span></span><span class="label">${label}</span><span><span class="muted">${esc(dAbbr(s, mate))}</span> <b class="tnum">${b}</b></span></div>
    <div class="h2h-bar"><i style="--c:var(--team);width:${a / tot * 100}%"></i><i style="--c:var(--panel-3);width:${b / tot * 100}%;background:var(--dim)"></i></div>
  </div>`;
}

/* -------------------------------------------------------------- calendar */
function renderCalendar() {
  const c = career(); const s = curSeason();
  const stats = seasonStats(s);
  const me = stats[PLAYER] || emptyStat();
  const nr = nextRound(s);
  const rounds = activeRounds(s);
  const isLatest = s.index === c.seasons.length - 1;
  return `<div class="page">
    <div class="page-head">
      <div><h1>${s.year} Calendar</h1><div class="sub">${rounds.length} rounds · ${rounds.filter(r => r.sprint).length} sprint weekends · ${roundsDone(s)} logged</div></div>
      <div class="row">${seasonPicker(c, s.index)}${roundsDone(s) ? `<button class="btn" data-act="open-review" data-idx="${s.index}">Season review</button>` : ''}${isLatest ? `<button class="btn ${nr ? '' : 'primary'}" data-act="next-season">Start ${s.year + 1} season</button>` : ''}</div>
    </div>
    <div class="rounds">${rounds.map((r, i) => {
      const w = s.weekends[r.id];
      const keys = sessionsFor(s, r);
      const doneN = keys.filter(k => w?.sessions[k]?.done).length;
      const br = me.byRound[r.id] || {};
      const isDone = w?.sessions?.R?.done;
      return `<button class="round ${nr?.id === r.id ? 'is-next' : ''}" data-act="open-round" data-round="${r.id}">
        <div class="row" style="justify-content:space-between"><span class="rn">Round ${i + 1}</span>
        <span class="row" style="gap:6px">${r.sprint ? '<span class="tag sprint">Sprint</span>' : ''}${isDone ? '<span class="tag done">Done</span>' : nr?.id === r.id ? '<span class="tag next">Next</span>' : doneN ? `<span class="tag">${doneN}/${keys.length}</span>` : ''}</span></div>
        <div><div class="gp">${countryFlag(D.TRACKS[trackOf(r)]?.country, 13)} ${esc(r.name)}</div><div class="muted" style="font-size:12px">${esc(r.venue)} · ${weekendTxt(s, r)}</div></div>
        <div class="res"><span>Q <b>${br.q ? 'P' + br.q : '–'}</b></span>${r.sprint ? `<span>Spr <b>${br.s != null ? (typeof br.s === 'number' ? 'P' + br.s : br.s) : '–'}</b></span>` : ''}<span>Race <b>${br.r != null ? (typeof br.r === 'number' ? 'P' + br.r : br.r) : '–'}</b></span>${br.fl ? '<span class="fl-tag">FL</span>' : ''}</div>
      </button>`;
    }).join('')}</div>
  </div>`;
}

/* --------------------------------------------------------------- weekend */
function renderWeekend() {
  const s = curSeason();
  const rounds = activeRounds(s);
  const ri = rounds.findIndex(r => r.id === ui.round);
  const r = rounds[ri];
  if (!r) { ui.view = 'calendar'; return renderCalendar(); }
  if (isHist(s)) return renderHistWeekend(s, rounds, ri, r);
  const keys = sessionsFor(s, r);
  if (!keys.includes(ui.session)) ui.session = keys.find(k => !s.weekends[r.id]?.sessions[k]?.done) || keys[0];
  const key = ui.session;
  const sd = sessionData(s, r.id, key, true);
  const fl = fastestOf(sd);
  const race = isRaceKind(key);
  const w = weekend(s, r.id);
  const media = career().media.filter(m => m.seasonIdx === s.index && m.roundId === r.id);

  const copyOpts = keys.filter(k => k !== key && w.sessions[k]).map(k => `<option value="sess:${k}">Order from ${SESSION_LABEL[k]}</option>`).join('');
  const tapping = ui.tap && ui.tap.key === key;

  return `<div class="page">
    <div class="page-head">
      <div class="row" style="gap:14px">
        <button class="icon-btn" title="Previous round" data-act="open-round" data-round="${rounds[ri - 1]?.id || ''}" ${ri === 0 ? 'disabled style="opacity:.3"' : ''}>${ICON.left}</button>
        <div><span class="label">${s.year} · Round ${ri + 1} of ${rounds.length}</span><h1>${esc(r.name)} Grand Prix ${r.sprint ? '<span class="tag sprint" style="vertical-align:middle">Sprint weekend</span>' : ''}</h1><div class="sub">${esc(r.venue)} · ${weekendTxt(s, r)}</div></div>
        <button class="icon-btn" title="Next round" data-act="open-round" data-round="${rounds[ri + 1]?.id || ''}" ${ri === rounds.length - 1 ? 'disabled style="opacity:.3"' : ''}>${ICON.right}</button>
      </div>
      <div class="row">
        <div class="seg" title="Race distance you run in the game. Race pace is worked out per lap at this distance.">${RACE_LENGTHS.map(p => `<button data-act="race-length" data-v="${p}" class="${raceLength(s, r.id) === p ? 'on' : ''}">${p}%</button>`).join('')}</div>
        <span class="muted">${raceLaps(s, r.id)} laps</span>
        ${media.length ? `<span class="muted">${media.length} media session${media.length > 1 ? 's' : ''}</span>` : ''}
        ${D.TRACKS[trackOf(r)] ? `<button class="btn" data-act="open-track" data-track="${trackOf(r)}">${ICON.track} Circuit guide</button>` : ''}
        ${Object.values(w.sessions).some(x => x.done) ? `<button class="btn" data-act="weekend-card" data-round="${r.id}">${ICON.camera} Weekend summary</button>` : ''}
        <button class="btn" data-act="new-media" data-round="${r.id}">${ICON.mic} Media session</button>
      </div>
    </div>

    <div class="panel">
      <div class="session-tabs">${keys.map(k => `<button data-act="pick-session" data-key="${k}" class="${k === key ? 'on' : ''}">${w.sessions[k]?.done ? '<span class="ok"></span>' : ''}${SESSION_LABEL[k]}</button>`).join('')}</div>
      <div class="panel-h">
        <div class="row">
          <select data-ch="copy-order" style="width:auto"><option value="">Fill order…</option>${copyOpts}<option value="champ">Championship order</option><option value="grid">Team order</option></select>
          <button class="btn sm" data-act="tap-start">${tapping ? 'Tapping…' : 'Tap finishing order'}</button>
          <button class="btn sm" data-act="autofill-laps" title="Fill the empty lap times from the fastest one you entered">Auto-fill laps</button>
          <button class="btn sm ghost" data-act="clear-session">Clear times</button>
        </div>
        <div class="row">
          <label class="check"><input type="checkbox" data-ch="sess-done" ${sd.done ? 'checked' : ''}> Session complete</label>
        </div>
      </div>
      ${tapping ? renderTap(s, sd) : ''}
      <div class="panel-b tight table-wrap">
        <table class="res-table">
          <thead><tr><th></th><th>Pos</th><th>Driver</th><th>${key === 'Q' || key === 'SQ' ? 'Best lap' : 'Fastest lap'}</th><th title="Relative to the leader">${race ? 'Race time / gap to winner' : 'Gap to fastest'}</th>${race ? '<th title="Laps behind the winner">Laps down</th><th>Status</th><th class="num">Pts</th>' : ''}<th></th></tr></thead>
          <tbody>${sd.results.map((x, i) => {
            const isFl = x.d === fl;
            return `<tr draggable="true" data-drag="${i}" class="${x.d === PLAYER ? 'me' : ''} ${isFl ? 'is-fl' : ''}">
              <td class="handle" title="Drag to reorder">${ICON.grip}</td>
              <td class="pos ${i < 3 && !OUT.includes(x.st) ? 'p' + (i + 1) : ''}">${OUT.includes(x.st) ? `<span class="tag dnf">${x.st}</span>` : i + 1}</td>
              <td>${drvCell(s, x.d, { team: true })}</td>
              <td class="w-lap"><input type="text" inputmode="numeric" class="lap-in" placeholder="${i === 0 ? '1:23.456' : ''}" value="${esc(x.lap)}" data-ch="res-field" data-f="lap" data-i="${i}" data-mask="lap"></td>
              <td class="w-gap">${!race && i === 0 ? '<span class="muted" style="font-size:12px">Fastest</span>'
                : `<input type="text" inputmode="numeric" placeholder="${i === 0 ? '1:32:15.120' : i === 1 ? (race ? '+5.123' : '+0.123') : ''}" value="${esc(x.gap)}" data-ch="res-field" data-f="gap" data-i="${i}" data-mask="${race ? (i === 0 ? 'rtime' : 'rgap') : 'qgap'}" ${race && +x.laps > 0 ? 'disabled title="Lapped: the gap is not needed"' : ''}>`}</td>
              ${race ? `<td class="w-laps">${i === 0 ? '' : `<input type="number" min="0" max="99" placeholder="0" value="${+x.laps > 0 ? +x.laps : ''}" data-ch="res-field" data-f="laps" data-i="${i}">`}</td><td class="w-st"><select data-ch="res-field" data-f="st" data-i="${i}">${['FIN', ...OUT].map(o => `<option ${x.st === o ? 'selected' : ''}>${o}</option>`).join('')}</select></td>
              <td class="num">${pointsFor(key, i + 1, x.st, x.pts) || ''}</td>` : ''}
              <td><div class="row" style="gap:2px;flex-wrap:nowrap"><button class="icon-btn" title="Move up" data-act="move" data-i="${i}" data-dir="-1">${ICON.up}</button><button class="icon-btn" title="Move down" data-act="move" data-i="${i}" data-dir="1">${ICON.down}</button></div></td>
            </tr>`;
          }).join('')}</tbody>
        </table>
      </div>
      <div class="panel-h" style="border-top:1px solid var(--line);border-bottom:0">
        <div class="row"><span class="fl-tag">Fastest lap</span>
          ${fl ? `<b>${esc(dName(s, fl))}</b><span class="mono fl">${esc(sd.results.find(x => x.d === fl)?.lap || '')}</span>` : '<span class="muted">Enter lap times to detect it automatically</span>'}
        </div>
        <label class="row muted" style="font-size:13px">Override
          <select data-ch="fl-override" style="width:auto"><option value="">Auto (quickest time)</option>${sd.results.map(x => `<option value="${x.d}" ${sd.fl === x.d ? 'selected' : ''}>${esc(dName(s, x.d))}</option>`).join('')}</select>
        </label>
      </div>
    </div>

    ${sd.estimated ? `<div class="callout">Estimated from ${key === 'FP' || key.startsWith('FP') ? 'qualifying' : ''}: this practice session wasn't logged, so Pitwall filled it in, about seven tenths off each driver's qualifying time. Edit it like any session.</div>` : ''}
    ${key !== 'Q' && key !== 'SQ' ? strategyPanel(s, sd, key, r.id) : ''}

    <div class="panel">
      <div class="panel-h"><h3>Weekend notes</h3><span class="muted" style="font-size:12px">Setups, strategy, incidents. These feed into your media sessions.</span></div>
      <div class="panel-b"><textarea data-ch="notes" placeholder="e.g. Two-stop medium-hard-medium, lost a place to the safety car on lap 31.">${esc(w.notes || '')}</textarea></div>
    </div>
  </div>`;
}

/** A weekend of a real (or simulated) season: the results as they were, read-only. */
function renderHistWeekend(s, rounds, ri, r) {
  const w = s.weekends[r.id] || { sessions: {} };
  const keys = ['Q', 'SPR', 'R'].filter(k => w.sessions[k]?.done);
  if (!keys.includes(ui.session)) ui.session = keys[keys.length - 1];
  const key = ui.session; const sd = w.sessions[key]; const race = isRaceKind(key);
  const fl = race ? fastestOf(sd) : null;
  const t = D.TRACKS[trackOf(r)];
  return `<div class="page">
    <div class="page-head">
      <div class="row" style="gap:14px">
        <button class="icon-btn" title="Previous round" data-act="open-round" data-round="${rounds[ri - 1]?.id || ''}" ${ri === 0 ? 'disabled style="opacity:.3"' : ''}>${ICON.left}</button>
        <div><span class="label">${s.year} · Round ${ri + 1} of ${rounds.length} · ${s.historic === 'sim' ? 'Simulated season' : 'Real result'}</span><h1>${t ? countryFlag(t.country, 22) + ' ' : ''}${esc(r.name)} Grand Prix ${r.sprint ? '<span class="tag sprint" style="vertical-align:middle">Sprint weekend</span>' : ''}</h1><div class="sub">${esc(r.venue)} · ${weekendTxt(s, r)}${r.laps ? ` · ${r.laps} laps` : ''}</div></div>
        <button class="icon-btn" title="Next round" data-act="open-round" data-round="${rounds[ri + 1]?.id || ''}" ${ri === rounds.length - 1 ? 'disabled style="opacity:.3"' : ''}>${ICON.right}</button>
      </div>
      <div class="row">
        ${t ? `<button class="btn" data-act="open-track" data-track="${trackOf(r)}">${ICON.track} Circuit guide</button>` : ''}
      </div>
    </div>
    <div class="panel">
      <div class="session-tabs">${keys.map(k => `<button data-act="pick-session" data-key="${k}" class="${k === key ? 'on' : ''}"><span class="ok"></span>${SESSION_LABEL[k]}</button>`).join('')}</div>
      ${sd ? `<div class="panel-b tight table-wrap"><table class="res-table">
        <thead><tr><th>Pos</th><th>Driver</th><th>${race ? 'Fastest lap' : 'Best lap'}</th><th>${race ? 'Time / gap' : 'Gap to pole'}</th>${race ? '<th class="num">Pts</th>' : ''}</tr></thead>
        <tbody>${sd.results.map((x, i) => `<tr class="${x.d === fl ? 'is-fl' : ''}">
          <td class="pos ${i < 3 && !OUT.includes(x.st) ? 'p' + (i + 1) : ''}">${OUT.includes(x.st) ? `<span class="tag dnf">${x.st}</span>` : i + 1}</td>
          <td>${drvCell(s, x.d, { team: true })}</td>
          <td class="mono">${esc(x.lap || '')}${x.d === fl ? ' <span class="fl-tag">FL</span>' : ''}</td>
          <td class="mono">${OUT.includes(x.st) ? '' : +x.laps > 0 ? `+${x.laps} lap${+x.laps > 1 ? 's' : ''}` : esc(x.gap || (i === 0 && !race ? 'Pole' : ''))}</td>
          ${race ? `<td class="num">${pointsFor(key, i + 1, x.st, x.pts) || ''}</td>` : ''}</tr>`).join('')}</tbody>
      </table></div>` : '<div class="empty">No results for this weekend.</div>'}
      <div class="panel-b muted" style="font-size:12px;border-top:1px solid var(--line)">${s.historic === 'sim' ? 'Simulated before your career began. It cannot be edited.' : 'Real results, from before your career began. They cannot be edited.'}</div>
    </div>
  </div>`;
}

/* ---------------------------------------------------------- weekend card */
const loadImg = (src) => new Promise(res => { if (!src) { res(null); return; } const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
function hexA(hex, a) { const h = String(hex || '#5E6A82').replace('#', ''); return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`; }
/** A shareable 1200×675 summary of your weekend, drawn on a canvas. */
async function drawWeekendCard(c, s, r) {
  const W = 1200, H = 675;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const F = '"Bahnschrift", "DIN Alternate", "Barlow Condensed", "Roboto Condensed", "Arial Narrow", sans-serif';
  const rounds = activeRounds(s); const ri = rounds.indexOf(r);
  const ses = s.weekends[r.id]?.sessions || {};
  const team = teamOf(s, PLAYER); const col = team?.color || '#E10600';
  const col2 = (team && (team.id === MYTEAM ? c.myTeam?.color2 : D.TEAM_BIO[team.id]?.color2)) || '#FFFFFF';
  const text = (t, x, y, { size = 20, weight = 400, color = '#E7ECF5', align = 'left', font = F } = {}) => { g.font = `${weight} ${size}px ${font}`; g.fillStyle = color; g.textAlign = align; g.fillText(t, x, y); };
  const fit = (t, size, maxW, weight = 600) => { let sz = size; g.font = `${weight} ${sz}px ${F}`; while (sz > 12 && g.measureText(t).width > maxW) { sz -= 2; g.font = `${weight} ${sz}px ${F}`; } return sz; };
  const circlePic = async (id, x, y, rad, ring) => {
    const img = await loadImg(driverPhoto(c, id));
    const tc = teamColor(s, id);
    g.save(); g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.closePath();
    if (img) { g.clip(); const k = Math.max(rad * 2 / img.width, rad * 2 / img.height); g.drawImage(img, x - img.width * k / 2, y - rad, img.width * k, img.height * k); }
    else { const gr = g.createRadialGradient(x - rad * 0.4, y - rad * 0.5, rad * 0.1, x, y, rad); gr.addColorStop(0, mixHex(tc, '#FFFFFF', 0.35)); gr.addColorStop(1, mixHex(tc, '#000000', 0.35)); g.fillStyle = gr; g.fill();
      text(initials(id === PLAYER_ID ? `${c.profile.first} ${c.profile.last}` : dName(s, id)), x, y + rad * 0.3, { size: Math.round(rad * 0.8), weight: 700, color: contrastInk(tc), align: 'center' }); }
    g.restore();
    g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.lineWidth = ring; g.strokeStyle = tc; g.stroke();
  };
  // backdrop: dark base, team-colour wash and livery stripes
  g.fillStyle = '#0B0F17'; g.fillRect(0, 0, W, H);
  const wash = g.createLinearGradient(0, 0, W, 0); wash.addColorStop(0, hexA(col, 0.42)); wash.addColorStop(0.62, hexA(col, 0)); g.fillStyle = wash; g.fillRect(0, 0, W, H);
  g.save(); g.globalAlpha = 0.1; g.strokeStyle = col2; g.lineWidth = 6;
  for (let x = 820; x < W + 400; x += 26) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x - 300, H); g.stroke(); }
  g.restore();
  g.fillStyle = col; g.fillRect(0, 0, 14, H);
  // header
  text(`ROUND ${ri + 1} OF ${rounds.length}  ·  ${weekendTxt(s, r).toUpperCase()}`, 60, 70, { size: 20, weight: 600, color: '#8B97AF' });
  text(`${r.name} Grand Prix`, 60, 130, { size: fit(`${r.name} Grand Prix`, 60, 1080), weight: 700 });
  text(r.venue, 60, 168, { size: 24, color: '#8B97AF' });
  // you
  await circlePic(PLAYER, 150, 300, 86, 6);
  const me = dName(s, PLAYER);
  text(me, 262, 288, { size: fit(me, 46, 430, 700), weight: 700 });
  text(`${team?.name || ''}  ·  #${s.drivers[PLAYER]?.number ?? c.profile.number}`, 262, 326, { size: 22, color: '#8B97AF' });
  // results tiles
  const at = (k) => { const sd = ses[k]; if (!sd?.done) return null; const i = sd.results.findIndex(x => x.d === PLAYER); return i < 0 ? null : OUT.includes(sd.results[i].st) ? sd.results[i].st : 'P' + (i + 1); };
  const pts = ['SPR', 'R'].reduce((a, k) => { const sd = ses[k]; if (!sd?.done) return a; const i = sd.results.findIndex(x => x.d === PLAYER); return a + (i >= 0 ? pointsFor(k, i + 1, sd.results[i].st, sd.results[i].pts) : 0); }, 0);
  const before = driverStandings(s, seasonStats(s, ri)).find(x => x.id === PLAYER)?.pos;
  const after = driverStandings(s, seasonStats(s, ri + 1)).find(x => x.id === PLAYER)?.pos;
  const move = ri > 0 && before && after && before !== after ? (after < before ? `▲${before - after}` : `▼${after - before}`) : '';
  const tiles = [['QUALIFYING', at('Q') || '–'], ...(r.sprint ? [['SPRINT', at('SPR') || '–']] : []), ['RACE', at('R') || '–'], ['POINTS', `+${pts}`], ['CHAMPIONSHIP', after ? `P${after}` : '–', move]];
  const tw = 128, gap = 10; let tx = 60;
  for (const [lab, val, extra] of tiles) {
    g.fillStyle = 'rgba(18,24,38,0.85)'; g.fillRect(tx, 420, tw, 104); g.fillStyle = col; g.fillRect(tx, 420, tw, 3);
    text(lab, tx + 14, 448, { size: 14, weight: 600, color: '#8B97AF' });
    text(val, tx + 14, 500, { size: 42, weight: 700, color: val === 'P1' ? '#E9C46A' : '#E7ECF5' });
    if (extra) text(extra, tx + tw - 12, 500, { size: 18, weight: 700, color: extra.startsWith('▲') ? '#2FD07A' : '#F0535A', align: 'right' });
    tx += tw + gap;
  }
  // teammate
  const mate = teammateOf(s);
  if (mate) {
    const cmp = (k) => { const sd = ses[k]; if (!sd?.done) return null; const a = sd.results.findIndex(x => x.d === PLAYER), b = sd.results.findIndex(x => x.d === mate); return a >= 0 && b >= 0 ? a < b : null; };
    const q = cmp('Q'), rr = cmp('R');
    const bits = [q != null ? `${q ? 'ahead' : 'behind'} in qualifying` : null, rr != null ? `${rr ? 'ahead' : 'behind'} in the race` : null].filter(Boolean);
    if (bits.length) text(`vs ${dName(s, mate)}: ${bits.join(', ')}`, 60, 560, { size: 22, color: '#C9D1E0' });
  }
  // podium
  const fin = ses.R?.done ? ses.R.results.filter(x => !OUT.includes(x.st)).slice(0, 3) : [];
  text('PODIUM', 820, 232, { size: 16, weight: 600, color: '#8B97AF' });
  for (const [k, x] of fin.entries()) {
    const y = 270 + k * 62;
    g.fillStyle = 'rgba(18,24,38,0.8)'; g.fillRect(820, y - 26, 320, 52);
    g.fillStyle = teamColor(s, x.d); g.fillRect(820, y - 26, 4, 52);
    text(String(k + 1), 846, y + 9, { size: 26, weight: 700, color: ['#E9C46A', '#C7CED9', '#CD8A5A'][k], align: 'center' });
    await circlePic(x.d, 892, y, 20, 2);
    text(dName(s, x.d), 924, y + 7, { size: fit(dName(s, x.d), 22, 205, 600), weight: 600, color: x.d === PLAYER ? '#FFFFFF' : '#E7ECF5' });
  }
  if (!fin.length) text('Race not logged yet', 820, 270, { size: 20, color: '#5E6A82' });
  // headline from the race report
  const story = buildStories(c, s).find(x => x.kind === 'race' && x.r === r);
  if (story) {
    g.font = `italic 500 24px ${F}`; g.fillStyle = '#E7ECF5'; g.textAlign = 'left';
    const words = `“${story.headline}”`.split(' '); let line = ''; let y = 618; const lines = [];
    for (const w of words) { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > 900) { lines.push(line); line = w; } else line = t; }
    lines.push(line);
    lines.slice(0, 2).forEach((l, i) => g.fillText(l, 60, y + i * 30 - (lines.length > 1 ? 30 : 0)));
  }
  text('PITWALL', W - 40, H - 32, { size: 22, weight: 700, color: col, align: 'right' });
  return cv;
}
async function weekendCardModal(roundId) {
  const c = career(); const s = curSeason(); const r = activeRounds(s).find(x => x.id === roundId);
  if (!r) return;
  modal(`<div class="modal-h"><h2>Weekend summary</h2><button class="icon-btn" data-act="modal-close">${ICON.x}</button></div><div class="modal-b"><div class="row"><span class="spinner"></span><span class="muted">Drawing the card…</span></div></div>`, 'wide');
  const cv = await drawWeekendCard(c, s, r);
  const url = cv.toDataURL('image/png');
  ui.modal = { kind: 'card', url, name: `pitwall-${s.year}-r${activeRounds(s).indexOf(r) + 1}-${r.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png` };
  modal(`<div class="modal-h"><h2>${esc(r.name)} Grand Prix · weekend summary</h2><button class="icon-btn" data-act="modal-close">${ICON.x}</button></div>
    <div class="modal-b"><img src="${url}" alt="Weekend summary card" style="width:100%;border-radius:6px;border:1px solid var(--line)"></div>
    <div class="modal-f"><span class="muted" style="font-size:12px;margin-right:auto">1200 × 675 PNG, sized for social posts.</span><button class="btn ghost" data-act="modal-close">Close</button><button class="btn primary" data-act="card-save">Save image</button></div>`, 'wide');
}

/* ------------------------------------------------------------ award cards */
/** Drawing kit shared by the award cards: text, fitting, a driver's photo in a ring, and the team-coloured backdrop. */
function cardKit(g, c, s, W, H) {
  const F = '"Bahnschrift", "DIN Alternate", "Barlow Condensed", "Roboto Condensed", "Arial Narrow", sans-serif';
  const text = (t, x, y, { size = 20, weight = 400, color = '#E7ECF5', align = 'left' } = {}) => { g.font = `${weight} ${size}px ${F}`; g.fillStyle = color; g.textAlign = align; g.fillText(t, x, y); };
  const fit = (t, size, maxW, weight = 600) => { let sz = size; g.font = `${weight} ${sz}px ${F}`; while (sz > 12 && g.measureText(t).width > maxW) { sz -= 2; g.font = `${weight} ${sz}px ${F}`; } return sz; };
  const circlePic = async (id, x, y, rad, ring) => {
    const img = await loadImg(driverPhoto(c, id));
    const tc = teamColor(s, id);
    g.save(); g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.closePath();
    if (img) { g.clip(); const k = Math.max(rad * 2 / img.width, rad * 2 / img.height); g.drawImage(img, x - img.width * k / 2, y - rad, img.width * k, img.height * k); }
    else { const gr = g.createRadialGradient(x - rad * 0.4, y - rad * 0.5, rad * 0.1, x, y, rad); gr.addColorStop(0, mixHex(tc, '#FFFFFF', 0.35)); gr.addColorStop(1, mixHex(tc, '#000000', 0.35)); g.fillStyle = gr; g.fill();
      text(initials(trName(c, s, id)), x, y + rad * 0.3, { size: Math.round(rad * 0.8), weight: 700, color: contrastInk(tc), align: 'center' }); }
    g.restore();
    g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.lineWidth = ring; g.strokeStyle = tc; g.stroke();
  };
  const backdrop = (col, col2) => {
    g.fillStyle = '#0B0F17'; g.fillRect(0, 0, W, H);
    const wash = g.createLinearGradient(0, 0, W, 0); wash.addColorStop(0, hexA(col, 0.45)); wash.addColorStop(0.6, hexA(col, 0)); g.fillStyle = wash; g.fillRect(0, 0, W, H);
    g.save(); g.globalAlpha = 0.1; g.strokeStyle = col2; g.lineWidth = 6;
    for (let x = 820; x < W + 400; x += 26) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x - 300, H); g.stroke(); }
    g.restore();
    g.fillStyle = col; g.fillRect(0, 0, 14, H);
  };
  const tile = (x, y, w, label, value, col, valColor = '#E7ECF5') => {
    g.fillStyle = 'rgba(18,24,38,0.85)'; g.fillRect(x, y, w, 96); g.fillStyle = col; g.fillRect(x, y, w, 3);
    text(label, x + 14, y + 28, { size: 14, weight: 600, color: '#8B97AF' });
    text(value, x + 14, y + 76, { size: 38, weight: 700, color: valColor });
  };
  const wrap = (t, x, y, maxW, lineH, size, color, maxLines = 3) => {
    g.font = `500 ${size}px ${F}`; const words = t.split(' '); let line = ''; const lines = [];
    for (const w of words) { const tt = line ? line + ' ' + w : w; if (g.measureText(tt).width > maxW) { lines.push(line); line = w; } else line = tt; }
    lines.push(line); lines.slice(0, maxLines).forEach((l, i) => text(l, x, y + i * lineH, { size, weight: 500, color }));
  };
  return { text, fit, circlePic, backdrop, tile, wrap };
}
const ratingInk = (v) => v >= 9 ? '#C78BF0' : v >= 8 ? '#2FD07A' : v >= 6.5 ? '#E7ECF5' : v >= 5 ? '#F5C518' : '#F0535A';
/** Driver of the Day (kind 'dotd', round ri) or Driver of the Season ('dots') as a 1200×675 image. */
async function drawAwardCard(c, s, kind, ri) {
  const W = 1200, H = 675;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const k = cardKit(g, c, s, W, H);
  const rounds = activeRounds(s);
  const pick = kind === 'dots' ? driverOfTheSeason(s) : driverOfTheDay(s, ri);
  if (!pick) return null;
  const id = pick.id;
  const team = teamOf(s, id) || (kind === 'dotd' ? teamAt(s, id, ri) : null);
  const col = team?.color || '#E10600';
  const col2 = (team && (team.id === MYTEAM ? c.myTeam?.color2 : D.TEAM_BIO[team.id]?.color2)) || '#FFFFFF';
  k.backdrop(col, col2);
  const name = trName(c, s, id);
  if (kind === 'dotd') {
    const r = rounds[ri];
    k.text('DRIVER OF THE DAY', 60, 72, { size: 26, weight: 700, color: '#E9C46A' });
    k.text(`ROUND ${ri + 1} OF ${rounds.length}  ·  ${r.name.toUpperCase()} GRAND PRIX  ·  ${s.year}`, 60, 106, { size: 18, weight: 600, color: '#8B97AF' });
    await k.circlePic(id, 210, 330, 130, 7);
    k.text(name, 380, 268, { size: k.fit(name, 56, 520, 700), weight: 700 });
    k.text(team?.name || '', 380, 306, { size: 24, color: '#8B97AF' });
    k.wrap(pick.reasons.length ? pick.reasons.map(x => x[0].toUpperCase() + x.slice(1)).join(' · ') : `${ordWord(pick.finish)} at the flag`, 380, 352, 480, 30, 24, '#C9D1E0', 2);
    // the rating
    k.text(pick.rating.toFixed(1), 1110, 330, { size: 150, weight: 700, color: ratingInk(pick.rating), align: 'right' });
    k.text('/ 10', 1110, 372, { size: 28, weight: 600, color: '#8B97AF', align: 'right' });
    const tw = 150, gap = 12; let tx = 60;
    for (const [lab, val] of [['GRID', pick.grid ? 'P' + pick.grid : '–'], ['FINISH', 'P' + pick.finish], ['CAR PACE', pick.carGap >= 5 ? `+${(pick.carGap / 1000).toFixed(2)}s` : 'Fastest'], ['QUALIFYING', pick.quali != null ? pick.quali.toFixed(1) : '–']]) { k.tile(tx, 500, tw, lab, val, col, val === 'P1' ? '#E9C46A' : '#E7ECF5'); tx += tw + gap; }
    const others = Object.values(raceRatings(s, ri)).filter(x => !x.dnf && x.id !== id).sort((a, b) => b.rating - a.rating).slice(0, 3);
    k.text('ALSO RATED', 760, 470, { size: 15, weight: 600, color: '#8B97AF' });
    others.forEach((o, i) => { const y = 510 + i * 40; k.text(trName(c, s, o.id), 760, y, { size: 22, weight: 600 }); k.text(o.rating.toFixed(1), 1110, y, { size: 22, weight: 700, color: ratingInk(o.rating), align: 'right' }); });
  } else {
    k.text(`DRIVER OF THE SEASON`, 60, 72, { size: 26, weight: 700, color: '#E9C46A' });
    k.text(`${s.year} FORMULA 1 SEASON${pick.final ? '' : `  ·  AFTER ${roundsDone(s)} OF ${rounds.length} ROUNDS`}`, 60, 106, { size: 18, weight: 600, color: '#8B97AF' });
    await k.circlePic(id, 210, 330, 130, 7);
    k.text(name, 380, 268, { size: k.fit(name, 56, 520, 700), weight: 700 });
    k.text(team?.name || '', 380, 306, { size: 24, color: '#8B97AF' });
    const wins = pick.SR.dotd.filter(x => x.id === id);
    k.wrap(`Driver of the Day in ${listJoin(wins.map(x => x.r.name))}.`, 380, 352, 480, 30, 22, '#C9D1E0', 3);
    k.text(String(pick.dotd), 1110, 320, { size: 150, weight: 700, color: '#E9C46A', align: 'right' });
    k.text(pick.dotd === 1 ? 'AWARD' : 'AWARDS', 1110, 362, { size: 24, weight: 600, color: '#8B97AF', align: 'right' });
    const tw = 170, gap = 12; let tx = 60;
    for (const [lab, val] of [['AVERAGE RATING', pick.avg.toFixed(1)], ['LAST 5', pick.last5.toFixed(1)], ['RACES RATED', String(pick.list.length)]]) { k.tile(tx, 500, tw, lab, val, col); tx += tw + gap; }
    const rest = Object.values(pick.SR.by).filter(o => o.id !== id && o.dotd).sort((a, b) => b.dotd - a.dotd || b.avg - a.avg).slice(0, 3);
    k.text('RUNNERS-UP', 760, 470, { size: 15, weight: 600, color: '#8B97AF' });
    rest.forEach((o, i) => { const y = 510 + i * 40; k.text(trName(c, s, o.id), 760, y, { size: 22, weight: 600 }); k.text(`${o.dotd}`, 1110, y, { size: 22, weight: 700, color: '#E9C46A', align: 'right' }); });
  }
  k.text('PITWALL', W - 40, H - 28, { size: 22, weight: 700, color: col, align: 'right' });
  return cv;
}
async function awardCardModal(kind, ri) {
  const c = career(); const s = curSeason();
  const title = kind === 'dots' ? `${s.year} Driver of the Season` : `Driver of the Day · ${activeRounds(s)[ri]?.name} Grand Prix`;
  modal(`<div class="modal-h"><h2>${esc(title)}</h2><button class="icon-btn" data-act="modal-close">${ICON.x}</button></div><div class="modal-b"><div class="row"><span class="spinner"></span><span class="muted">Drawing the card…</span></div></div>`, 'wide');
  const cv = await drawAwardCard(c, s, kind, ri);
  if (!cv) { closeModal(); toast('Nothing to show yet'); return; }
  const url = cv.toDataURL('image/png');
  ui.modal = { kind: 'card', url, name: kind === 'dots' ? `pitwall-${s.year}-driver-of-the-season.png` : `pitwall-${s.year}-r${ri + 1}-driver-of-the-day.png` };
  modal(`<div class="modal-h"><h2>${esc(title)}</h2><button class="icon-btn" data-act="modal-close">${ICON.x}</button></div>
    <div class="modal-b"><img src="${url}" alt="${esc(title)}" style="width:100%;border-radius:6px;border:1px solid var(--line)"></div>
    <div class="modal-f"><span class="muted" style="font-size:12px;margin-right:auto">1200 × 675 PNG, sized for social posts.</span><button class="btn ghost" data-act="modal-close">Close</button><button class="btn primary" data-act="card-save">Save image</button></div>`, 'wide');
}

function renderTap(s, sd) {
  const taken = ui.tap.order;
  return `<div class="panel-b" style="border-bottom:1px solid var(--line);display:grid;gap:12px;background:var(--panel-2)">
    <div class="row" style="justify-content:space-between"><span>Tap drivers in finishing order. <span class="muted">${taken.length} of ${sd.results.length} placed. Untapped drivers keep their current order behind them.</span></span>
    <div class="row"><button class="btn sm ghost" data-act="tap-undo">Undo</button><button class="btn sm ghost" data-act="tap-cancel">Cancel</button><button class="btn sm primary" data-act="tap-apply">Apply order</button></div></div>
    <div class="tap-grid">${sd.results.map(x => {
      const p = taken.indexOf(x.d);
      return `<button class="tap ${p >= 0 ? 'taken' : ''}" data-act="tap-pick" data-d="${x.d}" ${p >= 0 ? 'disabled' : ''}><span class="chip" style="--c:${teamColor(s, x.d)}"></span><span class="p">${p >= 0 ? p + 1 : ''}</span><span>${esc(dAbbr(s, x.d))}</span><span class="muted" style="font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(dName(s, x.d).split(' ').slice(-1)[0])}</span></button>`;
    }).join('')}</div>
  </div>`;
}

/* ------------------------------------------------------------- standings */
function renderStandings() {
  const c = career(); const s = curSeason();
  const stats = seasonStats(s);
  const ds = driverStandings(s, stats);
  const cs = constructorStandings(s, stats);
  const rounds = activeRounds(s);
  const tab = ui.standingsTab;
  let body = '';
  if (tab === 'drivers') {
    body = `<table><thead><tr><th>Pos</th><th>Driver</th><th>Team</th><th class="num">Wins</th><th class="num">Podiums</th><th class="num">Poles</th><th class="num">FL</th><th class="num">DNF</th><th class="num">Avg Q</th><th class="num">Avg finish</th><th class="num">Pts</th></tr></thead><tbody>
      ${ds.map(x => `<tr class="${x.id === PLAYER ? 'me' : ''}" data-act="open-driver" data-id="${x.id}" title="Driver profile"><td class="pos ${x.pos <= 3 ? 'p' + x.pos : ''}">${x.pos}</td><td>${drvCell(s, x.id)}</td><td class="muted">${esc(teamOf(s, x.id)?.name || '')}</td>
      <td class="num">${x.wins}</td><td class="num">${x.podiums}</td><td class="num">${x.poles}</td><td class="num">${x.fls ? `<span class="fl">${x.fls}</span>` : 0}</td><td class="num">${x.dnfs}</td><td class="num">${fmtAvg(avg(x.qPos))}</td><td class="num">${fmtAvg(avg(x.finPos))}</td><td class="num"><b>${x.pts}</b></td></tr>`).join('')}
    </tbody></table>`;
  } else if (tab === 'constructors') {
    const max = cs[0]?.pts || 1;
    body = `<table><thead><tr><th>Pos</th><th>Team</th><th>Drivers</th><th class="num">Wins</th><th class="num">Podiums</th><th style="width:30%"></th><th class="num">Pts</th></tr></thead><tbody>
      ${cs.map(x => `<tr class="${x.team.id === s.playerTeamId ? 'me' : ''}" data-act="open-team" data-id="${x.team.id}" title="Team profile"><td class="pos ${x.pos <= 3 ? 'p' + x.pos : ''}">${x.pos}</td><td><div class="drv">${teamMark(c, x.team)}<b>${esc(x.team.name)}</b></div></td>
      <td class="muted">${x.team.drivers.filter(Boolean).map(d => esc(dAbbr(s, d))).join(' · ')}</td><td class="num">${x.wins}</td><td class="num">${x.podiums}</td>
      <td><div class="h2h-bar"><i style="--c:${x.team.color};width:${x.pts / max * 100}%"></i></div></td><td class="num"><b>${x.pts}</b></td></tr>`).join('')}
    </tbody></table>`;
  } else if (tab === 'progress') {
    const dp = progression(s, 'driver'); const tp = progression(s, 'team');
    body = !dp.n ? '<div class="empty">Log a race to see how the championship develops.</div>' : `<div class="panel-b stack">
      <div><h3>Drivers’ points</h3><p class="muted" style="font-size:12px;margin:2px 0 6px">Top eight plus you. Second driver of a team is dashed.</p>${lineChart(driverSeries(s, dp, 'pts'), dp.labels, { names: dp.names })}</div>
      <div><h3>Drivers’ championship position</h3>${lineChart(driverSeries(s, dp, 'pos'), dp.labels, { invert: true, names: dp.names })}</div>
      <div><h3>Constructors’ points</h3>${lineChart(s.teams.map(t => ({ label: D.TEAM_BIO[t.id]?.short || (t.id === MYTEAM ? c.myTeam?.short : t.name.slice(0, 3).toUpperCase()), name: t.name, color: t.color, bold: t.id === s.playerTeamId, vals: tp.by[t.id]?.pts || [] })), tp.labels, { names: tp.names })}</div>
    </div>`;
  } else {
    body = `<table class="matrix"><thead><tr><th>Driver</th>${rounds.map((r, i) => `<th title="${esc(r.name)}">${i + 1}<br><span class="dim">${esc(r.id.toUpperCase())}</span></th>`).join('')}<th class="num">Pts</th></tr></thead><tbody>
      ${ds.map(x => `<tr class="${x.id === PLAYER ? 'me' : ''}"><td>${drvCell(s, x.id)}</td>${rounds.map(r => {
        const br = stats[x.id].byRound[r.id] || {};
        const v = br.r;
        if (v == null) return '<td><span class="cell nopts">·</span></td>';
        const cls = typeof v !== 'number' ? 'dnf' : v === 1 ? 'p1' : v === 2 ? 'p2' : v === 3 ? 'p3' : v <= 10 ? 'pts' : 'nopts';
        return `<td><span class="cell ${cls} ${br.fl ? 'flb' : ''}" title="${esc(r.name)}${br.s != null ? ' · Sprint ' + br.s : ''}${br.q ? ' · Quali P' + br.q : ''}">${typeof v === 'number' ? v : v === 'DNS' ? 'NS' : v === 'DSQ' ? 'DQ' : 'R'}</span></td>`;
      }).join('')}<td class="num"><b>${x.pts}</b></td></tr>`).join('')}
    </tbody></table>
    <div class="row muted" style="padding:12px 16px;font-size:12px;gap:16px"><span><span class="cell p1">1</span> Win</span><span><span class="cell pts">7</span> Points</span><span><span class="cell dnf">R</span> Retired</span><span><span class="cell flb nopts">12</span> Fastest lap</span></div>`;
  }
  return `<div class="page">
    <div class="page-head"><div><h1>${s.year} Standings</h1><div class="sub">After ${roundsDone(s)} of ${rounds.length} rounds</div></div>
    <div class="row">${seasonPicker(c, s.index)}<div class="seg">${[['drivers', 'Drivers'], ['constructors', 'Constructors'], ['progress', 'Progress'], ['grid', 'Results grid']].map(([id, l]) => `<button data-act="standings-tab" data-tab="${id}" class="${tab === id ? 'on' : ''}">${l}</button>`).join('')}</div></div></div>
    <div class="panel"><div class="panel-b tight table-wrap">${body}</div></div>
  </div>`;
}

/* ------------------------------------------------------------------- H2H */
function allDriversInCareer(c) {
  const map = {};
  for (const s of c.seasons) for (const id of gridIds(s)) map[id] = s.drivers[id];
  return map;
}
function renderH2H() {
  const c = career();
  const scope = ui.h2h.scope;
  const seasons = scope === 'all' ? c.seasons : [c.seasons[scope === 'cur' ? c.seasons.length - 1 : +scope]];
  const ref = seasons[seasons.length - 1];
  const a = ui.h2h.a || PLAYER;
  const b = ui.h2h.b || teammateOf(ref) || gridIds(ref).find(x => x !== a);
  const pool = scope === 'all' ? allDriversInCareer(c) : ref.drivers;
  const ids = Object.keys(pool).filter(id => scope === 'all' || gridIds(ref).includes(id)).sort((x, y) => x === PLAYER ? -1 : y === PLAYER ? 1 : pool[x].name.localeCompare(pool[y].name));
  const h = h2hCompare(seasons, a, b);
  const ca = teamColor(ref, a), cb = teamColor(ref, b);
  const cb2 = ca === cb ? '#8B97AF' : cb;
  const row = (label, va, vb, lowerBetter = false, fmt = (v) => v ?? '–') => {
    const na = typeof va === 'number' ? va : null, nb = typeof vb === 'number' ? vb : null;
    let wa = false, wb = false;
    if (na != null && nb != null && na !== nb) { const aBetter = lowerBetter ? na < nb : na > nb; wa = aBetter; wb = !aBetter; }
    let pa = 50, pb = 50;
    if (na != null && nb != null && (na + nb) > 0) {
      if (lowerBetter) { pa = nb / (na + nb) * 100; pb = na / (na + nb) * 100; } else { pa = na / (na + nb) * 100; pb = nb / (na + nb) * 100; }
    }
    return `<div class="h2h-row"><span class="v ${wa ? 'win' : wb ? 'lose' : ''}">${fmt(va)}</span>
      <div class="h2h-bar l"><i style="--c:${ca};width:${pa}%"></i></div><span class="k">${label}</span>
      <div class="h2h-bar"><i style="--c:${cb2};width:${pb}%"></i></div><span class="v r ${wb ? 'win' : wa ? 'lose' : ''}">${fmt(vb)}</span></div>`;
  };
  const sel = (which, val) => `<select data-ch="h2h-${which}" style="width:auto;max-width:240px">${ids.map(id => `<option value="${id}" ${id === val ? 'selected' : ''}>${esc(pool[id].name)}${id === PLAYER ? ' (you)' : ''}</option>`).join('')}</select>`;
  const scopeSel = `<select data-ch="h2h-scope" style="width:auto"><option value="cur" ${scope === 'cur' ? 'selected' : ''}>Current season</option>${c.seasons.map((s, i) => `<option value="${i}" ${scope === String(i) ? 'selected' : ''}>${s.year} season</option>`).join('')}<option value="all" ${scope === 'all' ? 'selected' : ''}>Every season since ${c.seasons[0].year}</option></select>`;
  const pct = (w, t) => t ? Math.round(w / t * 100) + '%' : '–';
  const whole = scope === 'all';
  // whole career: real F1 records up to 2024 plus everything logged since
  const ctx = whole ? careerCtx(c) : null;
  const ra = whole ? driverRecord(c, a, ctx).tot : null, rb = whole ? driverRecord(c, b, ctx).tot : null;
  const rate = (t, k) => t.starts ? t[k] / t.starts * 100 : null;
  const side = (id, col, right) => `<div class="h2h-side ${right ? 'right' : ''}">${sel(right ? 'b' : 'a', id)}
    <div class="h2h-id">${avatar(c, ref, id, 64)}<div style="min-width:0"><div class="nm" style="color:${col}">${esc(pool[id]?.name || id)}</div><span class="muted">${esc(teamOf(ref, id)?.name || '')}</span></div></div></div>`;

  return `<div class="page">
    <div class="page-head"><div><h1>Head to Head</h1><div class="sub">Compare any two drivers on the grid. Defaults to you against your teammate.</div></div>
    <div class="row">${scopeSel}</div></div>
    <div class="panel"><div class="panel-b">
      <div class="h2h-head">
        ${side(a, ca, false)}
        <div class="label">vs</div>
        ${side(b, cb2, true)}
      </div>
    </div>
    ${whole ? `<div class="panel-h" style="border-top:1px solid var(--line)"><h3>Entire F1 careers</h3><span class="muted" style="font-size:12px">Real records up to the start of 2025 plus every race in your career</span></div>
    <div class="panel-b">
      ${row('World titles', ra.titles.length, rb.titles.length)}
      ${row('Starts', ra.starts, rb.starts)}
      ${row('Wins', ra.wins, rb.wins)}
      ${row('Podiums', ra.podiums, rb.podiums)}
      ${row('Poles', ra.poles, rb.poles)}
      ${row('Fastest laps', ra.fls, rb.fls)}
      ${row('Points', ra.pts, rb.pts, false, (v) => fmtPts(v))}
      ${row('Win rate', rate(ra, 'wins'), rate(rb, 'wins'), false, (v) => v == null ? '–' : v.toFixed(1) + '%')}
      ${row('Podium rate', rate(ra, 'podiums'), rate(rb, 'podiums'), false, (v) => v == null ? '–' : v.toFixed(1) + '%')}
      ${row('Best championship', ra.bestChamp, rb.bestChamp, true, (v) => v ? 'P' + v : '–')}
    </div>
    <div class="panel-h" style="border-top:1px solid var(--line)"><h3>Head to head in your career</h3><span class="muted" style="font-size:12px">Sessions where both drivers took part, ${c.seasons[0].year} onwards (real seasons included)</span></div>` : ''}
    <div class="panel-b" style="border-top:1px solid var(--line)">
      ${row('Qualifying', h.q[0], h.q[1])}
      ${row('Race', h.r[0], h.r[1])}
      ${h.s[0] + h.s[1] ? row('Sprint', h.s[0], h.s[1]) : ''}
      ${whole ? '' : `${row('Points', h.pts[0], h.pts[1])}
      ${row('Wins', h.wins[0], h.wins[1])}
      ${row('Podiums', h.podiums[0], h.podiums[1])}
      ${row('Poles', h.poles[0], h.poles[1])}
      ${row('Fastest laps', h.fls[0], h.fls[1])}`}
      ${row('Retirements', h.dnfs[0], h.dnfs[1], true)}
      ${row('Avg grid', avg(h.qPos[0]), avg(h.qPos[1]), true, fmtAvg)}
      ${row('Avg finish', avg(h.finPos[0]), avg(h.finPos[1]), true, fmtAvg)}
      ${row('Best finish', whole ? ra.bestFinish : h.best[0], whole ? rb.bestFinish : h.best[1], true, (v) => v ? 'P' + v : '–')}
    </div></div>
    <div class="grid-2">
      <div class="panel"><div class="panel-h"><h3>Race finishing positions</h3><span class="muted" style="font-size:12px">Lower is better · win rate ${pct(h.r[0], h.r[0] + h.r[1])} vs ${pct(h.r[1], h.r[0] + h.r[1])}</span></div><div class="panel-b">${posChart(h.rounds, ca, cb2, 'a', 'b')}</div></div>
      <div class="panel"><div class="panel-h"><h3>Qualifying positions</h3><span class="muted" style="font-size:12px">Lower is better</span></div><div class="panel-b">${posChart(h.rounds, ca, cb2, 'aq', 'bq')}</div></div>
    </div>
  </div>`;
}

/** Championship points and position after every race logged. */
function progression(s, kind = 'driver') {
  const rounds = activeRounds(s);
  const idx = rounds.map((r, i) => i).filter(i => s.weekends[rounds[i].id]?.sessions?.R?.done);
  const by = {};
  idx.forEach((i, k) => {
    const st = seasonStats(s, i + 1);
    const rows = kind === 'team' ? constructorStandings(s, st).map(x => ({ id: x.team.id, pts: x.pts, pos: x.pos })) : driverStandings(s, st).map(x => ({ id: x.id, pts: x.pts, pos: x.pos }));
    for (const x of rows) { const o = (by[x.id] ||= { id: x.id, pts: Array(idx.length).fill(null), pos: Array(idx.length).fill(null) }); o.pts[k] = x.pts; o.pos[k] = x.pos; }
  });
  return { labels: idx.map(i => rounds[i].id.toUpperCase()), names: idx.map(i => rounds[i].name), by, n: idx.length };
}
/** Line chart for season progress. series: [{ label, color, dash, bold, vals }] */
function lineChart(series, labels, { invert = false, maxY = null, names = [] } = {}) {
  if (labels.length < 1 || !series.length) return '<div class="empty">Log a race to see the chart.</div>';
  const W = 760, H = 300, L = 40, R = 64, T = 14, B = 30;
  const all = series.flatMap(x => x.vals.filter(v => v != null));
  const top = maxY ?? Math.max(1, ...all);
  const xs = (i) => L + (labels.length === 1 ? (W - L - R) / 2 : i * (W - L - R) / (labels.length - 1));
  const ys = invert ? (v) => T + (v - 1) / Math.max(1, top - 1) * (H - T - B) : (v) => T + (1 - v / top) * (H - T - B);
  const step = invert ? null : [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500].find(st => top / st <= 5) || 1000;
  const ticks = invert ? [1, 5, 10, 15, 20, 25].filter(t => t <= top) : Array.from({ length: Math.floor(top / step) + 1 }, (_, i) => i * step);
  const every = Math.ceil(labels.length / 14);
  // end-of-line labels, nudged apart so they don't overlap
  const ends = series.map(x => { let k = x.vals.length - 1; while (k >= 0 && x.vals[k] == null) k--; return k < 0 ? null : { x, k, y: ys(x.vals[k]) }; }).filter(Boolean).sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 12) ends[i].y = ends[i - 1].y + 12;
  const path = (vals, from = 0, to = vals.length) => { let d = ''; vals.forEach((v, i) => { if (v == null || i < from || i >= to) return; d += `${d ? 'L' : 'M'}${xs(i).toFixed(1)},${ys(v).toFixed(1)}`; }); return d; };
  const line = (x, d, dash, op) => `<path d="${d}" fill="none" stroke="${x.color}" stroke-width="${x.bold ? 3.2 : 2}" ${dash ? 'stroke-dasharray="6 4"' : ''} stroke-linejoin="round" stroke-linecap="round" opacity="${op}"/>`;
  // a series with `split` is real up to that index and projected (dashed, faded) after it
  const splitAt = series.find(x => x.split != null)?.split;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Season progress chart">
    <g class="grid">${ticks.map(t => `<line x1="${L}" x2="${W - R}" y1="${ys(t)}" y2="${ys(t)}"/><text x="${L - 8}" y="${ys(t) + 4}" text-anchor="end">${invert ? 'P' + t : t}</text>`).join('')}</g>
    ${splitAt != null ? `<g class="grid"><line x1="${xs(splitAt - 1)}" x2="${xs(splitAt - 1)}" y1="${T}" y2="${H - B}" stroke-dasharray="3 3"/><text x="${xs(splitAt - 1) + 4}" y="${T + 10}">Now</text></g>` : ''}
    ${labels.map((l, i) => i % every === 0 || i === labels.length - 1 ? `<text x="${xs(i)}" y="${H - 10}" text-anchor="middle">${esc(l)}</text>` : '').join('')}
    ${series.slice().reverse().map(x => `${x.split != null ? line(x, path(x.vals, 0, x.split), false, x.bold ? 1 : 0.9) + line(x, path(x.vals, x.split - 1), true, x.bold ? 0.85 : 0.6) : line(x, path(x.vals), x.dash, x.bold ? 1 : 0.9)}
      ${x.vals.map((v, i) => v == null ? '' : `<circle cx="${xs(i)}" cy="${ys(v)}" r="${x.bold ? 3.4 : 2.4}" fill="${x.color}" ${x.split != null && i >= x.split ? 'opacity="0.55"' : ''}><title>${esc(x.name || x.label)} · ${esc(names[i] || labels[i])}: ${invert ? 'P' + v : fmtPts(v) + ' pts'}</title></circle>`).join('')}`).join('')}
    ${ends.map(e => `<text x="${xs(e.k) + 8}" y="${e.y + 4}" style="fill:${e.x.color};font-weight:700">${esc(e.x.label)}</text>`).join('')}
  </svg>`;
}
/** Chart series for drivers: the top n plus you, teammates dashed so team colours stay readable. */
function driverSeries(s, prog, key, n = 8) {
  const last = prog.n - 1;
  let ids = Object.values(prog.by).sort((a, b) => (a.pos[last] ?? 99) - (b.pos[last] ?? 99)).slice(0, n).map(x => x.id);
  if (prog.by[PLAYER] && !ids.includes(PLAYER)) ids.push(PLAYER);
  const seenTeam = {};
  return ids.map(id => { const t = teamOf(s, id)?.id || id; const dash = !!seenTeam[t]; seenTeam[t] = true; return { label: dAbbr(s, id), name: dName(s, id), color: teamColor(s, id), dash, bold: id === PLAYER, vals: prog.by[id][key] }; });
}

function posChart(rounds, ca, cb, ka, kb) {
  const data = rounds.filter(r => r[ka] != null || r[kb] != null);
  if (!data.length) return '<div class="empty">Log some sessions to see the chart.</div>';
  const W = 560, H = 240, L = 34, R = 12, T = 12, B = 30;
  const maxP = Math.max(10, ...data.flatMap(r => [r[ka], r[kb]].filter(v => typeof v === 'number')));
  const xs = (i) => L + (data.length === 1 ? (W - L - R) / 2 : i * (W - L - R) / (data.length - 1));
  const ys = (p) => T + (p - 1) / (maxP - 1) * (H - T - B);
  const val = (v) => typeof v === 'number' ? v : (v ? maxP : null);
  const path = (k) => { let d = ''; data.forEach((r, i) => { const v = val(r[k]); if (v == null) return; d += `${d ? 'L' : 'M'}${xs(i).toFixed(1)},${ys(v).toFixed(1)}`; }); return d; };
  const ticks = [1, 5, 10, 15, 20].filter(t => t <= maxP);
  const every = Math.ceil(data.length / 12);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Positions by round">
    <g class="grid">${ticks.map(t => `<line x1="${L}" x2="${W - R}" y1="${ys(t)}" y2="${ys(t)}"/><text x="${L - 8}" y="${ys(t) + 4}" text-anchor="end">P${t}</text>`).join('')}</g>
    ${data.map((r, i) => i % every === 0 ? `<text x="${xs(i)}" y="${H - 10}" text-anchor="middle">${esc(r.short)}</text>` : '').join('')}
    <path d="${path(kb)}" fill="none" stroke="${cb}" stroke-width="2.2" stroke-linejoin="round" opacity="0.85"/>
    <path d="${path(ka)}" fill="none" stroke="${ca}" stroke-width="2.6" stroke-linejoin="round"/>
    ${data.map((r, i) => [[kb, cb], [ka, ca]].map(([k, col]) => { const v = val(r[k]); return v == null ? '' : `<circle cx="${xs(i)}" cy="${ys(v)}" r="3.2" fill="${typeof r[k] === 'number' ? col : '#F0535A'}"><title>${esc(r.label)}: ${typeof r[k] === 'number' ? 'P' + r[k] : r[k]}</title></circle>`; }).join('')).join('')}
  </svg>`;
}

/* ----------------------------------------------------------- career stats */
function renderStats() {
  const c = career();
  const played = playedSeasons(c);
  const rows = played.map(s => {
    const st = seasonStats(s);
    const me = st[PLAYER] || emptyStat();
    const ds = driverStandings(s, st);
    const mate = teammateOf(s);
    const h = h2hCompare([s], PLAYER, mate);
    return { s, me, pos: ds.find(x => x.id === PLAYER)?.pos, team: s.teams.find(t => t.id === s.playerTeamId), mate, h, done: roundsDone(s), total: activeRounds(s).length, champion: ds[0] };
  });
  const T = rows.reduce((a, r) => ({ pts: a.pts + r.me.pts, wins: a.wins + r.me.wins, podiums: a.podiums + r.me.podiums, poles: a.poles + r.me.poles, fls: a.fls + r.me.fls, starts: a.starts + r.me.starts, dnfs: a.dnfs + r.me.dnfs, titles: a.titles + (r.done === r.total && r.champion?.id === PLAYER ? 1 : 0), fin: a.fin.concat(r.me.finPos), q: a.q.concat(r.me.qPos) }), { pts: 0, wins: 0, podiums: 0, poles: 0, fls: 0, starts: 0, dnfs: 0, titles: 0, fin: [], q: [] });

  // all-time leaderboard: the whole current grid plus anyone who has raced in this career
  const latest = c.seasons[c.seasons.length - 1];
  const ctx = careerCtx(c);
  const known = allKnownDrivers(c, latest);
  const lbIds = [...new Set([...gridIds(latest), ...c.seasons.flatMap(se => Object.entries(seasonStatsCache(se)).filter(([, o]) => o.starts).map(([id]) => id))])].filter(id => known[id]);
  const full = ui.lb.scope === 'full';
  const board = lbIds.map(id => {
    const rec = driverRecord(c, id, ctx);
    const t = full ? rec.tot : Object.fromEntries(['starts', 'wins', 'podiums', 'poles', 'fls', 'pts'].map(k => [k, rec.tot[k] - rec.base[k]]));
    const titles = full ? rec.tot.titles.length : rec.seasons.filter(x => x.complete && x.pos === 1 && !isHist(x.s)).length;
    return { id, name: id === PLAYER_ID ? `${c.profile.first} ${c.profile.last}` : known[id].name, team: teamOf(latest, id), ...t, titles, base: rec.base };
  });
  const lk = ui.lb.sort;
  board.sort((a, b) => (b[lk] - a[lk]) || b.wins - a.wins || b.pts - a.pts || a.name.localeCompare(b.name));
  const lth = (key, label) => `<th class="num sortable ${lk === key ? 'on' : ''}" data-act="lb-sort" data-k="${key}">${label}</th>`;
  const lbAdd = (x, k, fmt) => full ? plus(x[k] - x.base[k], fmt) : '';

  const wins = [];
  for (const s of played) {
    const st = seasonStats(s);
    activeRounds(s).forEach(r => { const br = st[PLAYER]?.byRound[r.id]; if (br?.r === 1) wins.push(`${s.year} ${r.name}`); });
  }

  return `<div class="page">
    <div class="page-head"><div><h1>Career Stats</h1><div class="sub">${played.length} season${played.length > 1 ? 's' : ''} · ${T.starts} race starts</div></div></div>
    <div class="tiles">
      <div class="tile"><span class="label">Titles</span><span class="v">${T.titles}</span></div>
      <div class="tile"><span class="label">Wins</span><span class="v">${T.wins}<small>${T.starts ? ` ${Math.round(T.wins / T.starts * 100)}%` : ''}</small></span></div>
      <div class="tile"><span class="label">Podiums</span><span class="v">${T.podiums}</span></div>
      <div class="tile"><span class="label">Poles</span><span class="v">${T.poles}</span></div>
      <div class="tile"><span class="label">Fastest laps</span><span class="v" style="color:var(--purple)">${T.fls}</span></div>
      <div class="tile"><span class="label">Points</span><span class="v">${T.pts}</span></div>
    </div>
    <div class="panel"><div class="panel-h"><h2>Season by season</h2><span class="muted" style="font-size:12px">Click a season for its full review</span></div><div class="panel-b tight table-wrap"><table>
      <thead><tr><th>Season</th><th>Team</th><th class="num">Pos</th><th class="num">Pts</th><th class="num">Wins</th><th class="num">Pod</th><th class="num">Poles</th><th class="num">FL</th><th class="num">DNF</th><th class="num">Avg Q</th><th class="num">Avg R</th><th>vs teammate (Q / R)</th></tr></thead>
      <tbody>${rows.map(r => `<tr data-act="open-review" data-idx="${r.s.index}" title="Season review"><td><b>${r.s.year}</b>${r.done < r.total ? ` <span class="muted" style="font-size:12px">${r.done}/${r.total}</span>` : ''}</td>
        <td><div class="drv"><span class="chip" style="--c:${r.team?.color}"></span>${esc(r.team?.name)}</div></td>
        <td class="num">${r.pos ? `<span class="pos ${r.pos <= 3 ? 'p' + r.pos : ''}" style="font-size:14px">P${r.pos}</span>` : '–'}</td><td class="num"><b>${r.me.pts}</b></td><td class="num">${r.me.wins}</td><td class="num">${r.me.podiums}</td><td class="num">${r.me.poles}</td><td class="num">${r.me.fls}</td><td class="num">${r.me.dnfs}</td>
        <td class="num">${fmtAvg(avg(r.me.qPos))}</td><td class="num">${fmtAvg(avg(r.me.finPos))}</td>
        <td><span class="tnum">${r.h.q[0]}–${r.h.q[1]} / ${r.h.r[0]}–${r.h.r[1]}</span> <span class="muted">vs ${esc(dAbbr(r.s, r.mate))}</span></td></tr>`).join('')}</tbody>
    </table></div></div>
    <div class="panel"><div class="panel-h"><div><h2>All-time leaderboard</h2><span class="muted" style="font-size:12px">${full ? `Entire F1 careers: real records up to ${firstPlayed(c).year - 1} plus your career (shown in green)` : `Only what each driver has done since ${firstPlayed(c).year} in your career`}. The ${latest.year} grid plus everyone who has raced since ${c.seasons[0].year}. Click a column to sort.</span></div>
      <div class="seg">${[['full', 'Entire careers'], ['career', 'This career only']].map(([v, l]) => `<button data-act="lb-scope" data-v="${v}" class="${ui.lb.scope === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <div class="panel-b tight table-wrap"><table>
        <thead><tr><th>#</th><th>Driver</th><th>${latest.year} team</th>${lth('titles', 'Titles')}${lth('starts', 'Starts')}${lth('wins', 'Wins')}${lth('podiums', 'Podiums')}${lth('poles', 'Poles')}${lth('pts', 'Points')}</tr></thead>
        <tbody>${board.map((x, i) => `<tr class="${x.id === PLAYER ? 'me' : ''}" data-act="open-driver" data-id="${x.id}"><td class="muted num">${i + 1}</td><td>${drvCell(latest, x.id)}</td>
          <td class="muted">${x.team ? `<div class="drv">${teamLogo(c, x.team, 20)}${esc(x.team.name)}</div>` : 'Not on the grid'}</td>
          <td class="num">${x.titles || '–'}</td><td class="num">${x.starts}${lbAdd(x, 'starts')}</td><td class="num">${x.wins}${lbAdd(x, 'wins')}</td><td class="num">${x.podiums}${lbAdd(x, 'podiums')}</td><td class="num">${x.poles}${lbAdd(x, 'poles')}</td><td class="num"><b>${fmtPts(x.pts)}</b>${lbAdd(x, 'pts', fmtPts)}</td></tr>`).join('')}</tbody>
      </table></div></div>
    <div>
      <div class="panel"><div class="panel-h"><h2>Your records</h2></div><div class="panel-b">
        <dl class="kv">
          <dt>Best finish</dt><dd>${T.fin.length ? 'P' + Math.min(...T.fin) : '–'}</dd>
          <dt>Best qualifying</dt><dd>${T.q.length ? 'P' + Math.min(...T.q) : '–'}</dd>
          <dt>Average finish</dt><dd>${fmtAvg(avg(T.fin))}</dd>
          <dt>Average grid</dt><dd>${fmtAvg(avg(T.q))}</dd>
          <dt>Retirements</dt><dd>${T.dnfs}</dd>
          <dt>Grand Prix wins</dt><dd>${wins.length ? wins.map(esc).join('<br>') : '<span class="muted">Still hunting the first one</span>'}</dd>
        </dl>
      </div></div>
    </div>
  </div>`;
}

/* ---------------------------------------------------------- season review */
function renderReview() {
  const c = career(); const s = curSeason();
  const rounds = activeRounds(s); const done = roundsDone(s); const complete = done > 0 && done === rounds.length;
  const st = seasonStatsCache(s); const ds = driverStandings(s, st); const cs = constructorStandings(s, st);
  const me = st[PLAYER] || emptyStat(); const myPos = ds.find(x => x.id === PLAYER)?.pos;
  const prev = c.seasons[s.index - 1]; const pst = prev ? seasonStatsCache(prev) : null;
  const prevPos = prev ? driverStandings(prev, pst).find(x => x.id === PLAYER)?.pos : null;
  const team = s.teams.find(t => t.id === s.playerTeamId); const mate = teammateOf(s);
  const h = h2hCompare([s], PLAYER, mate);
  if (!done) return `<div class="page"><div class="page-head"><div><h1>${s.year} season review</h1></div><div class="row">${seasonPicker(c, s.index)}</div></div><div class="panel"><div class="empty">No races logged in ${s.year} yet.</div></div></div>`;
  // your weekends, best and worst
  const weekends = rounds.map((r, i) => {
    const ses = s.weekends[r.id]?.sessions; if (!ses?.R?.done) return null;
    const br = me.byRound[r.id] || {};
    const p = ['SPR', 'R'].reduce((a, k) => { const sd = ses[k]; if (!sd?.done) return a; const ix = sd.results.findIndex(x => x.d === PLAYER); return a + (ix >= 0 ? pointsFor(k, ix + 1, sd.results[ix].st, sd.results[ix].pts) : 0); }, 0);
    return { r, i, br, pts: p, fin: typeof br.r === 'number' ? br.r : 99 };
  }).filter(Boolean);
  const best = weekends.slice().sort((a, b) => b.pts - a.pts || a.fin - b.fin).slice(0, 3);
  const worst = weekends.slice().sort((a, b) => b.fin - a.fin || a.pts - b.pts).filter(x => !best.includes(x)).slice(0, 3);
  const wkRow = (x) => `<tr data-act="open-round" data-round="${x.r.id}"><td class="muted num">R${x.i + 1}</td><td>${esc(x.r.name)}</td><td class="num">${x.br.q ? 'P' + x.br.q : '–'}</td><td class="num"><b>${typeof x.br.r === 'number' ? 'P' + x.br.r : `<span class="tag dnf">${esc(x.br.r || '–')}</span>`}</b></td><td class="num">+${x.pts}</td></tr>`;
  // awards
  const ids = Object.keys(st).filter(id => s.drivers[id] && st[id].starts);
  const top = (fn, filter = () => true) => ids.filter(filter).map(id => ({ id, v: fn(id) })).filter(x => x.v > 0).sort((a, b) => b.v - a.v)[0] || null;
  const earlier = new Set(c.seasons.slice(0, s.index).flatMap(gridIds));
  const rookie = top(id => st[id].pts + 0.001, id => id === PLAYER_ID ? s.index === 0 : !earlier.has(id) && !(D.DRIVER_BIO[id]?.starts));
  const gained = {};
  for (const r of rounds) {
    const ses = s.weekends[r.id]?.sessions; if (!ses?.R?.done || !ses.Q?.done) continue;
    const grid = ses.Q.results.map(x => x.d);
    ses.R.results.forEach((x, k) => { if (OUT.includes(x.st)) return; const g0 = grid.indexOf(x.d) + 1; if (g0) gained[x.d] = (gained[x.d] || 0) + (g0 - (k + 1)); });
  }
  const ptsFinishes = (id) => Object.values(st[id].byRound).filter(b => typeof b.r === 'number' && b.r <= 10).length;
  const share = (id) => { const t = teamOf(s, id); const m = t?.drivers.find(d => d && d !== id); const tot = st[id].pts + (st[m]?.pts || 0); return tot >= 20 ? Math.round(st[id].pts / tot * 100) : 0; };
  const awards = [
    ['Champion', ds[0] && complete ? { id: ds[0].id, v: ds[0].pts } : null, (x) => `${x.v} points`, complete ? '' : 'Season still running'],
    ['Rookie of the year', rookie, (x) => `${fmtPts(Math.round(x.v))} points`],
    ['Pole king', top(id => st[id].poles), (x) => plural(x.v, 'pole')],
    ['Biggest climber', top(id => gained[id] || 0), (x) => `${x.v} places gained from the grid`],
    ['Mr Consistency', top(ptsFinishes), (x) => `${plural(x.v, 'points finish')}`.replace('finishs', 'finishes')],
    ['Teammate demolisher', top(share), (x) => `${x.v}% of the team’s points`],
    ['Hard luck', top(id => st[id].dnfs), (x) => plural(x.v, 'retirement')],
  ];
  const tl = careerTimeline(c);
  const evs = tl.events.filter(e => e.seasonIdx === s.index);
  const recs = evs.filter(e => e.type === 'record');
  const miles = evs.filter(e => e.type === 'milestones').flatMap(e => e.items.map(x => ({ ...x, r: e.r })));
  const goals = s.goals.map(g => ({ g, e: evalGoal(g, s) }));
  const dp = progression(s, 'driver');
  const verdict = !mate ? '' : h.pts[0] === h.pts[1] ? `You and ${dName(s, mate)} finished level on points.` : `You ${h.pts[0] > h.pts[1] ? 'beat' : 'lost to'} ${dName(s, mate)} by ${plural(Math.abs(h.pts[0] - h.pts[1]), 'point')}, ${h.q[0]}–${h.q[1]} in qualifying and ${h.r[0]}–${h.r[1]} in races.`;
  const delta = prevPos && myPos ? prevPos - myPos : 0;
  return `<div class="page">
    <div class="page-head"><div><h1>${s.year} season review</h1><div class="sub">${complete ? 'Final verdict on the season' : `So far: ${done} of ${rounds.length} rounds logged`}</div></div><div class="row">${seasonPicker(c, s.index)}<button class="btn ghost" data-act="nav" data-view="stats">Career Stats</button></div></div>
    <div class="grid-2">
      ${[['Drivers’ champion', ds[0], true], ['Constructors’ champions', cs[0], false]].map(([lab, x, drv]) => `<div class="panel champ-banner"><div class="panel-b row" style="gap:16px;flex-wrap:nowrap">${drv ? avatar(c, s, x.id, 64) : teamLogo(c, x.team, 64)}
        <div><span class="label">${complete ? lab : lab.replace('champion', 'leader')}</span><div class="hof-name" style="font-size:24px">${esc(drv ? dName(s, x.id) : x.team.name)}</div><span class="muted">${x.pts} points${drv ? ` · ${plural(x.wins, 'win')}` : ` · ${plural(x.wins, 'win')}`}</span></div></div></div>`).join('')}
    </div>
    ${['driver', 'team'].map(k => { const T = titleRetro(c, s, k); if (!T) return ''; const d = T.dec;
      return `<div class="panel ${d.final ? 'decider' : ''}"><div class="panel-h"><div><span class="label">${k === 'team' ? 'Constructors’ championship' : 'Drivers’ championship'}${d.final ? ' · decided at the final race' : ''}</span><h2>How ${esc(T.name)} won it</h2></div>
        <span class="muted" style="font-size:12px">Sealed in ${esc(d.r.name)}${d.final ? (d.contenders.length >= 3 ? ` in a ${numWord(d.contenders.length)}-way showdown` : ' on the final day') : ` with ${plural(d.m.left.length, 'round')} to spare`} · ${plural(d.m.margin, 'point')} clear of ${esc(T.rivalName || '–')}</span></div>
        <div class="panel-b grid-2">${retroSections(c, s, T).map(sec => `<div><h3 style="margin-bottom:8px">${esc(sec.title)}</h3><ul class="ms-list">${sec.items.map(o => `<li>${o.id ? avatar(c, s, o.id, 24) : ''}<span>${esc(o.text)}</span></li>`).join('')}</ul></div>`).join('')}</div></div>`; }).join('')}
    ${(() => { const RV = seasonReview(c, s); return RV ? `<div class="panel review-panel"><div class="panel-h"><div><span class="label">The season in review</span><h2>${esc(RV.headline)}</h2></div></div>
      <div class="panel-b"><p class="standfirst">${esc(RV.standfirst)}</p><div class="body">${RV.intro.map(p => `<p>${esc(p)}</p>`).join('')}</div>${reviewHtml(c, s, RV)}</div></div>` : ''; })()}
    <div class="tiles">
      <div class="tile"><span class="label">Your position</span><span class="v">${myPos ? 'P' + myPos : '–'}<small>${delta ? ` ${delta > 0 ? '▲' : '▼'}${Math.abs(delta)} on ${prev.year}` : ''}</small></span></div>
      <div class="tile"><span class="label">Points</span><span class="v">${me.pts}</span></div>
      <div class="tile"><span class="label">Wins</span><span class="v">${me.wins}</span></div>
      <div class="tile"><span class="label">Podiums</span><span class="v">${me.podiums}</span></div>
      <div class="tile"><span class="label">Poles</span><span class="v">${me.poles}</span></div>
      <div class="tile"><span class="label">Goals met</span><span class="v">${goals.filter(x => x.e.ok).length}<small> / ${goals.length}</small></span></div>
    </div>
    <div class="grid-2">
      <div class="panel"><div class="panel-h"><h2>Best weekends</h2></div><div class="panel-b tight"><table><thead><tr><th>Rnd</th><th>Grand Prix</th><th class="num">Quali</th><th class="num">Race</th><th class="num">Pts</th></tr></thead><tbody>${best.map(wkRow).join('')}</tbody></table></div></div>
      <div class="panel"><div class="panel-h"><h2>Weekends to forget</h2></div><div class="panel-b tight"><table><thead><tr><th>Rnd</th><th>Grand Prix</th><th class="num">Quali</th><th class="num">Race</th><th class="num">Pts</th></tr></thead><tbody>${worst.length ? worst.map(wkRow).join('') : '<tr><td colspan="5"><div class="empty">Not enough races yet.</div></td></tr>'}</tbody></table></div></div>
    </div>
    <div class="grid-2">
      <div class="panel"><div class="panel-h"><h2>Teammate verdict</h2><span class="muted" style="font-size:12px">${esc(team?.name || '')}</span></div><div class="panel-b stack">
        ${mate ? `<p style="margin:0">${esc(verdict)}</p>${miniH2H('Qualifying', h.q[0], h.q[1], s, mate)}${miniH2H('Race', h.r[0], h.r[1], s, mate)}${miniH2H('Points', h.pts[0], h.pts[1], s, mate)}` : '<div class="empty">No teammate this season.</div>'}
      </div></div>
      <div class="panel"><div class="panel-h"><h2>Season goals</h2></div><div class="panel-b">${goals.length ? goals.map(({ g, e }) => `<div class="goal"><div><div style="font-weight:600">${esc(goalTitle(g))}</div><div class="muted" style="font-size:12px">${esc(e.text)}</div></div>
        <div class="row"><span class="status-dot ${e.ok ? 'ok' : 'warn'}"></span><span class="muted" style="font-size:12px">${e.ok ? 'Achieved' : complete ? 'Missed' : 'Not yet'}</span></div></div>`).join('') : '<div class="empty">No goals were set.</div>'}</div></div>
    </div>
    <div class="panel"><div class="panel-h"><h2>Awards</h2></div><div class="panel-b"><div class="award-grid">${awards.map(([lab, x, fmt, note]) => `<div class="award"><span class="label">${lab}</span>
      ${x ? `<div class="row" style="gap:10px;flex-wrap:nowrap">${avatar(c, s, x.id, 40)}<div style="min-width:0"><b>${esc(dName(s, x.id))}</b><div class="muted" style="font-size:12px">${esc(fmt(x))}</div></div></div>` : `<span class="muted">${esc(note || 'Nobody qualifies')}</span>`}</div>`).join('')}
      <div class="award"><span class="label">Team of the year</span><div class="row" style="gap:10px;flex-wrap:nowrap">${teamLogo(c, cs[0].team, 40)}<div><b>${esc(cs[0].team.name)}</b><div class="muted" style="font-size:12px">${cs[0].pts} points</div></div></div></div>
    </div></div></div>
    <div class="panel"><div class="panel-h"><h2>Championship story</h2></div><div class="panel-b">${lineChart(driverSeries(s, dp, 'pts', 5), dp.labels, { names: dp.names })}</div></div>
    <div class="grid-2">
      <div class="panel"><div class="panel-h"><h2>Records</h2><button class="btn sm ghost" data-act="nav" data-view="records">Record book</button></div>
        ${recs.length ? `<div class="panel-b"><ul class="ms-list">${recs.map(e => `<li>${e.team ? teamLogo(c, e.team, 26) : avatar(c, s, e.id, 26)}<span><b>${esc(e.team ? e.team.name : tl.nameOf(e.id))}</b> ${e.kind === 'broken' ? 'broke' : 'equalled'} the record for the ${esc(tl.recs[e.rid].label)} <span class="muted">· ${esc(e.r.name)}</span></span></li>`).join('')}</ul></div>` : '<div class="empty">No records broken this season.</div>'}</div>
      <div class="panel"><div class="panel-h"><h2>Milestones</h2><span class="muted">${miles.length}</span></div>
        ${miles.length ? `<div class="panel-b"><ul class="ms-list">${miles.slice(0, 14).map(x => `<li>${avatar(c, s, x.id, 26)}<span>${esc(x.text)} <span class="muted">· ${esc(x.r.name)}</span></span></li>`).join('')}</ul>${miles.length > 14 ? `<p class="muted" style="font-size:12px;margin-top:8px">${miles.length - 14} more in Stories.</p>` : ''}</div>` : '<div class="empty">No milestones this season.</div>'}</div>
    </div>
  </div>`;
}

/* ---------------------------------------------------------------- drivers */
const refName = (id) => D.DRIVERS[id]?.name || D.HIST_DRIVERS[id] || id;
const fmtPts = (v) => Number.isInteger(v) ? String(v) : v.toFixed(1);
const plus = (n, fmt = String) => n > 0 ? ` <small class="plus" title="Added in this career">+${fmt(n)}</small>` : '';

/** careerCtx as it stood after `at` rounds of season s: for stories, which only know what had happened by then. */
const _ctxCache = new WeakMap();
function careerCtxTo(c, s, at = Infinity) {
  let v = _ctxCache.get(c); if (!v || v.gen !== renderGen) { v = { gen: renderGen, m: {} }; _ctxCache.set(c, v); }
  const key = s.index + ':' + at;
  return v.m[key] ||= c.seasons.filter(x => x.index <= s.index).map(x => {
    const n = activeRounds(x).length; const upto = x.index < s.index ? Infinity : at;
    const st = upto >= n ? seasonStatsCache(x) : seasonStats(x, upto); const done = Math.min(roundsDone(x), upto);
    return { s: x, st, ds: driverStandings(x, st), cs: constructorStandings(x, st), done, complete: done > 0 && done === n };
  });
}
function careerCtx(c) {
  return c.seasons.map(s => {
    const st = seasonStats(s); const done = roundsDone(s);
    return { s, st, ds: driverStandings(s, st), cs: constructorStandings(s, st), done, complete: done > 0 && done === activeRounds(s).length };
  });
}

/** Real totals before 2016, the real seasons since, plus everything logged in this career. `base` is everything
 *  real (so tot − base is what the career added). */
function driverRecord(c, id, ctx = careerCtx(c)) {
  const bio = id === PLAYER_ID ? null : D.DRIVER_BIO[id] || null;
  const KEYS = ['starts', 'wins', 'podiums', 'poles', 'fls', 'pts'];
  const base = Object.fromEntries(KEYS.map(k => [k, bio?.[k] || 0]));
  const tot = { ...base, titles: [...(bio?.titles || [])], bestChamp: bio?.bestChamp ?? null, bestFinish: bio?.bestFinish ?? null, dnfs: 0 };
  const seasons = [];
  for (const { s, st, ds, complete } of ctx) {
    const o = st[id];
    if (!o || !s.drivers[id]) continue;
    const pos = ds.find(x => x.id === id)?.pos ?? null;
    seasons.push({ s, o, pos, team: teamOf(s, id), complete });
    for (const k of KEYS) { tot[k] += o[k]; if (isHist(s)) base[k] += o[k]; }
    tot.dnfs += o.dnfs;
    if (o.best != null) tot.bestFinish = tot.bestFinish == null ? o.best : Math.min(tot.bestFinish, o.best);
    if (complete && pos != null) {
      tot.bestChamp = tot.bestChamp == null ? pos : Math.min(tot.bestChamp, pos);
      if (pos === 1) tot.titles.push(s.year);
    }
  }
  return { bio, base, tot, seasons };
}

function renderDrivers() {
  const c = career(); const s = latestSeason();
  const ctx = careerCtx(c);
  const known = allKnownDrivers(c, s);
  const grid = gridIds(s);
  const scope = ui.drv.scope;
  const ids = scope === 'grid' ? grid : [...new Set([...grid, ...c.seasons.flatMap(gridIds), ...Object.keys(D.DRIVER_BIO)])].filter(id => known[id]);
  const name = (id) => id === PLAYER_ID ? `${c.profile.first} ${c.profile.last}` : known[id]?.name || id;
  const rows = ids.map(id => ({ id, ...driverRecord(c, id, ctx) }));
  const k = ui.drv.sort;
  const val = (r) => k === 'titles' ? r.tot.titles.length : k === 'winPct' ? (r.tot.starts ? r.tot.wins / r.tot.starts : -1) : r.tot[k];
  rows.sort((a, b) => k === 'name' ? name(a.id).localeCompare(name(b.id)) : (val(b) - val(a)) || name(a.id).localeCompare(name(b.id)));
  return `<div class="page">
    <div class="page-head"><div><h1>Drivers</h1><div class="sub">Real F1 career totals, plus every race logged in your career (shown in green).</div></div>
      <div class="row">${sortSel('drv-sort-sel', k, [['wins', 'Wins'], ['titles', 'Titles'], ['podiums', 'Podiums'], ['poles', 'Poles'], ['starts', 'Starts'], ['pts', 'Points'], ['fls', 'Fastest laps'], ['winPct', 'Win %'], ['name', 'Name']])}<div class="seg">${[['grid', `${s.year} grid`], ['all', 'All drivers']].map(([v, l]) => `<button data-act="drv-scope" data-v="${v}" class="${scope === v ? 'on' : ''}">${l}</button>`).join('')}</div></div></div>
    <div class="cards">${rows.map(r => driverCard(c, s, r, name(r.id), known[r.id])).join('')}</div>
  </div>`;
}
const sortSel = (ch, v, opts) => `<label class="row muted" style="gap:6px;font-size:13px">Sort <select data-ch="${ch}" style="width:auto">${opts.map(([k, l]) => `<option value="${k}" ${v === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`;
/** A driver as a card: team colour, photo, number, flag and the career totals. */
function driverCard(c, s, r, nm, entry) {
  const t = teamOf(s, r.id); const col = t?.color || '#5E6A82';
  const add = (key, fmt) => plus(r.tot[key] - r.base[key], fmt);
  const nat = r.id === PLAYER_ID ? c.profile.nationality : r.bio?.nat;
  const stat = (label, v, extra = '') => `<div><span class="label">${label}</span><b>${v}</b>${extra}</div>`;
  return `<button class="dcard ${r.id === PLAYER ? 'me' : ''}" style="--c:${col}" data-act="open-driver" data-id="${r.id}">
    <span class="dcard-num">${esc(entry?.number ?? '')}</span>
    <div class="dcard-top">${avatar(c, s, r.id, 58)}<div class="dcard-who"><span class="ab">${natFlag(nat, 12)} ${esc(entry?.abbr || r.id)}</span><b>${esc(nm)}</b><small>${t ? esc(t.name) : r.bio?.feeder ? esc(r.bio.feeder) : 'Not on the grid'}${ageNow(c, r.id) != null ? ` · ${ageNow(c, r.id)}` : ''}</small></div>${r.bio?.fictional ? '<span class="tag">Fictional</span>' : ''}</div>
    <div class="dcard-stats">${stat('Titles', r.tot.titles.length || '–')}${stat('Wins', r.tot.wins, add('wins'))}${stat('Podiums', r.tot.podiums, add('podiums'))}${stat('Poles', r.tot.poles, add('poles'))}${stat('Starts', r.tot.starts, add('starts'))}${stat('Points', fmtPts(r.tot.pts), add('pts', fmtPts))}</div>
  </button>`;
}

function renderDriver() {
  const c = career(); const s = latestSeason();
  const id = ui.driverId;
  const known = allKnownDrivers(c, s);
  const d = s.drivers[id] || known[id];
  if (!d) { ui.view = 'drivers'; return renderDrivers(); }
  const { bio, base, tot, seasons } = driverRecord(c, id);
  const isMe = id === PLAYER; // the driver the pages follow
  const isYou = id === PLAYER_ID; // the driver you created
  const team = teamOf(s, id);
  const col = team?.color || '#5E6A82';
  const name = isYou ? `${c.profile.first} ${c.profile.last}` : d.name;
  const nat = isYou ? c.profile.nationality : bio?.nat;
  const born = bornOf(c, id);
  const age = ageNow(c, id);
  const editableDob = isYou || c.customDrivers?.some(x => x.id === id);
  const add = (k) => tot[k] - base[k];
  const inCareer = c.seasons.some(x => gridIds(x).includes(id));
  const titles = tot.titles;
  const me = seasons.find(x => x.s === s)?.o;
  const recent = me ? activeRounds(s).map((r, i) => ({ r, i, br: me.byRound[r.id] })).filter(x => x.br && (x.br.r != null || x.br.q != null)) : [];
  const resCell = (v) => v == null ? '–' : typeof v === 'number' ? 'P' + v : `<span class="tag dnf">${v}</span>`;
  const firstWin = bio?.firstWin || (() => {
    for (const { s: se, o } of seasons) { const r = activeRounds(se).find(x => o.byRound[x.id]?.r === 1); if (r) return `${se.year} ${r.name} GP${isHist(se) ? '' : ' (career)'}`; }
    return null;
  })();

  return `<div class="page">
    <div class="row"><button class="btn sm ghost" data-act="nav" data-view="drivers">${ICON.left} All drivers</button></div>
    <section class="hero" style="--team:${col}">
      <div class="stripes"></div>
      <div class="hero-pic">${avatar(c, s, id, 104)}<div class="big-num">${esc(d.number || '–')}</div></div>
      <div style="position:relative;z-index:1;min-width:0">
        <span class="label">${team ? `<button data-act="open-team" data-id="${team.id}" class="link-btn">${esc(team.name)}</button> · ${s.year}` : `Not on the ${s.year} grid`}</span>
        <div class="name">${natFlag(nat, 22)} ${esc(name)}${isMe ? ` <span class="tag">${isPrincipal(c) ? 'Your lead driver' : 'You'}</span>` : ''}${bio?.fictional ? ' <span class="tag">Fictional</span>' : ''}</div>
        <div class="meta">${nat ? `<span>${esc(nat)}</span>` : ''}${age != null ? `<span>Age ${age}</span>` : ''}${bio?.debut ? `<span>Debut: ${esc(bio.debut)}</span>` : ''}${isYou ? '' : `<span>Contract: ${esc(contractTxt(c, latestSeason(), id))}</span>`}</div>
      </div>
      <div class="next-card">
        <span class="label">World championships</span>
        <div style="font-family:var(--font-display);font-size:28px;font-weight:600;line-height:1">${titles.length}</div>
        <span class="muted" style="font-size:13px">${titles.length ? titles.join(', ') : tot.bestChamp ? `Best: P${tot.bestChamp} in the championship` : 'No completed seasons yet'}</span>
        <div class="row" style="gap:6px">${inCareer ? `<button class="btn sm" data-act="driver-h2h" data-id="${id}">${isMe ? 'Head to head' : 'Compare with you'}</button>` : ''}${isYou ? '' : `<button class="btn sm" data-act="tr-new" data-driver="${id}">${ICON.swap} Transfer</button>`}${pictureControls('driver', id, !!driverPhoto(c, id))}</div>
      </div>
    </section>
    ${numberOneToggle(c, id)}

    <div class="tiles">
      <div class="tile"><span class="label">Starts</span><span class="v">${tot.starts}${plus(add('starts'))}</span></div>
      <div class="tile"><span class="label">Wins</span><span class="v">${tot.wins}${plus(add('wins'))}</span></div>
      <div class="tile"><span class="label">Podiums</span><span class="v">${tot.podiums}${plus(add('podiums'))}</span></div>
      <div class="tile"><span class="label">Poles</span><span class="v">${tot.poles}${plus(add('poles'))}</span></div>
      <div class="tile"><span class="label">Fastest laps</span><span class="v" style="color:var(--purple)">${tot.fls}${plus(add('fls'))}</span></div>
      <div class="tile"><span class="label">Points</span><span class="v">${fmtPts(tot.pts)}${plus(add('pts'), fmtPts)}</span></div>
    </div>

    <div class="panel"><div class="panel-h"><h2>Career by season</h2><span class="muted" style="font-size:12px">Green figures are what this driver has added in your career</span></div><div class="panel-b tight table-wrap"><table>
      <thead><tr><th>Season</th><th>Team</th><th class="num">Pos</th><th class="num">Starts</th><th class="num">Pts</th><th class="num">Wins</th><th class="num">Pod</th><th class="num">Poles</th><th class="num">FL</th><th class="num">DNF</th><th class="num">Avg finish</th></tr></thead>
      <tbody>
        ${bio && !bio.fictional && bio.starts ? `<tr><td><b>Before ${HIST_FROM}</b><div class="muted" style="font-size:12px">Real F1</div></td><td class="muted" style="max-width:340px;white-space:normal">${esc(bio.teams || '')}</td><td class="num">${bio.bestChamp ? 'Best P' + bio.bestChamp : '–'}</td>
          <td class="num">${bio.starts}</td><td class="num"><b>${fmtPts(bio.pts)}</b></td><td class="num">${bio.wins}</td><td class="num">${bio.podiums}</td><td class="num">${bio.poles}</td><td class="num">${bio.fls}</td><td class="num muted">–</td><td class="num muted">–</td></tr>` : ''}
        ${seasons.map(x => `<tr class="${x.s === s ? 'me' : ''}"><td><b>${x.s.year}</b>${x.complete ? '' : ' <span class="muted" style="font-size:12px">in progress</span>'}</td>
          <td>${x.team ? `<div class="drv"><span class="chip" style="--c:${x.team.color}"></span>${esc(x.team.name)}</div>` : '<span class="muted">Left the grid</span>'}</td>
          <td class="num">${x.pos && x.o.starts ? `<span class="pos ${x.complete && x.pos <= 3 ? 'p' + x.pos : ''}" style="font-size:14px">P${x.pos}</span>` : '–'}</td>
          <td class="num">${x.o.starts}</td><td class="num"><b>${x.o.pts}</b></td><td class="num">${x.o.wins}</td><td class="num">${x.o.podiums}</td><td class="num">${x.o.poles}</td><td class="num">${x.o.fls}</td><td class="num">${x.o.dnfs}</td><td class="num">${fmtAvg(avg(x.o.finPos))}</td></tr>`).join('')}
        ${!seasons.length && !(bio && bio.starts) ? '<tr><td colspan="11"><div class="empty">No Grand Prix starts yet.</div></td></tr>' : ''}
      </tbody></table></div></div>

    <div class="grid-2">
      <div class="panel"><div class="panel-h"><h2>Profile</h2></div><div class="panel-b">
        <dl class="kv">
          ${editableDob ? `<dt>Date of birth</dt><dd><input type="date" data-ch="dob" data-id="${id}" value="${esc(born || '')}" style="width:auto"> ${born ? '' : '<span class="muted" style="font-size:12px">Needed for age records</span>'}</dd>`
            : born ? `<dt>Born</dt><dd>${esc(fmtDay(parseDay(born), true))}</dd>` : ''}
          ${born ? `<dt>Age</dt><dd>${ageTxt(ageParts(born, careerNow(c)))} <span class="muted" style="font-size:12px">on ${fmtDay(careerNow(c), true)}</span></dd>` : ''}
          ${nat ? `<dt>Nationality</dt><dd>${esc(nat)}</dd>` : ''}
          <dt>F1 debut</dt><dd>${esc(bio?.debut || (seasons[0] ? `${seasons[0].s.year} ${activeRounds(seasons[0].s)[0]?.name || ''} GP` : '–'))}</dd>
          <dt>First win</dt><dd>${esc(firstWin || '–')}</dd>
          <dt>Best finish</dt><dd>${tot.bestFinish ? 'P' + tot.bestFinish : '–'}</dd>
          <dt>Best championship</dt><dd>${tot.bestChamp ? 'P' + tot.bestChamp : '–'}</dd>
          <dt>Win rate</dt><dd>${tot.starts ? (tot.wins / tot.starts * 100).toFixed(1) + '%' : '–'}</dd>
          <dt>Podium rate</dt><dd>${tot.starts ? (tot.podiums / tot.starts * 100).toFixed(1) + '%' : '–'}</dd>
          ${bio?.teams ? `<dt>Teams</dt><dd>${esc(bio.teams)}</dd>` : ''}
          ${isMe && c.profile.bio ? `<dt>Backstory</dt><dd>${esc(c.profile.bio)}</dd>` : bio?.note ? `<dt>Notes</dt><dd>${esc(bio.note)}</dd>` : ''}
        </dl>
      </div></div>
      <div class="panel"><div class="panel-h"><h2>${s.year} results</h2></div><div class="panel-b tight table-wrap"><table>
        <thead><tr><th>Rnd</th><th>Grand Prix</th><th class="num">Quali</th><th class="num">Sprint</th><th class="num">Race</th></tr></thead>
        <tbody>${recent.length ? recent.map(({ r, i, br }) => `<tr data-act="open-round" data-round="${r.id}"><td class="muted num">${i + 1}</td><td>${esc(r.name)}</td><td class="num">${br.q ? 'P' + br.q : '–'}</td><td class="num">${resCell(br.s)}</td><td class="num"><b>${resCell(br.r)}</b>${br.fl ? ' <span class="fl-tag">FL</span>' : ''}</td></tr>`).join('')
          : `<tr><td colspan="5"><div class="empty">No ${s.year} sessions logged${team ? ' yet' : ''}.</div></td></tr>`}</tbody>
      </table></div></div>
    </div>
  </div>`;
}

/* ------------------------------------------------------------------ teams */
/** A team's name and colours: from the newest season it raced in, else the templates. */
function teamMeta(c, id) {
  for (let i = c.seasons.length - 1; i >= 0; i--) { const t = c.seasons[i].teams.find(x => x.id === id); if (t) return t; }
  const t = [...D.GRID_2026, ...D.GRID_2025, ...Object.values(D.EXTRA_2025)].find(x => x.id === id);
  return t ? { ...t, drivers: [] } : { id, name: D.TEAM_BIO[id]?.full || id, color: '#5E6A82', drivers: [] };
}
/** Real record up to the end of 2024 plus every race logged in this career (a renamed team includes its earlier entry). */
function teamRecord(c, id, ctx = careerCtx(c)) {
  const bio = id === MYTEAM ? null : D.TEAM_BIO[id] || null;
  const ids = [id, ...(bio?.lineage || [])];
  const src = bio?.lineage ? D.TEAM_BIO[bio.lineage[0]] : bio;
  const KEYS = ['starts', 'wins', 'poles', 'podiums', 'fls'];
  const base = Object.fromEntries(KEYS.map(k => [k, src?.[k] || 0]));
  const tot = { ...base, pts: 0, conTitles: [...(src?.conTitles || [])], drvTitles: src?.drvTitles || 0, drvYears: [], bestFinish: src?.bestFinish ?? (src?.wins ? 1 : null), bestCon: src?.conTitles?.length ? 1 : null };
  const seasons = [];
  for (const { s, st, ds, cs, done, complete } of ctx) {
    const t = s.teams.find(x => ids.includes(x.id)); if (!t) continue;
    const row = cs.find(x => x.team.id === t.id);
    const drivers = t.drivers.filter(Boolean);
    const o = { starts: done, wins: 0, poles: 0, podiums: 0, fls: 0, pts: row?.pts || 0, best: null };
    for (const d of drivers) {
      const x = st[d]; if (!x) continue;
      o.wins += x.wins; o.poles += x.poles; o.podiums += x.podiums; o.fls += x.fls;
      if (x.best != null) o.best = o.best == null ? x.best : Math.min(o.best, x.best);
    }
    for (const k of KEYS) { tot[k] += o[k]; if (isHist(s)) base[k] += o[k]; }
    tot.pts += o.pts;
    if (o.best != null) tot.bestFinish = tot.bestFinish == null ? o.best : Math.min(tot.bestFinish, o.best);
    if (complete && row) {
      tot.bestCon = tot.bestCon == null ? row.pos : Math.min(tot.bestCon, row.pos);
      if (row.pos === 1) tot.conTitles.push(s.year);
      if (ds[0] && drivers.includes(ds[0].id)) { tot.drvTitles++; tot.drvYears.push(s.year); }
    }
    seasons.push({ s, t, o, pos: row?.pos ?? null, drivers, complete, done });
  }
  return { bio, src, base, tot, seasons };
}

function renderTeams() {
  const c = career(); const s = latestSeason();
  const ctx = careerCtx(c);
  const scope = ui.tms.scope;
  const onGrid = s.teams.map(t => t.id);
  const raced = new Set(c.seasons.flatMap(x => x.teams.map(t => t.id)));
  // a renamed team (Audi) only shows once it has raced, so the earlier entry's record isn't listed twice
  const extra = [...new Set([...raced, ...Object.keys(D.TEAM_BIO)])].filter(id => !onGrid.includes(id) && (id !== MYTEAM || c.myTeam) && (raced.has(id) || !D.TEAM_BIO[id]?.lineage));
  const ids = scope === 'grid' ? onGrid : [...onGrid, ...extra];
  const rows = ids.map(id => ({ id, meta: s.teams.find(t => t.id === id) || teamMeta(c, id), ...teamRecord(c, id, ctx) }));
  const k = ui.tms.sort;
  const val = (r) => k === 'conTitles' ? r.tot.conTitles.length * 1000 + r.tot.drvTitles : k === 'drvTitles' ? r.tot.drvTitles : k === 'winPct' ? (r.tot.starts ? r.tot.wins / r.tot.starts : -1) : r.tot[k];
  rows.sort((a, b) => k === 'name' ? a.meta.name.localeCompare(b.meta.name) : (val(b) - val(a)) || b.tot.wins - a.tot.wins || a.meta.name.localeCompare(b.meta.name));
  return `<div class="page">
    <div class="page-head"><div><h1>Teams</h1><div class="sub">Real F1 team records, plus every race logged in your career (shown in green).</div></div>
      <div class="row">${sortSel('tm-sort-sel', k, [['conTitles', 'Constructors’ titles'], ['drvTitles', 'Drivers’ titles'], ['wins', 'Wins'], ['poles', 'Poles'], ['podiums', 'Podiums'], ['starts', 'Starts'], ['winPct', 'Win %'], ['name', 'Name']])}<div class="seg">${[['grid', `${s.year} grid`], ['all', 'All teams']].map(([v, l]) => `<button data-act="tm-scope" data-v="${v}" class="${scope === v ? 'on' : ''}">${l}</button>`).join('')}</div></div></div>
    <div class="cards">${rows.map(r => teamCard(c, s, r)).join('')}</div>
  </div>`;
}
/** A team as a card: colours, logo, this season's drivers and the record. */
function teamCard(c, s, r) {
  const t = s.teams.find(x => x.id === r.id);
  const add = (key) => plus(r.tot[key] - r.base[key]);
  const bio = D.TEAM_BIO[r.id];
  const country = (bio?.base || '').split(',').pop().trim();
  const stat = (label, v, extra = '') => `<div><span class="label">${label}</span><b>${v}</b>${extra}</div>`;
  return `<button class="dcard tcard ${r.id === s.playerTeamId ? 'me' : ''}" style="--c:${r.meta.color}" data-act="open-team" data-id="${r.id}">
    <div class="dcard-top">${teamLogo(c, r.meta, 46)}<div class="dcard-who"><span class="ab">${countryFlag(country, 12)} ${esc(bio?.short || r.meta.name.slice(0, 3).toUpperCase())}</span><b>${esc(r.meta.name)}</b><small>${bio?.since ? `Since ${bio.since}` : ''}${bio?.engine ? ` · ${esc(bio.engine)}` : ''}</small></div>${r.src?.fictional ? '<span class="tag">Fictional</span>' : ''}</div>
    <div class="tcard-drivers">${t ? t.drivers.filter(Boolean).map(d => `<span>${avatar(c, s, d, 24)} ${esc(dName(s, d))}</span>`).join('') : '<span class="muted">Not on the grid</span>'}</div>
    <div class="dcard-stats">${stat('Constructors’', r.tot.conTitles.length || '–')}${stat('Drivers’', r.tot.drvTitles || '–')}${stat('Wins', r.tot.wins, add('wins'))}${stat('Poles', r.tot.poles, add('poles'))}${stat('Podiums', r.tot.podiums, add('podiums'))}${stat('Starts', r.tot.starts, add('starts'))}</div>
  </button>`;
}

function renderTeam() {
  const c = career(); const s = latestSeason();
  const id = ui.teamId;
  if (!id) { ui.view = 'teams'; return renderTeams(); }
  const meta = s.teams.find(t => t.id === id) || teamMeta(c, id);
  const isMine = id === MYTEAM && c.myTeam;
  const { src, base, tot, seasons } = teamRecord(c, id);
  const bio = D.TEAM_BIO[id] || {};
  const add = (k) => tot[k] - base[k];
  const onGrid = s.teams.find(t => t.id === id);
  const st = seasonStats(s); const cs = constructorStandings(s, st);
  const cur = cs.find(x => x.team.id === id);
  const lineup = onGrid ? onGrid.drivers.filter(Boolean) : [];
  const col2 = isMine ? c.myTeam.color2 : bio.color2 || meta.color;
  // every driver who has raced for the team in this career
  const alumni = {};
  for (const x of seasons) for (const d of x.drivers) { const o = seasonStatsCache(x.s)[d]; const a = (alumni[d] ||= { id: d, s: x.s, seasons: [], pts: 0, wins: 0, podiums: 0 }); a.seasons.push(x.s.year); a.s = x.s; a.pts += o?.pts || 0; a.wins += o?.wins || 0; a.podiums += o?.podiums || 0; }
  return `<div class="page">
    <div class="row"><button class="btn sm ghost" data-act="nav" data-view="teams">${ICON.left} All teams</button></div>
    <section class="hero" style="--team:${meta.color};--team-2:${col2}">
      <div class="stripes"></div>
      ${teamLogo(c, meta, 92)}
      <div style="position:relative;z-index:1;min-width:0">
        <span class="label">${onGrid ? `${s.year} constructors · ${cur && roundsDone(s) ? 'P' + cur.pos : 'season not started'}` : `Not on the ${s.year} grid`}</span>
        <div class="name">${esc(meta.name)}${src?.fictional ? ' <span class="tag">Fictional</span>' : ''}${isMine ? ' <span class="tag">Your team</span>' : ''}</div>
        <div class="meta">${[isMine ? c.myTeam.base : bio.base, (isMine ? c.myTeam.engine : bio.engine) && `${isMine ? c.myTeam.engine : bio.engine} power`, `Team principal: ${isMine ? c.myTeam.principal || `${c.profile.first} ${c.profile.last}` : bio.principal || '–'}`].filter(Boolean).map(x => `<span>${esc(x)}</span>`).join('')}</div>
      </div>
      <div class="next-card">
        <span class="label">Constructors’ championships</span>
        <div style="font-family:var(--font-display);font-size:28px;font-weight:600;line-height:1">${tot.conTitles.length}</div>
        <span class="muted" style="font-size:13px;max-width:260px">${tot.conTitles.length ? esc(tot.conTitles.join(', ')) : tot.bestCon ? `Best: P${tot.bestCon}` : 'No titles yet'}</span>
        <div class="row" style="gap:6px">${isMine ? `<button class="btn sm" data-act="nav" data-view="dashboard">Manage team</button>` : pictureControls('team', id, !!teamLogoUrl(c, id))}</div>
      </div>
    </section>

    <div class="tiles">
      <div class="tile"><span class="label">Starts</span><span class="v">${tot.starts}${plus(add('starts'))}</span></div>
      <div class="tile"><span class="label">Wins</span><span class="v">${tot.wins}${plus(add('wins'))}</span></div>
      <div class="tile"><span class="label">Poles</span><span class="v">${tot.poles}${plus(add('poles'))}</span></div>
      <div class="tile"><span class="label">Podiums</span><span class="v">${tot.podiums}${plus(add('podiums'))}</span></div>
      <div class="tile"><span class="label">Fastest laps</span><span class="v" style="color:var(--purple)">${tot.fls}${plus(add('fls'))}</span></div>
      <div class="tile"><span class="label">Drivers’ titles</span><span class="v">${tot.drvTitles}${plus(tot.drvYears.length)}</span></div>
    </div>

    <div class="panel"><div class="panel-h"><h2>Record by season</h2><span class="muted" style="font-size:12px">Green figures are what the team has added in your career</span></div><div class="panel-b tight table-wrap"><table>
      <thead><tr><th>Season</th><th>Entered as</th><th class="num">Pos</th><th class="num">Starts</th><th class="num">Pts</th><th class="num">Wins</th><th class="num">Pod</th><th class="num">Poles</th><th class="num">FL</th><th>Drivers</th></tr></thead>
      <tbody>
        ${src && !src.fictional && src.starts ? `<tr><td><b>Before ${HIST_FROM}</b><div class="muted" style="font-size:12px">Real F1</div></td><td class="muted" style="max-width:300px;white-space:normal">${esc(src.scope || '')}</td><td class="num">${src.conTitles?.length ? `${src.conTitles.length}× champion` : src.bestFinish ? 'Best finish P' + src.bestFinish : '–'}</td>
          <td class="num">${src.starts}</td><td class="num muted">–</td><td class="num">${src.wins}</td><td class="num">${src.podiums}</td><td class="num">${src.poles}</td><td class="num">${src.fls}</td><td class="muted">–</td></tr>` : ''}
        ${seasons.slice().reverse().map(x => `<tr class="${x.s === s ? 'me' : ''}"><td><b>${x.s.year}</b>${x.complete ? '' : ` <span class="muted" style="font-size:12px">${x.done}/${activeRounds(x.s).length}</span>`}</td>
          <td><div class="drv">${teamLogo(c, x.t, 20)}${esc(x.t.name)}</div></td>
          <td class="num">${x.pos && x.done ? `<span class="pos ${x.complete && x.pos <= 3 ? 'p' + x.pos : ''}" style="font-size:14px">P${x.pos}</span>` : '–'}</td>
          <td class="num">${x.o.starts}</td><td class="num"><b>${x.o.pts}</b></td><td class="num">${x.o.wins}</td><td class="num">${x.o.podiums}</td><td class="num">${x.o.poles}</td><td class="num">${x.o.fls}</td>
          <td><div class="row" style="gap:4px;flex-wrap:nowrap">${x.drivers.map(d => avatar(c, x.s, d, 22)).join('')}<span class="muted" style="font-size:12px">${x.drivers.map(d => esc(dAbbr(x.s, d))).join(' · ')}</span></div></td></tr>`).join('')}
        ${!seasons.length && !(src && src.starts) ? '<tr><td colspan="10"><div class="empty">No races yet.</div></td></tr>' : ''}
      </tbody></table></div></div>

    <div class="grid-2">
      <div class="panel"><div class="panel-h"><h2>Profile</h2></div><div class="panel-b stack">
        ${(isMine ? c.myTeam.story : bio.about) ? `<p style="margin:0">${esc(isMine ? c.myTeam.story : bio.about)}</p>` : ''}
        <dl class="kv">
          <dt>Full name</dt><dd>${esc(isMine ? c.myTeam.name : bio.full || meta.name)}</dd>
          <dt>Base</dt><dd>${esc((isMine ? c.myTeam.base : bio.base) || '–')}</dd>
          <dt>First season</dt><dd>${isMine ? c.myTeam.founded || 2025 : bio.since || '–'}</dd>
          <dt>First win</dt><dd>${esc(src?.firstWin || (() => { for (const x of seasons) for (const r of activeRounds(x.s)) { const w = x.s.weekends[r.id]?.sessions?.R; if (w?.done && x.drivers.includes(w.results.find(y => !OUT.includes(y.st))?.d)) return `${x.s.year} ${r.name} GP (career)`; } return '–'; })())}</dd>
          <dt>Best finish</dt><dd>${tot.bestFinish ? 'P' + tot.bestFinish : '–'}</dd>
          <dt>Win rate</dt><dd>${tot.starts ? (tot.wins / tot.starts * 100).toFixed(1) + '%' : '–'}</dd>
          ${tot.drvYears.length ? `<dt>Career drivers’ titles</dt><dd>${tot.drvYears.join(', ')}</dd>` : ''}
          ${src?.scope ? `<dt>Record covers</dt><dd class="muted">${esc(src.scope)}</dd>` : ''}
        </dl>
      </div></div>
      <div class="panel"><div class="panel-h"><h2>${onGrid ? `${s.year} line-up` : 'Drivers in your career'}</h2></div><div class="panel-b tight table-wrap"><table>
        <thead><tr><th>Driver</th><th>Seasons</th><th class="num">Pts</th><th class="num">Wins</th><th class="num">Pod</th></tr></thead>
        <tbody>${Object.values(alumni).sort((a, b) => (lineup.includes(b.id) - lineup.includes(a.id)) || b.pts - a.pts).map(a => `<tr class="${a.id === PLAYER ? 'me' : ''}" data-act="open-driver" data-id="${a.id}"><td>${drvCell(a.s, a.id)}</td><td class="muted">${a.seasons.join(', ')}</td><td class="num"><b>${a.pts}</b></td><td class="num">${a.wins}</td><td class="num">${a.podiums}</td></tr>`).join('')
          || '<tr><td colspan="5"><div class="empty">No career seasons with this team yet.</div></td></tr>'}</tbody>
      </table></div></div>
    </div>
  </div>`;
}
// seasonStats is pure; cache it per render so team and story pages that revisit a season stay quick
const _statsCache = new WeakMap();
function seasonStatsCache(s) { let v = _statsCache.get(s); if (!v || v.gen !== renderGen) { v = { gen: renderGen, st: seasonStats(s) }; _statsCache.set(s, v); } return v.st; }
let renderGen = 0;

/* --------------------------------------------------------------- circuits */
/** Every edition of a circuit, newest first: career seasons, then the real pre-2025 history. */
function trackEditions(c, tid) {
  const out = [];
  // `career`: the edition comes from a season in this career (real or yours); `played`: one you raced
  for (const s of c.seasons) for (const r of activeRounds(s).filter(x => trackOf(x) === tid)) {
    const w = s.weekends[r.id];
    const R = w?.sessions?.R;
    if (!R?.done) continue;
    const fin = R.results.filter(x => !OUT.includes(x.st)).map(x => x.d);
    const Q = w.sessions.Q;
    const fl = fastestOf(R);
    out.push({ career: true, played: !isHist(s), s, r, year: s.year, gp: r.id !== tid ? r.name : null, pole: Q?.done ? Q.pole ?? Q.results.find(x => !OUT.includes(x.st))?.d : null, podium: fin.slice(0, 3), fl, flLap: R.results.find(x => x.d === fl)?.lap || '' });
  }
  out.reverse();
  for (const [year, pole, p1, p2, p3, team] of D.TRACKS[tid]?.history || []) out.push({ career: false, year, pole, podium: [p1, p2, p3], team });
  return out;
}
function gpName(s, tid) {
  const own = s.calendar.find(x => x.id === tid);
  if (own) return own.name;
  // off this calendar: take the name from a template, unless another round already uses it (Madrid vs Barcelona)
  const name = [...D.CAL_2026, ...D.CAL_2025].find(([id]) => id === tid)?.[1] || Object.values(H.seasons).flatMap(h => h.rounds).find(r => r.id === tid)?.name;
  return name && !s.calendar.some(x => x.name === name) ? name : D.TRACKS[tid]?.city || tid;
}
/* Flags and circuit outlines (src/assets.js). Flags go in as images so their SVG ids never clash on a page. */
const A = window.F1ASSETS;
function flagHtml(code, h = 14) {
  const svg = code && A.flags[code];
  return svg ? `<img class="flag" alt="" src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}" style="height:${h}px;width:${Math.round(h * 4 / 3)}px">` : '';
}
const natFlag = (nat, h) => flagHtml(A.nat[nat], h);
const countryFlag = (country, h) => flagHtml(A.country[country], h);
function trackMap(tid, size = 120) {
  const d = A.maps[tid];
  return d ? `<svg class="track-map" viewBox="0 0 100 100" width="${size}" height="${size}" aria-hidden="true"><path d="${d}"/></svg>` : '';
}
const edAbbr = (e, id) => e.career ? dAbbr(e.s, id) : id;
const edName = (e, id) => e.career ? dName(e.s, id) : refName(id);
function edDriver(e, id, chip = false) {
  if (!id) return '<span class="muted">–</span>';
  if (e.career) return drvCell(e.s, id);
  return `<div class="drv">${chip ? `<span class="chip" style="--c:${D.HIST_TEAM_COLORS[e.team] || '#5E6A82'}"></span>` : ''}<span class="ab">${esc(id)}</span><span class="nm">${esc(refName(id))}</span></div>`;
}

/** Your results at each circuit, and where your team ranked among the teams there (by its best car). */
function circuitForm(c) {
  const by = {};
  const rankOf = (sd, s, tid) => {
    const best = {};
    sd.results.forEach((x, k) => { const t = teamOf(s, x.d)?.id; if (t && !(t in best) && !OUT.includes(x.st)) best[t] = k + 1; });
    if (!(tid in best)) return null;
    return Object.values(best).filter(v => v < best[tid]).length + 1;
  };
  for (const s of c.seasons) {
    const st = seasonStatsCache(s); const tid = teamOf(s, PLAYER)?.id;
    for (const r of activeRounds(s)) {
      const ses = s.weekends[r.id]?.sessions; if (!ses?.R?.done) continue;
      const br = st[PLAYER]?.byRound[r.id]; if (!br) continue;
      const o = (by[trackOf(r)] ||= { id: trackOf(r), name: gpName(s, trackOf(r)), visits: [], fin: [], grid: [], best: null, wins: 0, pods: 0, pts: 0, teamQ: [], teamR: [] });
      const pts = ['SPR', 'R'].reduce((a, k) => { const sd = ses[k]; if (!sd?.done) return a; const ix = sd.results.findIndex(x => x.d === PLAYER); return a + (ix >= 0 ? pointsFor(k, ix + 1, sd.results[ix].st, sd.results[ix].pts) : 0); }, 0);
      const tq = ses.Q?.done ? rankOf(ses.Q, s, tid) : null; const tr = rankOf(ses.R, s, tid);
      o.visits.push({ s, br, pts, tq, tr, team: teamOf(s, PLAYER) });
      o.pts += pts;
      if (br.q) o.grid.push(br.q);
      if (typeof br.r === 'number') { o.fin.push(br.r); o.best = o.best == null ? br.r : Math.min(o.best, br.r); if (br.r === 1) o.wins++; if (br.r <= 3) o.pods++; }
      if (tq) o.teamQ.push(tq); if (tr) o.teamR.push(tr);
    }
  }
  return Object.values(by);
}

function renderTracks() {
  const c = career(); const s = latestSeason();
  const form = circuitForm(c).sort((a, b) => (avg(a.fin) ?? 99) - (avg(b.fin) ?? 99));
  const withFin = form.filter(x => x.fin.length);
  const strong = withFin[0];
  const weak = withFin.length > 1 && avg(withFin[withFin.length - 1].fin) > avg(strong.fin) ? withFin[withFin.length - 1] : null;
  const fastest = form.filter(x => x.teamQ.length).sort((a, b) => avg(a.teamQ) - avg(b.teamQ))[0];
  const formHtml = form.length ? `<div class="panel"><div class="panel-h"><div><h2>Your circuit form</h2><span class="muted" style="font-size:12px">Sorted by average finish. Team pace ranks your team among all teams by its best car in qualifying and the race.</span></div></div>
    <div class="tiles" style="border-radius:0;border-left:0;border-right:0">
      <div class="tile"><span class="label">Strongest circuit</span><span class="v" style="font-size:20px">${strong ? esc(strong.name) : '–'}</span><span class="muted" style="font-size:12px">${strong ? `avg finish P${fmtAvg(avg(strong.fin))}` : ''}</span></div>
      <div class="tile"><span class="label">Toughest circuit</span><span class="v" style="font-size:20px">${weak ? esc(weak.name) : '–'}</span><span class="muted" style="font-size:12px">${weak ? `avg finish P${fmtAvg(avg(weak.fin))}` : ''}</span></div>
      <div class="tile"><span class="label">Team quickest at</span><span class="v" style="font-size:20px">${fastest ? esc(fastest.name) : '–'}</span><span class="muted" style="font-size:12px">${fastest ? `team ranked ${fmtAvg(avg(fastest.teamQ))} on average in qualifying` : ''}</span></div>
      <div class="tile"><span class="label">Circuits raced</span><span class="v">${form.length}</span></div>
      <div class="tile"><span class="label">Wins</span><span class="v">${form.reduce((a, x) => a + x.wins, 0)}</span></div>
      <div class="tile"><span class="label">Podiums</span><span class="v">${form.reduce((a, x) => a + x.pods, 0)}</span></div>
    </div>
    <div class="panel-b tight table-wrap"><table>
      <thead><tr><th>Circuit</th><th class="num">Visits</th><th class="num">Avg grid</th><th class="num">Avg finish</th><th class="num">Best</th><th class="num">Wins</th><th class="num">Podiums</th><th class="num">Pts / visit</th><th class="num">Team quali rank</th><th class="num">Team race rank</th></tr></thead>
      <tbody>${form.map(x => `<tr data-act="open-track" data-track="${x.id}" class="${x === strong ? 'me' : ''}"><td><b>${esc(x.name)}</b>${x === weak ? ' <span class="tag dnf">Toughest</span>' : x === strong ? ' <span class="tag done">Strongest</span>' : ''}</td><td class="num">${x.visits.length}</td>
        <td class="num">${fmtAvg(avg(x.grid))}</td><td class="num"><b>${fmtAvg(avg(x.fin))}</b></td><td class="num">${x.best ? 'P' + x.best : '–'}</td><td class="num">${x.wins}</td><td class="num">${x.pods}</td><td class="num">${(x.pts / x.visits.length).toFixed(1)}</td>
        <td class="num">${x.teamQ.length ? fmtAvg(avg(x.teamQ)) : '–'}</td><td class="num">${x.teamR.length ? fmtAvg(avg(x.teamR)) : '–'}</td></tr>`).join('')}</tbody>
    </table></div></div>` : '';
  const rounds = activeRounds(s);
  const onCal = new Set(rounds.map(trackOf));
  const others = Object.keys(D.TRACKS).filter(id => !onCal.has(id) && !D.TRACKS[id].former);
  const former = Object.keys(D.TRACKS).filter(id => !onCal.has(id) && D.TRACKS[id].former);
  const card = (id, title, label, sprint) => {
    const t = D.TRACKS[id];
    const last = trackEditions(c, id)[0];
    const w = last?.podium[0];
    return `<button class="round track-card" data-act="open-track" data-track="${id}">
      <div class="row" style="justify-content:space-between"><span class="rn">${label}</span>${sprint ? '<span class="tag sprint">Sprint</span>' : ''}</div>
      <div class="row" style="gap:10px;align-items:center">${trackMap(id, 54)}<div><div class="gp">${countryFlag(t.country, 13)} ${esc(title)}</div><div class="muted" style="font-size:12px">${esc(t.circuit)}</div></div></div>
      <div class="res"><span><b>${t.km.toFixed(3)}</b> km</span><span><b>${t.laps}</b> laps</span><span>${w ? `Last winner <b>${esc(edAbbr(last, w))}</b> ${last.year}` : t.provisional ? 'New circuit' : ''}</span></div>
    </button>`;
  };
  return `<div class="page">
    <div class="page-head"><div><h1>Circuits</h1><div class="sub">Track guides and recent results. Every race you log is added to the circuit's history.</div></div></div>
    <div class="rounds">${rounds.filter(r => D.TRACKS[trackOf(r)]).map(r => card(trackOf(r), r.name, `Round ${rounds.indexOf(r) + 1} · ${fmtDay(roundDate(s, r))}`, r.sprint)).join('')}</div>
    ${formHtml}
    ${others.length ? `<h2 style="margin-top:8px">Not on the ${s.year} calendar</h2><div class="rounds">${others.map(id => card(id, gpName(s, id), 'Off calendar', false)).join('')}</div>` : ''}
    ${former.length ? `<h2 style="margin-top:8px">Former circuits</h2><p class="muted" style="margin:0">Raced since 2016 but off the calendar now. Add any of them back to a season's calendar in Settings.</p><div class="rounds">${former.map(id => card(id, gpName(s, id), 'Former circuit', false)).join('')}</div>` : ''}
  </div>`;
}

function renderTrack() {
  const c = career(); const s = latestSeason();
  const tid = ui.trackId; const t = D.TRACKS[tid];
  if (!t) { ui.view = 'tracks'; return renderTracks(); }
  const rounds = activeRounds(s);
  const ri = rounds.findIndex(x => trackOf(x) === tid);
  const r = rounds[ri];
  const eds = trackEditions(c, tid);
  const shown = ui.trackAll ? eds : eds.slice(0, 5);
  const title = gpName(s, tid);

  // lap record: real one unless a race you logged went quicker
  const realMs = t.record ? parseLap(t.record[0]) : null;
  let rec = t.record ? { lap: t.record[0], who: t.record[1], year: t.record[2], career: false } : null;
  for (const e of eds) {
    const ms = e.played ? parseLap(e.flLap) : null;
    if (ms != null && (rec == null || ms < (rec.career ? parseLap(rec.lap) : realMs))) rec = { lap: fmtLap(ms), who: dName(e.s, e.fl), year: e.year, career: true };
  }

  // winners across the editions shown
  const tally = {};
  for (const e of shown) { const w = e.podium[0]; if (w) (tally[edName(e, w)] ||= { n: 0, me: w === PLAYER && e.played }).n++; }
  const top = Object.entries(tally).sort((a, b) => b[1].n - a[1].n);

  // your own history here
  const mine = [];
  for (const se of c.seasons) {
    const rr = activeRounds(se).find(x => trackOf(x) === tid);
    if (!rr) continue;
    const br = seasonStats(se)[PLAYER]?.byRound[rr.id];
    if (br && (br.q != null || br.r != null)) mine.push({ se, rr, br, team: se.teams.find(x => x.id === se.playerTeamId) });
  }
  const resCell = (v) => v == null ? '–' : typeof v === 'number' ? 'P' + v : `<span class="tag dnf">${v}</span>`;
  const bestR = Math.min(...mine.map(m => typeof m.br.r === 'number' ? m.br.r : 99));
  const bestQ = Math.min(...mine.map(m => m.br.q || 99));

  return `<div class="page">
    <div class="row"><button class="btn sm ghost" data-act="nav" data-view="tracks">${ICON.left} All circuits</button></div>
    <div class="page-head">
      <div><span class="label">${r ? `${s.year} · Round ${ri + 1} of ${rounds.length} · ${weekendTxt(s, r)}` : `Not on the ${s.year} calendar`}${r?.sprint ? ' · Sprint weekend' : ''}</span>
        <h1>${countryFlag(t.country, 22)} ${esc(title)} Grand Prix</h1><div class="sub">${esc(t.circuit)} · ${esc(t.city)}, ${esc(t.country)}${t.former ? ' · Former circuit' : ''}</div></div>
      ${r ? `<button class="btn primary" data-act="open-round" data-round="${r.id}">Open weekend</button>` : ''}
    </div>
    ${t.provisional ? '<div class="callout">New circuit for 2026. Figures are provisional and there is no race history yet: your career will write it.</div>' : ''}

    <div class="tiles">
      <div class="tile"><span class="label">Lap length</span><span class="v">${t.km.toFixed(3)}<small> km</small></span></div>
      <div class="tile"><span class="label">Laps</span><span class="v">${t.laps}</span></div>
      <div class="tile"><span class="label">Race distance</span><span class="v">${(t.km * t.laps).toFixed(1)}<small> km</small></span></div>
      <div class="tile"><span class="label">Corners</span><span class="v">${t.corners}</span></div>
      <div class="tile"><span class="label">First Grand Prix</span><span class="v">${t.firstGP}</span></div>
      <div class="tile"><span class="label">Lap record</span><span class="v" style="color:var(--purple);font-size:24px">${rec ? esc(rec.lap) : '–'}</span><span class="muted" style="font-size:12px">${rec ? `${esc(rec.who)} · ${rec.year}${rec.career ? ' · your career' : ''}` : 'Not set yet'}</span></div>
    </div>

    <div class="panel"><div class="panel-h"><h2>${ui.trackAll ? 'All results' : 'Last 5 races'}</h2>
      ${eds.length > 5 ? `<button class="btn sm ghost" data-act="track-all">${ui.trackAll ? 'Show last 5' : `Show all ${eds.length}`}</button>` : ''}</div>
      <div class="panel-b tight table-wrap"><table>
        <thead><tr><th>Year</th><th>Winner</th><th>2nd</th><th>3rd</th><th>Pole</th><th>Fastest lap</th></tr></thead>
        <tbody>${shown.length ? shown.map(e => `<tr class="${e.played && e.podium.includes(PLAYER) ? 'me' : ''}">
          <td><b>${e.year}</b>${e.gp ? ` <span class="muted">${esc(e.gp)}</span>` : ''}${e.played ? ' <span class="tag done">Career</span>' : ''}</td>
          <td>${edDriver(e, e.podium[0], true)}</td><td>${edDriver(e, e.podium[1])}</td><td>${edDriver(e, e.podium[2])}</td>
          <td>${edDriver(e, e.pole)}</td>
          <td>${e.career && e.fl ? `<span class="ab">${esc(dAbbr(e.s, e.fl))}</span> <span class="mono fl">${esc(e.flLap)}</span>` : '<span class="muted">–</span>'}</td>
        </tr>`).join('') : '<tr><td colspan="6"><div class="empty">No races here yet. Log the race in your career to start the history.</div></td></tr>'}</tbody>
      </table></div></div>

    <div class="grid-2">
      <div class="panel"><div class="panel-h"><h2>Your record here</h2></div>
        ${mine.length ? `<div class="panel-b"><dl class="kv"><dt>Best qualifying</dt><dd>${bestQ < 99 ? 'P' + bestQ : '–'}</dd><dt>Best finish</dt><dd>${bestR < 99 ? 'P' + bestR : '–'}</dd><dt>Visits</dt><dd>${mine.length}</dd></dl></div>
          <div class="panel-b tight table-wrap"><table><thead><tr><th>Year</th><th>Team</th><th class="num">Quali</th><th class="num">Sprint</th><th class="num">Race</th></tr></thead><tbody>
          ${mine.map(m => `<tr><td><b>${m.se.year}</b></td><td><div class="drv"><span class="chip" style="--c:${m.team?.color}"></span>${esc(m.team?.name || '')}</div></td><td class="num">${m.br.q ? 'P' + m.br.q : '–'}</td><td class="num">${resCell(m.br.s)}</td><td class="num"><b>${resCell(m.br.r)}</b>${m.br.fl ? ' <span class="fl-tag">FL</span>' : ''}</td></tr>`).join('')}
          </tbody></table></div>`
        : '<div class="empty">You have not raced here yet.</div>'}
        ${(() => { const f = circuitForm(c).find(x => x.id === tid); if (!f) return ''; return `<div class="panel-h" style="border-top:1px solid var(--line)"><h3>Team pace here</h3><span class="muted" style="font-size:12px">Your team’s rank among all teams, by its best car</span></div>
          <div class="panel-b tight table-wrap"><table><thead><tr><th>Year</th><th>Team</th><th class="num">Quali rank</th><th class="num">Race rank</th><th class="num">Your pts</th></tr></thead><tbody>
          ${f.visits.map(v => `<tr><td><b>${v.s.year}</b></td><td><div class="drv">${teamLogo(c, v.team, 18)}${esc(v.team?.name || '')}</div></td><td class="num">${v.tq ? `${v.tq} / ${v.s.teams.length}` : '–'}</td><td class="num">${v.tr ? `${v.tr} / ${v.s.teams.length}` : '–'}</td><td class="num">${v.pts}</td></tr>`).join('')}
          </tbody></table></div>`; })()}
      </div>
      <div class="panel"><div class="panel-h"><h2>Circuit guide</h2></div><div class="panel-b stack">
        ${A.maps[tid] ? `<div class="track-map-big">${trackMap(tid, 260)}</div>` : ''}
        <p style="margin:0">${esc(t.about)}</p>
        <dl class="kv">
          <dt>Location</dt><dd>${esc(t.city)}, ${esc(t.country)}</dd>
          ${t.record ? `<dt>Real lap record</dt><dd><span class="mono">${esc(t.record[0])}</span> · ${esc(t.record[1])} (${t.record[2]})</dd>` : ''}
          ${top.length ? `<dt>Most wins</dt><dd>${top.slice(0, 3).map(([n, v]) => `${v.me ? '<b>' : ''}${esc(n)}${v.me ? '</b>' : ''} (${v.n})`).join(', ')} <span class="muted">in the ${shown.length} race${shown.length > 1 ? 's' : ''} shown</span></dd>` : ''}
        </dl>
      </div></div>
    </div>
  </div>`;
}

/* ---------------------------------------------------------------- my team */
const fmtM = (v) => `${v < 0 ? '−' : ''}$${Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: 2 })}M`;
function teamBadge(t, size = 40) {
  if (t?.logo) return `<img class="team-logo" src="${esc(t.logo)}" alt="${esc(t.name || '')} logo" style="width:${size}px;height:${size}px">`;
  const col = t?.color || '#5E6A82';
  const col2 = t?.color2 || contrastInk(col);
  const short = (t?.short || t?.name || '?').slice(0, 3).toUpperCase();
  return `<span class="team-logo initials" style="width:${size}px;height:${size}px;background:linear-gradient(135deg, ${col} 0 64%, ${col2} 64% 72%, ${col} 72%);color:${contrastInk(col)};font-size:${Math.max(7, Math.round(size * 0.3))}px">${esc(short)}</span>`;
}
/** Team logo for tables. */
function teamMark(c, t) { return teamLogo(c, t, 22); }

const hex2 = (n) => n.toString(16).padStart(2, '0');
/** The two most prominent colours in a logo, favouring saturated ones over white/black/grey. */
function logoColors(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onerror = () => resolve(null);
    img.onload = () => {
      const cv = document.createElement('canvas'); cv.width = cv.height = 48;
      const g = cv.getContext('2d'); g.drawImage(img, 0, 0, 48, 48);
      const px = g.getImageData(0, 0, 48, 48).data;
      const buckets = {};
      for (let i = 0; i < px.length; i += 4) {
        if (px[i + 3] < 128) continue;
        const r = px[i] & 0xF0, gg = px[i + 1] & 0xF0, b = px[i + 2] & 0xF0;
        const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
        const sat = mx ? (mx - mn) / mx : 0;
        const k = `${r},${gg},${b}`;
        (buckets[k] ||= { r, g: gg, b, n: 0, w: 0.25 + sat }).n++;
      }
      const list = Object.values(buckets).sort((a, b) => b.n * b.w - a.n * a.w);
      if (!list.length) { resolve(null); return; }
      const toHex = (x) => '#' + [x.r, x.g, x.b].map(v => hex2(Math.min(255, v + 8))).join('');
      const a = list[0];
      const far = list.find(x => Math.abs(x.r - a.r) + Math.abs(x.g - a.g) + Math.abs(x.b - a.b) > 160);
      resolve([toHex(a), far ? toHex(far) : '#F2F2F2']);
    };
    img.src = dataUrl;
  });
}

function teamIdentityForm(t, scope) {
  return `<div class="identity">
    <div class="livery" style="--c1:${t.color};--c2:${t.color2}">
      ${teamBadge(t, 84)}
      <div style="min-width:0"><div class="livery-name">${esc(t.name || 'Your team')}</div><div class="muted" style="font-size:13px">${esc([t.base, t.engine && t.engine + ' power'].filter(Boolean).join(' · ') || 'Base and engine')}</div></div>
    </div>
    <div class="form-grid">
      <label class="field"><span>Team name</span><input type="text" data-ch="mt-field" data-scope="${scope}" data-k="name" value="${esc(t.name)}" placeholder="Kestrel Racing"></label>
      <label class="field"><span>Short name</span><input type="text" maxlength="3" data-ch="mt-field" data-scope="${scope}" data-k="short" value="${esc(t.short)}" placeholder="KES"></label>
      <label class="field"><span>Base</span><input type="text" data-ch="mt-field" data-scope="${scope}" data-k="base" value="${esc(t.base)}" placeholder="Silverstone, UK"></label>
      <label class="field"><span>Engine supplier</span><select data-ch="mt-field" data-scope="${scope}" data-k="engine">${D.ENGINES.map(e => `<option ${t.engine === e ? 'selected' : ''}>${e}</option>`).join('')}</select></label>
      <label class="field"><span>Primary colour</span><input type="color" data-ch="mt-field" data-scope="${scope}" data-k="color" value="${esc(t.color)}"></label>
      <label class="field"><span>Secondary colour</span><input type="color" data-ch="mt-field" data-scope="${scope}" data-k="color2" value="${esc(t.color2)}"></label>
    </div>
    <div class="row">
      <label class="btn sm file-btn">${t.logo ? 'Replace logo' : 'Import logo'}<input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp,image/gif" data-ch="mt-logo" data-scope="${scope}" hidden></label>
      ${t.logo ? `<button class="btn sm" data-act="mt-logo-colors" data-scope="${scope}">Use logo colours</button><button class="btn sm ghost danger" data-act="mt-logo-clear" data-scope="${scope}">Remove logo</button>` : ''}
      <span class="muted" style="font-size:12px">PNG with a transparent background works best. Images are resized to 256 px and kept in your save file.</span>
    </div>
  </div>`;
}

function myTeamSeason(c, s, st = seasonStats(s)) {
  const cs = constructorStandings(s, st);
  const row = cs.find(x => x.team.id === MYTEAM);
  const team = s.teams.find(t => t.id === MYTEAM);
  const ids = (team?.drivers || []).filter(Boolean);
  return { s, row, team, ids, teams: cs.length, poles: ids.reduce((a, id) => a + (st[id]?.poles || 0), 0), st };
}
function ledgerTotals(m, seasonIdx = null) {
  let income = 0, expense = 0;
  for (const e of m.ledger) { if (seasonIdx != null && e.seasonIdx !== seasonIdx) continue; if (e.amount >= 0) income += e.amount; else expense -= e.amount; }
  return { income, expense, net: income - expense };
}
function roundLabel(c, seasonIdx, roundId) {
  const s = c.seasons[seasonIdx]; if (!s) return '';
  const rs = activeRounds(s); const i = rs.findIndex(r => r.id === roundId);
  return i >= 0 ? `${s.year} · R${i + 1} ${rs[i].name}` : `${s.year} · Off-season`;
}
function roundSelect(s, id, sel) {
  const nr = nextRound(s);
  return `<select id="${id}"><option value="">Off-season</option>${activeRounds(s).map((r, i) => `<option value="${r.id}" ${(sel ?? nr?.id) === r.id ? 'selected' : ''}>R${i + 1} · ${esc(r.name)}</option>`).join('')}</select>`;
}

function renderMyTeam() {
  const c = career();
  if (c.type !== 'myteam' || !c.myTeam) {
    const t = latestSeason().teams.find(x => x.id === latestSeason().playerTeamId);
    return `<div class="page"><div class="page-head"><div><h1>My Team</h1><div class="sub">Found and run your own team: identity and logo, car development, finances and sponsors.</div></div></div>
      <div class="panel"><div class="empty" style="padding:40px 16px">This save is a Driver Career with ${esc(t?.name || 'a works team')}. My Team runs as its own career, where you start the 11th team and drive for it.<button class="btn primary" data-act="new-career-myteam">Start a My Team career</button></div></div></div>`;
  }
  const m = c.myTeam; const s = latestSeason();
  const cur = myTeamSeason(c, s);
  const balance = m.budget + ledgerTotals(m).net;
  const tab = ui.mt;
  const tabs = [['overview', 'Overview'], ['identity', 'Identity'], ['development', 'Car development'], ['finance', 'Finances'], ['sponsors', 'Sponsors']];
  let body = '';
  if (tab === 'identity') body = renderMtIdentity(c, m);
  else if (tab === 'development') body = renderMtDev(c, m, s);
  else if (tab === 'finance') body = renderMtFinance(c, m, s, balance);
  else if (tab === 'sponsors') body = renderMtSponsors(c, m, s);
  else body = renderMtOverview(c, m, s, cur, balance);
  return `<div class="page">
    <section class="hero" style="--team:${m.color};--team-2:${m.color2}">
      <div class="stripes"></div>
      ${teamBadge(m, 92)}
      <div style="position:relative;z-index:1;min-width:0">
        <span class="label">My Team · est. ${m.founded || 2025}</span>
        <div class="name">${esc(m.name)}</div>
        <div class="meta">${m.base ? `<span>${esc(m.base)}</span>` : ''}<span>${esc(m.engine)} power</span><span>Team principal: ${esc(m.principal || `${c.profile.first} ${c.profile.last}`)}</span>${(() => { const a = archRivalTeam(c, s); return a ? `<span>Archrival: ${esc(a.name)}</span>` : ''; })()}</div>
        <div class="meta" style="margin-top:6px"><span><b>${cur.row && roundsDone(s) ? 'P' + cur.row.pos : '–'}</b> of ${cur.teams} in the constructors</span><span>${cur.row?.pts || 0} points</span><span>Budget ${fmtM(balance)}</span></div>
      </div>
      <div class="next-card">${(() => { const nr = nextRound(s); const total = activeRounds(s).length; return nr
        ? `<span class="label">Next up · Round ${activeRounds(s).indexOf(nr) + 1} of ${total}</span><div style="font-family:var(--font-display);font-size:20px;font-weight:600">${esc(nr.name)} ${nr.sprint ? '<span class="tag sprint">Sprint</span>' : ''}</div><span class="muted">${esc(nr.venue)} · ${weekendTxt(s, nr)}</span><button class="btn primary" data-act="open-round" data-round="${nr.id}">Log weekend</button>`
        : `<span class="label">Season complete</span><div style="font-family:var(--font-display);font-size:20px;font-weight:600">All ${total} rounds logged</div><button class="btn" data-act="open-review" data-idx="${s.index}">Season review</button><button class="btn primary" data-act="next-season">Start ${s.year + 1} season</button>`; })()}</div>
    </section>
    <div class="row"><div class="seg">${tabs.map(([id, l]) => `<button data-act="mt-tab" data-tab="${id}" class="${tab === id ? 'on' : ''}">${l}</button>`).join('')}</div></div>
    ${body}
  </div>`;
}

/** The season at a glance for a My Team dashboard: goals, the title fights and both championships. */
function mtSeasonPanels(c, m, s) {
  const st = seasonStatsCache(s); const ds = driverStandings(s, st); const cs = constructorStandings(s, st);
  const mine = new Set(s.teams.find(t => t.id === MYTEAM)?.drivers.filter(Boolean) || []);
  const top = ds.slice(0, 6); for (const id of mine) { const r = ds.find(x => x.id === id); if (r && !top.includes(r)) top.push(r); }
  const lastArticle = [...c.media].reverse().find(x => x.article && x.seasonIdx === s.index);
  return `<div class="grid-main">
      <div class="stack">${goalsPanel(c, s)}${rivalryPanel(c, s)}</div>
      <div class="stack">
        <div class="panel"><div class="panel-h"><h2>Constructors</h2><button class="btn sm ghost" data-act="nav" data-view="standings">All</button></div>
          <div class="panel-b tight"><table><tbody>${cs.slice(0, 6).concat(cs.slice(6).filter(x => x.team.id === MYTEAM)).map(x => `<tr class="${x.team.id === MYTEAM ? 'me' : ''}"><td class="pos ${x.pos <= 3 ? 'p' + x.pos : ''}">${x.pos}</td><td><div class="drv">${teamLogo(c, x.team, 20)}<b>${esc(x.team.name)}</b></div></td><td class="num"><b>${x.pts}</b></td></tr>`).join('')}</tbody></table></div></div>
        <div class="panel"><div class="panel-h"><h2>Drivers</h2></div>
          <div class="panel-b tight"><table><tbody>${top.map(x => `<tr class="${mine.has(x.id) ? 'me' : ''}"><td class="pos ${x.pos <= 3 ? 'p' + x.pos : ''}">${x.pos}</td><td>${drvCell(s, x.id)}</td><td class="num"><b>${x.pts}</b></td></tr>`).join('')}</tbody></table></div></div>
        ${lastArticle ? `<div class="panel"><div class="panel-h"><h2>Latest from the paddock</h2><button class="btn sm ghost" data-act="nav" data-view="media">Media</button></div><div class="article"><span class="outlet">${esc(lastArticle.article.outlet)}</span><div class="headline" style="font-size:18px">${esc(lastArticle.article.headline)}</div></div></div>` : ''}
      </div></div>`;
}
function renderMtOverview(c, m, s, cur, balance) {
  const hist = playedSeasons(c).map(x => myTeamSeason(c, x));
  const all = hist.reduce((a, h) => ({ pts: a.pts + (h.row?.pts || 0), wins: a.wins + (h.row?.wins || 0), podiums: a.podiums + (h.row?.podiums || 0), poles: a.poles + h.poles }), { pts: 0, wins: 0, podiums: 0, poles: 0 });
  const titles = hist.filter(h => h.row?.pos === 1 && roundsDone(h.s) === activeRounds(h.s).length && roundsDone(h.s) > 0).map(h => h.s.year);
  const ids = cur.ids;
  const h = ids.length === 2 ? h2hCompare([s], ids[0], ids[1]) : null;
  const r = m.ratings[s.index] || {};
  const rated = D.DEPARTMENTS.filter(d => r[d.id] != null);
  return `
    <div class="tiles">
      <div class="tile"><span class="label">${s.year} points</span><span class="v">${cur.row?.pts || 0}</span></div>
      <div class="tile"><span class="label">${s.year} wins</span><span class="v">${cur.row?.wins || 0}</span></div>
      <div class="tile"><span class="label">${s.year} podiums</span><span class="v">${cur.row?.podiums || 0}</span></div>
      <div class="tile"><span class="label">${s.year} poles</span><span class="v">${cur.poles}</span></div>
      <div class="tile"><span class="label">Constructors' titles</span><span class="v">${titles.length}</span></div>
      <div class="tile"><span class="label">Budget</span><span class="v" style="font-size:26px;color:${balance < 0 ? 'var(--red)' : 'inherit'}">${fmtM(balance)}</span></div>
    </div>
    ${mtSeasonPanels(c, m, s)}
    <div class="grid-2">
      <div class="panel"><div class="panel-h"><h2>${s.year} line-up</h2></div><div class="panel-b tight"><table>
        <thead><tr><th>Driver</th><th class="num">Pts</th><th class="num">Wins</th><th class="num">Pod</th><th class="num">Best</th></tr></thead>
        <tbody>${ids.map(id => { const o = cur.st[id] || emptyStat(); return `<tr class="${id === PLAYER ? 'me' : ''}" data-act="open-driver" data-id="${id}"><td>${drvCell(s, id)}</td><td class="num"><b>${o.pts}</b></td><td class="num">${o.wins}</td><td class="num">${o.podiums}</td><td class="num">${o.best ? 'P' + o.best : '–'}</td></tr>`; }).join('')}</tbody>
      </table>
      ${h ? `<div class="panel-b stack" style="border-top:1px solid var(--line)">${miniH2H('Qualifying', h.q[0], h.q[1], s, ids[1])}${miniH2H('Race', h.r[0], h.r[1], s, ids[1])}</div>` : ''}
      <div class="panel-b muted" style="font-size:13px;border-top:1px solid var(--line)">Change your teammate in Settings → ${s.year} roster.</div></div></div>
      <div class="panel"><div class="panel-h"><h2>Car performance</h2><button class="btn sm ghost" data-act="mt-tab" data-tab="development">Update</button></div><div class="panel-b stack">
        ${rated.length ? D.DEPARTMENTS.map(d => `<div style="display:grid;gap:5px"><div class="row" style="justify-content:space-between"><span>${d.name}</span><b class="tnum">${r[d.id] ?? '–'}</b></div><div class="bar-track"><div class="bar-fill" style="width:${r[d.id] || 0}%"></div></div></div>`).join('')
          : '<div class="empty">Copy your department ratings from the game to track how the car develops.<button class="btn sm" data-act="mt-tab" data-tab="development">Add ratings</button></div>'}
      </div></div>
    </div>
    <div class="panel"><div class="panel-h"><h2>Team history</h2><span class="muted" style="font-size:12px">All time: ${all.pts} pts · ${all.wins} wins · ${all.podiums} podiums · ${all.poles} poles${titles.length ? ' · champions ' + titles.join(', ') : ''}</span></div><div class="panel-b tight table-wrap"><table>
      <thead><tr><th>Season</th><th class="num">Pos</th><th class="num">Pts</th><th class="num">Wins</th><th class="num">Podiums</th><th class="num">Poles</th><th>Drivers</th><th class="num">Net spend</th></tr></thead>
      <tbody>${hist.slice().reverse().map(x => { const lt = ledgerTotals(m, x.s.index); const done = roundsDone(x.s); return `<tr><td><b>${x.s.year}</b>${done < activeRounds(x.s).length ? ` <span class="muted" style="font-size:12px">${done}/${activeRounds(x.s).length}</span>` : ''}</td>
        <td class="num">${x.row && done ? `<span class="pos ${x.row.pos <= 3 ? 'p' + x.row.pos : ''}" style="font-size:14px">P${x.row.pos}</span>` : '–'}</td><td class="num"><b>${x.row?.pts || 0}</b></td><td class="num">${x.row?.wins || 0}</td><td class="num">${x.row?.podiums || 0}</td><td class="num">${x.poles}</td>
        <td class="muted">${x.ids.map(id => esc(dName(x.s, id))).join(' · ')}</td><td class="num ${lt.net < 0 ? 'neg' : 'pos-money'}">${m.ledger.some(e => e.seasonIdx === x.s.index) ? fmtM(lt.net) : '–'}</td></tr>`; }).join('')}</tbody>
    </table></div></div>`;
}

function renderMtIdentity(c, m) {
  return `<div class="panel"><div class="panel-h"><h2>Team identity</h2><span class="muted" style="font-size:12px">Changes apply to every season of this career and to the theme when it matches your team</span></div><div class="panel-b stack">
    ${teamIdentityForm(m, 'team')}
    <div class="form-grid">
      <label class="field"><span>Team principal</span><input type="text" data-ch="mt-field" data-scope="team" data-k="principal" value="${esc(m.principal || '')}"></label>
      <label class="field"><span>Founded</span><input type="number" data-ch="mt-field" data-scope="team" data-k="founded" value="${esc(m.founded || 2025)}"></label>
    </div>
    <label class="field"><span>Team story (used by the media)</span><textarea data-ch="mt-field" data-scope="team" data-k="story" placeholder="Backed by a Cape Town investment group, the team set up shop at Silverstone…">${esc(m.story || '')}</textarea></label>
  </div></div>`;
}

function renderMtDev(c, m, s) {
  const r = m.ratings[s.index] || {};
  const prev = m.ratings[s.index - 1] || null;
  const vals = D.DEPARTMENTS.map(d => r[d.id]).filter(v => v != null);
  const overall = vals.length ? Math.round(avg(vals)) : null;
  const ups = m.upgrades.slice().reverse();
  return `<div class="grid-2">
    <div class="panel"><div class="panel-h"><h2>${s.year} department ratings</h2><span class="muted" style="font-size:12px">Overall ${overall ?? '–'}${prev ? ' · vs last season' : ''}</span></div><div class="panel-b stack">
      ${D.DEPARTMENTS.map(d => {
        const v = r[d.id]; const p = prev?.[d.id]; const delta = v != null && p != null ? v - p : null;
        return `<div style="display:grid;gap:6px"><div class="row" style="justify-content:space-between"><span>${d.name}</span>
          <span class="row" style="gap:8px">${delta ? `<span class="${delta > 0 ? 'pos-money' : 'neg'}" style="font-size:12px">${delta > 0 ? '+' : ''}${delta}</span>` : ''}<input type="number" min="0" max="100" style="width:80px" value="${v ?? ''}" placeholder="0–100" data-ch="mt-rating" data-k="${d.id}"></span></div>
          <div class="bar-track"><div class="bar-fill" style="width:${v || 0}%"></div></div></div>`;
      }).join('')}
      <p class="muted" style="font-size:13px">Copy the ratings from the car performance screen in-game. Each season keeps its own set, so you can see the gains year on year.</p>
    </div></div>
    <div class="panel"><div class="panel-h"><h2>Log an upgrade</h2></div><div class="panel-b stack">
      <div class="form-grid">
        <label class="field"><span>When</span>${roundSelect(s, 'up-round')}</label>
        <label class="field"><span>Department</span><select id="up-dept">${D.DEPARTMENTS.map(d => `<option value="${d.id}">${d.name}</option>`).join('')}</select></label>
        <label class="field"><span>Part</span><input type="text" id="up-part" placeholder="Front wing, spec B"></label>
        <label class="field"><span>Cost ($M)</span><input type="number" id="up-cost" min="0" step="0.1" placeholder="Optional"></label>
      </div>
      <label class="field"><span>Notes</span><input type="text" id="up-notes" placeholder="+0.15s per lap in high-speed corners"></label>
      <div class="row"><button class="btn primary" data-act="mt-add-upgrade">Add upgrade</button><label class="check"><input type="checkbox" id="up-ledger" checked> Add the cost to finances</label></div>
    </div></div>
  </div>
  <div class="panel"><div class="panel-h"><h2>Upgrade history</h2><span class="muted">${m.upgrades.length} upgrade${m.upgrades.length === 1 ? '' : 's'}</span></div><div class="panel-b tight table-wrap"><table>
    <thead><tr><th>When</th><th>Department</th><th>Part</th><th>Notes</th><th class="num">Cost</th><th></th></tr></thead>
    <tbody>${ups.length ? ups.map(u => `<tr><td class="muted">${esc(roundLabel(c, u.seasonIdx, u.roundId))}</td><td>${esc(D.DEPARTMENTS.find(d => d.id === u.dept)?.name || u.dept)}</td><td><b>${esc(u.part)}</b></td><td class="muted">${esc(u.notes)}</td><td class="num">${u.cost ? fmtM(u.cost) : '–'}</td><td><button class="icon-btn" title="Remove" data-act="mt-del" data-list="upgrades" data-id="${u.id}">${ICON.x}</button></td></tr>`).join('')
      : '<tr><td colspan="6"><div class="empty">No upgrades logged yet.</div></td></tr>'}</tbody>
  </table></div></div>`;
}

function renderMtFinance(c, m, s, balance) {
  const season = ledgerTotals(m, s.index);
  let run = m.budget;
  const rows = m.ledger.map(e => ({ ...e, after: (run += e.amount) })).reverse();
  return `<div class="tiles">
      <div class="tile"><span class="label">Balance</span><span class="v" style="font-size:26px;color:${balance < 0 ? 'var(--red)' : 'inherit'}">${fmtM(balance)}</span></div>
      <div class="tile"><span class="label">Starting budget</span><span class="v" style="font-size:26px">${fmtM(m.budget)}</span></div>
      <div class="tile"><span class="label">${s.year} income</span><span class="v pos-money" style="font-size:26px">${fmtM(season.income)}</span></div>
      <div class="tile"><span class="label">${s.year} spending</span><span class="v neg" style="font-size:26px">${fmtM(season.expense)}</span></div>
      <div class="tile"><span class="label">${s.year} net</span><span class="v" style="font-size:26px">${fmtM(season.net)}</span></div>
      <div class="tile"><span class="label">Entries</span><span class="v" style="font-size:26px">${m.ledger.length}</span></div>
    </div>
    <div class="panel"><div class="panel-h"><h2>Add an entry</h2>
      <label class="row muted">Starting budget ($M) <input type="number" step="0.1" style="width:110px" value="${m.budget}" data-ch="mt-budget"></label></div><div class="panel-b stack">
      <div class="form-grid">
        <label class="field"><span>When</span>${roundSelect(s, 'lg-round')}</label>
        <label class="field"><span>Type</span><select id="lg-type"><option value="in">Income</option><option value="out">Expense</option></select></label>
        <label class="field"><span>Category</span><select id="lg-cat">${D.LEDGER_CATS.map(x => `<option>${x}</option>`).join('')}</select></label>
        <label class="field"><span>Amount ($M)</span><input type="number" id="lg-amt" min="0" step="0.01" placeholder="2.5"></label>
      </div>
      <label class="field"><span>Note</span><input type="text" id="lg-note" placeholder="Prize money for P6 in the 2025 constructors"></label>
      <div><button class="btn primary" data-act="mt-add-ledger">Add entry</button></div>
    </div></div>
    <div class="panel"><div class="panel-h"><h2>Ledger</h2></div><div class="panel-b tight table-wrap"><table>
      <thead><tr><th>When</th><th>Category</th><th>Note</th><th class="num">Amount</th><th class="num">Balance</th><th></th></tr></thead>
      <tbody>${rows.length ? rows.map(e => `<tr><td class="muted">${esc(roundLabel(c, e.seasonIdx, e.roundId))}</td><td>${esc(e.cat)}</td><td class="muted">${esc(e.note)}</td><td class="num ${e.amount < 0 ? 'neg' : 'pos-money'}"><b>${e.amount > 0 ? '+' : ''}${fmtM(e.amount)}</b></td><td class="num">${fmtM(e.after)}</td><td><button class="icon-btn" title="Remove" data-act="mt-del" data-list="ledger" data-id="${e.id}">${ICON.x}</button></td></tr>`).join('')
        : '<tr><td colspan="6"><div class="empty">No entries yet. Log sponsor payments, prize money and spending as the season goes.</div></td></tr>'}</tbody>
    </table></div></div>`;
}

function renderMtSponsors(c, m, s) {
  const active = m.sponsors.filter(x => x.status === 'Active');
  return `<div class="tiles">
      <div class="tile"><span class="label">Active sponsors</span><span class="v">${active.length}</span></div>
      <div class="tile"><span class="label">Value per season</span><span class="v" style="font-size:26px">${fmtM(active.reduce((a, x) => a + (+x.value || 0), 0))}</span></div>
      <div class="tile"><span class="label">Title sponsor</span><span class="v" style="font-size:20px">${esc(active.find(x => x.tier === 'Title')?.name || '–')}</span></div>
    </div>
    <div class="panel"><div class="panel-h"><h2>Sign a sponsor</h2></div><div class="panel-b stack">
      <div class="form-grid">
        <label class="field"><span>Sponsor</span><input type="text" id="sp-name" placeholder="Apex Energy"></label>
        <label class="field"><span>Tier</span><select id="sp-tier">${D.SPONSOR_TIERS.map(x => `<option>${x}</option>`).join('')}</select></label>
        <label class="field"><span>Value ($M per season)</span><input type="number" id="sp-value" min="0" step="0.1"></label>
        <label class="field"><span>Objective</span><input type="text" id="sp-goal" placeholder="Score points in 5 races"></label>
      </div>
      <div><button class="btn primary" data-act="mt-add-sponsor">Add sponsor</button></div>
    </div></div>
    <div class="panel"><div class="panel-h"><h2>Sponsor portfolio</h2></div><div class="panel-b tight table-wrap"><table>
      <thead><tr><th>Sponsor</th><th>Tier</th><th class="num">Value</th><th>Objective</th><th>Since</th><th>Status</th><th></th></tr></thead>
      <tbody>${m.sponsors.length ? m.sponsors.map(x => `<tr><td><b>${esc(x.name)}</b></td><td>${esc(x.tier)}</td><td class="num">${fmtM(+x.value || 0)}</td><td class="muted">${esc(x.goal)}</td><td class="muted">${c.seasons[x.seasonIdx]?.year || ''}</td>
        <td><select data-ch="mt-sponsor-status" data-id="${x.id}" style="width:auto">${['Active', 'Objective met', 'Objective missed', 'Ended'].map(o => `<option ${x.status === o ? 'selected' : ''}>${o}</option>`).join('')}</select></td>
        <td><div class="row" style="gap:4px;flex-wrap:nowrap"><button class="btn sm ghost" data-act="mt-sponsor-pay" data-id="${x.id}" title="Add this season's payment to finances">Log payment</button><button class="icon-btn" title="Remove" data-act="mt-del" data-list="sponsors" data-id="${x.id}">${ICON.x}</button></div></td></tr>`).join('')
        : '<tr><td colspan="7"><div class="empty">No sponsors signed yet.</div></td></tr>'}</tbody>
    </table></div></div>`;
}

/* ------------------------------------------------------------ hall of fame */
function hallOfFame(c) {
  const ctx = careerCtx(c);
  const years = D.CHAMPIONS.map(([year, key, team]) => ({ year, key, team, career: false }));
  for (const x of ctx) if (x.complete && x.ds[0]) {
    const id = x.ds[0].id; const t = teamOf(x.s, id);
    years.push({ year: x.s.year, key: id, team: t?.name || '', color: t?.color, career: !isHist(x.s) });
  }
  const known = allKnownDrivers(c, latestSeason());
  const byKey = {};
  for (const y of years) (byKey[y.key] ||= []).push(y);
  const champs = Object.entries(byKey).map(([key, ys]) => {
    const cb = D.CHAMP_BIO[key];
    const live = key === PLAYER || D.DRIVER_BIO[key] || (!cb && known[key]);
    let stats, nat;
    if (live) {
      const { tot, bio } = driverRecord(c, key, ctx);
      stats = tot; nat = key === PLAYER_ID ? c.profile.nationality : bio?.nat;
    } else { stats = cb; nat = cb.nat; }
    const name = key === PLAYER_ID ? `${c.profile.first} ${c.profile.last}` : cb?.name || known[key]?.name || key;
    const about = key === PLAYER_ID ? (c.profile.bio || 'Crowned world champion in your career.') : cb?.about || D.DRIVER_BIO[key]?.note || 'World champion in your career.';
    const last = ys[ys.length - 1];
    return { key, name, nat, years: ys, titles: ys.length, stats, about, life: cb?.life || (D.DRIVER_BIO[key]?.born ? 'b. ' + D.DRIVER_BIO[key].born.slice(0, 4) : ''), color: last.color || D.TITLE_TEAM_COLORS[last.team] || '#5E6A82', active: key === PLAYER || gridIds(latestSeason()).includes(key), career: ys.some(y => y.career) };
  });
  return { years: years.sort((a, b) => b.year - a.year), champs, byKey };
}

function renderHof() {
  const c = career();
  const { years, champs } = hallOfFame(c);
  const sort = ui.hof.sort;
  champs.sort(sort === 'first' ? (a, b) => a.years[0].year - b.years[0].year : (a, b) => b.titles - a.titles || a.years[0].year - b.years[0].year);
  const nameOf = (key) => champs.find(x => x.key === key)?.name || key;
  const nations = {};
  for (const y of years) { const n = champs.find(x => x.key === y.key)?.nat || '—'; nations[n] = (nations[n] || 0) + 1; }
  const topNation = Object.entries(nations).sort((a, b) => b[1] - a[1])[0];
  const mine = champs.find(x => x.key === PLAYER);
  const view = ui.hof.view;
  return `<div class="page">
    <div class="page-head"><div><h1>Hall of Fame</h1><div class="sub">Every Formula One World Drivers' Champion since 1950. Champions crowned in your career join them when a season is fully logged.</div></div>
      <div class="row">${view === 'champions' ? `<div class="seg">${[['titles', 'Most titles'], ['first', 'Chronological']].map(([v, l]) => `<button data-act="hof-sort" data-v="${v}" class="${sort === v ? 'on' : ''}">${l}</button>`).join('')}</div>` : ''}
      <div class="seg">${[['champions', 'Champions'], ['years', 'Year by year']].map(([v, l]) => `<button data-act="hof-view" data-v="${v}" class="${view === v ? 'on' : ''}">${l}</button>`).join('')}</div></div></div>
    <div class="tiles">
      <div class="tile"><span class="label">Champions</span><span class="v">${champs.length}</span></div>
      <div class="tile"><span class="label">Seasons</span><span class="v">${years.length}</span></div>
      <div class="tile"><span class="label">Most titles</span><span class="v" style="font-size:20px">${esc(champs.slice().sort((a, b) => b.titles - a.titles)[0]?.name || '')}</span></div>
      <div class="tile"><span class="label">Most titles by nation</span><span class="v" style="font-size:20px">${esc(topNation?.[0] || '')}<small> ${topNation?.[1] || ''}</small></span></div>
      <div class="tile"><span class="label">Latest champion</span><span class="v" style="font-size:20px">${esc(nameOf(years[0]?.key))}<small> ${years[0]?.year || ''}</small></span></div>
      <div class="tile"><span class="label">Your titles</span><span class="v">${mine ? mine.titles : 0}</span></div>
    </div>
    ${view === 'years' ? `<div class="panel"><div class="panel-b tight table-wrap"><table>
      <thead><tr><th>Season</th><th>Champion</th><th>Nationality</th><th>Team</th><th class="num">Title no.</th></tr></thead>
      <tbody>${years.map(y => {
        const ch = champs.find(x => x.key === y.key);
        const n = ch.years.slice().sort((a, b) => a.year - b.year).findIndex(z => z.year === y.year) + 1;
        return `<tr class="${y.key === PLAYER ? 'me' : ''}"><td><b>${y.year}</b>${y.career ? ' <span class="tag done">Career</span>' : ''}</td><td><b>${esc(ch.name)}</b></td><td class="muted">${esc(ch.nat || '')}</td>
          <td><div class="drv"><span class="chip" style="--c:${y.color || D.TITLE_TEAM_COLORS[y.team] || '#5E6A82'}"></span>${esc(y.team)}</div></td><td class="num">${n}</td></tr>`;
      }).join('')}</tbody></table></div></div>`
    : `<div class="hof-grid">${champs.map(ch => `<article class="hof-card ${ch.key === PLAYER ? 'is-me' : ''}" style="--c:${ch.color}">
        <div class="hof-top"><div style="min-width:0"><div class="hof-name">${esc(ch.name)}</div><div class="muted" style="font-size:12px">${[esc(ch.nat || ''), esc(ch.life || ''), ch.active ? '<span class="tag">Active</span>' : ''].filter(Boolean).join(' · ')}</div></div>
          <div class="hof-titles"><b>${ch.titles}</b><span class="label">title${ch.titles > 1 ? 's' : ''}</span></div></div>
        <div class="hof-years">${ch.years.map(y => `<span class="yr ${y.career ? 'career' : ''}" title="${esc(y.team)}">${y.year}</span>`).join('')}</div>
        <div class="hof-stats">${[['Starts', ch.stats.starts], ['Wins', ch.stats.wins], ['Poles', ch.stats.poles], ['Podiums', ch.stats.podiums]].map(([l, v]) => `<div><span class="label">${l}</span><b>${v ?? '–'}</b></div>`).join('')}</div>
        <p class="hof-about">${esc(ch.about)}</p>
      </article>`).join('')}</div>`}
  </div>`;
}

/* ------------------------------------------------------------ title maths */
// Ties on points count as still alive: countback would settle them, and it can't be known in advance.
const posPts = (p) => D.RACE_POINTS[p - 1] || 0;
const NO_PTS = D.RACE_POINTS.length + 1; // stands for "outside the points"
/**
 * The championship as it stands, and what is left to race. `upto` gives the picture before that round
 * (used for previews and history); without it, the live state including a sprint already run this weekend.
 */
function titleMath(s, kind = 'driver', upto = null) {
  const team = kind === 'team';
  // real seasons had a point for fastest lap (2019–24) and a smaller sprint (2021)
  const fl = s.scoring?.fl || 0, spr = s.scoring?.spr || D.SPRINT_POINTS;
  const M = team ? { R: D.RACE_POINTS[0] + D.RACE_POINTS[1] + fl, SPR: spr[0] + spr[1] } : { R: D.RACE_POINTS[0] + fl, SPR: spr[0] };
  const st = upto == null ? seasonStatsCache(s) : seasonStats(s, upto);
  const rows = team ? constructorStandings(s, st).map(x => ({ id: x.team.id, name: x.team.name, pts: x.pts, wins: x.wins }))
    : driverStandings(s, st).map(x => ({ id: x.id, name: dName(s, x.id), pts: x.pts, wins: x.wins, posCount: x.posCount }));
  const left = [];
  activeRounds(s).forEach((r, i) => {
    const w = s.weekends[r.id]?.sessions;
    if (upto != null ? i < upto : w?.R?.done) return;
    const spr = !!r.sprint && (upto != null || !w?.SPR?.done);
    left.push({ r, i, spr, max: M.R + (spr ? M.SPR : 0) });
  });
  const R = left.reduce((a, x) => a + x.max, 0);
  const lead = rows[0]?.pts || 0;
  // countback: someone who can at best draw level is still out if the leader would keep more wins even if they won
  // every race that's left
  const n = left.length, leadWins = rows[0]?.wins || 0;
  rows.forEach((x, i) => { x.pos = i + 1; x.gap = lead - x.pts; x.maxPts = x.pts + R; x.alive = i === 0 || x.maxPts > lead || (x.maxPts === lead && x.wins + n >= leadWins); });
  const margin = rows.length > 1 ? rows[0].pts - rows[1].pts : 0;
  const decided = rows.length > 1 && lead > 0 && (R === 0 || rows.slice(1).every(x => !x.alive));
  return { s, kind, team, M, rows, left, R, lead, margin, decided, champion: decided ? rows[0] : null };
}
/** The first remaining round where x could be champion: x takes maximum points, nobody else scores. */
function earliestClinch(m, x) {
  const best = Math.max(0, ...m.rows.filter(y => y !== x).map(y => y.pts));
  let got = 0;
  for (const l of m.left) { got += l.max; if (x.pts + got - best > m.R - got) return l; }
  return null;
}
/** When each driver/team dropped out of the fight, and when the title was settled. */
function fightHistory(s, kind) {
  const outAt = {}; let decidedAt = null;
  const done = activeRounds(s).map((r, i) => ({ r, i })).filter(x => s.weekends[x.r.id]?.sessions?.R?.done);
  for (const { r, i } of done) {
    const m = titleMath(s, kind, i + 1);
    for (const x of m.rows) if (!x.alive && outAt[x.id] == null) outAt[x.id] = { r, i };
    if (m.decided && !decidedAt && m.left.length) decidedAt = { r, i, champion: m.rows[0] };
  }
  return { outAt, decidedAt };
}

/** Every way the title can be won, and every way a contender can drop out, at the next round. */
function roundPerms(m) {
  const nx = m.left[0]; if (!nx || m.decided) return null;
  const G = nx.max, Rp = m.R - G;
  const exact = !m.team && !nx.spr; // a single race: positions map straight onto points
  const alive = m.rows.filter(x => x.alive);
  // the final race of a drivers' title: compare the final points, and on a tie, countback
  if (exact && Rp === 0) {
    const clinch = [];
    for (const x of alive) {
      const rivals = m.rows.filter(y => y !== x && y.pts + G >= x.pts);
      const table = clinchTableFinal(x, rivals);
      if (table.length) clinch.push({ x, rivals: rivals.map(y => ({ y, need: x.pts - y.pts })), table });
    }
    return { nx, G, Rp, exact, final: true, clinch, out: [], safe: [] };
  }
  const clinch = [];
  for (const x of alive) {
    const others = m.rows.filter(y => y !== x);
    const best = Math.max(0, ...others.map(y => y.pts));
    if (x.pts + G - best <= Rp) continue;
    // x is champion if it beats every rival y by `need` points or more this weekend
    const rivals = others.map(y => ({ y, need: Rp - (x.pts - y.pts) + 1 })).filter(o => o.need > -G);
    clinch.push({ x, rivals, table: exact ? clinchTable(rivals) : null });
  }
  const out = [];
  for (const j of alive) {
    // k knocks j out if it ends the weekend more than Rp ahead; j survives k while gj - gk >= -e
    const threats = m.rows.filter(k => k !== j && k.pts + G - j.pts > Rp).map(k => ({ k, e: j.pts + Rp - k.pts }));
    if (threats.length) out.push({ j, threats: threats.map(t => ({ ...t, table: exact ? elimTable(t.e) : null })) });
  }
  return { nx, G, Rp, exact, clinch, out, safe: alive.filter(j => !out.some(o => o.j === j)) };
}
function clinchTable(rivals) {
  const rows = [];
  for (let p = 1; p <= NO_PTS; p++) {
    const conds = [];
    for (const o of rivals) {
      const limit = posPts(p) - o.need; // the most the rival may score
      if (limit < 0) return rows;
      let q = 1; while (q === p || posPts(q) > limit) q++;
      conds.push({ y: o.y, q: q === 1 || (q === 2 && p === 1) ? 0 : q });
    }
    rows.push({ p, conds });
  }
  return rows;
}
/** After the final race with x finishing p and y finishing q: >0 x ahead, <0 y ahead, 0 dead level (countback included). */
function finalCmp(x, p, y, q) {
  const px = x.pts + posPts(p), py = y.pts + posPts(q);
  if (px !== py) return px - py;
  const vx = (x.posCount || []).slice(), vy = (y.posCount || []).slice();
  vx[Math.min(p, NO_PTS) - 1] = (vx[Math.min(p, NO_PTS) - 1] || 0) + 1;
  vy[Math.min(q, NO_PTS) - 1] = (vy[Math.min(q, NO_PTS) - 1] || 0) + 1;
  for (let i = 0; i < 30; i++) { const a = vx[i] || 0, b = vy[i] || 0; if (a !== b) return a - b; }
  return 0;
}
/** Final-race clinch table: for each finish of x, how far down each rival has to finish for x to be champion. */
function clinchTableFinal(x, rivals) {
  const rows = [];
  for (let p = 1; p <= NO_PTS; p++) {
    const conds = [];
    for (const y of rivals) {
      // the highest place y can take with x still ahead after countback
      let qmin = null;
      for (let q = NO_PTS; q >= 1; q--) { if (q === p && p < NO_PTS) continue; if (finalCmp(x, p, y, q) > 0) qmin = q; else break; }
      if (qmin == null) return rows; // x can't be champion finishing here, or lower
      conds.push({ y, q: qmin === 1 || (qmin === 2 && p === 1) ? 0 : qmin });
    }
    rows.push({ p, conds });
  }
  return rows;
}
function elimTable(e) {
  const rows = [];
  for (let q = 1; q <= NO_PTS; q++) {
    const need = posPts(q) - e;
    if (need <= 0) { rows.push({ q, safe: true }); break; }
    let pmax = 0; for (let p = 1; p < NO_PTS; p++) if (posPts(p) >= need) pmax = p;
    const worst = pmax === q ? q - 1 : pmax;
    rows.push(worst < 1 ? { q, out: true } : { q, p: worst });
  }
  return rows;
}
const posTxt = (p) => p >= NO_PTS ? 'outside the points' : 'P' + p;
/** "x must outscore y by…" for a weekend where only points totals can be compared. */
function marginTxt(a, b, n) {
  if (n > 0) return `${a} must outscore ${b} by at least ${n} point${n === 1 ? '' : 's'}`;
  if (n === 0) return `${a} must not be outscored by ${b}`;
  return `${a} can afford to be outscored by ${b} by up to ${-n} point${n === -1 ? '' : 's'}`;
}
function permsHtml(m, P, { compact = false } = {}) {
  const nm = (x) => esc(x.name);
  const gp = esc(P.nx.r.name);
  let html = '';
  if (P.clinch.length) {
    html += P.clinch.map(({ x, rivals, table }) => `<div class="perm"><h3>${nm(x)} ${m.team ? 'are champions' : 'is champion'} in ${gp} if…</h3>
      ${table ? `<ul class="perm-list">${table.map(r => `<li><b>${nm(x)} finishes ${posTxt(r.p)}</b>${r.conds.every(c => !c.q) ? ': champion whatever the others do' : ' and ' + r.conds.filter(c => c.q).map(c => `${nm(c.y)} finishes ${c.q >= NO_PTS ? 'outside the points' : posTxt(c.q) + ' or lower'}`).join(', and ')}</li>`).join('')}
        ${table.length < NO_PTS ? `<li class="muted">${nm(x)} cannot be champion here finishing ${posTxt(table.length + 1)} or lower.</li>` : ''}</ul>`
      : `<ul class="perm-list">${rivals.map(o => `<li>${marginTxt(nm(x), nm(o.y), o.need)}</li>`).join('')}</ul>`}
    </div>`).join('');
  } else if (!compact) {
    const L = m.rows[0];
    html += `<div class="callout">The title cannot be won at the ${gp} Grand Prix. Even with maximum points, ${nm(L)} would lead by at most ${L.pts + P.G - (m.rows[1]?.pts || 0)} points with ${P.Rp} still available afterwards.</div>`;
  }
  if (compact) return html;
  if (P.out.length) {
    html += `<h3 style="margin-top:6px">Who can drop out of the fight in ${gp}</h3>`;
    html += P.out.map(({ j, threats }) => `<details class="perm" ${P.out.length <= 3 ? 'open' : ''}><summary><b>${nm(j)}</b> <span class="muted">${j.pts} pts · stays in the fight if…</span></summary>
      ${threats.length > 1 ? `<p class="muted" style="font-size:12px">${threats.map(t => nm(t.k)).join(' and ')} can each end it, so every condition below has to hold.</p>` : ''}
      ${threats.map(t => t.table ? `<ul class="perm-list">${t.table.map(r => `<li>If <b>${nm(t.k)}</b> finishes ${r.q >= NO_PTS ? 'outside the points' : posTxt(r.q)}${r.safe && r.q < NO_PTS ? ' or lower' : ''}, ${r.safe ? `${nm(j)} stays in the fight` : r.out ? `<span class="neg">${nm(j)} is out</span>` : r.p === 1 ? `${nm(j)} must win` : `${nm(j)} must finish ${posTxt(r.p)} or higher`}</li>`).join('')}</ul>`
        : `<ul class="perm-list"><li>${marginTxt(nm(j), nm(t.k), -t.e)}</li></ul>`).join('')}
    </details>`).join('');
  }
  if (P.safe.length) html += `<p class="muted" style="font-size:13px">Safe in ${gp} whatever happens: ${P.safe.map(nm).join(', ')}.</p>`;
  if (P.final) html += `<p class="muted" style="font-size:12px">Final race: if it ends level on points, countback decides it (most wins, then most second places, and so on). That is already counted in the conditions above.</p>`;
  if (!P.exact) html += `<p class="muted" style="font-size:12px">${P.nx.spr ? 'Sprint weekend: sprint and race points count together, so conditions are given in points over the weekend.' : 'Team results combine both cars, so conditions are given in points.'}</p>`;
  return html;
}

/* ------------------------------------------------------------ projection */
/** A driver's last n race starts, newest first, topping up from the previous season when this one is short. */
function recentRaces(c, s, id, n = 5) {
  const out = [];
  for (let k = s.index; k >= Math.max(0, s.index - 1) && out.length < n; k--) {
    const ss = c.seasons[k]; if (!ss) continue;
    const rounds = activeRounds(ss);
    for (let i = rounds.length - 1; i >= 0 && out.length < n; i--) {
      const sd = ss.weekends[rounds[i].id]?.sessions?.R;
      if (!sd?.done) continue;
      const at = sd.results.findIndex(x => x.d === id);
      if (at < 0 || sd.results[at].st === 'DNS') continue;
      const x = sd.results[at];
      out.push({ year: ss.year, r: rounds[i], pos: at + 1, st: x.st, pts: pointsFor('R', at + 1, x.st, x.pts) });
    }
  }
  return out;
}
/**
 * The rest of the season on current form: each remaining race is worth the driver's average race points over
 * their last 5 starts, each sprint the points for their average finishing position over those races (rounded).
 * Only the final total is rounded. Teams add up their current drivers.
 */
function projection(c, s, m) {
  const md = m.team ? titleMath(s, 'driver') : m;
  const per = {};
  for (const x of md.rows) {
    const form = recentRaces(c, s, x.id);
    const racePts = form.length ? avg(form.map(f => f.pts)) : 0;
    const sprPos = form.length ? Math.round(avg(form.map(f => f.pos))) : null;
    const sprPts = sprPos ? pointsFor('SPR', sprPos, 'FIN') : 0;
    let cum = 0;
    const path = m.left.map(l => (cum += racePts + (l.spr ? sprPts : 0)));
    per[x.id] = { form, racePts, sprPos, sprPts, path, gain: cum, prior: form.filter(f => f.year !== s.year).length };
  }
  const rows = m.rows.map(x => {
    if (!m.team) return { ...x, ...per[x.id] };
    const ds = (s.teams.find(t => t.id === x.id)?.drivers || []).filter(d => per[d]);
    const sum = (k) => ds.reduce((a, d) => a + per[d][k], 0);
    return { ...x, ds, racePts: sum('racePts'), sprPts: sum('sprPts'), gain: sum('gain'), path: m.left.map((_, k) => ds.reduce((a, d) => a + per[d].path[k], 0)), form: ds.flatMap(d => per[d].form) };
  });
  for (const x of rows) x.final = Math.round(x.pts + x.gain);
  rows.sort((a, b) => b.final - a.final || a.pos - b.pos);
  rows.forEach((x, i) => { x.ppos = i + 1; x.move = x.pos - x.ppos; });
  // the round where the projected leader would be out of reach
  let decider = null, rest = m.R;
  for (let k = 0; k < m.left.length && !decider; k++) {
    rest -= m.left[k].max;
    const tot = rows.map(x => x.pts + x.path[k]).sort((a, b) => b - a);
    if (tot.length > 1 && tot[0] - tot[1] > rest) decider = m.left[k];
  }
  return { rows, decider, hasForm: rows.some(x => x.form.length), sprints: m.left.filter(l => l.spr).length };
}
function projectionHtml(c, s, m) {
  if (!m.left.length) return '';
  const team = m.team;
  const Pj = projection(c, s, m);
  if (!Pj.hasForm) return '';
  const isMe = (x) => team ? x.id === s.playerTeamId : x.id === PLAYER;
  const who = (x) => team ? `<div class="drv">${teamLogo(c, s.teams.find(t => t.id === x.id), 26)}<b>${esc(x.name)}</b></div>` : drvCell(s, x.id, { size: 26 });
  const colorOf = (x) => team ? s.teams.find(t => t.id === x.id)?.color || '#5E6A82' : teamColor(s, x.id);
  // chart: actual points so far, then the projection dashed
  const prog = progression(s, team ? 'team' : 'driver');
  const baseLabels = prog.n ? prog.labels : ['NOW'];
  const labels = [...baseLabels, ...m.left.map(l => l.r.id.toUpperCase())];
  const names = [...(prog.n ? prog.names : ['Now']), ...m.left.map(l => l.r.name + ' (projected)')];
  let picks = Pj.rows.slice(0, 8);
  const me = Pj.rows.find(isMe); if (me && !picks.includes(me)) picks = [...picks, me];
  const series = picks.map(x => {
    const base = prog.n ? (prog.by[x.id]?.pts || Array(prog.n).fill(null)) : [x.pts];
    return { label: team ? x.name.split(' ')[0] : dAbbr(s, x.id), name: x.name, color: colorOf(x), bold: isMe(x), split: base.length, vals: [...base, ...x.path.map(v => Math.round(x.pts + v))] };
  });
  const L = Pj.rows[0];
  const prior = Pj.rows.some(x => x.prior);
  const formCell = (x) => `<span class="form-run">${x.form.slice().reverse().map(f => `<span class="tag ${OUT.includes(f.st) ? 'dnf' : f.pos <= 3 ? 'done' : ''} ${f.year !== s.year ? 'prev' : ''}" title="${f.year} ${esc(f.r.name)}: ${OUT.includes(f.st) ? f.st : 'P' + f.pos} · ${f.pts} pts">${OUT.includes(f.st) ? f.st : 'P' + f.pos}</span>`).join('')}</span>`;
  const mv = (n) => n > 0 ? `<span class="pos-up">▲${n}</span>` : n < 0 ? `<span class="neg">▼${-n}</span>` : '<span class="dim">–</span>';
  return `<div class="panel"><div class="panel-h"><div><span class="label">On current form</span><h2>Season projection</h2></div>
      <span class="muted" style="font-size:12px">Each remaining race is worth a ${team ? 'team’s drivers’' : 'driver’s'} average race points over their last 5 starts${Pj.sprints ? '; each sprint, the points for their average finishing position over those races' : ''}.</span></div>
    <div class="tiles" style="padding:14px 16px 0">
      <div class="tile"><span class="label">Projected champion${team ? 's' : ''}</span><span class="v" style="font-size:20px">${esc(L.name)}</span><span class="muted" style="font-size:12px">${L.final} pts${Pj.rows[1] ? ` · by ${L.final - Pj.rows[1].final}` : ''}</span></div>
      <div class="tile"><span class="label">Projected decider</span><span class="v" style="font-size:20px">${m.decided ? 'Decided' : Pj.decider ? `R${Pj.decider.i + 1}` : 'Final round'}</span><span class="muted" style="font-size:12px">${m.decided ? 'Already settled' : Pj.decider ? esc(Pj.decider.r.name) : esc(m.left[m.left.length - 1].r.name)}</span></div>
      <div class="tile"><span class="label">Races left</span><span class="v">${m.left.length}</span><span class="muted" style="font-size:12px">${Pj.sprints ? `+ ${Pj.sprints} sprint${Pj.sprints > 1 ? 's' : ''}` : 'no sprints'}</span></div>
    </div>
    <div class="panel-b">${lineChart(series, labels, { names })}</div>
    <div class="panel-b tight table-wrap"><table>
      <thead><tr><th>Proj</th><th></th><th>${team ? 'Team' : 'Driver'}</th><th class="num">Now</th>${team ? '<th>Drivers</th>' : '<th>Last 5 races</th>'}<th class="num">Avg / race</th>${Pj.sprints ? `<th class="num">${team ? 'Sprint pts' : 'Sprint pick'}</th>` : ''}<th class="num">To come</th><th class="num">Projected</th></tr></thead>
      <tbody>${Pj.rows.map(x => `<tr class="${isMe(x) ? 'me' : ''}" ${team ? `data-act="open-team" data-id="${x.id}"` : `data-act="open-driver" data-id="${x.id}"`}>
        <td class="pos ${x.ppos <= 3 ? 'p' + x.ppos : ''}">${x.ppos}</td><td class="num">${mv(x.move)}</td><td>${who(x)}</td><td class="num muted">${x.pts}</td>
        <td>${team ? `<span class="muted">${x.ds.map(d => esc(dAbbr(s, d))).join(' + ')}</span>` : x.form.length ? formCell(x) : '<span class="dim">No races yet</span>'}</td>
        <td class="num">${x.form.length ? x.racePts.toFixed(1) : '–'}</td>
        ${Pj.sprints ? `<td class="num">${team ? x.sprPts : x.sprPos ? `P${x.sprPos} <span class="muted">(${x.sprPts})</span>` : '–'}</td>` : ''}
        <td class="num muted">+${x.gain.toFixed(1)}</td><td class="num"><b>${x.final}</b></td></tr>`).join('')}</tbody></table></div>
    <div class="panel-b muted" style="font-size:12px;border-top:1px solid var(--line)">A DNF counts as 0 points, at the place it was classified. ${prior ? `Faded results are from ${c.seasons[s.index - 1]?.year}, used to make up 5 races. ` : ''}Projected totals are rounded to the nearest point; ties go to the current championship order.</div>
  </div>`;
}

function renderForecast() {
  const c = career(); const s = curSeason();
  const kind = ui.fc; const team = kind === 'team';
  const m = titleMath(s, kind);
  const hist = fightHistory(s, kind);
  const P = roundPerms(m);
  const rounds = activeRounds(s);
  const done = roundsDone(s);
  const alive = m.rows.filter(x => x.alive);
  const dead = m.rows.filter(x => !x.alive);
  const L = m.rows[0];
  const early = L && !m.decided ? earliestClinch(m, L) : null;
  const scale = Math.max(1, ...alive.map(x => x.maxPts));
  const who = (x, size = 26) => team ? `<div class="drv">${teamLogo(c, s.teams.find(t => t.id === x.id), size)}<b>${esc(x.name)}</b></div>` : drvCell(s, x.id, { size });
  const rLabel = (l) => l ? `R${l.i + 1} ${esc(l.r.name)}` : '–';
  const isMe = (x) => team ? x.id === s.playerTeamId : x.id === PLAYER;
  const kindSeg = `<div class="row">${seasonPicker(c, s.index)}<div class="seg">${[['driver', 'Drivers'], ['team', 'Constructors']].map(([v, l]) => `<button data-act="fc-kind" data-v="${v}" class="${kind === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>`;
  if (!m.rows.some(x => x.pts > 0)) {
    return `<div class="page">
      <div class="page-head"><div><h1>Title Forecast</h1><div class="sub">${s.year} · ${rounds.length} rounds · ${m.R} points available to each ${team ? 'team' : 'driver'}</div></div>${kindSeg}</div>
      <div class="panel"><div class="empty" style="padding:40px 16px">No points scored yet, so every ${team ? 'team' : 'driver'} starts level.${early ? ` The earliest the ${team ? 'constructors’' : 'drivers’'} title can be won is Round ${early.i + 1}, ${esc(early.r.name)}.` : ''} Log a race to see who is still in the fight and what each contender needs.</div></div>
      ${projectionHtml(c, s, m)}
    </div>`;
  }
  return `<div class="page">
    <div class="page-head"><div><h1>Title Forecast</h1><div class="sub">${s.year} · after ${done} of ${rounds.length} rounds · ${m.R} points still available to each ${team ? 'team' : 'driver'}</div></div>${kindSeg}</div>
    ${m.decided ? `<div class="panel champ-banner"><div class="panel-b row" style="gap:16px">${team ? teamLogo(c, s.teams.find(t => t.id === L.id), 56) : avatar(c, s, L.id, 56)}
      <div><span class="label">${s.year} ${team ? 'constructors’' : 'drivers’'} champion${team ? 's' : ''}</span><div class="hof-name" style="font-size:26px">${esc(L.name)}</div>
      <span class="muted">${hist.decidedAt ? `Title settled at Round ${hist.decidedAt.i + 1}, ${esc(hist.decidedAt.r.name)}${m.left.length ? `, with ${m.left.length} round${m.left.length > 1 ? 's' : ''} to spare` : ''}.` : 'Decided at the final round.'}</span></div></div></div>` : ''}
    <div class="tiles">
      <div class="tile"><span class="label">Leader</span><span class="v" style="font-size:20px">${esc(L?.name || '–')}</span></div>
      <div class="tile"><span class="label">Lead</span><span class="v">${m.margin}<small> pts</small></span></div>
      <div class="tile"><span class="label">Points left</span><span class="v">${m.R}</span></div>
      <div class="tile"><span class="label">Still in the fight</span><span class="v">${m.decided ? 1 : alive.length}<small> / ${m.rows.length}</small></span></div>
      <div class="tile"><span class="label">Earliest decider</span><span class="v" style="font-size:20px">${m.decided ? 'Decided' : early ? `R${early.i + 1}` : '–'}</span><span class="muted" style="font-size:12px">${early ? esc(early.r.name) + (early === m.left[0] ? ' · this weekend' : '') : ''}</span></div>
      <div class="tile"><span class="label">Rounds left</span><span class="v">${m.left.length}</span></div>
    </div>
    <div class="panel"><div class="panel-h"><h2>${m.decided ? 'Final picture' : 'Still in with a chance'}</h2><span class="muted" style="font-size:12px">Bar: points now to the most still possible. The line marks the leader’s current total.</span></div>
      <div class="panel-b tight table-wrap"><table>
      <thead><tr><th>Pos</th><th>${team ? 'Team' : 'Driver'}</th><th class="num">Pts</th><th class="num">Gap</th><th class="num">Max</th><th style="width:30%">Range</th><th>Earliest title</th><th class="num">Needs per round</th></tr></thead>
      <tbody>${(m.decided ? m.rows.slice(0, 1) : alive).map(x => {
        const e = m.decided ? null : earliestClinch(m, x);
        const per = m.left.length && x.gap > 0 ? (x.gap / m.left.length).toFixed(1) : null;
        return `<tr class="${isMe(x) ? 'me' : ''}" ${team ? `data-act="open-team" data-id="${x.id}"` : `data-act="open-driver" data-id="${x.id}"`}><td class="pos ${x.pos <= 3 ? 'p' + x.pos : ''}">${x.pos}</td><td>${who(x)}</td><td class="num"><b>${x.pts}</b></td><td class="num">${x.gap ? '−' + x.gap : '–'}</td><td class="num">${x.maxPts}</td>
          <td><div class="range"><i style="left:${x.pts / scale * 100}%;width:${(x.maxPts - x.pts) / scale * 100}%;--c:${team ? s.teams.find(t => t.id === x.id)?.color : teamColor(s, x.id)}"></i><b style="left:${m.lead / scale * 100}%"></b></div></td>
          <td class="muted">${m.decided ? 'Champion' : e ? rLabel(e) : '–'}</td><td class="num muted">${per ? `+${per} on ${esc(L.name.split(' ').slice(-1)[0])}` : x.pos === 1 ? 'Leads' : 'Level'}</td></tr>`;
      }).join('')}</tbody></table></div>
      ${dead.length ? `<div class="panel-b muted" style="font-size:13px;border-top:1px solid var(--line)"><b style="color:var(--fg)">Out of contention:</b> ${dead.map(x => `${esc(x.name)}${hist.outAt[x.id] ? ` <span class="dim">(R${hist.outAt[x.id].i + 1})</span>` : ''}`).join(', ')}</div>` : ''}
    </div>
    ${P ? `<div class="panel"><div class="panel-h"><div><span class="label">Permutations · Round ${P.nx.i + 1} of ${rounds.length}${P.nx.spr ? ' · sprint weekend' : ''}</span><h2>${esc(P.nx.r.name)} Grand Prix</h2></div>
      <span class="muted" style="font-size:12px">${P.G} points available this weekend · ${P.Rp} after it</span></div>
      <div class="panel-b stack">${permsHtml(m, P)}
        ${!P.clinch.length && early ? `<p class="muted" style="font-size:13px">Earliest the title can be won: Round ${early.i + 1}, ${esc(early.r.name)}, if ${esc(L.name)} takes maximum points and nobody else scores.</p>` : ''}
        <p class="muted" style="font-size:12px">Finishing level on points counts as staying in the fight: countback (most wins, then most second places, and so on) would settle a tie at the end of the season.</p>
      </div></div>` : ''}
    ${projectionHtml(c, s, m)}
  </div>`;
}

/* ------------------------------------------------------------ performance */
/** Each driver's race time: the winner's time plus their gap. DNFs and lapped cars get none. */
function raceTimes(s, r) {
  const sd = s.weekends[r.id]?.sessions?.R; if (!sd?.done) return null;
  if (sd.game?.laps) {
    // logged from F1 25: each driver's average clean lap, so lapped cars and retirements count too
    const laps = raceLaps(s, r.id); const out = {};
    sd.results.forEach((x, k) => { const p = x.st === 'DNS' ? null : cleanLapPace(sd, x.d); out[x.d] = { t: p != null ? p * laps : null, pos: k + 1, lapped: false }; });
    if (Object.values(out).some(o => o.t != null)) return { r, laps, drivers: out };
  }
  const lead = sd.results[0];
  const L = lead && lead.st === 'FIN' ? parseDur(lead.gap) : null;
  if (L == null || L < 600000) return null; // no winner's time logged (or not a full race time)
  const out = {};
  sd.results.forEach((x, k) => {
    const lapped = +x.laps > 0 || /lap/i.test(x.gap || '');
    const g = k === 0 ? 0 : parseDur(x.gap);
    out[x.d] = { t: x.st === 'FIN' && !lapped && g != null ? L + g : null, pos: k + 1, lapped: x.st === 'FIN' && lapped };
  });
  return { r, laps: raceLaps(s, r.id), drivers: out };
}
const RACE_LENGTHS = [100, 50, 35, 25];
/** A weekend's race distance in percent: its own setting, else the latest one set before it (earlier seasons too). */
function raceLength(s, roundId) {
  const c = career(), rounds = activeRounds(s);
  for (let k = rounds.findIndex(r => r.id === roundId); k >= 0; k--) { const v = s.weekends[rounds[k].id]?.raceLength; if (v) return v; }
  for (let i = s.index - 1; i >= 0; i--) {
    const p = c?.seasons[i]; if (!p) continue;
    const rs = activeRounds(p);
    for (let k = rs.length - 1; k >= 0; k--) { const v = p.weekends[rs[k].id]?.raceLength; if (v) return v; }
  }
  return 100;
}
/** Grand Prix laps at the weekend's distance. F1 games round shortened races up (Miami 57 laps → 15 at 25%). */
function raceLaps(s, roundId) {
  const r = s.calendar.find(x => x.id === roundId);
  if (r?.laps) return r.laps; // a real race: the laps it actually ran
  const full = D.TRACKS[trackOf(r) || roundId]?.laps || 60;
  return Math.ceil(full * raceLength(s, roundId) / 100 - 1e-9);
}
/** Each driver's best qualifying lap. */
function qualiTimes(s, r) {
  const sd = s.weekends[r.id]?.sessions?.Q; if (!sd?.done) return null;
  const out = {}; let any = false;
  sd.results.forEach((x, k) => { const t = OUT.includes(x.st) ? null : parseLap(x.lap); if (t != null) any = true; out[x.d] = { t, pos: k + 1, lapped: false }; });
  return any ? { r, laps: 1, drivers: out } : null;
}
/**
 * Team pace league. Per session, a team's time is the average of its drivers' valid times (per lap in a race),
 * and its gap is measured to the fastest team in that session. The table averages those gaps, so a race a team
 * misses can't flatter or hurt it. Teams that mostly finish a lap or more down rank below, by finishing position.
 */
function paceTable(s, kind, last5) {
  const sessions = activeRounds(s).map(r => kind === 'race' ? raceTimes(s, r) : qualiTimes(s, r)).filter(Boolean);
  const used = last5 ? sessions.slice(-5) : sessions;
  const T = {}; const tget = (t) => T[t.id] ||= { team: t, gaps: [], pos: [], counted: 0, entered: 0, byRound: {} };
  for (const ss of used) {
    const per = {};
    const ri = activeRounds(s).indexOf(ss.r);
    for (const [d, o] of Object.entries(ss.drivers)) {
      const t = teamAt(s, d, ri); if (!t) continue;
      const x = (per[t.id] ||= { t, times: [], pos: [], lapped: 0 });
      if (o.t != null) x.times.push(o.t); x.pos.push(o.pos); if (o.lapped) x.lapped++;
    }
    // in qualifying a lap more than 2 s off the teammate is a mistake, not the car: use the faster one
    for (const x of Object.values(per)) if (kind === 'quali' && x.times.length === 2 && Math.abs(x.times[0] - x.times[1]) > 2000) x.times = [Math.min(...x.times)];
    const vals = Object.values(per).filter(x => x.times.length).map(x => ({ ...x, v: avg(x.times) / ss.laps }));
    const best = Math.min(...vals.map(x => x.v));
    for (const x of Object.values(per)) {
      const o = tget(x.t); o.entered++; o.pos.push(Math.min(...x.pos));
      const v = vals.find(y => y.t.id === x.t.id);
      if (v) { o.gaps.push(v.v - best); o.counted++; o.byRound[ss.r.id] = v.v - best; }
      else if (x.lapped) o.byRound[ss.r.id] = 'lap';
    }
  }
  const rows = Object.values(T);
  for (const o of rows) { o.mean = o.gaps.length ? avg(o.gaps) : null; o.avgPos = avg(o.pos) ?? 99; o.lappedTeam = o.counted * 2 < o.entered; }
  const paced = rows.filter(o => !o.lappedTeam).sort((a, b) => a.mean - b.mean);
  const lapped = rows.filter(o => o.lappedTeam).sort((a, b) => a.avgPos - b.avgPos);
  const top = paced[0]?.mean ?? 0;
  paced.forEach(o => { o.rel = o.mean - top; });
  const floor = paced.length ? paced[paced.length - 1].rel : 0;
  lapped.forEach(o => { o.rel = null; o.floor = floor; });
  return { rows: [...paced, ...lapped], sessions: used, total: sessions.length };
}
/**
 * Driver pace league, built the same way as the team one: per session, each driver's gap to the fastest driver
 * (per lap in a race), averaged over the sessions they set a valid time. A qualifying lap more than 2 s off the
 * teammate's is a mistake and doesn't count. Drivers who mostly had no valid time (lapped, or no lap in
 * qualifying) rank below, by average finishing position.
 */
function driverPaceTable(s, kind, last5) {
  const sessions = activeRounds(s).map(r => kind === 'race' ? raceTimes(s, r) : qualiTimes(s, r)).filter(Boolean);
  const used = last5 ? sessions.slice(-5) : sessions;
  const P = {}; const get = (d) => P[d] ||= { id: d, gaps: [], pos: [], counted: 0, entered: 0, skipped: 0, byRound: {} };
  for (const ss of used) {
    const ri = activeRounds(s).indexOf(ss.r);
    const entries = Object.entries(ss.drivers);
    const valid = {};
    for (const [d, o] of entries) {
      if (o.t == null) continue;
      if (kind === 'quali') {
        const tid = teamAt(s, d, ri)?.id;
        const mate = entries.find(([e, oe]) => e !== d && oe.t != null && teamAt(s, e, ri)?.id === tid);
        if (tid && mate && o.t - mate[1].t > 2000) { get(d).skipped++; continue; }
      }
      valid[d] = o.t / ss.laps;
    }
    const best = Math.min(...Object.values(valid));
    for (const [d, o] of entries) {
      const x = get(d); x.entered++; x.pos.push(o.pos);
      if (valid[d] != null) { const g = valid[d] - best; x.gaps.push(g); x.counted++; x.byRound[ss.r.id] = g; }
      else if (o.lapped) x.byRound[ss.r.id] = 'lap';
    }
  }
  const rows = Object.values(P);
  for (const o of rows) { o.mean = o.gaps.length ? avg(o.gaps) : null; o.avgPos = avg(o.pos) ?? 99; o.slow = o.counted * 2 < o.entered; }
  const paced = rows.filter(o => !o.slow).sort((a, b) => a.mean - b.mean);
  const rest = rows.filter(o => o.slow).sort((a, b) => a.avgPos - b.avgPos);
  const top = paced[0]?.mean ?? 0;
  paced.forEach(o => { o.rel = o.mean - top; });
  const floor = paced.length ? paced[paced.length - 1].rel : 0;
  rest.forEach(o => { o.rel = null; o.floor = floor; });
  return { rows: [...paced, ...rest], sessions: used, total: sessions.length };
}
/** Teammate gaps: qualifying (sessions within 2 s, both with a time) and race pace per lap. */
function teammateGaps(s, a, b) {
  const q = [], r = []; let qa = 0, qb = 0, skipped = 0;
  for (const rd of activeRounds(s)) {
    const Q = qualiTimes(s, rd);
    if (Q) {
      const ta = Q.drivers[a]?.t, tb = Q.drivers[b]?.t;
      if (Q.drivers[a] && Q.drivers[b]) {
        if (ta == null || tb == null || Math.abs(ta - tb) > 2000) skipped++;
        else { q.push(ta - tb); ta < tb ? qa++ : tb < ta ? qb++ : 0; }
      }
    }
    const R = raceTimes(s, rd);
    const ra = R?.drivers[a]?.t, rb = R?.drivers[b]?.t;
    if (ra != null && rb != null) r.push((ra - rb) / R.laps);
  }
  return { q: q.length ? avg(q) : null, qn: q.length, qa, qb, skipped, r: r.length ? avg(r) : null, rn: r.length };
}
const gapS = (ms, d = 3) => `${ms >= 0 ? '+' : '−'}${Math.abs(ms / 1000).toFixed(d)}s`;

function renderPerformance() {
  const c = career(); const s = curSeason();
  const last5 = ui.perf === 'last5';
  const race = paceTable(s, 'race', last5), quali = paceTable(s, 'quali', last5);
  const board = (P, label) => {
    if (!P.sessions.length) return `<div class="empty">${label === 'race' ? 'Enter the winner’s race time and the gaps to the winner in a race to see race pace.' : 'Enter lap times in qualifying to see qualifying pace.'}</div>`;
    const max = Math.max(0.001, ...P.rows.filter(o => o.rel != null).map(o => o.rel));
    return `<table><thead><tr><th>Pos</th><th>Team</th><th class="num">${label === 'race' ? 'Pace per lap' : 'Gap'}</th><th style="width:34%"></th><th class="num" title="Sessions with a valid time">${label === 'race' ? 'Races' : 'Sessions'}</th></tr></thead><tbody>
      ${P.rows.map((o, k) => `<tr class="${o.team.id === s.playerTeamId ? 'me' : ''}" data-act="open-team" data-id="${o.team.id}"><td class="pos ${k < 3 ? 'p' + (k + 1) : ''}">${k + 1}</td><td><div class="drv">${teamLogo(c, o.team, 22)}<b>${esc(o.team.name)}</b></div></td>
        <td class="num">${o.rel == null ? `<span class="muted">&gt; ${gapS(o.floor)}</span> <span class="tag">${label === 'race' ? 'Lapped' : 'No time'}</span>` : k === 0 ? '<b>Fastest</b>' : gapS(o.rel)}</td>
        <td><div class="h2h-bar"><i style="--c:${o.team.color};width:${o.rel == null ? 100 : Math.max(2, 100 - o.rel / max * 70)}%"></i></div></td>
        <td class="num muted">${o.counted}/${o.entered}</td></tr>`).join('')}
    </tbody></table>`;
  };
  const matrix = (P) => !P.sessions.length ? '' : `<table class="matrix"><thead><tr><th>Team</th>${P.sessions.map(x => `<th title="${esc(x.r.name)}">${esc(x.r.id.toUpperCase())}</th>`).join('')}</tr></thead><tbody>
    ${P.rows.map(o => `<tr class="${o.team.id === s.playerTeamId ? 'me' : ''}"><td><div class="drv">${teamLogo(c, o.team, 18)}${esc(o.team.name)}</div></td>${P.sessions.map(x => { const v = o.byRound[x.r.id]; return `<td class="num">${v == null ? '<span class="dim">·</span>' : v === 'lap' ? '<span class="dim">Lap</span>' : v === 0 ? '<b style="color:var(--purple)">0.000</b>' : `<span style="opacity:${Math.max(0.45, 1 - v / 3000)}">${(v / 1000).toFixed(3)}</span>`}</td>`; }).join('')}</tr>`).join('')}
  </tbody></table>`;
  const pairs = s.teams.map(t => ({ t, d: t.drivers.filter(Boolean) })).filter(x => x.d.length === 2).sort((a, b) => (b.t.id === s.playerTeamId) - (a.t.id === s.playerTeamId));
  const mode = last5 ? 'last 5' : 'season';
  const drivers = ui.perfView === 'drivers';
  const head = `<div class="page-head"><div><h1>Performance</h1><div class="sub">${drivers
      ? 'The F1 Fan Voice driver ratings for every Grand Prix, then each driver’s pace measured from your logged times.'
      : 'Car pace from your logged times. Race pace uses the winner’s time plus each gap, averaged over both cars and divided by the laps run at that weekend’s race distance. Gaps are relative to the fastest team.'}</div></div>
      <div class="row">${seasonPicker(c, s.index)}<div class="seg">${[['teams', 'Teams'], ['drivers', 'Drivers']].map(([v, l]) => `<button data-act="perf-view" data-v="${v}" class="${(ui.perfView || 'teams') === v ? 'on' : ''}">${l}</button>`).join('')}</div><div class="seg">${[['season', 'Season'], ['last5', 'Last 5']].map(([v, l]) => `<button data-act="perf-mode" data-v="${v}" class="${ui.perf === v ? 'on' : ''}">${l}</button>`).join('')}</div></div></div>`;
  if (drivers) return renderDriverPerformance(c, s, last5, head, mode);
  return `<div class="page">
    ${head}
    <div class="grid-2">
      <div class="panel"><div class="panel-h"><h2>Race pace</h2><span class="muted" style="font-size:12px">${race.sessions.length ? `${mode} · ${plural(race.sessions.length, 'race')}` : ''}</span></div><div class="panel-b tight table-wrap">${board(race, 'race')}</div></div>
      <div class="panel"><div class="panel-h"><h2>Qualifying pace</h2><span class="muted" style="font-size:12px">${quali.sessions.length ? `${mode} · ${plural(quali.sessions.length, 'session')}` : ''}</span></div><div class="panel-b tight table-wrap">${board(quali, 'quali')}</div></div>
    </div>
    <div class="panel"><div class="panel-h"><h2>Teammate comparison</h2><span class="muted" style="font-size:12px">Whole season. Qualifying sessions where a driver set no time or was more than 2 s off the teammate are left out.</span></div>
      <div class="panel-b tight table-wrap"><table><thead><tr><th>Team</th><th>Drivers</th><th class="num">Quali gap</th><th class="num">Quali H2H</th><th class="num">Counted</th><th class="num">Race pace / lap</th><th class="num">Races</th></tr></thead><tbody>
      ${pairs.map(({ t, d: [a, b] }) => { const g = teammateGaps(s, a, b); const who = (v) => v == null ? '–' : Math.abs(v) < 0.5 ? 'Level' : `${esc(dAbbr(s, v < 0 ? a : b))} ${gapS(-Math.abs(v))}`; return `<tr class="${t.id === s.playerTeamId ? 'me' : ''}">
        <td><div class="drv">${teamLogo(c, t, 20)}${esc(t.name)}</div></td>
        <td><div class="row" style="gap:6px;flex-wrap:nowrap">${avatar(c, s, a, 22)}<b>${esc(dAbbr(s, a))}</b><span class="muted">vs</span>${avatar(c, s, b, 22)}<b>${esc(dAbbr(s, b))}</b></div></td>
        <td class="num">${who(g.q)}</td><td class="num">${g.qn ? `${g.qa}–${g.qb}` : '–'}</td><td class="num muted">${g.qn}${g.skipped ? ` <span title="Left out">(+${g.skipped})</span>` : ''}</td>
        <td class="num">${who(g.r)}</td><td class="num muted">${g.rn}</td></tr>`; }).join('')}
      </tbody></table></div>
      <div class="panel-b muted" style="font-size:12px;border-top:1px solid var(--line)">Gaps show who is quicker on average and by how much: “NOR −0.124s” means Norris is 0.124 s faster than the teammate.</div>
    </div>
    ${race.sessions.length ? `<div class="panel"><div class="panel-h"><h2>Race pace by round</h2><span class="muted" style="font-size:12px">Seconds per lap behind the fastest team. “Lap” means the team was only classified laps down.</span></div><div class="panel-b tight table-wrap">${matrix(race)}</div></div>` : ''}
    ${quali.sessions.length ? `<div class="panel"><div class="panel-h"><h2>Qualifying pace by round</h2><span class="muted" style="font-size:12px">Seconds behind the fastest team’s average lap</span></div><div class="panel-b tight table-wrap">${matrix(quali)}</div></div>` : ''}
  </div>`;
}
function renderDriverPerformance(c, s, last5, head, mode) {
  const race = driverPaceTable(s, 'race', last5), quali = driverPaceTable(s, 'quali', last5);
  const color = (id) => teamOf(s, id)?.color || '#5E6A82';
  const board = (P, label) => {
    if (!P.sessions.length) return `<div class="empty">${label === 'race' ? 'Enter the winner’s race time and the gaps to the winner in a race to see race pace.' : 'Enter lap times in qualifying to see qualifying pace.'}</div>`;
    const max = Math.max(0.001, ...P.rows.filter(o => o.rel != null).map(o => o.rel));
    return `<table><thead><tr><th>Pos</th><th>Driver</th><th class="num">${label === 'race' ? 'Pace per lap' : 'Gap'}</th><th style="width:30%"></th><th class="num" title="Sessions with a valid time">${label === 'race' ? 'Races' : 'Sessions'}</th></tr></thead><tbody>
      ${P.rows.map((o, k) => `<tr class="${o.id === PLAYER ? 'me' : ''}" data-act="open-driver" data-id="${o.id}"><td class="pos ${k < 3 ? 'p' + (k + 1) : ''}">${k + 1}</td><td>${drvCell(s, o.id)}</td>
        <td class="num">${o.rel == null ? `<span class="muted">&gt; ${gapS(o.floor)}</span> <span class="tag">${label === 'race' ? 'Lapped' : 'No time'}</span>` : k === 0 ? '<b>Fastest</b>' : gapS(o.rel)}</td>
        <td><div class="h2h-bar"><i style="--c:${color(o.id)};width:${o.rel == null ? 100 : Math.max(2, 100 - o.rel / max * 70)}%"></i></div></td>
        <td class="num muted">${o.counted}/${o.entered}${o.skipped ? ` <span title="Laps more than 2 s off the teammate, left out">(+${o.skipped})</span>` : ''}</td></tr>`).join('')}
    </tbody></table>`;
  };
  const matrix = (P) => !P.sessions.length ? '' : `<table class="matrix"><thead><tr><th>Driver</th>${P.sessions.map(x => `<th title="${esc(x.r.name)}">${esc(x.r.id.toUpperCase())}</th>`).join('')}</tr></thead><tbody>
    ${P.rows.map(o => `<tr class="${o.id === PLAYER ? 'me' : ''}"><td><div class="drv"><span class="chip" style="--c:${color(o.id)}"></span>${esc(dAbbr(s, o.id))}</div></td>${P.sessions.map(x => { const v = o.byRound[x.r.id]; return `<td class="num">${v == null ? '<span class="dim">·</span>' : v === 'lap' ? '<span class="dim">Lap</span>' : v === 0 ? '<b style="color:var(--purple)">0.000</b>' : `<span style="opacity:${Math.max(0.45, 1 - v / 3000)}">${(v / 1000).toFixed(3)}</span>`}</td>`; }).join('')}</tr>`).join('')}
  </tbody></table>`;
  // ratings out of 10 and the awards
  const SR = seasonRatings(s);
  const dots = driverOfTheSeason(s);
  const rated = Object.values(SR.by).sort((a, b) => (last5 ? b.last5 - a.last5 : b.avg - a.avg) || b.dotd - a.dotd);
  const ratedRounds = activeRounds(s).map((r, ri) => ({ r, ri })).filter(x => raceRatings(s, x.ri));
  // F1 Fan Voice: the chosen race's verdict, the season table, Driver of the Day and of the Season
  const fvRi = ratedRounds.some(x => x.ri === ui.fvRound) ? ui.fvRound : ratedRounds[ratedRounds.length - 1]?.ri;
  const fvR = fvRi != null ? raceRatings(s, fvRi) : null;
  const fvRace = fvR ? Object.values(fvR).sort((a, b) => b.rating - a.rating) : [];
  const fvDotd = fvRi != null ? driverOfTheDay(s, fvRi) : null;
  const fvRound = fvRi != null ? activeRounds(s)[fvRi] : null;
  const podium = fvRace.slice(0, 3);
  const awards = !SR.rated ? `<section class="fv-hero"><div>${fvMark()}<h1>Driver Ratings</h1><p>After every Grand Prix, fans rate each driver out of 10. Log a race to open the vote.</p></div></section>` : `
    <section class="fv-hero">
      <div>${fvMark()}<h1>Driver Ratings</h1><p>After every Grand Prix, fans rate each driver out of 10: mostly the race result against the car, plus places made, the winning margin, the teammate battle and a little for qualifying.</p></div>
      <label class="fv-pick"><span class="label">Grand Prix</span><select data-ch="fv-round">${ratedRounds.map(x => `<option value="${x.ri}" ${x.ri === fvRi ? 'selected' : ''}>R${x.ri + 1} · ${esc(x.r.name)}</option>`).join('')}</select></label>
    </section>
    <div class="fv-podium">${podium.map((x, k) => `<button class="fv-card p${k + 1}" data-act="open-driver" data-id="${x.id}" style="--tc:${color(x.id)}">
      <span class="fv-place">${k + 1}</span>${avatar(c, s, x.id, k === 0 ? 112 : 88)}
      <span class="fv-card-name">${esc(dName(s, x.id))}</span><small>${esc(teamOf(s, x.id)?.name || '')} · ${x.dnf ? 'DNF' : 'P' + x.finish}</small>
      <span class="fv-big" style="color:${ratingColor(x.rating)}">${x.rating.toFixed(1)}</span>${fvDotd?.id === x.id ? '<span class="tag next">Driver of the Day</span>' : ''}</button>`).join('')}</div>
    <div class="grid-2">
      <div class="panel fv-panel"><div class="panel-h"><div><span class="label">${esc(fvRound.name)} Grand Prix</span><h2>The fans’ verdict</h2></div></div><div class="panel-b tight">${fvList(c, s, fvRace.map(x => ({ id: x.id, rating: x.rating, sub: `${teamOf(s, x.id)?.name || ''} · ${x.dnf ? 'DNF' : 'P' + x.finish}${x.reasons.length ? ' · ' + x.reasons[0] : ''}` })))}</div></div>
      <div class="stack">
        ${dots ? `<div class="panel award-panel fv-panel"><div class="panel-h"><div><span class="label">${dots.final ? `${s.year} Driver of the Season` : 'Driver of the Season · leading'}</span></div><button class="btn sm" data-act="award-card" data-kind="dots">${ICON.camera} Image</button></div>
          <div class="panel-b row" style="gap:14px;flex-wrap:nowrap">${avatar(c, s, dots.id, 64)}<div><div class="hof-name">${esc(dName(s, dots.id))}</div><span class="muted">${plural(dots.dotd, 'Driver of the Day award')} · ${dots.avg.toFixed(1)}/10 average</span></div></div></div>` : ''}
        <div class="panel fv-panel"><div class="panel-h"><div><span class="label">${s.year} · ${last5 ? 'last 5 races' : 'season average'}</span><h2>Season ratings</h2></div></div><div class="panel-b tight">${fvList(c, s, rated.slice(0, 10).map(o => ({ id: o.id, rating: last5 ? o.last5 : o.avg, sub: `${teamOf(s, o.id)?.name || ''} · ${plural(o.list.length, 'race')}${o.dotd ? ` · ${plural(o.dotd, 'DOTD')}` : ''}` })))}</div></div>
        <div class="panel fv-panel"><div class="panel-h"><div><span class="label">Voted by the fans</span><h2>Driver of the Day</h2></div></div><div class="panel-b tight">
          ${SR.dotd.slice().reverse().map(x => `<div class="dotd-row"><span class="label">R${x.ri + 1}</span>${avatar(c, s, x.id, 30)}<div style="min-width:0;flex:1"><b>${esc(dName(s, x.id))}</b> <span class="muted">· ${esc(x.r.name)}</span><div class="muted" style="font-size:12px">${esc(x.reasons.join(', ') || `${ordWord(x.finish)} at the flag`)}</div></div>
            <span class="v" style="color:${ratingColor(x.rating)}">${x.rating.toFixed(1)}</span><button class="icon-btn" title="Image" data-act="award-card" data-kind="dotd" data-ri="${x.ri}">${ICON.camera}</button></div>`).join('')}
        </div></div>
      </div>
    </div>
    <details class="panel fv-panel"><summary class="panel-h"><h2>Every rating, every round</h2><span class="muted" style="font-size:12px">Driver of the Day outlined · tap to open</span></summary><div class="panel-b tight table-wrap">
      <table class="matrix"><thead><tr><th>Driver</th>${ratedRounds.map(x => `<th title="${esc(x.r.name)}">${esc(x.r.id.toUpperCase())}</th>`).join('')}</tr></thead><tbody>
        ${rated.map(o => `<tr class="${o.id === PLAYER ? 'me' : ''}"><td><div class="drv"><span class="chip" style="--c:${color(o.id)}"></span>${esc(dAbbr(s, o.id))}</div></td>${ratedRounds.map(x => { const v = raceRatings(s, x.ri)[o.id]; const isD = SR.dotd.find(d => d.ri === x.ri)?.id === o.id; return `<td class="num">${v ? `<span class="rating-cell ${isD ? 'is-dotd' : ''}" style="color:${ratingColor(v.rating)}" title="${esc(v.reasons.join(', '))}">${v.rating.toFixed(1)}</span>` : '<span class="dim">·</span>'}</td>`; }).join('')}</tr>`).join('')}
      </tbody></table></div></details>`;
  return `<div class="page">
    ${head}
    ${awards}
    <div class="section-title" style="margin-top:8px"><h2>Pace data</h2><span class="muted" style="font-size:13px">Measured from your logged times</span></div>
    <div class="grid-2">
      <div class="panel"><div class="panel-h"><h2>Driver race pace</h2><span class="muted" style="font-size:12px">${race.sessions.length ? `${mode} · ${plural(race.sessions.length, 'race')}` : ''}</span></div><div class="panel-b tight table-wrap">${board(race, 'race')}</div></div>
      <div class="panel"><div class="panel-h"><h2>Driver qualifying pace</h2><span class="muted" style="font-size:12px">${quali.sessions.length ? `${mode} · ${plural(quali.sessions.length, 'session')}` : ''}</span></div><div class="panel-b tight table-wrap">${board(quali, 'quali')}</div></div>
    </div>
    <p class="muted" style="font-size:12px">A DNF or a lapped finish gives no race time, and a qualifying lap more than 2 s off the teammate’s is left out as a mistake. Drivers without a valid time in most sessions rank below the rest, by average finishing position.</p>
    ${race.sessions.length ? `<div class="panel"><div class="panel-h"><h2>Driver race pace by round</h2><span class="muted" style="font-size:12px">Seconds per lap behind the fastest driver. “Lap” means the driver was classified laps down.</span></div><div class="panel-b tight table-wrap">${matrix(race)}</div></div>` : ''}
    ${quali.sessions.length ? `<div class="panel"><div class="panel-h"><h2>Driver qualifying pace by round</h2><span class="muted" style="font-size:12px">Seconds behind the fastest lap</span></div><div class="panel-b tight table-wrap">${matrix(quali)}</div></div>` : ''}
  </div>`;
}

/* -------------------------------------------------------- driver ratings */
// Every driver gets a rating out of 10 for each Grand Prix, and the race decides it. A finish where the car should
// finish is worth more the faster the car is (P2 in a top car ≈ 8.5, a backmarker's par ≈ 6.6), and places above or
// below that are valued like points: positions near the front count for more, so a backmarker passes 9 only around
// the points, a midfield car must beat front-runners, and a top car outside the top 10 scores low. A win in a top car
// is worth about 9, and only a dominant margin lifts it to 10: 15 s over a full race, scaled to the race
// distance (7.5 s at 50%, 3.75 s at 25%). A driver starting far behind their car
// (a qualifying DNF, say) is also scored on the climb, so the back of the grid to P5 in a top car is a 10.
// Nobody outside the top 10 scores above 7.9. Qualifying against the car's pace (scored 4–10) carries 12%, and a driver
// beaten by their teammate in the race can't outscore them unless they started well behind. A retirement is rated
// on qualifying alone, from 4 to 7.
// How fast each car is comes only from the races before that one, at most the last 5, so a rating never changes
// later in the season as cars improve. The first race has nothing before it: there, that day's qualifying decides
// the car order and qualifying isn't rated separately.
const RATING_WINDOW = 5;
const _ratingCache = new WeakMap();
/** The car order and qualifying pace going into round ri, from the (up to) 5 logged races before it. */
function carPaceBefore(s, ri) {
  const rounds = activeRounds(s);
  const logged = (r) => s.weekends[r.id]?.sessions?.R?.done || s.weekends[r.id]?.sessions?.Q?.done;
  const window = rounds.slice(0, ri).filter(logged).slice(-RATING_WINDOW);
  const first = !window.length;
  // the first race (nothing logged before it): only this round's qualifying, never its race
  const use = first ? [rounds[ri]] : window;
  const keep = new Set(use.map(r => r.id));
  const prior = { ...s, weekends: Object.fromEntries(Object.entries(s.weekends).filter(([id]) => keep.has(id)).map(([id, w]) => [id, first ? { ...w, sessions: { Q: w.sessions?.Q } } : w])) };
  const base = (tid) => D.BASE_PACE[tid] ?? 0.8;
  const racePt = first ? { rows: [] } : paceTable(prior, 'race', false), qualiPt = paceTable(prior, 'quali', false);
  let order = (racePt.rows.length ? racePt.rows : qualiPt.rows).map(o => o.team.id);
  if (first && !order.length) {
    // no lap times on day one: order the cars by each team's best grid slot
    const Q = s.weekends[rounds[ri].id]?.sessions?.Q;
    if (Q?.done) { const best = {}; Q.results.forEach((x, k) => { const t = teamAt(s, x.d, ri)?.id; if (t && best[t] == null && !OUT.includes(x.st)) best[t] = k; }); order = Object.keys(best).sort((a, b) => best[a] - best[b]); }
  }
  for (const t of s.teams.slice().sort((a, b) => base(a.id) - base(b.id))) if (!order.includes(t.id)) order.push(t.id);
  const qrel = {};
  const minBase = Math.min(...s.teams.map(t => base(t.id)));
  for (const t of s.teams) qrel[t.id] = (base(t.id) - minBase) * 1000;
  for (const o of qualiPt.rows) if (o.rel != null) qrel[o.team.id] = o.rel;
  // each car's gap to the fastest car (ms per lap): race pace if logged, else qualifying pace, else the estimate
  const rows = racePt.rows.length ? racePt.rows : qualiPt.rows;
  const gap = {};
  const floor = Math.max(0, ...rows.filter(o => o.rel != null).map(o => o.rel));
  for (const o of rows) gap[o.team.id] = o.rel ?? floor + 300; // lapped teams sit behind the slowest timed one
  for (const t of s.teams) if (gap[t.id] == null) gap[t.id] = rows.length ? floor + 300 + (base(t.id) - minBase) * 300 : qrel[t.id];
  // expected finish from the gaps, not the ranking: every other car is ahead with a probability that grows with the
  // gap (near level = a coin flip, half a second = almost certain), so a 4th-fastest car 0.04 s off the best is a
  // front-runner and a 5th-fastest car 0.6 s off isn't
  const SPREAD = 60; // 0.1 s a lap over a whole race is decisive: the slower car is ahead only ~16% of the time
  const cars = s.teams.flatMap(t => t.drivers.filter(Boolean).map(() => gap[t.id]));
  const expect = (tid) => {
    const g = gap[tid] ?? floor + 300;
    let sum = 1, self = false;
    for (const gj of cars) { if (!self && gj === g) { self = true; continue; } sum += 1 / (1 + Math.exp(-(g - gj) / SPREAD)); }
    return sum;
  };
  return { rank: (tid) => Math.max(0, order.indexOf(tid)), qrel: (tid) => qrel[tid] ?? 800, gap: (tid) => gap[tid] ?? floor + 300, expect, first, races: use.length };
}
/** Ratings for every driver in round ri, with what drove them: { [id]: { rating, quali, race, finish, grid, expect, over, gained, margin, dnf, reasons } } */
function raceRatings(s, ri) {
  let cache = _ratingCache.get(s);
  if (!cache || cache.gen !== renderGen) { cache = { gen: renderGen, rounds: {} }; _ratingCache.set(s, cache); }
  if (cache.rounds[ri] !== undefined) return cache.rounds[ri];
  const r = activeRounds(s)[ri];
  const ses = s.weekends[r?.id]?.sessions || {};
  if (!ses.R?.done) return (cache.rounds[ri] = null);
  const car = carPaceBefore(s, ri);
  const Q = ses.Q?.done ? ses.Q.results : null;
  const qPole = Q ? Math.min(...Q.map(x => parseLap(x.lap)).filter(v => v != null)) : Infinity;
  const res = ses.R.results;
  // a dominant win: 15 s over a full race distance, in proportion for shorter races (7.5 s at 50%)
  const dominant = 15 * raceLength(s, r.id) / 100;
  const p2gap = res[1] && !OUT.includes(res[1].st) ? (+res[1].laps > 0 || /lap/i.test(res[1].gap || '') ? 60000 : parseDur(res[1].gap)) : null;
  const out = {};
  res.forEach((x, k) => {
    if (x.st === 'DNS') return;
    const team = teamAt(s, x.d, ri);
    const rank = car.rank(team?.id);
    const expect = car.expect(team?.id);
    const carGap = car.gap(team?.id);
    // qualifying against the car
    const qi = Q ? Q.findIndex(y => y.d === x.d) : -1;
    const qx = qi >= 0 ? Q[qi] : null;
    let quali = 6, qDelta = null;
    if (qx && !OUT.includes(qx.st)) {
      const lap = parseLap(qx.lap);
      if (lap != null && isFinite(qPole)) { qDelta = car.qrel(team?.id) - (lap - qPole); quali = 8 + qDelta / 250; }
      else quali = 8 + (expect - (qi + 1)) * 0.3;
    }
    quali = Math.max(4, Math.min(10, quali));
    const grid = qi >= 0 ? qi + 1 : null;
    const finish = k + 1;
    const dnf = OUT.includes(x.st);
    // a retirement in the first race has nothing to rate: there is no separate qualifying rating that day
    if (dnf && car.first) return;
    const gained = grid ? grid - finish : 0;
    let race = null, over = expect - finish, margin = null, rating;
    // a retirement: halfway between 4 and the qualifying score, so 4 to 7
    if (dnf) rating = 4 + (quali - 4) / 2;
    else {
      race = raceScore(finish, expect);
      // the climb counts less when it still ends well below where the car belongs (a top car from the back to P10)
      if (grid && grid > expect + 2) race = Math.max(race, 6.9 + 6.5 * (posValue(finish) - posValue(grid)) - 0.25 * Math.max(0, finish - expect - 3));
      if (finish === 1) {
        margin = p2gap != null ? p2gap / 1000 : null;
        race = Math.max(9, expect >= 4 ? race : 0) + Math.min(1.2, (margin || 0) / dominant);
      }
      // qualifying carries 12%: a perfect lap adds 0.24, the worst takes off 0.48; no lap time (a qualifying DNF) costs nothing
      const qMod = car.first || !qx || OUT.includes(qx.st) ? 0 : (quali - 8) * 0.12;
      rating = race + qMod;
      // outside the top 10 the ceiling is 8, falling 0.1 a place (P11 7.9, P15 7.5)
      if (finish > 10) rating = Math.min(rating, 8.0 - 0.1 * (finish - 11));
    }
    rating = Math.round(Math.max(1, Math.min(10, rating)) * 10) / 10;
    // why: `reasons` for the ratings pages, `pub` for stories, which leave out anything measured against the car
    const reasons = [], pub = [];
    const win = !dnf && finish === 1;
    const by = margin != null && margin >= dominant ? ` by ${margin >= 60 ? 'a lap or more' : margin.toFixed(1) + ' s'}` : '';
    if (win) { reasons.push(`won the race${by}`); pub.push(`won the race${by}`); }
    if (!dnf && gained >= 5) { const t = `gained ${gained} places from ${ordWord(grid)} on the grid`; reasons.push(t); pub.push(t); }
    if (!car.first && qDelta != null && qDelta >= 250) reasons.push(`qualified ${(qDelta / 1000).toFixed(2)} s quicker than the car`);
    else if (!car.first && qDelta != null && qDelta <= -400) reasons.push(`qualified ${(-qDelta / 1000).toFixed(2)} s off the car’s pace`);
    else if (!car.first && qDelta == null && grid && expect - grid >= 4) reasons.push(`qualified ${ordWord(grid)}, well above the car`);
    if (!dnf && !win && finish <= 3) pub.push(`finished ${ordWord(finish)}`);
    if (dnf) reasons.push(`retired, rated on qualifying`);
    out[x.d] = { id: x.d, rating, quali: car.first ? null : Math.round(quali * 10) / 10, race, finish, grid, expect, rank, carGap, over, gained, margin, dnf, reasons, pub, first: car.first, team: team?.id };
  });
  // beaten by the teammate in the race: no higher rating than theirs, unless they started 5+ places further back
  for (const a of Object.values(out)) {
    if (a.dnf) continue;
    const b = Object.values(out).find(y => y !== a && y.team && y.team === a.team && !y.dnf && y.finish < a.finish);
    if (b && a.rating >= b.rating && !(a.grid && b.grid && a.grid - b.grid >= 5)) {
      a.rating = Math.max(1, Math.round((b.rating - 0.2) * 10) / 10);
      a.reasons.push(`finished behind teammate ${lastName(dName(s, b.id))}`);
    }
  }
  return (cache.rounds[ri] = out);
}
/** How much a finishing position is worth, points-like: the front is worth far more than the back. */
const posValue = (p) => Math.exp(-(p - 1) / 7);
/** Race score for finishing `finish` in a car expected to finish `expect`. */
function raceScore(finish, expect) {
  const par = 6.6 + 2.4 * Math.exp(-(expect - 1) / 4);
  // P2 is never below par: in the fastest car, someone has to be second
  const d = posValue(finish) - posValue(Math.max(expect, Math.min(2, finish)));
  // beating the car flattens out (at most +3.3), so a podium in the 3rd-fastest car is a 9.5, not a 10
  const up = d > 0 ? 3.3 * (1 - Math.exp(-11 * d / 3.3)) : 4.5 * d;
  return par + up + 0.05 * (expect - finish);
}
/**
 * Driver of the Day: the best rating among finishers. On a tie, the race winner takes it; otherwise the driver in
 * the slower car does.
 */
function driverOfTheDay(s, ri) {
  const R = raceRatings(s, ri); if (!R) return null;
  const list = Object.values(R).filter(x => !x.dnf).sort((a, b) => b.rating - a.rating || (a.finish === 1 ? -1 : b.finish === 1 ? 1 : b.carGap - a.carGap));
  return list[0] || null;
}
/** Season ratings per driver: average over all rated races and the last five, plus Driver of the Day awards. */
function seasonRatings(s) {
  const rounds = activeRounds(s);
  const by = {}; const dotd = [];
  rounds.forEach((r, ri) => {
    const R = raceRatings(s, ri); if (!R) return;
    for (const x of Object.values(R)) (by[x.id] ||= { id: x.id, list: [] }).list.push({ ri, ...x });
    const d = driverOfTheDay(s, ri); if (d) dotd.push({ ri, r, ...d });
  });
  for (const o of Object.values(by)) {
    o.avg = avg(o.list.map(x => x.rating)); o.last5 = avg(o.list.slice(-5).map(x => x.rating)); o.lastRace = o.list[o.list.length - 1];
    o.dotd = dotd.filter(x => x.id === o.id).length;
  }
  return { by, dotd, rated: dotd.length };
}
/** Season-to-date average ratings after round ri (inclusive). */
function seasonRatingsTo(s, ri) {
  const by = {};
  for (let i = 0; i <= ri; i++) { const R = raceRatings(s, i); if (R) for (const x of Object.values(R)) (by[x.id] ||= []).push(x.rating); }
  return Object.entries(by).map(([id, l]) => ({ id, avg: avg(l), n: l.length }));
}
/* F1 Fan Voice: the ratings, presented as the fans' verdict after every Grand Prix. */
const FAN_VOICE = 'F1 Fan Voice';
const fvMark = (small = false) => `<span class="fv-mark ${small ? 'sm' : ''}"><span class="fv-f1">F1</span><span class="fv-name">FAN VOICE</span></span>`;
/** A ranked list of drivers with photo, team and rating pill. rows: [{ id, rating, sub? }] */
function fvList(c, s, rows, { start = 1 } = {}) {
  return `<ol class="fv-list">${rows.map((x, k) => `<li class="${x.id === PLAYER ? 'me' : ''}" data-act="open-driver" data-id="${x.id}">
    <span class="fv-rank">${k + start}</span>${avatar(c, s, x.id, 36)}
    <span class="fv-who"><b>${esc(dName(s, x.id))}</b><small>${esc(x.sub ?? teamOf(s, x.id)?.name ?? '')}</small></span>
    <span class="fv-score" style="--rc:${ratingColor(x.rating)}">${x.rating.toFixed(1)}</span></li>`).join('')}</ol>`;
}
/** The Fan Voice ratings story for round ri: that race's top 10 and the season's top 10 so far. */
function fanVoiceStory(c, s, ri) {
  const R = raceRatings(s, ri); if (!R) return null;
  const r = activeRounds(s)[ri]; const rnd = seeded(`${s.index}-${r.id}-fv`);
  const race = Object.values(R).sort((a, b) => b.rating - a.rating).slice(0, 10);
  const season = seasonRatingsTo(s, ri).sort((a, b) => b.avg - a.avg).slice(0, 10);
  const top = race[0];
  const lowest = Object.values(R).sort((a, b) => a.rating - b.rating)[0];
  const headline = top.rating >= 9.5 ? choose(rnd, [`Fan Voice: a ${top.rating.toFixed(1)} for ${lastName(dName(s, top.id))} in ${r.name}`, `${r.name} driver ratings: fans can’t look past ${lastName(dName(s, top.id))}`])
    : choose(rnd, [`${r.name} driver ratings: ${lastName(dName(s, top.id))} tops the fan vote`, `Fan Voice ratings: who impressed in ${r.name}?`]);
  return { id: `${s.index}-${r.id}-fv`, seq: ri * 10 + 4, kind: 'ratings', i: ri, r, outlet: FAN_VOICE, kicker: 'Driver Ratings', headline,
    standfirst: `Fans rated every driver out of 10 after the ${r.name} Grand Prix. ${dName(s, top.id)} came out on top with ${top.rating.toFixed(1)}${lowest && lowest.id !== top.id ? `, while ${dName(s, lowest.id)} had the toughest afternoon on ${lowest.rating.toFixed(1)}` : ''}.`,
    body: [], fanVoice: { race: race.map(x => ({ id: x.id, rating: x.rating, sub: `${teamOf(s, x.id)?.name || ''} · ${x.dnf ? 'DNF' : 'P' + x.finish}` })), season: season.map(x => ({ id: x.id, rating: x.avg, sub: `${teamOf(s, x.id)?.name || ''} · ${plural(x.n, 'race')}` })), round: ri } };
}
/** Driver of the Season: most Driver of the Day awards, then the better season rating. */
function driverOfTheSeason(s) {
  const SR = seasonRatings(s);
  const top = Object.values(SR.by).filter(o => o.dotd).sort((a, b) => b.dotd - a.dotd || b.avg - a.avg)[0];
  return top ? { ...top, final: roundsDone(s) === activeRounds(s).length, SR } : null;
}
const ratingColor = (v) => v >= 9 ? 'var(--purple)' : v >= 8 ? 'var(--green)' : v >= 6.5 ? 'var(--fg)' : v >= 5 ? 'var(--yellow)' : 'var(--red)';

/* ------------------------------------------------------------ race memory */
/**
 * What the paddock remembers going into round ri: the defending champion, who won and took pole last time out,
 * and every driver's current run of wins, podiums, poles, points finishes and Driver of the Day awards.
 */
function raceMemory(c, s, ri) {
  const rounds = activeRounds(s);
  const prev = c.seasons[s.index - 1];
  let defending = null;
  if (prev && roundsDone(prev) === activeRounds(prev).length) defending = driverStandings(prev)[0]?.id || null;
  if (!defending) defending = Object.entries(D.DRIVER_BIO).find(([, b]) => b.titles?.includes(s.year - 1))?.[0] || null;
  const runs = {}; const get = (id) => runs[id] ||= { wins: 0, podiums: 0, poles: 0, points: 0, dotd: 0 };
  let lastWinner = null, lastPole = null, lastRound = null, lastDotd = null;
  for (let i = 0; i < ri; i++) {
    const ses = s.weekends[rounds[i].id]?.sessions || {};
    if (ses.Q?.done) {
      const pole = ses.Q.results.find(x => !OUT.includes(x.st))?.d;
      for (const x of ses.Q.results) { const o = get(x.d); o.poles = x.d === pole ? o.poles + 1 : 0; }
      lastPole = pole;
    }
    if (!ses.R?.done) continue;
    const d = driverOfTheDay(s, i)?.id;
    ses.R.results.forEach((x, k) => {
      const o = get(x.d); const fin = !OUT.includes(x.st);
      o.wins = fin && k === 0 ? o.wins + 1 : 0;
      o.podiums = fin && k < 3 ? o.podiums + 1 : 0;
      o.points = fin && k < 10 ? o.points + 1 : 0;
      o.dotd = x.d === d ? o.dotd + 1 : 0;
    });
    lastWinner = ses.R.results.find(x => !OUT.includes(x.st))?.d || null; lastRound = rounds[i]; lastDotd = d || null;
  }
  return { defending, lastWinner, lastPole, lastRound, lastDotd, run: (id) => runs[id] || { wins: 0, podiums: 0, poles: 0, points: 0, dotd: 0 } };
}
const streakWord = (n) => numWord(n) === String(n) ? String(n) : numWord(n);

/* ---------------------------------------------------------- dates & ages */
const DAY = 86400000;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const utc = (y, m, d) => new Date(Date.UTC(y, m - 1, d));
const parseDay = (str) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str || ''); return m ? utc(+m[1], +m[2], +m[3]) : null; };
const fmtDay = (d, year = false) => d ? `${d.getUTCDate()} ${MON[d.getUTCMonth()]}${year ? ' ' + d.getUTCFullYear() : ''}` : '';
/** Race day of every round: the real calendar in 2025 and 2026, the same weekend in later years. */
function raceDates(s) {
  const out = {}; let prev = null;
  for (const r of activeRounds(s)) {
    let d = null;
    const real = r.date ? r.date.slice(5) : D.RACE_DATES[s.year]?.[r.id];
    if (real) { const [m, dd] = real.split('-').map(Number); d = utc(s.year, m, dd); }
    else {
      const tpl = D.RACE_DATES[2026][r.id] || D.RACE_DATES[2025][r.id];
      if (tpl) {
        const [m, dd] = tpl.split('-').map(Number);
        d = utc(s.year, m, dd);
        const want = D.SATURDAY_RACES.includes(r.id) ? 6 : 0;
        let diff = (want - d.getUTCDay() + 7) % 7; if (diff > 3) diff -= 7;
        d = new Date(d.getTime() + diff * DAY);
      }
    }
    // a reordered calendar keeps its order: never earlier than the round before
    if (!d || (prev && d <= prev)) d = new Date((prev ? prev.getTime() : utc(s.year, 3, 1).getTime()) + 7 * DAY);
    out[r.id] = d; prev = d;
  }
  return out;
}
const _dateCache = new WeakMap();
function roundDate(s, r) {
  let v = _dateCache.get(s);
  if (!v || v.gen !== renderGen) { v = { gen: renderGen, d: raceDates(s) }; _dateCache.set(s, v); }
  return r ? v.d[r.id] || null : null;
}
/** "14–16 Mar 2025": Friday to race day (Thursday to Saturday for a Saturday race). */
function weekendTxt(s, r) {
  const d = roundDate(s, r); if (!d) return '';
  const a = new Date(d.getTime() - 2 * DAY);
  return `${a.getUTCMonth() === d.getUTCMonth() ? a.getUTCDate() : fmtDay(a)}–${fmtDay(d)} ${d.getUTCFullYear()}`;
}
function bornOf(c, id) {
  if (id === PLAYER_ID) return c.profile.born || null;
  const cd = c.customDrivers?.find(x => x.id === id) || c.generated?.[id];
  return cd ? cd.born || null : D.DRIVER_BIO[id]?.born || null;
}
function ageParts(born, date) {
  const b = typeof born === 'string' ? parseDay(born) : born;
  if (!b || !date) return null;
  const by = b.getUTCFullYear(), bm = b.getUTCMonth() + 1, bd = b.getUTCDate();
  let y = date.getUTCFullYear() - by;
  let last = utc(by + y, bm, bd);
  if (last > date) { y--; last = utc(by + y, bm, bd); }
  return { y, d: Math.round((date - last) / DAY), days: Math.round((date - b) / DAY) };
}
const ageTxt = (a) => a ? `${a.y}y ${a.d}d` : '–';
/** The career's "today": the latest race logged, or the opening race if none is. */
function careerNow(c) {
  const s = c.seasons[c.seasons.length - 1]; const rs = activeRounds(s);
  const done = rs.filter(r => s.weekends[r.id]?.sessions?.R?.done);
  return roundDate(s, done[done.length - 1] || rs[0]);
}
const ageNow = (c, id) => ageParts(bornOf(c, id), careerNow(c))?.y ?? null;

/* ------------------------------------------------- records & milestones */
const WIN_MS = (n) => n === 1 || n % 10 === 0 || n % 25 === 0;
const _tlCache = new WeakMap();
function careerTimeline(c) {
  let v = _tlCache.get(c);
  if (!v || v.gen !== renderGen) { v = { gen: renderGen, tl: buildTimeline(c) }; _tlCache.set(c, v); }
  return v.tl;
}
/**
 * Replays the whole career in date order, starting from each driver's and team's real record at the
 * start of 2025. Produces the live record book and a list of milestones and records set along the way.
 */
function buildTimeline(c) {
  const known = allKnownDrivers(c, c.seasons[c.seasons.length - 1]);
  const nameOf = (id) => id === PLAYER_ID ? `${c.profile.first} ${c.profile.last}` : known[id]?.name || id;
  const teamRoot = (id) => D.TEAM_BIO[id]?.lineage?.[0] || id;
  const recs = {};
  for (const R of D.RECORDS) {
    const holders = R.holders.map(h => ({ ...h, id: h.key, real: true, disp: h.born ? ageTxt(ageParts(h.born, parseDay(h.date))) : null }));
    const value = R.group === 'age' ? (holders[0] ? ageParts(holders[0].born, parseDay(holders[0].date)).days : null) : R.value;
    recs[R.id] = { ...R, cmp: R.group === 'age' && !R.max ? 'min' : 'max', value, holders, start: { value, holders: holders.map(h => ({ ...h })) } };
  }
  const events = [];
  const P = {};
  const getP = (id) => P[id] ||= (() => {
    const b = id === PLAYER_ID ? null : D.DRIVER_BIO[id];
    return { starts: b?.starts || 0, wins: b?.wins || 0, podiums: b?.podiums || 0, poles: b?.poles || 0, fls: b?.fls || 0, pts: b?.pts || 0, titles: b?.titles?.length || 0, lastTitle: b?.titles?.slice(-1)[0] ?? null,
      titleStreak: D.STREAKS_2025.titleStreak[id] || 0, winStreak: 0, podStreak: 0, poleStreak: 0, ptsStreak: 0, scored: (b?.pts || 0) > 0, from: {} };
  })();
  const T = {};
  const getT = (id) => T[teamRoot(id)] ||= (() => { const b = D.TEAM_BIO[teamRoot(id)]; return { wins: b?.wins || 0, titles: b?.conTitles?.length || 0, lastTitle: b?.conTitles?.slice(-1)[0] ?? null, streak: D.STREAKS_2025.teamStreak[teamRoot(id)] || 0 }; })();
  const spanFrom = (p, key, where) => p.from[key] && p.from[key] !== where.when ? `${p.from[key]} to ${where.when}` : where.when;
  function bump(rid, id, value, where, { team = null, disp = null, when = null } = {}) {
    const R = recs[rid]; if (value == null) return;
    const better = R.value == null || (R.cmp === 'max' ? value > R.value : value < R.value);
    const holder = { id, name: team ? team.name : nameOf(id), team: !!team, when: when || where.when, disp, career: !where.hist, real: !!where.hist, seasonIdx: where.seasonIdx };
    if (better) {
      const self = R.holders.length === 1 && R.holders[0].id === id;
      if (!self) events.push({ type: 'record', kind: 'broken', rid, id, team, value, disp, prev: { value: R.value, holders: R.holders.map(h => ({ ...h })) }, ...where });
      if (self && R.group === 'total') {
        // a holder adding to their own record keeps it: show the span, and only tag it if it was set in the career
        const old = R.holders[0]; const since = old.since || /^(\d{4})/.exec(old.when || '')?.[1];
        Object.assign(holder, { real: old.real, career: old.career, since });
        if (since) holder.when = since === String(where.year) ? since : `${since}–${where.year}`;
      }
      R.value = value; R.holders = [holder];
    } else if (value === R.value && !R.holders.some(h => h.id === id)) {
      events.push({ type: 'record', kind: 'equalled', rid, id, team, value, disp, prev: { value: R.value, holders: R.holders.map(h => ({ ...h })) }, ...where });
      R.holders.push(holder);
    }
  }
  for (const s of c.seasons) {
    const rounds = activeRounds(s);
    const done = rounds.filter(r => s.weekends[r.id]?.sessions?.R?.done).length;
    const complete = done > 0 && done === rounds.length;
    const fh = fightHistory(s, 'driver'), fht = fightHistory(s, 'team');
    const final = complete ? titleMath(s, 'driver', rounds.length) : null;
    const finalT = complete ? titleMath(s, 'team', rounds.length) : null;
    const champ = fh.decidedAt ? { i: fh.decidedAt.i, id: fh.decidedAt.champion.id } : complete ? { i: rounds.length - 1, id: final.rows[0].id } : null;
    const champT = fht.decidedAt ? { i: fht.decidedAt.i, id: fht.decidedAt.champion.id } : complete ? { i: rounds.length - 1, id: finalT.rows[0].id } : null;
    const SS = {}; const sget = (id) => SS[id] ||= { wins: 0, pods: 0, poles: 0, pts: 0 };
    const teamWins = {};
    rounds.forEach((r, ri) => {
      const ses = s.weekends[r.id]?.sessions; if (!ses) return;
      const date = roundDate(s, r);
      const where = { seasonIdx: s.index, hist: isHist(s), ri, r, date, year: s.year, when: `${s.year} ${r.name} GP` };
      const ms = [];
      const age = (id, d = date) => ageParts(bornOf(c, id), d);
      const mile = (id, text, rank = 1) => ms.push({ id, text, rank });
      const addPts = (id, pts) => {
        if (!pts) return;
        const p = getP(id); const before = p.pts;
        p.pts += pts; sget(id).pts += pts;
        if (!p.scored) { p.scored = true; mile(id, `${nameOf(id)} scores ${pts > 1 ? 'first F1 points' : 'a first F1 point'}`, 3); const a = age(id); if (a) bump('youngPoints', id, a.days, where, { disp: ageTxt(a) }); }
        else if (Math.floor(before / 500) < Math.floor(p.pts / 500)) mile(id, `${nameOf(id)} passes ${Math.floor(p.pts / 500) * 500} career points`, 1);
        bump('pts', id, p.pts, where); bump('seasonPts', id, sget(id).pts, where, { when: String(s.year) });
      };
      if (ses.Q?.done) {
        const qd = new Date(date.getTime() - DAY);
        const pole = ses.Q.pole ?? ses.Q.results.find(x => !OUT.includes(x.st))?.d;
        for (const x of ses.Q.results) if (x.d !== pole && !OUT.includes(x.st)) getP(x.d).poleStreak = 0;
        if (pole) {
          const p = getP(pole); p.poles++; sget(pole).poles++;
          if (!p.poleStreak) p.from.pole = where.when;
          p.poleStreak++;
          if (p.poles === 1) { mile(pole, `${nameOf(pole)} takes a first pole position`, 4); const a = age(pole, qd); if (a) bump('youngPole', pole, a.days, where, { disp: ageTxt(a) }); }
          else if (p.poles % 10 === 0) mile(pole, `${nameOf(pole)} takes a ${ordWord(p.poles)} career pole`, 2);
          bump('poles', pole, p.poles, where); bump('poleStreak', pole, p.poleStreak, where, { when: spanFrom(p, 'pole', where) }); bump('seasonPoles', pole, sget(pole).poles, where, { when: String(s.year) });
        }
      }
      if (ses.SPR?.done) ses.SPR.results.forEach((x, k) => addPts(x.d, pointsFor('SPR', k + 1, x.st, x.pts)));
      if (ses.R?.done) {
        const fl = fastestOf(ses.R);
        ses.R.results.forEach((x, k) => {
          if (x.st === 'DNS') return;
          const id = x.d; const p = getP(id); const pos = k + 1; const out = OUT.includes(x.st);
          const pts = pointsFor('R', pos, x.st, x.pts);
          p.starts++;
          if (p.starts === 1) { const a = age(id); mile(id, `${nameOf(id)} makes a Formula 1 debut${a ? ` aged ${a.y}` : ''}`, 3); if (a) bump('youngStart', id, a.days, where, { disp: ageTxt(a) }); }
          else if (p.starts % 50 === 0) mile(id, `${nameOf(id)} starts a ${ordWord(p.starts)} Grand Prix`, 2);
          bump('starts', id, p.starts, where);
          addPts(id, pts);
          if (pts > 0) { if (!p.ptsStreak) p.from.pts = where.when; p.ptsStreak++; bump('ptsStreak', id, p.ptsStreak, where, { when: spanFrom(p, 'pts', where) }); } else p.ptsStreak = 0;
          if (!out && pos <= 3) {
            p.podiums++; sget(id).pods++;
            if (!p.podStreak) p.from.pod = where.when;
            p.podStreak++;
            if (p.podiums === 1) { mile(id, `${nameOf(id)} stands on an F1 podium for the first time`, 4); const a = age(id); if (a) bump('youngPodium', id, a.days, where, { disp: ageTxt(a) }); }
            else if (p.podiums % 25 === 0) mile(id, `${nameOf(id)} scores a ${ordWord(p.podiums)} career podium`, 2);
            bump('podiums', id, p.podiums, where); bump('podStreak', id, p.podStreak, where, { when: spanFrom(p, 'pod', where) }); bump('seasonPods', id, sget(id).pods, where, { when: String(s.year) });
          } else p.podStreak = 0;
          if (!out && pos === 1) {
            p.wins++; sget(id).wins++;
            if (!p.winStreak) p.from.win = where.when;
            p.winStreak++;
            const a = age(id);
            if (WIN_MS(p.wins)) mile(id, p.wins === 1 ? `${nameOf(id)} wins a Grand Prix for the first time${a ? `, aged ${a.y}` : ''}` : `${nameOf(id)} takes a ${ordWord(p.wins)} Grand Prix win`, p.wins === 1 ? 5 : 2);
            if (a) { bump('youngWin', id, a.days, where, { disp: ageTxt(a) }); bump('oldWin', id, a.days, where, { disp: ageTxt(a) }); }
            bump('wins', id, p.wins, where); bump('winStreak', id, p.winStreak, where, { when: spanFrom(p, 'win', where) }); bump('seasonWins', id, sget(id).wins, where, { when: String(s.year) });
            const t = teamOf(s, id);
            if (t) {
              const tt = getT(t.id); tt.wins++; teamWins[t.id] = (teamWins[t.id] || 0) + 1;
              if (tt.wins === 1) mile(id, `${t.name} win a Grand Prix for the first time`, 4);
              else if (tt.wins % 50 === 0) mile(id, `${t.name} take a ${ordWord(tt.wins)} Grand Prix win`, 2);
              bump('teamWins', t.id, tt.wins, where, { team: t }); bump('teamSeasonWins', t.id, teamWins[t.id], where, { team: t, when: String(s.year) });
            }
          } else p.winStreak = 0;
          if (p.wins === 0) bump('winless', id, p.starts, where);
        });
        if (fl) { const p = getP(fl); p.fls++; bump('fls', fl, p.fls, where); }
      }
      if (champ && champ.i === ri) {
        const id = champ.id; const p = getP(id);
        p.titleStreak = p.lastTitle === s.year - 1 ? p.titleStreak + 1 : 1; p.titles++; p.lastTitle = s.year;
        const a = age(id);
        mile(id, p.titles === 1 ? `${nameOf(id)} becomes world champion for the first time${a ? `, aged ${a.y}` : ''}` : `${nameOf(id)} wins a ${ordWord(p.titles)} world title`, 6);
        bump('titles', id, p.titles, where, { when: String(s.year) }); bump('titleStreak', id, p.titleStreak, where, { when: `${s.year - p.titleStreak + 1}–${s.year}` });
        if (a) { if (p.titles <= 8) bump('youngTitle' + p.titles, id, a.days, where, { disp: ageTxt(a), when: String(s.year) }); bump('oldTitle', id, a.days, where, { disp: ageTxt(a), when: String(s.year) }); }
      }
      if (champT && champT.i === ri) {
        const t = s.teams.find(x => x.id === champT.id); const tt = getT(champT.id);
        tt.streak = tt.lastTitle === s.year - 1 ? tt.streak + 1 : 1; tt.titles++; tt.lastTitle = s.year;
        bump('teamTitles', t.id, tt.titles, where, { team: t, when: String(s.year) }); bump('teamStreak', t.id, tt.streak, where, { team: t, when: `${s.year - tt.streak + 1}–${s.year}` });
      }
      if (complete && ri === rounds.length - 1) {
        if (final.rows[1]) bump('titleMargin', final.rows[0].id, final.margin, where, { when: String(s.year) });
        for (const [id, o] of Object.entries(SS)) if (o.wins) bump('seasonWinPct', id, Math.round(o.wins / rounds.length * 1000) / 10, where, { when: `${s.year}, ${o.wins} of ${rounds.length}` });
      }
      if (ms.length) events.push({ type: 'milestones', items: ms.sort((a, b) => b.rank - a.rank), ...where });
    });
  }
  return { recs, events, P, T, nameOf };
}
const recVal = (R, h) => R.group === 'age' ? (h?.disp || '–') : R.value == null ? '–' : R.pct ? `${R.value.toFixed(1)}%` : fmtPts(R.value);

const REC_GROUPS = [['age', 'Age records', 'Ages on the day: race day, or the Saturday for a pole.'], ['total', 'Career totals', 'Real totals up to 2024 keep counting through your career.'], ['streak', 'Streaks', 'Runs of consecutive races (or seasons) entered.'], ['season', 'In a single season', ''], ['team', 'Constructors', '']];
// what each total/streak record counts, to find who on the grid is closest
const REC_STAT = { titles: 'titles', wins: 'wins', poles: 'poles', podiums: 'podiums', starts: 'starts', pts: 'pts', fls: 'fls', winStreak: 'winStreak', podStreak: 'podStreak', poleStreak: 'poleStreak', ptsStreak: 'ptsStreak' };
function renderRecords() {
  const c = career(); const s = latestSeason();
  const tl = careerTimeline(c);
  const grid = gridIds(s);
  const holderHtml = (h) => `<div class="drv">${h.team ? teamLogo(c, s.teams.find(t => t.id === h.id) || teamMeta(c, h.id), 22) : grid.includes(h.id) || tl.P[h.id] ? avatar(c, s, h.id, 24) : ''}<span class="nm"><b>${esc(h.name)}</b></span>${h.career ? ' <span class="tag done">Career</span>' : ''}</div>`;
  const chase = (R) => {
    const key = REC_STAT[R.id];
    if (R.group === 'team' && (R.id === 'teamWins' || R.id === 'teamTitles')) {
      const k = R.id === 'teamWins' ? 'wins' : 'titles';
      const teamVal = (t) => {
        const root = D.TEAM_BIO[t.id]?.lineage?.[0] || t.id;
        if (tl.T[root]) return tl.T[root][k];
        return k === 'wins' ? D.TEAM_BIO[root]?.wins || 0 : D.TEAM_BIO[root]?.conTitles?.length || 0;
      };
      const best = s.teams.map(t => ({ t, v: teamVal(t) })).filter(x => !R.holders.some(h => h.id === x.t.id)).sort((a, b) => b.v - a.v)[0];
      return best ? `${esc(best.t.name)} <b>${best.v}</b>` : '–';
    }
    if (!key && R.id !== 'winless') return '–';
    const val = (id) => {
      const p = tl.P[id] || (D.DRIVER_BIO[id] ? { ...D.DRIVER_BIO[id], titles: D.DRIVER_BIO[id].titles?.length || 0, winStreak: 0, podStreak: 0, poleStreak: 0, ptsStreak: 0 } : null);
      if (!p) return null;
      return R.id === 'winless' ? (p.wins ? null : p.starts) : p[key];
    };
    const best = grid.filter(id => !R.holders.some(h => h.id === id)).map(id => ({ id, v: val(id) })).filter(x => x.v).sort((a, b) => b.v - a.v)[0];
    return best ? `${esc(tl.nameOf(best.id))} <b>${fmtPts(best.v)}</b>` : '–';
  };
  const broken = tl.events.filter(e => e.type === 'record' && !e.hist);
  return `<div class="page">
    <div class="page-head"><div><h1>Records</h1><div class="sub">The F1 record book: real records up to ${firstPlayed(c).year - 1}, then updated by every session in your career. Records set in your career are tagged.</div></div></div>
    <div class="tiles">
      <div class="tile"><span class="label">Records tracked</span><span class="v">${D.RECORDS.length}</span></div>
      <div class="tile"><span class="label">Broken in career</span><span class="v">${broken.filter(e => e.kind === 'broken').length}</span></div>
      <div class="tile"><span class="label">Equalled</span><span class="v">${broken.filter(e => e.kind === 'equalled').length}</span></div>
      <div class="tile"><span class="label">Held by you</span><span class="v">${Object.values(tl.recs).filter(R => R.holders.some(h => h.id === PLAYER)).length}</span></div>
      <div class="tile"><span class="label">${isPrincipal(c) ? 'Lead driver’s age' : 'Your age'}</span><span class="v" style="font-size:22px">${bornOf(c, PLAYER) ? ageTxt(ageParts(bornOf(c, PLAYER), careerNow(c))) : '–'}</span><span class="muted" style="font-size:12px">${bornOf(c, PLAYER) ? 'at the latest race' : 'Add a date of birth in Settings'}</span></div>
      <div class="tile"><span class="label">Career date</span><span class="v" style="font-size:22px">${fmtDay(careerNow(c), true)}</span></div>
    </div>
    ${REC_GROUPS.map(([g, title, note]) => `<div class="panel"><div class="panel-h"><h2>${title}</h2>${note ? `<span class="muted" style="font-size:12px">${note}</span>` : ''}</div><div class="panel-b tight table-wrap"><table>
      <thead><tr><th>Record</th><th>Holder</th><th class="num">${g === 'age' ? 'Age' : 'Record'}</th><th>Set</th><th>${g === 'age' || g === 'season' ? '' : 'Closest on the grid'}</th></tr></thead>
      <tbody>${D.RECORDS.filter(R => R.group === g).map(R0 => { const R = tl.recs[R0.id]; return `<tr class="${R.holders.some(h => h.id === PLAYER) ? 'me' : ''}">
        <td><b>${esc(R.label[0].toUpperCase() + R.label.slice(1))}</b></td>
        <td>${R.holders.length ? R.holders.map(holderHtml).join('') : '<span class="muted">Nobody yet</span>'}</td>
        <td class="num"><b>${R.holders.length ? (g === 'age' ? R.holders.map(h => esc(h.disp || '–')).join('<br>') : recVal(R)) : '–'}</b></td>
        <td class="muted">${R.holders.map(h => esc(h.when || '')).join('<br>')}</td>
        <td class="muted">${g === 'age' || g === 'season' ? '' : chase(R)}</td></tr>`; }).join('')}</tbody>
    </table></div></div>`).join('')}
    <div class="panel"><div class="panel-h"><h2>Records set in your career</h2></div>
      ${broken.length ? `<div class="panel-b tight table-wrap"><table><thead><tr><th>When</th><th>Record</th><th>By</th><th class="num">Mark</th><th>Previous</th></tr></thead><tbody>
        ${broken.slice().reverse().map(e => { const R = tl.recs[e.rid]; return `<tr><td class="muted">${esc(e.when)}<div style="font-size:12px">${fmtDay(e.date, true)}</div></td><td>${esc(R.label[0].toUpperCase() + R.label.slice(1))} <span class="tag ${e.kind === 'broken' ? 'next' : ''}">${e.kind}</span></td>
          <td><b>${esc(e.team ? e.team.name : tl.nameOf(e.id))}</b></td><td class="num">${R.group === 'age' ? esc(e.disp) : R.pct ? e.value.toFixed(1) + '%' : fmtPts(e.value)}</td>
          <td class="muted">${esc(listJoin(e.prev.holders.filter(h => h.id !== e.id).map(h => h.name)) || '–')}</td></tr>`; }).join('')}</tbody></table></div>`
      : '<div class="empty">No records broken yet. They will appear here, and in Stories, as your career writes them.</div>'}
    </div>
  </div>`;
}

/* -------------------------------------------------------------- rivalries */
// Title rivals: from the sixth race, anyone within 25 points of the championship leader (43 for constructors) is his
// title rival. The rivalry cools as the gap grows and is over at 75 points (129 for constructors), or as soon as the
// chaser can no longer win the title; it can flare up again. Rivalries aren't won, they just fade.
// Archrivals: title rivals for 70% of a season's rounds. Each driver (and team) has at most one: a new pair takes over
// only if they were closer, on average, than both of their current archrivalries. An archrivalry ends when one of the
// two retires (or leaves the grid, for a team), and the retirement story looks back on it.
// Manual rivalries: started from Stories after contact, a crash or hard racing. They run for the next five races.
const RIVAL_BANDS = { driver: { on: 25, off: 75 }, team: { on: 43, off: 129 } };
const ARCH_SHARE = 0.7, FEUD_RACES = 5;
const pairKey = (a, b) => a < b ? `${a}|${b}` : `${b}|${a}`;
/** A team's lasting identity (Audi carries Sauber's), so a renamed team keeps its rivalries. */
const teamRoot = (id) => D.TEAM_BIO[id]?.lineage?.[0] || id;
/** How heated a title rivalry is, 0 to 1: the closer the points, the hotter. */
const rivalHeat = (kind, gap) => Math.max(0, Math.min(1, 1 - gap / RIVAL_BANDS[kind].off));
const _rivCache = new WeakMap();
function rivalries(c) {
  let v = _rivCache.get(c);
  if (!v || v.gen !== renderGen) { v = { gen: renderGen, r: buildRivalries(c) }; _rivCache.set(c, v); }
  return v.r;
}
/**
 * Replay every season round by round. Returns { at: { 'season:round' | 'season:end' → { active, arch } }, events,
 * seasons }: the title rivalries live after each round (with how close they are) and who is whose archrival.
 */
const _rivBase = new WeakMap();
function buildRivalries(c) {
  // real and simulated seasons never change: replay them once per career, then only the seasons you play
  const n = c.seasons.filter(isHist).length;
  let base = _rivBase.get(c);
  if (!base || base.n !== n) { base = { n, st: replayRivalries(c, c.seasons.slice(0, n), null) }; _rivBase.set(c, base); }
  return replayRivalries(c, c.seasons.slice(n), base.st).out;
}
/** Replay these seasons, carrying on from a previous replay's state (or from nothing). */
function replayRivalries(c, seasons, from) {
  const copy = (m) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, { ...v }]));
  const arch = from ? { driver: copy(from.arch.driver), team: copy(from.arch.team) } : { driver: {}, team: {} };
  const out = from ? { at: { ...from.out.at }, events: [...from.out.events], seasons: { ...from.out.seasons } } : { at: {}, events: [], seasons: {} };
  // when each driver's retirement was announced (the season it goes on record in)
  const retiredIn = {};
  for (const s of c.seasons) for (const tr of s.transfers || []) for (const st of tr.steps) if (st.to === 'retire' && retiredIn[st.driver] == null) retiredIn[st.driver] = s.index;
  const raced = from ? { ...from.raced } : {}; // driver -> last season index raced
  const snap = () => ({ driver: { ...arch.driver }, team: { ...arch.team } });
  for (const s of seasons) {
    const rounds = activeRounds(s); const N = rounds.length; const need = Math.ceil(N * ARCH_SHARE); const si = s.index;
    // archrivals who have gone: a retirement on record before this season, three seasons away, or a team off the grid
    const grid = new Set(gridIds(s)); const roots = new Set(s.teams.map(t => teamRoot(t.id)));
    for (const [id, a] of Object.entries(arch.driver)) {
      const goneNow = !grid.has(id) && ((retiredIn[id] != null && retiredIn[id] < si) || (raced[id] != null && si - raced[id] > 3));
      if (goneNow && arch.driver[id]) { out.events.push({ type: 'archGone', kind: 'driver', id, rival: a.rival, si, since: a }); delete arch.driver[a.rival]; delete arch.driver[id]; }
    }
    for (const [id, a] of Object.entries(arch.team)) if (!roots.has(id) && arch.team[id]) { delete arch.team[a.rival]; delete arch.team[id]; }
    const st = { driver: {}, team: {} }; out.seasons[si] = st;
    let last = null;
    for (let i = 0; i < N; i++) {
      if (!s.weekends[rounds[i].id]?.sessions?.R?.done) break;
      const active = [];
      if (i >= 4) for (const kind of ['driver', 'team']) {
        const B = RIVAL_BANDS[kind]; const m = titleMath(s, kind, i + 1); const L = m.rows[0]; if (!L) continue;
        const idOf = (x) => kind === 'team' ? teamRoot(x.id) : x.id;
        const lead = idOf(L); const live = new Set();
        for (const x of m.rows.slice(1)) {
          const id = idOf(x); const key = pairKey(lead, id); const gap = L.pts - x.pts;
          let p = st[kind][key];
          if (!x.alive || m.decided || gap >= B.off) continue;
          if (!p?.active && gap <= B.on) {
            p = st[kind][key] ||= { kind, a: lead, b: id, rounds: 0, gaps: [], arch: false, stints: 0 };
            p.active = true; p.stints++; p.band = null; p.a = lead; p.b = id;
            out.events.push({ type: 'start', kind, a: lead, b: id, gap, si, ri: i, rematch: arch[kind][lead]?.rival === id ? { ...arch[kind][lead] } : null, again: p.stints > 1 });
          }
          if (!p?.active) continue;
          live.add(key); p.rounds++; p.gaps.push(gap); p.a = lead; p.b = id;
          active.push({ kind, a: lead, b: id, gap, heat: rivalHeat(kind, gap) });
          // turning points: right on each other's tail, or drifting apart
          const band = gap <= B.on * 0.4 ? 'hot' : gap >= B.off * 0.66 ? 'cool' : 'mid';
          if (band !== p.band) { if (p.band && band !== 'mid') out.events.push({ type: band, kind, a: lead, b: id, gap, si, ri: i }); p.band = band; }
        }
        for (const p of Object.values(st[kind])) if (p.active && !live.has(pairKey(p.a, p.b))) {
          p.active = false;
          if (!m.decided) out.events.push({ type: 'end', kind, a: p.a, b: p.b, si, ri: i, gap: (m.rows.find(x => idOf(x) === p.a)?.pts ?? 0) - (m.rows.find(x => idOf(x) === p.b)?.pts ?? 0) });
        }
        // archrivals: rivals for 70% of the season; with several at once, the closest in the championship first
        const pos = Object.fromEntries(m.rows.map(x => [idOf(x), x.pos]));
        const ready = Object.values(st[kind]).filter(p => !p.arch && p.rounds >= need).sort((a, b) => Math.abs(pos[a.a] - pos[a.b]) - Math.abs(pos[b.a] - pos[b.b]) || avg(a.gaps) - avg(b.gaps));
        for (const p of ready) {
          p.arch = true; const g = avg(p.gaps);
          const A = arch[kind][p.a], Bq = arch[kind][p.b];
          if (A?.rival === p.b) { A.avg = Math.min(A.avg, g); Bq.avg = A.avg; continue; } // the same two again
          if ((A && g >= A.avg) || (Bq && g >= Bq.avg)) continue; // an older archrivalry was closer
          const replaced = [];
          for (const [me, old] of [[p.a, A], [p.b, Bq]]) if (old) { replaced.push({ id: me, old: old.rival, year: old.year }); delete arch[kind][old.rival]; }
          arch[kind][p.a] = { rival: p.b, si, year: s.year, avg: g, ri: i };
          arch[kind][p.b] = { rival: p.a, si, year: s.year, avg: g, ri: i };
          out.events.push({ type: 'arch', kind, a: p.a, b: p.b, si, ri: i, rounds: p.rounds, of: N, replaced });
        }
      }
      for (const [d, o] of Object.entries(seasonStatsCache(s))) if (o.byRound[rounds[i].id]?.r != null) raced[d] = si;
      last = out.at[`${si}:${i}`] = { active, arch: snap() };
    }
    out.at[`${si}:end`] = last || { active: [], arch: snap() };
  }
  return { arch, out, raced };
}
/** Rivalry state after round ri of season s (ri < 0: before the season). */
/** Your archrival (a driver id), or your team's archrival team (a team in s), from the rivalry system. */
function archRivalOf(c, s, ri = roundsDone(s) - 1) { return rivalsAt(c, s, ri).arch.driver[PLAYER]?.rival || null; }
function archRivalTeam(c, s, ri = roundsDone(s) - 1) {
  const root = s.playerTeamId && rivalsAt(c, s, ri).arch.team[teamRoot(s.playerTeamId)]?.rival;
  return root ? s.teams.find(t => teamRoot(t.id) === root) || null : null;
}
function rivalsAt(c, s, ri) {
  const R = rivalries(c);
  for (let i = ri; i >= 0; i--) if (R.at[`${s.index}:${i}`]) return R.at[`${s.index}:${i}`];
  const prev = c.seasons[s.index - 1];
  return (prev && R.at[`${prev.index}:end`]) || { active: [], arch: { driver: {}, team: {} } };
}
/** The season two archrivals became archrivals: who finished ahead, and whether it decided the title. */
function archSeason(c, kind, a, b, year) {
  const s = c.seasons.find(x => x.year === year); if (!s) return null;
  const st = seasonStatsCache(s);
  const rows = kind === 'team' ? constructorStandings(s, st).map(x => ({ id: teamRoot(x.team.id), pts: x.pts, pos: x.pos })) : driverStandings(s, st).map(x => ({ id: x.id, pts: x.pts, pos: x.pos }));
  const A = rows.find(x => x.id === a), B = rows.find(x => x.id === b); if (!A || !B) return null;
  const [w, l] = A.pos < B.pos ? [A, B] : [B, A];
  const complete = roundsDone(s) === activeRounds(s).length;
  return { s, year, winner: w.id, loser: l.id, margin: w.pts - l.pts, title: complete && w.pos === 1, complete };
}

/* What the press and the paddock say about title rivals, by how close it is. */
const RIVAL_QUOTES = {
  lead: { low: ['We just have to keep doing our thing. The points are the points.', 'I don’t look at the gap. I look at the next race.'],
    mid: ['They are quick, we know that. We can’t afford a weekend off.', 'It’s a proper fight now. Every point matters.'],
    high: ['It’s going to go down to the wire, I can feel it.', 'Nobody gives you a title. We will have to take it.', 'There’s no room for mistakes now, from either of us.'] },
  chase: { low: ['There are a lot of races left. We keep chipping away.', 'We are not out of it. Not even close.'],
    mid: ['The gap is coming down and they know it.', 'We have the pace. Now we need the results.'],
    high: ['The pressure is on them now, not us.', 'I didn’t come here to finish second.', 'Every weekend is a final from here.'] },
  boss: { low: ['We focus on our own job. The championship looks after itself.', 'It’s early to talk about rivals.'],
    mid: ['They are strong, but so are we. It will be close.', 'We have a plan for the rest of the season and we stick to it.'],
    high: ['This is what we exist for. A fight like this, all the way to the end.', 'Whoever makes the fewest mistakes wins this. We intend to be that team.'] },
};
const heatTier = (h) => h >= 0.8 ? 'high' : h >= 0.55 ? 'mid' : 'low';
/** Principal of a team for a quote: the real one where Pitwall knows them, yours for My Team. */
const principalOf = (c, tid) => tid === MYTEAM ? c.myTeam?.principal || `${c.profile.first} ${c.profile.last}` : D.TEAM_BIO[tid]?.principal || null;

/** The rivalry stories of season s: title rivals forming, heating up and fading, archrivals, and your feuds. */
function rivalryStories(c, s) {
  const out = []; const R = rivalries(c); const rounds = activeRounds(s);
  const nm = (kind, id) => kind === 'team' ? (s.teams.find(t => teamRoot(t.id) === id) || teamMeta(c, id))?.name || id : dName(s, id);
  const short = (kind, id) => kind === 'team' ? nm(kind, id) : id === PLAYER_ID ? c.profile.last : lastName(dName(s, id));
  const team = (kind, id) => kind === 'team' ? s.teams.find(t => teamRoot(t.id) === id)?.id : null;
  const quotes = (e, rnd) => {
    const tier = heatTier(rivalHeat(e.kind, e.gap ?? 0));
    if (e.kind === 'driver') return [e.a, e.b].filter(id => id !== PLAYER).map((id, k) => ({ id, text: choose(rnd, RIVAL_QUOTES[id === e.a ? 'lead' : 'chase'][tier]) })).slice(0, 2);
    return [e.a, e.b].map(id => team('team', id)).filter(Boolean).map(tid => ({ team: tid, role: principalOf(c, tid) ? `Team principal ${principalOf(c, tid)}` : 'Team principal', text: choose(rnd, RIVAL_QUOTES.boss[tier]) }));
  };
  for (const e of R.events) {
    if (e.si !== s.index || e.type === 'archGone') continue;
    const r = rounds[e.ri]; const rnd = seeded(`riv-${s.index}-${e.ri}-${e.type}-${e.a}-${e.b}`);
    const A = short(e.kind, e.a), B = short(e.kind, e.b), gp = r?.name || '';
    const cup = e.kind === 'team' ? 'constructors’ title' : 'title';
    const base = { id: `riv-${s.index}-${e.ri}-${e.type}-${e.kind}-${e.a}-${e.b}`, seq: e.ri * 10 + 5, kind: 'rivalry', i: e.ri, r, outlet: choose(rnd, D.OUTLETS), subject: e.kind === 'driver' ? e.b : null };
    if (e.type === 'start') {
      if (e.rematch) {
        const o = archSeason(c, e.kind, e.a, e.b, e.rematch.year);
        const lost = o ? short(e.kind, o.loser) : B, won = o ? short(e.kind, o.winner) : A;
        out.push({ ...base, massive: true, kicker: 'Archrivals · The rematch',
          headline: choose(rnd, [`The rematch: ${A} v ${B}, round two`, `${A} and ${B}: old enemies, a new ${cup} fight`, `Here we go again: ${A} and ${B} renew hostilities`]),
          standfirst: `${e.gap ? `${plural(e.gap, 'point')} separate` : 'Nothing separates'} ${A} and ${B} after ${gp}, and the paddock has seen this before.`,
          body: [o ? `${o.year} was theirs: ${won} came out on top${o.title ? ` and took the ${cup}` : ''}${o.margin ? `, ${plural(o.margin, 'point')} clear` : ' on countback'}. ${lost} has not forgotten, and wants payback.` : '',
            `The stakes could not be higher. This time it is personal.`].filter(Boolean), quotes: quotes(e, rnd) });
      } else if (e.again) {
        out.push({ ...base, kicker: e.kind === 'team' ? 'Constructors’ title rivals' : 'Title rivals',
          headline: choose(rnd, [`${B} is back in the hunt`, `${B} closes in on ${A} again`]),
          standfirst: `${gp} cuts the gap to ${plural(e.gap, 'point')}: ${B} is a threat to ${A} once more.`, body: [], quotes: quotes(e, rnd) });
      } else {
        out.push({ ...base, kicker: e.kind === 'team' ? 'Constructors’ title rivals' : 'Title rivals',
          headline: e.gap <= 10 ? choose(rnd, [`${A} v ${B}: ${e.gap ? plural(e.gap, 'point') : 'nothing'} in it`, `Title rivals: ${A} and ${B} locked together`]) : choose(rnd, [`Title rivals: ${A} and ${B}`, `${A} v ${B}: a ${cup} fight takes shape`]),
          standfirst: `After ${gp}, ${B} is ${e.gap ? `${plural(e.gap, 'point')} behind` : 'level with'} ${A}${e.kind === 'team' ? ' in the constructors’ championship' : ''}, and this has the makings of a ${cup} fight.`,
          body: [], quotes: quotes(e, rnd) });
      }
    } else if (e.type === 'hot') {
      out.push({ ...base, kicker: e.kind === 'team' ? 'Constructors’ title rivals' : 'Title rivals',
        headline: choose(rnd, [`${A} and ${B} now ${e.gap ? `just ${plural(e.gap, 'point')} apart` : 'level on points'}`, `The ${cup} fight boils over: ${A} v ${B}`, `Wheel to wheel for the ${cup}: ${A} and ${B}`]),
        standfirst: `${gp} brings ${B} right up to ${A}. Neither can afford a slip now.`, body: [], quotes: quotes(e, rnd) });
    } else if (e.type === 'cool') {
      out.push({ ...base, kicker: e.kind === 'team' ? 'Constructors’ title rivals' : 'Title rivals',
        headline: choose(rnd, [`${A} pulls clear of ${B}`, `The ${A}–${B} fight cools`]),
        standfirst: `The gap is ${plural(e.gap, 'point')} after ${gp}. ${B} needs something to change, and soon.`, body: [], quotes: quotes(e, rnd).slice(0, 1) });
    } else if (e.type === 'end') {
      out.push({ ...base, kicker: 'Championship', headline: choose(rnd, [`${B}’s challenge fades`, `${A} shakes off ${B}`]),
        standfirst: e.gap >= RIVAL_BANDS[e.kind].off ? `With ${plural(e.gap, 'point')} between them after ${gp}, ${B} is no longer a real threat to ${A}.` : `After ${gp}, ${B} can no longer catch ${A}.`, body: [] });
    } else if (e.type === 'arch') {
      const was = e.replaced.map(x => `${short(e.kind, x.id)}’s rivalry with ${short(e.kind, x.old)} from ${x.year}`);
      out.push({ ...base, massive: true, kicker: 'Archrivals',
        headline: choose(rnd, [`${A} and ${B}: archrivals`, `${A} v ${B}: a rivalry for the ages`, `${A} and ${B}, the rivalry that defines ${s.year}`]),
        standfirst: `Title rivals for ${e.rounds} of the ${e.of} rounds so far, ${A} and ${B} are now each other’s archrival.`,
        body: [was.length ? `It eclipses ${listJoin(was)}.` : '', 'Whatever happens from here, every time these two meet on track, it will mean that little bit more.'].filter(Boolean),
        quotes: quotes({ ...e, gap: 0 }, rnd) });
    }
  }
  // your feuds: the moment they start (later races mention them in the reports)
  for (const fd of c.rivalries || []) if (fd.seasonIdx === s.index) out.push({ ...feudStory(c, s, fd), t: Date.parse(fd.createdAt) || 0 });
  out.push(...duelStories(c, s));
  return out;
}

const FEUD_REASONS = [['contact', 'Contact on track'], ['crash', 'A crash'], ['hard', 'Hard racing'], ['points', 'Close in points']];
/** How a feud started, in a few words, for the reports that come after it. */
function feudCause(fd, gp, rnd) {
  return choose(rnd, {
    contact: [`their contact in ${gp}`, `that coming-together in ${gp}`, `the clash in ${gp}`],
    crash: [`the crash in ${gp}`, `their shunt in ${gp}`, `what happened in ${gp}`],
    hard: [`their wheel-to-wheel fight in ${gp}`, `the hard racing in ${gp}`, `their battle in ${gp}`],
    points: ['their fight over the same points', 'the battle for every point between them', 'their tussle in the standings'],
  }[fd.reason] || [`what happened in ${gp}`]);
}
function feudStory(c, s, fd) {
  const rounds = activeRounds(s); const i = Math.max(0, fd.after - 1); const r = rounds[i]; const gp = r?.name || 'the last race';
  const rnd = seeded(fd.id);
  const L = (id) => id === PLAYER_ID ? c.profile.last : lastName(dName(s, id));
  const A = L(fd.a), B = L(fd.b);
  const head = {
    contact: [`${A} and ${B} trade blame after contact in ${gp}`, `Sparks fly between ${A} and ${B} after ${gp} contact`],
    crash: [`${A} and ${B} at odds after the crash in ${gp}`, `${gp} crash leaves ${A} and ${B} fuming`],
    hard: [`${A} and ${B} go wheel to wheel, and words follow`, `${A} v ${B}: hard racing in ${gp} turns sour`],
    points: [`${A} v ${B}: the battle for every point heats up`, `${A} and ${B}, and a fight over the same points`],
  }[fd.reason] || [`${A} and ${B} fall out`];
  const said = {
    contact: ['He left me nowhere to go. I expected more.', 'That was not my fault, and he knows it.', 'We touched, it happens. But I won’t forget it.'],
    crash: ['He just turned in on me. Completely unnecessary.', 'I’m not going to apologise for racing.', 'We’ll talk about it. Or maybe we won’t.'],
    hard: ['It was hard, but was it fair? I’m not so sure.', 'If he wants to race like that, fine. I can race like that too.', 'That’s racing. He’ll get it back from me.'],
    points: ['Every point he takes is one I don’t get. Simple as that.', 'We are fighting for the same thing, and neither of us will give an inch.'],
  }[fd.reason] || ['No comment.'];
  return { id: 'fd' + fd.id, seq: i * 10 + 8, kind: 'rivalry', i, r, subject: fd.a, outlet: choose(rnd, D.OUTLETS), kicker: 'Bad blood',
    headline: choose(rnd, head), standfirst: `${dName(s, fd.a)} and ${dName(s, fd.b)} have a score to settle, and the next few races will be worth watching.`, body: [],
    quotes: [fd.a, fd.b].filter(id => id !== PLAYER).map(id => ({ id, text: choose(rnd, said) })), feud: fd };
}
/** Feuds still running at round i: started after an earlier round and within five races of it. */
const feudsAt = (c, s, i) => (c.rivalries || []).filter(fd => fd.seasonIdx === s.index && i >= fd.after && i < fd.after + FEUD_RACES);

/* ---------------------------------------------------------------- battles */
// A battle: two drivers who swapped places at least five times in a race, each passing the other at least twice (so a
// lapped car waved through, or one car simply driving away, never counts). It comes from every pass F1 25 reports as
// it happens, so a move made at the same corner every lap counts as much as one made over the line. Races logged
// before 1.9.5, or by hand, have no passes: for those, nobody knows.
const BATTLE_SWAPS = 5, BATTLE_EACH = 2;
/** A race's battles, biggest first: [{ a, b, n, by: { id: passes }, from, to, ahead, behind, posW, posL }], or null. */
function raceBattles(sd) {
  const ov = sd?.done && sd.game?.overtakes; if (!Array.isArray(ov)) return null;
  const P = {};
  for (const [a, b, lap] of ov) {
    const o = P[pairKey(a, b)] ||= { a: a < b ? a : b, b: a < b ? b : a, n: 0, by: {}, laps: [] };
    o.n++; o.by[a] = (o.by[a] || 0) + 1; o.laps.push(lap || 0);
  }
  const fin = (d) => { const k = sd.results.findIndex(x => x.d === d); return k < 0 || OUT.includes(sd.results[k].st) ? 99 : k + 1; };
  return Object.values(P).filter(o => o.n >= BATTLE_SWAPS && (o.by[o.a] || 0) >= BATTLE_EACH && (o.by[o.b] || 0) >= BATTLE_EACH)
    .map(o => { const [w, l] = fin(o.a) <= fin(o.b) ? [o.a, o.b] : [o.b, o.a]; return { ...o, from: Math.min(...o.laps), to: Math.max(...o.laps), ahead: w, behind: l, posW: fin(w), posL: fin(l) }; })
    .sort((x, y) => y.n - x.n || x.posW - y.posW);
}
/** Passes each driver made and lost in a race, and the net places on the opening lap: { made, lost, lap1 } by driver. */
function racePasses(sd) {
  const ov = sd?.done && sd.game?.overtakes; if (!Array.isArray(ov)) return null;
  const made = {}, lost = {}, lap1 = {};
  for (const [a, b, lap] of ov) {
    made[a] = (made[a] || 0) + 1; lost[b] = (lost[b] || 0) + 1;
    if (lap <= 1) { lap1[a] = (lap1[a] || 0) + 1; lap1[b] = (lap1[b] || 0) - 1; }
  }
  return { made, lost, lap1, total: ov.length };
}
// Wheel-to-wheel rivals: a battle in two races in a row (a sprint and its Grand Prix are two races) makes the two
// drivers rivals on track. It lasts until they go three races in a row without one, and can start again later. Races
// without pass data don't count either way. Like title rivalries, these are worked out from the results, so editing
// or undoing a race puts them right.
const DUEL_ON = 2, DUEL_OFF = 3;
const _duelCache = new WeakMap();
/** The season's wheel-to-wheel rivalries: { events: [{ type: 'duelStart'|'duelEnd', a, b, i, key, battles }], at: { ri: [active] }, all: battles } */
function duels(s) {
  let v = _duelCache.get(s); if (v && v.gen === renderGen) return v.d;
  const P = {}; const events = []; const at = {}; const all = [];
  activeRounds(s).forEach((r, i) => {
    const ses = s.weekends[r.id]?.sessions || {};
    for (const key of ['SPR', 'R']) {
      const B = raceBattles(ses[key]); if (!B) continue;
      const hit = new Set();
      for (const b of B) {
        const k = pairKey(b.a, b.b); hit.add(k); all.push({ i, key, ...b });
        const p = P[k] ||= { a: b.a, b: b.b, run: 0, quiet: 0, active: false, battles: [], stints: 0, start: 0 };
        p.run++; p.quiet = 0; p.battles.push({ i, key, n: b.n, ahead: b.ahead });
        if (!p.active && p.run >= DUEL_ON) {
          p.active = true; p.stints++; p.start = p.battles.length - p.run;
          events.push({ type: 'duelStart', a: b.a, b: b.b, i, key, again: p.stints > 1, battles: p.battles.slice(p.start) });
        }
      }
      for (const [k, p] of Object.entries(P)) {
        if (hit.has(k)) continue;
        p.run = 0;
        if (p.active && ++p.quiet >= DUEL_OFF) { p.active = false; events.push({ type: 'duelEnd', a: p.a, b: p.b, i, key, battles: p.battles.slice(p.start) }); }
      }
    }
    at[i] = Object.values(P).filter(p => p.active).map(p => ({ a: p.a, b: p.b, quiet: p.quiet, battles: p.battles.slice(p.start) }));
  });
  const d = { events, at, all };
  _duelCache.set(s, { gen: renderGen, d });
  return d;
}
/** Wheel-to-wheel rivalries running after round ri. */
const duelsAt = (s, ri) => { const D2 = duels(s); for (let i = ri; i >= 0; i--) if (D2.at[i]) return D2.at[i]; return []; };
/** Who has come out ahead in a set of battles: { a: n, b: n }. */
const duelScore = (x) => x.battles.reduce((o, b) => { o[b.ahead] = (o[b.ahead] || 0) + 1; return o; }, {});
// what drivers say about a rival they keep racing wheel to wheel: respect, or (after contact between them) needle
const DUEL_QUOTES = {
  respect: ['Every time we race, it’s hard but fair. I enjoy it, honestly.', 'We seem to find each other every weekend. It’s good fun, as long as it stays clean.', 'I know exactly how they race now, and they know how I race. That makes it great.', 'You can’t give an inch, because they won’t. That’s proper racing.', 'It’s become a bit of a habit, hasn’t it? I don’t mind, I like a fight.'],
  needle: ['They race me harder than anyone else on the grid. Sometimes too hard.', 'We have touched a couple of times now. I hope it stays fair.', 'I’ll race anyone hard, but there has to be respect both ways.', 'There is a line, and I think it has been close to being crossed.', 'Let’s just say we won’t be having dinner together.'],
  ended: ['We’re just not in the same part of the field any more. I’m sure we’ll meet again.', 'It was fun while it lasted.'],
};
/** The stories of the season's wheel-to-wheel rivalries: when one starts, and when it runs out. */
function duelStories(c, s) {
  const out = []; const rounds = activeRounds(s);
  const L = (id) => id === PLAYER_ID ? c.profile.last : lastName(dName(s, id));
  const gpOf = (b) => b.key === 'SPR' ? `the ${rounds[b.i]?.name || ''} sprint` : rounds[b.i]?.name || '';
  for (const e of duels(s).events) {
    const r = rounds[e.i]; const rnd = seeded(`duel-${s.index}-${e.i}-${e.key}-${e.type}-${e.a}-${e.b}`);
    const A = L(e.a), B = L(e.b);
    // contact between them in any of these races makes it spicier
    const touched = e.battles.some(b => (s.weekends[rounds[b.i]?.id]?.sessions?.[b.key]?.game?.incidents || []).some(x => (x.a === e.a && x.b === e.b) || (x.a === e.b && x.b === e.a)));
    const sc = duelScore(e); const lead = (sc[e.a] || 0) >= (sc[e.b] || 0) ? e.a : e.b;
    const base = { id: `duel-${s.index}-${e.i}-${e.key}-${e.type}-${e.a}-${e.b}`, seq: e.i * 10 + (e.key === 'SPR' ? 2.6 : 4.6), kind: 'rivalry', i: e.i, r, outlet: choose(rnd, D.OUTLETS), subject: e.b === PLAYER ? e.a : e.b };
    if (e.type === 'duelStart') {
      const last2 = e.battles.slice(-2);
      out.push({ ...base, kicker: e.again ? 'Wheel to wheel · Round two' : 'Wheel to wheel',
        headline: e.again ? choose(rnd, [`${A} and ${B} are at it again`, `${A} v ${B}: the on-track war is back on`, `They can’t stay apart: ${A} and ${B} renew hostilities`])
          : touched ? choose(rnd, [`${A} v ${B}: a rivalry born in contact`, `${A} and ${B}: elbows out, again`, `Bumping and barging: ${A} and ${B} make it personal`])
          : choose(rnd, [`${A} v ${B}: a rivalry born wheel to wheel`, `${A} and ${B} can’t stay away from each other`, `${A} and ${B}, the battle that keeps on giving`, `Two races, ${last2.reduce((a, b) => a + b.n, 0)} passes: ${A} v ${B} is the fight to watch`]),
        standfirst: `${A} and ${B} swapped places ${pw(last2[0].n, 'time')} in ${gpOf(last2[0])} and ${pw(last2[1].n, 'time')} in ${gpOf(last2[1])}. Two races running, the same fight: the pair are now rivals on track.`,
        body: [last2[0].ahead === last2[1].ahead ? `${L(last2[1].ahead)} came out ahead both times, and ${L(last2[1].ahead === e.a ? e.b : e.a)} will want to turn that around.` : `They have one each: ${L(last2[0].ahead)} had the final say first time, ${L(last2[1].ahead)} the second.`,
          touched ? 'The two have already made contact along the way, and neither looks in the mood to back down.' : choose(rnd, ['It has been hard, clean racing so far. Long may it continue.', 'So far it has stayed clean. With these two, that may not last.'])],
        quotes: [e.a, e.b].filter(id => id !== PLAYER).map(id => ({ id, text: choose(rnd, DUEL_QUOTES[touched ? 'needle' : 'respect']) })) });
    } else {
      out.push({ ...base, kicker: 'Wheel to wheel', subject: lead === PLAYER ? (lead === e.a ? e.b : e.a) : lead,
        headline: choose(rnd, [`The ${A}–${B} duel goes quiet`, `${A} and ${B} go their separate ways`, `Three races of peace between ${A} and ${B}`]),
        standfirst: `${A} and ${B} have now gone three races without a fight. Over ${pw(e.battles.length, 'battle')}, ${sc[e.a] === sc[e.b] ? 'they finished honours even' : sc[lead] === e.battles.length ? `${L(lead)} came out ahead every time` : `${L(lead)} came out ahead in ${nw(sc[lead])}`}.`,
        body: [], quotes: [e.a, e.b].filter(id => id !== PLAYER).slice(0, 1).map(id => ({ id, text: choose(rnd, DUEL_QUOTES.ended) })) });
    }
  }
  return out;
}

/** Lines for a qualifying report: archrivals or feuding drivers side by side on the grid. */
function rivalryQualiLines(c, s, i, q, last, rnd) {
  const lines = []; const pos = (id) => q.findIndex(x => x.d === id);
  const arch = rivalsAt(c, s, i - 1).arch.driver; const seen = new Set();
  for (const [a, x] of Object.entries(arch)) {
    const b = x.rival; const k = pairKey(a, b); if (seen.has(k)) continue; seen.add(k);
    const pa = pos(a), pb = pos(b); if (pa < 0 || pb < 0 || Math.abs(pa - pb) !== 1) continue;
    const [f, sb] = pa < pb ? [a, b] : [b, a]; const front = Math.min(pa, pb) + 1;
    lines.push(choose(rnd, front % 2 === 1
      ? [`Archrivals ${last(f)} and ${last(sb)} will start side by side on row ${(front + 1) / 2}. The first corner should be interesting.`, `${last(f)} and ${last(sb)}, archrivals since ${x.year}, share row ${(front + 1) / 2}.`]
      : [`${last(sb)} lines up right behind archrival ${last(f)}, ${ordWord(front + 1)} to ${ordWord(front)}.`, `Just one place splits archrivals ${last(f)} and ${last(sb)} on the grid.`]));
  }
  for (const fd of feudsAt(c, s, i)) {
    const pa = pos(fd.a), pb = pos(fd.b); if (pa < 0 || pb < 0 || Math.abs(pa - pb) !== 1) continue;
    const gp0 = activeRounds(s)[Math.max(0, fd.after - 1)]?.name || 'the last race';
    lines.push(choose(rnd, [`${last(fd.a)} and ${last(fd.b)}, who came to blows after ${feudCause(fd, gp0, rnd)}, line up next to each other.`, `Fate puts ${last(fd.a)} and ${last(fd.b)} side by side, not long after ${feudCause(fd, gp0, rnd)}.`]));
  }
  for (const x of duelsAt(s, i - 1)) {
    const pa = pos(x.a), pb = pos(x.b); if (pa < 0 || pb < 0 || Math.abs(pa - pb) !== 1) continue;
    const [f, sb] = pa < pb ? [x.a, x.b] : [x.b, x.a];
    lines.push(choose(rnd, [`${last(f)} and ${last(sb)}, wheel to wheel in ${plural(x.battles.length, 'race')} lately, line up ${ordWord(Math.min(pa, pb) + 1)} and ${ordWord(Math.max(pa, pb) + 1)}. Expect more of the same.`, `Here we go again: ${last(f)} starts just ahead of on-track rival ${last(sb)}.`, `${last(sb)} will have ${last(f)} in sight from the start. These two never seem to race anyone else.`]));
  }
  return lines;
}
/** Lines for a race report: archrivals finishing nose to tail, feuds flaring again, how heated the title fight is. */
function rivalryRaceLines(c, s, i, res, last, rnd) {
  const lines = [];
  const fin = res.filter(x => !OUT.includes(x.st));
  const tm = (id) => { const k = fin.findIndex(x => x.d === id); if (k < 0) return null; if (k === 0) return 0; return +fin[k].laps > 0 ? null : parseGap(fin[k].gap); };
  const pos = (id) => fin.findIndex(x => x.d === id);
  const arch = rivalsAt(c, s, i - 1).arch.driver; const seen = new Set();
  for (const [a, x] of Object.entries(arch)) {
    const b = x.rival; const k = pairKey(a, b); if (seen.has(k)) continue; seen.add(k);
    const pa = pos(a), pb = pos(b); if (pa < 0 || pb < 0 || Math.abs(pa - pb) !== 1) continue;
    const [f, sb] = pa < pb ? [a, b] : [b, a]; const ta = tm(f), tb = tm(sb); const d = ta != null && tb != null ? tb - ta : null;
    lines.push(d != null && d <= 3
      ? choose(rnd, [`${last(f)} and ${last(sb)} had nothing to give each other: the archrivals crossed the line ${d.toFixed(3)} seconds apart, ${last(f)} ahead.`, `Archrivals to the end: ${last(f)} held off ${last(sb)} by ${d.toFixed(3)} seconds.`])
      : choose(rnd, [`${last(f)} finished one place ahead of archrival ${last(sb)}.`, `Another round to ${last(f)} in the long-running duel with ${last(sb)}.`]));
  }
  for (const fd of feudsAt(c, s, i)) {
    const ta = tm(fd.a), tb = tm(fd.b); if (ta == null || tb == null || Math.abs(ta - tb) > 5) continue;
    const gp0 = activeRounds(s)[Math.max(0, fd.after - 1)]?.name || 'the last race';
    const [f, sb] = ta <= tb ? [fd.a, fd.b] : [fd.b, fd.a]; const n = i - fd.after + 1;
    lines.push(choose(rnd, [`${last(f)} and ${last(sb)} were at it again, ${Math.abs(ta - tb).toFixed(3)} seconds apart at the flag, ${n === 1 ? 'a race' : `${plural(n, 'race')}`} after ${feudCause(fd, gp0, rnd)}.`,
      `No love lost: ${last(f)} finished just ahead of ${last(sb)}, with ${feudCause(fd, gp0, rnd)} still fresh.`, `${last(f)} came out on top this time, ${Math.abs(ta - tb).toFixed(3)} seconds clear of ${last(sb)}. Neither has forgotten ${feudCause(fd, gp0, rnd)}.`]));
  }
  // My Team: how you got on against your archrival team
  const rt = c.type === 'myteam' && !isHist(s) && archRivalTeam(c, s, i - 1)?.id;
  if (rt && s.teams.some(t => t.id === rt)) {
    const best = (tid) => { const k = fin.findIndex(x => teamAt(s, x.d, i)?.id === tid); return k < 0 ? null : k + 1; };
    const me = best(MYTEAM), them = best(rt); const tn = s.teams.find(t => t.id === rt).name, mn = s.teams.find(t => t.id === MYTEAM)?.name;
    if (me && them) lines.push(me < them ? choose(rnd, [`${mn} got the better of rivals ${tn}: best car ${ordWord(me)} to their ${ordWord(them)}.`, `One up on ${tn}: ${mn}’s lead car came home ${ordWord(me)}, ahead of their best in ${ordWord(them)}.`])
      : choose(rnd, [`Rivals ${tn} had the edge over ${mn} today, ${ordWord(them)} to ${ordWord(me)}.`, `${tn} came out ahead of ${mn} this time: ${ordWord(them)} against ${ordWord(me)}.`]));
  }
  const hot = rivalsAt(c, s, i).active.filter(x => x.kind === 'driver').sort((a, b) => b.heat - a.heat)[0];
  if (hot) lines.push(hot.heat >= 0.85 ? choose(rnd, [`The title fight between ${last(hot.a)} and ${last(hot.b)} could hardly be closer.`, `${last(hot.a)} v ${last(hot.b)} is turning into a classic.`])
    : hot.heat >= 0.6 ? choose(rnd, [`It is a straight fight between ${last(hot.a)} and ${last(hot.b)} now.`, `${last(hot.b)} keeps the pressure on ${last(hot.a)}.`])
    : choose(rnd, [`${last(hot.b)} needs to start closing on ${last(hot.a)} soon.`, `${last(hot.a)} keeps ${last(hot.b)} at arm’s length, for now.`]));
  return lines;
}
/** For a retirement story: the archrivalry that defined a driver's career, and how its season ended. */
function archRetireLine(c, s, id, at) {
  const a = rivalsAt(c, s, Math.min(at, activeRounds(s).length) - 1).arch.driver[id]; if (!a) return '';
  const o = archSeason(c, 'driver', id, a.rival, a.year);
  const L = (x) => x === PLAYER_ID ? c.profile.last : lastName(dName(o?.s || s, x));
  return o ? `The rivalry with ${L(a.rival)} will be remembered as a defining part of ${L(id)}’s career. It burned brightest in ${o.year}, when ${L(o.winner)} came out on top${o.title ? ' and took the title' : ''}${o.margin ? ` by ${plural(o.margin, 'point')}` : ' on countback'}.`
    : `The rivalry with ${L(a.rival)} was a defining part of ${L(id)}’s career.`;
}
/** Dashboard panel: the title fights right now, archrivals that matter to you, and your running feuds. */
function rivalryPanel(c, s) {
  const st = rivalsAt(c, s, roundsDone(s) - 1);
  const nm = (kind, id) => kind === 'team' ? (s.teams.find(t => teamRoot(t.id) === id) || teamMeta(c, id))?.name || id : dName(s, id);
  const mine = new Set([PLAYER, ...(s.teams.find(t => t.id === s.playerTeamId)?.drivers || [])]);
  const myRoot = teamRoot(s.playerTeamId);
  const live = st.active.slice().sort((a, b) => b.heat - a.heat);
  const arch = [];
  for (const id of mine) { const a = st.arch.driver[id]; if (id && a) arch.push(`${nm('driver', id)} v ${nm('driver', a.rival)} (since ${a.year})`); }
  if (st.arch.team[myRoot]) arch.push(`${nm('team', myRoot)} v ${nm('team', st.arch.team[myRoot].rival)} (since ${st.arch.team[myRoot].year})`);
  const feuds = feudsAt(c, s, roundsDone(s));
  const w2w = duelsAt(s, roundsDone(s) - 1).slice().sort((a, b) => (mine.has(b.a) || mine.has(b.b)) - (mine.has(a.a) || mine.has(a.b)) || b.battles.length - a.battles.length).slice(0, 5);
  const rows = live.map(x => `<div class="goal"><div><div style="font-weight:600">${esc(nm(x.kind, x.a))} v ${esc(nm(x.kind, x.b))}</div><div class="muted" style="font-size:12px">${x.kind === 'team' ? 'Constructors' : 'Drivers'} · ${x.gap ? plural(x.gap, 'point') : 'level'}</div></div>
    <span class="tag ${x.heat >= 0.8 ? 'dnf' : x.heat >= 0.55 ? 'sprint' : ''}">${x.heat >= 0.8 ? 'White hot' : x.heat >= 0.55 ? 'Heated' : 'Simmering'}</span>
    <div class="bar-track"><div class="bar-fill" style="width:${Math.round(x.heat * 100)}%;background:var(--red)"></div></div></div>`).join('');
  return `<div class="panel"><div class="panel-h"><h2>Rivalries</h2><button class="btn sm ghost" data-act="rv-new">Start a rivalry</button></div>
    ${rows ? `<div class="panel-b"><span class="label">Title rivals</span>${rows}</div>` : `<div class="panel-b muted" style="font-size:13px">${roundsDone(s) < 5 ? 'Title rivalries form from the sixth race.' : 'Nobody is close enough to the leader to call it a fight.'}</div>`}
    ${arch.length ? `<div class="panel-b" style="border-top:1px solid var(--line)"><span class="label">Archrivals</span><div style="display:grid;gap:4px;margin-top:6px">${arch.map(x => `<div>${esc(x)}</div>`).join('')}</div></div>` : ''}
    ${w2w.length ? `<div class="panel-b" style="border-top:1px solid var(--line)"><span class="label">Wheel to wheel</span><div style="display:grid;gap:4px;margin-top:6px">${w2w.map(x => `<div>${esc(dName(s, x.a))} v ${esc(dName(s, x.b))} <span class="muted">· ${plural(x.battles.length, 'battle')}${x.quiet ? `, ${plural(x.quiet, 'race')} without one` : ''}</span></div>`).join('')}</div></div>` : ''}
    ${feuds.length ? `<div class="panel-b" style="border-top:1px solid var(--line)"><span class="label">Bad blood</span><div style="display:grid;gap:4px;margin-top:6px">${feuds.map(fd => `<div>${esc(dName(s, fd.a))} v ${esc(dName(s, fd.b))} <span class="muted">· ${esc(FEUD_REASONS.find(x => x[0] === fd.reason)?.[1] || '')}, ${plural(fd.after + FEUD_RACES - roundsDone(s), 'race')} left</span></div>`).join('')}</div></div>` : ''}
  </div>`;
}
function rivalryModal() {
  const s = latestSeason(); const ids = gridIds(s);
  ui.modal = { kind: 'rivalry', a: ids.includes(PLAYER) ? PLAYER : ids[0], b: ids.find(id => id !== PLAYER && id !== ids[0]) || ids[1], reason: 'contact' };
  drawRivalryModal();
}
function drawRivalryModal() {
  const c = career(); const s = latestSeason(); const m = ui.modal;
  const opt = (k, v, l) => `<option value="${v}" ${m[k] === v ? 'selected' : ''}>${esc(l)}</option>`;
  const drivers = (k) => s.teams.map(t => `<optgroup label="${esc(t.name)}">${t.drivers.filter(Boolean).map(d => opt(k, d, dName(s, d))).join('')}</optgroup>`).join('');
  const preview = m.a !== m.b ? feudStory(c, s, { id: 'preview', seasonIdx: s.index, after: roundsDone(s), a: m.a, b: m.b, reason: m.reason }) : null;
  modal(`<div class="modal-h"><h2>Start a rivalry</h2><button class="icon-btn" data-act="modal-close">${ICON.x}</button></div>
    <div class="modal-b">
      <div class="form-grid">
        <label class="field"><span>Driver</span><select data-ch="rv-field" data-k="a">${drivers('a')}</select></label>
        <label class="field"><span>And</span><select data-ch="rv-field" data-k="b">${drivers('b')}</select></label>
        <label class="field"><span>Why</span><select data-ch="rv-field" data-k="reason">${FEUD_REASONS.map(([v, l]) => opt('reason', v, l)).join('')}</select></label>
      </div>
      ${preview ? `<div class="callout" style="border-left-color:var(--team)"><span class="label">Preview headline</span><div style="color:var(--fg);font-family:var(--font-display);font-size:18px;margin-top:4px">${esc(preview.headline)}</div></div>` : '<div class="callout">Pick two different drivers.</div>'}
      <p class="muted" style="font-size:13px">The story runs after round ${roundsDone(s) || 1}. For the next ${FEUD_RACES} races the press brings it up whenever the two qualify side by side or finish within five seconds of each other. Title rivals are tracked automatically.</p>
    </div>
    <div class="modal-f"><button class="btn ghost" data-act="modal-close">Cancel</button><button class="btn primary" data-act="rv-create" ${preview ? '' : 'disabled'}>Start the rivalry</button></div>`);
}

/* --------------------------------------------------------------- telemetry */
// Results from F1 25 itself (telemetry.js, desktop only). While Pitwall is open it listens to the game, directly or
// forwarded by another app. When a session ends it works out the career (the open one), the round (the circuit's
// next round not yet logged, or the weekend it already started) and the session, then logs the order, best laps,
// race times and gaps (penalties included), laps down and retirements. Every lap, tyre stint, pit stop and penalty
// is kept too, for the pace tables, the strategy table and the stories. The last import can be undone.
const GAME_TRACKS = { 0: 'aus', 2: 'chn', 3: 'bhr', 4: 'esp', 5: 'mon', 6: 'can', 7: 'gbr', 9: 'hun', 10: 'bel', 11: 'ita', 12: 'sgp', 13: 'jpn', 14: 'abu', 15: 'usa', 16: 'bra', 17: 'aut', 19: 'mex', 20: 'aze', 26: 'ned', 27: 'emi', 29: 'sau', 30: 'mia', 31: 'lvg', 32: 'qat', 39: 'gbr', 40: 'aut', 41: 'ned', 42: 'mad' };
const NOT_CAREER_MODES = [5, 6, 7, 15, 17, 75, 127]; // time trial, split screen, online, story mode, benchmark
const GAME_STATUS = { 2: 'FIN', 3: 'FIN', 4: 'DNF', 6: 'DNF', 7: 'DNF', 5: 'DSQ' };
const COMPOUNDS = { 16: ['S', 'Soft', '#E8002D'], 17: ['M', 'Medium', '#F5C518'], 18: ['H', 'Hard', '#E7ECF5'], 7: ['I', 'Intermediate', '#2FD07A'], 8: ['W', 'Wet', '#3A8DFF'] };
const PENALTY_NAMES = { 0: 'drive-through penalty', 1: 'stop-go penalty', 2: 'grid penalty', 4: 'time penalty', 6: 'disqualification' };
// the race director's reasons (F1 25 infringement types), in the words a report would use
const INFRINGEMENTS = { 0: 'blocking by driving slowly', 1: 'driving the wrong way', 3: 'causing a collision', 4: 'causing a collision', 5: 'not giving back a place gained in a collision', 6: 'not giving back places gained in a collision', 7: 'gaining time by cutting a corner', 8: 'overtaking by cutting a corner', 9: 'overtaking by cutting a corner', 10: 'crossing the pit exit line', 11: 'ignoring blue flags', 12: 'ignoring yellow flags', 17: 'speeding in the pit lane', 21: 'repeated warnings', 27: 'exceeding track limits', 28: 'exceeding track limits', 29: 'exceeding track limits', 33: 'blocking the pit lane', 34: 'a jump start', 35: 'hitting the safety car', 36: 'overtaking under the safety car', 37: 'speeding under the safety car', 38: 'speeding under the virtual safety car', 52: 'gaining an illegal advantage' };
const COLLISION_INFR = [3, 4, 5, 6];
const WARNING = 5;
/**
 * Incidents between two drivers, from the race director: { lap, a: at fault, b: the other driver, major, pen, noFault }.
 * A collision penalty or warning names who was at fault (major if it was a big collision or ended in a penalty).
 * Contact the stewards let go is minor, and the car that was behind is taken to be at fault; if it isn't known who
 * was ahead, it's a racing incident.
 */
function buildIncidents(r, map) {
  const out = [];
  for (const p of r.penaltyEvents || []) {
    if (!COLLISION_INFR.includes(p.infringement) || !map[p.car] || !map[p.other] || p.car === p.other) continue;
    const major = p.infringement === 3 || p.type !== WARNING;
    if (out.some(x => x.a === map[p.car] && x.b === map[p.other] && Math.abs((x.t ?? -99) - (p.t ?? 99)) < 20)) continue;
    out.push({ lap: p.lap || 0, a: map[p.car], b: map[p.other], major, pen: p.type === WARNING ? 'a warning' : p.type === 4 ? `a ${p.time}-second penalty` : `a ${PENALTY_NAMES[p.type] || 'penalty'}`, t: p.t ?? null });
  }
  for (const x of r.collisions || []) {
    const A = map[x.a], B = map[x.b]; if (!A || !B) continue;
    // already judged by the stewards
    if (out.some(o => ((o.a === A && o.b === B) || (o.a === B && o.b === A)) && (o.t == null || Math.abs(o.t - x.t) < 20))) continue;
    if (out.some(o => !o.pen && ((o.a === A && o.b === B) || (o.a === B && o.b === A)) && Math.abs(o.lap - x.lap) <= 1)) continue;
    const known = x.posA && x.posB && x.posA !== x.posB;
    const [a, b] = known && x.posA < x.posB ? [B, A] : [A, B]; // the car behind
    out.push({ lap: x.lap || 0, a, b, major: false, pen: null, noFault: !known, t: x.t });
  }
  return out.sort((p, q) => p.lap - q.lap);
}
// what drivers say about contact: by whether it was big, and whether they own it
const INCIDENT_QUOTES = {
  sorry: [['We had a small touch with {V}. That one was on me, and I’ve said sorry.', 'I misjudged the gap to {V} a little. Nothing big, but I take the blame.', 'A bit of contact with {V}. My fault, I braked a touch late.'],
    ['I got it wrong with {V}, simple as that. {PEN}I’ve apologised.', 'That’s on me. I spoiled {V}’s race and I feel bad about it.', 'I made a mistake into the braking zone and took {V} out of the fight. I’m sorry for that.']],
  deny: [['There was a little contact with {V}, but I left enough room. That’s racing.', 'I was already alongside and {V} closed the door. We touched, that’s all.', 'I don’t think I did much wrong. It was a small touch.'],
    ['I don’t agree with the decision at all. {V} turned in on me and I had nowhere to go.', 'The stewards got that wrong. I was alongside and {V} didn’t leave me any space.', 'For me it was a racing incident. I’ll look at it again, but I don’t see what more I could have done.']],
  forgive: [['{O} gave me a nudge, but it didn’t cost me much. No hard feelings.', 'Just a bit of contact with {O}. It happens when you race this close.', '{O} came over to apologise, and that’s fine. We move on.'],
    ['It’s frustrating, but {O} came straight over to say sorry. These things happen.', '{O} made a mistake. It cost us a lot today, but I know it wasn’t on purpose.', 'Of course I’m disappointed, but {O} owned it, and I respect that.']],
  annoyed: [['{O} gave me a tap and it cost me a bit of time. Not ideal.', 'I didn’t love that move from {O}, but there was no real damage.', 'A bit clumsy from {O}. I’ll have a word, nothing more.'],
    ['That was reckless from {O}. {PEN2}It doesn’t give me my race back.', '{O} just drove into me. It ruined our afternoon, and I’m angry about it.', 'I don’t know what {O} was thinking. You can’t race like that.']],
  even: ['We touched with {X}, but that’s racing. Nobody to blame.', 'Close racing with {X} and a bit of contact. All part of it.', 'A little contact with {X}. Hard racing, no complaints from me.'],
};
/** Both drivers' reactions to an incident. The player's own words never get made up: only an AI driver speaks. */
function incidentQuotes(c, inc, last, rnd) {
  const out = []; const k = inc.major ? 1 : 0;
  const fill = (txt, me, other) => txt.replace('{V}', last(other)).replace('{O}', last(other)).replace('{X}', last(other))
    .replace('{PEN}', inc.pen && inc.pen !== 'a warning' ? `The penalty is fair. ` : '').replace('{PEN2}', inc.pen && inc.pen !== 'a warning' ? 'The penalty is right, but it ' : 'It ').replace(/ It doesn’t/, ' It doesn’t').replace('right, but it It', 'right, but it');
  if (inc.noFault) { for (const [me, other] of [[inc.a, inc.b], [inc.b, inc.a]]) if (me !== PLAYER_ID) out.push({ id: me, text: fill(choose(rnd, INCIDENT_QUOTES.even), me, other) }); return out; }
  const sorry = rnd() < (inc.major ? 0.5 : 0.6);
  const forgive = rnd() < (sorry ? 0.7 : 0.3) - (inc.major ? 0.15 : 0);
  if (inc.a !== PLAYER_ID) out.push({ id: inc.a, text: fill(choose(rnd, INCIDENT_QUOTES[sorry ? 'sorry' : 'deny'][k]), inc.a, inc.b) });
  if (inc.b !== PLAYER_ID) out.push({ id: inc.b, text: fill(choose(rnd, INCIDENT_QUOTES[forgive ? 'forgive' : 'annoyed'][k]), inc.b, inc.a) });
  return out;
}
/** A sentence for the race report on the incidents that mattered. */
function incidentLine(inc, last) {
  if (inc.noFault) return `${last(inc.a)} and ${last(inc.b)} made contact${inc.lap ? ` on lap ${inc.lap}` : ''}, a racing incident.`;
  if (inc.pen) return `${last(inc.a)} was given ${inc.pen} for ${inc.major ? 'colliding with' : 'contact with'} ${last(inc.b)}${inc.lap ? ` on lap ${inc.lap}` : ''}.`;
  return `${last(inc.a)} tagged ${last(inc.b)}${inc.lap ? ` on lap ${inc.lap}` : ''}, but the stewards took no action.`;
}
/** Incident stories for a race or sprint: the big ones, and any involving your team. */
function incidentStories(c, s, i, r, key, sd, h) {
  const incs = sd?.game?.incidents || []; if (!incs.length) return [];
  const mine = (x) => [x.a, x.b].some(d => d === PLAYER || teamOf(s, d)?.id === s.playerTeamId);
  const pick = incs.filter(x => x.major || mine(x)).sort((p, q) => (q.major - p.major) || (mine(q) - mine(p)) || p.lap - q.lap).slice(0, 2);
  const pos = (d) => { const k = sd.results.findIndex(x => x.d === d); return k < 0 ? null : OUT.includes(sd.results[k].st) ? sd.results[k].st : ordWord(k + 1); };
  const gp = r.name; const sprint = key === 'SPR';
  return pick.map((inc, n) => {
    const rnd = seeded(`${s.index}-${r.id}-${key}-inc${n}`);
    const headline = inc.noFault ? choose(rnd, [`Contact between ${h.last(inc.a)} and ${h.last(inc.b)} in ${gp}`, `${h.last(inc.a)} and ${h.last(inc.b)} tangle${sprint ? ' in the sprint' : ''}`])
      : inc.pen && inc.pen !== 'a warning' ? choose(rnd, [`${h.last(inc.a)} penalised for clash with ${h.last(inc.b)}`, `Stewards hand ${h.last(inc.a)} ${inc.pen} after contact with ${h.last(inc.b)}`])
      : inc.major ? `${h.last(inc.a)} and ${h.last(inc.b)} collide in ${gp}` : choose(rnd, [`${h.last(inc.a)} and ${h.last(inc.b)} touch in ${gp}`, `A brush between ${h.last(inc.a)} and ${h.last(inc.b)}${sprint ? ' in the sprint' : ''}`]);
    const after = [inc.a, inc.b].map(d => `${h.last(d)} ${pos(d) && OUT.includes(pos(d)) ? 'did not finish' : `finished ${pos(d)}`}`);
    return { id: `${s.index}-${r.id}${key}inc${n}`, seq: i * 10 + (sprint ? 2 : 4) + 0.5, kind: 'incident', i, r, subject: inc.b, outlet: choose(rnd, D.OUTLETS), kicker: inc.major ? 'Stewards' : 'Contact',
      headline, standfirst: incidentLine(inc, h.last) + ` ${listJoin(after)}.`, body: [], quotes: incidentQuotes(c, inc, h.last, rnd) };
  });
}
const GAME_SESSION_NAMES = { 1: 'Practice 1', 2: 'Practice 2', 3: 'Practice 3', 4: 'Practice', 5: 'Qualifying 1', 6: 'Qualifying 2', 7: 'Qualifying 3', 8: 'Qualifying', 9: 'One-shot qualifying', 10: 'Sprint Shootout 1', 11: 'Sprint Shootout 2', 12: 'Sprint Shootout 3', 13: 'Sprint Shootout', 14: 'One-shot Sprint Shootout', 15: 'Race', 16: 'Race' };
let telemetryStatus = null;
let gameNotice = null; // the last import: its banner and its undo
const gameQueue = []; // results waiting for you to decide (replace a logged session, or pick the round)
const normName = (n) => String(n || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z ]/g, ' ').trim().split(/\s+/).filter(Boolean);
/** The same driver? Names in the game can be full, initial-and-surname, or surname only. */
function sameDriver(a, b) { const A = normName(a), B = normName(b); return !!(A.length && B.length) && (A[A.length - 1] === B[B.length - 1] || A.join('') === B.join('')); }
/** Which Pitwall session a game session is (null when it isn't one this weekend has). */
function gameKey(r, keys) {
  const t = r.sessionType;
  let k = t >= 1 && t <= 3 ? 'FP' + t : t === 4 ? 'FP' : t >= 5 && t <= 9 ? 'Q' : t >= 10 && t <= 14 ? 'SQ' : t === 15 ? (r.weekend?.includes(16) ? 'SPR' : 'R') : t === 16 ? 'R' : null;
  if (k && k.startsWith('FP') && !keys.includes(k)) k = keys.includes('FP') ? 'FP' : keys.find(x => x.startsWith('FP')) || null;
  return k && keys.includes(k) ? k : null;
}
/** Where a result belongs: the round at that circuit this weekend is, or the next one not yet logged there. */
function placeGameResult(c, r) {
  const s = latestSeason(); if (!s || isHist(s)) return { error: 'There is no season to log into.' };
  const tid = GAME_TRACKS[r.track];
  const rounds = activeRounds(s).filter(x => trackOf(x) === tid);
  if (!rounds.length) return { error: `${D.TRACKS[tid]?.circuit || 'This circuit'} is not on your ${s.year} calendar.`, s };
  const round = rounds.find(x => s.weekends[x.id]?.game?.weekend === r.weekendLink)
    || rounds.find(x => { const k = gameKey(r, sessionsFor(s, x)); return k && !s.weekends[x.id]?.sessions?.[k]?.done; })
    || rounds.find(x => !s.weekends[x.id]?.sessions?.R?.done) || rounds[0];
  const key = gameKey(r, sessionsFor(s, round));
  if (!key) return { error: `${GAME_SESSION_NAMES[r.sessionType] || 'This session'} is not one you log for ${round.name} (check practice in Settings).`, s, round, skip: r.sessionType <= 4 };
  return { s, round, key };
}
/** Game cars → Pitwall drivers: the player car is you; then race number, then name. */
function mapGameDrivers(c, s, r) {
  const grid = gridIds(s); const used = new Set(); const map = {}; const unmatched = [];
  const take = (car, id) => { if (id) { used.add(id); map[car.idx] = id; } else unmatched.push(car); };
  const cars = r.cars.slice().sort((a, b) => (b.idx === r.player) - (a.idx === r.player));
  for (const car of cars) {
    let id = car.idx === r.player && grid.includes(PLAYER_ID) && !isPrincipal(c) ? PLAYER_ID : null;
    id ||= grid.find(d => !used.has(d) && car.number && s.drivers[d]?.number === car.number && (!car.name || sameDriver(s.drivers[d]?.name, car.name) || d === PLAYER_ID));
    id ||= grid.find(d => !used.has(d) && car.name && sameDriver(d === PLAYER_ID ? `${c.profile.first} ${c.profile.last}` : s.drivers[d]?.name, car.name));
    id ||= grid.find(d => !used.has(d) && car.number && s.drivers[d]?.number === car.number);
    take(car, id);
  }
  // one car left over and one driver left over: that's them, whatever the game called the car
  const free = grid.filter(d => !used.has(d) && !(d === PLAYER_ID && isPrincipal(c)));
  if (unmatched.length === 1 && free.length === 1) { map[unmatched[0].idx] = free[0]; unmatched.length = 0; }
  return { map, unmatched: unmatched.map(car => car.name || (car.number ? `#${car.number}` : `car ${car.idx + 1}`)) };
}
/** The session's results in Pitwall's shape. */
function gameRows(r, key, map, grid) {
  const race = isRaceKind(key);
  const order = r.cars.filter(x => map[x.idx]).sort((a, b) => a.position - b.position);
  const lead = order[0]; const ms = (x) => Math.round((x.total + x.penalty) * 1000); // the game gives race time in seconds
  const pole = Math.min(...order.map(x => x.best).filter(Boolean));
  const rows = order.map((x, i) => {
    const row = { d: map[x.idx], lap: x.best ? fmtLap(x.best) : '', gap: '', st: 'FIN', laps: '' };
    if (race) {
      row.st = GAME_STATUS[x.status] || 'DNS';
      if (row.st === 'FIN') {
        const down = lead.laps - x.laps;
        if (i > 0 && down > 0) row.laps = down;
        else row.gap = i === 0 ? fmtDur(ms(lead)) : fmtDur(ms(x) - ms(lead), true);
      }
    } else {
      if (!x.best) row.st = 'DNS';
      else if (i > 0 && isFinite(pole)) row.gap = '+' + ((x.best - pole) / 1000).toFixed(3);
    }
    return row;
  });
  for (const d of grid) if (!rows.some(x => x.d === d)) rows.push({ d, lap: '', gap: '', st: 'DNS', laps: '' });
  return rows;
}
// which part of a three-part qualifying (or sprint shootout) a game session is
const QUALI_PARTS = { 5: 1, 6: 2, 7: 3, 10: 1, 11: 2, 12: 3 };
/**
 * Merge the parts of a three-part qualifying. Whoever was knocked out keeps their time and place (locked to the
 * driver). The places above the last part that was logged are provisional: their times belong to the place, and the
 * starting grid later says who was in each one. parts: { 1|2|3: [{ d, best }] } in classification order.
 */
function mergeQuali(parts, n) {
  const out = Math.ceil((n - 10) / 2); const cut1 = n - out, cut2 = 10; // 20 cars: 5 out in Q1, 5 in Q2, 10 in Q3
  const rows = Array(n).fill(null); const placed = new Set();
  const put = (p, src) => { const x = src?.[p]; if (x?.d && !placed.has(x.d)) { rows[p] = { d: x.d, best: x.best, lock: 'driver' }; placed.add(x.d); } };
  for (let p = cut1; p < n; p++) put(p, parts[1]);
  for (let p = cut2; p < cut1; p++) put(p, parts[2]);
  for (let p = 0; p < cut2; p++) put(p, parts[3]);
  const latest = parts[3] || parts[2] || parts[1];
  const rest = latest.filter(x => x.d && !placed.has(x.d)); let k = 0;
  for (let p = 0; p < n; p++) if (!rows[p] && rest[k]) { rows[p] = { d: rest[k++].d, best: latest[p]?.best || 0, lock: 'place' }; }
  return rows.filter(Boolean);
}
/** Qualifying rows in Pitwall's shape, from merged rows ({ d, best }). */
function qualiRows(rows, grid) {
  const pole = rows.find(x => x.best)?.best;
  const out = rows.map((x, i) => ({ d: x.d, lap: x.best ? fmtLap(x.best) : '', gap: x.best && i > 0 && pole ? '+' + ((x.best - pole) / 1000).toFixed(3) : '', st: 'FIN', laps: '' }));
  for (const d of grid) if (!out.some(x => x.d === d)) out.push({ d, lap: '', gap: '', st: 'DNS', laps: '' });
  return out;
}
/** The qualifying session a race's starting grid settles: the sprint shootout for a sprint, qualifying for the race. */
const qualiFor = (r) => r.sessionType === 15 && r.weekend?.includes(16) ? 'SQ' : 'Q';
/**
 * Settle provisional qualifying places from the starting grid: the provisional drivers take the places in grid order
 * and inherit each place's time. A driver who starts behind the knocked-out drivers has a grid penalty: their own time
 * was never known, so they go to the back of the provisional places without one.
 */
/**
 * Lap times for qualifying places the game never timed (the parts after you were knocked out, or a skipped session).
 * Pole improves on the last part's best lap: 0.2-0.4 s if you went out in Q2, 0.4-0.7 s if in Q1. Behind it, each
 * driver's gap to the car ahead is the difference in their season qualifying pace (Antonelli 0.04 s off Russell on
 * average is about 0.04 s behind); a driver ahead of someone quicker on paper keeps the gap under 0.15 s, so a
 * surprise result doesn't skew the pace tables.
 */
function provisionalTimes(s, ids, pole, seed) {
  const rnd = mulberry(seed); const P = driverPaceTable(s, 'quali');
  const rels = Object.fromEntries(P.rows.filter(o => o.rel != null).map(o => [o.id, o.rel]));
  const slow = Math.max(0, ...Object.values(rels)) + 300;
  const rel = (d) => rels[d] ?? slow;
  const out = []; let prev = null;
  ids.forEach((d, i) => {
    if (!i) { out.push(Math.round(pole)); prev = d; return; }
    const diff = rel(d) - rel(prev);
    const gap = diff > 0 ? Math.max(8, diff + gauss(rnd) * 25) : 10 + rnd() * 140;
    out.push(Math.round(out[i - 1] + gap)); prev = d;
  });
  return out;
}
/** Pole for the parts that weren't timed: quicker than the last timed part's best by an amount that depends on it. */
const provisionalPole = (best, part, rnd) => best - (part === 2 ? 200 + rnd() * 200 : 400 + rnd() * 300);
function settleQuali(s, round, qk, slot) {
  const sd = s.weekends[round.id]?.sessions?.[qk]; const g = sd?.game;
  if (!g?.parts || !g.provisional) return false;
  const k = g.provisional; const top = sd.results.slice(0, k);
  const ok = top.filter(x => slot[x.d] && slot[x.d] <= k).sort((a, b) => slot[a.d] - slot[b.d]);
  const pen = top.filter(x => !ok.includes(x));
  // the grid says who was where: work the times out again in that order, from the same pole
  const times = g.pole ? provisionalTimes(s, ok.map(x => x.d), g.pole, `${round.id}-${qk}-grid`) : (g.placeTimes || top.map(x => parseLap(x.lap) || 0));
  const rows = [...ok.map((x, i) => ({ d: x.d, best: times[i] })), ...pen.map(x => ({ d: x.d, best: 0 }))];
  const pole = rows[0]?.best;
  sd.results = [...rows.map((x, i) => ({ d: x.d, lap: x.best ? fmtLap(x.best) : '', gap: x.best && i > 0 && pole ? '+' + ((x.best - pole) / 1000).toFixed(3) : '', st: 'FIN', laps: '' })), ...sd.results.slice(k)];
  g.provisional = 0; g.grid = slot; g.settled = true;
  return true;
}
/** Practice that wasn't logged, estimated from qualifying: much the same order, about seven tenths slower. */
function estimatePractice(s, round, qk) {
  const keys = sessionsFor(s, round); const before = keys.slice(0, keys.indexOf(qk)).filter(k => k.startsWith('FP'));
  const w = s.weekends[round.id]; const q = w?.sessions?.[qk]; if (!q) return;
  const known = q.results.filter(x => parseLap(x.lap));
  const slowest = Math.max(0, ...known.map(x => parseLap(x.lap)));
  before.forEach((k, n) => {
    const cur = w.sessions[k]; if (cur?.done && !cur.estimated) return;
    const rnd = mulberry(`${round.id}-${k}-${q.game?.key || ''}`);
    const lag = [900, 760, 650][Math.min(n, 2)] - (before.length === 1 ? 100 : 0);
    const rows = q.results.map(x => ({ d: x.d, ms: (parseLap(x.lap) || slowest + 400) + lag + gauss(rnd) * 220 })).sort((a, b) => a.ms - b.ms);
    w.sessions[k] = { results: rows.map((x, i) => ({ d: x.d, lap: fmtLap(x.ms), gap: i ? '+' + ((x.ms - rows[0].ms) / 1000).toFixed(3) : '', st: 'FIN' })), fl: null, done: true, estimated: true };
  });
}
/** Log a game result into a session (keeping what was there, for undo). */
function applyGameResult(c, r, place) {
  const { s, round, key } = place;
  const { map, unmatched } = mapGameDrivers(c, s, r);
  const w = weekend(s, round.id, true);
  const prev = w.sessions[key] ? JSON.stringify(w.sessions[key]) : null; const prevLen = w.raceLength;
  const byId = (pick) => Object.fromEntries(r.cars.filter(x => map[x.idx]).map(x => [map[x.idx], pick(x)]));
  const game = { key: r.key, at: r.at, sessionType: r.sessionType, totalLaps: r.totalLaps,
    laps: byId(x => x.lapTimes), stints: byId(x => x.stints.map(t => [t.visual, Math.min(t.end, x.laps || t.end)])), pits: byId(x => x.pits), grid: byId(x => x.grid),
    wear: byId(x => x.wear || []), finished: byId(x => x.laps),
    penalties: r.penaltyEvents.filter(p => map[p.car] && (PENALTY_NAMES[p.type] || p.type === WARNING)).map(p => ({ d: map[p.car], type: p.type, infr: p.infringement, time: p.time, lap: p.lap, other: map[p.other] || null, t: p.t ?? null })),
    incidents: buildIncidents(r, map),
    ...(isRaceKind(key) && Array.isArray(r.overtakes) ? { overtakes: r.overtakes.filter(x => map[x.a] && map[x.b]).map(x => [map[x.a], map[x.b], x.lap || 0]), passSource: r.passSource || null } : {}),
    safety: { sc: r.safetyCars, vsc: r.virtualSafetyCars, red: r.redFlags } };
  let results;
  const part = QUALI_PARTS[r.sessionType];
  if (part) {
    // a three-part qualifying: this part joins the ones already logged this weekend
    const old = w.sessions[key]?.game; const same = old?.parts && w.game?.weekend === r.weekendLink;
    game.parts = { ...(same ? old.parts : {}), [part]: r.cars.slice().sort((a, b) => a.position - b.position).map(x => ({ d: map[x.idx] || null, best: x.best })) };
    const rows = mergeQuali(game.parts, r.cars.length);
    game.provisional = rows.filter(x => x.lock === 'place').length;
    if (game.provisional) {
      // the parts after this one weren't timed: a quicker pole, and gaps from each driver's season pace
      const latest = Math.max(...Object.keys(game.parts).map(Number));
      const best = Math.min(...game.parts[latest].map(x => x.best).filter(Boolean));
      if (isFinite(best) && latest < 3) {
        game.pole = Math.round(provisionalPole(best, latest, mulberry(`${round.id}-${key}-pole-${r.key}`)));
        const tt = provisionalTimes(s, rows.slice(0, game.provisional).map(x => x.d), game.pole, `${round.id}-${key}-merge`);
        tt.forEach((v, i) => { rows[i].best = v; });
      }
    }
    game.placeTimes = rows.slice(0, game.provisional).map(x => x.best);
    game.locks = Object.fromEntries(rows.map(x => [x.d, x.lock]));
    results = qualiRows(rows, gridIds(s));
  } else if ((key === 'Q' || key === 'SQ') && r.cars.every(x => !x.best)) {
    const ids = r.cars.slice().sort((a, b) => a.position - b.position).map(x => map[x.idx]).filter(Boolean);
    const ideal = Object.values(idealLaps(s, round)).map(o => o.ideal);
    const tk = D.TRACKS[trackOf(round)]; const pole = ideal.length ? Math.min(...ideal) - 400 : (parseLap(tk?.record?.[0]) || 90000) * 1.01;
    const tt = provisionalTimes(s, ids, pole, `${round.id}-${key}-skip`);
    results = qualiRows(ids.map((d, i) => ({ d, best: tt[i] })), gridIds(s)); game.simulated = true;
  } else results = gameRows(r, key, map, gridIds(s));
  w.sessions[key] = { results, fl: null, done: true, game };
  w.game = { weekend: r.weekendLink };
  if (key === 'Q' || key === 'SQ') estimatePractice(s, round, key);
  // a race or sprint also settles its qualifying, if Pitwall didn't catch the start
  if (isRaceKind(key)) { const slot = byId(x => x.grid); if (Object.values(slot).some(Boolean)) settleQuali(s, round, key === 'SPR' ? 'SQ' : 'Q', slot); }
  // the race distance you ran, from the laps
  if (key === 'R' && r.totalLaps) { const full = D.TRACKS[trackOf(round)]?.laps; if (full) w.raceLength = RACE_LENGTHS.reduce((a, b) => Math.abs(b - r.totalLaps / full * 100) < Math.abs(a - r.totalLaps / full * 100) ? b : a); }
  (c.gameKeys ||= []).push(r.key); c.gameKeys = c.gameKeys.slice(-300);
  const prov = w.sessions[key].game.provisional;
  gameNotice = { careerId: c.id, seasonIdx: s.index, roundId: round.id, key, prev, prevLen, label: `${round.name} ${SESSION_LABEL[key]}${part ? ` (part ${part})` : ''}`, unmatched,
    note: prov ? `The top ${prov} are provisional until the ${key === 'SQ' ? 'sprint' : 'race'} starts: the starting grid will put them in order.` : '' };
  store.save(); render();
  toast(`${round.name} ${SESSION_LABEL[key]} logged from F1 25`);
}
/** A race or sprint has started: its grid puts provisional qualifying places in order. */
function applyGameGrid(c, r) {
  const s = latestSeason(); if (!s || isHist(s)) return;
  const qk = qualiFor(r); const tid = GAME_TRACKS[r.track];
  const rounds = activeRounds(s).filter(x => trackOf(x) === tid);
  const round = rounds.find(x => s.weekends[x.id]?.game?.weekend === r.weekendLink) || rounds.find(x => s.weekends[x.id]?.sessions?.[qk]?.game?.provisional);
  if (!round) return;
  const { map } = mapGameDrivers(c, s, r);
  const slot = Object.fromEntries(r.cars.filter(x => map[x.idx] && x.grid).map(x => [map[x.idx], x.grid]));
  (c.gameKeys ||= []).push(r.key);
  if (settleQuali(s, round, qk, slot)) { store.save(); render(); toast(`${round.name} ${SESSION_LABEL[qk]} order set from the starting grid`); }
}
/** A finished session arrives from the game. */
function handleGameResult(r) {
  const c = career(); const done = () => window.api?.telemetry?.ack(r.key);
  if (!c || NOT_CAREER_MODES.includes(r.gameMode) || !r.cars?.length) { done(); return; }
  if ((c.gameKeys || []).includes(r.key)) { done(); return; } // already logged
  if (r.kind === 'grid') { applyGameGrid(c, r); done(); return; }
  const place = placeGameResult(c, r);
  if (place.error) { if (place.skip) { toast(place.error); done(); return; } gameQueue.push({ r, place, why: 'place' }); done(); nextGameDecision(); return; }
  const sd = place.s.weekends[place.round.id]?.sessions?.[place.key];
  const sameWeekend = place.s.weekends[place.round.id]?.game?.weekend === r.weekendLink && sd?.game;
  if (sd?.done && !sameWeekend && !sd.estimated) { gameQueue.push({ r, place, why: 'replace' }); done(); nextGameDecision(); return; }
  applyGameResult(c, r, place); done();
}
/** Ask about the next waiting result, once no other dialog is open. */
function nextGameDecision() {
  if (!gameQueue.length) return;
  if ($('#modal-root').innerHTML) { setTimeout(nextGameDecision, 3000); return; }
  const q = gameQueue[0]; const c = career(); const s = latestSeason();
  const what = `${D.TRACKS[GAME_TRACKS[q.r.track]]?.circuit || 'Unknown circuit'} · ${GAME_SESSION_NAMES[q.r.sessionType] || 'Session'}`;
  ui.modal = { kind: 'game' };
  if (q.why === 'replace') modal(`<div class="modal-h"><h2>Results from F1 25</h2></div><div class="modal-b"><p><b>${esc(what)}</b> has finished in the game, but you have already logged ${esc(q.place.round.name)} ${esc(SESSION_LABEL[q.place.key])}.</p><p class="muted">Replace your logged results with the game’s?</p></div>
    <div class="modal-f"><button class="btn ghost" data-act="game-skip">Keep mine</button><button class="btn primary" data-act="game-apply">Replace</button></div>`);
  else {
    const rounds = activeRounds(s);
    modal(`<div class="modal-h"><h2>Results from F1 25</h2></div><div class="modal-b"><p><b>${esc(what)}</b> has finished in the game. ${esc(q.place.error)}</p>
      <div class="form-grid"><label class="field"><span>Round</span><select id="game-round">${rounds.map(x => `<option value="${x.id}">${esc(x.name)}${s.weekends[x.id]?.sessions?.R?.done ? ' (logged)' : ''}</option>`).join('')}</select></label>
      <label class="field"><span>Session</span><select id="game-key">${['FP1', 'FP2', 'FP3', 'FP', 'SQ', 'SPR', 'Q', 'R'].map(k => `<option value="${k}" ${k === (q.r.sessionType >= 15 ? 'R' : q.r.sessionType >= 10 ? 'SQ' : q.r.sessionType >= 5 ? 'Q' : 'FP1') ? 'selected' : ''}>${SESSION_LABEL[k]}</option>`).join('')}</select></label></div></div>
      <div class="modal-f"><button class="btn ghost" data-act="game-skip">Skip</button><button class="btn primary" data-act="game-apply">Log it here</button></div>`);
  }
}
/** The banner after an import: where it went, who couldn't be matched, and undo. */
function gameNoticeHtml() {
  const g = gameNotice; const c = career(); if (!g || g.careerId !== c?.id) return '';
  return `<div class="callout game-notice"><span>${ICON.flag} <b>${esc(g.label)}</b> logged from F1 25.${g.note ? ' ' + esc(g.note) : ''}${g.unmatched.length ? ` Not matched to a driver on your grid: ${esc(listJoin(g.unmatched))}.` : ''}</span>
    <span class="row" style="gap:6px"><button class="btn sm" data-act="game-open">Open</button><button class="btn sm ghost" data-act="game-undo">Undo</button><button class="icon-btn" title="Dismiss" data-act="game-dismiss">${ICON.x}</button></span></div>`;
}
/** Settings: the connection to the game. */
function renderTelemetryPanel() {
  if (!window.api?.telemetry) return window.api?.companion === true ? '' : `<div class="panel"><div class="panel-h"><h2>F1 25 telemetry</h2></div><div class="panel-b muted">Available in the desktop app.</div></div>`;
  const t = telemetryStatus || {};
  const ago = t.lastAt ? Math.round((Date.now() - Date.parse(t.lastAt)) / 1000) : null;
  const live = t.listening && ago != null && ago < 10;
  return `<div class="panel"><div class="panel-h"><div><h2>F1 25 telemetry</h2><span class="muted" style="font-size:12px">Logs results straight from the game when a session ends</span></div>
      <span class="row" style="gap:6px"><span class="status-dot ${live ? 'ok' : t.listening ? 'warn' : ''}"></span><span class="muted" style="font-size:12px">${t.error ? 'Problem' : live ? `Receiving F1 25 data (${t.format === 2026 ? '2026 Season Pack' : 'F1 25'})` : t.listening ? (t.lastAt ? `Last data ${ago < 120 ? ago + ' s' : Math.round(ago / 60) + ' min'} ago` : 'Listening, nothing received yet') : 'Off'}</span></span></div>
    <div class="panel-b stack">
      ${t.error ? `<div class="callout" style="border-left-color:var(--red)">${esc(t.error)}</div>` : ''}
      <div class="row" style="gap:12px;flex-wrap:wrap"><label class="check"><input type="checkbox" id="tm-on" ${t.enabled ? 'checked' : ''}> Listen for F1 25</label>
        <label class="row" style="gap:6px">Port <input type="number" id="tm-port" min="1024" max="65535" value="${t.port || 20778}" style="width:100px"></label>
        <button class="btn sm primary" data-act="tm-save">Save</button></div>
      <div class="muted" style="font-size:13px;line-height:1.5">In F1 25: <b>Settings → Telemetry Settings</b>: UDP Telemetry <b>On</b>, UDP Broadcast Mode <b>Off</b>, UDP Format <b>2025</b>, Send Rate 20 Hz or more.
        Then either send it straight here (UDP IP Address <b>127.0.0.1</b> if the game runs on this PC, otherwise this PC's network address; UDP Port the same as above),
        or, if another app (your wheel's software, say) already receives it, have that app forward it to this PC on the port above. Pitwall only has to be open when a session ends.</div>
      ${t.session ? `<div class="muted" style="font-size:12px">Current session: ${esc(D.TRACKS[GAME_TRACKS[t.session.track]]?.circuit || 'unknown circuit')} · ${esc(GAME_SESSION_NAMES[t.session.sessionType] || 'session')}${NOT_CAREER_MODES.includes(t.session.gameMode) ? ' · not a career session, so it won’t be logged' : ''}</div>` : ''}
    </div></div>`;
}
/** A driver's tyre stints from the game, cleaned up: [{ c: compound, from, to }]. Older imports could end the last
 *  stint on lap 255 (the game's "still running"); it really ends on the driver's last lap. */
function stintsOf(sd, d) {
  const g = sd?.game; const raw = g?.stints?.[d] || []; const n = g?.laps?.[d]?.length || g?.finished?.[d] || 0;
  const out = []; let from = 1;
  for (const [c, end0] of raw) {
    const end = Math.min(end0 >= 200 || (n && end0 > n) ? n || end0 : end0, n || end0);
    if (end < from) continue;
    out.push({ c, from, to: end }); from = end + 1;
  }
  return out;
}
/** Race pace from the game's laps: the average of each driver's clean laps (no lap 1, no laps in or out of the pits,
 *  nothing more than 4% off their own median, which leaves out safety cars and incidents). */
function cleanLapPace(sd, d) {
  const laps = sd.game?.laps?.[d]; if (!laps || laps.length < 4) return null;
  const pit = new Set(stintsOf(sd, d).slice(0, -1).flatMap(x => [x.to, x.to + 1]));
  const pool = laps.map(([ms], k) => ({ ms, lap: k + 1 })).filter(x => x.lap > 1 && !pit.has(x.lap) && x.ms > 0);
  if (pool.length < 3) return null;
  const sorted = pool.map(x => x.ms).sort((a, b) => a - b); const med = sorted[Math.floor(sorted.length / 2)];
  const clean = sorted.filter(ms => ms <= med * 1.04);
  return clean.length >= 3 ? avg(clean) : null;
}
const tyreChip = (c, len, title = '') => { const cp = COMPOUNDS[c] || ['?', 'Unknown', '#5E6A82']; return `<span class="tyre-chip" style="--c:${cp[2]}" title="${esc(title || cp[1])}">${cp[0]}${len != null ? `<small>${len}</small>` : ''}</span>`; };
/** Tyres, stops and penalties from the game. Each driver opens their lap-by-lap view. */
/** A tyre, Pirelli style: the compound's colour as the sidewall band, its letter in the middle. */
const tyreIcon = (c, size = 28) => { const cp = COMPOUNDS[c] || ['?', 'Unknown', '#5E6A82']; return `<span class="tyre-ic" style="--c:${cp[2]};--sz:${size}px" title="${esc(cp[1])}"><b>${cp[0]}</b></span>`; };
/**
 * A race strategy as one bar, the way Pirelli draws them: each stint in its compound's colour, blending into the next
 * at the stop, with the stop lap (or pit window) and the new tyre at each change and a label at the end.
 * stints: [{ c, from, to }]; windows: per stop [lo, hi] (optional); compact for table rows.
 */
function stintBar(stints, total, { label = '', windows = null, compact = false } = {}) {
  if (!stints.length) return '';
  const N = total || stints[stints.length - 1].to; const pc = (lap) => Math.max(0, Math.min(100, lap / N * 100));
  const col = (c) => (COMPOUNDS[c] || [])[2] || '#5E6A82';
  const blend = compact ? 1.5 : 3;
  const stops = []; let g = `linear-gradient(90deg, rgba(0,0,0,0) 0%, ${col(stints[0].c)} ${compact ? 2 : 7}%`;
  stints.forEach((st, k) => {
    if (k === 0) return;
    const p = pc(stints[k - 1].to);
    g += `, ${col(stints[k - 1].c)} ${Math.max(0, p - blend).toFixed(1)}%, ${col(st.c)} ${Math.min(100, p + blend).toFixed(1)}%`;
    stops.push({ p, lap: stints[k - 1].to, c: st.c, prev: stints[k - 1].c, w: windows?.[k - 1] });
  });
  g += `, ${col(stints[stints.length - 1].c)} 100%)`;
  const light = (c) => c === 18 || c === 17; // dark text on the white and yellow tyres
  const size = compact ? 18 : 30;
  return `<div class="stint-bar ${compact ? 'compact' : ''}" style="background:${g}">
    ${stops.map(o => `<div class="sb-stop ${o.p < 22 ? 'flip' : ''}" style="left:${o.p.toFixed(1)}%"><span class="sb-lap ${light(o.p < 22 ? o.c : o.prev) ? 'dark' : ''}">${compact ? `L${o.lap}` : o.w && o.w[0] !== o.w[1] ? `Lap <b>${o.w[0]}</b> to <b>${o.w[1]}</b>` : `Lap <b>${o.lap}</b>`}</span>${tyreIcon(o.c, size)}</div>`).join('')}
    ${compact ? '' : `<div class="sb-end">${tyreIcon(stints[stints.length - 1].c, size)}</div>`}
  </div>`;
}
function strategyPanel(s, sd, key, roundId) {
  const g = sd?.game; if (!g?.laps) return '';
  const race = isRaceKind(key);
  const pens = (d) => (g.penalties || []).filter(p => p.d === d && PENALTY_NAMES[p.type]);
  return `<div class="panel"><div class="panel-h"><h2>${race ? 'Strategy & penalties' : 'Runs & tyres'}</h2><span class="muted" style="font-size:12px">From F1 25${race && g.safety ? ` · ${plural(g.safety.sc || 0, 'safety car')}, ${plural(g.safety.vsc || 0, 'virtual safety car')}${g.safety.red ? `, ${plural(g.safety.red, 'red flag')}` : ''}` : ''} · tap a driver for every lap</span></div>
    <div class="panel-b tight table-wrap"><table><thead><tr><th>Pos</th><th>Driver</th><th>${race ? 'Strategy' : 'Tyres (laps)'}</th>${race ? '<th class="num">Stops</th><th>Penalties</th>' : '<th class="num">Laps</th>'}<th class="num">${race ? 'Clean-lap pace' : 'Best'}</th></tr></thead><tbody>
      ${sd.results.filter(x => g.laps[x.d]?.length).map((x, i) => { const p = race ? cleanLapPace(sd, x.d) : Math.min(...g.laps[x.d].map(l => l[0]).filter(Boolean)); return `<tr class="${x.d === PLAYER ? 'me' : ''}" data-act="gd-open" data-round="${roundId}" data-key="${key}" data-d="${x.d}" style="cursor:pointer"><td class="num">${OUT.includes(x.st) ? x.st : i + 1}</td><td>${drvCell(s, x.d, { team: true })}</td>
        <td style="${race ? 'min-width:260px;width:40%' : ''}">${race ? stintBar(stintsOf(sd, x.d), Math.max(...Object.keys(g.laps).map(d => stintsOf(sd, d).at(-1)?.to || 0)), { compact: true }) : `<div class="row" style="gap:4px;flex-wrap:nowrap">${stintsOf(sd, x.d).map(st => tyreChip(st.c, st.to - st.from + 1, `${(COMPOUNDS[st.c] || [])[1] || 'Tyre'}, laps ${st.from}–${st.to}`)).join('')}</div>`}</td>
        ${race ? `<td class="num">${g.pits?.[x.d] ?? '–'}</td><td class="muted" style="font-size:12px">${pens(x.d).map(q => `${q.type === 4 ? `${q.time} s` : PENALTY_NAMES[q.type]}${INFRINGEMENTS[q.infr] ? ` for ${INFRINGEMENTS[q.infr]}` : ''}${q.lap ? ` (lap ${q.lap})` : ''}`).join(', ') || '–'}</td>` : `<td class="num">${g.laps[x.d].length}</td>`}
        <td class="num mono">${p && isFinite(p) ? fmtLap(p) : '–'}</td></tr>`; }).join('')}
    </tbody></table></div>${race ? battlesFooter(s, sd) : ''}</div>`;
}
/** Under the race strategy table: the battles (pairs who swapped places five or more times) and who passed most. */
function battlesFooter(s, sd) {
  const B = raceBattles(sd), P = racePasses(sd); if (!P) return '';
  const nm = (d) => esc(lastName(dName(s, d)));
  const top = Object.entries(P.made).sort((a, b) => b[1] - a[1]).slice(0, 3);
  return `<div class="panel-b battles-foot"><div><span class="label">Battles</span> ${B.length ? B.slice(0, 6).map(b => `<span class="battle-chip"><b>${nm(b.ahead)}</b> v ${nm(b.behind)} · ${b.n} passes${b.to > b.from ? `, laps ${b.from}–${b.to}` : ''}</span>`).join('') : '<span class="muted">Nobody swapped places five times or more.</span>'}</div>
    <div class="muted">${P.total === 1 ? '1 pass' : `${P.total} passes`} in all${top.length ? `. Most made: ${top.map(([d, n]) => `${nm(d)} ${n}`).join(', ')}` : ''}.${sd.game.passSource === 'positions' ? ' (From position changes: the game sent no overtake events.)' : ''}</div></div>`;
}
/** A small line chart: series [{ color, pts: [[x, y]], dashed, label }]. */
function svgChart(series, { h = 180, yFmt = (v) => v, invert = false, xLabel = 'Lap' } = {}) {
  const all = series.flatMap(s => s.pts); if (!all.length) return '<div class="empty">No data</div>';
  const W = 640, P = { l: 56, r: 12, t: 10, b: 26 };
  const xs = all.map(p => p[0]), ys = all.map(p => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs, x0 + 1); let y0 = Math.min(...ys), y1 = Math.max(...ys); if (y1 - y0 < 1e-6) { y0 -= 1; y1 += 1; }
  const pad = (y1 - y0) * 0.08; y0 = y0 >= 0 ? Math.max(0, y0 - pad) : y0 - pad; y1 += pad;
  const X = (v) => P.l + (v - x0) / (x1 - x0) * (W - P.l - P.r);
  const Y = (v) => invert ? P.t + (v - y0) / (y1 - y0) * (h - P.t - P.b) : h - P.b - (v - y0) / (y1 - y0) * (h - P.t - P.b);
  const ticks = [0, 0.5, 1].map(k => y0 + (y1 - y0) * k);
  return `<svg class="g-chart" viewBox="0 0 ${W} ${h}" preserveAspectRatio="none" style="width:100%;height:${h}px">
    ${ticks.map(v => `<line x1="${P.l}" x2="${W - P.r}" y1="${Y(v)}" y2="${Y(v)}" class="g-grid"/><text x="${P.l - 6}" y="${Y(v) + 4}" text-anchor="end" class="g-tick">${esc(yFmt(v))}</text>`).join('')}
    <text x="${W - P.r}" y="${h - 6}" text-anchor="end" class="g-tick">${xLabel} ${Math.round(x1)}</text><text x="${P.l}" y="${h - 6}" class="g-tick">${Math.round(x0)}</text>
    ${series.map(s => `<polyline fill="none" stroke="${s.color}" stroke-width="2" ${s.dashed ? 'stroke-dasharray="5 4" opacity=".7"' : ''} points="${s.pts.map(p => `${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join(' ')}"/>${s.dots ? s.pts.map(p => `<circle cx="${X(p[0]).toFixed(1)}" cy="${Y(p[1]).toFixed(1)}" r="2.5" fill="${s.color}"/>`).join('') : ''}`).join('')}
  </svg>`;
}
/** Least-squares line through [[x, y]]: { a: intercept, b: slope }. */
function fitLine(pts) {
  const n = pts.length; if (n < 2) return null;
  const mx = avg(pts.map(p => p[0])), my = avg(pts.map(p => p[1]));
  const sxx = pts.reduce((a, p) => a + (p[0] - mx) ** 2, 0); if (!sxx) return null;
  const b = pts.reduce((a, p) => a + (p[0] - mx) * (p[1] - my), 0) / sxx;
  return { a: my - b * mx, b };
}
const WEAR_LIMIT = 70; // % wear at which a tyre is considered done
/** One driver's session from the game: every lap, the lap-time graph and tyre wear by stint (with where practice
 *  runs were heading). */
function gameDriverModal(roundId, key, d) {
  const s = curSeason(); const sd = s.weekends[roundId]?.sessions?.[key]; const g = sd?.game; if (!g?.laps?.[d]) return;
  const laps = g.laps[d]; const wear = g.wear?.[d] || []; const st = stintsOf(sd, d); const practice = key.startsWith('FP');
  const compOf = (lap) => st.find(x => lap >= x.from && lap <= x.to);
  const med = [...laps.map(l => l[0]).filter(Boolean)].sort((a, b) => a - b)[Math.floor(laps.length / 2)] || 0;
  const lapPts = laps.map((l, k) => [k + 1, l[0] / 1000]).filter(p => p[1] > 0 && p[1] * 1000 <= med * 1.12);
  const wearSeries = []; const life = [];
  for (const x of st) {
    const pts = []; for (let lap = x.from; lap <= x.to; lap++) if (wear[lap - 1] != null) pts.push([lap - x.from + 1, wear[lap - 1]]);
    if (!pts.length) continue;
    const col = (COMPOUNDS[x.c] || [])[2] || '#8B97AF';
    wearSeries.push({ color: col, pts, dots: true });
    const fit = fitLine(pts);
    if (practice && fit && fit.b > 0.05) {
      const end = Math.min(80, Math.ceil((WEAR_LIMIT - fit.a) / fit.b));
      if (end > pts[pts.length - 1][0]) wearSeries.push({ color: col, dashed: true, pts: [pts[pts.length - 1], [end, fit.a + fit.b * end]] });
      life.push(`${(COMPOUNDS[x.c] || [])[1] || 'Tyre'} (laps ${x.from}–${x.to}): ${fit.b.toFixed(1)}% a lap, about ${Math.max(end, pts.length)} laps to ${WEAR_LIMIT}%`);
    }
  }
  ui.modal = { kind: 'gd' };
  modal(`<div class="modal-h"><h2>${esc(dName(s, d))} · ${esc(SESSION_LABEL[key])}</h2><button class="icon-btn" data-act="modal-close">${ICON.x}</button></div>
    <div class="modal-b stack">
      <div class="row" style="gap:6px">${st.map(x => tyreChip(x.c, x.to - x.from + 1)).join('')}<span class="muted" style="font-size:12px">${plural(laps.length, 'lap')}${g.pits?.[d] != null ? ` · ${plural(g.pits[d], 'stop')}` : ''}</span></div>
      <div><span class="label">Lap times</span>${svgChart([{ color: 'var(--team)', pts: lapPts, dots: true }], { yFmt: (v) => fmtLap(v * 1000), invert: true })}</div>
      <div><span class="label">Tyre wear by stint${practice ? ' (dashed: where each run was heading)' : ''}</span>${wearSeries.length ? svgChart(wearSeries, { yFmt: (v) => v.toFixed(0) + '%', xLabel: 'Tyre age' }) : '<div class="muted" style="font-size:13px">No tyre wear recorded for this session (it was logged before Pitwall 1.9.1).</div>'}
        ${life.length ? `<div class="muted" style="font-size:12px;display:grid;gap:2px;margin-top:4px">${life.map(x => `<span>${esc(x)}</span>`).join('')}</div>` : ''}</div>
      <div class="table-wrap" style="max-height:260px;overflow:auto"><table><thead><tr><th class="num">Lap</th><th>Tyre</th><th class="num">Time</th><th class="num">Wear</th><th></th></tr></thead><tbody>
        ${laps.map((l, k) => { const x = compOf(k + 1); const pit = st.some(y => y.to === k + 1 && y !== st[st.length - 1]); return `<tr><td class="num">${k + 1}</td><td>${x ? tyreChip(x.c, k + 2 - x.from) : ''}</td><td class="num mono ${l[1] ? '' : 'muted'}">${l[0] ? fmtLap(l[0]) : '–'}</td><td class="num">${wear[k] != null ? wear[k].toFixed(0) + '%' : '–'}</td><td class="muted" style="font-size:12px">${pit ? 'In-lap' : x && k + 1 === x.from && x.from > 1 ? 'Out-lap' : l[1] ? '' : 'Invalid'}</td></tr>`; }).join('')}
      </tbody></table></div>
    </div>`, 'wide');
}

/* Optimal race strategy from practice. Long runs on each compound give a base pace, how much slower each lap gets as
   the tyre ages (fall-off) and how fast it wears (which sets how long it lasts). Every one- and two-stop plan (three if
   the tyres can't last) is timed: laps × pace + fall-off as the tyres age + the time lost in the pits. Fuel burn is left
   out: it affects every plan the same. Two plans are worked out: one from the whole grid's practice, one from yours. */
const PIT_LOSS = 22000; // ms lost to a stop, pit lane included
const PRACTICE_KEYS = ['FP1', 'FP2', 'FP3', 'FP'];
const DRY = [16, 17, 18];
/** One driver's clean consecutive laps on each dry compound in this weekend's practice:
 *  { compound: { laps, base, deg, wear, life, ref } } (ref: their quickest practice lap, to compare drivers). */
function practiceRuns(s, round, d) {
  const w = s.weekends[round.id]; const out = {}; let ref = Infinity;
  for (const k of PRACTICE_KEYS) {
    const sd = w?.sessions?.[k]; if (!sd?.game || sd.estimated) continue;
    const laps = sd.game.laps?.[d]; if (!laps) continue; const wear = sd.game.wear?.[d] || [];
    for (const l of laps) if (l[0] && l[1]) ref = Math.min(ref, l[0]);
    for (const x of stintsOf(sd, d)) {
      if (!DRY.includes(x.c)) continue;
      const run = [];
      for (let lap = x.from + 1; lap <= x.to; lap++) { const l = laps[lap - 1]; if (l?.[0]) run.push({ age: lap - x.from + 1, ms: l[0], wear: wear[lap - 1] }); }
      if (run.length < 3) continue;
      // pushing laps: within 2.5% of the run's best (cool-down and traffic laps break the run)
      const best = Math.min(...run.map(r => r.ms)); let cur = [], longest = [];
      for (const r of run) { if (r.ms <= best * 1.025 && (!cur.length || r.age === cur[cur.length - 1].age + 1)) cur.push(r); else { if (cur.length > longest.length) longest = cur; cur = r.ms <= best * 1.025 ? [r] : []; } }
      if (cur.length > longest.length) longest = cur;
      if (longest.length < 3) continue;
      const pace = fitLine(longest.map(r => [r.age, r.ms])); const wr = fitLine(longest.filter(r => r.wear != null).map(r => [r.age, r.wear]));
      const deg = Math.max(0, pace?.b || 0);
      const life = wr && wr.b > 0.05 ? Math.floor((WEAR_LIMIT - wr.a) / wr.b) : null;
      const prev = out[x.c];
      if (!prev || longest.length > prev.laps) out[x.c] = { laps: longest.length, base: (pace?.a ?? avg(longest.map(r => r.ms))) + deg, deg, wear: wr?.b ?? null, life, session: k };
    }
  }
  for (const c in out) out[c].ref = isFinite(ref) ? ref : Math.min(...Object.values(out).map(x => x.base));
  return out;
}
/** The whole grid's practice runs, combined per compound: the typical fall-off, wear and life, and the pace as a gap
 *  to each driver's own quickest lap (so a fast car on softs and a slow car on hards don't skew the compounds). */
function gridRuns(s, round) {
  const w = s.weekends[round.id]; const drivers = new Set();
  for (const k of PRACTICE_KEYS) { const g = w?.sessions?.[k]?.game; if (g?.laps && !w.sessions[k].estimated) Object.keys(g.laps).forEach(d => drivers.add(d)); }
  const per = [...drivers].map(d => practiceRuns(s, round, d)).filter(x => Object.keys(x).length);
  const med = (xs) => { const v = xs.filter(x => x != null && isFinite(x)).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : null; };
  const ref = med(per.map(x => Object.values(x)[0].ref));
  const out = {};
  for (const c of DRY) {
    const rs = per.map(x => x[c]).filter(Boolean); if (!rs.length) continue;
    out[c] = { laps: rs.reduce((a, r) => a + r.laps, 0), drivers: rs.length, base: ref + med(rs.map(r => r.base - r.ref)), deg: med(rs.map(r => r.deg)), wear: med(rs.map(r => r.wear)), life: med(rs.map(r => r.life)) };
  }
  return out;
}
/** The quickest plans for a race of n laps, given the runs. */
function optimalStrategies(runs, n) {
  const comps = Object.keys(runs).map(Number); const res = [];
  const life = (c) => Math.max(3, Math.min(n, runs[c].life ?? Math.round(n * 0.7)));
  const stint = (c, L) => L * runs[c].base + runs[c].deg * L * (L - 1) / 2;
  const seqs = (len) => len === 1 ? comps.map(c => [c]) : seqs(len - 1).flatMap(q => comps.map(c => [...q, c]));
  for (let stops = 1; stops <= 3; stops++) {
    if (stops === 3 && res.length) break;
    for (const seq of seqs(stops + 1)) {
      if (new Set(seq).size < 2) continue; // two different dry compounds, as the rules require
      let best = null;
      const step = stops === 3 ? 2 : 1;
      const tryLens = (lens) => { if (lens.some((L, i) => L < 1 || L > life(seq[i]))) return; const tt = lens.reduce((a, L, i) => a + stint(seq[i], L), 0) + stops * PIT_LOSS; if (!best || tt < best.t) best = { t: tt, lens: [...lens] }; };
      if (stops === 1) for (let a = 1; a < n; a++) tryLens([a, n - a]);
      else if (stops === 2) for (let a = 1; a < n - 1; a++) for (let b = 1; a + b < n; b++) tryLens([a, b, n - a - b]);
      else for (let a = 1; a < n - 2; a += step) for (let b = 1; a + b < n - 1; b += step) for (let c = 1; a + b + c < n; c += step) tryLens([a, b, c, n - a - b - c]);
      if (best) {
        best.windows = best.lens.slice(0, -1).map((_, j) => {
          const at = best.lens.slice(0, j + 1).reduce((a, b) => a + b, 0); let lo = at, hi = at;
          for (let d = -20; d <= 20; d++) {
            const L2 = [...best.lens]; L2[j] += d; L2[j + 1] -= d;
            if (L2.some((L, i) => L < 1 || L > life(seq[i]))) continue;
            const tt = L2.reduce((a, L, i) => a + stint(seq[i], L), 0) + stops * PIT_LOSS;
            if (tt - best.t <= 2500) { lo = Math.min(lo, at + d); hi = Math.max(hi, at + d); }
          }
          return [lo, hi];
        });
        res.push({ stops, seq, ...best });
      }
    }
  }
  // the same stints in another order time the same (fuel is left out): keep one of them
  const seen = new Set();
  return res.sort((a, b) => a.t - b.t).filter(p => { const k = p.seq.map((c, i) => c + ':' + p.lens[i]).sort().join(); return !seen.has(k) && seen.add(k); }).slice(0, 3);
}
/** One strategy block: the quickest plans and the numbers behind them. */
function strategyBlock(title, runs, n, note) {
  const plans = optimalStrategies(runs, n);
  const fmtGap = (ms) => ms < 50 ? 'Fastest' : `+${(ms / 1000).toFixed(1)} s`;
  return `<div class="panel-b stack" style="gap:8px;border-top:1px solid var(--line)"><div class="row" style="justify-content:space-between"><span class="label" style="margin:0">${esc(title)}</span><span class="muted" style="font-size:12px">${esc(note)}</span></div>
    ${plans.length ? `<div class="strat-bars">${plans.map((p, i) => { let lap = 0; const st = p.seq.map((cp, k) => { const from = lap + 1; lap += p.lens[k]; return { c: cp, from, to: lap }; }); const word = ['', 'one', 'two', 'three'][p.stops] + '-stopper'; const name = i === 0 ? `<b>The quickest</b> ${word}` : p.t - plans[0].t < 3000 ? `<b>Very close</b> ${word}` : p.stops > plans[0].stops ? `<b>Aggressive</b> ${word}` : p.stops < plans[0].stops ? `<b>Conservative</b> ${word}` : `<b>Alternative</b> ${word}`; return `<div class="strat-row">${stintBar(st, n, { windows: p.windows })}<div class="strat-name"><span>${name}</span><small class="muted">${fmtGap(p.t - plans[0].t)}</small></div></div>`; }).join('')}</div>` : '<div class="muted" style="font-size:13px">No plan fits: on these runs the tyres would not last the distance.</div>'}
    <div class="table-wrap"><table><thead><tr><th>Tyre</th><th class="num">Pace</th><th class="num">Fall-off / lap</th><th class="num">Wear / lap</th><th class="num">Life</th></tr></thead><tbody>
      ${DRY.filter(cp => runs[cp]).map(cp => { const x = runs[cp]; return `<tr><td>${tyreChip(cp)} ${COMPOUNDS[cp][1]}</td><td class="num mono">${fmtLap(x.base)}</td><td class="num">+${(x.deg / 1000).toFixed(3)} s</td><td class="num">${x.wear != null ? x.wear.toFixed(1) + '%' : '–'}</td><td class="num">${x.life ? plural(x.life, 'lap') : '–'}</td></tr>`; }).join('')}
    </tbody></table></div></div>`;
}
/** Dashboard: the best strategy for the next race, from this weekend's practice (the grid's, then yours). Each needs
 *  at least two dry compounds with three or more consecutive clean laps. */
function strategyAdvicePanel(c, s) {
  const r = nextRound(s); if (!r || isHist(s)) return '';
  const anyPractice = PRACTICE_KEYS.some(k => s.weekends[r.id]?.sessions?.[k]?.game && !s.weekends[r.id].sessions[k].estimated);
  const head = `<div class="panel-h"><h2>Race strategy</h2><span class="muted" style="font-size:12px">${esc(r.name)} · from practice</span></div>`;
  if (!anyPractice) return `<div class="panel">${head}<div class="panel-b muted" style="font-size:13px">No practice logged from F1 25 for ${esc(r.name)} yet. Run practice with telemetry on and the best strategy appears here: it needs at least three consecutive laps on two dry compounds.</div></div>`;
  const n = raceLaps(s, r.id);
  const grid = gridRuns(s, r); const mine = practiceRuns(s, r, PLAYER);
  const names = (runs) => listJoin(DRY.filter(cp => runs[cp]).map(cp => COMPOUNDS[cp][1].toLowerCase()));
  const short = (title, runs, who) => `<div class="panel-b muted" style="font-size:13px;border-top:1px solid var(--line)"><span class="label">${title}</span>Not enough ${who} yet: it needs at least three consecutive laps on two dry compounds.${Object.keys(runs).length ? ` So far: ${names(runs)}.` : ''}</div>`;
  const enough = (runs) => Object.keys(runs).length >= 2;
  return `<div class="panel">${head}
    ${enough(grid) ? strategyBlock('From the whole grid', grid, n, `long runs from ${plural(Math.max(...Object.values(grid).map(x => x.drivers)), 'driver')}`) : short('From the whole grid', grid, 'long runs from the grid')}
    ${enough(mine) ? strategyBlock('From your runs', mine, n, 'your car, your driving') : short('From your runs', mine, 'of your own running')}
    <div class="panel-b muted" style="font-size:12px;border-top:1px solid var(--line)">${plural(n, 'lap')} at your race distance. Assumes ${PIT_LOSS / 1000} s per stop and a tyre is done at ${WEAR_LIMIT}% wear; fuel burn is the same for every plan, so it is left out.</div></div>`;
}

/*
  Current weekend: what this weekend's practice says about qualifying and the race.
  Qualifying: each driver's ideal lap, their best sector 1, 2 and 3 from any practice session, sets the likely grid.
  Race: the whole grid's long runs give the best strategy and its time; each driver's own long runs say how much
  faster or slower they are than the grid on the same tyres (where they did none, their ideal-lap gap stands in), and
  starting further back costs a little in traffic. Teams and drivers are then ranked on race pace per lap.
*/
const SECTOR_OK = [2, 4, 8]; // the game's validity flag for sector 1, 2 and 3
/** Each driver's ideal lap from practice: { d: { ideal, best, sectors: [s1, s2, s3] } }. */
function idealLaps(s, round) {
  const w = s.weekends[round.id]; const out = {};
  for (const k of PRACTICE_KEYS) {
    const sd = w?.sessions?.[k]; if (!sd?.game?.laps || sd.estimated) continue;
    for (const [d, laps] of Object.entries(sd.game.laps)) {
      const o = out[d] ||= { best: Infinity, sectors: [Infinity, Infinity, Infinity] };
      for (const l of laps) {
        if (l[0] && l[1]) o.best = Math.min(o.best, l[0]);
        for (let j = 0; j < 3; j++) { const v = l[2 + j]; if (v > 0 && (l[5] == null || l[5] & SECTOR_OK[j])) o.sectors[j] = Math.min(o.sectors[j], v); }
      }
    }
  }
  for (const o of Object.values(out)) { const sum = o.sectors.every(isFinite) ? o.sectors.reduce((a, b) => a + b, 0) : Infinity; o.ideal = Math.min(sum, o.best); }
  for (const d of Object.keys(out)) if (!isFinite(out[d].ideal)) delete out[d];
  return out;
}
/** The race forecast: { order: [{ d, t, start, off, est }], teams: [{ team, off }], plan, n }. */
function raceForecast(s, round) {
  const n = raceLaps(s, round.id); const grid = gridRuns(s, round); const ideal = idealLaps(s, round);
  const comps = Object.keys(grid); if (!comps.length) return null;
  const plan = comps.length >= 2 ? optimalStrategies(grid, n)[0] : null;
  const baseT = plan ? plan.t : (() => { const g = grid[comps[0]]; return n * g.base + g.deg * n * (n - 1) / 2; })();
  const idealMed = (() => { const v = Object.values(ideal).map(o => o.ideal).sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; })();
  const q = s.weekends[round.id]?.sessions?.Q;
  const qOrder = q?.done ? q.results.map(x => x.d) : Object.entries(ideal).sort((a, b) => a[1].ideal - b[1].ideal).map(([d]) => d);
  const rows = [];
  for (const d of gridIds(s)) {
    const own = practiceRuns(s, round, d);
    const offs = Object.keys(own).filter(c => grid[c]).map(c => own[c].base - grid[c].base).sort((a, b) => a - b);
    let off = offs.length ? offs[Math.floor(offs.length / 2)] : null, est = false;
    if (off == null && ideal[d] && idealMed) { off = ideal[d].ideal - idealMed; est = true; }
    if (off == null) continue;
    const start = qOrder.indexOf(d) + 1 || gridIds(s).length;
    rows.push({ d, off, est, start, t: baseT + off * n + (start - 1) * 350 });
  }
  rows.sort((a, b) => a.t - b.t);
  const T = {};
  for (const x of rows) { const tm = teamOf(s, x.d); if (tm) (T[tm.id] ||= { team: tm, offs: [] }).offs.push(x.off); }
  const teams = Object.values(T).map(o => ({ team: o.team, off: avg(o.offs) })).sort((a, b) => a.off - b.off);
  return { order: rows, teams, plan, n };
}
/** A ranked pace board, the same look as the Performance tab. rows: [{ label, color, rel, me, sub }] */
function paceBoard(rows, unit = 'Gap') {
  const max = Math.max(0.001, ...rows.map(o => o.rel));
  return `<table><thead><tr><th>Pos</th><th>${rows[0]?.team ? 'Team' : 'Driver'}</th><th class="num">${unit}</th><th style="width:34%"></th></tr></thead><tbody>
    ${rows.map((o, k) => `<tr class="${o.me ? 'me' : ''}"><td class="pos ${k < 3 ? 'p' + (k + 1) : ''}">${k + 1}</td><td>${o.label}</td><td class="num">${k === 0 ? '<b>Fastest</b>' : gapS(o.rel)}${o.sub ? ` <span class="tag">${o.sub}</span>` : ''}</td>
      <td><div class="h2h-bar"><i style="--c:${o.color};width:${Math.max(2, 100 - o.rel / max * 70)}%"></i></div></td></tr>`).join('')}
  </tbody></table>`;
}
function renderCurrentWeekend() {
  const c = career(); const s = latestSeason(); const r = nextRound(s);
  const head = (sub) => `<div class="page-head"><div><h1>Current Weekend</h1><div class="sub">${sub}</div></div></div>`;
  if (!r || isHist(s)) return `<div class="page">${head('No weekend left to run this season.')}</div>`;
  const rounds = activeRounds(s); const w = s.weekends[r.id];
  const done = sessionsFor(s, r).filter(k => w?.sessions?.[k]?.done);
  const ideal = idealLaps(s, r);
  const qRows = Object.entries(ideal).sort((a, b) => a[1].ideal - b[1].ideal);
  const q = w?.sessions?.Q; const qPos = (d) => q?.done ? q.results.findIndex(x => x.d === d) + 1 : null;
  const quali = qRows.length ? `<table><thead><tr><th>Pos</th><th>Driver</th><th class="num">Ideal lap</th><th class="num">Gap</th><th class="num">Best lap</th>${q?.done ? '<th class="num">Qualified</th>' : ''}</tr></thead><tbody>
    ${qRows.map(([d, o], k) => `<tr class="${d === PLAYER ? 'me' : ''}"><td class="pos ${k < 3 ? 'p' + (k + 1) : ''}">${k + 1}</td><td>${drvCell(s, d, { team: true })}</td><td class="num mono">${fmtLap(o.ideal)}</td><td class="num">${k ? '+' + ((o.ideal - qRows[0][1].ideal) / 1000).toFixed(3) : ''}</td><td class="num mono muted">${isFinite(o.best) ? fmtLap(o.best) : '–'}</td>${q?.done ? `<td class="num">${qPos(d) ? 'P' + qPos(d) : '–'}</td>` : ''}</tr>`).join('')}
  </tbody></table>` : '<div class="empty">No practice laps from F1 25 yet. Run practice with telemetry on: each driver\'s best sectors make their ideal lap.</div>';
  const F = raceForecast(s, r);
  const race = F ? `<table><thead><tr><th>Pos</th><th>Driver</th><th class="num">Start</th><th class="num">Gap</th><th class="num">Pace / lap</th></tr></thead><tbody>
    ${F.order.map((x, k) => `<tr class="${x.d === PLAYER ? 'me' : ''}"><td class="pos ${k < 3 ? 'p' + (k + 1) : ''}">${k + 1}</td><td>${drvCell(s, x.d, { team: true })}</td><td class="num muted">P${x.start}</td><td class="num">${k ? '+' + ((x.t - F.order[0].t) / 1000).toFixed(1) + 's' : fmtDur(Math.round(x.t))}</td><td class="num">${gapS(x.off - F.order.reduce((m, y) => Math.min(m, y.off), Infinity))}${x.est ? ' <span class="tag" title="No long run in practice: from the ideal lap">est.</span>' : ''}</td></tr>`).join('')}
  </tbody></table>` : '<div class="empty">No long runs in practice yet: three or more consecutive clean laps on a compound make a run.</div>';
  const best = F?.teams[0]?.off ?? 0;
  const teamBoard = F?.teams.length ? paceBoard(F.teams.map(o => ({ team: true, label: `<div class="drv">${teamLogo(c, o.team, 22)}<b>${esc(o.team.name)}</b></div>`, color: o.team.color, rel: o.off - best, me: o.team.id === s.playerTeamId })), 'Pace per lap') : '';
  const dBest = F ? Math.min(...F.order.map(x => x.off)) : 0;
  const drvBoard = F?.order.length ? paceBoard(F.order.slice().sort((a, b) => a.off - b.off).map(x => ({ label: drvCell(s, x.d, { team: true }), color: teamColor(s, x.d), rel: x.off - dBest, me: x.d === PLAYER, sub: x.est ? 'est.' : '' })), 'Pace per lap') : '';
  return `<div class="page">
    ${head(`Round ${rounds.indexOf(r) + 1} · ${esc(r.name)} · ${fmtDay(roundDate(s, r))}${r.sprint ? ' · sprint weekend' : ''}. Forecasts from this weekend's practice in F1 25${done.length ? `; logged so far: ${done.map(k => SESSION_SHORT[k]).join(', ')}` : ''}.`)}
    <div class="row" style="gap:8px"><button class="btn sm" data-act="open-round" data-round="${r.id}">Open the weekend</button></div>
    <div class="grid-2">
      <div class="panel"><div class="panel-h"><h2>Qualifying forecast</h2><span class="muted" style="font-size:12px">Ideal lap: best sectors from all practice</span></div><div class="panel-b tight table-wrap">${quali}</div></div>
      <div class="panel"><div class="panel-h"><h2>Race forecast</h2><span class="muted" style="font-size:12px">${F ? `${plural(F.n, 'lap')}${F.plan ? ` · ${plural(F.plan.stops, 'stop')} race` : ''}` : ''}</span></div><div class="panel-b tight table-wrap">${race}</div></div>
    </div>
    ${F ? `<div class="grid-2">
      <div class="panel"><div class="panel-h"><h2>Predicted race pace · teams</h2><span class="muted" style="font-size:12px">Long runs against the grid, per lap</span></div><div class="panel-b tight table-wrap">${teamBoard}</div></div>
      <div class="panel"><div class="panel-h"><h2>Predicted race pace · drivers</h2><span class="muted" style="font-size:12px">“est.” = no long run, from the ideal lap</span></div><div class="panel-b tight table-wrap">${drvBoard}</div></div>
    </div>` : ''}
    ${strategyAdvicePanel(c, s)}
  </div>`;
}

/* ---------------------------------------------------------------- stories */
// Stories are rebuilt from the results every time, so editing a result rewrites its article.
// A seeded picker keeps the wording stable between renders.
function seeded(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  return () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
}
const choose = (rnd, arr) => arr[Math.floor(rnd() * arr.length)];
// family name: "de Vries", "van Hoepen"; Zhou Guanyu is written family name first
const lastName = (n) => {
  const w = String(n || '').trim().split(' ');
  if (w[0] === 'Zhou') return 'Zhou';
  return w.length > 2 && /^(de|van|von|di|da|del|der)$/.test(w[w.length - 2]) ? w.slice(-2).join(' ') : w[w.length - 1];
};
const listJoin = (a) => a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`;
const ORD = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth'];
const ordWord = (n) => ORD[n - 1] || `${n}${[11, 12, 13].includes(n % 100) ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`;
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const numWord = (n) => ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'][n] || String(n);
function parseGap(g) { const m = String(g || '').match(/^\+?\s*(\d+(?:[.,]\d+)?)\s*s?$/); return m ? parseFloat(m[1].replace(',', '.')) : null; }

// Fictional, deliberately generic lines for the drivers of your career world.
const QUOTES = {
  win: ['What a day. The car was mega from the first lap and the team nailed the strategy.', 'I’m so proud of everyone back at the factory. We managed the tyres perfectly.', 'That one feels special. We had to fight for it, but it all came together.', 'Clean race, no drama. That’s exactly what we needed.', 'The pace was there all weekend. To convert it into a win is the best feeling.'],
  p2: ['Second is a good result, but we came here to win.', 'We pushed all the way but didn’t quite have the pace for the win today.', 'Solid points. We’ll take it and go again next weekend.', 'I gave it everything in the last stint. Close, but not close enough.'],
  p3: ['A podium is always nice. We maximised what we had today.', 'Happy to be up here. The car felt better as the race went on.', 'Not the fastest car today, but we made it count.'],
  dnf: ['Really frustrating. We had the pace for a good result.', 'It’s a shame. These things happen, but it hurts.', 'Not the afternoon we wanted. We’ll look into what happened.', 'Big zero today. We have to bounce back quickly.'],
  champion: ['I don’t have the words. This is for everyone who believed in me.', 'A dream come true. Every lap this year led to this moment.', 'We did it. The whole team deserves this as much as I do.'],
  teamChamp: ['Every person in the factory built this. A championship is the ultimate reward.', 'This title belongs to the whole team, from the drivers to the people working nights at the factory.'],
  out: ['The title is gone, but we’ll keep fighting for wins.', 'Mathematically it’s over, but there’s plenty left to race for.', 'Disappointing, of course. Now we race for pride.'],
  leader: ['It’s nice to be at the top, but there’s a long way to go.', 'Leading means nothing until the last race. We keep our heads down.'],
  preLead: ['I’m not thinking about the championship. Just focus on doing my job this weekend.', 'We know what’s at stake. Nothing changes in how we approach it.', 'If it happens here, great. If not, we go again next time.'],
  preChase: ['It’s not over until it’s over. We’ll go for it.', 'We have nothing to lose. Full attack.', 'Stranger things have happened. We keep pushing.'],
  comeback: ['The start was mega and the car was strong on the long runs.', 'We went long on the first stint and it paid off at the end.', 'I just kept my head down and picked them off one by one.'],
};

/* ------------------------------------------------------ title retrospectives */
/** When a title was settled: { i, r, m (standings after it), final, contenders (still alive going into that round) } */
function titleDecision(s, kind) {
  const rounds = activeRounds(s);
  for (let i = 0; i < rounds.length; i++) {
    if (!s.weekends[rounds[i].id]?.sessions?.R?.done) continue;
    const m = titleMath(s, kind, i + 1);
    if (m.decided) return { i, r: rounds[i], m, final: !m.left.length, contenders: titleMath(s, kind, i).rows.filter(x => x.alive) };
  }
  return null;
}
/** Sprint and Grand Prix points scored at round ri by the given drivers. */
function weekendPoints(s, ri, ids) {
  const ses = s.weekends[activeRounds(s)[ri]?.id]?.sessions || {}; let p = 0;
  for (const k of ['SPR', 'R']) { const sd = ses[k]; if (sd?.done) sd.results.forEach((x, j) => { if (ids.includes(x.d)) p += pointsFor(k, j + 1, x.st, x.pts); }); }
  return p;
}
/**
 * How a title was won. Champion's drives come first: recoveries from far back to the front, races rated far above
 * the car, qualifying laps well beyond it. Then the weekends that swung the most points against the runner-up.
 * If there were no standout drives, the most dominant weekends stand in. For a team, either car counts.
 */
function titleRetro(c, s, kind) {
  const dec = titleDecision(s, kind); if (!dec) return null;
  const team = kind === 'team';
  const rounds = activeRounds(s);
  const champ = dec.m.rows[0], rival = dec.m.rows[1];
  const idsAt = (who, ri) => {
    if (!who) return [];
    if (!team) return [who.id];
    const R = s.weekends[rounds[ri].id]?.sessions?.R;
    return (R?.results || []).map(x => x.d).filter(d => teamAt(s, d, ri)?.id === who.id);
  };
  const short = (id) => lastName(trName(c, s, id));
  const rows = [];
  for (let ri = 0; ri <= dec.i; ri++) {
    const ses = s.weekends[rounds[ri].id]?.sessions; if (!ses?.R?.done) continue;
    const mine = idsAt(champ, ri);
    const cp = weekendPoints(s, ri, mine), rp = weekendPoints(s, ri, idsAt(rival, ri));
    const R = raceRatings(s, ri) || {};
    let score = 0, margin = 0; const bits = [];
    for (const d of mine) {
      const x = R[d]; if (!x || x.dnf) continue;
      const big = x.grid && x.grid >= 10 && x.finish <= 3, climb = x.gained >= 8 && x.finish <= 6;
      const who = team ? `${short(d)}: ` : '';
      if (big || climb) { score += (big ? 6 + (x.grid - x.finish) * 0.3 : 0) + (climb ? 3 + x.gained * 0.25 : 0); bits.push(`${who}from ${ordWord(x.grid)} on the grid to ${x.finish === 1 ? 'victory' : ordWord(x.finish)}`); }
      else if (x.rating >= 9.3) { score += (x.rating - 9) * 6; bits.push(`${who}${x.finish === 1 ? 'the win' : ordWord(x.finish)}, rated ${x.rating.toFixed(1)} by the fans`); }
      if (x.quali != null && x.quali >= 9.5 && x.grid && x.grid <= 3) { score += 2; if (!bits.length) bits.push(`${who}${x.grid === 1 ? 'pole' : ordWord(x.grid)} in qualifying and ${x.finish === 1 ? 'the win' : ordWord(x.finish)}`); }
      if (x.finish === 1) margin = Math.max(margin, x.margin || 0);
    }
    const resTxt = (ids) => { const b = ids.map(d => { const k = ses.R.results.findIndex(y => y.d === d); return k < 0 ? null : OUT.includes(ses.R.results[k].st) ? ses.R.results[k].st : k === 0 ? 'won' : 'P' + (k + 1); }).filter(Boolean); return b.join(' & ') || '–'; };
    rows.push({ ri, r: rounds[ri], cp, rp, swing: cp - rp, score, bits, margin, mine, champRes: resTxt(mine), rivalRes: resTxt(idsAt(rival, ri)) });
  }
  const drives = rows.filter(x => x.score >= 3).sort((a, b) => b.score - a.score).slice(0, 4);
  const swings = rows.filter(x => x.swing > 0).sort((a, b) => b.swing - a.swing).slice(0, 5);
  const dominant = drives.length ? [] : rows.slice().sort((a, b) => b.cp - a.cp || b.margin - a.margin).slice(0, 3);
  const st = seasonStats(s, dec.i + 1);
  const tally = (ids, k) => ids.reduce((a, d) => a + (st[d]?.[k] || 0), 0);
  const allIds = team ? [...new Set(rows.flatMap(x => x.mine))] : [champ.id];
  return { kind, dec, champ, rival, drives, swings, dominant, wins: tally(allIds, 'wins'), podiums: tally(allIds, 'podiums'), poles: tally(allIds, 'poles'),
    name: team ? champ.name : trName(c, s, champ.id), rivalName: rival ? (team ? rival.name : trName(c, s, rival.id)) : null, short: team ? champ.name : short(champ.id), rivalShort: rival ? (team ? rival.name : short(rival.id)) : null };
}
/** The retrospective as a list of sections ({ title, items: [{ id, text }] }) shared by the story and the season review. */
function retroSections(c, s, T) {
  const sec = [];
  const who = (x) => T.kind === 'team' ? (x.mine[0] || null) : T.champ.id;
  if (T.drives.length) sec.push({ title: T.kind === 'team' ? 'The drives that won it' : 'Champion’s drives', items: T.drives.map(x => ({ id: who(x), text: `R${x.ri + 1} ${x.r.name}: ${x.bits.join('; ')}` })) });
  else if (T.dominant.length) sec.push({ title: 'The most dominant weekends', items: T.dominant.map(x => ({ id: who(x), text: `R${x.ri + 1} ${x.r.name}: ${x.champRes}, ${plural(x.cp, 'point')}${x.margin >= 5 ? `, won by ${x.margin.toFixed(1)} s` : ''}` })) });
  if (T.swings.length && T.rival) sec.push({ title: `Where it was won: five swings against ${T.rivalShort}`, items: T.swings.map(x => ({ id: who(x), text: `R${x.ri + 1} ${x.r.name}: +${x.swing} on ${T.rivalShort} (${T.short} ${x.champRes}, ${T.rivalShort} ${x.rivalRes})` })) });
  return sec;
}
function titleRetroStory(c, s, T) {
  const team = T.kind === 'team'; const d = T.dec; const rnd = seeded(`${s.index}-${T.kind}-retro`);
  const left = d.m.left.length;
  const finalTxt = d.final ? (d.contenders.length >= 3 ? `at the final race, in a ${numWord(d.contenders.length)}-way showdown` : 'at the final race') : `with ${plural(left, 'round')} to spare`;
  const headline = team
    ? (d.final ? `Down to the wire: how ${T.name} won the ${s.year} constructors’ title` : `How ${T.name} won the ${s.year} constructors’ championship`)
    : d.final ? `Down to the wire: how ${T.short} won the ${s.year} title` : T.drives.length ? `${T.short}’s ${s.year} title: the drives that won it` : `How ${T.short} won the ${s.year} world championship`;
  const standfirst = `${T.name} sealed the ${team ? 'constructors’ ' : ''}championship in ${d.r.name} ${finalTxt}${T.rival ? `, ${plural(d.m.margin, 'point')} clear of ${T.rivalName}` : ''}. Along the way: ${plural(T.wins, 'win')}, ${plural(T.podiums, 'podium')} and ${plural(T.poles, 'pole')}.`;
  const body = [];
  if (T.drives.length) body.push(team ? `Titles are built on the days the cars outperformed themselves. These were ${T.name}’s.` : `Every championship has days that define it. Without these, ${T.short} might not be champion.`);
  else body.push(`There was no single rescue act this year. ${T.short} won it by dominating.`);
  if (d.final) body.push(d.contenders.length >= 3 ? `It went to the last race with ${listJoin(d.contenders.map(x => team ? x.name : lastName(trName(c, s, x.id))))} all still in contention.` : `It came down to the final race against ${T.rivalName}.`);
  // interviews: the champion (never you: you speak for yourself in Media) and the team
  const top = T.drives[0] || T.dominant[0] || T.swings[0];
  const qa = [];
  if (!team && T.champ.id !== PLAYER) {
    qa.push(['Which drive won you this title?', top ? choose(rnd, [`${top.r.name}. ${T.drives.length ? 'Where we started, nobody expected anything from us. That day changed the season.' : 'We had everything under control that weekend, and it set the tone.'}`, `I keep coming back to ${top.r.name}. If we don’t get that result, I’m not sure we’re sitting here.`]) : 'All of them. Every point counted.']);
    qa.push(d.final ? ['It came down to the last race. What was that like?', choose(rnd, ['Brutal. I don’t think I’ve ever been that nervous in a car.', 'You try to treat it like any other race. It isn’t. It’s the hardest race of the year.'])] : ['When did you know it was yours?', choose(rnd, [`Not until the flag in ${d.r.name}. You never relax in this sport.`, 'Honestly, only when the maths said so.'])]);
    if (T.rival) qa.push([`What do you say to ${T.rivalName}?`, choose(rnd, ['They pushed me all season. Huge respect.', 'It was a proper fight. That makes it mean more.'])]);
  }
  const teamId = team ? T.champ.id : teamAt(s, T.champ.id, d.i)?.id;
  const quotes = teamId ? [{ team: teamId, role: 'Team principal', text: team
    ? choose(rnd, ['This belongs to everyone in the factory. Both drivers delivered when it mattered.', d.final ? 'We made it hard for ourselves, but we got there in the end.' : 'We built this one race at a time.'])
    : choose(rnd, [`${T.short} delivered when it counted. That’s what champions do.`, d.final ? 'I aged ten years in that last race. What a driver.' : 'A complete season. We’re incredibly proud.']) }] : [];
  return { id: `${s.index}-${T.kind}-retro`, seq: d.i * 10 + 6, kind: 'title', i: d.i, r: d.r, subject: team ? null : T.champ.id, outlet: choose(rnd, D.OUTLETS),
    kicker: d.final ? 'Title review · Final-race decider' : 'Title review', headline, standfirst, body, sections: retroSections(c, s, T), qa: qa.length ? qa : null, quotes, massive: d.final };
}

/* -------------------------------------------------------- title showdowns */
// A drivers' title that goes to the final race gets told properly, before and after: the scene (who leads, by how
// much, their form, the last time it came to this), what each contender needs (the leader's minimum: "only needs
// third"; a chaser's: "at least second, and results going their way", with the actual permutation), how the race
// played out for the title (lap by lap, from the logged lap times) and how it ended.
/** What each title contender needs at round i (the last round): [{ id, pts, gap, leader, sure, maxP, cond, margins }] or null. */
function titleNeeds(s, i) {
  const m = titleMath(s, 'driver', i); if (m.decided || m.left.length !== 1) return null;
  const P = roundPerms(m); if (!P) return null;
  const alive = m.rows.filter(x => x.alive); if (alive.length < 2) return null;
  const lead = m.rows[0];
  return { m, P, rows: alive.map(x => {
    const cl = P.clinch.find(o => o.x === x);
    const o = { id: x.id, pts: x.pts, gap: lead.pts - x.pts, leader: x === lead, wins: x.wins };
    if (P.exact && cl?.table?.length) {
      const t = cl.table; let sure = 0;
      for (const r of t) { if (r.conds.every(cc => !cc.q)) sure = r.p; else break; }
      o.sure = sure || null; o.maxP = t.length;
      o.cond = t[sure] || null; // the first finish that needs help from the others
      o.top = t[0];
    } else if (cl) o.margins = cl.rivals;
    return o;
  }) };
}
/** The conditions on the others in a permutation row, in words: "Hamilton finishes fourth or lower". */
function condTxt(row, L, past) {
  return listJoin(row.conds.filter(c => c.q).map(c => `${L(c.y.id)} ${past ? 'finished' : 'finishes'} ${c.q >= NO_PTS ? 'outside the points' : `${ordWord(c.q)} or lower`}`));
}
/** One sentence per contender: what they needed (past) or need (present) to be champion. */
function needsLines(N, L, past = true) {
  const v = (pres, pst) => past ? pst : pres;
  return N.rows.map(o => {
    const who = L(o.id);
    if (o.margins) return `${who} ${v('needs', 'needed')} ${listJoin(o.margins.map(m => m.need > 0 ? `to outscore ${L(m.y.id)} by ${plural(m.need, 'point')}` : m.need === 0 ? `to match ${L(m.y.id)}’s score` : `to stay within ${plural(-m.need, 'point')} of ${L(m.y.id)}`))} across the weekend.`;
    if (o.sure) {
      const base = o.sure === 1 ? `${who} ${v('has', 'had')} to win to be sure of the title`
        : `${who} only ${v('needs', 'needed')} ${ordWord(o.sure)} place to be champion, whatever ${v('happens', 'happened')} behind`;
      const extra = o.cond ? `; ${ordWord(o.cond.p)} ${v('would', 'would')} also do, as long as ${condTxt(o.cond, L, past)}` : '';
      return `${base}${extra}.`;
    }
    if (!o.top) return `${who} ${v('cannot', 'could not')} win it any more.`;
    const helped = o.top.conds.some(c => c.q);
    return o.maxP === 1
      ? `${who} ${v('has', 'had')} to win${helped ? `, and even that ${v('is', 'was')} only enough if ${condTxt(o.top, L, past)}` : ''}.`
      : `${who} ${v('needs', 'needed')} at least ${ordWord(o.maxP)} place and for results to go ${v('their', 'their')} way: ${helped ? `a win ${v('is', 'would be')} enough only if ${condTxt(o.top, L, past)}` : `a win ${v('does', 'would do')} it`}.`;
  });
}
/** The scene going in: the gaps, in a sentence. */
function sceneLine(N, L, gp, past = true) {
  const [a, ...rest] = N.rows; const v = (pres, pst) => past ? pst : pres;
  const level = rest.filter(o => !o.gap), behind = rest.filter(o => o.gap);
  const gaps = behind.map(o => `${L(o.id)} ${plural(o.gap, 'point')} behind`);
  const head = level.length
    ? `${listJoin([a, ...level].map(o => L(o.id)))} ${v('arrive', 'arrived')} in ${gp} level on ${plural(a.pts, 'point')}, ${L(a.id)} ahead on countback`
    : `${L(a.id)} ${v('arrives', 'arrived')} in ${gp} leading the championship on ${plural(a.pts, 'point')}`;
  return `${head}${gaps.length ? `, with ${listJoin(gaps)}` : ''}.${rest.length >= 2 ? ` ${cap(numWord(N.rows.length))} drivers, one title.` : ''}`;
}
/**
 * The title, lap by lap, from the logged lap times: everyone's running order at the end of each lap (cumulative time;
 * the last lap is the official result, penalties included) turned into points for the contenders. In the final race
 * it says who was champion on the road. { ids, rows: [{ k, pts, pos, champ }], final } or null.
 */
function titleByLap(s, i) {
  const r = activeRounds(s)[i]; const ses = s.weekends[r?.id]?.sessions; const sd = ses?.R; const g = sd?.game;
  if (!sd?.done || !g?.laps || Object.keys(g.laps).length < 2) return null;
  const m = titleMath(s, 'driver', i); const alive = m.rows.filter(x => x.alive);
  if (m.decided || alive.length < 2) return null;
  const spr = {}; if (ses.SPR?.done) ses.SPR.results.forEach((x, k) => { spr[x.d] = pointsFor('SPR', k + 1, x.st, x.pts); });
  const cum = {}; for (const [d, laps] of Object.entries(g.laps)) { let t = 0; cum[d] = laps.map(l => (t += l[0] || 0)); }
  const N = Math.max(...Object.values(g.finished || {}), ...Object.values(cum).map(x => x.length)); if (!N) return null;
  const finalOrder = sd.results.filter(x => !OUT.includes(x.st)).map(x => x.d);
  const final = m.left.length === 1;
  const rows = [];
  for (let k = 1; k <= N; k++) {
    const order = k === N ? finalOrder : Object.keys(cum).filter(d => cum[d].length >= k).sort((a, b) => cum[a][k - 1] - cum[b][k - 1]);
    const pos = (d) => order.indexOf(d) + 1;
    const pts = Object.fromEntries(alive.map(x => [x.id, x.pts + (spr[x.id] || 0) + (pos(x.id) ? pointsFor('R', pos(x.id), 'FIN') : 0)]));
    // champion on the road: most points; level, the countback (with this race's place added)
    const cb = (x) => { const v = (x.posCount || []).slice(); const p = pos(x.id); if (p) v[p - 1] = (v[p - 1] || 0) + 1; return v; };
    const champ = alive.slice().sort((a, b) => { if (pts[b.id] !== pts[a.id]) return pts[b.id] - pts[a.id]; const A = cb(a), B = cb(b); for (let q = 0; q < 30; q++) if ((A[q] || 0) !== (B[q] || 0)) return (B[q] || 0) - (A[q] || 0); return 0; })[0].id;
    rows.push({ k, pts, pos: Object.fromEntries(alive.map(x => [x.id, pos(x.id)])), champ });
  }
  return { ids: alive.map(x => x.id), rows, final };
}
/** How the title swung during the race, in words (final race: who was champion on the road, and when it changed). */
function titleSwingLines(T, L) {
  if (!T?.final) return [];
  const seg = []; for (const r of T.rows) { const lst = seg[seg.length - 1]; if (lst && lst.id === r.champ) lst.to = r.k; else seg.push({ id: r.champ, from: r.k, to: r.k }); }
  if (seg.length === 1) return [`${L(seg[0].id)} was champion on the road from the first lap to the last.`];
  const swings = seg.length - 1;
  // each swing: what moved (the new holder's or the old holder's change of place, whichever was bigger)
  const why = (x, k) => {
    const r = T.rows[x.from - 1], prev = T.rows[x.from - 2], was = seg[k - 1].id;
    const d = [x.id, was].map(id => ({ id, a: prev?.pos[id] || 0, b: r.pos[id] || 0 })).sort((p, q) => Math.abs((q.b || 30) - (q.a || 30)) - Math.abs((p.b || 30) - (p.a || 30)))[0];
    return !d.b ? `${L(d.id)} dropped out` : d.b < d.a ? `${L(d.id)} moved up to ${ordWord(d.b)}` : `${L(d.id)} fell to ${ordWord(d.b)}`;
  };
  const lines = [`The title changed hands ${swings === 1 ? 'once' : swings === 2 ? 'twice' : `${nw(swings)} times`} out on track, with ${L(seg[0].id)} holding it at the start.`];
  const shown = swings > 4 ? [1, 2, swings] : seg.map((_, k) => k).slice(1);
  shown.forEach((k) => {
    const x = seg[k];
    if (k === swings) lines.push(`${swings > 1 ? 'The decisive moment came' : 'It came'} on lap ${x.from}: ${why(x, k)}, and the title was ${L(x.id)}’s${swings > 1 ? ' for good' : ''}.`);
    else lines.push(`On lap ${x.from}, ${why(x, k)} and it swung to ${L(x.id)}.`);
  });
  if (swings > 4) lines.splice(3, 0, `It went back and forth ${nw(swings - 3)} more times after that.`);
  return [lines.join(' ')];
}
/** A chart of the contenders' championship points, lap by lap, with a legend. */
function titleChartHtml(s, T, L) {
  if (!T) return '';
  const seen = {};
  const series = T.ids.slice(0, 4).map(id => { const col = teamColor(s, id); const dashed = !!seen[col]; seen[col] = 1; return { id, color: col, dashed, pts: T.rows.map(r => [r.k, r.pts[id]]) }; });
  const flips = T.final ? T.rows.filter((r, k) => k && r.champ !== T.rows[k - 1].champ).map(r => r.k) : [];
  return `<div class="title-chart"><div class="label">The title, lap by lap${T.final ? ' · points if the race ended there' : ' · projected points'}</div>
    ${svgChart(series, { h: 190, yFmt: (v) => Math.round(v), xLabel: 'Lap' })}
    <div class="chart-legend">${series.map(x => `<span><i style="background:${x.color};${x.dashed ? 'opacity:.6' : ''}"></i>${esc(L(x.id))}</span>`).join('')}${flips.length ? `<span class="muted">Title changed hands on lap ${listJoin(flips.map(String))}</span>` : ''}</div></div>`;
}
/** The last title in this career that went to the final race (before season s). */
function lastShowdown(c, s) {
  for (let k = s.index - 1; k >= 0; k--) {
    const se = c.seasons[k]; if (roundsDone(se) < activeRounds(se).length) continue;
    const d = titleDecision(se, 'driver'); if (d?.final) return { s: se, d, champ: d.m.rows[0], runner: d.m.rows[1] };
  }
  return null;
}
// what the contenders say before and after a final-race decider
const SHOWDOWN_QUOTES = {
  preLead: ['I’m in the best position, but I know nothing is done until the flag.', 'We just have to do our job. If we do that, the rest takes care of itself.', 'I won’t be doing maths in the car. Just driving.', 'Of course I’m nervous. Anyone who says they aren’t is lying.'],
  preChase: ['We have nothing to lose. I’m going for the win and we’ll see what happens.', 'I need some help, I know that. But I can only control my own race.', 'Pressure? The pressure is all on them.', 'All I can do is win. Then we look at the screens.'],
  won: ['I don’t have words. The longest race of my life.', 'I couldn’t look at the screens. My engineer just told me to keep pushing, and then… champion.', 'To do it in the last race, under that pressure, this is everything.', 'All year we fought for this, and it came down to one afternoon.'],
  lost: ['It hurts. We gave everything, and it wasn’t enough today.', 'Congratulations to them. This one will sting for a while.', 'Second in the world sounds good, but right now it doesn’t feel like it.', 'We came so close. I’ll be back next year, stronger.', 'That’s racing. Sometimes it goes your way and sometimes it doesn’t.'],
};
/** The preview of a final-race showdown: scene, form, head-to-head, what each needs, last year here and history. */
function showdownPreviewLines(c, s, i, L) {
  const N = titleNeeds(s, i); if (!N) return null;
  const rounds = activeRounds(s); const r = rounds[i]; const gp = gpThe(r.name);
  const lines = [sceneLine(N, L, gp, false)];
  const st = seasonStats(s, i);
  // form: the last three races
  const form = N.rows.map(o => { const res = rounds.slice(Math.max(0, i - 3), i).map(x => st[o.id]?.byRound[x.id]?.r).filter(x => x != null).map(x => typeof x === 'number' ? 'P' + x : x); return res.length ? `${L(o.id)} ${res.join(', ')}` : null; }).filter(Boolean);
  if (form.length) lines.push(`Form over the last three races: ${listJoin(form)}. Wins this season: ${listJoin(N.rows.map(o => `${L(o.id)} ${st[o.id]?.wins || 0}`))}.`);
  // head to head, the top two
  const [a, b] = N.rows; let ahead = 0, both = 0;
  for (const x of rounds.slice(0, i)) { const ra = st[a.id]?.byRound[x.id]?.r, rb = st[b.id]?.byRound[x.id]?.r; if (typeof ra === 'number' && typeof rb === 'number') { both++; if (ra < rb) ahead++; } }
  if (both >= 3) lines.push(`On track, ${L(a.id)} has finished ahead of ${L(b.id)} in ${ahead} of the ${both} races both completed.`);
  lines.push(...needsLines(N, L, false));
  if (N.P.exact) lines.push('If they finish level on points, the countback decides it: most wins, then most second places, and so on.');
  // last year at this circuit
  const prev = c.seasons[s.index - 1]; const pr = prev && activeRounds(prev).find(x => trackOf(x) === trackOf(r));
  const pres = pr && prev.weekends[pr.id]?.sessions?.R;
  if (pres?.done) {
    const W = pres.results.find(x => !OUT.includes(x.st))?.d; const at = (id) => { const k = pres.results.findIndex(x => x.d === id); return k < 0 ? null : OUT.includes(pres.results[k].st) ? 'retired' : `finished ${ordWord(k + 1)}`; };
    const bits = N.rows.filter(o => o.id !== W && at(o.id)).map(o => `${L(o.id)} ${at(o.id)}`);
    if (W) lines.push(`A year ago here, ${N.rows.some(o => o.id === W) ? `${L(W)} won` : `the win went to ${lastName(dName(prev, W))}`}${bits.length ? `; ${listJoin(bits)}` : ''}.`);
  }
  const H = lastShowdown(c, s);
  if (H) lines.push(`The last time the title went to the final race was ${H.s.year}, when ${lastName(dName(H.s, H.champ.id))} beat ${lastName(dName(H.s, H.runner.id))} to it in ${gpThe(H.d.r.name)}${H.d.m.margin ? ` by ${plural(H.d.m.margin, 'point')}` : ' on countback'}.`);
  return { lines, N };
}
/**
 * The final race of a title that went the distance, told after the fact (for the title story and the season review):
 * { scene, needs, race, outcome, chart }.
 */
function showdownTold(c, s, i, L, w = (k, v) => v[0]) {
  const N = titleNeeds(s, i); if (!N) return null;
  const rounds = activeRounds(s); const r = rounds[i]; const gp = gpThe(r.name);
  const ses = s.weekends[r.id]?.sessions; const res = ses?.R?.results || [];
  const m = titleMath(s, 'driver', i + 1); const champ = m.rows[0]; const runner = m.rows[1];
  const was = N.rows.find(o => o.id === champ.id);
  const at = (id) => { const k = res.findIndex(x => x.d === id); return k < 0 ? null : OUT.includes(res[k].st) ? res[k].st : k + 1; };
  const grid = (id) => ses?.R?.game?.grid?.[id] || (ses?.Q?.done ? ses.Q.results.findIndex(x => x.d === id) + 1 || null : null);
  const scene = sceneLine(N, L, gp, true);
  const needs = needsLines(N, L, true);
  const race = [];
  // the contenders' afternoons
  race.push(listJoin(N.rows.map(o => { const p = at(o.id), g = grid(o.id); return typeof p === 'number' ? `${L(o.id)} ${g === p ? `started and finished ${ordWord(p)}` : g ? `went from ${ordWord(g)} on the grid to ${ordWord(p)}` : `finished ${ordWord(p)}`}` : `${L(o.id)} ${p === 'DSQ' ? 'was disqualified' : 'retired'}`; })) + '.');
  const T = titleByLap(s, i); race.push(...titleSwingLines(T, L));
  // the moments that involved the contenders
  const F = raceFacts(c, s, i);
  if (F) {
    const ids = new Set(N.rows.map(o => o.id));
    const B = raceBeats(F, phrasebook(seeded(`${s.index}-${r.id}-showdown`)), L).filter(b => ['incident', 'battle', 'lap1', 'safety', 'dnf', 'pole'].includes(b.tag) && (b.tag === 'safety' || b.ids.some(d => ids.has(d))));
    race.push(...B.slice(0, 3).map(b => b.text));
  }
  const margin = champ.pts - runner.pts;
  const turned = !was?.leader;
  const outcome = turned && !was.gap
    ? w('sd-level', [`Level on points coming in, ${L(champ.id)} left as champion, ${margin ? `${plural(margin, 'point')} clear` : 'ahead on countback'}. Heartbreak for ${L(N.rows[0].id)}.`, `From level on points to world champion: ${L(champ.id)} won it by ${margin ? plural(margin, 'point') : 'countback'}.`])
    : turned
    ? w('sd-turn', [`${L(champ.id)} came from ${plural(was.gap, 'point')} behind to take the title by ${margin ? plural(margin, 'point') : 'countback'}. Heartbreak for ${L(N.rows[0].id)}.`, `A turnaround at the last: ${L(champ.id)}, ${plural(was.gap, 'point')} down coming in, left as champion, ${margin ? `${plural(margin, 'point')} clear` : 'ahead on countback'}.`, `It was ${L(champ.id)}’s title in the end, overturning a ${was.gap}-point deficit${margin ? ` to win by ${plural(margin, 'point')}` : ' on countback'}.`])
    : w('sd-hold', [`${L(champ.id)} held on to take the title by ${margin ? plural(margin, 'point') : 'countback'}.`, `Job done: ${L(champ.id)} was champion, ${margin ? `${plural(margin, 'point')} clear of ${L(runner.id)}` : `level with ${L(runner.id)} but ahead on countback`}.`, `${L(champ.id)} kept their nerve and the title, by ${margin ? plural(margin, 'point') : 'countback'} from ${L(runner.id)}.`]);
  return { N, scene, needs, race, outcome, chart: titleChartHtml(s, T, L), T, champ: champ.id, losers: N.rows.filter(o => o.id !== champ.id).map(o => o.id) };
}

/* Memory in the press: streaks, last time out, the defending champion. Each returns a line or null. */
function qualiMemory(mem, q, pole, last, rnd) {
  const run = mem.run(pole);
  const bits = [];
  if (run.poles >= 1) bits.push(run.poles + 1 >= 3 ? `That is ${ordWord(run.poles + 1)} pole in a row for ${last(pole)}.` : `${last(pole)} makes it back-to-back poles.`);
  else if (mem.lastPole && mem.lastPole !== pole) { const k = q.findIndex(x => x.d === mem.lastPole); if (k >= 0) bits.push(`Last time out’s pole-sitter ${last(mem.lastPole)} will start ${ordWord(k + 1)}.`); }
  if (mem.defending && mem.defending === pole) bits.push(`The defending champion is on pole.`);
  else if (mem.defending) { const k = q.findIndex(x => x.d === mem.defending); if (k >= 3) bits.push(`Defending champion ${last(mem.defending)} lines up only ${ordWord(k + 1)}.`); }
  const streaker = q.slice(0, 22).map(x => x.d).find(d => mem.run(d).wins >= 2 && d !== pole);
  if (streaker && rnd() < 0.8) bits.push(`${last(streaker)}, on a run of ${streakWord(mem.run(streaker).wins)} straight wins, starts ${ordWord(q.findIndex(x => x.d === streaker) + 1)}.`);
  return bits.join(' ') || null;
}
function raceMemoryLine(mem, res, W, last, name, rnd) {
  const bits = [];
  const runW = mem.run(W);
  if (runW.wins >= 1) bits.push(runW.wins + 1 >= 3 ? `${last(W)} has now won ${streakWord(runW.wins + 1)} in a row.` : `It is back-to-back wins for ${last(W)}.`);
  // streaks that ended today
  for (const x of res) {
    if (x.d === W) continue;
    const run = mem.run(x.d); const k = res.indexOf(x);
    if (run.wins >= 2) { bits.push(`${last(x.d)}’s run of ${streakWord(run.wins)} straight wins ends with ${OUT.includes(x.st) ? 'a retirement' : ordWord(k + 1)}.`); break; }
  }
  const pod = res.slice(1, 3).find(x => !OUT.includes(x.st) && mem.run(x.d).podiums >= 2);
  if (pod) bits.push(`${last(pod.d)} is on the podium for a ${ordWord(mem.run(pod.d).podiums + 1)} race running.`);
  if (mem.lastWinner && mem.lastWinner !== W) { const x = res.find(y => y.d === mem.lastWinner); if (x) bits.push(`${mem.lastRound ? `${mem.lastRound.name} winner` : 'Last time out’s winner'} ${last(x.d)} ${OUT.includes(x.st) ? 'did not finish' : `finished ${ordWord(res.indexOf(x) + 1)}`} this time.`); }
  if (mem.defending && mem.defending !== W && mem.defending !== mem.lastWinner) { const x = res.find(y => y.d === mem.defending); if (x && rnd() < 0.7) bits.push(`Defending champion ${name(x.d)} ${OUT.includes(x.st) ? 'retired' : `came home ${ordWord(res.indexOf(x) + 1)}`}.`); }
  else if (mem.defending === W) bits.push(`The defending champion is showing why.`);
  return bits.slice(0, 3).join(' ') || null;
}
function penMemoryQuestion(mem, subj, fpos, isOut, last, rnd) {
  const run = mem.run(subj);
  if (!isOut && fpos === 1 && run.wins >= 1) return [`That’s ${streakWord(run.wins + 1)} wins in a row. Does it feel like nobody can stop you right now?`, choose(rnd, ['You never think like that. The moment you relax, someone beats you.', 'It’s a great run, but every weekend starts from zero.', 'I’m enjoying it, believe me. But the others will come back at us.'])];
  if (run.wins >= 2 && fpos !== 1) return [`Your winning run ends here. How much does that sting?`, choose(rnd, ['Streaks end. The important thing is we still scored.', 'It hurts a bit, but nobody wins every race.', 'We knew it would happen at some point. Now we start a new one.'])];
  if (mem.lastWinner === subj && fpos !== 1) return [`You won last time out. What was different this weekend?`, choose(rnd, ['We just didn’t have the same pace. We’ll look at why.', 'Small margins. A few things didn’t go our way.', 'Every track is different. This one suited the others more.'])];
  if (mem.defending === subj) return [`As the defending champion, how do you judge your form at the moment?`, choose(rnd, ['I don’t think about the number on the car. I just want to win races.', 'We know what we’re capable of. It’s about putting it together every weekend.', 'There is always pressure as champion, but it’s the good kind.'])];
  if (run.podiums >= 2 && fpos <= 3) return [`Another podium: that’s ${streakWord(run.podiums + 1)} in a row. Is the win next?`, choose(rnd, ['That’s the plan. We’re knocking on the door.', 'The consistency is there. Now we need a bit more pace.'])];
  return null;
}
function previewStory(c, s, i, mem, { name, last, tName }) {
  const rounds = activeRounds(s); const r = rounds[i]; const rnd = seeded(`${s.index}-${r.id}-pv`);
  const ds = driverStandings(s, seasonStats(s, i));
  const hot = ds.map(x => x.id).find(d => mem.run(d).wins >= 2);
  const lead = ds[0]?.id;
  let headline, standfirst;
  if (hot) { headline = choose(rnd, [`Can anyone stop ${last(hot)}?`, `${last(hot)} chases win number ${mem.run(hot).wins + 1} in a row at ${r.name}`]); standfirst = `${name(hot)} arrives at ${r.venue} on a run of ${streakWord(mem.run(hot).wins)} straight wins.`; }
  else if (mem.lastWinner) { headline = choose(rnd, [`${last(mem.lastWinner)} looks to repeat in ${r.name}`, `${r.name} next: can ${last(mem.lastWinner)} make it two?`]); standfirst = `${name(mem.lastWinner)} won ${mem.lastRound ? `in ${mem.lastRound.name}` : 'last time out'}, and the circus moves on to ${r.venue}.`; }
  else return null;
  const body = [];
  if (lead) body.push(`${name(lead)} leads the championship on ${plural(ds[0].pts, 'point')}${ds[1] ? `, ${plural(ds[0].pts - ds[1].pts, 'point')} clear of ${name(ds[1].id)}` : ''}.`);
  if (mem.lastPole && mem.lastPole !== mem.lastWinner) body.push(`${last(mem.lastPole)} took pole last time and will want to turn it into a win.`);
  const pods = ds.map(x => x.id).filter(d => d !== hot && mem.run(d).podiums >= 3).slice(0, 1);
  if (pods.length) body.push(`${last(pods[0])} has been on the podium ${streakWord(mem.run(pods[0]).podiums)} races running.`);
  if (mem.defending && mem.defending !== lead && mem.defending !== hot) { const p = ds.find(x => x.id === mem.defending)?.pos; if (p) body.push(`Defending champion ${name(mem.defending)} sits ${ordWord(p)} in the standings.`); }
  if (mem.lastDotd && mem.lastDotd !== mem.lastWinner) body.push(`${last(mem.lastDotd)} was Driver of the Day last time out.`);
  return { id: `${s.index}-${r.id}-pv`, seq: i * 10, kind: 'preview', i, r, subject: hot || mem.lastWinner, outlet: choose(rnd, D.OUTLETS), kicker: 'Preview', headline, standfirst, body };
}
function dotdStory(c, s, i, dd, mem, { name, last, tName }) {
  const r = activeRounds(s)[i]; const rnd = seeded(`${s.index}-${r.id}-dotd`);
  const R = raceRatings(s, i);
  const runners = Object.values(R).filter(x => !x.dnf && x.id !== dd.id).sort((a, b) => b.rating - a.rating).slice(0, 3);
  const repeat = mem.run(dd.id).dotd;
  const headline = dd.rating >= 9.5 ? choose(rnd, [`${last(dd.id)} drive of the season so far in ${r.name}`, `A near-perfect ${r.name} from ${last(dd.id)}`])
    : choose(rnd, [`${last(dd.id)} is Driver of the Day in ${r.name}`, `${r.name}: Driver of the Day goes to ${last(dd.id)}`]);
  const body = [
    `Pitwall rates the drive ${dd.rating.toFixed(1)} out of 10.${dd.grid ? ` From ${ordWord(dd.grid)} on the grid to ${ordWord(dd.finish)} at the flag.` : ` ${ordWord(dd.finish)[0].toUpperCase() + ordWord(dd.finish).slice(1)} at the flag.`}`,
    repeat ? `It is ${repeat + 1 >= 3 ? `a ${ordWord(repeat + 1)} straight award` : 'back-to-back awards'} for ${last(dd.id)}.` : '',
    runners.length ? `Also highly rated: ${listJoin(runners.map(x => `${name(x.id)} (${x.rating.toFixed(1)})`))}.` : '',
  ].filter(Boolean);
  return { id: `${s.index}-${r.id}-dotd`, seq: i * 10 + 4, kind: 'dotd', i, r, subject: dd.id, outlet: choose(rnd, D.OUTLETS), kicker: 'Driver of the Day', headline,
    standfirst: dd.pub.length ? `${name(dd.id)} (${tName(dd.id)}) ${listJoin(dd.pub)}.` : `${name(dd.id)} (${tName(dd.id)}) was the standout driver of the race.`, body, dotd: { ri: i } };
}

/* ------------------------------------------------------------ race facts */
/**
 * Everything worth telling about one Grand Prix, for the race report's account of the race and the season review:
 * the result, where people started, first wins and podiums, streaks, the title before and after, incidents, battles,
 * passes on the opening lap, safety cars, retirements, the sprint and Driver of the Day.
 */
function raceFacts(c, s, i) {
  const r = activeRounds(s)[i]; const ses = (r && s.weekends[r.id]?.sessions) || {};
  if (!ses.R?.done) return null;
  const res = ses.R.results; const fin = res.filter(x => !OUT.includes(x.st)); const W = fin[0]?.d; if (!W) return null;
  const g = ses.R.game || null;
  const gridG = g?.grid && Object.values(g.grid).some(Boolean) ? g.grid : null;
  const qOrder = ses.Q?.done ? ses.Q.results.filter(x => !OUT.includes(x.st)).map(x => x.d) : null;
  const gpos = (d) => gridG?.[d] || (qOrder ? qOrder.indexOf(d) + 1 || null : null);
  const pos = (d) => { const k = res.findIndex(x => x.d === d); return k < 0 ? null : OUT.includes(res[k].st) ? res[k].st : k + 1; };
  // career tallies going into the race (real seasons count from the record books, so no "first win" claims there)
  const hist = isHist(s); const stB = seasonStats(s, i);
  const prior = (id, key) => (id === PLAYER_ID || D.DRIVER_BIO[id]?.fictional ? 0 : (D.DRIVER_BIO[id]?.[key] || 0)) + c.seasons.slice(0, s.index).reduce((a, x) => a + (seasonStatsCache(x)[id]?.[key] || 0), 0) + (stB[id]?.[key] || 0);
  const dB = titleMath(s, 'driver', i), dA = titleMath(s, 'driver', i + 1);
  const tB = titleMath(s, 'team', i), tA = titleMath(s, 'team', i + 1);
  const mem = raceMemory(c, s, i);
  const sprint = r.sprint && ses.SPR?.done ? ses.SPR : null;
  return { c, s, i, r, gp: gpThe(r.name), ses, res, fin, W, P2: fin[1]?.d || null, P3: fin[2]?.d || null, gap2: parseGap(res[1]?.gap), pole: qOrder?.[0] || null, gpos, pos,
    firstWin: !hist && !D.DRIVER_BIO[W]?.fictional && prior(W, 'wins') === 0,
    firstPods: hist ? [] : fin.slice(1, 3).map(x => x.d).filter(d => !D.DRIVER_BIO[d]?.fictional && prior(d, 'podiums') === 0),
    streak: mem.run(W).wins + 1, mem, dB, dA, tB, tA,
    // the title contenders going in (from the third race: before that, everyone is)
    contenders: i < 2 ? [] : dB.rows.filter(x => x.alive && x.pts > 0 && (x.pos <= 2 || x.gap <= 25)).slice(0, 4).map(x => x.id),
    climbers: fin.map((x, k) => ({ d: x.d, from: gpos(x.d), to: k + 1 })).filter(x => x.from && x.from - x.to >= 5).map(x => ({ ...x, g: x.from - x.to })).sort((a, b) => b.g - a.g || a.to - b.to),
    dnfs: res.filter(x => x.st === 'DNF').map(x => x.d), dsq: res.filter(x => x.st === 'DSQ').map(x => x.d),
    incidents: g?.incidents || [], battles: raceBattles(ses.R) || [], passes: racePasses(ses.R), safety: g?.safety || null,
    sprW: sprint?.results.find(x => !OUT.includes(x.st))?.d || null,
    dotd: driverOfTheDay(s, i), team: (d) => teamAt(s, d, i),
    oneTwo: !!fin[1] && teamAt(s, W, i)?.id === teamAt(s, fin[1].d, i)?.id,
    title: { change: i > 0 && dA.rows[0]?.id !== dB.rows[0]?.id, decided: dA.decided && !dB.decided,
      out: dA.decided ? [] : dB.rows.filter(x => x.alive && x.pos <= 5 && !dA.rows.find(y => y.id === x.id)?.alive).map(x => x.id),
      teamChange: i > 0 && tA.rows[0]?.id !== tB.rows[0]?.id, teamDecided: tA.decided && !tB.decided } };
}
// Grand Prix names that take "the" in a sentence
const GP_THE = ['Netherlands', 'United States', 'United Kingdom', 'Americas'];
const gpThe = (n) => GP_THE.includes(n) ? 'the ' + n : n;
const cap = (x) => x ? x[0].toUpperCase() + x.slice(1) : x;
/** A count in words up to ten: "three places", "one round". */
const pw = (n, w) => `${nw(n)} ${w}${n === 1 ? '' : 's'}`;
const nw = (n) => n <= 10 ? numWord(n) : String(n);
/** A phrase picker that works through every variant of a kind before it repeats one, so a long piece doesn't echo. */
function phrasebook(rnd) {
  const used = {};
  return (key, variants) => {
    const list = variants.filter(x => x != null && x !== false); if (!list.length) return '';
    const u = used[key] ||= new Set();
    let free = list.map((_, k) => k).filter(k => !u.has(list[k]));
    if (!free.length) { u.clear(); free = list.map((_, k) => k); }
    const k = free[Math.floor(rnd() * free.length)]; u.add(list[k]);
    return list[k];
  };
}
/**
 * The things that happened in a race, each a sentence with a weight for how much it matters: { tag, w, text, ids }.
 * Tags: lap1, safety, incident, battle, climber, firstpod, pole, dnf, sprint, dotd, player.
 * duelsNow / duelsOn: pair keys of wheel-to-wheel rivalries born in this race, and already running.
 */
function raceBeats(F, w, L, { duelsNow = new Set(), duelsOn = new Set() } = {}) {
  const out = []; const add = (tag, wt, text, ids = []) => { if (text) out.push({ tag, w: wt, text, ids }); };
  const o = ordWord; const isC = (d) => F.contenders.includes(d); const num = (d) => typeof F.pos(d) === 'number' ? F.pos(d) : null;
  const out_ = (d) => !!F.pos(d) && typeof F.pos(d) !== 'number';
  const mine = (d) => d === PLAYER || F.team(d)?.id === F.s.playerTeamId;
  const onLap = (l) => l ? ` on lap ${l}` : '';
  // the start
  if (F.passes) {
    const L1 = Object.entries(F.passes.lap1).sort((a, b) => b[1] - a[1]);
    const up = L1[0], down = L1[L1.length - 1];
    if (up && up[1] >= 3) { const n = pw(up[1], 'place'); add('lap1', 1 + up[1] / 2 + (mine(up[0]) ? 1 : 0), w('lap1', [`${L(up[0])} made a flying start, ${n} better off by the end of lap one.`, `${L(up[0])} gained ${n} on the opening lap.`, `The start belonged to ${L(up[0])}, up ${n} in the first few corners.`, `${L(up[0])} was the star of lap one, climbing ${n}.`, `${L(up[0])} got the jump on the field and made up ${n} before the first lap was out.`, `A brilliant getaway lifted ${L(up[0])} ${n}.`, `${L(up[0])} picked off ${n} on the run to the first corners.`]), [up[0]]); }
    if (down && down[1] <= -4) { const n = pw(-down[1], 'place'); add('lap1', 1 - down[1] / 3 + (isC(down[0]) ? 2 : 0), w('lap1-lost', [`${L(down[0])} had a nightmare start, losing ${n} on the first lap.`, `Lap one went badly wrong for ${L(down[0])}, down ${n}.`, `${L(down[0])} was swallowed up at the start and lost ${n}.`, `${L(down[0])} bogged down off the line and dropped ${n}.`]), [down[0]]); }
  }
  // safety cars and red flags
  const sf = F.safety || {};
  if (sf.red) add('safety', 4.5, w('red', ['A red flag stopped the race, and it had to be restarted.', 'The race was red-flagged at one point, bunching everyone up for the restart.', 'Proceedings were halted by a red flag.']));
  else if (sf.sc >= 2) add('safety', 3, w('sc2', [`${numWord(sf.sc)[0].toUpperCase() + numWord(sf.sc).slice(1)} safety car periods kept bunching the field up.`, `The safety car came out ${sf.sc} times.`, `It was a stop-start race, with ${numWord(sf.sc)} safety cars.`]));
  else if (sf.sc === 1) add('safety', 2.2, w('sc1', ['A safety car period shuffled the order.', 'One safety car bunched the field up.', 'The safety car made an appearance and closed the gaps.']));
  else if (sf.vsc) add('safety', 1.2, w('vsc', ['A virtual safety car briefly neutralised the race.', `The race went under a virtual safety car${sf.vsc > 1 ? ` ${sf.vsc} times` : ''}.`]));
  // incidents: the ones that matter most first
  const ended = new Set();
  const incs = F.incidents.map(inc => {
    const big = isC(inc.a) || isC(inc.b) || [inc.a, inc.b].some(d => num(d) && num(d) <= 3);
    const bOut = out_(inc.b);
    return { inc, wt: (inc.major ? 6 : 2.5) + (big ? 3 : 0) + (bOut ? 2 : 0) + ([inc.a, inc.b].some(mine) ? 1.5 : 0), bOut };
  }).sort((a, b) => b.wt - a.wt).slice(0, 3);
  for (const { inc, wt, bOut } of incs) {
    const A = L(inc.a), B = L(inc.b); const lp = onLap(inc.lap);
    const end = bOut ? w('inc-end', [`, ending ${B}’s race`, `, and ${B} did not make it to the flag`, `, which put ${B} out`]) : '';
    if (bOut) ended.add(inc.b);
    const text = inc.noFault ? w('inc-even', [`${A} and ${B} tangled${lp}${end}, a racing incident in the stewards’ eyes.`, `${A} and ${B} made contact${lp}${end}; nobody was blamed.`, inc.lap ? `Lap ${inc.lap} brought contact between ${A} and ${B}${end}, put down as a racing incident.` : null])
      : inc.pen && inc.pen !== 'a warning' ? w('inc-pen', [`${A} was handed ${inc.pen} for hitting ${B}${lp}${end}.`, `Contact with ${B}${lp} earned ${A} ${inc.pen}${end}.`, `The stewards hit ${A} with ${inc.pen} after a clash with ${B}${lp}${end}.`, `${A} went for a gap that wasn’t there${lp}, hit ${B} and collected ${inc.pen}${end}.`])
      : inc.major ? w('inc-major', [`${A} and ${B} collided${lp}${end}, and ${A} was given ${inc.pen || 'the blame'}.`, `A heavy clash between ${A} and ${B}${lp}${end} drew ${inc.pen || 'a reprimand'} for ${A}.`])
      : w('inc-minor', [`${A} tagged ${B}${lp}${end || ', with no lasting harm done'}.`, `There was a brush between ${A} and ${B}${lp}${end}.`, `${A} and ${B} touched${lp}${end || ', but both carried on'}.`, `${A} nudged ${B}${lp}${end}; the stewards let it go.`]);
    add('incident', wt, text, [inc.a, inc.b]);
  }
  // battles
  for (const b of F.battles.slice(0, 3)) {
    const A = L(b.ahead), B = L(b.behind); const k = pairKey(b.a, b.b);
    const span = b.to > b.from ? ` between laps ${b.from} and ${b.to}` : b.from ? ` on lap ${b.from}` : '';
    const where = b.posW < 99 ? ` in ${o(b.posW)}` : '';
    let t = w('battle', [`${A} and ${B} swapped places ${nw(b.n)} times${span}, ${A} coming out on top${where}.`, `The fight of the race was ${A} against ${B}: ${nw(b.n)} changes of position${span}, and ${A} had the last word.`, `${B} and ${A} went at it wheel to wheel${span}, trading places ${nw(b.n)} times before ${A} made it stick.`, `${A} and ${B} put on a show${span}, passing each other ${nw(b.n)} times; ${A} finished ahead.`, `With ${nw(b.n)} passes between them${span}, ${A} and ${B} produced the duel of the day, and it went ${A}’s way.`, `${A} and ${B} could not shake each other off${span}: ${nw(b.n)} changes of position, ${A} ahead at the end.`, `Lap after lap, ${A} and ${B} traded places${span}, ${nw(b.n)} times in all, before ${A} came out in front.`]);
    if (duelsNow.has(k)) t += ' ' + w('duel-born', ['It was the second race running they had gone wheel to wheel, and a rivalry was born.', 'Two races in a row now: these two are rivals on track.', 'That made it two races running, and the paddock started calling it a rivalry.']);
    else if (duelsOn.has(k)) t += ' ' + w('duel-on', ['Another chapter in their running duel.', 'Their on-track rivalry shows no sign of cooling.', 'These two just keep finding each other.']);
    add('battle', 3.5 + Math.min(4, (b.n - 5) / 2) + (b.posW <= 5 ? 2 : 0) + (duelsNow.has(k) ? 3 : 0) + (isC(b.a) || isC(b.b) ? 2 : 0) + ([b.a, b.b].some(mine) ? 1.5 : 0), t, [b.a, b.b]);
  }
  // great drives: the climbers (the winner's climb belongs to the winner's line)
  for (const x of F.climbers.filter(x => x.d !== F.W).slice(0, 2)) {
    add('climber', 1.5 + x.g / 3 + (x.to <= 3 ? 3 : x.to <= 10 ? 1 : 0) + (mine(x.d) ? 1.5 : 0), w('climber', [`${L(x.d)} charged from ${o(x.from)} on the grid to ${o(x.to)}.`, `${L(x.d)} made up ${pw(x.g, 'place')}, ${o(x.from)} to ${o(x.to)}.`, x.to <= 10 ? `${L(x.d)} started ${o(x.from)} and still scored, finishing ${o(x.to)}.` : `${L(x.d)} gained ${pw(x.g, 'place')} on the day, though ${o(x.to)} was still out of the points.`, `${L(x.d)} quietly worked through from ${o(x.from)} to ${o(x.to)}.`, `Up from ${o(x.from)} to ${o(x.to)}: a fine afternoon’s work by ${L(x.d)}.`, `A storming drive took ${L(x.d)} from ${o(x.from)} to ${o(x.to)}.`, `${L(x.d)} was the climber of the day, starting ${o(x.from)} and finishing ${o(x.to)}.`, `From ${o(x.from)} on the grid, ${L(x.d)} carved through to ${o(x.to)}.`]), [x.d]);
  }
  for (const d of F.firstPods) add('firstpod', 6, w('firstpod', [`${L(d)} took a first career podium in ${o(num(d))}.`, `There was a maiden podium for ${L(d)}.`, `${L(d)} stood on a Formula 1 podium for the first time.`, `${o(num(d))[0].toUpperCase() + o(num(d)).slice(1)} meant a first trip to the podium for ${L(d)}.`]), [d]);
  // pole that came to nothing
  if (F.pole && F.pole !== F.W) {
    const p = F.pos(F.pole);
    if (out_(F.pole) && !ended.has(F.pole)) { ended.add(F.pole); add('pole', 4, w('pole-out', [`Pole-sitter ${L(F.pole)} retired.`, `${L(F.pole)} started from pole but did not see the flag.`, `Pole came to nothing for ${L(F.pole)}, out of the race.`]), [F.pole]); }
    else if (num(F.pole) >= 4) add('pole', 3, w('pole-lost', [`${L(F.pole)} could only turn pole into ${o(p)}.`, `Pole-sitter ${L(F.pole)} slipped back to ${o(p)}.`, `${L(F.pole)} started at the front but finished ${o(p)}.`]), [F.pole]);
  }
  // retirements: a title contender's is a story; so is a race that ate cars
  for (const d of F.dnfs.filter(d => !ended.has(d))) {
    if (isC(d)) add('dnf', 6.5, w('dnf-c', [`${L(d)} retired, a heavy blow to the title bid.`, `A retirement for ${L(d)} was a costly zero in the title race.`, `${L(d)} failed to finish, and the championship picture shifted with it.`]), [d]);
    else if (mine(d)) add('dnf', 3.5, w('dnf-m', [`${L(d)} retired.`, `${L(d)}’s race ended early.`, `It was a retirement for ${L(d)}.`]), [d]);
  }
  if (F.dnfs.length >= 4) add('dnf', 3, w('attrition', [`It was a race of attrition: ${F.dnfs.length} cars failed to finish.`, `${F.dnfs.length} drivers retired, ${listJoin(F.dnfs.slice(0, 4).map(L))} among them.`, `Only ${F.fin.length} cars made it to the flag.`]));
  // the sprint
  if (F.sprW) {
    if (F.sprW === F.W) add('sprint', 4, w('spr-dbl', [`It completed a sprint and Grand Prix double for ${L(F.W)}.`, `${L(F.W)} had won the sprint too, for a perfect weekend.`, `Add the sprint win, and it was ${L(F.W)}’s weekend from start to finish.`]), [F.W]);
    else add('sprint', 2, w('spr', [`${L(F.sprW)} had taken the sprint.`, `The sprint had gone to ${L(F.sprW)}.`, `${L(F.sprW)} won the sprint the day before.`]), [F.sprW]);
  }
  // the fans' standout, when it wasn't the winner
  if (F.dotd && F.dotd.id !== F.W && F.dotd.rating >= 9) add('dotd', 3.5, w('dotd', [`${L(F.dotd.id)}’s drive to ${o(F.dotd.finish)} was rated the best of the day.`, `Fans voted ${L(F.dotd.id)} Driver of the Day for the run to ${o(F.dotd.finish)}.`, `The drive of the day was ${L(F.dotd.id)}’s, to ${o(F.dotd.finish)}.`]), [F.dotd.id]);
  // you, when you're not already in the story
  const pp = F.pos(PLAYER);
  if (pp && ![F.W, F.P2, F.P3].includes(PLAYER) && !out.some(b => b.ids.includes(PLAYER))) {
    if (typeof pp === 'number') add('player', pp <= 10 ? 3 : 1.5, pp <= 10 ? w('player', [`${L(PLAYER)} came home ${o(pp)}.`, `${L(PLAYER)} took ${o(pp)} for ${F.team(PLAYER)?.name || 'the team'}.`, `${o(pp)[0].toUpperCase() + o(pp).slice(1)} for ${L(PLAYER)}.`, `${L(PLAYER)} brought it home in ${o(pp)}.`]) : w('player-out', [`${L(PLAYER)} finished ${o(pp)}, outside the points.`, `${L(PLAYER)} could only manage ${o(pp)}.`]), [PLAYER]);
    else if (!ended.has(PLAYER)) add('player', 3.5, w('player-dnf', [`${L(PLAYER)} retired.`, `${L(PLAYER)}’s race ended early.`]), [PLAYER]);
  }
  return out;
}
/** How the race unfolded, for the race report: the start, safety cars, incidents, battles and the big climbs. */
function raceNarrative(F, L, rnd, opts) {
  const w = phrasebook(rnd);
  const B = raceBeats(F, w, L, opts);
  const take = (tag, n, min = 0) => B.filter(b => b.tag === tag && b.w >= min).sort((a, b) => b.w - a.w).slice(0, n);
  const parts = [...take('lap1', 1), ...take('safety', 1), ...take('incident', 3, 3.5), ...take('battle', 2), ...take('climber', 2), ...take('firstpod', 2)];
  return parts.map(b => b.text).join(' ');
}

/* --------------------------------------------------------- season review */
// The season told race by race, once every round is in. Each race gets a lead line about the winner (a first win, a
// climb from far back, a streak, a one-two, a close finish or a rout) and then the two or three things that mattered
// most that day, by weight: the title changing hands or being settled, contenders retiring, big incidents, battles,
// great drives, first podiums. The races are grouped into chapters named after what happened in them, and the piece
// opens on what kind of season it was and closes with the numbers, the battles of the year and your own season.
const _reviewCache = new WeakMap();
function seasonReview(c, s) {
  const rounds = activeRounds(s); const N = rounds.length;
  if (!N || roundsDone(s) < N) return null;
  let v = _reviewCache.get(s); if (v && v.gen === renderGen) return v.rv;
  const rv = buildSeasonReview(c, s, rounds);
  _reviewCache.set(s, { gen: renderGen, rv });
  return rv;
}
function buildSeasonReview(c, s, rounds) {
  const N = rounds.length; const rnd = seeded(`${s.index}-${s.year}-review`); const w = phrasebook(rnd);
  const L = (id) => id === PLAYER_ID ? c.profile.last : lastName(dName(s, id));
  const full = (id) => dName(s, id);
  const facts = rounds.map((r, i) => raceFacts(c, s, i));
  const F0 = facts.filter(Boolean); if (!F0.length) return null;
  const st = seasonStatsCache(s); const ds = driverStandings(s, st); const cs = constructorStandings(s, st);
  const champ = ds[0], run = ds[1]; const C = champ.id;
  const dec = titleDecision(s, 'driver');
  const champTeam = teamOf(s, C);
  const year = s.year;
  // the shape of the season
  const leaders = F0.map(F => F.dA.rows[0]?.id);
  const changes = F0.filter(F => F.title.change).length;
  const leaderSet = [...new Set(leaders)];
  const winners = F0.map(F => F.W); const winSet = [...new Set(winners)];
  const poleSet = [...new Set(F0.map(F => F.pole).filter(Boolean))];
  let maxDef = 0, defAt = null;
  for (const F of F0) { const row = F.dA.rows.find(x => x.id === C); const gap = (F.dA.rows[0]?.pts || 0) - (row?.pts || 0); if (F.i >= 2 && gap > maxDef) { maxDef = gap; defAt = F; } }
  const titles = (C === PLAYER_ID ? 0 : (D.DRIVER_BIO[C]?.titles?.length || 0)) + c.seasons.slice(0, s.index).filter(se => roundsDone(se) === activeRounds(se).length && driverStandings(se)[0]?.id === C).length + 1;
  const prev = c.seasons[s.index - 1];
  const defending = prev && roundsDone(prev) === activeRounds(prev).length ? driverStandings(prev)[0]?.id : Object.entries(D.DRIVER_BIO).find(([, b]) => b.titles?.includes(year - 1))?.[0];
  const final = !!dec?.final, spare = dec ? dec.m.left.length : 0;
  const dominant = champ.wins >= N * 0.5 && champ.pts - run.pts >= 60;
  const character = final ? 'decider' : maxDef >= 30 ? 'comeback' : dominant ? 'dominant' : titles === 1 && !isHist(s) ? 'first' : winSet.length >= 6 ? 'open' : defending === C ? 'repeat' : 'plain';
  const headline = w('h-' + character, {
    decider: [`Down to the wire: the ${year} season in review`, `${year} reviewed: the title that went to the last race`, `One race to decide it all: ${year}, race by race`, `How ${L(C)} won the ${year} title at the death`],
    comeback: [`From ${maxDef} points down: the ${year} season in review`, `${year} reviewed: ${L(C)}’s great comeback`, `The fightback: how ${L(C)} turned ${year} around`],
    dominant: [`Untouchable: ${L(C)}’s ${year}, race by race`, `${year} in review: the season ${L(C)} made their own`, `${champ.wins} wins and a title: ${year} reviewed`, `The ${year} season, and the year nobody could stop ${L(C)}`],
    first: [`${L(C)}’s breakthrough year: ${year} in review`, `A new champion: the ${year} season race by race`, `${year} reviewed: how ${L(C)} became world champion`],
    open: [`${winSet.length} winners, one champion: the ${year} season reviewed`, `${year} in review: anybody’s season, ${L(C)}’s title`, `The year everyone won: ${year}, race by race`],
    repeat: [`${L(C)} again: the ${year} season in review`, `${year} reviewed: ${L(C)} defends the crown`, `Back-to-back: how ${L(C)} won ${year} too`],
    plain: [`The ${year} season, race by race`, `${year} in review: every Grand Prix, every twist`, `Race by race: how ${year} unfolded`, `The story of ${year}`],
  }[character]);
  const standfirst = w('sf', [`All ${N} rounds of the ${year} season, one by one: the wins, the flashpoints, the battles and how the title was won.`, `From ${rounds[0].name} to ${rounds[N - 1].name}: every race of ${year}, and what each one meant.`, `${N} Grands Prix, ${winSet.length === 1 ? 'one winner' : `${winSet.length} different winners`} and one champion. This is how ${year} played out.`]);
  // the opening: what kind of season it was
  const intro = [];
  const shape = [];
  const decGp = dec ? gpThe(dec.r.name) : '';
  if (final) shape.push(w('in-dec', [`The ${year} title went all the way to ${decGp}, the last race of the year.`, `It took until the very last race, in ${decGp}, to settle the ${year} championship.`, `Nobody knew who would be champion until the flag fell in ${decGp}.`]));
  else if (spare >= 3) shape.push(w('in-early', [`${L(C)} had the title wrapped up in ${decGp}, with ${pw(spare, 'round')} still to run.`, `The championship was settled early: ${decGp}, ${pw(spare, 'race')} before the end.`]));
  else if (dec) shape.push(w('in-late', [`The title was decided in ${decGp}, with ${pw(spare, 'round')} to go.`, `It went late: ${cap(decGp)} settled it, ${pw(spare, 'race')} from the end.`]));
  if (leaderSet.length === 1) shape.push(w('in-wire', [`${L(C)} led the championship from the first race to the last.`, `${L(C)} was top of the standings after every single round.`]));
  else if (changes >= 3) shape.push(w('in-swaps', [`The lead changed hands ${nw(changes)} times between ${listJoin(leaderSet.map(L))}.`, `${listJoin(leaderSet.map(L))} all led the championship at some point, and the lead changed ${nw(changes)} times.`]));
  else if (changes) shape.push(w('in-swap', [`${listJoin(leaderSet.map(L))} took turns at the top of the table.`, `The championship lead changed hands ${changes === 1 ? 'once' : 'twice'}.`]));
  if (character === 'comeback' && defAt) shape.push(w('in-cb', [`After ${defAt.gp}, ${L(C)} was ${maxDef} points behind ${L(defAt.dA.rows[0].id)}. It didn’t matter in the end.`, `${L(C)} was ${maxDef} points down after ${defAt.gp}, and still came back to win it.`]));
  if (winSet.length === 1) shape.push(`${L(winSet[0])} won every single race.`);
  else shape.push(w('in-win', [`${numWord(winSet.length)[0].toUpperCase() + numWord(winSet.length).slice(1)} different drivers won Grands Prix${winSet.length >= 6 ? ', and on any given Sunday it could have been almost anyone' : ''}.`, `There were ${numWord(winSet.length)} different winners${poleSet.length ? ` and ${numWord(poleSet.length)} different pole-sitters` : ''}.`]));
  intro.push(shape.join(' '));
  intro.push(`${full(C)} took ${titles === 1 ? 'a first world title' : `a ${ordWord(titles)} world title`}${champTeam ? ` for ${champTeam.name}` : ''}${defending === C ? ', defending the crown' : ''}: ${plural(champ.wins, 'win')}, ${plural(champ.podiums, 'podium')} and ${plural(champ.poles, 'pole')} from ${plural(N, 'round')}, and ${plural(champ.pts, 'point')}, ${champ.pts - run.pts ? `${plural(champ.pts - run.pts, 'point')} clear of ${full(run.id)}` : `level with ${full(run.id)} and ahead on countback`}.`);
  if (cs[0]) intro.push(cs[0].team.id === champTeam?.id
    ? w('in-dbl', [`${cs[0].team.name} completed the double, taking the constructors’ title by ${plural(cs[0].pts - (cs[1]?.pts || 0), 'point')} from ${cs[1]?.team.name}.`, `It was a double for ${cs[0].team.name}: the constructors’ championship came too, ${plural(cs[0].pts - (cs[1]?.pts || 0), 'point')} ahead of ${cs[1]?.team.name}.`])
    : w('in-cc', [`The constructors’ title went elsewhere: ${cs[0].team.name} took it, ${plural(cs[0].pts - (cs[1]?.pts || 0), 'point')} clear of ${cs[1]?.team.name}.`, `${cs[0].team.name} won the constructors’ championship on ${cs[0].pts} points, the stronger pairing over the season.`]));

  // the wheel-to-wheel rivalries, so a race can say when one was born
  const DU = duels(s);
  const bornAt = (i) => new Set(DU.events.filter(e => e.type === 'duelStart' && e.i === i && e.key === 'R').map(e => pairKey(e.a, e.b)));
  const onAt = (i) => new Set(duelsAt(s, i - 1).map(x => pairKey(x.a, x.b)));

  // each race: the lead line, then what mattered
  const lead = (F) => {
    const W = L(F.W), P2 = F.P2 && L(F.P2), P3 = F.P3 && L(F.P3), gp = F.gp, GP = cap(F.gp); const tn = F.team(F.W)?.name || '';
    const from = F.gpos(F.W); const gap = F.gap2;
    const pod = P2 && P3 ? w('pod', [`, ahead of ${P2} and ${P3}`, `, from ${P2} and ${P3}`, `, with ${P2} and ${P3} completing the podium`, '', '']) : '';
    if (F.firstWin) return w('w-first', [`${GP} belonged to ${W}, who finally broke through for a first Grand Prix win.`, `${W} became a Grand Prix winner for the first time in ${gp}${pod}.`, `A first career win for ${W} made ${gp} a day to remember for ${tn}.`, `${W} took a long-awaited maiden victory in ${gp}${pod}.`]);
    if (from >= 10) return w('w-back', [`${W} won ${gp} from ${ordWord(from)} on the grid, picking off the cars ahead one by one.`, `${GP} was a comeback for the ages: ${W} went from ${ordWord(from)} to the top step.`, `Few gave ${W} a chance from ${ordWord(from)} on the grid in ${gp}, but the win came all the same.`, `From ${ordWord(from)} to first: ${W}’s drive in ${gp} will be remembered for years.`]);
    if (from >= 5) return w('w-up', [`Starting ${ordWord(from)}, ${W} still found a way to win ${gp}${pod}.`, `${W} came from ${ordWord(from)} on the grid to win ${gp}.`, `${W} worked forward from ${ordWord(from)} and took the win in ${gp}${pod}.`, `${ordWord(from)[0].toUpperCase() + ordWord(from).slice(1)} on the grid, first at the flag: ${W} in ${gp}.`]);
    if (F.i === 0) return w('w-open', [`The season opened in ${gp} with victory for ${W}${pod}.`, `${W} drew first blood in ${gp}${pod}.`, `${GP} kicked the year off, and ${W} won it${pod}.`, `${W} started the season the way everyone else wanted to: with a win, in ${gp}${pod}.`]);
    if (F.oneTwo) return w('w-12', [`${tn} locked out the top two in ${gp}, ${W} leading ${P2} home.`, `A ${tn} one-two in ${gp}, with ${W} ahead of ${P2}.`, `${GP} was a ${tn} party: ${W} won, ${P2} was second.`, `${tn} were in a class of their own in ${gp}: ${W} first, ${P2} second.`]);
    if (F.streak >= 3) return w('w-run', [`${W} made it ${nw(F.streak)} wins in a row in ${gp}.`, `The winning run went on in ${gp}: ${numWord(F.streak)} straight for ${W}.`, `${GP} brought win number ${F.streak} on the bounce for ${W}.`, `${W} kept on winning: ${gp} made it ${numWord(F.streak)} in a row.`]);
    if (F.streak === 2 && rnd() < 0.6) return w('w-run2', [`${W} made it back-to-back wins in ${gp}${pod}.`, `${W} followed it up with another win in ${gp}${pod}.`, `Two in a row for ${W}, this time in ${gp}.`]);
    if (gap != null && gap < 1) return w('w-close', [`${W} held off ${P2} by just ${gap.toFixed(3)}s in ${gp}.`, `${GP} went to the wire, ${W} beating ${P2} by ${gap.toFixed(3)} seconds.`, `${W} survived a late charge from ${P2} to win ${gp} by ${gap.toFixed(3)}s.`, `Only ${gap.toFixed(3)} seconds covered ${W} and ${P2} at the flag in ${gp}.`]);
    if (gap != null && gap >= 10) return w('w-dom', [`${W} was in a race of one in ${gp}, winning by ${gap.toFixed(1)}s.`, `${GP} was a demolition job: ${W} won by ${gap.toFixed(1)} seconds.`, `Nobody could live with ${W} in ${gp}; the margin at the flag was ${gap.toFixed(1)}s.`, `${W} cruised to victory in ${gp}, ${gap.toFixed(1)} seconds clear of ${P2}.`]);
    if (F.i === N - 1) return w('w-fin', [`The finale in ${gp} went to ${W}${pod}.`, `${W} signed off the year with victory in ${gp}${pod}.`, `${W} won the last race of the year, in ${gp}${pod}.`]);
    if (F.pole === F.W) return w('w-pole', [`${W} converted pole into victory in ${gp}${pod}.`, `Lights to flag in ${gp}: ${W} led from pole.`, `From pole, ${W} controlled ${gp}${pod}.`]);
    return w('w', [`${W} won ${gp}${pod}.`, `Victory in ${gp} went to ${W}${pod}.`, `${GP} fell to ${W}${pod}.`, `${W} took the honours in ${gp}${pod}.`, `${W} was the class of the field in ${gp}${pod}.`, `${GP} was ${W}’s day${pod}.`, `${W} got the job done in ${gp}${pod}.`, `It was ${W} who stood on the top step in ${gp}${pod}.`, `${W} had the measure of everyone in ${gp}${pod}.`, `${W} timed it right in ${gp} and won${pod}.`]);
  };
  const titleBeats = (F) => {
    const out = []; const A0 = F.dA.rows[0], A1 = F.dA.rows[1]; const T = F.title;
    if (T.decided) out.push({ tag: 'title', w: 12, text: F.dA.left.length
      ? w('t-dec', [`That settled the title: ${L(A0.id)} was world champion with ${pw(F.dA.left.length, 'round')} to spare.`, `${L(A0.id)} sealed the championship there and then, ${pw(F.dA.left.length, 'race')} early.`, `And with that, the ${year} title belonged to ${L(A0.id)}.`])
      : w('t-decF', [`${L(A0.id)} left as world champion, the title decided at the very last race.`, `It was enough: ${L(A0.id)} was champion, by ${plural(F.dA.margin, 'point')}.`, `The title, at the last, went to ${L(A0.id)}.`]) });
    else if (T.change) out.push({ tag: 'title', w: 8, text: w('t-chg', [`The result put ${L(A0.id)} top of the standings${F.dA.margin ? `, ${plural(F.dA.margin, 'point')} clear` : ', level on points'}.`, `${L(F.dB.rows[0].id)} lost the championship lead to ${L(A0.id)}.`, `${L(A0.id)} took over at the top of the championship.`, `It was enough to lift ${L(A0.id)} into the championship lead.`]) });
    else if (F.i > 0 && A1 && !F.dB.decided) {
      const d = F.dA.margin - F.dB.margin;
      if (d <= -10) out.push({ tag: 'title', w: 4 + Math.min(3, -d / 8), text: w('t-cut', [`${L(A1.id)} cut the gap at the top to ${plural(F.dA.margin, 'point')}.`, `${L(A0.id)}’s lead was down to ${plural(F.dA.margin, 'point')}.`, `The margin at the top shrank to ${plural(F.dA.margin, 'point')}.`]) });
      else if (d >= 15) out.push({ tag: 'title', w: 3.5 + Math.min(2.5, d / 15), text: w('t-grow', [`${L(A0.id)} stretched the championship lead to ${plural(F.dA.margin, 'point')}.`, `The gap to ${L(A1.id)} grew to ${plural(F.dA.margin, 'point')}.`, `It pushed ${L(A0.id)}’s lead out to ${plural(F.dA.margin, 'point')}.`]) });
    }
    if (T.out.length) { const nm = listJoin(T.out.map(L)); out.push({ tag: 'title', w: 6, text: w('t-out', [`It ended ${nm}’s title hopes.`, `${nm} ${T.out.length > 1 ? 'were' : 'was'} now mathematically out of the running.`, `For ${nm}, the title was gone.`]) }); }
    if (T.teamDecided) out.push({ tag: 'title', w: 7, text: w('t-tdec', [`${F.tA.rows[0].name} wrapped up the constructors’ championship.`, `The constructors’ title was ${F.tA.rows[0].name}’s.`, `${F.tA.rows[0].name} clinched the teams’ title.`]) });
    else if (T.teamChange) out.push({ tag: 'title', w: 4, text: w('t-tchg', [`${F.tA.rows[0].name} took over at the top of the constructors’ table.`, `In the constructors’ race, ${F.tA.rows[0].name} moved to the front.`]) });
    return out;
  };
  const ORDER = ['lap1', 'safety', 'incident', 'battle', 'climber', 'firstpod', 'pole', 'dnf', 'sprint', 'dotd', 'player', 'title'];
  const raceText = (F) => {
    const cands = [...raceBeats(F, w, L, { duelsNow: bornAt(F.i), duelsOn: onAt(F.i) }), ...titleBeats(F)].map(b => ({ ...b, score: b.w + rnd() * 1.5 }));
    cands.sort((a, b) => b.score - a.score);
    const pick = []; const per = {};
    for (const b of cands) {
      if (pick.length >= 3) break;
      if (b.w < 3 && pick.length >= 1) continue;
      if ((per[b.tag] = (per[b.tag] || 0) + 1) > (b.tag === 'title' ? 2 : 1)) continue;
      pick.push(b);
    }
    pick.sort((a, b) => ORDER.indexOf(a.tag) - ORDER.indexOf(b.tag));
    return [lead(F), ...pick.map(b => b.text)].join(' ');
  };

  // chapters: quarters of the season (thirds or halves for a short one), the final race on its own if it decided the title
  const k = N <= 6 ? 2 : N <= 12 ? 3 : 4;
  const cuts = Array.from({ length: k + 1 }, (_, j) => Math.round(N * j / k));
  const segs = [];
  for (let j = 0; j < k; j++) segs.push([cuts[j], cuts[j + 1]]);
  if (final && N >= 8) { segs[segs.length - 1][1] = N - 1; segs.push([N - 1, N]); }
  const decI = dec?.i ?? -1;
  const chapters = segs.filter(([a, b]) => b > a).map(([a, b], j, all) => {
    const Fs = facts.slice(a, b).filter(Boolean); if (!Fs.length) return null;
    const first = Fs[0], lastF = Fs[Fs.length - 1];
    const wins = {}; for (const F of Fs) wins[F.W] = (wins[F.W] || 0) + 1;
    const [top, topWins] = Object.entries(wins).sort((x, y) => y[1] - x[1])[0];
    const leadB = first.i ? first.dB.rows[0]?.id : null, leadA = lastF.dA.rows[0]?.id, second = lastF.dA.rows[1]?.id;
    const mB = first.i ? first.dB.margin : 0, mA = lastF.dA.margin;
    const isLast = j === all.length - 1;
    let title;
    if (final && isLast && b - a === 1 && N >= 8) title = w('ch-final', ['The decider', 'Down to the wire', 'One race, one title', `Showdown in ${first.gp}`]);
    else if (decI >= a && decI < b) title = w('ch-dec', [`${L(C)} closes it out`, 'Sealing the deal', `${L(C)} gets it done`, 'Mission accomplished']);
    else if (isLast && decI >= 0 && decI < a) title = w('ch-after', ['Playing for pride', 'After the title', 'The final act', 'Lap of honour']);
    else if (isLast) title = w('ch-runin', ['The run-in', 'The final stretch', 'Into the closing rounds', 'Crunch time']);
    else if (j === 0) title = topWins >= 2 && top === leadA ? w('ch-open-dom', [`${L(top)} sets the pace`, `A flying start for ${L(top)}`, `${L(top)} out of the blocks`])
      : Object.keys(wins).length >= 3 ? w('ch-open-mix', ['An open start', 'Everyone gets a turn', 'No clear favourite']) : w('ch-open', ['The opening rounds', 'Early skirmishes', 'First impressions']);
    else if (leadB && leadA !== leadB) title = w('ch-swap', [`${L(leadA)} takes charge`, 'A change at the top', `${L(leadA)} hits the front`]);
    else if (topWins >= 3) title = w('ch-roll', [`${L(top)} on a roll`, `The ${L(top)} show`, `${L(top)} hits form`]);
    else if (mA <= 10) title = w('ch-close', ['Neck and neck', 'Nothing in it', 'Trading blows']);
    else if (mA - mB >= 20) title = w('ch-clear', [`${L(leadA)} pulls clear`, `${L(leadA)} tightens the grip`, 'Daylight at the top']);
    else if (mA <= mB - 15) title = w('ch-back', ['The fightback', `${L(second)} hits back`, 'The gap comes down']);
    else title = w('ch-mid', ['The middle of the season', 'Midseason', 'Settling in', 'The long middle stretch']);
    const decided = decI >= 0 && decI < b;
    const close = isLast ? '' : decided ? '' : mA ? w('ch-cl', [`After ${lastF.gp}, ${L(leadA)} led ${L(second)} by ${plural(mA, 'point')}.`, `That left ${L(leadA)} ${plural(mA, 'point')} clear of ${L(second)}.`, `The standings after ${lastF.gp}: ${L(leadA)} on ${lastF.dA.rows[0].pts}, ${L(second)} on ${lastF.dA.rows[1].pts}.`])
      : `After ${lastF.gp}, ${L(leadA)} and ${L(second)} were level on points.`;
    return { title, sub: b - a === 1 ? `Round ${a + 1}` : `Rounds ${a + 1}–${b}`, items: Fs.map(F => {
      const SD = final && F.i === decI ? showdownTold(c, s, F.i, L, w) : null;
      return SD ? { ri: F.i, label: `R${F.i + 1} · ${F.r.name} · the decider`, text: lead(F), paras: [SD.scene, SD.needs.join(' '), SD.race.join(' '), SD.outcome], chart: SD.chart }
        : { ri: F.i, label: `R${F.i + 1} · ${F.r.name}`, text: raceText(F) };
    }), close };
  }).filter(Boolean);

  // the numbers, the battles and the flashpoints
  const lists = [];
  const ids = Object.keys(st).filter(id => s.drivers[id] && st[id].starts);
  const best = (fn) => ids.map(id => ({ id, v: fn(id) })).filter(x => x.v > 0).sort((a, b) => b.v - a.v)[0] || null;
  const nums = [];
  const mw = best(id => st[id].wins); if (mw) nums.push({ id: mw.id, text: `Most wins: ${full(mw.id)}, ${mw.v}` });
  const mp = best(id => st[id].poles); if (mp) nums.push({ id: mp.id, text: `Most poles: ${full(mp.id)}, ${mp.v}` });
  const mpo = best(id => st[id].podiums); if (mpo) nums.push({ id: mpo.id, text: `Most podiums: ${full(mpo.id)}, ${mpo.v}` });
  const made = {}, atFault = {};
  for (const F of F0) { if (F.passes) for (const [d, n] of Object.entries(F.passes.made)) made[d] = (made[d] || 0) + n; for (const inc of F.incidents) if (!inc.noFault) atFault[inc.a] = (atFault[inc.a] || 0) + 1; }
  const mo = Object.entries(made).sort((a, b) => b[1] - a[1])[0]; if (mo) nums.push({ id: mo[0], text: `Most overtakes: ${full(mo[0])}, ${mo[1]}` });
  const climb = {}; for (const F of F0) for (const x of F.climbers) climb[x.d] = (climb[x.d] || 0) + x.g;
  const mc = Object.entries(climb).sort((a, b) => b[1] - a[1])[0]; if (mc) nums.push({ id: mc[0], text: `Places made up in big climbs: ${full(mc[0])}, ${mc[1]}` });
  const md = best(id => st[id].dnfs); if (md && md.v >= 2) nums.push({ id: md.id, text: `Most retirements: ${full(md.id)}, ${md.v}` });
  const mf = Object.entries(atFault).sort((a, b) => b[1] - a[1])[0]; if (mf && mf[1] >= 2) nums.push({ id: mf[0], text: `Most incidents at fault: ${full(mf[0])}, ${mf[1]}` });
  nums.push({ text: `${plural(winSet.length, 'different winner')}${poleSet.length ? `, ${plural(poleSet.length, 'different pole-sitter')}` : ''}${changes ? `, ${changes} changes of championship leader` : ''}` });
  lists.push({ title: 'By the numbers', items: nums });
  const fights = [];
  for (const e of DU.events.filter(e => e.type === 'duelStart')) {
    const end = DU.events.find(x => x.type === 'duelEnd' && pairKey(x.a, x.b) === pairKey(e.a, e.b) && (x.i > e.i || (x.i === e.i && x.key === 'R' && e.key === 'SPR')));
    const bt = DU.all.filter(b => pairKey(b.a, b.b) === pairKey(e.a, e.b) && b.i >= e.battles[0].i && (!end || b.i <= end.i));
    const sc = bt.reduce((o, b) => { o[b.ahead] = (o[b.ahead] || 0) + 1; return o; }, {}); const ahead = (sc[e.a] || 0) >= (sc[e.b] || 0) ? e.a : e.b;
    const where = [...new Set(bt.map(b => rounds[b.i].name))];
    fights.push({ id: ahead, w: bt.reduce((a, b) => a + b.n, 0), text: `${L(e.a)} v ${L(e.b)}: wheel to wheel in ${bt.length} races (${where.length > 3 ? `${where[0]} to ${where[where.length - 1]}` : listJoin(where)}), ${bt.reduce((a, b) => a + b.n, 0)} passes, ${sc[e.a] === sc[e.b] ? 'honours even' : `${L(ahead)} ahead ${sc[ahead]}–${bt.length - sc[ahead]}`}` });
  }
  for (const b of DU.all.slice().sort((x, y) => y.n - x.n).slice(0, 3)) if (!fights.some(f => f.text.startsWith(`${L(b.a)} v ${L(b.b)}`) || f.text.startsWith(`${L(b.b)} v ${L(b.a)}`)))
    fights.push({ id: b.ahead, w: b.n, text: `${L(b.ahead)} v ${L(b.behind)}, ${rounds[b.i].name}${b.key === 'SPR' ? ' sprint' : ''}: ${b.n} changes of position` });
  if (fights.length) lists.push({ title: 'Battles of the year', items: fights.sort((a, b) => b.w - a.w).slice(0, 5) });

  // the close: Driver of the Season, your season, and next year
  const outro = [];
  const dots = driverOfTheSeason(s);
  if (dots?.final) outro.push(dots.id === C ? w('o-dots', [`${L(C)} was Driver of the Season too, with ${plural(dots.dotd, 'Driver of the Day award')}.`, `The fans agreed: ${L(C)} was also their Driver of the Season.`])
    : w('o-dots2', [`The fans’ Driver of the Season, though, was ${full(dots.id)}, with ${plural(dots.dotd, 'Driver of the Day award')}.`, `Not the champion, but the fans’ pick: ${full(dots.id)} was Driver of the Season.`]));
  if (isPrincipal(c)) {
    const T = cs.find(x => x.team.id === s.playerTeamId);
    const pc = prev ? constructorStandings(prev).find(x => x.team.id === s.playerTeamId)?.pos : null;
    if (T && T.pos !== 1) {
      const dr = ds.filter(x => teamOf(s, x.id)?.id === s.playerTeamId);
      outro.push(w('o-team', [`${T.team.name} finished ${ordWord(T.pos)} in the constructors’ championship with ${plural(T.pts, 'point')}${pc ? (pc > T.pos ? `, up from ${ordWord(pc)} in ${prev.year}` : pc < T.pos ? `, down from ${ordWord(pc)} in ${prev.year}` : `, the same as in ${prev.year}`) : ''}.`, `For ${T.team.name}, ${year} ended ${ordWord(T.pos)} of ${cs.length} teams, on ${plural(T.pts, 'point')}.`])
        + (dr.length ? ` In the drivers’ standings, ${listJoin(dr.map(x => `${full(x.id)} was ${ordWord(x.pos)}`))}.` : ''));
    }
  }
  const me = isPrincipal(c) ? null : ds.find(x => x.id === PLAYER);
  if (me && me.id !== C) {
    const pPrev = prev ? driverStandings(prev).find(x => x.id === PLAYER)?.pos : null;
    const trend = pPrev ? (pPrev > me.pos ? `, up from ${ordWord(pPrev)} in ${prev.year}` : pPrev < me.pos ? `, down from ${ordWord(pPrev)} in ${prev.year}` : `, the same as in ${prev.year}`) : '';
    outro.push(w('o-me', [`${full(PLAYER)} finished ${ordWord(me.pos)} in the championship with ${plural(me.pts, 'point')}${me.wins ? ` and ${plural(me.wins, 'win')}` : me.podiums ? ` and ${plural(me.podiums, 'podium')}` : ''}${trend}.`,
      `For ${full(PLAYER)}, ${year} ended in ${ordWord(me.pos)} place, on ${plural(me.pts, 'point')}${me.wins ? `, with ${plural(me.wins, 'win')}` : ''}${trend}.`]));
  }
  outro.push(w('o-next', [`Roll on ${year + 1}.`, `${L(C)} carries the number one into ${year + 1}. Everyone else has a winter to work out how to stop that.`, `The ${year + 1} season can’t come soon enough.`, champ.wins >= N / 2 ? `The question for ${year + 1} is simple: can anyone stop ${L(C)}?` : `If ${year} is anything to go by, ${year + 1} will be worth watching.`]));
  return { headline, standfirst, intro, chapters, lists, outro, n: N, champ: C };
}
/** The race-by-race part of a season review, as HTML. */
function reviewHtml(c, s, RV) {
  return `<div class="review-body">
    ${RV.chapters.map(ch => `<section class="rv-ch"><h3>${esc(ch.title)} <span class="muted">· ${esc(ch.sub)}</span></h3>
      ${ch.items.map(it => `<p><b class="rv-r">${esc(it.label)}</b> ${esc(it.text)}</p>${(it.paras || []).filter(Boolean).map(p => `<p>${esc(p)}</p>`).join('')}${it.chart || ''}`).join('')}${ch.close ? `<p class="rv-close">${esc(ch.close)}</p>` : ''}</section>`).join('')}
    ${RV.lists.length ? `<div class="grid-2">${RV.lists.map(l => `<div class="story-sec"><h3>${esc(l.title)}</h3><ul class="ms-list">${l.items.map(o => `<li>${o.id ? avatar(c, s, o.id, 24) : ''}<span>${esc(o.text)}</span></li>`).join('')}</ul></div>`).join('')}</div>` : ''}
    ${RV.outro.length ? `<div class="body">${RV.outro.map(p => `<p>${esc(p)}</p>`).join('')}</div>` : ''}
  </div>`;
}
/** The battle of a race or sprint as a story of its own: the biggest one, when it was near the front or involved you. */
const BATTLE_QUOTES = {
  won: ['That was some of the best racing I’ve had. Hard, but fair.', 'We went back and forth for laps. I’m glad I came out ahead in the end.', 'Every time I got past, they came straight back. I loved it.', 'You have to respect a fight like that. It made the result feel earned.'],
  lost: ['I gave it everything. It was fun, even if I ended up on the wrong side of it.', 'We were racing hard all afternoon. Next time it goes my way.', 'It was a proper fight. I just didn’t have quite enough at the end.', 'Great racing. A shame about the result, but I enjoyed it.'],
  wonNeedle: ['It got a bit physical at times. I’m glad it’s over.', 'Some of those moves were on the limit. But I came out ahead.'],
  lostNeedle: ['There was contact, and I don’t think it was all on me.', 'They made it very hard. Maybe too hard.'],
};
function battleStory(c, s, i, r, key, sd, h) {
  const B = raceBattles(sd); const b = B?.[0]; if (!b) return null;
  const mine = [b.a, b.b].some(d => d === PLAYER || teamOf(s, d)?.id === s.playerTeamId);
  if (b.posW > 6 && !mine && b.n < 8) return null;
  if (duels(s).events.some(e => e.type === 'duelStart' && e.i === i && e.key === key && pairKey(e.a, e.b) === pairKey(b.a, b.b))) return null; // the rivalry story tells it
  const rnd = seeded(`${s.index}-${r.id}-${key}-battle`); const sprint = key === 'SPR';
  const A = h.last(b.ahead), Bn = h.last(b.behind);
  const touched = (sd.game?.incidents || []).some(x => pairKey(x.a, x.b) === pairKey(b.a, b.b));
  const at = b.posW <= 3 ? `for ${b.posW === 1 ? 'the lead' : 'a podium place'}` : b.posW <= 10 ? 'for points' : 'deep in the pack';
  return { id: `${s.index}-${r.id}${key}battle`, seq: i * 10 + (sprint ? 2 : 4) + 0.4, kind: 'battle', i, r, subject: b.ahead === PLAYER ? b.behind : b.ahead, outlet: choose(rnd, D.OUTLETS), kicker: sprint ? 'Battle of the sprint' : 'Battle of the race',
    headline: choose(rnd, [`${A} v ${Bn}: ${b.n} passes ${at}`, `${A} and ${Bn} light up ${r.name}${sprint ? ' sprint' : ''}`, `Wheel to wheel: ${A} beats ${Bn} after a ${b.n}-pass fight`, `${b.n} changes of position, one winner: ${A} edges ${Bn}`]),
    standfirst: `${A} and ${Bn} swapped places ${nw(b.n)} times ${b.to > b.from ? `between laps ${b.from} and ${b.to}` : `on lap ${b.from}`} ${at}. ${A} finished ${OUT.includes(sd.results.find(x => x.d === b.ahead)?.st) ? 'ahead' : ordWord(b.posW)}, ${Bn} ${b.posL < 99 ? ordWord(b.posL) : 'did not finish'}.`,
    body: touched ? ['It wasn’t all clean: the two made contact along the way.'] : [],
    quotes: [[b.ahead, touched ? 'wonNeedle' : 'won'], [b.behind, touched ? 'lostNeedle' : 'lost']].filter(([d]) => d !== PLAYER).map(([d, k]) => ({ id: d, text: choose(rnd, BATTLE_QUOTES[k]) })) };
}

function buildStories(c, s) {
  const out = [];
  const rounds = activeRounds(s);
  const nr = nextRound(s); const nri = nr ? rounds.indexOf(nr) : rounds.length;
  const name = (id) => dName(s, id);
  const last = (id) => id === PLAYER_ID ? c.profile.last : lastName(name(id));
  const tName = (id) => teamOf(s, id)?.name || '';
  const outletFor = (rnd) => choose(rnd, D.OUTLETS);
  const prevWins = (id) => (D.DRIVER_BIO[id]?.wins || 0) + c.seasons.slice(0, s.index).reduce((a, se) => a + (seasonStatsCache(se)[id]?.wins || 0), 0);
  for (let i = 0; i < rounds.length && i <= nri; i++) {
    const r = rounds[i]; const ses = s.weekends[r.id]?.sessions || {};
    const gp = r.name; const rid = `${s.index}-${r.id}`;
    const mem = raceMemory(c, s, i);
    // title deciders ahead of the weekend
    for (const kind of ['driver', 'team']) {
      const m = i === nri ? titleMath(s, kind) : titleMath(s, kind, i);
      if (m.decided || m.left[0]?.i !== i) continue;
      const P = roundPerms(m);
      if (!P?.clinch.length) continue;
      const rnd = seeded(rid + kind + 'pre');
      const L = m.rows[0], R2 = m.rows[1];
      const solo = P.clinch.length === 1 ? P.clinch[0].x : null;
      const who = (x) => kind === 'team' ? x.name : last(x.id);
      // the last race with more than one contender left is an event of its own
      const alive = m.rows.filter(x => x.alive);
      const showdown = m.left.length === 1 && alive.length >= 2;
      const showHead = !showdown ? null : alive.length >= 3
        ? `${numWord(alive.length)[0].toUpperCase() + numWord(alive.length).slice(1)} ${kind === 'team' ? 'teams' : 'drivers'}, one title: the ${gp} showdown`
        : `${who(alive[0])} v ${who(alive[1])}: the ${kind === 'team' ? 'constructors’ title' : 'title'} comes down to ${gp}`;
      const SD = showdown && kind === 'driver' ? showdownPreviewLines(c, s, i, last) : null;
      out.push({
        id: rid + kind + 'pre', seq: i * 10, kind: 'preview', i, r, subject: kind === 'driver' ? (solo || L).id : null, outlet: outletFor(rnd), massive: showdown,
        kicker: showdown ? (kind === 'team' ? 'Constructors’ showdown · Final race' : 'Title showdown · Final race') : kind === 'team' ? 'Constructors’ title' : 'Title decider',
        list: showdown && kind === 'driver' ? alive.map(x => ({ id: x.id, text: `${x.name}: ${x.pts} points${x.gap ? `, ${x.gap} behind` : x === alive[0] ? ', leads' : ', level on points'}` })) : null,
        headline: showHead || (solo ? (kind === 'team' ? `${solo.name} can seal the constructors’ crown in ${gp}` : `${who(solo)} can clinch the title in ${gp}`) : `${kind === 'team' ? 'Constructors’ title' : 'Championship'} could be settled in ${gp}`),
        standfirst: `${L.name} arrive${kind === 'team' ? '' : 's'} at ${r.venue} ${m.margin ? `with a ${m.margin}-point lead over ${R2.name}` : `level on points with ${R2.name}`}, and ${m.R} points are left to play for. Here is what has to happen.`,
        body: SD ? SD.lines : [`Going into round ${i + 1}, the top three are ${listJoin(m.rows.slice(0, 3).map(x => `${x.name} (${x.pts})`))}. ${P.G} points are available this weekend${P.nx.spr ? ' across the sprint and the race' : ''}, leaving ${P.Rp} after it.`,
          P.clinch.length > 1 ? `${listJoin(P.clinch.map(x => x.x.name))} can all leave ${gp} as champion${kind === 'team' ? 's' : ''}.` : '',
          showdown ? `It is the final race of the season and nothing is settled. ${alive.length >= 3 ? `A ${numWord(alive.length)}-way decider is the stuff of legend: the last one in Formula 1 was 2010.` : 'One race, winner takes all.'}` : ''].filter(Boolean),
        permsHtml: permsHtml(m, P, { compact: true }),
        quotes: SD ? (() => { const qw = phrasebook(rnd); return SD.N.rows.filter(o => o.id !== PLAYER).map(o => ({ id: o.id, text: qw(o.leader ? 'l' : 'c', SHOWDOWN_QUOTES[o.leader ? 'preLead' : 'preChase']) })); })() : kind === 'driver' ? [{ id: L.id, text: choose(rnd, QUOTES.preLead) }, ...(R2 && R2.alive && R2.id !== PLAYER ? [{ id: R2.id, text: choose(rnd, QUOTES.preChase) }] : [])].filter(q => q.id !== PLAYER) : [],
      });
    }
    // the next round: a preview built from what has happened so far (unless a title decider preview covers it)
    if (i === nri && i > 0 && !ses.Q?.done && !out.some(x => x.kind === 'preview' && x.i === i)) {
      const pv = previewStory(c, s, i, mem, { name, last, tName });
      if (pv) out.push(pv);
    }
    // qualifying
    if (ses.Q?.done) {
      const q = ses.Q.results.filter(x => !OUT.includes(x.st)); const pole = q[0]?.d;
      if (pole) {
        const rnd = seeded(rid + 'q');
        const lap = ses.Q.results[0]?.lap; const gap2 = parseGap(ses.Q.results[1]?.gap);
        out.push({
          id: rid + 'q', seq: i * 10 + 1, kind: 'quali', i, r, subject: pole, outlet: outletFor(rnd), kicker: 'Qualifying',
          headline: pole === PLAYER ? `Pole position for ${last(pole)} in ${gp}` : choose(rnd, [`${last(pole)} takes pole in ${gp}`, `${last(pole)} quickest in ${gp} qualifying`, `${gp}: pole for ${last(pole)}`]),
          standfirst: `${name(pole)} (${tName(pole)}) will start the ${gp} Grand Prix from pole${lap ? ` after a ${lap}` : ''}${gap2 != null ? `, ${gap2.toFixed(3)}s clear of ${name(q[1]?.d)}` : q[1] ? `, ahead of ${name(q[1].d)}` : ''}.`,
          body: [`The top ten: ${q.slice(0, 10).map((x, k) => `${k + 1}. ${last(x.d)}`).join(', ')}.`,
            qualiMemory(mem, q, pole, last, rnd),
            ...rivalryQualiLines(c, s, i, q, last, rnd),
            q.findIndex(x => x.d === PLAYER) >= 10 ? `${name(PLAYER)} qualified ${ordWord(q.findIndex(x => x.d === PLAYER) + 1)}.` : ''].filter(Boolean),
        });
      }
    }
    // sprint
    if (r.sprint && ses.SPR?.done) {
      const fin = ses.SPR.results.filter(x => !OUT.includes(x.st));
      if (fin[0]) {
        const rnd = seeded(rid + 'spr');
        out.push({
          id: rid + 'spr', seq: i * 10 + 2, kind: 'sprint', i, r, subject: fin[0].d, outlet: outletFor(rnd), kicker: 'Sprint',
          headline: choose(rnd, [`${last(fin[0].d)} wins the ${gp} sprint`, `Sprint victory for ${last(fin[0].d)} in ${gp}`]),
          standfirst: `${name(fin[0].d)} took the eight points for winning the ${gp} sprint${fin[1] ? `, from ${name(fin[1].d)}${fin[2] ? ` and ${name(fin[2].d)}` : ''}` : ''}.`,
          body: [fin.length > 3 ? `Also in the points: ${fin.slice(3, 8).map((x, k) => `${last(x.d)} (${ordWord(k + 4)})`).join(', ')}.` : ''].filter(Boolean),
          results: ses.SPR.results.slice(0, 8).map((x, k) => ({ d: x.d, pos: k + 1, st: x.st, pts: pointsFor('SPR', k + 1, x.st, x.pts) })),
        });
      }
      out.push(...incidentStories(c, s, i, r, 'SPR', ses.SPR, { name, last, tName }));
      { const bs = battleStory(c, s, i, r, 'SPR', ses.SPR, { name, last, tName }); if (bs) out.push(bs); }
    }
    if (!ses.R?.done) continue;
    // race report
    const res = ses.R.results; const fin = res.filter(x => !OUT.includes(x.st));
    const W = fin[0]?.d; if (!W) continue;
    const rnd = seeded(rid + 'r');
    const grid = ses.Q?.done ? ses.Q.results.map(x => x.d) : null;
    const gpos = (id) => grid ? grid.indexOf(id) + 1 || null : null;
    const pole = grid?.[0];
    const gap2 = parseGap(res[1]?.gap);
    const fl = fastestOf(ses.R);
    const sameTeam = fin[1] && teamOf(s, W)?.id === teamOf(s, fin[1].d)?.id;
    const firstWin = prevWins(W) + (seasonStats(s, i)[W]?.wins || 0) === 0 && !D.DRIVER_BIO[W]?.fictional;
    let headline;
    if (W === PLAYER) headline = firstWin ? `${last(W)} takes a first Grand Prix win in ${gp}` : choose(rnd, [`${last(W)} wins the ${gp} Grand Prix`, `Victory for ${last(W)} in ${gp}`]);
    else if (firstWin) headline = `${last(W)} takes a maiden Grand Prix win in ${gp}`;
    else if (sameTeam) headline = `${tName(W)} one-two in ${gp} as ${last(W)} leads ${last(fin[1].d)} home`;
    else if (gpos(W) >= 6) headline = `${last(W)} charges from ${ordWord(gpos(W))} on the grid to win in ${gp}`;
    else if (gap2 != null && gap2 < 1) headline = `${last(W)} holds off ${last(fin[1].d)} in a ${gp} thriller`;
    else if (gap2 != null && gap2 > 10) headline = `${last(W)} dominates in ${gp}`;
    else if (pole === W) headline = choose(rnd, [`${last(W)} converts pole into ${gp} victory`, `Lights to flag for ${last(W)} in ${gp}`]);
    else headline = choose(rnd, [`${last(W)} wins in ${gp}`, `${last(W)} takes the ${gp} Grand Prix`, `${gp} glory for ${last(W)}`]);
    const body = [];
    body.push(`${name(W)} (${tName(W)}) finished top in ${gp}${fin[1] ? ` from ${name(fin[1].d)}${gap2 != null ? `, ${gap2.toFixed(3)} seconds behind` : ''}` : ''}${fin[2] ? `, with ${name(fin[2].d)} (${tName(fin[2].d)}) completing the podium` : ''}.`
      + (fin.length > 3 ? ` Behind them, ${last(fin[3].d)} took fourth${fin.length > 4 ? ` ahead of ${listJoin(fin.slice(4, fin.length >= 10 ? 9 : 10).map(x => last(x.d)))}` : ''}${fin.length >= 10 ? `, with ${last(fin[9].d)} taking the final point` : ''}.` : ''));
    const notes = [];
    if (pole && pole !== W) { const pp = res.findIndex(x => x.d === pole); notes.push(OUT.includes(res[pp]?.st) ? `Pole-sitter ${name(pole)} did not finish.` : `Pole-sitter ${name(pole)} had to settle for ${ordWord(pp + 1)}.`); }
    if (pole === W) notes.push(`${last(W)} started from pole.`);
    else if (gpos(W)) notes.push(`${last(W)} started ${ordWord(gpos(W))}.`);
    const dnfs = res.filter(x => x.st === 'DNF'); const dsq = res.filter(x => x.st === 'DSQ');
    if (dnfs.length) notes.push(`${listJoin(dnfs.map(x => name(x.d)))} failed to finish.`);
    if (dsq.length) notes.push(`${listJoin(dsq.map(x => name(x.d)))} ${dsq.length > 1 ? 'were' : 'was'} disqualified.`);
    // penalties, when the race came from the game
    const pens = (ses.R.game?.penalties || []).filter(p => (p.type === 4 || p.type <= 1) && !COLLISION_INFR.includes(p.infr)); // collisions get their own line
    if (pens.length) notes.push(`Penalties: ${listJoin(pens.slice(0, 4).map(p => `${last(p.d)} ${p.type === 4 ? `${p.time} seconds` : `a ${PENALTY_NAMES[p.type]}`}${INFRINGEMENTS[p.infr] && !COLLISION_INFR.includes(p.infr) ? ` for ${INFRINGEMENTS[p.infr]}` : ''}${p.lap ? ` on lap ${p.lap}` : ''}`))}${pens.length > 4 ? `, and ${plural(pens.length - 4, 'more')}` : ''}.`);
    if (fl) notes.push(`${name(fl)} set the fastest lap${res.find(x => x.d === fl)?.lap ? ` with a ${res.find(x => x.d === fl).lap}` : ''}.`);
    const sprW = r.sprint && ses.SPR?.done ? ses.SPR.results.find(x => !OUT.includes(x.st))?.d : null;
    if (sprW) notes.push(sprW === W ? `It completes a sprint and Grand Prix double for ${last(W)}.` : `${name(sprW)} had won the sprint.`);
    const RF = raceFacts(c, s, i);
    const narr = RF ? raceNarrative(RF, last, seeded(rid + 'narr'), { duelsNow: new Set(duels(s).events.filter(e => e.type === 'duelStart' && e.i === i && e.key === 'R').map(e => pairKey(e.a, e.b))), duelsOn: new Set(duelsAt(s, i - 1).map(x => pairKey(x.a, x.b))) }) : '';
    if (narr) body.push(narr);
    body.push(notes.join(' '));
    const memLine = raceMemoryLine(mem, res, W, last, name, rnd);
    if (memLine) body.push(memLine);
    const rivLines = rivalryRaceLines(c, s, i, res, last, rnd); if (rivLines.length) body.push(rivLines.join(' '));
    const dd = driverOfTheDay(s, i);
    if (dd) body.push(`Driver of the Day: ${name(dd.id)} (${dd.rating.toFixed(1)}/10)${dd.pub.length ? `, who ${listJoin(dd.pub)}` : ''}.`);
    // the player and their teammate
    const pi = res.findIndex(x => x.d === PLAYER);
    if (pi >= 3 || (pi >= 0 && OUT.includes(res[pi].st))) {
      const mate = teammateOf(s); const mi = res.findIndex(x => x.d === mate);
      const meOut = OUT.includes(res[pi].st), mateOut = mi >= 0 && OUT.includes(res[mi].st);
      body.push(meOut ? `${name(PLAYER)}’s race ended early${res[pi].st === 'DSQ' ? ' with a disqualification' : ''}${mate && !mateOut ? `, while ${name(mate)} came home ${ordWord(mi + 1)}` : ''}.`
        : `${name(PLAYER)} finished ${ordWord(pi + 1)} for ${tName(PLAYER)}${mate ? (mateOut ? `, with teammate ${name(mate)} out of the race` : mi > pi ? `, ${mi - pi === 1 ? 'one place' : plural(mi - pi, 'place')} ahead of teammate ${name(mate)}` : `, behind teammate ${name(mate)} in ${ordWord(mi + 1)}`) : ''}.`);
    }
    // championship picture before and after the weekend
    const dB = titleMath(s, 'driver', i), dA = titleMath(s, 'driver', i + 1);
    const tB = titleMath(s, 'team', i), tA = titleMath(s, 'team', i + 1);
    const champ = [];
    const A0 = dA.rows[0], A1 = dA.rows[1], B0 = dB.rows[0];
    const posB = Object.fromEntries(dB.rows.map(x => [x.id, x.pos]));
    if (i === 0) champ.push(`${name(A0.id)} leads the championship after the opening round${A1 ? `, ${dA.margin ? `${plural(dA.margin, 'point')} clear of ${name(A1.id)}` : `level with ${name(A1.id)}`}` : ''}.`);
    else if (A0.id !== B0.id) champ.push(`${name(A0.id)} takes the championship lead from ${name(B0.id)}${dA.margin ? ` and now leads by ${plural(dA.margin, 'point')}` : ', the two level on points'}.`);
    else if (dA.margin > dB.margin) champ.push(`${last(A0.id)} extends the championship lead to ${plural(dA.margin, 'point')} over ${name(A1.id)}${posB[A1.id] !== 2 ? `, who moves up to second` : ''}.`);
    else if (dA.margin < dB.margin) champ.push(dA.margin ? `${name(A1.id)} cuts ${last(A0.id)}’s championship lead to ${plural(dA.margin, 'point')}${posB[A1.id] !== 2 ? ` after moving up to second` : ''}.` : `${name(A1.id)} draws level with ${last(A0.id)} on points, ${last(A0.id)} staying ahead on countback.`);
    else champ.push(`${last(A0.id)}’s lead over ${name(A1.id)} stays at ${plural(dA.margin, 'point')}.`);
    if (i > 0) {
      const moves = dA.rows.slice(2, 6).filter(x => posB[x.id] && posB[x.id] !== x.pos).map(x => `${last(x.id)} ${posB[x.id] > x.pos ? 'moves up to' : 'drops to'} ${ordWord(x.pos)}`);
      if (moves.length) champ.push(`Further back, ${listJoin(moves)}.`);
    }
    const cB0 = tB.rows[0], cA0 = tA.rows[0];
    if (cA0) champ.push(i > 0 && cA0.id !== cB0?.id ? `In the constructors’ championship, ${cA0.name} take over at the top, ${plural(tA.margin, 'point')} ahead of ${tA.rows[1].name}.` : `${cA0.name} lead the constructors’ championship by ${plural(tA.margin, 'point')} from ${tA.rows[1]?.name}.`);
    // knocked out of the title fight: named only if they were near the top (a dozen names at once is no story)
    const droppedAll = dB.rows.filter(x => x.alive && !dA.rows.find(y => y.id === x.id)?.alive && !dA.decided);
    const dropped = droppedAll.filter(x => x.pos <= 6);
    if (dropped.length) champ.push(`The result ends ${listJoin(dropped.map(x => last(x.id)))}’s title hopes.`);
    else if (droppedAll.length) { const left = dA.rows.filter(x => x.alive); if (left.length <= 4) champ.push(`Only ${listJoin(left.map(x => last(x.id)))} can still win the title.`); }
    if (dA.decided && !dB.decided) champ.push(`${name(A0.id)} is the ${s.year} world champion.`);
    if (tA.decided && !tB.decided) champ.push(`${cA0.name} are the ${s.year} constructors’ champions.`);
    body.push(champ.join(' '));
    // what they said
    const quotes = [{ id: W, text: choose(rnd, QUOTES.win) }];
    if (fin[1]) quotes.push({ id: fin[1].d, text: choose(rnd, QUOTES.p2) });
    if (fin[2]) quotes.push({ id: fin[2].d, text: choose(rnd, QUOTES.p3) });
    if (dnfs[0]) quotes.push({ id: dnfs[0].d, text: choose(rnd, QUOTES.dnf) });
    const mine = c.media.find(x => x.article && x.seasonIdx === s.index && x.roundId === r.id && x.kind === 'race');
    const myLine = mine?.questions.map(q => q.answer?.trim()).find(a => a && a.length > 20 && !/^no comment/i.test(a));
    const qs = quotes.filter(q => q.id !== PLAYER);
    if (myLine) qs.push({ id: PLAYER, text: myLine, real: true });
    const TL = dB.left.length > 1 && roundPerms(dB)?.clinch.length ? titleByLap(s, i) : null;
    out.push({ id: rid + 'r', seq: i * 10 + 4, kind: 'race', chartHtml: TL ? titleChartHtml(s, TL, last) : '', i, r, subject: W, outlet: outletFor(rnd), kicker: 'Race report', headline, standfirst: `Round ${i + 1} of ${rounds.length} · ${r.venue}`, body, quotes: qs, results: res.slice(0, 10).map((x, k) => ({ d: x.d, pos: k + 1, st: x.st, pts: pointsFor('R', k + 1, x.st, x.pts), gap: x.gap })) });
    if (dd) out.push(dotdStory(c, s, i, dd, mem, { name, last, tName }));
    out.push(...incidentStories(c, s, i, r, 'R', ses.R, { name, last, tName }));
    { const bs = battleStory(c, s, i, r, 'R', ses.R, { name, last, tName }); if (bs) out.push(bs); }
    const fv = fanVoiceStory(c, s, i); if (fv) out.push(fv);

    // an interview with someone from the race
    const gained = fin.map((x, k) => ({ d: x.d, g: (gpos(x.d) || 0) - (k + 1), f: k + 1 })).filter(x => x.g >= 4 && x.d !== PLAYER).sort((a, b) => b.g - a.g)[0];
    const rival = (() => { const a = archRivalOf(c, s, i); return a && res.some(x => x.d === a) ? a : null; })();
    // rotate who faces the press: the winner, the biggest climber, then someone who retired or your rival
    const subj = i % 3 === 1 && gained ? gained.d : i % 3 === 2 && dnfs[0] && dnfs[0].d !== PLAYER ? dnfs[0].d : i % 3 === 2 && rival ? rival : W;
    if (subj && subj !== PLAYER) {
      const pr = seeded(rid + 'pen');
      const fpos = res.findIndex(x => x.d === subj) + 1; const isOut = OUT.includes(res[fpos - 1]?.st);
      const sp = dA.rows.find(x => x.id === subj);
      const qa = [];
      if (isOut) qa.push(['What happened out there?', choose(pr, QUOTES.dnf)], ['How costly is this for your season?', sp?.alive && !dA.decided ? 'It hurts, but there are still plenty of points out there. We go again.' : 'We just have to reset and make sure it doesn’t happen again.']);
      else if (subj === W) qa.push(['Talk us through the race from the cockpit.', choose(pr, QUOTES.win)], [`That puts you ${ordWord(sp?.pos)} in the championship. What is the target now?`, sp?.pos === 1 ? 'We take it one race at a time, but of course the title is the goal.' : 'There is a long way to go. We keep collecting points and see where it leaves us.']);
      else if (gained?.d === subj) qa.push([`From ${ordWord(gpos(subj))} on the grid to ${ordWord(fpos)} at the flag. Where did you find the places?`, choose(pr, QUOTES.comeback)], ['Could you have gone even further?', 'Maybe with a cleaner first lap, but I’m happy with that recovery.']);
      else qa.push([`${ordWord(fpos)[0].toUpperCase() + ordWord(fpos).slice(1)} today. How do you rate it?`, fpos <= 3 ? choose(pr, QUOTES.p3) : fpos <= 10 ? 'Points on the board. Not spectacular, but we keep building.' : 'Not our day. We were missing pace and need to understand why.']);
      const mq = penMemoryQuestion(mem, subj, fpos, isOut, last, pr);
      if (mq) qa.push(mq);
      if (subj === rival) qa.push([`How do you rate your battle with ${name(PLAYER)}?`, choose(pr, [`${last(PLAYER)} is quick, no doubt about it. We race hard but fair.`, `It’s good racing. We will see who comes out on top over the season.`, `I don’t focus on one driver. I just try to beat everyone.`])]);
      out.push({ id: rid + 'pen', seq: i * 10 + 6, kind: 'pen', i, r, outlet: outletFor(pr), kicker: 'In the pen', headline: `${name(subj)}: “${qa[0][1].split(/(?<=[.!?])\s/)[0]}”`, standfirst: `${name(subj)} (${tName(subj)}) spoke to the media after the ${gp} Grand Prix.`, body: [], qa, subject: subj });
    }

    // championship stories when something changed
    if (dA.decided && !dB.decided) {
      const st = seasonStats(s, i + 1)[A0.id];
      const n = (A0.id === PLAYER_ID ? 0 : (D.DRIVER_BIO[A0.id]?.titles?.length || 0)) + c.seasons.slice(0, s.index).filter(se => roundsDone(se) === activeRounds(se).length && driverStandings(se)[0]?.id === A0.id).length + 1;
      const atFinal = !dA.left.length, rivals = dB.rows.filter(x => x.alive && x.id !== A0.id);
      const SDT = atFinal ? showdownTold(c, s, i, last, phrasebook(seeded(rid + 'sdt'))) : null;
      out.push({ id: rid + 'wdc', seq: i * 10 + 5, kind: 'title', i, r, subject: A0.id, outlet: outletFor(rnd), massive: atFinal,
        kicker: atFinal ? 'World champion · Final-race decider' : 'World champion',
        headline: atFinal ? (rivals.length >= 2 ? `${name(A0.id)} wins a ${numWord(rivals.length + 1)}-way title showdown in ${gp}` : `${name(A0.id)} beats ${last(rivals[0]?.id || A1.id)} to the title in a ${gp} decider`) : A0.id === PLAYER ? `${name(A0.id)} is world champion` : `${name(A0.id)} is the ${s.year} world champion`,
        standfirst: `${last(A0.id)} sealed ${n > 1 ? `a ${ordWord(n)} title` : 'the title'} in ${gp}${dA.left.length ? ` with ${plural(dA.left.length, 'round')} to spare` : ' at the final round'}.`,
        chartHtml: SDT?.chart || '',
        body: SDT ? [SDT.scene, SDT.needs.join(' '), SDT.race.join(' '), `${SDT.outcome} ${last(A0.id)} finished the year with ${plural(st.wins, 'win')}, ${plural(st.podiums, 'podium')} and ${plural(A0.pts, 'point')} for ${tName(A0.id)}.`] : [atFinal ? `The title went down to the last race${rivals.length >= 2 ? `, with ${listJoin([A0.id, ...rivals.map(x => x.id)].map(id => name(id)))} all still able to win it` : ''}. ${last(A0.id)} arrived ${dB.rows[0].id === A0.id ? `leading by ${plural(dB.margin, 'point')}` : `${plural(dB.rows[0].pts - (dB.rows.find(x => x.id === A0.id)?.pts || 0), 'point')} behind ${name(dB.rows[0].id)}`} and left as champion.` : '',
          `${last(A0.id)} has ${plural(st.wins, 'win')}, ${plural(st.podiums, 'podium')} and ${plural(A0.pts, 'point')} this season for ${tName(A0.id)}, ${plural(dA.margin, 'point')} clear of ${name(A1.id)}.`].filter(Boolean),
        quotes: SDT ? (() => { const qw = phrasebook(rnd); return [...(A0.id === PLAYER ? [] : [{ id: A0.id, text: qw('won', SHOWDOWN_QUOTES.won) }]), ...SDT.losers.filter(d => d !== PLAYER).map(d => ({ id: d, text: qw('lost', SHOWDOWN_QUOTES.lost) }))]; })() : A0.id === PLAYER ? [] : [{ id: A0.id, text: choose(rnd, atFinal ? ['I can’t breathe. That was the longest race of my life.', 'To do it at the last race, under that pressure… this is everything.', ...QUOTES.champion] : QUOTES.champion) }] });
      const T = titleRetro(c, s, 'driver'); if (T && T.dec.i === i) out.push(titleRetroStory(c, s, T));
    } else if (i > 0 && A0.id !== B0.id) {
      out.push({ id: rid + 'lead', seq: i * 10 + 5, kind: 'title', i, r, subject: A0.id, outlet: outletFor(rnd), kicker: 'Championship', headline: `${last(A0.id)} takes over at the top of the championship`,
        standfirst: `${name(A0.id)} leaves ${gp} leading the standings${dA.margin ? ` by ${plural(dA.margin, 'point')}` : ' on countback'}, with ${plural(dA.R, 'point')} still to play for.`,
        body: [`The standings after round ${i + 1}: ${dA.rows.slice(0, 5).map(x => `${x.pos}. ${x.name} ${x.pts}`).join(', ')}.`],
        quotes: A0.id === PLAYER ? [] : [{ id: A0.id, text: choose(rnd, QUOTES.leader) }] });
    }
    if (dropped.length && !dA.decided) out.push({ id: rid + 'out', seq: i * 10 + 5, kind: 'title', i, r, outlet: outletFor(rnd), kicker: 'Championship', headline: `Title hopes over for ${listJoin(dropped.map(x => last(x.id)))}`,
      standfirst: `With ${plural(dA.R, 'point')} left, ${listJoin(dropped.map(x => name(x.id)))} can no longer catch ${name(A0.id)}.`,
      body: [`${dA.rows.filter(x => x.alive).length} ${dA.rows.filter(x => x.alive).length === 1 ? 'driver remains' : 'drivers remain'} in the fight: ${listJoin(dA.rows.filter(x => x.alive).map(x => `${x.name} (${x.pts})`))}.`],
      quotes: dropped.filter(x => x.id !== PLAYER).slice(0, 1).map(x => ({ id: x.id, text: choose(rnd, QUOTES.out) })) });
    if (tA.decided && !tB.decided) {
      const atFinal = !tA.left.length, rivals = tB.rows.filter(x => x.alive && x.id !== cA0.id);
      out.push({ id: rid + 'wcc', seq: i * 10 + 5, kind: 'title', i, r, outlet: outletFor(rnd), massive: atFinal,
        kicker: atFinal ? 'Constructors’ champions · Final-race decider' : 'Constructors’ champions',
        headline: atFinal ? `${cA0.name} edge ${rivals.length >= 2 ? `a ${numWord(rivals.length + 1)}-team` : 'the'} constructors’ showdown in ${gp}` : `${cA0.name} win the ${s.year} constructors’ championship`,
        standfirst: `${cA0.name} wrapped up the teams’ title in ${gp}${tA.left.length ? ` with ${plural(tA.left.length, 'round')} to go` : ', at the very last race'}, ${plural(tA.margin, 'point')} ahead of ${tA.rows[1]?.name}.`, body: [], quotes: [] });
      const T = titleRetro(c, s, 'team'); if (T && T.dec.i === i) out.push(titleRetroStory(c, s, T));
    }
  }
  // the season's best driver, once every round is in
  const dots = driverOfTheSeason(s);
  if (dots?.final) {
    const rnd = seeded(`${s.index}-dots`);
    out.push({ id: `${s.index}-dots`, seq: rounds.length * 10 + 1, kind: 'dotd', dots: true, i: rounds.length - 1, r: rounds[rounds.length - 1], subject: dots.id, outlet: choose(rnd, D.OUTLETS), kicker: 'Driver of the Season',
      headline: `${dName(s, dots.id)} is the ${s.year} Driver of the Season`,
      standfirst: `${plural(dots.dotd, 'Driver of the Day award')} from ${plural(dots.SR.rated, 'race')}, and an average rating of ${dots.avg.toFixed(1)}/10.`,
      body: [`The awards: ${dots.SR.dotd.filter(x => x.id === dots.id).map(x => `${x.r.name} (${x.rating.toFixed(1)})`).join(', ')}.`,
        (() => { const rest = Object.values(dots.SR.by).filter(o => o.id !== dots.id && o.dotd).sort((a, b) => b.dotd - a.dotd || b.avg - a.avg).slice(0, 3); return rest.length ? `Next best: ${listJoin(rest.map(o => `${dName(s, o.id)} (${plural(o.dotd, 'award')})`))}.` : ''; })()].filter(Boolean),
      quotes: dots.id === PLAYER ? [] : [{ id: dots.id, text: choose(rnd, ['It means a lot. You can only drive the car you have, and I tried to get everything out of it every weekend.', 'I’m proud of that. Some of those drives felt better than results that looked bigger.', 'The best thing is that it came over a whole season, not one good weekend.']) }] });
  }
  const RV = seasonReview(c, s);
  if (RV) {
    const rnd = seeded(`${s.index}-review-story`);
    out.push({ id: `${s.index}-review`, seq: rounds.length * 10 + 2, kind: 'review', i: rounds.length - 1, r: rounds[rounds.length - 1], subject: RV.champ, outlet: choose(rnd, D.OUTLETS), kicker: 'Season review', massive: true,
      headline: RV.headline, standfirst: RV.standfirst, body: RV.intro, review: RV });
  }
  // your own interviews
  for (const m of c.media) {
    if (!m.article || m.seasonIdx !== s.index) continue;
    const ri = m.roundId ? rounds.findIndex(x => x.id === m.roundId) : m.kind === 'preseason' ? -1 : m.kind === 'endseason' ? rounds.length : Math.max(0, Math.floor(rounds.length / 2) - 1);
    out.push({ id: 'm' + m.id, seq: ri * 10 + (m.kind === 'quali' ? 3 : 7), kind: 'interview', i: ri, r: rounds[ri] || null, outlet: m.article.outlet, kicker: 'Your interview', headline: m.article.headline, standfirst: m.article.summary || mediaTitle(c, m), body: (m.article.body || []).slice(0, 2), media: m });
  }
  // milestones and records from the career timeline
  const tl = careerTimeline(c);
  for (const e of tl.events) {
    if (e.seasonIdx !== s.index) continue;
    const rnd = seeded(`${s.index}-${e.r.id}-${e.type}-${e.rid || ''}-${e.id || ''}`);
    if (e.type === 'milestones') {
      const top = e.items[0];
      out.push({ id: `${s.index}-${e.r.id}-ms`, seq: e.ri * 10 + 5, kind: 'milestone', i: e.ri, r: e.r, subject: top.id, outlet: choose(rnd, D.OUTLETS), kicker: 'Milestones',
        headline: e.items.length > 1 ? `${e.r.name} milestones: ${top.text} and more` : `${top.text} in ${e.r.name}`, standfirst: '', list: e.items.length > 1 ? e.items.map(x => ({ id: x.id, text: x.text })) : null });
    } else {
      const R = tl.recs[e.rid];
      const who = e.team ? e.team.name : tl.nameOf(e.id);
      const short = e.team ? e.team.name : e.id === PLAYER_ID ? c.profile.last : lastName(who);
      const disp = R.group === 'age' ? e.disp : R.pct ? `${e.value.toFixed(1)}%` : fmtPts(e.value);
      const prevNames = listJoin(e.prev.holders.filter(h => h.id !== e.id).map(h => h.name));
      const prevDisp = R.group === 'age' ? e.prev.holders[0]?.disp : e.prev.value == null ? null : R.pct ? `${e.prev.value.toFixed(1)}%` : fmtPts(e.prev.value);
      const prevWhen = e.prev.holders.filter(h => h.id !== e.id).map(h => h.when).filter(Boolean)[0];
      const verb = e.team ? (e.kind === 'broken' ? 'break' : 'equal') : (e.kind === 'broken' ? 'breaks' : 'equals');
      out.push({ id: `${s.index}-${e.r.id}-${e.rid}-${e.id}`, seq: e.ri * 10 + 5, kind: 'record', i: e.ri, r: e.r, subject: e.team ? null : e.id, outlet: choose(rnd, D.OUTLETS), kicker: e.kind === 'broken' ? 'Record broken' : 'Record equalled',
        headline: e.rid === 'youngTitle8' ? `${short} becomes the first eight-time world champion` : `${short} ${verb} the record for the ${R.label}`,
        standfirst: e.kind === 'broken'
          ? `${who} now ${e.team ? 'hold' : 'holds'} the record for the ${R.label}: ${disp}, set at the ${e.r.name} Grand Prix.${prevNames ? ` The previous record${prevDisp ? ` of ${prevDisp}` : ''} belonged to ${prevNames}${prevWhen ? ` (${prevWhen})` : ''}.` : ''}`
          : `${who} ${e.team ? 'have' : 'has'} matched ${prevNames || 'the record'} for the ${R.label}, with ${disp}.`,
        body: [] });
    }
  }
  for (const rm of c.rumours || []) if (rm.seasonIdx === s.index) {
    out.push({ ...rumourStory(c, s, rm), t: Date.parse(rm.createdAt) || 0 });
    const f = rumourFollowUp(c, s, rm); if (f) out.push(f);
  }
  out.push(...rivalryStories(c, s));
  for (const tr of s.transfers || []) out.push(transferStory(c, s, tr));
  return out.sort((a, b) => (b.seq - a.seq) || (b.t || 0) - (a.t || 0));
}

function rumourStory(c, s, rm) {
  const rnd = seeded(rm.id);
  const known = allKnownDrivers(c, s);
  const isMe = rm.driver === PLAYER_ID;
  const nm = isMe ? `${c.profile.first} ${c.profile.last}` : known[rm.driver]?.name || rm.driver;
  const L = isMe ? c.profile.last : lastName(nm);
  const cur = teamOf(s, rm.driver);
  const tgt = s.teams.find(t => t.id === rm.team) || teamMeta(c, rm.team);
  const ds = driverStandings(s, seasonStatsCache(s)); const row = ds.find(x => x.id === rm.driver);
  const { tot, bio } = driverRecord(c, rm.driver, careerCtxTo(c, c.seasons[rm.seasonIdx] || s, rm.after ?? Infinity));
  const nat = isMe ? c.profile.nationality : bio?.nat;
  const age = ageNow(c, rm.driver);
  const strong = rm.strength === 'strong';
  const when = rm.timing === 'now' ? 'before the end of the season' : `for ${s.year + 1}`;
  const rounds = activeRounds(s);
  const form = row && roundsDone(s) ? `${L} is ${ordWord(row.pos)} in the championship on ${plural(row.pts, 'point')}${row.wins ? ` with ${plural(row.wins, 'win')} this season` : ''}.` : '';
  const career = tot.starts ? `Across ${plural(tot.starts, 'Grand Prix start')}, the ${nat ? nat + ' ' : ''}driver has ${plural(tot.wins, 'win')} and ${plural(tot.podiums, 'podium')}${tot.titles.length ? `, plus ${plural(tot.titles.length, 'world title')}` : ''}.` : `${L} is still waiting for a first Grand Prix start.`;
  let headline, body;
  if (rm.kind === 'retire') {
    headline = strong ? choose(rnd, [`${L} set to call time on F1 career`, `${L} to retire ${rm.timing === 'now' ? 'with immediate effect' : `at the end of ${s.year}`}`]) : choose(rnd, [`Retirement talk grows around ${L}`, `Is ${s.year} ${L}’s final season?`]);
    const pool = FREE_AGENTS.filter(id => !gridIds(s).includes(id) && known[id]).slice(0, 2).map(id => known[id].name);
    body = [strong ? `${nm} is expected to announce a retirement from Formula 1 ${rm.timing === 'now' ? 'with immediate effect' : `at the end of the ${s.year} season`}, according to people close to the driver.` : `Speculation is building in the paddock that ${s.year} could be ${L}’s last season in Formula 1. Nothing has been announced.`,
      [age ? `At ${age}, ${L} has had a long career to reflect on.` : '', career].filter(Boolean).join(' '),
      [form, cur ? `${cur.name} would need a replacement${pool.length ? `, with ${listJoin(pool)} among the names said to be in the frame` : ''}.` : ''].filter(Boolean).join(' ')];
  } else if (rm.kind === 'stay') {
    headline = strong ? `${L} set to commit future to ${cur?.name || tgt.name}` : `${cur?.name || tgt.name} keen to keep ${L}`;
    body = [strong ? `${nm} is close to agreeing a new deal with ${cur?.name || tgt.name}, ending talk of a move elsewhere.` : `${cur?.name || tgt.name} are understood to want ${L} to stay beyond this season, though no new contract has been signed yet.`, [form, career].filter(Boolean).join(' ')];
  } else {
    const there = (tgt.drivers || []).filter(Boolean);
    headline = strong ? choose(rnd, [`${L} closing in on ${tgt.name} switch`, `${L} to ${tgt.name}: deal said to be close`]) : choose(rnd, [`Paddock whispers link ${L} with ${tgt.name}`, `Is ${L} eyeing a move to ${tgt.name}?`]);
    const tcs = constructorStandings(s, seasonStatsCache(s)).find(x => x.team.id === tgt.id);
    body = [strong ? `${nm} is in advanced talks over a move ${cur ? `from ${cur.name} ` : ''}to ${tgt.name} ${when}, according to several sources in the paddock.` : `${nm} has been linked with a move ${cur ? `from ${cur.name} ` : ''}to ${tgt.name} ${when}. Nothing is signed, and neither side would comment.`,
      [form, career].filter(Boolean).join(' '),
      there.length ? (there.includes(PLAYER) ? `That would put ${L} alongside ${dName(s, PLAYER)} and leave ${there.filter(d => d !== PLAYER).map(d => known[d]?.name || d).join('') || 'the other seat'} looking for a drive.` : `${tgt.name} currently run ${listJoin(there.map(d => known[d]?.name || d))}, so a deal would leave one of them looking for a seat.`) + (tcs && roundsDone(s) ? ` The team sit ${ordWord(tcs.pos)} in the constructors’ championship.` : '') + (rm.timing === 'now' ? ' A mid-season switch would be rare in modern F1.' : '') : ''].filter(Boolean);
  }
  // who the report leans on: firm sourcing for a strong rumour, hearsay for a whisper
  const outlet = choose(rnd, D.OUTLETS);
  const sourced = strong ? choose(rnd, [`${outlet} understands that`, `Several sources have told ${outlet} that`, `People with knowledge of the talks say that`]) : choose(rnd, [`One paddock source suggests that`, `There is talk in the paddock that`, `${outlet} has heard that`]);
  body.splice(1, 0, `${sourced} ${rumourClaim(rm, L, tgt, cur, s)}.`);
  const { quotes, lines } = rumourVoices(c, s, rm, rnd, { L, cur, tgt, strong, salt: 0 });
  body.splice(2, 0, ...lines);
  if (rm.status === 'confirmed') body.push(rm.kind === 'retire' ? `Update: it is official. ${nm} will retire ${rm.timing === 'now' ? 'straight away' : `after the ${s.year} season`}.` : rm.kind === 'stay' ? `Update: confirmed. ${nm} has signed a new contract with ${cur?.name || tgt.name}.` : `Update: it is official. ${nm} will race for ${tgt.name} ${when}.`);
  if (rm.status === 'denied') body.push(`Update: ${L}’s camp has denied the report, dismissing it as speculation.`);
  const ri = rm.after ?? -1;
  return { id: 'rm' + rm.id, seq: ri * 10 + 8, kind: 'rumour', i: ri, r: rounds[ri] || null, outlet, kicker: rm.status === 'confirmed' ? 'Confirmed' : rm.status === 'denied' ? 'Denied' : strong ? 'Transfer talk' : 'Rumour', headline, standfirst: body[0], body: body.slice(1), quotes, rumour: rm, subject: rm.driver };
}
/** What the source is said to claim, in a few words. */
function rumourClaim(rm, L, tgt, cur, s) {
  const strong = rm.strength === 'strong';
  if (rm.kind === 'retire') return strong ? `${L} has told the team of a decision to stop` : `${L} has been weighing up the future`;
  if (rm.kind === 'stay') return strong ? `the two sides have agreed terms` : `early talks about a new deal have taken place`;
  return strong ? `${tgt.name} have made ${L} an offer${rm.timing === 'now' ? ' to join mid-season' : ` for ${s.year + 1}`}` : `${tgt.name} have asked about ${L}’s availability`;
}
/**
 * The paddock's reaction to a rumour: a vague answer from the driver or a team, and for a move, a word from the
 * driver whose seat would be at risk. Mostly they shrug it off; now and then the rumour clearly gets to them.
 * Quotes are invented for your career. `salt` picks fresh lines for a follow-up report.
 */
function rumourVoices(c, s, rm, rnd, { L, cur, tgt, strong, salt }) {
  const pick = (arr) => arr[(Math.floor(rnd() * arr.length) + salt) % arr.length];
  const fill = (t) => t.replace(/\{L\}/g, L);
  const quotes = [], lines = [];
  const DRIVER = {
    move: { strong: ['There are always conversations at this time of year. When there is something to say, I will say it.', 'I can’t comment on that right now. My focus is this weekend.', 'I’m not going to pretend nobody has talked to me. That’s all I’ll say for now.'],
      whisper: ['I read that too. Honestly, it’s news to me.', 'People like to talk. I’m just focused on the car.', 'I don’t know where that came from. I’m happy where I am.'] },
    retire: { strong: ['It’s a big decision and I’m taking my time with it. You’ll know when I know.', 'I’m not ready to talk about that yet.', 'I’ll sit down with the people close to me and decide what’s next.'],
      whisper: ['Retire? I still feel as quick as ever.', 'I have a lot left to give. I’m not going anywhere just yet.', 'I’ll keep going as long as I’m enjoying it, and I am.'] },
    stay: { strong: ['We’re talking and it’s going in the right direction.', 'I’m happy here. I think everyone can guess where this is heading.'],
      whisper: ['Nothing to announce. We’ll see.', 'I’m focused on racing. The contract will sort itself out.'] },
  };
  const TEAM = {
    cur: { strong: ['{L} is under contract with us, and we don’t discuss contracts in public.', 'Our focus is the next race. We’ll talk about next year when the time is right.'],
      whisper: ['We’re very happy with {L}. There’s nothing in this.', 'That’s speculation, and we don’t pay attention to it.'] },
    tgt: { strong: ['We don’t comment on drivers who are under contract elsewhere.', 'We are always looking at the market. That’s all we’ll say.'],
      whisper: ['It’s the first we’ve heard of it.', 'Our line-up is our business. We won’t add to the speculation.'] },
    retire: { strong: ['It’s {L}’s decision to make, and we’ll respect whatever it is.', 'We’re aware of the talk. We’ll let {L} speak when the time is right.'],
      whisper: ['As far as we’re concerned, {L} is fully focused on racing.', 'We haven’t had that conversation.'] },
    stay: { strong: ['We’d like to continue together, and the talks are going well.'], whisper: ['We’re happy with {L}. Contracts are discussed privately.'] },
  };
  const grade = strong ? 'strong' : 'whisper';
  // the driver answers unless it's you (you speak for yourself in Media) or the team got there first
  const teamFirst = rm.driver === PLAYER_ID || rnd() < (strong ? 0.4 : 0.5);
  if (!teamFirst) {
    quotes.push({ id: rm.driver, text: pick(DRIVER[rm.kind === 'move' ? 'move' : rm.kind][grade]) });
    lines.push(strong ? `Asked about the report, ${L} did not deny it.` : `${L} played it down.`);
  } else {
    const side = rm.kind === 'move' ? (cur && rnd() < 0.5 ? 'cur' : 'tgt') : rm.kind;
    const team = side === 'tgt' ? tgt : cur || tgt;
    if (team) {
      quotes.push({ team: team.id, role: strong ? 'Team principal' : 'Spokesperson', text: fill(pick(TEAM[side][grade])) });
      lines.push(strong ? `${team.name} gave little away.` : `${team.name} brushed it off.`);
    }
  }
  // a move puts someone's seat at risk: the weaker of the target team's drivers, if one isn't you
  if (rm.kind === 'move') {
    const st = seasonStatsCache(s);
    const there = (s.teams.find(t => t.id === tgt.id)?.drivers || []).filter(d => d && d !== rm.driver);
    const risk = there.filter(d => d !== PLAYER_ID).sort((a, b) => (st[a]?.pts || 0) - (st[b]?.pts || 0))[0];
    if (risk) {
      const shaken = rnd() < (strong ? 0.35 : 0.15);
      const SHRUG = ['I don’t read the rumours. My job is to drive the car, and that’s what I’m doing.', 'Honestly, I don’t think about it. I have a contract and I’m focused on results.', 'There’s always noise in F1. It doesn’t change how I go about my weekend.', 'I’m not worried. I just need to keep doing my job.'];
      const SHAKEN = ['Of course it’s not nice to read. I want to stay here, and I think I’ve shown what I can do.', 'If the team wants to go another way, that’s their call. But I’ll make it a hard decision for them.', 'It does put pressure on you, I won’t lie. The only answer is results on track.'];
      quotes.push({ id: risk, text: pick(shaken ? SHAKEN : SHRUG) });
      lines.push(shaken ? `${lastName(dName(s, risk))}, whose seat would be at risk, sounded less relaxed about it.` : `${lastName(dName(s, risk))}, whose seat would be the one at risk, was asked about the reports.`);
    }
  }
  return { quotes, lines };
}
/** A later report on a rumour nobody has settled yet: firmer if it was strong, fading if it was a whisper. */
function rumourFollowUp(c, s, rm) {
  const rounds = activeRounds(s);
  const ri = (rm.after ?? -1) + 1;
  if (rm.status !== 'open' || !rounds[ri] || !s.weekends[rounds[ri].id]?.sessions?.R?.done) return null;
  const rnd = seeded(rm.id + 'f');
  const strong = rm.strength === 'strong';
  const nm = trName(c, s, rm.driver), L = lastName(nm);
  const cur = teamOf(s, rm.driver);
  const tgt = s.teams.find(t => t.id === rm.team) || teamMeta(c, rm.team) || cur;
  const outlet = choose(rnd, D.OUTLETS);
  const T = { move: tgt?.name, retire: cur?.name || 'the team', stay: cur?.name || tgt?.name };
  const team = T[rm.kind] || T.move;
  const report = {
    move: strong ? [`${outlet} reports that talks between ${L} and ${team} are continuing, with a decision expected soon.`, `The story will not go away: ${outlet} says ${L}’s camp has met ${team} again.`]
      : [`The ${L}–${team} story has gone quiet. ${outlet} could find nobody willing to back it up.`, `${outlet} hears that any talks between ${L} and ${team} have cooled.`],
    retire: strong ? [`${outlet} says ${L} is now expected to confirm the decision before the season is out.`] : [`Nobody close to ${L} is talking about retirement any more, according to ${outlet}.`],
    stay: strong ? [`${outlet} reports the paperwork on ${L}’s new ${team} deal is close to being signed.`] : [`Contract talks between ${L} and ${team} are said to be slow going, according to ${outlet}.`],
  }[rm.kind] || [];
  const headline = {
    move: strong ? `${L} and ${team}: talks continue` : `${L} to ${team} talk fades`,
    retire: strong ? `${L} retirement decision draws closer` : `${L} retirement talk dies down`,
    stay: strong ? `${L} close to signing new ${team} deal` : `No breakthrough in ${L} contract talks`,
  }[rm.kind];
  const { quotes, lines } = rumourVoices(c, s, rm, rnd, { L, cur, tgt, strong, salt: 1 });
  return { id: 'rmf' + rm.id, seq: ri * 10 + 8, kind: 'rumour', i: ri, r: rounds[ri], outlet, kicker: 'Rumour update', headline, standfirst: choose(rnd, report), body: lines, quotes, subject: rm.driver, t: (Date.parse(rm.createdAt) || 0) + 1 };
}

const STORY_FILTERS = [['all', 'All', null], ['races', 'Race reports', ['race', 'sprint', 'quali', 'dotd', 'preview', 'incident', 'battle', 'review']], ['ratings', 'Fan Voice', ['ratings', 'dotd']], ['title', 'Championship', ['title', 'preview', 'review']], ['records', 'Records & milestones', ['record', 'milestone']], ['interviews', 'Interviews', ['interview', 'pen']], ['rivalries', 'Rivalries', ['rivalry']], ['rumours', 'Transfers & rumours', ['transfer', 'rumour']]];
function storyHtml(c, s, x, lead = false) {
  const when = x.r ? `R${x.i + 1} · ${esc(x.r.name)} · ${fmtDay(roundDate(s, x.r))}` : x.i < 0 ? 'Pre-season' : '';
  const kcls = { race: 'done', title: 'next', preview: 'sprint', rumour: 'dnf', record: 'next', milestone: 'done', transfer: 'breaking', dotd: 'next', rivalry: 'dnf', incident: 'dnf', battle: 'sprint', review: 'next' }[x.kind] || '';
  const q = (x.quotes || []).filter(Boolean);
  return `<article class="article story ${lead ? 'lead' : ''} ${x.kind === 'transfer' ? 'breaking' : ''} ${x.massive ? 'massive' : ''} ${x.fanVoice ? 'fan-voice' : ''}">
    <div class="row" style="justify-content:space-between">${x.fanVoice ? fvMark(true) : `<span class="outlet">${esc(x.outlet)}</span>`}<span class="row" style="gap:8px"><span class="tag ${kcls}">${esc(x.kicker)}</span><span class="muted" style="font-size:12px">${when}</span></span></div>
    <div class="row" style="gap:14px;flex-wrap:nowrap;align-items:flex-start">${x.subject ? avatar(c, s, x.subject, lead ? 64 : 48) : ''}<div style="min-width:0;display:grid;gap:6px"><div class="headline">${esc(x.headline)}</div>${x.standfirst ? `<p class="standfirst">${esc(x.standfirst)}</p>` : ''}</div></div>
    ${x.body?.length ? `<div class="body">${x.body.map(p => `<p>${esc(p)}</p>`).join('')}</div>` : ''}
    ${x.chartHtml || ''}
    ${x.review ? `<details class="review-more"><summary>Read it race by race: all ${x.review.n} rounds</summary>${reviewHtml(c, s, x.review)}</details><div><button class="btn sm ghost" data-act="open-review" data-idx="${s.index}">Open the season review</button></div>` : ''}
    ${x.list ? `<ul class="ms-list">${x.list.map(o => `<li>${avatar(c, s, o.id, 26)}<span>${esc(o.text)}</span></li>`).join('')}</ul>` : ''}
    ${x.sections ? x.sections.map(sec => `<div class="story-sec"><h3>${esc(sec.title)}</h3><ul class="ms-list">${sec.items.map(o => `<li>${o.id ? avatar(c, s, o.id, 26) : ''}<span>${esc(o.text)}</span></li>`).join('')}</ul></div>`).join('') : ''}
    ${x.fanVoice ? `<div class="fv-cols"><div><span class="label">Top 10 · ${esc(x.r.name)}</span>${fvList(c, s, x.fanVoice.race)}</div><div><span class="label">Season so far · average</span>${fvList(c, s, x.fanVoice.season)}</div></div>
      <div class="row" style="gap:6px"><button class="btn sm ghost" data-act="fv-open" data-ri="${x.fanVoice.round}">All ratings</button></div>` : ''}
    ${x.permsHtml ? `<div class="perms-box">${x.permsHtml}</div>` : ''}
    ${x.qa ? `<div class="qa">${x.qa.map(([qq, a]) => `<div class="q"><div class="qt">${esc(qq)}</div><div class="ans">“${esc(a)}”</div></div>`).join('')}</div>` : ''}
    ${x.results ? `<div class="mini-results">${x.results.map(r => `<div class="${r.d === PLAYER ? 'me' : ''}"><span class="p">${OUT.includes(r.st) ? r.st : r.pos}</span>${avatar(c, s, r.d, 20)}<span class="nm">${esc(dName(s, r.d))}</span><span class="muted">${r.pts ? '+' + r.pts : ''}</span></div>`).join('')}</div>` : ''}
    ${q.length ? `<div class="quotes">${q.map(o => o.team
      ? `<blockquote>${teamLogo(c, s.teams.find(t => t.id === o.team) || teamMeta(c, o.team), 30)}<div><p>“${esc(o.text)}”</p><cite>${esc((s.teams.find(t => t.id === o.team) || teamMeta(c, o.team))?.name || '')} · ${esc(o.role || 'Spokesperson')}</cite></div></blockquote>`
      : `<blockquote>${avatar(c, s, o.id, 30)}<div><p>“${esc(o.text)}”</p><cite>${esc(dName(s, o.id))}${o.real ? ' · from your interview' : ''}</cite></div></blockquote>`).join('')}</div>` : ''}
    ${x.media ? `<div><button class="btn sm ghost" data-act="nav" data-view="media">Read the full interview</button></div>` : ''}
    ${x.dotd ? `<div><button class="btn sm ghost" data-act="award-card" data-kind="dotd" data-ri="${x.dotd.ri}">${ICON.camera} Image</button></div>` : x.dots ? `<div><button class="btn sm ghost" data-act="award-card" data-kind="dots">${ICON.camera} Image</button></div>` : ''}
    ${x.rumour ? `<div class="row" style="gap:6px"><span class="muted" style="font-size:12px">Your rumour.${x.rumour.status === 'open' ? ' If it comes true, make it official in Transfers.' : ''}</span>${x.rumour.status === 'open' && trPick(c, x.rumour.driver) ? `<button class="btn sm" data-act="tr-rumour" data-id="${x.rumour.id}">Make it official</button>` : ''}<button class="btn sm ghost danger" data-act="rm-del" data-id="${x.rumour.id}">Delete</button></div>` : ''}
  </article>`;
}
function renderStories() {
  const c = career(); const s = curSeason();
  const all = buildStories(c, s);
  const f = STORY_FILTERS.find(x => x[0] === ui.stories) || STORY_FILTERS[0];
  const list = f[2] ? all.filter(x => f[2].includes(x.kind)) : all;
  const nr = nextRound(s); const rounds = activeRounds(s);
  const dm = titleMath(s, 'driver'); const P = roundPerms(dm);
  const tm = titleMath(s, 'team'); const TP = roundPerms(tm);
  const rumours = (c.rumours || []).filter(x => x.seasonIdx === s.index).slice().reverse();
  const known = allKnownDrivers(c, s);
  return `<div class="page">
    <div class="page-head"><div><h1>Stories</h1><div class="sub">The ${s.year} season as the paddock press tells it: race reports, the title fight, interviews and rumours. Articles update when you edit results.</div></div>
      <div class="row">${seasonPicker(c, s.index)}${isHist(s) ? '' : '<button class="btn" data-act="rv-new">Start a rivalry</button><button class="btn primary" data-act="rm-new">Start a rumour</button>'}</div></div>
    <div class="row"><div class="seg">${STORY_FILTERS.map(([id, l]) => `<button data-act="stories-filter" data-v="${id}" class="${f[0] === id ? 'on' : ''}">${l}</button>`).join('')}</div></div>
    <div class="grid-main">
      <div class="panel">${list.length ? list.map((x, k) => storyHtml(c, s, x, k === 0)).join('') : `<div class="empty">No stories yet. Log a qualifying session or race and the press will write it up.</div>`}
        ${list.some(x => x.quotes?.length || x.qa) ? '<div class="panel-b muted" style="font-size:12px;border-top:1px solid var(--line)">Quotes from other drivers are invented for your career and are not real statements.</div>' : ''}</div>
      <div class="stack">
        <div class="panel"><div class="panel-h"><h2>Up next</h2>${nr ? `<button class="btn sm ghost" data-act="nav" data-view="forecast">Forecast</button>` : ''}</div><div class="panel-b stack">
          ${nr ? `<div><span class="label">Round ${rounds.indexOf(nr) + 1} of ${rounds.length}</span><div class="hof-name">${esc(nr.name)} Grand Prix ${nr.sprint ? '<span class="tag sprint">Sprint</span>' : ''}</div><span class="muted">${esc(nr.venue)}</span></div>
            ${P?.clinch.length ? permsHtml(dm, P, { compact: true }) : dm.decided ? `<p class="muted">The drivers’ title is decided: ${esc(dm.rows[0].name)} is champion.</p>` : `<p class="muted">The drivers’ title cannot be decided here.${P?.out.length ? ` ${listJoin(P.out.map(o => esc(o.j.name)))} could drop out of the fight.` : ''}</p>`}
            ${TP?.clinch.length ? permsHtml(tm, TP, { compact: true }) : ''}`
          : '<p class="muted">Season complete.</p>'}
        </div></div>
        <div class="panel"><div class="panel-h"><h2>Rumour mill</h2><button class="btn sm" data-act="rm-new">New rumour</button></div>
          ${rumours.length ? `<div class="panel-b tight"><table><tbody>${rumours.map(rm => `<tr><td>${avatar(c, s, rm.driver, 26)}</td><td><b>${esc(rm.driver === PLAYER_ID ? c.profile.last : lastName(known[rm.driver]?.name || rm.driver))}</b> <span class="muted">${rm.kind === 'retire' ? 'to retire' : rm.kind === 'stay' ? 'to stay' : '→ ' + esc((s.teams.find(t => t.id === rm.team) || teamMeta(c, rm.team)).name)}</span></td><td><span class="tag ${rm.status === 'confirmed' ? 'done' : rm.status === 'denied' ? 'dnf' : ''}">${rm.status === 'open' ? (rm.strength === 'strong' ? 'Strong' : 'Whisper') : rm.status}</span></td></tr>`).join('')}</tbody></table></div>`
          : '<div class="empty">Start a rumour about a driver moving team or retiring, and the press will run the story.</div>'}
        </div>
      </div>
    </div>
  </div>`;
}

function rumourModal() {
  const s = latestSeason();
  const first = gridIds(s).find(id => id !== PLAYER);
  ui.modal = { kind: 'rumour', driver: first, rkind: 'move', team: s.teams.find(t => !t.drivers.includes(first))?.id, strength: 'strong', timing: 'next' };
  drawRumourModal();
}
function drawRumourModal() {
  const c = career(); const s = latestSeason(); const m = ui.modal;
  const cur = teamOf(s, m.driver);
  const targets = s.teams.filter(t => t.id !== cur?.id);
  if (m.rkind === 'move' && !targets.some(t => t.id === m.team)) m.team = targets[0]?.id;
  const preview = rumourStory(c, s, { id: 'preview', driver: m.driver, kind: m.rkind, team: m.rkind === 'stay' ? cur?.id : m.team, strength: m.strength, timing: m.timing, status: 'open', after: -1 });
  const opt = (k, v, l) => `<option value="${v}" ${m[k] === v ? 'selected' : ''}>${esc(l)}</option>`;
  modal(`<div class="modal-h"><h2>Start a rumour</h2><button class="icon-btn" data-act="modal-close">${ICON.x}</button></div>
    <div class="modal-b">
      <div class="form-grid">
        <label class="field"><span>Driver</span><select data-ch="rm-field" data-k="driver">${s.teams.map(t => `<optgroup label="${esc(t.name)}">${t.drivers.filter(Boolean).map(d => opt('driver', d, d === PLAYER_ID ? `${c.profile.first} ${c.profile.last} (you)` : dName(s, d))).join('')}</optgroup>`).join('')}</select></label>
        <label class="field"><span>The rumour</span><select data-ch="rm-field" data-k="rkind">${opt('rkind', 'move', 'Moving to another team')}${opt('rkind', 'stay', 'Signing a new contract')}${opt('rkind', 'retire', 'Retiring from F1')}</select></label>
        ${m.rkind === 'move' ? `<label class="field"><span>Moving to</span><select data-ch="rm-field" data-k="team">${targets.map(t => opt('team', t.id, t.name)).join('')}</select></label>` : ''}
        ${m.rkind !== 'stay' ? `<label class="field"><span>When</span><select data-ch="rm-field" data-k="timing">${opt('timing', 'next', m.rkind === 'retire' ? `At the end of ${s.year}` : `For ${s.year + 1}`)}${opt('timing', 'now', m.rkind === 'retire' ? 'With immediate effect' : 'Mid-season')}</select></label>` : ''}
        <label class="field"><span>How strong</span><select data-ch="rm-field" data-k="strength">${opt('strength', 'strong', 'Deal said to be close')}${opt('strength', 'whisper', 'Just a whisper')}</select></label>
      </div>
      <div class="callout" style="border-left-color:var(--team)"><span class="label">Preview headline</span><div style="color:var(--fg);font-family:var(--font-display);font-size:18px;margin-top:4px">${esc(preview.headline)}</div></div>
      <p class="muted" style="font-size:13px">The story goes into Stories after the latest round. Rumours do not change the grid: when the move happens in your save, make it official in Transfers, where the rumour waits as a shortcut.</p>
    </div>
    <div class="modal-f"><button class="btn ghost" data-act="modal-close">Cancel</button><button class="btn primary" data-act="rm-create">Publish the rumour</button></div>`);
}

/* --------------------------------------------------------- auto-fill laps */
/**
 * Fill the empty lap times from the fastest lap entered. Every car is placed off that lap by its pace relative to
 * the entered car's team (this season's measured gap to the fastest car, or BASE_PACE before there is any), so a
 * quick lap in a slow car still spreads the field sensibly, plus a little noise to split teammates. Practice and
 * qualifying times then follow the order on screen and stay within 2 s; race fastest laps stay within 4 s.
 */
function autofillLaps(s, sd, key, rid) {
  const race = isRaceKind(key);
  const max = race ? 4000 : 2000;
  const rows = sd.results;
  const ri = activeRounds(s).findIndex(r => r.id === rid);
  const timed = rows.map(x => parseLap(x.lap));
  let refI = -1;
  timed.forEach((t, i) => { if (t != null && (refI < 0 || t < timed[refI])) refI = i; });
  if (refI < 0) return { error: 'Enter at least one lap time first (the fastest you know)' };
  const ref = timed[refI];
  // the season's measured pace, leaving this weekend out (a single entered lap would make that team look fastest)
  const others = { ...s, weekends: { ...s.weekends, [rid]: undefined } };
  const measured = {};
  for (const o of paceTable(others, race ? 'race' : 'quali', false).rows) if (o.rel != null) measured[o.team.id] = o.rel;
  const floor = Math.max(0, ...Object.values(measured));
  const pace = (tid) => measured[tid] ?? (Object.keys(measured).length ? floor + 300 : (D.BASE_PACE[tid] ?? 0.8) * 1000);
  const team = (d) => teamAt(s, d, ri)?.id;
  const refPace = pace(team(rows[refI].d));
  const rnd = seeded(`${s.index}-${rid}-${key}-${ref}`);
  const expect = (x, i) => {
    let e = ref + Math.max(40, pace(team(x.d)) - refPace + 60) + (rnd() - 0.5) * (race ? 700 : 240);
    if (race) e += (i / Math.max(1, rows.length - 1)) * 500 + (x.st === 'DNF' ? 400 : 0); // the finishing order says something about pace too
    return e;
  };
  let n = 0, skipped = 0;
  const set = (i, v) => { rows[i].lap = fmtLap(Math.round(v)); n++; };
  if (race) {
    rows.forEach((x, i) => {
      if (timed[i] != null || x.st === 'DNS') return;
      set(i, Math.min(ref + max, Math.max(ref + 30, expect(x, i))));
    });
  } else {
    // only rows below the fastest entered lap can be slower than it and still match the order
    const fill = rows.map((x, i) => i).filter(i => timed[i] == null && !OUT.includes(rows[i].st) && i > refI);
    skipped = rows.filter((x, i) => i < refI && timed[i] == null && !OUT.includes(x.st)).length;
    // a normal field's spread by position (every car's pace off the fastest car, sorted), blended with each car's
    // pace off the car you entered: a surprise pole squeezes the gaps behind it a little, not to nothing
    const curve = rows.filter(x => !OUT.includes(x.st)).map(x => pace(team(x.d)) + (rnd() - 0.5) * 120).sort((a, b) => a - b);
    const lowest = curve[0] ?? 0;
    const wanted = fill.map(i => {
      const typical = (curve[Math.min(curve.length - 1, i - refI)] ?? 0) - lowest;
      return ref + 40 + 0.5 * typical + 0.5 * Math.max(0, expect(rows[i], i) - ref - 40);
    }).sort((a, b) => a - b);
    const t = {}; fill.forEach((i, k) => { t[i] = wanted[k]; });
    let prev = ref;
    for (let i = refI + 1; i < rows.length; i++) {
      if (timed[i] != null) { prev = Math.max(prev, timed[i]); continue; }
      if (t[i] == null) continue;
      const nextFixed = timed.slice(i + 1).find(v => v != null);
      const hi = Math.min(ref + max, nextFixed != null ? nextFixed - 1 : Infinity);
      const v = Math.min(hi, Math.max(t[i], prev + 5 + rnd() * 40));
      set(i, Math.max(v, prev + 1)); prev = parseLap(rows[i].lap);
    }
    // keep the gap column in step with the leader's lap
    const lead = parseLap(rows[0].lap);
    if (lead != null) rows.forEach((x, i) => { const ms = parseLap(x.lap); if (i > 0 && ms != null && fill.includes(i)) x.gap = fmtDur(ms - lead, true); });
  }
  return { n, skipped };
}

/* -------------------------------------------------------------- transfers */
// A transfer is a chain: a driver joins a team, the driver they replace goes somewhere, and so on, until someone
// takes an empty seat, becomes a free agent or retires. Contracts always run to the end of a season and are only
// for show: in the game the AI signs whoever it likes, so a contract never blocks a move.
function contractUntil(c, s, id) {
  const own = c.contracts?.[id];
  const u = own !== undefined ? own : D.CONTRACTS[s.year]?.[id] ?? D.CONTRACTS[2025]?.[id] ?? null;
  return u != null && u >= s.year ? u : null;
}
function contractTxt(c, s, id) {
  if (c.pending?.[id]) return 'Future undecided';
  if (c.retired?.[id] != null && !gridIds(s).includes(id)) return `Retired (${c.retired[id]})`;
  if (!gridIds(s).includes(id)) return 'Free agent';
  const u = contractUntil(c, s, id);
  return u == null ? 'Not known' : u === s.year ? `End of ${u} · final year` : `End of ${u}`;
}
const trName = (c, s, id) => id === PLAYER_ID ? `${c.profile.first} ${c.profile.last}` : s.drivers[id]?.name || driverEntry(c, id)?.name || id;
const trTeam = (c, s, tid) => (s.teams.find(t => t.id === tid) || teamMeta(c, tid))?.name || tid;
// in a Driver Career you can sign for another team yourself; an owner-driver stays with the team they own
const canMoveYou = (c) => c.type !== 'myteam';
const trPick = (c, id) => id !== PLAYER_ID || canMoveYou(c);
const trLabel = (c, s, id) => `${trName(c, s, id)}${id === PLAYER_ID ? ' (you)' : ''}`;
/** A step as recorded: what the move does to the grid. */
const stepMove = (st) => ({ kind: st.action === 'extend' ? 'extend' : 'move', driver: st.driver, to: st.action === 'move' ? st.to : st.action, replaces: st.action === 'move' ? st.replaces || null : null });
/** The grid as it would be after the first n steps of the chain being built. */
function trSim(c, s, steps, n) {
  const teams = s.teams.map(t => ({ ...t, drivers: [...t.drivers] }));
  for (const st of steps.slice(0, n)) if (st.driver) applyMove(c, teams, {}, stepMove(st));
  return teams;
}

function transferModal(pre = {}) {
  const s = latestSeason();
  const done = roundsDone(s), total = activeRounds(s).length;
  ui.modal = { kind: 'transfer', effective: pre.effective || (done >= total ? 'next' : 'now'), steps: [{ driver: pre.driver || null, action: pre.action || 'move', to: pre.to || null, until: null, replaces: null }], newDrivers: [], nd: {}, rumourId: pre.rumourId || null };
  drawTransferModal();
}
function drawTransferModal() {
  const c = career(); const s = latestSeason(); const m = ui.modal;
  const known = allKnownDrivers(c, s);
  const grid = gridIds(s);
  const startYear = m.effective === 'next' ? s.year + 1 : s.year;
  const years = Array.from({ length: 6 }, (_, k) => startYear + k);
  const opt = (v, l, on) => `<option value="${esc(v)}" ${on ? 'selected' : ''}>${esc(l)}</option>`;
  // the chain: each step after the first is the driver displaced by the step before
  const html = [];
  for (let i = 0; i < m.steps.length; i++) {
    const st = m.steps[i];
    const before = trSim(c, s, m.steps, i);
    const curTeam = before.find(t => t.drivers.includes(st.driver));
    const chainIds = m.steps.slice(0, i).map(x => x.driver);
    if (st.action === 'extend' && !curTeam) st.action = 'move';
    let body = '';
    if (i === 0) {
      const extra = [...new Set([...Object.keys(known), ...Object.keys(FEEDER)])].filter(id => id !== PLAYER_ID && !grid.includes(id));
      const pool = [...extra, ...m.newDrivers.map(d => d.id).filter(id => !extra.includes(id))];
      body += `<label class="field"><span>Driver</span><select data-ch="tr-field" data-i="0" data-k="driver">
        ${!st.driver ? opt('', 'Pick a driver…', true) : ''}
        ${s.teams.map(t => `<optgroup label="${esc(t.name)}">${t.drivers.filter(d => d && trPick(c, d)).map(d => opt(d, trLabel(c, s, d), st.driver === d)).join('')}</optgroup>`).join('')}
        ${poolGroups(c, s, pool, (d) => opt(d, trName(c, s, d), st.driver === d))}
        <option value="__new" ${m.nd[0] ? 'selected' : ''}>+ A new driver entering F1…</option></select></label>`;
    }
    if (m.nd[i]) { html.push(`<div class="tr-step">${body}${newDriverForm('transfer', i, m.nd[i])}</div>`); break; }
    if (!st.driver) { html.push(`<div class="tr-step">${body}</div>`); break; }
    // you can move or re-sign; losing your seat or retiring isn't something the game does to you
    const you = st.driver === PLAYER_ID;
    const acts = [['move', curTeam || i ? 'Joins another team' : 'Joins a team'],
      ...(curTeam && i === 0 ? [['extend', `Signs a new contract with ${curTeam.name}`]] : []),
      ...(you ? [] : [['free', i ? 'Becomes a free agent' : curTeam ? 'Released: becomes a free agent' : 'Stays a free agent'], ['retire', 'Retires from F1']]),
      ...(you || (i === 0 && !curTeam) ? [] : [['pending', i ? 'Not decided yet: without a seat for now' : `Leaves ${curTeam.name}, next move not decided yet`]])];
    if (!acts.some(a => a[0] === st.action)) st.action = acts[0][0];
    // a displaced driver can't go straight back to the team that just replaced them
    const targets = before.filter(t => t.id !== curTeam?.id && (i === 0 || t.id !== m.steps[i - 1].to));
    if (st.action === 'move' && !targets.some(t => t.id === st.to)) st.to = targets[0]?.id || null;
    if ((st.action === 'move' || st.action === 'extend') && !years.includes(st.until)) st.until = Math.min(startYear + 1, years[years.length - 1]);
    body += `<div class="form-grid">
      <label class="field"><span>${i === 0 ? 'What happens' : `What happens to ${esc(trName(c, s, st.driver))}?`}</span><select data-ch="tr-field" data-i="${i}" data-k="action">${acts.map(([v, l]) => opt(v, l, st.action === v)).join('')}</select></label>
      ${st.action === 'move' ? `<label class="field"><span>Joins</span><select data-ch="tr-field" data-i="${i}" data-k="to">${targets.map(t => opt(t.id, t.name, st.to === t.id)).join('')}</select></label>` : ''}
      ${st.action === 'move' || st.action === 'extend' ? `<label class="field"><span>Contract until</span><select data-ch="tr-field" data-i="${i}" data-k="until">${years.map(y => opt(y, `End of ${y}`, st.until === y)).join('')}</select></label>` : ''}
    </div>`;
    // a full team means someone makes way, and the chain continues with them
    let next = null;
    if (st.action === 'move' && st.to) {
      const tgt = before.find(t => t.id === st.to);
      const seats = tgt.drivers.filter(Boolean);
      if (seats.length >= 2) {
        const out = seats.filter(d => d !== PLAYER_ID && !chainIds.includes(d) && d !== st.driver);
        if (!out.includes(st.replaces)) st.replaces = out[0] || null;
        body += `<label class="field"><span>Replacing</span><select data-ch="tr-field" data-i="${i}" data-k="replaces">${out.map(d => opt(d, trName(c, s, d), st.replaces === d)).join('')}</select></label>`;
        next = st.replaces;
      } else { st.replaces = null; body += `<p class="muted" style="font-size:13px">${esc(tgt.name)} have a free seat, so nobody is replaced.</p>`; }
    } else st.replaces = null;
    html.push(`<div class="tr-step">${i ? `<span class="label">Then</span>` : ''}${body}</div>`);
    if (next) {
      // a replaced driver's next move is usually not known straight away
      if (!m.steps[i + 1] || m.steps[i + 1].driver !== next) m.steps.splice(i + 1, m.steps.length, { driver: next, action: 'pending', to: null, until: null, replaces: null });
    } else m.steps.splice(i + 1);
  }
  const ready = m.steps.every(x => x.driver) && !Object.keys(m.nd).length;
  modal(`<div class="modal-h"><h2>New transfer</h2><button class="icon-btn" data-act="modal-close">${ICON.x}</button></div>
    <div class="modal-b">
      ${m.rumourId ? '<div class="callout" style="border-left-color:var(--team)">Making a rumour official. It is marked confirmed when you save.</div>' : ''}
      <label class="field" style="max-width:360px"><span>Takes effect</span><select data-ch="tr-field" data-k="effective">${opt('now', `Now, from the next race${roundsDone(s) >= activeRounds(s).length ? ' (season over)' : ''}`, m.effective === 'now')}${opt('next', `From the ${s.year + 1} season`, m.effective === 'next')}</select></label>
      <div class="stack">${html.join('')}</div>
      <p class="muted" style="font-size:12px">Contracts always run to the end of a season. They are for show only, so a driver under contract can still move, just as the AI does in the game. Drivers whose next move is not decided wait in Transfers until you resolve them.</p>
    </div>
    <div class="modal-f"><button class="btn ghost" data-act="modal-close">Cancel</button><button class="btn primary" data-act="tr-confirm" ${ready ? '' : 'disabled'}>Confirm transfer</button></div>`, 'wide');
}

function confirmTransfer() {
  const c = career(); const s = latestSeason(); const m = ui.modal;
  for (const d of m.newDrivers) if (m.steps.some(x => x.driver === d.id)) { (c.customDrivers ||= []).push(d); s.drivers[d.id] = { ...d }; }
  const before = { teams: s.teams.map(t => ({ id: t.id, drivers: [...t.drivers] })), contracts: { ...(c.contracts || {}) }, retired: { ...(c.retired || {}) }, pending: { ...(c.pending || {}) }, playerTeamId: s.playerTeamId, benched: s.benched };
  // record each step with the team the driver was at before the chain and what their old deal was
  const steps = m.steps.map(st => {
    const rec = { ...stepMove(st), from: teamOf(s, st.driver)?.id ?? null, until: st.action === 'move' || st.action === 'extend' ? st.until : null, prevUntil: contractUntil(c, s, st.driver), wasPending: !!c.pending?.[st.driver] };
    if (rec.kind === 'extend') rec.to = rec.from;
    return rec;
  });
  const tr = { id: uid(), at: roundsDone(s), effective: m.effective, createdAt: new Date().toISOString(), steps, rumourId: m.rumourId || null, before };
  if (m.effective === 'now') {
    for (const st of steps) applyMove(c, s.teams, s.drivers, st);
    // you changed teams: the seat you took is yours now, and nobody waits to get your old one back
    if (steps.some(st => st.driver === PLAYER_ID && st.kind === 'move')) { s.playerTeamId = teamOf(s, PLAYER_ID)?.id || s.playerTeamId; s.benched = null; }
  }
  c.contracts ||= {}; c.retired ||= {}; c.pending ||= {};
  for (const st of steps) {
    c.contracts[st.driver] = st.until ?? null;
    if (st.to === 'retire') c.retired[st.driver] = s.year; else delete c.retired[st.driver];
    // an undecided driver waits in Transfers; any later move settles it
    if (st.to === 'pending') c.pending[st.driver] = { seasonIdx: s.index, trId: tr.id, from: st.from }; else delete c.pending[st.driver];
  }
  const rm = (c.rumours || []).find(x => x.id === m.rumourId); if (rm) rm.status = 'confirmed';
  (s.transfers ||= []).push(tr);
  closeModal(); store.save(); render(); toast('Transfer confirmed. The press has the story.');
}
function undoTransfer() {
  const c = career(); const s = latestSeason(); const tr = s.transfers?.[s.transfers.length - 1]; if (!tr) return;
  for (const b of tr.before.teams) { const t = s.teams.find(x => x.id === b.id); if (t) t.drivers = [...b.drivers]; }
  c.contracts = { ...tr.before.contracts }; c.retired = { ...tr.before.retired }; c.pending = { ...(tr.before.pending || {}) };
  if (tr.before.playerTeamId) { s.playerTeamId = tr.before.playerTeamId; s.benched = tr.before.benched ?? s.benched; }
  const rm = (c.rumours || []).find(x => x.id === tr.rumourId); if (rm) rm.status = 'open';
  s.transfers.pop(); store.save(); render(); toast('Transfer undone');
}
const trLine = (c, s, st) => st.kind === 'extend' ? `${trName(c, s, st.driver)} stays at ${trTeam(c, s, st.to)} until the end of ${st.until}`
  : st.to === 'free' ? `${trName(c, s, st.driver)} becomes a free agent` : st.to === 'retire' ? `${trName(c, s, st.driver)} retires`
  : st.to === 'pending' ? `${trName(c, s, st.driver)} ${st.from ? `leaves ${trTeam(c, s, st.from)}` : 'is without a seat'}, next move not decided yet`
  : `${trName(c, s, st.driver)} joins ${trTeam(c, s, st.to)}${st.replaces ? `, replacing ${lastName(trName(c, s, st.replaces))}` : ''}${st.until ? ` (until ${st.until})` : ''}`;

/** The pool as <optgroup>s for a driver picker. ids limits it to those (anyone else known lands in "Others"). */
function poolGroups(c, s, ids, opt) {
  const P = driverPool(c, s); const pick = new Set(ids);
  const seen = new Set();
  const group = (label, list) => { const l = list.filter(d => pick.has(d) && !seen.has(d)); l.forEach(d => seen.add(d)); return l.length ? `<optgroup label="${esc(label)}">${l.map(opt).join('')}</optgroup>` : ''; };
  return group('Free agents', P.free) + group('Your drivers', P.custom) + group('F2 & F3 (2024–25)', P.feeder) + group('Retired', P.retired) + group('Others', ids);
}
/** Transfers: everyone who could be signed besides the grid. */
function poolPanel(c, s) {
  const P = driverPool(c, s);
  const btn = (id, extra = '') => `<button class="btn sm ghost" data-act="tr-new" data-driver="${id}">${avatar(c, s, id, 20)} ${esc(trName(c, s, id))}${extra}</button>`;
  const sec = (title, note, ids, extra) => `<div class="panel-b" style="border-top:1px solid var(--line)"><span class="label">${title}</span>${note ? ` <span class="muted" style="font-size:12px">${note}</span>` : ''}
    <div class="row" style="gap:6px;margin-top:8px">${ids.length ? ids.map(id => btn(id, extra ? extra(id) : '')).join('') : '<span class="muted" style="font-size:13px">Nobody</span>'}</div></div>`;
  return `<div class="panel"><div class="panel-h"><div><h2>Driver pool</h2><span class="muted" style="font-size:12px">Tap anyone to sign them</span></div><button class="btn sm" data-act="pool-add">+ Add a driver</button></div>
    ${sec('Free agents', 'raced in the last two seasons', P.free)}
    ${sec('Your drivers', 'added by you', P.custom)}
    ${sec('F2 & F3', c.feeder ? `${F2_SIZE} in F2, ${F3_SIZE} in F3 · new talent replaces anyone who moves up` : '2024 and 2025 grids', P.feeder, (id) => ` <span class="muted">· ${esc(feederLabel(c, id) || '')}</span>`)}
    <details class="panel-b" style="border-top:1px solid var(--line)"><summary><span class="label">Retired</span> <span class="muted" style="font-size:12px">${P.retired.length} drivers · a comeback is rare, but possible</span></summary>
      <div class="row" style="gap:6px;margin-top:8px">${P.retired.map(id => btn(id)).join('')}</div></details>
  </div>`;
}
function renderTransfers() {
  const c = career(); const s = latestSeason();
  const open = (c.rumours || []).filter(rm => rm.seasonIdx === s.index && rm.status === 'open' && trPick(c, rm.driver));
  const grid = gridIds(s);
  const known = allKnownDrivers(c, s);
  const pending = Object.entries(c.pending || {}).map(([id, p]) => ({ id, ...p }));
  const bench = Object.keys(known).filter(id => id !== PLAYER_ID && !grid.includes(id) && !c.pending?.[id]);
  const history = c.seasons.slice().reverse().flatMap(se => (se.transfers || []).slice().reverse().map(tr => ({ se, tr })));
  const last = s.transfers?.[s.transfers.length - 1];
  const cell = (d) => d ? `<td>${!trPick(c, d) ? drvCell(s, d) : `<button class="link-btn drv-btn" data-act="tr-new" data-driver="${d}">${drvCell(s, d)}</button>`}</td><td class="muted" style="font-size:13px">${esc(contractTxt(c, s, d))}</td>` : '<td class="muted">Empty seat</td><td></td>';
  return `<div class="page">
    <div class="page-head"><div><h1>Transfers</h1><div class="sub">The ${s.year} driver market. Moves update the grid now or from ${s.year + 1}, and the press reports every one.</div></div>
      <button class="btn primary" data-act="tr-new">New transfer</button></div>
    ${pending.length ? `<div class="panel"><div class="panel-h"><h2>Awaiting a decision</h2><span class="muted" style="font-size:12px">Resolve each one when the driver’s next move is known</span></div><div class="panel-b"><div class="tr-picks">
      ${pending.map(p => `<button class="tr-pick" data-act="tr-new" data-driver="${p.id}">${avatar(c, s, p.id, 30)}<span><b>${esc(trName(c, s, p.id))}</b> <span class="muted">${grid.includes(p.id) ? `leaving ${esc(trTeam(c, s, teamOf(s, p.id)?.id))} after ${s.year}` : p.from ? `was at ${esc(trTeam(c, s, p.from))}` : 'without a seat'}</span></span><span class="tag sprint">Resolve</span></button>`).join('')}
    </div></div></div>` : ''}
    ${open.length ? `<div class="panel"><div class="panel-h"><h2>From the rumour mill</h2><span class="muted" style="font-size:12px">Tap one to make it official</span></div><div class="panel-b"><div class="tr-picks">
      ${open.map(rm => `<button class="tr-pick" data-act="tr-rumour" data-id="${rm.id}">${avatar(c, s, rm.driver, 30)}<span><b>${esc(lastName(trName(c, s, rm.driver)))}</b> <span class="muted">${rm.kind === 'retire' ? 'retires' : rm.kind === 'stay' ? 'signs a new deal' : '→ ' + esc(trTeam(c, s, rm.team))}</span></span><span class="tag ${rm.strength === 'strong' ? 'sprint' : ''}">${rm.strength === 'strong' ? 'Strong' : 'Whisper'}</span></button>`).join('')}
    </div></div></div>` : ''}
    <div class="panel"><div class="panel-h"><h2>${s.year} grid & contracts</h2><span class="muted" style="font-size:12px">Tap a driver to move them</span></div>
      <div class="panel-b tight table-wrap"><table><thead><tr><th>Team</th><th>Driver</th><th>Contract</th><th>Driver</th><th>Contract</th></tr></thead><tbody>
        ${s.teams.map(t => `<tr class="${t.id === s.playerTeamId ? 'me' : ''}"><td><div class="drv">${teamLogo(c, t, 22)}<b>${esc(t.name)}</b></div></td>${cell(t.drivers[0])}${cell(t.drivers[1])}</tr>`).join('')}
      </tbody></table></div>
    </div>
    ${poolPanel(c, s)}
    <div class="panel"><div class="panel-h"><h2>Transfer history</h2></div>
      ${history.length ? `<div class="panel-b tight">${history.map(({ se, tr }) => `<div class="tr-hist">
        <div class="row" style="justify-content:space-between"><span class="label">${se.year} · ${tr.at ? `after round ${tr.at}` : 'pre-season'} · ${tr.effective === 'next' ? `from ${se.year + 1}` : 'immediate'}</span>
          ${tr === last && se === s ? '<button class="btn sm ghost danger" data-act="tr-undo">Undo</button>' : ''}</div>
        <ul class="ms-list">${tr.steps.map(st => `<li>${avatar(c, se, st.driver, 24)}<span>${esc(trLine(c, se, st))}</span></li>`).join('')}</ul></div>`).join('')}</div>`
      : '<div class="empty">No transfers yet. When a driver moves in your save, log it here and the grid, standings and stories follow.</div>'}
    </div>
  </div>`;
}

/** BREAKING: the press on a transfer. World champions moving, retiring or left without a seat is huge news. */
function transferStory(c, s, tr) {
  const rnd = seeded(tr.id);
  const rounds = activeRounds(s);
  const m0 = tr.steps[0];
  const nm = trName(c, s, m0.driver), L = lastName(nm);
  const { tot } = driverRecord(c, m0.driver, careerCtxTo(c, s, tr.at)); // the record when the move was announced
  const titles = tot.titles.length;
  const champ = titles ? (titles === 1 ? 'world champion' : `${numWord(titles)}-time world champion`) : '';
  const Champ = champ ? champ[0].toUpperCase() + champ.slice(1) : '';
  const from = m0.from ? trTeam(c, s, m0.from) : null;
  const to = m0.to && !['free', 'retire', 'pending'].includes(m0.to) ? trTeam(c, s, m0.to) : null;
  const when = tr.effective === 'next' ? `from the start of ${s.year + 1}` : 'with immediate effect';
  const start = tr.effective === 'next' ? s.year + 1 : s.year;
  const length = (u) => { const n = u - start + 1; return n <= 1 ? `until the end of ${u}` : `until the end of ${u}, a ${numWord(n)}-season deal`; };
  const left = m0.prevUntil != null && m0.prevUntil > s.year ? m0.prevUntil - s.year : 0; // seasons still to run on the old deal
  const leftTxt = left === 1 ? 'a full season still to run' : `${numWord(left)} more seasons still to run`;
  const career = tot.starts ? `${L} has ${plural(tot.starts, 'Grand Prix start')}, ${plural(tot.wins, 'win')} and ${plural(tot.podiums, 'podium')}${titles ? `, plus ${plural(titles, 'world title')} (${tot.titles.join(', ')})` : ''}.` : '';
  const debut = !tot.starts && !m0.from;
  let headline, standfirst, body = [], kicker = 'BREAKING', massive = false;
  if (m0.kind === 'extend') {
    headline = champ ? `BREAKING: ${Champ} ${L} commits future to ${to}` : choose(rnd, [`BREAKING: ${L} signs new ${to} deal`, `BREAKING: ${L} commits future to ${to}`]);
    standfirst = `${nm} has agreed a new contract with ${to}${m0.until ? ` that runs ${length(m0.until)}` : ''}.`;
    body = [career];
  } else if (m0.to === 'retire') {
    massive = !!champ;
    headline = champ ? `BREAKING: ${Champ} ${nm} announces retirement` : choose(rnd, [`BREAKING: ${L} to retire from Formula 1`, `BREAKING: ${L} calls time on F1 career`]);
    standfirst = champ ? `It is the end of an era. ${nm} is retiring from Formula 1 ${tr.effective === 'next' ? `at the end of ${s.year}` : 'with immediate effect'}, bringing down the curtain on the career of a ${champ}.`
      : `${nm} is retiring from Formula 1 ${tr.effective === 'next' ? `at the end of ${s.year}` : 'with immediate effect'}${from ? `, leaving ${from}` : ''}.`;
    body = [career, archRetireLine(c, s, m0.driver, tr.at), left ? `The decision comes with ${leftTxt} on the contract with ${from}.` : '', champ ? `The paddock will be a quieter place without one of the sport’s champions.` : ''];
  } else if (m0.to === 'pending') {
    if (champ) kicker = 'BREAKING · World champion';
    headline = champ ? `BREAKING: ${Champ} ${L} to leave ${from}, future unclear` : choose(rnd, [`BREAKING: ${L} to leave ${from}`, `BREAKING: ${L} and ${from} to go separate ways`]);
    standfirst = `${nm} will leave ${from} ${tr.effective === 'next' ? `at the end of ${s.year}` : 'with immediate effect'}, and where ${L} goes next has not been decided.`;
    body = [left ? `It is an early exit: ${L} still had ${leftTxt} on the contract.` : '', career, champ ? `A ${champ} on the market is a rare thing, and several teams are bound to be interested.` : `Talks with other teams are expected in the coming weeks.`];
  } else if (m0.to === 'free') {
    massive = !!champ;
    headline = champ ? `BREAKING: ${Champ} ${L} left without a seat` : left ? `BREAKING: ${from} drop ${L} despite contract` : choose(rnd, [`BREAKING: ${from || 'Team'} part ways with ${L}`, `BREAKING: ${L} out at ${from || 'the team'}`]);
    standfirst = champ ? `A ${champ} without a drive: ${nm} is now a free agent after ${from ? `leaving ${from}` : 'failing to find a seat'}, a situation almost unheard of in modern Formula 1.`
      : `${nm} is a free agent ${when}${from ? ` after leaving ${from}` : ''}.`;
    body = [left ? `That is a surprise: ${L} had ${leftTxt} on the contract with ${from}.` : '', career];
  } else {
    if (champ) { kicker = 'BREAKING · World champion'; headline = `BREAKING: ${Champ} ${L} signs for ${to}`; }
    else if (debut) headline = choose(rnd, [`BREAKING: ${to} hand ${nm} an F1 debut`, `BREAKING: ${nm} gets an F1 chance with ${to}`]);
    else if (left) headline = choose(rnd, [`BREAKING: Shock as ${L} walks out on ${from} for ${to}`, `BREAKING: ${L} breaks ${from} contract to join ${to}`]);
    else headline = choose(rnd, [`BREAKING: ${L} joins ${to}`, `BREAKING: ${to} sign ${L}`]);
    standfirst = `${nm} will race for ${to} ${when}${from ? `, leaving ${from}` : ''}${m0.until ? `, on a deal that runs ${length(m0.until)}` : ''}.`;
    body = [left ? `Nobody saw this coming. ${L} was under contract with ${from} until the end of ${m0.prevUntil}, with ${leftTxt}, and walking away from a deal like that is rare in Formula 1.` : '',
      champ ? `World champions hardly ever change teams these days, which makes this one of the biggest moves the sport has seen in years.` : '',
      debut ? `${nm} makes the step up to Formula 1 for the first time.` : career,
      m0.replaces ? `${L} takes the seat of ${trName(c, s, m0.replaces)}.` : ''];
  }
  if (massive) kicker = 'BREAKING · Massive news';
  if (m0.wasPending && m0.to !== 'pending') standfirst += ` It ends the uncertainty over ${L}’s future.`;
  const chain = tr.steps.length > 1 ? tr.steps.slice(1).map(st => ({ id: st.driver, text: trLine(c, s, st) })) : null;
  if (chain) body.push('The knock-on effects:');
  const ri = tr.at - 1;
  return { id: 'tr' + tr.id, seq: ri * 10 + 9, kind: 'transfer', i: ri, r: rounds[ri] || null, outlet: choose(rnd, D.OUTLETS), kicker, headline, standfirst, body: body.filter(Boolean), list: chain, subject: m0.driver, massive, t: Date.parse(tr.createdAt) || 0 };
}

/* ------------------------------------------------------------------ media */
function reputation(c) {
  const v = c.media.filter(m => m.article).reduce((a, m) => a + (+m.rep || 0), 0);
  return Math.max(-10, Math.min(10, v));
}
function renderMedia() {
  const c = career();
  const open = c.media.find(m => m.id === ui.mediaOpen) || c.media.find(m => !m.article && m.questions?.length);
  const published = c.media.filter(m => m.article).slice().reverse();
  const rep = reputation(c);
  const repLabel = rep >= 6 ? 'Paddock favourite' : rep >= 2 ? 'Well liked' : rep > -2 ? 'Neutral' : rep > -6 ? 'Divisive' : 'Villain of the paddock';
  return `<div class="page">
    <div class="page-head"><div><h1>Media</h1><div class="sub">Press conferences shaped by your results, driver type and personality.</div></div>
      <div class="row">${!settings.hasKey && window.api ? '<span class="muted" style="font-size:12px">Offline questions · add an API key in Settings for AI journalists</span>' : ''}<button class="btn primary" data-act="new-media">${ICON.mic} New media session</button></div></div>
    <div class="panel"><div class="panel-b"><div class="rep-meter"><span class="label" style="width:130px">Media reputation</span><div class="track"><span class="knob" style="left:${(rep + 10) / 20 * 100}%"></span></div><b style="width:170px;text-align:right;font-family:var(--font-display)">${repLabel}</b></div></div></div>
    ${open ? renderMediaSession(c, open) : ''}
    <div class="panel"><div class="panel-h"><h2>Press clippings</h2><span class="muted">${published.length} article${published.length === 1 ? '' : 's'}</span></div>
      ${published.length ? published.map(m => renderArticle(c, m)).join('') : '<div class="empty">Your published interviews will appear here.</div>'}
    </div>
  </div>`;
}
function mediaTitle(c, m) {
  const s = c.seasons[m.seasonIdx];
  const r = s?.calendar.find(x => x.id === m.roundId);
  const kind = { preseason: 'Pre-season media day', quali: 'Post-qualifying press conference', race: 'Post-race press conference', midseason: 'Mid-season interview', endseason: 'End-of-season interview' }[m.kind] || 'Media session';
  return `${kind}${r ? ' · ' + r.name : ''} · ${s?.year || ''}`;
}
function renderMediaSession(c, m) {
  return `<div class="panel">
    <div class="panel-h"><div><span class="label">In progress</span><h2>${esc(mediaTitle(c, m))}</h2></div>
      <div class="row"><button class="btn sm ghost danger" data-act="media-discard" data-id="${m.id}">Discard</button></div></div>
    <div class="panel-b qa">
      ${m.questions.map((q, i) => `<div class="q">
        <div class="who"><b>${esc(q.reporter)}</b> · ${esc(q.outlet)}</div>
        <div class="qt">${esc(q.question)}</div>
        <textarea id="ans-${m.id}-${i}" data-ch="media-answer" data-id="${m.id}" data-i="${i}" placeholder="Your answer…" style="min-height:70px">${esc(q.answer || '')}</textarea>
        <div class="tone-picks">${['No comment.', 'I’d rather focus on the next race.', 'Credit to the team, they did a great job.'].map(t => `<button class="btn sm ghost" data-act="media-quick" data-id="${m.id}" data-i="${i}" data-t="${esc(t)}">${esc(t)}</button>`).join('')}</div>
      </div>`).join('')}
      <div class="row" style="justify-content:flex-end">${ui.busy ? '<span class="spinner"></span><span class="muted">Writing up the story…</span>' : ''}<button class="btn primary" data-act="media-publish" data-id="${m.id}" ${ui.busy ? 'disabled' : ''}>Finish interview & publish</button></div>
    </div>
  </div>`;
}
function renderArticle(c, m) {
  const a = m.article;
  return `<article class="article">
    <div class="row" style="justify-content:space-between"><span class="outlet">${esc(a.outlet)}</span><span class="muted" style="font-size:12px">${esc(mediaTitle(c, m))} ${m.rep > 0 ? '<span class="tag done">Rep +' + m.rep + '</span>' : m.rep < 0 ? '<span class="tag dnf">Rep ' + m.rep + '</span>' : ''}</span></div>
    <div class="headline">${esc(a.headline)}</div>
    <div class="body">${(a.body || []).map(p => `<p>${esc(p)}</p>`).join('')}</div>
    ${m.reactions?.length ? `<div class="reactions">${m.reactions.map(r => `<div class="reaction"><b>${esc(r.who)}:</b> ${esc(r.text)}</div>`).join('')}</div>` : ''}
    <details><summary class="muted" style="cursor:pointer;font-size:13px">Interview transcript</summary><div class="qa" style="margin-top:10px">${m.questions.map(q => `<div class="q"><div class="who"><b>${esc(q.reporter)}</b> · ${esc(q.outlet)}</div><div class="qt">${esc(q.question)}</div><div class="ans">${esc(q.answer || 'No answer.')}</div></div>`).join('')}</div></details>
    <div><button class="btn sm ghost danger" data-act="media-delete" data-id="${m.id}">Delete article</button></div>
  </article>`;
}

/* --------------------------------------------------------------- settings */
function renderSettings() {
  const c = career(); const s = latestSeason();
  const allIds = Object.keys(allKnownDrivers(c, s)).filter(id => id !== PLAYER_ID);
  const known = allKnownDrivers(c, s);
  return `<div class="page">
    <div class="page-head"><div><h1>Settings</h1><div class="sub">Appearance, career profile, ${s.year} roster and calendar, AI media and your data.</div></div></div>
    ${renderThemePicker(c, s)}

    <div class="panel"><div class="panel-h"><h2>AI media engine</h2><span class="muted" style="font-size:12px">${settings.hasKey ? 'API key saved' : 'No API key: media sessions use built-in question templates'}</span></div>
      <div class="panel-b stack">
        <p class="muted" style="max-width:72ch">Media sessions can use Claude to write questions and articles. Paste an Anthropic API key from console.anthropic.com. The key is stored encrypted on this computer and is only sent to api.anthropic.com.</p>
        <div class="form-grid">
          <label class="field"><span>API key</span><input type="password" id="set-key" placeholder="${settings.hasKey ? '•••••••• (saved)' : 'sk-ant-…'}"></label>
          <label class="field"><span>Model</span><input type="text" id="set-model" value="${esc(settings.model)}"></label>
        </div>
        <div class="row"><button class="btn primary" data-act="save-ai">Save</button><button class="btn" data-act="test-ai">Test connection</button>${settings.hasKey ? '<button class="btn ghost danger" data-act="clear-key">Remove key</button>' : ''}</div>
      </div></div>

    ${isPrincipal(c) ? `<div class="panel"><div class="panel-h"><h2>Team principal profile</h2><span class="muted" style="font-size:12px">You run the team: the press talks to you as its principal</span></div><div class="panel-b stack">
      <div class="form-grid">
        <label class="field"><span>First name</span><input type="text" id="pf-first" value="${esc(c.profile.first)}"></label>
        <label class="field"><span>Last name</span><input type="text" id="pf-last" value="${esc(c.profile.last)}"></label>
        <label class="field"><span>Nationality</span><input type="text" id="pf-nat" value="${esc(c.profile.nationality)}"></label>
        <label class="field"><span>Date of birth</span><input type="date" id="pf-born" value="${esc(c.profile.born || '')}"></label>
        <label class="field"><span>Media personality</span><select id="pf-pers">${D.PERSONALITIES.map(a => `<option value="${a.id}" ${a.id === c.profile.personality ? 'selected' : ''}>${a.name}</option>`).join('')}</select></label>
      </div>
      <label class="field"><span>Backstory (used by the media)</span><textarea id="pf-bio">${esc(c.profile.bio || '')}</textarea></label>
      <p class="muted" style="font-size:12px;margin:0">Rivals aren't picked: they come from the rivalry system as title fights and archrivalries develop.</p>
      <div><button class="btn primary" data-act="save-profile">Save profile</button></div>
    </div></div>` : `<div class="panel"><div class="panel-h"><h2>Driver profile</h2></div><div class="panel-b stack">
      <div class="form-grid">
        <label class="field"><span>First name</span><input type="text" id="pf-first" value="${esc(c.profile.first)}"></label>
        <label class="field"><span>Last name</span><input type="text" id="pf-last" value="${esc(c.profile.last)}"></label>
        <label class="field"><span>Abbreviation</span><input type="text" id="pf-abbr" maxlength="3" value="${esc(c.profile.abbr)}"></label>
        <label class="field"><span>Number</span><input type="number" id="pf-number" min="1" max="99" value="${esc(c.profile.number)}"></label>
        <label class="field"><span>Nationality</span><input type="text" id="pf-nat" value="${esc(c.profile.nationality)}"></label>
        <label class="field"><span>Date of birth</span><input type="date" id="pf-born" value="${esc(c.profile.born || '')}"></label>
        <label class="field"><span>Driver type</span><select id="pf-arch">${D.ARCHETYPES.map(a => `<option value="${a.id}" ${a.id === c.profile.archetype ? 'selected' : ''}>${a.name}</option>`).join('')}</select></label>
        <label class="field"><span>Media personality</span><select id="pf-pers">${D.PERSONALITIES.map(a => `<option value="${a.id}" ${a.id === c.profile.personality ? 'selected' : ''}>${a.name}</option>`).join('')}</select></label>
      </div>
      <label class="field"><span>Backstory (used by the media)</span><textarea id="pf-bio">${esc(c.profile.bio || '')}</textarea></label>
      <p class="muted" style="font-size:12px;margin:0">Rivals aren't picked: they come from the rivalry system as title fights and archrivalries develop.</p>
      <div class="row" style="gap:12px">${avatar(c, s, PLAYER, 48)}${pictureControls('driver', PLAYER, !!c.profile.photo)}</div>
      <div><button class="btn primary" data-act="save-profile">Save profile</button></div>
    </div></div>`}

    <div class="panel"><div class="panel-h"><h2>${s.year} roster</h2><span class="muted" style="font-size:12px">Mirror driver market moves from your save. Changes apply to the ${s.year} season.</span></div>
      <div class="panel-b stack">
        <div class="table-wrap"><table><thead><tr><th>Team</th><th>Seat 1</th><th>Seat 2</th></tr></thead><tbody>
          ${s.teams.map(t => `<tr class="${t.id === s.playerTeamId ? 'me' : ''}"><td><div class="drv"><span class="chip" style="--c:${t.color}"></span><b>${esc(t.name)}</b></div></td>
          ${[0, 1].map(i => t.drivers[i] === PLAYER_ID ? `<td><b>${esc(c.profile.first)} ${esc(c.profile.last)}</b> <span class="muted">(you)</span></td>` : `<td><select data-ch="roster" data-team="${t.id}" data-seat="${i}">${allIds.map(id => `<option value="${id}" ${t.drivers[i] === id ? 'selected' : ''}>${esc(known[id].name)}</option>`).join('')}</select></td>`).join('')}</tr>`).join('')}
        </tbody></table></div>
        <div class="row"><span class="label">Add a driver</span><input type="text" id="nd-name" placeholder="Full name" style="width:200px"><input type="text" id="nd-abbr" placeholder="ABC" maxlength="3" style="width:70px"><input type="number" id="nd-num" placeholder="No." style="width:80px"><label class="row muted" style="gap:6px">Born <input type="date" id="nd-born" style="width:auto"></label><button class="btn sm" data-act="add-driver">Add to pool</button></div>
        ${c.customDrivers?.length ? `<div class="row" style="gap:8px"><span class="label">Your drivers</span>${c.customDrivers.map(d => `<button class="btn sm ghost" data-act="driver-photo" data-id="${d.id}" title="${d.photo ? 'Change' : 'Add'} photo">${avatar(c, s, d.id, 22)} ${esc(d.name)}${d.photo ? '' : ' · add photo'}</button>`).join('')}</div>` : ''}
      </div></div>

    <div class="panel"><div class="panel-h"><h2>${s.year} calendar & format</h2>
      <label class="row muted">Practice sessions <select data-ch="practice" style="width:auto">${[['full', 'Full (FP1, FP2, FP3)'], ['short', 'Short (one session)'], ['none', 'None']].map(([v, l]) => `<option value="${v}" ${s.format.practice === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
      <div class="panel-b tight table-wrap"><table><thead><tr><th>Rnd</th><th>Grand Prix</th><th>Venue</th><th>Sprint</th><th>Included</th><th></th></tr></thead><tbody>
        ${s.calendar.map((r, i) => `<tr style="${r.off ? 'opacity:.45' : ''}"><td class="num muted">${i + 1}</td><td>${esc(r.name)}</td><td class="muted">${esc(r.venue)}</td>
        <td><input type="checkbox" data-ch="cal-sprint" data-i="${i}" ${r.sprint ? 'checked' : ''}></td><td><input type="checkbox" data-ch="cal-on" data-i="${i}" ${r.off ? '' : 'checked'}></td>
        <td><div class="row" style="gap:2px"><button class="icon-btn" data-act="cal-move" data-i="${i}" data-dir="-1" title="Move earlier">${ICON.up}</button><button class="icon-btn" data-act="cal-move" data-i="${i}" data-dir="1" title="Move later">${ICON.down}</button>${r.added && !s.weekends[r.id] ? `<button class="icon-btn" data-act="cal-del" data-i="${i}" title="Remove">${ICON.x}</button>` : ''}</div></td></tr>`).join('')}
      </tbody></table></div>
      <div class="panel-b"><select data-ch="cal-add" style="width:auto"><option value="">+ Add a circuit…</option>${Object.keys(D.TRACKS).filter(id => !s.calendar.some(r => trackOf(r) === id)).map(id => `<option value="${id}">${esc(trackGp(id).name)} · ${esc(D.TRACKS[id].circuit)}${D.TRACKS[id].former ? ' (former)' : ''}</option>`).join('')}</select></div></div>

    ${renderTelemetryPanel()}
    ${renderCompanionPanel()}

    <div class="panel"><div class="panel-h"><h2>Data</h2></div><div class="panel-b stack">
      <p class="muted" id="data-loc">${window.api?.companion === true ? 'Synced live with Pitwall on your computer, where everything is saved (with a daily backup kept for 14 days).' : window.api ? 'Saved automatically on this computer. A daily backup is kept for 14 days.' : 'Running in a browser: data is kept in this browser only.'}</p>
      <div class="row"><button class="btn" data-act="export">Export backup</button><button class="btn" data-act="import">Import backup</button><button class="btn ghost danger" data-act="delete-career">Delete this career</button></div>
    </div></div>
  </div>`;
}
const ago = (iso) => {
  if (!iso) return 'never';
  const m = Math.round((Date.now() - new Date(iso)) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : fmtDay(parseDay(iso.slice(0, 10)));
};
/** Desktop: switch the phone/tablet link on, show the address and PIN, manage paired devices. On a device: its link. */
function renderCompanionPanel() {
  if (window.api?.companion === true) {
    const on = window.api.isOnline();
    return `<div class="panel"><div class="panel-h"><h2>${ICON.phone} Phone & tablet</h2><span class="muted" style="font-size:12px">${on ? '<span class="tag done">Connected</span>' : '<span class="tag">Offline</span>'}</span></div><div class="panel-b stack">
      <p class="muted" style="max-width:72ch">${window.api.inApp
        ? `A full copy of your career is kept on this device, so it works with the computer off. Changes sync both ways whenever Pitwall is open on the computer with Phone & tablet on${store.dirty() ? ' · <b style="color:var(--fg)">changes waiting to sync</b>' : ''}.`
        : 'Everything you log here is saved straight to Pitwall on your computer, and changes made there show up here within a second. Keep Pitwall open on the computer while you use this device.'}</p>
      ${window.api.inApp ? `<p class="muted" style="font-size:12px">App version ${esc(window.PitwallAndroid?.version?.() || '')} · interface ${esc(window.api.build)}</p>` : ''}
      <div class="row">${window.api.inApp ? '<button class="btn" data-act="companion-switch">Change computer</button>' : ''}<button class="btn ghost danger" data-act="companion-unpair">Disconnect this device</button></div>
    </div></div>`;
  }
  const C = companion; if (!C) return '';
  const head = `<div class="panel-h"><h2>${ICON.phone} Phone & tablet</h2><span class="muted" style="font-size:12px">${C.running ? `On · ${C.devices.filter(d => d.online).length} connected` : 'Off'}</span></div>`;
  if (!C.running) {
    return `<div class="panel">${head}<div class="panel-b stack">
      <p class="muted" style="max-width:72ch">Log sessions from your Android phone or tablet while you play: it connects to this computer over your home Wi-Fi and has every feature of the desktop app. Nothing goes over the internet.</p>
      ${C.error ? `<div class="callout">${esc(C.error)}</div>` : ''}
      <div><button class="btn primary" data-act="companion-enable" data-on="1">Turn on</button></div>
      <p class="muted" style="font-size:12px">The first time, Windows asks whether Pitwall may use the network. Allow it on <b>private networks</b>.</p>
    </div></div>`;
  }
  const host = (C.urls[0] || '').replace('http://', '');
  return `<div class="panel">${head}<div class="panel-b stack">
    <div class="link-grid">
      <div class="link-step"><span class="label">1 · Get the app</span>
        <p>On your phone or tablet, open Chrome and go to</p>
        <div class="big-code mono">${esc(host)}/app</div>
        <p class="muted" style="font-size:12px">Download and install <b>Pitwall</b>. Android asks you to allow installs from Chrome the first time.</p></div>
      <div class="link-step"><span class="label">2 · Connect</span>
        <p>Open the app and enter this computer’s address</p>
        <div class="big-code mono">${esc(host)}</div>
        ${C.urls.length > 1 ? `<p class="muted" style="font-size:12px">If that doesn’t connect, try: ${C.urls.slice(1).map(u => esc(u.replace('http://', ''))).join(', ')}</p>` : ''}</div>
      <div class="link-step"><span class="label">3 · Enter the PIN</span>
        <p>Each PIN pairs one device</p>
        <div class="big-code pin">${esc(C.pin.slice(0, 3))} ${esc(C.pin.slice(3))}</div>
        <div><button class="btn sm ghost" data-act="companion-pin">New PIN</button></div></div>
    </div>
    ${C.devices.length ? `<div class="table-wrap"><table><thead><tr><th>Paired device</th><th>Status</th><th>Last seen</th><th></th></tr></thead><tbody>
      ${C.devices.map(d => `<tr><td><b>${esc(d.name)}</b> <span class="muted">· paired ${esc(ago(d.added))}</span></td><td>${d.online ? '<span class="tag done">Connected</span>' : '<span class="tag">Offline</span>'}</td><td class="muted">${d.online ? 'now' : esc(ago(d.lastSeen))}</td>
        <td class="num"><button class="btn sm ghost danger" data-act="companion-forget" data-id="${d.id}">Disconnect</button></td></tr>`).join('')}
    </tbody></table></div>` : '<p class="muted">No devices paired yet.</p>'}
    <p class="muted" style="font-size:12px">The app keeps its own copy, so it works with this computer off and syncs when they reconnect. After you update Pitwall here, the app shows a link to install its update.</p>
    <div class="row"><button class="btn" data-act="companion-enable" data-on="0">Turn off</button>${C.devices.length > 1 ? '<button class="btn ghost danger" data-act="companion-forget">Disconnect all</button>' : ''}</div>
  </div></div>`;
}
function renderThemePicker(c, s) {
  const pref = state.prefs?.theme || 'auto';
  const mine = teamTheme(c, s, s.playerTeamId);
  const sw = (th) => `<span class="swatch" style="--a:${th.accent};--b:${th.accent2};--g:${th.base || '#0B0F17'}"><i></i><i></i></span>`;
  const opts = [['auto', { ...mine, name: 'Match my team' }, `Follows whoever you drive for: ${s.teams.find(t => t.id === s.playerTeamId)?.name || ''}`], ['classic', D.THEMES.classic, 'Original Pitwall red']];
  if (c.myTeam) opts.push([MYTEAM, themeFromTeam(c.myTeam), 'Your team’s colours']);
  for (const [id, th] of Object.entries(D.THEMES)) if (id !== 'classic') opts.push([id, th, '']);
  return `<div class="panel"><div class="panel-h"><h2>Theme</h2><span class="muted" style="font-size:12px">Applies to the whole app, on every career</span></div><div class="panel-b">
    <div class="choices theme-choices">${opts.map(([id, th, note]) => `<button class="choice ${pref === id ? 'on' : ''}" data-act="set-theme" data-v="${id}">${sw(th)}<b>${esc(th.name)}</b>${note ? `<small>${esc(note)}</small>` : ''}</button>`).join('')}</div>
  </div></div>`;
}
function allKnownDrivers(c, s) {
  const map = { ...D.DRIVERS };
  for (const cd of c.customDrivers || []) map[cd.id] = cd;
  for (const se of c.seasons) Object.assign(map, se.drivers);
  Object.assign(map, s.drivers);
  return map;
}

/* ------------------------------------------------------------------ setup */
function defaultSetup() {
  return {
    year: 2025, first: '', last: '', abbr: '', number: 27, nationality: '', archetype: 'prodigy', personality: 'confident', bio: '',
    teamId: 'williams', seat: 'SAI', extra: '', practice: 'full', rival: '',
    goals: [{ id: uid(), scope: 'team', type: 'constructor_pos', target: 6 }, { id: uid(), scope: 'driver', type: 'beat_teammate' }, { id: uid(), scope: 'driver', type: 'champ_pos', target: 10 }],
    type: 'driver', role: 'principal', newDrivers: [], nd: {},
    team: { name: '', short: '', color: '#00A19B', color2: '#F2F2F2', logo: null, base: '', engine: 'Mercedes', mate: 'BOT', seats: ['PER', 'BOT'] },
  };
}
/** Inline form for a brand-new driver (used when signing drivers at setup and in transfers). */
function newDriverForm(scope, key, nd) {
  const f = (k, label, type = 'text', extra = '') => `<label class="field"><span>${label}</span><input type="${type}" data-ch="nd-field" data-scope="${scope}" data-key="${key}" data-k="${k}" value="${esc(nd[k] || '')}" ${extra}></label>`;
  return `<div class="nd-form">
    <span class="label">New driver</span>
    <div class="form-grid">${f('name', 'Full name', 'text', 'placeholder="Full name"')}${f('abbr', 'Abbreviation', 'text', 'maxlength="3" placeholder="ABC"')}${f('number', 'Number', 'number', 'min="1" max="99"')}${f('born', 'Date of birth', 'date')}</div>
    <div class="row" style="gap:12px">${nd.photo ? `<img class="avatar" src="${esc(nd.photo)}" alt="" style="width:48px;height:48px">` : ''}${pictureControls('newdriver', `${scope}:${key}`, !!nd.photo)}
      <button class="btn sm primary" data-act="nd-add" data-scope="${scope}" data-key="${key}">Add driver</button><button class="btn sm ghost" data-act="nd-cancel" data-scope="${scope}" data-key="${key}">Cancel</button></div>
  </div>`;
}
const ndDrafts = (scope) => scope === 'setup' ? (ui.setup.nd ||= {}) : (ui.modal.nd ||= {});
/** Any driver's name, wherever Pitwall knows them from. */
const anyName = (id) => id === PLAYER_ID ? 'You' : D.DRIVERS[id]?.name || H.bios[id]?.name || FEEDER[id]?.name || career()?.generated?.[id]?.name || career()?.customDrivers?.find(d => d.id === id)?.name || ui.setup?.newDrivers?.find(d => d.id === id)?.name || id;
/** The grid a new career's first season starts from. */
function setupGrid(u) {
  if (u.year > 2026) return u.futureGrid;
  return templateFor(u.year, u.year === 2025 ? { startYear: 2025, type: u.type, extraTeam2025: u.extra || null } : null).grid.map(t => ({ ...t, drivers: [...t.drivers] }));
}
/** Change a new career's first season: the seat picked must exist on that grid. */
function setupYear(y) {
  const u = ui.setup; u.year = y;
  const grid = setupGrid(Object.assign(u, y > 2026 ? { futureGrid: u.futureGrid || D.GRID_2026.map(t => ({ ...t, drivers: [...t.drivers] })), futureCal: u.futureCal || D.CAL_2026.map(([id, name, venue, sprint]) => ({ id, name, venue, sprint })) } : {}));
  const team = grid.find(t => t.id === u.teamId) || grid[grid.length - 1];
  u.teamId = team.id; if (!team.drivers.includes(u.seat)) u.seat = team.drivers[1] || team.drivers[0];
  if (u.type === 'myteam') { const ids = grid.flatMap(t => t.drivers); u.team.seats = u.team.seats.map((d, i) => ids.includes(d) || u.newDrivers.some(n => n.id === d) ? d : ['PER', 'BOT'][i]); }
  render();
}
function setupBlurb(y) {
  if (y === 2025) return 'Starts in 2025 with the F1 25 grid, plus APXGP or Konnersport if you added one. From season two the grid moves to 2026: Audi takes over Sauber and Cadillac joins.';
  if (y === 2026) return 'Starts in 2026 with the F1 25 2026 Season Pack grid: Audi takes over Sauber and Cadillac joins as the 11th team.';
  if (y > 2026) return `Starts in ${y} on a grid and calendar you lay out. Every real season to ${HIST_TO} is in your career, and the years after it are simulated.`;
  return `Starts in ${y} on the real grid and calendar. Each season after follows real life (the real line-ups and calendar) with your career’s moves on top, up to 2026; after that the driver market runs itself.`;
}
/** A circuit's Grand Prix name and venue, for adding it to a calendar. */
function trackGp(tid) {
  const t = D.TRACKS[tid] || {};
  const cal = [...D.CAL_2026, ...D.CAL_2025].find(([id]) => id === tid);
  const h = Object.values(H.seasons).flatMap(x => x.rounds).find(r => r.id === tid);
  return { id: tid, name: cal?.[1] || h?.name || t.country || tid, venue: cal?.[2] || h?.venue || t.city || '' };
}
/** A driver's age in a year, for drivers picked before the career exists. */
const setupAge = (u, id, year) => { const b = u.newDrivers.find(d => d.id === id)?.born || D.DRIVER_BIO[id]?.born || FEEDER[id]?.bornEst; return b ? year - +b.slice(0, 4) - (b.slice(5) > '03-01' ? 1 : 0) : null; };
/** Too old to race in the first season: the year they turn 44 or later. */
const retiredBy = (u, id) => { const b = id && (u.newDrivers.find(d => d.id === id)?.born || D.DRIVER_BIO[id]?.born || FEEDER[id]?.bornEst); return !!b && u.year - +b.slice(0, 4) >= RETIRE_AGE; };
let _realSkills = null;
/** Pace ratings from the last three real seasons, for picking replacements before a career exists. */
const realSkills = () => _realSkills ||= driverSkills({ seasons: [2023, 2024, 2025].map((y, i) => histSeason(y, i)), customDrivers: [] });
/** Fill one seat of the first season's grid: a driver who is free and young enough (quicker ones more likely), or a new talent. */
function setupFill(u, ti, si) {
  const year = u.year; const on = new Set(u.futureGrid.flatMap(t => t.drivers));
  const skills = realSkills();
  const recent = [2024, 2025].flatMap(y => Object.keys(H.seasons[y].drivers));
  const cands = [...new Set([...recent, ...Object.keys(FEEDER), ...u.newDrivers.map(d => d.id)])].filter(d => !on.has(d) && (setupAge(u, d, year) ?? 25) < 38)
    .map(d => [d, (skills[d] ?? u.newDrivers.find(x => x.id === d)?.skill ?? FEEDER[d]?.skill ?? 90) + ageEffect(setupAge(u, d, year)) + gauss(Math.random) * 60]).sort((a, b) => a[1] - b[1]);
  let pick = cands.length && Math.random() > 0.35 ? cands[Math.floor(Math.random() * Math.min(5, cands.length))][0] : null;
  if (!pick) {
    const g = genDriver(new Set([...u.newDrivers, ...Object.values(FEEDER), ...Object.values(H.bios)].map(x => x.name)), 'F2', year - 1, Math.random);
    u.newDrivers.push(g); pick = g.id;
  }
  u.futureGrid[ti].drivers[si] = pick;
}
/** For a career that starts after 2026: lay out the first season's grid and calendar. */
function futureGridEditor(u) {
  const grid26 = new Set(D.GRID_2026.flatMap(t => t.drivers));
  const raced = Object.keys(H.bios).filter(id => !grid26.has(id)).sort((a, b) => anyName(a).localeCompare(anyName(b)));
  const opt = (id, sel) => `<option value="${id}" ${sel === id ? 'selected' : ''}>${esc(anyName(id))}</option>`;
  const options = (sel) => `<optgroup label="2026 grid">${[...grid26].map(id => opt(id, sel)).join('')}</optgroup>
    ${u.newDrivers.some(d => !d.generated) ? `<optgroup label="Your new drivers">${u.newDrivers.filter(d => !d.generated).map(d => opt(d.id, sel)).join('')}</optgroup>` : ''}
    ${u.newDrivers.some(d => d.generated) ? `<optgroup label="New talent">${u.newDrivers.filter(d => d.generated).map(d => opt(d.id, sel)).join('')}</optgroup>` : ''}
    <optgroup label="F2 & F3 (2024–25)">${Object.keys(FEEDER).map(id => opt(id, sel)).join('')}</optgroup>
    <optgroup label="Raced since ${HIST_FROM}">${raced.map(id => opt(id, sel)).join('')}</optgroup>
    <option value="__new">+ A new driver…</option>`;
  const used = u.futureGrid.flatMap(t => t.drivers);
  const dupes = used.filter((d, i) => d && used.indexOf(d) !== i);
  const onCal = new Set(u.futureCal.map(r => r.track || r.id));
  return `<div class="panel"><div class="panel-h"><h2>The ${u.year} grid</h2><span class="muted" style="font-size:12px">Who drives where in your first season. The simulated years move everyone here.</span></div><div class="panel-b stack">
      ${dupes.length ? `<div class="callout">${esc(listJoin([...new Set(dupes)].map(anyName)))} ${dupes.length > 1 ? 'are' : 'is'} in two seats.</div>` : ''}
      ${(() => { const n = used.filter(d => retiredBy(u, d)).length; return n ? `<div class="callout row" style="justify-content:space-between"><span>${n === 1 ? 'One driver' : numWord(n)[0].toUpperCase() + numWord(n).slice(1) + ' drivers'} will have retired by ${u.year}: nobody races past ${RETIRE_AGE - 1}.</span><button class="btn sm primary" data-act="fg-fill-all">Auto-fill ${n === 1 ? 'the seat' : `all ${n} seats`}</button></div>` : ''; })()}
      <div class="fg-grid">${u.futureGrid.map((t, ti) => `<div class="fg-team" style="--c:${t.color}"><span class="bar"></span>
        <div class="row" style="gap:6px"><input type="text" value="${esc(t.name)}" data-ch="fg-name" data-i="${ti}" title="Team name"><input type="color" value="${esc(t.color)}" data-ch="fg-color" data-i="${ti}" title="Team colour"></div>
        ${[0, 1].map(si => `<select data-ch="fg-seat" data-i="${ti}" data-j="${si}">${options(t.drivers[si])}</select>
          ${retiredBy(u, t.drivers[si]) ? `<div class="fg-retired"><span>Retired by ${u.year}</span><button class="btn sm" data-act="fg-fill" data-i="${ti}" data-j="${si}">Auto-fill</button></div>` : ''}
          ${u.nd['g' + ti + '-' + si] ? newDriverForm('setup', 'g' + ti + '-' + si, u.nd['g' + ti + '-' + si]) : ''}`).join('')}</div>`).join('')}</div>
    </div></div>
    <div class="panel"><div class="panel-h"><h2>The ${u.year} calendar</h2><span class="muted" style="font-size:12px">${u.futureCal.length} rounds · also used for the simulated years</span></div>
      <div class="panel-b tight table-wrap"><table><tbody>${u.futureCal.map((r, i) => `<tr><td class="muted num">${i + 1}</td><td>${countryFlag(D.TRACKS[r.track || r.id]?.country, 12)} <b>${esc(r.name)}</b> <span class="muted">${esc(r.venue)}</span></td>
        <td><label class="check"><input type="checkbox" data-ch="fc-sprint" data-i="${i}" ${r.sprint ? 'checked' : ''}> Sprint</label></td>
        <td><div class="row" style="gap:2px;flex-wrap:nowrap;justify-content:flex-end"><button class="icon-btn" title="Earlier" data-act="fc-move" data-i="${i}" data-dir="-1">${ICON.up}</button><button class="icon-btn" title="Later" data-act="fc-move" data-i="${i}" data-dir="1">${ICON.down}</button><button class="icon-btn" title="Remove" data-act="fc-remove" data-i="${i}">${ICON.x}</button></div></td></tr>`).join('')}</tbody></table></div>
      <div class="panel-b"><select data-ch="fc-add" style="width:auto"><option value="">+ Add a circuit…</option>${Object.keys(D.TRACKS).filter(id => !onCal.has(id)).map(id => `<option value="${id}">${esc(trackGp(id).name)} · ${esc(D.TRACKS[id].circuit)}${D.TRACKS[id].former ? ' (former)' : ''}</option>`).join('')}</select></div>
    </div>`;
}
function renderSetup() {
  const u = ui.setup ||= defaultSetup();
  u.role ||= 'owner'; u.nd ||= {}; u.newDrivers ||= []; u.team.seats ||= ['PER', 'BOT']; u.year ||= 2025;
  const principal = u.type === 'myteam' && u.role === 'principal';
  const future = u.year > 2026;
  if (future) { u.futureGrid ||= D.GRID_2026.map(t => ({ ...t, drivers: [...t.drivers] })); u.futureCal ||= D.CAL_2026.map(([id, name, venue, sprint]) => ({ id, name, venue, sprint })); }
  const grid = setupGrid(u);
  if (!grid.some(t => t.id === u.teamId)) { u.teamId = grid[grid.length - 1].id; u.seat = grid[grid.length - 1].drivers[1]; }
  const gridDrivers = grid.flatMap(t => t.drivers).filter(Boolean);
  const pool = [...gridDrivers.map(id => ({ id, name: anyName(id) })), ...u.newDrivers.map(d => ({ ...d, custom: true })), ...(u.year >= 2025 ? Object.values(FEEDER).map(d => ({ id: d.id, name: `${d.name} (${d.series})` })) : [])];
  const teamCards = grid.map(t => `<div class="choice team-choice ${u.teamId === t.id ? 'on' : ''}" style="--c:${t.color}">
    <span class="bar"></span><div class="inner"><b>${esc(t.name)}</b><small>Replace a driver:</small>
    <div class="row" style="gap:6px">${t.drivers.map(d => `<button class="seat ${u.teamId === t.id && u.seat === d ? 'on' : ''}" data-act="setup-seat" data-team="${t.id}" data-seat="${d}">${esc(anyName(d))}</button>`).join('')}</div></div></div>`).join('');
  const first = !state.careers.length;
  return `<div class="page" style="max-width:1100px">
    <div class="page-head"><div>${first ? '<span class="label">Welcome to Pitwall</span>' : ''}<h1>New career</h1><div class="sub">${esc(setupBlurb(u.year))}</div></div>
      ${!first ? '<button class="btn ghost" data-act="cancel-setup">Cancel</button>' : ''}</div>

    <div class="panel"><div class="panel-h"><h2>First season</h2><span class="muted" style="font-size:12px">Every season from ${HIST_FROM} is in your career either way, so you can look back on all of it</span></div><div class="panel-b stack">
      <div class="row" style="gap:10px"><div class="seg year-seg">${Array.from({ length: 2026 - HIST_FROM + 1 }, (_, k) => HIST_FROM + k).map(y => `<button data-act="setup-year" data-v="${y}" class="${u.year === y ? 'on' : ''}">${y}</button>`).join('')}<button data-act="setup-year" data-v="${Math.max(2027, u.year)}" class="${future ? 'on' : ''}">Later…</button></div>
        ${future ? `<label class="row" style="gap:8px">Year <input type="number" min="2027" max="2060" value="${u.year}" data-ch="setup-year" style="width:90px"></label>` : ''}</div>
      ${future ? `<p class="muted" style="margin:0;font-size:13px">Real results run to the end of ${HIST_TO}. ${u.year - 1 > HIST_TO ? `${HIST_TO + 1}${u.year - 1 > HIST_TO + 1 ? `–${u.year - 1}` : ''} will be simulated race by race, with a driver market that ends on the grid you lay out below.` : ''}</p>` : ''}
    </div></div>
    ${future ? futureGridEditor(u) : ''}

    <div class="panel"><div class="panel-h"><h2>Career mode</h2></div><div class="panel-b">
      <div class="choices">${[['driver', 'Driver Career', 'Take a seat at an existing team and work your way up.'], ['myteam', 'My Team', 'Found the 11th team: you own it, run it and drive for it.']].map(([id, n, b]) => `<button class="choice ${u.type === id ? 'on' : ''}" data-act="setup-pick" data-k="type" data-v="${id}"><b>${n}</b><small>${b}</small></button>`).join('')}</div>
    </div></div>

    ${u.type === 'myteam' ? `<div class="panel"><div class="panel-h"><h2>Your role</h2></div><div class="panel-b">
      <div class="choices">${[['principal', 'Team Principal', 'You run the team and sign both drivers. This is how My Team works in F1 25.'], ['owner', 'Driver-Owner', 'You own the team and drive for it. Not in F1 25, kept for games that bring it back.']].map(([id, n, b]) => `<button class="choice ${u.role === id ? 'on' : ''}" data-act="setup-pick" data-k="role" data-v="${id}"><b>${n}</b><small>${b}</small></button>`).join('')}</div>
    </div></div>` : ''}

    <div class="panel"><div class="panel-h"><h2>${principal ? 'You, the team principal' : 'Your driver'}</h2></div><div class="panel-b stack">
      <div class="form-grid">
        <label class="field"><span>First name</span><input type="text" data-ch="setup" data-k="first" value="${esc(u.first)}" placeholder="Alex"></label>
        <label class="field"><span>Last name</span><input type="text" data-ch="setup" data-k="last" value="${esc(u.last)}" placeholder="Morgan"></label>
        ${principal ? '' : `<label class="field"><span>Abbreviation</span><input type="text" data-ch="setup" data-k="abbr" maxlength="3" value="${esc(u.abbr)}" placeholder="MOR"></label>
        <label class="field"><span>Race number</span><input type="number" data-ch="setup" data-k="number" min="1" max="99" value="${esc(u.number)}"></label>`}
        <label class="field"><span>Nationality</span><input type="text" data-ch="setup" data-k="nationality" value="${esc(u.nationality)}" placeholder="South African"></label>
        <label class="field"><span>Date of birth</span><input type="date" data-ch="setup" data-k="born" value="${esc(u.born || '')}" max="2012-12-31"></label>
      </div>
      ${principal ? '' : `<div class="row" style="gap:14px">
        ${u.photo ? `<img class="avatar" src="${esc(u.photo)}" alt="" style="width:64px;height:64px">` : `<span class="avatar gen" style="width:64px;height:64px;--c:#5E6A82;color:#fff;font-size:22px">${esc(initials(`${u.first} ${u.last}`.trim() || '?'))}</span>`}
        <div class="stack" style="gap:6px"><div class="row">${pictureControls('setup', PLAYER_ID, !!u.photo)}</div><span class="muted" style="font-size:12px">Optional. Used on standings, stories and your profile. A square head-and-shoulders shot works best.</span></div>
      </div>`}
    </div></div>

    ${principal ? '' : `<div class="panel"><div class="panel-h"><h2>Driver type</h2><span class="muted" style="font-size:12px">Sets what the press expects from you</span></div><div class="panel-b">
      <div class="choices">${D.ARCHETYPES.map(a => `<button class="choice ${u.archetype === a.id ? 'on' : ''}" data-act="setup-pick" data-k="archetype" data-v="${a.id}"><b>${a.name}</b><small>${a.blurb}</small></button>`).join('')}</div>
    </div></div>`}

    <div class="panel"><div class="panel-h"><h2>Media personality</h2><span class="muted" style="font-size:12px">How you come across in interviews</span></div><div class="panel-b">
      <div class="choices">${D.PERSONALITIES.map(a => `<button class="choice ${u.personality === a.id ? 'on' : ''}" data-act="setup-pick" data-k="personality" data-v="${a.id}"><b>${a.name}</b><small>${a.blurb}</small></button>`).join('')}</div>
    </div></div>

    ${u.year === 2025 && u.type !== 'myteam' ? `<div class="panel"><div class="panel-h"><h2>11th team</h2><span class="muted" style="font-size:12px">Did you add APXGP or Konnersport to your F1 25 career? They race 2025 only.</span></div><div class="panel-b">${extraPicker(u.extra, 'setup-pick')}</div></div>` : ''}
    ${u.type === 'myteam' ? `<div class="panel"><div class="panel-h"><h2>Your team</h2><span class="muted" style="font-size:12px">${u.year <= 2025 ? 'Your team is the 11th team' : 'Joins the grid as an extra team'}. Everything can be changed later in My Team.</span></div><div class="panel-b stack">
      ${teamIdentityForm(u.team, 'setup')}
      ${principal ? `<div class="form-grid">${[0, 1].map(i => `<label class="field"><span>${i ? 'Second driver' : 'Lead driver'}</span><select data-ch="mt-seat" data-i="${i}">
          ${pool.map(d => `<option value="${d.id}" ${u.team.seats[i] === d.id ? 'selected' : ''}>${esc(d.name)}${d.custom ? ' (new)' : ''}</option>`).join('')}<option value="__new" ${u.nd[i] ? 'selected' : ''}>+ Create a new driver…</option></select></label>`).join('')}</div>
        ${[0, 1].filter(i => u.nd[i]).map(i => newDriverForm('setup', i, u.nd[i])).join('')}
        <p class="muted" style="font-size:13px">The lead driver is the one Pitwall follows on the dashboard, teammate battle and career stats. Signing a driver from another team frees up their seat for a reserve driver.</p>`
      : `<div class="form-grid">
        <label class="field"><span>Teammate</span><select data-ch="mt-field" data-scope="setup" data-k="mate">${[...new Set([...gridDrivers, 'PER', 'BOT'])].map(id => `<option value="${id}" ${u.team.mate === id ? 'selected' : ''}>${esc(anyName(id))}</option>`).join('')}</select></label>
      </div>
      <p class="muted" style="font-size:13px">Signing a driver from another team frees up their seat for a reserve driver.</p>`}
    </div></div>`
    : `<div class="panel"><div class="panel-h"><h2>${u.year} team</h2><span class="muted" style="font-size:12px">Pick the seat you took over in-game</span></div><div class="panel-b">
      <div class="choices">${teamCards}</div>
    </div></div>`}

    <div class="panel"><div class="panel-h"><h2>Goals & story</h2></div><div class="panel-b stack">
      ${goalEditor(u.goals, 'setup')}
      <div class="form-grid">
        <label class="field"><span>Practice sessions</span><select data-ch="setup" data-k="practice">${[['full', 'Full (FP1, FP2, FP3)'], ['short', 'Short (one session)'], ['none', 'None']].map(([v, l]) => `<option value="${v}" ${u.practice === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      </div>
      <label class="field"><span>Backstory (optional, used by the media)</span><textarea data-ch="setup" data-k="bio" placeholder="F2 runner-up in 2024, signed after impressing in a Silverstone test…">${esc(u.bio)}</textarea></label>
    </div></div>

    <div class="row" style="justify-content:flex-end"><button class="btn primary" data-act="create-career">${future && u.year - 1 > HIST_TO ? `Simulate to ${u.year} and start` : `Start ${u.year} season`}</button></div>
  </div>`;
}
/** Who goals can be set for, and which teams to beat, in the setup or a goals dialog. */
function goalCtx(scope) {
  if (scope === 'setup') {
    const u = ui.setup; const principal = u.type === 'myteam' && u.role === 'principal';
    return { drivers: principal ? u.team.seats.filter(Boolean).map(id => [id, anyName(id)]) : null, teams: setupGrid(u).filter(t => u.type === 'myteam' || t.id !== u.teamId).map(t => [t.id, t.name]) };
  }
  const c = career(); const m = ui.modal; const next = m?.kind === 'next'; const s = curSeason();
  const teams = next ? m.base.teams : s.teams;
  const mine = isPrincipal(c) ? MYTEAM : next ? m.teamId : s.playerTeamId;
  const mt = teams.find(t => t.id === mine);
  return { drivers: isPrincipal(c) ? (mt?.drivers.filter(Boolean) || []).map(id => [id, next ? m.base.drivers[id]?.name || anyName(id) : dName(s, id)]) : null, teams: teams.filter(t => t.id !== mine).map(t => [t.id, t.name]) };
}
/** Team goals and driver goals: in My Team you set them for each of your drivers, in a Driver Career for yourself. */
function goalEditor(goals, scope) {
  const ctx = goalCtx(scope);
  const section = (kind) => {
    const list = goals.filter(g => goalScope(g) === kind);
    const types = D.GOAL_TYPES.filter(x => x.scope === kind || x.scope === 'any');
    return `<div class="stack" style="gap:6px"><span class="label">${kind === 'team' ? 'Team goals' : ctx.drivers ? 'Driver goals' : 'Your goals'}</span>
      ${list.length ? `<div class="table-wrap"><table><tbody>${list.map(g => {
        const gt = D.GOAL_TYPES.find(x => x.id === g.type);
        return `<tr><td><select data-ch="goal-type" data-scope="${scope}" data-id="${g.id}">${types.map(x => `<option value="${x.id}" ${x.id === g.type ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}</select>
          ${g.type === 'custom' ? `<input type="text" style="margin-top:6px" placeholder="Describe the goal" value="${esc(g.text || '')}" data-ch="goal-text" data-scope="${scope}" data-id="${g.id}">` : ''}</td>
          ${kind === 'driver' && ctx.drivers ? `<td style="width:170px"><select data-ch="goal-driver" data-scope="${scope}" data-id="${g.id}">${ctx.drivers.map(([id, n]) => `<option value="${id}" ${g.driver === id ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></td>` : ''}
          <td style="width:170px">${gt?.needsTeam ? `<select data-ch="goal-team" data-scope="${scope}" data-id="${g.id}">${ctx.teams.map(([id, n]) => `<option value="${id}" ${g.team === id ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>`
            : gt?.needsTarget ? `<input type="number" min="0" value="${esc(g.target ?? '')}" data-ch="goal-target" data-scope="${scope}" data-id="${g.id}">` : '<span class="muted">—</span>'}</td>
          <td style="width:40px"><button class="icon-btn" title="Remove goal" data-act="goal-remove" data-scope="${scope}" data-id="${g.id}">${ICON.x}</button></td></tr>`;
      }).join('')}</tbody></table></div>` : ''}
      <div><button class="btn sm" data-act="goal-add" data-scope="${scope}" data-kind="${kind}">+ ${kind === 'team' ? 'Team goal' : ctx.drivers ? 'Driver goal' : 'Goal'}</button></div></div>`;
  };
  return `<div class="stack">${section('team')}${section('driver')}</div>`;
}

/* ------------------------------------------------------------------ modal */
function modal(html, cls = '') {
  $('#modal-root').innerHTML = `<div class="modal-back" data-act="modal-bg"><div class="modal ${cls}" role="dialog" aria-modal="true">${html}</div></div>`;
}
function closeModal() { $('#modal-root').innerHTML = ''; ui.modal = null; setTimeout(flushRemote, 0); }
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, 2600);
}
function confirmBox(title, text, okLabel, onOk) {
  ui.confirmFn = onOk;
  modal(`<div class="modal-h"><h2>${esc(title)}</h2></div><div class="modal-b"><p>${esc(text)}</p></div>
    <div class="modal-f"><button class="btn ghost" data-act="modal-close">Cancel</button><button class="btn primary" data-act="confirm-ok">${esc(okLabel)}</button></div>`);
}

function goalsModal() {
  const s = curSeason();
  ui.modal = { kind: 'goals', goals: clone(s.goals) };
  drawGoalsModal();
}
function drawGoalsModal() {
  const s = curSeason();
  modal(`<div class="modal-h"><h2>${s.year} season goals</h2><button class="icon-btn" data-act="modal-close">${ICON.x}</button></div>
    <div class="modal-b">${goalEditor(ui.modal.goals, 'modal')}</div>
    <div class="modal-f"><button class="btn ghost" data-act="modal-close">Cancel</button><button class="btn primary" data-act="goals-save">Save goals</button></div>`);
}

function nextSeasonModal() {
  const c = career(); const s = latestSeason();
  const index = s.index + 1;
  const base = baseRoster(c, index, s);
  // a move you signed for next season decides where you start; the seat you take is the one your chain freed up
  const myMove = (s.transfers || []).filter(tr => tr.effective === 'next').flatMap(tr => tr.steps).filter(m => m.driver === PLAYER_ID && m.kind === 'move').pop();
  const want = myMove?.to || s.playerTeamId;
  const keep = base.teams.some(t => t.id === want) ? want : base.teams.some(t => t.id === s.playerTeamId) ? s.playerTeamId : base.teams[0].id;
  const keepTeam = base.teams.find(t => t.id === keep);
  const defaultSeat = myMove && keepTeam.drivers.includes(null) ? null : keepTeam.drivers.find(d => d) || null;
  ui.modal = { kind: 'next', index, base, teamId: keep, seat: defaultSeat, goals: s.goals.map(g => ({ ...g, id: uid(), done: false })) };
  drawNextSeasonModal();
}
function drawNextSeasonModal() {
  const c = career(); const s = latestSeason(); const m = ui.modal;
  const st = seasonStats(s); const ds = driverStandings(s, st); const myPos = ds.find(x => x.id === PLAYER)?.pos;
  const remaining = activeRounds(s).length - roundsDone(s);
  const year = s.year + 1;
  const extraAsk = year === 2025 && c.type !== 'myteam' && c.startYear < 2025 ? `<div><h3 style="margin-bottom:6px">11th team in 2025</h3><p class="muted" style="margin:0 0 10px">Did your F1 25 career add APXGP or Konnersport? They race in 2025 only.</p>${extraPicker(m.extra ?? c.extraTeam2025, 'next-extra')}</div>` : '';
  const apxNote = year === 2026 ? '<div class="callout">The grid moves to the 2026 regulations: Audi replaces Kick Sauber and Cadillac joins as the 11th team. Madrid replaces Imola on the calendar.</div>'
    : templateFor(year) ? `<div class="callout">The ${year} grid and calendar follow real life, with the moves made in your career on top.</div>`
    : '<div class="callout">Past the real data: the grid carries over from last season with every transfer, and the rest of the market moves on its own. Check the moves in Transfers.</div>';
  modal(`<div class="modal-h"><h2>Start the ${year} season</h2><button class="icon-btn" data-act="modal-close">${ICON.x}</button></div>
    <div class="modal-b">
      ${remaining ? `<div class="callout">${remaining} round${remaining > 1 ? 's' : ''} of ${s.year} still unlogged. You can come back and log them later.</div>` : ''}
      <div class="kv"><dt>${s.year} result</dt><dd><b>${myPos ? 'P' + myPos : '–'}</b> in the drivers' championship with ${st[PLAYER]?.pts || 0} points</dd><dt>Champion</dt><dd>${esc(dName(s, ds[0]?.id))}</dd></div>
      ${apxNote}
      ${extraAsk}
      ${isPrincipal(c) ? `<div><h3 style="margin-bottom:6px">Your ${year} line-up</h3><p class="muted">${esc(m.base.teams.find(t => t.id === MYTEAM)?.drivers.filter(Boolean).map(d => m.base.drivers[d]?.name || d).join(' and ') || 'No drivers signed')}. Sign or release drivers in Transfers.</p></div>` : `<div><h3 style="margin-bottom:10px">Your ${year} seat</h3><div class="choices">${m.base.teams.map(t => `<div class="choice team-choice ${m.teamId === t.id ? 'on' : ''}" style="--c:${t.color}"><span class="bar"></span><div class="inner"><b>${esc(t.name)}</b>
        <div class="row" style="gap:6px">${t.drivers.map((d, i) => `<button class="seat ${m.teamId === t.id && m.seat === d ? 'on' : ''}" data-act="next-seat" data-team="${t.id}" data-seat="${d ?? ''}" data-i="${i}">${d ? esc(m.base.drivers[d]?.name || d) : 'Empty seat'}</button>`).join('')}</div></div></div>`).join('')}</div></div>`}
      <div><h3 style="margin-bottom:10px">${year} goals</h3>${goalEditor(m.goals, 'modal')}</div>
      <p class="muted" style="font-size:13px">You can change the full roster and calendar for ${year} in Settings afterwards to match transfers in your save.</p>
    </div>
    <div class="modal-f"><button class="btn ghost" data-act="modal-close">Cancel</button><button class="btn primary" data-act="next-confirm">Start ${year}</button></div>`, 'wide');
}

function newMediaModal(roundId) {
  const c = career(); const s = latestSeason();
  const sCur = curSeason();
  const season = roundId ? sCur : s;
  const rounds = activeRounds(season);
  const withR = rounds.filter(r => season.weekends[r.id]?.sessions?.R?.done);
  const withQ = rounds.filter(r => season.weekends[r.id]?.sessions?.Q?.done);
  const defRound = roundId || withR[withR.length - 1]?.id || withQ[withQ.length - 1]?.id || '';
  const defKind = roundId ? (season.weekends[roundId]?.sessions?.R?.done ? 'race' : 'quali') : (withR.length ? 'race' : 'preseason');
  ui.modal = { kind: 'media', seasonIdx: season.index, roundId: defRound, mkind: defKind };
  drawMediaModal();
}
function drawMediaModal() {
  const c = career(); const m = ui.modal; const s = c.seasons[m.seasonIdx];
  const needsRound = m.mkind === 'quali' || m.mkind === 'race';
  modal(`<div class="modal-h"><h2>New media session</h2><button class="icon-btn" data-act="modal-close">${ICON.x}</button></div>
    <div class="modal-b">
      <div class="choices">${[['preseason', 'Pre-season media day', 'Expectations, targets and your new team.'], ['quali', 'Post-qualifying', 'Your grid slot and Sunday’s plan.'], ['race', 'Post-race', 'The result, the battles, the fallout.'], ['midseason', 'Mid-season interview', 'Form, standings and the teammate battle.'], ['endseason', 'End-of-season interview', 'Verdict on the year and what comes next.']].map(([id, n, b]) => `<button class="choice ${m.mkind === id ? 'on' : ''}" data-act="media-kind" data-v="${id}"><b>${n}</b><small>${b}</small></button>`).join('')}</div>
      <div class="form-grid">
        <label class="field"><span>Season</span><select data-ch="media-season">${playedSeasons(c).map(x => `<option value="${x.index}" ${x.index === m.seasonIdx ? 'selected' : ''}>${x.year}</option>`).join('')}</select></label>
        ${needsRound ? `<label class="field"><span>Round</span><select data-ch="media-round">${activeRounds(s).map((r, i) => `<option value="${r.id}" ${r.id === m.roundId ? 'selected' : ''}>R${i + 1} · ${esc(r.name)}</option>`).join('')}</select></label>` : ''}
      </div>
      ${!settings.hasKey ? '<p class="muted" style="font-size:13px">No API key saved, so questions come from the built-in template set. Add a key in Settings for AI-written journalists and articles.</p>' : ''}
    </div>
    <div class="modal-f">${ui.busy ? '<span class="spinner"></span>' : ''}<button class="btn ghost" data-act="modal-close">Cancel</button><button class="btn primary" data-act="media-start" ${ui.busy ? 'disabled' : ''}>Enter the press room</button></div>`);
}

/* ------------------------------------------------------------ AI context */
function mediaContext(c, seasonIdx, roundId, kind) {
  const s = c.seasons[seasonIdx];
  const st = seasonStats(s);
  const ds = driverStandings(s, st);
  const me = st[PLAYER] || emptyStat();
  const mate = teammateOf(s);
  const team = s.teams.find(t => t.id === s.playerTeamId);
  const arch = D.ARCHETYPES.find(a => a.id === c.profile.archetype);
  const pers = D.PERSONALITIES.find(a => a.id === c.profile.personality);
  const rounds = activeRounds(s);
  const r = rounds.find(x => x.id === roundId);
  const lines = [];
  if (isPrincipal(c)) lines.push(`Interviewee: ${c.profile.first} ${c.profile.last}, owner and team principal of ${team?.name} (${c.profile.nationality || 'nationality not given'}). Not a driver: the team's drivers are ${listJoin((team?.drivers || []).filter(Boolean).map(d => dName(s, d)))}.`);
  else { lines.push(`Driver: ${c.profile.first} ${c.profile.last} (#${c.profile.number}, ${c.profile.nationality || 'nationality not given'})`); lines.push(`Driver type: ${arch?.name} — ${arch?.blurb}`); }
  lines.push(`Media personality: ${pers?.name} — ${pers?.blurb}`);
  if (c.profile.bio) lines.push(`Backstory: ${c.profile.bio}`);
  lines.push(isPrincipal(c) ? `Season: ${s.year} (career season ${seasonIdx + 1}). Team: ${team?.name}.` : `Season: ${s.year} (career season ${seasonIdx + 1}). Team: ${team?.name}. Teammate: ${dName(s, mate)}.`);
  { const rv = rivalsAt(c, s, roundsDone(s) - 1); for (const x of rv.active) lines.push(`Title rivals (${x.kind === 'team' ? 'constructors' : 'drivers'}): ${x.kind === 'team' ? (s.teams.find(t => teamRoot(t.id) === x.a) || {}).name : dName(s, x.a)} v ${x.kind === 'team' ? (s.teams.find(t => teamRoot(t.id) === x.b) || {}).name : dName(s, x.b)}, ${x.gap} points apart`); const a = rv.arch.driver[PLAYER]; if (a) lines.push(`Archrival: ${dName(s, a.rival)} (since ${a.year})`); for (const fd of feudsAt(c, s, roundsDone(s))) lines.push(`Running feud: ${dName(s, fd.a)} v ${dName(s, fd.b)} (${fd.reason})`); }
  if (c.myTeam && s.playerTeamId === MYTEAM) {
    const m = c.myTeam;
    lines.push(`${isPrincipal(c) ? 'The team principal' : 'The driver also'} owns and runs the team: ${m.name}, a new team founded in ${m.founded || 2025}${m.base ? `, based in ${m.base}` : ''}, with ${m.engine} engines. Budget: ${fmtM(m.budget + ledgerTotals(m).net)}.${m.story ? ' Team story: ' + m.story : ''}`);
  }
  if (seasonIdx > 0) {
    const prev = c.seasons[seasonIdx - 1]; const pds = driverStandings(prev);
    lines.push(`Previous season (${prev.year}): finished P${pds.find(x => x.id === PLAYER)?.pos} with ${prev.teams.find(t => t.id === prev.playerTeamId)?.name}. Champion: ${dName(prev, pds[0]?.id)}.`);
  }
  const myPos = ds.find(x => x.id === PLAYER)?.pos;
  lines.push(`Championship after ${roundsDone(s)} of ${rounds.length} rounds: ${isPrincipal(c) ? dName(s, PLAYER) + " (the team's focus driver)" : "the driver"} P${myPos} with ${me.pts} pts. Leader: ${dName(s, ds[0]?.id)} on ${ds[0]?.pts} pts. Season so far: ${me.wins} wins, ${me.podiums} podiums, ${me.poles} poles, ${me.dnfs} DNFs.`);
  lines.push(`Top 5: ${ds.slice(0, 5).map(x => `${x.pos}. ${dName(s, x.id)} (${teamOf(s, x.id)?.name}) ${x.pts}`).join('; ')}`);
  const h = h2hCompare([s], PLAYER, mate);
  if (!isPrincipal(c)) lines.push(`Teammate battle vs ${dName(s, mate)}: qualifying ${h.q[0]}-${h.q[1]}, races ${h.r[0]}-${h.r[1]}, points ${h.pts[0]}-${h.pts[1]}.`);
  for (const l of memoryFacts(c, s, r ? rounds.indexOf(r) : roundsDone(s), kind)) lines.push(l);
  const cs = constructorStandings(s, st);
  lines.push(`Team in constructors' championship: P${cs.find(x => x.team.id === s.playerTeamId)?.pos}.`);
  if (s.goals.length) lines.push(`Season goals: ${s.goals.map(g => `${goalTitle(g)} (${evalGoal(g, s).ok ? 'on target' : 'not yet'})`).join('; ')}`);
  if (r) {
    const w = s.weekends[r.id];
    lines.push(`This event: Round ${rounds.indexOf(r) + 1}, ${r.name} Grand Prix at ${r.venue}${r.sprint ? ' (sprint weekend)' : ''}.`);
    for (const k of sessionsFor(s, r)) {
      const sd = w?.sessions[k];
      if (!sd?.done) continue;
      const ix = sd.results.findIndex(x => x.d === PLAYER);
      const my = sd.results[ix];
      const fl = fastestOf(sd);
      const top3 = sd.results.slice(0, 3).map((x, i) => `${i + 1}. ${dName(s, x.d)}`).join(', ');
      const mi = sd.results.findIndex(x => x.d === mate);
      lines.push(`${SESSION_LABEL[k]}: player ${OUT.includes(my?.st) ? my.st : 'P' + (ix + 1)}${my?.lap ? ` (best lap ${my.lap})` : ''}${my?.gap ? ` gap ${my.gap}` : ''}; teammate P${mi + 1}${OUT.includes(sd.results[mi]?.st) ? ' ' + sd.results[mi].st : ''}; top 3: ${top3}${fl ? `; fastest lap ${dName(s, fl)}` : ''}${isRaceKind(k) ? `; player scored ${pointsFor(k, ix + 1, my?.st, my?.pts)} pts` : ''}.`);
    }
    if (w?.notes) lines.push(`Driver's own notes on the weekend: ${w.notes}`);
  }
  const recent = c.media.filter(m => m.article).slice(-3);
  if (recent.length) lines.push(`Recent headlines about the driver: ${recent.map(m => `"${m.article.headline}"`).join(' | ')}`);
  const answers = c.media.filter(m => m.article).slice(-2).flatMap(m => m.questions.map(q => q.answer).filter(Boolean)).slice(-3);
  if (answers.length) lines.push(`Things the driver said recently: ${answers.map(a => `"${a}"`).join(' | ')}`);
  lines.push(`Media reputation score (−10 hostile to +10 adored): ${reputation(c)}`);
  const ang = mediaAngles(c, seasonIdx, roundId, kind).filter(a => a.fact).sort((a, b) => b.w - a.w);
  if (ang.length) lines.push(`ANGLES worth asking about, strongest first:\n${ang.slice(0, 10).map(a => `- ${a.fact}`).join('\n')}`);
  return lines.join('\n');
}

/*
  Interview angles. Every interview looks at what actually happened and what the paddock remembers: the result and
  where it came from (places made up, the car's real pace), the teammate, incidents and penalties, the strategy, the
  title fight and rivalries (a new one, a close one, the archrival, a feud), and memory (last time out, the last few
  races, this race a year ago, streaks and firsts). Each angle has a weight, so the strongest stories get asked about
  first, and carries a fact line for the AI and questions for the built-in set. A team principal is asked about the
  team and both drivers, never about their own driving.
*/
const qPick = (arr) => arr[Math.floor(Math.random() * arr.length)];
function mediaAngles(c, seasonIdx, roundId, kind) {
  const s = c.seasons[seasonIdx]; const rounds = activeRounds(s);
  const r = rounds.find(x => x.id === roundId); const ri = r ? rounds.indexOf(r) : roundsDone(s) - 1;
  const tp = isPrincipal(c); const team = s.teams.find(t => t.id === s.playerTeamId);
  const ours = tp ? (team?.drivers || []).filter(Boolean) : [PLAYER];
  const mate = tp ? null : teammateOf(s);
  const L = (id) => id === PLAYER_ID ? c.profile.last : lastName(dName(s, id));
  const you = (id) => tp ? L(id) : 'you';
  const A = []; const add = (key, w, fact, qs) => { if (w > 0 && qs.length) A.push({ key, w, fact, qs }); };
  const ses = r ? s.weekends[r.id]?.sessions || {} : {};
  const at = (sd, d) => { const k = sd?.done ? sd.results.findIndex(x => x.d === d) : -1; return k < 0 ? null : { pos: k + 1, st: sd.results[k].st, out: OUT.includes(sd.results[k].st) }; };
  const grid = (d) => ses.R?.game?.grid?.[d] || at(ses.Q, d)?.pos || null;
  // the car's real pace: where the team ranks on race pace so far, as a finishing position
  const paceRank = (() => { const P = paceTable(s, kind === 'quali' ? 'quali' : 'race'); const k = P.rows.findIndex(o => o.team.id === s.playerTeamId); return k < 0 ? null : k + 1; })();
  const expect = paceRank ? paceRank * 2 - 0.5 : null;
  const careerCount = (id, key) => playedSeasons(c).filter(x => x.index <= s.index).reduce((a, x) => a + ((x.index === s.index ? seasonStats(x, ri + 1) : seasonStatsCache(x))[id]?.[key] || 0), 0) + (id === PLAYER_ID || D.DRIVER_BIO[id]?.fictional ? 0 : (D.DRIVER_BIO[id]?.[key] || 0));

  if (kind === 'race' && ses.R?.done) {
    for (const d of ours) {
      const x = at(ses.R, d); if (!x) continue; const g = grid(d); const nm = you(d);
      if (x.out) add('dnf-' + d, 9, `${dName(s, d)} did not finish (${x.st}).`, [tp ? `${L(d)} retired today. What happened, and how much does it hurt the team?` : `A ${x.st} today. Talk us through what happened.`, tp ? `Another car out of the race. Is reliability a worry for you?` : `How much does today's ${x.st} cost you?`]);
      else {
        add('result-' + d, 5 + (x.pos <= 3 ? 3 : 0), `${dName(s, d)} finished P${x.pos}${g ? ` from P${g} on the grid` : ''}.`, [tp ? `P${x.pos} for ${L(d)}. How do you rate the drive?` : `P${x.pos} at the flag. How do you sum up your afternoon?`]);
        if (g && g - x.pos >= 4) add('climb-' + d, 6 + Math.min(4, (g - x.pos) / 2), `${dName(s, d)} gained ${g - x.pos} places, P${g} to P${x.pos}.`, [`From P${g} to P${x.pos}: where did ${nm === 'you' ? 'you' : nm} find all those places?`, `${g - x.pos} places made up today. Was that the plan, or did the race come to ${nm === 'you' ? 'you' : nm}?`]);
        if (g && x.pos - g >= 4) add('drop-' + d, 6, `${dName(s, d)} lost ${x.pos - g} places, P${g} to P${x.pos}.`, [`${nm === 'you' ? 'You' : nm} started P${g} and finished P${x.pos}. Where did it go wrong?`, `Lost ${x.pos - g} places from the grid. Was it pace, strategy or traffic?`]);
        if (expect && x.pos <= expect - 4 && x.pos <= 10) add('beatcar-' + d, 7, `${dName(s, d)} finished P${x.pos} in what has been the ${ordWord(paceRank)}-fastest car on race pace.`, [`On pace this has been the ${ordWord(paceRank)}-quickest car, yet ${nm === 'you' ? 'you' : nm} finished P${x.pos}. How?`, tp ? `${L(d)} is getting more out of the car than it has in it. How do you keep hold of a driver like that?` : `Are you outperforming this car right now?`]);
        if (expect && x.pos >= expect + 5) add('undercar-' + d, 6, `${dName(s, d)} finished P${x.pos}, well below the car's usual pace (${ordWord(paceRank)}-fastest).`, [`The car has been the ${ordWord(paceRank)}-fastest, but P${x.pos} today. What was missing?`]);
        const before = careerCount(d, 'wins') - (x.pos === 1 ? 1 : 0), podB = careerCount(d, 'podiums') - (x.pos <= 3 ? 1 : 0);
        if (x.pos === 1 && before === 0) add('firstwin-' + d, 12, `It was ${dName(s, d)}'s first Grand Prix win.`, [tp ? `A first Grand Prix win for ${L(d)}, and for the team with ${L(d)}. What does it mean?` : `Your first Grand Prix win! What goes through your mind?`]);
        else if (x.pos <= 3 && podB === 0) add('firstpod-' + d, 10, `It was ${dName(s, d)}'s first podium.`, [tp ? `A first podium for ${L(d)}. How big a day is this for everyone?` : `Your first Formula 1 podium. Describe the feeling.`]);
      }
      // incidents and penalties
      for (const inc of (ses.R.game?.incidents || []).filter(o => o.a === d || o.b === d)) {
        const other = inc.a === d ? inc.b : inc.a; const blame = !inc.noFault && inc.a === d;
        add('inc-' + d + other, inc.major ? 9 : 5, `Lap ${inc.lap || '?'}: ${incidentLine(inc, L)}`, inc.noFault ? [`${nm === 'you' ? 'You' : nm} and ${L(other)} touched on lap ${inc.lap}. Racing incident?`]
          : blame ? [inc.major ? `The stewards blamed ${nm === 'you' ? 'you' : nm} for the collision with ${L(other)}. Fair call?` : `A bit of contact with ${L(other)}. Was that on ${nm === 'you' ? 'you' : nm}?`, inc.major ? `${L(other)} wasn't happy after the contact. What do you say to that?` : `Have ${nm === 'you' ? 'you' : nm} spoken to ${L(other)} about the contact?`]
          : [inc.major ? `${L(other)} hit ${nm === 'you' ? 'you' : nm}${inc.pen ? ` and got ${inc.pen}` : ''}. Is that enough?` : `${L(other)} gave ${nm === 'you' ? 'you' : nm} a tap on lap ${inc.lap}. Any damage?`, `How do ${nm === 'you' ? 'you' : 'you'} feel about ${L(other)} after today?`]);
      }
      const pens = (ses.R.game?.penalties || []).filter(p => p.d === d && PENALTY_NAMES[p.type] && !COLLISION_INFR.includes(p.infr));
      if (pens.length) add('pen-' + d, 6, `${dName(s, d)} was penalised: ${listJoin(pens.map(p => `${p.type === 4 ? `${p.time} s` : PENALTY_NAMES[p.type]}${INFRINGEMENTS[p.infr] ? ` for ${INFRINGEMENTS[p.infr]}` : ''}`))}.`, [`A penalty for ${INFRINGEMENTS[pens[0].infr] || 'an infringement'}. Avoidable?`]);
      const g2 = ses.R.game; if (g2?.pits?.[d] != null && !x.out) add('strat-' + d, 3 + (g2.pits[d] >= 3 ? 2 : 0), `${dName(s, d)} made ${plural(g2.pits[d], 'stop')}: ${stintsOf(ses.R, d).map(o => (COMPOUNDS[o.c] || [])[1] || '?').join(', ')}.`, [`${plural(g2.pits[d], 'stop')} today. Did the strategy work?`, `Talk us through the tyre calls.`]);
    }
    for (const d of ours) for (const b of raceBattles(ses.R) || []) {
      if (b.a !== d && b.b !== d) continue;
      const o = b.a === d ? b.b : b.a; const won = b.ahead === d;
      const born = duels(s).events.some(e => e.type === 'duelStart' && e.i === ri && e.key === 'R' && pairKey(e.a, e.b) === pairKey(d, o));
      add('battle-' + d + o, 6 + Math.min(3, (b.n - 5) / 2) + (born ? 2 : 0), `${dName(s, d)} and ${dName(s, o)} swapped places ${b.n} times; ${dName(s, b.ahead)} finished ahead.${born ? ' It was their second race running wheel to wheel: they are now rivals on track.' : ''}`, born
        ? [tp ? `${L(d)} and ${L(o)} have gone wheel to wheel two races running now. Is this a rivalry?` : `That's two races in a row you've been wheel to wheel with ${L(o)}. Is this becoming a rivalry?`, tp ? `Do you worry ${L(d)} and ${L(o)} will end up taking each other out?` : `Do you enjoy racing ${L(o)}, or is it getting personal?`]
        : [tp ? `${L(d)} and ${L(o)} passed each other ${b.n} times. Were you enjoying it on the pit wall?` : `You and ${L(o)} swapped places ${b.n} times. What was that fight like from the cockpit?`, won ? (tp ? `${L(d)} came out on top against ${L(o)}. What made the difference?` : `You came out on top against ${L(o)} in the end. Where did you make it stick?`) : (tp ? `${L(o)} got the better of ${L(d)} in the end. What was missing?` : `${L(o)} got the better of you in the end. What was missing?`)]);
    }
    if (!tp && mate) {
      const a = at(ses.R, PLAYER), b = at(ses.R, mate);
      if (a && b) add('mate', 4 + (b.pos < a.pos ? 3 : 0), `Teammate ${dName(s, mate)} finished ${b.out ? b.st : 'P' + b.pos}.`, [b.pos < a.pos ? `${L(mate)} beat you today. Does that sting?` : `You finished ahead of ${L(mate)}. How important is that?`]);
    }
    if (tp && ours.length === 2) {
      const [a, b] = ours.map(d => at(ses.R, d));
      if (a && b && !a.out && !b.out && Math.abs(a.pos - b.pos) === 1) add('teamfight', 5, `${dName(s, ours[0])} and ${dName(s, ours[1])} finished next to each other.`, [`Your drivers finished side by side. Did you have to manage them?`]);
      const pts = ours.reduce((n, d) => { const x = at(ses.R, d); return n + (x ? pointsFor('R', x.pos, x.st) : 0); }, 0);
      add('teampts', 4, `The team scored ${plural(pts, 'point')} in the race.`, [pts ? `${plural(pts, 'point')} for the team today. Satisfied?` : `No points today. What does the team need to find?`]);
    }
    const dd = driverOfTheDay(s, ri); if (dd && ours.includes(dd.id)) add('dotd', 6, `${dName(s, dd.id)} was voted Driver of the Day.`, [tp ? `${L(dd.id)} is Driver of the Day. Was it the best drive of the year for the team?` : `You've been voted Driver of the Day. Your best drive of the season?`]);
  }
  if (kind === 'quali' && ses.Q?.done) {
    for (const d of ours) {
      const x = at(ses.Q, d); if (!x) continue; const nm = you(d);
      const exit = x.pos > 15 ? 'Q1' : x.pos > 10 ? 'Q2' : null;
      add('grid-' + d, 5 + (x.pos === 1 ? 5 : x.pos <= 3 ? 2 : 0), `${dName(s, d)} qualified P${x.pos}${ses.Q.results[x.pos - 1]?.gap ? ` (${ses.Q.results[x.pos - 1].gap} off pole)` : ''}.`, [x.pos === 1 ? (tp ? `Pole for ${L(d)}! How did the team pull that off?` : `Pole position! Talk us through the lap.`) : `P${x.pos} on the grid for ${nm === 'you' ? 'you' : nm}. Is that where the car belongs?`]);
      if (exit) add('exit-' + d, 6, `${dName(s, d)} went out in ${exit}.`, [tp ? `${L(d)} went out in ${exit}. What went wrong?` : `Out in ${exit}. What went wrong?`, `${nm === 'you' ? 'You' : nm} didn't make it past ${exit}. How much harder does that make tomorrow?`]);
      if (expect && x.pos <= expect - 4) add('qbeat-' + d, 7, `${dName(s, d)} qualified P${x.pos}, well above the car's usual ${ordWord(paceRank)} place on one-lap pace.`, [`P${x.pos} in a car that usually qualifies around ${ordWord(Math.round(expect))}. Where did that come from?`]);
    }
    if (!tp && mate) { const a = at(ses.Q, PLAYER), b = at(ses.Q, mate); if (a && b) add('qmate', 4, `${dName(s, mate)} qualified P${b.pos}.`, [b.pos < a.pos ? `${L(mate)} out-qualified you. What did ${L(mate)} find?` : `Ahead of ${L(mate)} again. Is the qualifying battle won?`]); }
  }
  // the title fight and rivalries (before a race interview, as they stood going into the weekend)
  const rri = kind === 'race' ? ri : ri - 1;
  if (ri >= 0 && kind !== 'preseason') {
    const R = rivalries(c); const rv = rivalsAt(c, s, rri);
    const me = (id, k) => k === 'team' ? teamRoot(s.playerTeamId) === id : ours.includes(id);
    const nmK = (k, id) => k === 'team' ? (s.teams.find(t => teamRoot(t.id) === id) || {}).name : dName(s, id);
    const both = (x) => x.kind === 'driver' && me(x.a, 'driver') && me(x.b, 'driver');
    // who "you" are in a rivalry: yourself, or for a team principal the team or its driver
    const side = (x) => !tp ? 'you' : x.kind === 'team' ? 'the team' : L(me(x.a, x.kind) ? x.a : x.b);
    const starts = kind === 'race' ? R.events.filter(e => e.type === 'start' && e.si === s.index && e.ri === ri && (me(e.a, e.kind) || me(e.b, e.kind))) : [];
    for (const e of starts) {
      const other = me(e.a, e.kind) ? e.b : e.a;
      add('rivalry-start', 9, `A title rivalry started this round: ${nmK(e.kind, e.a)} v ${nmK(e.kind, e.b)}, ${plural(e.gap, 'point')} apart.`, both(e)
        ? [`Your two drivers are now fighting each other for the title, ${plural(e.gap, 'point')} apart. Will you let them race?`, `${L(e.a)} and ${L(e.b)} are title rivals now. Is there a number one at this team?`]
        : [`It's ${side(e)} against ${nmK(e.kind, other)} for the title now, ${plural(e.gap, 'point')} apart. Ready for that fight?`, `People are calling it a two-way fight between ${side(e) === 'you' ? 'you' : side(e)} and ${nmK(e.kind, other)}. Fair?`]);
    }
    for (const x of rv.active.filter(x => me(x.a, x.kind) || me(x.b, x.kind))) {
      const other = me(x.a, x.kind) ? x.b : x.a; const leading = me(x.a, x.kind); const who = side(x);
      add('rivalry', 5 + (x.heat || 0) * 4, `Title rivalry: ${nmK(x.kind, x.a)} leads ${nmK(x.kind, x.b)} by ${plural(x.gap, 'point')}.`, both(x)
        ? [`${L(x.a)} leads ${L(x.b)} by ${plural(x.gap, 'point')}. How do you manage two drivers fighting for the title?`, `Do team orders come into it if ${L(x.b)} falls further behind ${L(x.a)}?`]
        : who === 'you' ? [leading ? `${plural(x.gap, 'point')} ahead of ${nmK(x.kind, other)}. Can they catch you?` : `${plural(x.gap, 'point')} behind ${nmK(x.kind, other)}. Where do you make that up?`, x.gap <= 10 ? `It could hardly be closer with ${nmK(x.kind, other)}. Feeling the pressure?` : `How do you rate the fight with ${nmK(x.kind, other)} so far?`]
        : [leading ? `${who[0].toUpperCase() + who.slice(1)} ${who === 'the team' ? 'leads' : 'leads'} ${nmK(x.kind, other)} by ${plural(x.gap, 'point')}. Can you hold on?` : `${who[0].toUpperCase() + who.slice(1)} trails ${nmK(x.kind, other)} by ${plural(x.gap, 'point')}. What does the team need to find?`]);
    }
    const arch = tp ? archRivalTeam(c, s, rri) : (() => { const a = archRivalOf(c, s, rri); return a ? { id: a } : null; })();
    if (arch) {
      const name = tp ? arch.name : dName(s, arch.id);
      let line = '', qs = [`${name} is ${tp ? 'your team\'s' : 'your'} archrival now. Does beating them matter more than anything?`];
      if (kind === 'race' && ses.R?.done) {
        const best = (ids) => Math.min(...ids.map(d => at(ses.R, d)).filter(x => x && !x.out).map(x => x.pos), 99);
        const mine = best(ours), theirs = tp ? best(arch.drivers.filter(Boolean)) : best([arch.id]);
        if (mine < 99 && theirs < 99) { line = ` Today: ${mine < theirs ? 'ahead' : 'behind'}, P${mine} to P${theirs}.`; qs = [mine < theirs ? `One up on ${name} today. How good does that feel?` : `${name} came out ahead today. Does that hurt more than the result itself?`]; }
      }
      add('arch', 6, `Archrival: ${name}.${line}`, qs);
    }
    for (const fd of feudsAt(c, s, ri + 1).filter(fd => ours.includes(fd.a) || ours.includes(fd.b))) {
      const other = ours.includes(fd.a) ? fd.b : fd.a;
      add('feud', 6, `Running feud with ${dName(s, other)} (${fd.reason}).`, [`Things are still tense with ${L(other)}. Have you cleared the air?`]);
    }
  }
  // memory: last time out, recent form, a year ago, streaks
  if (kind !== 'preseason') {
    const focus = tp ? ours[0] : PLAYER;
    const prevR = ri - (kind === 'race' ? 1 : 1) >= 0 ? rounds[kind === 'race' ? ri - 1 : ri - 1] : null;
    const prevRes = prevR && at(s.weekends[prevR.id]?.sessions?.R, focus);
    const nowRes = kind === 'race' ? at(ses.R, focus) : null;
    if (prevRes && nowRes && !prevRes.out && !nowRes.out && Math.abs(prevRes.pos - nowRes.pos) >= 5) add('lasttime', 5, `Last race (${prevR.name}) ${dName(s, focus)} finished P${prevRes.pos}.`, [`${tp ? L(focus) + ": " : ""}${nowRes.pos < prevRes.pos ? `P${prevRes.pos} in ${prevR.name}, P${nowRes.pos} today. What changed?` : `P${prevRes.pos} last time in ${prevR.name}, only P${nowRes.pos} today. Why the drop?`}`]);
    const lastN = rounds.slice(Math.max(0, ri - 3 + (kind === 'race' ? 1 : 0)), ri + (kind === 'race' ? 1 : 0)).map(x => at(s.weekends[x.id]?.sessions?.R, focus)).filter(x => x && !x.out).map(x => x.pos);
    const all = rounds.slice(0, ri + (kind === 'race' ? 1 : 0)).map(x => at(s.weekends[x.id]?.sessions?.R, focus)).filter(x => x && !x.out).map(x => x.pos);
    if (lastN.length >= 3 && all.length >= 6) { const a = avg(lastN), b = avg(all); if (b - a >= 2.5) add('form', 5, `Form: an average of P${a.toFixed(1)} over the last ${lastN.length} races against P${b.toFixed(1)} for the season.`, [`Your last ${lastN.length} races have been your best of the year. What clicked?`]); else if (a - b >= 2.5) add('form', 5, `Form: an average of P${a.toFixed(1)} over the last ${lastN.length} races, down on P${b.toFixed(1)} for the season.`, [`The results have dipped over the last few races. What's going on?`]); }
    // this race a year ago
    if (r) {
      const py = c.seasons[s.index - 1]; const pr = py && activeRounds(py).find(x => trackOf(x) === trackOf(r));
      const px = pr && at(py.weekends[pr.id]?.sessions?.R, focus);
      if (px) add('yearago', 4 + (px.pos === 1 ? 3 : 0), `A year ago here, ${dName(s, focus)} finished ${px.out ? px.st : 'P' + px.pos}.`, tp ? [px.pos === 1 ? `${L(focus)} won here last year. Can the team repeat it?` : `${L(focus)} was ${px.out ? "out of the race" : "P" + px.pos} here a year ago. How much further on is the team now?`] : [px.pos === 1 ? `You won here last year. Does coming back feel different?` : px.out ? `Last year here ended in a ${px.st}. Any demons to put to rest?` : `P${px.pos} here a year ago. How much further on are you now?`]);
    }
    const mq = !tp ? memoryQuestion(c, s, ri, kind) : null;
    if (mq) add('memory', 6, '', [mq]);
  }
  // the season: where it stands, goals, the teammate
  if (kind !== 'preseason') {
    const st = seasonStats(s, kind === 'race' || kind === 'quali' ? ri + 1 : Infinity);
    if (tp) {
      const cs = constructorStandings(s, st); const pos = cs.find(x => x.team.id === s.playerTeamId)?.pos;
      add('wcc', 3, `${team?.name} are P${pos} in the constructors' championship.`, [`P${pos} in the constructors' championship. Where should this team be by the end of the year?`]);
    } else {
      const ds = driverStandings(s, st); const me = ds.find(x => x.id === PLAYER);
      if (me) add('wdc', 3, `Championship: P${me.pos} on ${me.pts} points.`, [`You're P${me.pos} in the championship on ${me.pts} points. Where you expected to be?`]);
      if (mate) { const h = h2hCompare([s], PLAYER, mate); add('h2h', 3 + (h.r[1] > h.r[0] ? 2 : 0), `Teammate battle with ${dName(s, mate)}: races ${h.r[0]}-${h.r[1]}, qualifying ${h.q[0]}-${h.q[1]}.`, [`It's ${h.r[0]}-${h.r[1]} in races against ${L(mate)}. Who has the upper hand?`]); }
    }
    const goals = s.goals.filter(g => !g.driver || ours.includes(g.driver));
    const off = goals.filter(g => !evalGoal(g, s).ok);
    if (goals.length) add('goals', kind === 'midseason' || kind === 'endseason' ? 6 : 2, `Season goals: ${goals.map(g => `${goalTitle(g)} (${evalGoal(g, s).ok ? 'on target' : 'not yet'})`).join('; ')}.`, [off.length ? `One of the goals was “${goalTitle(off[0])}”. Is that still realistic?` : `Every target is on track. Time to aim higher?`]);
  }
  if (kind === 'preseason') {
    const prev = c.seasons[s.index - 1];
    const was = prev && !isHist(prev) ? prev.teams.find(t => t.drivers.includes(PLAYER))?.id : null;
    if (!tp && was && was !== s.playerTeamId) add('newteam', 8, `New team this year: ${team?.name}.`, [`Welcome to ${team?.name}. Why this move, and why now?`]);
    if (!tp && mate) add('newmate', 4, `Teammate: ${dName(s, mate)}.`, [`How do you expect to measure up against ${L(mate)}?`]);
    if (tp) add('lineup', 6, `Line-up: ${listJoin(ours.map(d => dName(s, d)))}.`, [`Talk us through your line-up of ${listJoin(ours.map(L))}. Why these two?`]);
    if (prev && !isHist(prev)) { const pd = driverStandings(prev).find(x => x.id === (tp ? ours[0] : PLAYER)); const pc = constructorStandings(prev).find(x => x.team.id === s.playerTeamId); if (tp ? pc : pd) add('lastyear', 5, tp ? `Last year: P${pc.pos} in the constructors' championship.` : `Last year: P${pd.pos} in the drivers' championship.`, [tp ? `P${pc.pos} last year. What is the target this time?` : `P${pd.pos} last season. What does progress look like this year?`]); }
    const arch = tp ? archRivalTeam(c, s, -1) : archRivalOf(c, s, -1);
    if (arch) add('arch', 5, `Archrival: ${tp ? arch.name : dName(s, arch)}.`, [`Round two with ${tp ? arch.name : dName(s, arch)}. Have you thought about them over the winter?`]);
    const mq = !tp ? memoryQuestion(c, s, 0, kind) : null; if (mq) add('memory', 5, '', [mq]);
    add('goals', 4, `Season goals: ${s.goals.map(g => goalTitle(g)).join('; ') || 'none set'}.`, [s.goals.length ? `The goal this year: “${goalTitle(s.goals[0])}”. Realistic?` : `What does success look like this year?`]);
  }
  if (kind === 'endseason' || kind === 'midseason') {
    const focus = tp ? ours[0] : PLAYER; const st = seasonStats(s)[focus];
    if (st) add('summary', 6, `Season so far for ${dName(s, focus)}: ${plural(st.wins, 'win')}, ${plural(st.podiums, 'podium')}, ${plural(st.pts, 'point')}.`, [kind === 'endseason' ? `The season is done. Your verdict?` : `Halfway report: what grade do you give ${tp ? 'the team' : 'yourself'}?`, `What was the best weekend of the year, and why?`]);
  }
  return A;
}
/** The questions for an interview: the strongest angles, one question each, with a little variety. */
function angleQuestions(A, n) {
  const seen = new Set(); const out = [];
  const ranked = A.map(a => ({ ...a, r: a.w * (0.7 + Math.random() * 0.6) })).sort((p, q) => q.r - p.r);
  for (const a of ranked) { const fam = a.key.split('-')[0]; if (seen.has(fam)) continue; seen.add(fam); out.push(qPick(a.qs)); if (out.length >= n) break; }
  return out;
}
/** Memory for interviews: streaks, last time out, the defending champion and ratings, as plain facts. */
function memoryFacts(c, s, ri, kind) {
  const after = kind === 'race' ? ri + 1 : ri; // a post-race interview already counts today's result
  const mem = raceMemory(c, s, Math.max(0, after));
  const out = [];
  if (mem.defending) out.push(`Defending world champion: ${dName(s, mem.defending) || mem.defending}${mem.defending === PLAYER ? ' (the player)' : ''}.`);
  if (mem.lastRound && kind !== 'race') out.push(`Last round (${mem.lastRound.name}): won by ${dName(s, mem.lastWinner)}${mem.lastPole ? `, pole ${dName(s, mem.lastPole)}` : ''}${mem.lastDotd ? `, Driver of the Day ${dName(s, mem.lastDotd)}` : ''}.`);
  const run = mem.run(PLAYER);
  const mine = [['wins', 'consecutive wins'], ['podiums', 'consecutive podiums'], ['poles', 'consecutive poles'], ['points', 'consecutive points finishes'], ['dotd', 'consecutive Driver of the Day awards']].filter(([k]) => run[k] >= 2).map(([k, l]) => `${run[k]} ${l}`);
  if (mine.length) out.push(`Player's current streaks: ${mine.join(', ')}.`);
  const others = gridIds(s).filter(d => d !== PLAYER && mem.run(d).wins >= 2).map(d => `${dName(s, d)} (${mem.run(d).wins} wins in a row)`);
  if (others.length) out.push(`Other drivers on a winning run: ${others.join(', ')}.`);
  if (kind === 'race' && ri >= 0) {
    const R = raceRatings(s, ri), dd = driverOfTheDay(s, ri);
    if (R?.[PLAYER]) out.push(`Pitwall rating for the player this race: ${R[PLAYER].rating.toFixed(1)}/10${R[PLAYER].pub.length ? ` (${R[PLAYER].pub.join('; ')})` : ''}.`);
    if (dd) out.push(`Driver of the Day: ${dName(s, dd.id)} (${dd.rating.toFixed(1)}/10)${dd.id === PLAYER ? ', the player' : ''}.`);
  }
  const SR = seasonRatings(s).by[PLAYER];
  if (SR?.list.length) out.push(`Player's season rating so far: ${SR.avg.toFixed(1)}/10 average${SR.dotd ? `, ${SR.dotd} Driver of the Day award${SR.dotd > 1 ? 's' : ''}` : ''}.`);
  return out;
}
/** One interview question drawn from memory, when there is something worth remembering. */
function memoryQuestion(c, s, ri, kind) {
  const after = kind === 'race' ? ri + 1 : ri;
  const mem = raceMemory(c, s, Math.max(0, after));
  const run = mem.run(PLAYER);
  const before = raceMemory(c, s, Math.max(0, ri));
  const ses = s.weekends[activeRounds(s)[ri]?.id]?.sessions || {};
  const myR = ses.R?.done ? ses.R.results.findIndex(x => x.d === PLAYER) : -1;
  const dd = kind === 'race' && ri >= 0 ? driverOfTheDay(s, ri) : null;
  const opts = [];
  if (kind === 'race' && run.wins >= 2) opts.push(`That's ${streakWord(run.wins)} wins in a row. How do you keep this run going?`);
  if (kind === 'race' && before.run(PLAYER).wins >= 2 && myR > 0) opts.push(`Your run of ${streakWord(before.run(PLAYER).wins)} straight wins ends today. How do you take that?`);
  if (kind === 'race' && before.lastWinner === PLAYER && myR > 0) opts.push(`You won last time out. P${myR + 1} today: what changed?`);
  if (kind === 'race' && dd?.id === PLAYER) opts.push(`You've been voted Driver of the Day. Was that your best drive of the season?`);
  if (kind === 'race' && dd && dd.id !== PLAYER) opts.push(`${dName(s, dd.id)} was Driver of the Day. Did you see that drive?`);
  if (kind === 'race' && run.podiums >= 3) opts.push(`${streakWord(run.podiums)} podiums in a row now. What is behind the consistency?`);
  if (kind === 'quali' && run.poles >= 1) opts.push(`Another pole after last time out. What makes you so strong over one lap at the moment?`);
  if (kind !== 'preseason' && mem.defending === PLAYER) opts.push(`As defending champion, does it feel like everyone is chasing you?`);
  if (kind === 'preseason' && mem.defending && mem.defending !== PLAYER) opts.push(`${dName(s, mem.defending) || mem.defending} starts the year as defending champion. Who is the favourite?`);
  if (kind !== 'race' && before.lastWinner && before.lastWinner !== PLAYER) opts.push(`${dName(s, before.lastWinner)} won last time out. Can you turn the tables this weekend?`);
  const others = gridIds(s).find(d => d !== PLAYER && mem.run(d).wins >= 3);
  if (others) opts.push(`${dName(s, others)} has won ${streakWord(mem.run(others).wins)} in a row. How do you stop that?`);
  return opts.length ? opts[Math.floor(Math.random() * opts.length)] : null;
}

const MEDIA_SYSTEM = `You are the media engine for a Formula 1 video-game career companion app (the player is a fictional driver racing in EA's F1 25 career mode). You play the paddock press: realistic F1 journalists from fictional outlets with fictional reporter names. Be specific to the data provided: reference actual positions, gaps, teammates, rivals, standings and goals. Match the driver type and personality to what reporters expect and probe. Never invent quotes or private statements from real-world people; you may describe real drivers' on-track results as given. Write in British English. Respond with JSON only, no markdown fences.`;

function extractJson(text) {
  const t = text.replace(/```(?:json)?/g, '').trim();
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b < 0) throw new Error('No JSON in reply');
  return JSON.parse(t.slice(a, b + 1));
}

async function aiCall(prompt, maxTokens) {
  if (!window.api) return { ok: false, error: 'no_key' };
  return await window.api.ai({ system: MEDIA_SYSTEM, prompt, maxTokens });
}

const KIND_BRIEF = {
  preseason: 'a pre-season media day before the first race',
  quali: 'the post-qualifying press conference',
  race: 'the post-race press conference',
  midseason: 'a sit-down mid-season interview',
  endseason: 'an end-of-season interview reviewing the year',
};

async function generateQuestions(c, seasonIdx, roundId, kind) {
  const ctx = mediaContext(c, seasonIdx, roundId, kind);
  const res = await aiCall(`CONTEXT\n${ctx}\n\nTASK\nWrite 4 questions for ${KIND_BRIEF[kind]}.${isPrincipal(c) ? ' The interviewee is the team principal, not a driver: ask about the team, its two drivers, strategy, the car and the business, never about their own driving.' : ''} Build each question on a different item from ANGLES, strongest first (places made up or lost, beating or trailing the car's real pace, incidents and who was to blame, rivalries starting or heating up, the archrival, last race, a year ago, form and streaks). Use 3 or 4 different outlets and reporters. Mix tones: one warm, one analytical about the data, at least one pointed or awkward. Keep each question to 1–3 sentences.\n\nReturn {"questions":[{"outlet":"","reporter":"","question":""}]}`, 1200);
  if (res.ok) {
    try {
      const j = extractJson(res.text);
      if (Array.isArray(j.questions) && j.questions.length) return { questions: j.questions.slice(0, 5).map(q => ({ outlet: q.outlet || 'Paddock Pass', reporter: q.reporter || 'Reporter', question: q.question, answer: '' })), ai: true };
    } catch (e) { console.warn(e); }
    toast('AI reply could not be read, using built-in questions');
  } else if (res.error !== 'no_key') {
    toast('AI unavailable: ' + res.error);
  }
  return { questions: templateQuestions(c, seasonIdx, roundId, kind), ai: false };
}

async function generateArticle(c, m) {
  const ctx = mediaContext(c, m.seasonIdx, m.roundId, m.kind);
  const qa = m.questions.map((q, i) => `Q${i + 1} (${q.reporter}, ${q.outlet}): ${q.question}\nA: ${q.answer || '[declined to answer]'}`).join('\n\n');
  const res = await aiCall(`CONTEXT\n${ctx}\n\nTRANSCRIPT of ${KIND_BRIEF[m.kind]}\n${qa}\n\nTASK\nWrite the story one outlet runs from this interview. Quote the driver's actual answers where useful (you may lightly tidy grammar). Judge how the answers land given the driver's personality and results: humble or gracious answers after a bad day earn respect; arrogance after a poor result or digs at the team cost goodwill; bland answers are neutral. Add 2–3 short paddock reactions from fictional or role-based sources (e.g. "Team Principal", "Former champion turned pundit", "Fan forum") — never named real people.\n\nReturn {"outlet":"","headline":"","summary":"one sentence","body":["paragraph","paragraph","paragraph"],"reactions":[{"who":"","text":""}],"reputation":<integer -2..2>}`, 1600);
  if (res.ok) {
    try {
      const j = extractJson(res.text);
      return { article: { outlet: j.outlet || m.questions[0]?.outlet, headline: j.headline, summary: j.summary, body: Array.isArray(j.body) ? j.body : [String(j.body || '')] }, reactions: Array.isArray(j.reactions) ? j.reactions.slice(0, 4) : [], rep: Math.max(-2, Math.min(2, Math.round(+j.reputation || 0))) };
    } catch (e) { console.warn(e); }
    toast('AI reply could not be read, using a template article');
  } else if (res.error !== 'no_key') {
    toast('AI unavailable: ' + res.error);
  }
  return templateArticle(c, m);
}

/* Offline fallback, built from the same data */
function pick(arr, n) { const a = [...arr]; const out = []; while (a.length && out.length < n) out.push(a.splice(Math.floor(Math.random() * a.length), 1)[0]); return out; }
function templateQuestions(c, seasonIdx, roundId, kind) {
  const s = c.seasons[seasonIdx]; const tp = isPrincipal(c);
  const team = s.teams.find(t => t.id === s.playerTeamId)?.name;
  // fillers for when the data has little to say
  const filler = {
    preseason: [`What does success look like for ${team} in ${s.year}?`, tp ? 'Where has the team improved most over the winter?' : 'What has the team told you about the car’s strengths and weaknesses?'],
    quali: ['Talk us through the final runs. Was there anything left out there?', 'What is the plan for the start tomorrow?', 'How confident are you in the long-run pace?'],
    race: ['How did the strategy play out?', 'Which moment of the race will you remember most?'],
    midseason: [tp ? 'What does the car need for the second half?' : 'What does the team need to bring in upgrades for the second half?'],
    endseason: ['If you could rerun one weekend, which would it be?', 'What changes for next season?'],
  }[kind];
  const qs = angleQuestions(mediaAngles(c, seasonIdx, roundId, kind), 4);
  for (const q of pick(filler, filler.length)) { if (qs.length >= 4) break; qs.push(q); }
  const outlets = pick(D.OUTLETS, 4);
  const names = pick(['Maria Kowalski', 'James Holloway', 'Sofia Brandt', 'Tom Achterberg', 'Priya Nair', 'Luca Ferrante', 'Hannah Clarke', 'Diego Ortega'], 4);
  return qs.map((q, i) => ({ outlet: outlets[i], reporter: names[i], question: q, answer: '' }));
}
function templateArticle(c, m) {
  const s = c.seasons[m.seasonIdx];
  const name = `${c.profile.first} ${c.profile.last}`.trim();
  const answered = m.questions.filter(q => q.answer && q.answer.trim() && !/^no comment/i.test(q.answer.trim()));
  const best = answered.sort((a, b) => b.answer.length - a.answer.length)[0];
  const r = s.calendar.find(x => x.id === m.roundId);
  const head = best ? `${c.profile.last}: “${best.answer.split(/[.!?]/)[0].slice(0, 80)}”` : `${c.profile.last} keeps cards close to chest${r ? ' in ' + r.name : ''}`;
  const body = [
    `${name} spoke to the media ${r ? 'after the ' + r.name + ' Grand Prix weekend' : 'during ' + s.year} and ${answered.length >= 3 ? 'was in a talkative mood' : answered.length ? 'gave a few measured answers' : 'had little to say'}.`,
    ...answered.slice(0, 2).map(q => `Asked “${q.question}”, the ${s.teams.find(t => t.id === s.playerTeamId)?.name} driver replied: “${q.answer.trim()}”`),
  ];
  return { article: { outlet: m.questions[0]?.outlet || 'Paddock Pass', headline: head, summary: body[0], body }, reactions: [], rep: answered.length ? 0 : -1 };
}

/* ---------------------------------------------------------------- actions */
const actions = {
  'conflict-pick'(el) { ui.conflicts[+el.dataset.i].pick = el.dataset.v; conflictModal(ui.conflicts); },
  'conflict-all'(el) { ui.conflicts.forEach(x => { x.pick = el.dataset.v; }); conflictModal(ui.conflicts); },
  'conflict-done'() {
    // the merge used this device's version; swap in the other side's where that was picked
    for (const x of ui.conflicts || []) if (x.pick === 'remote') setAt(state, x.path, x.remote === undefined ? undefined : JSON.parse(JSON.stringify(x.remote)));
    ui.conflicts = null; closeModal(); store.save(); render(); toast('Both devices are in sync');
  },
  'nav-toggle'() { setNavOpen(!document.body.classList.contains('nav-open')); },
  'nav-close'() { setNavOpen(false); },
  async 'companion-enable'(el) { companion = await window.api.companion.enable(el.dataset.on === '1'); render(); },
  async 'companion-pin'() { companion = await window.api.companion.newPin(); render(); },
  'companion-forget'(el) {
    const one = el.dataset.id;
    confirmBox(one ? 'Disconnect device' : 'Disconnect all devices', one ? 'This device will need a new PIN to connect again.' : 'Every paired phone and tablet will need a new PIN to connect again.', 'Disconnect', async () => { companion = await window.api.companion.forget(one || null); render(); });
  },
  'companion-switch'() { window.api.changeComputer(); },
  'companion-unpair'() { confirmBox('Disconnect this device', 'Stop syncing with your computer? You can connect again with a new PIN.', 'Disconnect', () => window.api.unpair()); },
  nav(el) { setNavOpen(false); ui.view = el.dataset.view; ui.tap = null; if (ui.view !== 'weekend') ui.seasonIdx = ui.view === 'dashboard' ? null : ui.seasonIdx; render(); },
  'new-career'() { ui.setup = defaultSetup(); ui.view = 'setup'; render(); },
  'cancel-setup'() { ui.view = 'dashboard'; render(); },
  'setup-pick'(el) { ui.setup[el.dataset.k] = el.dataset.v; render(); },
  'setup-seat'(el) { ui.setup.teamId = el.dataset.team; ui.setup.seat = el.dataset.seat; render(); },
  'setup-year'(el) { setupYear(+el.dataset.v); },
  'fg-fill'(el) { setupFill(ui.setup, +el.dataset.i, +el.dataset.j); render(); },
  'fg-fill-all'() { const u = ui.setup; u.futureGrid.forEach((t, ti) => t.drivers.forEach((d, si) => { if (retiredBy(u, d)) setupFill(u, ti, si); })); render(); toast('Retired drivers replaced'); },
  'fc-move'(el) { const L = ui.setup.futureCal; const i = +el.dataset.i, j = i + (+el.dataset.dir); if (j < 0 || j >= L.length) return; [L[i], L[j]] = [L[j], L[i]]; render(); },
  'fc-remove'(el) { ui.setup.futureCal.splice(+el.dataset.i, 1); render(); },
  'nd-add'(el) {
    const { scope, key } = el.dataset; const drafts = ndDrafts(scope); const nd = drafts[key] || {};
    const name = (nd.name || '').trim(); if (!name) { toast('Enter the new driver’s name'); return; }
    const d = { id: 'C' + uid().slice(0, 6), name, abbr: ((nd.abbr || '').trim() || name.split(' ').slice(-1)[0].slice(0, 3)).toUpperCase(), number: +nd.number || 0, born: nd.born || null, photo: nd.photo || null, custom: true };
    delete drafts[key];
    if (scope === 'setup') {
      ui.setup.newDrivers.push(d);
      if (/^g/.test(key)) { const [ti, si] = key.slice(1).split('-').map(Number); ui.setup.futureGrid[ti].drivers[si] = d.id; } else ui.setup.team.seats[+key] = d.id;
      render();
    }
    else if (scope === 'pool') { (career().customDrivers ||= []).push(d); closeModal(); store.save(); render(); toast(`${d.name} added to the driver pool`); }
    else { (ui.modal.newDrivers ||= []).push(d); ui.modal.steps[+key].driver = d.id; drawTransferModal(); }
  },
  'autofill-laps'() {
    const s = curSeason(); const sd = sessionData(s, ui.round, ui.session, true);
    const r = autofillLaps(s, sd, ui.session, ui.round);
    if (r.error) { toast(r.error); return; }
    if (!r.n) { toast(r.skipped ? 'Only rows above your fastest lap are empty: enter the top time first' : 'Every lap time is already filled'); return; }
    sd.done = true; store.save(); render();
    toast(`Filled ${plural(r.n, 'lap time')}${r.skipped ? ` · ${r.skipped} above your fastest lap left empty` : ''}`);
  },
  'tr-new'(el) { transferModal({ driver: el.dataset.driver || null }); },
  'tr-rumour'(el) {
    const rm = (career().rumours || []).find(x => x.id === el.dataset.id); if (!rm) return;
    transferModal({ driver: rm.driver, action: rm.kind === 'retire' ? 'retire' : rm.kind === 'stay' ? 'extend' : 'move', to: rm.team, effective: rm.timing === 'now' ? 'now' : 'next', rumourId: rm.id });
  },
  'tr-confirm'() { confirmTransfer(); },
  'tr-undo'() { confirmBox('Undo transfer', 'Put the drivers back where they were before the latest transfer? Its story is removed too.', 'Undo', undoTransfer); },
  'nd-cancel'(el) { const { scope, key } = el.dataset; delete ndDrafts(scope)[key]; scope === 'setup' ? render() : scope === 'pool' ? closeModal() : drawTransferModal(); },
  'pool-add'() { ui.modal = { kind: 'pool', nd: { 0: {} } }; modal(`<div class="modal-h"><h2>Add a driver to the pool</h2><button class="icon-btn" data-act="modal-close">${ICON.x}</button></div><div class="modal-b">${newDriverForm('pool', 0, ui.modal.nd[0])}<p class="muted" style="font-size:12px">They wait in the pool until a team signs them in Transfers.</p></div>`); },
  'create-career'() {
    const u = ui.setup;
    const principal = u.type === 'myteam' && u.role === 'principal';
    if (!u.first.trim() || !u.last.trim()) { toast(principal ? 'Enter your first and last name' : 'Enter your driver’s first and last name'); return; }
    if (u.type === 'myteam' && !u.team.name.trim()) { toast('Give your team a name'); return; }
    if (principal && (!u.team.seats[0] || !u.team.seats[1] || u.team.seats[0] === u.team.seats[1])) { toast('Sign two different drivers'); return; }
    const old = u.year > 2026 ? u.futureGrid.flatMap(t => t.drivers).filter(d => retiredBy(u, d)) : [];
    if (old.length) { toast(`${listJoin(old.map(anyName))} will have retired by ${u.year}. Auto-fill or pick someone else.`); return; }
    const abbr = (u.abbr || u.last.slice(0, 3)).toUpperCase();
    const c = {
      id: uid(), createdAt: new Date().toISOString(), type: u.type,
      profile: { first: u.first.trim(), last: u.last.trim(), abbr, number: +u.number || 27, nationality: u.nationality.trim(), archetype: u.archetype, personality: u.personality, bio: u.bio.trim(), rival: '', rivalTeam: null, photo: u.photo || null, born: u.born || null },
      customDrivers: u.newDrivers.filter(d => !d.generated && ((principal && u.team.seats.includes(d.id)) || (u.year > 2026 && u.futureGrid.some(t => t.drivers.includes(d.id))))), media: [], seasons: [], rumours: [],
      generated: Object.fromEntries(u.newDrivers.filter(d => d.generated && u.year > 2026 && u.futureGrid.some(t => t.drivers.includes(d.id))).map(d => [d.id, d])),
      startYear: u.year,
      // the 2025 11th team: asked now for a 2025 start, when 2025 comes for an earlier one, never after
      extraTeam2025: u.year === 2025 ? (u.type === 'myteam' ? null : u.extra || null) : u.year > 2025 ? null : undefined,
    };
    if (u.type === 'myteam') {
      const { seats, ...t } = u.team;
      c.myTeam = { ...t, name: t.name.trim(), short: (t.short || t.name.trim().slice(0, 3)).toUpperCase(), base: t.base.trim(), principal: `${c.profile.first} ${c.profile.last}`, founded: u.year, budget: 30, ledger: [], sponsors: [], upgrades: [], ratings: {},
        role: principal ? 'principal' : 'owner', ...(principal ? { seats: [...seats], lead: seats[0] } : {}) };
    }
    // a principal's driver goals start with the lead driver
    if (principal) for (const g of u.goals) if (goalScope(g) === 'driver' && !g.driver) g.driver = u.team.seats[0];
    // every real season before yours, then (for a start after 2026) the simulated years up to it
    for (let y = HIST_FROM; y < Math.min(u.year, HIST_TO + 1); y++) c.seasons.push(histSeason(y, c.seasons.length));
    if (u.year > 2026) {
      c.startGrid = u.futureGrid.map(t => ({ id: t.id, name: t.name.trim() || t.id, color: t.color, drivers: [...t.drivers] }));
      c.startCal = u.futureCal.map(r => [r.id, r.name, r.venue, !!r.sprint, r.track || null]);
      if (u.year - 1 > HIST_TO) simulateGap(c, u.year, c.startGrid, u.futureCal);
    }
    c.seasons.push(newSeason(c, c.seasons.length, u.type === 'myteam' ? { teamId: MYTEAM, seatDriverId: null, goals: u.goals, practice: u.practice } : { teamId: u.teamId, seatDriverId: u.seat, goals: u.goals, practice: u.practice }));
    realTransfers(c);
    state.careers.push(c); state.activeCareerId = c.id; syncNumbers(c);
    ui.setup = null; ui.view = 'dashboard'; ui.seasonIdx = null;
    const first = activeRounds(latestSeason())[0];
    store.save(); render(); toast(`Career created. Good luck in ${first?.venue || 'the first race'}.`);
    if (!c.profile.photo && !isPrincipal(c)) photoModal(PLAYER_ID);
  },
  'pick-season'(el) { ui.seasonIdx = +el.dataset.idx; render(); },
  'open-round'(el) { if (!el.dataset.round) return; ui.round = el.dataset.round; ui.session = null; ui.tap = null; if (ui.view !== 'weekend' && ui.view !== 'calendar') ui.seasonIdx = null; ui.view = 'weekend'; render(); },
  'pick-session'(el) { ui.session = el.dataset.key; ui.tap = null; render(); },
  move(el) {
    const s = curSeason(); const sd = sessionData(s, ui.round, ui.session, true);
    const i = +el.dataset.i, j = i + (+el.dataset.dir);
    if (j < 0 || j >= sd.results.length) return;
    [sd.results[i], sd.results[j]] = [sd.results[j], sd.results[i]];
    sd.done = true; store.save(); render();
  },
  'tap-start'() { ui.tap = { key: ui.session, order: [] }; render(); },
  'tap-pick'(el) { ui.tap.order.push(el.dataset.d); render(); },
  'tap-undo'() { ui.tap.order.pop(); render(); },
  'tap-cancel'() { ui.tap = null; render(); },
  'tap-apply'() {
    const s = curSeason(); const sd = sessionData(s, ui.round, ui.session, true);
    const byId = Object.fromEntries(sd.results.map(r => [r.d, r]));
    const rest = sd.results.filter(r => !ui.tap.order.includes(r.d));
    sd.results = [...ui.tap.order.map(d => byId[d]), ...rest];
    sd.done = true; ui.tap = null; store.save(); render(); toast('Order applied');
  },
  'clear-session'() {
    const s = curSeason(); const sd = sessionData(s, ui.round, ui.session, true);
    sd.results.forEach(r => { r.lap = ''; r.gap = ''; r.st = 'FIN'; }); sd.fl = null; store.save(); render();
  },
  'standings-tab'(el) { ui.standingsTab = el.dataset.tab; render(); },
  'open-driver'(el) { ui.driverId = el.dataset.id; ui.view = 'driver'; render(); },
  'drv-sort'(el) { ui.drv.sort = el.dataset.k; render(); },
  'drv-scope'(el) { ui.drv.scope = el.dataset.v; render(); },
  'driver-h2h'(el) { const id = el.dataset.id; ui.h2h = { scope: 'all', a: PLAYER, b: id === PLAYER ? null : id }; ui.view = 'h2h'; render(); },
  'open-track'(el) { ui.trackId = el.dataset.track; ui.trackAll = false; ui.view = 'track'; render(); },
  'track-all'() { ui.trackAll = !ui.trackAll; render(); },
  'hof-view'(el) { ui.hof.view = el.dataset.v; render(); },
  'hof-sort'(el) { ui.hof.sort = el.dataset.v; render(); },
  'new-career-myteam'() { ui.setup = { ...defaultSetup(), type: 'myteam' }; ui.view = 'setup'; render(); },
  'mt-tab'(el) { ui.mt = el.dataset.tab; render(); },
  'mt-logo-clear'(el) { mtTarget(el).logo = null; mtCommit(el); },
  async 'mt-logo-colors'(el) {
    const t = mtTarget(el); const cols = await logoColors(t.logo);
    if (!cols) { toast('Could not find colours in that logo'); return; }
    [t.color, t.color2] = cols; mtCommit(el); toast('Team colours taken from the logo');
  },
  'mt-add-upgrade'() {
    const c = career(); const m = c.myTeam; const s = latestSeason();
    const part = $('#up-part').value.trim(); if (!part) { toast('Name the part you upgraded'); return; }
    const cost = Math.max(0, +$('#up-cost').value || 0);
    const u = { id: uid(), seasonIdx: s.index, roundId: $('#up-round').value, dept: $('#up-dept').value, part, notes: $('#up-notes').value.trim(), cost };
    m.upgrades.push(u);
    if (cost && $('#up-ledger').checked) m.ledger.push({ id: uid(), seasonIdx: s.index, roundId: u.roundId, cat: 'R&D', amount: -cost, note: `Upgrade: ${part}` });
    store.save(); render(); toast('Upgrade logged');
  },
  'mt-add-ledger'() {
    const c = career(); const s = latestSeason();
    const amt = Math.abs(+$('#lg-amt').value || 0); if (!amt) { toast('Enter an amount'); return; }
    c.myTeam.ledger.push({ id: uid(), seasonIdx: s.index, roundId: $('#lg-round').value, cat: $('#lg-cat').value, amount: $('#lg-type').value === 'out' ? -amt : amt, note: $('#lg-note').value.trim() });
    store.save(); render();
  },
  'mt-add-sponsor'() {
    const c = career(); const s = latestSeason();
    const name = $('#sp-name').value.trim(); if (!name) { toast('Enter the sponsor name'); return; }
    c.myTeam.sponsors.push({ id: uid(), seasonIdx: s.index, name, tier: $('#sp-tier').value, value: Math.max(0, +$('#sp-value').value || 0), goal: $('#sp-goal').value.trim(), status: 'Active' });
    store.save(); render(); toast(`${name} signed`);
  },
  'mt-sponsor-pay'(el) {
    const c = career(); const s = latestSeason(); const sp = c.myTeam.sponsors.find(x => x.id === el.dataset.id);
    if (!sp.value) { toast('Set a value for this sponsor first'); return; }
    c.myTeam.ledger.push({ id: uid(), seasonIdx: s.index, roundId: nextRound(s)?.id || '', cat: 'Sponsorship', amount: +sp.value, note: `${sp.name} (${sp.tier.toLowerCase()} sponsor)` });
    store.save(); render(); toast(`${fmtM(+sp.value)} from ${sp.name} added to finances`);
  },
  'mt-del'(el) { const m = career().myTeam; m[el.dataset.list] = m[el.dataset.list].filter(x => x.id !== el.dataset.id); store.save(); render(); },
  'set-theme'(el) { state.prefs = { ...(state.prefs || {}), theme: el.dataset.v }; store.save(); render(); },
  'edit-goals'() { goalsModal(); },
  'goal-add'(el) {
    const list = el.dataset.scope === 'setup' ? ui.setup.goals : ui.modal.goals;
    const kind = el.dataset.kind || 'driver'; const ctx = goalCtx(el.dataset.scope);
    list.push(kind === 'team' ? { id: uid(), scope: 'team', type: 'constructor_pos', target: 5 } : { id: uid(), scope: 'driver', type: 'podiums', target: 1, driver: ctx.drivers?.[0]?.[0] || null });
    el.dataset.scope === 'setup' ? render() : redrawModal();
  },
  'goal-remove'(el) {
    const list = el.dataset.scope === 'setup' ? ui.setup.goals : ui.modal.goals;
    const i = list.findIndex(g => g.id === el.dataset.id); if (i >= 0) list.splice(i, 1);
    el.dataset.scope === 'setup' ? render() : redrawModal();
  },
  'goals-save'() { const s = curSeason(); s.goals = ui.modal.goals; closeModal(); store.save(); render(); },
  'modal-close'() { closeModal(); },
  'modal-bg'(el, e) { if (e.target === el) closeModal(); },
  'confirm-ok'() { const f = ui.confirmFn; closeModal(); f && f(); },
  'next-season'() { nextSeasonModal(); },
  'next-seat'(el) { ui.modal.teamId = el.dataset.team; ui.modal.seat = el.dataset.seat || null; ui.modal.seatIdx = +el.dataset.i; drawNextSeasonModal(); },
  'next-extra'(el) { const c = career(); const m = ui.modal; m.extra = el.dataset.v; c.extraTeam2025 = el.dataset.v || null; const keep = { goals: m.goals, extra: m.extra }; nextSeasonModal(); Object.assign(ui.modal, keep); drawNextSeasonModal(); },
  'next-confirm'() {
    const c = career(); const m = ui.modal;
    if (latestSeason().year + 1 === 2025 && c.extraTeam2025 === undefined) c.extraTeam2025 = null; // asked: neither
    const s = newSeason(c, m.index, { teamId: m.teamId, seatDriverId: m.seat, goals: m.goals });
    c.seasons.push(s); syncNumbers(c);
    closeModal(); ui.seasonIdx = null; ui.view = 'dashboard'; store.save(); render();
    toast(`${s.year} season started with ${s.teams.find(t => t.id === s.playerTeamId).name}`);
  },
  'new-media'(el) { newMediaModal(el.dataset.round || null); },
  'media-kind'(el) { ui.modal.mkind = el.dataset.v; drawMediaModal(); },
  async 'media-start'() {
    const c = career(); const m = ui.modal;
    const needsRound = m.mkind === 'quali' || m.mkind === 'race';
    ui.busy = true; drawMediaModal();
    const { questions } = await generateQuestions(c, m.seasonIdx, needsRound ? m.roundId : null, m.mkind);
    ui.busy = false;
    const entry = { id: uid(), seasonIdx: m.seasonIdx, roundId: needsRound ? m.roundId : null, kind: m.mkind, createdAt: new Date().toISOString(), questions, article: null, reactions: [], rep: 0 };
    c.media.push(entry); ui.mediaOpen = entry.id;
    closeModal(); ui.view = 'media'; store.save(); render();
  },
  'media-quick'(el) {
    const c = career(); const m = c.media.find(x => x.id === el.dataset.id);
    m.questions[+el.dataset.i].answer = el.dataset.t; store.save();
    const ta = document.getElementById(`ans-${m.id}-${el.dataset.i}`); if (ta) ta.value = el.dataset.t;
  },
  async 'media-publish'(el) {
    const c = career(); const m = c.media.find(x => x.id === el.dataset.id);
    ui.busy = true; render();
    const out = await generateArticle(c, m);
    ui.busy = false;
    Object.assign(m, out); ui.mediaOpen = null; store.save(); render(); toast('Article published');
  },
  'media-discard'(el) { const c = career(); c.media = c.media.filter(x => x.id !== el.dataset.id); ui.mediaOpen = null; store.save(); render(); },
  'media-delete'(el) { confirmBox('Delete article', 'Remove this article and its transcript? Its reputation effect is removed too.', 'Delete', () => { const c = career(); c.media = c.media.filter(x => x.id !== el.dataset.id); store.save(); render(); }); },
  async 'save-ai'() {
    const key = $('#set-key').value.trim(); const model = $('#set-model').value.trim();
    if (!window.api) { toast('AI needs the desktop app'); return; }
    await window.api.setSettings({ apiKey: key, model });
    settings = await window.api.getSettings(); render(); toast('AI settings saved');
  },
  async 'clear-key'() { await window.api.setSettings({ clearKey: true }); settings = await window.api.getSettings(); render(); toast('API key removed'); },
  async 'test-ai'(el) {
    if (!window.api) { toast('AI needs the desktop app'); return; }
    el.disabled = true; el.textContent = 'Testing…';
    const r = await window.api.ai({ system: 'Reply with the single word OK.', prompt: 'Ping', maxTokens: 10 });
    el.disabled = false; el.textContent = 'Test connection';
    toast(r.ok ? 'Connected to Claude' : r.error === 'no_key' ? 'Save an API key first' : 'Failed: ' + r.error);
  },
  'save-profile'() {
    const c = career(); const p = c.profile;
    p.first = $('#pf-first').value.trim() || p.first; p.last = $('#pf-last').value.trim() || p.last;
    if ($('#pf-abbr')) { p.abbr = ($('#pf-abbr').value.trim() || p.abbr).toUpperCase(); p.number = +$('#pf-number').value || p.number; p.archetype = $('#pf-arch').value; }
    p.nationality = $('#pf-nat').value.trim(); p.born = $('#pf-born').value || null; p.personality = $('#pf-pers').value; p.bio = $('#pf-bio').value.trim();
    if (!isPrincipal(c)) for (const s of playedSeasons(c)) s.drivers[PLAYER_ID] = playerDriver(c);
    store.save(); render(); toast('Profile saved');
  },
  'add-driver'() {
    const c = career(); const s = latestSeason();
    const name = $('#nd-name').value.trim(); if (!name) { toast('Enter a name'); return; }
    const abbr = ($('#nd-abbr').value.trim() || name.split(' ').slice(-1)[0].slice(0, 3)).toUpperCase();
    const d = { id: 'C' + uid().slice(0, 6), name, abbr, number: +$('#nd-num').value || 0, born: $('#nd-born').value || null, custom: true };
    (c.customDrivers ||= []).push(d); s.drivers[d.id] = { ...d };
    store.save(); render(); toast(`${name} added. Pick them in a seat above.`);
    photoModal(d.id);
  },
  'cal-del'(el) { latestSeason().calendar.splice(+el.dataset.i, 1); store.save(); render(); },
  'cal-move'(el) {
    const s = latestSeason(); const i = +el.dataset.i, j = i + (+el.dataset.dir);
    if (j < 0 || j >= s.calendar.length) return;
    [s.calendar[i], s.calendar[j]] = [s.calendar[j], s.calendar[i]]; store.save(); render();
  },
  async export() {
    if (window.api) { const ok = await window.api.exportData(state); if (ok) toast('Backup exported'); }
    else toast('Export needs the desktop app');
  },
  async import() {
    if (!window.api) { toast('Import needs the desktop app'); return; }
    const data = await window.api.importData();
    if (!data || !Array.isArray(data.careers)) { if (data !== null) toast('That file is not a Pitwall backup'); return; }
    confirmBox('Import backup', `Replace all current data with this backup (${data.careers.length} career${data.careers.length === 1 ? '' : 's'})?`, 'Import', () => {
      state = hydrateState(data); ui.seasonIdx = null; ui.view = 'dashboard'; store.save(); render(); toast('Backup imported');
    });
  },
  'delete-career'() {
    const c = career();
    confirmBox('Delete career', `Permanently delete ${c.profile.first} ${c.profile.last}'s career and all its results? Export a backup first if you might want it back.`, 'Delete career', () => {
      state.careers = state.careers.filter(x => x.id !== c.id);
      state.activeCareerId = state.careers[0]?.id || null;
      ui.view = state.careers.length ? 'dashboard' : 'setup'; ui.setup = state.careers.length ? null : defaultSetup();
      store.save(); render();
    });
  },
};
function redrawModal() { if (ui.modal?.kind === 'goals') drawGoalsModal(); else if (ui.modal?.kind === 'next') drawNextSeasonModal(); }

const changes = {
  'drv-sort-sel'(el) { ui.drv.sort = el.value; render(); },
  'tm-sort-sel'(el) { ui.tms.sort = el.value; render(); },
  'setup-year'(el) { setupYear(Math.max(2027, Math.min(2060, +el.value || 2027))); },
  'fg-name'(el) { ui.setup.futureGrid[+el.dataset.i].name = el.value; },
  'fg-color'(el) { ui.setup.futureGrid[+el.dataset.i].color = el.value; render(); },
  'fg-seat'(el) {
    const u = ui.setup; const key = 'g' + el.dataset.i + '-' + el.dataset.j;
    if (el.value === '__new') { u.nd[key] ||= {}; } else { u.futureGrid[+el.dataset.i].drivers[+el.dataset.j] = el.value; delete u.nd[key]; }
    render();
  },
  'fc-sprint'(el) { ui.setup.futureCal[+el.dataset.i].sprint = el.checked; },
  'fc-add'(el) { if (!el.value) return; const tr = trackGp(el.value); ui.setup.futureCal.push({ ...tr, sprint: false, ...(H.roundTrack[tr.id] ? { track: H.roundTrack[tr.id] } : {}) }); render(); },
  'season-sel'(el) { actions[el.dataset.to]({ dataset: { idx: el.value } }); },
  'switch-career'(el) { state.activeCareerId = el.value; ui.seasonIdx = null; ui.view = 'dashboard'; store.save(); render(); },
  setup(el) { ui.setup[el.dataset.k] = el.value; },
  'mt-seat'(el) {
    const u = ui.setup; const i = +el.dataset.i;
    if (el.value === '__new') { u.nd[i] ||= {}; } else { u.team.seats[i] = el.value; delete u.nd[i]; }
    render();
  },
  'tr-field'(el) {
    const m = ui.modal; const { i, k } = el.dataset;
    if (k === 'effective') m.effective = el.value;
    else {
      const st = m.steps[+i];
      if (k === 'driver') { if (el.value === '__new') { m.nd[0] ||= {}; st.driver = null; } else { delete m.nd[0]; st.driver = el.value || null; } }
      else st[k] = k === 'until' ? +el.value : el.value;
      // anything but the contract length changes who is displaced, so the rest of the chain starts again
      if (k !== 'until') m.steps.splice(+i + 1);
    }
    drawTransferModal();
  },
  'fv-round'(el) { ui.fvRound = +el.value; render(); },
  'num-one'(el) { const c = career(); (c.numberOne ||= {})[el.dataset.year] = el.checked; syncNumbers(c); store.save(); render(); toast(el.checked ? 'Number 1 it is' : 'Back to their own number'); },
  'nd-field'(el) { const { scope, key, k } = el.dataset; (ndDrafts(scope)[key] ||= {})[k] = el.value; },
  'goal-type'(el) { const g = goalList(el).find(x => x.id === el.dataset.id); g.scope = goalScope(g); g.type = el.value; const gt = D.GOAL_TYPES.find(x => x.id === g.type); if (gt?.needsTarget && g.target == null) g.target = 1; if (gt?.needsTeam && !g.team) g.team = goalCtx(el.dataset.scope).teams[0]?.[0]; el.dataset.scope === 'setup' ? render() : redrawModal(); },
  'goal-driver'(el) { goalList(el).find(x => x.id === el.dataset.id).driver = el.value; },
  'goal-team'(el) { goalList(el).find(x => x.id === el.dataset.id).team = el.value; },
  'goal-target'(el) { goalList(el).find(x => x.id === el.dataset.id).target = +el.value; },
  'goal-text'(el) { goalList(el).find(x => x.id === el.dataset.id).text = el.value; },
  'goal-done'(el) { const g = curSeason().goals.find(x => x.id === el.dataset.id); g.done = el.checked; store.save(); render(); },
  'res-field'(el) {
    const s = curSeason(); const sd = sessionData(s, ui.round, ui.session, true);
    const i = +el.dataset.i; const r = sd.results[i]; const f = el.dataset.f;
    const race = isRaceKind(ui.session);
    let v = el.value.trim();
    if (f === 'lap' && v) { const ms = parseLap(v); if (ms != null) v = fmtLap(ms); }
    if (f === 'gap' && v) { const ms = parseDur(v); if (ms != null) v = fmtDur(ms, !(race && i === 0)); }
    if (f === 'laps') v = Math.max(0, parseInt(v, 10) || 0) || '';
    r[f] = v;
    if (!race) {
      // timed sessions: a gap to the fastest sets the lap time, and a lap time sets the gap
      const best = parseLap(sd.results[0]?.lap);
      const sync = (x) => { const g = parseDur(x.gap); if (best != null && g != null) x.lap = fmtLap(best + g); };
      if (f === 'gap' && i > 0) sync(r);
      if (f === 'lap' && i === 0) sd.results.slice(1).forEach(x => { if (x.gap) sync(x); else { const ms = parseLap(x.lap); if (best != null && ms != null && ms >= best) x.gap = fmtDur(ms - best, true); } });
      if (f === 'lap' && i > 0) { const ms = parseLap(v); r.gap = best != null && ms != null && ms >= best ? fmtDur(ms - best, true) : r.gap; }
    }
    sd.done = true; store.save();
    if (f === 'st') {
      // retired drivers drop below classified finishers
      const fin = sd.results.filter(x => !OUT.includes(x.st)); const out = sd.results.filter(x => OUT.includes(x.st));
      sd.results = [...fin, ...out];
    }
    render();
  },
  'sess-done'(el) { const s = curSeason(); const sd = sessionData(s, ui.round, ui.session, true); sd.done = el.checked; store.save(); render(); },
  'fl-override'(el) { const s = curSeason(); const sd = sessionData(s, ui.round, ui.session, true); sd.fl = el.value || null; store.save(); render(); },
  notes(el) { const s = curSeason(); weekend(s, ui.round, true).notes = el.value; store.save(); },
  'copy-order'(el) {
    const s = curSeason(); const sd = sessionData(s, ui.round, ui.session, true);
    const v = el.value; if (!v) return;
    let order;
    if (v.startsWith('sess:')) order = sessionData(s, ui.round, v.slice(5)).results.map(r => r.d);
    else if (v === 'champ') order = driverStandings(s).map(x => x.id);
    else order = gridIds(s);
    const byId = Object.fromEntries(sd.results.map(r => [r.d, r]));
    sd.results = [...order.filter(d => byId[d]).map(d => byId[d]), ...sd.results.filter(r => !order.includes(r.d))];
    sd.done = true; store.save(); render();
  },
  'h2h-a'(el) { ui.h2h.a = el.value; render(); },
  'h2h-b'(el) { ui.h2h.b = el.value; render(); },
  'h2h-scope'(el) { ui.h2h.scope = el.value; ui.h2h.b = null; render(); },
  'media-answer'(el) { const m = career().media.find(x => x.id === el.dataset.id); m.questions[+el.dataset.i].answer = el.value; store.save(); },
  'media-season'(el) { ui.modal.seasonIdx = +el.value; const s = career().seasons[+el.value]; ui.modal.roundId = activeRounds(s)[0]?.id; drawMediaModal(); },
  'media-round'(el) { ui.modal.roundId = el.value; },
  roster(el) {
    const s = latestSeason(); const t = s.teams.find(x => x.id === el.dataset.team); const seat = +el.dataset.seat;
    const id = el.value;
    // if the driver already has a seat elsewhere, swap them
    for (const o of s.teams) { const k = o.drivers.indexOf(id); if (k >= 0 && !(o === t && k === seat)) o.drivers[k] = t.drivers[seat]; }
    t.drivers[seat] = id;
    if (!s.drivers[id]) s.drivers[id] = { ...allKnownDrivers(career(), s)[id] };
    store.save(); render();
  },
  practice(el) { latestSeason().format.practice = el.value; store.save(); render(); },
  'cal-sprint'(el) { latestSeason().calendar[+el.dataset.i].sprint = el.checked; store.save(); render(); },
  'cal-on'(el) { latestSeason().calendar[+el.dataset.i].off = !el.checked; store.save(); render(); },
  'cal-add'(el) { if (!el.value) return; const s = latestSeason(); const g = trackGp(el.value); let id = g.id; while (s.calendar.some(r => r.id === id)) id += '2'; s.calendar.push({ ...g, id, ...(id !== g.id ? { track: g.id } : {}), sprint: false, off: false, added: true }); store.save(); render(); toast(`${g.name} added to the ${s.year} calendar`); },
};
function goalList(el) { return el.dataset.scope === 'setup' ? ui.setup.goals : ui.modal.goals; }
// team identity fields live on the setup form or on the active career's team
function mtTarget(el) { return el.dataset.scope === 'setup' ? ui.setup.team : career().myTeam; }
function mtCommit(el) { if (el.dataset.scope !== 'setup') { syncMyTeam(career()); store.save(); } render(); }
Object.assign(changes, {
  'mt-field'(el) {
    const t = mtTarget(el); const k = el.dataset.k;
    t[k] = k === 'short' ? el.value.trim().toUpperCase() : k === 'founded' ? +el.value || 2025 : el.value;
    mtCommit(el);
  },
  async 'mt-logo'(el) {
    const file = el.files?.[0]; if (!file) return;
    try { mtTarget(el).logo = await readLogo(file); mtCommit(el); toast('Logo imported'); } catch (e) { toast(e.message); }
  },
  'mt-rating'(el) {
    const c = career(); const s = latestSeason(); const r = (c.myTeam.ratings[s.index] ||= {});
    if (el.value === '') delete r[el.dataset.k]; else r[el.dataset.k] = Math.max(0, Math.min(100, Math.round(+el.value)));
    store.save(); render();
  },
  'mt-budget'(el) { career().myTeam.budget = +el.value || 0; store.save(); render(); },
  'mt-sponsor-status'(el) { career().myTeam.sponsors.find(x => x.id === el.dataset.id).status = el.value; store.save(); render(); },
  async 'pic-upload'(el) {
    const file = el.files?.[0]; if (!file) return;
    const { kind, id } = el.dataset; const c = career();
    try {
      if (kind === 'team') {
        const url = await readLogo(file);
        if (id === MYTEAM) { c.myTeam.logo = url; syncMyTeam(c); } else imgStore().teams[id] = url;
      } else {
        const url = await readPhoto(file);
        if (kind === 'newdriver') { const [scope, key] = id.split(':'); (ndDrafts(scope)[key] ||= {}).photo = url; }
        else if (kind === 'setup') ui.setup.photo = url; else setDriverPhoto(c, id, url);
      }
      if (kind !== 'setup' && kind !== 'newdriver') store.save();
      if (ui.modal?.kind === 'transfer') drawTransferModal(); else render();
      if (ui.modal?.kind === 'photo') drawPhotoModal();
      toast(kind === 'team' ? 'Logo saved' : 'Photo saved');
    } catch (e) { toast(e.message); }
  },
  'rm-field'(el) { ui.modal[el.dataset.k] = el.value; drawRumourModal(); },
  'rv-field'(el) { ui.modal[el.dataset.k] = el.value; drawRivalryModal(); },
  dob(el) {
    const c = career(); const id = el.dataset.id; const v = el.value || null;
    if (id === PLAYER_ID) c.profile.born = v;
    else { const cd = c.customDrivers.find(x => x.id === id); cd.born = v; for (const s of c.seasons) if (s.drivers[id]) s.drivers[id].born = v; }
    store.save(); render();
  },
});
Object.assign(actions, {
  'open-team'(el) { if (!el.dataset.id) return; ui.teamId = el.dataset.id; ui.view = 'team'; render(); },
  'tm-sort'(el) { ui.tms.sort = el.dataset.k; render(); },
  'tm-scope'(el) { ui.tms.scope = el.dataset.v; render(); },
  'fc-kind'(el) { ui.fc = el.dataset.v; render(); },
  'race-length'(el) { const s = curSeason(); weekend(s, ui.round, true).raceLength = +el.dataset.v; store.save(); render(); },
  'perf-mode'(el) { ui.perf = el.dataset.v; render(); },
  'perf-view'(el) { ui.perfView = el.dataset.v; render(); },
  'fv-open'(el) { ui.view = 'performance'; ui.perfView = 'drivers'; ui.fvRound = +el.dataset.ri; render(); },
  'lb-sort'(el) { ui.lb.sort = el.dataset.k; render(); },
  'lb-scope'(el) { ui.lb.scope = el.dataset.v; render(); },
  'stories-filter'(el) { ui.stories = el.dataset.v; render(); },
  'pic-clear'(el) {
    const { kind, id } = el.dataset; const c = career();
    if (kind === 'setup') ui.setup.photo = null;
    else if (kind === 'team') { if (id === MYTEAM) { c.myTeam.logo = null; syncMyTeam(c); } else delete imgStore().teams[id]; }
    else setDriverPhoto(c, id, null);
    if (kind !== 'setup') store.save();
    render(); if (ui.modal?.kind === 'photo') drawPhotoModal();
  },
  'driver-photo'(el) { photoModal(el.dataset.id); },
  'rm-new'() { rumourModal(); },
  async 'tm-save'() {
    telemetryStatus = await window.api.telemetry.configure({ enabled: $('#tm-on').checked, port: +$('#tm-port').value || 20778 });
    render(); toast(telemetryStatus.enabled ? `Listening for F1 25 on port ${telemetryStatus.port}` : 'F1 25 telemetry off');
  },
  'game-apply'() {
    const q = gameQueue.shift(); const c = career(); if (!q) return closeModal();
    let place = q.place;
    if (q.why === 'place') { const s = latestSeason(); const round = activeRounds(s).find(x => x.id === $('#game-round').value); const key = $('#game-key').value; if (!round || !sessionsFor(s, round).includes(key)) { gameQueue.unshift(q); toast('That weekend doesn’t have that session'); return; } place = { s, round, key }; }
    closeModal(); applyGameResult(c, q.r, place); setTimeout(nextGameDecision, 300);
  },
  'game-skip'() { gameQueue.shift(); closeModal(); toast('Left as it was'); setTimeout(nextGameDecision, 300); },
  'game-open'() { const g = gameNotice; if (!g) return; ui.view = 'weekend'; ui.seasonIdx = null; ui.round = g.roundId; ui.session = g.key; render(); },
  'game-undo'() {
    const g = gameNotice; const c = state.careers.find(x => x.id === g?.careerId); if (!c) return;
    const s = c.seasons[g.seasonIdx]; const w = s?.weekends[g.roundId]; if (!w) return;
    if (g.prev) w.sessions[g.key] = JSON.parse(g.prev); else delete w.sessions[g.key];
    w.raceLength = g.prevLen; if (g.prevLen === undefined) delete w.raceLength;
    gameNotice = null; store.save(); render(); toast('Import undone');
  },
  'game-dismiss'() { gameNotice = null; render(); },
  'gd-open'(el) { gameDriverModal(el.dataset.round, el.dataset.key, el.dataset.d); },
  'rv-new'() { rivalryModal(); },
  'rv-create'() {
    const c = career(); const s = latestSeason(); const m = ui.modal; if (m.a === m.b) return;
    (c.rivalries ||= []).push({ id: uid(), seasonIdx: s.index, after: roundsDone(s), a: m.a, b: m.b, reason: m.reason, createdAt: new Date().toISOString() });
    closeModal(); ui.view = 'stories'; ui.seasonIdx = null; ui.stories = 'all'; store.save(); render(); toast('Rivalry started. The press has the story.');
  },
  'weekend-card'(el) { weekendCardModal(el.dataset.round); },
  'award-card'(el) { awardCardModal(el.dataset.kind, el.dataset.ri != null ? +el.dataset.ri : null); },
  async 'card-save'() {
    const m = ui.modal; if (!m?.url) return;
    if (window.api?.saveImage) { if (await window.api.saveImage(m.url, m.name)) toast('Image saved'); return; }
    const a = document.createElement('a'); a.href = m.url; a.download = m.name; document.body.appendChild(a); a.click(); a.remove();
  },
  'open-review'(el) { if (el.dataset.idx != null) ui.seasonIdx = +el.dataset.idx; ui.view = 'review'; render(); },
  'rm-create'() {
    const c = career(); const s = latestSeason(); const m = ui.modal;
    const rounds = activeRounds(s);
    let after = -1; rounds.forEach((r, i) => { if (s.weekends[r.id]?.sessions?.R?.done) after = i; });
    const kind = m.rkind;
    (c.rumours ||= []).push({ id: uid(), seasonIdx: s.index, after, driver: m.driver, kind, team: kind === 'stay' ? teamOf(s, m.driver)?.id : kind === 'move' ? m.team : null, strength: m.strength, timing: kind === 'stay' ? 'next' : m.timing, status: 'open', createdAt: new Date().toISOString() });
    closeModal(); ui.view = 'stories'; ui.seasonIdx = null; ui.stories = 'all'; store.save(); render(); toast('Rumour published');
  },
  'rm-status'(el) { const rm = career().rumours.find(x => x.id === el.dataset.id); rm.status = el.dataset.v; store.save(); render(); },
  'rm-del'(el) { const c = career(); c.rumours = c.rumours.filter(x => x.id !== el.dataset.id); store.save(); render(); },
});

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = actions[el.dataset.act];
  if (fn) { if (el.tagName === 'BUTTON') e.preventDefault(); fn(el, e); }
});
document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-ch]');
  if (!el) return;
  const fn = changes[el.dataset.ch];
  if (fn) fn(el, e);
});
document.addEventListener('input', (e) => {
  const el = e.target;
  if (el.dataset?.mask) el.value = maskTime(el.dataset.mask, el.value, (e.inputType || '').startsWith('delete'));
  if (el.dataset?.ch === 'setup' && el.tagName !== 'SELECT') ui.setup[el.dataset.k] = el.value;
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && $('#modal-root').innerHTML) closeModal();
  // Enter in a lap/gap field jumps to the same field in the next row
  if (e.key === 'Enter' && e.target.matches('.res-table input[type=text]')) {
    e.preventDefault();
    const i = +e.target.dataset.i, f = e.target.dataset.f;
    e.target.blur();
    setTimeout(() => { const nx = document.querySelector(`.res-table input[data-f="${f}"][data-i="${i + 1}"]`); if (nx) { nx.focus(); nx.select(); } }, 0);
  }
});

// drag to reorder result rows
document.addEventListener('dragstart', (e) => { const tr = e.target.closest?.('tr[data-drag]'); if (!tr) return; ui.dragIdx = +tr.dataset.drag; e.dataTransfer.effectAllowed = 'move'; });
document.addEventListener('dragover', (e) => { const tr = e.target.closest?.('tr[data-drag]'); if (!tr || ui.dragIdx == null) return; e.preventDefault(); document.querySelectorAll('tr.drag-over').forEach(x => x.classList.remove('drag-over')); tr.classList.add('drag-over'); });
document.addEventListener('drop', (e) => {
  const tr = e.target.closest?.('tr[data-drag]'); if (!tr || ui.dragIdx == null) return;
  e.preventDefault();
  const s = curSeason(); const sd = sessionData(s, ui.round, ui.session, true);
  const to = +tr.dataset.drag; const [row] = sd.results.splice(ui.dragIdx, 1); sd.results.splice(to, 0, row);
  ui.dragIdx = null; sd.done = true; store.save(); render();
});
document.addEventListener('dragend', () => { ui.dragIdx = null; document.querySelectorAll('tr.drag-over').forEach(x => x.classList.remove('drag-over')); });

/** The Android back button: close the menu or dialog, then step back to the parent page. False when there's nowhere to go. */
window.pitwallBack = () => {
  if (document.body.classList.contains('nav-open')) { setNavOpen(false); return true; }
  if ($('#modal-root').innerHTML) { closeModal(); return true; }
  if (ui.view === 'setup' || !career()) return false;
  if (ui.tap) { ui.tap = null; render(); return true; }
  const parent = { weekend: 'calendar', driver: 'drivers', team: 'teams', track: 'tracks', review: 'stats' }[ui.view];
  if (parent) { ui.view = parent; render(); return true; }
  if (ui.view !== 'dashboard') { ui.view = 'dashboard'; ui.seasonIdx = null; render(); return true; }
  return false;
};

/* ------------------------------------------------------------------ boot */
(async function boot() {
  try { const loaded = await store.load(); if (loaded && Array.isArray(loaded.careers)) state = hydrateState(loaded); } catch (e) { console.error(e); }
  if (window.api) { try { settings = await window.api.getSettings(); } catch { } }
  if (window.api?.companion?.status) {
    try { companion = await window.api.companion.status(); } catch { }
    window.api.companion.onStatus((st) => {
      companion = st;
      const a = document.activeElement;
      if (ui.view === 'settings' && !$('#modal-root').innerHTML && !(a && a.matches('input, textarea, select'))) render();
    });
  }
  if (!state.careers.length) { ui.view = 'setup'; ui.setup = defaultSetup(); }
  else if (!career()) state.activeCareerId = state.careers[0].id;
  // the number 1 follows your career's champions (older saves had it fixed to the real 2025 champion)
  let renumbered = false;
  for (const cc of state.careers) { try { renumbered = syncNumbers(cc) || renumbered; } catch { } }
  render();
  if (renumbered || store.dirty()) store.save(); // also saves an older career that just gained its real seasons
  window.api?.onRemote?.(applyRemote);
  // F1 25 telemetry: results that finished while the window was loading, then anything new
  if (window.api?.telemetry) {
    try { telemetryStatus = await window.api.telemetry.status(); } catch { }
    window.api.telemetry.onStatus((st) => { telemetryStatus = st; const a = document.activeElement; if (ui.view === 'settings' && !$('#modal-root').innerHTML && !(a && a.matches('input, textarea, select'))) render(); });
    window.api.telemetry.onResult(handleGameResult);
    try { for (const r of await window.api.telemetry.pending()) handleGameResult(r); } catch { }
  }
})();
