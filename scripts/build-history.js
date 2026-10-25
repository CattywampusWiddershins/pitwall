// Builds src/history.js from the raw results that scripts/fetch-history.js downloaded into data-raw/.
//   node scripts/build-history.js
// It holds every 2016–2025 season (qualifying, sprints and races, in Pitwall's own shape), each driver's and team's
// record from before 2016, the record book as it stood at the end of 2015, and bios for every driver since 2016.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const M = require('./history-meta');

const RAW = path.join(__dirname, '..', 'data-raw');
const OUT_FILE = path.join(__dirname, '..', 'src', 'history.js');
const FROM = 2016, LAST = 2025;
// --partial: only the 2016–2025 seasons (for testing before the older results are downloaded; baselines are empty)
const FIRST = process.argv.includes('--partial') ? FROM : 1950;

// the app's own reference data, for the frozen end-of-2024 totals the computed ones are checked against
const ctx = { window: {} };
vm.createContext(ctx);
for (const f of ['data.js', 'reference.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8'), ctx);
const REF = ctx.window.F1DATA;

const read = (rel) => { const f = path.join(RAW, rel.replace(/[/?&=]+/g, '_') + '.json'); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null; };
function pages(rel) {
  const out = [];
  for (let offset = 0; ; offset += 100) {
    const j = read(`${rel}.json?limit=100&offset=${offset}`);
    if (!j) { if (offset === 0) return null; throw new Error(`missing page ${rel} @${offset}`); }
    out.push(j);
    if (offset + 100 >= +j.MRData.total) return out;
  }
}
/** Races of a season with their rows merged across pages: key = 'Results' | 'QualifyingResults' | 'SprintResults'. */
function races(rel, key) {
  const ps = pages(rel); if (!ps) return null;
  const by = new Map();
  for (const p of ps) for (const r of p.MRData.RaceTable.Races) {
    const cur = by.get(+r.round);
    if (cur) cur[key].push(...r[key]); else by.set(+r.round, { ...r, [key]: [...r[key]] });
  }
  return [...by.values()].sort((a, b) => +a.round - +b.round);
}
function standings(rel, key) {
  const ps = pages(rel); if (!ps) return null;
  return ps.flatMap(p => p.MRData.StandingsTable.StandingsLists.flatMap(l => l[key].map(x => ({ ...x, season: +l.season }))));
}

const years = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const RES = {}; for (const y of years(FIRST, LAST)) RES[y] = races(`${y}/results`, 'Results');
const missing = years(FIRST, LAST).filter(y => !RES[y]);
if (missing.length) { console.error('Results missing for', missing.join(', '), '- run fetch-history.js first'); process.exit(1); }
const QUALI = {}, SPRINT = {};
for (const y of years(FROM, LAST)) { QUALI[y] = races(`${y}/qualifying`, 'QualifyingResults') || []; SPRINT[y] = y >= 2021 ? races(`${y}/sprint`, 'SprintResults') || [] : []; }
const DST = {}, CST = {};
for (const y of years(FIRST, LAST)) { DST[y] = standings(`${y}/driverStandings`, 'DriverStandings'); CST[y] = y >= 1958 ? standings(`${y}/constructorStandings`, 'ConstructorStandings') : []; }

/* ------------------------------------------------------------------ helpers */
const num = (v) => v == null || v === '' ? null : +v;
const NON_START = /^(Did not qualify|Did not prequalify|Withdrew|Did not start|Not restarted|Excluded)$/i;
const isStart = (x) => !NON_START.test(x.status) && !(['F', 'W'].includes(x.positionText));
const classified = (x) => /^\d+$/.test(x.positionText);
const lapMs = (t) => { const m = /^(?:(\d+):)?(\d+(?:\.\d+)?)$/.exec(t || ''); return m ? (+(m[1] || 0) * 60 + +m[2]) * 1000 : null; };
const fmtLap = (ms) => { const m = Math.floor(ms / 60000); return `${m}:${((ms - m * 60000) / 1000).toFixed(3).padStart(6, '0')}`; };
const lookFor = (tid, year) => { const l = (M.TEAM_LOOK[tid] || []).filter(x => x[0] <= year).pop(); return l ? { name: l[1], color: l[2] } : { name: tid, color: '#5E6A82' }; };
const fullName = (d) => M.FAMILY_FIRST[d.driverId] ? `${d.familyName} ${d.givenName}` : `${d.givenName} ${d.familyName}`;

