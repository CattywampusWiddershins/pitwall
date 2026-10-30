/* Pitwall — Live Race: strategy, undercuts, odds and the dashboard. Part of the renderer, split into files that load in order (see index.html). */
'use strict';
/* ------------------------------------------------------------- live race */
/*
  Live Race: a race dashboard while you drive the race or the sprint, fed by F1 25 every second. It shows your position
  and gaps, a strategy that adapts as your tyres go (with a PIT THIS LAP call and your own sounds), whether to stop under
  a safety car, where you would rejoin, who is catching whom (or the undercut threat while a stop is still to come), the
  championship as it stands, the weather and the ERS map. Before the race you pick the strategy to follow; after it, the
  page becomes a debrief (and a celebration when a title is decided) until the next weekend's first session.
*/
const LIVE_FRESH = 30e3; // ms without a message before the race counts as gone
const isLive = () => !!liveErs && !liveErs.done && Date.now() - Date.parse(liveErs.at || 0) < LIVE_FRESH;
/** The live race if it's this round's: { ...msg, key: 'R' | 'SPR' }. */
function liveFor(c, r) {
  const L = liveErs; if (!L || !isLive() || GAME_TRACKS[L.track] !== trackOf(r)) return null;
  if ((c.gameKeys || []).includes(`${L.uid}:${L.sessionType}`)) return null;
  return { ...L, key: L.sessionType === 15 && (L.weekend || []).includes(16) ? 'SPR' : 'R' };
}
/** Game car index → driver id, from the live participants. */
function liveMap(c, s, L) {
  const cars = (L.parts || []).map(p => ({ idx: p.idx, name: p.name, number: p.number, team: p.team }));
  return mapGameDrivers(c, s, { cars, player: L.player }).map;
}
// ---- the strategy for the rest of the race
/**
 * The quickest way to finish from here: stay on the current set for k more laps (this one included), then up to two
 * more stints on sets you have left. usedOther: a second dry compound has already been run (the rules need two).
 * Returns the best plan and every k within 1.5 s of it: { t, k, stints: [{ c, L, wear }], window: [kLo, kHi] }.
 */
function planRest({ runs, sets, cur, age, curLife, left, loss, usedOther, firstLoss = loss, onlyK = null, follow = null, three = false }) {
  const base = (c) => runs[c]?.base, deg = (c) => runs[c]?.deg || 0;
  const perLap = (c) => runs[c]?.wear ?? (runs[c]?.life ? WEAR_LIMIT / runs[c].life : null);
  const life = (c) => runs[c]?.life ?? 40;
  const T = (c, Lx, a = 0) => Lx * base(c) + deg(c) * (Lx * a + Lx * (Lx - 1) / 2);
  const comps = DRY.filter(c => runs[c] && (sets ? sets[c]?.length : true));
  const setOf = (c, k) => sets ? sets[c]?.[k] ?? null : 0;
  const lifeOf = (c, wr) => Math.floor(life(c) - (wr && perLap(c) ? wr / perLap(c) : 0));
  const a0 = (c, wr) => wr && perLap(c) ? wr / perLap(c) : 0;
  const res = [];
  const add = (k, stints, t) => { if (onlyK != null && k !== onlyK) return; res.push({ k, stints, t }); };
  if (runs[cur] && (usedOther || cur == null) && left <= curLife && !follow?.length) add(left, [], T(cur, left, age));
  for (let k = 1; k < left; k++) {
    if (k > curLife) break;
    const head = T(cur, k, age) + firstLoss; const rest = left - k;
    for (const c2 of comps) {
      if (follow?.length && c2 !== follow[0]) continue;
      const w2 = setOf(c2, 0); if (w2 == null) continue;
      // one more stint to the flag
      if ((usedOther || c2 !== cur) && rest <= lifeOf(c2, w2) && !(follow?.length > 1)) add(k, [{ c: c2, L: rest, wear: w2 }], head + T(c2, rest, a0(c2, w2)));
      // or two
      for (const c3 of comps) {
        if (follow?.length > 1 && c3 !== follow[1]) continue;
        const w3 = setOf(c3, c3 === c2 ? 1 : 0); if (w3 == null) continue;
        if (!(usedOther || c2 !== cur || c3 !== cur)) continue;
        for (let L2 = 1; L2 < rest; L2++) {
          const L3 = rest - L2; if (L2 > lifeOf(c2, w2) || L3 > lifeOf(c3, w3)) continue;
          add(k, [{ c: c2, L: L2, wear: w2 }, { c: c3, L: L3, wear: w3 }], head + T(c2, L2, a0(c2, w2)) + loss + T(c3, L3, a0(c3, w3)));
        }
      }
    }
  }
  // nothing fits on one or two more stints (a long race on short-lived tyres, or stopping under a safety car with a
  // set short of the flag): three more, where asked (your own plan, not the rivals' or every lap tried)
  if (!res.length && three) for (let k = 1; k < left && k <= curLife; k++) {
    if (onlyK != null && k !== onlyK) continue; const head = T(cur, k, age) + firstLoss; const rest = left - k;
    for (const c2 of comps) for (const c3 of comps) for (const c4 of comps) {
      if (follow?.length && (c2 !== follow[0] || (follow[1] != null && c3 !== follow[1]) || (follow[2] != null && c4 !== follow[2]))) continue;
      const w2 = setOf(c2, 0), w3 = setOf(c3, +(c3 === c2)), w4 = setOf(c4, (c4 === c2) + (c4 === c3)); if (w2 == null || w3 == null || w4 == null) continue;
      if (!(usedOther || new Set([cur, c2, c3, c4]).size > 1)) continue;
      for (let L2 = 1; L2 <= Math.min(rest - 2, lifeOf(c2, w2)); L2++) for (let L3 = 1; L3 <= Math.min(rest - L2 - 1, lifeOf(c3, w3)); L3++) {
        const L4 = rest - L2 - L3; if (L4 > lifeOf(c4, w4)) continue;
        add(k, [{ c: c2, L: L2, wear: w2 }, { c: c3, L: L3, wear: w3 }, { c: c4, L: L4, wear: w4 }], head + T(c2, L2, a0(c2, w2)) + loss + T(c3, L3, a0(c3, w3)) + loss + T(c4, L4, a0(c4, w4)));
      }
    }
  }
  if (!res.length) return null;
  res.sort((a, b) => a.t - b.t); const best = res[0];
  const ks = res.filter(x => x.t - best.t <= 1500 && x.stints.length === best.stints.length && x.stints[0]?.c === best.stints[0]?.c).map(x => x.k);
  const alts = [0, 1, 2, 3].map(n => res.find(x => x.stints.length === n)).filter(Boolean);
  return { ...best, window: [Math.min(...ks), Math.max(...ks)], alts };
}
/** A driver's laps from the live lap history: [{ n, ms, valid, s1, s2, s3 }] (n: lap number, counted from the history itself so a late history packet can't shift them). */
function liveLaps(x) { const all = x.laps || []; const first = x.nLaps != null ? x.nLaps - all.length + 1 : Math.max(1, (x.lap || all.length) - all.length); return all.map((l, k) => ({ n: first + k, ms: l[0], valid: !!l[1], s1: l[2], s2: l[3], s3: l[4] })).filter(l => l.ms); }
/** A car's fuel in the live race: kg during lap n (end-of-lap reading plus half a lap's burn), and the burn a lap. */
function liveFuel(x) {
  const F = x.fuelLaps || []; const off = (x.fuelN ?? F.length) - F.length;
  const drops = F.map((v, k) => k && F[k - 1] != null && v != null ? F[k - 1] - v : null).filter(v => v != null && v > 0.2 && v < 5); const burn = median(drops) || 0;
  const at = (n) => { const v = F[n - 1 - off]; return v == null ? (x.fuel != null && n >= (x.lap || 0) ? x.fuel : null) : v + burn / 2; };
  at.burn = burn; return at;
}
/** The lap time a tyre gives in the race: its normalised pace and fall-off at that age, plus the fuel on board. */
const livePace = (runs, c, age, fuelKg) => runs[c] ? runs[c].base + runs[c].deg * Math.max(0, age - 1) + (fuelKg || 0) * FUEL_MS : null;
/**
 * The laps a car's tyres have left before the wear limit, counted from the start of the lap it's on (as the laps left
 * in the race are). The wear rate is what this set has put on in green-flag laps (mergeLive keeps the tally, the part
 * of a lap included), so a used set's earlier wear and the slow laps behind a safety car don't count. It starts from
 * the rate in practice, worth three laps, so the first lap or two on a set can't swing it.
 */
const WEAR_PRIOR_LAPS = 3;
function tyreLifeLeft(x, run, field) {
  const age = x.age || 0; const len = Math.max(1000, ...(field || []).map(y => y.dist || 0));
  const frac = Math.min(1, Math.max(0, (x.dist || 0) / len));
  const prior = run?.wear ?? (run?.life ? WEAR_LIMIT / run.life : null); const gL = x.twL || 0, gW = x.twW || 0;
  const rate = prior ? (gW + prior * WEAR_PRIOR_LAPS) / (gL + WEAR_PRIOR_LAPS) : gL >= 2 ? gW / gL : null;
  if (!rate || x.wear == null) return Math.max(1, (run?.life ?? 40) - age);
  return Math.max(1, Math.floor((WEAR_LIMIT - x.wear) / rate + frac));
}
/** What a driver's live race says about their strategy now. */
function liveStrategy(c, s, r, L, me, id, w, idOf = null) {
  const n = L.totalLaps || raceLaps(s, r.id); const left = Math.max(1, n - me.lap + 1);
  const PL = racePitLoss(c, trackOf(r), L); const lossNow = L.sc === 1 ? PL.sc : L.sc === 2 ? PL.vsc : PL.green;
  const mineId = id === PLAYER;
  const runs = JSON.parse(JSON.stringify(mineId ? strategyRuns(s, r).mine : (() => { const g = strategyRuns(s, r).grid; const o = practiceRuns(s, r, id); fillTyres(g, o); return o; })()));
  const cur = DRY.includes(me.c) ? me.c : null; const age = me.age || 0;
  if (!cur || !runs[cur]) return { n, left, lossNow, PL, none: true, cur, age };
  // what this stint shows: the fall-off from its clean laps, and the life from the wear so far. Its laps are put on an
  // empty tank (the car gets lighter every lap, which would hide the fall-off); laps behind a safety car or VSC, and
  // any far off the stint's pace, say nothing about the tyres
  const fuelAt = liveFuel(me);
  const scLaps = new Set(L.scLaps?.[me.i] || []);
  const clean = liveLaps(me).filter(l => l.n > me.lap - age && l.n < me.lap && l.valid && !scLaps.has(l.n)); const mid = median(clean.map(l => l.ms));
  const stintLaps = clean.filter(l => l.ms < mid + 2500).map(l => ({ ...l, ms: l.ms - (fuelAt(l.n) ?? 0) * FUEL_MS }));
  // five clean laps or more, and worth more the more laps there are: the practice fall-off counts as eight laps
  if (stintLaps.length >= 5) { const fit = fitLine(stintLaps.map(l => [l.n, l.ms])); if (fit && fit.b > 0) { const n = stintLaps.length; runs[cur].deg = (runs[cur].deg * 8 + fit.b * n) / (8 + n); runs[cur].degLive = fit.b; } }
  const curLife = tyreLifeLeft(me, runs[cur], L.field);
  // the sets left: the game's own data in the race, else from the weekend; the set on the car isn't one of them
  let sets = null;
  if (mineId) {
    const TS = L.tyreSets?.sets; if (TS) { sets = {}; TS.forEach(x => { if (DRY.includes(x.c) && x.avail && !x.fitted) (sets[x.c] ||= []).push(x.wear); }); for (const k in sets) sets[k].sort((a, b) => a - b); }
    else { sets = JSON.parse(JSON.stringify(setsLeft(c, s, r).sets)); const k = sets[cur]?.indexOf(0); if (k >= 0) sets[cur].splice(k, 1); }
  }
  // a second dry compound already run (the tyres of earlier stints), or a sprint, where no stop is needed
  const usedOther = (L.used?.[me.i] || []).some(x => DRY.includes(x) && x !== cur) || L.key === 'SPR';
  const follow = mineId && w.liveStrategy && L.key === 'R' ? w.liveStrategy.seq.slice((me.stops || 0) + 1) : null;
  const args = { runs, sets, cur, age, curLife, left, loss: PL.green, usedOther, three: true };
  const free = planRest(args); const mine = follow?.length ? planRest({ ...args, follow }) : null;
  let plan = mine || free; let changed = false;
  if (mine && free && free.t < mine.t - 2000) { plan = free; changed = true; }
  // the plan with the best odds of finishing higher, not just the quickest: every car on its own plan, and a pass on
  // track only as likely as the track allows. Against the quickest plan, another one has to be likelier to finish
  // ahead of it than behind; when the two are even, the one with the better best case (the gamble that might come off)
  // The plan in hand is kept unless another beats it clearly (10 points more likely to finish ahead than behind), so
  // the call doesn't flip from one update to the next. Under a safety car or VSC, stopping now at the cheaper loss is
  // one of the plans, judged the same way (the odds are worked out again every five seconds).
  let posNote = null; let scCall = null;
  const sc = L.sc === 1 || L.sc === 2 ? L.sc : 0;
  if (idOf && plan) {
    const mem = L.mem || liveErs || {}; const HM = (mem.held ||= {}); let H = HM[me.i];
    if (H && (H.uid !== L.uid || H.stops !== (me.stops || 0) || (H.seq.length && H.lap < me.lap))) H = null;
    const ks = [1, 2, 3, plan.k - 2, plan.k - 1, plan.k + 1, plan.k + 2].filter(k => k >= 1 && k < left && k <= curLife);
    const atK = (k, fol, slack = 0) => planRest({ ...args, curLife: curLife + slack, onlyK: k, follow: fol, firstLoss: sc && k === 1 ? lossNow : PL.green, three: !!sc && k === 1 });
    // the plan in hand gets a lap of slack on the tyre life, so a lap's change in the estimate doesn't drop it
    const cand = [plan, ...(free?.alts || []), mine, ...ks.map(k => atK(k, mine ? follow : null)), sc ? atK(1, null) : null,
      H?.seq.length ? atK(H.lap - me.lap + 1, H.seq, 1) : null].filter(Boolean);
    const seen = new Set(); const uniq = cand.filter(p => { const k = p.k + ':' + p.stints.map(x => x.c + x.L).join(','); if (seen.has(k)) return false; seen.add(k); return true; });
    const O = raceOdds(s, r, L, me, idOf, { left, runs, cur, age, PL, sc, lossNow }, uniq);
    let pick = O[0];
    for (const o of O.slice(1)) { const a = beatsOdds(o, pick), b = beatsOdds(pick, o); if (a > b + 0.03 || (Math.abs(a - b) <= 0.03 && o.best < pick.best)) pick = o; }
    const absSig = (p) => `${p.stints.length ? me.lap + p.k - 1 : 0}:${p.stints.map(x => x.c).join(',')}`;
    const heldO = H && O.find(o => absSig(o.p) === H.sig);
    // and a plan that does beat it has to do so at two odds updates running (five seconds apart), so one lucky run of
    // the odds can't call you in
    const tick = Math.floor((L.simT ?? Date.now()) / 5000); let pend = null;
    if (heldO && pick !== heldO) {
      const sg = absSig(pick.p);
      if (beatsOdds(pick, heldO) - beatsOdds(heldO, pick) < 0.10) pick = heldO;
      else if (!(H.pend?.sig === sg && H.pend.tick < tick)) { pend = { sig: sg, tick: H.pend?.sig === sg ? H.pend.tick : tick }; pick = heldO; }
    }
    HM[me.i] = { uid: L.uid, stops: me.stops || 0, sig: absSig(pick.p), lap: me.lap + pick.p.k - 1, seq: pick.p.stints.map(x => x.c), pend };
    const OV = overtakeOf(c, trackOf(r)); const sum = (o) => ({ mode: o.mode, pMode: o.pMode, best: o.best, worst: o.worst });
    posNote = { ...sum(pick), pass: OV.p, hard: OV.hard, sc };
    if (pick !== O[0]) {
      Object.assign(posNote, { from: sum(O[0]), win: beatsOdds(pick, O[0]), lose: beatsOdds(O[0], pick), stops: pick.p.stints.length, fromStops: O[0].p.stints.length, k: pick.p.k, fromK: O[0].p.k });
      plan = { ...pick.p, window: [pick.p.k, pick.p.k] }; changed = !!mine;
    }
    if (sc && plan.stints.length && plan.k === 1) scCall = { plan, extra: false };
  }
  return { n, left, lossNow, PL, runs, cur, age, curLife, sets, plan, free, follow, changed, scCall, usedOther, posNote };
}

