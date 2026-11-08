/* Pitwall — Head to head, career stats, drivers, teams, circuits. Part of the renderer, split into files that load in order (see index.html). */
'use strict';
/* ------------------------------------------------------------------- H2H */
function allDriversInCareer(c) {
  const map = {};
  for (const s of c.seasons) for (const id of gridIds(s)) map[id] = s.drivers[id];
  return map;
}
/** The leaderboard columns: [key, label]. */
const LB_COLS = [['titles', 'Titles'], ['starts', 'Starts'], ['wins', 'Wins'], ['podiums', 'Podiums'], ['poles', 'Poles'], ['pts', 'Points']];
/** The all-time leaderboard in the Simple standings look: every stat in red, the sorted one marked; drivers off the grid in grey. */
function lbBoard(c, latest, board, lk, add) {
  const fmt = (k, v) => k === 'pts' ? fmtPts(v) : k === 'titles' ? (v || '–') : v;
  return `<div class="lbx"><div class="lbx-row lbx-h"><span></span><span>Driver</span>${LB_COLS.map(([k, l]) => `<span class="sortable ${lk === k ? 'on' : ''}" data-act="lb-sort" data-k="${k}">${l}${lk === k ? ' ▼' : ''}</span>`).join('')}</div>
    ${board.map((x, i) => { const col = x.team?.color; const ph = headOf(c, x.id, latest);
      return `<div class="lbx-row ${x.team ? '' : 'off'} ${x.id === PLAYER ? 'me' : ''}" ${x.known === false ? '' : `data-act="open-driver" data-id="${x.id}"`} style="--c:${col || '#3A3F4A'};--i:${col ? contrastInk(col) : '#fff'}"><span class="lbx-p">${i + 1}</span>
        <span class="lbx-bar">${x.team ? `<span class="sgx-logo">${teamLogo(c, x.team, 24)}</span>` : ''}${ph ? `<img class="sgx-ph" src="${esc(ph)}" alt="">` : ''}<b>${esc(lastName(x.name).toUpperCase())}</b><small>${esc(x.name.split(' ').slice(0, -1).join(' '))}</small></span>
        ${LB_COLS.map(([k]) => `<span class="lbx-v ${lk === k ? 'sort' : ''}">${fmt(k, x[k])}${k !== 'titles' ? add(x, k, k === 'pts' ? fmtPts : undefined) : ''}</span>`).join('')}</div>`; }).join('')}</div>`;
}
/**
 * Every driver ever, counted from a year: the real seasons before 2016 from the bundled history (every driver who
 * started a championship race or scored since 1950), then every season in the career (the real ones from 2016 and
 * the career's own). { id, name, team, starts, wins, podiums, poles, fls, pts, titles, real: { … the real part } }.
 */
const LB_KEYS = ['starts', 'wins', 'podiums', 'poles', 'fls', 'pts'];
function allTimeBoard(c, since, ctx, known, latest) {
  const by = {}; const row = (id) => by[id] ||= { id, starts: 0, wins: 0, podiums: 0, poles: 0, fls: 0, pts: 0, titles: 0, real: { starts: 0, wins: 0, podiums: 0, poles: 0, fls: 0, pts: 0 } };
  for (const [id, A] of Object.entries(H.allTime || {})) for (const [y, v] of Object.entries(A.y)) {
    if (+y < since) continue; const o = row(id);
    LB_KEYS.forEach((k, j) => { o[k] += v[j]; o.real[k] += v[j]; }); o.titles += v[6];
  }
  for (const { s, st, champ } of ctx) {
    if (s.year < since) continue;
    for (const [id, x] of Object.entries(st)) {
      if (!s.drivers[id] || !(x.starts || x.pts)) continue; const o = row(id);
      for (const k of LB_KEYS) { o[k] += x[k] || 0; if (isHist(s)) o.real[k] += x[k] || 0; }
      if (champ === id) o.titles++;
    }
  }
  const nameOf = (id) => id === PLAYER_ID ? `${c.profile.first} ${c.profile.last}` : known[id]?.name || H.allTime?.[id]?.n || id;
  return Object.values(by).filter(o => o.starts || o.pts).map(o => ({ ...o, pts: Math.round(o.pts * 10) / 10, name: nameOf(o.id), team: teamOf(latest, o.id), known: !!known[o.id] || o.id === PLAYER_ID }));
}
/** The leaderboard's filters: each figure between a lowest and a highest value (either can be left empty). */
const lbFilters = () => (ui.lb.f ||= {});
const lbPass = (x) => Object.entries(lbFilters()).every(([k, [lo, hi]]) => (lo == null || x[k] >= lo) && (hi == null || x[k] <= hi));
const lbFilterText = () => Object.entries(lbFilters()).filter(([, [lo, hi]]) => lo != null || hi != null).map(([k, [lo, hi]]) => { const l = (Object.fromEntries(LB_COLS)[k] || k).toLowerCase(); return lo != null && hi != null ? `${lo}–${hi} ${l}` : lo != null ? `${lo}+ ${l}` : `up to ${hi} ${l}`; });
/** The export dialog: which stats go on the image (the sorted one always does). */
function lbExportModal() {
  ui.modal = { kind: 'lb-export', pick: ui.lbPick || { [ui.lb.sort]: true } };
  drawLbExportModal();
}
function drawLbExportModal() {
  const m = ui.modal; const lk = ui.lb.sort;
  modal(`<div class="modal-h"><h2>Export the top 10</h2><button class="icon-btn" data-act="modal-close">${ICON.x}</button></div>
    <div class="modal-b"><p class="muted" style="margin:0">Sorted by <b>${LB_COLS.find(x => x[0] === lk)[1]}</b>, which is always on the image. Pick any other stats to add.</p>
      <div class="row" style="gap:14px;flex-wrap:wrap">${LB_COLS.map(([k, l]) => `<label class="row" style="gap:6px"><input type="checkbox" data-ch="lb-pick" data-k="${k}" ${k === lk || m.pick[k] ? 'checked' : ''} ${k === lk ? 'disabled' : ''}> ${l}</label>`).join('')}</div></div>
    <div class="modal-f"><button class="btn ghost" data-act="modal-close">Cancel</button><button class="btn primary" data-act="lb-export-go">Make the image</button></div>`);
}
function renderH2H() {
  const c = career();
  const scope = ui.h2h.scope;
  const seasons = scope === 'all' ? c.seasons : [c.seasons[scope === 'cur' ? c.seasons.length - 1 : +scope]];
  const ref = seasons[seasons.length - 1];
  const a = ui.h2h.a || PLAYER;
  const b = ui.h2h.b || teammateOf(ref) || gridIds(ref).find(x => x !== a);
  const pool = scope === 'all' ? allDriversInCareer(c) : ref.drivers;
  const ids = Object.keys(pool).filter(id => scope === 'all' || gridIds(ref).includes(id)).sort((x, y) => x === PLAYER ? -1 : y === PLAYER ? 1 : pool[x].name.localeCompare(pool[y].name));
  const h = h2hCompare(seasons, a, b);
  const ca = teamColor(ref, a), cb = teamColor(ref, b);
  const cb2 = ca === cb ? '#8B97AF' : cb;
  const row = (label, va, vb, lowerBetter = false, fmt = (v) => v ?? '–') => {
    const na = typeof va === 'number' ? va : null, nb = typeof vb === 'number' ? vb : null;
    let wa = false, wb = false;
    if (na != null && nb != null && na !== nb) { const aBetter = lowerBetter ? na < nb : na > nb; wa = aBetter; wb = !aBetter; }
    let pa = 50, pb = 50;
    if (na != null && nb != null && (na + nb) > 0) {
      if (lowerBetter) { pa = nb / (na + nb) * 100; pb = na / (na + nb) * 100; } else { pa = na / (na + nb) * 100; pb = nb / (na + nb) * 100; }
    }
    return `<div class="h2h-row"><span class="v ${wa ? 'win' : wb ? 'lose' : ''}">${fmt(va)}</span>
      <div class="h2h-bar l"><i style="--c:${ca};width:${pa}%"></i></div><span class="k">${label}</span>
      <div class="h2h-bar"><i style="--c:${cb2};width:${pb}%"></i></div><span class="v r ${wb ? 'win' : wa ? 'lose' : ''}">${fmt(vb)}</span></div>`;
  };
  const sel = (which, val) => `<select data-ch="h2h-${which}" style="width:auto;max-width:240px">${ids.map(id => `<option value="${id}" ${id === val ? 'selected' : ''}>${esc(pool[id].name)}${id === PLAYER ? ' (you)' : ''}</option>`).join('')}</select>`;
  const scopeSel = `<select data-ch="h2h-scope" style="width:auto"><option value="cur" ${scope === 'cur' ? 'selected' : ''}>Current season</option>${c.seasons.map((s, i) => `<option value="${i}" ${scope === String(i) ? 'selected' : ''}>${s.year} season</option>`).join('')}<option value="all" ${scope === 'all' ? 'selected' : ''}>Every season since ${c.seasons[0].year}</option></select>`;
  const pct = (w, t) => t ? Math.round(w / t * 100) + '%' : '–';
  const whole = scope === 'all';
  // whole career: real F1 records up to 2024 plus everything logged since
  const ctx = whole ? careerCtx(c) : null;
  const ra = whole ? driverRecord(c, a, ctx).tot : null, rb = whole ? driverRecord(c, b, ctx).tot : null;
  const rate = (t, k) => t.starts ? t[k] / t.starts * 100 : null;
  const side = (id, col, right) => `<div class="h2h-side ${right ? 'right' : ''}">${sel(right ? 'b' : 'a', id)}
    <div class="h2h-id">${avatar(c, ref, id, 64)}<div style="min-width:0"><div class="nm" style="color:${col}">${esc(pool[id]?.name || id)}</div><span class="muted">${esc(teamOf(ref, id)?.name || '')}</span></div></div></div>`;

  return `<div class="page">
    <div class="page-head"><div><h1>Head to Head</h1><div class="sub">Compare any two drivers on the grid. Defaults to you against your teammate.</div></div>
    <div class="row">${scopeSel}</div></div>
    <div class="gfx-hero h2h-gfx">${gfxSlot({ type: 'h2h', si: c.seasons.length - 1, ri: 0, a, b, scope })}</div>
    <div class="panel"><div class="panel-b">
      <div class="h2h-head">
        ${side(a, ca, false)}
        <div class="label">vs</div>
        ${side(b, cb2, true)}
      </div>
    </div>
    ${whole ? `<div class="panel-h" style="border-top:1px solid var(--line)"><h3>Entire F1 careers</h3><span class="muted" style="font-size:12px">Real records up to the start of 2025 plus every race in your career</span></div>
    <div class="panel-b">
      ${row('World titles', ra.titles.length, rb.titles.length)}
      ${row('Starts', ra.starts, rb.starts)}
      ${row('Wins', ra.wins, rb.wins)}
      ${row('Podiums', ra.podiums, rb.podiums)}
      ${row('Poles', ra.poles, rb.poles)}
      ${row('Fastest laps', ra.fls, rb.fls)}
      ${row('Points', ra.pts, rb.pts, false, (v) => fmtPts(v))}
      ${row('Win rate', rate(ra, 'wins'), rate(rb, 'wins'), false, (v) => v == null ? '–' : v.toFixed(1) + '%')}
      ${row('Podium rate', rate(ra, 'podiums'), rate(rb, 'podiums'), false, (v) => v == null ? '–' : v.toFixed(1) + '%')}
      ${row('Best championship', ra.bestChamp, rb.bestChamp, true, (v) => v ? 'P' + v : '–')}
    </div>
    <div class="panel-h" style="border-top:1px solid var(--line)"><h3>Head to head in your career</h3><span class="muted" style="font-size:12px">Sessions where both drivers took part, ${c.seasons[0].year} onwards (real seasons included)</span></div>` : ''}
    <div class="panel-b" style="border-top:1px solid var(--line)">
      ${row('Qualifying', h.q[0], h.q[1])}
      ${row('Race', h.r[0], h.r[1])}
      ${h.s[0] + h.s[1] ? row('Sprint', h.s[0], h.s[1]) : ''}
      ${whole ? '' : `${row('Points', h.pts[0], h.pts[1])}
      ${row('Wins', h.wins[0], h.wins[1])}
      ${row('Podiums', h.podiums[0], h.podiums[1])}
      ${row('Poles', h.poles[0], h.poles[1])}
      ${row('Fastest laps', h.fls[0], h.fls[1])}`}
      ${row('Retirements', h.dnfs[0], h.dnfs[1], true)}
      ${row('Avg grid', avg(h.qPos[0]), avg(h.qPos[1]), true, fmtAvg)}
      ${row('Avg finish', avg(h.finPos[0]), avg(h.finPos[1]), true, fmtAvg)}
      ${row('Best finish', whole ? ra.bestFinish : h.best[0], whole ? rb.bestFinish : h.best[1], true, (v) => v ? 'P' + v : '–')}
    </div></div>
    <div class="grid-2">
      <div class="panel"><div class="panel-h"><h3>Race finishing positions</h3><span class="muted" style="font-size:12px">Lower is better · win rate ${pct(h.r[0], h.r[0] + h.r[1])} vs ${pct(h.r[1], h.r[0] + h.r[1])}</span></div><div class="panel-b">${posChart(h.rounds, ca, cb2, 'a', 'b')}</div></div>
      <div class="panel"><div class="panel-h"><h3>Qualifying positions</h3><span class="muted" style="font-size:12px">Lower is better</span></div><div class="panel-b">${posChart(h.rounds, ca, cb2, 'aq', 'bq')}</div></div>
    </div>
  </div>`;
}

