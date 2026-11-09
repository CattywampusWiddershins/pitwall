/* Pitwall — ERS deployment plans. Part of the renderer, split into files that load in order (see index.html). */
'use strict';
/*
  ERS: where to use boost. Through the weekend (practice, qualifying, the sprint, the race) Pitwall follows your car alone (no AI) in 20 m slices of the lap: throttle,
  brake, speed, the battery, the deploy mode, energy deployed and harvested so far this lap, MGU-K power, and where the
  car is. From your long runs (the same laps the strategy uses) it measures what your car really does: how fast boost
  drains the battery against normal deployment, how much you harvest a lap, how full the battery is. Only two modes
  count: normal (the game's medium) and boost (overtake); laps in none or hotlap are left out.
  Then it plans the lap. The battery has to last the stint, so the energy to spend on boost each lap is what you
  harvest, less what normal deployment already uses. Boost goes where it buys the most time per joule, on the
  straights (long stretches of full throttle): a stretch of each, usually from the corner exit, since the speed it
  gains carries all the way down the straight (so long straights come first). The battery has to keep enough charge to
  reach the end of every straight; a boost that would leave it dry is cut short. The time each zone gains comes from a simple model
  (extra power accelerates the car, drag takes some back), scaled by what your laps show where you drove the same
  straight both with and without boost.
*/
/** How big an outline is, in metres (its longer side): a few metres means the position data didn't come through. */
const mapExtent = (pts) => { const q = (pts || []).filter(Boolean); if (!q.length) return 0; const xs = q.map(p => p[0]), zs = q.map(p => p[1]); return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)); };
const ERS_NORMAL = 1, ERS_BOOST = 3; // the game's deploy modes: 1 medium (normal), 3 overtake (boost)
const ERS_MASS = 800; // kg, car and driver
/** Laps in your long runs on dry tyres (three or more consecutive pushing laps, within 2.5% of the run's best).
 *  Intermediate and wet runs are left out: they depend too much on the conditions. */
