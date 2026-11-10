/* Pitwall — Simulated seasons, real-driver careers. Part of the renderer, split into files that load in order (see index.html). */
'use strict';
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
  for (const t of Object.keys(lineup)) for (const d of [...lineup[t]]) if (d && d !== PLAYER_ID && !isLegend(c, d) && (turnsIn(c, d, year) ?? 0) >= RETIRE_AGE) leave(d, 'retire'); // (a legend brought back stays)
  if (winters >= 3) {
    // retirement: from the mid-thirties, rising every year (drivers on your grid stay to race it)
    for (const t of Object.keys(lineup)) for (const d of [...lineup[t]]) {
      if (!d || locked(d) || want[d] || isLegend(c, d)) continue;
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

/*
  Next season's teams. A season with real data can start from its real grid (teams and line-ups) or keep the teams the
  last season ended with (c.gridMode[year] = 'real' | 'keep'): F1 25 never moves on to 2026's grid, so from 2026 the
  default is to keep them; up to 2025 (a career that starts in a past year) it's the real grid, and a Real Season or a
  real driver's career always follows it. Teams can be added or taken off either way (c.teamEdits[year] = { add, remove }:
  an old team from F1's history or one of c.customTeams). The calendar still comes from real life where there is one.
*/
function gridMode(c, year) {
  if (c?.realSeason || realDriverOf(c)) return 'real';
  return c?.gridMode?.[year] || (year <= 2025 ? 'real' : 'keep');
}
const followsReal = (c, year) => !!templateFor(year, c) && gridMode(c, year) === 'real';
/** Teams added to or taken off a season's grid: an added team starts with two empty seats. */
function applyTeamEdits(c, year, teams) {
  const E = c?.teamEdits?.[year]; if (!E) return;
  for (const id of E.remove || []) { const k = teams.findIndex(t => t.id === id); if (k >= 0 && id !== MYTEAM) teams.splice(k, 1); }
  for (const id of E.add || []) if (!teams.some(t => t.id === id)) { const m = teamMeta(c, id); teams.push({ id, name: m.name, color: m.color, drivers: [null, null] }); }
}

/** Build the roster a season starts from, before the player is placed. */
function baseRoster(c, index, prev) {
  let out;
  const year = prev ? prev.year + 1 : c.startYear;
  const tpl0 = templateFor(year, c); const real = !prev || followsReal(c, year);
  const tpl = real ? tpl0 : null; // (kept teams: the real grid is left out, the real calendar isn't)
  if (!tpl && prev) {
    const teams = clone(prev.teams);
    const drivers = clone(prev.drivers);
    // put back the driver the player replaced last year, then take the player out
    for (const t of teams) {
      const i = t.drivers.indexOf(PLAYER_ID);
      if (i >= 0) t.drivers[i] = prev.benched && drivers[prev.benched] ? prev.benched : null;
    }
    out = { teams, drivers, calendar: tpl0 ? tpl0.cal.map(([id, name, venue, sprint, track, date]) => ({ id, name, venue, sprint, off: false, ...(track ? { track } : {}), ...(date ? { date } : {}) })) : clone(prev.calendar).map(r => ({ ...r })) };
    // past the real data nothing is predicted: the grid carries over with the moves you confirmed (applied below), as
    // the Next Season tab shows it
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
  applyTeamEdits(c, year, out.teams);
  // your career's driver market carries over: moves signed for next season, and (onto a fresh real grid) last year's
  // moves too. Real seasons' moves are already in the real grid. (Your own moves aren't replayed here: you are placed
  // in your seat when the season starts.)
  for (const tr of prev && !isHist(prev) ? prev.transfers || [] : []) {
    if (tr.real && tpl) continue; // a real move: next year's real grid already has it
    if (tr.effective === 'next' || (tpl && tr.effective === 'now')) for (const m of tr.steps) if (m.driver !== PLAYER_ID) applyMove(c, out.teams, out.drivers, m);
  }
  if (c.type === 'myteam') { const t = out.teams.find(x => x.id === MYTEAM); if (t) Object.assign(t, myTeamRow(c), { drivers: t.drivers }); }
  if (c.nextCal?.[year]) out.calendar = clone(c.nextCal[year]).map(r => ({ ...r, off: false })); // the calendar you laid out on the Next Season tab
  return out;
}

/** One link of a transfer chain: the driver leaves their seat and takes one at `to` (or leaves the grid). */
function applyMove(c, teams, drivers, m) {
  // a new contract: nothing changes, unless the driver had left the grid (a retirement taken back), when they go back in
  if (m.kind === 'extend') { if (teams.some(t => t.drivers.includes(m.driver))) return; m = { ...m, kind: 'move', replaces: null }; }
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
  if (realDriverOf(c)) { PLAYER = c.realDriver; return; }
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

/* ------------------------------------------------------ real-driver careers */
// A Driver Career can follow a real driver (F1 25 mods let you start in 2016 as anyone). You are that driver: Pitwall
// follows them as "you", every season starts on the real grid, and their real moves happen as the season reaches
// them, along with everyone else's: Verstappen starts 2016 at Toro Rosso and swaps with Kvyat for the fifth race.
// Real data runs to 2025; 2026 starts on F1 25's grid, and after that each season starts with the confirmed transfers only.
/** Every race's real line-ups for a year (cached), and the races where any of them changed. */
const _lineups = {};
const realLineups = (y) => _lineups[y] ||= (H.seasons[y]?.rounds || []).map((_, k) => lineupAt(y, k));
const realChanges = (y) => { const L = realLineups(y); const key = (x) => JSON.stringify(Object.keys(x).sort().map(t => [t, [...x[t]].sort()])); return L.map((x, k) => k && key(x) !== key(L[k - 1]) ? k : null).filter(k => k != null); };
/** The real driver this career follows, if any. */
const realDriverOf = (c) => c?.type === 'driver' && c.realDriver ? c.realDriver : null;
/** A real driver's path: [{ year, team, from (round index, 0 = the start) }], from a year to 2026. */
function realPath(id, from) {
  const out = [];
  for (let y = from; y <= HIST_TO; y++) {
    const h = H.seasons[y]; if (!h) continue;
    const at = [0, ...realChanges(y)];
    let last = null;
    for (const k of at) {
      const L = realLineups(y)[k]; const tid = Object.keys(L).find(t => L[t].includes(id)) || null;
      if (tid !== last) { out.push({ year: y, team: tid, teamName: h.teams.find(t => t.id === tid)?.name || null, from: k, round: h.rounds[k]?.name }); last = tid; }
    }
  }
  const t26 = D.GRID_2026.find(t => t.drivers.includes(id));
  if (from <= 2026) out.push({ year: 2026, team: t26?.id || null, teamName: t26?.name || null, from: 0 });
  return out;
}
/**
 * Apply the real mid-season moves a played season has reached: a move from race k happens once race k - 1 is logged.
 * Each team's line-up at a race is the real one (drivers who stood in for three races or fewer count as the regular),
 * and every change goes on record as a transfer, so the stories, the team history and race-by-race teams all follow.
 * Returns true if anything moved.
 */
function applyRealMoves(c, s) {
  if (!realDriverOf(c) || !s || isHist(s) || !H.seasons[s.year]) return false;
  const y = s.year; const rs = H.seasons[y].rounds;
  const points = realChanges(y);
  const done = roundsDone(s); s.realMoves ||= [];
  let moved = false;
  for (const k of points) {
    if (k > done || s.realMoves.includes(k)) continue;
    s.realMoves.push(k);
    const before = realLineups(y)[k - 1], after = realLineups(y)[k];
    const teamIn = (L, d) => Object.keys(L).find(t => L[t].includes(d)) || null;
    const steps = [];
    for (const [tid, ds] of Object.entries(after)) for (const d of ds) {
      const from = teamIn(before, d); if (from === tid) continue;
      steps.push({ kind: 'move', driver: d, from, to: tid, replaces: (before[tid] || []).find(x => !ds.includes(x)) || null, until: null, prevUntil: null, wasPending: false });
    }
    for (const [tid, ds] of Object.entries(before)) for (const d of ds) if (!teamIn(after, d)) steps.push({ kind: 'move', driver: d, from: tid, to: 'free', replaces: null, until: null, prevUntil: null, wasPending: false });
    // you are never dropped mid-season: if real life took your driver out of the car, they keep it (and whoever came
    // in for them doesn't); they're back in step when real life puts them back
    const me = realDriverOf(c); const out = steps.find(m => m.driver === me && m.to === 'free');
    if (out) {
      const myTeam = out.from; const newcomers = new Set(steps.filter(m => m.to === myTeam && !(before[myTeam] || []).includes(m.driver)).map(m => m.driver));
      for (let x = steps.length - 1; x >= 0; x--) if (steps[x] === out || newcomers.has(steps[x].driver) && steps[x].to === myTeam) steps.splice(x, 1);
      toast(`In real life ${dName(s, me)} lost the seat from round ${k + 1}. In your career, you keep it.`);
    }
    if (!steps.length) continue;
    for (const m of steps) {
      if (!s.drivers[m.driver]) { const e = driverEntry(c, m.driver) || (H.seasons[y].drivers[m.driver] && { id: m.driver, name: H.seasons[y].drivers[m.driver][0], abbr: H.seasons[y].drivers[m.driver][2], number: H.seasons[y].drivers[m.driver][1] }); if (e) s.drivers[m.driver] = e; }
      applyMove(c, s.teams, s.drivers, m);
    }
    (s.transfers ||= []).push({ id: `realp-${y}-${k}`, at: k, effective: 'now', createdAt: new Date(Date.parse(rs[k - 1].date) + 864e5).toISOString(), steps, real: true, before: null });
    const mine = steps.find(m => m.driver === realDriverOf(c));
    if (mine && mine.to !== 'free') { s.playerTeamId = mine.to; toast(`${dName(s, mine.driver)} moves to ${s.teams.find(t => t.id === mine.to)?.name || mine.to} from round ${k + 1}${rs[k] ? ` (${rs[k].name})` : ''}`); }
    moved = true;
  }
  return moved;
}
/** Put a real driver who isn't on a season's grid into a seat (they missed that season in real life). */
function placeReal(s, c, teamId, seatDriverId) {
  const id = realDriverOf(c); const team = s.teams.find(t => t.id === teamId) || s.teams[s.teams.length - 1];
  let i = team.drivers.indexOf(seatDriverId); if (i < 0) i = team.drivers.findIndex(d => !d); if (i < 0) i = 1;
  s.benched = team.drivers[i] || null; team.drivers[i] = id;
  if (!s.drivers[id]) s.drivers[id] = driverEntry(c, id) || { id, name: anyName(id), abbr: id, number: null };
  s.playerTeamId = team.id;
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
  else if (realDriverOf(c)) { const on = s.teams.find(t => t.drivers.includes(c.realDriver)); if (on) s.playerTeamId = on.id; else placeReal(s, c, teamId, seatDriverId); }
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
