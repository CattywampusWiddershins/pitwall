/* Pitwall — Race strategy from practice, pit stops and tyre sets. Part of the renderer, split into files that load in order (see index.html). */
'use strict';
/* Optimal race strategy from practice. Long runs on each compound give a base pace, how much slower each lap gets as
   the tyre ages (fall-off) and how fast it wears (which sets how long it lasts). Every one- and two-stop plan (three if
   the tyres can't last) is timed: laps × pace + fall-off as the tyres age + the time lost in the pits. Fuel burn is left
   out: it affects every plan the same. Two plans are worked out: one from the whole grid's practice, one from yours. */
const PIT_LOSS = 22000; // ms lost to a stop, pit lane included
const PRACTICE_KEYS = ['FP1', 'FP2', 'FP3', 'FP'];
// the sessions each forecast learns from: long runs from practice and the sprint; ideal laps from practice and the
// sprint shootout
const RUN_KEYS = [...PRACTICE_KEYS, 'SPR'], IDEAL_KEYS = [...PRACTICE_KEYS, 'SQ'];
const DRY = [16, 17, 18];
/** One driver's clean consecutive laps on each dry compound in this weekend's practice:
 *  { compound: { laps, base, deg, wear, life, ref } } (ref: their quickest practice lap, to compare drivers). */
/**
 * The sessions the strategy learns from. A session whose tyre wear doesn't match a later one's (any compound you ran in
 * both more than 1.5 points a lap apart: say FP1 was run on a different tyre-wear setting) is left out, along with
 * everything before it, for you and the AI alike: the latest data wins. { keys, dropped: [{ k, c, a, b, j }] }
 */
const _skCache = new Map();
function strategyKeys(s, round) {
  const ck = `${s.index}:${round.id}`; const hit = _skCache.get(ck); if (hit?.gen === renderGen) return hit.v;
  const w = s.weekends[round.id];
  const have = RUN_KEYS.filter(k => { const sd = w?.sessions?.[k]; return sd?.game?.laps?.[PLAYER] && !sd.estimated; });
  const per = Object.fromEntries(have.map(k => [k, practiceRuns(s, round, PLAYER, [k])]));
  const keep = []; let cut = null;
  for (let i = have.length - 1; i >= 0 && !cut; i--) {
    const k = have[i];
    for (const j of keep) for (const c of DRY) { const a = per[k][c]?.wear, b = per[j][c]?.wear; if (!cut && a != null && b != null && Math.abs(a - b) > 1.5) cut = { k, c, a, b, j }; }
    keep.push(k);
  }
  const at = cut ? RUN_KEYS.indexOf(cut.k) : -1;
  const v = { keys: RUN_KEYS.filter((k, i) => i > at), dropped: cut ? RUN_KEYS.filter((k, i) => i <= at && w?.sessions?.[k]?.game).map(k => ({ ...cut, k })) : [] };
  _skCache.set(ck, { gen: renderGen, v }); return v;
}
/*
  Normalising lap times. Laps run on different fuel loads and with different amounts of boost don't compare as they
  stand, so every lap used for pace is put on the same footing first: as if the tank were empty (FUEL_MS a kg, from
  the fuel the game reports at the end of each lap plus half a lap's burn), and as if the driver had deployed their
  usual energy that weekend (ERS_MS a kJ either side of it: one reference for every session of the weekend, so a run
  in FP2 and one in FP3 are on the same footing). Both need F1 25 data from 3.4 on; older sessions are used as they
  are. A plan then adds the fuel back lap by lap where it matters (Live Race), but between plans it cancels out.
  ERS_MS was measured on the 2026 season's practice laps (3.14.2): within a run, each extra kJ deployed took 0.34 ms
  off the player's lap (0.07 ms across the grid); the 1.1 ms used before made a lap with a big deployment look a
  second and a half slower than it was.
*/
const FUEL_MS = 35; // ms a lap per kg of fuel
const ERS_MS = 0.35; // ms a lap per kJ of ERS deployment, against the driver's usual
/** A driver's usual ERS deployment a lap (kJ) across these sessions: the reference the laps are put on. */
function ersRef(sds, d) {
  const all = sds.flatMap(sd => (sd?.game?.ersDep?.[d] || []).filter(x => x > 0));
  return all.length >= 3 ? median(all) : null;
}
/** One driver's laps in a session, normalised: [ms] by lap (null where there's no time). Also the fuel burn a lap. */
function normLaps(sd, d, ref = ersRef([sd], d)) {
  const laps = sd.game.laps?.[d] || []; const fuel = sd.game.fuel?.[d] || []; const dep = sd.game.ersDep?.[d] || [];
  const drops = fuel.map((v, k) => k && fuel[k - 1] != null && v != null ? fuel[k - 1] - v : null).filter(x => x != null && x > 0.2 && x < 5);
  const burn = median(drops) || 0;
  return { burn, laps: laps.map((l, k) => { if (!l?.[0]) return null; let ms = l[0];
    if (fuel[k] != null) ms -= (fuel[k] + burn / 2) * FUEL_MS;
    if (ref != null && dep[k] > 0) ms += (dep[k] - ref) * ERS_MS;
    return ms; }) };
}
function practiceRuns(s, round, d, keys = strategyKeys(s, round).keys) {
  const w = s.weekends[round.id]; const out = {}; let ref = Infinity;
  const eRef = ersRef(keys.map(k => w?.sessions?.[k]).filter(sd => sd?.game && !sd.estimated), d); // one boost reference for the weekend
  for (const k of keys) {
    const sd = w?.sessions?.[k]; if (!sd?.game || sd.estimated) continue;
    const laps = sd.game.laps?.[d]; if (!laps) continue; const wear = sd.game.wear?.[d] || [];
    const N = normLaps(sd, d, eRef).laps; // fuel- and ERS-normalised times
    laps.forEach((l, k) => { if (l[0] && l[1] && N[k]) ref = Math.min(ref, N[k]); });
    for (const x of stintsOf(sd, d)) {
      if (!DRY.includes(x.c)) continue; // intermediates and wets depend too much on the conditions
      const run = [];
      // every lap of the stint: an out-lap is far off the run's pace and drops out below, and a stint started on a flying
      // lap (no out-lap driven) keeps its first lap
      for (let lap = x.from; lap <= x.to; lap++) { const ms = N[lap - 1]; if (ms) run.push({ age: lap - x.from + 1, ms, wear: wear[lap - 1] }); }
      if (run.length < 3) continue;
      // pushing laps: within 2.5% of the run's best (cool-down and traffic laps break the run)
      const best = Math.min(...run.map(r => r.ms)); let cur = [], longest = [];
      for (const r of run) { if (r.ms <= best * 1.025 && (!cur.length || r.age === cur[cur.length - 1].age + 1)) cur.push(r); else { if (cur.length > longest.length) longest = cur; cur = r.ms <= best * 1.025 ? [r] : []; } }
      if (cur.length > longest.length) longest = cur;
      if (longest.length < 3) continue;
      const pace = fitLine(longest.map(r => [r.age, r.ms])); const wr = fitLine(longest.filter(r => r.wear != null).map(r => [r.age, r.wear]));
      const deg = Math.max(0, pace?.b || 0);
      // a set that was already worn when the run began: its wear says how many laps old it really was, so the pace and
      // the life are what a new set would give
      const a0 = wr && wr.b > 0.05 && wr.a > wr.b * 1.5 ? wr.a / wr.b : 0;
      const life = wr && wr.b > 0.05 ? Math.floor((WEAR_LIMIT - (a0 ? 0 : wr.a)) / wr.b) : null;
      // the pace on a new set: the run's lap at age 1 along the fall-off. A run that got quicker (the tyres coming in,
      // a lap with traffic early on) has no fall-off to follow, so it's the run's average: following the downhill line
      // back to age 1 would make it slower than any lap that was driven
      const atOne = deg > 0 && pace ? pace.a + deg : avg(longest.map(r => r.ms));
      const prev = out[x.c];
      if (!prev || longest.length > prev.laps) out[x.c] = { laps: longest.length, base: atOne - deg * a0, deg, wear: wr?.b ?? null, life, session: k, ...(a0 ? { usedSet: Math.round(a0) } : {}) };
    }
  }
  for (const c in out) out[c].ref = isFinite(ref) ? ref : Math.min(...Object.values(out).map(x => x.base));
  return out;
}
/** The whole grid's practice runs, combined per compound: the typical fall-off, wear and life, and the pace as a gap
 *  to each driver's own quickest lap (so a fast car on softs and a slow car on hards don't skew the compounds). */
