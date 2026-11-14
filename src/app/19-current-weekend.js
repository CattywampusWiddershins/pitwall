/* Pitwall — The Current Weekend page. Part of the renderer, split into files that load in order (see index.html). */
'use strict';
/*
  Current weekend: what this weekend's practice says about qualifying and the race.
  Qualifying: each driver's ideal lap, their best sector 1, 2 and 3 from any practice session, sets the likely grid.
  Race: the whole grid's long runs give the best strategy and its time; each driver's own long runs say how much
  faster or slower they are than the grid on the same tyres (where they did none, their ideal-lap gap stands in), and
  starting further back costs a little in traffic. Teams and drivers are then ranked on race pace per lap.
  Both are then weighed with recent form (3.35.0). Re-run on the 19 weekends of 2026 against what happened, practice
  on its own put the field about twice as far apart as it really was (real gaps were 56% of practice's in qualifying,
  42% in the race), and made the player look 1.2 s quicker in qualifying than they turned out (0.8 s a lap in the
  race; everyone else within 0.04 s). So each driver's gap to the field is 30% their practice gap at half size and
  70% their actual gap over their last 10 weekends: qualifying came out 0.49 s off on average instead of 0.65, race
  pace 0.35 s a lap instead of 0.57. A driver with no recent weekends goes on half-size practice alone.
*/
const FC_PRACTICE = 0.3, FC_SCALE = 0.5, FC_FORM = 10;
const _fcAct = new Map();
/** What a finished weekend showed: each driver's gap to the field's median in qualifying (their best lap) and in race pace (their typical clean lap, fuel and ERS evened out). { q, r } or null. */
function weekendActuals(s, r) {
  const key = `${s.index}:${r.id}`; const hit = _fcAct.get(key); if (hit?.gen === renderGen) return hit.v;
  const w = s.weekends[r.id]; const Q = w?.sessions?.Q, R = w?.sessions?.R; let v = null;
  const center = (m) => { const x = Object.values(m); if (x.length < 6) return null; const md = median(x); return Object.fromEntries(Object.entries(m).map(([d, t]) => [d, t - md])); };
  if (Q?.game?.laps || (R?.done && R?.game?.laps)) {
    const aQ = {}; for (const [d, L] of Object.entries(Q?.game?.laps || {})) { const t = L.filter(l => l[0] && l[1]).map(l => l[0]); if (t.length) aQ[d] = Math.min(...t); }
    const aR = {};
    if (R?.done && R.game?.laps) for (const d of Object.keys(R.game.laps)) {
      const N = normLaps(R, d).laps; const bad = new Set([1]); stintsOf(R, d).forEach(x => { bad.add(x.from); bad.add(x.to); });
      const t = N.map((x, i) => bad.has(i + 1) ? null : x).filter(Boolean); if (t.length < 8) continue; const b = Math.min(...t); aR[d] = median(t.filter(x => x <= b * 1.03));
    }
    v = { q: center(aQ), r: center(aR) };
  }
  _fcAct.set(key, { gen: renderGen, v }); return v;
}
/**
 * Each driver's average gap to the field over the last FC_FORM weekends before this one (this season and earlier):
 * kind 'q' or 'r'. A weekend counts the driver's own gap if they were in the same team then; otherwise (a move, a
 * rookie) the gap of the team they drive for now, its drivers' average that weekend: the car they'll have.
 */
function recentForm(c, s, round, kind) {
  const past = [];
  for (const ss of c.seasons.slice(0, s.index + 1)) { if (isHist(ss)) continue; for (const r of activeRounds(ss)) { if (ss.index === s.index && r === round) break; const a = weekendActuals(ss, r)?.[kind]; if (a) past.push({ ss, a }); } }
  const now = Object.fromEntries(gridIds(s).map(d => [d, teamRoot(teamOf(s, d)?.id)]));
  const by = {};
  for (const { ss, a } of past.reverse()) {
    const teamGap = {}; for (const [d, g] of Object.entries(a)) { const t = teamRoot(teamOf(ss, d)?.id); if (t) (teamGap[t] ||= []).push(g); }
    for (const [d, t] of Object.entries(now)) {
      const v = by[d] ||= []; if (v.length >= FC_FORM) continue;
      const same = a[d] != null && teamRoot(teamOf(ss, d)?.id) === t;
      const g = same ? a[d] : teamGap[t] ? avg(teamGap[t]) : null; if (g != null) v.push(g);
    }
  }
  return Object.fromEntries(Object.entries(by).filter(([, v]) => v.length).map(([d, v]) => [d, avg(v)]));
}
/** A practice gap (to the field's median) weighed with recent form, and centred again. */
function blendGaps(prac, form) {
  const md = median(Object.values(prac)); const out = {};
  for (const d of new Set([...Object.keys(prac), ...Object.keys(form)])) {
    const pv = prac[d] != null ? (prac[d] - md) * FC_SCALE : null, fv = form[d];
    out[d] = pv != null && fv != null ? FC_PRACTICE * pv + (1 - FC_PRACTICE) * fv : pv ?? fv;
  }
  const m2 = median(Object.values(out)); for (const d in out) out[d] -= m2; return out;
}
/**
 * After Friday: what practice says about the weekend, team by team, as it stood once Friday was over (Practice 1 and
 * 2, or Practice 1 on a sprint weekend), so the story doesn't change when later sessions come in. Qualifying: each
 * team's quicker car in the qualifying forecast. Race: the race forecast's long-run pace per lap, the team's average.
 * Overall: the two counted equally. Long runs: every lap of every dry run of three laps or more, with the fuel and ERS
 * evened out as the forecast does, less the grid's pace on that tyre at that age, so the spread is the car and driver,
 * not the soft against the hard. { keys, teams: [{ team, q, r, all, box: [min, q1, med, q3, max] }] (ms, gaps to the
 * best), front: [driver ids], plan } or null without F1 25 lap data.
 */
