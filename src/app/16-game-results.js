/* Pitwall — Logging finished sessions from the game, and shared charts. Part of the renderer, split into files that load in order (see index.html). */
'use strict';
/** A finished session arrives from the game. */
function handleGameResult(r) {
  const c = career(); const done = () => window.api?.telemetry?.ack(r.key);
  if (!c || NOT_CAREER_MODES.includes(r.gameMode) || !r.cars?.length) { done(); return; }
  if ((c.gameKeys || []).includes(r.key)) { done(); return; } // already logged
  if (r.kind === 'grid') { applyGameGrid(c, r); done(); return; }
  const place = placeGameResult(c, r);
  if (place.error) { if (place.skip) { toast(place.error); done(); return; } gameQueue.push({ r, place, why: 'place' }); done(); nextGameDecision(); return; }
  const sd = place.s.weekends[place.round.id]?.sessions?.[place.key];
  const sameWeekend = place.s.weekends[place.round.id]?.game?.weekend === r.weekendLink && sd?.game;
  if (sd?.done && !sameWeekend && !sd.estimated) { gameQueue.push({ r, place, why: 'replace' }); done(); nextGameDecision(); return; }
  applyGameResult(c, r, place); done();
}
/** Ask about the next waiting result, once no other dialog is open. */
function nextGameDecision() {
  if (!gameQueue.length) return;
  if ($('#modal-root').innerHTML) { setTimeout(nextGameDecision, 3000); return; }
  const q = gameQueue[0]; const c = career(); const s = latestSeason();
  const what = `${D.TRACKS[GAME_TRACKS[q.r.track]]?.circuit || 'Unknown circuit'} · ${GAME_SESSION_NAMES[q.r.sessionType] || 'Session'}`;
  ui.modal = { kind: 'game' };
  if (q.why === 'replace') modal(`<div class="modal-h"><h2>Results from F1 25</h2></div><div class="modal-b"><p><b>${esc(what)}</b> has finished in the game, but you have already logged ${esc(q.place.round.name)} ${esc(SESSION_LABEL[q.place.key])}.</p><p class="muted">Replace your logged results with the game’s?</p></div>
    <div class="modal-f"><button class="btn ghost" data-act="game-skip">Keep mine</button><button class="btn primary" data-act="game-apply">Replace</button></div>`);
  else {
    const rounds = activeRounds(s);
    modal(`<div class="modal-h"><h2>Results from F1 25</h2></div><div class="modal-b"><p><b>${esc(what)}</b> has finished in the game. ${esc(q.place.error)}</p>
      <div class="form-grid"><label class="field"><span>Round</span><select id="game-round">${rounds.map(x => `<option value="${x.id}">${esc(x.name)}${s.weekends[x.id]?.sessions?.R?.done ? ' (logged)' : ''}</option>`).join('')}</select></label>
      <label class="field"><span>Session</span><select id="game-key">${['FP1', 'FP2', 'FP3', 'FP', 'SQ', 'SPR', 'Q', 'R'].map(k => `<option value="${k}" ${k === (q.r.sessionType >= 15 ? 'R' : q.r.sessionType >= 10 ? 'SQ' : q.r.sessionType >= 5 ? 'Q' : 'FP1') ? 'selected' : ''}>${SESSION_LABEL[k]}</option>`).join('')}</select></label></div></div>
      <div class="modal-f"><button class="btn ghost" data-act="game-skip">Skip</button><button class="btn primary" data-act="game-apply">Log it here</button></div>`);
  }
}
/** The banner after an import: where it went, who couldn't be matched, and undo. */
function gameNoticeHtml() {
  const g = gameNotice; const c = career(); if (!g || g.careerId !== c?.id) return '';
  return `<div class="callout game-notice"><span>${ICON.flag} <b>${esc(g.label)}</b> logged from F1 25.${g.note ? ' ' + esc(g.note) : ''}${g.unmatched.length ? ` Not matched to a driver on your grid: ${esc(listJoin(g.unmatched))}.` : ''}</span>
    <span class="row" style="gap:6px"><button class="btn sm" data-act="game-open">Open</button><button class="btn sm ghost" data-act="game-undo">Undo</button><button class="icon-btn" title="Dismiss" data-act="game-dismiss">${ICON.x}</button></span></div>`;
}
/** Settings: the connection to the game. */
function renderTelemetryPanel() {
  if (!window.api?.telemetry) return window.api?.companion === true ? '' : `<div class="panel"><div class="panel-h"><h2>F1 25 telemetry</h2></div><div class="panel-b muted">Available in the desktop app.</div></div>`;
  const t = telemetryStatus || {};
  const ago = t.lastAt ? Math.round((Date.now() - Date.parse(t.lastAt)) / 1000) : null;
  const live = t.listening && ago != null && ago < 10;
  return `<div class="panel"><div class="panel-h"><div><h2>F1 25 telemetry</h2><span class="muted" style="font-size:12px">Logs results straight from the game when a session ends</span></div>
      <span class="row" style="gap:6px"><span class="status-dot ${live ? 'ok' : t.listening ? 'warn' : ''}"></span><span class="muted" style="font-size:12px">${t.error ? 'Problem' : live ? `Receiving F1 25 data (${t.format === 2026 ? '2026 Season Pack' : 'F1 25'})` : t.listening ? (t.lastAt ? `Last data ${ago < 120 ? ago + ' s' : Math.round(ago / 60) + ' min'} ago` : 'Listening, nothing received yet') : 'Off'}</span></span></div>
    <div class="panel-b stack">
      ${t.error ? `<div class="callout" style="border-left-color:var(--red)">${esc(t.error)}</div>` : ''}
      <div class="row" style="gap:12px;flex-wrap:wrap"><label class="check"><input type="checkbox" id="tm-on" ${t.enabled ? 'checked' : ''}> Listen for F1 25</label>
        <label class="row" style="gap:6px">Port <input type="number" id="tm-port" min="1024" max="65535" value="${t.port || 20778}" style="width:100px"></label>
        <button class="btn sm primary" data-act="tm-save">Save</button></div>
      <div class="muted" style="font-size:13px;line-height:1.5">In F1 25: <b>Settings → Telemetry Settings</b>: UDP Telemetry <b>On</b>, UDP Broadcast Mode <b>Off</b>, UDP Format <b>2025</b>, Send Rate 20 Hz or more.
        Then either send it straight here (UDP IP Address <b>127.0.0.1</b> if the game runs on this PC, otherwise this PC's network address; UDP Port the same as above),
        or, if another app (your wheel's software, say) already receives it, have that app forward it to this PC on the port above. Pitwall only has to be open when a session ends.</div>
      ${t.session ? `<div class="muted" style="font-size:12px">Current session: ${esc(D.TRACKS[GAME_TRACKS[t.session.track]]?.circuit || 'unknown circuit')} · ${esc(GAME_SESSION_NAMES[t.session.sessionType] || 'session')}${NOT_CAREER_MODES.includes(t.session.gameMode) ? ' · not a career session, so it won’t be logged' : ''}</div>` : ''}
    </div></div>`;
}
/** A driver's tyre stints from the game, cleaned up: [{ c: compound, from, to }]. Older imports could end the last
 *  stint on lap 255 (the game's "still running"); it really ends on the driver's last lap. */
