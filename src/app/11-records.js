/* Pitwall — Race memory, dates, records, rivalries and battles. Part of the renderer, split into files that load in order (see index.html). */
'use strict';
/* ------------------------------------------------------------ race memory */
/**
 * What the paddock remembers going into round ri: the defending champion, who won and took pole last time out,
 * and every driver's current run of wins, podiums, poles, points finishes and Driver of the Day awards.
 */
function raceMemory(c, s, ri) {
  const rounds = activeRounds(s);
  const prev = c.seasons[s.index - 1];
  let defending = null;
  if (prev && roundsDone(prev) === activeRounds(prev).length) defending = driverStandings(prev)[0]?.id || null;
  if (!defending) defending = Object.entries(D.DRIVER_BIO).find(([, b]) => b.titles?.includes(s.year - 1))?.[0] || null;
  const runs = {}; const get = (id) => runs[id] ||= { wins: 0, podiums: 0, poles: 0, points: 0, dotd: 0 };
  let lastWinner = null, lastPole = null, lastRound = null, lastDotd = null;
  for (let i = 0; i < ri; i++) {
    const ses = s.weekends[rounds[i].id]?.sessions || {};
    if (ses.Q?.done) {
      const pole = ses.Q.results.find(x => !OUT.includes(x.st))?.d;
      for (const x of ses.Q.results) { const o = get(x.d); o.poles = x.d === pole ? o.poles + 1 : 0; }
      lastPole = pole;
    }
    if (!ses.R?.done) continue;
    const d = driverOfTheDay(s, i)?.id;
    ses.R.results.forEach((x, k) => {
      const o = get(x.d); const fin = !OUT.includes(x.st);
      o.wins = fin && k === 0 ? o.wins + 1 : 0;
      o.podiums = fin && k < 3 ? o.podiums + 1 : 0;
      o.points = fin && k < 10 ? o.points + 1 : 0;
      o.dotd = x.d === d ? o.dotd + 1 : 0;
    });
    lastWinner = ses.R.results.find(x => !OUT.includes(x.st))?.d || null; lastRound = rounds[i]; lastDotd = d || null;
  }
  return { defending, lastWinner, lastPole, lastRound, lastDotd, run: (id) => runs[id] || { wins: 0, podiums: 0, poles: 0, points: 0, dotd: 0 } };
}
const streakWord = (n) => numWord(n) === String(n) ? String(n) : numWord(n);

/* ---------------------------------------------------------- dates & ages */
const DAY = 86400000;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const utc = (y, m, d) => new Date(Date.UTC(y, m - 1, d));
const parseDay = (str) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str || ''); return m ? utc(+m[1], +m[2], +m[3]) : null; };
const fmtDay = (d, year = false) => d ? `${d.getUTCDate()} ${MON[d.getUTCMonth()]}${year ? ' ' + d.getUTCFullYear() : ''}` : '';
/** Race day of every round: the real calendar in 2025 and 2026, the same weekend in later years. */
function raceDates(s) {
  const out = {}; let prev = null;
  for (const r of activeRounds(s)) {
    let d = null;
    const real = r.date ? r.date.slice(5) : D.RACE_DATES[s.year]?.[r.id];
    if (real) { const [m, dd] = real.split('-').map(Number); d = utc(s.year, m, dd); }
    else {
      const tpl = D.RACE_DATES[2026][r.id] || D.RACE_DATES[2025][r.id];
      if (tpl) {
        const [m, dd] = tpl.split('-').map(Number);
        d = utc(s.year, m, dd);
        const want = D.SATURDAY_RACES.includes(r.id) ? 6 : 0;
        let diff = (want - d.getUTCDay() + 7) % 7; if (diff > 3) diff -= 7;
        d = new Date(d.getTime() + diff * DAY);
      }
    }
    // a reordered calendar keeps its order: never earlier than the round before
    if (!d || (prev && d <= prev)) d = new Date((prev ? prev.getTime() : utc(s.year, 3, 1).getTime()) + 7 * DAY);
    out[r.id] = d; prev = d;
  }
  return out;
}
const _dateCache = new WeakMap();
function roundDate(s, r) {
  let v = _dateCache.get(s);
  if (!v || v.gen !== renderGen) { v = { gen: renderGen, d: raceDates(s) }; _dateCache.set(s, v); }
  return r ? v.d[r.id] || null : null;
}
/** "14–16 Mar 2025": Friday to race day (Thursday to Saturday for a Saturday race). */
function weekendTxt(s, r) {
  const d = roundDate(s, r); if (!d) return '';
  const a = new Date(d.getTime() - 2 * DAY);
  return `${a.getUTCMonth() === d.getUTCMonth() ? a.getUTCDate() : fmtDay(a)}–${fmtDay(d)} ${d.getUTCFullYear()}`;
}
function bornOf(c, id) {
  if (id === PLAYER_ID) return c.profile.born || null;
  const cd = c.customDrivers?.find(x => x.id === id) || c.generated?.[id];
  return cd ? cd.born || null : D.DRIVER_BIO[id]?.born || null;
}
function ageParts(born, date) {
  const b = typeof born === 'string' ? parseDay(born) : born;
  if (!b || !date) return null;
  const by = b.getUTCFullYear(), bm = b.getUTCMonth() + 1, bd = b.getUTCDate();
  let y = date.getUTCFullYear() - by;
  let last = utc(by + y, bm, bd);
  if (last > date) { y--; last = utc(by + y, bm, bd); }
  return { y, d: Math.round((date - last) / DAY), days: Math.round((date - b) / DAY) };
}
const ageTxt = (a) => a ? `${a.y}y ${a.d}d` : '–';
/** The career's "today": the latest race logged, or the opening race if none is. */
function careerNow(c) {
  const s = c.seasons[c.seasons.length - 1]; const rs = activeRounds(s);
  const done = rs.filter(r => s.weekends[r.id]?.sessions?.R?.done);
  return roundDate(s, done[done.length - 1] || rs[0]);
}
const ageNow = (c, id) => ageParts(bornOf(c, id), careerNow(c))?.y ?? null;

/* ------------------------------------------------- records & milestones */
const WIN_MS = (n) => n === 1 || n % 10 === 0 || n % 25 === 0;
const _tlCache = new WeakMap();
function careerTimeline(c) {
  let v = _tlCache.get(c);
  if (!v || v.gen !== renderGen) { v = { gen: renderGen, tl: buildTimeline(c) }; _tlCache.set(c, v); }
  return v.tl;
}
/** Who set a record event: the driver (or team) and anyone who matched them at the same event. */
const recNames = (tl, e) => [e, ...(e.co || [])].map(x => x.team ? x.team.name : tl.nameOf(x.id));
/** The holders before a record event, without the ones who set it. */
const recPrev = (e) => e.prev.holders.filter(h => h.id !== e.id && !e.co?.some(o => o.id === h.id));
/**
 * Replays the whole career in date order, starting from each driver's and team's real record at the
 * start of 2025. Produces the live record book and a list of milestones and records set along the way.
 */
