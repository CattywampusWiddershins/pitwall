/* Pitwall — Race Replay. Part of the renderer, split into files that load in order (see index.html). */
'use strict';
/* ------------------------------------------------------------ race replay */
/*
  Race Replay: a race recorded from F1 25 (every race driven with telemetry on, from 3.7) played back at up to 20x.
  The recording is the live feed, a sample a second, so the replay runs it through the same steps as Live Race: the
  dashboard shows the strategy, the undercut cards and the rejoin as they were (no sounds), next to the position chart
  growing lap by lap and the field drawn by its gaps to the leader. Only races logged in this career are listed; races
  from before 3.7 or without telemetry weren't recorded.
*/
const replayMem = {}; // recordings held in memory where there's no desktop app (the browser copy)
const replayApi = () => window.api?.replays || { list: async () => Object.values(replayMem).map(x => ({ ...x.meta, bytes: 0, samples: x.samples.length })), load: async (k) => replayMem[k] || null, remove: async (k) => { delete replayMem[k]; return true; } };
let replayList = null; // the recordings, once listed
let RP = null; // the replay open
const RP_H = 680; // px: the height of the gap view
/** The recordings that belong to this career, newest first: [{ x (recording), s, r, k (session) }]. */
function replaysHere(c) {
  const out = []; const recorded = new Set((replayList || []).map(x => x.key));
  for (const x of replayList || []) for (const s of c.seasons) for (const [rid, w] of Object.entries(s.weekends || {})) for (const [k, sd] of Object.entries(w.sessions || {}))
    if (sd?.game?.key === x.key) { const r = s.calendar.find(y => y.id === rid); if (r) out.push({ x, s, r, k }); }
  // races logged from F1 25 without a recording (before 3.7): rebuilt lap by lap from their lap times
  for (const s of c.seasons) { if (isHist(s)) continue; for (const [rid, w] of Object.entries(s.weekends || {})) for (const k of ['R', 'SPR']) {
    const g = w.sessions?.[k]?.game; if (!g?.laps || recorded.has(g.key) || !Object.values(g.laps).some(L => L?.length > 1)) continue;
    const r = s.calendar.find(y => y.id === rid); if (r) out.push({ x: { key: `lap:${s.index}:${rid}:${k}`, rebuilt: true, laps: Math.max(0, ...Object.values(g.finished || {})), bytes: 0 }, s, r, k });
  } }
  return out.sort((a, b) => b.s.index - a.s.index || b.s.calendar.indexOf(b.r) - a.s.calendar.indexOf(a.r));
}
/*
  A lap-by-lap replay, for a race logged from F1 25 before races were recorded. The session kept every car's lap times,
  its stints, wear and fuel per lap, and the laps the safety car was out, so the race can be played again from those:
  each car's progress at any moment is worked out from its lap times (steady through each lap), which gives the order
  and the gaps, exact at every crossing of the line and smooth between them. It's built in the same shape as a
  recording (a sample every two seconds) and nothing is saved. What it can't give back is the live dashboard.
*/
const REBUILT_STEP = 2; // s between samples
function rebuildReplay(s, r, k) {
  const sd = s.weekends[r.id]?.sessions?.[k]; const g = sd?.game; if (!g?.laps) return null;
  const ids = Object.keys(g.laps).filter(d => g.laps[d]?.length); if (!ids.length) return null;
  const finished = (d) => g.finished?.[d] ?? g.laps[d].length;
  const row = Object.fromEntries((sd.results || []).map(x => [x.d, x]));
  // each car's lap times (a missing one: its typical lap) and the time it crossed the line after each lap
  const cars = ids.map((d, i) => {
    const raw = g.laps[d].slice(0, finished(d)).map(l => l?.[0] || 0); const med = median(raw.filter(Boolean)) || 90e3;
    const lt = raw.map(v => v || med); const C = [0]; lt.forEach(v => C.push(C[C.length - 1] + v));
    const ends = (g.stints?.[d] || []).map(x => x[1]); const st = g.stints?.[d] || [];
    return { d, i, lt, C, n: lt.length, out: OUT.includes(row[d]?.st), grid: g.grid?.[d] || row[d]?.grid || 99, ends: ends.slice(0, -1), st };
  });
  const leader = cars.slice().sort((a, b) => b.n - a.n || a.C[a.n] - b.C[b.n])[0]; const total = leader.C[leader.n];
  const prog = (x, T) => { if (T >= x.C[x.n]) return x.n; let k = 0; while (x.C[k + 1] <= T) k++; return k + (T - x.C[k]) / x.lt[k]; };
  const at = (x, p) => { const k = Math.min(x.n - 1, Math.floor(p)); return k < 0 ? 0 : x.C[k] + (p - k) * x.lt[k]; }; // the time car x reached progress p
  const periods = g.safety?.periods || [];
  const samples = []; const end = Math.max(...cars.map(x => x.C[x.n]));
  for (let t = 0; t <= end / 1000 + REBUILT_STEP; t += REBUILT_STEP) {
    const T = t * 1000; // the order: furthest round, then who got there first (at the start: the grid)
    const P = cars.map(x => { const p = prog(x, T); return { x, p, at: at(x, p) }; }).sort((a, b) => b.p - a.p || a.at - b.at || a.x.grid - b.x.grid);
    const L = P[0]; const lp = Math.floor(L.p) + 1;
    const f = P.map((o, k) => {
      const { x, p } = o; const lap = Math.min(x.n + (T >= x.C[x.n] ? 0 : 1), Math.floor(p) + 1); const doneAll = T >= x.C[x.n];
      // the gaps as the game gives them: the time since the car ahead (or the leader, a lap down: when it last passed this point) was here
      const Tx = Math.min(T, x.C[x.n]); const down = Math.max(0, Math.floor(L.p - p + 1e-9)); const ahead = P[k - 1];
      const gap = Math.max(0, Tx - at(L.x, Math.min(p + down, L.x.n)));
      const gapF = ahead ? Math.max(0, Tx - at(ahead.x, Math.min(p, ahead.x.n))) : 0;
      const stops = x.ends.filter(e => e < p).length; const stint = x.st[stops] || x.st[x.st.length - 1]; const from = stops ? x.ends[stops - 1] : 0;
      const pit = x.ends.some(e => Math.abs(p - e) < 0.04) ? 1 : 0; const wear = g.wear?.[x.d]?.[Math.max(0, lap - 2)]; const fuel = g.fuel?.[x.d]?.[Math.max(0, lap - 2)];
      return [x.i, k + 1, lap, Math.round((p % 1) * 5000), Math.round(gap), Math.round(gapF), pit, doneAll ? (x.out ? 4 : 3) : 2, stops, stint ? stint[0] : -1, Math.max(0, lap - from - 1), wear == null ? -1 : Math.round(wear * 10), fuel == null ? -1 : Math.round(fuel * 10)];
    });
    const sc = periods.find(q => lp >= q.from && lp <= (q.to ?? 999)); samples.push({ t, sc: sc ? (sc.kind === 'sc' ? 1 : 2) : 0, f });
  }
  return { meta: { key: `lap:${s.index}:${r.id}:${k}`, lapByLap: true, totalLaps: g.totalLaps || leader.n, ids, player: ids.indexOf(PLAYER) },
    samples, laps: Object.fromEntries(cars.map(x => [x.i, g.laps[x.d]])), fuel: Object.fromEntries(cars.map(x => [x.i, g.fuel?.[x.d] || []])) };
}
/** A recorded sample as a live field (the lap history up to each car's completed laps). */
function replayField(D, S) {
  return S.f.map(([i, pos, lap, dist, gapL, gapF, pit, st, stops, c, age, wear, fuel]) => {
    const done = Math.max(0, lap - 1); const laps = (D.laps[i] || []).slice(0, done).map(l => l || [0, 0]); const fl = (D.fuel[i] || []).slice(0, done);
    return { i, pos, lap, dist, gapL, gapF, pit: !!pit, st, stops, c: c < 0 ? null : c, age: age < 0 ? null : age, wear: wear < 0 ? null : wear / 10, fuel: fuel < 0 ? null : fuel / 10,
      last: laps[laps.length - 1]?.[0] || 0, laps: laps.slice(-6), nLaps: laps.length, fuelLaps: fl.slice(-8), fuelN: fl.length };
  });
}
/** Brings the replay's race state to sample `idx` (forwards from where it is, or again from the start). */
function replayTo(idx) {
  const D = RP.data; const M = D.meta;
  if (idx < RP.at) { RP.L = {}; RP.at = -1; RP.mem = {}; RP.ts = null; RP.w = null; }
  for (let k = RP.at + 1; k <= idx; k++) {
    const S = D.samples[k]; if ('ts' in S) RP.ts = S.ts; if ('w' in S) RP.w = S.w;
    RP.L = mergeLive(RP.L, { uid: M.uid, sessionType: M.sessionType, track: M.track, weekend: M.weekend, totalLaps: M.totalLaps, parts: M.parts, player: M.player, sc: S.sc, field: replayField(D, S), tyreSets: RP.ts, weather: RP.w }, S.t * 1000);
  }
  RP.at = idx;
}
const replayIdx = (T) => { const S = RP.data.samples; let lo = 0, hi = S.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (S[m].t <= T) lo = m; else hi = m - 1; } return lo; };
async function openReplay(item) {
  const D = item.x.rebuilt ? rebuildReplay(item.s, item.r, item.k) : await replayApi().load(item.x.key); if (!D?.samples?.length) { toast('That recording couldn’t be read'); return; }
  const c = career(); const map = D.meta.ids ? Object.fromEntries(D.meta.ids.map((d, i) => [i, d])) : liveMap(c, item.s, { parts: D.meta.parts, player: D.meta.player }); const idOf = (i) => map[i];
  // each car's position at the start of every lap (lap 0: the first sample), for the chart
  const posLaps = {}; const seen = {};
  D.samples.forEach((S, k) => S.f.forEach(([i, pos, lap]) => { if (!pos) return; const P = (posLaps[i] ||= []); if (k === 0) P[0] = pos; if (lap > (seen[i] || 1)) { for (let l = (seen[i] || 1); l < lap; l++) P[l] = pos; seen[i] = lap; } }));
  RP = { ...item, data: D, idOf, posLaps, T: 0, dur: D.samples[D.samples.length - 1].t, speed: 5, playing: false, i: -1, at: -1, L: {}, mem: {}, scale: 20, dashAt: 0, chartLap: -1 };
  render();
}
function renderReplay() {
  const c = career();
  const head = (sub) => `<div class="page-head"><div><h1>Race Replay</h1><div class="sub">${sub}</div></div></div>`;
  if (replayList == null) { replayApi().list().then(l => { replayList = l || []; render(); }).catch(() => { replayList = []; render(); }); return `<div class="page">${head('Loading the recordings…')}</div>`; }
  if (RP) return replayView(c);
  replayPrune(c);
  const list = replaysHere(c); const mb = (b) => `${(b / 1048576).toFixed(1)} MB`;
  const owned = new Set(state.careers.flatMap(cc => replaysHere(cc).filter(x => !x.x.rebuilt).map(x => x.x.key))); const orphans = (replayList || []).filter(x => !owned.has(x.key));
  const keepSel = `<label class="row" style="gap:6px">Keep recordings for <select data-ch="rp-keep">${[[0, 'every season'], [1, 'this season only'], [2, 'the last 2 seasons'], [3, 'the last 3 seasons'], [5, 'the last 5 seasons']].map(([v, l]) => `<option value="${v}" ${(c.replayKeep || 0) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>${orphans.length ? `<button class="btn sm ghost" data-act="rp-orphans">Delete ${plural(orphans.length, 'recording')} from no career (${mb(orphans.reduce((a, x) => a + (x.bytes || 0), 0))})</button>` : ''}`;
  const sub = 'Every race you drive with telemetry on is recorded, a sample a second, and can be played back here at up to 20x. Races logged from F1 25 before Pitwall 3.7 are rebuilt lap by lap from their lap times. Races entered by hand and historic seasons can’t be replayed.';
  if (!list.length) return `<div class="page">${head(sub)}<div class="row" style="gap:12px;margin-bottom:12px">${keepSel}</div><div class="panel"><div class="panel-b muted">No recorded races in this career yet. Drive a race with telemetry on and it appears here once it’s logged.</div></div></div>`;
  const bySeason = {}; list.forEach(x => (bySeason[x.s.year] ||= []).push(x));
  return `<div class="page">${head(sub)}
    <div class="row" style="gap:12px;margin-bottom:12px;flex-wrap:wrap">${keepSel}</div>
    <div class="tiles"><div class="tile"><span class="label">Recorded races</span><span class="v">${list.filter(x => !x.x.rebuilt).length}</span></div><div class="tile"><span class="label">Lap by lap</span><span class="v">${list.filter(x => x.x.rebuilt).length}</span></div><div class="tile"><span class="label">On disk</span><span class="v">${mb(list.reduce((a, x) => a + (x.x.bytes || 0), 0))}</span></div></div>
    ${Object.entries(bySeason).sort((a, b) => b[0] - a[0]).map(([y, xs]) => `<div class="panel"><div class="panel-h"><h2>${y}</h2><button class="btn sm ghost" data-act="rp-del-season" data-y="${y}">Delete ${y}’s recordings</button></div><div class="panel-b tight table-wrap"><table><tbody>
      ${xs.map(x => `<tr><td class="num">R${x.s.calendar.filter(q => !q.off).indexOf(x.r) + 1}</td><td><b>${esc(x.r.name)}</b> <span class="muted">${esc(SESSION_LABEL[x.k] || x.k)}</span>${x.x.rebuilt ? ' <span class="tag">Lap by lap</span>' : ''}</td><td class="muted">${x.x.laps ? plural(x.x.laps, 'lap') : ''}</td><td class="muted">${x.x.bytes ? mb(x.x.bytes) : ''}</td>
        <td style="text-align:right"><button class="btn sm primary" data-act="rp-open" data-k="${esc(x.x.key)}">Watch</button> ${x.x.rebuilt ? '' : `<button class="btn sm ghost" data-act="rp-del" data-k="${esc(x.x.key)}">Delete</button>`}</td></tr>`).join('')}
    </tbody></table></div></div>`).join('')}</div>`;
}
/** Deletes this career's recordings older than the seasons it keeps (once per listing). */
function replayPrune(c) {
  const keep = c.replayKeep || 0; if (!keep || replayPrune.done === replayList) return; replayPrune.done = replayList;
  const last = latestSeason().year; const old = replaysHere(c).filter(x => !x.x.rebuilt && x.s.year <= last - keep);
  if (old.length) Promise.all(old.map(x => replayApi().remove(x.x.key))).then(() => { replayList = null; render(); toast(`${plural(old.length, 'old recording')} deleted`); });
}
function replayView(c) {
  setTimeout(() => replayShow(true));
  return `<div class="page">
    <div class="page-head"><div><h1>${esc(RP.r.name)} · ${esc(SESSION_LABEL[RP.k] || RP.k)}</h1><div class="sub">${RP.s.year} · ${RP.data.meta.lapByLap ? 'rebuilt lap by lap from the lap times' : 'replay of the live feed'}</div></div><div class="row"><button class="btn ghost" data-act="rp-close">All races</button></div></div>
    <div class="panel rp-controls"><div class="panel-b row" style="gap:12px;flex-wrap:wrap;align-items:center">
      <button class="btn primary" data-act="rp-play" id="rp-play">${RP.playing ? 'Pause' : 'Play'}</button>
      <input type="range" id="rp-seek" data-ch="rp-seek" min="0" max="${Math.ceil(RP.dur)}" step="1" value="${Math.floor(RP.T)}" style="flex:1;min-width:200px">
      <span id="rp-clock" class="num" style="min-width:150px"></span>
      <label class="row" style="gap:6px">Speed <input type="range" data-ch="rp-speed" min="1" max="20" step="1" value="${RP.speed}" style="width:120px"><b id="rp-speed">${RP.speed}x</b></label></div></div>
    <div class="rp-grid"><div class="panel"><div class="panel-h"><h2>The field</h2><span class="muted" style="font-size:12px" id="rp-lap"></span></div><div class="panel-b"><div class="rp-vis" id="rp-vis" style="height:${RP_H}px"></div></div></div>
      <div class="stack" style="gap:16px"><div class="panel"><div class="panel-h"><h2>Track</h2><span class="muted" style="font-size:12px" id="rp-trk-note"></span></div><div class="panel-b"><div class="rp-track" id="rp-track"></div><div class="rp-flt" id="rp-flt"></div></div></div><div id="rp-dash"></div><div class="panel"><div class="panel-h"><h2>Positions</h2></div><div class="panel-b" id="rp-chart"></div></div></div></div></div>`;
}
/** Shows the replay at its time: the field every step, the dashboard once a second, the chart each new lap. */
function replayShow(force = false) {
  if (!RP || ui.view !== 'replay' || !document.getElementById('rp-vis')) return;
  const idx = replayIdx(RP.T); const now = performance.now();
  if (idx !== RP.i || force) { replayTo(idx); RP.i = idx; replayVis(); replayTrack(); }
  const S = RP.data.samples[idx]; const lead = Math.max(1, ...S.f.filter(x => x[1] === 1).map(x => x[2]));
  const clk = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const el = (id) => document.getElementById(id);
  el('rp-clock').textContent = `${clk(RP.T)} / ${clk(RP.dur)}`; el('rp-lap').textContent = `Lap ${Math.min(lead, RP.data.meta.totalLaps || lead)} of ${RP.data.meta.totalLaps || '?'}${S.sc === 1 ? ' · SAFETY CAR' : S.sc === 2 ? ' · VSC' : ''}`;
  const seek = el('rp-seek'); if (document.activeElement !== seek) seek.value = Math.floor(RP.T);
  el('rp-play').textContent = RP.playing ? 'Pause' : 'Play';
  if (force || now - RP.dashAt > 1000) { RP.dashAt = now; el('rp-dash').innerHTML = replayDash(); }
  if (force || lead !== RP.chartLap) { RP.chartLap = lead; el('rp-chart').innerHTML = replayChart(); }
}
function replayDash() {
  if (RP.data.meta.lapByLap) return `<div class="panel"><div class="panel-h"><h2>Lap by lap</h2></div><div class="panel-b muted" style="font-size:13px">This race was logged before Pitwall recorded races, so it’s rebuilt from every car’s lap times: the order and the gaps are exact each time the cars cross the line and smooth in between, with the pit stops, tyres and safety-car laps as logged. There’s no live dashboard for it.</div></div>`;
  const c = career(); const L = { ...RP.L, key: RP.k === 'SPR' ? 'SPR' : 'R', replay: true, mem: RP.mem, simT: RP.data.samples[RP.i].t * 1000 };
  const me = L.field?.find(x => x.i === RP.data.meta.player); if (!me) return '';
  try { return liveDriverCol(c, RP.s, RP.r, L, weekend(RP.s, RP.r.id, true), me, PLAYER, RP.idOf); } catch (e) { return `<div class="panel"><div class="panel-b muted">The dashboard couldn’t be drawn at this point (${esc(e.message)}).</div></div>`; }
}
/** The field by its gaps to the leader, F1-graphics style: each car slides as the gaps change. */
function replayVis() {
  const box = document.getElementById('rp-vis'); const L = RP.L; const s = RP.s; const field = L.field || [];
  const G = raceGaps(field); const ab = (x) => { const id = RP.idOf(x.i); return id ? dAbbr(s, id) : (RP.data.meta.parts?.find(p => p.idx === x.i)?.name || '?').slice(0, 3).toUpperCase(); };
  // the cars on the lead lap by their gaps; below them, a row each for the lapped cars and then those out of the race
  const isOut = (x) => x.st !== 2 && x.st !== 3;
  const running = field.filter(x => x.pos > 0).sort((a, b) => a.pos - b.pos);
  const onLap = running.filter(x => !isOut(x) && !G[x.i]?.down), lapped = running.filter(x => !isOut(x) && G[x.i]?.down), out = running.filter(isOut);
  const rest = lapped.length + out.length; const ROW = 17;
  const maxGap = Math.max(5000, ...onLap.map(x => G[x.i]?.g || 0));
  const room = Math.max(120, RP_H - 40 - rest * ROW - (rest ? 28 : 0) - Math.max(0, onLap.length - 8) * 4);
  const target = Math.max(2, Math.min(60, room / (maxGap / 1000))); RP.scale = RP.scale + (target - RP.scale) * 0.25;
  const dur = Math.min(1, 1 / RP.speed);
  // where each car goes: by its gap, never closer than a row to the car ahead
  const Y = {}; let y0 = -99;
  for (const x of onLap) { y0 = Math.max(12 + (G[x.i]?.g || 0) / 1000 * RP.scale, y0 + ROW); Y[x.i] = y0; }
  const split = rest ? y0 + 30 : null; let yr = (split ?? y0) + 10;
  for (const x of [...lapped, ...out]) { Y[x.i] = yr; yr += ROW; }
  const H = Math.max(RP_H, (rest ? yr : y0 + ROW) + 14); box.style.height = `${H}px`;
  // the second markers (over the lead lap), and the line above the lapped cars
  const step = [1, 2, 5, 10, 15, 30, 60, 120].find(v => v * RP.scale >= 48) || 120; let ticks = '';
  for (let v = step; 12 + v * RP.scale < (split ?? H) - 14; v += step) ticks += `<div class="rp-tick" style="top:${12 + v * RP.scale}px"><span>+${v} s</span></div>`;
  if (split != null) ticks += `<div class="rp-tick rp-split" style="top:${split}px"><span>${lapped.length ? 'Lapped' : ''}${lapped.length && out.length ? ' · ' : ''}${out.length ? 'Out' : ''}</span></div>`;
  let tk = box.querySelector('.rp-ticks'); if (!tk) { tk = document.createElement('div'); tk.className = 'rp-ticks'; box.appendChild(tk); } tk.innerHTML = ticks;
  running.forEach(x => {
    let node = box.querySelector(`.rp-car[data-i="${x.i}"]`);
    if (!node) {
      const id = RP.idOf(x.i); const tm = id ? teamOf(s, id) : null; const img = carPhoto(career(), tm?.id);
      node = document.createElement('div'); node.className = 'rp-car' + (x.i === RP.data.meta.player ? ' me' : ''); node.dataset.i = x.i; node.style.setProperty('--c', tm?.color || '#888');
      node.innerHTML = `<span class="rp-p"></span><span class="rp-t"></span>${img ? `<img src="${esc(img)}" alt="">` : '<i class="rp-shape"></i>'}<b>${esc(ab(x))}</b><small class="rp-g"></small>`;
      box.appendChild(node);
    }
    const g = G[x.i]; const out = isOut(x); const y = Y[x.i];
    node.style.transition = `transform ${dur}s linear`; node.style.transform = `translateY(${y}px)`; node.classList.toggle('out', out); node.classList.toggle('pit', !!x.pit);
    node.querySelector('.rp-p').textContent = x.pos; node.querySelector('.rp-t').innerHTML = x.c != null ? tyreChip(x.c) : '';
    node.querySelector('.rp-g').textContent = out ? 'OUT' : x.pit ? 'PIT' : x.pos === 1 ? 'Leader' : g?.down ? `+${g.down} LAP${g.down > 1 ? 'S' : ''}` : `+${((g?.g || 0) / 1000).toFixed(1)}`;
  });
}
/*
  The track map: every car where it is round the lap. The outline is your own car's path from a weekend session where
  Pitwall has one for the track (exact: the distance round the lap gives the spot), else the circuit's drawing, with
  each car placed by the share of the lap it has done. Under it, who's shown: every car to start with; a tap hides a
  car (or shows it again), and the presets show the top ten or the four cars around you, following the order.
*/
const RP_TRACK_PAD = 6;
/** The outline as points in the map's own units: { pts, len (m), W, H, exact } (null: no outline for this track). */
function replayGeo() {
  if (RP.geo !== undefined) return RP.geo;
  const c = career(); const tid = trackOf(RP.r); const own = c.trackMaps?.[tid]; let pts = null, exact = false, len = 0;
  if (own?.map?.length && own.map.filter(Boolean).length >= own.map.length * 0.6) {
    const m = own.map.slice(); const n = m.length;
    for (let i = 0; i < n; i++) if (!m[i]) { // a gap: in a straight line between the slices either side
      let a = 1; while (!m[(i - a + n) % n]) a++; let b = 1; while (!m[(i + b) % n]) b++;
      const P = m[(i - a + n) % n], Q = m[(i + b) % n], u = a / (a + b); m[i] = [P[0] + (Q[0] - P[0]) * u, P[1] + (Q[1] - P[1]) * u];
    }
    pts = m.map(p => [p[0], p[1]]); if (c.ersFlip?.[tid]) pts = pts.map(p => [-p[0], p[1]]); exact = true; len = own.length || n * 20;
  } else if (A.maps[tid]) {
    const ns = 'http://www.w3.org/2000/svg'; const svg = document.createElementNS(ns, 'svg'); svg.style.cssText = 'position:absolute;width:0;height:0;visibility:hidden';
    const p = document.createElementNS(ns, 'path'); p.setAttribute('d', A.maps[tid]); svg.appendChild(p); document.body.appendChild(svg);
    const T = p.getTotalLength(); pts = Array.from({ length: 400 }, (_, k) => { const q = p.getPointAtLength(k / 400 * T); return [q.x, q.y]; }); svg.remove();
    len = Math.max(1000, ...RP.data.samples.map(S => Math.max(...S.f.map(x => x[3]))));
  }
  if (!pts) return (RP.geo = null);
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]); const x0 = Math.min(...xs), y0 = Math.min(...ys);
  const sc = 100 / Math.max(Math.max(...xs) - x0, Math.max(...ys) - y0, 1);
  const W = (Math.max(...xs) - x0) * sc + RP_TRACK_PAD * 2, H = (Math.max(...ys) - y0) * sc + RP_TRACK_PAD * 2;
  pts = pts.map(p => [(p[0] - x0) * sc + RP_TRACK_PAD, (p[1] - y0) * sc + RP_TRACK_PAD]);
  return (RP.geo = { pts, len, exact, W, H });
}
/** Where a car is on the map, from its distance round the lap. */
function replaySpot(G, dist) {
  const n = G.pts.length; const d = ((dist % G.len) + G.len) % G.len; const f = G.exact ? d / (G.len / n) - 0.5 : d / G.len * n;
  const i = ((Math.floor(f) % n) + n) % n, j = (i + 1) % n, u = f - Math.floor(f); const P = G.pts[i], Q = G.pts[j];
  return [P[0] + (Q[0] - P[0]) * u, P[1] + (Q[1] - P[1]) * u];
}
/** The cars shown on the map now: every car, the top ten, the four around you, or your own pick. */
function replayShown(field) {
  const F = RP.flt ||= { mode: 'all', hide: new Set() }; const run = field.filter(x => x.pos > 0 && (x.st === 2 || x.st === 3)).sort((a, b) => a.pos - b.pos);
  if (F.mode === 'top10') return new Set(run.filter(x => x.pos <= 10).map(x => x.i));
  if (F.mode === 'near') { const k = run.findIndex(x => x.i === RP.data.meta.player); if (k < 0) return new Set(run.map(x => x.i)); const a = Math.max(0, Math.min(k - 2, run.length - 5)); return new Set(run.slice(a, a + 5).map(x => x.i)); }
  return new Set(field.map(x => x.i).filter(i => F.mode === 'all' || !F.hide.has(i)));
}
/** Hides or shows one car (a preset becomes your own pick, starting from the cars it shows). */
function replayToggle(i) {
  const F = RP.flt ||= { mode: 'all', hide: new Set() }; const field = RP.L.field || [];
  if (F.mode !== 'custom') { const on = replayShown(field); F.hide = new Set(field.map(x => x.i).filter(k => !on.has(k))); F.mode = 'custom'; }
  if (F.hide.has(i)) F.hide.delete(i); else F.hide.add(i);
  replayTrack();
}
/** Shows only these drivers on the track map (a story's battle or clash). */
function replayOnly(ids) {
  const all = RP.data.samples[0]?.f.map(x => x[0]) || []; const on = new Set(all.filter(i => ids.includes(RP.idOf(i))));
  if (!on.size) return; RP.flt = { mode: 'custom', hide: new Set(all.filter(i => !on.has(i))) }; replayTrack();
}
function replayTrack() {
  const box = document.getElementById('rp-track'); const fl = document.getElementById('rp-flt'); if (!box || !fl) return;
  const G = replayGeo(); const s = RP.s; const field = (RP.L.field || []).filter(x => x.pos > 0); const me = RP.data.meta.player;
  const ab = (x) => { const id = RP.idOf(x.i); return id ? dAbbr(s, id) : (RP.data.meta.parts?.find(p => p.idx === x.i)?.name || '?').slice(0, 3).toUpperCase(); };
  const col = (x) => { const id = RP.idOf(x.i); return (id && teamColor(s, id)) || '#888'; };
  const shown = replayShown(field);
  const note = document.getElementById('rp-trk-note'); if (note) note.textContent = !G ? '' : G.exact ? 'Outline from your own laps' : 'Circuit drawing: positions approximate';
  if (!G) box.innerHTML = '<div class="muted" style="font-size:13px">No outline for this track yet: it comes from your car’s position in a weekend session.</div>';
  else {
    let svg = box.querySelector('svg');
    if (!svg) {
      const pt = (p) => p.map(v => v.toFixed(2)).join(','); const [sx, sy] = replaySpot(G, 0);
      box.innerHTML = `<svg viewBox="0 0 ${G.W.toFixed(1)} ${G.H.toFixed(1)}"><polyline class="rp-trk-line" points="${G.pts.map(pt).join(' ')} ${pt(G.pts[0])}"/><circle class="rp-trk-start" cx="${sx.toFixed(2)}" cy="${sy.toFixed(2)}" r="1.4"/><g class="rp-trk-cars"></g></svg>`;
      svg = box.querySelector('svg');
    }
    const g = svg.querySelector('.rp-trk-cars'); const dur = Math.min(1, 1 / RP.speed);
    // back to front: the leader drawn last, your car on top of everyone
    const order = field.slice().sort((a, b) => (a.i === me) - (b.i === me) || b.pos - a.pos);
    for (const x of order) {
      let node = g.querySelector(`[data-i="${x.i}"]`);
      if (!node) { node = document.createElementNS('http://www.w3.org/2000/svg', 'g'); node.dataset.i = x.i; node.setAttribute('class', 'rp-dot' + (x.i === me ? ' me' : '')); node.innerHTML = `<circle r="${x.i === me ? 2.6 : 2.1}" fill="${col(x)}"/><text x="3.2" y="1.2">${esc(ab(x))}</text>`; }
      g.appendChild(node); // keeps the drawing order
      const vis = shown.has(x.i) && (x.st === 2 || x.st === 3); const [px, py] = replaySpot(G, x.dist || 0);
      node.style.transition = node.dataset.on === '1' ? `transform ${dur}s linear` : 'none'; node.style.transform = `translate(${px.toFixed(2)}px, ${py.toFixed(2)}px)`;
      node.style.display = vis ? '' : 'none'; node.dataset.on = vis ? '1' : '0'; node.classList.toggle('pit', !!x.pit);
    }
  }
  // the filter: presets, then every car (in team order, so the buttons stay put while the order changes)
  const F = RP.flt;
  if (+fl.dataset.n !== field.length) {
    const tix = (x) => { const t = teamOf(s, RP.idOf(x.i)); const k = t ? s.teams.indexOf(t) : -1; return k < 0 ? 99 : k; };
    const byTeam = field.slice().sort((a, b) => tix(a) - tix(b) || a.i - b.i);
    fl.innerHTML = `<div class="seg rp-flt-modes">${[['all', 'Everyone'], ['top10', 'Top 10'], ['near', 'Around me']].map(([v, l]) => `<button data-act="rp-flt-mode" data-v="${v}">${l}</button>`).join('')}</div>
      <div class="rp-flt-cars">${byTeam.map(x => `<button class="rp-chip${x.i === me ? ' me' : ''}" data-act="rp-flt" data-i="${x.i}" style="--c:${col(x)}"><span class="rp-chip-p"></span>${esc(ab(x))}</button>`).join('')}</div>`;
    fl.dataset.n = field.length;
  }
  fl.querySelectorAll('[data-act="rp-flt-mode"]').forEach(b => b.classList.toggle('on', b.dataset.v === F.mode));
  const pos = Object.fromEntries(field.map(x => [x.i, x.pos]));
  fl.querySelectorAll('.rp-chip').forEach(b => { const i = +b.dataset.i; b.classList.toggle('off', !shown.has(i)); b.querySelector('.rp-chip-p').textContent = pos[i] ? 'P' + pos[i] : ''; });
}
/** The position chart up to where the replay is. */
function replayChart() {
  const N = RP.data.meta.totalLaps || 1; const field = RP.L.field || []; const s = RP.s;
  const n = Math.max(...field.map(x => x.pos || 0), 2); const W = 640, H = n * 16 + 24, X = (l) => 30 + l / N * (W - 80), Y = (p) => 12 + (p - 1) * 16;
  const lines = field.map(x => {
    const P = RP.posLaps[x.i] || []; const upto = Math.max(0, (x.lap || 1) - 1); const pts = []; for (let l = 0; l <= upto; l++) if (P[l]) pts.push(`${X(l).toFixed(1)},${Y(P[l])}`);
    if (x.pos) pts.push(`${X(Math.min(N, upto + (x.dist > 0 ? 0.5 : 0))).toFixed(1)},${Y(x.pos)}`);
    const id = RP.idOf(x.i); const col = id ? teamColor(s, id) : '#888'; const me = x.i === RP.data.meta.player;
    const last = pts[pts.length - 1]?.split(','); const lab = id ? dAbbr(s, id) : '';
    return pts.length < 2 ? '' : `<polyline points="${pts.join(' ')}" fill="none" stroke="${col}" stroke-width="${me ? 3 : 1.6}" opacity="${me ? 1 : 0.7}"/>${last ? `<text x="${+last[0] + 5}" y="${+last[1] + 4}" font-size="10" fill="${me ? 'var(--fg)' : 'var(--muted)'}">${esc(lab)}</text>` : ''}`;
  }).join('');
  const grid = Array.from({ length: n }, (_, k) => `<text x="4" y="${Y(k + 1) + 4}" font-size="9" fill="var(--muted)">${k + 1}</text>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto">${grid}${lines}</svg>`;
}
function replayLoop() {
  clearInterval(RP?.timer); if (!RP?.playing) return; RP.last = performance.now();
  RP.timer = setInterval(() => {
    if (!RP?.playing || ui.view !== 'replay') { if (RP) { RP.playing = false; clearInterval(RP.timer); } return; }
    const now = performance.now(); RP.T = Math.min(RP.dur, RP.T + (now - RP.last) / 1000 * RP.speed); RP.last = now;
    if (RP.T >= RP.dur) { RP.playing = false; clearInterval(RP.timer); }
    replayShow();
  }, 100);
}
