/* Pitwall — Live Session: practice and qualifying live. Part of the renderer, split into files that load in order (see index.html). */
'use strict';
/*
  Live Session follows every session of the weekend, not just the race. A race keeps the race dashboard (strategy, pit
  calls, battles). Practice and qualifying get a timing dashboard instead, built for laps rather than stops:
  - where you are on the timing sheet, and your gap to the top
  - the lap you're on, sector by sector (purple quickest of anyone, green your own best)
  - in qualifying, the cut-off, and how far you are either side of it
  - the traffic around you on track
  - tyre, fuel and battery
  - your recent laps
  - the whole field's timing tower
  The race engineer works here too (13c-engineer.js), with calls and answers made for laps.
*/
const LIVE_KIND = (t) => t >= 15 ? 'race' : t >= 5 ? 'quali' : 'practice';
// each game session's short name, for the clock
const LS_SHORT = { 1: 'FP1', 2: 'FP2', 3: 'FP3', 4: 'FP', 5: 'Q1', 6: 'Q2', 7: 'Q3', 8: 'Q', 9: 'OSQ', 10: 'SQ1', 11: 'SQ2', 12: 'SQ3', 13: 'SQ', 14: 'OSSQ' };
const LS_STATUS = { 0: 'In the garage', 1: 'Flying lap', 2: 'In lap', 3: 'Out lap', 4: 'On track' };
const lsClock = (sec) => sec == null ? '–' : `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
const lsGap = (ms) => ms == null ? '' : `${ms >= 0 ? '+' : '−'}${(Math.abs(ms) / 1000).toFixed(3)}`;
/** The timing sheet: every car with a place, in order, with its best lap and gap to the quickest. */
function lsOrder(L) {
  const run = L.field.filter(x => x.pos > 0).sort((a, b) => a.pos - b.pos);
  const top = Math.min(...run.map(x => x.best).filter(v => v > 0)); return { run, top: isFinite(top) ? top : null };
}
/**
 * Qualifying's cut-off: the last place that goes through (Q1 and Q2, and the sprint shootout's first two parts; the
 * same number drops out of each, so with 20 cars the cut is P15 then P10). { part, cut, safe, margin, rival } where
 * margin is ms to the car the other side of the line (positive: clear of it). Null when nobody drops out.
 */
function lsCut(L, me) {
  const part = QUALI_PARTS[L.sessionType]; if (!part || part === 3) return null;
  const n = L.field.filter(x => x.st > 0 || x.pos > 0).length || L.field.length; const out = Math.max(1, Math.round((n - 10) / 2));
  const cut = part === 1 ? n - out : 10; const { run } = lsOrder(L);
  const safe = me.pos > 0 && me.pos <= cut;
  const rival = run.find(x => x.pos === (safe ? cut + 1 : cut)) || null;
  const margin = rival?.best && me.best ? (safe ? rival.best - me.best : me.best - rival.best) * (safe ? 1 : -1) : null;
  return { part, cut, safe, margin, rival };
}
/** The cars just ahead and behind you on the track (not the timing sheet): metres, an estimate in seconds, and what they're doing. */
function lsTraffic(L, me) {
  const len = L.lapLen || 5000; if (me.dist == null || me.ds === 0) return null;
  const pace = len / ((me.best || me.last || 90000) / 1000); // metres a second on a lap
  const on = L.field.filter(x => x.i !== me.i && x.ds && x.ds !== 0 && !x.pit && x.dist != null && x.st === 2);
  const ahead = on.map(x => ({ x, m: ((x.dist - me.dist) % len + len) % len })).sort((a, b) => a.m - b.m)[0] || null;
  const behind = on.map(x => ({ x, m: ((me.dist - x.dist) % len + len) % len })).sort((a, b) => a.m - b.m)[0] || null;
  const t = (o) => o && { ...o, s: o.m / pace };
  return { ahead: t(ahead), behind: t(behind) };
}
/** A sector's colour: purple if it's the quickest of anyone, green if it's your own best, yellow otherwise. */
function lsSecCls(v, mine, all) { if (!v) return ''; if (all && v <= all) return 'purple'; if (mine && v <= mine) return 'green'; return 'yellow'; }
function renderLiveTiming(c, s, r, L, tabs) {
  const map = liveMap(c, s, L); const idOf = (i) => map[i]; const me = L.field.find(x => x.i === L.player);
  const nm = (x) => esc(lastName(dName(s, idOf(x.i)) || x.name || '?'));
  const { run, top } = lsOrder(L); const quali = L.kind === 'quali';
  const allS = [0, 1, 2].map(k => { const v = L.field.map(x => x.bestS?.[k]).filter(Boolean); return v.length ? Math.min(...v) : null; });
  const title = GAME_SESSION_NAMES[L.sessionType] || SESSION_LABEL[L.key] || 'Session';
  let wx = ''; try { wx = liveWeather(c, s, r, L, me); } catch { wx = ''; }
  const head = `<div class="live-head"><div class="lapbox"><div class="lb-top">${gfxLogoUrl() ? '<span class="lb-mark" role="img" aria-label="F1"></span>' : '<span class="lb-f1">F1</span>'}<small>${esc(title.toUpperCase())}</small></div>
      <div class="lb-lap"><b>${LS_SHORT[L.sessionType] || ''}</b> ${L.timeLeft != null ? lsClock(L.timeLeft) : `LAP ${me?.lap || '–'}`}</div>${L.red ? '<div class="lb-sc red"><span class="lb-fia">FIA</span>RED FLAG</div>' : ''}</div>
    <div class="lh-info"><div class="row" style="gap:8px"><span class="tag live">Live</span><b>${esc(title)} · ${esc(r.name)}</b></div>${wx}</div></div>`;
  if (!me) return `<div class="page live-page">${tabs}${head}<div class="panel"><div class="panel-b muted">Waiting for your car in the session.</div></div></div>`;
  // you
  const gapTop = me.best && top ? me.best - top : null;
  const ahead = run.find(x => x.pos === me.pos - 1);
  const you = `<div class="panel live-card"><div class="panel-h"><h2>${esc(dName(s, PLAYER))}</h2><span class="muted" style="font-size:12px">${esc(LS_STATUS[me.ds] || '')}${me.lap ? ` · lap ${me.lap}` : ''}${me.inv ? ' · <b class="ls-inv">LAP INVALID</b>' : ''}</span></div>
    <div class="panel-b live-top"><div class="live-pos">${me.pos ? `P${me.pos}` : '–'}</div>
      <div><span class="label">Best lap</span><b>${me.best ? fmtLap(me.best) : 'No time'}</b></div>
      <div><span class="label">${me.pos === 1 ? 'Quickest' : 'To P1'}</span><b>${me.pos === 1 ? (run[1]?.best ? `${lsGap(run[1].best - me.best)} to ${nm(run[1])}` : '–') : gapTop != null ? lsGap(gapTop) : '–'}</b></div>
      <div><span class="label">${ahead ? `To ${nm(ahead)}` : 'Last lap'}</span><b>${ahead && ahead.best && me.best ? lsGap(me.best - ahead.best) : me.last ? fmtLap(me.last) : '–'}</b></div></div></div>`;
  // the lap: each sector of this lap as it's done (the last lap's until then), coloured
  const lastL = liveLaps(me).slice(-1)[0];
  const curS = [me.sector >= 1 ? me.s1 : null, me.sector >= 2 ? me.s2 : null, null];
  const secs = [0, 1, 2].map(k => { const v = curS[k]; const prev = lastL ? [lastL.s1, lastL.s2, lastL.s3][k] : null;
    const val = v || prev; const live = !!v;
    return `<div class="ls-sec ${lsSecCls(val, me.bestS?.[k], allS[k])} ${live ? 'now' : ''}"><span class="label">S${k + 1}${live ? '' : val ? ' · last lap' : ''}</span><b>${val ? (val / 1000).toFixed(3) : '–'}</b><small>${me.bestS?.[k] ? `best ${(me.bestS[k] / 1000).toFixed(3)}` : ''}</small></div>`; }).join('');
  const lapCard = `<div class="panel live-card"><div class="panel-h"><h2>This lap</h2><span class="muted" style="font-size:12px">${me.cur ? fmtLap(me.cur) : ''}${me.last ? ` · last ${fmtLap(me.last)}${me.best && me.last !== me.best ? ` (${lsGap(me.last - me.best)})` : ''}` : ''}</span></div>
    <div class="panel-b"><div class="ls-secs">${secs}</div><div class="muted" style="font-size:12px;margin-top:6px">Purple: quickest of anyone · green: your best${allS.every(Boolean) ? ` · ideal lap from the best sectors: ${fmtLap(allS[0] + allS[1] + allS[2])}` : ''}${me.bestS?.every(Boolean) ? ` · yours ${fmtLap(me.bestS[0] + me.bestS[1] + me.bestS[2])}` : ''}</div></div></div>`;
  // qualifying's cut-off
  const K = quali ? lsCut(L, me) : null;
  const cutCard = K ? `<div class="panel live-card ls-cut ${K.safe ? 'safe' : 'out'}"><div class="panel-h"><h2>The cut-off</h2><span class="muted" style="font-size:12px">${['', 'Q1', 'Q2'][K.part]}: the top ${K.cut} go through</span></div>
    <div class="panel-b"><b>${me.best ? (K.safe ? 'Through, as it stands' : 'In the drop zone') : 'No time yet'}</b><div style="font-size:13px">${K.rival && K.margin != null ? (K.safe ? `${(K.margin / 1000).toFixed(3)} clear of P${K.cut + 1} (${nm(K.rival)})` : `${(Math.abs(K.margin) / 1000).toFixed(3)} off P${K.cut} (${nm(K.rival)}, ${fmtLap(K.rival.best)})`) : K.rival?.best ? `P${K.cut} is ${fmtLap(K.rival.best)} (${nm(K.rival)})` : ''}</div></div></div>` : '';
  // the track around you
  const TR = lsTraffic(L, me);
  const tr = (o, word) => o ? `<div><span class="label">${word}</span><b>${nm(o.x)}</b><small>${Math.round(o.m)} m · about ${o.s.toFixed(1)} s · ${esc((LS_STATUS[o.x.ds] || '').toLowerCase())}</small></div>` : `<div><span class="label">${word}</span><b>Clear</b></div>`;
  const trafficCard = TR ? `<div class="panel live-card"><div class="panel-h"><h2>On track</h2><span class="muted" style="font-size:12px">The cars nearest you on the circuit</span></div><div class="panel-b ls-traffic">${tr(TR.ahead, 'Ahead')}${tr(TR.behind, 'Behind')}</div></div>` : '';
  // the car
  const car = `<div class="panel live-card"><div class="panel-h"><h2>Car</h2></div><div class="panel-b ls-car">
    <div><span class="label">Tyre</span><b>${me.c ? `${tyreChip(me.c)} ${esc(COMPOUNDS[me.c]?.[1] || '')}` : '–'}</b><small>${me.age != null ? `${plural(me.age, 'lap')} old` : ''}${me.wear != null ? ` · ${Math.round(me.wear)}% worn` : ''}</small></div>
    <div><span class="label">Fuel</span><b>${me.fuel != null ? `${me.fuel.toFixed(1)} kg` : '–'}</b></div>
    <div><span class="label">Battery</span><b>${L.store != null ? `${(L.store / 1000).toFixed(2)} MJ` : '–'}</b><small>${L.store != null ? `${Math.round(L.store / 40)}%` : ''}</small></div>
    ${me.warn || me.pen ? `<div><span class="label">Stewards</span><b>${me.pen ? `+${me.pen} s` : ''}${me.pen && me.warn ? ' · ' : ''}${me.warn ? plural(me.warn, 'warning') : ''}</b></div>` : ''}</div></div>`;
  // recent laps
  const laps = liveLaps(me).slice().reverse();
  const lapsCard = laps.length ? `<div class="panel live-card"><div class="panel-h"><h2>Your laps</h2><span class="muted" style="font-size:12px">The last ${laps.length}</span></div><div class="panel-b tight table-wrap"><table class="ls-laps"><thead><tr><th class="num">Lap</th><th class="num">Time</th><th class="num">S1</th><th class="num">S2</th><th class="num">S3</th></tr></thead><tbody>
    ${laps.map(l => `<tr class="${l.valid ? '' : 'inv'}"><td class="num">${l.n}</td><td class="num mono ${l.valid && l.ms === me.best ? (top && l.ms <= top ? 'purple' : 'green') : ''}">${fmtLap(l.ms)}${l.valid ? '' : ' ✕'}</td>${[l.s1, l.s2, l.s3].map((v, k) => `<td class="num mono ${lsSecCls(v, me.bestS?.[k], allS[k])}">${v ? (v / 1000).toFixed(3) : '–'}</td>`).join('')}</tr>`).join('')}
  </tbody></table></div></div>` : '';
  // the timing tower
  const tower = tvBoard(`${title} · timing`, [{ h: '', w: '30px' }, { h: '', w: '26px' }, { h: 'Driver', w: 'minmax(110px, 1.3fr)' }, { h: 'Best', w: '88px', num: true }, { h: 'Gap', w: '70px', num: true }, { h: 'Last', w: '88px', num: true }, { h: '', w: '34px' }, { h: 'Laps', w: '44px', num: true }, { h: '', w: 'minmax(70px, 1fr)' }],
    run.map(x => { const id = idOf(x.i); const tm = id ? teamOf(s, id) : null; const cutRow = K && x.pos === K.cut;
      return { me: x.i === me.i, cls: `${cutRow ? 'ls-cutrow' : ''} ${K && x.pos > K.cut ? 'ls-drop' : ''}`, cells: [x.pos, tvLogo(c, tm), `<b>${nm(x).toUpperCase()}</b>`, x.best ? `<span class="${x.best === top ? 'purple' : ''}">${fmtLap(x.best)}</span>` : '<small>no time</small>', x.best && top && x.best !== top ? lsGap(x.best - top) : '', x.last ? fmtLap(x.last) : '', x.c ? tyreChip(x.c) : '', x.lap ? Math.max(0, x.lap - 1) : '', `<small class="muted">${x.pit ? 'Pit' : esc(LS_STATUS[x.ds] || '')}</small>`] }; }));
  return `<div class="page live-page">${tabs}${head}
    <div id="live-root"><div class="live-grid ls-grid"><div class="live-col">${you}${lapCard}${cutCard}${L.kind === 'practice' && typeof setupNotesPanel === 'function' ? setupNotesPanel(c, s, r) : ''}${trafficCard}${car}${lapsCard}</div><div class="live-col">${tower}</div></div></div></div>`;
}

/*
  Where the time goes between two laps: the quickest whole lap of each driver this weekend (this session's so far, from
  the main process, and the sessions already logged), slice by slice. Each corner is split at its slowest point into
  entry and exit (a fast bend with no real dip in speed counts as one), and the straights between corners add up
  together. Returns { total, items: [{ label, v }] sorted by time lost, straights, corners } in seconds, positive: you
  lose time there. null when either lap is missing.
*/
async function lsLosing(c, s, r, L, meId, themId, meIdx, themIdx) {
  const W = s.weekends[r.id]?.traces || {}; const cand = { me: [W[meId]], them: [W[themId]] };
  if (L && window.api?.telemetry?.traces) { try { const T = await window.api.telemetry.traces(L.uid, [meIdx, themIdx].filter(v => v != null)); if (T?.cars) { cand.me.push(T.cars[meIdx]); cand.them.push(T.cars[themIdx]); } } catch { /* the weekend's laps only */ } }
  const pick = (list) => { const ok = list.filter(t => t?.spd?.length); const n = Math.max(0, ...ok.map(t => t.spd.length)); return ok.filter(t => flWhole(t, n)).sort((a, b) => a.ms - b.ms)[0] || null; };
  const A = pick(cand.me), B = pick(cand.them); if (!A || !B) return null;
  const n = Math.min(A.spd.length, B.spd.length); const bin = A.bin || 25;
  const tA = flTimes(A).slice(0, n), tB = flTimes(B).slice(0, n); const dA = tA.map((v, i) => v - (tA[i - 1] || 0)), dB = tB.map((v, i) => v - (tB[i - 1] || 0));
  const loss = dA.map((v, i) => v - dB[i]); // seconds lost in each slice (positive: you're slower there)
  const sp = flSmooth(flFill(A.spd)).slice(0, n); const xs = flFill(A.x).slice(0, n), zs = flFill(A.z).slice(0, n);
  const target = D.TRACKS[trackOf(r)]?.corners || 0;
  const turns = target ? flTurns(xs, zs, target, bin) : [];
  const bands = turns.length ? flBands(turns, sp, bin) : flCorners(sp).map(z => ({ ...z }));
  const sum = (a, b) => { let v = 0; if (b >= a) for (let i = a; i <= b; i++) v += loss[i] || 0; else { for (let i = a; i < n; i++) v += loss[i] || 0; for (let i = 0; i <= b; i++) v += loss[i] || 0; } return v; };
  const items = []; const inBand = new Array(n).fill(false);
  for (const z of bands) {
    const lo = Math.max(0, z.from), hi = Math.min(n - 1, z.to); if (hi < lo) continue; for (let i = lo; i <= hi; i++) inBand[i] = true;
    const t = z.turns.join(' and '); let apex = lo; for (let i = lo; i <= hi; i++) if (sp[i] < sp[apex]) apex = i;
    const dip = Math.max(...sp.slice(lo, hi + 1)) - sp[apex];
    if (dip >= 25 && apex > lo && apex < hi) { items.push({ label: `turn ${t}'s entry`, v: sum(lo, apex), turn: z.turns[0] }); items.push({ label: `the exit of ${t}`, v: sum(apex + 1, hi), turn: z.turns[0] }); }
    else items.push({ label: `turn ${t}`, v: sum(lo, hi), turn: z.turns[0] });
  }
  let straights = 0; for (let i = 0; i < n; i++) if (!inBand[i]) straights += loss[i] || 0;
  const corners = items.reduce((a, x) => a + x.v, 0);
  return { total: (A.ms - B.ms) / 1000, items: items.sort((a, b) => b.v - a.v), straights, corners, laps: [A, B] };
}
/** The engineer's answer from lsLosing. */
function lsLosingSay(R, name) {
  if (!R) return `No full lap from both of you to compare yet. It needs a lap from line to line, recorded with telemetry on.`;
  const big = R.items.filter(x => x.v >= 0.03);
  const lost = Math.max(0, R.straights) + big.reduce((a, x) => a + x.v, 0);
  const tot = R.total > 0 ? `${name} is ${R.total.toFixed(3)} quicker.` : R.total < 0 ? `You're ${(-R.total).toFixed(3)} quicker overall.` : 'Dead level overall.';
  if (R.straights > 0.08 && R.straights >= lost * 0.6) return `${tot} We're mostly losing on the straights, ${R.straights.toFixed(2)} of it.${big[0] ? ` The biggest corner is ${big[0].label}.` : ''}`;
  if (!big.length) return R.straights > 0.05 ? `${tot} Most of it is on the straights, ${R.straights.toFixed(2)}.` : `${tot} Nothing big, it's spread around the lap.`;
  const two = big.slice(0, 2).map(x => `${x.label}, ${x.v.toFixed(2)}`);
  if (R.total < 0) return `${tot} ${name} only has you in ${two.join(', and ')}.`;
  return `${tot} You're losing most in ${two.join(', and ')}.${R.straights > 0.05 ? ` Another ${R.straights.toFixed(2)} on the straights.` : ''}`;
}

