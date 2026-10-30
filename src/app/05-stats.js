/* Pitwall — Season statistics and goals. Part of the renderer, split into files that load in order (see index.html). */
'use strict';
/* ---------------------------------------------------------------- stats */
function emptyStat() { return { pts: 0, wins: 0, podiums: 0, poles: 0, fls: 0, dnfs: 0, starts: 0, finPos: [], qPos: [], best: null, bestQ: null, sprintWins: 0, sprintPts: 0, posCount: Array(30).fill(0), byRound: {} }; }

/** Stats for a season; `upto` counts only the first n rounds (standings as they stood before round n+1). */
function seasonStats(s, upto = Infinity) {
  const st = {};
  const teams = {};
  Object.defineProperty(st, 'teams', { value: teams, enumerable: false }); // per-team totals, kept out of the driver keys
  const get = (id) => (st[id] ||= emptyStat());
  for (const id of gridIds(s)) get(id);
  for (const [ri, r] of activeRounds(s).entries()) {
    if (ri >= upto) break;
    const w = s.weekends[r.id];
    if (!w) continue;
    const q = w.sessions.Q;
    if (q?.done) q.results.forEach((x, i) => {
      const o = get(x.d); const pos = i + 1;
      if (OUT.includes(x.st)) return;
      o.qPos.push(pos); o.bestQ = o.bestQ == null ? pos : Math.min(o.bestQ, pos);
      if (q.pole === undefined ? pos === 1 : q.pole === x.d) o.poles++; // real seasons: the official pole (who started first)
      (o.byRound[r.id] ||= {}).q = pos;
    });
    for (const k of ['SPR', 'R']) {
      const sd = w.sessions[k];
      if (!sd?.done) continue;
      const fl = k === 'R' ? fastestOf(sd) : null;
      sd.results.forEach((x, i) => {
        const o = get(x.d); const pos = i + 1;
        const pts = pointsFor(k, pos, x.st, x.pts);
        o.pts += pts;
        // constructors' points stay with the team the driver raced for that weekend, even after a move
        const tid = teamAt(s, x.d, ri)?.id;
        if (tid) { const T = (teams[tid] ||= { pts: 0, wins: 0, podiums: 0 }); T.pts += pts; if (k === 'R' && !OUT.includes(x.st)) { if (pos === 1) T.wins++; if (pos <= 3) T.podiums++; } }
        (o.byRound[r.id] ||= {});
        if (k === 'R') {
          if (x.st === 'DNS') { o.byRound[r.id].r = 'DNS'; return; }
          o.starts++;
          o.byRound[r.id].r = OUT.includes(x.st) ? x.st : pos;
          o.byRound[r.id].fl = fl === x.d;
          if (OUT.includes(x.st)) { o.dnfs++; return; }
          o.finPos.push(pos); o.posCount[pos - 1]++;
          o.best = o.best == null ? pos : Math.min(o.best, pos);
          if (pos === 1) o.wins++;
          if (pos <= 3) o.podiums++;
        } else {
          o.sprintPts += pts;
          o.byRound[r.id].s = OUT.includes(x.st) ? x.st : pos;
          if (pos === 1 && !OUT.includes(x.st)) o.sprintWins++;
        }
      });
      if (fl) get(fl).fls++;
    }
  }
  return st;
}

function driverStandings(s, stats = seasonStats(s)) {
  const ids = Object.keys(stats).filter(id => s.drivers[id]);
  ids.sort((a, b) => {
    const A = stats[a], B = stats[b];
    if (B.pts !== A.pts) return B.pts - A.pts;
    for (let i = 0; i < 30; i++) if (B.posCount[i] !== A.posCount[i]) return B.posCount[i] - A.posCount[i];
    return 0;
  });
  return ids.map((id, i) => ({ id, pos: i + 1, ...stats[id] }));
}
function constructorStandings(s, stats = seasonStats(s)) {
  const rows = s.teams.map(t => {
    if (stats.teams) { const T = stats.teams[t.id] || { pts: 0, wins: 0, podiums: 0 }; return { team: t, ...T }; }
    const ids = Object.keys(stats).filter(id => teamOf(s, id)?.id === t.id);
    return { team: t, pts: ids.reduce((a, id) => a + stats[id].pts, 0), wins: ids.reduce((a, id) => a + stats[id].wins, 0), podiums: ids.reduce((a, id) => a + stats[id].podiums, 0) };
  });
  rows.sort((a, b) => b.pts - a.pts || b.wins - a.wins);
  return rows.map((r, i) => ({ ...r, pos: i + 1 }));
}
function roundsDone(s) { return activeRounds(s).filter(r => s.weekends[r.id]?.sessions?.R?.done).length; }
function nextRound(s) { return activeRounds(s).find(r => !s.weekends[r.id]?.sessions?.R?.done) || null; }

