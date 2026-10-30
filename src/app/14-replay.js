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
  const out = [];
  for (const x of replayList || []) for (const s of c.seasons) for (const [rid, w] of Object.entries(s.weekends || {})) for (const [k, sd] of Object.entries(w.sessions || {}))
    if (sd?.game?.key === x.key) { const r = s.calendar.find(y => y.id === rid); if (r) out.push({ x, s, r, k }); }
  return out.sort((a, b) => b.s.index - a.s.index || b.s.calendar.indexOf(b.r) - a.s.calendar.indexOf(a.r));
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
  const D = await replayApi().load(item.x.key); if (!D?.samples?.length) { toast('That recording couldn’t be read'); return; }
  const c = career(); const map = liveMap(c, item.s, { parts: D.meta.parts, player: D.meta.player }); const idOf = (i) => map[i];
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
  const owned = new Set(state.careers.flatMap(cc => replaysHere(cc).map(x => x.x.key))); const orphans = (replayList || []).filter(x => !owned.has(x.key));
  const keepSel = `<label class="row" style="gap:6px">Keep recordings for <select data-ch="rp-keep">${[[0, 'every season'], [1, 'this season only'], [2, 'the last 2 seasons'], [3, 'the last 3 seasons'], [5, 'the last 5 seasons']].map(([v, l]) => `<option value="${v}" ${(c.replayKeep || 0) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>${orphans.length ? `<button class="btn sm ghost" data-act="rp-orphans">Delete ${plural(orphans.length, 'recording')} from no career (${mb(orphans.reduce((a, x) => a + (x.bytes || 0), 0))})</button>` : ''}`;
  const sub = 'Every race you drive with telemetry on is recorded, a sample a second, and can be played back here at up to 20x. Races from before Pitwall 3.7, races without telemetry and historic seasons can’t be replayed.';
  if (!list.length) return `<div class="page">${head(sub)}<div class="row" style="gap:12px;margin-bottom:12px">${keepSel}</div><div class="panel"><div class="panel-b muted">No recorded races in this career yet. Drive a race with telemetry on and it appears here once it’s logged.</div></div></div>`;
  const bySeason = {}; list.forEach(x => (bySeason[x.s.year] ||= []).push(x));
  return `<div class="page">${head(sub)}
    <div class="row" style="gap:12px;margin-bottom:12px;flex-wrap:wrap">${keepSel}</div>
    <div class="tiles"><div class="tile"><span class="label">Recorded races</span><span class="v">${list.length}</span></div><div class="tile"><span class="label">On disk</span><span class="v">${mb(list.reduce((a, x) => a + (x.x.bytes || 0), 0))}</span></div></div>
    ${Object.entries(bySeason).sort((a, b) => b[0] - a[0]).map(([y, xs]) => `<div class="panel"><div class="panel-h"><h2>${y}</h2><button class="btn sm ghost" data-act="rp-del-season" data-y="${y}">Delete ${y}’s recordings</button></div><div class="panel-b tight table-wrap"><table><tbody>
      ${xs.map(x => `<tr><td class="num">R${x.s.calendar.filter(q => !q.off).indexOf(x.r) + 1}</td><td><b>${esc(x.r.name)}</b> <span class="muted">${esc(SESSION_LABEL[x.k] || x.k)}</span></td><td class="muted">${x.x.laps ? plural(x.x.laps, 'lap') : ''}</td><td class="muted">${x.x.bytes ? mb(x.x.bytes) : ''}</td>
        <td style="text-align:right"><button class="btn sm primary" data-act="rp-open" data-k="${esc(x.x.key)}">Watch</button> <button class="btn sm ghost" data-act="rp-del" data-k="${esc(x.x.key)}">Delete</button></td></tr>`).join('')}
    </tbody></table></div></div>`).join('')}</div>`;
}
/** Deletes this career's recordings older than the seasons it keeps (once per listing). */
function replayPrune(c) {
  const keep = c.replayKeep || 0; if (!keep || replayPrune.done === replayList) return; replayPrune.done = replayList;
  const last = latestSeason().year; const old = replaysHere(c).filter(x => x.s.year <= last - keep);
  if (old.length) Promise.all(old.map(x => replayApi().remove(x.x.key))).then(() => { replayList = null; render(); toast(`${plural(old.length, 'old recording')} deleted`); });
}
function replayView(c) {
  setTimeout(() => replayShow(true));
  return `<div class="page">
    <div class="page-head"><div><h1>${esc(RP.r.name)} · ${esc(SESSION_LABEL[RP.k] || RP.k)}</h1><div class="sub">${RP.s.year} · replay of the live feed</div></div><div class="row"><button class="btn ghost" data-act="rp-close">All races</button></div></div>
    <div class="panel rp-controls"><div class="panel-b row" style="gap:12px;flex-wrap:wrap;align-items:center">
      <button class="btn primary" data-act="rp-play" id="rp-play">${RP.playing ? 'Pause' : 'Play'}</button>
      <input type="range" id="rp-seek" data-ch="rp-seek" min="0" max="${Math.ceil(RP.dur)}" step="1" value="${Math.floor(RP.T)}" style="flex:1;min-width:200px">
      <span id="rp-clock" class="num" style="min-width:150px"></span>
      <label class="row" style="gap:6px">Speed <input type="range" data-ch="rp-speed" min="1" max="20" step="1" value="${RP.speed}" style="width:120px"><b id="rp-speed">${RP.speed}x</b></label></div></div>
    <div class="rp-grid"><div class="panel"><div class="panel-h"><h2>The field</h2><span class="muted" style="font-size:12px" id="rp-lap"></span></div><div class="panel-b"><div class="rp-vis" id="rp-vis" style="height:${RP_H}px"></div></div></div>
      <div class="stack" style="gap:16px"><div id="rp-dash"></div><div class="panel"><div class="panel-h"><h2>Positions</h2></div><div class="panel-b" id="rp-chart"></div></div></div></div></div>`;
}
/** Shows the replay at its time: the field every step, the dashboard once a second, the chart each new lap. */
function replayShow(force = false) {
  if (!RP || ui.view !== 'replay' || !document.getElementById('rp-vis')) return;
  const idx = replayIdx(RP.T); const now = performance.now();
  if (idx !== RP.i || force) { replayTo(idx); RP.i = idx; replayVis(); }
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
  const c = career(); const L = { ...RP.L, key: RP.k === 'SPR' ? 'SPR' : 'R', replay: true, mem: RP.mem, simT: RP.data.samples[RP.i].t * 1000 };
  const me = L.field?.find(x => x.i === RP.data.meta.player); if (!me) return '';
  try { return liveDriverCol(c, RP.s, RP.r, L, weekend(RP.s, RP.r.id, true), me, PLAYER, RP.idOf); } catch (e) { return `<div class="panel"><div class="panel-b muted">The dashboard couldn’t be drawn at this point (${esc(e.message)}).</div></div>`; }
}
/** The field by its gaps to the leader, F1-graphics style: each car slides as the gaps change. */
function replayVis() {
  const box = document.getElementById('rp-vis'); const L = RP.L; const s = RP.s; const field = L.field || [];
  const G = raceGaps(field); const ab = (x) => { const id = RP.idOf(x.i); return id ? dAbbr(s, id) : (RP.data.meta.parts?.find(p => p.idx === x.i)?.name || '?').slice(0, 3).toUpperCase(); };
  const running = field.filter(x => x.pos > 0).sort((a, b) => a.pos - b.pos);
  const onLap = running.filter(x => (G[x.i]?.down || 0) === 0 && x.st === 2);
  const maxGap = Math.max(5000, ...onLap.map(x => G[x.i]?.g || 0));
  const target = Math.max(3, Math.min(60, (RP_H - 60) / (maxGap / 1000))); RP.scale = RP.scale + (target - RP.scale) * 0.25;
  const dur = Math.min(1, 1 / RP.speed);
  // the second markers
  const step = [1, 2, 5, 10, 15, 30, 60, 120].find(v => v * RP.scale >= 48) || 120; let ticks = '';
  for (let v = step; v * RP.scale < RP_H - 30; v += step) ticks += `<div class="rp-tick" style="top:${12 + v * RP.scale}px"><span>+${v} s</span></div>`;
  let tk = box.querySelector('.rp-ticks'); if (!tk) { tk = document.createElement('div'); tk.className = 'rp-ticks'; box.appendChild(tk); } tk.innerHTML = ticks;
  let y0 = -99;
  running.forEach(x => {
    let node = box.querySelector(`.rp-car[data-i="${x.i}"]`);
    if (!node) {
      const id = RP.idOf(x.i); const tm = id ? teamOf(s, id) : null; const img = carPhoto(career(), tm?.id);
      node = document.createElement('div'); node.className = 'rp-car' + (x.i === RP.data.meta.player ? ' me' : ''); node.dataset.i = x.i; node.style.setProperty('--c', tm?.color || '#888');
      node.innerHTML = `<span class="rp-p"></span><span class="rp-t"></span>${img ? `<img src="${esc(img)}" alt="">` : '<i class="rp-shape"></i>'}<b>${esc(ab(x))}</b><small class="rp-g"></small>`;
      box.appendChild(node);
    }
    const g = G[x.i]; const out = x.st !== 2 && x.st !== 3; let y;
    if (out) y = RP_H - 22; else if (g?.down) y = RP_H - 44; else y = 12 + (g?.g || 0) / 1000 * RP.scale;
    y = Math.min(RP_H - 22, Math.max(y, y0 + 16)); y0 = y;
    node.style.transition = `transform ${dur}s linear`; node.style.transform = `translateY(${y}px)`; node.classList.toggle('out', out); node.classList.toggle('pit', !!x.pit);
    node.querySelector('.rp-p').textContent = x.pos; node.querySelector('.rp-t').innerHTML = x.c != null ? tyreChip(x.c) : '';
    node.querySelector('.rp-g').textContent = out ? 'OUT' : x.pit ? 'PIT' : x.pos === 1 ? 'Leader' : g?.down ? `+${g.down} LAP${g.down > 1 ? 'S' : ''}` : `+${((g?.g || 0) / 1000).toFixed(1)}`;
  });
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