function buildTimeline(c) {
  const known = allKnownDrivers(c, c.seasons[c.seasons.length - 1]);
  const nameOf = (id) => id === PLAYER_ID ? `${c.profile.first} ${c.profile.last}` : known[id]?.name || H.allTime?.[id]?.n || id;
  const teamRoot = (id) => D.TEAM_BIO[id]?.lineage?.[0] || id;
  const recs = {};
  for (const R of D.RECORDS) {
    const holders = R.holders.map(h => ({ ...h, id: h.key, real: true, disp: h.born ? ageTxt(ageParts(h.born, parseDay(h.date))) : null }));
    const value = R.group === 'age' ? (holders[0] ? ageParts(holders[0].born, parseDay(holders[0].date)).days : null) : R.value;
    recs[R.id] = { ...R, cmp: R.group === 'age' && !R.max ? 'min' : 'max', value, holders, start: { value, holders: holders.map(h => ({ ...h })) } };
  }
  const events = [];
  const P = {};
  const getP = (id) => P[id] ||= (() => {
    const b = id === PLAYER_ID ? null : D.DRIVER_BIO[id];
    return { starts: b?.starts || 0, wins: b?.wins || 0, podiums: b?.podiums || 0, poles: b?.poles || 0, fls: b?.fls || 0, pts: b?.pts || 0, titles: b?.titles?.length || 0, lastTitle: b?.titles?.slice(-1)[0] ?? null,
      titleStreak: D.STREAKS_2025.titleStreak[id] || 0, winStreak: 0, podStreak: 0, poleStreak: 0, ptsStreak: 0, scored: (b?.pts || 0) > 0, from: {} };
  })();
  const T = {};
  const getT = (id) => T[teamRoot(id)] ||= (() => { const b = D.TEAM_BIO[teamRoot(id)]; return { wins: b?.wins || 0, titles: b?.conTitles?.length || 0, lastTitle: b?.conTitles?.slice(-1)[0] ?? null, streak: D.STREAKS_2025.teamStreak[teamRoot(id)] || 0 }; })();
  // The all-time lists (every driver since 1950), top 15 of each, seeded with everyone's record at the end of 2015.
  // A driver moving into the top ten, or up it, is a milestone (and a graphic); the lead is a record, told as one.
  // Titles only count in the top five: further down, too many drivers share a number.
  const LISTS = { wins: 'wins', podiums: 'podiums', poles: 'pole positions', starts: 'Grand Prix starts', pts: 'career points', titles: 'world titles' };
  const LIST_J = { starts: 0, wins: 1, podiums: 2, poles: 3, pts: 5, titles: 6 };
  const LIST_TOP = { titles: 5 }; const TOP_WORD = { 5: 'five', 10: 'ten' };
  const TOP = {}; {
    const tot = {}; for (const [id, A] of Object.entries(H.allTime || {})) tot[id] = Object.values(A.y).reduce((a, v) => a.map((x, j) => x + v[j]), [0, 0, 0, 0, 0, 0, 0]);
    for (const k of Object.keys(LISTS)) TOP[k] = Object.entries(tot).map(([id, t]) => ({ id, v: t[LIST_J[k]] })).sort((a, b) => b.v - a.v).slice(0, 15);
  }
  const rankIn = (L, id) => { const e = L.find(x => x.id === id); return e ? 1 + L.filter(x => x.id !== id && x.v > e.v).length : null; };
  function listMove(id, k, mile, where) {
    const L = TOP[k]; const v = getP(id)[k]; const min = L.length >= 15 ? L[L.length - 1].v : -1;
    const e = L.find(x => x.id === id); if (!e && v <= min) return;
    const was = rankIn(L, id); const old = e ? e.v : null;
    if (e) e.v = v; else L.push({ id, v }); L.sort((a, b) => b.v - a.v); L.length = Math.min(L.length, 15);
    const top = LIST_TOP[k] || 10;
    const now = rankIn(L, id); if (!now || now > top || now < 2 || (was != null && now >= was)) return;
    const passed = L.filter(x => x.id !== id && x.v < v && (old == null || x.v >= old)).map(x => nameOf(x.id));
    const level = L.filter(x => x.id !== id && x.v === v).map(x => nameOf(x.id));
    const fmt = (n) => k === 'pts' ? fmtPts(n) : n;
    const text = was == null || was > top
      ? `${nameOf(id)} enters the all-time top ${TOP_WORD[top]} for ${LISTS[k]}, ${ordWord(now)} on ${fmt(v)}${level.length ? `, level with ${listJoin(level)}` : ''}`
      : !passed.length && level.length ? `${nameOf(id)} draws level with ${listJoin(level)} for ${ordWord(now)} on the all-time ${LISTS[k]} list`
      : `${nameOf(id)} moves up to ${ordWord(now)} on the all-time ${LISTS[k]} list${passed.length ? `, passing ${listJoin(passed.slice(-3))}` : ''}${level.length ? `, level with ${listJoin(level)}` : ''}`;
    // the graphic's rows: the top ten, the driver who moved first among those level with them, and never left off it
    // (drawing level for tenth with two others makes it twelve)
    const ord = L.slice().sort((a, b) => b.v - a.v || (a.id === id ? -1 : b.id === id ? 1 : 0));
    let n = Math.max(10, ord.findIndex(x => x.id === id) + 1); while (n < ord.length && ord[n].v === ord[n - 1].v && ord[n - 1].v === v) n++;
    mile(id, text, k === 'titles' ? 5 : 3, { stat: k, rank: now, from: was, rows: ord.slice(0, n).map(x => ({ id: x.id, name: nameOf(x.id), v: x.v })) });
  }
  const spanFrom = (p, key, where) => p.from[key] && p.from[key] !== where.when ? `${p.from[key]} to ${where.when}` : where.when;
  function bump(rid, id, value, where, { team = null, disp = null, when = null } = {}) {
    const R = recs[rid]; if (value == null) return;
    const better = R.value == null || (R.cmp === 'max' ? value > R.value : value < R.value);
    const holder = { id, name: team ? team.name : nameOf(id), team: !!team, when: when || where.when, disp, career: !where.hist, real: !!where.hist, seasonIdx: where.seasonIdx };
    // a record set earlier at this same event, by someone else: going past it at the same event takes over that
    // event (against the record as it stood before the weekend); matching it shares it
    const key = `${where.seasonIdx}:${where.ri}`; const same = R.last?.key === key && R.last.ev.id !== id && !R.last.ev.co?.some(o => o.id === id) ? R.last.ev : null;
    if (better) {
      const self = R.holders.length === 1 && R.holders[0].id === id;
      if (same) events.splice(events.indexOf(same), 1);
      if (!self) { const ev = { type: 'record', kind: 'broken', rid, id, team, value, disp, prev: same ? same.prev : { value: R.value, holders: R.holders.map(h => ({ ...h })) }, ...where }; events.push(ev); R.last = { key, ev }; }
      if (self && R.group === 'total') {
        // a holder adding to their own record keeps it: show the span, and only tag it if it was set in the career
        const old = R.holders[0]; const since = old.since || /^(\d{4})/.exec(old.when || '')?.[1];
        Object.assign(holder, { real: old.real, career: old.career, since });
        if (since) holder.when = since === String(where.year) ? since : `${since}–${where.year}`;
      }
      R.value = value; R.holders = [holder];
    } else if (value === R.value && same) {
      (same.co ||= []).push(team ? { id, team } : { id }); R.holders.push(holder);
    } else if (value === R.value && !R.holders.some(h => h.id === id)) {
      events.push({ type: 'record', kind: 'equalled', rid, id, team, value, disp, prev: { value: R.value, holders: R.holders.map(h => ({ ...h })) }, ...where });
      R.holders.push(holder);
    }
  }
  for (const s of c.seasons) {
    const rounds = activeRounds(s);
    const done = rounds.filter(r => s.weekends[r.id]?.sessions?.R?.done).length;
    const complete = done > 0 && done === rounds.length;
    const fh = fightHistory(s, 'driver'), fht = fightHistory(s, 'team');
    const final = complete ? titleMath(s, 'driver', rounds.length) : null;
    const finalT = complete ? titleMath(s, 'team', rounds.length) : null;
    const champ = fh.decidedAt ? { i: fh.decidedAt.i, id: fh.decidedAt.champion.id } : complete ? { i: rounds.length - 1, id: final.rows[0].id } : null;
    const champT = fht.decidedAt ? { i: fht.decidedAt.i, id: fht.decidedAt.champion.id } : complete ? { i: rounds.length - 1, id: finalT.rows[0].id } : null;
    const SS = {}; const sget = (id) => SS[id] ||= { wins: 0, pods: 0, poles: 0, pts: 0 };
    const teamWins = {};
    rounds.forEach((r, ri) => {
      const ses = s.weekends[r.id]?.sessions; if (!ses) return;
      const date = roundDate(s, r);
      const where = { seasonIdx: s.index, hist: isHist(s), ri, r, date, year: s.year, when: `${s.year} ${gpShort(r)}` };
      const ms = [];
      const age = (id, d = date) => ageParts(bornOf(c, id), d);
      const mile = (id, text, rank = 1, list = null) => ms.push({ id, text, rank, ...(list ? { list } : {}) });
      const addPts = (id, pts) => {
        if (!pts) return;
        const p = getP(id); const before = p.pts;
        p.pts += pts; sget(id).pts += pts;
        if (!p.scored) { p.scored = true; mile(id, `${nameOf(id)} scores ${pts > 1 ? 'first F1 points' : 'a first F1 point'}`, 3); const a = age(id); if (a) bump('youngPoints', id, a.days, where, { disp: ageTxt(a) }); }
        else if (Math.floor(before / 500) < Math.floor(p.pts / 500)) mile(id, `${nameOf(id)} passes ${Math.floor(p.pts / 500) * 500} career points`, 1);
        listMove(id, 'pts', mile, where);
        bump('pts', id, p.pts, where); bump('seasonPts', id, sget(id).pts, where, { when: String(s.year) });
      };
      if (ses.Q?.done) {
        const qd = new Date(date.getTime() - DAY);
        const pole = ses.Q.pole ?? ses.Q.results.find(x => !OUT.includes(x.st))?.d;
        for (const x of ses.Q.results) if (x.d !== pole && !OUT.includes(x.st)) getP(x.d).poleStreak = 0;
        if (pole) {
          const p = getP(pole); p.poles++; sget(pole).poles++;
          if (!p.poleStreak) p.from.pole = where.when;
          p.poleStreak++;
          if (p.poles === 1) { mile(pole, `${nameOf(pole)} takes a first pole position`, 4); const a = age(pole, qd); if (a) bump('youngPole', pole, a.days, where, { disp: ageTxt(a) }); }
          else if (p.poles % 10 === 0) mile(pole, `${nameOf(pole)} takes a ${ordWord(p.poles)} career pole`, 2);
          listMove(pole, 'poles', mile, where);
          bump('poles', pole, p.poles, where); bump('poleStreak', pole, p.poleStreak, where, { when: spanFrom(p, 'pole', where) }); bump('seasonPoles', pole, sget(pole).poles, where, { when: String(s.year) });
        }
      }
      if (ses.SPR?.done) ses.SPR.results.forEach((x, k) => addPts(x.d, pointsFor('SPR', k + 1, x.st, x.pts)));
      if (ses.R?.done) {
        const fl = fastestOf(ses.R);
        ses.R.results.forEach((x, k) => {
          if (x.st === 'DNS') return;
          const id = x.d; const p = getP(id); const pos = k + 1; const out = OUT.includes(x.st);
          const pts = pointsFor('R', pos, x.st, x.pts);
          p.starts++;
          if (p.starts === 1) { const a = age(id); mile(id, `${nameOf(id)} makes a Formula 1 debut${a ? ` aged ${a.y}` : ''}`, 3); if (a) bump('youngStart', id, a.days, where, { disp: ageTxt(a) }); }
          else if (p.starts % 50 === 0) mile(id, `${nameOf(id)} starts a ${ordWord(p.starts)} Grand Prix`, 2);
          listMove(id, 'starts', mile, where);
          bump('starts', id, p.starts, where);
          addPts(id, pts);
          if (pts > 0) { if (!p.ptsStreak) p.from.pts = where.when; p.ptsStreak++; bump('ptsStreak', id, p.ptsStreak, where, { when: spanFrom(p, 'pts', where) }); } else p.ptsStreak = 0;
          if (!out && pos <= 3) {
            p.podiums++; sget(id).pods++;
            if (!p.podStreak) p.from.pod = where.when;
            p.podStreak++;
            if (p.podiums === 1) { mile(id, `${nameOf(id)} stands on an F1 podium for the first time`, 4); const a = age(id); if (a) bump('youngPodium', id, a.days, where, { disp: ageTxt(a) }); }
            else if (p.podiums % 25 === 0) mile(id, `${nameOf(id)} scores a ${ordWord(p.podiums)} career podium`, 2);
            listMove(id, 'podiums', mile, where);
            bump('podiums', id, p.podiums, where); bump('podStreak', id, p.podStreak, where, { when: spanFrom(p, 'pod', where) }); bump('seasonPods', id, sget(id).pods, where, { when: String(s.year) });
          } else p.podStreak = 0;
          if (!out && pos === 1) {
            p.wins++; sget(id).wins++;
            if (!p.winStreak) p.from.win = where.when;
            p.winStreak++;
            const a = age(id);
            if (WIN_MS(p.wins)) mile(id, p.wins === 1 ? `${nameOf(id)} wins a Grand Prix for the first time${a ? `, aged ${a.y}` : ''}` : `${nameOf(id)} takes a ${ordWord(p.wins)} Grand Prix win`, p.wins === 1 ? 5 : 2);
            if (a) { bump('youngWin', id, a.days, where, { disp: ageTxt(a) }); bump('oldWin', id, a.days, where, { disp: ageTxt(a) }); }
            listMove(id, 'wins', mile, where);
            bump('wins', id, p.wins, where); bump('winStreak', id, p.winStreak, where, { when: spanFrom(p, 'win', where) }); bump('seasonWins', id, sget(id).wins, where, { when: String(s.year) });
            const t = teamOf(s, id);
            if (t) {
              const tt = getT(t.id); tt.wins++; teamWins[t.id] = (teamWins[t.id] || 0) + 1;
              if (tt.wins === 1) mile(id, `${t.name} win a Grand Prix for the first time`, 4);
              else if (tt.wins % 50 === 0) mile(id, `${t.name} take a ${ordWord(tt.wins)} Grand Prix win`, 2);
              bump('teamWins', t.id, tt.wins, where, { team: t }); bump('teamSeasonWins', t.id, teamWins[t.id], where, { team: t, when: String(s.year) });
            }
          } else p.winStreak = 0;
          if (p.wins === 0) bump('winless', id, p.starts, where);
        });
        if (fl) { const p = getP(fl); p.fls++; bump('fls', fl, p.fls, where); }
      }
      if (champ && champ.i === ri) {
        const id = champ.id; const p = getP(id);
        p.titleStreak = p.lastTitle === s.year - 1 ? p.titleStreak + 1 : 1; p.titles++; p.lastTitle = s.year;
        const a = age(id);
        mile(id, p.titles === 1 ? `${nameOf(id)} becomes world champion for the first time${a ? `, aged ${a.y}` : ''}` : `${nameOf(id)} wins a ${ordWord(p.titles)} world title`, 6);
        listMove(id, 'titles', mile, where);
        bump('titles', id, p.titles, where, { when: String(s.year) }); bump('titleStreak', id, p.titleStreak, where, { when: `${s.year - p.titleStreak + 1}–${s.year}` });
        if (a) { if (p.titles <= 8) bump('youngTitle' + p.titles, id, a.days, where, { disp: ageTxt(a), when: String(s.year) }); bump('oldTitle', id, a.days, where, { disp: ageTxt(a), when: String(s.year) }); }
      }
      if (champT && champT.i === ri) {
        const t = s.teams.find(x => x.id === champT.id); const tt = getT(champT.id);
        tt.streak = tt.lastTitle === s.year - 1 ? tt.streak + 1 : 1; tt.titles++; tt.lastTitle = s.year;
        bump('teamTitles', t.id, tt.titles, where, { team: t, when: String(s.year) }); bump('teamStreak', t.id, tt.streak, where, { team: t, when: `${s.year - tt.streak + 1}–${s.year}` });
      }
      if (complete && ri === rounds.length - 1) {
        if (final.rows[1]) bump('titleMargin', final.rows[0].id, final.margin, where, { when: String(s.year) });
        for (const [id, o] of Object.entries(SS)) if (o.wins) bump('seasonWinPct', id, Math.round(o.wins / rounds.length * 1000) / 10, where, { when: `${s.year}, ${o.wins} of ${rounds.length}` });
      }
      if (ms.length) events.push({ type: 'milestones', items: ms.sort((a, b) => b.rank - a.rank), ...where });
    });
  }
  return { recs, events, P, T, nameOf };
}
const recVal = (R, h) => R.group === 'age' ? (h?.disp || '–') : R.value == null ? '–' : R.pct ? `${R.value.toFixed(1)}%` : fmtPts(R.value);