/* --------------------------------------------------------------- driver ids */
const champKeyByName = Object.fromEntries(Object.entries(REF.CHAMP_BIO).map(([k, v]) => [v.name, k]));
const ERG = {}; // ergast driverId -> Driver object
for (const y of years(FIRST, LAST)) for (const r of RES[y]) for (const x of r.Results) ERG[x.Driver.driverId] = x.Driver;
const modern = new Set(); for (const y of years(FROM, LAST)) for (const r of RES[y]) for (const x of r.Results) modern.add(x.Driver.driverId);
const ID = {}; const taken = new Map();
for (const did of modern) {
  const d = ERG[did];
  const id = M.DRIVER_IDS[did] || d.code || d.familyName.slice(0, 3).toUpperCase();
  if (taken.has(id)) throw new Error(`driver id ${id} clash: ${did} and ${taken.get(id)}`);
  const champ = REF.CHAMP_BIO[id]; if (champ && champ.name !== fullName(d)) throw new Error(`driver id ${id} (${fullName(d)}) clashes with champion ${champ.name}`);
  taken.set(id, did); ID[did] = id;
}
/** A stable key for any driver: Pitwall's id for the modern ones, the champion key, else a name-based one. */
function keyOf(did) {
  if (ID[did]) return ID[did];
  const d = ERG[did]; const n = fullName(d);
  return champKeyByName[n] || `H_${did}`;
}

/* ------------------------------------------------------------ the seasons */
const statusOf = (x) => {
  if (classified(x)) return 'FIN';
  if (['D', 'E'].includes(x.positionText)) return 'DSQ';
  if (['W', 'F'].includes(x.positionText) || /did not start|withdrew/i.test(x.status)) return 'DNS';
  return 'DNF';
};
function raceRows(list, kind) {
  const lead = list[0]; const leadLaps = +lead.laps;
  return list.map((x, k) => {
    const st = statusOf(x);
    let gap = '', down = 0;
    if (st === 'FIN') {
      const lapsDown = /^\+(\d+) Laps?$/.exec(x.status);
      if (k === 0) gap = x.Time?.time || '';
      else if (x.Time?.time && !lapsDown) gap = x.Time.time.startsWith('+') ? x.Time.time : '+' + x.Time.time;
      else down = lapsDown ? +lapsDown[1] : Math.max(1, leadLaps - +x.laps);
    }
    const tid = M.TEAM_IDS[x.Constructor.constructorId];
    if (!tid) throw new Error(`unmapped team ${x.Constructor.constructorId}`);
    return [ID[x.Driver.driverId], gap, st, down, +x.points, tid];
  });
}
const seasons = {};
const moves = {};
for (const y of years(FROM, LAST)) {
  const rounds = [];
  const teamsSeen = new Map(); // tid -> Map(driver -> starts)
  const lastTeam = {}; const numbers = {};
  for (const r of RES[y]) {
    const track = M.TRACK_IDS[r.Circuit.circuitId];
    if (!track) throw new Error(`unmapped circuit ${r.Circuit.circuitId}`);
    const special = M.SPECIAL_RACES[r.raceName];
    const id = special ? special[0] : track;
    const [name, venue] = special ? [special[1], M.TRACK_NAMES[id]?.[1] || M.TRACK_NAMES[track][1]] : M.TRACK_NAMES[track];
    if (rounds.some(x => x.id === id)) throw new Error(`${y}: round id ${id} used twice`);
    const res = r.Results;
    const q = (QUALI[y].find(x => +x.round === +r.round)?.QualifyingResults || []).map(x => {
      const t = [x.Q1, x.Q2, x.Q3].map(lapMs).filter(v => v != null);
      return [ID[x.Driver.driverId], t.length ? fmtLap(Math.min(...t)) : '', t.length ? 'FIN' : 'DNS'];
    });
    const spr = SPRINT[y].find(x => +x.round === +r.round)?.SprintResults || [];
    const fl = res.find(x => x.FastestLap?.rank === '1');
    const pole = res.find(x => +x.grid === 1);
    const round = { id, name, venue, date: r.date, laps: +res[0].laps, q, pole: pole ? ID[pole.Driver.driverId] : null, r: raceRows(res, 'R'), fl: fl ? ID[fl.Driver.driverId] : null, flLap: fl?.FastestLap?.Time?.time || '' };
    if (id !== track) round.track = track;
    if (spr.length) { round.sprint = true; round.s = raceRows(spr, 'SPR'); }
    rounds.push(round);
    for (const x of res) {
      const d = ID[x.Driver.driverId], tid = M.TEAM_IDS[x.Constructor.constructorId];
      const m = teamsSeen.get(tid) || new Map(); teamsSeen.set(tid, m);
      m.set(d, (m.get(d) || 0) + (isStart(x) ? 1 : 0));
      lastTeam[d] = tid;
      (numbers[d] ||= {})[x.number] = ((numbers[d] ||= {})[x.number] || 0) + 1;
    }
  }
  // teams in championship order; each driver listed under the team they finished the season with
  const order = (CST[y] || []).map(x => M.TEAM_IDS[x.Constructor.constructorId]);
  const tids = [...new Set([...order, ...teamsSeen.keys()])].filter(t => teamsSeen.has(t));
  const teams = tids.map(tid => {
    const m = teamsSeen.get(tid);
    const drivers = [...m.entries()].filter(([d]) => lastTeam[d] === tid).sort((a, b) => b[1] - a[1]).map(([d]) => d);
    return { id: tid, ...lookFor(tid, y), drivers };
  });
  const drivers = {};
  for (const [did, id] of Object.entries(ID)) if (numbers[id]) {
    const n = Object.entries(numbers[id]).sort((a, b) => b[1] - a[1])[0][0];
    drivers[id] = [fullName(ERG[did]), +n, ERG[did].code || id];
  }
  seasons[y] = { teams, drivers, rounds };

  // who drove where: round-one line-ups and every change during the season
  const seat = {}; const list = [];
  rounds.forEach((rd, ri) => {
    for (const [d, , , , , tid] of rd.r) {
      if (seat[d] === tid) continue;
      if (ri > 0 || seat[d] !== undefined) list.push({ at: ri, driver: d, from: seat[d] ?? null, to: tid });
      seat[d] = tid;
    }
  });
  moves[y] = list;
}

