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
  const what = `${D.TRACKS[gameTrack(q.r.track)]?.circuit || 'Unknown circuit'} · ${GAME_SESSION_NAMES[q.r.sessionType] || 'Session'}`;
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
      ${t.session ? `<div class="muted" style="font-size:12px">Current session: ${esc(D.TRACKS[gameTrack(t.session.track)]?.circuit || 'unknown circuit')} · ${esc(GAME_SESSION_NAMES[t.session.sessionType] || 'session')}${NOT_CAREER_MODES.includes(t.session.gameMode) ? ' · not a career session, so it won’t be logged' : ''}</div>` : ''}
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
    <div class="panel-b">${tvBoard('', [{ h: '', w: '34px' }, { h: '', w: '26px' }, { h: 'Driver', w: 'minmax(120px, 1fr)' }, { h: race ? 'Strategy' : 'Tyres (laps)', w: race ? 'minmax(240px, 2.4fr)' : 'minmax(160px, 1.6fr)' }, ...(race ? [{ h: 'Stops', w: '48px', num: true }, { h: 'Penalties', w: 'minmax(120px, 1.2fr)' }] : [{ h: 'Laps', w: '48px', num: true }]), { h: race ? 'Clean-lap pace' : 'Best', w: '100px', num: true }],
      sd.results.filter(x => g.laps[x.d]?.length).map((x, i) => { const p = race ? cleanLapPace(sd, x.d) : Math.min(...g.laps[x.d].map(l => l[0]).filter(Boolean));
        return { me: x.d === PLAYER, attrs: `data-act="gd-open" data-round="${roundId}" data-key="${key}" data-d="${x.d}"`, cls: 'click', cells: [OUT.includes(x.st) ? `<small>${x.st}</small>` : i + 1, tvLogo(career(), teamOf(s, x.d)), `<b>${esc(lastName(dName(s, x.d)).toUpperCase())}</b>`,
          race ? stintBar(stintsOf(sd, x.d), Math.max(...Object.keys(g.laps).map(d => stintsOf(sd, d).at(-1)?.to || 0)), { compact: true }) : `<span class="row" style="gap:4px;flex-wrap:nowrap">${stintsOf(sd, x.d).map(st => tyreChip(st.c, st.to - st.from + 1, `${(COMPOUNDS[st.c] || [])[1] || 'Tyre'}, laps ${st.from}–${st.to}`)).join('')}</span>`,
          ...(race ? [g.pits?.[x.d] ?? '–', `<small>${pens(x.d).map(q => `<span class="pen-item">${q.type === 4 ? `${q.time} s` : PENALTY_NAMES[q.type]}${INFRINGEMENTS[q.infr] ? ` for ${INFRINGEMENTS[q.infr]}` : ''}${q.lap ? ` (lap ${q.lap})` : ''}<button class="pen-x" data-act="pen-remove" data-round="${roundId}" data-key="${key}" data-i="${g.penalties.indexOf(q)}" title="Remove this penalty (say you undid it with a flashback)" aria-label="Remove penalty">×</button></span>`).join(', ') || '–'}</small>`] : [g.laps[x.d].length]),
          p && isFinite(p) ? fmtLap(p) : '–'] }; }))}</div>${race ? battlesFooter(s, sd) : ''}</div>`;
}
/** Under the race strategy table: the battles (pairs who swapped places five or more times) and who passed most. */
function battlesFooter(s, sd) {
  const B = raceBattles(sd), P = racePasses(sd); if (!P) return '';
  const nm = (d) => esc(lastName(dName(s, d)));
  const top = Object.entries(P.made).sort((a, b) => b[1] - a[1]).slice(0, 3);
  return `<div class="panel-b battles-foot"><div><span class="label">Battles</span> ${B.length ? B.slice(0, 6).map(b => `<span class="battle-chip"><b>${nm(b.ahead)}</b> v ${nm(b.behind)} · ${b.n} passes${b.to > b.from ? `, laps ${b.from}–${b.to}` : ''}</span>`).join('') : '<span class="muted">Nobody swapped places eight times or more.</span>'}</div>
    <div class="muted">${P.total === 1 ? '1 pass' : `${P.total} passes`} in all${top.length ? `. Most made: ${top.map(([d, n]) => `${nm(d)} ${n}`).join(', ')}` : ''}.${sd.game.passSource === 'positions' ? ' (From position changes: the game sent no overtake events.)' : ''}</div></div>`;
}
/**
 * A line chart in the graphics' look (the title-by-lap graphic): a dark panel, faint grid, thick lines in each team's
 * colour (a dark one lifted so it shows), condensed bold figures, and a name tag at the end of each line that has a
 * label. series [{ color, pts: [[x, y]], dashed, dots, label, sub }].
 */
const gxCol = (c) => { const h = String(c || ''); return /^#[0-9a-f]{6}$/i.test(h) && gfxLum(h) < 60 ? mixHex(h, '#FFFFFF', 0.4) : c; };
/**
 * Name tags at the ends of the lines, top to bottom in the order the lines end, never overlapping: two lines each (name,
 * figure) 26 px apart when there's room, else spread evenly over the chart's height on one line each (compact).
 */
function gxEndLabels(ends, top, bottom) {
  ends.sort((a, b) => a.y - b.y); const n = ends.length; if (!n) return ends;
  const gap = Math.min(26, n > 1 ? (bottom - top) / (n - 1) : 26); const compact = gap < 26;
  for (let j = 0; j < n; j++) { ends[j].y = Math.max(ends[j].y, top, j ? ends[j - 1].y + gap : top); ends[j].compact = compact; }
  if (ends[n - 1].y > bottom) { ends[n - 1].y = bottom; for (let j = n - 2; j >= 0; j--) ends[j].y = Math.min(ends[j].y, ends[j + 1].y - gap); }
  return ends;
}
function svgChart(series, { h = 180, yFmt = (v) => v, invert = false, xLabel = 'Lap' } = {}) {
  const all = series.flatMap(s => s.pts); if (!all.length) return '<div class="empty">No data</div>';
  const named = series.some(s => s.label);
  const W = 760, H = Math.max(170, h + 30), P = { l: 70, r: named ? 138 : 16, t: 14, b: 30 };
  const xs = all.map(p => p[0]), ys = all.map(p => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs, x0 + 1); let y0 = Math.min(...ys), y1 = Math.max(...ys); if (y1 - y0 < 1e-6) { y0 -= 1; y1 += 1; }
  const pad = (y1 - y0) * 0.08; y0 = y0 >= 0 ? Math.max(0, y0 - pad) : y0 - pad; y1 += pad;
  const X = (v) => P.l + (v - x0) / (x1 - x0) * (W - P.l - P.r);
  const Y = (v) => invert ? P.t + (v - y0) / (y1 - y0) * (H - P.t - P.b) : H - P.b - (v - y0) / (y1 - y0) * (H - P.t - P.b);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(k => y0 + (y1 - y0) * k);
  const span = x1 - x0; const st = span > 50 ? 10 : span > 25 ? 5 : span > 10 ? 2 : 1; const xt = [];
  for (let v = Math.ceil(x0 / st) * st; v <= x1; v += st) xt.push(v);
  const lap = xLabel === 'Lap'; if (!lap) while (xt.length && X(xt[xt.length - 1]) > W - P.r - 70) xt.pop(); // room for the unit at the end
  const ends = gxEndLabels(series.filter(s => s.label && s.pts.length).map(s => { const q = s.pts[s.pts.length - 1]; return { s, x: X(q[0]), y0: Y(q[1]), y: Y(q[1]), v: q[1] }; }), P.t + 8, H - P.b - 8);
  return `<div class="gx-chart"><svg viewBox="0 0 ${W} ${H}" role="img">
    ${ticks.map(v => `<line x1="${P.l}" x2="${W - P.r}" y1="${Y(v)}" y2="${Y(v)}" class="gx-grid"/><text x="${P.l - 10}" y="${Y(v) + 4}" text-anchor="end" class="gx-tick">${esc(yFmt(v))}</text>`).join('')}
    ${xt.map(v => `<text x="${X(v)}" y="${H - 8}" text-anchor="middle" class="gx-tick">${lap ? 'L' + Math.round(v) : Math.round(v)}</text>`).join('')}${lap ? '' : `<text x="${W - P.r}" y="${H - 8}" text-anchor="end" class="gx-tick gx-unit">${esc(xLabel)}</text>`}
    ${series.map(s => { const col = gxCol(s.color); return `<polyline fill="none" stroke="${col}" stroke-width="${s.label ? 3.5 : 3}" stroke-linejoin="round" stroke-linecap="round" ${s.dashed ? 'stroke-dasharray="10 7" opacity=".85"' : ''} points="${s.pts.map(p => `${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join(' ')}"/>${s.dots ? s.pts.map(p => `<circle cx="${X(p[0]).toFixed(1)}" cy="${Y(p[1]).toFixed(1)}" r="3" fill="${col}"><title>${esc(s.label || '')} ${lap ? 'lap ' + p[0] : p[0]}: ${esc(yFmt(p[1]))}</title></circle>`).join('') : ''}`; }).join('')}
    ${ends.map(e => { const col = gxCol(e.s.color); const x = W - P.r + 14; return `<line x1="${e.x}" y1="${e.y0}" x2="${x}" y2="${e.y}" stroke="${col}" stroke-width="1" opacity=".35" stroke-dasharray="2 3"/>${e.compact ? `<rect x="${x + 4}" y="${e.y - 7}" width="4" height="14" fill="${col}"/><text x="${x + 13}" y="${e.y + 4}" class="gx-name gx-c">${esc(String(e.s.label).toUpperCase())} <tspan class="gx-sub">${esc(e.s.sub ?? yFmt(e.v))}</tspan></text>` : `<rect x="${x + 4}" y="${e.y - 11}" width="5" height="22" fill="${col}"/><text x="${x + 15}" y="${e.y - 1}" class="gx-name">${esc(String(e.s.label).toUpperCase())}</text><text x="${x + 15}" y="${e.y + 12}" class="gx-sub">${esc(e.s.sub ?? yFmt(e.v))}</text>`}`; }).join('')}
  </svg></div>`;
}
/** Least-squares line through [[x, y]]: { a: intercept, b: slope }. */
function fitLine(pts) {
  const n = pts.length; if (n < 2) return null;
  const mx = avg(pts.map(p => p[0])), my = avg(pts.map(p => p[1]));
  const sxx = pts.reduce((a, p) => a + (p[0] - mx) ** 2, 0); if (!sxx) return null;
  const b = pts.reduce((a, p) => a + (p[0] - mx) * (p[1] - my), 0) / sxx;
  return { a: my - b * mx, b };
}
const WEAR_LIMIT = 75; // % wear at which a tyre is considered done
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
      <div><span class="label">Lap times</span>${svgChart([{ color: teamColor(s, d), pts: lapPts, dots: true, label: lastName(dName(s, d)), sub: 'lap times' }], { yFmt: (v) => fmtLap(v * 1000), invert: true })}</div>
      <div><span class="label">Tyre wear by stint${practice ? ' (dashed: where each run was heading)' : ''}</span>${wearSeries.length ? svgChart(wearSeries, { yFmt: (v) => v.toFixed(0) + '%', xLabel: 'Tyre age' }) : '<div class="muted" style="font-size:13px">No tyre wear recorded for this session (it was logged before Pitwall 1.9.1).</div>'}
        ${life.length ? `<div class="muted" style="font-size:12px;display:grid;gap:2px;margin-top:4px">${life.map(x => `<span>${esc(x)}</span>`).join('')}</div>` : ''}</div>
      <div class="table-wrap" style="max-height:260px;overflow:auto"><table><thead><tr><th class="num">Lap</th><th>Tyre</th><th class="num">Time</th><th class="num">Wear</th><th></th></tr></thead><tbody>
        ${laps.map((l, k) => { const x = compOf(k + 1); const pit = st.some(y => y.to === k + 1 && y !== st[st.length - 1]); return `<tr><td class="num">${k + 1}</td><td>${x ? tyreChip(x.c, k + 2 - x.from) : ''}</td><td class="num mono ${l[1] ? '' : 'muted'}">${l[0] ? fmtLap(l[0]) : '–'}</td><td class="num">${wear[k] != null ? wear[k].toFixed(0) + '%' : '–'}</td><td class="muted" style="font-size:12px">${pit ? 'In-lap' : x && k + 1 === x.from && x.from > 1 ? 'Out-lap' : l[1] ? '' : 'Invalid'}</td></tr>`; }).join('')}
      </tbody></table></div>
    </div>`, 'wide');
}

/* ------------------------------------------------------------- a race logged from its recording */
/*
  F1 25 doesn't always send its result: after a retirement it can simulate the rest of the race and go straight to the
  results screen without a final classification (Australia 2027, Pitwall 3.37). The race was still recorded, a sample a
  second with every lap time, so it can be logged from the recording: the order when the data stopped, each car's laps,
  stints, tyre wear and fuel. If the game simulated the rest, the order is put right in the race's results (drag the
  rows) and retirements set there.
*/
/** A recording as a game result, in the shape the telemetry sends one. */
function recordingResult(D) {
  const S = D.samples || []; const last = S[S.length - 1]; if (!last?.f?.length) return null;
  const first = S.find(x => x.f?.some(r => r[1] > 0)) || S[0];
  const grid = Object.fromEntries(first.f.map(r => [r[0], r[1]]));
  // stints and tyre wear from the samples: a stint ends when the stop count goes up
  const stint = {}, wear = {};
  for (const X of S) for (const [i, , lap, , , , , , stops, c, , w] of X.f) {
    const L = (stint[i] ||= []); if (c >= 0 && (!L.length || stops > L[L.length - 1].stops)) { if (L.length) L[L.length - 1].end = Math.max(1, lap - 1); L.push({ actual: c, visual: c, end: 255, stops }); }
    if (w >= 0 && lap > 0) (wear[i] ||= [])[lap - 1] = w / 10;
  }
  const cars = last.f.map(([i, pos, lap, , , , , st, stops]) => {
    const p = (D.meta.parts || []).find(q => q.idx === i) || {}; const laps = D.laps?.[i] || [];
    const valid = laps.filter(l => l?.[0] && l[1]).map(l => l[0]);
    return { idx: i, position: pos, laps: laps.length || Math.max(0, lap - 1), grid: grid[i] || 0, points: 0, pits: stops || 0, status: st || 2, reason: 0,
      best: valid.length ? Math.min(...valid) : 0, total: laps.reduce((a, l) => a + (l?.[0] || 0), 0) / 1000, penalty: 0, penalties: 0,
      stints: (stint[i] || []).map(({ stops: _, ...t }) => t), name: p.name || '', number: p.number || 0, team: p.team ?? null, myTeam: !!p.myTeam, ai: p.ai !== false, driver: p.driver ?? null,
      lapTimes: laps, trace: null, wear: (wear[i] || []).map(v => v ?? null), fuel: D.fuel?.[i] || [], ersDep: [], leadGap: null };
  }).filter(x => x.position > 0);
  const M = D.meta;
  return { key: M.key, uid: M.uid, format: 2025, at: M.at, player: M.player, sessionType: M.sessionType, track: M.track, weekend: M.weekend || [], totalLaps: M.totalLaps, sessionLink: M.link,
    cars, resumed: false, gridKnown: true, penaltyEvents: [], retirements: [], collisions: [], tyreSets: last.ts || null, safetyCars: 0, virtualSafetyCars: 0, scPeriods: [], overtakes: [], passSource: null, ers: null,
    fromRecording: { lap: Math.max(...last.f.map(r => r[2])) } };
}
/** Recordings of races this season that were never logged (the game sent no result). */
function unloggedRecordings(c) {
  const s = latestSeason(); if (!s || isHist(s)) return [];
  if (replayList == null) { if (!unloggedRecordings.asked) { unloggedRecordings.asked = true; replayApi().list().then(l => { replayList = l || []; render(); }).catch(() => { replayList = []; }); } return []; }
  // a recording logged in any save is done with, and one made before this save began isn't this save's
  const keys = new Set(state.careers.flatMap(x => x.gameKeys || [])); const since = c.createdAt || '';
  return (replayList || []).filter(x => !keys.has(x.key) && (!x.at || x.at >= since) && [15, 16, 17].includes(x.sessionType) && !x.rebuilt && (x.laps ?? 2) >= 2
    && activeRounds(s).some(r => trackOf(r) === gameTrack(x.track) && !s.weekends[r.id]?.sessions?.R?.done));
}
async function logFromRecording(key) {
  const D = await replayApi().load(key); const r = D && recordingResult(D); if (!r) { toast('That recording couldn’t be read'); return; }
  handleGameResult(r);
  toast(`Logged from the recording: the order on lap ${r.fromRecording.lap}. If the game simulated the rest, drag the results into its order in the race.`);
}
function unloggedHtml(c) {
  const L = unloggedRecordings(c); if (!L.length) return '';
  return `<div class="callout" style="border-left-color:var(--yellow)">${L.map(x => `<div class="row" style="justify-content:space-between;gap:10px;flex-wrap:wrap"><span><b>${esc(D.TRACKS[gameTrack(x.track)]?.circuit || 'A race')}</b> was recorded${x.laps ? ` (${plural(x.laps, 'lap')})` : ''} but F1 25 never sent its result, which can happen after a retirement. Log it from the recording, then put the order right from the game’s results screen.</span><button class="btn sm primary" data-act="rp-log" data-k="${esc(x.key)}">Log from the recording</button></div>`).join('')}</div>`;
}