/*
  Undercut and overcut. Who you're fighting is remembered at every pit stop: when you, or the car ahead or behind,
  goes into the pit lane, the running order from 10 seconds before is what counts (a car can be passed on the way in).
  Before anyone stops, the forecast is predictive: if you stop this lap and they stop the next, where you'd come out
  (the gap now, less what your new tyres buy over their old ones, the out-lap on cold tyres counted). Once you've
  stopped it's live: where you'd be if they stopped right now. A car that isn't stopping again gets the battle
  forecast instead; behind, that's the car really behind you, while ahead the remembered car stays until it's clear
  for five laps running that you won't catch it. Each rival's stops left come from their own race pace on each tyre.
*/
const OUTLAP_MS = 1200; // the out-lap on cold tyres, against a flying lap
const LIVE_PIT_MEMORY = 10e3; // ms: the running order this long before a car goes into the pit lane
const _runsFor = new Map();
/** A driver's race pace per tyre: their own runs where they have them, the grid's for the rest. */
function runsFor(s, r, id) {
  const k = `${s.index}:${r.id}:${id}`; const v = _runsFor.get(k); if (v?.gen === renderGen) return v.runs;
  const { grid, mine } = strategyRuns(s, r); let runs;
  if (id === PLAYER) runs = JSON.parse(JSON.stringify(mine));
  else { runs = practiceRuns(s, r, id); orderTyres(runs); fillTyres(JSON.parse(JSON.stringify(grid)), runs); if (Object.keys(runs).length < 2) runs = JSON.parse(JSON.stringify(grid)); }
  _runsFor.set(k, { gen: renderGen, runs }); return runs;
}
const _rivalPlan = new Map();
/** A car's plan for the rest of the race from its own pace: { stops (left), next (compound), t (ms to the flag) } or null. */
function rivalPlan(s, r, L, x, idOf) {
  const k = `${L.uid}:${x.i}:${x.lap}:${x.c}:${x.stops}`; const v = _rivalPlan.get(k); if (v?.gen === renderGen) return v.p;
  let p = null; const id = idOf(x.i);
  if (id && DRY.includes(x.c)) {
    const runs = runsFor(s, r, id); const n = L.totalLaps || raceLaps(s, r.id); const left = Math.max(1, n - x.lap + 1);
    if (runs[x.c]) {
      const curLife = tyreLifeLeft(x, runs[x.c], L.field);
      const usedOther = (L.used?.[x.i] || []).some(c2 => DRY.includes(c2) && c2 !== x.c) || L.key === 'SPR';
      const pl = planRest({ runs, sets: null, cur: x.c, age: x.age || 0, curLife, left, loss: racePitLoss(career(), trackOf(r), L).green, usedOther });
      if (pl) p = { stops: pl.stints.length, next: pl.stints[0]?.c ?? null, k: pl.k, t: pl.t, stints: pl.stints };
    }
  }
  _rivalPlan.set(k, { gen: renderGen, p }); if (_rivalPlan.size > 400) _rivalPlan.clear(); return p;
}
/** The fight around a car: who was ahead and behind 10 s before the latest stop by it or a neighbour. */
function fightContext(L, me) {
  const E = (L.pitEntries || []).filter(e => e.pos && e.pos[me.i]).slice().reverse()
    .find(e => { if (e.i === me.i) return true; const p = e.pos[me.i]; return e.pos[e.i] === p - 1 || e.pos[e.i] === p + 1; });
  if (!E) return null;
  const p = E.pos[me.i]; const at = (q) => +Object.keys(E.pos).find(i => E.pos[i] === q);
  const ahead = p > 1 ? at(p - 1) : null, behind = at(p + 1);
  return { entry: E, ahead: Number.isFinite(ahead) ? ahead : null, behind: Number.isFinite(behind) ? behind : null, stops: E.stops || {} };
}
/** The undercut graphic: the car at risk in the middle, the other car within a second either side (the gap is always shown). */
function ucGraphic(c, s, idOf, mid, other, gap, good) {
  const pct = 50 + Math.max(-1, Math.min(1, gap / 1000)) * 42; // + behind (right), - ahead (left)
  const car = (x, cls) => { const id = idOf(x.i); const t = teamOf(s, id); const img = carPhoto(c, t?.id);
    return `<div class="ucg-car ${cls}" style="--c:${t?.color || '#888'}">${img ? `<img src="${esc(img)}" alt="">` : '<span class="ucg-blob"></span>'}<b>${esc(lastName(dName(s, id) || '?'))}</b></div>`; };
  const lo = Math.min(50, pct), hi = Math.max(50, pct);
  return `<div class="ucg"><div class="ucg-track">
      <i class="ucg-space ${good == null ? '' : good ? 'good' : 'bad'}" style="left:${lo}%;width:${hi - lo}%"></i>
      <div class="ucg-at" style="left:50%">${car(mid, 'mid')}</div><div class="ucg-at" style="left:${pct}%">${car(other, 'oth')}</div></div>
    <div class="ucg-scale"><span>1 s ahead</span><span>level</span><span>1 s behind</span></div></div>`;
}
/** The two fight cards for one of your cars: the car ahead and the car behind. */
function fightCards(c, s, r, L, me, idOf, ST) {
  const field = L.field; const byI = (i) => field.find(x => x.i === i);
  const byPos = field.filter(x => x.pos > 0).sort((a, b) => a.pos - b.pos);
  const realAhead = byPos.find(x => x.pos === me.pos - 1), realBehind = byPos.find(x => x.pos === me.pos + 1);
  const pits = (x) => L.pitLaps?.[x.i] || [];
  const ctx = fightContext(L, me); const T = ((L.mem || liveErs).fight ||= {})[me.i] ||= {};
  const PL = ST.PL; const myStops = ST.plan?.stints?.length || 0; const myNext = ST.plan?.stints?.[0]?.c ?? null;
  const myRuns = runsFor(s, r, idOf(me.i)); const fuel = (x) => liveFuel(x)(x.lap) ?? x.fuel ?? 0;
  const stoppedSince = (x) => ctx && (x.stops || 0) > (ctx.stops[x.i] ?? x.stops ?? 0);
  // in the pit lane, and for the few seconds after it until the game has a gap for you again, the gaps jump about:
  // the cards stay as they were going in
  if ((me.pit || (me.pos > 1 && !me.gapL)) && T.html != null) return T.html;
  // The remembered cars count only while a stop has them out of their real place. Ahead: you've stopped and they
  // haven't (until five laps running say you won't catch them), or they've stopped and are still ahead. Behind: they've
  // stopped and you haven't (their undercut), or you've stopped and they're still to. Otherwise it's the order on track.
  const meStopped = stoppedSince(me);
  let A = ctx?.ahead != null && T.dropAhead !== ctx.entry.t ? byI(ctx.ahead) : null;
  if (!A || A.st !== 2 || !(meStopped ? !stoppedSince(A) : stoppedSince(A) && A.pos < me.pos)) A = realAhead;
  const B0 = ctx?.behind != null ? byI(ctx.behind) : null;
  const rpA = A && rivalPlan(s, r, L, A, idOf), rpB0 = B0 && rivalPlan(s, r, L, B0, idOf);
  const keepB = B0 && B0.st === 2 && (meStopped ? !stoppedSince(B0) && (rpB0?.stops ?? 0) > 0 : stoppedSince(B0) && B0.pos > me.pos);
  let B = keepB ? B0 : realBehind; if (B && B === A) B = realBehind !== A ? realBehind : null; const rpB = B && (B === B0 ? rpB0 : rivalPlan(s, r, L, B, idOf));
  const lossNow = ST.lossNow ?? PL.green; const scTxt = L.sc === 1 ? ' (safety car)' : L.sc === 2 ? ' (VSC)' : '';
  const stopsTxt = (p) => p ? (p.stops ? `${plural(p.stops, 'stop')} left` : 'no more stops') : '';
  const nm = (x) => esc(lastName(dName(s, idOf(x.i)) || '?'));
  // the trend, lap on lap, of each forecast's gap
  const trendOf = (key, v) => { const h = (T.hist ||= {})[key] ||= {}; if (h.lap !== me.lap) { h.prev = h.v; h.lap = me.lap; } h.v = v; return h.prev == null ? null : v - h.prev; };
  const card = (title, sub, mid, other, gap, goodIfLower, note) => {
    const d = trendOf(title + other.i, gap); const good = d == null || Math.abs(d) < 30 ? null : goodIfLower ? d < 0 : d > 0;
    return `<div class="panel live-card ucard"><div class="panel-h"><h2>${title}</h2><span class="muted" style="font-size:12px">${sub}</span></div>
      <div class="panel-b">${ucGraphic(c, s, idOf, mid, other, gap, good)}<div class="uc-num"><b>${gap > 0 ? `${(gap / 1000).toFixed(2)} s behind` : gap < 0 ? `${(-gap / 1000).toFixed(2)} s ahead` : 'level'}</b> <span class="muted">${note}</span></div></div></div>`;
  };
  const OV = overtakeOf(c, trackOf(r)); const hardPass = OV.p < 0.3 ? ` Passing here comes off ${Math.round(OV.p * 100)}% of the time, so the stop is the way by.` : '';
  const out = [];
  // the car ahead: your undercut on them
  if (A) {
    const gapNow = (me.gapL || 0) - (A.gapL || 0);
    if (myStops && (rpA?.stops ?? 0) > 0 && !stoppedSince(me) && !stoppedSince(A) && myNext != null) {
      const theirOld = livePace(runsFor(s, r, idOf(A.i)), A.c, (A.age || 0) + 1, fuel(A)), myNew = livePace(myRuns, myNext, 1, fuel(me)) + OUTLAP_MS;
      const after = theirOld != null && myNew != null ? gapNow - (theirOld - myNew) : null;
      // the cars further up it would clear too (each stopping the lap after you)
      const more = byPos.filter(x => x.i !== me.i && x.pos < A.pos && x.pos >= A.pos - 3 && x.st === 2 && !stoppedSince(x)).filter(x => (rivalPlan(s, r, L, x, idOf)?.stops ?? 0) > 0).filter(x => {
        const old = livePace(runsFor(s, r, idOf(x.i)), x.c, (x.age || 0) + 1, fuel(x)); return old != null && myNew != null && (me.gapL || 0) - (x.gapL || 0) - (old - myNew) < 0; }).map(x => `${nm(x)} (P${x.pos})`);
      const alsoTxt = more.length && after < 0 ? ` It would also clear ${listJoin(more.reverse())}.` : '';
      if (after != null) out.push(card('Undercut', `on ${nm(A)} · ${stopsTxt(rpA)}`, A, me, after, true, `if you stop this lap and ${nm(A)} the next: ${after < 0 ? 'you come out ahead' : 'still behind'}.${alsoTxt}${hardPass}`));
    } else if (stoppedSince(me) && !stoppedSince(A) && (rpA?.stops ?? 0) > 0) {
      const after = (me.gapL || 0) - ((A.gapL || 0) + lossNow);
      out.push(card('Undercut', `on ${nm(A)} · ${stopsTxt(rpA)}`, A, me, after, true, `if ${nm(A)} stopped now${scTxt}: ${after < 0 ? 'you’d be ahead' : 'they’d stay ahead'}.${hardPass}`));
    } else if (stoppedSince(A) && !stoppedSince(me) && myStops) {
      // they stopped first: your overcut on them, live
      const after = ((me.gapL || 0) + lossNow) - (A.gapL || 0);
      out.push(card('Overcut', `on ${nm(A)}, who has stopped · you have ${plural(myStops, 'stop')} left`, A, me, after, true, `if you stopped now${scTxt}: ${after < 0 ? 'you’d come out ahead' : 'you’d be behind'}`));
    }
  }
  if (A && out.length === 0) {
    // the battle forecast on the car ahead; five laps running of not catching it and the next car up takes over
    const edge = paceEdge(me, A, pits); const gap = Math.max(0, (me.gapL || 0) - (A.gapL || 0)); const left = ST.left;
    const catching = edge != null && edge > 0 && Math.round(gap / edge) < left + 2;
    if (T.lap !== me.lap) { T.lap = me.lap; T.noCatch = catching ? 0 : (T.noCatch || 0) + 1; if (T.noCatch >= 5 && ctx && A !== realAhead) T.dropAhead = ctx.entry.t; }
    out.push(battleCard(s, idOf, A, { ...me, gapF: gap }, me, left, { pits, stopLeft: false, extra: [stopsTxt(rpA), `passing ${Math.round(OV.p * 100)}%`].filter(Boolean).join(' · ') }));
  }
  // the car behind: their undercut on you (your overcut)
  if (B) {
    const gapNow = (B.gapL || 0) - (me.gapL || 0);
    if (myStops && (rpB?.stops ?? 0) > 0 && !stoppedSince(me) && !stoppedSince(B) && rpB.next != null) {
      const myOld = livePace(myRuns, me.c, (me.age || 0) + 1, fuel(me)), theirNew = livePace(runsFor(s, r, idOf(B.i)), rpB.next, 1, fuel(B)) + OUTLAP_MS;
      const after = myOld != null && theirNew != null ? gapNow - (myOld - theirNew) : null;
      if (after != null) out.push(card('Overcut', `${nm(B)}’s undercut on you · ${stopsTxt(rpB)}`, me, B, after, false, `if ${nm(B)} stops this lap and you the next: ${after < 0 ? 'they come out ahead' : 'you stay ahead'}`));
      else out.push(battleCard(s, idOf, me, B, me, ST.left, { pits, stopLeft: false, extra: stopsTxt(rpB) }));
    } else if (stoppedSince(me) && !stoppedSince(B) && (rpB?.stops ?? 0) > 0) {
      // you've stopped, they haven't: where they'd come out if they stopped now
      const after = ((B.gapL || 0) + lossNow) - (me.gapL || 0);
      out.push(card('Overcut', `${nm(B)} still to stop · ${stopsTxt(rpB)}`, me, B, after, false, `if ${nm(B)} stopped now${scTxt}: ${after < 0 ? 'they’d come out ahead' : 'you’d stay ahead'}`));
    } else if (stoppedSince(B) && !stoppedSince(me) && myStops) {
      const after = (B.gapL || 0) - ((me.gapL || 0) + lossNow);
      out.push(card('Overcut', `${nm(B)} has stopped · you have ${plural(myStops, 'stop')} left`, me, B, after, false, `if you stopped now${scTxt}: ${after < 0 ? `${nm(B)} would be ahead` : 'you’d stay ahead'}`));
    } else out.push(battleCard(s, idOf, me, realBehind || B, me, ST.left, { pits, stopLeft: false, extra: stopsTxt(realBehind && realBehind !== B ? rivalPlan(s, r, L, realBehind, idOf) : rpB) }));
  }
  return (T.html = out.join(''));
}
/*
  Overtaking. Every track has an overtaking difficulty (set per circuit beside the pit loss): at 90%, a driver who
  catches the car ahead gets by one time in ten. The live strategy runs the rest of the race a few hundred times with
  every car on its own plan, lap by lap: a car that pits is placed by its time (the pit lane passes for it), while one
  that catches the car ahead on track gets one go at it. A pass that fails leaves it stuck behind until one of them
  stops. That gives each plan its odds of every finishing position, so where passing is hard, track position and the
  undercut count for more.
*/
const OVERTAKE_HARD = { mon: 97, hun: 90, sgp: 88, emi: 85, ned: 85, esp: 75, jpn: 70, abu: 65, aus: 65, mex: 65, qat: 60, mad: 60, fra: 60, por: 60, eur: 60,
  gbr: 55, mia: 55, ger: 55, rus: 55, kor: 55, chn: 50, can: 50, usa: 50, tur: 50, mal: 50, ind: 50, aut: 45, sau: 45, lvg: 45, bhr: 40, bel: 40, ita: 40, aze: 40, bra: 40 };
