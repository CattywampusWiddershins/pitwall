/* Pitwall — Real F1 history, random numbers and the driver pool. Part of the renderer, split into files that load in order (see index.html). */
'use strict';
/* ---------------------------------------------------------------- history */
// Every career opens with the real seasons from 2016 (src/history.js): read-only, with their own results, points and
// line-ups. They're rebuilt from the bundled data on load and saved as a stub, so a save stays small. Totals
// elsewhere start from each driver's and team's record before 2016, so real seasons plus career add up.
const H = window.F1HIST;
const HIST_FROM = H.from, HIST_TO = H.to;
const isHist = (s) => !!s?.historic;
/** The circuit a round is held at (the Styrian GP is at the Red Bull Ring, say). */
const trackOf = (r) => r ? r.track || H.roundTrack[r.id] || r.id : null;
const playedSeasons = (c) => c.seasons.filter(s => !isHist(s));
const firstPlayed = (c) => c.seasons.find(s => !isHist(s)) || c.seasons[c.seasons.length - 1];
// drivers who announced their retirement at the end of that season (the rest of those leaving were left without a seat)
const REAL_RETIREMENTS = { 2016: ['ROS', 'BUT', 'MAS'], 2017: ['MAS'], 2018: ['ALO'], 2021: ['RAI'], 2022: ['VET'] };

/** Swap the end-of-2024 reference figures for the record before 2016: the real seasons supply the rest. */
(function useHistoryBaseline() {
  const KEYS = ['starts', 'wins', 'podiums', 'poles', 'fls', 'pts'];
  for (const [id, b] of Object.entries(H.bios)) {
    const cur = D.DRIVER_BIO[id] || {}; const base = H.base.drivers[id] || {};
    D.DRIVER_BIO[id] = { ...cur, nat: cur.nat || b.nat, born: cur.born || b.born, debut: cur.debut || b.debut, firstWin: cur.firstWin || b.firstWin || undefined,
      teams: b.teamsPre, career: b.teams, ...Object.fromEntries(KEYS.map(k => [k, base[k] || 0])), titles: base.titles || [], bestChamp: base.bestChamp ?? null, bestFinish: base.bestFinish ?? null };
  }
  for (const [id, b] of Object.entries(D.DRIVER_BIO)) if (!H.bios[id] && !b.fictional) Object.assign(b, { starts: 0, wins: 0, podiums: 0, poles: 0, fls: 0, pts: 0, titles: [], bestChamp: null, bestFinish: null });
  for (const [tid, b] of Object.entries(H.oldTeams)) D.TEAM_BIO[tid] ||= { ...b };
  for (const bio of Object.values(D.TEAM_BIO)) {
    if (bio.lineage || bio.fictional) continue;
    const id = Object.keys(D.TEAM_BIO).find(k => D.TEAM_BIO[k] === bio); const base = H.base.teams[id] || {};
    Object.assign(bio, { starts: base.starts || 0, wins: base.wins || 0, poles: base.poles || 0, podiums: base.podiums || 0, fls: base.fls || 0,
      conTitles: base.conTitles || [], drvTitles: base.drvTitles || 0, bestFinish: base.bestFinish ?? null, bestCon: base.bestCon ?? null });
  }
  D.RECORDS = H.records; D.STREAKS_2025 = H.streaks;
  D.CHAMPIONS = D.CHAMPIONS.filter(([y]) => y < HIST_FROM);
  for (const t of Object.values(D.TRACKS)) t.history = (t.history || []).filter(h => h[0] < HIST_FROM);
  for (const [id, t] of Object.entries(H.oldTracks)) D.TRACKS[id] ||= { ...t, history: [], former: true };
})();

