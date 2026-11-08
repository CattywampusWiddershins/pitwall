/* Pitwall — Follow the Real Season. Part of the renderer, split into files that load in order (see index.html).
   A save that's always there beside your careers and follows the real Formula 1 season with nothing to do: every real
   season from the first in the bundled history, then this year's as it happens. Its results come from the Jolpica F1
   API (fetched by the main process: the page itself may only talk to Pitwall), looked for when Pitwall opens and every
   20 minutes while it's open, and kept in the save, so the season is there without a connection too. It reads like a
   real season in a career (standings, the calendar, drivers, teams, circuits, the Hall of Fame, records, the World
   Map), with no driver of yours in it. */
'use strict';
const REAL_SAVE = 'real-season';
const REAL_POLL = 20 * 60e3;
// the API's constructors and circuits, by Pitwall's ids (where they differ)
const REAL_TEAM = { red_bull: 'redbull', aston_martin: 'aston', alphatauri: 'rb', toro_rosso: 'rb', racing_bulls: 'rb', sauber: 'audi', kick_sauber: 'audi', alfa: 'audi' };
const REAL_TRACK = { madring: 'mad', sepang: 'mal' };
const realTrack = (cid) => REAL_TRACK[cid] || W?.circuits?.find(x => x.id === cid)?.track || cid;
const realYear = () => new Date().getFullYear();

/* ------------------------------------------------------------- the save */
/** The real season's save: made the first time Pitwall opens with this, and given each new year's season as it comes. */
function ensureRealSave() {
  if (!window.api?.real && !window.__realTest) return null; // it needs the main process to reach the results
  let c = state.careers.find(x => x.realSeason); const year = realYear(); if (year <= HIST_TO) return c || null;
  if (!c) {
    c = { id: REAL_SAVE, realSeason: true, createdAt: new Date().toISOString(), type: 'driver', profile: { first: 'Real', last: 'season', abbr: 'F1', number: 0, nationality: '', bio: '' },
      customDrivers: [], media: [], seasons: [], rumours: [], startYear: year, real: { years: {} } };
    for (let y = HIST_FROM; y <= HIST_TO; y++) c.seasons.push(histSeason(y, c.seasons.length));
    state.careers.push(c);
  }
  c.real ||= { years: {} };
  // a season for every year since the bundled history ends, up to this one (each followed from its own results)
  for (let y = HIST_TO + 1; y <= year; y++) if (!c.seasons.some(s => s.year === y)) { c.real.years[y] ||= { schedule: [], races: {} }; c.seasons.push(realSeasonOf(c, y, c.seasons.length)); }
  return c;
}
/** A real season followed from the API, as the bundled history shapes a season: the races run, and those to come. */
function realSeasonOf(c, year, index) {
  const Y = c.real?.years?.[year] || { schedule: [], races: {} };
  const tpl = year === 2026 ? D.GRID_2026 : null; const drivers = {}; const teamRuns = {};
  const idOf = (x) => { const code = x.code || ''; if (code && D.DRIVERS[code]) return code; const known = Object.entries(H.bios).find(([, b]) => b.name === x.name)?.[0]; return known || code || x.id.slice(0, 3).toUpperCase(); };
  const classified = (t) => /^\d+$/.test(t);
  const status = (x) => classified(x.pt) ? 'FIN' : ['D', 'E'].includes(x.pt) ? 'DSQ' : (['W', 'F'].includes(x.pt) || /did not start|withdrew/i.test(x.status)) ? 'DNS' : 'DNF';
  const rows = (list) => { const leadLaps = +list[0]?.laps || 0; return list.map((x, k) => {
    const id = idOf(x); const tid = REAL_TEAM[x.team] || x.team; drivers[id] ||= [x.name, +x.number || 0, x.code || id];
    ((teamRuns[tid] ||= {})[id] = (teamRuns[tid][id] || 0) + 1);
    const st = status(x); let gap = '', down = 0;
    if (st === 'FIN') { const lapsDown = /^\+(\d+) Laps?$/.exec(x.status); if (k === 0) gap = x.time || ''; else if (x.time && !lapsDown) gap = x.time.startsWith('+') ? x.time : '+' + x.time; else down = lapsDown ? +lapsDown[1] : Math.max(1, leadLaps - +x.laps); }
    return [id, gap, st, down, +x.points || 0, tid]; }); };
  const rounds = [], upcoming = [];
  for (const r of Y.schedule) {
    const track = realTrack(r.circuit); const cal = D.CAL_2026.find(x => (x[4] || x[0]) === track || x[0] === track);
    const base = { id: track, name: cal?.[1] || r.name.replace(/ Grand Prix$/, ''), venue: cal?.[2] || r.cname, sprint: r.sprint, date: r.date, ...(cal?.[4] ? { track: cal[4] } : track !== (cal?.[0] || track) ? { track } : {}) };
    const R = Y.races[r.round];
    if (!R?.r?.length) { upcoming.push(base); continue; }
    const q = (R.q || []).map(x => { const t = [x.q1, x.q2, x.q3].map(parseLap).filter(v => v != null); const id = idOf(x); drivers[id] ||= [x.name, +x.number || 0, x.code || id]; return [id, t.length ? fmtLap(Math.min(...t)) : '', t.length ? 'FIN' : 'DNS']; });
    const fl = R.r.find(x => x.fl === '1'); const pole = R.r.find(x => +x.grid === 1);
    rounds.push({ ...base, laps: +R.r[0].laps || 0, q, pole: pole ? idOf(pole) : null, r: rows(R.r), fl: fl ? idOf(fl) : null, flLap: fl?.flTime || '', ...(R.s?.length ? { sprint: true, s: rows(R.s) } : {}) });
  }
  // the teams in the order of the grid's template, each with the two drivers who raced for it most
  const ids = [...new Set([...(tpl || []).map(t => t.id), ...Object.keys(teamRuns)])];
  const teams = ids.map(id => { const t = tpl?.find(x => x.id === id) || {}; const ran = Object.entries(teamRuns[id] || {}).sort((a, b) => b[1] - a[1]).map(([d]) => d);
    const ds = ran.length ? ran.slice(0, 2) : (t.drivers || []).slice(0, 2); for (const d of ds) drivers[d] ||= [anyName(d), D.DRIVERS[d]?.number || 0, d];
    return { id, name: t.name || D.TEAM_BIO[id]?.full || id, color: t.color || '#5E6A82', drivers: ds }; }).filter(t => t.drivers.length);
  return histSeason(year, index, { teams, drivers, rounds, upcoming, live: true });
}