/** Championship points and position after every race logged. */
function progression(s, kind = 'driver') {
  const rounds = activeRounds(s);
  const idx = rounds.map((r, i) => i).filter(i => s.weekends[rounds[i].id]?.sessions?.R?.done);
  const by = {};
  idx.forEach((i, k) => {
    const st = seasonStats(s, i + 1);
    const rows = kind === 'team' ? constructorStandings(s, st).map(x => ({ id: x.team.id, pts: x.pts, pos: x.pos })) : driverStandings(s, st).map(x => ({ id: x.id, pts: x.pts, pos: x.pos }));
    for (const x of rows) { const o = (by[x.id] ||= { id: x.id, pts: Array(idx.length).fill(null), pos: Array(idx.length).fill(null) }); o.pts[k] = x.pts; o.pos[k] = x.pos; }
  });
  return { labels: idx.map(i => rounds[i].id.toUpperCase()), names: idx.map(i => rounds[i].name), by, n: idx.length };
}
/** Line chart for season progress. series: [{ label, color, dash, bold, vals }] */
function lineChart(series, labels, { invert = false, maxY = null, names = [] } = {}) {
  if (labels.length < 1 || !series.length) return '<div class="empty">Log a race to see the chart.</div>';
  const W = 760, H = 320, L = 52, R = 130, T = 14, B = 30;
  const all = series.flatMap(x => x.vals.filter(v => v != null));
  const top = maxY ?? Math.max(1, ...all);
  const xs = (i) => L + (labels.length === 1 ? (W - L - R) / 2 : i * (W - L - R) / (labels.length - 1));
  const ys = invert ? (v) => T + (v - 1) / Math.max(1, top - 1) * (H - T - B) : (v) => T + (1 - v / top) * (H - T - B);
  const step = invert ? null : [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500].find(st => top / st <= 5) || 1000;
  const ticks = invert ? [1, 5, 10, 15, 20, 25].filter(t => t <= top) : Array.from({ length: Math.floor(top / step) + 1 }, (_, i) => i * step);
  const every = Math.ceil(labels.length / 12);
  // name tags at the end of each line, pushed apart so they never overlap
  const ends = gxEndLabels(series.map(x => { let k = x.vals.length - 1; while (k >= 0 && x.vals[k] == null) k--; return k < 0 ? null : { x, k, y0: ys(x.vals[k]), y: ys(x.vals[k]), v: x.vals[k] }; }).filter(Boolean), T + 8, H - B - 8);
  const path = (vals, from = 0, to = vals.length) => { let d = ''; vals.forEach((v, i) => { if (v == null || i < from || i >= to) return; d += `${d ? 'L' : 'M'}${xs(i).toFixed(1)},${ys(v).toFixed(1)}`; }); return d; };
  const line = (x, d, dash, op) => `<path d="${d}" fill="none" stroke="${gxCol(x.color)}" stroke-width="${x.bold ? 4.5 : 3}" ${dash ? 'stroke-dasharray="10 7"' : ''} stroke-linejoin="round" stroke-linecap="round" opacity="${op}"/>`;
  // a series with `split` is real up to that index and projected (dashed, faded) after it
  const splitAt = series.find(x => x.split != null)?.split;
  return `<div class="gx-chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Season progress chart">
    ${ticks.map(t => `<line x1="${L}" x2="${W - R}" y1="${ys(t)}" y2="${ys(t)}" class="gx-grid"/><text x="${L - 10}" y="${ys(t) + 4}" text-anchor="end" class="gx-tick">${invert ? 'P' + t : t}</text>`).join('')}
    ${splitAt != null ? `<line x1="${xs(splitAt - 1)}" x2="${xs(splitAt - 1)}" y1="${T}" y2="${H - B}" class="gx-grid" stroke-dasharray="4 4"/><text x="${xs(splitAt - 1) + 6}" y="${T + 12}" class="gx-tick">NOW</text>` : ''}
    ${labels.map((l, i) => (i % every === 0 && labels.length - 1 - i >= every) || i === labels.length - 1 ? `<text x="${xs(i)}" y="${H - 8}" text-anchor="middle" class="gx-tick">${esc(String(l).toUpperCase())}</text>` : '').join('')}
    ${series.slice().reverse().map(x => `${x.split != null ? line(x, path(x.vals, 0, x.split), false, 1) + line(x, path(x.vals, x.split - 1), true, 0.6) : line(x, path(x.vals), x.dash, x.bold ? 1 : 0.9)}
      ${x.vals.map((v, i) => v == null ? '' : `<circle cx="${xs(i)}" cy="${ys(v)}" r="${x.bold ? 4 : 3}" fill="${gxCol(x.color)}" ${x.split != null && i >= x.split ? 'opacity="0.55"' : ''}><title>${esc(x.name || x.label)} · ${esc(names[i] || labels[i])}: ${invert ? 'P' + v : fmtPts(v) + ' pts'}</title></circle>`).join('')}`).join('')}
    ${ends.map(e => { const col = gxCol(e.x.color); const x = W - R + 14; return `<line x1="${xs(e.k)}" y1="${e.y0}" x2="${x}" y2="${e.y}" stroke="${col}" stroke-width="1" opacity=".35" stroke-dasharray="2 3"/><rect x="${x + 4}" y="${e.y - 11}" width="5" height="22" fill="${col}"/><text x="${x + 15}" y="${e.y - 1}" class="gx-name">${esc(String(e.x.label).toUpperCase())}</text><text x="${x + 15}" y="${e.y + 12}" class="gx-sub">${invert ? 'P' + e.v : fmtPts(e.v) + ' PTS'}</text>`; }).join('')}
  </svg></div>`;
}
/** Chart series for drivers: the top n plus you, teammates dashed so team colours stay readable. */
function driverSeries(s, prog, key, n = 8) {
  const last = prog.n - 1;
  let ids = Object.values(prog.by).sort((a, b) => (a.pos[last] ?? 99) - (b.pos[last] ?? 99)).slice(0, n).map(x => x.id);
  if (prog.by[PLAYER] && !ids.includes(PLAYER)) ids.push(PLAYER);
  const seenTeam = {};
  return ids.map(id => { const t = teamOf(s, id)?.id || id; const dash = !!seenTeam[t]; seenTeam[t] = true; return { label: dAbbr(s, id), name: dName(s, id), color: teamColor(s, id), dash, bold: id === PLAYER, vals: prog.by[id][key] }; });
}