const REC_GROUPS = [['age', 'Age records', 'Ages on the day: race day, or the Saturday for a pole.'], ['total', 'Career totals', 'Real totals up to 2024 keep counting through your career.'], ['streak', 'Streaks', 'Runs of consecutive races (or seasons) entered.'], ['season', 'In a single season', ''], ['team', 'Constructors', '']];
// what each total/streak record counts, to find who on the grid is closest
const REC_STAT = { titles: 'titles', wins: 'wins', poles: 'poles', podiums: 'podiums', starts: 'starts', pts: 'pts', fls: 'fls', winStreak: 'winStreak', podStreak: 'podStreak', poleStreak: 'poleStreak', ptsStreak: 'ptsStreak' };
function renderRecords() {
  const c = career(); const s = latestSeason();
  const tl = careerTimeline(c);
  const grid = gridIds(s);
  // who on today's grid is closest to a record: { id, name, v, team } or null
  const chase = (R) => {
    const key = REC_STAT[R.id];
    if (R.group === 'team' && (R.id === 'teamWins' || R.id === 'teamTitles')) {
      const k = R.id === 'teamWins' ? 'wins' : 'titles';
      const teamVal = (t) => {
        const root = D.TEAM_BIO[t.id]?.lineage?.[0] || t.id;
        if (tl.T[root]) return tl.T[root][k];
        return k === 'wins' ? D.TEAM_BIO[root]?.wins || 0 : D.TEAM_BIO[root]?.conTitles?.length || 0;
      };
      const best = s.teams.map(t => ({ t, v: teamVal(t) })).filter(x => !R.holders.some(h => h.id === x.t.id)).sort((a, b) => b.v - a.v)[0];
      return best ? { id: best.t.id, name: best.t.name, v: best.v, team: true } : null;
    }
    if (!key && R.id !== 'winless') return null;
    const val = (id) => {
      const p = tl.P[id] || (D.DRIVER_BIO[id] ? { ...D.DRIVER_BIO[id], titles: D.DRIVER_BIO[id].titles?.length || 0, winStreak: 0, podStreak: 0, poleStreak: 0, ptsStreak: 0 } : null);
      if (!p) return null;
      return R.id === 'winless' ? (p.wins ? null : p.starts) : p[key];
    };
    const best = grid.filter(id => !R.holders.some(h => h.id === id)).map(id => ({ id, v: val(id) })).filter(x => x.v).sort((a, b) => b.v - a.v)[0];
    return best ? { id: best.id, name: tl.nameOf(best.id), v: best.v } : null;
  };
  // a holder's colours: a team's own, a driver's latest team in this career, else neutral
  const colOf = (id, team) => { if (team) return (s.teams.find(t => t.id === id) || teamMeta(c, id)).color; for (let i = c.seasons.length - 1; i >= 0; i--) { const t = teamOf(c.seasons[i], id); if (t) return t.color; } return '#5E6A82'; };
  const pic = (h) => { if (h.team) { const u = teamLogoUrl(c, h.id) || teamLogoUrl(c, teamRoot(h.id)); return u ? `<img class="lg" src="${esc(u)}" alt="">` : `<i>${esc((D.TEAM_BIO[h.id]?.short || h.name.slice(0, 3)).toUpperCase())}</i>`; }
    const u = driverPhoto(c, h.id); return u ? `<img class="ph" src="${esc(u)}" alt="">` : `<i>${esc(h.name.split(/\s+/).map(x => x[0]).join('').slice(0, 3).toUpperCase())}</i>`; };
  const label = (R) => R.label[0].toUpperCase() + R.label.slice(1);
  const broken = tl.events.filter(e => e.type === 'record' && !e.hist);
  const tab = REC_GROUPS.some(([g]) => g === ui.recTab) ? ui.recTab : 'total';
  // the record you're nearest, among those you're closest to on the grid
  const mine = D.RECORDS.map(R0 => tl.recs[R0.id]).map(R => ({ R, ch: R.group === 'age' || R.group === 'season' ? null : chase(R) })).filter(x => x.ch?.id === PLAYER && x.R.value > 0).sort((a, b) => b.ch.v / b.R.value - a.ch.v / a.R.value)[0];
  const card = (R0) => {
    const R = tl.recs[R0.id]; const hs = R.holders; const h0 = hs[0]; const g = R.group;
    const ch = g === 'age' || g === 'season' ? null : chase(R);
    const col = h0 ? colOf(h0.id, h0.team) : '#5E6A82'; const me = hs.some(h => h.id === PLAYER);
    const fig = !hs.length ? '–' : g === 'age' ? esc(h0.disp || '–') : recVal(R);
    const when = [...new Set(hs.map(h => h.when).filter(Boolean))].join(' · ');
    return `<div class="lv-rec ${me ? 'me' : ''}" style="--c:${col}">${hs.some(h => h.career) ? '<span class="lv-ctag">CAREER</span>' : ''}
      <div class="pic">${h0 ? pic(h0) : '<i>–</i>'}</div>
      <div class="tx"><span class="what">${esc(label(R))}</span><span class="fig">${fig}</span>
        <span class="who">${hs.length ? esc(listJoin(hs.map(h => h.name))) : 'Nobody yet'}${when ? `<span>${esc(when)}</span>` : ''}</span>
        ${ch ? `<div class="lv-chase" style="--cc:${colOf(ch.id, ch.team)}"><span>Closest: ${esc(ch.name)}${ch.id === PLAYER ? ' (you)' : ''}</span><b>${fmtPts(ch.v)}</b>${R.value > 0 ? `<span class="t"><i style="width:${Math.min(100, ch.v / R.value * 100)}%"></i></span>` : ''}</div>` : ''}
      </div></div>`;
  };
  const note = REC_GROUPS.find(([g]) => g === tab)[2];
  return `<div class="page">
    <div class="page-head"><div><h1>Records</h1><div class="sub">The F1 record book: real records up to ${firstPlayed(c).year - 1}, then updated by every session in your career. Records set in your career are tagged.</div></div></div>
    <div class="lv-tiles">
      ${lvTile('Records tracked', D.RECORDS.length)}
      ${lvTile('Broken in career', broken.filter(e => e.kind === 'broken').length)}
      ${lvTile('Equalled', broken.filter(e => e.kind === 'equalled').length)}
      ${lvTile(isPrincipal(c) ? 'Held by your driver' : 'Held by you', Object.values(tl.recs).filter(R => R.holders.some(h => h.id === PLAYER)).length, '', mine ? `Closest: ${esc(mine.R.label)}, ${fmtPts(mine.ch.v)} of ${fmtPts(mine.R.value)}` : '')}
      ${lvTile(isPrincipal(c) ? 'Lead driver’s age' : 'Your age', bornOf(c, PLAYER) ? `<span style="font-size:22px">${ageTxt(ageParts(bornOf(c, PLAYER), careerNow(c)))}</span>` : '–', '', bornOf(c, PLAYER) ? 'at the latest race' : 'Add a date of birth in Settings')}
      ${lvTile('Career date', `<span style="font-size:22px">${fmtDay(careerNow(c), true)}</span>`)}
    </div>
    <div class="row" style="justify-content:space-between"><div class="seg">${REC_GROUPS.map(([g, title]) => `<button data-act="rec-tab" data-v="${g}" class="${tab === g ? 'on' : ''}">${title.replace('In a single season', 'In a season').replace(' records', '')}</button>`).join('')}</div>${note ? `<span class="muted" style="font-size:12px">${note}</span>` : ''}</div>
    <div class="lv-rlayout">
      <div class="lv-rcards">${D.RECORDS.filter(R => R.group === tab).map(card).join('')}</div>
      <div class="panel"><div class="panel-h"><h2>Set in your career</h2></div><div class="panel-b">${broken.length ? `<div class="lv-timeline">${broken.slice().reverse().map(e => { const R = tl.recs[e.rid]; const by = e.team ? e.team.id : e.id;
        return `<div class="lv-ev" style="--c:${by ? colOf(by, !!e.team) : 'var(--team)'}"><b>${esc(label(R))}</b> <span><span class="tag ${e.kind === 'broken' ? 'next' : ''}">${e.kind}</span></span>
          <div>${esc(listJoin(recNames(tl, e)))}, ${R.group === 'age' ? esc(e.disp) : R.pct ? e.value.toFixed(1) + '%' : fmtPts(e.value)}</div>
          <div class="muted">${esc(e.when)} · ${fmtDay(e.date, true)}${recPrev(e).length ? ` · was ${esc(listJoin(recPrev(e).map(h => h.name)))}` : ''}</div></div>`; }).join('')}</div>`
        : '<div class="empty">No records broken yet. They will appear here, and in Stories, as your career writes them.</div>'}</div></div>
    </div>
  </div>`;
}

/* -------------------------------------------------------------- rivalries */
// Title rivals: from the sixth race, anyone within 25 points of the championship leader (43 for constructors) is his
// title rival. The rivalry cools as the gap grows and is over at 75 points (129 for constructors), or as soon as the
// chaser can no longer win the title; it can flare up again. Rivalries aren't won, they just fade.
// Archrivals: title rivals for 70% of a season's rounds. Each driver (and team) has at most one: a new pair takes over
// only if they were closer, on average, than both of their current archrivalries. An archrivalry ends when one of the
// two retires (or leaves the grid, for a team), and the retirement story looks back on it.
// Manual rivalries: started from Stories after contact, a crash or hard racing. They run for the next five races.
const RIVAL_BANDS = { driver: { on: 25, off: 75 }, team: { on: 43, off: 129 } };
const ARCH_SHARE = 0.7, FEUD_RACES = 5;
const pairKey = (a, b) => a < b ? `${a}|${b}` : `${b}|${a}`;
/** A team's lasting identity (Audi carries Sauber's), so a renamed team keeps its rivalries. */
const teamRoot = (id) => D.TEAM_BIO[id]?.lineage?.[0] || id;
/** How heated a title rivalry is, 0 to 1: the closer the points, the hotter. */
const rivalHeat = (kind, gap) => Math.max(0, Math.min(1, 1 - gap / RIVAL_BANDS[kind].off));
const _rivCache = new WeakMap();
function rivalries(c) {
  let v = _rivCache.get(c);
  if (!v || v.gen !== renderGen) { v = { gen: renderGen, r: buildRivalries(c) }; _rivCache.set(c, v); }
  return v.r;
}
/**
 * Replay every season round by round. Returns { at: { 'season:round' | 'season:end' → { active, arch } }, events,
 * seasons }: the title rivalries live after each round (with how close they are) and who is whose archrival.
 */