const _friday = new Map();
function fridayKeys(s, r) { const fp = sessionsFor(s, r).filter(k => /^FP/.test(k)); return fp.slice(0, r.sprint ? 1 : 2); }
function fridayOutlook(c, s, r) {
  const w = s.weekends[r.id]; const keys = fridayKeys(s, r);
  if (!keys.length || !keys.every(k => w?.sessions?.[k]?.done) || !keys.some(k => w.sessions[k].game?.laps && !w.sessions[k].estimated)) return null;
  const ck = `${s.index}:${r.id}:${keys.map(k => w.sessions[k].game?.key || w.sessions[k].game?.at || '').join()}:${renderGen}`;
  if (_friday.has(ck)) return _friday.get(ck);
  // the season as it stood on Friday evening: this weekend with only Friday's sessions
  const sv = Object.create(s); sv.weekends = { ...s.weekends, [r.id]: { ...w, sessions: Object.fromEntries(keys.map(k => [k, w.sessions[k]])) } };
  let out = null;
  try {
    const QF = qualiForecast(c, sv, r); const F = raceForecast(sv, r);
    if (QF.length && F?.teams.length) {
      const T = {}; const get = (t) => T[t.id] ||= { team: t, q: null, r: null, laps: [] };
      for (const x of QF) { const t = teamOf(s, x.d); if (t) { const o = get(t); o.q = o.q == null ? x.gap : Math.min(o.q, x.gap); } }
      for (const o of F.teams) get(o.team).r = o.off;
      const grid = gridRuns(sv, r);
      for (const d of gridIds(s)) {
        const t = teamOf(s, d); if (!t) continue;
        for (const k of keys) {
          const sd = w.sessions[k]; if (!sd?.game?.laps?.[d] || sd.estimated) continue; const N = normLaps(sd, d).laps;
          for (const x of practiceStints(sd, d)) {
            const g = grid[x.c]; if (!DRY.includes(x.c) || !g) continue;
            const run = []; for (let lap = x.from; lap <= x.to; lap++) if (N[lap - 1] && sd.game.laps[d][lap - 1]?.[1]) run.push({ age: lap - x.from + 1, ms: N[lap - 1] });
            if (run.length < 3) continue; const best = Math.min(...run.map(o => o.ms));
            for (const o of run) if (o.ms <= best * 1.025) get(t).laps.push(o.ms - (g.base + g.deg * (o.age - 1)));
          }
        }
      }
      const qt = (a, p) => { const i = (a.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return a[lo] + (a[hi] - a[lo]) * (i - lo); };
      const rows = Object.values(T).filter(o => o.q != null && o.r != null).map(o => { const a = o.laps.slice().sort((x, y) => x - y); return { ...o, n: a.length, box: a.length >= 5 ? [0, 0.25, 0.5, 0.75, 1].map(p => qt(a, p)) : null }; });
      if (rows.length >= 4) {
        const qb = Math.min(...rows.map(o => o.q)), rb = Math.min(...rows.map(o => o.r)); const mb = Math.min(...rows.filter(o => o.box).map(o => o.box[2]));
        for (const o of rows) { o.q -= qb; o.r -= rb; o.all = (o.q + o.r) / 2; if (o.box) o.box = o.box.map(v => v - mb); delete o.laps; }
        rows.sort((a, b) => a.all - b.all);
        // the strategies: the race forecast's quickest plans from the grid's Friday runs (up to three), time against the best
        let strats = [], tyres = {}; const loss = pitLoss(c, trackOf(r)).green;
        try { const g = strategyRuns(sv, r).grid; tyres = Object.fromEntries(Object.entries(g).map(([k, v]) => [k, { base: Math.round(v.base), deg: Math.round(v.deg), life: v.life ?? null }])); if (Object.keys(g).length >= 2) { const P = optimalStrategies(g, F.n, { loss }); strats = P.map(p => ({ stops: p.stops, seq: p.seq, lens: p.lens, windows: p.windows || [], dt: p.t - P[0].t })); } } catch { /* no plans */ }
        out = { keys, teams: rows, front: QF.slice(0, 3).map(x => x.d), plan: F.plan ? { stops: F.plan.stops } : null, strats, tyres, loss, laps: F.n };
      }
    }
  } catch (e) { console.warn('Friday outlook', e); }
  _friday.set(ck, out); if (_friday.size > 60) _friday.delete(_friday.keys().next().value);
  return out;
}
/** The qualifying forecast: [{ d, gap (ms to the field), ideal, best, form }] fastest first, for drivers on the grid. */
function qualiForecast(c, s, round) {
  const ideal = idealLaps(s, round); const grid = new Set(gridIds(s));
  const prac = Object.fromEntries(Object.entries(ideal).filter(([d]) => grid.has(d)).map(([d, o]) => [d, o.ideal]));
  const form = Object.fromEntries(Object.entries(recentForm(c, s, round, 'q')).filter(([d]) => grid.has(d)));
  if (!Object.keys(prac).length) return [];
  const g = blendGaps(prac, form);
  return Object.entries(g).map(([d, gap]) => ({ d, gap, ideal: ideal[d]?.ideal ?? null, best: ideal[d]?.best ?? null, form: form[d] != null })).sort((a, b) => a.gap - b.gap);
}
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
  const qOrder = q?.done ? q.results.map(x => x.d) : qualiForecast(career(), s, round).map(x => x.d);
  const rows = [];
  for (const d of gridIds(s)) {
    const own = practiceRuns(s, round, d);
    const offs = Object.keys(own).filter(c => grid[c]).map(c => own[c].base - grid[c].base).sort((a, b) => a - b);
    let off = offs.length ? offs[Math.floor(offs.length / 2)] : null, est = false;
    if (off == null && ideal[d] && idealMed) { off = ideal[d].ideal - idealMed; est = true; }
    if (off == null) continue;
    const start = qOrder.indexOf(d) + 1 || gridIds(s).length;
    rows.push({ d, off, est, start });
  }
  // practice offsets weighed with recent race pace (a driver with no practice run but recent races goes on form alone)
  const form = Object.fromEntries(Object.entries(recentForm(career(), s, round, 'r')).filter(([d]) => gridIds(s).includes(d)));
  if (!rows.length && !Object.keys(form).length) return null;
  const B = blendGaps(Object.fromEntries(rows.map(x => [x.d, x.off])), form);
  for (const d of Object.keys(form)) if (!rows.some(x => x.d === d)) rows.push({ d, off: 0, est: 'form', start: qOrder.indexOf(d) + 1 || gridIds(s).length });
  for (const x of rows) { x.off = B[x.d] ?? x.off; x.t = baseT + x.off * n + (x.start - 1) * 350; }
  rows.sort((a, b) => a.t - b.t);
  const T = {};
  for (const x of rows) { const tm = teamOf(s, x.d); if (tm) (T[tm.id] ||= { team: tm, offs: [] }).offs.push(x.off); }
  const teams = Object.values(T).map(o => ({ team: o.team, off: avg(o.offs) })).sort((a, b) => a.off - b.off);
  return { order: rows, teams, plan, n };
}
function renderCurrentWeekend() {
  if (ui.nowTab === 'live') return renderLiveRace();
  if (ui.nowTab === 'debriefs') return renderDebriefs();
  const c = career(); const s = latestSeason(); const r = nextRound(s);
  const head = (sub) => `<div class="page-head"><div><h1>Current Weekend</h1><div class="sub">${sub}</div></div>${nowTabs()}</div>`;
  if (!r || isHist(s)) return `<div class="page">${head('No weekend left to run this season.')}</div>`;
  const rounds = activeRounds(s); const w = s.weekends[r.id];
  const done = sessionsFor(s, r).filter(k => w?.sessions?.[k]?.done);
  const QF = qualiForecast(c, s, r);
  const q = w?.sessions?.Q; const qPos = (d) => q?.done ? q.results.findIndex(x => x.d === d) + 1 : null;
  const qMax = QF.length ? Math.max(1, ...QF.map(x => x.gap - QF[0].gap)) : 1;
  const quali = QF.length ? practiceRows(c, s, QF.map((x, k) => ({ id: x.d, me: x.d === PLAYER, name: lastName(dName(s, x.d)), sub: `${x.ideal ? `Ideal ${fmtLap(x.ideal)} · best lap ${isFinite(x.best) ? fmtLap(x.best) : '–'}` : 'No practice laps: from recent form'}${qPos(x.d) ? ` · qualified P${qPos(x.d)}` : ''}`, val: k ? '+' + ((x.gap - QF[0].gap) / 1000).toFixed(3) : 'Pole', pct: 100 - (x.gap - QF[0].gap) / qMax * 70 }))) : '<div class="empty">No practice laps from F1 25 yet. Run practice with telemetry on: each driver\'s best sectors make their ideal lap.</div>';
  const F = raceForecast(s, r);
  const rMax = F ? Math.max(1, ...F.order.map(x => x.t - F.order[0].t)) : 1;
  const race = F ? practiceRows(c, s, F.order.map((x, k) => ({ id: x.d, me: x.d === PLAYER, name: lastName(dName(s, x.d)), sub: `Starts P${x.start} · ${fmtLap(Math.round(x.t / F.n))} a lap${x.est ? ' · est.' : ''}`, val: k ? '+' + ((x.t - F.order[0].t) / 1000).toFixed(1) : 'P1', pct: 100 - (x.t - F.order[0].t) / rMax * 70 }))) : '<div class="empty">No long runs in practice yet: three or more consecutive clean laps on a compound make a run.</div>';
  const best = F?.teams[0]?.off ?? 0;
  const tMax = F?.teams.length ? Math.max(1, ...F.teams.map(o => o.off - best)) : 1;
  const teamBoard = F?.teams.length ? practiceRows(c, s, F.teams.map((o, k) => ({ team: o.team, me: o.team.id === s.playerTeamId, name: o.team.name, sub: 'Pace per lap, long runs', val: k ? gapS(o.off - best) : 'Fastest', pct: 100 - (o.off - best) / tMax * 70 }))) : '';
  const dBest = F ? Math.min(...F.order.map(x => x.off)) : 0;
  const dSorted = F?.order.length ? F.order.slice().sort((a, b) => a.off - b.off) : []; const dMax = dSorted.length ? Math.max(1, ...dSorted.map(x => x.off - dBest)) : 1;
  const drvBoard = dSorted.length ? practiceRows(c, s, dSorted.map((x, k) => ({ id: x.d, me: x.d === PLAYER, name: lastName(dName(s, x.d)), sub: `${esc(teamOf(s, x.d)?.name || '')}${x.est === 'form' ? ' · from recent races' : x.est ? ' · est. from the ideal lap' : ''}`, val: k ? gapS(x.off - dBest) : 'Fastest', pct: 100 - (x.off - dBest) / dMax * 70 }))) : '';
  return `<div class="page">
    ${head(`Round ${rounds.indexOf(r) + 1} · ${esc(r.name)} · ${fmtDay(roundDate(s, r))}${r.sprint ? ' · sprint weekend' : ''}. Forecasts from this weekend's practice in F1 25${done.length ? `; logged so far: ${done.map(k => SESSION_SHORT[k]).join(', ')}` : ''}.`)}
    <div class="row" style="gap:8px"><button class="btn sm" data-act="open-round" data-round="${r.id}">Open the weekend</button></div>
    ${unloggedHtml(c)}
    <div class="grid-2">
      <div class="panel"><div class="panel-h"><h2>Qualifying forecast</h2><span class="muted" style="font-size:12px">Practice ideal laps at half weight, with the last 10 weekends’ qualifying</span></div><div class="panel-b tight table-wrap">${quali}</div></div>
      <div class="panel"><div class="panel-h"><h2>Race forecast</h2><span class="muted" style="font-size:12px">${F ? `${plural(F.n, 'lap')}${F.plan ? ` · ${plural(F.plan.stops, 'stop')} race` : ''}` : ''}</span></div><div class="panel-b tight table-wrap">${race}</div></div>
    </div>
    ${F ? `<div class="grid-2">
      <div class="panel"><div class="panel-h"><h2>Predicted race pace · teams</h2><span class="muted" style="font-size:12px">Long runs against the grid, with recent races, per lap</span></div><div class="panel-b tight table-wrap">${teamBoard}</div></div>
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
  by who was quicker through each part of the lap, and both cars set off together and drive their laps on it (moving
  smoothly between the recorded points), so you can see where the time goes; under it the speed through the lap and the
  gap between them, with every braking zone marked and numbered. It needs the lap traces Pitwall records while connected
  to the game: only laps recorded from line to line count.
*/
/** Gaps in a recorded series filled in a straight line from the neighbours either side. */
function flFill(a) {
  const out = a.slice(); const n = out.length; const known = out.map((v, i) => v == null ? -1 : i).filter(i => i >= 0); if (!known.length) return out.map(() => 0);
  for (let i = 0; i < n; i++) if (out[i] == null) { const p = known.filter(k => k < i).pop(), q = known.find(k => k > i); out[i] = p == null ? a[q] : q == null ? a[p] : a[p] + (a[q] - a[p]) * (i - p) / (q - p); }
  return out;
}
/** A gentle average over three slices, for a smooth line. */
const flSmooth = (a) => a.map((v, i) => (a[Math.max(0, i - 1)] + v * 2 + a[Math.min(a.length - 1, i + 1)]) / 4);
/** A lap recorded whole: the full length of the track, and its line meets itself at the start/finish. */
function flWhole(t, n) {
  if (!t?.spd?.length || t.spd.length < n * 0.95) return false;
  const xs = t.x.filter(v => v != null), zs = t.z.filter(v => v != null); if (xs.length < t.spd.length * 0.9) return false;
  if (Math.hypot(xs[0] - xs[xs.length - 1], zs[0] - zs[zs.length - 1]) >= (t.bin || 50) * 4) return false;
  // the speed either side of the line matches: a lap that ends slowing for the pits isn't a lap
  const sp = t.spd.filter(v => v != null); const a = (sp[0] + sp[1]) / 2, b = (sp[sp.length - 1] + sp[sp.length - 2]) / 2;
  return Math.min(a, b) >= Math.max(a, b) * 0.8;
}
function flTimes(t) {
  // seconds into the lap at the end of each slice, from the speed through it, scaled to the real lap time
  const sp = flFill(t.spd); const raw = sp.map(v => t.bin / Math.max(5, (v || 60) / 3.6)); const sum = raw.reduce((a, b) => a + b, 0) || 1;
  let acc = 0; return raw.map(v => (acc += v * (t.ms / 1000) / sum));
}
function flShares(t) {
  const dt = flTimes(t).map((v, i, a) => v - (a[i - 1] || 0)); const tot = dt.reduce((a, b) => a + b, 0) || 1;
  const thr = flFill(t.thr), brk = flFill(t.brk);
  const sh = (f) => Math.round(dt.reduce((a, v, i) => a + (f(i) ? v : 0), 0) / tot * 100);
  const full = sh(i => thr[i] >= 95), brake = sh(i => brk[i] >= 50);
  return { full, brake, corner: Math.max(0, 100 - full - brake) };
}
/**
 * The braking zones of a lap, from its speed: each low point at least 25 km/h under the speed before it is a corner,
 * numbered in order; two low points straight after one another (a chicane) share one zone. [{ from, to, turns: [n], min, kind }]
 */
function flCorners(spd) {
  const n = spd.length; const mins = [];
  for (let i = 2; i < n - 2; i++) {
    if (!(spd[i] <= spd[i - 1] && spd[i] <= spd[i + 1] && spd[i] < spd[i - 2] && spd[i] <= spd[i + 2])) continue;
    const before = Math.max(...spd.slice(Math.max(0, i - 8), i)); if (before - spd[i] >= 25) mins.push(i);
  }
  const zones = []; let num = 0, lastMin = -99;
  for (const i of mins) {
    let a = i; while (a > 0 && i - a < 6 && spd[a - 1] > spd[a]) a--;
    let b = i; const top = Math.max(...spd.slice(i, Math.min(n, i + 10))); while (b < n - 1 && b - i < 6 && spd[b + 1] > spd[b] && spd[b] < top * 0.92) b++;
    const z = zones[zones.length - 1];
    if (z && i - lastMin <= 3) { z.to = Math.max(z.to, b); z.turns.push(++num); z.min = Math.min(z.min, spd[i]); }
    else zones.push({ from: z ? Math.max(a, z.to) : a, to: b, turns: [++num], min: spd[i] });
    lastMin = i;
  }
  for (const z of zones) z.kind = z.min < 120 ? 'LOW SPEED' : z.min < 200 ? 'MEDIUM SPEED' : 'HIGH SPEED';
  return zones;
}
/**
 * The corners of a lap from its line on the map: every apex where the direction changes sharply. Left then right (a
 * chicane) are two corners, a long sweep with two apexes is two, and fast bends count as much as hairpins. How sharp
 * an apex has to be is tuned until the count matches the circuit's official number of corners, so the numbering
 * follows the real one closely. bin: metres per slice. [{ from, to, peak, deg }], in order from the line.
 */
function flTurns(xs, zs, target, bin = 50) {
  const n = xs.length; const at = (i) => (i + n) % n; const wrap = (a) => ((a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  const h = xs.map((_, i) => Math.atan2(zs[at(i + 1)] - zs[at(i - 1)], xs[at(i + 1)] - xs[at(i - 1)]));
  const d = h.map((v, i) => wrap(h[at(i + 1)] - v) * 180 / Math.PI); // degrees of turn through each slice
  const span = Math.max(2, Math.round(200 / bin)); // a corner reaches at most this many slices either side of its apex
  const find = (th) => {
    const out = [];
    for (let i = 0; i < n; i++) {
      const v = d[i], mag = Math.abs(v), sg = Math.sign(v); if (mag < th) continue;
      const side = (k) => Math.sign(d[at(k)]) === sg ? Math.abs(d[at(k)]) : 0;
      if (!(mag >= side(i - 1) && mag > side(i + 1))) continue; // an apex: turning hardest here
      let f = i, t = i;
      while (i - f < span && side(f - 1) >= mag * 0.35 && side(f - 1) <= side(f)) f--;
      while (t - i < span && side(t + 1) >= mag * 0.35 && side(t + 1) <= side(t)) t++;
      let deg = 0; for (let k = f; k <= t; k++) deg += d[at(k)];
      if (Math.abs(deg) >= 12) out.push({ from: f, to: t, peak: i, deg });
    }
    return out;
  };
  let best = [];
  for (let th = 40; th >= 3; th -= 0.5) { const c = find(th); if (!best.length || Math.abs(c.length - target) < Math.abs(best.length - target)) best = c; if (c.length >= target) break; }
  return best;
}
/**
 * The graphs' bands, one per corner: corners close together meet halfway, so their bands touch (shaded in turn), and
 * a run of touching corners at the same speed (low, medium, high) shares one speed label.
 */
function flBands(turns, spd, bin = 50) {
  const near = Math.max(2, Math.round(250 / bin));
  // a corner with a real dip in speed spans the whole of it: from where the braking starts (the speed stops rising,
  // looking back from the slowest point) to where the car is nearly back to the speed it came in at
  const reach = Math.max(4, Math.round(400 / bin)); const n = spd.length;
  const B = turns.map((t, k) => {
    let lo = Math.max(0, t.from - 2); for (let i = lo; i <= Math.min(n - 1, t.to + 2); i++) if (spd[i] < spd[lo]) lo = i;
    let f = lo; while (f > 0 && lo - f < reach && spd[f - 1] > spd[f]) f--;
    const entry = spd[f], dip = entry - spd[lo];
    let to = lo; if (dip >= 25) while (to < n - 1 && to - lo < reach && spd[to + 1] > spd[to] && spd[to] < spd[lo] + dip * 0.85) to++;
    return dip >= 25 ? { from: Math.min(f, t.from), to: Math.max(to, t.to), turns: [k + 1] } : { from: t.from, to: Math.min(n - 1, Math.max(t.to, t.from + 1)), turns: [k + 1] };
  });
  // close corners meet halfway (and overlapping ones split the overlap), so their bands touch
  for (let k = 0; k < B.length - 1; k++) { if (B[k + 1].from - B[k].to <= near) { const m = Math.round((B[k].to + B[k + 1].from) / 2); B[k].to = Math.max(B[k].from + 1, m); B[k + 1].from = B[k].to; } }
  B.forEach((x, k) => { x.min = Math.min(...spd.slice(x.from, x.to + 1)); x.kind = x.min < 120 ? 'LOW SPEED' : x.min < 200 ? 'MEDIUM SPEED' : 'HIGH SPEED';
    const p = B[k - 1]; x.grp = p && p.to === x.from && p.kind === x.kind ? p.grp : k; });
  return B;
}
/** A smooth line through points: [[x, y]] → an SVG path (Catmull-Rom as curves). */
function flPath(P) {
  if (P.length < 2) return '';
  let d = `M${P[0][0].toFixed(1)},${P[0][1].toFixed(1)}`;
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
    d += `C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)},${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)},${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}