/** What your races at a track say about passing there: { f (chances), p (passes), hard (suggested difficulty) }. */
function passLearned(c, tid) {
  const all = Object.values(c?.passStats?.[tid] || {}); const f = all.reduce((a, x) => a + x.f, 0), p = all.reduce((a, x) => a + x.p, 0);
  return { f, p, hard: f >= 8 ? Math.max(0, Math.min(100, Math.round((1 - p / f) * 20) * 5)) : null };
}
/** The overtaking difficulty slider for a track. */
function overtakeRow(c, tid) {
  const OV = overtakeOf(c, tid); const PS = passLearned(c, tid);
  return `<div class="row" style="gap:8px;margin-top:6px;flex-wrap:wrap;align-items:center"><span>Overtaking difficulty${OV.own ? ' (yours)' : ''}:</span><input type="range" min="0" max="100" step="5" value="${OV.hard}" data-ch="overtake" data-track="${tid}" style="width:180px"><b>${OV.hard}%</b><span class="muted" style="font-size:12px">a driver who catches the car ahead gets by ${Math.round(OV.p * 100)}% of the time; the live strategy weighs track position with it</span>${OV.own ? `<button class="btn sm ghost" data-act="overtake-reset" data-track="${tid}">Default</button>` : ''}</div>${PS.f ? `<div class="muted" style="font-size:12px;margin-top:4px">From your races here: ${PS.p} pass${PS.p === 1 ? '' : 'es'} from ${plural(PS.f, 'chance')} (a car within a second of the one ahead, a go every three laps)${PS.hard != null ? `, which suggests ${PS.hard}%. ${PS.hard !== OV.hard ? `<button class="btn sm ghost" data-act="overtake-use" data-track="${tid}" data-v="${PS.hard}">Use ${PS.hard}%</button>` : ''}` : ': a few more races here and it can suggest a value.'}</div>` : ''}`;
}
/** A track's overtaking difficulty (%), and the chance a driver who catches the car ahead gets by. */
function overtakeOf(c, track) { const v = c?.overtake?.[track]; const hard = v ?? OVERTAKE_HARD[track] ?? 60; return { hard, p: (100 - hard) / 100, own: v != null }; }
const SIM_RUNS = 300;
const PASS_GAIN = 300, STUCK_GAP = 400; // ms: what a pass costs the passed car; how far back a car that can't pass sits
/** A plan's laps from now to the flag: { laps: [ms], pits: Set of lap indexes it pits on (the pit loss is on that lap) }. */
function planLaps(runs, cur, age, p, left, loss, firstLoss = loss) {
  const lt = (c, a) => runs[c].base + (runs[c].deg || 0) * a;
  const perLap = (c) => runs[c]?.wear ?? (runs[c]?.life ? WEAR_LIMIT / runs[c].life : null);
  const laps = []; const pits = new Set(); const st = p?.stints || [];
  const k = st.length ? p.k : left;
  for (let j = 0; j < Math.min(k, left); j++) laps.push(lt(cur, age + j));
  for (const x of st) {
    if (laps.length >= left || !runs[x.c]) break;
    laps[laps.length - 1] += pits.size ? loss : firstLoss; pits.add(laps.length - 1);
    const a0 = x.wear && perLap(x.c) ? x.wear / perLap(x.c) : 0;
    for (let j = 0; j < x.L && laps.length < left; j++) laps.push(lt(x.c, a0 + j));
  }
  while (laps.length < left) laps.push(laps[laps.length - 1] ?? 90e3);
  return { laps, pits };
}
// a rival's next stop is a guess: each run moves it by up to two laps either way (lap offset, weight)
const RIVAL_JITTER = [[-2, 0.1], [-1, 0.2], [0, 0.4], [1, 0.2], [2, 0.1]];
const RETRY_LAPS = 3; // a car that failed to pass has another go this many laps later
const _odds = new Map();
/**
 * The odds of each finishing position for each of your plans: [{ p, dist: [prob by position (index 1 = P1)], best, worst, mode, pMode }].
 * The other cars run their own plans, their next stop a lap or two either way; lapped cars behind you are left out.
 * A pass is likelier the more pace the car behind has (the track's chance is for half a second a lap), and a car that
 * fails tries again three laps later. Under a safety car, nobody passes on track, the cars due to stop soon take the
 * cheap stop, and the field bunches up for the restart (within a second of each other nine times in ten).
 */
