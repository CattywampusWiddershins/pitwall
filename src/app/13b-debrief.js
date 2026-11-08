/*
  The race debrief's two deeper panels, from the race's own lap times.

  Strategy debrief: how each choice played out. When to stop (each lap you could have stopped on, from your own pace and
  fall-off on each tyre in this race and the track's pit loss, against the stop you made); through the stops (the order
  around you before and after, and any undercut or overcut won or lost); the forecasts against the race (wear and
  fall-off from practice against what the race showed); and in a wet race, each weather call against when the other
  tyre actually became quicker.

  Grouping: how consistent you were in clean air, stint by stint, as in shooting. A clean-air lap is more than a second
  clear of the car ahead (any car, lapped ones too) at both ends of the lap, with no pass for or against you on the lap
  or the laps either side, under green flags, and not the first lap, a restart lap or a lap in or out of the pits. Each
  lap is measured from the stint's own fall-off line (the tyres slow you through a stint); the group is one standard
  deviation of those, and a lap more than 0.6 s off the line is a flyer, counted but kept out of the group.
*/
const FLYER = 600; // ms off the stint's line: a mistake, a lock-up, traffic
const CLEAN_GAP = 1000; // ms to the car ahead at the line

/**
 * A driver's stints with the in-lap where it belongs. The game ends a stint the lap before the in-lap (its tyre wear
 * shows the old set through the next lap at every track: at Shanghai a stop on lap 17 is a stint ending on 16), so each
 * stint but the last runs a lap longer here, and the next starts with its out-lap (the lap through the pit lane, or at
 * a track where the stop falls before the line, the first lap on the new set).
 */
function dbStints(sd, d) {
  const st = stintsOf(sd, d).map(x => ({ ...x })); const n = sd.game?.laps?.[d]?.length || 0;
  for (let k = 0; k < st.length - 1; k++) if (st[k].to + 1 < (st[k + 1].to || n)) { st[k].to++; st[k + 1].from++; }
  return st;
}

/** Laps run behind a safety car or VSC (the game's record: a period cut short by a resume, to 0, runs to the next). */
function dbScLaps(g) {
  const out = new Set(); const P = g?.safety?.periods || [];
  P.forEach((p, k) => { const end = p.to > 0 ? p.to : (P[k + 1]?.from ?? p.from); for (let n = Math.max(1, p.from); n <= end; n++) out.add(n); });
  return out;
}
/** Every car's line crossings on the race clock: { cum: { d: [time at the end of each lap] }, all: [[t, d]] sorted }. */
function dbCrossings(g) {
  if (g._x) return g._x;
  const cum = {}; const all = [];
  for (const [d, laps] of Object.entries(g.laps || {})) { let t = 0; cum[d] = laps.map(l => (t += l[0] || 0)); cum[d].forEach(v => all.push([v, d])); }
  all.sort((a, b) => a[0] - b[0]);
  return Object.defineProperty(g, '_x', { value: { cum, all }, enumerable: false })._x;
}
/** The nearest car across the line just before d at its crossing k (0: the end of lap 1), in ms. */
function dbAhead(X, d, k) {
  const t = X.cum[d]?.[k]; if (t == null) return Infinity;
  let lo = 0, hi = X.all.length; while (lo < hi) { const m = (lo + hi) >> 1; if (X.all[m][0] < t) lo = m + 1; else hi = m; }
  for (let j = lo - 1; j >= 0; j--) if (X.all[j][1] !== d) return t - X.all[j][0];
  return Infinity;
}
/** Each lap of a driver's race and why it does or doesn't count as clean air: [{ n, ms, tag }] (tag null: clean). */
function dbLapTags(sd, d) {
  const g = sd.game; const laps = g.laps?.[d] || []; const st = dbStints(sd, d); const sc = dbScLaps(g); const X = dbCrossings(g);
  const restart = new Set([...sc].map(n => n + 1).filter(n => !sc.has(n)));
  const pass = new Set((g.overtakes || []).filter(o => o[0] === d || o[1] === d).map(o => o[2]));
  const inL = new Set(st.slice(0, -1).map(x => x.to)), outL = new Set(st.slice(1).map(x => x.from));
  return laps.map((l, k) => {
    const n = k + 1; let tag = null;
    if (!l[0]) tag = 'none';
    else if (n === 1) tag = 'start';
    else if (inL.has(n) || outL.has(n)) tag = 'pit';
    else if (sc.has(n)) tag = 'sc';
    else if (restart.has(n)) tag = 'restart';
    else if (pass.has(n) || pass.has(n - 1) || pass.has(n + 1)) tag = 'battle';
    else if (Math.min(dbAhead(X, d, k - 1), dbAhead(X, d, k)) < CLEAN_GAP) tag = 'dirty';
    return { n, ms: l[0], tag };
  });
}
/** A driver's grouping, stint by stint: [{ c, from, to, laps, clean, res: [{ n, r }], sd, spread, fly, fit }]. */
function dbGrouping(sd, d) {
  const tags = dbLapTags(sd, d);
  return dbStints(sd, d).map(x => {
    const laps = tags.slice(x.from - 1, x.to); const clean = laps.filter(l => !l.tag);
    const fit = clean.length >= 3 ? fitLine(clean.map(l => [l.n, l.ms])) : null;
    const res = fit ? clean.map(l => ({ n: l.n, r: l.ms - (fit.a + fit.b * l.n) })) : [];
    const core = res.filter(q => Math.abs(q.r) <= FLYER);
    const sdv = core.length >= 3 ? Math.sqrt(core.reduce((a, q) => a + q.r * q.r, 0) / (core.length - 1)) : null;
    return { ...x, laps, clean: clean.length, res, fit, fly: res.length - core.length, sd: sdv, spread: core.length ? Math.max(...core.map(q => q.r)) - Math.min(...core.map(q => q.r)) : null };
  });
}
/** The field's grouping over the whole race (every stint's clean laps from its own line), tightest first; at least 10 laps. */
function dbFieldGrouping(sd) {
  return Object.keys(sd.game.laps || {}).map(d => {
    const G = dbGrouping(sd, d); const core = G.flatMap(x => x.res.filter(q => Math.abs(q.r) <= FLYER));
    return { d, n: core.length, fly: G.reduce((a, x) => a + x.fly, 0), sd: core.length >= 10 ? Math.sqrt(core.reduce((a, q) => a + q.r * q.r, 0) / (core.length - 1)) : null };
  }).filter(x => x.sd != null).sort((a, b) => a.sd - b.sd);
}
const DB_TAGS = { null: ['var(--green)', 'Clean air'], dirty: ['var(--red)', 'Within a second of the car ahead'], battle: ['var(--purple)', 'Battle'], sc: ['var(--yellow)', 'Safety car / VSC'], restart: ['#8a7a2a', 'Restart'], start: ['var(--dim)', 'Start'], pit: ['#3a4560', 'In or out of the pits'], none: ['#222', 'No lap time'] };
const dbSecs = (ms, d = 1) => `${(Math.abs(ms) / 1000).toFixed(d)} s`;

