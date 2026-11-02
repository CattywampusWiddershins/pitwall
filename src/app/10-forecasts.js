/* Pitwall — Title maths, projections, performance and driver ratings. Part of the renderer, split into files that load in order (see index.html). */
'use strict';
/* ------------------------------------------------------------ title maths */
// Ties on points count as still alive: countback would settle them, and it can't be known in advance.
const posPts = (p) => D.RACE_POINTS[p - 1] || 0;
const NO_PTS = D.RACE_POINTS.length + 1; // stands for "outside the points"
/**
 * The championship as it stands, and what is left to race. `upto` gives the picture before that round
 * (used for previews and history); without it, the live state including a sprint already run this weekend.
 */
function titleMath(s, kind = 'driver', upto = null, { afterSprint = false } = {}) {
  const team = kind === 'team';
  // real seasons had a point for fastest lap (2019–24) and a smaller sprint (2021)
  const fl = s.scoring?.fl || 0, spr = s.scoring?.spr || D.SPRINT_POINTS;
  const M = team ? { R: D.RACE_POINTS[0] + D.RACE_POINTS[1] + fl, SPR: spr[0] + spr[1] } : { R: D.RACE_POINTS[0] + fl, SPR: spr[0] };
  const st = upto == null ? seasonStatsCache(s) : seasonStats(s, upto);
  const rows = team ? constructorStandings(s, st).map(x => ({ id: x.team.id, name: x.team.name, pts: x.pts, wins: x.wins }))
    : driverStandings(s, st).map(x => ({ id: x.id, name: dName(s, x.id), pts: x.pts, wins: x.wins, posCount: x.posCount }));
  // after round upto's sprint (its race still to come): that sprint's points on top
  const sprintIn = afterSprint && upto != null && !!activeRounds(s)[upto]?.sprint && !!s.weekends[activeRounds(s)[upto].id]?.sessions?.SPR?.done;
  if (sprintIn) {
    const R0 = activeRounds(s)[upto]; const res = s.weekends[R0.id].sessions.SPR.results || [];
    res.forEach((x, k) => {
      const p = pointsFor('SPR', k + 1, x.st, x.pts); if (!p) return;
      const id = team ? teamAt(s, x.d, upto)?.id : x.d; let row = rows.find(y => y.id === id);
      if (!row && !team) rows.push(row = { id, name: dName(s, id), pts: 0, wins: 0, posCount: [] });
      if (row) row.pts += p;
    });
    rows.sort((a, b) => b.pts - a.pts || b.wins - a.wins);
  }
  const left = [];
  activeRounds(s).forEach((r, i) => {
    const w = s.weekends[r.id]?.sessions;
    if (upto != null ? i < upto : w?.R?.done) return;
    const spr = !!r.sprint && (upto != null ? !(sprintIn && i === upto) : !w?.SPR?.done);
    left.push({ r, i, spr, max: M.R + (spr ? M.SPR : 0) });
  });
  const R = left.reduce((a, x) => a + x.max, 0);
  const lead = rows[0]?.pts || 0;
  // countback: someone who can at best draw level is still out if the leader would keep more wins even if they won
  // every race that's left
  const n = left.length, leadWins = rows[0]?.wins || 0;
  rows.forEach((x, i) => { x.pos = i + 1; x.gap = lead - x.pts; x.maxPts = x.pts + R; x.alive = i === 0 || x.maxPts > lead || (x.maxPts === lead && x.wins + n >= leadWins); });
  const margin = rows.length > 1 ? rows[0].pts - rows[1].pts : 0;
  const decided = rows.length > 1 && lead > 0 && (R === 0 || rows.slice(1).every(x => !x.alive));
  return { s, kind, team, M, rows, left, R, lead, margin, decided, champion: decided ? rows[0] : null };
}
/** The first remaining round where x could be champion: x takes maximum points, nobody else scores. */
function earliestClinch(m, x) {
  const best = Math.max(0, ...m.rows.filter(y => y !== x).map(y => y.pts));
  let got = 0;
  for (const l of m.left) { got += l.max; if (x.pts + got - best > m.R - got) return l; }
  return null;
}
/** When each driver/team dropped out of the fight, and when the title was settled. */
function fightHistory(s, kind) {
  const outAt = {}; let decidedAt = null;
  const done = activeRounds(s).map((r, i) => ({ r, i })).filter(x => s.weekends[x.r.id]?.sessions?.R?.done);
  for (const { r, i } of done) {
    const m = titleMath(s, kind, i + 1);
    for (const x of m.rows) if (!x.alive && outAt[x.id] == null) outAt[x.id] = { r, i };
    if (m.decided && !decidedAt && m.left.length) decidedAt = { r, i, champion: m.rows[0] };
  }
  return { outAt, decidedAt };
}

/** Every way the title can be won, and every way a contender can drop out, at the next round. */
function roundPerms(m) {
  const nx = m.left[0]; if (!nx || m.decided) return null;
  const G = nx.max, Rp = m.R - G, fl = m.s.scoring?.fl || 0;
  const exact = !m.team && !nx.spr; // a single race: positions map straight onto points
  const alive = m.rows.filter(x => x.alive);
  // the final race of a drivers' title: compare the final points, and on a tie, countback
  if (exact && Rp === 0) {
    const clinch = [];
    for (const x of alive) {
      const rivals = m.rows.filter(y => y !== x && y.alive && y.pts + G >= x.pts); // one who can outscore x but can't be champion doesn't come into it
      const table = clinchTableFinal(x, rivals, fl);
      if (table.length) clinch.push({ x, rivals: rivals.map(y => ({ y, need: x.pts - y.pts })), table });
    }
    return { nx, G, Rp, exact, final: true, clinch, out: [], safe: [] };
  }
  const clinch = [];
  for (const x of alive) {
    const others = m.rows.filter(y => y !== x);
    const best = Math.max(0, ...others.map(y => y.pts));
    if (x.pts + G - best <= Rp) continue;
    // x is champion if it beats every rival y by `need` points or more this weekend (rivals who can't be champion
    // themselves don't come into it: they can't end up ahead of the one who would be)
    const rivals = others.filter(y => y.alive).map(y => ({ y, need: Rp - (x.pts - y.pts) + 1 })).filter(o => o.need > -G);
    clinch.push({ x, rivals, table: exact ? clinchTable(rivals, fl) : m.team && !nx.spr ? teamTable(rivals, D.RACE_POINTS, fl) : null });
  }
  const out = [];
  for (const j of alive) {
    // k knocks j out if it ends the weekend more than Rp ahead; j survives k while gj - gk >= -e
    const threats = m.rows.filter(k => k !== j && k.pts + G - j.pts > Rp).map(k => ({ k, e: j.pts + Rp - k.pts }));
    if (threats.length) out.push({ j, threats: threats.map(t => ({ ...t, table: exact ? elimTable(t.e, fl) : null })) });
  }
  return { nx, G, Rp, exact, clinch, out, safe: alive.filter(j => !out.some(o => o.j === j)) };
}
/**
 * A title that can be won in a round's sprint: who can be champion after it, whatever the race does (m: the picture
 * before the weekend). Drivers get a table by sprint finish; teams one by the points both cars score.
 */
function sprintPerms(m) {
  const nx = m.left[0]; if (!nx || m.decided || !nx.spr) return null;
  const spr = m.s.scoring?.spr || D.SPRINT_POINTS; const G = m.team ? spr[0] + spr[1] : spr[0]; const Rp = m.R - G;
  const clinch = [];
  for (const x of m.rows.filter(y => y.alive)) {
    const best = Math.max(0, ...m.rows.filter(y => y !== x).map(y => y.pts));
    if (x.pts + G - best <= Rp) continue;
    const rivals = m.rows.filter(y => y !== x && y.alive).map(y => ({ y, need: Rp - (x.pts - y.pts) + 1 })).filter(o => o.need > -G);
    clinch.push({ x, rivals, table: m.team ? teamTable(rivals, spr) : clinchTableP(rivals, (p) => spr[p - 1] || 0, spr.length + 1) });
  }
  return { nx, G, Rp, exact: !m.team, sprint: true, clinch, out: [], safe: [] };
}
/** clinchTable for any points scale: pts(p) the points for finishing p, nop the place that stands for "outside the points". */
function clinchTableP(rivals, pts, nop) {
  const rows = [];
  for (let p = 1; p <= nop; p++) {
    const conds = [];
    for (const o of rivals) {
      const limit = pts(p) - o.need; if (limit < 0) return rows;
      let q = 1; while (q < nop && (q === p || pts(q) > limit)) q++;
      conds.push({ y: o.y, q: q === 1 || (q === 2 && p === 1) ? 0 : q, nop });
    }
    rows.push({ p, nop, conds });
  }
  return rows;
}
/**
 * A team's clinch table by points: for each haul both cars can score (P: the points scale), the most each rival
 * may score. [{ pts, combo, conds: [{ y, max }] }] (max null: no limit), the hauls that still win it. fl: a point for
 * fastest lap, which a car in the points can add.
 */