/** A real season as Pitwall season data. Saved as { index, year, historic } and rebuilt on load. */
// h: the season's data (the bundled history's by default; the real season being followed builds its own, with
// h.upcoming for the races still to come and h.live set, so it saves as a stub rebuilt from the save's results)
function histSeason(year, index, h = H.seasons[year]) {
  const drivers = {};
  for (const [id, [name, number, code]] of Object.entries(h.drivers)) drivers[id] = { id, name, abbr: code, number };
  const calendar = [], weekends = {}, raceTeams = {};
  for (const r of h.rounds) {
    calendar.push({ id: r.id, name: r.name, venue: r.venue, sprint: !!r.sprint, off: false, ...(r.track ? { track: r.track } : {}), laps: r.laps, date: r.date });
    const pole = parseLap(r.q[0]?.[1]);
    const Q = { results: r.q.map(([d, lap, st], i) => { const ms = parseLap(lap); return { d, lap, gap: i && pole != null && ms != null ? '+' + ((ms - pole) / 1000).toFixed(3) : '', st }; }), fl: null, done: true, pole: r.pole };
    const row = ([d, gap, st, down, pts]) => ({ d, lap: '', gap, st, laps: down || '', pts });
    const R = { results: r.r.map(row), fl: r.fl, done: true };
    const flRow = R.results.find(x => x.d === r.fl); if (flRow) flRow.lap = r.flLap;
    const sessions = { Q, R };
    if (r.s) sessions.SPR = { results: r.s.map(row), fl: null, done: true };
    weekends[r.id] = { sessions, notes: '', raceLength: 100 };
    raceTeams[r.id] = Object.fromEntries([...(r.s || []), ...r.r].map(x => [x[0], x[5]]));
  }
  for (const r of h.upcoming || []) calendar.push({ id: r.id, name: r.name, venue: r.venue, sprint: !!r.sprint, off: false, ...(r.track ? { track: r.track } : {}), date: r.date });
  const kind = h.live ? 'live' : 'real';
  const s = { index, year, historic: kind, teams: h.teams.map(t => ({ ...t, drivers: [...t.drivers] })), drivers, calendar, benched: null, playerTeamId: null,
    format: { practice: 'none' }, goals: [], weekends, completed: !h.upcoming?.length, raceTeams, transfers: [],
    scoring: { fl: year >= 2019 && year <= 2024 ? 1 : 0, spr: year === 2021 ? [3, 2, 1] : null } };
  Object.defineProperty(s, 'toJSON', { value: () => ({ index, year, historic: kind }) });
  return s;
}
/** Each team's line-up at one race of a real season, with stand-ins (three races or fewer for the team that year)
 *  swapped for the driver they stood in for. { teamId: [driver, driver] } */