/** The grouping panel for one driver. */
function groupingPanel(c, s, sd, d, title) {
  const g = sd.game; if (!g?.laps?.[d]?.length) return '';
  const G = dbGrouping(sd, d); const tags = G.flatMap(x => x.laps); const N = tags.length;
  const strip = `<div class="db-strip" style="grid-template-columns:repeat(${N},1fr)">${tags.map(l => `<span title="Lap ${l.n}: ${DB_TAGS[l.tag][1]}" style="background:${DB_TAGS[l.tag][0]}"></span>`).join('')}</div>
    <div class="db-strip-n"><span>Lap 1</span><span>Lap ${N}</span></div>
    <div>${[...new Set(tags.map(l => String(l.tag)))].map(t => `<span class="db-lg"><i style="background:${DB_TAGS[t][0]}"></i>${DB_TAGS[t][1]}</span>`).join('')}</div>`;
  const ranges = (ns) => { const out = []; for (const n of ns) { const r = out[out.length - 1]; if (r && n === r[1] + 1) r[1] = n; else out.push([n, n]); } return out.map(([a, b]) => a === b ? `${a}` : `${a}–${b}`).join(', '); };
  const why = (x) => {
    const by = (t) => x.laps.filter(l => l.tag === t).map(l => l.n);
    const parts = [by('battle').length && `fighting on lap${by('battle').length > 1 ? 's' : ''} ${ranges(by('battle'))}`, by('dirty').length && `within a second of the car ahead on lap${by('dirty').length > 1 ? 's' : ''} ${ranges(by('dirty'))}`, by('sc').length && `under the safety car or VSC on lap${by('sc').length > 1 ? 's' : ''} ${ranges(by('sc'))}`].filter(Boolean);
    return parts.length ? `: ${listJoin(parts)}` : '';
  };
  const swarm = (x) => {
    const W = 440, cx = 220, k = 160 / 700; let o = `<rect x="${cx - x.sd * k}" y="20" width="${2 * x.sd * k}" height="70" rx="4" fill="var(--green)" opacity=".14"/>`;
    for (const v of [-FLYER, FLYER]) o += `<line x1="${cx + v * k}" x2="${cx + v * k}" y1="14" y2="96" stroke="var(--red)" stroke-dasharray="3 3" opacity=".6"/>`;
    o += `<line x1="${cx}" x2="${cx}" y1="14" y2="96" stroke="var(--fg)" opacity=".45"/>`;
    const placed = [];
    x.res.slice().sort((a, b) => a.r - b.r).forEach(q => { const X = cx + Math.max(-215, Math.min(215, q.r * k)) - (Math.abs(q.r * k) > 215 ? 0 : 0); let Y = 55, j = 0; while (placed.some(p => Math.hypot(p[0] - X, p[1] - Y) < 9) && j < 12) { j++; Y = 55 + (j % 2 ? 1 : -1) * Math.ceil(j / 2) * 9; } placed.push([X, Y]); o += `<circle cx="${X.toFixed(1)}" cy="${Y}" r="4" fill="${Math.abs(q.r) > FLYER ? 'var(--red)' : 'var(--fg)'}"><title>Lap ${q.n}: ${q.r > 0 ? '+' : '−'}${(Math.abs(q.r) / 1000).toFixed(3)} s</title></circle>`; });
    for (const v of [-FLYER, -300, 0, 300, FLYER]) o += `<text x="${cx + v * k}" y="112" class="gx-tick" text-anchor="middle">${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v / 1000).toFixed(1)} s</text>`;
    return `<div class="gx-chart"><svg viewBox="0 0 ${W} 120">${o}</svg></div>`;
  };
  // the stint lap by lap: lap times (quicker up) and the set's wear on one chart, each lap's band faded in the colour
  // the timeline gives it (clean air, within a second, battle, safety car, pits). A lap far off the stint's pace (the
  // pits, a safety car) is left off the line so the rest stays readable, but keeps its band.
  const wearOf = g.wear?.[d] || [];
  const stintChart = (x) => {
    const W = 440, H = 176, l = 50, r = 38, t = 10, b = 24; const n0 = x.from, n1 = x.to; const span = Math.max(1, n1 - n0);
    const X = (n) => l + (n - n0) / span * (W - l - r); const bw = Math.max(2, (W - l - r) / (span + 1));
    const med = median(x.laps.filter(q => q.ms && !['pit', 'sc', 'start', 'restart', 'none'].includes(q.tag)).map(q => q.ms)) || median(x.laps.map(q => q.ms).filter(Boolean));
    const keep = x.laps.filter(q => q.ms && med && q.ms <= med * 1.04 && q.ms >= med * 0.97);
    if (!keep.length) return '';
    let lo = Math.min(...keep.map(q => q.ms)), hi = Math.max(...keep.map(q => q.ms)); const pad = Math.max(150, (hi - lo) * 0.12); lo -= pad; hi += pad;
    const Y = (ms) => t + (ms - lo) / (hi - lo) * (H - t - b); // quicker at the top
    const wv = x.laps.map(q => wearOf[q.n - 1]).filter(v => v != null); const wTop = Math.max(40, Math.ceil(Math.max(0, ...wv) / 10) * 10 + 10);
    const WY = (v) => H - b - v / wTop * (H - t - b);
    let o = x.laps.map(q => `<rect x="${(X(q.n) - bw / 2).toFixed(1)}" y="${t}" width="${bw.toFixed(1)}" height="${H - t - b}" fill="${DB_TAGS[q.tag][0]}" opacity=".16"><title>Lap ${q.n}: ${DB_TAGS[q.tag][1]}</title></rect>`).join('');
    for (let k = 0; k <= 3; k++) { const ms = lo + (hi - lo) * k / 3; const yy = Y(ms); o += `<line x1="${l}" x2="${W - r}" y1="${yy}" y2="${yy}" class="gx-grid"/><text x="${l - 6}" y="${yy + 3}" class="gx-tick gx-sm" text-anchor="end">${fmtLap(ms).replace(/(.d)d+$/, '$1')}</text>`; }
    for (let k = 0; k <= 2; k++) { const v = wTop * k / 2; o += `<text x="${W - r + 6}" y="${WY(v) + 3}" class="gx-tick gx-sm gx-wear">${Math.round(v)}%</text>`; }
    const st = span > 30 ? 10 : span > 12 ? 5 : 2; for (let n = Math.ceil(n0 / st) * st; n <= n1; n += st) o += `<text x="${X(n)}" y="${H - 8}" class="gx-tick gx-sm" text-anchor="middle">L${n}</text>`;
    const wc = gxCol(COMPOUNDS[x.c]?.[2] || '#C9CFDC');
    const wpts = x.laps.filter(q => wearOf[q.n - 1] != null).map(q => `${X(q.n).toFixed(1)},${WY(wearOf[q.n - 1]).toFixed(1)}`);
    if (wpts.length > 1) o += `<polyline fill="none" stroke="${wc}" stroke-width="2.5" stroke-dasharray="6 4" stroke-linejoin="round" points="${wpts.join(' ')}"/>`;
    // the lap times: a line through the laps kept, broken where one is left off
    const segs = []; let cur = []; for (const q of x.laps) { if (keep.includes(q)) cur.push(q); else if (cur.length) { segs.push(cur); cur = []; } } if (cur.length) segs.push(cur);
    for (const sg of segs) if (sg.length > 1) o += `<polyline fill="none" stroke="#E7ECF5" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" points="${sg.map(q => `${X(q.n).toFixed(1)},${Y(q.ms).toFixed(1)}`).join(' ')}"/>`;
    o += keep.map(q => `<circle cx="${X(q.n).toFixed(1)}" cy="${Y(q.ms).toFixed(1)}" r="2.6" fill="#E7ECF5"><title>Lap ${q.n}: ${fmtLap(q.ms)}${wearOf[q.n - 1] != null ? `, ${Math.round(wearOf[q.n - 1])}% worn` : ''}</title></circle>`).join('');
    return `<div class="gx-chart"><svg viewBox="0 0 ${W} ${H}">${o}</svg></div><div class="db-stint-lg"><span><i class="lt"></i>Lap times</span><span><i class="wr" style="border-color:${wc}"></i>Tyre wear (right)</span>${x.laps.length - keep.length ? `<span class="muted">${plural(x.laps.length - keep.length, 'lap')} off the stint’s pace left off the line</span>` : ''}</div>`;
  };
  const cards = G.map((x, k) => `<div class="db-card"><h3>${tyreChip(x.c)} Stint ${k + 1} · laps ${x.from}–${x.to}</h3>${x.sd == null
    ? `<p class="muted db-none">No group: ${plural(x.clean, 'clean-air lap')} of ${x.to - x.from + 1}${why(x)}.</p>`
    : `<div class="db-big"><div><b>±${(x.sd / 1000).toFixed(2)} s</b><span>group (1 standard deviation)</span></div><div><b>${dbSecs(x.spread, 2)}</b><span>slowest to quickest</span></div><div><b>${x.fly}</b><span>${x.fly === 1 ? 'flyer' : 'flyers'}</span></div><div><b>${x.clean}</b><span>clean-air laps of ${x.to - x.from + 1}</span></div></div>${swarm(x)}`}${stintChart(x)}</div>`).join('');
  const F = dbFieldGrouping(sd); const best = F[0]?.sd; const at = F.findIndex(x => x.d === d);
  const field = F.length ? `<div>${tvBoard('The field’s tightest groups · at least 10 clean-air laps', [{ h: '', w: '30px' }, { h: '', w: '26px' }, { h: 'Driver', w: 'minmax(130px, 1.4fr)' }, { h: 'Team', w: 'minmax(100px, 1fr)' }, { h: 'Group', w: '84px', num: true }, { h: 'Laps', w: '54px', num: true }, { h: '', w: 'minmax(80px, 1fr)' }], F.map((x, k) => ({ me: x.d === d, act: 'open-driver', id: x.d, cells: [k + 1, tvLogo(c, teamOf(s, x.d)), `<b>${esc(dName(s, x.d).toUpperCase())}</b>`, `<small>${esc(teamOf(s, x.d)?.name || '')}</small>`, `±${(x.sd / 1000).toFixed(3)} s`, x.n, `<span class="tvb-bar"><i style="width:${Math.round(best / x.sd * 100)}%;background:${teamColor(s, x.d)}"></i></span>`] })))}${at < 0 ? `<p class="muted" style="font-size:12px;margin:4px 0 0">${esc(lastName(dName(s, d)))} had too few clean-air laps to rank.</p>` : ''}</div>` : '';
  return `<div class="panel"><div class="panel-h"><h2>Grouping${title ? ` · ${esc(title)}` : ''}</h2><span class="muted" style="font-size:12px">How tightly the clean-air laps grouped, stint by stint</span></div><div class="panel-b stack">
    <div><span class="label">Every lap of the race</span>${strip}</div>
    <p class="muted" style="font-size:12px;margin:0">A clean-air lap: more than a second clear of the car ahead (any car, lapped ones too) at both ends of the lap, no pass for or against on the lap or the laps either side, green flags, and not the first lap, a restart lap or a lap in or out of the pits. Each lap is measured from the stint’s own fall-off line, not the average, as the tyres slow you through a stint. A <b>flyer</b> is a lap more than 0.6 s off the line: counted, but kept out of the group.</p>
    <div class="db-cards">${cards}</div>${field}</div></div>`;
}