function stintsOf(sd, d) {
  const g = sd?.game; const raw = g?.stints?.[d] || []; const n = g?.laps?.[d]?.length || g?.finished?.[d] || 0;
  const out = []; let from = 1;
  for (const [c, end0] of raw) {
    const end = Math.min(end0 >= 200 || (n && end0 > n) ? n || end0 : end0, n || end0);
    if (end < from) continue;
    out.push({ c, from, to: end }); from = end + 1;
  }
  return out;
}
/** Race pace from the game's laps: the average of each driver's clean laps (no lap 1, no laps in or out of the pits,
 *  nothing more than 4% off their own median, which leaves out safety cars and incidents). */
function cleanLapPace(sd, d) {
  const laps = sd.game?.laps?.[d]; if (!laps || laps.length < 4) return null;
  const pit = new Set(stintsOf(sd, d).slice(0, -1).flatMap(x => [x.to, x.to + 1]));
  const pool = laps.map(([ms], k) => ({ ms, lap: k + 1 })).filter(x => x.lap > 1 && !pit.has(x.lap) && x.ms > 0);
  if (pool.length < 3) return null;
  const sorted = pool.map(x => x.ms).sort((a, b) => a - b); const med = sorted[Math.floor(sorted.length / 2)];
  const clean = sorted.filter(ms => ms <= med * 1.04);
  return clean.length >= 3 ? avg(clean) : null;
}
const tyreChip = (c, len, title = '') => { const cp = COMPOUNDS[c] || ['?', 'Unknown', '#5E6A82']; return `<span class="tyre-chip" style="--c:${cp[2]}" title="${esc(title || cp[1])}">${cp[0]}${len != null ? `<small>${len}</small>` : ''}</span>`; };
/** Tyres, stops and penalties from the game. Each driver opens their lap-by-lap view. */
/** A tyre, Pirelli style: the compound's colour as the sidewall band, its letter in the middle. */
const tyreIcon = (c, size = 28) => { const cp = COMPOUNDS[c] || ['?', 'Unknown', '#5E6A82']; return `<span class="tyre-ic" style="--c:${cp[2]};--sz:${size}px" title="${esc(cp[1])}"><b>${cp[0]}</b></span>`; };
/**
 * A race strategy as one bar, the way Pirelli draws them: each stint in its compound's colour, blending into the next
 * at the stop: the starting tyre at the left, then the stop lap (or pit window) and the new tyre at each change.
 * stints: [{ c, from, to }]; windows: per stop [lo, hi] (optional); compact for table rows.
 */