function lineupAt(year, ri) {
  const rs = H.seasons[year]?.rounds; if (!rs) return null;
  const races = {};
  for (const r of rs) for (const x of r.r) { const k = x[5] + '|' + x[0]; races[k] = (races[k] || 0) + 1; }
  const out = {};
  for (const x of rs[ri < 0 ? rs.length + ri : ri].r) (out[x[5]] ||= []).push(x[0]);
  for (const [tid, ds] of Object.entries(out)) {
    const regulars = Object.keys(races).filter(k => k.startsWith(tid + '|')).map(k => k.split('|')[1]).sort((a, b) => races[tid + '|' + b] - races[tid + '|' + a]);
    out[tid] = ds.map(d => races[tid + '|' + d] > 3 ? d : regulars.find(r => !ds.includes(r) && races[tid + '|' + r] > 3) || d);
  }
  return out;
}
/** Each team's line-up at the start of a real season (F1 25's grids for 2025 and 2026). */
function realLineup(year) {
  if (year === 2025) return Object.fromEntries(D.GRID_2025.filter(t => t.id !== 'apxgp').map(t => [t.id, [...t.drivers]]));
  if (year === 2026) return Object.fromEntries(D.GRID_2026.map(t => [t.id, [...t.drivers]]));
  return lineupAt(year, 0);
}
/** Who was in which car at the end of a real season. */
const finalLineup = (year) => lineupAt(year, -1);
/** A team's regular drivers in a real season (more than three races). */
function regularsOf(year, tid) {
  const n = {}; for (const r of H.seasons[year].rounds) for (const x of r.r) if (x[5] === tid) n[x[0]] = (n[x[0]] || 0) + 1;
  return Object.keys(n).filter(d => n[d] > 3);
}
/** The real driver market as transfer records, so the press covers it like any other move. */
function realTransfers(c) {
  const byYear = Object.fromEntries(c.seasons.map(s => [s.year, s]));
  for (const s of c.seasons) if (s.historic === 'real') s.transfers = s.transfers.filter(t => !t.real);
  const mk = (id, at, effective, date, steps) => ({ id, at, effective, createdAt: date ? new Date(Date.parse(date) + 864e5).toISOString() : new Date(0).toISOString(), steps, real: true, before: null });
  const step = (driver, from, to, replaces = null) => ({ kind: 'move', driver, from, to, replaces, until: null, prevUntil: null, wasPending: false });
  for (let y = HIST_FROM; y <= HIST_TO; y++) {
    const s = byYear[y]; if (s?.historic !== 'real') continue;
    const rs = H.seasons[y].rounds;
    // during the season
    // (a regular coming back after missing races, or starting late, isn't news)
    (H.moves[y] || []).filter(m => m.at > 0 && !(m.from == null && regularsOf(y, m.to).includes(m.driver) && Object.values(lineupAt(y, 0)).flat().includes(m.driver))).forEach((m, k) => {
      const prevTeam = Object.entries(s.raceTeams[rs[m.at - 1].id]).filter(([, t]) => t === m.to).map(([d]) => d);
      const nowTeam = Object.entries(s.raceTeams[rs[m.at].id]).filter(([, t]) => t === m.to).map(([d]) => d);
      s.transfers.push(mk(`real-${y}-${k}`, m.at, 'now', rs[m.at - 1].date, [step(m.driver, m.from, m.to, prevTeam.find(d => !nowTeam.includes(d)) || null)]));
    });
    // over the winter into the next season (which always starts from the real grid after a real season)
    if (!byYear[y + 1]) continue;
    // into a season you play, compare with the grid it started from (F1 25's, say); with you back out of your seat
    const ns = byYear[y + 1];
    const after = isHist(ns) ? (ns.historic === 'sim' ? Object.fromEntries(ns.teams.map(t => [t.id, t.drivers.filter(Boolean)])) : realLineup(y + 1))
      : Object.fromEntries(ns.teams.filter(t => t.id !== MYTEAM).map(t => [t.id, t.drivers.map(d => d === PLAYER_ID ? ns.benched : d).filter(Boolean)]));
    const before = finalLineup(y); if (!after) continue;
    const teamIn = (L, d) => Object.keys(L).find(t => L[t].includes(d)) || null;
    const date = rs[rs.length - 1].date; let k = 0;
    for (const [tid, ds] of Object.entries(after)) for (const d of ds) {
      const from = teamIn(before, d);
      if (from === tid) continue;
      const replaces = (before[tid] || []).find(x => !ds.includes(x)) || null;
      s.transfers.push(mk(`real-${y}w-${k++}`, rs.length, 'next', date, [step(d, from, tid, replaces)]));
    }
    for (const [tid, ds] of Object.entries(before)) for (const d of ds) {
      if (teamIn(after, d)) continue;
      s.transfers.push(mk(`real-${y}w-${k++}`, rs.length, 'next', date, [step(d, tid, (REAL_RETIREMENTS[y] || []).includes(d) ? 'retire' : 'free')]));
    }
  }
}
/** Put every season reference in a career forward by n (older saves get the real seasons in front of them). */
function shiftSeasonRefs(c, n) {
  for (const s of c.seasons) s.index += n;
  for (const m of c.media || []) if (m.seasonIdx != null) m.seasonIdx += n;
  for (const r of c.rumours || []) if (r.seasonIdx != null) r.seasonIdx += n;
  for (const p of Object.values(c.pending || {})) if (p?.seasonIdx != null) p.seasonIdx += n;
  for (const k of ['ledger', 'upgrades', 'sponsors']) for (const e of c.myTeam?.[k] || []) if (e.seasonIdx != null) e.seasonIdx += n;
}
/** Fill in the real seasons of a loaded career (and give an older save its 2016 onwards). */
function hydrateCareer(c) {
  if (!c?.seasons?.length) return;
  if (!c.seasons.some(isHist) && c.seasons[0].year > HIST_FROM) {
    const n = Math.min(c.seasons[0].year, HIST_TO + 1) - HIST_FROM;
    shiftSeasonRefs(c, n);
    c.seasons.unshift(...Array.from({ length: n }, (_, i) => ({ index: i, year: HIST_FROM + i, historic: 'real' })));
  }
  c.seasons = c.seasons.map(s => s.historic === 'real' && !s.teams ? histSeason(s.year, s.index) : s.historic === 'live' && !s.teams ? realSeasonOf(c, s.year, s.index) : s);
  if (c.realSeason) return; // the real season being followed: nothing of a career's to set up
  c.startYear ||= firstPlayed(c).year;
  // older saves that started in 2025 had APXGP as standard
  if (c.extraTeam2025 === undefined && c.startYear >= 2025) c.extraTeam2025 = c.startYear === 2025 ? ['apxgp', 'konnersport'].find(x => firstPlayed(c).teams.some(t => t.id === x)) || null : null;
  feederBios(c);
  realTransfers(c);
}
function hydrateState(st) { for (const c of st?.careers || []) hydrateCareer(c); return st; }