/* ----------------------------------------------------------- following */
const realGet = async (path) => { const api = window.api?.real || window.__realTest; const t = api ? await api.get(path) : null; return t ? JSON.parse(t) : null; };
const realSleep = (ms) => new Promise(r => setTimeout(r, ms));
/** One look for new results: the year's schedule, then each race run since that isn't in yet (race, qualifying, sprint). */
async function realSync() {
  if (realSync.busy) return; const c = ensureRealSave(); if (!c) return; realSync.busy = true; let changed = false;
  try {
    const year = realYear(); const Y = c.real.years[year] ||= { schedule: [], races: {} };
    const sch = (await realGet(`${year}.json`))?.MRData?.RaceTable?.Races;
    if (sch?.length) {
      const next = sch.map(r => ({ round: +r.round, name: r.raceName, circuit: r.Circuit.circuitId, cname: r.Circuit.circuitName, loc: r.Circuit.Location.locality, country: r.Circuit.Location.country, date: r.date, sprint: !!r.Sprint }));
      if (JSON.stringify(next) !== JSON.stringify(Y.schedule)) { Y.schedule = next; changed = true; }
    }
    const today = new Date().toISOString().slice(0, 10);
    const row = (x) => ({ id: x.Driver.driverId, code: x.Driver.code, name: `${x.Driver.givenName} ${x.Driver.familyName}`, number: x.Driver.permanentNumber || x.number, team: x.Constructor.constructorId,
      pt: x.positionText, status: x.status, laps: x.laps, time: x.Time?.time || '', points: x.points, grid: x.grid, fl: x.FastestLap?.rank, flTime: x.FastestLap?.Time?.time });
    for (const r of Y.schedule) {
      if (r.date > today) continue; const have = Y.races[r.round]; if (have?.r?.length && (!r.sprint || have.s?.length)) continue;
      const res = (await realGet(`${year}/${r.round}/results.json?limit=100`))?.MRData?.RaceTable?.Races?.[0]; await realSleep(400);
      if (!res?.Results?.length) continue; // not in yet
      const q = (await realGet(`${year}/${r.round}/qualifying.json?limit=100`))?.MRData?.RaceTable?.Races?.[0]?.QualifyingResults || []; await realSleep(400);
      const s = r.sprint ? (await realGet(`${year}/${r.round}/sprint.json?limit=100`))?.MRData?.RaceTable?.Races?.[0]?.SprintResults || [] : []; if (r.sprint) await realSleep(400);
      Y.races[r.round] = { r: res.Results.map(row), q: q.map(x => ({ id: x.Driver.driverId, code: x.Driver.code, name: `${x.Driver.givenName} ${x.Driver.familyName}`, number: x.Driver.permanentNumber || x.number, q1: x.Q1, q2: x.Q2, q3: x.Q3 })), s: s.map(row) };
      changed = true;
    }
    c.real.checked = new Date().toISOString();
    if (changed) {
      const k = c.seasons.findIndex(x => x.year === year); if (k >= 0) c.seasons[k] = realSeasonOf(c, year, c.seasons[k].index);
      renderGen++; store.save(); if (career() === c) render();
    }
  } catch (e) { console.warn('Real season:', e); }
  finally { realSync.busy = false; }
}
/** Start following: a look now, then every 20 minutes while Pitwall is open. */
function realStart() {
  if (!ensureRealSave()) return;
  setTimeout(realSync, 4000); clearInterval(realStart.t); realStart.t = setInterval(realSync, REAL_POLL);
}
/** The views the real season has: what reads a season, with nothing of a career's. */
const REAL_VIEWS = ['calendar', 'weekend', 'standings', 'forecast', 'drivers', 'driver', 'teams', 'team', 'tracks', 'track', 'world', 'hof', 'records', 'h2h', 'settings'];