const _rivBase = new WeakMap();
function buildRivalries(c) {
  // real and simulated seasons never change: replay them once per career, then only the seasons you play
  const n = c.seasons.filter(isHist).length;
  let base = _rivBase.get(c);
  if (!base || base.n !== n) { base = { n, st: replayRivalries(c, c.seasons.slice(0, n), null) }; _rivBase.set(c, base); }
  return replayRivalries(c, c.seasons.slice(n), base.st).out;
}
/** Replay these seasons, carrying on from a previous replay's state (or from nothing). */
function replayRivalries(c, seasons, from) {
  const copy = (m) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, { ...v }]));
  const arch = from ? { driver: copy(from.arch.driver), team: copy(from.arch.team) } : { driver: {}, team: {} };
  const out = from ? { at: { ...from.out.at }, events: [...from.out.events], seasons: { ...from.out.seasons } } : { at: {}, events: [], seasons: {} };
  // when each driver's retirement was announced (the season it goes on record in)
  const retiredIn = {};
  for (const s of c.seasons) for (const tr of s.transfers || []) for (const st of tr.steps) if (st.to === 'retire' && retiredIn[st.driver] == null) retiredIn[st.driver] = s.index;
  const raced = from ? { ...from.raced } : {}; // driver -> last season index raced
  const snap = () => ({ driver: { ...arch.driver }, team: { ...arch.team } });
  for (const s of seasons) {
    const rounds = activeRounds(s); const N = rounds.length; const need = Math.ceil(N * ARCH_SHARE); const si = s.index;
    // archrivals who have gone: a retirement on record before this season, three seasons away, or a team off the grid
    const grid = new Set(gridIds(s)); const roots = new Set(s.teams.map(t => teamRoot(t.id)));
    for (const [id, a] of Object.entries(arch.driver)) {
      const goneNow = !grid.has(id) && ((retiredIn[id] != null && retiredIn[id] < si) || (raced[id] != null && si - raced[id] > 3));
      if (goneNow && arch.driver[id]) { out.events.push({ type: 'archGone', kind: 'driver', id, rival: a.rival, si, since: a }); delete arch.driver[a.rival]; delete arch.driver[id]; }
    }
    for (const [id, a] of Object.entries(arch.team)) if (!roots.has(id) && arch.team[id]) { delete arch.team[a.rival]; delete arch.team[id]; }
    const st = { driver: {}, team: {} }; out.seasons[si] = st;
    let last = null;
    for (let i = 0; i < N; i++) {
      if (!s.weekends[rounds[i].id]?.sessions?.R?.done) break;
      const active = [];
      if (i >= 4) for (const kind of ['driver', 'team']) {
        const B = RIVAL_BANDS[kind]; const m = titleMath(s, kind, i + 1); const L = m.rows[0]; if (!L) continue;
        const idOf = (x) => kind === 'team' ? teamRoot(x.id) : x.id;
        const lead = idOf(L); const live = new Set();
        for (const x of m.rows.slice(1)) {
          const id = idOf(x); const key = pairKey(lead, id); const gap = L.pts - x.pts;
          let p = st[kind][key];
          if (!x.alive || m.decided || gap >= B.off) continue;
          if (!p?.active && gap <= B.on) {
            p = st[kind][key] ||= { kind, a: lead, b: id, rounds: 0, gaps: [], arch: false, stints: 0 };
            p.active = true; p.stints++; p.band = null; p.a = lead; p.b = id;
            out.events.push({ type: 'start', kind, a: lead, b: id, gap, si, ri: i, rematch: arch[kind][lead]?.rival === id ? { ...arch[kind][lead] } : null, again: p.stints > 1 });
          }
          if (!p?.active) continue;
          live.add(key); p.rounds++; p.gaps.push(gap); p.a = lead; p.b = id;
          active.push({ kind, a: lead, b: id, gap, heat: rivalHeat(kind, gap) });
          // turning points: right on each other's tail, or drifting apart
          const band = gap <= B.on * 0.4 ? 'hot' : gap >= B.off * 0.66 ? 'cool' : 'mid';
          if (band !== p.band) { if (p.band && band !== 'mid') out.events.push({ type: band, kind, a: lead, b: id, gap, si, ri: i }); p.band = band; }
        }
        for (const p of Object.values(st[kind])) if (p.active && !live.has(pairKey(p.a, p.b))) {
          p.active = false;
          const rb = m.rows.find(x => idOf(x) === p.b);
          if (!m.decided) out.events.push({ type: 'end', kind, a: p.a, b: p.b, si, ri: i, gap: (m.rows.find(x => idOf(x) === p.a)?.pts ?? 0) - (rb?.pts ?? 0), out: !!rb && !rb.alive, swap: p.a !== lead });
        }
        // archrivals: rivals for 70% of the season; with several at once, the closest in the championship first
        const pos = Object.fromEntries(m.rows.map(x => [idOf(x), x.pos]));
        const ready = Object.values(st[kind]).filter(p => !p.arch && p.rounds >= need).sort((a, b) => Math.abs(pos[a.a] - pos[a.b]) - Math.abs(pos[b.a] - pos[b.b]) || avg(a.gaps) - avg(b.gaps));
        for (const p of ready) {
          p.arch = true; const g = avg(p.gaps);
          const A = arch[kind][p.a], Bq = arch[kind][p.b];
          if (A?.rival === p.b) { A.avg = Math.min(A.avg, g); Bq.avg = A.avg; continue; } // the same two again
          if ((A && g >= A.avg) || (Bq && g >= Bq.avg)) continue; // an older archrivalry was closer
          const replaced = [];
          for (const [me, old] of [[p.a, A], [p.b, Bq]]) if (old) { replaced.push({ id: me, old: old.rival, year: old.year }); delete arch[kind][old.rival]; }
          arch[kind][p.a] = { rival: p.b, si, year: s.year, avg: g, ri: i };
          arch[kind][p.b] = { rival: p.a, si, year: s.year, avg: g, ri: i };
          out.events.push({ type: 'arch', kind, a: p.a, b: p.b, si, ri: i, rounds: p.rounds, of: N, replaced });
        }
      }
      for (const [d, o] of Object.entries(seasonStatsCache(s))) if (o.byRound[rounds[i].id]?.r != null) raced[d] = si;
      last = out.at[`${si}:${i}`] = { active, arch: snap() };
    }
    out.at[`${si}:end`] = last || { active: [], arch: snap() };
  }
  return { arch, out, raced };
}
/** Rivalry state after round ri of season s (ri < 0: before the season). */
/** Your archrival (a driver id), or your team's archrival team (a team in s), from the rivalry system. */
function archRivalOf(c, s, ri = roundsDone(s) - 1) { return rivalsAt(c, s, ri).arch.driver[PLAYER]?.rival || null; }
function archRivalTeam(c, s, ri = roundsDone(s) - 1) {
  const root = s.playerTeamId && rivalsAt(c, s, ri).arch.team[teamRoot(s.playerTeamId)]?.rival;
  return root ? s.teams.find(t => teamRoot(t.id) === root) || null : null;
}
function rivalsAt(c, s, ri) {
  const R = rivalries(c);
  for (let i = ri; i >= 0; i--) if (R.at[`${s.index}:${i}`]) return R.at[`${s.index}:${i}`];
  const prev = c.seasons[s.index - 1];
  return (prev && R.at[`${prev.index}:end`]) || { active: [], arch: { driver: {}, team: {} } };
}
/** The season two archrivals became archrivals: who finished ahead, and whether it decided the title. */
function archSeason(c, kind, a, b, year) {
  const s = c.seasons.find(x => x.year === year); if (!s) return null;
  const st = seasonStatsCache(s);
  const rows = kind === 'team' ? constructorStandings(s, st).map(x => ({ id: teamRoot(x.team.id), pts: x.pts, pos: x.pos })) : driverStandings(s, st).map(x => ({ id: x.id, pts: x.pts, pos: x.pos }));
  const A = rows.find(x => x.id === a), B = rows.find(x => x.id === b); if (!A || !B) return null;
  const [w, l] = A.pos < B.pos ? [A, B] : [B, A];
  const complete = roundsDone(s) === activeRounds(s).length;
  return { s, year, winner: w.id, loser: l.id, margin: w.pts - l.pts, title: w.pos === 1 && decidedChamps(s, roundsDone(s), driverStandings(s), constructorStandings(s)).champ === w.id, complete };
}

/* What the press and the paddock say about title rivals, by how close it is. */
const RIVAL_QUOTES = {
  lead: { low: ['We just have to keep doing our thing. The points are the points.', 'I don’t look at the gap. I look at the next race.'],
    mid: ['They are quick, we know that. We can’t afford a weekend off.', 'It’s a proper fight now. Every point matters.'],
    high: ['It’s going to go down to the wire, I can feel it.', 'Nobody gives you a title. We will have to take it.', 'There’s no room for mistakes now, from either of us.'] },
  chase: { low: ['There are a lot of races left. We keep chipping away.', 'We are not out of it. Not even close.'],
    mid: ['The gap is coming down and they know it.', 'We have the pace. Now we need the results.'],
    high: ['The pressure is on them now, not us.', 'I didn’t come here to finish second.', 'Every weekend is a final from here.'] },
  boss: { low: ['We focus on our own job. The championship looks after itself.', 'It’s early to talk about rivals.'],
    mid: ['They are strong, but so are we. It will be close.', 'We have a plan for the rest of the season and we stick to it.'],
    high: ['This is what we exist for. A fight like this, all the way to the end.', 'Whoever makes the fewest mistakes wins this. We intend to be that team.'] },
};
// more lines, so the same words don't come round too soon (up to 12 for each, 8 for each level of the tiered ones)
RIVAL_QUOTES.lead.low.push("It’s a long season. I’m not looking at anyone else yet.", "I’d rather be ahead than behind, but it means very little right now.", "We just keep scoring. That’s the plan.", "They’re quick, but so are we. We’ll see how it goes.", "There are a lot of points still out there.", "No celebrations yet. It’s far too early.");
RIVAL_QUOTES.lead.mid.push("The gap is nice, but it can go in one bad weekend.", "They’re pushing us hard. I like that.", "We can’t switch off now, not for a second.", "Every weekend counts the same, whether we’re ahead or not.", "It’s getting serious now. You can feel it.", "I’m not defending. I want to keep extending.");
RIVAL_QUOTES.lead.high.push("This is what you dream about: a proper fight for the title.", "I have to keep my nerve. That’s all it is now.", "One race at a time. That’s the only way through this.", "I know they’ll throw everything at us. We’re ready.", "Whoever blinks first loses this.");
RIVAL_QUOTES.chase.low.push("It’s early. A lot can happen.", "We have work to do, but we know where to find it.", "I’m not worried about the gap yet.", "There’s plenty of time to turn this around.", "We’ll be stronger in the second half.", "Points are points. We’ll get ours.");
RIVAL_QUOTES.chase.mid.push("We are getting closer every weekend.", "I can see them now. That’s motivating.", "One good weekend and we’re right there.", "The momentum is with us at the moment.", "They have to keep looking in the mirror now.", "We have to win more than they do, simple as that.");
RIVAL_QUOTES.chase.high.push("It’s now or never. We have to take risks.", "I’ll be giving everything for every point.", "There’s nothing left to save it for.", "If they make one mistake, we’ll be there.", "I can taste it. We’re not letting go.");
RIVAL_QUOTES.boss.low.push("It’s a marathon, not a sprint.", "We judge ourselves on our own performance, not the table.", "Our development plan matters more than the standings right now.", "Plenty of races left. We stay calm.", "Both drivers are doing a solid job.", "We know where we need to improve.");
RIVAL_QUOTES.boss.mid.push("It’s a real contest now, and the whole factory knows it.", "We are bringing upgrades and we expect them to make the difference.", "Every point counts. We drill that into everyone.", "It’s close enough that the pit wall can decide it.", "The pressure is good. It shows we are in the right place.", "We won’t make it easy for them.");
RIVAL_QUOTES.boss.high.push("We fight for every point until the very last lap.", "This is where the work of the whole year pays off, or doesn’t.", "The team is ready for this. We’ve built for this moment.", "Mistakes cost titles. We are making sure we don’t make them.", "Nobody sleeps much at a time like this.", "We go all in from here.");
const heatTier = (h) => h >= 0.8 ? 'high' : h >= 0.55 ? 'mid' : 'low';
/** Principal of a team for a quote: the real one where Pitwall knows them, yours for My Team. */
const principalOf = (c, tid) => tid === MYTEAM ? c.myTeam?.principal || `${c.profile.first} ${c.profile.last}` : D.TEAM_BIO[tid]?.principal || null;