function teamTable(rivals, P, fl = 0) {
  const hauls = new Map(); const n = P.length;
  for (let a = 0; a <= n; a++) for (let b = a + 1; b <= n + 1; b++) {
    const v = (P[a] || 0) + (P[b] || 0); if (!hauls.has(v)) hauls.set(v, [a + 1, b + 1]);
    if (fl && a < n && !hauls.has(v + fl)) hauls.set(v + fl, [a + 1, b + 1, true]);
  }
  const all = [...hauls.keys()].sort((x, y) => y - x); const top = all[0];
  const rows = [];
  for (const v of all) {
    const conds = [];
    for (const o of rivals) {
      const most = v - o.need; if (most < 0) return rows;
      conds.push({ y: o.y, max: most >= top ? null : all.find(t => t <= most) ?? 0 });
    }
    const [a, b, f] = hauls.get(v); rows.push({ pts: v, combo: `${a > n ? '–' : a}-${b > n ? '–' : b}${f ? ' +FL' : ''}`, conds });
  }
  return rows;
}
/** A race's finishes, best first, by the points they're worth: with a point for fastest lap (2019–24), each scoring place with and without it. */
function raceLadder(fl = 0) {
  const L = [];
  for (let p = 1; p < NO_PTS; p++) { if (fl) L.push({ p, fl: true, pts: posPts(p) + fl }); L.push({ p, fl: false, pts: posPts(p) }); }
  L.push({ p: NO_PTS, fl: false, pts: 0 });
  return L;
}
// two cars can't share a place (outside the points aside) or the fastest lap
const clash = (a, b) => (a.p === b.p && a.p < NO_PTS) || (a.fl && b.fl);
/** A finish with the fastest lap folds into the same finish without it when the conditions come out the same. */
function mergeFl(rows, key) {
  return rows.filter((r, i) => !(r.fl && rows[i + 1] && rows[i + 1].q === r.q && rows[i + 1].p === r.p && key(rows[i + 1]) === key(r)));
}
const condKey = (r) => JSON.stringify(r.conds.map(c => [c.q, c.nofl]));
/** A rival's condition: the best finish it may take (q 0: anywhere); nofl: that place only without the fastest lap. */
const rivalCond = (y, ok, e, own, fl) => ({ y, q: e === ok[0] ? 0 : e.p, nofl: !!fl && !own.fl && !e.fl && e.p < NO_PTS && e !== ok[0] });
function clinchTable(rivals, fl = 0) {
  const L = raceLadder(fl); const rows = [];
  for (const o of L) {
    const conds = [];
    for (const r of rivals) {
      const limit = o.pts - r.need; // the most the rival may score
      if (limit < 0) return mergeFl(rows, condKey);
      const ok = L.filter(e => !clash(o, e));
      conds.push(rivalCond(r.y, ok, ok.find(e => e.pts <= limit), o, fl));
    }
    rows.push({ p: o.p, fl: o.fl, conds });
  }
  return mergeFl(rows, condKey);
}
/** After the final race with x finishing p and y finishing q: >0 x ahead, <0 y ahead, 0 dead level (countback included). */
function finalCmp(x, p, y, q, xfl = 0, yfl = 0) {
  const px = x.pts + posPts(p) + xfl, py = y.pts + posPts(q) + yfl;
  if (px !== py) return px - py;
  const vx = (x.posCount || []).slice(), vy = (y.posCount || []).slice();
  vx[Math.min(p, NO_PTS) - 1] = (vx[Math.min(p, NO_PTS) - 1] || 0) + 1;
  vy[Math.min(q, NO_PTS) - 1] = (vy[Math.min(q, NO_PTS) - 1] || 0) + 1;
  for (let i = 0; i < 30; i++) { const a = vx[i] || 0, b = vy[i] || 0; if (a !== b) return a - b; }
  return 0;
}
/** Final-race clinch table: for each finish of x, how far down each rival has to finish for x to be champion. */
function clinchTableFinal(x, rivals, fl = 0) {
  const L = raceLadder(fl); const rows = [];
  for (const o of L) {
    const conds = [];
    for (const y of rivals) {
      // the best finish y can take with x still ahead after countback
      const ok = L.filter(e => !clash(o, e)); let best = null;
      for (let k = ok.length - 1; k >= 0; k--) { if (finalCmp(x, o.p, y, ok[k].p, o.fl ? fl : 0, ok[k].fl ? fl : 0) > 0) best = ok[k]; else break; }
      if (!best) return mergeFl(rows, condKey); // x can't be champion finishing here, or lower
      conds.push(rivalCond(y, ok, best, o, fl));
    }
    rows.push({ p: o.p, fl: o.fl, conds });
  }
  return mergeFl(rows, condKey);
}
/** For each finish of a threat (q), the worst finish that keeps j in the fight (p), or safe / out. */
function elimTable(e, fl = 0) {
  const L = raceLadder(fl); const rows = [];
  for (const k of L) {
    const need = k.pts - e;
    if (need <= 0) { rows.push({ q: k.p, fl: k.fl, safe: true }); break; }
    const w = L.filter(x => !clash(k, x) && x.pts >= need).pop();
    rows.push(w ? { q: k.p, fl: k.fl, p: w.p, pfl: w.fl } : { q: k.p, fl: k.fl, out: true });
  }
  return mergeFl(rows, (r) => JSON.stringify([r.p, r.pfl, r.safe, r.out]));
}
const posTxt = (p) => p >= NO_PTS ? 'outside the points' : 'P' + p;
const finTxt = (p, fl) => posTxt(p) + (fl ? ' with the fastest lap' : '');
/** A rival's condition: "P4 or lower", or with fastest-lap points "P4 or lower, or P3 without the fastest lap". */
const orLowerTxt = (c) => c.q >= NO_PTS ? 'outside the points' : c.nofl ? `${c.q + 1 >= NO_PTS ? 'outside the points' : posTxt(c.q + 1) + ' or lower'}, or ${posTxt(c.q)} without the fastest lap` : posTxt(c.q) + ' or lower';
/** The finishes below a table's last row: "P5 or lower", "P4 without the fastest lap, or lower". */
const belowTxt = (r) => r.fl ? `${posTxt(r.p)} without the fastest lap, or lower` : r.p + 1 >= NO_PTS ? 'outside the points' : posTxt(r.p + 1) + ' or lower';
/** A clinch table split at the lowest finish that wins it whatever the others do: { sure (that row, or null), rest }. */
function sureSplit(table) { let k = 0; while (k < table.length && table[k].conds.every(c => !c.q)) k++; return { sure: k ? table[k - 1] : null, rest: table.slice(k) }; }
/** "wins", "finishes P3 or higher". */
const sureTxt = (r) => r.p === 1 ? (r.fl ? 'wins with the fastest lap' : 'wins') : `finishes ${finTxt(r.p, r.fl)} or higher`;
/** "x must outscore y by…" for a weekend where only points totals can be compared. */
function marginTxt(a, b, n) {
  if (n > 0) return `${a} must outscore ${b} by at least ${n} point${n === 1 ? '' : 's'}`;
  if (n === 0) return `${a} must not be outscored by ${b}`;
  return `${a} can afford to be outscored by ${b} by up to ${-n} point${n === -1 ? '' : 's'}`;
}
function permsHtml(m, P, { compact = false } = {}) {
  const nm = (x) => esc(x.name);
  const gp = esc(P.nx.r.name);
  let html = '';
  if (P.clinch.length) {
    html += P.clinch.map(({ x, rivals, table }) => `<div class="perm"><h3>${nm(x)} ${m.team ? 'are champions' : 'is champion'} in ${gp} if…</h3>
      ${table ? (({ sure, rest }, last) => `<ul class="perm-list">${sure ? `<li><b>${nm(x)} ${sureTxt(sure)}</b>: ${nm(x)} ${m.team ? 'are champions' : 'is champion'}</li>` : ''}${rest.map(r => `<li><b>${nm(x)} finishes ${finTxt(r.p, r.fl)}</b>${' and ' + r.conds.filter(c => c.q).map(c => `${nm(c.y)} finishes ${orLowerTxt(c)}`).join(', and ')}</li>`).join('')}
        ${last.p < NO_PTS ? `<li class="muted">${nm(x)} cannot be champion finishing ${belowTxt(last)}.</li>` : ''}</ul>`)(sureSplit(table), table[table.length - 1])
      : `<ul class="perm-list">${rivals.map(o => `<li>${marginTxt(nm(x), nm(o.y), o.need)}</li>`).join('')}</ul>`}
    </div>`).join('');
  } else if (!compact) {
    const L = m.rows[0];
    html += `<div class="callout">The title cannot be won at the ${gp} Grand Prix. Even with maximum points, ${nm(L)} would lead by at most ${L.pts + P.G - (m.rows[1]?.pts || 0)} points with ${P.Rp} still available afterwards.</div>`;
  }
  if (compact) return html;
  if (P.out.length) {
    html += `<h3 style="margin-top:6px">Who can drop out of the fight in ${gp}</h3>`;
    html += P.out.map(({ j, threats }) => `<details class="perm" ${P.out.length <= 3 ? 'open' : ''}><summary><b>${nm(j)}</b> <span class="muted">${j.pts} pts · stays in the fight if…</span></summary>
      ${threats.length > 1 ? `<p class="muted" style="font-size:12px">${threats.map(t => nm(t.k)).join(' and ')} can each end it, so every condition below has to hold.</p>` : ''}
      ${threats.map(t => t.table ? `<ul class="perm-list">${t.table.map(r => `<li>If <b>${nm(t.k)}</b> finishes ${finTxt(r.q, r.fl)}${r.safe && r.q < NO_PTS ? ' or lower' : ''}, ${r.safe ? `${nm(j)} stays in the fight` : r.out ? `<span class="neg">${nm(j)} is out</span>` : r.p === 1 ? `${nm(j)} must win${r.pfl ? ' with the fastest lap' : ''}` : `${nm(j)} must finish ${finTxt(r.p, r.pfl)} or higher`}</li>`).join('')}</ul>`
        : `<ul class="perm-list"><li>${marginTxt(nm(j), nm(t.k), -t.e)}</li></ul>`).join('')}
    </details>`).join('');
  }
  if (P.safe.length) html += `<p class="muted" style="font-size:13px">Safe in ${gp} whatever happens: ${P.safe.map(nm).join(', ')}.</p>`;
  if (P.final) html += `<p class="muted" style="font-size:12px">Final race: if it ends level on points, countback decides it (most wins, then most second places, and so on). That is already counted in the conditions above.</p>`;
  if (!P.exact) html += `<p class="muted" style="font-size:12px">${P.nx.spr ? 'Sprint weekend: sprint and race points count together, so conditions are given in points over the weekend.' : 'Team results combine both cars, so conditions are given in points.'}</p>`;
  return html;
}

/* ------------------------------------------------------------ projection */
/** A driver's last n race starts, newest first, topping up from the previous season when this one is short. */
function recentRaces(c, s, id, n = 5) {
  const out = [];
  for (let k = s.index; k >= Math.max(0, s.index - 1) && out.length < n; k--) {
    const ss = c.seasons[k]; if (!ss) continue;
    const rounds = activeRounds(ss);
    for (let i = rounds.length - 1; i >= 0 && out.length < n; i--) {
      const sd = ss.weekends[rounds[i].id]?.sessions?.R;
      if (!sd?.done) continue;
      const at = sd.results.findIndex(x => x.d === id);
      if (at < 0 || sd.results[at].st === 'DNS') continue;
      const x = sd.results[at];
      out.push({ year: ss.year, r: rounds[i], pos: at + 1, st: x.st, pts: pointsFor('R', at + 1, x.st, x.pts) });
    }
  }
  return out;
}
/**
 * The rest of the season on current form: each remaining race is worth the driver's average race points over
 * their last 5 starts, each sprint the points for their average finishing position over those races (rounded).
 * Only the final total is rounded. Teams add up their current drivers.
 */