function gridRuns(s, round) {
  const w = s.weekends[round.id]; const drivers = new Set();
  for (const k of strategyKeys(s, round).keys) { const g = w?.sessions?.[k]?.game; if (g?.laps && !w.sessions[k].estimated) Object.keys(g.laps).forEach(d => drivers.add(d)); }
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
/**
 * The grid's and your runs, with the fall-off made to agree. Short or broken runs (a session you retired from, say)
 * often measure no fall-off at all, so: a compound showing +0.000 s a lap on one side takes the other side's figure.
 * And where both have one but the grid's is more than 50% off yours, the grid's is pulled to within a tenth of yours
 * (yours is 1 s a lap, the grid's 0.3 s: the grid's becomes 0.9 s). Each changed figure says where it came from.
 */
const DEG_ZERO = 0.5, DEG_NEAR = 100; // ms a lap
function strategyRuns(s, round) {
  const copy = (o) => JSON.parse(JSON.stringify(o)); const grid = copy(gridRuns(s, round)); const mine = copy(practiceRuns(s, round, PLAYER));
  for (const c of DRY) {
    const a = grid[c], p = mine[c]; if (!a || !p) continue;
    if (p.deg < DEG_ZERO && a.deg >= DEG_ZERO) { p.deg = a.deg; p.degNote = 'from the grid’s runs'; }
    else if (a.deg < DEG_ZERO && p.deg >= DEG_ZERO) { a.deg = p.deg; a.degNote = 'from your runs'; }
    else if (a.deg >= DEG_ZERO && p.deg >= DEG_ZERO && Math.abs(a.deg - p.deg) > p.deg * 0.5) {
      const was = a.deg; a.deg = Math.max(p.deg - DEG_NEAR, Math.min(p.deg + DEG_NEAR, a.deg));
      a.degNote = `near yours; the grid measured +${(was / 1000).toFixed(3)} s`;
    }
    // your fall-off from a short run is noisy: the grid's (many drivers' runs) counts as five laps of yours. At Monza
    // your 5-lap medium run said 141 ms a lap, the grid's 59; your mediums lost about 95 in the race
    if (a.deg >= DEG_ZERO && p.deg >= DEG_ZERO && p.laps < 12) { const was = p.deg; p.deg = (p.deg * p.laps + a.deg * 5) / (p.laps + 5); if (Math.abs(p.deg - was) > 10) p.degNote = `your ${p.laps}-lap run said +${(was / 1000).toFixed(3)} s; weighed with the grid’s`; }
  }
  for (const runs of [grid, mine]) { orderTyres(runs); degFromWear(runs); }
  fillTyres(grid, mine);
  return { grid, mine };
}
/**
 * A tyre whose run measured no fall-off at all (a short run, or one that got quicker as the tyres came in) still falls
 * off: it takes the next compound's fall-off, scaled by how much slower it wears. At Monza the hard came out at zero
 * from three laps, so 24 laps on a used hard looked as good as new mediums.
 */
function degFromWear(runs) {
  const near = { 18: [17, 16], 17: [16, 18], 16: [17, 18] };
  for (const c of DRY) {
    const x = runs[c]; if (!x || x.deg >= DEG_ZERO || !x.wear) continue;
    const o = near[c].map(k => runs[k]).find(y => y && y.deg >= DEG_ZERO && y.wear);
    if (o) { x.deg = o.deg * Math.min(1.5, x.wear / o.wear); x.degNote = `none measured: from the ${COMPOUNDS[near[c].find(k => runs[k] === o)][1].toLowerCase()}’s, scaled by the wear`; }
  }
}
/**
 * A harder tyre measured as dropping off (or wearing) faster than a softer one can't be right: the run was probably
 * spoiled (traffic, a mistake, a different fuel load). Its measurement is kept, but the fall-off or wear the plans use is
 * rebuilt from the other two compounds, as for a tyre nobody ran. Needs all three measured.
 */
function orderTyres(runs) {
  const S = runs[16], M = runs[17], H = runs[18]; if (!S || !M || !H || S.src || M.src || H.src) return;
  for (const k of ['deg', 'wear']) {
    if ([S, M, H].some(x => x[k] == null)) continue;
    const note = k + 'Note'; const fmt = (v) => k === 'deg' ? `+${(v / 1000).toFixed(3)} s` : `${v.toFixed(1)}%`;
    if (H[k] > M[k] || H[k] > S[k]) {
      const was = H[k]; H[k] = Math.min(M[k] * 0.85, Math.max(M[k] * 0.4, M[k] - Math.max(0, S[k] - M[k])));
      H[note] = `measured ${fmt(was)}, worse than a softer tyre: estimated from the soft and medium`;
      if (k === 'wear' && H.life && was > 0) H.life = Math.round(H.life * was / H[k]);
    } else if (M[k] > S[k]) {
      const was = M[k]; M[k] = (S[k] + H[k]) / 2;
      M[note] = `measured ${fmt(was)}, worse than the soft: estimated halfway between the soft and hard`;
      if (k === 'wear' && M.life && was > 0) M.life = Math.round(M.life * was / M[k]);
    }
  }
}
/**
 * Tyres with no runs. One side ran a compound the other didn't: it takes that side's fall-off, wear and life, and its
 * pace moved by the usual gap between the two sides on the tyres both ran. Your own tyres come first, though: with two or more of
 * your own compounds, a missing one is worked out from them rather than taken from the grid. Nobody ran it: it's worked out from the two
 * that were run. A missing hard is the medium plus the soft-to-medium step (slower, but dropping off and wearing
 * slower); a missing soft is the medium minus the medium-to-hard step (quicker, dropping off and wearing faster); a
 * missing medium sits halfway between the soft and the hard. Each filled-in tyre says where it came from.
 */
function fillTyres(grid, mine) {
  const shared = DRY.filter(c => grid[c]?.measured !== false && mine[c] && grid[c] && !grid[c].src && !mine[c].src);
  const off = shared.length ? median(shared.map(c => mine[c].base - grid[c].base)) : 0;
  const pick = (x) => ({ base: x.base, deg: x.deg, wear: x.wear, life: x.life });
  const own = DRY.filter(c => mine[c] && !mine[c].src).length;
  for (const c of DRY) {
    if (grid[c] && !mine[c] && own < 2) mine[c] = { ...pick(grid[c]), base: grid[c].base + off, laps: 0, src: 'from the grid’s runs' };
    else if (mine[c] && !grid[c]) grid[c] = { ...pick(mine[c]), base: mine[c].base - off, laps: 0, drivers: 0, src: 'from your runs' };
  }
  for (const runs of [grid, mine]) {
    const S = runs[16], M = runs[17], H = runs[18];
    const step = (a, b, k, f) => { const x = a[k], y = b[k]; return x == null || y == null ? null : f(x, y); };
    const est = (o, src) => ({ ...o, laps: 0, drivers: 0, src });
    if (S && M && !H) runs[18] = est({
      base: M.base + Math.max(200, M.base - S.base),
      deg: Math.min(M.deg * 0.85, Math.max(M.deg * 0.4, M.deg - Math.max(0, S.deg - M.deg))),
      wear: step(S, M, 'wear', (s, m) => Math.min(m * 0.85, Math.max(m * 0.4, m - Math.max(0, s - m)))),
      life: step(S, M, 'life', (s, m) => Math.max(m + 1, m + (m - s))) }, 'estimated: the medium plus the soft-to-medium step');
    else if (M && H && !S) runs[16] = est({
      base: M.base - Math.max(200, H.base - M.base),
      deg: Math.max(M.deg * 1.15, M.deg + Math.max(0, M.deg - H.deg)),
      wear: step(M, H, 'wear', (m, h) => Math.max(m * 1.15, m + Math.max(0, m - h))),
      life: step(M, H, 'life', (m, h) => Math.max(3, Math.min(m - 1, m - (h - m)))) }, 'estimated: the medium minus the medium-to-hard step');
    else if (S && H && !M) runs[17] = est({
      base: (S.base + H.base) / 2, deg: (S.deg + H.deg) / 2,
      wear: step(S, H, 'wear', (s, h) => (s + h) / 2), life: step(S, H, 'life', (s, h) => Math.round((s + h) / 2)) }, 'estimated: halfway between the soft and the hard');
  }
}
/*
  Pit stops and tyre sets. A stop costs what the pit lane costs at that track (green flag), and less under a virtual
  safety car or a safety car, when the field is slow anyway. The defaults are typical figures per track; you can set
  your own. Tyre sets: a weekend has a fixed number of dry sets for its format, and the preset (softer, balanced,
  harder; sprint weekends have their own) puts each one in a session. The sets in practice go back after the last
  practice session, and the plans can only use sets you still have. The
  game's own tyre-set data (each set's wear, and whether it's still yours) wins whenever a session sent it; before
  that, the preset stands in.
*/
// seconds lost to a green-flag stop, pit lane in and out
const PIT_GREEN = { aus: 19, chn: 23, jpn: 22, bhr: 23, sau: 20, mia: 20, emi: 27, mon: 20, esp: 22, can: 18, aut: 20, gbr: 20, bel: 20, hun: 21, ned: 21, ita: 24, aze: 20, sgp: 28, usa: 21, mex: 23, bra: 21, lvg: 20, qat: 25, abu: 22, mad: 22, fra: 22, ger: 21, rus: 26, por: 22, tur: 22, mal: 21, kor: 22, ind: 21, eur: 22 };
const PIT_VSC = 0.62, PIT_SC = 0.48; // share of the green-flag loss under a virtual safety car and a safety car
/** A track's pit loss in ms: { green, vsc, sc, own, learned } (own: set by you or saved from your last race there, learned: { stops, at } when saved). */
function pitLoss(c, track) {
  const o = c?.pitLoss?.[track]; const g = (o?.green ?? PIT_GREEN[track] ?? 22) * 1000;
  return { green: g, vsc: (o?.vsc ?? g / 1000 * PIT_VSC) * 1000, sc: (o?.sc ?? g / 1000 * PIT_SC) * 1000, own: !!o, learned: o?.learned || null };
}
const TYRE_PRESETS = ['softer', 'balanced', 'harder'];
const PRESET_NAME = { softer: 'Softer', balanced: 'Balanced', harder: 'Harder' };
// dry sets per compound for each kind of weekend (the same for every preset), and where each preset puts them: the
// sessions of the game's Tyre Allocation screen, each with its sets. A best guess at F1 25's: correct them in the app
const TYRE_COUNTS = { normal: { 16: 8, 17: 3, 18: 2 }, sprint: { 16: 6, 17: 4, 18: 2 } };
// the sessions of the game's Tyre Allocation screen; practice is one column (the most-used sets of each session go
// back, the rest carry over to the next practice session)
const TYRE_COLS = { normal: ['Practice', 'Q1', 'Q2', 'Q3', 'R'], sprint: ['Practice', 'SQ1', 'SQ2', 'SQ3', 'SPR', 'Q1', 'Q2', 'Q3', 'R'] };
// the sets that go back to Pirelli, and the session after which they go: on a normal weekend practice and the Q3 set;
// on a sprint weekend everything but the race sets and the Q1 and Q2 sets
const TYRE_RETURNED = { normal: { Practice: 'practice', Q3: 'Q' }, sprint: { Practice: 'practice', SQ1: 'SQ', SQ2: 'SQ', SQ3: 'SQ', SPR: 'SPR', Q3: 'Q' } };
const TYRE_PRACTICE = ['Practice'];
const S_ = 16, M_ = 17, H_ = 18;
const TYRE_PLAN = {
  normal: {
    softer: { Practice: [S_, S_, M_, M_, H_, H_], Q1: [S_], Q2: [S_], Q3: [S_], R: [S_, S_, S_, M_] },
    balanced: { Practice: [S_, S_, S_, S_, M_, H_], Q1: [S_], Q2: [S_], Q3: [S_], R: [S_, M_, M_, H_] },
    harder: { Practice: [S_, S_, S_, S_, S_, M_], Q1: [S_], Q2: [S_], Q3: [S_], R: [M_, M_, H_, H_] },
  },
  sprint: {
    softer: { Practice: [M_, H_], SQ1: [S_], SQ2: [S_], SQ3: [S_], SPR: [M_], Q1: [S_], Q2: [S_], Q3: [S_], R: [M_, M_, H_] },
    balanced: { Practice: [S_, M_], SQ1: [S_], SQ2: [S_], SQ3: [S_], SPR: [M_], Q1: [S_], Q2: [S_], Q3: [M_], R: [M_, H_, H_] },
    harder: { Practice: [S_, S_], SQ1: [S_], SQ2: [S_], SQ3: [S_], SPR: [M_], Q1: [S_], Q2: [M_], Q3: [M_], R: [M_, H_, H_] },
  },
};
const countsOf = (c, fmt) => ({ ...TYRE_COUNTS[fmt], ...(c?.tyreCounts?.[fmt] || {}) });
/** A preset's sets per session: yours where you've changed it (older saves had practice as FP1–FP3: they're put together). */
function planOf(c, fmt, p) {
  const own = c?.tyrePlans?.[fmt]?.[p] || {}; const merged = { ...own };
  if (!merged.Practice && (own.FP1 || own.FP2 || own.FP3)) merged.Practice = [...(own.FP1 || []), ...(own.FP2 || []), ...(own.FP3 || [])];
  return Object.fromEntries(TYRE_COLS[fmt].map(k => [k, [...(merged[k] ?? TYRE_PLAN[fmt][p][k] ?? [])]]));
}
/** A weekend's tyre preset: its own, else the latest one set before it (earlier seasons too), else balanced. */
function tyrePreset(s, roundId) {
  const c = career(), rounds = activeRounds(s);
  for (let k = rounds.findIndex(r => r.id === roundId); k >= 0; k--) { const v = s.weekends[rounds[k].id]?.tyrePreset; if (v) return v; }
  for (let i = s.index - 1; i >= 0; i--) { const p = c?.seasons[i]; if (!p) continue; const rs = activeRounds(p); for (let k = rs.length - 1; k >= 0; k--) { const v = p.weekends[rs[k].id]?.tyrePreset; if (v) return v; } }
  return 'balanced';
}
// the allocation columns each logged session uses
const SESSION_COLS = { FP1: ['Practice'], FP2: ['Practice'], FP3: ['Practice'], FP: ['Practice'], SQ: ['SQ1', 'SQ2', 'SQ3'], SPR: ['SPR'], Q: ['Q1', 'Q2', 'Q3'], R: ['R'] };
/**
 * Your tyre sets this weekend, laid out by the preset: every set has its session. Each stint you ran used a set of
 * that compound from the session's own sets first (else the next one not yet used), worn as much as the laps wore it.
 * Where a session sent the game's tyre-set data, its wear figures replace those (most worn to most used); its
 * "available" flag only means usable in the session running, so it isn't used. Sets go back by the weekend's rules
 * once their session is logged; any set can be marked returned (or brought back) by hand.
 * { source, fmt, cols: [{ k, sets }], left, all }; a set: { id, c, n, of, col, wear, avail, hand, used }
 */
function tyreSetsFor(c, s, round) {
  const w = s.weekends[round.id]; const fmt = round.sprint ? 'sprint' : 'normal'; const hand = w?.tyreHand || {};
  const keys = sessionsFor(s, round); const logged = keys.filter(k => w?.sessions?.[k]?.game);
  const plan = planOf(c, fmt, tyrePreset(s, round.id));
  const seen = {}; const sets = TYRE_COLS[fmt].flatMap(k => plan[k].map(cp => ({ c: cp, col: k, wear: 0, avail: true, used: false })));
  for (const x of sets) x.n = (seen[x.c] = (seen[x.c] || 0) + 1); for (const x of sets) { x.of = seen[x.c]; x.id = `${x.c}-${x.n}`; }
  for (const k of logged) {
    const sd = w.sessions[k]; const cols = SESSION_COLS[k] || [];
    for (const st of stintsOf(sd, PLAYER)) {
      if (!DRY.includes(st.c)) continue;
      const set = sets.find(x => x.c === st.c && !x.used && cols.includes(x.col)) || sets.find(x => x.c === st.c && !x.used);
      if (!set) continue;
      set.used = true; const wr = sd.game.wear?.[PLAYER]?.[st.to - 1]; set.wear = Math.max(1, Math.round(wr ?? (st.to - st.from + 1) * 2));
    }
  }
  // the game's own wear figures, where a session sent them: matched compound by compound, most worn first
  const G = logged.filter(k => w.sessions[k].game.tyreSets?.sets).pop();
  if (G) for (const cp of DRY) {
    const real = w.sessions[G].game.tyreSets.sets.filter(x => x.c === cp && x.wear > 0).map(x => x.wear).sort((a, b) => b - a);
    const mine = sets.filter(x => x.c === cp && x.used).sort((a, b) => b.wear - a.wear);
    mine.forEach((x, k) => { if (real[k] != null) x.wear = real[k]; });
  }
  // sets going back, once their session is over
  const doneKind = (kind) => kind === 'practice' ? (() => { const P = keys.filter(k => PRACTICE_KEYS.includes(k)); return P.length && P.every(k => w?.sessions?.[k]?.done); })() : !!w?.sessions?.[kind]?.done;
  for (const x of sets) { const kind = TYRE_RETURNED[fmt][x.col]; if (kind && doneKind(kind)) x.avail = false; }
  for (const x of sets) if (hand[x.id] != null) { x.avail = !hand[x.id]; x.hand = true; }
  return { source: G ? 'game' : 'preset', fmt, cols: TYRE_COLS[fmt].map(k => ({ k, sets: sets.filter(x => x.col === k) })), left: sets.filter(x => x.avail), all: sets };
}
/** The sets a race plan can use: per compound, the wear of each set left, freshest first (sets that go back never count). */
function setsLeft(c, s, round) {
  const T = tyreSetsFor(c, s, round); const out = {};
  for (const x of T.left) if (x.hand || !TYRE_RETURNED[T.fmt][x.col]) (out[x.c] ||= []).push(x.wear || 0);
  for (const k in out) out[k].sort((a, b) => a - b);
  return { sets: out, source: T.source };
}
/** One set in the tracker: its compound ring, which of the compound's sets it is, its wear. Tap to mark it returned. */
function tyreSetHtml(x, act = '') {
  const col = COMPOUNDS[x.c]?.[2] || '#888';
  return `<${act ? 'button' : 'div'} class="tset ${x.avail ? '' : 'gone'}" style="--tc:${col}" ${act} title="${esc(COMPOUNDS[x.c]?.[1] || 'Tyre')} ${x.n}/${x.of}${x.wear ? `, ${x.wear}% worn` : ', new'}${x.avail ? '' : ', returned'}${act ? (x.avail ? ' · tap to mark returned' : ' · tap to bring back') : ''}"><b>${x.avail ? '' : '↺ '}${x.n}/${x.of}</b><small>${x.wear ? `${x.wear}%` : 'new'}</small></${act ? 'button' : 'div'}>`;
}
/** Current Weekend: the tyre allocation, like the game's own screen: the preset, then each session's sets. */
function tyreAllocPanel(c, s, r) {
  const p = tyrePreset(s, r.id); const T = tyreSetsFor(c, s, r); const A = countsOf(c, T.fmt);
  const i = TYRE_PRESETS.indexOf(p);
  const counts = DRY.map(cp => `<span class="ta-count"><i class="ta-dot" style="--tc:${COMPOUNDS[cp][2]}">${COMPOUNDS[cp][0]}</i>×${A[cp] || 0}</span>`).join('');
  const act = (x) => `data-act="tyre-hand" data-round="${r.id}" data-id="${x.id}" data-v="${x.avail ? 1 : 0}"`;
  const cols = T.cols.map(x => `<div class="ta-col"><span class="ta-h">${esc(x.k)}</span><div class="ta-sets">${x.sets.map(y => tyreSetHtml(y, act(y))).join('') || '<div class="tset empty"></div>'}</div></div>`).join('');
  return `<div class="panel"><div class="panel-h"><h2>Tyre allocation</h2><div class="row" style="gap:6px"><span class="muted" style="font-size:12px">${T.source === 'game' ? 'Sets from F1 25' : `The ${PRESET_NAME[p].toLowerCase()} preset, until a session sends the game’s tyre data`}</span><button class="btn sm ghost" data-act="tyre-presets" data-fmt="${T.fmt}" data-p="${p}">Edit presets</button></div></div>
    <div class="panel-b"><div class="ta-head"><span class="ta-name">${PRESET_NAME[p]}</span><span>Tyre allocation</span>
      <button class="icon-btn sm" data-act="tyre-preset" data-round="${r.id}" data-v="${TYRE_PRESETS[(i + 2) % 3]}" title="Previous preset">${ICON.left}</button><button class="icon-btn sm" data-act="tyre-preset" data-round="${r.id}" data-v="${TYRE_PRESETS[(i + 1) % 3]}" title="Next preset">${ICON.right}</button>
      ${counts}<span class="muted" style="font-size:12px">${T.fmt === 'sprint' ? 'sprint weekend' : 'normal weekend'}</span></div>
      <div class="ta-cols">${cols}</div>
      <p class="muted" style="font-size:12px;margin:8px 0 0">↺ returned. ${T.fmt === 'sprint' ? 'Everything but the race, Q1 and Q2 sets goes back, each once its session is over' : 'The practice sets go back after the last practice session, and the Q3 set after qualifying'}. Tap a set to mark it returned, or to bring it back, if the game handled it differently. The race strategy only uses sets you still have, and a used set starts its stint already worn.</p></div></div>`;
}
/** The presets editor: the sets for each kind of weekend, and where each preset puts them. */
function tyrePresetsModal() {
  const c = career(); const fmt = ui.tpFmt || 'normal'; const p = ui.tpPreset || 'balanced';
  const A = countsOf(c, fmt); const plan = planOf(c, fmt, p);
  const placed = {}; for (const k of TYRE_COLS[fmt]) for (const cp of plan[k]) placed[cp] = (placed[cp] || 0) + 1;
  const off = DRY.filter(cp => (placed[cp] || 0) !== (A[cp] || 0));
  const chip = (cp, k, j) => `<button class="tset" style="--tc:${COMPOUNDS[cp][2]}" data-act="tyre-cycle" data-fmt="${fmt}" data-p="${p}" data-k="${k}" data-j="${j}" title="Tap to change the compound (after hard, the set is removed)"><b>${COMPOUNDS[cp][0]}</b></button>`;
  modal(`<div class="modal-h"><h2>Tyre allocation presets</h2><button class="icon-btn" data-act="modal-close">${ICON.x}</button></div>
    <div class="modal-b stack">
      <div class="row" style="gap:8px"><div class="seg">${[['normal', 'Normal weekend'], ['sprint', 'Sprint weekend']].map(([v, l]) => `<button data-act="tp-fmt" data-v="${v}" class="${fmt === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <div><span class="label">Sets for a ${fmt} weekend (every preset)</span><div class="row" style="gap:12px">${DRY.map(cp => `<label class="row" style="gap:6px">${tyreChip(cp)} <input type="number" min="0" max="13" value="${A[cp]}" data-ch="tyre-count" data-fmt="${fmt}" data-c="${cp}" style="width:60px"></label>`).join('')}</div></div>
      <div class="row" style="gap:8px"><div class="seg">${TYRE_PRESETS.map(v => `<button data-act="tp-preset" data-v="${v}" class="${p === v ? 'on' : ''}">${PRESET_NAME[v]}</button>`).join('')}</div></div>
      <div class="ta-cols">${TYRE_COLS[fmt].map(k => `<div class="ta-col"><span class="ta-h">${k}</span><div class="ta-sets">${plan[k].map((cp, j) => chip(cp, k, j)).join('')}</div><button class="btn sm ghost" data-act="tyre-add" data-fmt="${fmt}" data-p="${p}" data-k="${k}" title="Add a set to ${k}">+</button></div>`).join('')}</div>
      ${off.length ? `<div class="callout">This preset places ${DRY.map(cp => `${placed[cp] || 0} ${COMPOUNDS[cp][1].toLowerCase()}`).join(', ')}, but a ${fmt} weekend has ${DRY.map(cp => `${A[cp]} ${COMPOUNDS[cp][1].toLowerCase()}`).join(', ')}.</div>` : ''}
      <p class="muted" style="font-size:12px;margin:0">Match these to the game’s Tyre Allocation screen once and every weekend with this preset follows them. Tap a set to change its compound (after hard it’s removed); + adds a soft. On a normal weekend the practice and Q3 sets go back; on a sprint weekend everything but the race, Q1 and Q2 sets.</p>
      <div class="row"><button class="btn sm ghost" data-act="tyre-presets-reset" data-fmt="${fmt}" data-p="${p}">Back to the defaults for this preset</button></div></div>`);
}
/**
 * The quickest plans for a race of n laps, given the runs. loss: ms a stop costs. sets: the sets you have left, per
 * compound (their wear, freshest first): a plan can't use more sets of a compound than you have, and a used set starts
 * its stint as old as its wear makes it (so it is slower and has less life left).
 */
function optimalStrategies(runs, n, { loss = PIT_LOSS, sets = null } = {}) {
  const comps = Object.keys(runs).map(Number); const res = [];
  const life = (c) => Math.max(3, Math.min(n, runs[c].life ?? Math.round(n * 0.7)));
  const perLap = (c) => runs[c].wear ?? (runs[c].life ? WEAR_LIMIT / runs[c].life : null); // % wear a lap
  const age0 = (c, wr) => wr && perLap(c) ? wr / perLap(c) : 0; // laps a set's wear is worth
  const stint = (c, L, a = 0) => L * runs[c].base + runs[c].deg * (L * a + L * (L - 1) / 2);
  const seqs = (len) => len === 1 ? comps.map(c => [c]) : seqs(len - 1).flatMap(q => comps.map(c => [...q, c]));
  for (let stops = 1; stops <= 3; stops++) {
    if (stops === 3 && res.length) break;
    for (const seq of seqs(stops + 1)) {
      if (new Set(seq).size < 2) continue; // two different dry compounds, as the rules require
      // each stint's set: the next freshest of its compound, in order of use
      const occ = seq.map((c, i) => seq.slice(0, i).filter(x => x === c).length);
      if (sets && seq.some((c, i) => occ[i] >= (sets[c]?.length || 0))) continue; // not enough sets of it left
      const wears = seq.map((c, i) => sets?.[c]?.[occ[i]] ?? 0); const a0 = seq.map((c, i) => age0(c, wears[i]));
      const lifeAt = (i) => Math.max(1, Math.floor(life(seq[i]) - a0[i]));
      let best = null;
      const step = stops === 3 ? 2 : 1;
      const tryLens = (lens) => { if (lens.some((L, i) => L < 1 || L > lifeAt(i))) return; const tt = lens.reduce((a, L, i) => a + stint(seq[i], L, a0[i]), 0) + stops * loss; if (!best || tt < best.t) best = { t: tt, lens: [...lens] }; };
      if (stops === 1) for (let a = 1; a < n; a++) tryLens([a, n - a]);
      else if (stops === 2) for (let a = 1; a < n - 1; a++) for (let b = 1; a + b < n; b++) tryLens([a, b, n - a - b]);
      else for (let a = 1; a < n - 2; a += step) for (let b = 1; a + b < n - 1; b += step) for (let c = 1; a + b + c < n; c += step) tryLens([a, b, c, n - a - b - c]);
      if (best) {
        best.windows = best.lens.slice(0, -1).map((_, j) => {
          const at = best.lens.slice(0, j + 1).reduce((a, b) => a + b, 0); let lo = at, hi = at;
          for (let d = -20; d <= 20; d++) {
            const L2 = [...best.lens]; L2[j] += d; L2[j + 1] -= d;
            if (L2.some((L, i) => L < 1 || L > lifeAt(i))) continue;
            const tt = L2.reduce((a, L, i) => a + stint(seq[i], L, a0[i]), 0) + stops * loss;
            if (tt - best.t <= 2500) { lo = Math.min(lo, at + d); hi = Math.max(hi, at + d); }
          }
          return [lo, hi];
        });
        res.push({ stops, seq, ...best, wears });
      }
    }
  }
  // the same stints in another order time the same (fuel is left out): keep one of them
  const seen = new Set();
  return res.sort((a, b) => a.t - b.t).filter(p => { const k = p.seq.map((c, i) => c + ':' + p.lens[i]).sort().join(); return !seen.has(k) && seen.add(k); }).slice(0, 3);
}
/** One strategy block: the quickest plans and the numbers behind them. */
function strategyBlock(title, runs, n, note, opts = {}) {
  const plans = optimalStrategies(runs, n, opts);
  const fmtGap = (ms) => ms < 50 ? 'Fastest' : `+${(ms / 1000).toFixed(1)} s`;
  return `<div class="panel-b stack" style="gap:8px;border-top:1px solid var(--line)"><div class="row" style="justify-content:space-between"><span class="label" style="margin:0">${esc(title)}</span><span class="muted" style="font-size:12px">${esc(note)}</span></div>
    ${plans.length ? `<div class="strat-bars">${plans.map((p, i) => { let lap = 0; const st = p.seq.map((cp, k) => { const from = lap + 1; lap += p.lens[k]; return { c: cp, from, to: lap }; }); const word = ['', 'one', 'two', 'three'][p.stops] + '-stopper'; const name = i === 0 ? `<b>The quickest</b> ${word}` : p.t - plans[0].t < 3000 ? `<b>Very close</b> ${word}` : p.stops > plans[0].stops ? `<b>Aggressive</b> ${word}` : p.stops < plans[0].stops ? `<b>Conservative</b> ${word}` : `<b>Alternative</b> ${word}`; const used = opts.sets && p.wears.some(x => x > 0) ? `<small class="muted strat-sets">${p.seq.map((cp, k) => `${p.wears[k] ? `used ${COMPOUNDS[cp][1].toLowerCase()} (${p.wears[k]}%)` : `new ${COMPOUNDS[cp][1].toLowerCase()}`}`).join(' → ')}</small>` : ''; return `<div class="strat-row">${stintBar(st, n, { windows: p.windows })}<div class="strat-name"><span>${name}</span><small class="muted">${fmtGap(p.t - plans[0].t)}</small></div>${used}</div>`; }).join('')}</div>` : '<div class="muted" style="font-size:13px">No plan fits: on these runs the tyres would not last the distance.</div>'}
    <div class="table-wrap"><table><thead><tr><th>Tyre</th><th class="num">Pace</th><th class="num">Fall-off / lap</th><th class="num">Wear / lap</th><th class="num">Life</th></tr></thead><tbody>
      ${DRY.filter(cp => runs[cp]).map(cp => { const x = runs[cp]; return `<tr><td>${tyreChip(cp)} ${COMPOUNDS[cp][1]}${x.src ? `<div class="muted" style="font-size:11px">${esc(x.src)}</div>` : ''}</td><td class="num mono">${fmtLap(x.base)}</td><td class="num">+${(x.deg / 1000).toFixed(3)} s${x.degNote ? `<div class="muted" style="font-size:11px">${esc(x.degNote)}</div>` : ''}</td><td class="num">${x.wear != null ? x.wear.toFixed(1) + '%' : '–'}${x.wearNote ? `<div class="muted" style="font-size:11px">${esc(x.wearNote)}</div>` : ''}</td><td class="num">${x.life ? plural(x.life, 'lap') : '–'}</td></tr>`; }).join('')}
    </tbody></table></div></div>`;
}
/** Dashboard: the best strategy for the next race, from this weekend's practice (the grid's, then yours). Each needs
 *  at least two dry compounds with three or more consecutive clean laps. */
/*
  Fuel to carry. Each session logged from F1 25 keeps the fuel in every car's tank at the end of each lap, so a lap's
  burn is the drop from one lap to the next. Only proper laps count (a time within 7% of the driver's typical lap in
  that session: out-laps, in-laps and slow laps burn less), from this weekend's practice and the sprint, and the burn
  is their average (any more than a quarter off the middle one left out). The fuel to carry is that times the laps,
  plus half a lap to spare.
*/
const FUEL_SPARE_LAPS = 0.5;
/** A driver's fuel burn a lap from this weekend: { kg, laps, from: [session keys] } or null. */
function fuelBurn(s, r, id) {
  const w = s.weekends[r.id]; const drops = []; const from = [];
  for (const k of RUN_KEYS) {
    const sd = w?.sessions?.[k]; const g = sd?.game; if (!g || sd.estimated) continue;
    const F = g.fuel?.[id] || [], L = g.laps?.[id] || []; const mid = median(L.map(l => l?.[0]).filter(Boolean)); if (!mid) continue;
    let n = 0;
    for (let i = 1; i < F.length; i++) {
      const d = F[i - 1] != null && F[i] != null ? F[i - 1] - F[i] : null; const ms = L[i]?.[0];
      if (d != null && d > 0.2 && d < 5 && ms && ms < mid * 1.07) { drops.push(d); n++; }
    }
    if (n) from.push(k);
  }
  if (drops.length < 3) return null;
  const m = median(drops); const ok = drops.filter(d => Math.abs(d - m) <= m * 0.25);
  return { kg: avg(ok), laps: ok.length, from };
}
/** The sprint's laps: as the game ran it, else a third of the race (as F1 25's sprints are). */
const sprintLaps = (s, r) => s.weekends[r.id]?.sessions?.SPR?.game?.totalLaps || Math.round(raceLaps(s, r.id) / 3);
/** Fuel to carry for the race (and the sprint, when it's still to come), for each of your drivers. */
function fuelPanel(c, s, r, ids) {
  const w = s.weekends[r.id] || {}; const races = [['Race', raceLaps(s, r.id)]];
  if (r.sprint && !w.sessions?.SPR?.done) races.unshift(['Sprint', sprintLaps(s, r)]);
  const rows = ids.map(id => ({ id, B: fuelBurn(s, r, id) }));
  const kg = (v) => `${v.toFixed(1)} kg`;
  const head = `<div class="panel-h"><h2>Fuel to carry</h2><span class="muted" style="font-size:12px">${esc(r.name)} · from practice${r.sprint ? ' and the sprint' : ''}</span></div>`;
  if (!rows.some(x => x.B)) return `<div class="panel">${head}<div class="panel-b muted" style="font-size:13px">No fuel figures yet: they come from your laps in practice logged from F1 25 (three proper laps or more).</div></div>`;
  return `<div class="panel">${head}<div class="panel-b stack" style="gap:10px">
    ${rows.map(({ id, B }) => `<div class="fuel-row">${ids.length > 1 ? `<b class="fuel-who">${esc(dName(s, id))}</b>` : ''}
      ${B ? `<div class="fuel-burn"><span class="label">Burn</span><b>${B.kg.toFixed(2)} kg</b><span class="muted">a lap, from ${plural(B.laps, 'lap')} in ${esc(listJoin(B.from.map(k => SESSION_SHORT[k] || k)))}</span></div>
        ${races.map(([label, n]) => `<div class="fuel-need"><span class="label">${label} · ${plural(n, 'lap')}</span><b>${kg(B.kg * (n + FUEL_SPARE_LAPS))}</b><span class="muted">${kg(B.kg * n)} for the distance + ${kg(B.kg * FUEL_SPARE_LAPS)} spare</span></div>`).join('')}`
        : '<span class="muted" style="font-size:13px">No practice laps with fuel figures yet.</span>'}</div>`).join('')}
    <p class="muted" style="font-size:12px;margin:0">Your burn a lap times the laps, plus half a lap to spare. Driving the formation lap uses fuel too: about another lap’s worth.</p></div></div>`;
}
function strategyAdvicePanel(c, s) {
  const r = nextRound(s); if (!r || isHist(s)) return '';
  const anyPractice = RUN_KEYS.some(k => s.weekends[r.id]?.sessions?.[k]?.game && !s.weekends[r.id].sessions[k].estimated);
  const head = `<div class="panel-h"><h2>Race strategy</h2><span class="muted" style="font-size:12px">${esc(r.name)} · from practice${r.sprint ? " and the sprint" : ""}</span></div>`;
  if (!anyPractice) return `<div class="panel">${head}<div class="panel-b muted" style="font-size:13px">No practice logged from F1 25 for ${esc(r.name)} yet. Run practice with telemetry on and the best strategy appears here: it needs at least three consecutive laps on two dry compounds.</div><div class="panel-b" style="font-size:13px">${overtakeRow(c, trackOf(r))}</div></div>`;
  const n = raceLaps(s, r.id); const tid = trackOf(r); const PL = pitLoss(c, tid); const SL = setsLeft(c, s, r);
  const { grid, mine } = strategyRuns(s, r); const SK = strategyKeys(s, r);
  const names = (runs) => listJoin(DRY.filter(cp => runs[cp]).map(cp => COMPOUNDS[cp][1].toLowerCase()));
  const short = (title, runs, who) => `<div class="panel-b muted" style="font-size:13px;border-top:1px solid var(--line)"><span class="label">${title}</span>Not enough ${who} yet: it needs at least three consecutive laps on two dry compounds.${Object.keys(runs).length ? ` So far: ${names(runs)}.` : ''}</div>`;
  // a plan needs two tyres someone actually ran (a filled-in tyre can complete the set, not start it)
  const enough = (runs) => Object.values(runs).filter(x => !x.src || x.src.startsWith('from')).length >= 2 && Object.keys(runs).length >= 2;
  return `<div class="panel">${head}
    ${SK.dropped.length ? `<div class="panel-b"><div class="callout">${esc(listJoin(SK.dropped.map(x => SESSION_SHORT[x.k] || x.k)))} left out: your ${COMPOUNDS[SK.dropped[0].c][1].toLowerCase()}s wore ${SK.dropped[0].a.toFixed(1)}% a lap there against ${SK.dropped[0].b.toFixed(1)}% in ${SESSION_SHORT[SK.dropped[0].j] || SK.dropped[0].j}, so the tyre-wear setting probably changed. Only the later sessions count, for you and the grid.</div></div>` : ''}
    ${enough(grid) ? strategyBlock('From the whole grid', grid, n, `long runs from ${plural(Math.max(0, ...Object.values(grid).map(x => x.drivers || 0)), 'driver')}`, { loss: PL.green }) : short('From the whole grid', grid, 'long runs from the grid')}
    ${enough(mine) ? strategyBlock('From your runs', mine, n, 'your car, your driving, the sets you have left', { loss: PL.green, sets: SL.sets }) : short('From your runs', mine, 'of your own running')}
    <div class="panel-b muted" style="font-size:12px;border-top:1px solid var(--line)">${plural(n, 'lap')} at your race distance. A tyre is done at ${WEAR_LIMIT}% wear. Pace is on an empty tank and without extra boost (sessions logged from 3.4 on), so runs on different fuel loads compare fairly; a run on a set that was already worn counts as the new set it was. Fuel burn is the same for every plan, so it is left out of the totals.
      <div class="row pit-loss" style="gap:8px;margin-top:6px;flex-wrap:wrap"><span>Pit loss at ${esc(D.TRACKS[tid]?.circuit || r.name)}${PL.learned ? ` (from your last race here, ${plural(PL.learned.stops, 'stop')})` : PL.own ? ' (yours)' : ''}:</span>${[['green', 'green flag'], ['vsc', 'VSC'], ['sc', 'safety car']].map(([k, l]) => `<label class="row" style="gap:4px"><input type="number" step="0.5" min="0" max="60" value="${(PL[k] / 1000).toFixed(1)}" data-ch="pit-loss" data-track="${tid}" data-k="${k}" style="width:64px"> s ${l}</label>`).join('')}${PL.own ? `<button class="btn sm ghost" data-act="pit-loss-reset" data-track="${tid}">Default</button>` : ''}</div>
      ${overtakeRow(c, tid)}</div></div>`;
}
