/* Pitwall — The World Map: a globe of Formula 1. Part of the renderer, split into files that load in order (see index.html).
   Every country is dark; the ones with something to say (a circuit, a driver) are in your theme's colour, and every
   circuit since 1950 is a marker. Drag to turn the globe. A click on a country turns it to the middle and moves it to
   the left, with the country on the right: what it means to Formula 1, its circuits, and its drivers (the all-time
   leaderboard, for that country, with its own export). Drawn on a canvas with d3-geo (src/vendor), from src/world.js. */
'use strict';
const W = window.F1WORLD || null;
const WM = { rot: [-10, -25, 0], spin: true, drag: null, anim: null, raf: 0, hover: null };
// nationalities and countries the flag table doesn't cover
const NAT_FIX = { 'East German': 'de', 'West German': 'de', Rhodesian: 'zw', 'American-Italian': 'us', 'Argentine-Italian': 'ar' };
const natCode = (nat) => nat ? (NAT_FIX[nat] || A.nat[nat] || null) : null;
const regionName = (() => { let dn = null; try { dn = new Intl.DisplayNames(['en'], { type: 'region' }); } catch { /* old engine */ } return (cc) => { try { return (dn && dn.of(cc.toUpperCase())) || cc.toUpperCase(); } catch { return cc.toUpperCase(); } }; })();
const COUNTRY_NAME = { gb: 'Great Britain', us: 'United States', ae: 'United Arab Emirates', kr: 'South Korea', ru: 'Russia', nl: 'Netherlands' };
const ccName = (cc) => COUNTRY_NAME[cc] || regionName(cc);
// names as a sentence writes them (the boards print surnames in capitals)
const proseName = (n) => String(n || '').replace(/(?<!\p{L})(\p{Lu})(\p{Lu}+)(?!\p{L})/gu, (m, a, b) => a + b.toLowerCase());
const gpWord = (n) => `${n} world championship Grand${n === 1 ? ' Prix' : 's Prix'}`;

/* ------------------------------------------------------------------ data */
let _wmFeat = null;
function worldFeatures() {
  if (_wmFeat || !W || !window.topojson) return _wmFeat;
  const fc = topojson.feature(W.topo, W.topo.objects.countries);
  fc.features.forEach(f => { f.cc = W.code[f.id] || null; });
  return (_wmFeat = fc.features);
}
/** Everything the map knows, by country code: circuits (real, and the career's own rounds), drivers, champions. Cached per render. */
let _wmData = null;
function worldData(c) {
  if (_wmData?.gen === renderGen && _wmData.c === c) return _wmData;
  const by = {}; const at = (cc) => by[cc] ||= { cc, circuits: [], drivers: [], champs: {}, careerGPs: 0 };
  for (const x of W?.circuits || []) if (x.cc) at(x.cc).circuits.push({ ...x, career: [] });
  // the career's own rounds: added to their circuit (or a circuit of their own, for a track the real results never had)
  for (const s of c.seasons) {
    if (isHist(s)) continue;
    for (const r of activeRounds(s)) {
      const sd = s.weekends[r.id]?.sessions?.R; if (!sd?.done) continue;
      const tid = trackOf(r); const T = D.TRACKS[tid]; const cc = A.country[T?.country] || null;
      let o = null; for (const k in by) { o = by[k].circuits.find(x => x.track === tid); if (o) break; }
      if (!o && cc) { o = { id: 'career-' + tid, name: T?.circuit || r.venue || r.name, loc: T?.city || '', cc, track: tid, gps: 0, years: [], top: [], career: [], careerOnly: true }; at(cc).circuits.push(o); }
      if (!o) continue; const w = sd.results.find(x => !OUT.includes(x.st))?.d;
      o.career.push({ year: s.year, name: r.name, winner: w ? dName(s, w) : null }); at(o.cc).careerGPs++;
    }
  }
  // drivers: every driver ever (and the career's), counted since 1950, by nationality
  const ctx = careerCtx(c); const latest = c.seasons[c.seasons.length - 1]; const known = allKnownDrivers(c, latest);
  const natOf = (id) => id === PLAYER_ID ? c.profile.nationality : H.allTime?.[id]?.nat || D.DRIVER_BIO[id]?.nat || c.customDrivers?.find(x => x.id === id)?.nat || known[id]?.nat || null;
  for (const x of allTimeBoard(c, 1950, ctx, known, latest)) { const cc = natCode(natOf(x.id)); if (cc) at(cc).drivers.push(x); }
  // world champions, by the nationality of the champion
  const champs = [...D.CHAMPIONS.map(([y, k]) => ({ y, k })), ...ctx.filter(x => x.champ && !isHist(x.s)).map(x => ({ y: x.s.year, k: x.champ }))];
  for (const t of champs) { const nat = D.CHAMP_BIO[t.k]?.nat || natOf(t.k); const cc = natCode(nat); if (cc) (at(cc).champs[t.k] ||= []).push(t.y); }
  _wmData = { gen: renderGen, c, by };
  return _wmData;
}