function projection(c, s, m) {
  const md = m.team ? titleMath(s, 'driver') : m;
  const per = {};
  for (const x of md.rows) {
    const form = recentRaces(c, s, x.id);
    const racePts = form.length ? avg(form.map(f => f.pts)) : 0;
    const sprPos = form.length ? Math.round(avg(form.map(f => f.pos))) : null;
    const sprPts = sprPos ? pointsFor('SPR', sprPos, 'FIN') : 0;
    let cum = 0;
    const path = m.left.map(l => (cum += racePts + (l.spr ? sprPts : 0)));
    per[x.id] = { form, racePts, sprPos, sprPts, path, gain: cum, prior: form.filter(f => f.year !== s.year).length };
  }
  const rows = m.rows.map(x => {
    if (!m.team) return { ...x, ...per[x.id] };
    const ds = (s.teams.find(t => t.id === x.id)?.drivers || []).filter(d => per[d]);
    const sum = (k) => ds.reduce((a, d) => a + per[d][k], 0);
    return { ...x, ds, racePts: sum('racePts'), sprPts: sum('sprPts'), gain: sum('gain'), path: m.left.map((_, k) => ds.reduce((a, d) => a + per[d].path[k], 0)), form: ds.flatMap(d => per[d].form) };
  });
  for (const x of rows) x.final = Math.round(x.pts + x.gain);
  rows.sort((a, b) => b.final - a.final || a.pos - b.pos);
  rows.forEach((x, i) => { x.ppos = i + 1; x.move = x.pos - x.ppos; });
  // the round where the projected leader would be out of reach
  let decider = null, rest = m.R;
  for (let k = 0; k < m.left.length && !decider; k++) {
    rest -= m.left[k].max;
    const tot = rows.map(x => x.pts + x.path[k]).sort((a, b) => b - a);
    if (tot.length > 1 && tot[0] - tot[1] > rest) decider = m.left[k];
  }
  return { rows, decider, hasForm: rows.some(x => x.form.length), sprints: m.left.filter(l => l.spr).length };
}
function projectionHtml(c, s, m) {
  if (!m.left.length) return '';
  const team = m.team;
  const Pj = projection(c, s, m);
  if (!Pj.hasForm) return '';
  const isMe = (x) => team ? x.id === s.playerTeamId : x.id === PLAYER;
  const who = (x) => team ? `<div class="drv">${teamLogo(c, s.teams.find(t => t.id === x.id), 26)}<b>${esc(x.name)}</b></div>` : drvCell(s, x.id, { size: 26 });
  const colorOf = (x) => team ? s.teams.find(t => t.id === x.id)?.color || '#5E6A82' : teamColor(s, x.id);
  // chart: actual points so far, then the projection dashed
  const prog = progression(s, team ? 'team' : 'driver');
  const baseLabels = prog.n ? prog.labels : ['NOW'];
  const labels = [...baseLabels, ...m.left.map(l => l.r.id.toUpperCase())];
  const names = [...(prog.n ? prog.names : ['Now']), ...m.left.map(l => l.r.name + ' (projected)')];
  let picks = Pj.rows.slice(0, 8);
  const me = Pj.rows.find(isMe); if (me && !picks.includes(me)) picks = [...picks, me];
  const series = picks.map(x => {
    const base = prog.n ? (prog.by[x.id]?.pts || Array(prog.n).fill(null)) : [x.pts];
    return { label: team ? x.name.split(' ')[0] : dAbbr(s, x.id), name: x.name, color: colorOf(x), bold: isMe(x), split: base.length, vals: [...base, ...x.path.map(v => Math.round(x.pts + v))] };
  });
  const L = Pj.rows[0];
  const prior = Pj.rows.some(x => x.prior);
  const formCell = (x) => `<span class="form-run">${x.form.slice().reverse().map(f => `<span class="tag ${OUT.includes(f.st) ? 'dnf' : f.pos <= 3 ? 'done' : ''} ${f.year !== s.year ? 'prev' : ''}" title="${f.year} ${esc(f.r.name)}: ${OUT.includes(f.st) ? f.st : 'P' + f.pos} · ${f.pts} pts">${OUT.includes(f.st) ? f.st : 'P' + f.pos}</span>`).join('')}</span>`;
  const mv = (n) => n > 0 ? `<span class="pos-up">▲${n}</span>` : n < 0 ? `<span class="neg">▼${-n}</span>` : '<span class="dim">–</span>';
  return `<div class="panel"><div class="panel-h"><div><span class="label">On current form</span><h2>Season projection</h2></div>
      <span class="muted" style="font-size:12px">Each remaining race is worth a ${team ? 'team’s drivers’' : 'driver’s'} average race points over their last 5 starts${Pj.sprints ? '; each sprint, the points for their average finishing position over those races' : ''}.</span></div>
    <div class="tiles" style="padding:14px 16px 0">
      <div class="tile"><span class="label">Projected champion${team ? 's' : ''}</span><span class="v" style="font-size:20px">${esc(L.name)}</span><span class="muted" style="font-size:12px">${L.final} pts${Pj.rows[1] ? ` · by ${L.final - Pj.rows[1].final}` : ''}</span></div>
      <div class="tile"><span class="label">Projected decider</span><span class="v" style="font-size:20px">${m.decided ? 'Decided' : Pj.decider ? `R${Pj.decider.i + 1}` : 'Final round'}</span><span class="muted" style="font-size:12px">${m.decided ? 'Already settled' : Pj.decider ? esc(Pj.decider.r.name) : esc(m.left[m.left.length - 1].r.name)}</span></div>
      <div class="tile"><span class="label">Races left</span><span class="v">${m.left.length}</span><span class="muted" style="font-size:12px">${Pj.sprints ? `+ ${Pj.sprints} sprint${Pj.sprints > 1 ? 's' : ''}` : 'no sprints'}</span></div>
    </div>
    <div class="panel-b">${lineChart(series, labels, { names })}</div>
    <div class="panel-b tight table-wrap"><table>
      <thead><tr><th>Proj</th><th></th><th>${team ? 'Team' : 'Driver'}</th><th class="num">Now</th>${team ? '<th>Drivers</th>' : '<th>Last 5 races</th>'}<th class="num">Avg / race</th>${Pj.sprints ? `<th class="num">${team ? 'Sprint pts' : 'Sprint pick'}</th>` : ''}<th class="num">To come</th><th class="num">Projected</th></tr></thead>
      <tbody>${Pj.rows.map(x => `<tr class="${isMe(x) ? 'me' : ''}" ${team ? `data-act="open-team" data-id="${x.id}"` : `data-act="open-driver" data-id="${x.id}"`}>
        <td class="pos ${x.ppos <= 3 ? 'p' + x.ppos : ''}">${x.ppos}</td><td class="num">${mv(x.move)}</td><td>${who(x)}</td><td class="num muted">${x.pts}</td>
        <td>${team ? `<span class="muted">${x.ds.map(d => esc(dAbbr(s, d))).join(' + ')}</span>` : x.form.length ? formCell(x) : '<span class="dim">No races yet</span>'}</td>
        <td class="num">${x.form.length ? x.racePts.toFixed(1) : '–'}</td>
        ${Pj.sprints ? `<td class="num">${team ? x.sprPts : x.sprPos ? `P${x.sprPos} <span class="muted">(${x.sprPts})</span>` : '–'}</td>` : ''}
        <td class="num muted">+${x.gain.toFixed(1)}</td><td class="num"><b>${x.final}</b></td></tr>`).join('')}</tbody></table></div>
    <div class="panel-b muted" style="font-size:12px;border-top:1px solid var(--line)">A DNF counts as 0 points, at the place it was classified. ${prior ? `Faded results are from ${c.seasons[s.index - 1]?.year}, used to make up 5 races. ` : ''}Projected totals are rounded to the nearest point; ties go to the current championship order.</div>
  </div>`;
}