/** The rivalry stories of season s: title rivals forming, heating up and fading, archrivals, and your feuds. */
function rivalryStories(c, s) {
  const out = []; const R = rivalries(c); const rounds = activeRounds(s);
  const nm = (kind, id) => kind === 'team' ? (s.teams.find(t => teamRoot(t.id) === id) || teamMeta(c, id))?.name || id : dName(s, id);
  const short = (kind, id) => kind === 'team' ? nm(kind, id) : id === PLAYER_ID ? c.profile.last : lastName(dName(s, id));
  const team = (kind, id) => kind === 'team' ? s.teams.find(t => teamRoot(t.id) === id)?.id : null;
  const quotes = (e, rnd) => {
    const tier = heatTier(rivalHeat(e.kind, e.gap ?? 0));
    if (e.kind === 'driver') return [e.a, e.b].map((id, k) => ({ id, text: choose(rnd, RIVAL_QUOTES[id === e.a ? 'lead' : 'chase'][tier]) })).slice(0, 2);
    return [e.a, e.b].map(id => team('team', id)).filter(Boolean).map(tid => ({ team: tid, role: principalOf(c, tid) ? `Team principal ${principalOf(c, tid)}` : 'Team principal', text: choose(rnd, RIVAL_QUOTES.boss[tier]) }));
  };
  const groupable = (e) => (e.type === 'start' && !e.rematch && !e.again) || e.type === 'hot' || e.type === 'cool' || (e.type === 'end' && !e.swap);
  const gkey = (e) => `${e.ri}|${e.kind}|${e.type}|${e.a}`;
  const groups = {}; for (const e of R.events) if (e.si === s.index && groupable(e)) (groups[gkey(e)] ||= []).push(e);
  const told = new Set();
  // everyone in the drivers' title fight at that round, for the graph of the last five races
  const fight = (e, also) => e.kind !== 'driver' ? null : [...new Set([e.a, ...also, ...rivalsAt(c, s, e.ri).active.filter(x => x.kind === 'driver').flatMap(x => [x.a, x.b])])].filter(id => s.drivers[id]);
  // how far back a chaser has dropped, in race wins (drivers) or points
  const behind = (e, B, A) => e.kind === 'driver' && e.gap > 25 ? `${B} drops ${e.gap > 75 ? 'more than three race wins' : e.gap > 50 ? 'more than two race wins' : 'beyond a race win'} behind ${A}` : `${B} drops ${plural(e.gap, 'point')} behind ${A}`;
  for (const e of R.events) {
    if (e.si !== s.index || e.type === 'archGone') continue;
    if (e.type === 'end' && e.swap) continue; // the lead passed to someone else: the fight goes on, with a new leader
    const grp = groupable(e) ? groups[gkey(e)] : null;
    if (grp?.length > 1) {
      if (told.has(gkey(e))) continue; told.add(gkey(e));
      const r = rounds[e.ri]; const rnd = seeded(`rivg-${s.index}-${gkey(e)}`); const gp = r?.name || '';
      const A = short(e.kind, e.a); const Bs = grp.map(x => short(e.kind, x.b)); const who = listJoin(Bs); const all = listJoin([A, ...Bs]);
      const cup = e.kind === 'team' ? 'constructors’ title' : 'title';
      const gaps = listJoin(grp.map(x => `${short(e.kind, x.b)} ${x.gap ? plural(x.gap, 'point') + ' back' : 'level'}`));
      const base = { id: `rivg-${s.index}-${e.ri}-${e.type}-${e.kind}-${e.a}`, graphIds: fight(e, grp.map(x => x.b)), seq: e.ri * 10 + 5, kind: 'rivalry', i: e.ri, r, outlet: choose(rnd, D.OUTLETS), subject: null, kicker: e.kind === 'team' ? 'Constructors’ title rivals' : 'Title rivals' };
      if (e.type === 'start') out.push({ ...base, headline: choose(rnd, [`A ${cup} battle takes shape between ${all}`, `${all}: the ${cup} fight is on`]), standfirst: `After ${gp}, a ${cup} battle seems to be developing between ${all}: ${gaps} of ${A}.`, body: [] });
      else if (e.type === 'hot') out.push({ ...base, headline: choose(rnd, [`${who} close in on ${A}`, `${A} under pressure from ${who}`]), standfirst: `${gp} brings ${who} right up to ${A}: ${gaps}. Nobody can afford a slip now.`, body: [] });
      else if (e.type === 'cool') out.push({ ...base, headline: choose(rnd, [`${who} slip back`, `${A} pulls clear of ${who}`]), standfirst: `After ${gp}, ${listJoin(grp.map(x => behind(x, short(e.kind, x.b), A)))}. They need something to change, and soon.`, body: [] });
      else out.push({ ...base, kicker: 'Championship', headline: choose(rnd, [`${who}: challenges fade`, `${A} shakes off ${who}`]), standfirst: `After ${gp}, ${listJoin(grp.map(x => x.out ? `${short(e.kind, x.b)} can no longer catch ${A}` : behind(x, short(e.kind, x.b), A)))}.`, body: [] });
      continue;
    }
    const r = rounds[e.ri]; const rnd = seeded(`riv-${s.index}-${e.ri}-${e.type}-${e.a}-${e.b}`);
    const A = short(e.kind, e.a), B = short(e.kind, e.b), gp = r?.name || '';
    const cup = e.kind === 'team' ? 'constructors’ title' : 'title';
    const base = { id: `riv-${s.index}-${e.ri}-${e.type}-${e.kind}-${e.a}-${e.b}`, graphIds: fight(e, [e.b]), seq: e.ri * 10 + 5, kind: 'rivalry', i: e.ri, r, outlet: choose(rnd, D.OUTLETS), subject: e.kind === 'driver' ? e.b : null };
    if (e.type === 'start') {
      if (e.rematch) {
        const o = archSeason(c, e.kind, e.a, e.b, e.rematch.year);
        const lost = o ? short(e.kind, o.loser) : B, won = o ? short(e.kind, o.winner) : A;
        out.push({ ...base, massive: true, kicker: 'Archrivals · The rematch',
          headline: choose(rnd, [`The rematch: ${A} v ${B}, round two`, `${A} and ${B}: old enemies, a new ${cup} fight`, `Here we go again: ${A} and ${B} renew hostilities`]),
          standfirst: `${e.gap ? `${plural(e.gap, 'point')} separate` : 'Nothing separates'} ${A} and ${B} after ${gp}, and the paddock has seen this before.`,
          body: [o ? `${o.year} was theirs: ${won} came out on top${o.title ? ` and took the ${cup}` : ''}${o.margin ? `, ${plural(o.margin, 'point')} clear` : ' on countback'}. ${lost} has not forgotten, and wants payback.` : '',
            `The stakes could not be higher. This time it is personal.`].filter(Boolean), quotes: quotes(e, rnd) });
      } else if (e.again) {
        out.push({ ...base, kicker: e.kind === 'team' ? 'Constructors’ title rivals' : 'Title rivals',
          headline: choose(rnd, [`${B} is back in the hunt`, `${B} closes in on ${A} again`]),
          standfirst: `${gp} cuts the gap to ${plural(e.gap, 'point')}: ${B} is a threat to ${A} once more.`, body: [], quotes: quotes(e, rnd) });
      } else {
        out.push({ ...base, kicker: e.kind === 'team' ? 'Constructors’ title rivals' : 'Title rivals',
          headline: e.gap <= 10 ? choose(rnd, [`${A} v ${B}: ${e.gap ? plural(e.gap, 'point') : 'nothing'} in it`, `Title rivals: ${A} and ${B} locked together`]) : choose(rnd, [`Title rivals: ${A} and ${B}`, `${A} v ${B}: a ${cup} fight takes shape`]),
          standfirst: `After ${gp}, ${B} is ${e.gap ? `${plural(e.gap, 'point')} behind` : 'level with'} ${A}${e.kind === 'team' ? ' in the constructors’ championship' : ''}, and this has the makings of a ${cup} fight.`,
          body: [], quotes: quotes(e, rnd) });
      }
    } else if (e.type === 'hot') {
      out.push({ ...base, kicker: e.kind === 'team' ? 'Constructors’ title rivals' : 'Title rivals',
        headline: choose(rnd, [`${A} and ${B} now ${e.gap ? `just ${plural(e.gap, 'point')} apart` : 'level on points'}`, `The ${cup} fight boils over: ${A} v ${B}`, `Wheel to wheel for the ${cup}: ${A} and ${B}`]),
        standfirst: `${gp} brings ${B} right up to ${A}. Neither can afford a slip now.`, body: [], quotes: quotes(e, rnd) });
    } else if (e.type === 'cool') {
      out.push({ ...base, kicker: e.kind === 'team' ? 'Constructors’ title rivals' : 'Title rivals',
        headline: choose(rnd, [`${A} pulls clear of ${B}`, `The ${A}–${B} fight cools`]),
        standfirst: `After ${gp}, ${behind(e, B, A)}. ${B} needs something to change, and soon.`, body: [], quotes: quotes(e, rnd).slice(0, 1) });
    } else if (e.type === 'end') {
      out.push({ ...base, kicker: 'Championship', headline: choose(rnd, [`${B}’s challenge fades`, `${A} shakes off ${B}`]),
        standfirst: e.out ? `After ${gp}, ${B} can no longer catch ${A}: the ${cup} is out of reach.` : `After ${gp}, ${behind(e, B, A)}, and is no longer a real threat.`, body: [] });
    } else if (e.type === 'arch') {
      const was = e.replaced.map(x => `${short(e.kind, x.id)}’s rivalry with ${short(e.kind, x.old)} from ${x.year}`);
      out.push({ ...base, massive: true, kicker: 'Archrivals',
        headline: choose(rnd, [`${A} and ${B}: archrivals`, `${A} v ${B}: a rivalry for the ages`, `${A} and ${B}, the rivalry that defines ${s.year}`]),
        standfirst: choose(rnd, [`${A} and ${B} just cannot be separated this season, and the paddock knows it: this is the rivalry of ${s.year}.`, `Round after round it has been ${A} against ${B}. There is no pretending otherwise any more: they are archrivals.`, `Neither ${A} nor ${B} has been able to shake the other all year. This has become something bigger than a title fight.`, `Wherever ${A} goes, ${B} is never far behind, and the other way round. ${s.year} has made them true archrivals.`]),
        body: [was.length ? `It eclipses ${listJoin(was)}.` : '', 'Whatever happens from here, every time these two meet on track, it will mean that little bit more.'].filter(Boolean),
        quotes: quotes({ ...e, gap: 0 }, rnd) });
    }
  }
  // your feuds: the moment they start (later races mention them in the reports)
  for (const fd of c.rivalries || []) if (fd.seasonIdx === s.index) out.push({ ...feudStory(c, s, fd), t: Date.parse(fd.createdAt) || 0 });
  out.push(...duelStories(c, s));
  return out;
}