/* F1 25 lets a career add an 11th team for 2025 only: APXGP or Konnersport (c.extraTeam2025: 'apxgp' | 'konnersport' |
   null; undefined while a career that started earlier hasn't reached 2025 and been asked). My Team careers have
   your team as the 11th instead. */
const EXTRA_TEAMS = [['', 'Neither', 'The real ten-team grid'], ['apxgp', 'APXGP', 'Sonny Hayes and Joshua Pearce, from the F1 film'], ['konnersport', 'Konnersport', 'Aiden Jackson and Callie Mayer, from Braking Point']];
const extra2025 = (c) => c?.extraTeam2025 && c?.type !== 'myteam' && D.EXTRA_2025[c.extraTeam2025] ? [D.EXTRA_2025[c.extraTeam2025]] : [];
const extraPicker = (sel, act) => `<div class="choices">${EXTRA_TEAMS.map(([id, n, b]) => `<button class="choice ${(sel || '') === id ? 'on' : ''}" data-act="${act}" data-k="extra" data-v="${id}"><b>${n}</b><small>${b}</small></button>`).join('')}</div>`;
/** The grid and calendar a season starts from when it follows real life, or the grid you laid out for a career that
 *  starts later (null otherwise: the grid carries over). */
function templateFor(year, c = career()) {
  if (c?.startGrid && year === c.startYear) return { grid: c.startGrid, cal: c.startCal, nums: {} };
  // F1 25's grid (with APXGP) is for careers that start in 2025: reaching 2025 from an earlier start, it's the real one
  if (year === 2025 && (!c || c.startYear === 2025)) return { grid: [...D.GRID_2025, ...extra2025(c)], cal: D.CAL_2025, nums: {} };
  if (year === 2026) return { grid: D.GRID_2026, cal: D.CAL_2026, nums: D.NUMBERS_2026 };
  const h = H.seasons[year]; if (!h) return null;
  const lineup = realLineup(year);
  const grid = h.teams.filter(t => lineup[t.id]).map(t => ({ id: t.id, name: t.name, color: t.color, drivers: lineup[t.id].slice(0, 2) }));
  const nums = Object.fromEntries(Object.entries(h.drivers).map(([id, v]) => [id, v[1]]));
  const cal = h.rounds.map(r => [r.id, r.name, r.venue, !!r.sprint, r.track || null, r.date]);
  if (year === 2025) grid.push(...extra2025(c));
  return { grid, cal, nums, drivers: Object.fromEntries(Object.entries(h.drivers).map(([id, [name, number, abbr]]) => [id, { id, name, abbr, number }])) };
}

/* ------------------------------------------------------- random numbers */
/** A repeatable random sequence: the same career and year always simulate the same way. */
function mulberry(seed) {
  let a = 0; for (const ch of String(seed)) a = Math.imul(a ^ ch.charCodeAt(0), 2654435761) >>> 0;
  return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const gauss = (rnd) => { let u = 0; while (!u) u = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd()); };