function renderForecast() {
  const c = career(); const s = curSeason();
  const kind = ui.fc; const team = kind === 'team';
  const m = titleMath(s, kind);
  const hist = fightHistory(s, kind);
  const P = roundPerms(m);
  const rounds = activeRounds(s);
  const done = roundsDone(s);
  const alive = m.rows.filter(x => x.alive);
  const dead = m.rows.filter(x => !x.alive);
  const L = m.rows[0];
  const early = L && !m.decided ? earliestClinch(m, L) : null;
  const scale = Math.max(1, ...alive.map(x => x.maxPts));
  const who = (x, size = 26) => team ? `<div class="drv">${teamLogo(c, s.teams.find(t => t.id === x.id), size)}<b>${esc(x.name)}</b></div>` : drvCell(s, x.id, { size });
  const rLabel = (l) => l ? `R${l.i + 1} ${esc(l.r.name)}` : '–';
  const isMe = (x) => team ? x.id === s.playerTeamId : x.id === PLAYER;
  const kindSeg = `<div class="row">${seasonPicker(c, s.index)}<div class="seg">${[['driver', 'Drivers'], ['team', 'Constructors']].map(([v, l]) => `<button data-act="fc-kind" data-v="${v}" class="${kind === v ? 'on' : ''}">${l}</button>`).join('')}</div>${standingsTabs('forecast')}</div>`;
  if (!m.rows.some(x => x.pts > 0)) {
    return `<div class="page">
      <div class="page-head"><div><h1>Title Forecast</h1><div class="sub">${s.year} · ${rounds.length} rounds · ${m.R} points available to each ${team ? 'team' : 'driver'}</div></div>${kindSeg}</div>
      <div class="panel"><div class="empty" style="padding:40px 16px">No points scored yet, so every ${team ? 'team' : 'driver'} starts level.${early ? ` The earliest the ${team ? 'constructors’' : 'drivers’'} title can be won is Round ${early.i + 1}, ${esc(early.r.name)}.` : ''} Log a race to see who is still in the fight and what each contender needs.</div></div>
      ${projectionHtml(c, s, m)}
    </div>`;
  }
  return `<div class="page">
    <div class="page-head"><div><h1>Title Forecast</h1><div class="sub">${s.year} · after ${done} of ${rounds.length} rounds · ${m.R} points still available to each ${team ? 'team' : 'driver'}</div></div>${kindSeg}</div>
    ${m.decided ? `<div class="panel champ-banner"><div class="panel-b row" style="gap:16px">${team ? teamLogo(c, s.teams.find(t => t.id === L.id), 56) : avatar(c, s, L.id, 56)}
      <div><span class="label">${s.year} ${team ? 'constructors’' : 'drivers’'} champion${team ? 's' : ''}</span><div class="hof-name" style="font-size:26px">${esc(L.name)}</div>
      <span class="muted">${hist.decidedAt ? `Title settled at Round ${hist.decidedAt.i + 1}, ${esc(hist.decidedAt.r.name)}${m.left.length ? `, with ${m.left.length} round${m.left.length > 1 ? 's' : ''} to spare` : ''}.` : 'Decided at the final round.'}</span></div></div></div>` : ''}
    <div class="tiles">
      <div class="tile"><span class="label">Leader</span><span class="v" style="font-size:20px">${esc(L?.name || '–')}</span></div>
      <div class="tile"><span class="label">Lead</span><span class="v">${m.margin}<small> pts</small></span></div>
      <div class="tile"><span class="label">Points left</span><span class="v">${m.R}</span></div>
      <div class="tile"><span class="label">Still in the fight</span><span class="v">${m.decided ? 1 : alive.length}<small> / ${m.rows.length}</small></span></div>
      <div class="tile"><span class="label">Earliest decider</span><span class="v" style="font-size:20px">${m.decided ? 'Decided' : early ? `R${early.i + 1}` : '–'}</span><span class="muted" style="font-size:12px">${early ? esc(early.r.name) + (early === m.left[0] ? ' · this weekend' : '') : ''}</span></div>
      <div class="tile"><span class="label">Rounds left</span><span class="v">${m.left.length}</span></div>
    </div>
    <div class="panel"><div class="panel-h"><h2>${m.decided ? 'Final picture' : 'Still in with a chance'}</h2><span class="muted" style="font-size:12px">Bar: points now to the most still possible. The line marks the leader’s current total.</span></div>
      <div class="panel-b tight table-wrap"><table>
      <thead><tr><th>Pos</th><th>${team ? 'Team' : 'Driver'}</th><th class="num">Pts</th><th class="num">Gap</th><th class="num">Max</th><th style="width:30%">Range</th><th>Earliest title</th><th class="num">Needs per round</th></tr></thead>
      <tbody>${(m.decided ? m.rows.slice(0, 1) : alive).map(x => {
        const e = m.decided ? null : earliestClinch(m, x);
        const per = m.left.length && x.gap > 0 ? (x.gap / m.left.length).toFixed(1) : null;
        return `<tr class="${isMe(x) ? 'me' : ''}" ${team ? `data-act="open-team" data-id="${x.id}"` : `data-act="open-driver" data-id="${x.id}"`}><td class="pos ${x.pos <= 3 ? 'p' + x.pos : ''}">${x.pos}</td><td>${who(x)}</td><td class="num"><b>${x.pts}</b></td><td class="num">${x.gap ? '−' + x.gap : '–'}</td><td class="num">${x.maxPts}</td>
          <td><div class="range"><i style="left:${x.pts / scale * 100}%;width:${(x.maxPts - x.pts) / scale * 100}%;--c:${team ? s.teams.find(t => t.id === x.id)?.color : teamColor(s, x.id)}"></i><b style="left:${m.lead / scale * 100}%"></b></div></td>
          <td class="muted">${m.decided ? 'Champion' : e ? rLabel(e) : '–'}</td><td class="num muted">${per ? `+${per} on ${esc(L.name.split(' ').slice(-1)[0])}` : x.pos === 1 ? 'Leads' : 'Level'}</td></tr>`;
      }).join('')}</tbody></table></div>
      ${dead.length ? `<div class="panel-b muted" style="font-size:13px;border-top:1px solid var(--line)"><b style="color:var(--fg)">Out of contention:</b> ${dead.map(x => `${esc(x.name)}${hist.outAt[x.id] ? ` <span class="dim">(R${hist.outAt[x.id].i + 1})</span>` : ''}`).join(', ')}</div>` : ''}
    </div>
    ${P ? `<div class="panel"><div class="panel-h"><div><span class="label">Permutations · Round ${P.nx.i + 1} of ${rounds.length}${P.nx.spr ? ' · sprint weekend' : ''}</span><h2>${esc(P.nx.r.name)} Grand Prix</h2></div>
      <span class="muted" style="font-size:12px">${P.G} points available this weekend · ${P.Rp} after it</span></div>
      <div class="panel-b stack">${permsHtml(m, P)}
        ${!P.clinch.length && early ? `<p class="muted" style="font-size:13px">Earliest the title can be won: Round ${early.i + 1}, ${esc(early.r.name)}, if ${esc(L.name)} takes maximum points and nobody else scores.</p>` : ''}
        <p class="muted" style="font-size:12px">Finishing level on points counts as staying in the fight: countback (most wins, then most second places, and so on) would settle a tie at the end of the season.</p>
      </div></div>` : ''}
    ${projectionHtml(c, s, m)}
  </div>`;
}

/* ------------------------------------------------------------ performance */
/** Each driver's race time: the winner's time plus their gap. DNFs and lapped cars get none. */
function raceTimes(s, r) {
  const sd = s.weekends[r.id]?.sessions?.R; if (!sd?.done) return null;
  if (sd.game?.laps) {
    // logged from F1 25: each driver's average clean lap, so lapped cars and retirements count too
    const laps = raceLaps(s, r.id); const out = {};
    sd.results.forEach((x, k) => { const p = x.st === 'DNS' ? null : cleanLapPace(sd, x.d); out[x.d] = { t: p != null ? p * laps : null, pos: k + 1, lapped: false }; });
    if (Object.values(out).some(o => o.t != null)) return { r, laps, drivers: out };
  }
  const lead = sd.results[0];
  const L = lead && lead.st === 'FIN' ? parseDur(lead.gap) : null;
  if (L == null || L < 600000) return null; // no winner's time logged (or not a full race time)
  const out = {};
  sd.results.forEach((x, k) => {
    const lapped = +x.laps > 0 || /lap/i.test(x.gap || '');
    const g = k === 0 ? 0 : parseDur(x.gap);
    out[x.d] = { t: x.st === 'FIN' && !lapped && g != null ? L + g : null, pos: k + 1, lapped: x.st === 'FIN' && lapped };
  });
  return { r, laps: raceLaps(s, r.id), drivers: out };
}
const RACE_LENGTHS = [100, 50, 35, 25];
/** A weekend's race distance in percent: its own setting, else the latest one set before it (earlier seasons too). */
function raceLength(s, roundId) {
  const c = career(), rounds = activeRounds(s);
  for (let k = rounds.findIndex(r => r.id === roundId); k >= 0; k--) { const v = s.weekends[rounds[k].id]?.raceLength; if (v) return v; }
  for (let i = s.index - 1; i >= 0; i--) {
    const p = c?.seasons[i]; if (!p) continue;
    const rs = activeRounds(p);
    for (let k = rs.length - 1; k >= 0; k--) { const v = p.weekends[rs[k].id]?.raceLength; if (v) return v; }
  }
  return 100;
}
/** Grand Prix laps at the weekend's distance. F1 games round shortened races up (Miami 57 laps → 15 at 25%). */
function raceLaps(s, roundId) {
  const r = s.calendar.find(x => x.id === roundId);
  if (r?.laps) return r.laps; // a real race: the laps it actually ran
  const full = D.TRACKS[trackOf(r) || roundId]?.laps || 60;
  return Math.ceil(full * raceLength(s, roundId) / 100 - 1e-9);
}
/** Each driver's best qualifying lap. */
function qualiTimes(s, r) {
  const sd = s.weekends[r.id]?.sessions?.Q; if (!sd?.done) return null;
  const out = {}; let any = false;
  sd.results.forEach((x, k) => { const t = OUT.includes(x.st) ? null : parseLap(x.lap); if (t != null) any = true; out[x.d] = { t, pos: k + 1, lapped: false }; });
  return any ? { r, laps: 1, drivers: out } : null;
}
/**
 * Team pace league. Per session, a team's time is the average of its drivers' valid times (per lap in a race),
 * and its gap is measured to the fastest team in that session. The table averages those gaps, so a race a team
 * misses can't flatter or hurt it. Teams that mostly finish a lap or more down rank below, by finishing position.
 */
function paceTable(s, kind, last5) {
  const sessions = activeRounds(s).map(r => kind === 'race' ? raceTimes(s, r) : qualiTimes(s, r)).filter(Boolean);
  const used = last5 ? sessions.slice(-5) : sessions;
  const T = {}; const tget = (t) => T[t.id] ||= { team: t, gaps: [], pos: [], counted: 0, entered: 0, byRound: {} };
  for (const ss of used) {
    const per = {};
    const ri = activeRounds(s).indexOf(ss.r);
    for (const [d, o] of Object.entries(ss.drivers)) {
      const t = teamAt(s, d, ri); if (!t) continue;
      const x = (per[t.id] ||= { t, times: [], pos: [], lapped: 0 });
      if (o.t != null) x.times.push(o.t); x.pos.push(o.pos); if (o.lapped) x.lapped++;
    }
    // in qualifying a lap more than 2 s off the teammate is a mistake, not the car: use the faster one
    for (const x of Object.values(per)) if (kind === 'quali' && x.times.length === 2 && Math.abs(x.times[0] - x.times[1]) > 2000) x.times = [Math.min(...x.times)];
    const vals = Object.values(per).filter(x => x.times.length).map(x => ({ ...x, v: avg(x.times) / ss.laps }));
    const best = Math.min(...vals.map(x => x.v));
    for (const x of Object.values(per)) {
      const o = tget(x.t); o.entered++; o.pos.push(Math.min(...x.pos));
      const v = vals.find(y => y.t.id === x.t.id);
      if (v) { o.gaps.push(v.v - best); o.counted++; o.byRound[ss.r.id] = v.v - best; }
      else if (x.lapped) o.byRound[ss.r.id] = 'lap';
    }
  }
  const rows = Object.values(T);
  for (const o of rows) { o.mean = o.gaps.length ? avg(o.gaps) : null; o.avgPos = avg(o.pos) ?? 99; o.lappedTeam = o.counted * 2 < o.entered; }
  const paced = rows.filter(o => !o.lappedTeam).sort((a, b) => a.mean - b.mean);
  const lapped = rows.filter(o => o.lappedTeam).sort((a, b) => a.avgPos - b.avgPos);
  const top = paced[0]?.mean ?? 0;
  paced.forEach(o => { o.rel = o.mean - top; });
  const floor = paced.length ? paced[paced.length - 1].rel : 0;
  lapped.forEach(o => { o.rel = null; o.floor = floor; });
  return { rows: [...paced, ...lapped], sessions: used, total: sessions.length };
}
/**
 * Driver pace league, built the same way as the team one: per session, each driver's gap to the fastest driver
 * (per lap in a race), averaged over the sessions they set a valid time. A qualifying lap more than 2 s off the
 * teammate's is a mistake and doesn't count. Drivers who mostly had no valid time (lapped, or no lap in
 * qualifying) rank below, by average finishing position.
 */