const FEUD_REASONS = [['contact', 'Contact on track'], ['crash', 'A crash'], ['hard', 'Hard racing'], ['points', 'Close in points']];
/** How a feud started, in a few words, for the reports that come after it. */
function feudCause(fd, gp, rnd) {
  return choose(rnd, {
    contact: [`their contact in ${gp}`, `that coming-together in ${gp}`, `the clash in ${gp}`],
    crash: [`the crash in ${gp}`, `their shunt in ${gp}`, `what happened in ${gp}`],
    hard: [`their wheel-to-wheel fight in ${gp}`, `the hard racing in ${gp}`, `their battle in ${gp}`],
    points: ['their fight over the same points', 'the battle for every point between them', 'their tussle in the standings'],
  }[fd.reason] || [`what happened in ${gp}`]);
}
function feudStory(c, s, fd) {
  const rounds = activeRounds(s); const i = Math.max(0, fd.after - 1); const r = rounds[i]; const gp = r?.name || 'the last race';
  const rnd = seeded(fd.id);
  const L = (id) => id === PLAYER_ID ? c.profile.last : lastName(dName(s, id));
  const A = L(fd.a), B = L(fd.b);
  const head = {
    contact: [`${A} and ${B} trade blame after contact in ${gp}`, `Sparks fly between ${A} and ${B} after ${gp} contact`],
    crash: [`${A} and ${B} at odds after the crash in ${gp}`, `${gp} crash leaves ${A} and ${B} fuming`],
    hard: [`${A} and ${B} go wheel to wheel, and words follow`, `${A} v ${B}: hard racing in ${gp} turns sour`],
    points: [`${A} v ${B}: the battle for every point heats up`, `${A} and ${B}, and a fight over the same points`],
  }[fd.reason] || [`${A} and ${B} fall out`];
  const said = {
    contact: ['He left me nowhere to go. I expected more.', 'That was not my fault, and he knows it.', 'We touched, it happens. But I won’t forget it.'],
    crash: ['He just turned in on me. Completely unnecessary.', 'I’m not going to apologise for racing.', 'We’ll talk about it. Or maybe we won’t.'],
    hard: ['It was hard, but was it fair? I’m not so sure.', 'If he wants to race like that, fine. I can race like that too.', 'That’s racing. He’ll get it back from me.'],
    points: ['Every point he takes is one I don’t get. Simple as that.', 'We are fighting for the same thing, and neither of us will give an inch.'],
  }[fd.reason] || ['No comment.'];
  return { id: 'fd' + fd.id, seq: i * 10 + 8, kind: 'rivalry', i, r, subject: fd.a, outlet: choose(rnd, D.OUTLETS), kicker: 'Bad blood',
    headline: choose(rnd, head), standfirst: `${dName(s, fd.a)} and ${dName(s, fd.b)} have a score to settle, and the next few races will be worth watching.`, body: [],
    quotes: [fd.a, fd.b].map(id => ({ id, text: choose(rnd, said) })), feud: fd };
}
/** Feuds still running at round i: started after an earlier round and within five races of it. */
const feudsAt = (c, s, i) => (c.rivalries || []).filter(fd => fd.seasonIdx === s.index && i >= fd.after && i < fd.after + FEUD_RACES);

/* ---------------------------------------------------------------- battles */
// A battle: two drivers who swapped places at least eight times in a race, each passing the other at least twice (so a
// lapped car waved through, or one car simply driving away, never counts). It comes from every pass F1 25 reports as
// it happens, so a move made at the same corner every lap counts as much as one made over the line. Races logged
// before 1.9.5, or by hand, have no passes: for those, nobody knows.
const BATTLE_SWAPS = 8, BATTLE_EACH = 2;
/** A race's battles, biggest first: [{ a, b, n, by: { id: passes }, from, to, ahead, behind, posW, posL }], or null. */
function raceBattles(sd) {
  const ov = sd?.done && sd.game?.overtakes; if (!Array.isArray(ov)) return null;
  const P = {};
  for (const [a, b, lap] of ov) {
    const o = P[pairKey(a, b)] ||= { a: a < b ? a : b, b: a < b ? b : a, n: 0, by: {}, laps: [] };
    o.n++; o.by[a] = (o.by[a] || 0) + 1; o.laps.push(lap || 0);
  }
  // a car that didn't finish counts from 100 up (in the classification's order), never as a place
  const fin = (d) => { const k = sd.results.findIndex(x => x.d === d); return k < 0 ? 199 : OUT.includes(sd.results[k].st) ? 100 + k : k + 1; };
  return Object.values(P).filter(o => o.n >= BATTLE_SWAPS && (o.by[o.a] || 0) >= BATTLE_EACH && (o.by[o.b] || 0) >= BATTLE_EACH)
    .map(o => { const [w, l] = fin(o.a) <= fin(o.b) ? [o.a, o.b] : [o.b, o.a]; return { ...o, from: Math.min(...o.laps), to: Math.max(...o.laps), ahead: w, behind: l, posW: fin(w), posL: fin(l) }; })
    .map(o => ({ ...o, forLead: forTheLead(sd, o), leadN: leadChanges(sd, o) }))
    .sort((x, y) => (y.forLead - x.forLead) || y.n - x.n || x.posW - y.posW);
}
/** How many times the lead changed hands between a battle's two drivers: their passes on laps they ran first and second. */
function leadChanges(sd, b) {
  const P = lapPositions(sd); if (!P) return 0;
  const top = (k) => { const pa = P.pos[b.a]?.[k], pb = P.pos[b.b]?.[k]; return pa && pb && Math.min(pa, pb) === 1 && Math.max(pa, pb) === 2; };
  return b.laps.filter(k => top(k) || top(k - 1)).length;
}
/** Was a battle for the lead? The two ran first and second at some point while it lasted. */
function forTheLead(sd, b) {
  const P = lapPositions(sd);
  if (!P) return b.posW === 1 && b.posL === 2;
  for (let k = Math.max(1, b.from - 1); k <= Math.min(P.N, b.to); k++) { const pa = P.pos[b.a]?.[k], pb = P.pos[b.b]?.[k]; if (pa && pb && Math.min(pa, pb) === 1 && Math.max(pa, pb) === 2) return true; }
  return false;
}
/**
 * The winner's pass for the lead in the last five laps, if that's how the race was won: { lap, N, left, prev, fight }.
 * From the running order lap by lap (the last change of leader before the flag), confirmed as a pass by the logged
 * passes (or, without them, by the old leader still running and not pitting that lap).
 */