/*
  After a session, until the next one starts: what it showed, like the race debrief.
  - Practice: your place and best lap, each run you did (short or long, its pace and fall-off), the timing sheet, and
    the setup notes still to make.
  - Qualifying: where you start, the grid, and for the race the strategies Practice suggests and the fuel. There's
    nothing to pick: Live Session builds the race strategy from the tyre you start on and keeps it up to date.
  - The sprint shootout: the same, with the sprint's fuel.
*/
function lsResultsBoard(c, s, sd, title) {
  return tvBoard(title, [{ h: '', w: '30px' }, { h: '', w: '26px' }, { h: 'Driver', w: 'minmax(120px, 1.4fr)' }, { h: 'Best', w: '92px', num: true }, { h: 'Gap', w: '78px', num: true }, { h: 'Laps', w: '48px', num: true }],
    (sd.results || []).map((x, k) => ({ me: x.d === PLAYER, act: 'open-driver', id: x.d, cells: [k + 1, tvLogo(c, teamOf(s, x.d)), `<b>${esc(lastName(dName(s, x.d)).toUpperCase())}</b>`, esc(x.lap || '–'), esc(x.gap || ''), sd.game?.laps?.[x.d]?.length || esc(x.laps || '')] })));
}
function lsHead(s, r, key, sd, extra = '') {
  const res = sd.results || []; const k = res.findIndex(x => x.d === PLAYER); const mine = res[k];
  return `<div class="panel"><div class="panel-h"><h2>Debrief · ${esc(SESSION_LABEL[key] || key)} · ${esc(r.name)}</h2><span class="muted" style="font-size:12px">until the next session starts</span></div>
    <div class="panel-b"><div class="ers-facts">${mine ? `<div><b>P${k + 1}</b><span>${key === 'Q' || key === 'SQ' ? (key === 'SQ' ? 'on the sprint grid' : 'on the grid') : 'on the timing sheet'}</span></div><div><b>${esc(mine.lap || '–')}</b><span>your best lap${mine.gap ? `, ${esc(mine.gap)} to ${esc(lastName(dName(s, res[0].d)))}` : k === 0 ? ', quickest of all' : ''}</span></div>` : '<div><b>–</b><span>no time from you</span></div>'}${extra}</div></div></div>`;
}
function practiceDebrief(c, s, r, key) {
  const sd = s.weekends[r.id]?.sessions?.[key]; if (!sd?.done) return '';
  const laps = sd.game?.laps?.[PLAYER] || [];
  // each run: the laps between leaving and coming back to the pits, its pace from the clean laps (no out- or in-lap,
  // nothing more than 3% off its median) and how much it fell off a lap
  const runs = stintsOf(sd, PLAYER).map(st => {
    const L = []; for (let n = st.from; n <= st.to; n++) { const l = laps[n - 1]; if (l?.[0]) L.push({ n, ms: l[0], ok: !!(l[1] & 1) }); }
    const inner = L.filter((x, k) => k > 0 && k < L.length - 1 && x.ok); const med = median(inner.map(x => x.ms)); const clean = inner.filter(x => x.ms <= med * 1.03);
    const fit = clean.length >= 4 ? fitLine(clean.map(x => [x.n - st.from, x.ms])) : null; const best = Math.min(...L.filter(x => x.ok).map(x => x.ms));
    return { ...st, n: L.length, clean: clean.length, avg: clean.length ? avg(clean.map(x => x.ms)) : null, fall: fit ? fit.b : null, best: isFinite(best) ? best : null };
  });
  const runRows = runs.map(x => `<tr><td>${tyreChip(x.c)} ${esc(COMPOUNDS[x.c]?.[1] || 'Tyre')}</td><td>${x.clean >= 6 ? 'Long run' : 'Short run'}</td><td class="num">${x.from}–${x.to}</td><td class="num mono">${x.best ? fmtLap(x.best) : '–'}</td><td class="num mono">${x.avg ? fmtLap(x.avg) : '–'}</td><td class="num">${x.fall != null ? `${x.fall >= 0 ? '+' : ''}${(x.fall / 1000).toFixed(3)} s` : '–'}</td></tr>`).join('');
  return `${lsHead(s, r, key, sd, laps.length ? `<div><b>${laps.length}</b><span>laps</span></div><div><b>${runs.filter(x => x.clean >= 6).length}</b><span>long runs</span></div>` : '')}
    ${laps.length ? `<div class="panel"><div class="panel-h"><h2>Your runs</h2><span class="muted" style="font-size:12px">Pace from the clean laps: no out- or in-lap, nothing more than 3% off the run</span></div><div class="panel-b tight table-wrap"><table><thead><tr><th>Tyre</th><th>Run</th><th class="num">Laps</th><th class="num">Best</th><th class="num">Pace</th><th class="num">Fall-off / lap</th></tr></thead><tbody>${runRows}</tbody></table></div></div>` : '<div class="callout">This session wasn’t logged from F1 25, so there are no laps to break down: only the times.</div>'}
    ${typeof setupNotesPanel === 'function' ? setupNotesPanel(c, s, r) : ''}
    ${lsResultsBoard(c, s, sd, `${SESSION_LABEL[key] || key} · timing`)}`;
}
function qualiDebrief(c, s, r, key) {
  const sd = s.weekends[r.id]?.sessions?.[key]; if (!sd?.done) return '';
  const fuelIds = c.type === 'myteam' ? (s.teams.find(t => t.id === s.playerTeamId)?.drivers || []).filter(Boolean) : [PLAYER];
  let next = '';
  if (key === 'SQ') next = `<div class="panel"><div class="panel-h"><h2>The sprint</h2></div><div class="panel-b muted" style="font-size:13px">No stop to plan in the sprint: Live Session follows the race, the battles and the ERS as soon as it starts.</div></div>${fuelPanel(c, s, r, fuelIds)}`;
  else {
    const { mine } = strategyRuns(s, r); const n = raceLaps(s, r.id); const PL = pitLoss(c, trackOf(r));
    const plans = Object.keys(mine).length >= 2 ? optimalStrategies(mine, n, { loss: PL.green, sets: setsLeft(c, s, r).sets }) : [];
    next = `<div class="panel"><div class="panel-h"><h2>Race strategies</h2><span class="muted" style="font-size:12px">From your practice long runs and the tyres you have left</span></div>
      ${plans.length ? `<div class="panel-b stack">${plans.map((p, i) => { let lap = 0; const st = p.seq.map((cp, k) => { const from = lap + 1; lap += p.lens[k]; return { c: cp, from, to: lap }; }); return `<div class="strat-row">${stintBar(st, n, { windows: p.windows })}<div class="strat-name"><span>${['', 'One', 'Two', 'Three'][p.stops]}-stopper${i === 0 ? ' · quickest' : ` · +${((p.t - plans[0].t) / 1000).toFixed(1)} s`}</span></div></div>`; }).join('')}
        <p class="muted" style="font-size:12px;margin:0">Nothing to pick: in the race, Live Session builds the strategy from the tyre you start on and keeps it up to date as your tyres go.</p></div>`
        : '<div class="panel-b muted" style="font-size:13px">No strategies yet: they need long runs on two dry compounds in practice. Live Session builds one in the race from the tyre you start on.</div>'}</div>${fuelPanel(c, s, r, fuelIds)}`;
  }
  return `${lsHead(s, r, key, sd)}${next}${typeof setupNotesPanel === 'function' ? setupNotesPanel(c, s, r) : ''}${lsResultsBoard(c, s, sd, `${SESSION_LABEL[key] || key} · result`)}`;
}
