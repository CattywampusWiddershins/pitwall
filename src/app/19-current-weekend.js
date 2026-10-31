/* Pitwall — The Current Weekend page. Part of the renderer, split into files that load in order (see index.html). */
'use strict';
/*
  Current weekend: what this weekend's practice says about qualifying and the race.
  Qualifying: each driver's ideal lap, their best sector 1, 2 and 3 from any practice session, sets the likely grid.
  Race: the whole grid's long runs give the best strategy and its time; each driver's own long runs say how much
  faster or slower they are than the grid on the same tyres (where they did none, their ideal-lap gap stands in), and
  starting further back costs a little in traffic. Teams and drivers are then ranked on race pace per lap.
*/
const SECTOR_OK = [2, 4, 8]; // the game's validity flag for sector 1, 2 and 3
/** Each driver's ideal lap from practice and the sprint shootout: { d: { ideal, best, sectors: [s1, s2, s3] } }. */
function idealLaps(s, round) {
  const w = s.weekends[round.id]; const out = {};
  for (const k of IDEAL_KEYS) {
    const sd = w?.sessions?.[k]; if (!sd?.game?.laps || sd.estimated) continue;
    for (const [d, laps] of Object.entries(sd.game.laps)) {
      const o = out[d] ||= { best: Infinity, sectors: [Infinity, Infinity, Infinity] };
      for (const l of laps) {
        if (l[0] && l[1]) o.best = Math.min(o.best, l[0]);
        for (let j = 0; j < 3; j++) { const v = l[2 + j]; if (v > 0 && (l[5] == null || l[5] & SECTOR_OK[j])) o.sectors[j] = Math.min(o.sectors[j], v); }
      }
    }
  }
  for (const o of Object.values(out)) { const sum = o.sectors.every(isFinite) ? o.sectors.reduce((a, b) => a + b, 0) : Infinity; o.ideal = Math.min(sum, o.best); }
  for (const d of Object.keys(out)) if (!isFinite(out[d].ideal)) delete out[d];
  return out;
}
/** The race forecast: { order: [{ d, t, start, off, est }], teams: [{ team, off }], plan, n }. */
function raceForecast(s, round) {
  const n = raceLaps(s, round.id); const grid = strategyRuns(s, round).grid; const ideal = idealLaps(s, round);
  const comps = Object.keys(grid); if (!comps.length) return null;
  const plan = comps.length >= 2 ? optimalStrategies(grid, n, { loss: pitLoss(career(), trackOf(round)).green })[0] : null;
  const baseT = plan ? plan.t : (() => { const g = grid[comps[0]]; return n * g.base + g.deg * n * (n - 1) / 2; })();
  const idealMed = (() => { const v = Object.values(ideal).map(o => o.ideal).sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; })();
  const q = s.weekends[round.id]?.sessions?.Q;
  const qOrder = q?.done ? q.results.map(x => x.d) : Object.entries(ideal).sort((a, b) => a[1].ideal - b[1].ideal).map(([d]) => d);
  const rows = [];
  for (const d of gridIds(s)) {
    const own = practiceRuns(s, round, d);
    const offs = Object.keys(own).filter(c => grid[c]).map(c => own[c].base - grid[c].base).sort((a, b) => a - b);
    let off = offs.length ? offs[Math.floor(offs.length / 2)] : null, est = false;
    if (off == null && ideal[d] && idealMed) { off = ideal[d].ideal - idealMed; est = true; }
    if (off == null) continue;
    const start = qOrder.indexOf(d) + 1 || gridIds(s).length;
    rows.push({ d, off, est, start, t: baseT + off * n + (start - 1) * 350 });
  }
  rows.sort((a, b) => a.t - b.t);
  const T = {};
  for (const x of rows) { const tm = teamOf(s, x.d); if (tm) (T[tm.id] ||= { team: tm, offs: [] }).offs.push(x.off); }
  const teams = Object.values(T).map(o => ({ team: o.team, off: avg(o.offs) })).sort((a, b) => a.off - b.off);
  return { order: rows, teams, plan, n };
}
/** A ranked pace board, the same look as the Performance tab. rows: [{ label, color, rel, me, sub }] */
function paceBoard(rows, unit = 'Gap') {
  const max = Math.max(0.001, ...rows.map(o => o.rel));
  return `<table><thead><tr><th>Pos</th><th>${rows[0]?.team ? 'Team' : 'Driver'}</th><th class="num">${unit}</th><th style="width:34%"></th></tr></thead><tbody>
    ${rows.map((o, k) => `<tr class="${o.me ? 'me' : ''}"><td class="pos ${k < 3 ? 'p' + (k + 1) : ''}">${k + 1}</td><td>${o.label}</td><td class="num">${k === 0 ? '<b>Fastest</b>' : gapS(o.rel)}${o.sub ? ` <span class="tag">${o.sub}</span>` : ''}</td>
      <td><div class="h2h-bar"><i style="--c:${o.color};width:${Math.max(2, 100 - o.rel / max * 70)}%"></i></div></td></tr>`).join('')}
  </tbody></table>`;
}
function renderCurrentWeekend() {
  if (ui.nowTab === 'live') return renderLiveRace();
  const c = career(); const s = latestSeason(); const r = nextRound(s);
  const head = (sub) => `<div class="page-head"><div><h1>Current Weekend</h1><div class="sub">${sub}</div></div>${nowTabs()}</div>`;
  if (!r || isHist(s)) return `<div class="page">${head('No weekend left to run this season.')}</div>`;
  const rounds = activeRounds(s); const w = s.weekends[r.id];
  const done = sessionsFor(s, r).filter(k => w?.sessions?.[k]?.done);
  const ideal = idealLaps(s, r);
  const qRows = Object.entries(ideal).sort((a, b) => a[1].ideal - b[1].ideal);
  const q = w?.sessions?.Q; const qPos = (d) => q?.done ? q.results.findIndex(x => x.d === d) + 1 : null;
  const quali = qRows.length ? `<table><thead><tr><th>Pos</th><th>Driver</th><th class="num">Ideal lap</th><th class="num">Gap</th><th class="num">Best lap</th>${q?.done ? '<th class="num">Qualified</th>' : ''}</tr></thead><tbody>
    ${qRows.map(([d, o], k) => `<tr class="${d === PLAYER ? 'me' : ''}"><td class="pos ${k < 3 ? 'p' + (k + 1) : ''}">${k + 1}</td><td>${drvCell(s, d, { team: true })}</td><td class="num mono">${fmtLap(o.ideal)}</td><td class="num">${k ? '+' + ((o.ideal - qRows[0][1].ideal) / 1000).toFixed(3) : ''}</td><td class="num mono muted">${isFinite(o.best) ? fmtLap(o.best) : '–'}</td>${q?.done ? `<td class="num">${qPos(d) ? 'P' + qPos(d) : '–'}</td>` : ''}</tr>`).join('')}
  </tbody></table>` : '<div class="empty">No practice laps from F1 25 yet. Run practice with telemetry on: each driver\'s best sectors make their ideal lap.</div>';
  const F = raceForecast(s, r);
  const race = F ? `<table><thead><tr><th>Pos</th><th>Driver</th><th class="num">Start</th><th class="num">Gap</th><th class="num">Pace / lap</th></tr></thead><tbody>
    ${F.order.map((x, k) => `<tr class="${x.d === PLAYER ? 'me' : ''}"><td class="pos ${k < 3 ? 'p' + (k + 1) : ''}">${k + 1}</td><td>${drvCell(s, x.d, { team: true })}</td><td class="num muted">P${x.start}</td><td class="num">${k ? '+' + ((x.t - F.order[0].t) / 1000).toFixed(1) + 's' : fmtDur(Math.round(x.t))}</td><td class="num">${gapS(x.off - F.order.reduce((m, y) => Math.min(m, y.off), Infinity))}${x.est ? ' <span class="tag" title="No long run in practice: from the ideal lap">est.</span>' : ''}</td></tr>`).join('')}
  </tbody></table>` : '<div class="empty">No long runs in practice yet: three or more consecutive clean laps on a compound make a run.</div>';
  const best = F?.teams[0]?.off ?? 0;
  const teamBoard = F?.teams.length ? paceBoard(F.teams.map(o => ({ team: true, label: `<div class="drv">${teamLogo(c, o.team, 22)}<b>${esc(o.team.name)}</b></div>`, color: o.team.color, rel: o.off - best, me: o.team.id === s.playerTeamId })), 'Pace per lap') : '';
  const dBest = F ? Math.min(...F.order.map(x => x.off)) : 0;
  const drvBoard = F?.order.length ? paceBoard(F.order.slice().sort((a, b) => a.off - b.off).map(x => ({ label: drvCell(s, x.d, { team: true }), color: teamColor(s, x.d), rel: x.off - dBest, me: x.d === PLAYER, sub: x.est ? 'est.' : '' })), 'Pace per lap') : '';
  return `<div class="page">
    ${head(`Round ${rounds.indexOf(r) + 1} · ${esc(r.name)} · ${fmtDay(roundDate(s, r))}${r.sprint ? ' · sprint weekend' : ''}. Forecasts from this weekend's practice in F1 25${done.length ? `; logged so far: ${done.map(k => SESSION_SHORT[k]).join(', ')}` : ''}.`)}
    <div class="row" style="gap:8px"><button class="btn sm" data-act="open-round" data-round="${r.id}">Open the weekend</button></div>
    <div class="grid-2">
      <div class="panel"><div class="panel-h"><h2>Qualifying forecast</h2><span class="muted" style="font-size:12px">Ideal lap: best sectors from all practice</span></div><div class="panel-b tight table-wrap">${quali}</div></div>
      <div class="panel"><div class="panel-h"><h2>Race forecast</h2><span class="muted" style="font-size:12px">${F ? `${plural(F.n, 'lap')}${F.plan ? ` · ${plural(F.plan.stops, 'stop')} race` : ''}` : ''}</span></div><div class="panel-b tight table-wrap">${race}</div></div>
    </div>
    ${F ? `<div class="grid-2">
      <div class="panel"><div class="panel-h"><h2>Predicted race pace · teams</h2><span class="muted" style="font-size:12px">Long runs against the grid, per lap</span></div><div class="panel-b tight table-wrap">${teamBoard}</div></div>
      <div class="panel"><div class="panel-h"><h2>Predicted race pace · drivers</h2><span class="muted" style="font-size:12px">“est.” = no long run, from the ideal lap</span></div><div class="panel-b tight table-wrap">${drvBoard}</div></div>
    </div>` : ''}
    ${tyreAllocPanel(c, s, r)}
    ${strategyAdvicePanel(c, s)}
    ${(() => { const r = nextRound(s); return r && !isHist(s) ? fuelPanel(c, s, r, c.type === 'myteam' ? (s.teams.find(t => t.id === s.playerTeamId)?.drivers || []).filter(Boolean) : [PLAYER]) : ''; })()}
    ${ersPanel(c, s, r, 'quali')}
    ${ersPanel(c, s, r)}
  </div>`;
}
