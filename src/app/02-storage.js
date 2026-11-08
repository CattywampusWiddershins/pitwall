/* Pitwall — Saving and loading, merging edits from a paired device, the career model. Part of the renderer, split into files that load in order (see index.html). */
'use strict';
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
  teamId: null, tms: { sort: 'conTitles', scope: 'grid' }, fc: 'driver', stories: 'all', lb: { sort: 'pts', scope: 'since', since: 1950, f: {} }, perf: 'season',
};

/* ----------------------------------------------------------- career model */
const career = () => state.careers.find(c => c.id === state.activeCareerId) || null;
const curSeason = () => { const c = career(); if (!c) return null; const i = ui.seasonIdx ?? c.seasons.length - 1; return c.seasons[i] || c.seasons[c.seasons.length - 1]; };
const latestSeason = () => { const c = career(); return c ? c.seasons[c.seasons.length - 1] : null; };