/* ------------------------------------------------- real records before 2016 */
const pre = {}; const preTeam = {};
const P = (did) => pre[did] ||= { starts: 0, wins: 0, podiums: 0, poles: 0, fls: 0, pts: 0, titles: [], bestChamp: null, bestFinish: null, teams: [] };
const lineageOf = {};
for (const [tid, l] of Object.entries(M.TEAM_LINEAGE)) for (const [cid, from] of l) (lineageOf[cid] ||= []).push([tid, from]);
const T = (tid) => preTeam[tid] ||= { starts: 0, wins: 0, poles: 0, podiums: 0, fls: 0, conTitles: [], drvTitles: 0, bestFinish: null, bestCon: null };
const champions = {}; // year -> ergast driverId
for (const y of years(FIRST, LAST)) { const top = DST[y]?.find(x => x.position === '1'); if (top) champions[y] = top.Driver.driverId; }
const conChampions = {};
for (const y of years(1958, LAST)) { const top = CST[y]?.find(x => x.position === '1'); if (top) conChampions[y] = top.Constructor.constructorId; }
function addSeason(y, intoDriver, intoTeam) {
  for (const r of RES[y]) {
    const entered = new Set();
    for (const x of r.Results) {
      const p = intoDriver(x.Driver.driverId); const pos = classified(x) ? +x.position : null;
      if (p) {
        if (isStart(x)) p.starts++;
        if (pos === 1) p.wins++;
        if (pos && pos <= 3) p.podiums++;
        if (+x.grid === 1) p.poles++;
        if (x.FastestLap?.rank === '1') p.fls++;
        p.pts += +x.points;
        if (pos) p.bestFinish = p.bestFinish == null ? pos : Math.min(p.bestFinish, pos);
      }
      for (const [tid, from] of lineageOf[x.Constructor.constructorId] || []) {
        if (y < from) continue;
        const t = intoTeam(tid); if (!t) continue;
        if (!entered.has(tid)) { t.starts++; entered.add(tid); }
        if (pos === 1) t.wins++;
        if (pos && pos <= 3) t.podiums++;
        if (+x.grid === 1) t.poles++;
        if (x.FastestLap?.rank === '1') t.fls++;
        if (pos) t.bestFinish = t.bestFinish == null ? pos : Math.min(t.bestFinish, pos);
      }
    }
  }
  for (const r of SPRINT[y] || []) for (const x of r.SprintResults) { const p = intoDriver(x.Driver.driverId); if (p) p.pts += +x.points; }
  for (const s of DST[y] || []) { const p = intoDriver(s.Driver.driverId); if (p) { p.bestChamp = p.bestChamp == null ? +s.position : Math.min(p.bestChamp, +s.position); if (s.position === '1') p.titles.push(y); } }
  for (const s of CST[y] || []) for (const [tid, from] of lineageOf[s.Constructor.constructorId] || []) {
    if (y < from) continue; const t = intoTeam(tid); if (!t) continue;
    t.bestCon = t.bestCon == null ? +s.position : Math.min(t.bestCon, +s.position);
    if (s.position === '1') t.conTitles.push(y);
  }
  const ch = DST[y]?.find(x => x.position === '1');
  if (ch) for (const c of ch.Constructors || []) for (const [tid, from] of lineageOf[c.constructorId] || []) { if (y >= from) { const t = intoTeam(tid); if (t) t.drvTitles++; } }
}
for (const y of years(FIRST, FROM - 1)) addSeason(y, P, T);