/**
 * The sets you had for the race, { c: [wear when the race began] }, or null without the game's data. The race's own
 * snapshot lists every set still yours at the flag (the race sets only become available in the race, so the one taken
 * after qualifying hasn't got them); each set's wear going in is from the last snapshot before the race.
 */
function dbRaceSets(s, r, sd, d) {
  if (d !== PLAYER) return null; const T = sd.game?.tyreSets?.sets; if (!T?.length) return null;
  const w = s.weekends[r.id]?.sessions || {}; const before = ['Q', 'SQ', 'SPR', 'FP3', 'FP2', 'FP1'].map(k => w[k]?.game?.tyreSets?.sets).find(x => x?.length === T.length);
  const out = {}; T.forEach((x, i) => { if (x.avail || x.fitted) (out[x.c] ||= []).push(before ? before[i].wear || 0 : 0); });
  for (const k in out) out[k].sort((a, b) => a - b);
  return out;
}
/** Wear a lap on each compound in this race, from the driver's own stints: { c: % a lap }. */
function dbRaceWear(sd, d) {
  const wear = sd.game?.wear?.[d] || []; const by = {};
  for (const x of dbStints(sd, d)) { const first = x.from === 1; const w0 = first ? 0 : wear[x.from - 1]; const w1 = wear[x.to - 1]; const n = first ? x.to : x.to - x.from; if (w1 != null && w0 != null && w1 > w0 && n >= 3) (by[x.c] ||= []).push((w1 - w0) / n); }
  return Object.fromEntries(Object.entries(by).map(([c, v]) => [c, avg(v)]));
}
/** Pace on each compound in this race, by tyre age: { c: { a, b, n } } (a + b × age), from green laps near the stint's pace. */
function dbRacePace(sd, d) {
  const tags = dbLapTags(sd, d); const out = {};
  for (const x of dbStints(sd, d)) {
    const pts = tags.slice(x.from - 1, x.to).filter(l => !l.tag || l.tag === 'dirty' || l.tag === 'battle').map(l => [l.n - x.from + 1, l.ms]);
    const med = median(pts.map(p => p[1])); const use = pts.filter(p => p[1] <= med * 1.03);
    (out[x.c] ||= []).push(...use);
  }
  for (const c of Object.keys(out)) { const f = out[c].length >= 4 ? fitLine(out[c]) : null; if (f) out[c] = { a: f.a, b: Math.max(0, f.b), n: out[c].length }; else delete out[c]; }
  return out;
}
/** The strategy debrief panel for one driver. */
function strategyDebrief(c, s, r, sd, key, d, title) {
  const g = sd.game; const laps = g.laps?.[d]; if (!laps?.length) return '';
  const st = dbStints(sd, d); const N = laps.length; const sc = dbScLaps(g); const PL = pitLoss(c, trackOf(r));
  const pace = dbRacePace(sd, d); const raceWear = dbRaceWear(sd, d); const nm = (x) => esc(lastName(dName(s, x)));
  const verdict = []; const parts = [];
  // 1. when to stop: each stop moved on its own, the others where they were
  const stopCharts = st.slice(0, -1).map((A, k) => {
    const B = st[k + 1]; const pa = pace[A.c], pb = pace[B.c]; if (!pa || !pb) return '';
    if (isSlick(A.c) !== isSlick(B.c)) return ''; // a change for the weather: the weather calls below judge it
    // how long each set could have run: from its wear going in (the lap before its first, at this race's rate), to 75%
    const wear = g.wear?.[d] || []; const ra = raceWear[A.c], rb = raceWear[B.c];
    const w0A = A.from === 1 ? Math.max(0, (wear[0] ?? 0) - (ra || 0)) : Math.max(0, (wear[A.from - 1] ?? 0) - (ra || 0));
    const w0B = Math.max(0, (wear[B.from - 1] ?? 0) - (rb || 0));
    const maxA = ra > 0 ? A.from - 1 + Math.floor((WEAR_LIMIT - w0A) / ra) : Infinity, minB = rb > 0 ? B.to - Math.floor((WEAR_LIMIT - w0B) / rb) : -Infinity;
    const lo = Math.max(A.from + 2, 3, minB), hi = Math.min(B.to - 3, N - 2, maxA); if (hi - lo < 3) return '';
    const capped = maxA < Math.min(B.to - 3, N - 2) || minB > Math.max(A.from + 2, 3);
    const T = (L, loss) => { let t = loss; for (let n = A.from; n <= L; n++) t += pa.a + pa.b * (n - A.from + 1); for (let n = L + 1; n <= B.to; n++) t += pb.a + pb.b * (n - L); return t; };
    const lossAt = (L) => sc.has(L) ? (g.safety?.periods || []).some(p => p.kind === 'sc' && L >= p.from && L <= (p.to > 0 ? p.to : p.from)) ? PL.sc : PL.vsc : PL.green;
    let pts = []; for (let L = lo; L <= hi; L++) pts.push([L, T(L, PL.green)]);
    const bestP = pts.reduce((a, p) => p[1] < a[1] ? p : a); const actual = T(A.to, lossAt(A.to)); const diff = actual - bestP[1];
    // the chart shows the laps within 30 s of the best (and your stop)
    pts = pts.filter(p => p[1] - bestP[1] <= 30000 || p[0] === A.to); const lo2 = Math.min(pts[0][0], A.to), hi2 = Math.max(pts[pts.length - 1][0], A.to);
    const under = sc.has(A.to); const where = `lap ${A.to}${under ? ' under the safety car' : ''}`;
    const line = Math.abs(diff) < 1000 ? `Your stop on ${where} was as good as any (the best green-flag stop was lap ${bestP[0]})` : diff < 0 ? `Stopping on ${where} was worth <b class="up">about ${dbSecs(diff, 0)}</b> against the best green-flag stop (lap ${bestP[0]})` : `Stopping on ${where} cost <b class="down">about ${dbSecs(diff, 0)}</b> against stopping on lap ${bestP[0]}`;
    verdict.push(line + (st.length > 2 ? ` (stop ${k + 1})` : ''));
    // the chart: time lost against the best lap, the safety car shaded, your stop marked
    const W = 520, H = 220, l = 44, rr = 12, t = 14, b = 30; const vals = pts.map(p => (p[1] - bestP[1]) / 1000); const top = Math.min(40, Math.max(5, ...vals)); const bot = Math.min(0, diff / 1000) - 2;
    const X = (L) => l + (L - lo2) / Math.max(1, hi2 - lo2) * (W - l - rr); const Y = (v) => t + (top - Math.min(top, v)) / (top - bot) * (H - t - b);
    let o = ''; const step = top - bot > 30 ? 10 : 5;
    for (let v = Math.ceil(bot / step) * step; v <= top; v += step) o += `<line x1="${l}" x2="${W - rr}" y1="${Y(v)}" y2="${Y(v)}" class="gx-grid"/><text x="${l - 6}" y="${Y(v) + 4}" class="gx-tick gx-sm" text-anchor="end">${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)} s</text>`;
    const tick = hi2 - lo2 > 30 ? 10 : 5; for (let L = Math.ceil(lo2 / tick) * tick; L <= hi2; L += tick) o += `<text x="${X(L)}" y="${H - 10}" class="gx-tick gx-sm" text-anchor="middle">L${L}</text>`;
    const scIn = [...sc].filter(n => n >= lo2 && n <= hi2); if (scIn.length) { const a = Math.min(...scIn), z = Math.max(...scIn); o += `<rect x="${X(a) - 4}" y="${t}" width="${X(z) - X(a) + 8}" height="${H - t - b}" fill="var(--yellow)" opacity=".08"/><text x="${(X(a) + X(z)) / 2}" y="${t + 12}" class="gx-sc" style="font-size:${Math.min(10, (X(z) - X(a) + 8) / 6.4).toFixed(1)}px" text-anchor="middle">SAFETY CAR</text>`; }
    o += `<polyline fill="none" stroke="#C9CFDC" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" points="${pts.map((p, i) => `${X(p[0]).toFixed(1)},${Y(vals[i]).toFixed(1)}`).join(' ')}"/>`;
    // the two labels: each tries its spots in turn (above, below or beside its dot) until neither overlaps the other
    const bx = X(bestP[0]), by = Y(0); const ax = X(A.to), ay = Y(diff / 1000); const col = diff <= 1000 ? 'var(--green)' : 'var(--red)'; const right = ax < W * 0.6;
    const bTxt = `Best green-flag stop, lap ${bestP[0]}`, yTxt = `You: lap ${A.to}, ${diff < 0 ? '−' : '+'}${dbSecs(diff)}`;
    const bW = bTxt.length * 5, yW = yTxt.length * 5.3; const bAnc = bx < l + bW / 2 ? 'start' : bx > W - rr - bW / 2 ? 'end' : 'middle';
    const bX0 = bAnc === 'start' ? bx : bAnc === 'end' ? bx - bW : bx - bW / 2; const yX0 = right ? ax + 10 : ax - 10 - yW;
    const box = (x0, w, y) => ({ x0, x1: x0 + w, y0: y - 9, y1: y + 2 }); const hit = (p, q) => p.x0 < q.x1 + 4 && q.x0 < p.x1 + 4 && p.y0 < q.y1 + 2 && q.y0 < p.y1 + 2;
    let bY = by - 10, yY = ay + 4;
    for (const [b1, y1] of [[by - 10, ay + 4], [by + 17, ay + 4], [by - 10, ay + 19], [by + 17, ay - 11], [by - 10, ay - 11], [by + 17, ay + 19]]) {
      if (!hit(box(bX0, bW, b1), box(yX0, yW, y1)) && !(Math.abs(ax - bx) < 2 && Math.abs(ay - by) < 2 && b1 === y1)) { bY = b1; yY = y1; break; }
    }
    o += `<circle cx="${bx}" cy="${by}" r="4" fill="var(--muted)"/><text x="${bx}" y="${bY}" class="gx-lab" text-anchor="${bAnc}">${bTxt}</text>`;
    o += `<circle cx="${ax}" cy="${ay}" r="6" fill="${col}"/><text x="${right ? ax + 10 : ax - 10}" y="${yY}" style="fill:${col}" class="gx-lab gx-you" text-anchor="${right ? 'start' : 'end'}">${yTxt}</text>`;
    return `<div><span class="label">When to stop${st.length > 2 ? ` · stop ${k + 1}` : ''}: time lost against the best lap, on this race’s pace</span><div class="gx-chart"><svg viewBox="0 0 ${W} ${H}">${o}</svg></div>
      <p class="muted" style="font-size:12px;margin:0">From the pace and fall-off on each tyre in this race (${COMPOUNDS[A.c]?.[1] || 'tyre'} ${(pa.b / 1000).toFixed(3)} s a lap, ${COMPOUNDS[B.c]?.[1] || 'tyre'} ${(pb.b / 1000).toFixed(3)} s) and a ${dbSecs(PL.green)} stop${under ? `; under the safety car it costs ${dbSecs(lossAt(A.to))}` : ''}.${capped ? ` Only laps where neither set would have gone past ${WEAR_LIMIT}% wear (at this race’s rate, from the wear each set had) are shown: laps ${lo}–${hi}.` : ''}</p></div>`;
  }).filter(Boolean);
  // 2. through the stops: the cars around you before each of your stops, and after everyone's stop
  const P = lapPositions(sd); const X = dbCrossings(g);
  const through = P ? st.slice(0, -1).map((A, k) => {
    const L0 = Math.max(1, A.to - 1); const me0 = P.pos[d]?.[L0]; if (!me0) return '';
    const near = P.ids.filter(o => P.pos[o]?.[L0] && Math.abs(P.pos[o][L0] - me0) <= 2);
    const stopOf = (o) => dbStints(sd, o).slice(0, -1).map(x => x.to).find(v => Math.abs(v - A.to) <= 12) ?? null;
    let L1 = Math.max(A.to, ...near.map(o => stopOf(o) || 0)) + 2; while (L1 < N - 1 && (sc.has(L1) || sc.has(L1 - 1))) L1++; L1 = Math.min(N - 1, L1);
    const gapAhead = (o, L) => { const order = P.ids.filter(q => P.pos[q]?.[L]).sort((a, b) => P.pos[a][L] - P.pos[b][L]); const i = order.indexOf(o); return i > 0 && X.cum[o]?.[L - 1] && X.cum[order[i - 1]]?.[L - 1] ? X.cum[o][L - 1] - X.cum[order[i - 1]][L - 1] : null; };
    // a car that stops later than this (a different plan) is still to stop at lap L1: its place there is before its stop
    const later = (o) => dbStints(sd, o).slice(0, -1).some(x => x.to >= L1);
    const rows = near.sort((a, b) => P.pos[a][L0] - P.pos[b][L0]).map(o => {
      const a = P.pos[o][L0], b2 = P.pos[o]?.[L1]; const so = stopOf(o); const g0 = gapAhead(o, L0), g1 = gapAhead(o, L1); const mv = a && b2 ? a - b2 : 0;
      return { me: o === d, act: 'open-driver', id: o, cells: [P.pos[o][L0], tvLogo(c, teamOf(s, o)), `<b>${esc(lastName(dName(s, o)).toUpperCase())}</b>`, so ? `lap ${so}` : `<small>${later(o) ? 'yet to stop' : 'stayed out'}</small>`, `P${a}`, b2 ? `<span class="${mv > 0 ? 'up' : mv < 0 ? 'down' : ''}">P${b2}${mv ? ` ${mv > 0 ? '▲' : '▼'}${Math.abs(mv)}` : ''}</span>` : '–', g0 != null && g1 != null ? `${dbSecs(g0)} → ${dbSecs(g1)}` : '–'] };
    });
    // undercuts and overcuts: a car next to you that stopped on a different lap
    const calls = near.filter(o => o !== d).map(o => {
      const so = stopOf(o); if (!so || so === A.to || so >= L1) return null;
      const was = P.pos[o][L0] < me0, now = (P.pos[o]?.[L1] ?? 99) < (P.pos[d]?.[L1] ?? 99); const meFirst = A.to < so;
      if (was === now) return meFirst ? `${was ? `Your undercut on ${nm(o)} didn’t work: still behind` : `${nm(o)}’s overcut on you didn’t work: you stayed ahead`}` : `${was ? `Your overcut on ${nm(o)} didn’t work: still behind` : `${nm(o)}’s undercut on you didn’t work: you stayed ahead`}`;
      return meFirst ? (was ? `<b class="up">Your undercut on ${nm(o)} worked</b>` : `<b class="down">${nm(o)}’s overcut worked: they got ahead</b>`) : (was ? `<b class="up">Your overcut on ${nm(o)} worked</b>` : `<b class="down">${nm(o)}’s undercut worked: they got ahead</b>`);
    }).filter(Boolean);
    const same = near.filter(o => o !== d && stopOf(o) === A.to).length;
    return `<div class="db-tv">${tvBoard(`Through ${st.length > 2 ? `stop ${k + 1}` : 'the stop'} · lap ${L0} against lap ${L1}`, [{ h: '', w: '26px' }, { h: '', w: '26px' }, { h: 'Driver', w: 'minmax(110px, 1fr)' }, { h: 'Stopped', w: '84px', num: true }, { h: `Lap ${L0}`, w: '60px', num: true }, { h: `Lap ${L1}`, w: '74px', num: true }, { h: 'Gap ahead', w: '120px', num: true }], rows)}
      <p class="muted" style="font-size:12px;margin:4px 0 0">${calls.length ? calls.join('. ') + '.' : same ? `The cars around you stopped on the same lap, so there was no undercut either way.` : 'No undercut or overcut either way.'}</p></div>`;
  }).filter(Boolean) : [];
  // 3. the forecasts against the race
  const keys = strategyKeys(s, r).keys.filter(k => k !== key && !(key === 'SPR' && k === 'R'));
  const runs = practiceRuns(s, r, d, keys); orderTyres(runs); fillTyres({}, runs);
  const wear = g.wear?.[d] || [];
  const fc = [...new Set(st.map(x => x.c))].filter(cp => DRY.includes(cp)).map(cp => {
    const F = runs[cp]; const ss = st.filter(x => x.c === cp);
    const wr = ss.map(x => { const first = x.from === 1; const w0 = first ? 0 : wear[x.from - 1]; const w1 = wear[x.to - 1]; const n = first ? x.to : x.to - x.from; return w1 != null && w0 != null && w1 > w0 && n >= 3 ? (w1 - w0) / n : null; }).filter(v => v != null);
    const rw = wr.length ? avg(wr) : null; const rb = pace[cp]?.b ?? null;
    if (!F || (rw == null && rb == null)) return null;
    const ratio = F.wear > 0 && rw != null ? rw / F.wear : null;
    let v = ''; let cls = '';
    if (ratio != null && ratio >= 1.4) { v = `Wore ${ratio.toFixed(1)}× faster than forecast${F.life ? `: good for about ${Math.round(WEAR_LIMIT / rw)} laps, not ${F.life}` : ''}`; cls = 'down'; }
    else if (ratio != null && ratio <= 0.7) { v = `Wore ${(1 / ratio).toFixed(1)}× slower than forecast: good for about ${Math.round(WEAR_LIMIT / rw)} laps`; cls = 'up'; }
    else if (ratio != null && Math.abs(ratio - 1) >= 0.12) { v = `Wore ${Math.round(Math.abs(ratio - 1) * 100)}% ${ratio > 1 ? 'faster' : 'slower'} than forecast`; cls = 'warn'; }
    else if (ratio != null) v = 'Wear as forecast';
    if (rb != null && F.deg != null && Math.abs(rb - F.deg) >= 60) v += `${v ? '; ' : ''}${rb > F.deg ? 'lost more time as it wore' : 'held its pace better'} than practice showed`;
    return { cp, F, rw, rb, v, cls, ratio };
  }).filter(Boolean);
  const worst = fc.filter(x => x.ratio != null).sort((a, b) => Math.abs(Math.log(b.ratio)) - Math.abs(Math.log(a.ratio)))[0];
  if (worst && Math.abs(worst.ratio - 1) >= 0.4) verdict.push(`The ${(COMPOUNDS[worst.cp]?.[1] || 'tyre').toLowerCase()} wore <span class="${worst.cls}">${worst.ratio >= 1 ? `${worst.ratio.toFixed(1)}× faster` : `${(1 / worst.ratio).toFixed(1)}× slower`}</span> than practice said`);
  if (fc.length) parts.push(`<div><span class="label">The forecasts against the race</span><div class="table-wrap"><table class="db-tbl"><thead><tr><th>Tyre</th><th class="num">Wear a lap: forecast</th><th class="num">Race</th><th class="num">Fall-off a lap: forecast</th><th class="num">Race</th><th>Verdict</th></tr></thead><tbody>
    ${fc.map(x => `<tr><td>${tyreChip(x.cp)} ${COMPOUNDS[x.cp]?.[1] || ''}${x.F.src ? ' <span class="muted" title="' + esc(x.F.src) + '">(estimated)</span>' : ''}</td><td class="num">${x.F.wear != null ? x.F.wear.toFixed(2) + '%' : '–'}</td><td class="num">${x.rw != null ? x.rw.toFixed(2) + '%' : '–'}</td><td class="num">${x.F.deg != null ? (x.F.deg / 1000).toFixed(3) + ' s' : '–'}</td><td class="num">${x.rb != null ? (x.rb / 1000).toFixed(3) + ' s' : '–'}</td><td class="${x.cls}">${x.v || '–'}</td></tr>`).join('')}</tbody></table></div>
    <p class="muted" style="font-size:12px;margin:4px 0 0">The forecast is from the practice${keys.includes('SPR') ? ' and sprint' : ''} runs before this race; “estimated” means a tyre that wasn’t run, worked out from the others.</p></div>`);
  // 4. in a wet race: each change between slicks and inters against the crossover, from the field's laps
  const wetChanges = st.slice(0, -1).map((A, k) => ({ A, B: st[k + 1] })).filter(({ A, B }) => isSlick(A.c) !== isSlick(B.c) && (A.c === 7 || B.c === 7 || A.c === 8 || B.c === 8));
  if (wetChanges.length) {
    const ids = Object.keys(g.laps); const stOf = Object.fromEntries(ids.map(o => [o, dbStints(sd, o)]));
    const on = (o, n) => { const x = stOf[o].find(y => n >= y.from && n <= y.to); return x && n !== x.from && n !== x.to ? x.c : null; };
    const medBy = (n, slick) => median(ids.map(o => { const cp = on(o, n); return cp != null && isSlick(cp) === slick && !sc.has(n) ? g.laps[o][n - 1]?.[0] : null; }).filter(Boolean));
    const diffAt = (n) => { const a = medBy(n, true), b = medBy(n, false); return a && b ? a - b : null; }; // + : inters quicker
    const rows = wetChanges.map(({ A, B }) => {
      const toWet = isSlick(A.c); let cross = null;
      for (let n = 2; n <= N; n++) { const v = diffAt(n); if (v != null && (toWet ? v > 0 : v < 0)) { cross = n; break; } }
      if (!cross) return `<tr><td>${tyreChip(A.c)} → ${tyreChip(B.c)}</td><td class="num">lap ${A.to}</td><td class="num">–</td><td class="muted">No lap with cars on both tyres to compare: the field changed together</td></tr>`;
      const a = Math.min(A.to + 1, cross), z = Math.max(A.to + 1, cross); let lost = 0; for (let n = a; n < z; n++) lost += Math.abs(diffAt(n) || 0);
      const early = A.to + 1 < cross; const txt = Math.abs(A.to + 1 - cross) <= 1 ? 'Right on the crossover' : `${early ? 'Early' : 'Late'} by ${plural(Math.abs(A.to + 1 - cross), 'lap')}: about ${dbSecs(lost, 0)} lost`;
      if (Math.abs(A.to + 1 - cross) > 1) verdict.push(`The change to ${toWet ? 'inters' : 'slicks'} came ${early ? 'early' : 'late'} and cost about ${dbSecs(lost, 0)}`);
      return `<tr><td>${tyreChip(A.c)} → ${tyreChip(B.c)}</td><td class="num">lap ${A.to}</td><td class="num">lap ${cross - 1}</td><td class="${Math.abs(A.to + 1 - cross) <= 1 ? 'up' : 'down'}">${txt}</td></tr>`;
    }).join('');
    parts.push(`<div><span class="label">The weather calls</span><div class="table-wrap"><table class="db-tbl"><thead><tr><th>Change</th><th class="num">You stopped</th><th class="num">Best lap to stop</th><th>Verdict</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="muted" style="font-size:12px;margin:4px 0 0">The best lap to stop is the one before the other tyre first ran quicker across the field (the median of the cars on each).</p></div>`);
  }
  if (!stopCharts.length && !through.length && !parts.length) return '';
  return `<div class="panel"><div class="panel-h"><h2>Strategy debrief${title ? ` · ${esc(title)}` : ''}</h2><span class="muted" style="font-size:12px">From the laps in this race: how each choice played out</span></div><div class="panel-b stack">
    ${verdict.length ? `<p class="db-verdict">${verdict.join('. ')}.</p>` : st.length === 1 ? `<p class="db-verdict">No stops: the whole race on one set of ${(COMPOUNDS[st[0].c]?.[1] || 'tyres').toLowerCase()}s.</p>` : ''}
    ${stopCharts.length ? `<div class="db-two">${stopCharts.join('')}</div>` : ''}
    ${through.length ? `<div class="db-two wide">${through.join('')}</div>` : ''}
    ${parts.join('')}</div></div>`;
}

