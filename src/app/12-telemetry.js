/* Pitwall — Results from F1 25. Part of the renderer, split into files that load in order (see index.html). */
'use strict';
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
  // what a contact between two cars led to: { dmg: [ids damaged], out: id retired } (from 3.0; older races have neither)
  const effect = (A, B, t) => { const x = (r.collisions || []).find(o => ((map[o.a] === A && map[o.b] === B) || (map[o.a] === B && map[o.b] === A)) && (t == null || Math.abs(o.t - t) < 20)); return x?.dmg ? { dmg: x.dmg.map(i => map[i]).filter(Boolean), out: map[x.out] || null } : {}; };
  for (const p of r.penaltyEvents || []) {
    if (!COLLISION_INFR.includes(p.infringement) || !map[p.car] || !map[p.other] || p.car === p.other) continue;
    const major = p.infringement === 3 || p.type !== WARNING;
    if (out.some(x => x.a === map[p.car] && x.b === map[p.other] && Math.abs((x.t ?? -99) - (p.t ?? 99)) < 20)) continue;
    out.push({ lap: p.lap || 0, a: map[p.car], b: map[p.other], major, pen: p.type === WARNING ? 'a warning' : p.type === 4 ? `a ${p.time}-second penalty` : `a ${PENALTY_NAMES[p.type] || 'penalty'}`, t: p.t ?? null, ...effect(map[p.car], map[p.other], p.t) });
  }
  for (const x of r.collisions || []) {
    const A = map[x.a], B = map[x.b]; if (!A || !B) continue;
    // already judged by the stewards
    if (out.some(o => ((o.a === A && o.b === B) || (o.a === B && o.b === A)) && (o.t == null || Math.abs(o.t - x.t) < 20))) continue;
    if (out.some(o => !o.pen && ((o.a === A && o.b === B) || (o.a === B && o.b === A)) && Math.abs(o.lap - x.lap) <= 1)) continue;
    const known = x.posA && x.posB && x.posA !== x.posB;
    const [a, b] = known && x.posA < x.posB ? [B, A] : [A, B]; // the car behind
    out.push({ lap: x.lap || 0, a, b, major: false, pen: null, noFault: !known, t: x.t, ...(x.dmg ? { dmg: x.dmg.map(i => map[i]).filter(Boolean), out: map[x.out] || null } : {}) });
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
  const out = []; const k = inc.major || inc.dmg?.length || inc.out ? 1 : 0;
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
/**
 * One contact story a weekend (sprint and race together). Heavy contact comes first (a penalty, or a car out within a
 * lap of it), then contact between championship rivals, then any other. Several heavy ones, or several between rivals,
 * share the story; from the rest, one is picked. The story goes with the race it happened in (the Grand Prix if both).
 */
function incidentStories(c, s, i, r, key, sd, h) {
  const W = s.weekends[r.id]?.sessions || {};
  const all = ['SPR', 'R'].flatMap(k => (W[k]?.done ? W[k].game?.incidents || [] : []).map(inc => ({ inc, k, sd: W[k] })));
  if (!all.length) return [];
  const heavy = (x) => (x.inc.pen && x.inc.pen !== 'a warning') || !!x.inc.out;
  const st = rivalsAt(c, s, i - 1); const pairs = new Set(st.active.filter(p => p.kind === 'driver').map(p => pairKey(p.a, p.b)));
  for (const [id, a] of Object.entries(st.arch.driver || {})) pairs.add(pairKey(id, a.rival));
  const rivals = (x) => pairs.has(pairKey(x.inc.a, x.inc.b));
  let tier = all.filter(heavy), why = 'heavy';
  if (!tier.length) { tier = all.filter(rivals); why = 'rivals'; }
  if (!tier.length) { tier = [choose(seeded(`${s.index}-${r.id}-inc`), all)]; why = 'other'; }
  tier.sort((p, q) => (!!q.inc.out - !!p.inc.out) || (p.k === q.k ? p.inc.lap - q.inc.lap : p.k === 'SPR' ? -1 : 1));
  const home = tier.some(x => x.k === 'R') ? 'R' : 'SPR'; if (key !== home) return [];
  const lead = tier[0]; const inc = lead.inc; const lsd = lead.sd;
  const pos = (x, d) => { const k = x.sd.results.findIndex(y => y.d === d); return k < 0 ? null : OUT.includes(x.sd.results[k].st) ? x.sd.results[k].st : ordWord(k + 1); };
  const gp = r.name; const sprint = key === 'SPR'; const rnd = seeded(`${s.index}-${r.id}-inc`);
  const after = (x) => [x.inc.a, x.inc.b].map(d => `${h.last(d)} ${pos(x, d) && OUT.includes(pos(x, d)) ? (x.inc.out === d ? 'retired with the damage' : 'did not finish') : `${x.inc.dmg?.includes(d) ? 'carried the damage home to ' : 'finished '}${pos(x, d)}`}`);
  const where = (x) => all.some(y => y.k !== x.k) ? (x.k === 'SPR' ? ' in the sprint' : ' in the Grand Prix') : '';
  let headline, standfirst;
  if (tier.length > 1) {
    const who = listJoin([...new Set(tier.flatMap(x => [x.inc.a, x.inc.b]))].map(h.last));
    headline = why === 'rivals' ? choose(rnd, [`Title rivals collide: contact for ${who} in ${gp}`, `Elbows out among the title rivals in ${gp}`]) : choose(rnd, [`A bruising weekend in ${gp}: contact for ${who}`, `${gp}: ${numWord(tier.length)} clashes that left their mark`]);
    const pens = tier.filter(x => x.inc.pen && x.inc.pen !== 'a warning');
    const touches = listJoin(tier.map(x => `${h.last(x.inc.a)} and ${h.last(x.inc.b)}${x.inc.lap ? ` on lap ${x.inc.lap}` : ''}${where(x)}`));
    standfirst = `There was contact between ${touches}.${pens.length ? ` ${pens.map(x => incidentLine(x.inc, h.last)).join(' ')}` : ' The stewards took no action on any of it.'}`;
  } else {
    headline = inc.noFault ? choose(rnd, [`Contact between ${h.last(inc.a)} and ${h.last(inc.b)} in ${gp}`, `${h.last(inc.a)} and ${h.last(inc.b)} tangle${sprint ? ' in the sprint' : ''}`])
      : inc.pen && inc.pen !== 'a warning' ? choose(rnd, [`${h.last(inc.a)} penalised for clash with ${h.last(inc.b)}`, `Stewards hand ${h.last(inc.a)} ${inc.pen} after contact with ${h.last(inc.b)}`])
      : inc.out ? `${h.last(inc.a)} and ${h.last(inc.b)} collide in ${gp}` : choose(rnd, [`${h.last(inc.a)} and ${h.last(inc.b)} touch in ${gp}`, `A brush between ${h.last(inc.a)} and ${h.last(inc.b)}${sprint ? ' in the sprint' : ''}`]);
    standfirst = incidentLine(inc, h.last).replace(/\.$/, where(lead) + '.') + ` ${listJoin(after(lead))}.`;
  }
  return [{ id: `${s.index}-${r.id}${key}inc0`, seq: i * 10 + (sprint ? 2 : 4) + 0.5, kind: 'incident', i, r, replay: { k: key, lap: inc.lap, ds: [inc.a, inc.b] }, subject: inc.b, outlet: choose(rnd, D.OUTLETS), kicker: why === 'heavy' && inc.pen ? 'Stewards' : 'Contact',
    headline, standfirst, body: tier.length > 1 ? [listJoin(after(lead)) + '.'] : [], quotes: incidentQuotes(c, inc, h.last, rnd) }];
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
    let id = car.idx === r.player && grid.includes(PLAYER_ID) && !isPrincipal(c) ? PLAYER_ID : car.idx === r.player && realDriverOf(c) && grid.includes(c.realDriver) ? c.realDriver : null;
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
        // a lapped car is shown laps down: the game's gap to the leader for it isn't the real gap (it jumps about)
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
/** The whole field in a three-part qualifying: Q1 has every car (later parts only the cars still running). */
const qualiField = (s, parts) => Math.max(...Object.values(parts).map(p => p.length), parts[1] ? 0 : gridIds(s).length);
/**
 * A three-part qualifying's results from its parts. Whoever was knocked out keeps their place, and every driver's best
 * lap is their quickest in any part (a Q1 lap quicker than their Q2 one counts). Places above the last part that was
 * timed are provisional: pole improves on that part's best, the gaps follow season pace, and the starting grid later
 * puts the drivers in order.
 */
function qualiFromParts(s, round, key, game) {
  const parts = game.parts;
  const rows = mergeQuali(parts, qualiField(s, parts));
  game.provisional = rows.filter(x => x.lock === 'place').length;
  if (game.provisional) {
    // the parts after this one weren't timed: a quicker pole, and gaps from each driver's season pace
    const latest = Math.max(...Object.keys(parts).map(Number));
    const best = Math.min(...parts[latest].map(x => x.best).filter(Boolean));
    if (isFinite(best) && latest < 3) {
      game.pole = Math.round(provisionalPole(best, latest, mulberry(`${round.id}-${key}-pole-${game.key}`)));
      const tt = provisionalTimes(s, rows.slice(0, game.provisional).map(x => x.d), game.pole, `${round.id}-${key}-merge`);
      tt.forEach((v, i) => { rows[i].best = v; });
    }
  }
  for (const x of rows) if (x.lock === 'driver') {
    const laps = Object.values(parts).flatMap(p => p.filter(y => y.d === x.d && y.best).map(y => y.best));
    if (laps.length) x.best = Math.min(...laps);
  }
  game.placeTimes = rows.slice(0, game.provisional).map(x => x.best);
  game.locks = Object.fromEntries(rows.map(x => [x.d, x.lock]));
  return qualiRows(rows, gridIds(s));
}
/**
 * Older versions lost the drivers knocked out in Q1 and Q2 once a later part came in (they showed as DNS, with no
 * time). The parts were always kept, so those sessions are rebuilt from them, and put in grid order again if the race
 * already set it. Returns true if anything changed.
 */
/** Races logged before 3.1 gave lapped cars the game's gap to the leader, which isn't a real gap: they go back to laps down. */
function repairLappedGaps(c) {
  let changed = false;
  for (const s of c.seasons) for (const w of Object.values(s.weekends || {})) for (const [k, sd] of Object.entries(w.sessions || {})) {
    const fin = sd?.game?.finished; if (!isRaceKind(k) || !fin || !sd.results) continue;
    const most = Math.max(0, ...Object.values(fin));
    for (const row of sd.results) { const n = fin[row.d]; if (row.st === 'FIN' && row.gap && n && n < most) { row.gap = ''; row.laps = most - n; changed = true; } }
  }
  return changed;
}
function repairQualiParts(c) {
  let changed = false;
  for (const s of c.seasons) {
    if (isHist(s)) continue;
    for (const r of activeRounds(s)) for (const key of ['Q', 'SQ']) {
      const sd = s.weekends[r.id]?.sessions?.[key]; const g = sd?.game; if (!g?.parts || !sd.done) continue;
      const lost = Object.values(g.parts).some(p => p.some(y => y.d && y.best && sd.results.find(x => x.d === y.d)?.st === 'DNS'));
      if (!lost) continue;
      sd.results = qualiFromParts(s, r, key, g);
      if (g.grid) settleQuali(s, r, key, g.grid);
      changed = true;
    }
  }
  return changed;
}
/** Qualifying rows in Pitwall's shape, from merged rows ({ d, best }). */
function qualiRows(rows, grid) {
  const pole = rows.find(x => x.best)?.best;
  const out = rows.map((x, i) => ({ d: x.d, lap: x.best ? fmtLap(x.best) : '', gap: x.best && i > 0 && pole ? (x.best >= pole ? '+' : '−') + (Math.abs(x.best - pole) / 1000).toFixed(3) : '', st: 'FIN', laps: '' }));
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
/** A session's ERS profile for saving: your driver, the packet format, and each lap's tyre (from your stints). */
function ersWithTyres(r, map) {
  const me = r.cars.find(x => x.idx === r.ers.player); const st = me?.stints || [];
  const tyre = (lap) => (st.find(x => lap <= x.end) || st[st.length - 1])?.visual ?? null;
  return { ...r.ers, d: map[r.ers.player] || null, format: r.format, laps: r.ers.laps.map(L => { const ty = tyre(L.lap); return ty == null ? L : { ...L, tyre: ty }; }) };
}
/** Log a game result into a session (keeping what was there, for undo). */
function applyGameResult(c, r, place) {
  if (isRaceKind(place.key)) setTimeout(() => backupNow('race'), 3000); // once the race is saved
  const { s, round, key } = place;
  const { map, unmatched } = mapGameDrivers(c, s, r);
  const w = weekend(s, round.id, true);
  const prev = w.sessions[key] ? JSON.stringify(w.sessions[key]) : null; const prevLen = w.raceLength;
  const byId = (pick) => Object.fromEntries(r.cars.filter(x => map[x.idx]).map(x => [map[x.idx], pick(x)]));
  const game = { key: r.key, at: r.at, sessionType: r.sessionType, totalLaps: r.totalLaps,
    laps: byId(x => x.lapTimes), stints: byId(x => x.stints.map(t => [t.visual, Math.min(t.end, x.laps || t.end)])), pits: byId(x => x.pits), grid: byId(x => x.grid),
    wear: byId(x => x.wear || []), finished: byId(x => x.laps),
    ...(r.cars.some(x => x.fuel?.length) ? { fuel: byId(x => x.fuel || []), ersDep: byId(x => x.ersDep || []) } : {}),
    penalties: r.penaltyEvents.filter(p => map[p.car] && (PENALTY_NAMES[p.type] || p.type === WARNING)).map(p => ({ d: map[p.car], type: p.type, infr: p.infringement, time: p.time, lap: p.lap, other: map[p.other] || null, t: p.t ?? null })),
    incidents: buildIncidents(r, map),
    ...(r.tyreSets ? { tyreSets: r.tyreSets } : {}),
    ...(r.ers ? { ers: ersWithTyres(r, map) } : {}),
    ...(isRaceKind(key) && Array.isArray(r.overtakes) ? { overtakes: r.overtakes.filter(x => map[x.a] && map[x.b]).map(x => [map[x.a], map[x.b], x.lap || 0]), passSource: r.passSource || null } : {}),
    safety: { sc: r.safetyCars, vsc: r.virtualSafetyCars, red: r.redFlags, ...(r.scPeriods?.length ? { periods: r.scPeriods } : {}) } };
  // a race carried on from a save whose real grid wasn't seen: the grid is the qualifying order (as it was set), not
  // where the save resumed it
  if (r.resumed && !r.gridKnown && isRaceKind(key)) { const q = w.sessions[qualiFor(r)]; if (q?.done) game.grid = Object.fromEntries(q.results.map((x, k) => [x.d, k + 1])); }
  let results;
  const part = QUALI_PARTS[r.sessionType];
  if (part) {
    // a three-part qualifying: this part joins the ones already logged this weekend
    const old = w.sessions[key]?.game; const same = old?.parts && w.game?.weekend === r.weekendLink;
    game.parts = { ...(same ? old.parts : {}), [part]: r.cars.slice().sort((a, b) => a.position - b.position).map(x => ({ d: map[x.idx] || null, best: x.best })) };
    // the drivers knocked out earlier aren't in this part: keep their laps, stints and tyre wear from the earlier ones
    if (same) for (const k of ['laps', 'stints', 'pits', 'wear', 'finished']) game[k] = { ...(old[k] || {}), ...game[k] };
    // and the flying laps of the earlier parts stay in the ERS profile
    if (same && old.ers?.laps && game.ers) game.ers = { ...game.ers, laps: [...old.ers.laps.filter(L => (L.part || 1) !== part), ...game.ers.laps.map(L => ({ ...L, part }))] };
    else if (game.ers) game.ers = { ...game.ers, laps: game.ers.laps.map(L => ({ ...L, part })) };
    results = qualiFromParts(s, round, key, game);
  } else if ((key === 'Q' || key === 'SQ') && r.cars.every(x => !x.best)) {
    const ids = r.cars.slice().sort((a, b) => a.position - b.position).map(x => map[x.idx]).filter(Boolean);
    const ideal = Object.values(idealLaps(s, round)).map(o => o.ideal);
    const tk = D.TRACKS[trackOf(round)]; const pole = ideal.length ? Math.min(...ideal) - 400 : (parseLap(tk?.record?.[0]) || 90000) * 1.01;
    const tt = provisionalTimes(s, ids, pole, `${round.id}-${key}-skip`);
    results = qualiRows(ids.map((d, i) => ({ d, best: tt[i] })), gridIds(s)); game.simulated = true;
  } else results = gameRows(r, key, map, gridIds(s));
  w.sessions[key] = { results, fl: null, done: true, game }; replayRelist();
  // each driver's quickest lap of the weekend so far, with its trace, for the fastest-lap head to head (a lap saved in
  // pieces by an older version gives way to the next whole one)
  for (const x of r.cars) { const id = map[x.idx]; const t = x.trace; if (!id || !t?.spd?.length) continue; const T = (w.traces ||= {}); if (!T[id] || T[id].ms > t.ms || !flWhole(T[id], t.spd.length)) T[id] = { ...t, key }; }
  if (game.ers) {
    // the ERS profile is big: keep it for this weekend only (the outline of the track is kept for good)
    for (const [rid, w2] of Object.entries(s.weekends)) if (rid !== round.id) for (const k of Object.keys(w2.sessions || {})) if (w2.sessions[k]?.game?.ers) delete w2.sessions[k].game.ers;
    if (game.ers.map?.filter(Boolean).length >= game.ers.map.length * 0.8 && mapExtent(game.ers.map) >= 200) (c.trackMaps ||= {})[trackOf(round)] = { map: game.ers.map, length: game.ers.length };
  }
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