/* ----------------------------------------------------------- driver pool */
// Who can be signed besides the grid: the F2 and F3 fields, the drivers you add yourself, and everyone who has raced
// since 2016 (free agents if they raced in the last two seasons and are under 44, otherwise retired).
// From 2025 each career keeps its own F2 (22 drivers) and F3 (30) fields, starting from the real 2024–25 grids: a
// driver who reaches F1 is replaced by a newly generated one, F3 drivers step up to F2 after two years, and anyone
// not in F1 after two years in F2 (four in all, coming through F3) drops off the list.
const F2_SIZE = 22, F3_SIZE = 30, RETIRE_AGE = 44;
const FEEDER = {};
for (const [name, abbr, nat, series, note] of window.F1POOL.FEEDER) {
  const id = 'X' + abbr; // never clashes with a three-letter F1 id
  const [level, yr] = series.split(' ');
  // no data in F1 yet: a talent rating (ms off the pace, lower is quicker), with feeder champions a little quicker
  const skill = Math.round(100 + gauss(mulberry('talent-' + id)) * 75 - (/champion/.test(note) ? 50 : 0));
  FEEDER[id] = { id, name, abbr, number: null, nat, series, note, feeder: true, level, joined: +yr, bornEst: `${+yr - (level === 'F2' ? 21 : 18)}-06-01`, skill };
  D.DRIVER_BIO[id] ||= { nat, note: `${series}${note ? '. ' + note : ''}.`, starts: 0, wins: 0, podiums: 0, poles: 0, fls: 0, pts: 0, titles: [], feeder: series };
}
/** A career's F2 and F3 fields: { year, list: [{ id, level, joined, f2 }] }, from the real grids in 2025. */
function feederOf(c) {
  return c.feeder ||= { year: 2025, list: Object.values(FEEDER).map(f => ({ id: f.id, level: f.level, joined: f.joined, f2: f.level === 'F2' ? f.joined : null })) };
}
/** "F2" / "F3" / "F2 2025" for a feeder driver, or null. */
const feederLabel = (c, id) => { const x = c?.feeder?.list.find(f => f.id === id); return x ? `${x.level} · ${x.level === 'F3' ? x.joined : x.f2 ?? x.joined} entry` : FEEDER[id]?.series || null; };
// names for generated drivers, by nationality: [weight, first names, family names]
const GEN_NAMES = {
  British: [6, ['Oliver', 'Harry', 'Jack', 'George', 'Charlie', 'Thomas', 'Alfie', 'Freddie', 'Lewis', 'Callum', 'Archie', 'Max'], ['Walker', 'Hughes', 'Bennett', 'Carter', 'Fletcher', 'Holt', 'Marsh', 'Pryce', 'Lambert', 'Reid', 'Shaw', 'Turner', 'Ashby', 'Whitlock']],
  Italian: [4, ['Luca', 'Marco', 'Matteo', 'Andrea', 'Lorenzo', 'Gabriele', 'Tommaso', 'Riccardo', 'Davide', 'Edoardo'], ['Rossi', 'Bianchi', 'Ferraro', 'Conti', 'Galli', 'Marino', 'Rinaldi', 'Moretti', 'Lombardi', 'Greco', 'Colombo', 'Barone']],
  French: [3, ['Hugo', 'Théo', 'Lucas', 'Mathis', 'Arthur', 'Louis', 'Enzo', 'Raphaël', 'Nathan', 'Jules'], ['Moreau', 'Laurent', 'Girard', 'Lefèvre', 'Fontaine', 'Rousseau', 'Garnier', 'Chevalier', 'Faure', 'Mercier', 'Perrin']],
  Spanish: [2, ['Pablo', 'Álvaro', 'Diego', 'Javier', 'Marc', 'Sergio', 'Adrián', 'Iker'], ['García', 'Navarro', 'Ortega', 'Romero', 'Serrano', 'Molina', 'Castillo', 'Vidal', 'Ruiz']],
  German: [3, ['Leon', 'Finn', 'Jonas', 'Elias', 'Paul', 'Moritz', 'Felix', 'Niklas', 'Lukas'], ['Becker', 'Hoffmann', 'Schäfer', 'Krüger', 'Wagner', 'Vogel', 'Brandt', 'Seidel', 'Lorenz', 'Kessler']],
  Dutch: [2, ['Daan', 'Sem', 'Bram', 'Thijs', 'Jesse', 'Ruben', 'Lars'], ['de Jong', 'Bakker', 'Visser', 'Smit', 'Meijer', 'Mulder', 'van Dijk', 'Kok']],
  Brazilian: [2, ['Gabriel', 'Rafael', 'Pedro', 'Enzo', 'Felipe', 'Caio', 'Bruno'], ['Oliveira', 'Santos', 'Ferreira', 'Almeida', 'Carvalho', 'Ribeiro', 'Moura']],
  American: [2, ['Jackson', 'Tyler', 'Cole', 'Logan', 'Hunter', 'Mason', 'Ryan'], ['Miller', 'Brooks', 'Hayes', 'Reynolds', 'Coleman', 'Parker', 'Sullivan']],
  Japanese: [1, ['Ren', 'Haruto', 'Sora', 'Kaito', 'Yuto', 'Riku'], ['Sato', 'Takahashi', 'Nakamura', 'Kobayashi', 'Yamamoto', 'Ito']],
  Australian: [2, ['Liam', 'Noah', 'Cooper', 'Jett', 'Hamish', 'Riley'], ['Mitchell', 'Barnes', 'Doyle', 'Kerr', 'Lawson', 'Pearce', 'Quinn']],
  Mexican: [1, ['Santiago', 'Emiliano', 'Mateo', 'Diego', 'Leonardo'], ['Hernández', 'Ramírez', 'Torres', 'Vargas', 'Mendoza']],
  Danish: [1, ['Magnus', 'Oscar', 'Emil', 'Frederik'], ['Nielsen', 'Jensen', 'Kristensen', 'Lund']],
  Finnish: [1, ['Eetu', 'Aleksi', 'Onni', 'Väinö'], ['Virtanen', 'Korhonen', 'Mäkinen', 'Lehtonen']],
  Polish: [1, ['Jakub', 'Kacper', 'Filip', 'Szymon'], ['Nowak', 'Kowalski', 'Wójcik', 'Zieliński']],
  Chinese: [1, ['Haoran', 'Yuxuan', 'Zihan', 'Jiahao'], ['Wang', 'Li', 'Chen', 'Liu', 'Zhang']],
  Indian: [1, ['Arjun', 'Rohan', 'Kabir', 'Aarav'], ['Sharma', 'Mehta', 'Kapoor', 'Iyer']],
  Argentine: [1, ['Thiago', 'Lautaro', 'Benjamín', 'Joaquín'], ['Gómez', 'Fernández', 'Sosa', 'Acosta']],
  Belgian: [1, ['Arthur', 'Lucas', 'Milan', 'Lars'], ['Peeters', 'Janssens', 'Maes', 'Claes']],
};
/** A new F2 or F3 driver for `year`: name, nationality, age and a hidden talent rating (some are gems). */
function genDriver(taken, level, year, rnd) {
  const nats = Object.entries(GEN_NAMES), total = nats.reduce((a, [, v]) => a + v[0], 0);
  for (let attempt = 0; attempt < 50; attempt++) {
    let p = rnd() * total; const [nat, [, firsts, lasts]] = nats.find(([, v]) => (p -= v[0]) < 0) || nats[0];
    const name = `${firsts[Math.floor(rnd() * firsts.length)]} ${lasts[Math.floor(rnd() * lasts.length)]}`;
    if (taken.has(name)) continue;
    taken.add(name);
    const family = lastName(name).replace(/^(de|van) /, '');
    const abbr = family.normalize('NFD').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase();
    const age = level === 'F2' ? 19 + Math.floor(rnd() * 3) : 16 + Math.floor(rnd() * 2);
    const born = `${year - age}-${String(1 + Math.floor(rnd() * 12)).padStart(2, '0')}-${String(1 + Math.floor(rnd() * 28)).padStart(2, '0')}`;
    return { id: 'G' + Math.floor(rnd() * 2 ** 40).toString(36), name, abbr, nat, born, skill: Math.round(125 + gauss(rnd) * 85), number: null, generated: true };
  }
  return null;
}
/** Bios for a career's generated drivers, so ages, flags and cards work like everyone else's. */
function feederBios(c) {
  for (const g of Object.values(c.generated || {})) D.DRIVER_BIO[g.id] ||= { nat: g.nat, born: g.born, starts: 0, wins: 0, podiums: 0, poles: 0, fls: 0, pts: 0, titles: [], generated: true, note: 'A product of the junior series in your career.' };
  for (const x of c.feeder?.list || []) if (D.DRIVER_BIO[x.id]) D.DRIVER_BIO[x.id].feeder = feederLabel(c, x.id);
}
/**
 * Move a career's F2 and F3 fields on to `year`: whoever is on the F1 grid leaves, F3 drivers step up after two years,
 * anyone out of time drops off, and new drivers fill both fields back up. `keep`: drivers who must stay available.
 */