// cross-check: real end-of-2024 totals = before 2016 + 2016–2024
const mid = {}, midTeam = {};
for (const y of years(FROM, 2024)) addSeason(y, (did) => mid[did] ||= { starts: 0, wins: 0, podiums: 0, poles: 0, fls: 0, pts: 0, titles: [], bestChamp: null, bestFinish: null }, (tid) => midTeam[tid] ||= { starts: 0, wins: 0, poles: 0, podiums: 0, fls: 0, conTitles: [], drvTitles: 0, bestFinish: null, bestCon: null });
const report = [];
for (const [id, bio] of Object.entries(REF.DRIVER_BIO)) {
  const did = Object.keys(ID).find(k => ID[k] === id); if (!did || bio.fictional) continue;
  const a = pre[did] || {}, b = mid[did] || {};
  const diffs = ['starts', 'wins', 'podiums', 'poles', 'fls', 'pts'].filter(k => Math.abs((a[k] || 0) + (b[k] || 0) - (bio[k] || 0)) > 0.01).map(k => `${k} ${(a[k] || 0) + (b[k] || 0)} vs ${bio[k]}`);
  if (diffs.length) report.push(`${id}: ${diffs.join(', ')}`);
}
for (const [tid, bio] of Object.entries(REF.TEAM_BIO)) {
  if (bio.lineage || bio.fictional || !bio.starts) continue;
  const a = preTeam[tid] || {}, b = midTeam[tid] || {};
  const diffs = ['starts', 'wins', 'poles', 'podiums', 'fls'].filter(k => (a[k] || 0) + (b[k] || 0) !== bio[k]).map(k => `${k} ${(a[k] || 0) + (b[k] || 0)} vs ${bio[k]}`);
  const ct = [...(a.conTitles || []), ...(b.conTitles || [])];
  if (ct.length !== bio.conTitles.length) diffs.push(`conTitles ${ct.length} vs ${bio.conTitles.length}`);
  if (diffs.length) report.push(`team ${tid}: ${diffs.join(', ')}`);
}