function stintBar(stints, total, { label = '', windows = null, compact = false } = {}) {
  if (!stints.length) return '';
  const N = total || stints[stints.length - 1].to; const pc = (lap) => Math.max(0, Math.min(100, lap / N * 100));
  const col = (c) => (COMPOUNDS[c] || [])[2] || '#5E6A82';
  const blend = compact ? 1.5 : 3;
  const stops = []; let g = `linear-gradient(90deg, ${col(stints[0].c)} 0%`;
  stints.forEach((st, k) => {
    if (k === 0) return;
    const p = pc(stints[k - 1].to);
    g += `, ${col(stints[k - 1].c)} ${Math.max(0, p - blend).toFixed(1)}%, ${col(st.c)} ${Math.min(100, p + blend).toFixed(1)}%`;
    stops.push({ p, lap: stints[k - 1].to, c: st.c, prev: stints[k - 1].c, w: windows?.[k - 1] });
  });
  g += `, ${col(stints[stints.length - 1].c)} 100%)`;
  const light = (c) => c === 18 || c === 17; // dark text on the white and yellow tyres
  const size = compact ? 18 : 30;
  return `<div class="stint-bar ${compact ? 'compact' : ''}" style="background:${g}">
    <div class="sb-start">${tyreIcon(stints[0].c, size)}</div>
    ${stops.map(o => `<div class="sb-stop ${o.p < 22 ? 'flip' : ''}" style="left:max(${o.p.toFixed(1)}%, ${compact ? 30 : 56}px)"><span class="sb-lap ${light(o.p < 22 ? o.c : o.prev) ? 'dark' : ''}">${compact ? `L${o.lap}` : o.w && o.w[0] !== o.w[1] ? `Lap <b>${o.w[0]}</b> to <b>${o.w[1]}</b>` : `Lap <b>${o.lap}</b>`}</span>${tyreIcon(o.c, size)}</div>`).join('')}
  </div>`;
}
/**
 * Every driver's place at the end of each lap, from the logged lap times (running order by total time; lap 0 is the
 * grid, the last lap the official result, penalties included): { N, ids, pos: { d: [place by lap] } } or null.
 */