function driverPaceTable(s, kind, last5) {
  const sessions = activeRounds(s).map(r => kind === 'race' ? raceTimes(s, r) : qualiTimes(s, r)).filter(Boolean);
  const used = last5 ? sessions.slice(-5) : sessions;
  const P = {}; const get = (d) => P[d] ||= { id: d, gaps: [], pos: [], counted: 0, entered: 0, skipped: 0, byRound: {} };
  for (const ss of used) {
    const ri = activeRounds(s).indexOf(ss.r);
    const entries = Object.entries(ss.drivers);
    const valid = {};
    for (const [d, o] of entries) {
      if (o.t == null) continue;
      if (kind === 'quali') {
        const tid = teamAt(s, d, ri)?.id;
        const mate = entries.find(([e, oe]) => e !== d && oe.t != null && teamAt(s, e, ri)?.id === tid);
        if (tid && mate && o.t - mate[1].t > 2000) { get(d).skipped++; continue; }
      }
      valid[d] = o.t / ss.laps;
    }
    const best = Math.min(...Object.values(valid));
    for (const [d, o] of entries) {
      const x = get(d); x.entered++; x.pos.push(o.pos);
      if (valid[d] != null) { const g = valid[d] - best; x.gaps.push(g); x.counted++; x.byRound[ss.r.id] = g; }
      else if (o.lapped) x.byRound[ss.r.id] = 'lap';
    }
  }
  const rows = Object.values(P);
  for (const o of rows) { o.mean = o.gaps.length ? avg(o.gaps) : null; o.avgPos = avg(o.pos) ?? 99; o.slow = o.counted * 2 < o.entered; }
  const paced = rows.filter(o => !o.slow).sort((a, b) => a.mean - b.mean);
  const rest = rows.filter(o => o.slow).sort((a, b) => a.avgPos - b.avgPos);
  const top = paced[0]?.mean ?? 0;
  paced.forEach(o => { o.rel = o.mean - top; });
  const floor = paced.length ? paced[paced.length - 1].rel : 0;
  rest.forEach(o => { o.rel = null; o.floor = floor; });
  return { rows: [...paced, ...rest], sessions: used, total: sessions.length };
}
/** Teammate gaps: qualifying (sessions within 2 s, both with a time) and race pace per lap. */
function teammateGaps(s, a, b) {
  const q = [], r = []; let qa = 0, qb = 0, skipped = 0;
  for (const rd of activeRounds(s)) {
    const Q = qualiTimes(s, rd);
    if (Q) {
      const ta = Q.drivers[a]?.t, tb = Q.drivers[b]?.t;
      if (Q.drivers[a] && Q.drivers[b]) {
        if (ta == null || tb == null || Math.abs(ta - tb) > 2000) skipped++;
        else { q.push(ta - tb); ta < tb ? qa++ : tb < ta ? qb++ : 0; }
      }
    }
    const R = raceTimes(s, rd);
    const ra = R?.drivers[a]?.t, rb = R?.drivers[b]?.t;
    if (ra != null && rb != null) r.push((ra - rb) / R.laps);
  }
  return { q: q.length ? avg(q) : null, qn: q.length, qa, qb, skipped, r: r.length ? avg(r) : null, rn: r.length };
}
const gapS = (ms, d = 3) => `${ms >= 0 ? '+' : '−'}${Math.abs(ms / 1000).toFixed(d)}s`;

function renderPerformance() {
  const c = career(); const s = curSeason();
  const last5 = ui.perf === 'last5';
  const race = paceTable(s, 'race', last5), quali = paceTable(s, 'quali', last5);
  const board = (P, label) => {
    if (!P.sessions.length) return `<div class="empty">${label === 'race' ? 'Enter the winner’s race time and the gaps to the winner in a race to see race pace.' : 'Enter lap times in qualifying to see qualifying pace.'}</div>`;
    const max = Math.max(0.001, ...P.rows.filter(o => o.rel != null).map(o => o.rel));
    return `<table><thead><tr><th>Pos</th><th>Team</th><th class="num">${label === 'race' ? 'Pace per lap' : 'Gap'}</th><th style="width:34%"></th><th class="num" title="Sessions with a valid time">${label === 'race' ? 'Races' : 'Sessions'}</th></tr></thead><tbody>
      ${P.rows.map((o, k) => `<tr class="${o.team.id === s.playerTeamId ? 'me' : ''}" data-act="open-team" data-id="${o.team.id}"><td class="pos ${k < 3 ? 'p' + (k + 1) : ''}">${k + 1}</td><td><div class="drv">${teamLogo(c, o.team, 22)}<b>${esc(o.team.name)}</b></div></td>
        <td class="num">${o.rel == null ? `<span class="muted">&gt; ${gapS(o.floor)}</span> <span class="tag">${label === 'race' ? 'Lapped' : 'No time'}</span>` : k === 0 ? '<b>Fastest</b>' : gapS(o.rel)}</td>
        <td><div class="h2h-bar"><i style="--c:${o.team.color};width:${o.rel == null ? 100 : Math.max(2, 100 - o.rel / max * 70)}%"></i></div></td>
        <td class="num muted">${o.counted}/${o.entered}</td></tr>`).join('')}
    </tbody></table>`;
  };
  const matrix = (P) => !P.sessions.length ? '' : `<table class="matrix"><thead><tr><th>Team</th>${P.sessions.map(x => `<th title="${esc(x.r.name)}">${esc(x.r.id.toUpperCase())}</th>`).join('')}</tr></thead><tbody>
    ${P.rows.map(o => `<tr class="${o.team.id === s.playerTeamId ? 'me' : ''}"><td><div class="drv">${teamLogo(c, o.team, 18)}${esc(o.team.name)}</div></td>${P.sessions.map(x => { const v = o.byRound[x.r.id]; return `<td class="num">${v == null ? '<span class="dim">·</span>' : v === 'lap' ? '<span class="dim">Lap</span>' : v === 0 ? '<b style="color:var(--purple)">0.000</b>' : `<span style="opacity:${Math.max(0.45, 1 - v / 3000)}">${(v / 1000).toFixed(3)}</span>`}</td>`; }).join('')}</tr>`).join('')}
  </tbody></table>`;
  const pairs = s.teams.map(t => ({ t, d: t.drivers.filter(Boolean) })).filter(x => x.d.length === 2).sort((a, b) => (b.t.id === s.playerTeamId) - (a.t.id === s.playerTeamId));
  const mode = last5 ? 'last 5' : 'season';
  const drivers = ui.perfView === 'drivers', fan = ui.perfView === 'fanvoice';
  const head = `<div class="page-head"><div><h1>Performance</h1><div class="sub">${fan
      ? 'The F1 Fan Voice driver ratings: every driver for the Grand Prix you pick, and the top ten over the last 5 races and the season.'
      : drivers ? 'Each driver’s pace, measured from your logged times.'
      : 'Car pace from your logged times. Race pace uses the winner’s time plus each gap, averaged over both cars and divided by the laps run at that weekend’s race distance. Gaps are relative to the fastest team.'}</div></div>
      <div class="row">${seasonPicker(c, s.index)}<div class="seg">${[['teams', 'Teams'], ['drivers', 'Drivers'], ['fanvoice', 'Fan Voice']].map(([v, l]) => `<button data-act="perf-view" data-v="${v}" class="${(ui.perfView || 'teams') === v ? 'on' : ''}">${l}</button>`).join('')}</div>${fan ? '' : `<div class="seg">${[['season', 'Season'], ['last5', 'Last 5']].map(([v, l]) => `<button data-act="perf-mode" data-v="${v}" class="${ui.perf === v ? 'on' : ''}">${l}</button>`).join('')}</div>`}</div></div>`;
  if (fan) return renderFanVoice(c, s, head);
  if (drivers) return renderDriverPerformance(c, s, last5, head, mode);
  return `<div class="page">
    ${head}
    <div class="grid-2">
      <div class="panel"><div class="panel-h"><h2>Race pace</h2><span class="muted" style="font-size:12px">${race.sessions.length ? `${mode} · ${plural(race.sessions.length, 'race')}` : ''}</span></div><div class="panel-b tight table-wrap">${board(race, 'race')}</div></div>
      <div class="panel"><div class="panel-h"><h2>Qualifying pace</h2><span class="muted" style="font-size:12px">${quali.sessions.length ? `${mode} · ${plural(quali.sessions.length, 'session')}` : ''}</span></div><div class="panel-b tight table-wrap">${board(quali, 'quali')}</div></div>
    </div>
    <div class="panel"><div class="panel-h"><h2>Teammate comparison</h2><span class="muted" style="font-size:12px">Whole season. Qualifying sessions where a driver set no time or was more than 2 s off the teammate are left out.</span></div>
      <div class="panel-b tight table-wrap"><table><thead><tr><th>Team</th><th>Drivers</th><th class="num">Quali gap</th><th class="num">Quali H2H</th><th class="num">Counted</th><th class="num">Race pace / lap</th><th class="num">Races</th></tr></thead><tbody>
      ${pairs.map(({ t, d: [a, b] }) => { const g = teammateGaps(s, a, b); const who = (v) => v == null ? '–' : Math.abs(v) < 0.5 ? 'Level' : `${esc(dAbbr(s, v < 0 ? a : b))} ${gapS(-Math.abs(v))}`; return `<tr class="${t.id === s.playerTeamId ? 'me' : ''}">
        <td><div class="drv">${teamLogo(c, t, 20)}${esc(t.name)}</div></td>
        <td><div class="row" style="gap:6px;flex-wrap:nowrap">${avatar(c, s, a, 22)}<b>${esc(dAbbr(s, a))}</b><span class="muted">vs</span>${avatar(c, s, b, 22)}<b>${esc(dAbbr(s, b))}</b></div></td>
        <td class="num">${who(g.q)}</td><td class="num">${g.qn ? `${g.qa}–${g.qb}` : '–'}</td><td class="num muted">${g.qn}${g.skipped ? ` <span title="Left out">(+${g.skipped})</span>` : ''}</td>
        <td class="num">${who(g.r)}</td><td class="num muted">${g.rn}</td></tr>`; }).join('')}
      </tbody></table></div>
      <div class="panel-b muted" style="font-size:12px;border-top:1px solid var(--line)">Gaps show who is quicker on average and by how much: “NOR −0.124s” means Norris is 0.124 s faster than the teammate.</div>
    </div>
    ${race.sessions.length ? `<div class="panel"><div class="panel-h"><h2>Race pace by round</h2><span class="muted" style="font-size:12px">Seconds per lap behind the fastest team. “Lap” means the team was only classified laps down.</span></div><div class="panel-b tight table-wrap">${matrix(race)}</div></div>` : ''}
    ${quali.sessions.length ? `<div class="panel"><div class="panel-h"><h2>Qualifying pace by round</h2><span class="muted" style="font-size:12px">Seconds behind the fastest team’s average lap</span></div><div class="panel-b tight table-wrap">${matrix(quali)}</div></div>` : ''}
  </div>`;
}
function renderDriverPerformance(c, s, last5, head, mode) {
  const race = driverPaceTable(s, 'race', last5), quali = driverPaceTable(s, 'quali', last5);
  const color = (id) => teamOf(s, id)?.color || '#5E6A82';
  const board = (P, label) => {
    if (!P.sessions.length) return `<div class="empty">${label === 'race' ? 'Enter the winner’s race time and the gaps to the winner in a race to see race pace.' : 'Enter lap times in qualifying to see qualifying pace.'}</div>`;
    const max = Math.max(0.001, ...P.rows.filter(o => o.rel != null).map(o => o.rel));
    return `<table><thead><tr><th>Pos</th><th>Driver</th><th class="num">${label === 'race' ? 'Pace per lap' : 'Gap'}</th><th style="width:30%"></th><th class="num" title="Sessions with a valid time">${label === 'race' ? 'Races' : 'Sessions'}</th></tr></thead><tbody>
      ${P.rows.map((o, k) => `<tr class="${o.id === PLAYER ? 'me' : ''}" data-act="open-driver" data-id="${o.id}"><td class="pos ${k < 3 ? 'p' + (k + 1) : ''}">${k + 1}</td><td>${drvCell(s, o.id)}</td>
        <td class="num">${o.rel == null ? `<span class="muted">&gt; ${gapS(o.floor)}</span> <span class="tag">${label === 'race' ? 'Lapped' : 'No time'}</span>` : k === 0 ? '<b>Fastest</b>' : gapS(o.rel)}</td>
        <td><div class="h2h-bar"><i style="--c:${color(o.id)};width:${o.rel == null ? 100 : Math.max(2, 100 - o.rel / max * 70)}%"></i></div></td>
        <td class="num muted">${o.counted}/${o.entered}${o.skipped ? ` <span title="Laps more than 2 s off the teammate, left out">(+${o.skipped})</span>` : ''}</td></tr>`).join('')}
    </tbody></table>`;
  };
  const matrix = (P) => !P.sessions.length ? '' : `<table class="matrix"><thead><tr><th>Driver</th>${P.sessions.map(x => `<th title="${esc(x.r.name)}">${esc(x.r.id.toUpperCase())}</th>`).join('')}</tr></thead><tbody>
    ${P.rows.map(o => `<tr class="${o.id === PLAYER ? 'me' : ''}"><td><div class="drv"><span class="chip" style="--c:${color(o.id)}"></span>${esc(dAbbr(s, o.id))}</div></td>${P.sessions.map(x => { const v = o.byRound[x.r.id]; return `<td class="num">${v == null ? '<span class="dim">·</span>' : v === 'lap' ? '<span class="dim">Lap</span>' : v === 0 ? '<b style="color:var(--purple)">0.000</b>' : `<span style="opacity:${Math.max(0.45, 1 - v / 3000)}">${(v / 1000).toFixed(3)}</span>`}</td>`; }).join('')}</tr>`).join('')}
  </tbody></table>`;
  return `<div class="page">
    ${head}
    <div class="grid-2">
      <div class="panel"><div class="panel-h"><h2>Driver race pace</h2><span class="muted" style="font-size:12px">${race.sessions.length ? `${mode} · ${plural(race.sessions.length, 'race')}` : ''}</span></div><div class="panel-b tight table-wrap">${board(race, 'race')}</div></div>
      <div class="panel"><div class="panel-h"><h2>Driver qualifying pace</h2><span class="muted" style="font-size:12px">${quali.sessions.length ? `${mode} · ${plural(quali.sessions.length, 'session')}` : ''}</span></div><div class="panel-b tight table-wrap">${board(quali, 'quali')}</div></div>
    </div>
    <p class="muted" style="font-size:12px">A DNF or a lapped finish gives no race time, and a qualifying lap more than 2 s off the teammate’s is left out as a mistake. Drivers without a valid time in most sessions rank below the rest, by average finishing position.</p>
    ${race.sessions.length ? `<div class="panel"><div class="panel-h"><h2>Driver race pace by round</h2><span class="muted" style="font-size:12px">Seconds per lap behind the fastest driver. “Lap” means the driver was classified laps down.</span></div><div class="panel-b tight table-wrap">${matrix(race)}</div></div>` : ''}
    ${quali.sessions.length ? `<div class="panel"><div class="panel-h"><h2>Driver qualifying pace by round</h2><span class="muted" style="font-size:12px">Seconds behind the fastest lap</span></div><div class="panel-b tight table-wrap">${matrix(quali)}</div></div>` : ''}
  </div>`;
}