function lateWinPass(sd, W) {
  const P = lapPositions(sd); if (!P || !W) return null;
  const { N, pos } = P; const lead = (k) => Object.keys(pos).find(d => pos[d][k] === 1);
  let j = null; for (let k = N; k >= 1; k--) { if (lead(k) !== W) break; if (lead(k - 1) && lead(k - 1) !== W) { j = k; break; } }
  if (j == null || N - j > 4) return null;
  const prev = lead(j - 1); const ov = sd.game?.overtakes;
  const passes = Array.isArray(ov) ? ov.filter(([a, b]) => (a === W && b === prev) || (a === prev && b === W)) : [];
  const passed = Array.isArray(ov) && ov.length ? passes.some(([a, b, l]) => a === W && b === prev && l >= j - 1 && l <= j)
    : j < N && pos[prev]?.[j] && !stintsOf(sd, prev).some((x, k, all) => x.to === j && k < all.length - 1);
  return passed ? { lap: j, N, left: N - j, prev, fight: passes.length } : null;
}
/** Passes each driver made and lost in a race, and the net places on the opening lap: { made, lost, lap1 } by driver. */
function racePasses(sd) {
  const ov = sd?.done && sd.game?.overtakes; if (!Array.isArray(ov)) return null;
  const made = {}, lost = {}, lap1 = {};
  for (const [a, b, lap] of ov) {
    made[a] = (made[a] || 0) + 1; lost[b] = (lost[b] || 0) + 1;
    if (lap <= 1) { lap1[a] = (lap1[a] || 0) + 1; lap1[b] = (lap1[b] || 0) - 1; }
  }
  return { made, lost, lap1, total: ov.length };
}
// Wheel-to-wheel rivals: a battle in three races in a row (a sprint and its Grand Prix are two races) makes the two
// drivers rivals on track. It lasts until they go three races in a row without one, and can start again later. Races
// without pass data don't count either way. Like title rivalries, these are worked out from the results, so editing
// or undoing a race puts them right.
const DUEL_ON = 3, DUEL_OFF = 3;
const _duelCache = new WeakMap();
/** The season's wheel-to-wheel rivalries: { events: [{ type: 'duelStart'|'duelEnd', a, b, i, key, battles }], at: { ri: [active] }, all: battles } */
function duels(s) {
  let v = _duelCache.get(s); if (v && v.gen === renderGen) return v.d;
  const P = {}; const events = []; const at = {}; const all = [];
  activeRounds(s).forEach((r, i) => {
    const ses = s.weekends[r.id]?.sessions || {};
    for (const key of ['SPR', 'R']) {
      const B = raceBattles(ses[key]); if (!B) continue;
      const hit = new Set();
      for (const b of B) {
        const k = pairKey(b.a, b.b); hit.add(k); all.push({ i, key, ...b });
        const p = P[k] ||= { a: b.a, b: b.b, run: 0, quiet: 0, active: false, battles: [], stints: 0, start: 0 };
        p.run++; p.quiet = 0; p.battles.push({ i, key, n: b.n, ahead: b.ahead });
        if (!p.active && p.run >= DUEL_ON) {
          p.active = true; p.stints++; p.start = p.battles.length - p.run;
          events.push({ type: 'duelStart', a: b.a, b: b.b, i, key, again: p.stints > 1, battles: p.battles.slice(p.start) });
        }
      }
      for (const [k, p] of Object.entries(P)) {
        if (hit.has(k)) continue;
        p.run = 0;
        if (p.active && ++p.quiet >= DUEL_OFF) { p.active = false; events.push({ type: 'duelEnd', a: p.a, b: p.b, i, key, battles: p.battles.slice(p.start) }); }
      }
    }
    at[i] = Object.values(P).filter(p => p.active).map(p => ({ a: p.a, b: p.b, quiet: p.quiet, battles: p.battles.slice(p.start) }));
  });
  const d = { events, at, all };
  _duelCache.set(s, { gen: renderGen, d });
  return d;
}
/** Wheel-to-wheel rivalries running after round ri. */
const duelsAt = (s, ri) => { const D2 = duels(s); for (let i = ri; i >= 0; i--) if (D2.at[i]) return D2.at[i]; return []; };
/** Who has come out ahead in a set of battles: { a: n, b: n }. */
const duelScore = (x) => x.battles.reduce((o, b) => { o[b.ahead] = (o[b.ahead] || 0) + 1; return o; }, {});
// what drivers say about a rival they keep racing wheel to wheel: respect, or (after contact between them) needle
const DUEL_QUOTES = {
  respect: ['Every time we race, it’s hard but fair. I enjoy it, honestly.', 'We seem to find each other every weekend. It’s good fun, as long as it stays clean.', 'I know exactly how they race now, and they know how I race. That makes it great.', 'You can’t give an inch, because they won’t. That’s proper racing.', 'It’s become a bit of a habit, hasn’t it? I don’t mind, I like a fight.'],
  needle: ['They race me harder than anyone else on the grid. Sometimes too hard.', 'We have touched a couple of times now. I hope it stays fair.', 'I’ll race anyone hard, but there has to be respect both ways.', 'There is a line, and I think it has been close to being crossed.', 'Let’s just say we won’t be having dinner together.'],
  ended: ['We’re just not in the same part of the field any more. I’m sure we’ll meet again.', 'It was fun while it lasted.'],
};
// more lines, so the same words don't come round too soon (up to 12 for each, 8 for each level of the tiered ones)
DUEL_QUOTES.respect.push("I always know it’ll be a fight when I see them in the mirrors.", "They race clean. I can go wheel to wheel with them all day.", "We push each other, and that makes us both better.", "It’s become one of my favourite battles on the grid.", "They never give up a place easily, and neither do I.", "There’s a lot of respect there, even when it’s close.", "Some of my best moves this year have been against them.");
DUEL_QUOTES.needle.push("I’m getting tired of the way they race me.", "There have been a few moments now. It needs to stop.", "I give them room. I expect the same back.", "It’s getting personal, and that’s not good for anyone.", "We’ll talk, but I’m not sure it’ll change much.", "If it carries on like this, one of us ends up in the wall.", "They know exactly what they did.");
DUEL_QUOTES.ended.push("Different parts of the grid now, but I enjoyed those fights.", "I’ll miss racing them every weekend, if I’m honest.", "It was a good battle while it lasted.", "Maybe we’ll meet again next year.", "We’re focused on different targets now.", "Those races were some of the best I’ve had.", "I learned a lot from fighting them.", "It’s gone quiet between us on track. That’s fine.", "They’re racing someone else now. Good luck to them.", "Fun while it lasted.");
/** The stories of the season's wheel-to-wheel rivalries: when one starts (several at one race share a story). */
function duelStories(c, s) { return mergeDuelStarts(c, s, duelStoriesEach(c, s)); }
function duelStoriesEach(c, s) {
  const out = []; const rounds = activeRounds(s);
  const L = (id) => id === PLAYER_ID ? c.profile.last : lastName(dName(s, id));
  const gpOf = (b) => b.key === 'SPR' ? `the ${rounds[b.i]?.name || ''} sprint` : rounds[b.i]?.name || '';
  for (const e of duels(s).events) {
    const r = rounds[e.i]; const rnd = seeded(`duel-${s.index}-${e.i}-${e.key}-${e.type}-${e.a}-${e.b}`);
    const A = L(e.a), B = L(e.b);
    // contact between them in any of these races makes it spicier
    const touched = e.battles.some(b => (s.weekends[rounds[b.i]?.id]?.sessions?.[b.key]?.game?.incidents || []).some(x => (x.a === e.a && x.b === e.b) || (x.a === e.b && x.b === e.a)));
    const sc = duelScore(e); const lead = (sc[e.a] || 0) >= (sc[e.b] || 0) ? e.a : e.b;
    const base = { id: `duel-${s.index}-${e.i}-${e.key}-${e.type}-${e.a}-${e.b}`, seq: e.i * 10 + (e.key === 'SPR' ? 2.6 : 4.6), kind: 'rivalry', i: e.i, r, outlet: choose(rnd, D.OUTLETS), subject: e.b === PLAYER ? e.a : e.b };
    if (e.type === 'duelStart') {
      const last2 = e.battles.slice(-2);
      out.push({ ...base, grp: `${e.i}-${e.key}`, pair: [e.a, e.b], kicker: e.again ? 'Wheel to wheel · Round two' : 'Wheel to wheel',
        headline: e.again ? choose(rnd, [`${A} and ${B} are at it again`, `${A} v ${B}: the on-track war is back on`, `They can’t stay apart: ${A} and ${B} renew hostilities`])
          : touched ? choose(rnd, [`${A} v ${B}: a rivalry born in contact`, `${A} and ${B}: elbows out, again`, `Bumping and barging: ${A} and ${B} make it personal`])
          : choose(rnd, [`${A} and ${B} can’t stay away from each other`, `${A} and ${B}, the battle that keeps on giving`, `${A} v ${B} is the fight to watch`]),
        standfirst: choose(rnd, [`Wherever ${A} and ${B} meet on track, sparks fly. We’re already looking forward to the next one.`, `${A} and ${B} keep finding each other out there, and neither ever gives an inch.`, `It isn’t the first time ${A} and ${B} have gone at it, and it surely won’t be the last.`, `Some drivers just bring the best out of each other. ${A} and ${B} are turning into one of those pairings.`]),
        body: [last2[0].ahead === last2[1].ahead ? `${L(last2[1].ahead)} has had the better of their fights lately, and ${L(last2[1].ahead === e.a ? e.b : e.a)} will want to turn that around.` : `Neither has been able to keep the upper hand for long: they have been trading blows.`,
          touched ? 'The two have already made contact along the way, and neither looks in the mood to back down.' : choose(rnd, ['It has been hard, clean racing so far. Long may it continue.', 'So far it has stayed clean. With these two, that may not last.'])],
        quotes: [e.a, e.b].map(id => ({ id, text: choose(rnd, DUEL_QUOTES[touched ? 'needle' : 'respect']) })) });
    } else if (false) { // it dies down quietly: no story (kept for reference)
      out.push({ ...base, kicker: 'Wheel to wheel', subject: lead === PLAYER ? (lead === e.a ? e.b : e.a) : lead,
        headline: choose(rnd, [`The ${A}–${B} duel goes quiet`, `${A} and ${B} go their separate ways`, `Three races of peace between ${A} and ${B}`]),
        standfirst: `${A} and ${B} have now gone three races without a fight. Over ${pw(e.battles.length, 'battle')}, ${sc[e.a] === sc[e.b] ? 'they finished honours even' : sc[lead] === e.battles.length ? `${L(lead)} came out ahead every time` : `${L(lead)} came out ahead in ${nw(sc[lead])}`}.`,
        body: [], quotes: [e.a, e.b].slice(0, 1).map(id => ({ id, text: choose(rnd, DUEL_QUOTES.ended) })) });
    }
  }
  return out;
}