// driver baselines: the official end-of-2024 figure minus 2016–2024 where Pitwall has one, else counted from the results
const base = { drivers: {}, teams: {} };
for (const did of modern) {
  const id = ID[did]; const a = pre[did];
  const bio = REF.DRIVER_BIO[id];
  const o = a ? { starts: a.starts, wins: a.wins, podiums: a.podiums, poles: a.poles, fls: a.fls, pts: a.pts, titles: a.titles, bestChamp: a.bestChamp, bestFinish: a.bestFinish } : null;
  if (bio && !bio.fictional && o) {
    const b = mid[did] || {};
    for (const k of ['starts', 'wins', 'podiums', 'poles', 'fls', 'pts']) o[k] = Math.round(((bio[k] || 0) - (b[k] || 0)) * 10) / 10;
  }
  if (o && (o.starts || o.pts)) base.drivers[id] = o;
}
for (const tid of Object.keys(M.TEAM_LINEAGE)) {
  const a = preTeam[tid]; if (!a) continue;
  const bio = REF.TEAM_BIO[tid]; const o = { ...a };
  if (bio && !bio.lineage && bio.starts) { const b = midTeam[tid] || {}; for (const k of ['starts', 'wins', 'poles', 'podiums', 'fls']) o[k] = bio[k] - (b[k] || 0); }
  if (o.starts) base.teams[tid] = o;
}