/* ----------------------------------------------------------------- globe */
function worldMount() {
  const cv = document.getElementById('wm-canvas'); if (!cv || !window.d3?.geoOrthographic) return;
  const box = cv.parentElement; const dpr = window.devicePixelRatio || 1;
  const size = () => { const w = box.clientWidth, h = box.clientHeight; cv.width = w * dpr; cv.height = h * dpr; cv.style.width = w + 'px'; cv.style.height = h + 'px'; return { w, h }; };
  WM.cv = cv; WM.size = size();
  if (!WM.bound) {
    WM.bound = true;
    window.addEventListener('resize', () => { if (WM.cv && document.body.contains(WM.cv)) { WM.size = size(); worldDraw(); } });
  }
  cv.onpointerdown = (e) => { WM.drag = { x: e.clientX, y: e.clientY, rot: WM.rot.slice(), moved: false }; WM.spin = false; WM.anim = null; cv.setPointerCapture(e.pointerId); };
  cv.onpointermove = (e) => {
    const d = WM.drag;
    if (!d) { const hit = worldHit(e); const cc = hit?.cc || null; if (cc !== WM.hover) { WM.hover = cc; cv.style.cursor = cc ? 'pointer' : 'grab'; cv.title = cc ? ccName(cc) : ''; worldDraw(); } return; }
    const k = 0.25 * (360 / Math.max(300, WM.r * 2)) * 2.4; const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
    WM.rot = [d.rot[0] + dx * k, Math.max(-85, Math.min(85, d.rot[1] - dy * k)), 0]; worldDraw();
  };
  cv.onpointerup = (e) => { const d = WM.drag; WM.drag = null; if (d && !d.moved) { const hit = worldHit(e); if (hit?.cc) worldPick(hit.cc, hit.circuit); } };
  worldDraw(); worldLoop();
}
/** The turning: a slow spin until you take hold of it, and the turn to a country when one's picked. */
function worldLoop() {
  cancelAnimationFrame(WM.raf);
  const step = (now) => {
    if (!WM.cv || !document.body.contains(WM.cv)) return;
    if (WM.anim) {
      const a = WM.anim; const u = Math.min(1, (now - a.t0) / a.ms); const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
      WM.rot = [a.from[0] + (a.to[0] - a.from[0]) * e, a.from[1] + (a.to[1] - a.from[1]) * e, 0]; if (u >= 1) WM.anim = null; worldDraw();
    } else if (WM.spin && !WM.drag) { WM.rot = [WM.rot[0] + 0.06, WM.rot[1], 0]; worldDraw(); }
    WM.raf = requestAnimationFrame(step);
  };
  WM.raf = requestAnimationFrame(step);
}
function worldProj() {
  const { w, h } = WM.size; const r = Math.min(w, h) * 0.44; WM.r = r;
  return d3.geoOrthographic().scale(r).translate([w / 2, h / 2]).rotate(WM.rot).clipAngle(90).precision(0.6);
}
/** What's under the pointer: a circuit marker (8 px) first, else the country. */
function worldHit(e) {
  const feats = worldFeatures(); if (!feats || !WM.cv) return null;
  const rect = WM.cv.getBoundingClientRect(); const x = e.clientX - rect.left, y = e.clientY - rect.top; const P = worldProj();
  const center = P.invert([WM.size.w / 2, WM.size.h / 2]);
  for (const ci of W.circuits) { if (d3.geoDistance([ci.lon, ci.lat], center) > Math.PI / 2 - 0.05) continue; const p = P([ci.lon, ci.lat]); if (p && Math.hypot(p[0] - x, p[1] - y) < 8) return { cc: ci.cc, circuit: ci.id }; }
  const ll = P.invert([x, y]); if (!ll || d3.geoDistance(ll, center) > Math.PI / 2) return null;
  const f = feats.find(f => f.cc && d3.geoContains(f, ll)); return f ? { cc: f.cc } : null;
}
function worldDraw() {
  const cv = WM.cv; const feats = worldFeatures(); if (!cv || !feats) return;
  const g = cv.getContext('2d'); const dpr = window.devicePixelRatio || 1; g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const { w, h } = WM.size; g.clearRect(0, 0, w, h);
  const P = worldProj(); const path = d3.geoPath(P, g); const r = WM.r; const cx = w / 2, cy = h / 2;
  const css = getComputedStyle(document.body); const primary = (css.getPropertyValue('--team') || '#E10600').trim();
  const data = worldData(career()).by; const sel = ui.world?.sel;
  // the glow, the sea
  const glow = g.createRadialGradient(cx, cy, r * 0.9, cx, cy, r * 1.18); glow.addColorStop(0, 'rgba(60,120,255,0.35)'); glow.addColorStop(1, 'rgba(60,120,255,0)'); g.fillStyle = glow; g.fillRect(0, 0, w, h);
  const sea = g.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.1, cx, cy, r); sea.addColorStop(0, '#16233F'); sea.addColorStop(1, '#090E1B');
  g.beginPath(); path({ type: 'Sphere' }); g.fillStyle = sea; g.fill();
  g.beginPath(); path(d3.geoGraticule10()); g.strokeStyle = 'rgba(255,255,255,0.06)'; g.lineWidth = 1; g.stroke();
  // the countries: dark, those with F1 history in the theme's colour, the one picked or under the pointer brighter
  for (const f of feats) {
    const has = f.cc && data[f.cc] && (data[f.cc].circuits.length || data[f.cc].drivers.length);
    g.beginPath(); path(f);
    g.fillStyle = f.cc === sel ? mixHexSafe(primary, '#FFFFFF', 0.35) : has ? (f.cc === WM.hover ? mixHexSafe(primary, '#FFFFFF', 0.2) : primary) : (f.cc === WM.hover ? '#2B3245' : '#1A1F2B');
    g.globalAlpha = has || f.cc === sel ? 0.92 : 1; g.fill(); g.globalAlpha = 1;
    g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 0.6; g.stroke();
  }
  // the circuits on the near side
  const center = P.invert([cx, cy]);
  for (const ci of W.circuits) {
    if (d3.geoDistance([ci.lon, ci.lat], center) > Math.PI / 2 - 0.05) continue; const p = P([ci.lon, ci.lat]); if (!p) continue;
    const on = sel && ci.cc === sel; const rr = on ? 5 : 3.6;
    g.beginPath(); g.arc(p[0], p[1], rr + 2, 0, Math.PI * 2); g.fillStyle = 'rgba(255,255,255,0.9)'; g.fill();
    g.beginPath(); g.arc(p[0], p[1], rr, 0, Math.PI * 2); g.fillStyle = '#E10600'; g.fill();
  }
  // a rim of light
  g.beginPath(); path({ type: 'Sphere' }); g.strokeStyle = 'rgba(140,180,255,0.35)'; g.lineWidth = 1.5; g.stroke();
}
const mixHexSafe = (a, b, t) => /^#[0-9a-f]{6}$/i.test(a) ? mixHex(a, b, t) : a;
/** A country picked: the globe turns to it (and the panel comes in). */
function worldPick(cc, circuit = null) {
  const f = worldFeatures()?.find(x => x.cc === cc); const ci = circuit && W.circuits.find(x => x.id === circuit);
  const [lon, lat] = ci ? [ci.lon, ci.lat] : f ? d3.geoCentroid(f) : [0, 0];
  ui.world = { ...(ui.world || {}), sel: cc, tab: circuit ? 'circuits' : (ui.world?.sel === cc ? ui.world.tab : 'overview'), circuit: circuit || null };
  WM.spin = false; WM.anim = { from: WM.rot.slice(), to: [-lon, -lat], t0: performance.now(), ms: 900 };
  // the shortest way round
  while (WM.anim.to[0] - WM.anim.from[0] > 180) WM.anim.to[0] -= 360; while (WM.anim.to[0] - WM.anim.from[0] < -180) WM.anim.to[0] += 360;
  render();
}