function h2hCompare(seasons, a, b) {
  const out = { q: [0, 0], r: [0, 0], s: [0, 0], pts: [0, 0], wins: [0, 0], podiums: [0, 0], poles: [0, 0], fls: [0, 0], dnfs: [0, 0], qPos: [[], []], finPos: [[], []], best: [null, null], bestQ: [null, null], rounds: [] };
  for (const s of seasons) {
    const st = seasonStats(s);
    const A = st[a], B = st[b];
    [[A, 0], [B, 1]].forEach(([o, i]) => {
      if (!o) return;
      out.pts[i] += o.pts; out.wins[i] += o.wins; out.podiums[i] += o.podiums; out.poles[i] += o.poles; out.fls[i] += o.fls; out.dnfs[i] += o.dnfs;
      out.qPos[i].push(...o.qPos); out.finPos[i].push(...o.finPos);
      if (o.best != null) out.best[i] = out.best[i] == null ? o.best : Math.min(out.best[i], o.best);
      if (o.bestQ != null) out.bestQ[i] = out.bestQ[i] == null ? o.bestQ : Math.min(out.bestQ[i], o.bestQ);
    });
    for (const r of activeRounds(s)) {
      const ra = A?.byRound[r.id] || {}, rb = B?.byRound[r.id] || {};
      const num = (v) => typeof v === 'number' ? v : (v ? 99 : null);
      if (ra.q != null && rb.q != null) out.q[ra.q < rb.q ? 0 : 1]++;
      const xa = num(ra.r), xb = num(rb.r);
      if (xa != null && xb != null && !(xa === 99 && xb === 99)) out.r[xa < xb ? 0 : 1]++;
      const sa = num(ra.s), sb = num(rb.s);
      if (sa != null && sb != null && !(sa === 99 && sb === 99)) out.s[sa < sb ? 0 : 1]++;
      if (ra.r != null || rb.r != null) out.rounds.push({ label: `${s.year} ${r.name}`, short: r.id.toUpperCase(), a: ra.r, b: rb.r, aq: ra.q, bq: rb.q });
    }
  }
  return out;
}

