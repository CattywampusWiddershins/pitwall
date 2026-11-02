/* Pitwall — The Current Weekend page. Part of the renderer, split into files that load in order (see index.html). */
'use strict';
/*
  Current weekend: what this weekend's practice says about qualifying and the race.
  Qualifying: each driver's ideal lap, their best sector 1, 2 and 3 from any practice session, sets the likely grid.
  Race: the whole grid's long runs give the best strategy and its time; each driver's own long runs say how much
  faster or slower they are than the grid on the same tyres (where they did none, their ideal-lap gap stands in), and
  starting further back costs a little in traffic. Teams and drivers are then ranked on race pace per lap.
*/
const SECTOR_OK = [2, 4, 8]; // the game's validity flag for sector 1, 2 and 3
/** Each driver's ideal lap from practice and the sprint shootout: { d: { ideal, best, sectors: [s1, s2, s3] } }. */
function idealLaps(s, round) {
  const w = s.weekends[round.id]; const out = {};
  for (const k of IDEAL_KEYS) {
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
  const n = raceLaps(s, round.id); const grid = strategyRuns(s, round).grid; const ideal = idealLaps(s, round);
  const comps = Object.keys(grid); if (!comps.length) return null;
  const plan = comps.length >= 2 ? optimalStrategies(grid, n, { loss: pitLoss(career(), trackOf(round)).green })[0] : null;
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
function renderCurrentWeekend() {
  if (ui.nowTab === 'live') return renderLiveRace();
  const c = career(); const s = latestSeason(); const r = nextRound(s);
  const head = (sub) => `<div class="page-head"><div><h1>Current Weekend</h1><div class="sub">${sub}</div></div>${nowTabs()}</div>`;
  if (!r || isHist(s)) return `<div class="page">${head('No weekend left to run this season.')}</div>`;
  const rounds = activeRounds(s); const w = s.weekends[r.id];
  const done = sessionsFor(s, r).filter(k => w?.sessions?.[k]?.done);
  const ideal = idealLaps(s, r);
  const qRows = Object.entries(ideal).sort((a, b) => a[1].ideal - b[1].ideal);
  const q = w?.sessions?.Q; const qPos = (d) => q?.done ? q.results.findIndex(x => x.d === d) + 1 : null;
  const qMax = qRows.length ? Math.max(1, ...qRows.map(([, o]) => o.ideal - qRows[0][1].ideal)) : 1;
  const quali = qRows.length ? practiceRows(c, s, qRows.map(([d, o], k) => ({ id: d, me: d === PLAYER, name: lastName(dName(s, d)), sub: `Ideal ${fmtLap(o.ideal)} · best lap ${isFinite(o.best) ? fmtLap(o.best) : '–'}${qPos(d) ? ` · qualified P${qPos(d)}` : ''}`, val: k ? '+' + ((o.ideal - qRows[0][1].ideal) / 1000).toFixed(3) : fmtLap(o.ideal), pct: 100 - (o.ideal - qRows[0][1].ideal) / qMax * 70 }))) : '<div class="empty">No practice laps from F1 25 yet. Run practice with telemetry on: each driver\'s best sectors make their ideal lap.</div>';
  const F = raceForecast(s, r);
  const rMax = F ? Math.max(1, ...F.order.map(x => x.t - F.order[0].t)) : 1;
  const race = F ? practiceRows(c, s, F.order.map((x, k) => ({ id: x.d, me: x.d === PLAYER, name: lastName(dName(s, x.d)), sub: `Starts P${x.start} · ${fmtLap(Math.round(x.t / F.n))} a lap${x.est ? ' · est.' : ''}`, val: k ? '+' + ((x.t - F.order[0].t) / 1000).toFixed(1) : 'P1', pct: 100 - (x.t - F.order[0].t) / rMax * 70 }))) : '<div class="empty">No long runs in practice yet: three or more consecutive clean laps on a compound make a run.</div>';
  const best = F?.teams[0]?.off ?? 0;
  const tMax = F?.teams.length ? Math.max(1, ...F.teams.map(o => o.off - best)) : 1;
  const teamBoard = F?.teams.length ? practiceRows(c, s, F.teams.map((o, k) => ({ team: o.team, me: o.team.id === s.playerTeamId, name: o.team.name, sub: 'Pace per lap, long runs', val: k ? gapS(o.off - best) : 'Fastest', pct: 100 - (o.off - best) / tMax * 70 }))) : '';
  const dBest = F ? Math.min(...F.order.map(x => x.off)) : 0;
  const dSorted = F?.order.length ? F.order.slice().sort((a, b) => a.off - b.off) : []; const dMax = dSorted.length ? Math.max(1, ...dSorted.map(x => x.off - dBest)) : 1;
  const drvBoard = dSorted.length ? practiceRows(c, s, dSorted.map((x, k) => ({ id: x.d, me: x.d === PLAYER, name: lastName(dName(s, x.d)), sub: `${esc(teamOf(s, x.d)?.name || '')}${x.est ? ' · est. from the ideal lap' : ''}`, val: k ? gapS(x.off - dBest) : 'Fastest', pct: 100 - (x.off - dBest) / dMax * 70 }))) : '';
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
    ${flLapPanel(c, s, r)}
    ${tyreAllocPanel(c, s, r)}
    ${strategyAdvicePanel(c, s)}
    ${(() => { const r = nextRound(s); return r && !isHist(s) ? fuelPanel(c, s, r, c.type === 'myteam' ? (s.teams.find(t => t.id === s.playerTeamId)?.drivers || []).filter(Boolean) : [PLAYER]) : ''; })()}
    ${ersPanel(c, s, r, 'quali')}
    ${ersPanel(c, s, r)}
  </div>`;
}

/*
  Fastest lap head to head: any two drivers' quickest laps of the weekend so far, F1 TV style. The track map is coloured
  by who was quicker through each part of the lap, and both cars set off together and drive their laps on it, so you
  can see where the time goes; under it the speed through the lap and the gap between them. It needs the lap traces
  Pitwall records while connected to the game (every car's speed, throttle, brake and place on track).
*/
function flTimes(t) {
  // seconds into the lap at the end of each slice, from the speed through it, scaled to the real lap time
  const raw = t.spd.map(v => t.bin / Math.max(5, (v || 60) / 3.6)); const sum = raw.reduce((a, b) => a + b, 0) || 1;
  let acc = 0; return raw.map(v => (acc += v * (t.ms / 1000) / sum));
}
function flShares(t) {
  const dt = flTimes(t).map((v, i, a) => v - (a[i - 1] || 0)); const tot = dt.reduce((a, b) => a + b, 0) || 1;
  const sh = (f) => Math.round(dt.reduce((a, v, i) => a + (f(i) ? v : 0), 0) / tot * 100);
  const full = sh(i => (t.thr[i] ?? 0) >= 95), brake = sh(i => (t.brk[i] ?? 0) >= 50);
  return { full, brake, corner: Math.max(0, 100 - full - brake) };
}
function flLapPanel(c, s, r) {
  const T = s.weekends[r.id]?.traces || {}; const ids = Object.keys(T).filter(id => s.drivers[id]).sort((a, b) => T[a].ms - T[b].ms);
  const head = `<div class="panel-h"><h2>Fastest lap head to head</h2><span class="muted" style="font-size:12px">Each driver’s quickest lap of the weekend so far</span></div>`;
  if (ids.length < 2) return `<div class="panel">${head}<div class="panel-b muted" style="font-size:13px">Needs two drivers’ laps recorded from F1 25 this weekend: Pitwall records every car’s speed, throttle, brake and line through the lap while it’s connected to the game.</div></div>`;
  const a = ids.includes(ui.flA) ? ui.flA : ids[0]; let b = ids.includes(ui.flB) && ui.flB !== a ? ui.flB : (ids.includes(PLAYER) && PLAYER !== a ? PLAYER : ids.find(x => x !== a));
  const A = T[a], B = T[b]; const n = Math.min(A.spd.length, B.spd.length);
  const tA = flTimes(A).slice(0, n), tB = flTimes(B).slice(0, n);
  const colA = teamColor(s, a), colB0 = teamColor(s, b); const colB = colA === colB0 ? '#F5E14A' : colB0; // teammates: the second in yellow, as on TV
  const sel = (k, v) => `<select data-ch="fl-pick" data-k="${k}" style="width:auto">${ids.map(id => `<option value="${id}" ${id === v ? 'selected' : ''}>${esc(dName(s, id))} · ${fmtLap(T[id].ms)}</option>`).join('')}</select>`;
  // the map: the line of the quicker lap, each slice in the colour of the driver who gained time through it
  const P = (A.x.some(v => v != null) ? A : B); const xs = P.x.slice(0, n), zs = P.z.slice(0, n);
  const ok = xs.map((v, i) => v != null && zs[i] != null);
  const minX = Math.min(...xs.filter((v, i) => ok[i])), maxX = Math.max(...xs.filter((v, i) => ok[i])), minZ = Math.min(...zs.filter((v, i) => ok[i])), maxZ = Math.max(...zs.filter((v, i) => ok[i]));
  const W = 520, H = 300, pad = 18; const sc = Math.min((W - 2 * pad) / ((maxX - minX) || 1), (H - 2 * pad) / ((maxZ - minZ) || 1));
  const ox = (W - (maxX - minX) * sc) / 2, oz = (H - (maxZ - minZ) * sc) / 2;
  const pt = (i) => ok[i] ? [Math.round((xs[i] - minX) * sc + ox), Math.round((zs[i] - minZ) * sc + oz)] : null;
  const pts = xs.map((_, i) => pt(i));
  let segs = '';
  for (let i = 1; i < n; i++) { const p0 = pts[i - 1], p1 = pts[i]; if (!p0 || !p1) continue; const gain = (tB[i] - tB[i - 1]) - (tA[i] - tA[i - 1]); segs += `<line x1="${p0[0]}" y1="${p0[1]}" x2="${p1[0]}" y2="${p1[1]}" stroke="${gain >= 0 ? colA : colB}" stroke-width="7" stroke-linecap="round"/>`; }
  const anim = JSON.stringify({ p: pts, a: tA.map(v => Math.round(v * 1000)), b: tB.map(v => Math.round(v * 1000)) });
  // the speed trace and the gap
  const vmax = Math.max(...A.spd.slice(0, n), ...B.spd.slice(0, n)), vmin = Math.min(...A.spd.slice(0, n).filter(v => v != null), ...B.spd.slice(0, n).filter(v => v != null));
  const CW = 1000, CH = 240; const cx = (i) => 40 + i * (CW - 60) / (n - 1); const cy = (v) => 20 + (1 - ((v ?? vmin) - vmin) / ((vmax - vmin) || 1)) * (CH - 40);
  const line = (arr, col) => `<polyline points="${arr.slice(0, n).map((v, i) => `${cx(i).toFixed(1)},${cy(v).toFixed(1)}`).join(' ')}" fill="none" stroke="${col}" stroke-width="2.2"/>`;
  const dl = tA.map((v, i) => v - tB[i]); const dm = Math.max(0.05, ...dl.map(Math.abs));
  const dy = (v) => 50 + v / dm * 40; // a negative gap (the first driver ahead) is up
  const shA = flShares(A), shB = flShares(B); const gap = (B.ms - A.ms) / 1000;
  const side = (id, t, sh, col, right) => `<div class="flh-drv" style="--c:${col};${right ? 'text-align:right' : ''}"><div class="flh-nm"><small>${esc(dName(s, id).split(' ').slice(0, -1).join(' '))}</small><b>${esc(lastName(dName(s, id)).toUpperCase())}</b><small>${esc(teamOf(s, id)?.name || '')} · ${SESSION_SHORT[t.key] || ''} · lap ${t.lap}</small></div>
    <div class="flh-kv"><div><span>LAP TIME</span><b>${fmtLap(t.ms)}</b></div><div><span>GAP</span><b>${id === a ? (gap > 0 ? '−' : '+') : (gap > 0 ? '+' : '−')}${Math.abs(gap).toFixed(3)}s</b></div></div>
    ${[['Full throttle', sh.full], ['Heavy braking', sh.brake], ['Cornering', sh.corner]].map(([k, v]) => `<div class="flh-pc"><span>${k}</span><i><em style="width:${v}%"></em></i><b>${v}%</b></div>`).join('')}</div>`;
  return `<div class="panel">${head}<div class="panel-b stack">
    <div class="row" style="gap:8px;flex-wrap:wrap">${sel('a', a)}<span class="muted">v</span>${sel('b', b)}</div>
    <div class="flh">${side(a, A, shA, colA, false)}
      <div class="flh-map"><svg viewBox="0 0 ${W} ${H}" data-flanim='${esc(anim)}'><g>${segs}</g><circle class="fl-car" data-k="a" r="8" fill="${colA}" stroke="#fff" stroke-width="2"/><circle class="fl-car" data-k="b" r="8" fill="${colB}" stroke="#111" stroke-width="2"/></svg>
        <div class="muted" style="font-size:11px;text-align:center"><span style="color:${colA}">■</span> ${esc(lastName(dName(s, a)))} quicker · <span style="color:${colB}">■</span> ${esc(lastName(dName(s, b)))} quicker · both laps start together</div></div>
      ${side(b, B, shB, colB, true)}</div>
    <svg class="flh-chart" viewBox="0 0 ${CW} ${CH}"><text x="6" y="14" fill="#9AA" font-size="11">SPEED · ${vmin}–${vmax} KM/H</text>${line(B.spd, colB)}${line(A.spd, colA)}</svg>
    <svg class="flh-chart" viewBox="0 0 ${CW} 100"><text x="6" y="12" fill="#9AA" font-size="11">${esc(lastName(dName(s, a)))} FASTER</text><text x="6" y="96" fill="#9AA" font-size="11">SLOWER</text><line x1="40" x2="${CW - 20}" y1="50" y2="50" stroke="${colB}" stroke-width="1.5"/><polyline points="${dl.map((v, i) => `${cx(i).toFixed(1)},${dy(v).toFixed(1)}`).join(' ')}" fill="none" stroke="${colA}" stroke-width="2.2"/></svg>
  </div></div>`;
}
/** Drives both cars round the map: they start together, each at its own lap's pace, then wait a moment and go again. */
let _flRaf = null;
function flAnimate() {
  cancelAnimationFrame(_flRaf); const svgs = [...document.querySelectorAll('svg[data-flanim]')]; if (!svgs.length) return;
  const D2 = svgs.map(el => ({ el, d: JSON.parse(el.dataset.flanim), cars: el.querySelectorAll('.fl-car') }));
  const t0 = performance.now();
  const at = (p, cum, t) => { let i = cum.findIndex(v => v >= t); if (i < 0) i = cum.length - 1; let k = i; while (k > 0 && !p[k]) k--; return p[k] || p.find(Boolean); };
  const step = (now) => {
    if (!document.body.contains(D2[0].el)) return;
    for (const { d, cars } of D2) {
      const len = Math.max(d.a[d.a.length - 1], d.b[d.b.length - 1]); const t = ((now - t0) % (len + 1500));
      cars.forEach(cv => { const q = at(d.p, d[cv.dataset.k], t); if (q) { cv.setAttribute('cx', q[0]); cv.setAttribute('cy', q[1]); } });
    }
    _flRaf = requestAnimationFrame(step);
  };
  _flRaf = requestAnimationFrame(step);
}