function feederTick(c, year, grid, keep = new Set()) {
  if (year < 2026) return;
  const F = feederOf(c); c.generated ||= {};
  const taken = new Set([...Object.values(FEEDER), ...Object.values(c.generated)].map(x => x.name).concat(Object.values(H.bios).map(b => b.name)));
  for (let y = F.year + 1; y <= year; y++) {
    const rnd = mulberry(`${c.id}-feeder-${y}`);
    F.list = F.list.filter(x => !grid.has(x.id));
    F.list = F.list.filter(x => keep.has(x.id) || (x.level === 'F3' ? y - x.joined < 4 : y - (x.f2 ?? x.joined) < 2));
    const ready = F.list.filter(x => x.level === 'F3' && y - x.joined >= 2).sort((a, b) => priorSkill(c, a.id) - priorSkill(c, b.id));
    for (const x of ready) { if (F.list.filter(z => z.level === 'F2').length >= F2_SIZE) break; x.level = 'F2'; x.f2 = y; }
    for (const level of ['F2', 'F3']) {
      for (let n = F.list.filter(x => x.level === level).length; n < (level === 'F2' ? F2_SIZE : F3_SIZE); n++) {
        const g = genDriver(taken, level, y, rnd); if (!g) break;
        c.generated[g.id] = g; F.list.push({ id: g.id, level, joined: y, f2: level === 'F2' ? y : null });
      }
    }
    F.year = y;
  }
  feederBios(c);
}
/** The drivers off the grid, by kind: { free, retired, feeder, custom } (each a list of ids). */
function driverPool(c, s = latestSeason()) {
  const grid = new Set(gridIds(s));
  const lastRaced = {};
  for (const se of c.seasons) if (se.index <= s.index) for (const id of Object.keys(seasonStatsCache(se))) if (seasonStatsCache(se)[id].starts) lastRaced[id] = se.year;
  const out = { free: [], retired: [], feeder: [], custom: [] };
  const old = (id) => (turnsIn(c, id, s.year) ?? 0) >= RETIRE_AGE;
  for (const cd of c.customDrivers || []) if (!grid.has(cd.id) && cd.id !== PLAYER_ID) out.custom.push(cd.id);
  for (const [id, y] of Object.entries(lastRaced)) {
    if (grid.has(id) || id === PLAYER_ID || out.custom.includes(id)) continue;
    (c.retired?.[id] != null || old(id) || s.year - y > 3 || Object.entries(REAL_RETIREMENTS).some(([ry, ids]) => ids.includes(id) && +ry >= y) ? out.retired : out.free).push(id);
  }
  if (s.year <= 2025) for (const id of ['PER', 'BOT', 'LIN', 'DOO']) if (!grid.has(id) && !lastRaced[id] && !out.free.includes(id) && !old(id)) out.free.push(id);
  // the feeder fields are for seasons from 2025 (in 2018 most of today's F2 drivers were still karting)
  if (s.year >= 2025) {
    const list = c.feeder ? c.feeder.list.slice().sort((a, b) => a.level.localeCompare(b.level)).map(x => x.id) : Object.keys(FEEDER);
    for (const id of list) if (!grid.has(id) && !lastRaced[id] && !(c.removedPool || []).includes(id)) out.feeder.push(id);
  }
  return out;
}