/* --------------------------------------------- the record book, end of 2015 */
function recordBook() {
  const tot = {}; const age = {}; const streak = {}; const season = {}; const team = {};
  const D = (did) => tot[did] ||= { starts: 0, wins: 0, podiums: 0, poles: 0, pts: 0, titles: 0, first: {} };
  const S = (did) => streak[did] ||= { win: 0, pod: 0, pole: 0, pts: 0, winFrom: null, podFrom: null, poleFrom: null, ptsFrom: null };
  const best = {}; // id -> { value, holders: [{did, when, date?}] }
  const offer = (rid, did, value, when, max = true, extra = {}) => {
    const b = best[rid];
    if (!b || (max ? value > b.value : value < b.value)) best[rid] = { value, holders: [{ did, when, ...extra }] };
    else if (value === b.value && !b.holders.some(h => h.did === did)) b.holders.push({ did, when, ...extra });
  };
  const days = (born, date) => Math.round((Date.parse(date) - Date.parse(born)) / 864e5);
  const T = (tid) => team[tid] ||= { wins: 0, titles: 0, streak: 0, last: null };
  for (const y of years(FIRST, FROM - 1)) {
    const sw = {}; const tw = {};
    for (const r of RES[y]) {
      const when = `${y} ${r.raceName.replace(' Grand Prix', '')} GP`;
      for (const x of r.Results) {
        const did = x.Driver.driverId; const d = D(did); const s = S(did); const born = ERG[did].dateOfBirth;
        const pos = classified(x) ? +x.position : null;
        if (!isStart(x)) continue;
        d.starts++;
        if (d.starts === 1 && born) offer('youngStart', did, days(born, r.date), when, false, { born, date: r.date });
        if (+x.points > 0) {
          if (d.pts === 0 && born) offer('youngPoints', did, days(born, r.date), when, false, { born, date: r.date });
          if (!s.pts) s.ptsFrom = when; s.pts++; offer('ptsStreak', did, s.pts, s.ptsFrom === when ? when : `${s.ptsFrom.slice(0, 4)}–${y}`);
        } else s.pts = 0;
        d.pts += +x.points;
        if (+x.grid === 1) {
          d.poles++; if (!s.pole) s.poleFrom = when; s.pole++;
          if (d.poles === 1 && born) { const q = new Date(Date.parse(r.date) - 864e5).toISOString().slice(0, 10); offer('youngPole', did, days(born, q), when, false, { born, date: q }); }
          offer('poleStreak', did, s.pole, `${s.poleFrom.slice(0, 4)}–${y}`);
          (sw[did] ||= { wins: 0, pods: 0, poles: 0 }).poles++;
        } else if (+x.grid > 0) s.pole = 0;
        if (pos && pos <= 3) {
          d.podiums++; if (!s.pod) s.podFrom = when; s.pod++;
          if (d.podiums === 1 && born) offer('youngPodium', did, days(born, r.date), when, false, { born, date: r.date });
          offer('podStreak', did, s.pod, `${s.podFrom.slice(0, 4)}–${y}`);
          (sw[did] ||= { wins: 0, pods: 0, poles: 0 }).pods++;
        } else s.pod = 0;
        if (pos === 1) {
          d.wins++; if (!s.win) s.winFrom = when; s.win++;
          if (born) { offer('youngWin', did, days(born, r.date), when, false, { born, date: r.date }); offer('oldWin', did, days(born, r.date), when, true, { born, date: r.date }); }
          offer('winStreak', did, s.win, s.winFrom === when ? when : `${s.winFrom.slice(0, 4)}–${y}`);
          (sw[did] ||= { wins: 0, pods: 0, poles: 0 }).wins++;
          for (const [tid, from] of lineageOf[x.Constructor.constructorId] || []) if (y >= from) { T(tid).wins++; tw[tid] = (tw[tid] || 0) + 1; }
          const cid = `C_${x.Constructor.constructorId}`; if (!lineageOf[x.Constructor.constructorId]) { T(cid).wins++; tw[cid] = (tw[cid] || 0) + 1; T(cid).name = x.Constructor.name; }
        } else s.win = 0;
      }
    }
    const nRaces = RES[y].length;
    for (const [did, o] of Object.entries(sw)) {
      offer('seasonWins', did, o.wins, String(y)); offer('seasonPods', did, o.pods, String(y)); offer('seasonPoles', did, o.poles, String(y));
      offer('seasonWinPct', did, Math.round(o.wins / nRaces * 1000) / 10, `${y}, ${o.wins} of ${nRaces}`);
    }
    for (const [tid, n] of Object.entries(tw)) offer('teamSeasonWins', tid, n, String(y));
    const st = DST[y] || [];
    if (st[0]) {
      const did = st[0].Driver.driverId; const d = D(did); d.titles++;
      const prev = d.lastTitle === y - 1 ? d.titleStreak : 0; d.titleStreak = prev + 1; d.lastTitle = y;
      offer('titles', did, d.titles, d.titles === 1 ? String(y) : null); offer('titleStreak', did, d.titleStreak, `${y - d.titleStreak + 1}–${y}`);
      const born = ERG[did].dateOfBirth; const lastRace = RES[y][RES[y].length - 1].date;
      if (born && d.titles <= 8) offer('youngTitle' + d.titles, did, days(born, lastRace), String(y), false, { born, date: lastRace });
      if (born) offer('oldTitle', did, days(born, lastRace), String(y), true, { born, date: lastRace });
      if (st[1]) offer('titleMargin', did, +st[0].points - +st[1].points, String(y));
      offer('seasonPts', did, +st[0].points, String(y));
    }
    const cs = CST[y] || [];
    if (cs[0]) for (const [tid, from] of lineageOf[cs[0].Constructor.constructorId] || [[`C_${cs[0].Constructor.constructorId}`, 0]]) {
      if (y < from) continue; const t = T(tid); t.name ||= cs[0].Constructor.name; t.titles++; t.streak = t.last === y - 1 ? t.streak + 1 : 1; t.last = y;
      offer('teamTitles', tid, t.titles, null); offer('teamStreak', tid, t.streak, `${y - t.streak + 1}–${y}`);
    }
  }
  for (const [did, d] of Object.entries(tot)) {
    for (const k of ['wins', 'poles', 'podiums', 'starts', 'pts']) offer(k, did, Math.round(d[k] * 10) / 10, null);
    if (!d.wins) offer('winless', did, d.starts, null);
  }
  for (const [tid, t] of Object.entries(team)) offer('teamWins', tid, t.wins, null);
  return { best, tot, team };
}
const book = recordBook();
const careerSpan = (did) => {
  let a = null, b = null;
  for (const y of years(FIRST, FROM - 1)) if (RES[y].some(r => r.Results.some(x => x.Driver.driverId === did))) { a ??= y; b = y; }
  return a === b ? String(a) : `${a}–${b}`;
};
const nameOfKey = (did) => did.startsWith('C_') ? book.team[did]?.name || did.slice(2) : (REF.TEAM_BIO[did] ? null : null);
const RECORDS = REF.RECORDS.map(R => {
  const b = book.best[R.id];
  if (R.id === 'fls') return R; // fastest laps only exist in the results from 2004: keep the real record (Schumacher, 77)
  if (!b) return { ...R, value: R.group === 'age' ? undefined : 0, holders: [] };
  const holders = b.holders.map(h => {
    if (R.group === 'team') {
      const meta = REF.TEAM_BIO[h.did] || M.OLD_TEAMS[h.did];
      return { key: h.did, name: h.did.startsWith('C_') ? book.team[h.did].name : lookFor(h.did, 2015).name !== h.did ? lookFor(h.did, 2015).name : meta?.full || h.did, when: h.when || '' };
    }
    const d = ERG[h.did];
    const o = { key: keyOf(h.did), name: fullName(d), when: h.when || careerSpan(h.did) };
    if (R.group === 'age') Object.assign(o, { born: h.born, date: h.date });
    return o;
  });
  const out = { ...R, holders };
  if (R.group === 'age') delete out.value; else out.value = b.value;
  return out;
});
const STREAKS = { titleStreak: {}, teamStreak: {} };
for (const [did, d] of Object.entries(book.tot)) if (d.lastTitle === FROM - 1) STREAKS.titleStreak[keyOf(did)] = d.titleStreak;
for (const [tid, t] of Object.entries(book.team)) if (t.last === FROM - 1) STREAKS.teamStreak[tid] = t.streak;