function raceOdds(s, r, L, me, idOf, ST, plans) {
  const sc = ST.sc || 0; const tick = Math.floor((L.simT ?? Date.now()) / 5000);
  const sig = (p) => `${p.k}:${p.stints.map(x => x.c + x.L + '/' + (x.wear || 0)).join(',')}`;
  const key = `${L.uid}:${me.i}:${me.lap}:${me.stops}:${ST.cur}:${sc}:${tick}:${plans.map(sig).join('|')}:${(ST.runs[ST.cur]?.deg || 0).toFixed(1)}`;
  const hit = _odds.get(key); if (hit) return hit;
  const pass = overtakeOf(career(), trackOf(r)).p; const G = raceGaps(L.field); const left = ST.left; const loss = ST.PL.green; const lossNow = ST.lossNow ?? loss;
  const meDown = G[me.i]?.down || 0;
  const cars = L.field.filter(x => x.i !== me.i && x.st === 2 && x.pos > 0 && G[x.i] && G[x.i].down <= meDown).map(x => {
    const id = idOf(x.i); const rp = id ? rivalPlan(s, r, L, x, idOf) : null; let V = [];
    if (rp?.stints && DRY.includes(x.c)) {
      const runs = runsFor(s, r, id); const age = x.age || 0;
      if (runs[x.c]) {
        if (rp.stops) for (const [dk, w] of RIVAL_JITTER) { const k2 = rp.k + dk; const st = rp.stints.map((y, n) => n === 0 ? { ...y, L: y.L - dk } : y); if (k2 >= 1 && k2 < left && st[0].L >= 1) V.push({ w, ...planLaps(runs, x.c, age, { k: k2, stints: st }, left, loss) }); }
        if (!V.length) V.push({ w: 1, ...planLaps(runs, x.c, age, rp, left, loss) });
        if (sc && rp.stops) { // the cheap stop under the safety car, likelier the sooner it was due
          const q = (rp.k <= 3 ? 0.9 : rp.k <= 12 ? 0.6 : 0.3) * (sc === 2 ? 0.75 : 1); const tot = V.reduce((a, v) => a + v.w, 0);
          V.forEach(v => { v.w = v.w / tot * (1 - q); });
          V.push({ w: q, ...planLaps(runs, x.c, age, { k: 1, stints: rp.stints.map((y, n) => n === 0 ? { ...y, L: y.L + rp.k - 1 } : y) }, left, loss, lossNow) });
        }
      }
    }
    if (!V.length) { // no plan for this car: its recent clean laps, on an empty tank, to the flag
      const l = liveLaps(x).filter(y => y.valid).slice(-3); if (!l.length) return null; const F = liveFuel(x);
      V = [{ w: 1, laps: Array(left).fill(avg(l.map(y => y.ms - (F(y.n) ?? 0) * FUEL_MS))), pits: new Set() }];
    }
    const tot = V.reduce((a, v) => a + v.w, 0); let acc = 0; V.forEach(v => { acc += v.w / tot; v.cum = acc; });
    return { g: G[x.i].g, V };
  }).filter(Boolean);
  const out = plans.map(p => {
    const mine = { g: G[me.i]?.g ?? (me.gapL || 0), ...planLaps(ST.runs, ST.cur, ST.age, p, left, loss, sc && p.k === 1 ? lossNow : loss) };
    const n = cars.length + 1; const dist = Array(n + 1).fill(0);
    for (let run = 0; run < SIM_RUNS; run++) {
      const rnd = mulberry(`odds-${run}`);
      const all = [mine, ...cars.map(x => { const u = rnd(); const v = x.V.find(v => u <= v.cum) || x.V[x.V.length - 1]; return { g: x.g, laps: v.laps, pits: v.pits }; })];
      const t = all.map(x => x.g); const lastPit = all.map(() => -1); const failed = new Map();
      const order = all.map((_, k) => k).sort((a, b) => t[a] - t[b]);
      for (let j = 0; j < left; j++) {
        for (let k = 0; k < n; k++) t[k] += all[k].laps[j];
        const pits = (k) => all[k].pits.has(j);
        for (let a = 1; a < n; a++) {
          let k = a;
          while (k > 0) {
            const X = order[k], Y = order[k - 1]; if (t[X] >= t[Y]) break;
            if (pits(X) || pits(Y)) { order[k] = Y; order[k - 1] = X; k--; continue; } // through the pit lane: no fight
            if (sc && j === 0) { t[X] = t[Y] + 200; break; } // no passing behind the safety car
            const f = `${X}:${Y}:${lastPit[X]}:${lastPit[Y]}`; const at = failed.get(f); const go = at == null || j - at >= RETRY_LAPS;
            const pe = 1 - Math.pow(1 - pass, Math.max(0.4, Math.min(3, (all[Y].laps[j] - all[X].laps[j]) / 500)));
            if (go && rnd() < pe) { order[k] = Y; order[k - 1] = X; t[Y] = Math.max(t[Y], t[X] + PASS_GAIN); k--; }
            else { if (go) failed.set(f, j); t[X] = t[Y] + STUCK_GAP; break; }
          }
        }
        for (let k = 0; k < n; k++) if (pits(k)) lastPit[k] = j;
        if (sc === 1 && j === 0) for (let k = 1; k < n; k++) t[order[k]] = t[order[k - 1]] + (rnd() < 0.9 ? 300 + rnd() * 700 : 1000 + rnd() * 1000); // the restart
      }
      dist[order.indexOf(0) + 1]++;
    }
    const D = dist.map(v => v / SIM_RUNS); const seen = D.map((v, k) => v >= 0.01 ? k : null).filter(v => v);
    const mode = D.indexOf(Math.max(...D));
    return { p, dist: D, best: Math.min(...seen), worst: Math.max(...seen), mode, pMode: D[mode] };
  });
  _odds.set(key, out); if (_odds.size > 60) _odds.delete(_odds.keys().next().value);
  return out;
}
/** The chance plan A finishes ahead of plan B (taking the two as independent). */
function beatsOdds(A, B) { let tot = 0, below = 0; for (let i = 1; i < A.dist.length; i++) { below = 0; for (let j = i + 1; j < B.dist.length; j++) below += B.dist[j]; tot += A.dist[i] * below; } return tot; }

/**
 * Each car's real gap to the leader (racing, or across the line at the finish): { [i]: { g (ms), down (laps) } }. The
 * game's gap to the leader only counts within a lap, so a lapped car would look closer than the cars ahead of it. The
 * laps it's down come from how far round each car is (its lap and the distance into it); where that's missing, a gap
 * smaller than the one of the car ahead means another lap.
 */