function flLapPanel(c, s, r) {
  const T0 = s.weekends[r.id]?.traces || {}; const len = Math.max(0, ...Object.values(T0).map(t => t?.spd?.length || 0));
  const T = Object.fromEntries(Object.entries(T0).filter(([id, t]) => s.drivers[id] && flWhole(t, len)));
  const ids = Object.keys(T).sort((a, b) => T[a].ms - T[b].ms);
  const head = `<div class="panel-h"><h2>Fastest lap head to head</h2><span class="muted" style="font-size:12px">Each driver’s quickest lap of the weekend so far</span></div>`;
  const note = `<p class="muted" style="font-size:12px;margin:0">Only laps recorded in full, from line to line, are fair comparisons: a session you skipped or that was simulated has no real laps from the AI, and a lap Pitwall only saw part of (an out-lap, a trip to the pits, a flashback mid-lap) is left out.</p>`;
  if (ids.length < 2) return `<div class="panel">${head}<div class="panel-b stack"><div class="muted" style="font-size:13px">Needs two drivers’ laps recorded from F1 25 this weekend: Pitwall records every car’s speed, throttle, brake and line through the lap while it’s connected to the game.</div>${note}</div></div>`;
  const a = ids.includes(ui.flA) ? ui.flA : ids[0]; const b = ids.includes(ui.flB) && ui.flB !== a ? ui.flB : (ids.includes(PLAYER) && PLAYER !== a ? PLAYER : ids.find(x => x !== a));
  const A = T[a], B = T[b]; const n = Math.min(A.spd.length, B.spd.length);
  const tA = flTimes(A).slice(0, n), tB = flTimes(B).slice(0, n);
  const sA = flSmooth(flFill(A.spd)).slice(0, n), sB = flSmooth(flFill(B.spd)).slice(0, n);
  const colA = teamColor(s, a), colB0 = teamColor(s, b); const colB = colA === colB0 ? '#F5E14A' : colB0; // teammates: the second in yellow, as on TV
  const sel = (k, v) => `<select data-ch="fl-pick" data-k="${k}" style="width:auto">${ids.map(id => `<option value="${id}" ${id === v ? 'selected' : ''}>${esc(dName(s, id))} · ${fmtLap(T[id].ms)}</option>`).join('')}</select>`;
  // the map: the line of the quicker lap, each slice in the colour of the driver who gained time through it, closed at the line
  const P = A.x.filter(v => v != null).length >= B.x.filter(v => v != null).length ? A : B;
  const xs = flFill(P.x).slice(0, n), zs = flFill(P.z).slice(0, n);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const W = 520, H = 300, pad = 20; const sc = Math.min((W - 2 * pad) / ((maxX - minX) || 1), (H - 2 * pad) / ((maxZ - minZ) || 1));
  const ox = (W - (maxX - minX) * sc) / 2, oz = (H - (maxZ - minZ) * sc) / 2;
  const pts = xs.map((x, i) => [(x - minX) * sc + ox, (zs[i] - minZ) * sc + oz]);
  const gain = (i) => (tB[i] - (tB[i - 1] || 0)) - (tA[i] - (tA[i - 1] || 0));
  let segs = '';
  for (let i = 1; i <= n; i++) { const p0 = pts[i - 1], p1 = pts[i % n]; segs += `<line x1="${p0[0].toFixed(1)}" y1="${p0[1].toFixed(1)}" x2="${p1[0].toFixed(1)}" y2="${p1[1].toFixed(1)}" stroke="${gain(i % n) >= 0 ? colA : colB}" stroke-width="7" stroke-linecap="round"/>`; }
  // the timing line: across the track at the start, with a dot, as on the ERS map
  const [sx, sz] = pts[0], [nx, nz] = pts[1]; const dl = Math.hypot(nx - sx, nz - sz) || 1; const px = -(nz - sz) / dl * 11, pz = (nx - sx) / dl * 11;
  const line = `<line x1="${(sx - px).toFixed(1)}" y1="${(sz - pz).toFixed(1)}" x2="${(sx + px).toFixed(1)}" y2="${(sz + pz).toFixed(1)}" stroke="#fff" stroke-width="3"/><circle cx="${sx.toFixed(1)}" cy="${sz.toFixed(1)}" r="4" fill="#fff"/>`;
  const target = D.TRACKS[trackOf(r)]?.corners || 0; // the circuit's official number of corners
  const turns = target ? flTurns(xs, zs, target, P.bin || 50) : [];
  const tlabels = turns.map((t, k) => { const i = t.peak; const q = pts[i], a0 = pts[(i - 2 + n) % n], a1 = pts[(i + 2) % n]; let vx = q[0] - (a0[0] + a1[0]) / 2, vz = q[1] - (a0[1] + a1[1]) / 2; const l = Math.hypot(vx, vz) || 1; vx /= l; vz /= l;
    return `<text x="${(q[0] + vx * 15).toFixed(1)}" y="${(q[1] + vz * 15 + 4).toFixed(1)}" fill="#C9CFDC" font-size="11" font-weight="700" text-anchor="middle">${k + 1}</text>`; }).join('');
  const anim = JSON.stringify({ p: pts.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]), a: tA.map(v => Math.round(v * 1000)), b: tB.map(v => Math.round(v * 1000)) });
  // the speed trace and the gap, with the braking zones marked
  const zones = turns.length ? flBands(turns, sA, P.bin || 50) : flCorners(sA).map((z, k) => ({ ...z, grp: k }));
  const vmax = Math.max(...sA, ...sB), vmin = Math.min(...sA, ...sB);
  const CW = 1000, CH = 256, top = 40; const cx = (i) => 40 + i * (CW - 60) / (n - 1); const cy = (v) => top + (1 - (v - vmin) / ((vmax - vmin) || 1)) * (CH - top - 14);
  // a zone running across the line (its end before its start) is drawn in two pieces, one each side of it
  const zrect = (a, b, y, hh, op) => `<rect x="${cx(a).toFixed(1)}" y="${y}" width="${Math.max(0, cx(b) - cx(a)).toFixed(1)}" height="${hh}" fill="#fff" opacity="${op}"/>`;
  const band = (h, labels) => zones.map((z, k) => `${(() => { const y = labels ? top - 16 : 0, hh = labels ? h - top + 16 : h, op = k % 2 ? 0.045 : 0.1; return z.to >= z.from ? zrect(z.from, z.to, y, hh, op) : zrect(z.from, n - 1, y, hh, op) + zrect(0, z.to, y, hh, op); })()}${labels ? `<text x="${((cx(z.from) + cx(z.to)) / 2).toFixed(1)}" y="${top - 4}" fill="#fff" font-size="${Math.max(7, Math.min(12, (cx(z.to) - cx(z.from)) / (z.turns.join(' ').length * 0.62)))}" font-weight="800" text-anchor="middle">${z.turns.join(' ')}</text>` : ''}`).join('')
    + (labels ? [...new Set(zones.map(z => z.grp))].map(g => { const run = zones.filter(z => z.grp === g); const x0 = cx(run[0].from), x1 = cx(run[run.length - 1].to); return x1 - x0 >= 56 ? `<text x="${((x0 + x1) / 2).toFixed(1)}" y="11" fill="#9AA" font-size="8.5" text-anchor="middle">${run[0].kind}</text>` : ''; }).join('') : '');
  const curve = (arr, col) => `<path d="${flPath(arr.map((v, i) => [cx(i), cy(v)]))}" fill="none" stroke="${col}" stroke-width="2.2"/>`;
  const dlt = flSmooth(tA.map((v, i) => v - tB[i])); const dm = Math.max(0.05, ...dlt.map(Math.abs));
  const dy = (v) => 50 + v / dm * 40; // a negative gap (the first driver ahead) is up
  const shA = flShares(A), shB = flShares(B); const gap = (B.ms - A.ms) / 1000;
  const side = (id, t, sh, col, right) => `<div class="flh-drv" style="--c:${col};${right ? 'text-align:right' : ''}"><div class="flh-nm"><small>${esc(dName(s, id).split(' ').slice(0, -1).join(' '))}</small><b>${esc(lastName(dName(s, id)).toUpperCase())}</b><small>${esc(teamOf(s, id)?.name || '')} · ${SESSION_SHORT[t.key] || ''} · lap ${t.lap}</small></div>
    <div class="flh-kv"><div><span>LAP TIME</span><b>${fmtLap(t.ms)}</b></div><div><span>GAP</span><b>${id === a ? (gap > 0 ? '−' : '+') : (gap > 0 ? '+' : '−')}${Math.abs(gap).toFixed(3)}s</b></div></div>
    ${[['Full throttle', sh.full], ['Heavy braking', sh.brake], ['Cornering', sh.corner]].map(([k, v]) => `<div class="flh-pc"><span>${k}</span><i><em style="width:${v}%"></em></i><b>${v}%</b></div>`).join('')}</div>`;
  return `<div class="panel">${head}<div class="panel-b stack">
    <div class="row" style="gap:8px;flex-wrap:wrap">${sel('a', a)}<span class="muted">v</span>${sel('b', b)}</div>
    <div class="flh">${side(a, A, shA, colA, false)}
      <div class="flh-map"><svg viewBox="0 0 ${W} ${H}" data-flanim='${esc(anim)}'><g>${segs}</g>${line}${tlabels}<circle class="fl-car" data-k="b" r="8" fill="${colB}" stroke="#111" stroke-width="2" cx="${sx}" cy="${sz}"/><circle class="fl-car" data-k="a" r="8" fill="${colA}" stroke="#fff" stroke-width="2" cx="${sx}" cy="${sz}"/></svg>
        <div class="muted" style="font-size:11px;text-align:center"><span style="color:${colA}">■</span> ${esc(lastName(dName(s, a)))} quicker · <span style="color:${colB}">■</span> ${esc(lastName(dName(s, b)))} quicker · both laps start together</div></div>
      ${side(b, B, shB, colB, true)}</div>
    <svg class="flh-chart" viewBox="0 0 ${CW} ${CH}">${band(CH, true)}<text x="4" y="${top + 4}" fill="#9AA" font-size="10">${Math.round(vmax)}</text><text x="4" y="${CH - 10}" fill="#9AA" font-size="10">${Math.round(vmin)}</text><text x="4" y="${(top + CH) / 2}" fill="#9AA" font-size="9">KM/H</text>${curve(sB, colB)}${curve(sA, colA)}</svg>
    <svg class="flh-chart" viewBox="0 0 ${CW} 100">${band(100, false)}<text x="6" y="12" fill="#9AA" font-size="11">${esc(lastName(dName(s, a)))} FASTER</text><text x="6" y="96" fill="#9AA" font-size="11">SLOWER</text><line x1="40" x2="${CW - 20}" y1="50" y2="50" stroke="${colB}" stroke-width="1.5"/><path d="${flPath(dlt.map((v, i) => [cx(i), dy(v)]))}" fill="none" stroke="${colA}" stroke-width="2.2"/></svg>
    ${note}
  </div></div>`;
}
/** Drives both cars round the map: they start together, each at its own lap's pace, gliding between the recorded points; then a short pause and again. */
let _flRaf = null; const _flClock = { key: null, t0: 0 };
function flAnimate() {
  cancelAnimationFrame(_flRaf); const svgs = [...document.querySelectorAll('svg[data-flanim]')]; if (!svgs.length) return;
  const D2 = svgs.map(el => ({ el, d: JSON.parse(el.dataset.flanim), cars: [...el.querySelectorAll('.fl-car')] }));
  const key = svgs.map(el => el.dataset.flanim.length).join(); if (_flClock.key !== key) Object.assign(_flClock, { key, t0: performance.now() }); const t0 = _flClock.t0;
  // where a car is t ms into its lap: between the slice it's in and the next, by how far through that slice it is
  const at = (p, cum, t) => {
    const n = cum.length; let i = 0; while (i < n - 1 && cum[i] < t) i++;
    const t1 = cum[i], t0p = i ? cum[i - 1] : 0; const f = t1 > t0p ? Math.min(1, Math.max(0, (t - t0p) / (t1 - t0p))) : 1;
    const q0 = p[(i - 1 + n) % n], q1 = p[i]; return [q0[0] + (q1[0] - q0[0]) * f, q0[1] + (q1[1] - q0[1]) * f];
  };
  const step = (now) => {
    if (!document.body.contains(D2[0].el)) return;
    for (const { d, cars } of D2) {
      const len = Math.max(d.a[d.a.length - 1], d.b[d.b.length - 1]); const t = ((now - t0) % (len + 1500));
      for (const cv of cars) { const q = at(d.p, d[cv.dataset.k], t); cv.setAttribute('cx', q[0].toFixed(1)); cv.setAttribute('cy', q[1].toFixed(1)); }
    }
    _flRaf = requestAnimationFrame(step);
  };
  _flRaf = requestAnimationFrame(step);
}