function lapPositions(sd) {
  const g = sd?.game; if (!g?.laps || Object.keys(g.laps).length < 2) return null;
  const cum = {}; for (const [d, laps] of Object.entries(g.laps)) { let t = 0; cum[d] = laps.map(l => (t += l[0] || 0)); }
  const ids = Object.keys(cum).filter(d => cum[d].length); const N = Math.max(0, ...ids.map(d => cum[d].length)); if (!N) return null;
  const pos = Object.fromEntries(ids.map(d => [d, []]));
  if (g.grid && Object.values(g.grid).some(Boolean)) ids.slice().sort((a, b) => (g.grid[a] || 99) - (g.grid[b] || 99)).forEach((d, k) => { pos[d][0] = k + 1; });
  for (let k = 1; k < N; k++) ids.filter(d => cum[d].length >= k).sort((a, b) => cum[a][k - 1] - cum[b][k - 1]).forEach((d, j) => { pos[d][k] = j + 1; });
  sd.results.filter(x => !OUT.includes(x.st) && pos[x.d]).forEach((x, j) => { pos[x.d][N] = j + 1; });
  return { N, ids, pos };
}
/** The race, lap by lap: a line per driver from grid to flag (team colours, the second car of a team dashed). */
function positionChartPanel(s, sd, { mine = null } = {}) {
  const P = lapPositions(sd); if (!P) return '';
  const { N, ids, pos } = P; const n = ids.length;
  const W = 900, H = Math.max(260, n * 17 + 36), pad = { l: 46, r: 46, t: 14, b: 22 };
  const X = (k) => pad.l + k / N * (W - pad.l - pad.r), Y = (p) => pad.t + (p - 1) / Math.max(1, n - 1) * (H - pad.t - pad.b);
  const seenTeam = {}; const out = new Set(sd.results.filter(x => OUT.includes(x.st)).map(x => x.d));
  const lines = ids.map(d => {
    const tm = teamOf(s, d)?.id; const dashed = !!seenTeam[tm]; seenTeam[tm] = 1;
    const pts = pos[d].map((p, k) => p ? [X(k), Y(p)] : null).filter(Boolean);
    const last = pts[pts.length - 1]; const first = pts[0];
    return { d, color: teamColor(s, d), dashed, pts, last, first, fin: pos[d][N], start: pos[d].find(Boolean) };
  });
  const grid = Array.from({ length: n }, (_, k) => k + 1).filter(p => p === 1 || p % 5 === 0).map(p => `<line class="g-grid" x1="${pad.l}" x2="${W - pad.r}" y1="${Y(p)}" y2="${Y(p)}"/>`).join('');
  const step = N > 40 ? 10 : 5; const ticks = Array.from({ length: Math.floor(N / step) + 1 }, (_, k) => k * step).map(k => `<text class="g-tick" x="${X(k)}" y="${H - 6}" text-anchor="middle">${k ? k : 'Grid'}</text>`).join('');
  const svg = `<svg class="g-chart pos-chart" viewBox="0 0 ${W} ${H}" style="width:100%">${grid}${ticks}
    ${lines.map(o => `<g class="pc-line ${(mine ? mine.includes(o.d) : o.d === PLAYER) ? 'me' : mine ? 'dim' : ''}"><title>${esc(dName(s, o.d))}: P${o.start || '?'} to ${o.fin ? 'P' + o.fin : out.has(o.d) ? 'retired' : '?'}</title>
      <polyline points="${o.pts.map(q => q.map(v => v.toFixed(1)).join(',')).join(' ')}" style="stroke:${o.color}" ${o.dashed ? 'stroke-dasharray="6 4"' : ''}/>
      ${o.first ? `<text class="pc-lab" x="${pad.l - 6}" y="${o.first[1] + 4}" text-anchor="end" style="fill:${o.color}">${esc(dAbbr(s, o.d))}</text>` : ''}
      ${o.fin ? `<text class="pc-lab" x="${W - pad.r + 6}" y="${o.last[1] + 4}" style="fill:${o.color}">${esc(dAbbr(s, o.d))}</text>` : o.last ? `<text class="pc-out" x="${o.last[0]}" y="${o.last[1] + 4}" text-anchor="middle">✕</text>` : ''}</g>`).join('')}
  </svg>`;
  return `<div class="panel"><div class="panel-h"><h2>Positions, lap by lap</h2><span class="muted" style="font-size:12px">From F1 25 lap times · ✕ retired · hover a line for the driver</span></div><div class="panel-b">${svg}</div></div>`;
}
function strategyPanel(s, sd, key, roundId) {
  const g = sd?.game; if (!g?.laps) return '';
  const race = isRaceKind(key);
  const pens = (d) => (g.penalties || []).filter(p => p.d === d && PENALTY_NAMES[p.type]);
  return `<div class="panel"><div class="panel-h"><h2>${race ? 'Strategy & penalties' : 'Runs & tyres'}</h2><span class="muted" style="font-size:12px">From F1 25${race && g.safety ? ` · ${plural(g.safety.sc || 0, 'safety car')}, ${plural(g.safety.vsc || 0, 'virtual safety car')}${g.safety.red ? `, ${plural(g.safety.red, 'red flag')}` : ''}` : ''} · tap a driver for every lap</span></div>
    <div class="panel-b tight table-wrap"><table><thead><tr><th>Pos</th><th>Driver</th><th>${race ? 'Strategy' : 'Tyres (laps)'}</th>${race ? '<th class="num">Stops</th><th>Penalties</th>' : '<th class="num">Laps</th>'}<th class="num">${race ? 'Clean-lap pace' : 'Best'}</th></tr></thead><tbody>
      ${sd.results.filter(x => g.laps[x.d]?.length).map((x, i) => { const p = race ? cleanLapPace(sd, x.d) : Math.min(...g.laps[x.d].map(l => l[0]).filter(Boolean)); return `<tr class="${x.d === PLAYER ? 'me' : ''}" data-act="gd-open" data-round="${roundId}" data-key="${key}" data-d="${x.d}" style="cursor:pointer"><td class="num">${OUT.includes(x.st) ? x.st : i + 1}</td><td>${drvCell(s, x.d, { team: true })}</td>
        <td style="${race ? 'min-width:260px;width:40%' : ''}">${race ? stintBar(stintsOf(sd, x.d), Math.max(...Object.keys(g.laps).map(d => stintsOf(sd, d).at(-1)?.to || 0)), { compact: true }) : `<div class="row" style="gap:4px;flex-wrap:nowrap">${stintsOf(sd, x.d).map(st => tyreChip(st.c, st.to - st.from + 1, `${(COMPOUNDS[st.c] || [])[1] || 'Tyre'}, laps ${st.from}–${st.to}`)).join('')}</div>`}</td>
        ${race ? `<td class="num">${g.pits?.[x.d] ?? '–'}</td><td class="muted" style="font-size:12px">${pens(x.d).map(q => `<span class="pen-item">${q.type === 4 ? `${q.time} s` : PENALTY_NAMES[q.type]}${INFRINGEMENTS[q.infr] ? ` for ${INFRINGEMENTS[q.infr]}` : ''}${q.lap ? ` (lap ${q.lap})` : ''}<button class="pen-x" data-act="pen-remove" data-round="${roundId}" data-key="${key}" data-i="${g.penalties.indexOf(q)}" title="Remove this penalty (say you undid it with a flashback)" aria-label="Remove penalty">×</button></span>`).join(', ') || '–'}</td>` : `<td class="num">${g.laps[x.d].length}</td>`}
        <td class="num mono">${p && isFinite(p) ? fmtLap(p) : '–'}</td></tr>`; }).join('')}
    </tbody></table></div>${race ? battlesFooter(s, sd) : ''}</div>`;
}
/** Under the race strategy table: the battles (pairs who swapped places five or more times) and who passed most. */
function battlesFooter(s, sd) {
  const B = raceBattles(sd), P = racePasses(sd); if (!P) return '';
  const nm = (d) => esc(lastName(dName(s, d)));
  const top = Object.entries(P.made).sort((a, b) => b[1] - a[1]).slice(0, 3);
  return `<div class="panel-b battles-foot"><div><span class="label">Battles</span> ${B.length ? B.slice(0, 6).map(b => `<span class="battle-chip"><b>${nm(b.ahead)}</b> v ${nm(b.behind)} · ${b.n} passes${b.to > b.from ? `, laps ${b.from}–${b.to}` : ''}</span>`).join('') : '<span class="muted">Nobody swapped places eight times or more.</span>'}</div>
    <div class="muted">${P.total === 1 ? '1 pass' : `${P.total} passes`} in all${top.length ? `. Most made: ${top.map(([d, n]) => `${nm(d)} ${n}`).join(', ')}` : ''}.${sd.game.passSource === 'positions' ? ' (From position changes: the game sent no overtake events.)' : ''}</div></div>`;
}
/** A small line chart: series [{ color, pts: [[x, y]], dashed, label }]. */
function svgChart(series, { h = 180, yFmt = (v) => v, invert = false, xLabel = 'Lap' } = {}) {
  const all = series.flatMap(s => s.pts); if (!all.length) return '<div class="empty">No data</div>';
  const W = 640, P = { l: 56, r: 12, t: 10, b: 26 };
  const xs = all.map(p => p[0]), ys = all.map(p => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs, x0 + 1); let y0 = Math.min(...ys), y1 = Math.max(...ys); if (y1 - y0 < 1e-6) { y0 -= 1; y1 += 1; }
  const pad = (y1 - y0) * 0.08; y0 = y0 >= 0 ? Math.max(0, y0 - pad) : y0 - pad; y1 += pad;
  const X = (v) => P.l + (v - x0) / (x1 - x0) * (W - P.l - P.r);
  const Y = (v) => invert ? P.t + (v - y0) / (y1 - y0) * (h - P.t - P.b) : h - P.b - (v - y0) / (y1 - y0) * (h - P.t - P.b);
  const ticks = [0, 0.5, 1].map(k => y0 + (y1 - y0) * k);
  return `<svg class="g-chart" viewBox="0 0 ${W} ${h}" preserveAspectRatio="none" style="width:100%;height:${h}px">
    ${ticks.map(v => `<line x1="${P.l}" x2="${W - P.r}" y1="${Y(v)}" y2="${Y(v)}" class="g-grid"/><text x="${P.l - 6}" y="${Y(v) + 4}" text-anchor="end" class="g-tick">${esc(yFmt(v))}</text>`).join('')}
    <text x="${W - P.r}" y="${h - 6}" text-anchor="end" class="g-tick">${xLabel} ${Math.round(x1)}</text><text x="${P.l}" y="${h - 6}" class="g-tick">${Math.round(x0)}</text>
    ${series.map(s => `<polyline fill="none" stroke="${s.color}" stroke-width="2" ${s.dashed ? 'stroke-dasharray="5 4" opacity=".7"' : ''} points="${s.pts.map(p => `${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join(' ')}"/>${s.dots ? s.pts.map(p => `<circle cx="${X(p[0]).toFixed(1)}" cy="${Y(p[1]).toFixed(1)}" r="2.5" fill="${s.color}"/>`).join('') : ''}`).join('')}
  </svg>`;
}
/** Least-squares line through [[x, y]]: { a: intercept, b: slope }. */
function fitLine(pts) {
  const n = pts.length; if (n < 2) return null;
  const mx = avg(pts.map(p => p[0])), my = avg(pts.map(p => p[1]));
  const sxx = pts.reduce((a, p) => a + (p[0] - mx) ** 2, 0); if (!sxx) return null;
  const b = pts.reduce((a, p) => a + (p[0] - mx) * (p[1] - my), 0) / sxx;
  return { a: my - b * mx, b };
}
const WEAR_LIMIT = 70; // % wear at which a tyre is considered done
/** One driver's session from the game: every lap, the lap-time graph and tyre wear by stint (with where practice
 *  runs were heading). */