/*
  Debriefs: every race and sprint of the career, to come back to. The debrief between weekends only shows the last
  one; here any can be picked, by season and round (all of it is worked out again from the logged sessions).
*/
function renderDebriefs() {
  const c = career(); const list = [];
  for (const s of playedSeasons(c)) for (const r of activeRounds(s)) for (const key of ['SPR', 'R']) if (s.weekends[r.id]?.sessions?.[key]?.done) list.push({ s, r, key, v: `${s.index}:${r.id}:${key}` });
  const head = `<div class="page-head"><div><h1>Debriefs</h1><div class="sub">Every race and sprint of your career, to look back on</div></div>${nowTabs()}</div>`;
  if (!list.length) return `<div class="page">${head}<div class="panel"><div class="panel-b muted">No race logged yet: each race’s debrief is kept here once it’s logged.</div></div></div>`;
  const pick = list.find(x => x.v === ui.dbPick) || list[list.length - 1];
  const seasons = [...new Set(list.map(x => x.s))];
  const inSeason = list.filter(x => x.s === pick.s);
  const label = (x) => `${esc(x.r.name)}${x.key === 'SPR' ? ' <small>sprint</small>' : ''}`;
  return `<div class="page">${head}
    <div class="panel"><div class="panel-b db-picker">
      ${seasons.length > 1 ? `<select data-ch="db-season" style="width:auto">${seasons.map(s => `<option value="${s.index}" ${s === pick.s ? 'selected' : ''}>${s.year}</option>`).join('')}</select>` : `<b>${pick.s.year}</b>`}
      <div class="db-rounds">${inSeason.map(x => `<button class="btn sm ${x === pick ? 'primary' : 'ghost'}" data-act="db-pick" data-v="${x.v}">${label(x)}</button>`).join('')}</div>
    </div></div>
    ${debrief(c, pick.s, pick.r, pick.key, { kept: true })}</div>`;
}