/* -------------------------------------------------------- driver ratings */
// Every driver gets a rating out of 10 for each Grand Prix, and the race decides it. A finish where the car should
// finish is worth more the faster the car is (P2 in a top car ≈ 8.5, a backmarker's par ≈ 6.6), and places above or
// below that are valued like points: positions near the front count for more, so a backmarker passes 9 only around
// the points, a midfield car must beat front-runners, and a top car outside the top 10 scores low. A win in a top car
// is worth about 9, and only a dominant margin lifts it to 10: 15 s over a full race, scaled to the race
// distance (7.5 s at 50%, 3.75 s at 25%). A driver starting far behind their car
// (a qualifying DNF, say) is also scored on the climb, so the back of the grid to P5 in a top car is a 10.
// Nobody outside the top 10 scores above 7.9. Qualifying against the car's pace (scored 4–10) carries 12%, and a driver
// beaten by their teammate in the race can't outscore them unless they started well behind. A retirement is rated
// on qualifying alone, from 4 to 7.
// How fast each car is comes only from the races before that one, at most the last 5, so a rating never changes
// later in the season as cars improve. The first race has nothing before it: there, that day's qualifying decides
// the car order and qualifying isn't rated separately.
const RATING_WINDOW = 5;
const _ratingCache = new WeakMap();
/** The car order and qualifying pace going into round ri, from the (up to) 5 logged races before it. */
function carPaceBefore(s, ri) {
  const rounds = activeRounds(s);
  const logged = (r) => s.weekends[r.id]?.sessions?.R?.done || s.weekends[r.id]?.sessions?.Q?.done;
  const window = rounds.slice(0, ri).filter(logged).slice(-RATING_WINDOW);
  const first = !window.length;
  // the first race (nothing logged before it): only this round's qualifying, never its race
  const use = first ? [rounds[ri]] : window;
  const keep = new Set(use.map(r => r.id));
  const prior = { ...s, weekends: Object.fromEntries(Object.entries(s.weekends).filter(([id]) => keep.has(id)).map(([id, w]) => [id, first ? { ...w, sessions: { Q: w.sessions?.Q } } : w])) };
  const base = (tid) => D.BASE_PACE[tid] ?? 0.8;
  const racePt = first ? { rows: [] } : paceTable(prior, 'race', false), qualiPt = paceTable(prior, 'quali', false);
  let order = (racePt.rows.length ? racePt.rows : qualiPt.rows).map(o => o.team.id);
  if (first && !order.length) {
    // no lap times on day one: order the cars by each team's best grid slot
    const Q = s.weekends[rounds[ri].id]?.sessions?.Q;
    if (Q?.done) { const best = {}; Q.results.forEach((x, k) => { const t = teamAt(s, x.d, ri)?.id; if (t && best[t] == null && !OUT.includes(x.st)) best[t] = k; }); order = Object.keys(best).sort((a, b) => best[a] - best[b]); }
  }
  for (const t of s.teams.slice().sort((a, b) => base(a.id) - base(b.id))) if (!order.includes(t.id)) order.push(t.id);
  const qrel = {};
  const minBase = Math.min(...s.teams.map(t => base(t.id)));
  for (const t of s.teams) qrel[t.id] = (base(t.id) - minBase) * 1000;
  for (const o of qualiPt.rows) if (o.rel != null) qrel[o.team.id] = o.rel;
  // each car's gap to the fastest car (ms per lap): race pace if logged, else qualifying pace, else the estimate
  const rows = racePt.rows.length ? racePt.rows : qualiPt.rows;
  const gap = {};
  const floor = Math.max(0, ...rows.filter(o => o.rel != null).map(o => o.rel));
  for (const o of rows) gap[o.team.id] = o.rel ?? floor + 300; // lapped teams sit behind the slowest timed one
  for (const t of s.teams) if (gap[t.id] == null) gap[t.id] = rows.length ? floor + 300 + (base(t.id) - minBase) * 300 : qrel[t.id];
  // expected finish from the gaps, not the ranking: every other car is ahead with a probability that grows with the
  // gap (near level = a coin flip, half a second = almost certain), so a 4th-fastest car 0.04 s off the best is a
  // front-runner and a 5th-fastest car 0.6 s off isn't
  const SPREAD = 60; // 0.1 s a lap over a whole race is decisive: the slower car is ahead only ~16% of the time
  const cars = s.teams.flatMap(t => t.drivers.filter(Boolean).map(() => gap[t.id]));
  const expect = (tid) => {
    const g = gap[tid] ?? floor + 300;
    let sum = 1, self = false;
    for (const gj of cars) { if (!self && gj === g) { self = true; continue; } sum += 1 / (1 + Math.exp(-(g - gj) / SPREAD)); }
    return sum;
  };
  return { rank: (tid) => Math.max(0, order.indexOf(tid)), qrel: (tid) => qrel[tid] ?? 800, gap: (tid) => gap[tid] ?? floor + 300, expect, first, races: use.length };
}
/** Ratings for every driver in round ri, with what drove them: { [id]: { rating, quali, race, finish, grid, expect, over, gained, margin, dnf, reasons } } */
function raceRatings(s, ri) {
  let cache = _ratingCache.get(s);
  if (!cache || cache.gen !== renderGen) { cache = { gen: renderGen, rounds: {} }; _ratingCache.set(s, cache); }
  if (cache.rounds[ri] !== undefined) return cache.rounds[ri];
  const r = activeRounds(s)[ri];
  const ses = s.weekends[r?.id]?.sessions || {};
  if (!ses.R?.done) return (cache.rounds[ri] = null);
  const car = carPaceBefore(s, ri);
  const Q = ses.Q?.done ? ses.Q.results : null;
  const qPole = Q ? Math.min(...Q.map(x => parseLap(x.lap)).filter(v => v != null)) : Infinity;
  const res = ses.R.results;
  // a dominant win: 15 s over a full race distance, in proportion for shorter races (7.5 s at 50%)
  const dominant = 15 * raceLength(s, r.id) / 100;
  const p2gap = res[1] && !OUT.includes(res[1].st) ? (+res[1].laps > 0 || /lap/i.test(res[1].gap || '') ? 60000 : parseDur(res[1].gap)) : null;
  const out = {};
  res.forEach((x, k) => {
    if (x.st === 'DNS') return;
    const team = teamAt(s, x.d, ri);
    const rank = car.rank(team?.id);
    const expect = car.expect(team?.id);
    const carGap = car.gap(team?.id);
    // qualifying against the car
    const qi = Q ? Q.findIndex(y => y.d === x.d) : -1;
    const qx = qi >= 0 ? Q[qi] : null;
    let quali = 6, qDelta = null;
    if (qx && !OUT.includes(qx.st)) {
      const lap = parseLap(qx.lap);
      if (lap != null && isFinite(qPole)) { qDelta = car.qrel(team?.id) - (lap - qPole); quali = 8 + qDelta / 250; }
      else quali = 8 + (expect - (qi + 1)) * 0.3;
    }
    quali = Math.max(4, Math.min(10, quali));
    const grid = qi >= 0 ? qi + 1 : null;
    const finish = k + 1;
    const dnf = OUT.includes(x.st);
    // a retirement in the first race has nothing to rate: there is no separate qualifying rating that day
    if (dnf && car.first) return;
    const gained = grid ? grid - finish : 0;
    let race = null, over = expect - finish, margin = null, rating;
    // a retirement: halfway between 4 and the qualifying score, so 4 to 7
    if (dnf) rating = 4 + (quali - 4) / 2;
    else {
      race = raceScore(finish, expect);
      // the climb counts less when it still ends well below where the car belongs (a top car from the back to P10)
      if (grid && grid > expect + 2) race = Math.max(race, 6.9 + 6.5 * (posValue(finish) - posValue(grid)) - 0.25 * Math.max(0, finish - expect - 3));
      if (finish === 1) {
        margin = p2gap != null ? p2gap / 1000 : null;
        race = Math.max(9, expect >= 4 ? race : 0) + Math.min(1.2, (margin || 0) / dominant);
      }
      // qualifying carries 12%: a perfect lap adds 0.24, the worst takes off 0.48; no lap time (a qualifying DNF) costs nothing
      const qMod = car.first || !qx || OUT.includes(qx.st) ? 0 : (quali - 8) * 0.12;
      rating = race + qMod;
      // outside the top 10 the ceiling is 8, falling 0.1 a place (P11 7.9, P15 7.5)
      if (finish > 10) rating = Math.min(rating, 8.0 - 0.1 * (finish - 11));
    }
    rating = Math.round(Math.max(1, Math.min(10, rating)) * 10) / 10;
    // why: `reasons` for the ratings pages, `pub` for stories, which leave out anything measured against the car
    const reasons = [], pub = [];
    const win = !dnf && finish === 1;
    const by = margin != null && margin >= dominant ? ` by ${margin >= 60 ? 'a lap or more' : margin.toFixed(1) + ' s'}` : '';
    if (win) { reasons.push(`won the race${by}`); pub.push(`won the race${by}`); }
    if (!dnf && gained >= 5) { const t = `gained ${gained} places from ${ordWord(grid)} on the grid`; reasons.push(t); pub.push(t); }
    if (!car.first && qDelta != null && qDelta >= 250) reasons.push(`qualified ${(qDelta / 1000).toFixed(2)} s quicker than the car`);
    else if (!car.first && qDelta != null && qDelta <= -400) reasons.push(`qualified ${(-qDelta / 1000).toFixed(2)} s off the car’s pace`);
    else if (!car.first && qDelta == null && grid && expect - grid >= 4) reasons.push(`qualified ${ordWord(grid)}, well above the car`);
    if (!dnf && !win && finish <= 3) pub.push(`finished ${ordWord(finish)}`);
    if (dnf) reasons.push(`retired, rated on qualifying`);
    out[x.d] = { id: x.d, rating, quali: car.first ? null : Math.round(quali * 10) / 10, race, finish, grid, expect, rank, carGap, over, gained, margin, dnf, reasons, pub, first: car.first, team: team?.id };
  });
  // beaten by the teammate in the race: no higher rating than theirs, unless they started 5+ places further back
  for (const a of Object.values(out)) {
    if (a.dnf) continue;
    const b = Object.values(out).find(y => y !== a && y.team && y.team === a.team && !y.dnf && y.finish < a.finish);
    if (b && a.rating >= b.rating && !(a.grid && b.grid && a.grid - b.grid >= 5)) {
      a.rating = Math.max(1, Math.round((b.rating - 0.2) * 10) / 10);
      a.reasons.push(`finished behind teammate ${lastName(dName(s, b.id))}`);
    }
  }
  return (cache.rounds[ri] = out);
}
/** How much a finishing position is worth, points-like: the front is worth far more than the back. */
const posValue = (p) => Math.exp(-(p - 1) / 7);
/** Race score for finishing `finish` in a car expected to finish `expect`. */
function raceScore(finish, expect) {
  const par = 6.6 + 2.4 * Math.exp(-(expect - 1) / 4);
  // P2 is never below par: in the fastest car, someone has to be second
  const d = posValue(finish) - posValue(Math.max(expect, Math.min(2, finish)));
  // beating the car flattens out (at most +3.3), so a podium in the 3rd-fastest car is a 9.5, not a 10
  const up = d > 0 ? 3.3 * (1 - Math.exp(-11 * d / 3.3)) : 4.5 * d;
  return par + up + 0.05 * (expect - finish);
}
/**
 * Driver of the Day: the best rating among finishers. On a tie, the race winner takes it; otherwise the driver in
 * the slower car does.
 */