/* ----------------------------------------------------------------- panel */
function worldOverview(c, cc, d) {
  const name = ccName(cc); const real = d.circuits.filter(x => !x.careerOnly); const gps = real.reduce((a, x) => a + x.gps, 0);
  const first = real.length ? Math.min(...real.map(x => x.first)) : null, last = real.length ? Math.max(...real.map(x => x.last)) : null;
  const drivers = d.drivers.slice().sort((a, b) => b.wins - a.wins || b.pts - a.pts); const winners = drivers.filter(x => x.wins > 0);
  const champs = Object.entries(d.champs).map(([k, ys]) => ({ k, ys, name: k === PLAYER_ID ? `${c.profile.first} ${c.profile.last}` : D.CHAMP_BIO[k]?.name || d.drivers.find(x => x.id === k)?.name || k })).sort((a, b) => b.ys.length - a.ys.length || a.ys[0] - b.ys[0]);
  const titles = champs.reduce((a, x) => a + x.ys.length, 0);
  const p = [];
  if (gps) p.push(`${name} has hosted ${gpWord(gps)}${first ? `, ${first === last ? `in ${first}` : `from ${first} to ${last}`}` : ''}, at ${plural(real.length, 'circuit')}${real.length ? `: ${real.length > 4 ? `${real.slice(0, 4).map(x => esc(proseName(x.name))).join(', ')} and ${real.length - 4} more` : listJoin(real.map(x => esc(proseName(x.name))))}` : ''}.`);
  else if (d.circuits.length) p.push(`${name} joined the calendar in your career.`);
  else p.push(`${name} has never held a world championship Grand Prix.`);
  if (d.careerGPs) p.push(`In your career it has held ${plural(d.careerGPs, 'race')} so far.`);
  if (drivers.length) p.push(`${plural(drivers.length, 'driver')} from ${name} ${drivers.length === 1 ? 'has' : 'have'} started a Grand Prix${winners.length ? `; ${plural(winners.length, 'driver')} won at least one, ${plural(winners.reduce((a, x) => a + x.wins, 0), 'win')} in all, led by ${esc(proseName(winners[0].name))} with ${winners[0].wins}` : ', none of them winning one yet'}.`);
  else p.push(`No driver from ${name} has started a Grand Prix.`);
  if (titles) p.push(`${plural(titles, 'world title')}: ${listJoin(champs.map(x => `${esc(proseName(x.name))} (${x.ys.length > 2 ? `${x.ys.length} titles, ${x.ys[0]}–${x.ys[x.ys.length - 1]}` : x.ys.join(' and ')})`))}.`);
  const tiles = [['Grands Prix', gps + (d.careerGPs || 0)], ['Circuits', d.circuits.length], ['Drivers', drivers.length], ['Wins', winners.reduce((a, x) => a + x.wins, 0)], ['Titles', titles]];
  return `<div class="wm-tiles">${tiles.map(([l, v]) => `<div><span class="label">${l}</span><b>${v}</b></div>`).join('')}</div><p class="wm-about">${p.join(' ')}</p>`;
}
function worldCircuit(c, x) {
  const T = x.track ? D.TRACKS[x.track] : null; const map = x.track ? trackMap(x.track, 150) : '';
  const facts = [['Grands Prix', x.gps + x.career.length], ['Years', x.first ? (x.first === x.last ? x.first : `${x.first}–${x.last}`) : x.career.length ? x.career[0].year : '–'],
    ...(T ? [['Length', `${T.km} km`], ['Laps', T.laps], ['Corners', T.corners]] : [])];
  return `<div class="wm-circuit"><div class="wm-ch">${map ? `<div class="wm-map">${map}</div>` : ''}<div><h3>${esc(proseName(x.name))}</h3><div class="muted">${esc([x.loc, ccName(x.cc)].filter(Boolean).join(', '))}</div>${x.races?.length ? `<div class="muted" style="font-size:12px">${esc(x.races.join(' · '))}</div>` : ''}</div></div>
    <div class="wm-tiles">${facts.map(([l, v]) => `<div><span class="label">${l}</span><b>${v}</b></div>`).join('')}</div>
    ${T?.about ? `<p class="wm-about">${esc(T.about)}</p>` : ''}
    ${T?.record ? `<p class="muted" style="font-size:12px;margin:0">Lap record ${esc(T.record[0])}, ${esc(T.record[1])} (${T.record[2]})</p>` : ''}
    ${x.top?.length ? `<div><span class="label">Most wins here</span><div class="wm-list">${x.top.map(([n, k]) => `<div><b>${esc(n)}</b><span>${plural(k, 'win')}</span></div>`).join('')}</div></div>` : ''}
    ${x.lastWin ? `<p class="muted" style="font-size:12px;margin:0">Last real Grand Prix here: ${esc(x.lastWin.race)} ${x.lastWin.year}, won by ${esc(x.lastWin.name)}.</p>` : ''}
    ${x.career.length ? `<div><span class="label">In your career</span><div class="wm-list">${x.career.slice().reverse().map(o => `<div><b>${o.year} ${esc(o.name)}</b><span>${esc(o.winner || '')}</span></div>`).join('')}</div></div>` : ''}</div>`;
}
function worldDrivers(c, cc, d) {
  if (!d.drivers.length) return `<p class="muted">No driver from ${ccName(cc)} has started a Grand Prix.</p>`;
  const lk = ui.lb.sort; const latest = c.seasons[c.seasons.length - 1];
  const board = d.drivers.slice().sort((a, b) => (b[lk] - a[lk]) || b.wins - a.wins || b.pts - a.pts || a.name.localeCompare(b.name));
  ui.wmLast = { cc, rows: board.slice(0, 10).map(x => ({ id: x.id, name: x.name, team: x.team?.id || null, ...Object.fromEntries(LB_COLS.map(([k]) => [k, x[k]])) })) };
  return `<div class="row" style="justify-content:space-between;margin-bottom:8px"><span class="muted" style="font-size:12px">Every driver from ${ccName(cc)} since 1950, with your career. Click a column to sort.</span><button class="btn sm primary" data-act="wm-export">${ICON.camera} Export top 10 as image</button></div>
    ${lbBoard(c, latest, board.slice(0, 100), lk, (x, k, fmt) => plus(x[k] - x.real[k], fmt))}${board.length > 100 ? `<p class="muted" style="font-size:12px">The top 100 of ${board.length}.</p>` : ''}`;
}
function renderWorld() {
  const c = career();
  if (!W || !window.d3?.geoOrthographic || !window.topojson) return `<div class="page"><div class="page-head"><div><h1>World Map</h1></div></div><div class="callout">The map couldn’t load.</div></div>`;
  const data = worldData(c).by; const S = ui.world || {}; const cc = S.sel; const d = cc ? data[cc] || { cc, circuits: [], drivers: [], champs: {}, careerGPs: 0 } : null;
  const countries = Object.values(data).filter(x => x.circuits.length || x.drivers.length).length;
  let panel = '';
  if (d) {
    const tab = S.tab || 'overview'; const cs = d.circuits.slice().sort((a, b) => (b.gps + b.career.length) - (a.gps + a.career.length));
    const one = cs.length === 1 ? cs[0] : cs.find(x => x.id === S.circuit);
    const flag = flagHtml(cc, 22);
    panel = `<aside class="wm-panel"><div class="wm-ph"><div class="row" style="gap:10px">${flag}<h2>${esc(ccName(cc))}</h2></div><button class="icon-btn" data-act="wm-close" title="Back to the globe">${ICON.x}</button></div>
      <div class="seg wm-tabs">${[['overview', 'Overview'], ['circuits', `Circuits${cs.length ? ` (${cs.length})` : ''}`], ['drivers', `Drivers${d.drivers.length ? ` (${d.drivers.length})` : ''}`]].map(([v, l]) => `<button data-act="wm-tab" data-v="${v}" class="${tab === v ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div class="wm-body">${tab === 'overview' ? worldOverview(c, cc, d)
        : tab === 'circuits' ? (cs.length ? (one ? `${cs.length > 1 ? `<button class="btn sm ghost" data-act="wm-circuit" data-id="">${ICON.left} All circuits</button>` : ''}${worldCircuit(c, one)}` : `<div class="wm-cards">${cs.map(x => `<button class="wm-card" data-act="wm-circuit" data-id="${esc(x.id)}">${x.track ? trackMap(x.track, 54) : '<span class="wm-dot"></span>'}<span><b>${esc(proseName(x.name))}</b><small>${esc(x.loc || '')} · ${plural(x.gps + x.career.length, 'GP')}${x.first ? ` · ${x.first === x.last ? x.first : `${x.first}–${x.last}`}` : ''}</small></span></button>`).join('')}</div>`) : `<p class="muted">${esc(ccName(cc))} has never held a world championship Grand Prix.</p>`)
        : worldDrivers(c, cc, d)}</div></aside>`;
  }
  setTimeout(worldMount);
  return `<div class="page wm-page"><div class="page-head"><div><h1>World Map</h1><div class="sub">${countries} countries in Formula 1’s story, ${W.circuits.length} circuits since 1950. Drag to turn the globe, click a country.</div></div></div>
    <div class="wm ${d ? 'sel' : ''}"><div class="wm-globe"><canvas id="wm-canvas"></canvas></div>${panel}</div></div>`;
}