function gameDriverModal(roundId, key, d) {
  const s = curSeason(); const sd = s.weekends[roundId]?.sessions?.[key]; const g = sd?.game; if (!g?.laps?.[d]) return;
  const laps = g.laps[d]; const wear = g.wear?.[d] || []; const st = stintsOf(sd, d); const practice = key.startsWith('FP');
  const compOf = (lap) => st.find(x => lap >= x.from && lap <= x.to);
  const med = [...laps.map(l => l[0]).filter(Boolean)].sort((a, b) => a - b)[Math.floor(laps.length / 2)] || 0;
  const lapPts = laps.map((l, k) => [k + 1, l[0] / 1000]).filter(p => p[1] > 0 && p[1] * 1000 <= med * 1.12);
  const wearSeries = []; const life = [];
  for (const x of st) {
    const pts = []; for (let lap = x.from; lap <= x.to; lap++) if (wear[lap - 1] != null) pts.push([lap - x.from + 1, wear[lap - 1]]);
    if (!pts.length) continue;
    const col = (COMPOUNDS[x.c] || [])[2] || '#8B97AF';
    wearSeries.push({ color: col, pts, dots: true });
    const fit = fitLine(pts);
    if (practice && fit && fit.b > 0.05) {
      const end = Math.min(80, Math.ceil((WEAR_LIMIT - fit.a) / fit.b));
      if (end > pts[pts.length - 1][0]) wearSeries.push({ color: col, dashed: true, pts: [pts[pts.length - 1], [end, fit.a + fit.b * end]] });
      life.push(`${(COMPOUNDS[x.c] || [])[1] || 'Tyre'} (laps ${x.from}–${x.to}): ${fit.b.toFixed(1)}% a lap, about ${Math.max(end, pts.length)} laps to ${WEAR_LIMIT}%`);
    }
  }
  ui.modal = { kind: 'gd' };
  modal(`<div class="modal-h"><h2>${esc(dName(s, d))} · ${esc(SESSION_LABEL[key])}</h2><button class="icon-btn" data-act="modal-close">${ICON.x}</button></div>
    <div class="modal-b stack">
      <div class="row" style="gap:6px">${st.map(x => tyreChip(x.c, x.to - x.from + 1)).join('')}<span class="muted" style="font-size:12px">${plural(laps.length, 'lap')}${g.pits?.[d] != null ? ` · ${plural(g.pits[d], 'stop')}` : ''}</span></div>
      <div><span class="label">Lap times</span>${svgChart([{ color: 'var(--team)', pts: lapPts, dots: true }], { yFmt: (v) => fmtLap(v * 1000), invert: true })}</div>
      <div><span class="label">Tyre wear by stint${practice ? ' (dashed: where each run was heading)' : ''}</span>${wearSeries.length ? svgChart(wearSeries, { yFmt: (v) => v.toFixed(0) + '%', xLabel: 'Tyre age' }) : '<div class="muted" style="font-size:13px">No tyre wear recorded for this session (it was logged before Pitwall 1.9.1).</div>'}
        ${life.length ? `<div class="muted" style="font-size:12px;display:grid;gap:2px;margin-top:4px">${life.map(x => `<span>${esc(x)}</span>`).join('')}</div>` : ''}</div>
      <div class="table-wrap" style="max-height:260px;overflow:auto"><table><thead><tr><th class="num">Lap</th><th>Tyre</th><th class="num">Time</th><th class="num">Wear</th><th></th></tr></thead><tbody>
        ${laps.map((l, k) => { const x = compOf(k + 1); const pit = st.some(y => y.to === k + 1 && y !== st[st.length - 1]); return `<tr><td class="num">${k + 1}</td><td>${x ? tyreChip(x.c, k + 2 - x.from) : ''}</td><td class="num mono ${l[1] ? '' : 'muted'}">${l[0] ? fmtLap(l[0]) : '–'}</td><td class="num">${wear[k] != null ? wear[k].toFixed(0) + '%' : '–'}</td><td class="muted" style="font-size:12px">${pit ? 'In-lap' : x && k + 1 === x.from && x.from > 1 ? 'Out-lap' : l[1] ? '' : 'Invalid'}</td></tr>`; }).join('')}
      </tbody></table></div>
    </div>`, 'wide');
}