function raceGaps(field) {
  const run = field.filter(x => x.pos > 0 && (x.st === 2 || x.st === 3)).sort((a, b) => a.pos - b.pos);
  const lapMs = median(run.map(x => x.last).filter(v => v > 30e3 && v < 300e3)) || 90e3;
  // laps down from the lap counts: a lap behind on the count but further round the lap than the leader isn't lapped
  const lead = run[0]?.lap != null ? run[0] : null;
  const out = {}; let prev = 0;
  for (const x of run) {
    let down = lead && x.lap != null ? Math.max(0, lead.lap - x.lap - ((x.dist || 0) > (lead.dist || 0) ? 1 : 0)) : 0; let g = (x.gapL || 0) + down * lapMs;
    // no gap from the game yet (the start, just out of the pits): right behind the car ahead
    if (!x.gapL && x !== lead) g = prev;
    out[x.i] = { g, down }; prev = Math.max(prev, g);
  }
  return out;
}
/** Where a car would rejoin after a stop costing `loss` ms now: { pos, ahead, behind, gapA, gapB }. */
function rejoin(field, me, loss) {
  const G = raceGaps(field); const gap = (x) => G[x.i]?.g ?? (x.gapL || 0);
  const run = field.filter(x => x.i !== me.i && x.pos > 0 && x.st === 2);
  const t = gap(me) + loss;
  const before = run.filter(x => gap(x) < t).sort((a, b) => gap(b) - gap(a)); const after = run.filter(x => gap(x) >= t).sort((a, b) => gap(a) - gap(b));
  return { pos: before.length + 1, ahead: before[0] || null, behind: after[0] || null, gapA: before[0] ? t - gap(before[0]) : null, gapB: after[0] ? gap(after[0]) - t : null };
}
/** Average lap-time gap over the last three laps both drivers completed (ms; positive: `a` is quicker). */
function paceEdge(a, b, pits = null) {
  // laps both drivers have completed, not an in- or out-lap for either
  const skip = (x, n) => { const P = pits ? pits(x) : []; return P.includes(n) || P.includes(n - 1); };
  const la = liveLaps(a).filter(x => !skip(a, x.n)), lb = liveLaps(b).filter(x => !skip(b, x.n)); let both = la.filter(x => lb.some(y => y.n === x.n)).slice(-3);
  // after a stop, only laps since it count: the first normal lap straight away, then two, then three
  const lastPit = pits ? Math.max(0, ...pits(a), ...pits(b)) : 0;
  if (lastPit) { const since = both.filter(x => x.n > lastPit + 1); if (since.length < 3) { if (!since.length) return null; both = since; } }
  if (!lastPit && both.length < 3) return null;
  return avg(both.map(x => lb.find(y => y.n === x.n).ms - x.ms));
}
// ---- pit calls and their sounds
const liveCalls = {}; // per race: the last call made, so a sound plays once
function soundsOf() { return state.sounds || {}; }
function playSounds(list) {
  const urls = list.map(k => soundsOf()[k]?.data).filter(Boolean); let i = 0;
  // a sound that can't play says so once (and the next one still plays)
  const fail = (e) => { if (!playSounds.warned) { playSounds.warned = true; toast('A sound couldn’t play: ' + (e?.message || 'unsupported file')); } next(); };
  const next = () => {
    if (i >= urls.length) return; let over = false; const end = (e) => { if (over) return; over = true; e ? fail(e) : next(); }; // each clip moves on once
    try { const a = new Audio(urls[i++]); a.onended = () => end(); a.onerror = () => end(a.error || new Error('unsupported file')); a.play().catch(end); } catch (e) { end(e); }
  };
  next();
}
/** A call to pit: shown while it stands, the sound only when it's new, the tyre changes, or the lap moved by more than one. */
function pitCall(uid, kind, lap, c) {
  const last = liveCalls[uid]; const fresh = !last || last.kind !== kind || last.c !== c || lap > last.lap + 1;
  liveCalls[uid] = { kind, lap, c };
  if (fresh) playSounds([kind === 'sc' ? 'sc' : 'pit', 'c' + c]);
}
// ---- the page
const WEATHER = { 0: ['Clear', 'sun'], 1: ['Light cloud', 'cloud-sun'], 2: ['Overcast', 'cloud'], 3: ['Light rain', 'rain'], 4: ['Heavy rain', 'rain heavy'], 5: ['Storm', 'storm'] };
function weatherIcon(w) { const [, cls] = WEATHER[w] || WEATHER[0]; return `<span class="wx ${cls}" aria-hidden="true"><i class="wx-sun"></i><i class="wx-cloud"></i><i class="wx-drops"></i></span>`; }
function weatherCard(L) {
  const W = L.weather; if (!W) return '';
  const fc = (W.forecast || []).filter(x => x.session === L.sessionType && x.at > 0).slice(0, 6);
  return `<div class="panel live-card"><div class="panel-h"><h2>Weather</h2></div><div class="panel-b"><div class="wx-now">${weatherIcon(W.now)}<div><b>${WEATHER[W.now]?.[0] || '–'}</b><div class="muted" style="font-size:12px">Track ${W.track}°C · air ${W.air}°C</div></div></div>
    ${fc.length ? `<div class="wx-row">${fc.map(x => `<div class="wx-step">${weatherIcon(x.w)}<b>+${x.at} min</b><small>${x.rain}% rain</small></div>`).join('')}</div>` : '<div class="muted" style="font-size:12px">No forecast from the game.</div>'}</div></div>`;
}
/** A battle card: the car ahead on the left, the chaser on the right. */
function battleCard(s, idOf, ahead, behind, me, left, { title, pits, stopLeft, runs, extra = '' }) {
  if (!ahead || !behind) return '';
  const nm = (x) => esc(lastName(dName(s, idOf(x.i)) || '?'));
  const gap = behind.gapF || 0; const meAhead = ahead.i === me.i;
  const neutral = gap < 1000;
  const edge = paceEdge(behind, ahead, pits); // positive: the chaser is quicker, the gap shrinks
  const trend = edge == null ? '' : edge > 0 ? 'closing' : 'growing';
  const laps = !neutral && edge > 0 ? Math.max(1, Math.round(gap / edge)) : null; const far = laps != null && laps >= left + 2;
  return `<div class="panel live-card battle ${trend}"><div class="panel-h"><h2>Battle forecast</h2><span class="muted" style="font-size:12px">${esc(extra)}</span></div>
    <div class="panel-b bf"><div class="bf-side"><b>${nm(ahead)}</b><small class="muted">${meAhead ? 'You' : `P${ahead.pos}`}</small></div>
      <div class="bf-mid"><span class="label">${neutral ? 'Within a second' : laps != null && !far ? 'Striking distance' : edge != null && edge <= 0 ? 'Pulling away' : 'Out of reach'}</span>${neutral ? '<b>NOW</b>' : laps != null && !far ? `<b>in ${laps} lap${laps === 1 ? '' : 's'}</b>` : ''}<small>${(gap / 1000).toFixed(3)} s${edge != null ? ` · ${edge > 0 ? '−' : '+'}${(Math.abs(edge) / 1000).toFixed(2)} s a lap` : ''}</small></div>
      <div class="bf-side" style="text-align:right"><b>${nm(behind)}</b><small class="muted">${behind.i === me.i ? 'You' : `P${behind.pos}`}</small></div></div></div>`;
}
/** The championship as it stands with this race's running order. */
function liveStandings(c, s, r, L, idOf) {
  const sprint = L.key === 'SPR'; const P = sprint ? D.SPRINT_POINTS : D.RACE_POINTS;
  const st = seasonStatsCache(s); const pts = {}; for (const [id, o] of Object.entries(st)) if (s.drivers[id]) pts[id] = o.pts || 0;
  const add = {}; for (const x of L.field) { const id = idOf(x.i); if (id && x.pos && (x.st === 2 || x.st === 3)) add[id] = P[x.pos - 1] || 0; }
  const rows = Object.keys({ ...pts, ...add }).map(id => ({ id, pts: (pts[id] || 0) + (add[id] || 0), now: add[id] || 0 })).sort((a, b) => b.pts - a.pts).map((x, i) => ({ ...x, pos: i + 1 }));
  const teams = s.teams.map(t => ({ t, pts: rows.filter(x => teamOf(s, x.id)?.id === t.id).reduce((a, x) => a + x.pts, 0) })).sort((a, b) => b.pts - a.pts).map((x, i) => ({ ...x, pos: i + 1 }));
  // can the title be decided here? the most points left after this race, against the lead
  // points still up for grabs once this race is over: the rest of the season (and, after a sprint, this Grand Prix)
  const M = titleMath(s, 'driver'); const here = M.left.find(x => x.r.id === r.id);   const after = M.R - (sprint ? D.SPRINT_POINTS[0] : (here?.max || 0));
  const gap0 = (M.rows[0]?.pts || 0) - (M.rows[1]?.pts || 0);
  const canDecide = !!here && !M.decided && gap0 + (sprint ? D.SPRINT_POINTS[0] : D.RACE_POINTS[0]) > after;
  const decidedNow = rows.length > 1 && rows[0].pts - rows[1].pts > after;
  return { rows, teams, canDecide, decidedNow, after };
}
function champCard(c, s, r, L, idOf, mineIds) {
  const S = liveStandings(c, s, r, L, idOf); const me = S.rows.findIndex(x => mineIds.includes(x.id));
  const near = S.rows.slice(Math.max(0, me - 2), Math.max(5, me + 3));
  const row = (x) => `<tr class="${mineIds.includes(x.id) ? 'me' : ''}"><td class="num">${x.pos}</td><td>${drvCell(s, x.id, { team: true })}</td><td class="num"><b>${x.pts}</b>${x.now ? ` <small class="muted">+${x.now}</small>` : ''}</td></tr>`;
  const trow = (x) => `<tr class="${x.t.id === s.playerTeamId ? 'me' : ''}"><td class="num">${x.pos}</td><td>${esc(x.t.name)}</td><td class="num"><b>${x.pts}</b></td></tr>`;
  const lead = S.rows[0]; const title = S.canDecide ? `<div class="callout live-title">${S.decidedNow ? `<b>${esc(dName(s, lead.id))} will be champion if the race finishes as it is.</b>` : `As it stands, the championship goes on to the next round.`}</div>` : '';
  return `<div class="panel live-card"><div class="panel-h"><h2>Championship, as it stands</h2></div>${title}
    <div class="panel-b tight table-wrap"><table><tbody>${near.map(row).join('')}</tbody></table></div>
    <div class="panel-b"><details><summary class="muted" style="cursor:pointer;font-size:12px">Full tables</summary><div class="grid-2" style="margin-top:8px"><div class="table-wrap"><table><tbody>${S.rows.map(row).join('')}</tbody></table></div><div class="table-wrap"><table><tbody>${S.teams.map(trow).join('')}</tbody></table></div></div></details></div></div>`;
}
/** The odds line under the strategy: where this plan should finish, and why it beat the quickest one. */
function posNoteHtml(P, me) {
  const range = P.best === P.worst ? `P${P.best}` : `P${P.best}–P${P.worst}`;
  const pct = (v) => `${Math.round(v * 100)}%`;
  const what = (stops, k) => stops ? (k === 1 ? 'stopping this lap' : `stopping on lap ${me.lap + k - 1}`) : 'staying out to the flag';
  const why = P.from ? `<div style="font-size:12px"><b>Chosen for track position:</b> ${what(P.stops, P.k)} beats ${what(P.fromStops, P.fromK)} (quicker on paper, most likely P${P.from.mode}) ${pct(P.win)} of the time and loses to it ${pct(P.lose)}.</div>` : '';
  const scTxt = P.sc ? ` Under the ${P.sc === 1 ? 'safety car' : 'VSC'}: a stop costs less now${P.sc === 1 ? ', and the field bunches up for the restart' : ''}; the odds count both.` : '';
  return `${why}<div class="muted" style="font-size:12px">Projected finish: most likely <b>P${P.mode}</b> (${pct(P.pMode)}), ${range}. Overtaking here is ${P.hard}% hard: ${pct(P.pass)} chance a move comes off.${scTxt}</div>`;
}
/** One driver's column: position, tyres, the strategy and the call, rejoin, and the battle cards. */
function liveDriverCol(c, s, r, L, w, me, id, idOf) {
  const ST = liveStrategy(c, s, r, L, me, id, w, idOf);
  const byPos = L.field.filter(x => x.pos > 0).sort((a, b) => a.pos - b.pos);
  const ahead = byPos.find(x => x.pos === me.pos - 1), behind = byPos.find(x => x.pos === me.pos + 1);
  const pitLaps = (x) => (L.pitLaps?.[x.i] || []);
  const plan = ST.scCall?.plan || ST.plan; const stopLeft = !!plan?.stints?.length;
  let call = null;
  if (plan && plan.stints.length) {
    let k = plan.k; let offset = null;
    // tyre offset: leading with the gap to spare, run longer and come out just ahead
    if (!ST.scCall && me.pos === 1 && k === 1 && behind) {
      const need = ST.PL.green + 1600; const gapB = behind.gapF || 0; const close = paceEdge(behind, me);
      if (gapB > need) { const extra = close && close > 50 ? Math.floor((gapB - need) / close) : ST.curLife - 1; k = Math.max(1, Math.min(1 + extra, ST.curLife)); if (k > 1) offset = { k, need }; }
    }
    if (k === 1) call = { kind: ST.scCall ? 'sc' : 'pit', c: plan.stints[0].c, lap: me.lap };
    ST.offset = offset; ST.k = k;
  }
  if (call && id === PLAYER && !L.replay) pitCall(L.uid, call.kind, call.lap, call.c);
  const RJ = rejoin(L.field, me, ST.lossNow);
  const nm = (x) => x ? esc(lastName(dName(s, idOf(x.i)) || '?')) : '';
  const lapsDone = me.lap - 1; const N = ST.n;
  const stints = []; { const used = L.used?.[me.i] || []; let from = 1; (L.pitLaps?.[me.i] || []).forEach((pl, k) => { stints.push({ c: used[k] || me.c, from, to: pl }); from = pl + 1; }); stints.push({ c: me.c, from, to: me.lap + (plan ? (ST.k || plan.k) - 1 : ST.left - 1) }); if (plan) { let at = stints[stints.length - 1].to; for (const x of plan.stints) { stints.push({ c: x.c, from: at + 1, to: at + x.L }); at += x.L; } } }
  const banner = call ? `<div class="pit-banner ${call.kind}"><b>${call.kind === 'sc' ? `PIT NOW · ${L.sc === 1 ? 'SAFETY CAR' : 'VSC'}` : 'PIT THIS LAP'}</b><span>${tyreChip(call.c)} ${COMPOUNDS[call.c][1]}${plan.stints[0].wear ? ` (used, ${plan.stints[0].wear}%)` : ''}</span></div>` : '';
  return `<div class="live-col">
    ${banner}
    <div class="panel live-card"><div class="panel-h"><h2>${esc(dName(s, id))}</h2><span class="muted" style="font-size:12px">${me.pit ? 'In the pit lane' : `Lap ${me.lap} of ${N}`}</span></div>
      <div class="panel-b live-top"><div class="live-pos">P${me.pos}</div>
        <div><span class="label">Ahead</span><b>${ahead ? `${nm(ahead)} +${((me.gapF || 0) / 1000).toFixed(3)}` : 'Leading'}</b></div>
        <div><span class="label">Behind</span><b>${behind ? `${nm(behind)} −${((behind.gapF || 0) / 1000).toFixed(3)}` : '–'}</b></div>
        <div><span class="label">Tyre</span><b>${me.c ? tyreChip(me.c) : ''} ${me.age ?? 0} laps${me.wear != null ? ` · ${me.wear}%` : ''}</b></div></div></div>
    <div class="panel live-card"><div class="panel-h"><h2>Strategy</h2><span class="muted" style="font-size:12px">${ST.none ? '' : ST.follow ? (ST.changed ? 'Changed from your plan: this is quicker now' : 'Following your plan') : 'Built from the tyre you’re on'}</span></div>
      <div class="panel-b stack" style="gap:8px">${ST.none ? '<div class="muted" style="font-size:13px">Waiting for dry-tyre data: no plan on this tyre.</div>' : plan ? `${stintBar(stints.filter(x => x.to >= x.from), N)}
        <div style="font-size:13px">${plan.stints.length ? `${ST.offset ? `<b>Extend for tyre offset:</b> pit on lap ${me.lap + ST.k - 1}, when ${nm(behind)} is about ${(ST.offset.need / 1000).toFixed(1)} s behind. ` : call ? '' : `Next stop: <b>lap ${me.lap + plan.k - 1}</b>${plan.window[1] > plan.window[0] ? ` (window laps ${me.lap + plan.window[0] - 1}–${me.lap + plan.window[1] - 1})` : ''}, onto ${plan.stints.map(x => `${COMPOUNDS[x.c][1].toLowerCase()}${x.wear ? ` (used ${x.wear}%)` : ''}`).join(', then ')}. `}Tyre life left: about ${plural(ST.curLife, 'lap')}.` : 'No more stops: to the flag on this set.'}${ST.scHold ? ` <span class="muted">Staying out under the ${L.sc === 1 ? 'safety car' : 'VSC'}: you’d lose ${plural(ST.scHold.m, 'place')} and need ${(ST.scHold.need / 1000).toFixed(2)} s a lap to win them back.</span>` : ''}</div>` : '<div class="muted" style="font-size:13px">No plan fits with the tyres left.</div>'}
        ${ST.posNote ? posNoteHtml(ST.posNote, me) : ''}
        <div class="rejoin"><span class="label" title="${ST.PL.n ? `Pit loss from ${plural(ST.PL.n, 'stop')} in this race (the track's figure is ${(ST.PL.track / 1000).toFixed(1)} s)` : 'The track’s pit loss: it changes to this race’s own once a stop is measured'}">If you pit now (${(ST.lossNow / 1000).toFixed(1)} s${L.sc ? `, ${L.sc === 1 ? 'safety car' : 'VSC'}` : ''}${ST.PL.n ? `, from ${plural(ST.PL.n, 'stop')} today` : ''})</span><b>Rejoin P${RJ.pos}</b><span class="muted">${RJ.ahead ? `${nm(RJ.ahead)} ${(RJ.gapA / 1000).toFixed(1)} s ahead` : 'leading'}${RJ.behind ? ` · ${nm(RJ.behind)} ${(RJ.gapB / 1000).toFixed(1)} s behind` : ''}</span></div></div></div>
    ${ST.none ? `${battleCard(s, idOf, ahead, me, me, ST.left, { pits: pitLaps, stopLeft: false })}${battleCard(s, idOf, me, behind, me, ST.left, { pits: pitLaps, stopLeft: false })}` : fightCards(c, s, r, L, me, idOf, ST)}
  </div>`;
}
/*
  Live Race updates once a second. Rather than drawing the whole app again, the page is built as before and only the
  cards whose content changed are swapped in (the menu, the scroll, open sections and anything you're typing in stay
  put), and the caches that only change with the race's data (each driver's tyre pace, rivals' plans) aren't cleared.
*/
const liveSrc = new WeakMap(); // each card on the page: the HTML it was drawn from (the page itself may have changed its text since)
function patchLive() {
  const root = document.getElementById('live-root'); if (!root) { render(); return; }
  const tpl = document.createElement('template'); tpl.innerHTML = renderLiveRace();
  const fresh = tpl.content.getElementById('live-root'); if (!fresh) { render(); return; }
  const head = document.querySelector('.live-head'), nh = tpl.content.querySelector('.live-head');
  if (head && nh && liveSrc.get(head) !== nh.outerHTML) { liveSrc.set(nh, nh.outerHTML); head.replaceWith(nh); }
  patchCards(root, fresh);
}
/** Swaps in the children of `b` that differ from those of `a` (into columns and grids, card by card). */
function patchCards(a, b) {
  const A = [...a.children], B = [...b.children];
  if (A.length !== B.length) { B.forEach(y => liveSrc.set(y, y.outerHTML)); a.replaceChildren(...B); return; }
  A.forEach((x, k) => {
    const y = B[k]; const src = y.outerHTML; if (liveSrc.get(x) === src) return;
    const box = x.tagName === y.tagName && (x.matches('.live-grid, .live-col') && y.matches('.live-grid, .live-col'));
    if (box && !x.contains(document.activeElement)) { x.className = y.className; patchCards(x, y); liveSrc.set(x, src); }
    else if (!x.contains(document.activeElement)) { liveSrc.set(y, src); x.replaceWith(y); }
  });
}
const _liveErsPlan = { key: null, P: null };
/** The ERS plan for Live Race, worked out again only on a new lap. */
function liveErsPlan(c, s, r) {
  const L = liveErs; const key = `${L?.uid}:${L?.lap}:${!!L?.pack}:${r.id}`;
  if (_liveErsPlan.key !== key) { let P = null; try { P = buildErsPlan(c, s, r, 'live'); } catch { P = null; } _liveErsPlan.key = key; _liveErsPlan.P = P; }
  return _liveErsPlan.P;
}
/** The live dashboard (or, between races, the pick of strategy and the debrief). */
function renderLiveRace() {
  const c = career(); const s = latestSeason(); const r = nextRound(s);
  const tabs = nowTabs();
  if (!r || isHist(s)) return `<div class="page">${tabs}<div class="muted">No weekend left to run this season.</div></div>`;
  const w = weekend(s, r.id, true); const L = liveFor(c, r);
  if (!L) return `<div class="page">${tabs}${liveIdle(c, s, r, w)}</div>`;
  const map = liveMap(c, s, L); const idOf = (i) => map[i];
  // the pit stops each car made so far (lap numbers), and the tyre each stint was on, tracked as the race goes
  const mineIds = isPrincipal(c) || c.type === 'myteam' ? (s.teams.find(t => t.id === s.playerTeamId)?.drivers || []).filter(Boolean) : [PLAYER];
  const cars = L.field.filter(x => mineIds.includes(idOf(x.i)));
  const follow = ui.liveFollow || 'player'; const meP = L.field.find(x => x.i === L.player) || cars[0];
  const shown = mineIds.length > 1 ? (follow === 'both' ? cars : follow === 'mate' ? cars.filter(x => x.i !== L.player) : [meP]) : [meP];
  const P = liveErsPlan(c, s, r);
  return `<div class="page live-page">${tabs}
    <div class="row live-head"><span class="tag live">Live</span><b>${L.key === 'SPR' ? 'Sprint' : 'Race'} · ${esc(r.name)}</b>${L.sc ? `<span class="tag ${L.sc === 1 ? 'sc' : 'vsc'}">${L.sc === 1 ? 'Safety car' : 'Virtual safety car'}</span>` : ''}
      ${mineIds.length > 1 ? `<div class="seg" style="margin-left:auto">${[['player', 'Your car'], ['mate', 'Teammate'], ['both', 'Both']].map(([v, l]) => `<button data-act="live-follow" data-v="${v}" class="${follow === v ? 'on' : ''}">${l}</button>`).join('')}</div>` : ''}</div>
    <div id="live-root"><div class="live-grid ${shown.length > 1 ? 'split' : ''}">${shown.filter(Boolean).map(me => liveDriverCol(c, s, r, L, w, me, idOf(me.i), idOf)).join('')}
      <div class="live-col">${champCard(c, s, r, L, idOf, mineIds)}${weatherCard(L)}
        ${P && !P.none && P.map ? `<div class="panel live-card"><div class="panel-h"><h2>ERS: where to boost</h2><span class="muted" style="font-size:12px" id="ers-live-now">${liveNowHtml(liveErs)}</span></div><div class="panel-b">${ersMapSvg(P, 'plan', !!c.ersFlip?.[trackOf(r)])}<div class="muted" style="font-size:12px">${P.planned.length ? P.planned.map((z, k) => `${k + 1}: ${Math.round(z.plan.at)}–${Math.round(z.plan.to)} m`).join(' · ') : 'No boost fits right now.'}</div></div></div>` : ''}</div></div></div>
  </div>`;
}
const nowTabs = () => `<div class="seg now-tabs">${[['weekend', 'Weekend'], ['live', 'Live Race']].map(([v, l]) => `<button data-act="now-tab" data-v="${v}" class="${(ui.nowTab || 'weekend') === v ? 'on' : ''}">${l}${v === 'live' && isLive() ? ' <i class="live-dot"></i>' : ''}</button>`).join('')}</div>`;
/** Between races: the debrief of the last one (until this weekend's first session), then the strategy to follow. */
function liveIdle(c, s, r, w) {
  const rounds = activeRounds(s); const ri = rounds.findIndex(x => x.id === r.id);
  const any = sessionsFor(s, r).some(k => w.sessions?.[k]?.done);
  // a sprint weekend: the sprint's debrief until qualifying is logged
  if (r.sprint && w.sessions?.SPR?.done && !w.sessions?.Q?.done) return debrief(c, s, r, 'SPR');
  if (!any && ri > 0) return debrief(c, s, rounds[ri - 1], 'R');
  if (r.sprint && !w.sessions?.SPR?.done) return `<div class="panel"><div class="panel-h"><h2>Sprint</h2></div><div class="panel-b muted" style="font-size:13px">Live Race follows the sprint as soon as it starts: no stop to plan, so just the race, the battles and the ERS.</div></div>`;
  const fp3 = r.sprint ? w.sessions?.Q?.done : (w.sessions?.FP3?.done || sessionsFor(s, r).filter(k => PRACTICE_KEYS.includes(k)).every(k => w.sessions?.[k]?.done));
  const { mine } = strategyRuns(s, r); const n = raceLaps(s, r.id); const PL = pitLoss(c, trackOf(r));
  const plans = Object.keys(mine).length >= 2 ? optimalStrategies(mine, n, { loss: PL.green, sets: setsLeft(c, s, r).sets }) : [];
  const sel = w.liveStrategy;
  return `<div class="panel"><div class="panel-h"><h2>Your race strategy</h2><span class="muted" style="font-size:12px">${fp3 ? 'Pick the one you’ll follow' : 'Practice isn’t finished yet: the list can still change'}</span></div>
    ${plans.length ? `<div class="panel-b stack">${plans.map((p, i) => { let lap = 0; const st = p.seq.map((cp, k) => { const from = lap + 1; lap += p.lens[k]; return { c: cp, from, to: lap }; }); const on = sel && sel.seq.join() === p.seq.join(); return `<div class="strat-row">${stintBar(st, n, { windows: p.windows })}<div class="strat-name"><span>${['', 'One', 'Two', 'Three'][p.stops]}-stopper${i === 0 ? ' · quickest' : ` · +${((p.t - plans[0].t) / 1000).toFixed(1)} s`}</span><button class="btn sm ${on ? 'primary' : ''}" data-act="live-pick" data-round="${r.id}" data-i="${i}">${on ? 'Following' : 'Follow this'}</button></div></div>`; }).join('')}
      <p class="muted" style="font-size:12px;margin:0">${sel ? 'In the race, Live Race tracks your stint and moves the stops as your tyres go, and switches plan if another is now quicker.' : 'Pick none and Live Race builds the strategy from the tyre you start on.'}</p></div>`
      : '<div class="panel-b muted" style="font-size:13px">No strategy yet: it needs long runs on two dry compounds in practice. Without one, Live Race builds it in the race from the tyre you start on.</div>'}</div>`;
}
/**
 * After a race: everything to look back on. The result and what it did to the championship; per driver of yours, the
 * strategy against the quickest in hindsight, how far off the best race, the ERS used, each stint's pace and wear, the
 * passes, and a theoretical best lap from their best sectors; then the positions lap by lap (yours highlighted), the lap
 * times against the winner and the cars around, race pace by driver and by team, who stopped when around you, and the
 * whole field's strategies. A title decided at this race gets its celebration on top.
 */
function debrief(c, s, r, key) {
  const sd = s.weekends[r.id]?.sessions?.[key]; if (!sd?.done) return '';
  const g = sd.game || {}; const sprint = key === 'SPR';
  const mineIds = c.type === 'myteam' ? (s.teams.find(t => t.id === s.playerTeamId)?.drivers || []).filter(Boolean) : [PLAYER];
  const rounds = activeRounds(s); const ri = rounds.findIndex(x => x.id === r.id);
  const nm = (d) => esc(dName(s, d)); const short = (d) => esc(lastName(dName(s, d)));
  const fin = (d) => { const k = sd.results.findIndex(x => x.d === d); return k < 0 ? null : OUT.includes(sd.results[k].st) ? sd.results[k].st : k + 1; };
  const grid = (d) => g.grid?.[d] || null;
  const W = sd.results.find(x => !OUT.includes(x.st))?.d;
  // a title decided at this race
  const before = titleMath(s, 'driver', ri), after = titleMath(s, 'driver', ri + 1);
  const tBefore = titleMath(s, 'team', ri), tAfter = titleMath(s, 'team', ri + 1);
  const crowned = [];
  if (!sprint && after.decided && !before.decided) crowned.push({ kind: 'driver', id: after.champion.id, name: after.champion.name });
  if (!sprint && tAfter.decided && !tBefore.decided) crowned.push({ kind: 'team', id: tAfter.champion.id, name: tAfter.champion.name });
  const isMine = (x) => x.kind === 'driver' ? mineIds.includes(x.id) : x.id === s.playerTeamId;
  const party = crowned.length ? `<div class="celebrate ${crowned.some(isMine) ? 'you' : ''}">${crowned.map(x => `<div><span class="label">${x.kind === 'driver' ? 'Drivers’ champion' : 'Constructors’ champions'} ${s.year}</span><b>${esc(x.name)}</b>${isMine(x) ? `<span>${x.kind === 'driver' ? 'World champion. You did it.' : 'Your team are world champions.'}</span>` : ''}</div>`).join('')}</div>` : '';
  const hasLaps = !!g.laps && mineIds.some(id => g.laps[id]?.length);
  // the championship before and after
  const stB = seasonStats(s, ri), stA = seasonStats(s, ri + 1); const dsB = driverStandings(s, stB), dsA = driverStandings(s, stA);
  const champ = mineIds.map(id => { const b = dsB.find(x => x.id === id), a = dsA.find(x => x.id === id); return a ? { id, posB: b?.pos, posA: a.pos, ptsB: b?.pts || 0, ptsA: a.pts } : null; }).filter(Boolean);
  const N = Math.max(0, ...Object.values(g.laps || {}).map(l => l.length));
  const PL = pitLoss(c, trackOf(r));
  // race pace: each driver's clean laps (no first lap, no in- or out-laps, nothing 4% off their median)
  const paceD = sd.results.map(x => ({ d: x.d, p: g.laps?.[x.d] ? cleanLapPace(sd, x.d) : null })).filter(x => x.p).sort((a, b) => a.p - b.p);
  const paceT = s.teams.map(t => { const v = paceD.filter(x => teamOf(s, x.d)?.id === t.id); return v.length ? { t, p: avg(v.map(x => x.p)), n: v.length } : null; }).filter(Boolean).sort((a, b) => a.p - b.p);
  const bar = (rows, label, isMe) => { const best = rows[0]?.p; const worst = rows[rows.length - 1]?.p; return `<div class="table-wrap"><table class="pace-table"><tbody>${rows.map((x, i) => `<tr class="${isMe(x) ? 'me' : ''}"><td class="num">${i + 1}</td><td>${label(x)}</td><td class="num mono">${fmtLap(x.p)}</td><td class="num">${i ? `+${((x.p - best) / 1000).toFixed(3)}` : ''}</td><td style="width:35%"><div class="h2h-bar"><i style="--c:${x.t?.color || teamColor(s, x.d)};width:${Math.max(4, 100 - (x.p - best) / Math.max(1, worst - best) * 85)}%"></i></div></td></tr>`).join('')}</tbody></table></div>`; };
  // each of your drivers
  const cols = mineIds.map(id => {
    const laps = g.laps?.[id]; if (!laps?.length) return '';
    const st = stintsOf(sd, id); const n = laps.length;
    const runs = practiceRuns(s, r, id, [key]); orderTyres(runs); fillTyres({}, runs);
    const best = Object.keys(runs).length >= 2 ? optimalStrategies(runs, n, { loss: PL.green })[0] : null;
    // safety-car laps count the same for both, so they're left out of the comparison
    const scLaps = new Set((g.safety?.periods || []).flatMap(p => Array.from({ length: Math.max(0, (p.to || p.from) - p.from + 1) }, (_, k) => p.from + k)));
    const green = laps.filter((l, k) => l[0] && !scLaps.has(k + 1)); const actual = green.reduce((a, l) => a + l[0], 0);
    const bestT = best ? best.t * green.length / n : null;
    let lap = 0; const bst = best ? best.seq.map((cp, k) => { const from = lap + 1; lap += best.lens[k]; return { c: cp, from, to: lap }; }) : [];
    const E = g.ers; let ersPct = null;
    if (E?.laps?.length && E.d === id) { const dep = E.laps.reduce((a, L2) => a + Math.max(0, ...L2.dep.filter(x => x != null)), 0); const harv = E.laps.reduce((a, L2) => a + Math.max(0, ...L2.harv.filter(x => x != null)), 0); const start = E.laps[0].ers.find(x => x != null) || 0; ersPct = Math.min(100, Math.round(dep / Math.max(1, harv + start) * 100)); }
    // each stint: its pace, fall-off and wear
    const wear = g.wear?.[id] || [];
    const stintRows = st.map((x, k) => {
      const pts = []; for (let L = x.from + 1; L <= x.to - (k < st.length - 1 ? 1 : 0); L++) if (laps[L - 1]?.[0] && !scLaps.has(L)) pts.push([L - x.from, laps[L - 1][0]]);
      const med = median(pts.map(p => p[1])); const clean = pts.filter(p => p[1] <= med * 1.04); const fit = clean.length >= 3 ? fitLine(clean) : null;
      const w0 = k ? wear[x.from - 1] ?? null : 0; const w1 = wear[x.to - 1];
      return `<tr><td>${tyreChip(x.c)} ${COMPOUNDS[x.c]?.[1] || 'Tyre'}</td><td class="num">${x.from}–${x.to}</td><td class="num">${x.to - x.from + 1}</td><td class="num mono">${clean.length ? fmtLap(avg(clean.map(p => p[1]))) : '–'}</td><td class="num">${fit ? `${fit.b >= 0 ? '+' : ''}${(fit.b / 1000).toFixed(3)} s` : '–'}</td><td class="num">${w1 != null ? `${Math.round(w1)}%` : '–'}</td></tr>`;
    }).join('');
    // the theoretical best lap: best sectors
    const H3 = laps.filter(l => l[2] && l[3] && l[4]); const bs = H3.length ? [2, 3, 4].map(k => Math.min(...H3.map(l => l[k]))) : null;
    const bestLap = Math.min(...laps.map(l => l[0]).filter(Boolean));
    const P = racePasses(sd); const f = fin(id), gr = grid(id);
    const tm = mineIds.length === 1 ? (teamOf(s, id)?.drivers || []).find(d => d && d !== id) : null;
    const tmPace = tm ? cleanLapPace(sd, tm) : null, myPace = cleanLapPace(sd, id);
    return `<div class="panel"><div class="panel-h"><h2>${nm(id)}</h2><span class="muted" style="font-size:12px">${typeof f === 'number' ? `Finished ${ordWord(f)}` : f === 'DSQ' ? 'Disqualified' : 'Did not finish'}${gr ? ` from ${ordWord(gr)} on the grid` : ''}</span></div>
      <div class="panel-b"><div class="ers-facts">
        ${typeof f === 'number' && gr ? `<div><b>${f < gr ? `+${gr - f}` : f > gr ? `−${f - gr}` : '±0'}</b><span>places, grid to flag</span></div>` : ''}
        ${bestT ? `<div><b>${(Math.abs(actual - bestT) / 1000).toFixed(1)} s</b><span>${actual >= bestT ? 'off the best race on your pace' : 'quicker than the best plan on your pace: a strong drive'}${scLaps.size ? ' (safety-car laps left out)' : ''}</span></div>` : ''}
        ${ersPct != null ? `<div><b>${ersPct}%</b><span>of the energy you had (battery and harvest) deployed</span></div>` : ''}
        ${myPace && paceD.length ? `<div><b>${ordWord(paceD.findIndex(x => x.d === id) + 1)}</b><span>on race pace (${fmtLap(myPace)})</span></div>` : ''}
        ${P ? `<div><b>${P.made[id] || 0} / ${P.lost[id] || 0}</b><span>passes made / lost${P.lap1[id] ? `, ${P.lap1[id] > 0 ? '+' : ''}${P.lap1[id]} on lap 1` : ''}</span></div>` : ''}
        ${isFinite(bestLap) ? `<div><b>${fmtLap(bestLap)}</b><span>best lap${bs && bestLap - (bs[0] + bs[1] + bs[2]) > 50 ? `; ${fmtLap(bs[0] + bs[1] + bs[2])} from your best sectors` : ''}</span></div>` : ''}
        ${tmPace && myPace ? `<div><b>${myPace <= tmPace ? '−' : '+'}${(Math.abs(myPace - tmPace) / 1000).toFixed(3)} s</b><span>a lap against ${short(tm)}</span></div>` : ''}
      </div></div>
      <div class="panel-b stack" style="border-top:1px solid var(--line)"><div><span class="label">Your strategy</span>${stintBar(st, n)}</div>
        ${best ? `<div><span class="label">Quickest in hindsight, from your race pace (${plural(best.stops, 'stop')})</span>${stintBar(bst, n)}</div>` : ''}
        <div class="table-wrap"><table><thead><tr><th>Stint</th><th class="num">Laps</th><th class="num">Length</th><th class="num">Pace</th><th class="num">Fall-off / lap</th><th class="num">Wear at the end</th></tr></thead><tbody>${stintRows}</tbody></table></div></div></div>`;
  }).join('');
  // lap times: yours against the winner and the cars that finished either side of you
  const lapChart = (() => {
    const me = mineIds.find(id => g.laps?.[id]?.length); if (!me || !g.laps) return '';
    const f = fin(me); const near = typeof f === 'number' ? [sd.results[f - 2]?.d, sd.results[f]?.d] : [];
    const who = [...new Set([me, ...mineIds.filter(id => id !== me), W, ...near])].filter(d => d && g.laps[d]?.length);
    const all = who.flatMap(d => g.laps[d].slice(1).map(l => l[0]).filter(Boolean)); const cap = (median(all) || 90000) * 1.04;
    const sc = new Set((g.safety?.periods || []).flatMap(p => Array.from({ length: Math.max(0, (p.to || p.from) - p.from + 1) }, (_, k) => p.from + k)));
    const pitL = (d) => new Set(stintsOf(sd, d).slice(0, -1).flatMap(x => [x.to, x.to + 1]));
    const series = who.map(d => { const P = pitL(d); return { color: teamColor(s, d), dashed: !mineIds.includes(d), dots: mineIds.includes(d), pts: g.laps[d].map((l, k) => [k + 1, l[0] / 1000]).filter((p, k) => k > 0 && p[1] && !P.has(k + 1) && !sc.has(k + 1) && p[1] * 1000 <= cap) }; });
    return `<div class="panel"><div class="panel-h"><h2>Lap times</h2><span class="muted" style="font-size:12px">${who.map(d => `<span style="color:${teamColor(s, d)}">●</span> ${short(d)}`).join(' · ')} · pit laps and safety-car laps left off</span></div><div class="panel-b">${svgChart(series, { h: 220, yFmt: (v) => fmtLap(v * 1000), invert: true })}</div></div>`;
  })();
  // who stopped when, around you
  const pitTable = (() => {
    if (!g.laps || !mineIds.length) return '';
    const me = mineIds[0]; const f = fin(me); const k0 = typeof f === 'number' ? f - 1 : sd.results.findIndex(x => x.d === me);
    const near = sd.results.slice(Math.max(0, k0 - 3), k0 + 4).map(x => x.d).filter(d => g.laps[d]?.length);
    const at = (d) => { const k = sd.results.findIndex(x => x.d === d); return k < 0 ? 99 : k; };
    const ids = [...new Set([...near, ...mineIds])].filter(d => g.laps[d]?.length).sort((a, b) => at(a) - at(b));
    return `<div class="panel"><div class="panel-h"><h2>Who stopped when</h2><span class="muted" style="font-size:12px">The cars around ${short(me)} at the finish</span></div><div class="panel-b tight table-wrap"><table><tbody>${ids.map(d => { const st = stintsOf(sd, d); return `<tr class="${mineIds.includes(d) ? 'me' : ''}"><td class="num">${typeof fin(d) === 'number' ? fin(d) : fin(d) || '–'}</td><td>${drvCell(s, d, { team: true })}</td><td>${st.map((x, k) => `${tyreChip(x.c)}${k < st.length - 1 ? ` <span class="muted">lap ${x.to}</span> ` : ''}`).join(' ')}</td></tr>`; }).join('')}</tbody></table></div></div>`;
  })();
  // fastest sectors of the race
  const sectors = (() => {
    if (!g.laps) return '';
    const bestBy = [2, 3, 4].map(k => { let b = null; for (const [d, laps] of Object.entries(g.laps)) for (const l of laps) if (l[k] && (!b || l[k] < b.v)) b = { d, v: l[k] }; return b; });
    if (!bestBy.every(Boolean)) return '';
    const mineBest = mineIds.filter(id => g.laps[id]).map(id => ({ id, v: [2, 3, 4].map(k => Math.min(...g.laps[id].map(l => l[k]).filter(Boolean))) }));
    return `<div class="panel"><div class="panel-h"><h2>Fastest sectors</h2></div><div class="panel-b tight table-wrap"><table><thead><tr><th></th><th>Sector 1</th><th>Sector 2</th><th>Sector 3</th><th class="num">Ideal lap</th></tr></thead><tbody>
      <tr><td class="muted">Fastest</td>${bestBy.map(b => `<td><b class="mono">${(b.v / 1000).toFixed(3)}</b> <span class="muted">${short(b.d)}</span></td>`).join('')}<td class="num mono">${fmtLap(bestBy.reduce((a, b) => a + b.v, 0))}</td></tr>
      ${mineBest.map(x => `<tr class="me"><td>${short(x.id)}</td>${x.v.map((v, k) => `<td class="mono">${isFinite(v) ? `${(v / 1000).toFixed(3)} <span class="muted">+${((v - bestBy[k].v) / 1000).toFixed(3)}</span>` : '–'}</td>`).join('')}<td class="num mono">${x.v.every(isFinite) ? fmtLap(x.v.reduce((a, b) => a + b, 0)) : '–'}</td></tr>`).join('')}</tbody></table></div></div>`;
  })();
  const champChart = (() => {
    const me = mineIds[0]; const prog = progression(s, 'driver'); const idx = rounds.map((x, k) => k).filter(k => s.weekends[rounds[k].id]?.sessions?.R?.done);
    const at = idx.indexOf(ri); if (at < 0 || sprint) return '';
    const from = Math.max(0, at - 2); const k0 = dsA.findIndex(x => x.id === me); if (k0 < 0) return '';
    const start = Math.max(0, Math.min(k0 - 2, dsA.length - 5)); const who = dsA.slice(start, start + 5).map(x => x.id);
    const series = who.map(id => ({ label: dAbbr(s, id), name: dName(s, id), color: teamColor(s, id), bold: mineIds.includes(id), vals: (prog.by[id]?.pts || []).slice(from, at + 1) }));
    return `<div class="panel-b"><span class="label">The championship around ${short(me)}, the last ${plural(at - from + 1, 'race')}</span>${lineChart(series, prog.labels.slice(from, at + 1), { names: prog.names.slice(from, at + 1) })}</div>`;
  })();
  const champLine = champ.length ? `${champChart}<div class="panel-b"><div class="ers-facts">${champ.map(x => `<div><b>P${x.posA}${x.posB && x.posB !== x.posA ? ` <small class="muted">${x.posA < x.posB ? '▲' : '▼'} from P${x.posB}</small>` : ''}</b><span>${short(x.id)} in the championship: ${x.ptsA} points (+${x.ptsA - x.ptsB})</span></div>`).join('')}<div><b>${esc(dsA[0] ? dName(s, dsA[0].id) : '–')}</b><span>leads on ${dsA[0]?.pts || 0}${dsA[1] ? `, ${dsA[0].pts - dsA[1].pts} clear of ${short(dsA[1].id)}` : ''}</span></div></div></div>` : '';
  return `${party}<div class="panel"><div class="panel-h"><h2>Debrief · ${esc(r.name)}${sprint ? ' sprint' : ''}</h2><span class="muted" style="font-size:12px">${W ? `Won by ${nm(W)} · ` : ''}until the next session is logged</span></div>${champLine}</div>
    ${hasLaps ? '' : '<div class="callout">This race wasn’t logged from F1 25, so there are no laps to break down: only the result.</div>'}
    <div class="debrief-grid ${mineIds.length > 1 ? 'two' : ''}">${cols}</div>
    ${positionChartPanel(s, sd, { mine: mineIds })}
    ${lapChart}
    ${paceD.length ? `<div class="grid-2" style="align-items:start"><div class="panel"><div class="panel-h"><h2>Race pace · drivers</h2><span class="muted" style="font-size:12px">Clean laps: no lap 1, pit laps or slow laps</span></div><div class="panel-b tight">${bar(paceD, (x) => drvCell(s, x.d, { team: true }), (x) => mineIds.includes(x.d))}</div></div>
      <div class="panel"><div class="panel-h"><h2>Race pace · teams</h2><span class="muted" style="font-size:12px">Both drivers’ clean laps</span></div><div class="panel-b tight">${bar(paceT, (x) => `${esc(x.t.name)}${x.n < 2 ? ' <span class="muted">(one car)</span>' : ''}`, (x) => x.t.id === s.playerTeamId)}</div></div></div>` : ''}
    <div class="grid-2" style="align-items:start">${pitTable}${sectors}</div>
    ${strategyPanel(s, sd, key, r.id)}`;
}
/** Sounds for the pit calls: uploaded in Settings, kept with your data. */
const SOUND_SLOTS = [['pit', 'Pit this lap'], ['sc', 'Pit now under a safety car or VSC'], ['c16', 'Soft'], ['c17', 'Medium'], ['c18', 'Hard'], ['c7', 'Intermediate'], ['c8', 'Wet']];
function soundsPanel() {
  const S = soundsOf();
  return `<div class="panel"><div class="panel-h"><h2>Live Race sounds</h2><span class="muted" style="font-size:12px">A pit call plays its sound, then the tyre’s</span></div><div class="panel-b stack">
    ${SOUND_SLOTS.map(([k, l]) => `<div class="row" style="gap:8px"><span style="min-width:240px">${l}</span>${S[k] ? `<span class="muted" style="font-size:12px">${esc(S[k].name)}</span><button class="btn sm" data-act="sound-play" data-k="${k}">Play</button><button class="btn sm ghost" data-act="sound-clear" data-k="${k}">Remove</button>` : `<label class="btn sm">Upload<input type="file" accept="audio/*" data-ch="sound-upload" data-k="${k}" hidden></label>`}</div>`).join('')}
    <p class="muted" style="font-size:12px;margin:0">Short clips work best (under 1 MB each). A call’s sound plays once: again only if the tyre changes or the stop moves on by more than a lap.</p></div></div>`;
}

/** Next season's calendar as your own list (made from the default the first time you change it). */
const ncList = (c, s) => ((c.nextCal ||= {})[s.year + 1] ||= clone(nextCal(c, s)));
const liveOpened = new Set();
/** A message from the live race: kept (merged), each car's stops tracked, and the page redrawn. */
/**
 * One live message folded into the race so far (`now`: its time, ms): the running order over the last 15 s, every car
 * into the pit lane with the order 10 s before, each car's stops and tyres, and the fights for a place (a car within a
 * second of the one ahead, on the same lap): a pass, or no pass within three laps or before it drops away.
 */
function mergeLive(prev, m, now) {
  const L = { ...prev, ...m, pack: m.pack || prev.pack || null, pitLaps: prev.pitLaps || {}, used: prev.used || {}, stopsSeen: prev.stopsSeen || {}, lastC: prev.lastC || {},
    order: prev.order || [], pitEntries: prev.pitEntries || [], wasPit: prev.wasPit || {}, fight: prev.fight || {}, held: prev.held || {}, fights: prev.fights || {}, passTally: prev.passTally || { f: 0, p: 0 }, ageSeen: { ...(prev.ageSeen || {}) }, tw: { ...(prev.tw || {}) } };
  const liveErs = L; // (the steps below were written against the live state)
  L.lapLen = Math.max(prev.lapLen || 1000, ...(m.field || []).map(x => x.dist || 0));
  // the game's tyre age goes up a moment after the lap does: a car that's just crossed the line on the same set gets it now
  if (m.field) L.field = m.field = m.field.map(x => {
    const was = L.ageSeen[x.i]; let y = x;
    const same = was && x.age != null && (x.stops || 0) === was.stops && !x.pit;
    if (same && x.lap === was.lap + 1 && x.age === was.age) y = { ...x, age: x.age + 1 };
    else if (same && x.lap === was.lap && x.age < was.age) y = { ...x, age: was.age };
    if (y.age != null) L.ageSeen[x.i] = { lap: y.lap, age: y.age, stops: y.stops || 0 };
    // the wear this set has put on under green flags, and over how much of a lap (a new set, or one that went back
    // in age, starts again; its wear when fitted is the lowest seen, as the old set can still be showing at first)
    const p = (y.lap || 0) + Math.min(1, (y.dist || 0) / L.lapLen); let T = L.tw[x.i];
    if (!T || T.stops !== (y.stops || 0) || T.c !== y.c || (y.age ?? 0) < T.age) T = { stops: y.stops || 0, c: y.c, age: y.age ?? 0, w: y.wear, p, gW: 0, gL: 0 };
    else {
      const dp = p - T.p, dw = y.wear != null && T.w != null ? y.wear - T.w : null; T = { ...T, age: y.age ?? T.age, w: y.wear ?? T.w, p };
      if (!m.sc && !y.pit && dw != null && dw >= 0 && dp > 0 && dp < 0.5) { T.gW += dw; T.gL += dp; }
    }
    L.tw[x.i] = T;
    return { ...y, twW: T.gW, twL: T.gL };
  });
  if (m.field) {
    const pos = Object.fromEntries(m.field.filter(x => x.pos > 0).map(x => [x.i, x.pos])); const stops = Object.fromEntries(m.field.map(x => [x.i, x.stops || 0]));
    liveErs.order = [...liveErs.order.filter(o => now - o.t < 15e3), { t: now, pos, stops }];
    for (const x of m.field) {
      if (x.pit && !liveErs.wasPit[x.i]) { const then = liveErs.order.filter(o => o.t <= now - LIVE_PIT_MEMORY).pop() || liveErs.order[0]; liveErs.pitEntries = [...liveErs.pitEntries.slice(-60), { i: x.i, t: now, lap: x.lap, pos: then.pos, stops: then.stops }]; }
      liveErs.wasPit[x.i] = !!x.pit;
    }
    // fights for a place
    const G = raceGaps(m.field); const by = Object.fromEntries(m.field.map(x => [x.i, x])); const run = m.field.filter(x => x.pos > 0 && x.st === 2).sort((a, b) => a.pos - b.pos);
    const F = L.fights = { ...L.fights }; const T = L.passTally = { ...L.passTally };
    for (let k = 1; k < run.length; k++) { const a = run[k - 1], b = run[k]; if (a.pit || b.pit || (G[a.i]?.down || 0) !== (G[b.i]?.down || 0) || (b.gapF ?? 9e9) > 1000 || (b.lap || 0) < 2) continue; F[`${a.i}>${b.i}`] ||= { a: a.i, b: b.i, lap: b.lap, sa: a.stops || 0, sb: b.stops || 0 }; }
    for (const [k, x] of Object.entries(F)) {
      const a = by[x.a], b = by[x.b];
      if (!a || !b || a.st !== 2 || b.st !== 2 || a.pit || b.pit || (a.stops || 0) !== x.sa || (b.stops || 0) !== x.sb) { delete F[k]; continue; } // a stop ends it either way
      if (b.pos < a.pos) { T.f++; T.p++; delete F[k]; continue; }
      if ((G[b.i]?.g ?? 0) - (G[a.i]?.g ?? 0) > 2000) { if (b.lap > x.lap) T.f++; delete F[k]; continue; }
      if (b.lap >= x.lap + RETRY_LAPS) { T.f++; x.lap = b.lap; } // three laps behind without getting by: a chance gone, and the next go
    }
  }
  // the laps each car ran with the safety car or VSC out, for any part of the lap
  if (m.sc && m.field) { L.scLaps = { ...(prev.scLaps || {}) }; for (const x of m.field) { const a = L.scLaps[x.i] || []; if (x.lap && a[a.length - 1] !== x.lap) L.scLaps[x.i] = [...a, x.lap]; } }
  // a car's stop count went up: note the lap, and the tyre it came in on
  for (const x of m.field || []) {
    const was = liveErs.stopsSeen[x.i] ?? 0;
    if ((x.stops || 0) > was) { (liveErs.pitLaps[x.i] ||= []).push(Math.max(1, (x.lap || 1) - 1)); (liveErs.used[x.i] ||= []).push(liveErs.lastC[x.i] ?? x.c); }
    liveErs.stopsSeen[x.i] = x.stops || 0; if (!x.pit && x.c != null) liveErs.lastC[x.i] = x.c;
  }
  // what each stop cost, once the car has finished its out-lap: the in- and out-lap against two of its laps before
  for (const x of m.field || []) for (const n of L.pitLaps[x.i] || []) {
    const key = `${x.i}:${n}`; if ((x.lap || 0) < n + 2 || L.pitDone?.[key]) continue;
    L.pitDone = { ...(L.pitDone || {}), [key]: true };
    const laps = liveLaps(x); const P = L.pitLaps[x.i]; const scl = L.scLaps?.[x.i] || [];
    const inL = laps.find(l => l.n === n), outL = laps.find(l => l.n === n + 1);
    const ref = laps.filter(l => l.n < n && l.n >= n - 5 && l.n > 1 && l.valid && !P.includes(l.n) && !P.includes(l.n - 1) && !scl.includes(l.n)).map(l => l.ms);
    if (!inL || !outL || ref.length < 2) continue;
    L.pitCosts = [...(L.pitCosts || []), { i: x.i, lap: n, ms: inL.ms + outL.ms - 2 * median(ref), sc: scl.includes(n) || scl.includes(n + 1) }];
  }
  return L;
}
/**
 * The pit loss in this race: the green-flag stops measured so far (a stop behind a safety car or VSC is left out, and
 * so is one well over the track's figure: a new front wing, a penalty served), their average from the first one in;
 * the safety-car and VSC losses move with it. Until a stop is measured, the track's own figure. When the race ends,
 * the race's figure becomes the track's (you can still change it), so the next visit starts from it.
 */
function racePitLoss(c, tid, L) {
  const PL = pitLoss(c, tid);
  let v = (L.pitCosts || []).filter(x => !x.sc && x.ms > 8000 && x.ms < 50000).map(x => x.ms);
  // a new wing only ever adds time: more than 3 s over the track's figure is left out, unless the stops so far (five
  // or more) all are, when it's the figure that's out; then one well over the others (4 s) is left out
  const near = v.filter(ms => ms <= PL.green + 3000); v = near.length || v.length < 5 ? near : v.filter(ms => ms <= median(v) + 4000);
  if (!v.length) return PL;
  const green = avg(v); const k = green / PL.green;
  return { ...PL, green, sc: PL.sc * k, vsc: PL.vsc * k, track: PL.green, n: v.length };
}
function savePitLoss(L) {
  const c = career(); const tid = GAME_TRACKS[L.track]; if (!c || !tid) return;
  const PL = racePitLoss(c, tid, L); if (!PL.n) return; const s1 = (ms) => Math.round(ms / 100) / 10;
  (c.pitLoss ||= {})[tid] = { green: s1(PL.green), vsc: s1(PL.vsc), sc: s1(PL.sc), learned: { stops: PL.n, at: new Date().toISOString() } }; store.save();
}
function onLiveMsg(m) {
  const same = liveErs?.uid === m.uid;
  if (m.done) { replayRelist(); if (same) { savePitLoss(liveErs); liveErs = { ...liveErs, done: true }; render(); } return; }
  const before = same ? liveErs.passTally?.f || 0 : 0;
  liveErs = mergeLive(same ? liveErs : {}, m, Date.now());
  // what the fights say about passing here, kept per race for the overtaking slider
  { const c = career(); const tid = GAME_TRACKS[m.track];
    if (c && tid && liveErs.passTally.f !== before && !(c.gameKeys || []).includes(`${m.uid}:${m.sessionType}`)) { ((c.passStats ||= {})[tid] ||= {})[m.uid] = { ...liveErs.passTally }; store.save(); } }
  // a race starting: open Live Race, once
  if (!liveOpened.has(m.uid) && m.lap <= 1) { liveOpened.add(m.uid); ui.view = 'now'; ui.nowTab = 'live'; }
  const a = document.activeElement; const onLive = ui.view === 'now' && ui.nowTab === 'live';
  if (onLive && document.getElementById('live-root') && !$('#modal-root').innerHTML) patchLive();
  else if ((m.pack || onLive) && !$('#modal-root').innerHTML && !(a && a.matches('input, textarea, select'))) render();
  else { const el = document.getElementById('ers-live-now'); if (el) el.innerHTML = liveNowHtml(liveErs); }
}