function posChart(rounds, ca, cb, ka, kb) {
  const data = rounds.filter(r => r[ka] != null || r[kb] != null);
  if (!data.length) return '<div class="empty">Log some sessions to see the chart.</div>';
  const W = 560, H = 240, L = 34, R = 12, T = 12, B = 30;
  const maxP = Math.max(10, ...data.flatMap(r => [r[ka], r[kb]].filter(v => typeof v === 'number')));
  const xs = (i) => L + (data.length === 1 ? (W - L - R) / 2 : i * (W - L - R) / (data.length - 1));
  const ys = (p) => T + (p - 1) / (maxP - 1) * (H - T - B);
  const val = (v) => typeof v === 'number' ? v : (v ? maxP : null);
  const path = (k) => { let d = ''; data.forEach((r, i) => { const v = val(r[k]); if (v == null) return; d += `${d ? 'L' : 'M'}${xs(i).toFixed(1)},${ys(v).toFixed(1)}`; }); return d; };
  const ticks = [1, 5, 10, 15, 20].filter(t => t <= maxP);
  const every = Math.ceil(data.length / 12);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Positions by round">
    <g class="grid">${ticks.map(t => `<line x1="${L}" x2="${W - R}" y1="${ys(t)}" y2="${ys(t)}"/><text x="${L - 8}" y="${ys(t) + 4}" text-anchor="end">P${t}</text>`).join('')}</g>
    ${data.map((r, i) => i % every === 0 ? `<text x="${xs(i)}" y="${H - 10}" text-anchor="middle">${esc(r.short)}</text>` : '').join('')}
    <path d="${path(kb)}" fill="none" stroke="${cb}" stroke-width="2.2" stroke-linejoin="round" opacity="0.85"/>
    <path d="${path(ka)}" fill="none" stroke="${ca}" stroke-width="2.6" stroke-linejoin="round"/>
    ${data.map((r, i) => [[kb, cb], [ka, ca]].map(([k, col]) => { const v = val(r[k]); return v == null ? '' : `<circle cx="${xs(i)}" cy="${ys(v)}" r="3.2" fill="${typeof r[k] === 'number' ? col : '#F0535A'}"><title>${esc(r.label)}: ${typeof r[k] === 'number' ? 'P' + r[k] : r[k]}</title></circle>`; }).join('')).join('')}
  </svg>`;
}

/* ----------------------------------------------------------- career stats */
function renderStats() {
  const c = career();
  const played = playedSeasons(c);
  const rows = played.map(s => {
    const st = seasonStats(s);
    const me = st[PLAYER] || emptyStat();
    const ds = driverStandings(s, st);
    const mate = teammateOf(s);
    const h = h2hCompare([s], PLAYER, mate);
    const done = roundsDone(s);
    return { s, me, pos: ds.find(x => x.id === PLAYER)?.pos, team: s.teams.find(t => t.id === s.playerTeamId), mate, h, done, total: activeRounds(s).length, champion: ds[0], title: decidedChamps(s, done, ds, constructorStandings(s, st)).champ === PLAYER };
  });
  const T = rows.reduce((a, r) => ({ pts: a.pts + r.me.pts, wins: a.wins + r.me.wins, podiums: a.podiums + r.me.podiums, poles: a.poles + r.me.poles, fls: a.fls + r.me.fls, starts: a.starts + r.me.starts, dnfs: a.dnfs + r.me.dnfs, titles: a.titles + (r.title ? 1 : 0), fin: a.fin.concat(r.me.finPos), q: a.q.concat(r.me.qPos) }), { pts: 0, wins: 0, podiums: 0, poles: 0, fls: 0, starts: 0, dnfs: 0, titles: 0, fin: [], q: [] });

  // all-time leaderboard: the whole current grid plus anyone who has raced in this career
  const latest = c.seasons[c.seasons.length - 1];
  const ctx = careerCtx(c);
  const known = allKnownDrivers(c, latest);
  const lbIds = [...new Set([...gridIds(latest), ...c.seasons.flatMap(se => Object.entries(seasonStatsCache(se)).filter(([, o]) => o.starts).map(([id]) => id))])].filter(id => known[id]);
  if (ui.lb.scope === 'full') ui.lb.scope = 'since'; // (was 'Entire careers': since 1950)
  const full = ui.lb.scope === 'since'; const since = Math.max(1950, Math.min(latest.year, +ui.lb.since || 1950));
  const all = full ? allTimeBoard(c, since, ctx, known, latest) : null;
  const board0 = full ? all : lbIds.map(id => {
    const rec = driverRecord(c, id, ctx);
    const t = full ? rec.tot : Object.fromEntries(['starts', 'wins', 'podiums', 'poles', 'fls', 'pts'].map(k => [k, rec.tot[k] - rec.base[k]]));
    const titles = full ? rec.tot.titles.length : rec.seasons.filter(x => x.title && !isHist(x.s)).length;
    return { id, name: id === PLAYER_ID ? `${c.profile.first} ${c.profile.last}` : known[id].name, team: teamOf(latest, id), ...t, titles, from: rec.from };
  });
  const board = board0.filter(lbPass); const LB_SHOW = 100;
  const lk = ui.lb.sort;
  board.sort((a, b) => (b[lk] - a[lk]) || b.wins - a.wins || b.pts - a.pts || a.name.localeCompare(b.name));
  ui.lbLast = { full, since, filters: lbFilterText(), rows: board.slice(0, 10).map(x => ({ id: x.id, name: x.name, team: x.team?.id || null, ...Object.fromEntries(LB_COLS.map(([k]) => [k, x[k]])) })) };
  const lth = (key, label) => `<th class="num sortable ${lk === key ? 'on' : ''}" data-act="lb-sort" data-k="${key}">${label}</th>`;
  const lbAdd = (x, k, fmt) => full ? plus(x[k] - x.real[k], fmt) : '';

  const wins = [];
  for (const s of played) {
    const st = seasonStats(s);
    activeRounds(s).forEach(r => { const br = st[PLAYER]?.byRound[r.id]; if (br?.r === 1) wins.push(`${s.year} ${r.name}`); });
  }

  return `<div class="page">
    <div class="page-head"><div><h1>Career Stats</h1><div class="sub">${played.length} season${played.length > 1 ? 's' : ''} · ${T.starts} race starts</div></div></div>
    <div class="tiles">
      <div class="tile"><span class="label">Titles</span><span class="v">${T.titles}</span></div>
      <div class="tile"><span class="label">Wins</span><span class="v">${T.wins}<small>${T.starts ? ` ${Math.round(T.wins / T.starts * 100)}%` : ''}</small></span></div>
      <div class="tile"><span class="label">Podiums</span><span class="v">${T.podiums}</span></div>
      <div class="tile"><span class="label">Poles</span><span class="v">${T.poles}</span></div>
      <div class="tile"><span class="label">Fastest laps</span><span class="v" style="color:var(--purple)">${T.fls}</span></div>
      <div class="tile"><span class="label">Points</span><span class="v">${T.pts}</span></div>
    </div>
    <div class="panel"><div class="panel-h"><h2>Season by season</h2><span class="muted" style="font-size:12px">Click a season for its full review</span></div><div class="panel-b tight table-wrap"><table>
      <thead><tr><th>Season</th><th>Team</th><th class="num">Pos</th><th class="num">Pts</th><th class="num">Wins</th><th class="num">Pod</th><th class="num">Poles</th><th class="num">FL</th><th class="num">DNF</th><th class="num">Avg Q</th><th class="num">Avg R</th><th>vs teammate (Q / R)</th></tr></thead>
      <tbody>${rows.map(r => `<tr data-act="open-review" data-idx="${r.s.index}" title="Season review"><td><b>${r.s.year}</b>${r.done < r.total ? ` <span class="muted" style="font-size:12px">${r.done}/${r.total}</span>` : ''}</td>
        <td><div class="drv"><span class="chip" style="--c:${r.team?.color}"></span>${esc(r.team?.name)}</div></td>
        <td class="num">${r.pos ? `<span class="pos ${r.pos <= 3 ? 'p' + r.pos : ''}" style="font-size:14px">P${r.pos}</span>` : '–'}</td><td class="num"><b>${r.me.pts}</b></td><td class="num">${r.me.wins}</td><td class="num">${r.me.podiums}</td><td class="num">${r.me.poles}</td><td class="num">${r.me.fls}</td><td class="num">${r.me.dnfs}</td>
        <td class="num">${fmtAvg(avg(r.me.qPos))}</td><td class="num">${fmtAvg(avg(r.me.finPos))}</td>
        <td><span class="tnum">${r.h.q[0]}–${r.h.q[1]} / ${r.h.r[0]}–${r.h.r[1]}</span> <span class="muted">vs ${esc(dAbbr(r.s, r.mate))}</span></td></tr>`).join('')}</tbody>
    </table></div></div>
    <div class="panel"><div class="panel-h"><div><h2>All-time leaderboard</h2><span class="muted" style="font-size:12px">${full ? `Every Formula 1 driver since ${since}: the real records plus your career (shown in green)` : `Only what each driver has done since ${firstPlayed(c).year} in your career: the ${latest.year} grid plus everyone who has raced since ${c.seasons[0].year}`}. Click a column to sort.</span></div>
      <div class="row" style="gap:8px"><div class="seg">${[['since', 'Since'], ['career', 'This career only']].map(([v, l]) => `<button data-act="lb-scope" data-v="${v}" class="${ui.lb.scope === v ? 'on' : ''}">${l}</button>`).join('')}</div>${full ? `<select data-ch="lb-since" style="width:auto" title="Count from this season">${Array.from({ length: latest.year - 1949 }, (_, k) => 1950 + k).map(y => `<option value="${y}" ${y === since ? 'selected' : ''}>${y}</option>`).join('')}</select>` : ''}<button class="btn sm ${lbFilterText().length ? 'primary' : ''}" data-act="lb-filters">Filters${lbFilterText().length ? ` (${lbFilterText().length})` : ''}</button></div></div>
      ${ui.lbFiltersOpen ? `<div class="panel-b lb-filters">${LB_COLS.map(([k, l]) => { const [lo, hi] = lbFilters()[k] || []; return `<label><span class="label">${l}</span><input type="number" min="0" placeholder="Any" data-ch="lb-f" data-k="${k}" data-i="0" value="${lo ?? ''}"><span class="muted">to</span><input type="number" min="0" placeholder="Any" data-ch="lb-f" data-k="${k}" data-i="1" value="${hi ?? ''}"></label>`; }).join('')}<button class="btn sm ghost" data-act="lb-f-clear">Clear filters</button></div>` : ''}
      <div class="panel-b"><div class="row" style="justify-content:flex-end;margin-bottom:8px"><button class="btn sm primary" data-act="lb-export">${ICON.camera} Export top 10 as image</button></div>${board.length ? lbBoard(c, latest, board.slice(0, LB_SHOW), lk, full ? lbAdd : () => '') : '<p class="muted" style="margin:0">No driver matches the filters.</p>'}${board.length > LB_SHOW ? `<p class="muted" style="font-size:12px;margin:8px 0 0">The top ${LB_SHOW} of ${board.length} drivers. Filters narrow the list.</p>` : ''}</div></div>
    <div>
      <div class="panel"><div class="panel-h"><h2>Your records</h2></div><div class="panel-b">
        <dl class="kv">
          <dt>Best finish</dt><dd>${T.fin.length ? 'P' + Math.min(...T.fin) : '–'}</dd>
          <dt>Best qualifying</dt><dd>${T.q.length ? 'P' + Math.min(...T.q) : '–'}</dd>
          <dt>Average finish</dt><dd>${fmtAvg(avg(T.fin))}</dd>
          <dt>Average grid</dt><dd>${fmtAvg(avg(T.q))}</dd>
          <dt>Retirements</dt><dd>${T.dnfs}</dd>
          <dt>Grand Prix wins</dt><dd>${wins.length ? wins.map(esc).join('<br>') : '<span class="muted">Still hunting the first one</span>'}</dd>
        </dl>
      </div></div>
    </div>
  </div>`;
}

/* ---------------------------------------------------------- season review */
function renderReview() {
  const c = career(); const s = curSeason();
  const rounds = activeRounds(s); const done = roundsDone(s); const complete = done > 0 && done === rounds.length;
  const st = seasonStatsCache(s); const ds = driverStandings(s, st); const cs = constructorStandings(s, st);
  const me = st[PLAYER] || emptyStat(); const myPos = ds.find(x => x.id === PLAYER)?.pos;
  const prev = c.seasons[s.index - 1]; const pst = prev ? seasonStatsCache(prev) : null;
  const prevPos = prev ? driverStandings(prev, pst).find(x => x.id === PLAYER)?.pos : null;
  const team = s.teams.find(t => t.id === s.playerTeamId); const mate = teammateOf(s);
  const h = h2hCompare([s], PLAYER, mate);
  if (!done) return `<div class="page"><div class="page-head"><div><h1>${s.year} season review</h1></div><div class="row">${seasonPicker(c, s.index)}</div></div><div class="panel"><div class="empty">No races logged in ${s.year} yet.</div></div></div>`;
  // your weekends, best and worst
  const weekends = rounds.map((r, i) => {
    const ses = s.weekends[r.id]?.sessions; if (!ses?.R?.done) return null;
    const br = me.byRound[r.id] || {};
    const p = ['SPR', 'R'].reduce((a, k) => { const sd = ses[k]; if (!sd?.done) return a; const ix = sd.results.findIndex(x => x.d === PLAYER); return a + (ix >= 0 ? pointsFor(k, ix + 1, sd.results[ix].st, sd.results[ix].pts) : 0); }, 0);
    return { r, i, br, pts: p, fin: typeof br.r === 'number' ? br.r : 99 };
  }).filter(Boolean);
  const best = weekends.slice().sort((a, b) => b.pts - a.pts || a.fin - b.fin).slice(0, 3);
  const worst = weekends.slice().sort((a, b) => b.fin - a.fin || a.pts - b.pts).filter(x => !best.includes(x)).slice(0, 3);
  const wkRow = (x) => `<tr data-act="open-round" data-round="${x.r.id}"><td class="muted num">R${x.i + 1}</td><td>${esc(x.r.name)}</td><td class="num">${x.br.q ? 'P' + x.br.q : '–'}</td><td class="num"><b>${typeof x.br.r === 'number' ? 'P' + x.br.r : `<span class="tag dnf">${esc(x.br.r || '–')}</span>`}</b></td><td class="num">+${x.pts}</td></tr>`;
  // awards
  const ids = Object.keys(st).filter(id => s.drivers[id] && st[id].starts);
  const top = (fn, filter = () => true) => ids.filter(filter).map(id => ({ id, v: fn(id) })).filter(x => x.v > 0).sort((a, b) => b.v - a.v)[0] || null;
  const earlier = new Set(c.seasons.slice(0, s.index).flatMap(gridIds));
  const rookie = top(id => st[id].pts + 0.001, id => id === PLAYER_ID ? s.index === 0 : !earlier.has(id) && !(D.DRIVER_BIO[id]?.starts));
  const gained = {};
  for (const r of rounds) {
    const ses = s.weekends[r.id]?.sessions; if (!ses?.R?.done || !ses.Q?.done) continue;
    const grid = ses.Q.results.map(x => x.d);
    ses.R.results.forEach((x, k) => { if (OUT.includes(x.st)) return; const g0 = grid.indexOf(x.d) + 1; if (g0) gained[x.d] = (gained[x.d] || 0) + (g0 - (k + 1)); });
  }
  const ptsFinishes = (id) => Object.values(st[id].byRound).filter(b => typeof b.r === 'number' && b.r <= 10).length;
  const share = (id) => { const t = teamOf(s, id); const m = t?.drivers.find(d => d && d !== id); const tot = st[id].pts + (st[m]?.pts || 0); return tot >= 20 ? Math.round(st[id].pts / tot * 100) : 0; };
  const awards = [
    ['Champion', ds[0] && complete ? { id: ds[0].id, v: ds[0].pts } : null, (x) => `${x.v} points`, complete ? '' : 'Season still running'],
    ['Rookie of the year', rookie, (x) => `${fmtPts(Math.round(x.v))} points`],
    ['Pole king', top(id => st[id].poles), (x) => plural(x.v, 'pole')],
    ['Biggest climber', top(id => gained[id] || 0), (x) => `${x.v} places gained from the grid`],
    ['Mr Consistency', top(ptsFinishes), (x) => `${plural(x.v, 'points finish')}`.replace('finishs', 'finishes')],
    ['Teammate demolisher', top(share), (x) => `${x.v}% of the team’s points`],
    ['Hard luck', top(id => st[id].dnfs), (x) => plural(x.v, 'retirement')],
  ];
  const tl = careerTimeline(c);
  const evs = tl.events.filter(e => e.seasonIdx === s.index);
  const recs = evs.filter(e => e.type === 'record');
  const miles = evs.filter(e => e.type === 'milestones').flatMap(e => e.items.map(x => ({ ...x, r: e.r })));
  const goals = s.goals.map(g => ({ g, e: evalGoal(g, s) }));
  const dp = progression(s, 'driver');
  const verdict = !mate ? '' : h.pts[0] === h.pts[1] ? `You and ${dName(s, mate)} finished level on points.` : `You ${h.pts[0] > h.pts[1] ? 'beat' : 'lost to'} ${dName(s, mate)} by ${plural(Math.abs(h.pts[0] - h.pts[1]), 'point')}, ${h.q[0]}–${h.q[1]} in qualifying and ${h.r[0]}–${h.r[1]} in races.`;
  const delta = prevPos && myPos ? prevPos - myPos : 0;
  return `<div class="page">
    <div class="page-head"><div><h1>${s.year} season review</h1><div class="sub">${complete ? 'Final verdict on the season' : `So far: ${done} of ${rounds.length} rounds logged`}</div></div><div class="row">${seasonPicker(c, s.index)}<button class="btn ghost" data-act="nav" data-view="stats">Career Stats</button></div></div>
    <div class="grid-2">
      ${[['Drivers’ champion', ds[0], true], ['Constructors’ champions', cs[0], false]].map(([lab, x, drv]) => `<div class="panel champ-banner"><div class="panel-b row" style="gap:16px;flex-wrap:nowrap">${drv ? avatar(c, s, x.id, 64) : teamLogo(c, x.team, 64)}
        <div><span class="label">${complete ? lab : lab.replace('champion', 'leader')}</span><div class="hof-name" style="font-size:24px">${esc(drv ? dName(s, x.id) : x.team.name)}</div><span class="muted">${x.pts} points${drv ? ` · ${plural(x.wins, 'win')}` : ` · ${plural(x.wins, 'win')}`}</span></div></div></div>`).join('')}
    </div>
    ${['driver', 'team'].map(k => { const T = titleRetro(c, s, k); if (!T) return ''; const d = T.dec;
      return `<div class="panel ${d.final ? 'decider' : ''}"><div class="panel-h"><div><span class="label">${k === 'team' ? 'Constructors’ championship' : 'Drivers’ championship'}${d.final ? ' · decided at the final race' : ''}</span><h2>How ${esc(T.name)} won it</h2></div>
        <span class="muted" style="font-size:12px">Sealed in ${esc(d.r.name)}${d.final ? (d.contenders.length >= 3 ? ` in a ${numWord(d.contenders.length)}-way showdown` : ' on the final day') : ` with ${plural(d.m.left.length, 'round')} to spare`} · ${plural(d.m.margin, 'point')} clear of ${esc(T.rivalName || '–')}</span></div>
        <div class="panel-b grid-2">${retroSections(c, s, T).map(sec => `<div><h3 style="margin-bottom:8px">${esc(sec.title)}</h3><ul class="ms-list">${sec.items.map(o => `<li>${o.id ? avatar(c, s, o.id, 24) : ''}<span>${esc(o.text)}</span></li>`).join('')}</ul></div>`).join('')}</div></div>`; }).join('')}
    ${(() => { const RV = seasonReview(c, s); return RV ? `<div class="panel review-panel"><div class="panel-h"><div><span class="label">The season in review</span><h2>${esc(RV.headline)}</h2></div></div>
      <div class="panel-b"><p class="standfirst">${esc(RV.standfirst)}</p><div class="body">${RV.intro.map(p => `<p>${esc(p)}</p>`).join('')}</div>${reviewHtml(c, s, RV)}</div></div>` : ''; })()}
    <div class="tiles">
      <div class="tile"><span class="label">Your position</span><span class="v">${myPos ? 'P' + myPos : '–'}<small>${delta ? ` ${delta > 0 ? '▲' : '▼'}${Math.abs(delta)} on ${prev.year}` : ''}</small></span></div>
      <div class="tile"><span class="label">Points</span><span class="v">${me.pts}</span></div>
      <div class="tile"><span class="label">Wins</span><span class="v">${me.wins}</span></div>
      <div class="tile"><span class="label">Podiums</span><span class="v">${me.podiums}</span></div>
      <div class="tile"><span class="label">Poles</span><span class="v">${me.poles}</span></div>
      <div class="tile"><span class="label">Goals met</span><span class="v">${goals.filter(x => x.e.ok).length}<small> / ${goals.length}</small></span></div>
    </div>
    <div class="grid-2">
      <div class="panel"><div class="panel-h"><h2>Best weekends</h2></div><div class="panel-b tight"><table><thead><tr><th>Rnd</th><th>Grand Prix</th><th class="num">Quali</th><th class="num">Race</th><th class="num">Pts</th></tr></thead><tbody>${best.map(wkRow).join('')}</tbody></table></div></div>
      <div class="panel"><div class="panel-h"><h2>Weekends to forget</h2></div><div class="panel-b tight"><table><thead><tr><th>Rnd</th><th>Grand Prix</th><th class="num">Quali</th><th class="num">Race</th><th class="num">Pts</th></tr></thead><tbody>${worst.length ? worst.map(wkRow).join('') : '<tr><td colspan="5"><div class="empty">Not enough races yet.</div></td></tr>'}</tbody></table></div></div>
    </div>
    <div class="grid-2">
      <div class="panel"><div class="panel-h"><h2>Teammate verdict</h2><span class="muted" style="font-size:12px">${esc(team?.name || '')}</span></div><div class="panel-b stack">
        ${mate ? `<p style="margin:0">${esc(verdict)}</p>${miniH2H('Qualifying', h.q[0], h.q[1], s, mate)}${miniH2H('Race', h.r[0], h.r[1], s, mate)}${miniH2H('Points', h.pts[0], h.pts[1], s, mate)}` : '<div class="empty">No teammate this season.</div>'}
      </div></div>
      <div class="panel"><div class="panel-h"><h2>Season goals</h2></div><div class="panel-b">${goals.length ? goals.map(({ g, e }) => `<div class="goal"><div><div style="font-weight:600">${esc(goalTitle(g))}</div><div class="muted" style="font-size:12px">${esc(e.text)}</div></div>
        <div class="row"><span class="status-dot ${e.ok ? 'ok' : 'warn'}"></span><span class="muted" style="font-size:12px">${e.ok ? 'Achieved' : complete ? 'Missed' : 'Not yet'}</span></div></div>`).join('') : '<div class="empty">No goals were set.</div>'}</div></div>
    </div>
    <div class="panel"><div class="panel-h"><h2>Awards</h2></div><div class="panel-b"><div class="award-grid">${awards.map(([lab, x, fmt, note]) => `<div class="award"><span class="label">${lab}</span>
      ${x ? `<div class="row" style="gap:10px;flex-wrap:nowrap">${avatar(c, s, x.id, 40)}<div style="min-width:0"><b>${esc(dName(s, x.id))}</b><div class="muted" style="font-size:12px">${esc(fmt(x))}</div></div></div>` : `<span class="muted">${esc(note || 'Nobody qualifies')}</span>`}</div>`).join('')}
      <div class="award"><span class="label">Team of the year</span><div class="row" style="gap:10px;flex-wrap:nowrap">${teamLogo(c, cs[0].team, 40)}<div><b>${esc(cs[0].team.name)}</b><div class="muted" style="font-size:12px">${cs[0].pts} points</div></div></div></div>
    </div></div></div>
    <div class="panel"><div class="panel-h"><h2>Championship story</h2></div><div class="panel-b">${lineChart(driverSeries(s, dp, 'pts', 5), dp.labels, { names: dp.names })}</div></div>
    <div class="grid-2">
      <div class="panel"><div class="panel-h"><h2>Records</h2><button class="btn sm ghost" data-act="nav" data-view="records">Record book</button></div>
        ${recs.length ? `<div class="panel-b"><ul class="ms-list">${recs.map(e => `<li>${e.team ? teamLogo(c, e.team, 26) : avatar(c, s, e.id, 26)}<span><b>${esc(listJoin(recNames(tl, e)))}</b> ${e.co ? 'share' : e.kind === 'broken' ? 'broke' : 'equalled'} the record for the ${esc(tl.recs[e.rid].label)} <span class="muted">· ${esc(e.r.name)}</span></span></li>`).join('')}</ul></div>` : '<div class="empty">No records broken this season.</div>'}</div>
      <div class="panel"><div class="panel-h"><h2>Milestones</h2><span class="muted">${miles.length}</span></div>
        ${miles.length ? `<div class="panel-b"><ul class="ms-list">${miles.slice(0, 14).map(x => `<li>${avatar(c, s, x.id, 26)}<span>${esc(x.text)} <span class="muted">· ${esc(x.r.name)}</span></span></li>`).join('')}</ul>${miles.length > 14 ? `<p class="muted" style="font-size:12px;margin-top:8px">${miles.length - 14} more in Stories.</p>` : ''}</div>` : '<div class="empty">No milestones this season.</div>'}</div>
    </div>
  </div>`;
}

/* ---------------------------------------------------------------- drivers */
const refName = (id) => D.DRIVERS[id]?.name || D.HIST_DRIVERS[id] || id;
const fmtPts = (v) => Number.isInteger(v) ? String(v) : v.toFixed(1);
/** What the green numbers count: everything added in this career, or just this season (a setting). */
const addSeason = () => state.addScope === 'season';
const plus = (n, fmt = String) => n > 0 ? ` <small class="plus" title="${addSeason() ? 'Added this season' : 'Added in this career'}">+${fmt(n)}</small>` : '';
const addScopeSeg = () => `<div class="seg" title="What the green numbers count">${[['career', 'Added in career'], ['season', 'Added this season']].map(([v, l]) => `<button data-act="add-scope" data-v="${v}" class="${(state.addScope || 'career') === v ? 'on' : ''}">${l}</button>`).join('')}</div>`;

/** careerCtx as it stood after `at` rounds of season s: for stories, which only know what had happened by then. */
/**
 * A season's champions so far, drivers' and teams': a title counts the moment nobody can catch the leader, not only
 * once every round is in (wrapping it up with two rounds to go puts it in the Hall of Fame and the career numbers
 * straight away). upto: count only this many rounds. { champ, champT } (ids, or null while it's open).
 */
function decidedChamps(s, done, ds, cs, upto = null) {
  const n = activeRounds(s).length; if (!done) return { champ: null, champT: null };
  if (done >= n) return { champ: ds?.[0]?.id ?? null, champT: cs?.[0]?.team.id ?? null };
  const pick = (kind) => { const m = titleMath(s, kind, upto); return m.decided ? m.rows[0]?.id ?? null : null; };
  return { champ: pick('driver'), champT: pick('team') };
}
const _ctxCache = new WeakMap();
function careerCtxTo(c, s, at = Infinity) {
  let v = _ctxCache.get(c); if (!v || v.gen !== renderGen) { v = { gen: renderGen, m: {} }; _ctxCache.set(c, v); }
  const key = s.index + ':' + at;
  return v.m[key] ||= c.seasons.filter(x => x.index <= s.index).map(x => {
    const n = activeRounds(x).length; const upto = x.index < s.index ? Infinity : at;
    const st = upto >= n ? seasonStatsCache(x) : seasonStats(x, upto); const done = Math.min(roundsDone(x), upto);
    const ds = driverStandings(x, st), cs = constructorStandings(x, st);
    return { s: x, st, ds, cs, done, complete: done > 0 && done === n, ...decidedChamps(x, done, ds, cs, upto >= n ? null : upto) };
  });
}
function careerCtx(c) {
  return c.seasons.map(s => {
    const st = seasonStats(s); const done = roundsDone(s); const ds = driverStandings(s, st), cs = constructorStandings(s, st);
    return { s, st, ds, cs, done, complete: done > 0 && done === activeRounds(s).length, ...decidedChamps(s, done, ds, cs) };
  });
}

/** Real totals before 2016, the real seasons since, plus everything logged in this career. `base` is everything
 *  real (so tot − base is what the career added). */
function driverRecord(c, id, ctx = careerCtx(c)) {
  const bio = id === PLAYER_ID ? null : D.DRIVER_BIO[id] || null;
  const KEYS = ['starts', 'wins', 'podiums', 'poles', 'fls', 'pts'];
  const base = Object.fromEntries(KEYS.map(k => [k, bio?.[k] || 0]));
  const tot = { ...base, titles: [...(bio?.titles || [])], bestChamp: bio?.bestChamp ?? null, bestFinish: bio?.bestFinish ?? null, dnfs: 0 };
  const seasons = []; const cur = c.seasons[c.seasons.length - 1]; const before = { ...base }; // before: everything but this season
  for (const { s, st, ds, complete, champ } of ctx) {
    const o = st[id];
    if (!o || !s.drivers[id]) continue;
    const pos = ds.find(x => x.id === id)?.pos ?? null;
    seasons.push({ s, o, pos, team: teamOf(s, id), complete, title: champ === id });
    for (const k of KEYS) { tot[k] += o[k]; if (isHist(s)) base[k] += o[k]; if (s !== cur) before[k] += o[k]; }
    tot.dnfs += o.dnfs;
    if (o.best != null) tot.bestFinish = tot.bestFinish == null ? o.best : Math.min(tot.bestFinish, o.best);
    if (complete && pos != null) tot.bestChamp = tot.bestChamp == null ? pos : Math.min(tot.bestChamp, pos);
    if (champ === id) { tot.titles.push(s.year); tot.bestChamp = 1; } // a title counts the moment it's won
  }
  // from: what the green numbers count from (the real totals before the career, or everything before this season)
  return { bio, base, tot, seasons, from: addSeason() ? before : base };
}

function renderDrivers() {
  const c = career(); const s = latestSeason();
  const ctx = careerCtx(c);
  const known = allKnownDrivers(c, s);
  const grid = gridIds(s);
  const scope = ui.drv.scope;
  const ids = scope === 'grid' ? grid : [...new Set([...grid, ...c.seasons.flatMap(gridIds), ...Object.keys(D.DRIVER_BIO)])].filter(id => known[id]);
  const name = (id) => id === PLAYER_ID ? `${c.profile.first} ${c.profile.last}` : known[id]?.name || id;
  const rows = ids.map(id => ({ id, ...driverRecord(c, id, ctx) }));
  const k = ui.drv.sort;
  const val = (r) => k === 'titles' ? r.tot.titles.length : k === 'winPct' ? (r.tot.starts ? r.tot.wins / r.tot.starts : -1) : r.tot[k];
  rows.sort((a, b) => k === 'name' ? name(a.id).localeCompare(name(b.id)) : (val(b) - val(a)) || name(a.id).localeCompare(name(b.id)));
  return `<div class="page">
    <div class="page-head"><div><h1>Drivers</h1><div class="sub">Real F1 career totals, plus every race logged in your career (in green: added in the career, or this season).</div></div>
      <div class="row">${addScopeSeg()}${sortSel('drv-sort-sel', k, [['wins', 'Wins'], ['titles', 'Titles'], ['podiums', 'Podiums'], ['poles', 'Poles'], ['starts', 'Starts'], ['pts', 'Points'], ['fls', 'Fastest laps'], ['winPct', 'Win %'], ['name', 'Name']])}<div class="seg">${[['grid', `${s.year} grid`], ['all', 'All drivers']].map(([v, l]) => `<button data-act="drv-scope" data-v="${v}" class="${scope === v ? 'on' : ''}">${l}</button>`).join('')}</div></div></div>
    <div class="cards">${rows.map(r => driverCard(c, s, r, name(r.id), known[r.id])).join('')}</div>
  </div>`;
}
const sortSel = (ch, v, opts) => `<label class="row muted" style="gap:6px;font-size:13px">Sort <select data-ch="${ch}" style="width:auto">${opts.map(([k, l]) => `<option value="${k}" ${v === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`;
/** A driver as a card: team colour, photo, number, flag and the career totals. */
function driverCard(c, s, r, nm, entry) {
  const t = teamOf(s, r.id); const col = t?.color || '#5E6A82';
  const add = (key, fmt) => plus(r.tot[key] - r.from[key], fmt);
  const nat = r.id === PLAYER_ID ? c.profile.nationality : r.bio?.nat;
  const stat = (label, v, extra = '') => `<div><span class="label">${label}</span><b>${v}</b>${extra}</div>`;
  return `<button class="dcard ${r.id === PLAYER ? 'me' : ''}" style="--c:${col}" data-act="open-driver" data-id="${r.id}">
    <span class="dcard-num">${esc(entry?.number ?? '')}</span>
    <div class="dcard-top">${avatar(c, s, r.id, 58)}<div class="dcard-who"><span class="ab">${natFlag(nat, 12)} ${esc(entry?.abbr || r.id)}</span><b>${esc(nm)}</b><small>${t ? esc(t.name) : r.bio?.feeder ? esc(r.bio.feeder) : 'Not on the grid'}${ageNow(c, r.id) != null ? ` · ${ageNow(c, r.id)}` : ''}</small></div>${r.bio?.fictional ? '<span class="tag">Fictional</span>' : ''}</div>
    <div class="dcard-stats">${stat('Titles', r.tot.titles.length || '–')}${stat('Wins', r.tot.wins, add('wins'))}${stat('Podiums', r.tot.podiums, add('podiums'))}${stat('Poles', r.tot.poles, add('poles'))}${stat('Starts', r.tot.starts, add('starts'))}${stat('Points', fmtPts(r.tot.pts), add('pts', fmtPts))}</div>
  </button>`;
}

function renderDriver() {
  const c = career(); const s = latestSeason();
  const id = ui.driverId;
  const known = allKnownDrivers(c, s);
  const d = s.drivers[id] || known[id];
  if (!d) { ui.view = 'drivers'; return renderDrivers(); }
  const { bio, base, tot, seasons, from } = driverRecord(c, id);
  const isMe = id === PLAYER; // the driver the pages follow
  const isYou = id === PLAYER_ID; // the driver you created
  const team = teamOf(s, id);
  const col = team?.color || '#5E6A82';
  const name = isYou ? `${c.profile.first} ${c.profile.last}` : d.name;
  const nat = isYou ? c.profile.nationality : bio?.nat;
  const born = bornOf(c, id);
  const age = ageNow(c, id);
  const editableDob = isYou || c.customDrivers?.some(x => x.id === id);
  const add = (k) => tot[k] - from[k];
  const inCareer = c.seasons.some(x => gridIds(x).includes(id));
  const titles = tot.titles;
  const me = seasons.find(x => x.s === s)?.o;
  const recent = me ? activeRounds(s).map((r, i) => ({ r, i, br: me.byRound[r.id] })).filter(x => x.br && (x.br.r != null || x.br.q != null)) : [];
  const resCell = (v) => v == null ? '–' : typeof v === 'number' ? 'P' + v : `<span class="tag dnf">${v}</span>`;
  const firstWin = bio?.firstWin || (() => {
    for (const { s: se, o } of seasons) { const r = activeRounds(se).find(x => o.byRound[x.id]?.r === 1); if (r) return `${se.year} ${r.name} GP${isHist(se) ? '' : ' (career)'}`; }
    return null;
  })();

  return `<div class="page">
    <div class="row"><button class="btn sm ghost" data-act="nav" data-view="drivers">${ICON.left} All drivers</button></div>
    <section class="hero" style="--team:${col}">
      <div class="stripes"></div>${carPhoto(c, team?.id) ? `<img class="hero-car" src="${esc(carPhoto(c, team.id))}" alt="">` : ''}
      <div class="hero-pic">${avatar(c, s, id, 104)}<div class="big-num">${esc(d.number || '–')}</div></div>
      <div style="position:relative;z-index:1;min-width:0">
        <span class="label">${team ? `<button data-act="open-team" data-id="${team.id}" class="link-btn">${esc(team.name)}</button> · ${s.year}` : `Not on the ${s.year} grid`}</span>
        <div class="name">${natFlag(nat, 22)} ${esc(name)}${isMe ? ` <span class="tag">${isPrincipal(c) ? 'Your lead driver' : 'You'}</span>` : ''}${bio?.fictional ? ' <span class="tag">Fictional</span>' : ''}</div>
        <div class="meta">${nat ? `<span>${esc(nat)}</span>` : ''}${age != null ? `<span>Age ${age}</span>` : ''}${bio?.debut ? `<span>Debut: ${esc(bio.debut)}</span>` : ''}${isYou ? '' : `<span>Contract: ${esc(contractTxt(c, latestSeason(), id))}</span>`}</div>
      </div>
      <div class="next-card">
        <span class="label">World championships</span>
        <div style="font-family:var(--font-display);font-size:28px;font-weight:600;line-height:1">${titles.length}</div>
        <span class="muted" style="font-size:13px">${titles.length ? titles.join(', ') : tot.bestChamp ? `Best: P${tot.bestChamp} in the championship` : 'No completed seasons yet'}</span>
        <div class="row" style="gap:6px">${inCareer ? `<button class="btn sm" data-act="driver-h2h" data-id="${id}">${isMe ? 'Head to head' : 'Compare with you'}</button>` : ''}${isYou ? '' : `<button class="btn sm" data-act="tr-new" data-driver="${id}">${ICON.swap} Transfer</button>`}${pictureControls('driver', id, !!driverPhoto(c, id))}</div>
        ${bodyControls(c, id, { thumb: false })}
      </div>
    </section>
    ${numberOneToggle(c, id)}

    <div class="row add-scope-row">${addScopeSeg()}</div>
    <div class="tiles">
      <div class="tile"><span class="label">Starts</span><span class="v">${tot.starts}${plus(add('starts'))}</span></div>
      <div class="tile"><span class="label">Wins</span><span class="v">${tot.wins}${plus(add('wins'))}</span></div>
      <div class="tile"><span class="label">Podiums</span><span class="v">${tot.podiums}${plus(add('podiums'))}</span></div>
      <div class="tile"><span class="label">Poles</span><span class="v">${tot.poles}${plus(add('poles'))}</span></div>
      <div class="tile"><span class="label">Fastest laps</span><span class="v" style="color:var(--purple)">${tot.fls}${plus(add('fls'))}</span></div>
      <div class="tile"><span class="label">Points</span><span class="v">${fmtPts(tot.pts)}${plus(add('pts'), fmtPts)}</span></div>
    </div>

    <div class="panel"><div class="panel-h"><h2>Career by season</h2><span class="muted" style="font-size:12px">Green figures are what this driver has added in your career</span></div><div class="panel-b tight table-wrap"><table>
      <thead><tr><th>Season</th><th>Team</th><th class="num">Pos</th><th class="num">Starts</th><th class="num">Pts</th><th class="num">Wins</th><th class="num">Pod</th><th class="num">Poles</th><th class="num">FL</th><th class="num">DNF</th><th class="num">Avg finish</th></tr></thead>
      <tbody>
        ${bio && !bio.fictional && bio.starts ? `<tr><td><b>Before ${HIST_FROM}</b><div class="muted" style="font-size:12px">Real F1</div></td><td class="muted" style="max-width:340px;white-space:normal">${esc(bio.teams || '')}</td><td class="num">${bio.bestChamp ? 'Best P' + bio.bestChamp : '–'}</td>
          <td class="num">${bio.starts}</td><td class="num"><b>${fmtPts(bio.pts)}</b></td><td class="num">${bio.wins}</td><td class="num">${bio.podiums}</td><td class="num">${bio.poles}</td><td class="num">${bio.fls}</td><td class="num muted">–</td><td class="num muted">–</td></tr>` : ''}
        ${seasons.map(x => `<tr class="${x.s === s ? 'me' : ''}"><td><b>${x.s.year}</b>${x.complete ? '' : ' <span class="muted" style="font-size:12px">in progress</span>'}</td>
          <td>${x.team ? `<div class="drv"><span class="chip" style="--c:${x.team.color}"></span>${esc(x.team.name)}</div>` : '<span class="muted">Left the grid</span>'}</td>
          <td class="num">${x.pos && x.o.starts ? `<span class="pos ${x.complete && x.pos <= 3 ? 'p' + x.pos : ''}" style="font-size:14px">P${x.pos}</span>` : '–'}</td>
          <td class="num">${x.o.starts}</td><td class="num"><b>${x.o.pts}</b></td><td class="num">${x.o.wins}</td><td class="num">${x.o.podiums}</td><td class="num">${x.o.poles}</td><td class="num">${x.o.fls}</td><td class="num">${x.o.dnfs}</td><td class="num">${fmtAvg(avg(x.o.finPos))}</td></tr>`).join('')}
        ${!seasons.length && !(bio && bio.starts) ? '<tr><td colspan="11"><div class="empty">No Grand Prix starts yet.</div></td></tr>' : ''}
      </tbody></table></div></div>

    <div class="grid-2">
      <div class="panel"><div class="panel-h"><h2>Profile</h2></div><div class="panel-b">
        <dl class="kv">
          ${editableDob ? `<dt>Date of birth</dt><dd><input type="date" data-ch="dob" data-id="${id}" value="${esc(born || '')}" style="width:auto"> ${born ? '' : '<span class="muted" style="font-size:12px">Needed for age records</span>'}</dd>`
            : born ? `<dt>Born</dt><dd>${esc(fmtDay(parseDay(born), true))}</dd>` : ''}
          ${born ? `<dt>Age</dt><dd>${ageTxt(ageParts(born, careerNow(c)))} <span class="muted" style="font-size:12px">on ${fmtDay(careerNow(c), true)}</span></dd>` : ''}
          ${nat ? `<dt>Nationality</dt><dd>${esc(nat)}</dd>` : ''}
          <dt>F1 debut</dt><dd>${esc(bio?.debut || (seasons[0] ? `${seasons[0].s.year} ${activeRounds(seasons[0].s)[0]?.name || ''} GP` : '–'))}</dd>
          <dt>First win</dt><dd>${esc(firstWin || '–')}</dd>
          <dt>Best finish</dt><dd>${tot.bestFinish ? 'P' + tot.bestFinish : '–'}</dd>
          <dt>Best championship</dt><dd>${tot.bestChamp ? 'P' + tot.bestChamp : '–'}</dd>
          <dt>Win rate</dt><dd>${tot.starts ? (tot.wins / tot.starts * 100).toFixed(1) + '%' : '–'}</dd>
          <dt>Podium rate</dt><dd>${tot.starts ? (tot.podiums / tot.starts * 100).toFixed(1) + '%' : '–'}</dd>
          ${bio?.teams ? `<dt>Teams</dt><dd>${esc(bio.teams)}</dd>` : ''}
          ${isMe && c.profile.bio ? `<dt>Backstory</dt><dd>${esc(c.profile.bio)}</dd>` : bio?.note ? `<dt>Notes</dt><dd>${esc(bio.note)}</dd>` : ''}
        </dl>
      </div></div>
      <div class="panel"><div class="panel-h"><h2>${s.year} results</h2></div><div class="panel-b tight table-wrap"><table>
        <thead><tr><th>Rnd</th><th>Grand Prix</th><th class="num">Quali</th><th class="num">Sprint</th><th class="num">Race</th></tr></thead>
        <tbody>${recent.length ? recent.map(({ r, i, br }) => `<tr data-act="open-round" data-round="${r.id}"><td class="muted num">${i + 1}</td><td>${esc(r.name)}</td><td class="num">${br.q ? 'P' + br.q : '–'}</td><td class="num">${resCell(br.s)}</td><td class="num"><b>${resCell(br.r)}</b>${br.fl ? ' <span class="fl-tag">FL</span>' : ''}</td></tr>`).join('')
          : `<tr><td colspan="5"><div class="empty">No ${s.year} sessions logged${team ? ' yet' : ''}.</div></td></tr>`}</tbody>
      </table></div></div>
    </div>
  </div>`;
}

/* ------------------------------------------------------------------ teams */
/** A team's name and colours: from the newest season it raced in, else the templates. */
function teamMeta(c, id) {
  for (let i = c.seasons.length - 1; i >= 0; i--) { const t = c.seasons[i].teams.find(x => x.id === id); if (t) return t; }
  const t = [...D.GRID_2026, ...D.GRID_2025, ...Object.values(D.EXTRA_2025)].find(x => x.id === id);
  return t ? { ...t, drivers: [] } : { id, name: D.TEAM_BIO[id]?.full || id, color: '#5E6A82', drivers: [] };
}
/** Real record up to the end of 2024 plus every race logged in this career (a renamed team includes its earlier entry). */
function teamRecord(c, id, ctx = careerCtx(c)) {
  const bio = id === MYTEAM ? null : D.TEAM_BIO[id] || null;
  const ids = [id, ...(bio?.lineage || [])];
  const src = bio?.lineage ? D.TEAM_BIO[bio.lineage[0]] : bio;
  const KEYS = ['starts', 'wins', 'poles', 'podiums', 'fls'];
  const base = Object.fromEntries(KEYS.map(k => [k, src?.[k] || 0]));
  const tot = { ...base, pts: 0, conTitles: [...(src?.conTitles || [])], drvTitles: src?.drvTitles || 0, drvYears: [], bestFinish: src?.bestFinish ?? (src?.wins ? 1 : null), bestCon: src?.conTitles?.length ? 1 : null };
  const seasons = []; const cur = c.seasons[c.seasons.length - 1]; const before = { ...base, pts: 0 };
  for (const { s, st, ds, cs, done, complete, champ, champT } of ctx) {
    const t = s.teams.find(x => ids.includes(x.id)); if (!t) continue;
    const row = cs.find(x => x.team.id === t.id);
    const drivers = t.drivers.filter(Boolean);
    const o = { starts: done, wins: 0, poles: 0, podiums: 0, fls: 0, pts: row?.pts || 0, best: null };
    for (const d of drivers) {
      const x = st[d]; if (!x) continue;
      o.wins += x.wins; o.poles += x.poles; o.podiums += x.podiums; o.fls += x.fls;
      if (x.best != null) o.best = o.best == null ? x.best : Math.min(o.best, x.best);
    }
    for (const k of KEYS) { tot[k] += o[k]; if (isHist(s)) base[k] += o[k]; if (s !== cur) before[k] += o[k]; }
    tot.pts += o.pts; if (s !== cur) before.pts += o.pts;
    if (o.best != null) tot.bestFinish = tot.bestFinish == null ? o.best : Math.min(tot.bestFinish, o.best);
    if (complete && row) tot.bestCon = tot.bestCon == null ? row.pos : Math.min(tot.bestCon, row.pos);
    // titles count the moment they're won
    if (champT === t.id) { tot.conTitles.push(s.year); tot.bestCon = 1; }
    if (champ && drivers.includes(champ)) { tot.drvTitles++; tot.drvYears.push(s.year); }
    seasons.push({ s, t, o, pos: row?.pos ?? null, drivers, complete, done });
  }
  const titlesAdded = addSeason() ? tot.drvYears.filter(y => y === cur.year).length : tot.drvYears.length;
  return { bio, src, base, tot, seasons, from: addSeason() ? before : { ...base, pts: 0 }, titlesAdded };
}

function renderTeams() {
  const c = career(); const s = latestSeason();
  const ctx = careerCtx(c);
  const scope = ui.tms.scope;
  const onGrid = s.teams.map(t => t.id);
  const raced = new Set(c.seasons.flatMap(x => x.teams.map(t => t.id)));
  // a renamed team (Audi) only shows once it has raced, so the earlier entry's record isn't listed twice
  const extra = [...new Set([...raced, ...Object.keys(D.TEAM_BIO)])].filter(id => !onGrid.includes(id) && (id !== MYTEAM || c.myTeam) && (raced.has(id) || !D.TEAM_BIO[id]?.lineage));
  const ids = scope === 'grid' ? onGrid : [...onGrid, ...extra];
  const rows = ids.map(id => ({ id, meta: s.teams.find(t => t.id === id) || teamMeta(c, id), ...teamRecord(c, id, ctx) }));
  const k = ui.tms.sort;
  const val = (r) => k === 'conTitles' ? r.tot.conTitles.length * 1000 + r.tot.drvTitles : k === 'drvTitles' ? r.tot.drvTitles : k === 'winPct' ? (r.tot.starts ? r.tot.wins / r.tot.starts : -1) : r.tot[k];
  rows.sort((a, b) => k === 'name' ? a.meta.name.localeCompare(b.meta.name) : (val(b) - val(a)) || b.tot.wins - a.tot.wins || a.meta.name.localeCompare(b.meta.name));
  return `<div class="page">
    <div class="page-head"><div><h1>Teams</h1><div class="sub">Real F1 team records, plus every race logged in your career (in green: added in the career, or this season).</div></div>
      <div class="row">${addScopeSeg()}${sortSel('tm-sort-sel', k, [['conTitles', 'Constructors’ titles'], ['drvTitles', 'Drivers’ titles'], ['wins', 'Wins'], ['poles', 'Poles'], ['podiums', 'Podiums'], ['starts', 'Starts'], ['winPct', 'Win %'], ['name', 'Name']])}<div class="seg">${[['grid', `${s.year} grid`], ['all', 'All teams']].map(([v, l]) => `<button data-act="tm-scope" data-v="${v}" class="${scope === v ? 'on' : ''}">${l}</button>`).join('')}</div></div></div>
    <div class="cards">${rows.map(r => teamCard(c, s, r)).join('')}</div>
  </div>`;
}
/** A team as a card: colours, logo, this season's drivers and the record. */
function teamCard(c, s, r) {
  const t = s.teams.find(x => x.id === r.id);
  const add = (key) => plus(r.tot[key] - r.from[key]);
  const bio = D.TEAM_BIO[r.id];
  const country = (bio?.base || '').split(',').pop().trim();
  const stat = (label, v, extra = '') => `<div><span class="label">${label}</span><b>${v}</b>${extra}</div>`;
  return `<button class="dcard tcard ${r.id === s.playerTeamId ? 'me' : ''}" style="--c:${r.meta.color}" data-act="open-team" data-id="${r.id}">
    <div class="dcard-top">${teamLogo(c, r.meta, 46)}<div class="dcard-who"><span class="ab">${countryFlag(country, 12)} ${esc(bio?.short || r.meta.name.slice(0, 3).toUpperCase())}</span><b>${esc(r.meta.name)}</b><small>${bio?.since ? `Since ${bio.since}` : ''}${bio?.engine ? ` · ${esc(bio.engine)}` : ''}</small></div>${r.src?.fictional ? '<span class="tag">Fictional</span>' : ''}</div>
    <div class="tcard-drivers">${t ? t.drivers.filter(Boolean).map(d => `<span>${avatar(c, s, d, 24)} ${esc(dName(s, d))}</span>`).join('') : '<span class="muted">Not on the grid</span>'}</div>
    <div class="dcard-stats">${stat('Constructors’', r.tot.conTitles.length || '–')}${stat('Drivers’', r.tot.drvTitles || '–')}${stat('Wins', r.tot.wins, add('wins'))}${stat('Poles', r.tot.poles, add('poles'))}${stat('Podiums', r.tot.podiums, add('podiums'))}${stat('Starts', r.tot.starts, add('starts'))}</div>
  </button>`;
}

function renderTeam() {
  const c = career(); const s = latestSeason();
  const id = ui.teamId;
  if (!id) { ui.view = 'teams'; return renderTeams(); }
  const meta = s.teams.find(t => t.id === id) || teamMeta(c, id);
  const isMine = id === MYTEAM && c.myTeam;
  const { src, base, tot, seasons, from, titlesAdded } = teamRecord(c, id);
  const bio = D.TEAM_BIO[id] || {};
  const add = (k) => tot[k] - from[k];
  const onGrid = s.teams.find(t => t.id === id);
  const st = seasonStats(s); const cs = constructorStandings(s, st);
  const cur = cs.find(x => x.team.id === id);
  const lineup = onGrid ? onGrid.drivers.filter(Boolean) : [];
  const col2 = isMine ? c.myTeam.color2 : bio.color2 || meta.color;
  // every driver who has raced for the team in this career
  const alumni = {};
  for (const x of seasons) for (const d of x.drivers) { const o = seasonStatsCache(x.s)[d]; const a = (alumni[d] ||= { id: d, s: x.s, seasons: [], pts: 0, wins: 0, podiums: 0 }); a.seasons.push(x.s.year); a.s = x.s; a.pts += o?.pts || 0; a.wins += o?.wins || 0; a.podiums += o?.podiums || 0; }
  return `<div class="page">
    <div class="row"><button class="btn sm ghost" data-act="nav" data-view="teams">${ICON.left} All teams</button></div>
    <section class="hero" style="--team:${meta.color};--team-2:${col2}">
      <div class="stripes"></div>${carPhoto(c, id) ? `<img class="hero-car" src="${esc(carPhoto(c, id))}" alt="">` : ''}
      ${teamLogo(c, meta, 92)}
      <div style="position:relative;z-index:1;min-width:0">
        <span class="label">${onGrid ? `${s.year} constructors · ${cur && roundsDone(s) ? 'P' + cur.pos : 'season not started'}` : `Not on the ${s.year} grid`}</span>
        <div class="name">${esc(meta.name)}${src?.fictional ? ' <span class="tag">Fictional</span>' : ''}${isMine ? ' <span class="tag">Your team</span>' : ''}</div>
        <div class="meta">${[isMine ? c.myTeam.base : bio.base, (isMine ? c.myTeam.engine : bio.engine) && `${isMine ? c.myTeam.engine : bio.engine} power`, `Team principal: ${isMine ? c.myTeam.principal || `${c.profile.first} ${c.profile.last}` : bio.principal || '–'}`].filter(Boolean).map(x => `<span>${esc(x)}</span>`).join('')}</div>
      </div>
      <div class="next-card">
        <span class="label">Constructors’ championships</span>
        <div style="font-family:var(--font-display);font-size:28px;font-weight:600;line-height:1">${tot.conTitles.length}</div>
        <span class="muted" style="font-size:13px;max-width:260px">${tot.conTitles.length ? esc(tot.conTitles.join(', ')) : tot.bestCon ? `Best: P${tot.bestCon}` : 'No titles yet'}</span>
        <div class="row" style="gap:6px">${isMine ? `<button class="btn sm" data-act="nav" data-view="dashboard">Manage team</button>` : pictureControls('team', id, !!teamLogoUrl(c, id))}${pictureControls('car', id, !!carPhoto(c, id), 'car picture')}${fallbackControls('team', D.TEAM_BIO[id]?.lineage?.[0] || id)}</div>
        <span class="muted" style="font-size:11px;max-width:260px">Default driver: a full body in ${esc(meta.name)} kit, shown for any of its drivers without a picture.</span>
      </div>
    </section>

    <div class="row add-scope-row">${addScopeSeg()}</div>
    <div class="tiles">
      <div class="tile"><span class="label">Starts</span><span class="v">${tot.starts}${plus(add('starts'))}</span></div>
      <div class="tile"><span class="label">Wins</span><span class="v">${tot.wins}${plus(add('wins'))}</span></div>
      <div class="tile"><span class="label">Poles</span><span class="v">${tot.poles}${plus(add('poles'))}</span></div>
      <div class="tile"><span class="label">Podiums</span><span class="v">${tot.podiums}${plus(add('podiums'))}</span></div>
      <div class="tile"><span class="label">Fastest laps</span><span class="v" style="color:var(--purple)">${tot.fls}${plus(add('fls'))}</span></div>
      <div class="tile"><span class="label">Drivers’ titles</span><span class="v">${tot.drvTitles}${plus(titlesAdded)}</span></div>
    </div>

    <div class="panel"><div class="panel-h"><h2>Record by season</h2><span class="muted" style="font-size:12px">Green figures are what the team has added in your career</span></div><div class="panel-b tight table-wrap"><table>
      <thead><tr><th>Season</th><th>Entered as</th><th class="num">Pos</th><th class="num">Starts</th><th class="num">Pts</th><th class="num">Wins</th><th class="num">Pod</th><th class="num">Poles</th><th class="num">FL</th><th>Drivers</th></tr></thead>
      <tbody>
        ${src && !src.fictional && src.starts ? `<tr><td><b>Before ${HIST_FROM}</b><div class="muted" style="font-size:12px">Real F1</div></td><td class="muted" style="max-width:300px;white-space:normal">${esc(src.scope || '')}</td><td class="num">${src.conTitles?.length ? `${src.conTitles.length}× champion` : src.bestFinish ? 'Best finish P' + src.bestFinish : '–'}</td>
          <td class="num">${src.starts}</td><td class="num muted">–</td><td class="num">${src.wins}</td><td class="num">${src.podiums}</td><td class="num">${src.poles}</td><td class="num">${src.fls}</td><td class="muted">–</td></tr>` : ''}
        ${seasons.slice().reverse().map(x => `<tr class="${x.s === s ? 'me' : ''}"><td><b>${x.s.year}</b>${x.complete ? '' : ` <span class="muted" style="font-size:12px">${x.done}/${activeRounds(x.s).length}</span>`}</td>
          <td><div class="drv">${teamLogo(c, x.t, 20)}${esc(x.t.name)}</div></td>
          <td class="num">${x.pos && x.done ? `<span class="pos ${x.complete && x.pos <= 3 ? 'p' + x.pos : ''}" style="font-size:14px">P${x.pos}</span>` : '–'}</td>
          <td class="num">${x.o.starts}</td><td class="num"><b>${x.o.pts}</b></td><td class="num">${x.o.wins}</td><td class="num">${x.o.podiums}</td><td class="num">${x.o.poles}</td><td class="num">${x.o.fls}</td>
          <td><div class="row" style="gap:4px;flex-wrap:nowrap">${x.drivers.map(d => avatar(c, x.s, d, 22)).join('')}<span class="muted" style="font-size:12px">${x.drivers.map(d => esc(dAbbr(x.s, d))).join(' · ')}</span></div></td></tr>`).join('')}
        ${!seasons.length && !(src && src.starts) ? '<tr><td colspan="10"><div class="empty">No races yet.</div></td></tr>' : ''}
      </tbody></table></div></div>

    <div class="grid-2">
      <div class="panel"><div class="panel-h"><h2>Profile</h2></div><div class="panel-b stack">
        ${(isMine ? c.myTeam.story : bio.about) ? `<p style="margin:0">${esc(isMine ? c.myTeam.story : bio.about)}</p>` : ''}
        <dl class="kv">
          <dt>Full name</dt><dd>${esc(isMine ? c.myTeam.name : bio.full || meta.name)}</dd>
          <dt>Base</dt><dd>${esc((isMine ? c.myTeam.base : bio.base) || '–')}</dd>
          <dt>First season</dt><dd>${isMine ? c.myTeam.founded || 2025 : bio.since || '–'}</dd>
          <dt>First win</dt><dd>${esc(src?.firstWin || (() => { for (const x of seasons) for (const r of activeRounds(x.s)) { const w = x.s.weekends[r.id]?.sessions?.R; if (w?.done && x.drivers.includes(w.results.find(y => !OUT.includes(y.st))?.d)) return `${x.s.year} ${r.name} GP (career)`; } return '–'; })())}</dd>
          <dt>Best finish</dt><dd>${tot.bestFinish ? 'P' + tot.bestFinish : '–'}</dd>
          <dt>Win rate</dt><dd>${tot.starts ? (tot.wins / tot.starts * 100).toFixed(1) + '%' : '–'}</dd>
          ${tot.drvYears.length ? `<dt>Career drivers’ titles</dt><dd>${tot.drvYears.join(', ')}</dd>` : ''}
          ${src?.scope ? `<dt>Record covers</dt><dd class="muted">${esc(src.scope)}</dd>` : ''}
        </dl>
      </div></div>
      <div class="panel"><div class="panel-h"><h2>${onGrid ? `${s.year} line-up` : 'Drivers in your career'}</h2></div><div class="panel-b tight table-wrap"><table>
        <thead><tr><th>Driver</th><th>Seasons</th><th class="num">Pts</th><th class="num">Wins</th><th class="num">Pod</th></tr></thead>
        <tbody>${Object.values(alumni).sort((a, b) => (lineup.includes(b.id) - lineup.includes(a.id)) || b.pts - a.pts).map(a => `<tr class="${a.id === PLAYER ? 'me' : ''}" data-act="open-driver" data-id="${a.id}"><td>${drvCell(a.s, a.id)}</td><td class="muted">${a.seasons.join(', ')}</td><td class="num"><b>${a.pts}</b></td><td class="num">${a.wins}</td><td class="num">${a.podiums}</td></tr>`).join('')
          || '<tr><td colspan="5"><div class="empty">No career seasons with this team yet.</div></td></tr>'}</tbody>
      </table></div></div>
    </div>
  </div>`;
}
// seasonStats is pure; cache it per render so team and story pages that revisit a season stay quick
const _statsCache = new WeakMap();
function seasonStatsCache(s) { let v = _statsCache.get(s); if (!v || v.gen !== renderGen) { v = { gen: renderGen, st: seasonStats(s) }; _statsCache.set(s, v); } return v.st; }
let renderGen = 0;

/* --------------------------------------------------------------- circuits */
/** Every edition of a circuit, newest first: career seasons, then the real pre-2025 history. */
function trackEditions(c, tid) {
  const out = [];
  // `career`: the edition comes from a season in this career (real or yours); `played`: one you raced
  for (const s of c.seasons) for (const r of activeRounds(s).filter(x => trackOf(x) === tid)) {
    const w = s.weekends[r.id];
    const R = w?.sessions?.R;
    if (!R?.done) continue;
    const fin = R.results.filter(x => !OUT.includes(x.st)).map(x => x.d);
    const Q = w.sessions.Q;
    const fl = fastestOf(R);
    out.push({ career: true, played: !isHist(s), s, r, year: s.year, gp: r.id !== tid ? r.name : null, pole: Q?.done ? Q.pole ?? Q.results.find(x => !OUT.includes(x.st))?.d : null, podium: fin.slice(0, 3), fl, flLap: R.results.find(x => x.d === fl)?.lap || '' });
  }
  out.reverse();
  for (const [year, pole, p1, p2, p3, team] of D.TRACKS[tid]?.history || []) out.push({ career: false, year, pole, podium: [p1, p2, p3], team });
  return out;
}
function gpName(s, tid) {
  const own = s.calendar.find(x => x.id === tid);
  if (own) return own.name;
  // off this calendar: take the name from a template, unless another round already uses it (Madrid vs Barcelona)
  const name = [...D.CAL_2026, ...D.CAL_2025].find(([id]) => id === tid)?.[1] || Object.values(H.seasons).flatMap(h => h.rounds).find(r => r.id === tid)?.name;
  return name && !s.calendar.some(x => x.name === name) ? name : D.TRACKS[tid]?.city || tid;
}
/* Flags and circuit outlines (src/assets.js). Flags go in as images so their SVG ids never clash on a page. */
const A = window.F1ASSETS;
function flagHtml(code, h = 14) {
  const svg = code && A.flags[code];
  return svg ? `<img class="flag" alt="" src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}" style="height:${h}px;width:${Math.round(h * 4 / 3)}px">` : '';
}
const natFlag = (nat, h) => flagHtml(A.nat[nat], h);
const countryFlag = (country, h) => flagHtml(A.country[country], h);
function trackMap(tid, size = 120) {
  const d = A.maps[tid];
  return d ? `<svg class="track-map" viewBox="0 0 100 100" width="${size}" height="${size}" aria-hidden="true"><path d="${d}"/></svg>` : '';
}
const edAbbr = (e, id) => e.career ? dAbbr(e.s, id) : id;
const edName = (e, id) => e.career ? dName(e.s, id) : refName(id);
function edDriver(e, id, chip = false) {
  if (!id) return '<span class="muted">–</span>';
  if (e.career) return drvCell(e.s, id);
  return `<div class="drv">${chip ? `<span class="chip" style="--c:${D.HIST_TEAM_COLORS[e.team] || '#5E6A82'}"></span>` : ''}<span class="ab">${esc(id)}</span><span class="nm">${esc(refName(id))}</span></div>`;
}

/** Your results at each circuit, and where your team ranked among the teams there (by its best car). */
function circuitForm(c) {
  const by = {};
  const rankOf = (sd, s, tid) => {
    const best = {};
    sd.results.forEach((x, k) => { const t = teamOf(s, x.d)?.id; if (t && !(t in best) && !OUT.includes(x.st)) best[t] = k + 1; });
    if (!(tid in best)) return null;
    return Object.values(best).filter(v => v < best[tid]).length + 1;
  };
  for (const s of c.seasons) {
    const st = seasonStatsCache(s); const tid = teamOf(s, PLAYER)?.id;
    for (const r of activeRounds(s)) {
      const ses = s.weekends[r.id]?.sessions; if (!ses?.R?.done) continue;
      const br = st[PLAYER]?.byRound[r.id]; if (!br) continue;
      const o = (by[trackOf(r)] ||= { id: trackOf(r), name: gpName(s, trackOf(r)), visits: [], fin: [], grid: [], best: null, wins: 0, pods: 0, pts: 0, teamQ: [], teamR: [] });
      const pts = ['SPR', 'R'].reduce((a, k) => { const sd = ses[k]; if (!sd?.done) return a; const ix = sd.results.findIndex(x => x.d === PLAYER); return a + (ix >= 0 ? pointsFor(k, ix + 1, sd.results[ix].st, sd.results[ix].pts) : 0); }, 0);
      const tq = ses.Q?.done ? rankOf(ses.Q, s, tid) : null; const tr = rankOf(ses.R, s, tid);
      o.visits.push({ s, br, pts, tq, tr, team: teamOf(s, PLAYER) });
      o.pts += pts;
      if (br.q) o.grid.push(br.q);
      if (typeof br.r === 'number') { o.fin.push(br.r); o.best = o.best == null ? br.r : Math.min(o.best, br.r); if (br.r === 1) o.wins++; if (br.r <= 3) o.pods++; }
      if (tq) o.teamQ.push(tq); if (tr) o.teamR.push(tr);
    }
  }
  return Object.values(by);
}

function renderTracks() {
  const c = career(); const s = latestSeason();
  const form = circuitForm(c).sort((a, b) => (avg(a.fin) ?? 99) - (avg(b.fin) ?? 99));
  const withFin = form.filter(x => x.fin.length);
  const strong = withFin[0];
  const weak = withFin.length > 1 && avg(withFin[withFin.length - 1].fin) > avg(strong.fin) ? withFin[withFin.length - 1] : null;
  const fastest = form.filter(x => x.teamQ.length).sort((a, b) => avg(a.teamQ) - avg(b.teamQ))[0];
  const formHtml = form.length ? `<div class="panel"><div class="panel-h"><div><h2>Your circuit form</h2><span class="muted" style="font-size:12px">Sorted by average finish. Team pace ranks your team among all teams by its best car in qualifying and the race.</span></div></div>
    <div class="tiles" style="border-radius:0;border-left:0;border-right:0">
      <div class="tile"><span class="label">Strongest circuit</span><span class="v" style="font-size:20px">${strong ? esc(strong.name) : '–'}</span><span class="muted" style="font-size:12px">${strong ? `avg finish P${fmtAvg(avg(strong.fin))}` : ''}</span></div>
      <div class="tile"><span class="label">Toughest circuit</span><span class="v" style="font-size:20px">${weak ? esc(weak.name) : '–'}</span><span class="muted" style="font-size:12px">${weak ? `avg finish P${fmtAvg(avg(weak.fin))}` : ''}</span></div>
      <div class="tile"><span class="label">Team quickest at</span><span class="v" style="font-size:20px">${fastest ? esc(fastest.name) : '–'}</span><span class="muted" style="font-size:12px">${fastest ? `team ranked ${fmtAvg(avg(fastest.teamQ))} on average in qualifying` : ''}</span></div>
      <div class="tile"><span class="label">Circuits raced</span><span class="v">${form.length}</span></div>
      <div class="tile"><span class="label">Wins</span><span class="v">${form.reduce((a, x) => a + x.wins, 0)}</span></div>
      <div class="tile"><span class="label">Podiums</span><span class="v">${form.reduce((a, x) => a + x.pods, 0)}</span></div>
    </div>
    <div class="panel-b tight table-wrap"><table>
      <thead><tr><th>Circuit</th><th class="num">Visits</th><th class="num">Avg grid</th><th class="num">Avg finish</th><th class="num">Best</th><th class="num">Wins</th><th class="num">Podiums</th><th class="num">Pts / visit</th></tr></thead>
      <tbody>${form.map(x => `<tr data-act="open-track" data-track="${x.id}" class="${x === strong ? 'me' : ''}"><td><b>${esc(x.name)}</b>${x === weak ? ' <span class="tag dnf">Toughest</span>' : x === strong ? ' <span class="tag done">Strongest</span>' : ''}</td><td class="num">${x.visits.length}</td>
        <td class="num">${fmtAvg(avg(x.grid))}</td><td class="num"><b>${fmtAvg(avg(x.fin))}</b></td><td class="num">${x.best ? 'P' + x.best : '–'}</td><td class="num">${x.wins}</td><td class="num">${x.pods}</td><td class="num">${(x.pts / x.visits.length).toFixed(1)}</td></tr>`).join('')}</tbody>
    </table></div></div>` : '';
  const rounds = activeRounds(s);
  const onCal = new Set(rounds.map(trackOf));
  const others = Object.keys(D.TRACKS).filter(id => !onCal.has(id) && !D.TRACKS[id].former);
  const former = Object.keys(D.TRACKS).filter(id => !onCal.has(id) && D.TRACKS[id].former);
  const card = (id, title, label, sprint) => {
    const t = D.TRACKS[id];
    const last = trackEditions(c, id)[0];
    const w = last?.podium[0];
    return `<button class="round track-card" data-act="open-track" data-track="${id}">
      <div class="row" style="justify-content:space-between"><span class="rn">${label}</span>${sprint ? '<span class="tag sprint">Sprint</span>' : ''}</div>
      <div class="row" style="gap:10px;align-items:center">${trackMap(id, 54)}<div><div class="gp">${countryFlag(t.country, 13)} ${esc(title)}</div><div class="muted" style="font-size:12px">${esc(t.circuit)}</div></div></div>
      <div class="res"><span><b>${t.km.toFixed(3)}</b> km</span><span><b>${t.laps}</b> laps</span><span>${w ? `Last winner <b>${esc(edAbbr(last, w))}</b> ${last.year}` : t.provisional ? 'New circuit' : ''}</span></div>
    </button>`;
  };
  return `<div class="page">
    <div class="page-head"><div><h1>Circuits</h1><div class="sub">Track guides and recent results. Every race you log is added to the circuit's history.</div></div></div>
    <div class="rounds">${rounds.filter(r => D.TRACKS[trackOf(r)]).map(r => card(trackOf(r), r.name, `Round ${rounds.indexOf(r) + 1} · ${fmtDay(roundDate(s, r))}`, r.sprint)).join('')}</div>
    ${formHtml}
    ${others.length ? `<h2 style="margin-top:8px">Not on the ${s.year} calendar</h2><div class="rounds">${others.map(id => card(id, gpName(s, id), 'Off calendar', false)).join('')}</div>` : ''}
    ${former.length ? `<h2 style="margin-top:8px">Former circuits</h2><p class="muted" style="margin:0">Raced since 2016 but off the calendar now. Add any of them back to a season's calendar in Settings.</p><div class="rounds">${former.map(id => card(id, gpName(s, id), 'Former circuit', false)).join('')}</div>` : ''}
  </div>`;
}

function renderTrack() {
  const c = career(); const s = latestSeason();
  const tid = ui.trackId; const t = D.TRACKS[tid];
  if (!t) { ui.view = 'tracks'; return renderTracks(); }
  const rounds = activeRounds(s);
  const ri = rounds.findIndex(x => trackOf(x) === tid);
  const r = rounds[ri];
  const eds = trackEditions(c, tid);
  const shown = ui.trackAll ? eds : eds.slice(0, 5);
  const title = gpName(s, tid);

  // lap record: real one unless a race you logged went quicker
  const realMs = t.record ? parseLap(t.record[0]) : null;
  let rec = t.record ? { lap: t.record[0], who: t.record[1], year: t.record[2], career: false } : null;
  for (const e of eds) {
    const ms = e.played ? parseLap(e.flLap) : null;
    if (ms != null && (rec == null || ms < (rec.career ? parseLap(rec.lap) : realMs))) rec = { lap: fmtLap(ms), who: dName(e.s, e.fl), year: e.year, career: true };
  }

  // winners across the editions shown
  const tally = {};
  for (const e of shown) { const w = e.podium[0]; if (w) (tally[edName(e, w)] ||= { n: 0, me: w === PLAYER && e.played }).n++; }
  const top = Object.entries(tally).sort((a, b) => b[1].n - a[1].n);

  // your own history here
  const mine = [];
  for (const se of c.seasons) {
    const rr = activeRounds(se).find(x => trackOf(x) === tid);
    if (!rr) continue;
    const br = seasonStats(se)[PLAYER]?.byRound[rr.id];
    if (br && (br.q != null || br.r != null)) mine.push({ se, rr, br, team: se.teams.find(x => x.id === se.playerTeamId) });
  }
  const resCell = (v) => v == null ? '–' : typeof v === 'number' ? 'P' + v : `<span class="tag dnf">${v}</span>`;
  const bestR = Math.min(...mine.map(m => typeof m.br.r === 'number' ? m.br.r : 99));
  const bestQ = Math.min(...mine.map(m => m.br.q || 99));

  return `<div class="page">
    <div class="row"><button class="btn sm ghost" data-act="nav" data-view="tracks">${ICON.left} All circuits</button></div>
    <div class="page-head">
      <div><span class="label">${r ? `${s.year} · Round ${ri + 1} of ${rounds.length} · ${weekendTxt(s, r)}` : `Not on the ${s.year} calendar`}${r?.sprint ? ' · Sprint weekend' : ''}</span>
        <h1>${countryFlag(t.country, 22)} ${esc(title)} Grand Prix</h1><div class="sub">${esc(t.circuit)} · ${esc(t.city)}, ${esc(t.country)}${t.former ? ' · Former circuit' : ''}</div></div>
      ${r ? `<button class="btn primary" data-act="open-round" data-round="${r.id}">Open weekend</button>` : ''}
    </div>
    ${t.provisional ? '<div class="callout">New circuit for 2026. Figures are provisional and there is no race history yet: your career will write it.</div>' : ''}

    <div class="tiles">
      <div class="tile"><span class="label">Lap length</span><span class="v">${t.km.toFixed(3)}<small> km</small></span></div>
      <div class="tile"><span class="label">Laps</span><span class="v">${t.laps}</span></div>
      <div class="tile"><span class="label">Race distance</span><span class="v">${(t.km * t.laps).toFixed(1)}<small> km</small></span></div>
      <div class="tile"><span class="label">Corners</span><span class="v">${t.corners}</span></div>
      <div class="tile"><span class="label">First Grand Prix</span><span class="v">${t.firstGP}</span></div>
      <div class="tile"><span class="label">Lap record</span><span class="v" style="color:var(--purple);font-size:24px">${rec ? esc(rec.lap) : '–'}</span><span class="muted" style="font-size:12px">${rec ? `${esc(rec.who)} · ${rec.year}${rec.career ? ' · your career' : ''}` : 'Not set yet'}</span></div>
    </div>

    <div class="panel"><div class="panel-h"><h2>${ui.trackAll ? 'All results' : 'Last 5 races'}</h2>
      ${eds.length > 5 ? `<button class="btn sm ghost" data-act="track-all">${ui.trackAll ? 'Show last 5' : `Show all ${eds.length}`}</button>` : ''}</div>
      <div class="panel-b tight table-wrap"><table>
        <thead><tr><th>Year</th><th>Winner</th><th>2nd</th><th>3rd</th><th>Pole</th><th>Fastest lap</th></tr></thead>
        <tbody>${shown.length ? shown.map(e => `<tr class="${e.played && e.podium.includes(PLAYER) ? 'me' : ''}">
          <td><b>${e.year}</b>${e.gp ? ` <span class="muted">${esc(e.gp)}</span>` : ''}${e.played ? ' <span class="tag done">Career</span>' : ''}</td>
          <td>${edDriver(e, e.podium[0], true)}</td><td>${edDriver(e, e.podium[1])}</td><td>${edDriver(e, e.podium[2])}</td>
          <td>${edDriver(e, e.pole)}</td>
          <td>${e.career && e.fl ? `<span class="ab">${esc(dAbbr(e.s, e.fl))}</span> <span class="mono fl">${esc(e.flLap)}</span>` : '<span class="muted">–</span>'}</td>
        </tr>`).join('') : '<tr><td colspan="6"><div class="empty">No races here yet. Log the race in your career to start the history.</div></td></tr>'}</tbody>
      </table></div></div>

    <div class="grid-2">
      <div class="panel"><div class="panel-h"><h2>Your record here</h2></div>
        ${mine.length ? `<div class="panel-b"><dl class="kv"><dt>Best qualifying</dt><dd>${bestQ < 99 ? 'P' + bestQ : '–'}</dd><dt>Best finish</dt><dd>${bestR < 99 ? 'P' + bestR : '–'}</dd><dt>Visits</dt><dd>${mine.length}</dd></dl></div>
          <div class="panel-b tight table-wrap"><table><thead><tr><th>Year</th><th>Team</th><th class="num">Quali</th><th class="num">Sprint</th><th class="num">Race</th></tr></thead><tbody>
          ${mine.map(m => `<tr><td><b>${m.se.year}</b></td><td><div class="drv"><span class="chip" style="--c:${m.team?.color}"></span>${esc(m.team?.name || '')}</div></td><td class="num">${m.br.q ? 'P' + m.br.q : '–'}</td><td class="num">${resCell(m.br.s)}</td><td class="num"><b>${resCell(m.br.r)}</b>${m.br.fl ? ' <span class="fl-tag">FL</span>' : ''}</td></tr>`).join('')}
          </tbody></table></div>`
        : '<div class="empty">You have not raced here yet.</div>'}
      </div>
      <div class="panel"><div class="panel-h"><h2>Circuit guide</h2></div><div class="panel-b stack">
        ${A.maps[tid] ? `<div class="track-map-big">${trackMap(tid, 260)}</div>` : ''}
        <p style="margin:0">${esc(t.about)}</p>
        <dl class="kv">
          <dt>Location</dt><dd>${esc(t.city)}, ${esc(t.country)}</dd>
          ${t.record ? `<dt>Real lap record</dt><dd><span class="mono">${esc(t.record[0])}</span> · ${esc(t.record[1])} (${t.record[2]})</dd>` : ''}
          ${top.length ? `<dt>Most wins</dt><dd>${top.slice(0, 3).map(([n, v]) => `${v.me ? '<b>' : ''}${esc(n)}${v.me ? '</b>' : ''} (${v.n})`).join(', ')} <span class="muted">in the ${shown.length} race${shown.length > 1 ? 's' : ''} shown</span></dd>` : ''}
        </dl>
      </div></div>
    </div>
  </div>`;
}