/* -------------------------------------------------------------------- bios */
const bios = {};
for (const did of modern) {
  const d = ERG[did]; const id = ID[did];
  let debut = null, firstWin = null; const teams = [];
  for (const y of years(FIRST, LAST)) for (const r of RES[y]) {
    const x = r.Results.find(z => z.Driver.driverId === did); if (!x || !isStart(x)) continue;
    debut ||= `${y} ${r.raceName.replace(' Grand Prix', '')} GP`;
    if (!firstWin && x.position === '1') firstWin = `${y} ${r.raceName.replace(' Grand Prix', '')} GP`;
    const name = M.TEAM_IDS[x.Constructor.constructorId] ? lookFor(M.TEAM_IDS[x.Constructor.constructorId], y).name : x.Constructor.name;
    const last = teams[teams.length - 1];
    if (last && last.name === name) last.to = y; else teams.push({ name, from: y, to: y });
  }
  const txt = (list) => list.map(t => `${t.name} (${t.from === t.to ? t.from : `${t.from}–${String(t.to).slice(2)}`})`).join(', ');
  const preTeams = teams.filter(t => t.from < FROM).map(t => ({ ...t, to: Math.min(t.to, FROM - 1) }));
  bios[id] = { name: fullName(d), nat: d.nationality, born: d.dateOfBirth || null, debut, firstWin, teams: txt(teams), teamsPre: txt(preTeams), number: num(d.permanentNumber), code: d.code || id };
}

/* -------------------------------------------------------------------- write */
const HIST = { from: FROM, to: LAST, seasons, moves, base, records: RECORDS, streaks: STREAKS, bios, oldTracks: M.OLD_TRACKS, oldTeams: M.OLD_TEAMS, roundTrack: M.ROUND_TRACK,
  champions: Object.fromEntries(Object.entries(champions).filter(([y]) => +y >= FROM).map(([y, did]) => [y, ID[did]])),
  conChampions: Object.fromEntries(Object.entries(conChampions).filter(([y]) => +y >= FROM).map(([y, cid]) => [y, M.TEAM_IDS[cid]])) };
const banner = `// Generated by scripts/build-history.js from the Jolpica F1 API (https://github.com/jolpica/jolpica-f1). Do not edit.\n`;
fs.writeFileSync(OUT_FILE, `${banner}window.F1HIST = ${JSON.stringify(HIST)};\n`);
console.log(`Wrote ${path.relative(process.cwd(), OUT_FILE)} (${Math.round(fs.statSync(OUT_FILE).size / 1024)} KB): ${Object.keys(seasons).length} seasons, ${Object.keys(bios).length} drivers`);
if (report.length) { console.log('\nDifferences from the end-of-2024 figures in reference.js (official figures used):'); for (const l of report) console.log('  ' + l); }
console.log('\nRecords at the end of 2015:');
for (const R of RECORDS) console.log(`  ${R.id}: ${R.value ?? ''} ${R.holders.map(h => `${h.name} (${h.when})`).join(', ')}`);