function driverOfTheDay(s, ri) {
  const R = raceRatings(s, ri); if (!R) return null;
  const list = Object.values(R).filter(x => !x.dnf).sort((a, b) => b.rating - a.rating || (a.finish === 1 ? -1 : b.finish === 1 ? 1 : b.carGap - a.carGap));
  return list[0] || null;
}
/** Season ratings per driver: average over all rated races and the last five, plus Driver of the Day awards. */
function seasonRatings(s) {
  const rounds = activeRounds(s);
  const by = {}; const dotd = [];
  rounds.forEach((r, ri) => {
    const R = raceRatings(s, ri); if (!R) return;
    for (const x of Object.values(R)) (by[x.id] ||= { id: x.id, list: [] }).list.push({ ri, ...x });
    const d = driverOfTheDay(s, ri); if (d) dotd.push({ ri, r, ...d });
  });
  for (const o of Object.values(by)) {
    o.avg = avg(o.list.map(x => x.rating)); o.last5 = avg(o.list.slice(-5).map(x => x.rating)); o.lastRace = o.list[o.list.length - 1];
    o.dotd = dotd.filter(x => x.id === o.id).length;
  }
  return { by, dotd, rated: dotd.length };
}
/** Season-to-date average ratings after round ri (inclusive). */
function seasonRatingsTo(s, ri) {
  const by = {};
  for (let i = 0; i <= ri; i++) { const R = raceRatings(s, i); if (R) for (const x of Object.values(R)) (by[x.id] ||= []).push(x.rating); }
  return Object.entries(by).map(([id, l]) => ({ id, avg: avg(l), n: l.length }));
}
/* F1 Fan Voice: the ratings, presented as the fans' verdict after every Grand Prix. */
const FAN_VOICE = 'F1 Fan Voice';
const fvMark = (small = false) => `<span class="fv-mark ${small ? 'sm' : ''}">${state.gfxLogo ? '<span class="fv-f1 logo" role="img" aria-label="F1"></span>' : '<span class="fv-f1">F1</span>'}<span class="fv-name">FAN VOICE</span></span>`;
/** A ranked list of drivers with photo, team and rating pill. rows: [{ id, rating, sub? }] */
function fvList(c, s, rows, { start = 1 } = {}) {
  return `<ol class="fv-list">${rows.map((x, k) => `<li class="${x.id === PLAYER ? 'me' : ''}" data-act="open-driver" data-id="${x.id}">
    <span class="fv-rank">${k + start}</span>${avatar(c, s, x.id, 36)}
    <span class="fv-who"><b>${esc(dName(s, x.id))}</b><small>${esc(x.sub ?? teamOf(s, x.id)?.name ?? '')}</small></span>
    <span class="fv-score" style="--rc:${ratingColor(x.rating)}">${x.rating.toFixed(1)}</span></li>`).join('')}</ol>`;
}
/** The Fan Voice ratings story for round ri: that race's top 10 and the season's top 10 so far. */
function fanVoiceStory(c, s, ri) {
  const R = raceRatings(s, ri); if (!R) return null;
  const r = activeRounds(s)[ri]; const rnd = seeded(`${s.index}-${r.id}-fv`);
  const race = Object.values(R).sort((a, b) => b.rating - a.rating).slice(0, 10);
  const season = seasonRatingsTo(s, ri).sort((a, b) => b.avg - a.avg).slice(0, 10);
  const top = race[0];
  const lowest = Object.values(R).sort((a, b) => a.rating - b.rating)[0];
  const headline = top.rating >= 9.5 ? choose(rnd, [`Fan Voice: a ${top.rating.toFixed(1)} for ${lastName(dName(s, top.id))} in ${r.name}`, `${r.name} driver ratings: fans can’t look past ${lastName(dName(s, top.id))}`])
    : choose(rnd, [`${r.name} driver ratings: ${lastName(dName(s, top.id))} tops the fan vote`, `Fan Voice ratings: who impressed in ${r.name}?`]);
  return { id: `${s.index}-${r.id}-fv`, seq: ri * 10 + 4, kind: 'ratings', i: ri, r, outlet: FAN_VOICE, kicker: 'Driver Ratings', headline,
    standfirst: `Fans rated every driver out of 10 after the ${r.name} Grand Prix. ${dName(s, top.id)} came out on top with ${top.rating.toFixed(1)}${lowest && lowest.id !== top.id ? `, while ${dName(s, lowest.id)} had the toughest afternoon on ${lowest.rating.toFixed(1)}` : ''}.`,
    body: [], fanVoice: { race: race.map(x => ({ id: x.id, rating: x.rating, sub: `${teamOf(s, x.id)?.name || ''} · ${x.dnf ? 'DNF' : 'P' + x.finish}` })), season: season.map(x => ({ id: x.id, rating: x.avg, sub: `${teamOf(s, x.id)?.name || ''} · ${plural(x.n, 'race')}` })), round: ri } };
}
/** The F1 Fan Voice page: every driver for the chosen Grand Prix, the top ten over the last 5 races and the season. */
function renderFanVoice(c, s, head) {
  const SR = seasonRatings(s);
  const dots = driverOfTheSeason(s);
  const ratedRounds = activeRounds(s).map((r, ri) => ({ r, ri })).filter(x => raceRatings(s, x.ri));
  const fvRi = ratedRounds.some(x => x.ri === ui.fvRound) ? ui.fvRound : ratedRounds[ratedRounds.length - 1]?.ri;
  const color = (id) => teamOf(s, id)?.color || '#5E6A82';
  const intro = '<p>After every Grand Prix, fans rate each driver out of 10: mostly the race result against the car, plus places made, the winning margin, the teammate battle and a little for qualifying.</p>';
  if (!SR.rated) return `<div class="page">${head}<section class="fv-hero"><div>${fvMark()}<h1>Driver Ratings</h1><p>After every Grand Prix, fans rate each driver out of 10. Log a race to open the vote.</p></div></section></div>`;
  const fvR = raceRatings(s, fvRi); const fvRound = activeRounds(s)[fvRi]; const fvDotd = driverOfTheDay(s, fvRi);
  const race = Object.values(fvR).sort((a, b) => b.rating - a.rating).map(x => ({ id: x.id, rating: +x.rating.toFixed(1), sub: `${teamAt(s, x.id, fvRi)?.name || teamOf(s, x.id)?.name || ''} · ${x.dnf ? 'DNF' : 'P' + x.finish}${x.reasons.length ? ' · ' + x.reasons[0] : ''}` }));
  const lastRi = ratedRounds[ratedRounds.length - 1].ri;
  const table = (key) => Object.values(SR.by).sort((a, b) => b[key] - a[key] || b.dotd - a.dotd).slice(0, 10)
    .map(o => ({ id: o.id, rating: +o[key].toFixed(1), sub: `${teamOf(s, o.id)?.name || ''} · ${plural(key === 'last5' ? Math.min(5, o.list.length) : o.list.length, 'race')}${o.dotd ? ` · ${plural(o.dotd, 'DOTD')}` : ''}` }));
  const season = table('avg'), last5 = table('last5');
  const strip = (rows) => rows.map(({ id, rating }) => ({ id, rating }));
  const img = (spec) => `<button class="btn sm" data-act="gfx-open" data-gfx="${esc(gfxKey(spec))}">${ICON.camera} Image</button>`;
  const rated = Object.values(SR.by).sort((a, b) => b.avg - a.avg || b.dotd - a.dotd);
  return `<div class="page">
    ${head}
    <section class="fv-hero">
      <div>${fvMark()}<h1>Driver Ratings</h1>${intro}</div>
      <label class="fv-pick"><span class="label">Grand Prix</span><select data-ch="fv-round">${ratedRounds.map(x => `<option value="${x.ri}" ${x.ri === fvRi ? 'selected' : ''}>R${x.ri + 1} · ${esc(x.r.name)}</option>`).join('')}</select></label>
    </section>
    <div class="grid-2">
      <div class="panel fv-panel"><div class="panel-h"><div><span class="label">${esc(fvRound.name)} Grand Prix</span><h2>Every driver</h2></div>${img({ type: 'ratings', si: s.index, ri: fvRi, all: true, rows: strip(race) })}</div>${fvBars(c, s, race, { ri: fvRi, dotd: fvDotd?.id })}</div>
      <div class="stack">
        <div class="panel fv-panel"><div class="panel-h"><div><span class="label">${s.year} · average over each driver’s last 5 races</span><h2>Last 5</h2></div>${img({ type: 'ratings', si: s.index, ri: lastRi, span: 'last5', rows: strip(last5) })}</div>${fvBars(c, s, last5)}</div>
        <div class="panel fv-panel"><div class="panel-h"><div><span class="label">${s.year} · season average</span><h2>Season</h2></div>${img({ type: 'ratings', si: s.index, ri: lastRi, season: true, rows: strip(season) })}</div>${fvBars(c, s, season)}</div>
        ${dots ? `<div class="panel award-panel fv-panel"><div class="panel-h"><div><span class="label">${dots.final ? `${s.year} Driver of the Season` : 'Driver of the Season · leading'}</span></div><button class="btn sm" data-act="award-card" data-kind="dots">${ICON.camera} Image</button></div>
          <div class="panel-b row" style="gap:14px;flex-wrap:nowrap">${avatar(c, s, dots.id, 64)}<div><div class="hof-name">${esc(dName(s, dots.id))}</div><span class="muted">${plural(dots.dotd, 'Driver of the Day award')} · ${dots.avg.toFixed(1)}/10 average</span></div></div></div>` : ''}
        <div class="panel fv-panel"><div class="panel-h"><div><span class="label">Voted by the fans</span><h2>Driver of the Day</h2></div></div><div class="panel-b tight">
          ${SR.dotd.slice().reverse().map(x => `<div class="dotd-row"><span class="label">R${x.ri + 1}</span>${avatar(c, s, x.id, 30)}<div style="min-width:0;flex:1"><b>${esc(dName(s, x.id))}</b> <span class="muted">· ${esc(x.r.name)}</span><div class="muted" style="font-size:12px">${esc(x.reasons.join(', ') || `${ordWord(x.finish)} at the flag`)}</div></div>
            <span class="v" style="color:${ratingColor(x.rating)}">${x.rating.toFixed(1)}</span><button class="icon-btn" title="Image" data-act="award-card" data-kind="dotd" data-ri="${x.ri}">${ICON.camera}</button></div>`).join('')}
        </div></div>
      </div>
    </div>
    <details class="panel fv-panel"><summary class="panel-h"><h2>Every rating, every round</h2><span class="muted" style="font-size:12px">Driver of the Day outlined · tap to open</span></summary><div class="panel-b tight table-wrap">
      <table class="matrix"><thead><tr><th>Driver</th>${ratedRounds.map(x => `<th title="${esc(x.r.name)}">${esc(x.r.id.toUpperCase())}</th>`).join('')}</tr></thead><tbody>
        ${rated.map(o => `<tr class="${o.id === PLAYER ? 'me' : ''}"><td><div class="drv"><span class="chip" style="--c:${color(o.id)}"></span>${esc(dAbbr(s, o.id))}</div></td>${ratedRounds.map(x => { const v = raceRatings(s, x.ri)[o.id]; const isD = SR.dotd.find(d => d.ri === x.ri)?.id === o.id; return `<td class="num">${v ? `<span class="rating-cell ${isD ? 'is-dotd' : ''}" style="color:${ratingColor(v.rating)}" title="${esc(v.reasons.join(', '))}">${v.rating.toFixed(1)}</span>` : '<span class="dim">·</span>'}</td>`; }).join('')}</tr>`).join('')}
      </tbody></table></div></details>
  </div>`;
}
/** Ratings as the graphics draw them: team-colour bars, the logo, the photo, the name and a green score. rows: [{ id, rating, sub? }] */
function fvBars(c, s, rows, { ri = null, dotd = null } = {}) {
  return `<ol class="fvg">${rows.map((x, k) => {
    const tm = (ri != null && teamAt(s, x.id, ri)) || teamOf(s, x.id); const col = tm?.color || '#5E6A82';
    const v = gfxR(x.rating); const tie = rows.filter(o => gfxR(o.rating) === v).length > 1; const rank = rows.findIndex(o => gfxR(o.rating) === v) + 1;
    const ph = driverPhoto(c, x.id);
    return `<li class="${k === 0 ? 'top' : ''} ${x.id === PLAYER ? 'me' : ''}" style="--c:${col};--i:${contrastInk(col)}" data-act="open-driver" data-id="${x.id}">
      <span class="fvg-n">${rank}${tie ? '=' : ''}</span><span class="fvg-logo">${tm ? teamLogo(c, tm, 28) : ''}</span>${ph ? `<img class="fvg-ph" src="${esc(ph)}" alt="">` : ''}
      <span class="fvg-who"><b>${esc(lastName(dName(s, x.id) || x.id))}</b>${x.sub ? `<small>${esc(x.sub)}</small>` : ''}</span>${dotd === x.id ? '<span class="fvg-dotd" title="Driver of the Day">DOTD</span>' : ''}<span class="fvg-score">${v}</span></li>`;
  }).join('')}</ol>`;
}
/** Driver of the Season: most Driver of the Day awards, then the better season rating. */
function driverOfTheSeason(s) {
  const SR = seasonRatings(s);
  const top = Object.values(SR.by).filter(o => o.dotd).sort((a, b) => b.dotd - a.dotd || b.avg - a.avg)[0];
  return top ? { ...top, final: roundsDone(s) === activeRounds(s).length, SR } : null;
}
const ratingColor = (v) => v >= 9 ? 'var(--purple)' : v >= 8 ? 'var(--green)' : v >= 6.5 ? 'var(--fg)' : v >= 5 ? 'var(--yellow)' : 'var(--red)';
/** The permutations of a sprint, or of the constructors' title, in words (the text version of their graphics). */
function tablePermsHtml(m, P) {
  const nm = (y) => esc(y.name); const posW = (q, nop) => q >= nop ? 'outside the points' : 'P' + q;
  return P.clinch.filter(t => t.table?.length).map(t => {
    const lines = t.table.map(row => {
      const head = row.p != null ? `${row.p >= row.nop ? 'Outside the points' : 'P' + row.p}` : `${row.pts} points (${row.combo})`;
      const conds = row.conds.map(o => row.p != null ? (o.q ? `${nm(o.y)} ${posW(o.q, o.nop)} or lower` : null) : o.max != null ? `${nm(o.y)} no more than ${o.max}` : null).filter(Boolean);
      return `<li><b>${head}</b>: ${conds.length ? conds.join(', ') : 'champion whatever the others do'}</li>`;
    });
    return `<p><b>${nm(t.x)}</b> ${m.team ? 'are' : 'is'} champion${P.sprint ? ' after the sprint' : ''} if ${m.team ? 'they score' : 'they finish'}:</p><ul class="perm-list">${lines.join('')}</ul>`;
  }).join('');
}