/* ----------------------------------------------------------------- goals */
/** A goal is the team's or one driver's (yours, or one of your drivers in My Team). Older goals had no scope. */
const goalScope = (g) => g.scope || (D.GOAL_TYPES.find(x => x.id === g.type)?.scope === 'team' ? 'team' : 'driver');
function evalGoal(g, s) {
  const stats = seasonStatsCache(s);
  const d = g.driver && s.drivers[g.driver] ? g.driver : PLAYER;
  const me = stats[d] || emptyStat();
  const ds = driverStandings(s, stats);
  const myPos = ds.find(x => x.id === d)?.pos ?? null;
  const mate = teammateOf(s, d);
  const cs = constructorStandings(s, stats);
  const row = cs.find(x => x.team.id === s.playerTeamId) || { pts: 0, wins: 0, podiums: 0, pos: null };
  const t = +g.target || 0;
  const res = (value, ok, pct, text) => ({ value, ok, pct: Math.max(0, Math.min(100, pct)), text });
  const upTo = (have, want, unit) => res(have, have >= want, want ? have / want * 100 : 100, `${have} / ${want} ${unit}`);
  switch (g.type) {
    case 'champ_pos': return res(myPos, myPos != null && myPos <= t, myPos ? (myPos <= t ? 100 : Math.max(5, 100 - (myPos - t) * 12)) : 0, `Currently ${ord(myPos)} · target top ${t}`);
    case 'beat_teammate': {
      const mp = stats[mate]?.pts || 0;
      return res(me.pts - mp, me.pts > mp, me.pts + mp === 0 ? 50 : (me.pts / (me.pts + mp)) * 100, `${me.pts} pts vs ${dAbbr(s, mate)} ${mp} pts`);
    }
    case 'wins': return upTo(me.wins, t, 'wins');
    case 'podiums': return upTo(me.podiums, t, 'podiums');
    case 'poles': return upTo(me.poles, t, 'poles');
    case 'points': return upTo(me.pts, t, 'points');
    case 'quali_h2h': {
      const h = h2hCompare([s], d, mate);
      const tot = h.q[0] + h.q[1];
      return res(h.q[0], h.q[0] > h.q[1], tot ? h.q[0] / tot * 100 : 50, `${h.q[0]}–${h.q[1]} vs ${dAbbr(s, mate)}`);
    }
    case 'constructor_pos': { const p = row.pos; return res(p, p != null && p <= t, p ? (p <= t ? 100 : Math.max(5, 100 - (p - t) * 12)) : 0, `Team is ${ord(p)} · target top ${t}`); }
    case 'team_points': return upTo(row.pts, t, 'points');
    case 'team_wins': return upTo(row.wins, t, 'wins');
    case 'team_podiums': return upTo(row.podiums, t, 'podiums');
    case 'beat_team': {
      const o = cs.find(x => x.team.id === g.team);
      if (!o) return res(null, false, 0, 'That team is not on the grid');
      return res(row.pts - o.pts, row.pos != null && row.pos < o.pos, row.pts + o.pts ? row.pts / (row.pts + o.pts) * 100 : 50, `${row.pts} pts vs ${o.team.name} ${o.pts} pts`);
    }
    default: return res(null, !!g.done, g.done ? 100 : 0, g.done ? 'Marked as achieved' : 'Tick when achieved');
  }
}
function goalTitle(g, s = curSeason()) {
  const gt = D.GOAL_TYPES.find(x => x.id === g.type);
  let txt;
  if (g.type === 'custom') txt = g.text || 'Custom goal';
  else if (g.type === 'beat_team') txt = `Finish ahead of ${(s?.teams.find(x => x.id === g.team) || teamMeta(career(), g.team))?.name || 'a rival team'}`;
  else if (g.type === 'champ_pos' || g.type === 'constructor_pos') txt = `${gt.label} ${g.target}`;
  else if (gt?.needsTarget) txt = `${g.target} ${gt.unit === 'points' ? (goalScope(g) === 'team' ? 'constructors’ points' : 'championship points') : gt.label.toLowerCase()}`;
  else txt = gt?.label || g.type;
  return g.driver && g.driver !== PLAYER_ID && goalScope(g) === 'driver' && s ? `${lastName(dName(s, g.driver))}: ${txt}` : txt;
}
/** The season's goals on the dashboard: the team's, then the drivers'. */
function goalsPanel(c, s) {
  const done = roundsDone(s);
  const row = (g) => { const e = evalGoal(g, s); return `<div class="goal">
    <div><div style="font-weight:600">${esc(goalTitle(g, s))}</div><div class="muted" style="font-size:12px">${esc(e.text)}</div></div>
    <div class="row">${g.type === 'custom' ? `<label class="check"><input type="checkbox" data-ch="goal-done" data-id="${g.id}" ${g.done ? 'checked' : ''}> Done</label>` : `<span class="status-dot ${e.ok ? 'ok' : done ? 'warn' : ''}"></span><span class="muted" style="font-size:12px">${e.ok ? 'On target' : done ? 'Behind' : 'Not started'}</span>`}</div>
    <div class="bar-track"><div class="bar-fill ${e.ok ? 'ok' : ''}" style="width:${e.pct}%"></div></div></div>`; };
  const team = s.goals.filter(g => goalScope(g) === 'team'), drv = s.goals.filter(g => goalScope(g) !== 'team');
  return `<div class="panel"><div class="panel-h"><h2>${s.year} goals</h2><button class="btn sm" data-act="edit-goals">Edit goals</button></div>
    ${s.goals.length ? `${team.length ? `<div class="panel-b"><span class="label">Team</span>${team.map(row).join('')}</div>` : ''}${drv.length ? `<div class="panel-b" ${team.length ? 'style="border-top:1px solid var(--line)"' : ''}><span class="label">${isPrincipal(c) ? 'Drivers' : 'You'}</span>${drv.map(row).join('')}</div>` : ''}`
      : `<div class="empty">No goals set for ${s.year}.<button class="btn sm" data-act="edit-goals">Set goals</button></div>`}</div>`;
}