function longRunLapNos(sd, d) {
  const laps = sd?.game?.laps?.[d]; const out = new Set(); if (!laps) return out;
  for (const x of stintsOf(sd, d)) {
    if (!DRY.includes(x.c)) continue;
    const run = []; for (let lap = x.from + 1; lap <= x.to; lap++) { const l = laps[lap - 1]; if (l?.[0]) run.push({ lap, ms: l[0] }); }
    if (run.length < 3) continue;
    const best = Math.min(...run.map(r => r.ms)); let cur = [];
    const flush = () => { if (cur.length >= 3) cur.forEach(r => out.add(r.lap)); cur = []; };
    for (const r of run) { if (r.ms <= best * 1.025 && (!cur.length || r.lap === cur[cur.length - 1].lap + 1)) cur.push(r); else { flush(); if (r.ms <= best * 1.025) cur.push(r); } }
    flush();
  }
  return out;
}
const median = (xs) => { const v = xs.filter(x => x != null && isFinite(x)).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : null; };
const ERS_HOTLAP = 2; // the game's hotlap deploy mode
const ERS_RACE_KEYS = [...RUN_KEYS, 'R'], ERS_QUALI_KEYS = [...PRACTICE_KEYS, 'SQ', 'Q'];
const ERS_MODE_NAME = { 0: 'none', 1: 'normal', 2: 'hotlap', 3: 'boost' };
/** How much of a lap's full throttle was in hotlap (hot), and in hotlap or boost (hb). */
function hotShare(L) {
  let n = 0, hot = 0, hb = 0;
  L.mode.forEach((m, i) => { if (m != null && L.thr[i] >= 95) { n++; if (m === ERS_HOTLAP) hot++; if (m === ERS_HOTLAP || m === ERS_BOOST) hb++; } });
  return n >= 10 ? { hot: hot / n, hb: hb / n } : { hot: 0, hb: 0 };
}
/** A flying lap for qualifying: mostly hotlap or boost on full throttle, some of it hotlap. */
const flyingLap = (L) => { const x = hotShare(L); return x.hb >= 0.6 && x.hot > 0; };
/** A lap's time from its slices (s): to tell racing laps from laps behind the safety car. */
const binTime = (L, bin) => L.spd.reduce((a, v) => a + (v > 5 ? bin / (v / 3.6) : 0), 0);
/** The battery at the start of a lap (kJ). */
const lapStart = (L) => L.ers.find(x => x != null) ?? null;
// The race you're driving now, as the game sends it: your battery every second and the ERS profile each new lap.
// Kept in memory only: the race is saved, profile and all, when it finishes.
let liveErs = null;
/** The live race, if it is this round's and still running: the session key it will be logged under joins it. */
function liveRaceFor(c, r) {
  const L = liveErs; if (!L?.pack?.laps || gameTrack(L.track) !== trackOf(r)) return null;
  if (Date.now() - Date.parse(L.at) > 10 * 60e3) return null; // gone quiet: the game was closed mid-race
  if ((c.gameKeys || []).includes(`${L.uid}:${L.sessionType}`)) return null; // already logged
  return { ...L, key: L.sessionType === 15 && (L.weekend || []).includes(16) ? 'SPR' : 'R' };
}
/** Your battery right now, for the live strip (updated every second without redrawing the page). */
function liveNowHtml(L) {
  if (!L || L.store == null) return '';
  return `battery <b>${(L.store / 1000).toFixed(2)} MJ</b> · ${L.pit ? 'in the pit lane' : `${esc(ERS_MODE_NAME[L.mode] || 'mode ' + L.mode)} mode`} · ${L.dep ?? 0} kJ deployed this lap${L.limit ? ` of ${(L.limit / 1000).toFixed(1)} MJ` : ''}`;
}
const _ersCache = new WeakMap();
/** Everything an ERS panel shows for this weekend, or null when there is no data. kind: 'race' or 'quali'. */
function ersPlan(c, s, round, kind = 'race') {
  const key = `${round.id}:${kind}`; let v = _ersCache.get(s);
  if (!v || v.gen !== renderGen) { v = { gen: renderGen, p: {} }; _ersCache.set(s, v); }
  if (!(key in v.p)) v.p[key] = buildErsPlan(c, s, round, kind);
  return v.p[key];
}
/*
  Two plans from the same measurements. The race plan: normal deployment is the base and boost is spent from what you
  harvest, so the battery lasts the stint; it learns from practice long runs, the sprint and, as you drive it, the race
  itself. During the race it also adapts: charge in the battery above what you need at the flag is spread over the laps
  left, so a full battery late on goes on boost rather than to waste, and a low one means boost only from what you harvest.
  The qualifying plan: hotlap is the base, on flying laps from practice and qualifying (laps mostly in hotlap or boost on
  full throttle). A flying lap can empty the battery (the in-lap recharges it), so the energy is what it starts with
  plus what the lap harvests, up to the per-lap deploy limit; the battery still has to last to the end of each straight.
*/
function buildErsPlan(c, s, round, kind = 'race') {
  const Q = kind === 'quali'; const BASE = Q ? ERS_HOTLAP : ERS_NORMAL; const baseName = ERS_MODE_NAME[BASE];
  const w = s.weekends[round.id]; const laps = []; let E0 = null, fallback = false, stale = false; const all = [];
  const isStale = (E, format) => (format || 0) >= 2026 && (E.v || 0) < 3; // 2026-format data logged before 2.0.12 was read with the old record sizes
  for (const k of Q ? ERS_QUALI_KEYS : kind === 'live' ? ERS_RACE_KEYS : RUN_KEYS) {
    const sd = w?.sessions?.[k]; const E = sd?.game?.ers; if (!E || sd.estimated) continue;
    if (isStale(E, E.format)) { stale = true; continue; }
    E0 ||= E;
    // no inters or wets: the tyre each lap was on (kept with the lap from 2.2), else the session's stints
    const dry = (L) => { if (L.tyre != null) return DRY.includes(L.tyre); const st = stintsOf(sd, E.d).find(x => L.lap >= x.from && L.lap <= x.to); return !st || DRY.includes(st.c); };
    if (Q) { for (const L of E.laps) if (dry(L) && flyingLap(L)) laps.push({ k, ...L }); }
    else {
      const long = longRunLapNos(sd, E.d);
      for (const L of E.laps) { if (!dry(L) || hotShare(L).hot >= 0.3) continue; all.push({ k, ...L }); if (long.has(L.lap)) laps.push({ k, ...L }); }
    }
    if (!E0.map?.some(Boolean) && E.map?.some(Boolean)) E0 = E;
  }
  // the race being driven: its racing laps so far (not the start, a stop or the safety car)
  const live = kind === 'live' ? liveRaceFor(c, round) : null; let liveLaps = 0;
  if (live && !isStale(live.pack, live.format)) {
    const E = { ...live.pack, format: live.format }; E0 ||= E;
    const ok = E.laps.filter(L => L.lap > 1 && !L.pit && hotShare(L).hot < 0.3); const tm = median(ok.map(L => binTime(L, E.bin)));
    for (const L of ok) if (binTime(L, E.bin) <= tm * 1.03) { laps.push({ k: live.key, live: true, ...L }); liveLaps++; }
    if (!E0.map?.some(Boolean) && E.map?.some(Boolean)) E0 = E;
  }
  if (!E0) return stale ? { stale: true } : null;
  if (!laps.length) { if (Q) return { none: true, stale }; laps.push(...all); fallback = true; }
  if (!laps.length) return null;
  const bin = E0.bin, nb = Math.ceil(E0.length / bin);
  const warn = [];
  if (stale) warn.push('Laps logged before 2.0.12 are left out: that version read the 2026-format packets wrongly.');
  // which modes you used (share of slices at full throttle)
  const modes = {}; let slices = 0;
  for (const L of laps) L.mode.forEach((m, i) => { if (m != null && L.thr[i] >= 95) { modes[m] = (modes[m] || 0) + 1; slices++; } });
  const ftBrk = laps.flatMap(L => L.thr.map((v, i) => v >= 95 ? L.brk[i] : null).filter(x => x != null));
  const brakeOk = !ftBrk.length || ftBrk.filter(b => b < 5).length / ftBrk.length >= 0.2;
  if (!brakeOk) warn.push('The brake reading from the game never dropped to zero on full throttle, so it isn’t being read right in this game version: straights and braking are found from the throttle alone. Copy the diagnostics at the bottom and send them over so it can be fixed.');
  const offBrake = (L, i) => brakeOk ? L.brk[i] < 5 : true;
  const allErs = laps.flatMap(L => L.ers.filter(x => x != null));
  if (!allErs.length || Math.max(...allErs) <= 0) warn.push('The game sent no battery data. Check that UDP telemetry is on and set to public in the game’s settings.');
  else if (Math.max(...allErs) > 12000) warn.push('The battery readings are out of range (over 12 MJ): this game version may send ERS differently, so treat the plan with care.');
  const used = (modes[BASE] || 0) + (modes[ERS_BOOST] || 0);
  if (!Q && slices && used / slices < 0.5) warn.push('Most of your running was in a deploy mode other than normal or boost. Only normal and boost laps are used, so drive your long runs in those.');
  // measure: deploy rate per mode at full throttle, MGU-K power, harvest per lap, the battery
  const acc = { [BASE]: { e: 0, t: 0, pw: [], band: {} }, [ERS_BOOST]: { e: 0, t: 0, pw: [], band: {} } };
  const BAND = 20; // km/h: deployment is measured per speed band, since the game deploys differently as speed builds
  const perLap = [];
  // harvest per unit of braking, only where the battery had room: a full battery can't take any more, so laps that ran
  // full under braking show less than a lap can really harvest (from empty, a big braking zone refills it)
  const brakeW = (L, i) => brakeOk ? (L.brk[i] || 0) : L.thr[i] != null && L.thr[i] < 20 ? 100 : 0;
  const fullAt = Math.max(4000, ...allErs) * 0.95; let hE = 0, hW = 0;
  for (const L of laps) {
    let last = null;
    for (let i = 0; i < nb; i++) {
      const sp = L.spd[i]; if (sp == null || sp < 30) { last = null; continue; }
      const dt = bin / (sp / 3.6);
      // full throttle with charge in the battery (an empty battery deploys nothing, whatever the mode)
      if (L.thr[i] >= 95 && offBrake(L, i) && acc[L.mode[i]] && last != null && L.dep[i] != null && (L.ers[i] ?? 0) > 100) {
        const dd = L.dep[i] - last; if (dd >= 0 && dd < 300) { const A = acc[L.mode[i]]; A.e += dd; A.t += dt; const B = (A.band[Math.floor(sp / BAND)] ||= { e: 0, t: 0 }); B.e += dd; B.t += dt; }
        if (L.pw[i] != null) acc[L.mode[i]].pw.push(L.pw[i]);
      }
      last = L.dep[i];
      if (i > 0 && L.harv[i] != null && L.harv[i - 1] != null && (L.ers[i] ?? fullAt) < fullAt) { const dh = L.harv[i] - L.harv[i - 1]; const bw = brakeW(L, i) * dt; if (dh >= 0 && dh < 300 && bw > 0) { hE += dh; hW += bw; } }
    }
    const idx = [...L.ers.keys()].filter(i => L.ers[i] != null);
    perLap.push({ k: L.k, live: !!L.live, lap: L.lap, start: L.ers[idx[0]], end: L.ers[idx[idx.length - 1]], dep: Math.max(0, ...L.dep.filter(x => x != null)), harv: Math.max(0, ...L.harv.filter(x => x != null)),
      boost: L.mode.filter((m, i) => m === ERS_BOOST && L.thr[i] >= 95).length * bin });
  }
  const fmt2026 = (E0.format || 0) >= 2026;
  const kW = (m) => acc[m].t > 5 ? acc[m].e / acc[m].t : null; // kJ per s = kW
  let pBoost = kW(ERS_BOOST), pNormal = kW(BASE); const assumed = [];
  const capKW = median(acc[ERS_BOOST].pw) || Math.max(0, ...laps.flatMap(L => L.pw.filter(x => x != null)));
  if (pBoost == null) { pBoost = capKW > 50 ? capKW : 120; assumed.push('boost deployment (no boost on full throttle yet: from the MGU-K’s top power)'); }
  if (pNormal == null) { pNormal = Q ? pBoost * 0.85 : Math.min(pBoost * 0.5, 60); assumed.push(`${baseName} deployment (no ${baseName}-mode laps yet)`); }
  if (pNormal >= pBoost) { pNormal = pBoost * (Q ? 0.85 : 0.6); assumed.push(`${baseName} deployment (measured at or above boost, which can’t be right)`); }
  // what a race lap harvests: from racing laps (this race, the sprint) once there are a few, since you drive them differently
  const racing = perLap.filter(x => x.k === 'R' || x.k === 'SPR');
  const harvLogged = median((!Q && racing.length >= 3 ? racing : perLap).map(x => x.harv)) || 0; // kJ a lap, as logged
  const depMax = Math.max(0, ...perLap.map(x => x.dep));
  // kJ a lap the rules allow: what the game says (2026 format), else 4 MJ, or more if your laps showed more
  const gameLimit = median(laps.flatMap(L => (L.limit || []).filter(x => x > 0)));
  const depCap = Math.max(gameLimit || 4000, depMax); // what you actually deployed overrides a lower limit
  const storeMax = Math.max(4000, ...allErs);
  const startStore = median(perLap.map(x => x.start)) ?? storeMax / 2;
  // the lap: typical speed, throttle and brake per slice, and the outline
  const col = (f) => Array.from({ length: nb }, (_, i) => median(laps.map(L => L[f][i])));
  const spd = col('spd'), thr = col('thr'), brk = col('brk');
  const ownMap = E0.map?.some(Boolean) && mapExtent(E0.map) >= 200 ? E0.map : null;
  const map = ownMap || c.trackMaps?.[trackOf(round)]?.map || null;
  if (E0.map?.some(Boolean) && !ownMap) warn.push('Your car’s position came through as a single spot, so this game version sends it differently: there’s no track outline from these laps. Copy the diagnostics at the bottom and send them over so it can be fixed.');
  const vOf = (i) => Math.max(8, (spd[i] || 100) / 3.6), dtOf = (i) => bin / vOf(i);
  // what a lap can harvest: as logged, or more where the battery was full and turned some away
  const harvRoom = hW > 0 ? hE / hW * brk.reduce((a, b, i) => a + (brakeOk ? (b || 0) : thr[i] != null && thr[i] < 20 ? 100 : 0) * dtOf(i), 0) : 0;
  const harvest = Math.max(harvLogged, harvRoom);
  // straights: runs of full throttle (around the lap, across the line too), 160 m or longer
  const full = Array.from({ length: nb }, (_, i) => thr[i] >= 95 && (brakeOk ? brk[i] < 5 : true));
  for (let i = 0; i < nb; i++) if (!full[i] && full[(i - 1 + nb) % nb] && full[(i + 1) % nb]) full[i] = 'gap';
  const zones = []; const startAt = full.findIndex(x => !x);
  if (startAt >= 0) {
    let cur = null;
    // a flying lap ends at the line: a straight across it is two (the end of this lap, and the start), and nothing gained
    // after the line counts
    for (let n = 1; n <= nb; n++) { const i = (startAt + n) % nb; if (Q && i === 0 && cur) { zones.push(cur); cur = null; } if (full[i]) (cur ||= []).push(i); else if (cur) { zones.push(cur); cur = null; } }
    if (cur) zones.push(cur);
  }
  const Z = zones.filter(z => z.length * bin >= 160).map((bins, n) => ({ n, bins, from: bins[0] * bin, to: (bins[bins.length - 1] + 1) * bin, len: bins.length * bin, vIn: spd[bins[0]], vOut: spd[bins[bins.length - 1]] }));
  // the model: extra power accelerates the car (less so the faster it goes); drag takes some back
  const vTop = Math.max(...spd.filter(Boolean)) / 3.6;
  const pTot = (fmt2026 ? 700 : 740) * 1000; // W at the top of the longest straight
  const cd = pTot / vTop ** 3;
  // deployment at a given speed, per mode (kW): the measured band, else the nearest measured one, else the lap average
  const kWat = (m, kmh) => {
    const B = acc[m].band; const b0 = Math.floor((kmh || 0) / BAND);
    for (let d = 0; d < 20; d++) for (const b of [b0 - d, b0 + d]) { const o = B[b]; if (o && o.t >= 1) return o.e / o.t; }
    return m === ERS_BOOST ? pBoost : pNormal;
  };
  const pN = spd.map(v => kWat(BASE, v)), pB = spd.map(v => Math.max(kWat(ERS_BOOST, v), kWat(BASE, v)));
  const dPb = pB.map((b, i) => (b - pN[i]) * 1000); // W extra from boost, slice by slice
  // out of a slow corner the tyres can't put it all down: the extra power only fully counts from about 160 km/h
  const grip = (kmh) => Math.max(0.4, Math.min(1, ((kmh || 0) - 60) / 100));
  const curve = [...new Set([...Object.keys(acc[BASE].band), ...Object.keys(acc[ERS_BOOST].band)].map(Number))].sort((a, b) => a - b)
    .map(b => ({ from: b * BAND, n: acc[BASE].band[b]?.t >= 1 ? acc[BASE].band[b].e / acc[BASE].band[b].t : null, b: acc[ERS_BOOST].band[b]?.t >= 1 ? acc[ERS_BOOST].band[b].e / acc[ERS_BOOST].band[b].t : null }))
    .filter(x => x.n != null || x.b != null);
  // boost on slices j to k of a straight (to its end if k is left out): { t (s gained), e (extra kJ), dv (km/h at the
  // end of the straight) }. The speed it gains carries on down the rest of the straight, less what drag takes back.
  const gainOf = (bins, j, k2 = bins.length - 1) => {
    let dv = 0, t = 0, e = 0;
    bins.forEach((i, k) => { const v = vOf(i), dt = dtOf(i); const on = k >= j && k <= k2; dv += ((on ? dPb[i] * grip(spd[i]) : 0) / (ERS_MASS * v) - 2 * cd * v * dv / ERS_MASS) * dt; dv = Math.max(0, dv); t += dt * dv / v; if (on) e += dPb[i] * dt / 1000; });
    return { t, e, dv: dv * 3.6 };
  };
  // calibrate on your laps: the same straight with and without boost, speed at the end of it
  const ratios = [];
  for (const z of Z) {
    const share = (L) => z.bins.filter(i => L.mode[i] === ERS_BOOST).length / z.bins.length;
    const charged = (L) => z.bins.every(i => (L.ers[i] ?? 0) > 100); // a flat battery deploys nothing, boost or not
    // a tow from the car ahead flatters the speed, and so does DRS; from 2026 the straight-mode wing opens on every
    // straight for everyone, so there it says nothing and only the tow counts
    const flat = (L, i) => L.close?.[i] || (s.year < 2026 && L.drs?.[i]) || L.tow?.[i];
    const clean = (L) => z.bins.every(i => !flat(L, i));
    const end = z.bins[z.bins.length - 1];
    const on = laps.filter(L => share(L) >= 0.6 && charged(L) && clean(L) && L.spd[end] != null), off = laps.filter(L => share(L) <= 0.1 && charged(L) && clean(L) && L.spd[end] != null);
    if (!on.length || !off.length) continue;
    const meas = median(on.map(L => L.spd[end])) - median(off.map(L => L.spd[end]));
    const model = gainOf(z.bins, 0).dv;
    if (model > 1 && meas > 0) { z.measured = { dv: meas, laps: on.length + off.length }; z.ratio = meas / model; ratios.push(meas / model); }
  }
  const factor = ratios.length ? Math.max(0.25, Math.min(3, median(ratios))) : 1;
  // each straight on its own measurement where your laps have one (boost does more on some straights than the model
  // says, less on others), else the lap's
  for (const z of Z) z.factor = z.ratio ? Math.max(0.25, Math.min(3, z.ratio)) : factor;
  const ftTime = full.reduce((a, f, i) => a + (f === true ? dtOf(i) : 0), 0);
  const normalUse = full.reduce((a, f, i) => a + (f === true ? pN[i] * dtOf(i) : 0), 0); // kJ a lap in the base mode on every straight
  // the energy to spend on boost, beyond the base mode
  let budgetLap, extra, simStart = startStore, liveInfo = null;
  if (Q) {
    // a flying lap: everything the battery starts with plus what the lap harvests, to cross the line empty (the
    // in-lap recharges it), unless the per-lap deploy limit runs out first
    budgetLap = Math.min(depCap, startStore + harvest);
    extra = Math.max(0, budgetLap - normalUse);
    if (normalUse > budgetLap + 50) warn.push(`Hotlap on every straight already uses ${(normalUse / 1000).toFixed(2)} MJ, more than the lap allows (${(budgetLap / 1000).toFixed(2)} MJ: the battery you start with and what you harvest, up to the limit). There is nothing left for boost, and the battery runs low before the end of the lap.`);
  } else {
    // a race lap: what you harvest (so the battery holds over a stint), less normal deployment
    budgetLap = Math.min(harvest || normalUse, depCap);
    extra = Math.max(0, budgetLap - normalUse);
    if (live) {
      // the race so far: from the battery at the line, spread what's above the finishing reserve over the laps left
      const lapsLeft = Math.max(1, (live.totalLaps || 0) - (live.lap || 0) + 1);
      const prev = live.pack.laps.find(L => L.lap === live.lap - 1);
      const line = prev ? (prev.ers.filter(x => x != null).pop() ?? live.store) : live.store;
      const finish = storeMax * 0.05;
      const spare = line != null ? Math.max(0, line - finish) / lapsLeft : 0;
      const room = Math.max(0, depCap - normalUse); const before = extra;
      extra = Math.min(room, extra + spare);
      if (line != null) simStart = line;
      const trend = live.pack.laps.map(L => [L.lap, lapStart(L)]).filter(p => p[1] != null);
      liveInfo = { lap: live.lap, totalLaps: live.totalLaps, lapsLeft, line, finish, spare: extra - before, laps: liveLaps, trend, key: live.key };
    }
  }
  // choose: for each straight, no boost or one stretch of it, 60 m or longer (knapsack on energy steps). A stretch from
  // the corner exit buys the most: the speed it gains carries all the way down the straight, so long straights win
  const STEP = Q ? 10 : 5, cap = Math.floor(extra / STEP);
  const opts = Z.map(z => {
    const o = [{ j: null, t: 0, u: 0 }]; const n = z.bins.length; const step = n > 60 ? 2 : 1;
    for (let j = 0; j < n - 2; j += step) for (let k = j + 2; k < n; k += step) {
      const g = gainOf(z.bins, j, k); const u = Math.ceil(g.e / STEP); if (u > cap) break;
      o.push({ j, k, t: g.t * z.factor, u, e: g.e, dv: g.dv * z.factor });
    }
    return o;
  });
  // best time per energy budget after each straight, and which option got it (so the choice can be traced back)
  let bestT = new Float64Array(cap + 1); const choice = [];
  for (let zi = 0; zi < Z.length; zi++) {
    const nt = new Float64Array(cap + 1).fill(-1), ch = new Int32Array(cap + 1);
    for (let u = 0; u <= cap; u++) for (let oi = 0; oi < opts[zi].length; oi++) { const o = opts[zi][oi]; if (o.u > u) continue; const v = bestT[u - o.u] + o.t; if (v > nt[u]) { nt[u] = v; ch[u] = oi; } }
    bestT = nt; choice.push(ch);
  }
  const chosen = []; for (let zi = Z.length - 1, u = cap; zi >= 0; zi--) { const o = opts[zi][choice[zi][u]]; chosen[zi] = o; u -= o.u; }
  const setPlan = (z, j, k) => { const g = gainOf(z.bins, j, k); return { j, k, at: z.bins[j] * bin, to: (z.bins[k] + 1) * bin, len: (k - j + 1) * bin, t: g.t * z.factor, e: g.e, dv: g.dv * z.factor }; };
  Z.forEach((z, zi) => { const o = chosen[zi]; z.plan = o && o.j != null ? setPlan(z, o.j, o.k) : null; });
  // the battery over the lap with this plan: harvest under braking, base and boost deployment on the straights. If
  // it would run dry before the end of a straight (where it doesn't already without any boost), the boost that caused
  // it is shortened: the battery has to last to the braking point
  const brkW = brk.map((b, i) => (brakeOk ? (b || 0) : thr[i] != null && thr[i] < 20 ? 100 : 0) * dtOf(i)); const brkSum = brkW.reduce((a, b) => a + b, 0) || 1;
  const zoneOf = Array(nb).fill(null); Z.forEach(z => z.bins.forEach(i => { zoneOf[i] = z; }));
  let sim, qGain = null, endStore = null, capHit = false, lateHarvest = 0;
  {
    // What counts is the lap time. Running dry costs time (the deployment that can't happen, carried down the rest of
    // the straight), so a boost that empties the battery before the end of a straight stays only where it is still the
    // faster lap overall: say a big recharge zone straight after it refills the battery for the next straight. A flying
    // lap spends the lot (charge left at the line is wasted); a race lap has to cross the line with what it started
    // with (less what the race can spare), so the battery lasts the stint. The per-lap deploy limit stops deployment too.
    const endMin = Q ? -Infinity : simStart - (liveInfo?.spare || 0) - 20;
    const gk = new Map();
    const g = (z, j, k) => { const key = `${z.n}:${j}:${k}`; let v = gk.get(key); if (!v) gk.set(key, v = gainOf(z.bins, j, k)); return v; };
    const simQ = (plans) => {
      let st = simStart, dep = 0; const trace = [], short = new Float64Array(nb), flat = new Uint8Array(nb); // flat: short because the battery was empty (else the limit)
      for (let i = 0; i < nb; i++) {
        const z = zoneOf[i], p = z && plans[z.n]; const k = p ? z.bins.indexOf(i) : -1;
        st = Math.min(storeMax, st + (harvest || 0) * brkW[i] / brkSum);
        const want = (p && k >= p.j && k <= p.k ? pB[i] : full[i] === true ? pN[i] : 0) * dtOf(i);
        const got = Math.min(want, Math.max(0, st), Math.max(0, depCap - dep));
        if (got < want) flat[i] = st <= depCap - dep ? 1 : 0;
        st -= got; dep += got; short[i] = (want - got) / dtOf(i) * 1000; trace.push(Math.max(0, st));
      }
      return { trace, short, flat, dep };
    };
    // the time the missing deployment costs on each straight: the speed it would have given, carried to the braking point
    const lossOf = (short) => { let a = 0; for (const z of Z) { let dv = 0, t = 0; for (const i of z.bins) { const v = vOf(i), dt = dtOf(i); dv += (-short[i] * grip(spd[i]) / (ERS_MASS * v) - 2 * cd * v * dv / ERS_MASS) * dt; dv = Math.min(0, dv); t += dt * -dv / v; } a += t; } return a * factor; };
    const score = (plans) => { const r0 = simQ(plans); if (r0.trace[nb - 1] < endMin) return { v: -Infinity, sim: r0 }; let t = 0; for (const z of Z) { const p = plans[z.n]; if (p) t += g(z, p.j, p.k).t * z.factor; } return { v: t - lossOf(r0.short), sim: r0 }; };
    let plans = Object.fromEntries(Z.map(z => [z.n, z.plan ? { j: z.plan.j, k: z.plan.k } : null]));
    let cur = score(plans);
    if (cur.v === -Infinity) { plans = Object.fromEntries(Z.map(z => [z.n, null])); cur = score(plans); }
    // hill-climb: lengthen, shorten, start or drop a boost, one or three slices at a time, while the lap gets faster
    for (let n = 0; n < 600; n++) {
      let best = null;
      for (const z of Z) {
        const p = plans[z.n], len = z.bins.length; const tries = [];
        if (!p) tries.push({ j: 0, k: Math.min(2, len - 1) });
        else {
          for (const d of [1, 3]) { tries.push({ j: p.j, k: Math.min(len - 1, p.k + d) }, { j: Math.max(0, p.j - d), k: p.k }); if (p.k - d - p.j >= 2) tries.push({ j: p.j, k: p.k - d }); if (p.k - p.j - d >= 2) tries.push({ j: p.j + d, k: p.k }); }
          tries.push(null);
        }
        for (const q of tries) {
          if (q && p && q.j === p.j && q.k === p.k) continue;
          const next = { ...plans, [z.n]: q }; const sc = score(next);
          if (sc.v > (best?.sc.v ?? cur.v) + 1e-5) best = { next, sc };
        }
      }
      // a race lap has a fixed amount to spend: move it from one straight to another (60 m at a time)
      if (!Q) for (const a of Z) for (const b of Z) {
        const pa = plans[a.n], pb = plans[b.n]; if (a === b || !pb) continue;
        const na = pa ? { j: pa.j, k: Math.min(a.bins.length - 1, pa.k + 3) } : { j: 0, k: Math.min(2, a.bins.length - 1) };
        if (pa && na.k === pa.k) continue;
        const next = { ...plans, [a.n]: na, [b.n]: pb.k - pb.j - 3 >= 2 ? { j: pb.j, k: pb.k - 3 } : null }; const sc = score(next);
        if (sc.v > (best?.sc.v ?? cur.v) + 1e-5) best = { next, sc };
      }
      if (!best) break;
      plans = best.next; cur = best.sc;
    }
    Z.forEach(z => { const p = plans[z.n]; z.plan = p ? { ...setPlan(z, p.j, p.k), dry: z.bins.some(i => cur.sim.short[i] > 1 && cur.sim.flat[i]), capped: z.bins.some(i => cur.sim.short[i] > 1 && !cur.sim.flat[i]) } : null; });
    sim = cur.sim; endStore = sim.trace[nb - 1]; capHit = sim.dep >= depCap - 5;
    // what the last corners harvest after the final stretch of full throttle: too late in the lap to deploy
    const lastFull = full.lastIndexOf(true); lateHarvest = (harvest || 0) * brkW.slice(lastFull + 1).reduce((a, b) => a + b, 0) / brkSum;
    qGain = cur.v + lossOf(simQ(Object.fromEntries(Z.map(z => [z.n, null]))).short); // against the base mode everywhere (which may run dry too)
  }
  const planned = Z.filter(z => z.plan);
  const diag = ERS_RACE_KEYS.concat(ERS_QUALI_KEYS).map(k => w?.sessions?.[k]?.game?.ers?.diag).filter(Boolean).pop() || live?.pack?.diag || null;
  return { kind, base: BASE, laps, perLap, fallback, warn, modes, slices, bin, nb, length: E0.length, brakeOk, diag, curve, spd, thr, brk, full, map, zones: Z, planned,
    pBoost, pNormal, assumed, harvest, harvLogged, depMax, depCap, storeMax, startStore, simStart, normalUse, budgetLap, extra, factor, measuredZones: ratios.length, ftTime, live: liveInfo,
    endStore, capHit, lateHarvest, gain: qGain ?? planned.reduce((a, z) => a + z.plan.t, 0), boostUse: planned.reduce((a, z) => a + z.plan.e, 0), trace: sim.trace, sessions: [...new Set(laps.map(L => L.k))] };
}
/** The track map, coloured: the plan (boost zones from their start to the braking point) or what your laps did. */
function ersMapSvg(P, view, flip) {
  const pts = P.map; if (!pts || pts.filter(Boolean).length < P.nb * 0.6) return '<div class="empty">No track outline yet: it comes from your car’s position in practice.</div>';
  if (mapExtent(pts) < 200) return '<div class="empty">No track outline: your car’s position came through as a single spot.</div>';
  const xs = pts.filter(Boolean).map(p => p[0]), zs = pts.filter(Boolean).map(p => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
  const sc = 100 / Math.max(x1 - x0, z1 - z0, 1); const W = (x1 - x0) * sc + 8, H = (z1 - z0) * sc + 8;
  const at = (i) => { const p = pts[i]; if (!p) return null; const x = (p[0] - x0) * sc + 4; return [flip ? W - x : x, (p[1] - z0) * sc + 4]; };
  const seg = (from, to, cls, color) => { const list = []; const n = ((to - from + P.nb) % P.nb) + 1; for (let k = 0; k <= n; k++) { const q = at((from + k) % P.nb); if (q) list.push(q); } return list.length > 1 ? `<polyline class="${cls}" ${color ? `style="stroke:${color}"` : ''} points="${list.map(q => q.map(v => v.toFixed(1)).join(',')).join(' ')}"/>` : ''; };
  let body = seg(0, P.nb - 1, 'em-base');
  P.brk.forEach((b, i) => { if (P.brakeOk ? b >= 30 : P.thr[i] != null && P.thr[i] < 20) body += seg(i, i, 'em-brake'); });
  if (view === 'laps') {
    for (let i = 0; i < P.nb; i++) { const sh = P.laps.filter(L => L.mode[i] === ERS_BOOST).length / P.laps.length; if (sh > 0.05) body += seg(i, i, 'em-used', `color-mix(in srgb, var(--purple) ${Math.round(30 + sh * 70)}%, transparent)`); }
  } else {
    for (const z of P.zones) body += seg(z.bins[0], z.bins[z.bins.length - 1], 'em-straight');
    for (const z of P.planned) body += seg(z.bins[z.plan.j], z.bins[z.plan.k], 'em-boost');
    P.planned.forEach((z, k) => { const q = at(z.bins[z.plan.j]); if (q) body += `<g class="em-mark"><circle cx="${q[0].toFixed(1)}" cy="${q[1].toFixed(1)}" r="3.2"/><text x="${q[0].toFixed(1)}" y="${(q[1] + 1.2).toFixed(1)}">${k + 1}</text></g>`; });
  }
  const s0 = at(0); if (s0) body += `<circle class="em-line" cx="${s0[0].toFixed(1)}" cy="${s0[1].toFixed(1)}" r="1.8"/>`;
  return `<svg class="ers-map" viewBox="0 0 ${W.toFixed(1)} ${H.toFixed(1)}">${body}</svg>`;
}
/** Current Weekend: an ERS panel. kind 'race': where to boost in the race (live while you drive it); 'quali': the flying lap. */
function ersPanel(c, s, r, kind = 'race') {
  const Q = kind === 'quali';
  const head = (extra = '') => `<div class="panel-h"><h2>${Q ? 'Qualifying deployment' : 'ERS: where to boost'}</h2>${extra}</div>`;
  const P = ersPlan(c, s, r, kind);
  if (P?.stale && !P.none) return `<div class="panel">${head()}<div class="panel-b muted" style="font-size:13px">The ERS data for ${esc(r.name)} was logged before 2.0.12, which read the 2026-format packets wrongly, so it isn’t used. Run another practice session (or the sprint) and the profile builds from that.</div></div>`;
  if (!P || P.none) return `<div class="panel">${head()}<div class="panel-b muted" style="font-size:13px">${Q
    ? `No flying laps for ${esc(r.name)} yet. Drive flying laps in hotlap mode, with boost where you like, in practice or qualifying with telemetry on. Every lap mostly in hotlap or boost counts: Pitwall measures what each mode really deploys from your car and maps the best places to boost on top of hotlap.`
    : `No ERS data for ${esc(r.name)} yet. Do your long runs in practice (or race the sprint) with telemetry on, using normal deployment and boost as you see fit. Pitwall follows your car only, measures what boost really costs and what you harvest, and maps the best places to use it. In the race it keeps learning from your laps and adapts the plan as you go.`}</div></div>`;
  const vk = Q ? 'ersViewQ' : 'ersView';
  const view = ui[vk] || 'plan'; const tid = trackOf(r); const flip = !!c.ersFlip?.[tid];
  const base = ERS_MODE_NAME[P.base]; const Base = base[0].toUpperCase() + base.slice(1);
  const m = (m) => P.modes[m] ? Math.round(P.modes[m] / P.slices * 100) : 0;
  const other = Object.keys(P.modes).map(Number).filter(x => x !== P.base && x !== ERS_BOOST).reduce((a, x) => a + m(x), 0);
  const km = (x) => `${(x / 1000).toFixed(2)} MJ`;
  const rows = P.planned.map((z, k) => `<tr><td class="num"><b>${k + 1}</b></td><td><b>${Math.round(z.plan.at)} m</b> → ${Math.round(z.plan.to)} m <span class="muted">(${Math.round(z.plan.len)} m of the ${Math.round(z.len)} m straight)</span>${z.plan.trimmed ? ' <span class="tag" title="Cut short so the battery lasts to the end of the straight">shortened</span>' : ''}${z.plan.capped ? ' <span class="tag" title="The per-lap deploy limit runs out on this straight: still the faster lap, since the boost before it gains more than the deployment lost">limit</span>' : ''}${z.plan.dry ? ' <span class="tag" title="The battery empties before the end of this straight. It is still the faster lap: the boost before it gains more than the deployment lost after it, and the battery recharges in the braking zone that follows.">runs out</span>' : ''}</td><td class="num">${Math.round(z.plan.e)} kJ</td><td class="num">+${z.plan.dv.toFixed(1)} km/h</td><td class="num"><b>${z.plan.t.toFixed(3)} s</b></td></tr>`).join('');
  const stints = !Q && P.perLap.length ? (() => { const d = median(P.perLap.map(x => (x.end ?? 0) - (x.start ?? 0))); return d == null ? '' : d < -150 ? `Your laps drained the battery by about ${Math.round(-d)} kJ a lap: over a stint it runs dry.` : d > 150 ? `Your laps gained about ${Math.round(d)} kJ a lap: there was charge to spare.` : 'Your laps kept the battery about level.'; })() : '';
  const L = P.live;
  const liveStrip = L ? `<div class="panel-b ers-live" style="border-bottom:1px solid var(--line)">
      <div class="row" style="gap:8px;flex-wrap:wrap"><span class="tag live">Live</span><b>${L.key === 'SPR' ? 'Sprint' : 'Race'} · lap ${L.lap}${L.totalLaps ? ` of ${L.totalLaps}` : ''}</b><span class="muted" id="ers-live-now">${liveNowHtml(liveErs)}</span></div>
      <p class="muted" style="font-size:12px;margin:6px 0 0">The plan below is for this lap on. ${L.line != null ? `You crossed the line with ${km(L.line)} in the battery and ${plural(L.lapsLeft, 'lap')} to go: ${L.spare > 5 ? `${Math.round(L.spare)} kJ a lap above what you harvest can go on boost and still leave ${km(L.finish)} at the flag` : 'there’s no charge to spare above the finishing reserve, so boost comes only from what you harvest'}.` : ''} ${L.laps ? `${plural(L.laps, 'racing lap')} of this race measure your car so far (not the start, stops or laps behind the safety car).` : 'From the next lap your race laps join the measurements.'}</p>
      ${L.trend.length >= 2 ? `<div class="label" style="margin-top:8px">Battery at the line, lap by lap</div>${svgChart([{ color: 'var(--green)', dots: true, pts: L.trend.map(([n, v]) => [n, v / 1000]) }, ...(L.totalLaps && L.line != null ? [{ color: 'var(--silver)', dashed: true, pts: [[L.lap, L.line / 1000], [L.totalLaps + 1, L.finish / 1000]] }] : [])], { h: 100, yFmt: (v) => v.toFixed(1) + ' MJ' })}<div class="chart-legend"><span><i style="background:var(--green)"></i>Battery starting each lap</span><span><i style="background:var(--silver)"></i>Spending what’s spare by the flag</span></div>` : ''}
    </div>` : '';
  const from = P.sessions.filter(k => !(L && k === L.key && !s.weekends[r.id]?.sessions?.[k]?.game?.ers)).map(k => SESSION_SHORT[k] || k);
  return `<div class="panel">${head(`<div class="row" style="gap:6px"><div class="seg">${[['plan', 'Plan'], ['laps', 'Your laps']].map(([v, l]) => `<button data-act="ers-view" data-k="${vk}" data-v="${v}" class="${view === v ? 'on' : ''}">${l}</button>`).join('')}</div><button class="btn sm ghost" data-act="ers-flip" data-track="${tid}" title="Mirror the map if it comes out back to front">Flip map</button></div>`)}
    ${liveStrip}
    ${P.warn.map(x => `<div class="panel-b"><div class="callout">${esc(x)}</div></div>`).join('')}
    <div class="panel-b ers-grid">
      <div>${ersMapSvg(P, view, flip)}
        ${P.trace?.length ? `<div class="label" style="margin-top:8px">Battery over ${Q ? 'the flying lap' : 'a lap'} with the plan</div>${svgChart([{ color: 'var(--green)', pts: P.trace.map((v, i) => [i * P.bin, v / 1000]) }], { h: 110, yFmt: (v) => v.toFixed(1) + ' MJ', xLabel: 'm' })}` : ''}
        <div class="chart-legend">${view === 'laps' ? '<span><i style="background:var(--purple)"></i>Where you used boost (stronger: more of your laps)</span>' : `<span><i style="background:var(--green)"></i>Boost</span><span><i style="background:var(--silver)"></i>Full throttle (${base})</span>`}<span><i style="background:var(--red)"></i>Braking</span><span><i style="background:var(--fg);border-radius:50%;width:6px;height:6px"></i>Start line</span></div></div>
      <div class="stack" style="gap:10px">
        <div class="tiles ers-tiles">
          <div class="tile"><span class="label">Gain from the plan</span><span class="v">${P.gain.toFixed(2)}<small> s${Q ? '' : ' / lap'}</small></span><span class="muted" style="font-size:12px">against ${base} deployment everywhere${Q ? ', on a flying lap' : ''}</span></div>
          <div class="tile"><span class="label">Boost energy</span><span class="v">${Math.round(P.boostUse)}<small> kJ${Q ? '' : ' / lap'}</small></span><span class="muted" style="font-size:12px">of ${Math.round(P.extra)} kJ ${Q ? 'the lap allows beyond hotlap' : 'to spare'}</span></div>
        </div>
        ${P.planned.length ? `<div class="table-wrap"><table><thead><tr><th class="num">#</th><th>Boost from → to</th><th class="num">Energy</th><th class="num">Speed</th><th class="num">Gain</th></tr></thead><tbody>${rows}</tbody></table></div>`
          : `<div class="muted" style="font-size:13px">${Q ? 'No boost fits: hotlap on every straight already uses all the energy the lap allows.' : L ? 'No boost fits right now: normal deployment uses everything you harvest, and there’s no charge to spare above what you need at the flag.' : 'No boost fits: on these laps normal deployment already uses everything you harvest. Boost now would only drain the battery over a stint.'}</div>`}
        <p class="muted" style="font-size:12px;margin:0">Distances are from the start line. ${Q
          ? `Run hotlap everywhere and boost from the first distance to the second. Start the flying lap with the battery charged: the plan assumes the ${km(P.startStore)} your flying laps started with. It spends the lot: charge left at the line is wasted (the in-lap recharges it), so the boost grows until you cross the line ${P.endStore != null && P.endStore < 50 ? 'empty' : `with ${km(P.endStore || 0)} left: ${P.capHit ? 'the per-lap deploy limit runs out first' : P.endStore <= P.lateHarvest + 50 ? 'what the last corners harvest after the final straight, too late to use' : 'boosting more anywhere would only lose time'}`}. The battery only runs out before the end of a straight where that is still the faster lap (“runs out”): when a big recharge zone follows, say.`
          : `Boost from the first distance to the second, then back to normal. Over the lap you harvest what you spend${L ? ' (plus what the race can spare)' : ''}, so the battery lasts the stint, but it may run out before the end of a straight where that is still the faster lap (“runs out”): when a big recharge zone follows and refills it for the next straight, say.`}</p>
      </div>
    </div>
    <div class="panel-b" style="border-top:1px solid var(--line)"><span class="label">Measured on your car</span>
      <div class="ers-facts">
        <div><b>${Math.round(P.pBoost)} kW</b><span>boost drain on full throttle</span></div>
        <div><b>${Math.round(P.pNormal)} kW</b><span>${base} deployment</span></div>
        <div><b>${km(P.harvest)}</b><span>a lap can harvest${P.harvest > P.harvLogged + 50 ? ` (${km(P.harvLogged)} logged: a full battery turns the rest away)` : ''}</span></div>
        <div><b>${km(P.normalUse)}</b><span>${base} mode uses a lap</span></div>
        <div><b>${km(P.depMax)}</b><span>most deployed in a lap (limit ${km(P.depCap)})</span></div>
        <div><b>${km(P.startStore)}</b><span>battery ${Q ? 'starting a flying lap' : 'at the line'}, of ${km(P.storeMax)}</span></div>
      </div>
      ${P.curve?.length ? `<div class="ers-curve"><span class="label">Deployment by speed (kW, on full throttle with charge)</span><div class="table-wrap"><table><thead><tr><th>Speed</th>${P.curve.map(x => `<th class="num">${x.from}</th>`).join('')}</tr></thead><tbody>
        <tr><td>${Base}</td>${P.curve.map(x => `<td class="num">${x.n != null ? Math.round(x.n) : '–'}</td>`).join('')}</tr>
        <tr><td>Boost</td>${P.curve.map(x => `<td class="num">${x.b != null ? Math.round(x.b) : '–'}</td>`).join('')}</tr></tbody></table></div></div>` : ''}
      <p class="muted" style="font-size:12px;margin:8px 0 0">${Q
        ? `${plural(P.laps.length, 'flying lap')} from ${listJoin(from)} (laps mostly in hotlap or boost on full throttle); on them you were in hotlap ${m(ERS_HOTLAP)}% and boost ${m(ERS_BOOST)}% of the time${other ? `, and in other modes ${other}%` : ''}.`
        : `${plural(P.laps.length - (L?.laps || 0), 'lap')}${from.length ? ` from ${listJoin(from)}` : ''}${P.fallback ? ' (no long runs yet, so every full lap)' : ', your long runs'}${L?.laps ? ` and ${plural(L.laps, 'lap')} of this race` : ''}; at full throttle you were in normal ${m(ERS_NORMAL)}% and boost ${m(ERS_BOOST)}% of the time${other ? `, and in other modes ${other}% (left out)` : ''}. ${stints}`}
        Time gained is modelled, ${P.measuredZones ? `and scaled by your own laps on ${plural(P.measuredZones, 'straight')} driven both with and without boost (straights ${s.year >= 2026 ? 'within a second of the car ahead' : 'with DRS open or within a second of the car ahead'} left out) (×${P.factor.toFixed(2)})` : `not yet checked against your laps: drive some straights with boost and some in ${base} and it will be`}.${P.assumed.length ? ` Assumed, not measured: ${listJoin(P.assumed)}.` : ''}</p>
    </div>
    ${P.diag && !Q ? `<div class="panel-b" style="border-top:1px solid var(--line)"><details><summary class="muted" style="font-size:12px;cursor:pointer">Diagnostics</summary>
      <p class="muted" style="font-size:12px">Packet format ${esc(String(P.diag.format))}, your car is index ${P.diag.player}. Packet sizes: ${Object.entries(P.diag.lens || {}).map(([k, v]) => `${({ 0: 'motion', 2: 'lap data', 6: 'car telemetry', 7: 'car status' })[k] || k} ${v} bytes`).join(', ')}. If the ERS readings look wrong, copy these (a few raw packets from your car) and send them over.</p>
      <button class="btn sm" data-act="ers-diag" data-round="${r.id}">Copy diagnostics</button></details></div>` : ''}
  </div>`;
}