/** Rivalries born at the same race: one story with all of them. */
function mergeDuelStarts(c, s, list) {
  const L = (id) => id === PLAYER_ID ? c.profile.last : lastName(dName(s, id));
  const groups = {}; for (const x of list) if (x.grp) (groups[x.grp] ||= []).push(x);
  const out = list.filter(x => !x.grp || groups[x.grp].length === 1);
  for (const g of Object.values(groups)) {
    if (g.length < 2) continue;
    const rnd = seeded(`duelg-${s.index}-${g[0].grp}`); const pairs = g.map(x => `${L(x.pair[0])} and ${L(x.pair[1])}`);
    const where = g[0].r?.name || '';
    out.push({ ...g[0], id: `duelg-${s.index}-${g[0].grp}`, kicker: 'Wheel to wheel', subject: g[0].subject,
      headline: choose(rnd, [`Rivalries heat up in ${where}`, `${pairs.length === 2 ? 'Two' : numWord(pairs.length)[0].toUpperCase() + numWord(pairs.length).slice(1)} fights that won’t go away`, `${where}: the battles that keep coming back`]),
      standfirst: `${listJoin(pairs)} were at it again in ${where}: for each pair, the third race running with a real battle. We can’t wait for the next round of each.`,
      body: g.map(x => x.body?.[0]).filter(Boolean), quotes: g.flatMap(x => x.quotes || []).slice(0, 2) });
  }
  return out;
}
/** Lines for a qualifying report: archrivals or feuding drivers side by side on the grid. */
function rivalryQualiLines(c, s, i, q, last, rnd) {
  const lines = []; const pos = (id) => q.findIndex(x => x.d === id);
  const arch = rivalsAt(c, s, i - 1).arch.driver; const seen = new Set();
  for (const [a, x] of Object.entries(arch)) {
    const b = x.rival; const k = pairKey(a, b); if (seen.has(k)) continue; seen.add(k);
    const pa = pos(a), pb = pos(b); if (pa < 0 || pb < 0 || Math.abs(pa - pb) !== 1) continue;
    const [f, sb] = pa < pb ? [a, b] : [b, a]; const front = Math.min(pa, pb) + 1;
    lines.push(choose(rnd, front % 2 === 1
      ? [`Archrivals ${last(f)} and ${last(sb)} will start side by side on row ${(front + 1) / 2}. The first corner should be interesting.`, `${last(f)} and ${last(sb)}, archrivals since ${x.year}, share row ${(front + 1) / 2}.`]
      : [`${last(sb)} lines up right behind archrival ${last(f)}, ${ordWord(front + 1)} to ${ordWord(front)}.`, `Just one place splits archrivals ${last(f)} and ${last(sb)} on the grid.`]));
  }
  for (const fd of feudsAt(c, s, i)) {
    const pa = pos(fd.a), pb = pos(fd.b); if (pa < 0 || pb < 0 || Math.abs(pa - pb) !== 1) continue;
    const gp0 = activeRounds(s)[Math.max(0, fd.after - 1)]?.name || 'the last race';
    lines.push(choose(rnd, [`${last(fd.a)} and ${last(fd.b)}, who came to blows after ${feudCause(fd, gp0, rnd)}, line up next to each other.`, `Fate puts ${last(fd.a)} and ${last(fd.b)} side by side, not long after ${feudCause(fd, gp0, rnd)}.`]));
  }
  for (const x of duelsAt(s, i - 1)) {
    const pa = pos(x.a), pb = pos(x.b); if (pa < 0 || pb < 0 || Math.abs(pa - pb) !== 1) continue;
    const [f, sb] = pa < pb ? [x.a, x.b] : [x.b, x.a];
    lines.push(choose(rnd, [`${last(f)} and ${last(sb)}, wheel to wheel in ${plural(x.battles.length, 'race')} lately, line up ${ordWord(Math.min(pa, pb) + 1)} and ${ordWord(Math.max(pa, pb) + 1)}. Expect more of the same.`, `Here we go again: ${last(f)} starts just ahead of on-track rival ${last(sb)}.`, `${last(sb)} will have ${last(f)} in sight from the start. These two never seem to race anyone else.`]));
  }
  return lines;
}
/** Lines for a race report: archrivals finishing nose to tail, feuds flaring again, how heated the title fight is. */
function rivalryRaceLines(c, s, i, res, last, rnd) {
  const lines = [];
  const fin = res.filter(x => !OUT.includes(x.st));
  const tm = (id) => { const k = fin.findIndex(x => x.d === id); if (k < 0) return null; if (k === 0) return 0; return +fin[k].laps > 0 ? null : parseGap(fin[k].gap); };
  const pos = (id) => fin.findIndex(x => x.d === id);
  const arch = rivalsAt(c, s, i - 1).arch.driver; const seen = new Set();
  for (const [a, x] of Object.entries(arch)) {
    const b = x.rival; const k = pairKey(a, b); if (seen.has(k)) continue; seen.add(k);
    const pa = pos(a), pb = pos(b); if (pa < 0 || pb < 0 || Math.abs(pa - pb) !== 1) continue;
    const [f, sb] = pa < pb ? [a, b] : [b, a]; const ta = tm(f), tb = tm(sb); const d = ta != null && tb != null ? tb - ta : null;
    lines.push(d != null && d <= 3
      ? choose(rnd, [`${last(f)} and ${last(sb)} had nothing to give each other: the archrivals crossed the line ${d.toFixed(3)} seconds apart, ${last(f)} ahead.`, `Archrivals to the end: ${last(f)} held off ${last(sb)} by ${d.toFixed(3)} seconds.`])
      : choose(rnd, [`${last(f)} finished one place ahead of archrival ${last(sb)}.`, `Another round to ${last(f)} in the long-running duel with ${last(sb)}.`]));
  }
  for (const fd of feudsAt(c, s, i)) {
    const ta = tm(fd.a), tb = tm(fd.b); if (ta == null || tb == null || Math.abs(ta - tb) > 5) continue;
    const gp0 = activeRounds(s)[Math.max(0, fd.after - 1)]?.name || 'the last race';
    const [f, sb] = ta <= tb ? [fd.a, fd.b] : [fd.b, fd.a]; const n = i - fd.after + 1;
    lines.push(choose(rnd, [`${last(f)} and ${last(sb)} were at it again, ${Math.abs(ta - tb).toFixed(3)} seconds apart at the flag, ${n === 1 ? 'a race' : `${plural(n, 'race')}`} after ${feudCause(fd, gp0, rnd)}.`,
      `No love lost: ${last(f)} finished just ahead of ${last(sb)}, with ${feudCause(fd, gp0, rnd)} still fresh.`, `${last(f)} came out on top this time, ${Math.abs(ta - tb).toFixed(3)} seconds clear of ${last(sb)}. Neither has forgotten ${feudCause(fd, gp0, rnd)}.`]));
  }
  // My Team: how you got on against your archrival team
  const rt = c.type === 'myteam' && !isHist(s) && archRivalTeam(c, s, i - 1)?.id;
  if (rt && s.teams.some(t => t.id === rt)) {
    const best = (tid) => { const k = fin.findIndex(x => teamAt(s, x.d, i)?.id === tid); return k < 0 ? null : k + 1; };
    const me = best(MYTEAM), them = best(rt); const tn = s.teams.find(t => t.id === rt).name, mn = s.teams.find(t => t.id === MYTEAM)?.name;
    if (me && them) lines.push(me < them ? choose(rnd, [`${mn} got the better of rivals ${tn}: best car ${ordWord(me)} to their ${ordWord(them)}.`, `One up on ${tn}: ${mn}’s lead car came home ${ordWord(me)}, ahead of their best in ${ordWord(them)}.`])
      : choose(rnd, [`Rivals ${tn} had the edge over ${mn} today, ${ordWord(them)} to ${ordWord(me)}.`, `${tn} came out ahead of ${mn} this time: ${ordWord(them)} against ${ordWord(me)}.`]));
  }
  const hot = rivalsAt(c, s, i).active.filter(x => x.kind === 'driver').sort((a, b) => b.heat - a.heat)[0];
  if (hot) lines.push(hot.heat >= 0.85 ? choose(rnd, [`The title fight between ${last(hot.a)} and ${last(hot.b)} could hardly be closer.`, `${last(hot.a)} v ${last(hot.b)} is turning into a classic.`])
    : hot.heat >= 0.6 ? choose(rnd, [`It is a straight fight between ${last(hot.a)} and ${last(hot.b)} now.`, `${last(hot.b)} keeps the pressure on ${last(hot.a)}.`])
    : choose(rnd, [`${last(hot.b)} needs to start closing on ${last(hot.a)} soon.`, `${last(hot.a)} keeps ${last(hot.b)} at arm’s length, for now.`]));
  return lines;
}
/** For a retirement story: the archrivalry that defined a driver's career, and how its season ended. */
function archRetireLine(c, s, id, at) {
  const a = rivalsAt(c, s, Math.min(at, activeRounds(s).length) - 1).arch.driver[id]; if (!a) return '';
  const o = archSeason(c, 'driver', id, a.rival, a.year);
  const L = (x) => x === PLAYER_ID ? c.profile.last : lastName(dName(o?.s || s, x));
  return o ? `The rivalry with ${L(a.rival)} will be remembered as a defining part of ${L(id)}’s career. It burned brightest in ${o.year}, when ${L(o.winner)} came out on top${o.title ? ' and took the title' : ''}${o.margin ? ` by ${plural(o.margin, 'point')}` : ' on countback'}.`
    : `The rivalry with ${L(a.rival)} was a defining part of ${L(id)}’s career.`;
}
/** Dashboard panel: the title fights right now, archrivals that matter to you, and your running feuds. */
/** The rivalries panel. mineOnly: wheel-to-wheel and bad-blood rivalries only where your driver (or team) is one side. */
function rivalryPanel(c, s, { mineOnly = false } = {}) {
  const st = rivalsAt(c, s, roundsDone(s) - 1);
  const nm = (kind, id) => kind === 'team' ? (s.teams.find(t => teamRoot(t.id) === id) || teamMeta(c, id))?.name || id : dName(s, id);
  const mine = new Set([PLAYER, ...(s.teams.find(t => t.id === s.playerTeamId)?.drivers || [])]);
  const myRoot = teamRoot(s.playerTeamId);
  const live = st.active.slice().sort((a, b) => b.heat - a.heat);
  const arch = [];
  for (const id of mine) { const a = st.arch.driver[id]; if (id && a) arch.push(`${nm('driver', id)} v ${nm('driver', a.rival)} (since ${a.year})`); }
  if (st.arch.team[myRoot]) arch.push(`${nm('team', myRoot)} v ${nm('team', st.arch.team[myRoot].rival)} (since ${st.arch.team[myRoot].year})`);
  const ours = (x) => mine.has(x.a) || mine.has(x.b);
  const feuds = feudsAt(c, s, roundsDone(s)).filter(x => !mineOnly || ours(x));
  const w2w = duelsAt(s, roundsDone(s) - 1).filter(x => !mineOnly || ours(x)).slice().sort((a, b) => (mine.has(b.a) || mine.has(b.b)) - (mine.has(a.a) || mine.has(a.b)) || b.battles.length - a.battles.length).slice(0, 5);
  const rows = live.map(x => `<div class="goal"><div><div style="font-weight:600">${esc(nm(x.kind, x.a))} v ${esc(nm(x.kind, x.b))}</div><div class="muted" style="font-size:12px">${x.kind === 'team' ? 'Constructors' : 'Drivers'} · ${x.gap ? plural(x.gap, 'point') : 'level'}</div></div>
    <span class="tag ${x.heat >= 0.8 ? 'dnf' : x.heat >= 0.55 ? 'sprint' : ''}">${x.heat >= 0.8 ? 'White hot' : x.heat >= 0.55 ? 'Heated' : 'Simmering'}</span>
    <div class="bar-track"><div class="bar-fill" style="width:${Math.round(x.heat * 100)}%;background:var(--red)"></div></div></div>`).join('');
  return `<div class="panel"><div class="panel-h"><h2>Rivalries</h2><button class="btn sm ghost" data-act="rv-new">Start a rivalry</button></div>
    ${rows ? `<div class="panel-b"><span class="label">Title rivals</span>${rows}</div>` : `<div class="panel-b muted" style="font-size:13px">${roundsDone(s) < 5 ? 'Title rivalries form from the sixth race.' : 'Nobody is close enough to the leader to call it a fight.'}</div>`}
    ${arch.length ? `<div class="panel-b" style="border-top:1px solid var(--line)"><span class="label">Archrivals</span><div style="display:grid;gap:4px;margin-top:6px">${arch.map(x => `<div>${esc(x)}</div>`).join('')}</div></div>` : ''}
    ${w2w.length ? `<div class="panel-b" style="border-top:1px solid var(--line)"><span class="label">Wheel to wheel</span><div style="display:grid;gap:4px;margin-top:6px">${w2w.map(x => `<div>${esc(dName(s, x.a))} v ${esc(dName(s, x.b))} <span class="muted">· ${plural(x.battles.length, 'battle')}${x.quiet ? `, ${plural(x.quiet, 'race')} without one` : ''}</span></div>`).join('')}</div></div>` : ''}
    ${feuds.length ? `<div class="panel-b" style="border-top:1px solid var(--line)"><span class="label">Bad blood</span><div style="display:grid;gap:4px;margin-top:6px">${feuds.map(fd => `<div>${esc(dName(s, fd.a))} v ${esc(dName(s, fd.b))} <span class="muted">· ${esc(FEUD_REASONS.find(x => x[0] === fd.reason)?.[1] || '')}, ${plural(fd.after + FEUD_RACES - roundsDone(s), 'race')} left</span></div>`).join('')}</div></div>` : ''}
  </div>`;
}
function rivalryModal() {
  const s = latestSeason(); const ids = gridIds(s);
  ui.modal = { kind: 'rivalry', a: ids.includes(PLAYER) ? PLAYER : ids[0], b: ids.find(id => id !== PLAYER && id !== ids[0]) || ids[1], reason: 'contact' };
  drawRivalryModal();
}
function drawRivalryModal() {
  const c = career(); const s = latestSeason(); const m = ui.modal;
  const opt = (k, v, l) => `<option value="${v}" ${m[k] === v ? 'selected' : ''}>${esc(l)}</option>`;
  const drivers = (k) => s.teams.map(t => `<optgroup label="${esc(t.name)}">${t.drivers.filter(Boolean).map(d => opt(k, d, dName(s, d))).join('')}</optgroup>`).join('');
  const preview = m.a !== m.b ? feudStory(c, s, { id: 'preview', seasonIdx: s.index, after: roundsDone(s), a: m.a, b: m.b, reason: m.reason }) : null;
  modal(`<div class="modal-h"><h2>Start a rivalry</h2><button class="icon-btn" data-act="modal-close">${ICON.x}</button></div>
    <div class="modal-b">
      <div class="form-grid">
        <label class="field"><span>Driver</span><select data-ch="rv-field" data-k="a">${drivers('a')}</select></label>
        <label class="field"><span>And</span><select data-ch="rv-field" data-k="b">${drivers('b')}</select></label>
        <label class="field"><span>Why</span><select data-ch="rv-field" data-k="reason">${FEUD_REASONS.map(([v, l]) => opt('reason', v, l)).join('')}</select></label>
      </div>
      ${preview ? `<div class="callout" style="border-left-color:var(--team)"><span class="label">Preview headline</span><div style="color:var(--fg);font-family:var(--font-display);font-size:18px;margin-top:4px">${esc(preview.headline)}</div></div>` : '<div class="callout">Pick two different drivers.</div>'}
      <p class="muted" style="font-size:13px">The story runs after round ${roundsDone(s) || 1}. For the next ${FEUD_RACES} races the press brings it up whenever the two qualify side by side or finish within five seconds of each other. Title rivals are tracked automatically.</p>
    </div>
    <div class="modal-f"><button class="btn ghost" data-act="modal-close">Cancel</button><button class="btn primary" data-act="rv-create" ${preview ? '' : 'disabled'}>Start the rivalry</button></div>`);
}
