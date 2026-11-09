/* Pitwall — The World Map: a globe of Formula 1. Part of the renderer, split into files that load in order (see index.html).
   Every country is dark; the ones with something to say (a circuit, a driver) are in your theme's colour, and every
   circuit since 1950 is a marker. Drag to turn the globe. A click on a country turns it to the middle and moves it to
   the left, with the country on the right: what it means to Formula 1, its circuits, and its drivers (the all-time
   leaderboard, for that country, with its own export). Drawn on a canvas with d3-geo (src/vendor), from src/world.js. */
'use strict';
const W = window.F1WORLD || null;
const WM = { rot: [-10, -25, 0], spin: true, drag: null, anim: null, raf: 0, hover: null, zoom: 1, zoomT: 1 };
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
// each country with its centre and how far it reaches from it (radians), for leaving out those on the far side
const wmPrep = (topo) => { const fc = topojson.feature(topo, topo.objects.countries); for (const f of fc.features) { f.cc = W.code[f.id] || null; f.ctr = d3.geoCentroid(f); const [[x0, y0], [x1, y1]] = d3.geoBounds(f); f.rad = Math.max(...[[x0, y0], [x1, y1], [x0, y1], [x1, y0]].map(p => d3.geoDistance(f.ctr, p))); } return fc.features; };
function worldFeatures() { if (_wmFeat || !W || !window.topojson) return _wmFeat; return (_wmFeat = wmPrep(W.topo)); }
let _wmLow = null;
/** The coarse 1:110m shapes, drawn while the globe moves (the detailed ones if they're missing). */
function worldFeaturesLow() { if (_wmLow || !W?.low || !window.topojson) return _wmLow || worldFeatures(); return (_wmLow = wmPrep(W.low)); }
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
// One canvas, kept for as long as Pitwall runs and moved into the page each time it's drawn, so a click that opens the
// panel never blanks the globe. The globe glides aside for the panel (its centre and size eased in the drawing loop),
// zooms with the wheel, the buttons or a pinch on a trackpad, and turns on after a drag with the speed it was let go at.
// While it moves it's drawn from the coarser 1:110m shapes, countries in a few batches and those on the far side left
// out; once it settles, from the 1:50m ones.
function worldMount() {
  const host = document.getElementById('wm-globe'); if (!host || !window.d3?.geoOrthographic) return;
  let cv = WM.cv;
  if (!cv) {
    cv = WM.cv = document.createElement('canvas'); cv.id = 'wm-canvas';
    cv.addEventListener('pointerdown', (e) => { WM.drag = { x: e.clientX, y: e.clientY, rot: WM.rot.slice(), moved: false, t: performance.now(), vx: 0, vy: 0 }; WM.spin = false; WM.anim = null; WM.vel = null; cv.setPointerCapture(e.pointerId); worldWake(); });
    cv.addEventListener('pointermove', (e) => {
      const d = WM.drag; if (!d) { WM.hoverAt = e; worldWake(); return; }
      const k = 180 / Math.PI / (WM.r * WM.zoom); const dx = e.clientX - d.x, dy = e.clientY - d.y; if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
      const now = performance.now(); const dt = Math.max(1, now - d.t); const rot = [d.rot[0] + dx * k, Math.max(-85, Math.min(85, d.rot[1] - dy * k)), 0];
      d.vx = (rot[0] - WM.rot[0]) / dt; d.vy = (rot[1] - WM.rot[1]) / dt; d.t = now; WM.rot = rot; worldWake();
    });
    cv.addEventListener('pointerup', (e) => {
      const d = WM.drag; WM.drag = null; if (!d) return;
      if (!d.moved) { const hit = worldHit(e); if (hit?.cc) worldPick(hit.cc, hit.circuit); }
      else if (performance.now() - d.t < 80 && Math.hypot(d.vx, d.vy) > 0.01) WM.vel = [d.vx, d.vy]; // let go while moving: it turns on
      worldWake();
    });
    cv.addEventListener('pointerleave', () => { WM.hoverAt = null; if (WM.hover) { WM.hover = null; worldWake(); } });
    cv.addEventListener('wheel', (e) => { e.preventDefault(); worldZoom(WM.zoomT * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015))); }, { passive: false });
    window.addEventListener('resize', () => { if (document.body.contains(WM.cv)) { worldSize(); worldWake(); } });
  }
  host.replaceChildren(cv); worldSize(); WM.primary = null; WM.hi = false; worldWake(); // (the theme colour read again)
}
/** The map fills what's left of the window below the heading (whatever the window's bars, the zoom, a phone's taller heading). */
function worldFit() {
  const wm = document.querySelector('.wm'); if (!wm) return;
  const top = wm.getBoundingClientRect().top; wm.style.height = Math.max(360, Math.floor(window.innerHeight - top - 14)) + 'px';
}
function worldSize() {
  worldFit(); const cv = WM.cv; const box = cv.parentElement; if (!box) return; const dpr = window.devicePixelRatio || 1; const w = box.clientWidth, h = box.clientHeight;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); cv.style.width = w + 'px'; cv.style.height = h + 'px'; }
  WM.size = { w, h };
}
/** The zoom it's heading for: 1 (the whole globe) to 9. */
function worldZoom(z) { WM.zoomT = Math.max(1, Math.min(9, z)); WM.spin = false; worldWake(); }
/** The drawing loop runs only while something moves; when it all settles, one last frame from the detailed shapes. */
function worldWake() { if (!WM.raf) WM.raf = requestAnimationFrame(worldStep); }
function worldStep(now) {
  WM.raf = 0; if (!WM.cv || !document.body.contains(WM.cv)) return;
  const dt = Math.min(50, now - (WM.last || now)); WM.last = now; let moving = false;
  const ease = (cur, to, k = 0.16) => { const d = to - cur; if (Math.abs(d) < 1e-3) return to; moving = true; return cur + d * (1 - Math.pow(1 - k, dt / 16.7)); };
  if (WM.anim) {
    const a = WM.anim; const u = Math.min(1, (now - a.t0) / a.ms); const e = 1 - Math.pow(1 - u, 3); // ease out
    WM.rot = [a.from[0] + (a.to[0] - a.from[0]) * e, a.from[1] + (a.to[1] - a.from[1]) * e, 0]; if (u >= 1) WM.anim = null; moving = true;
  } else if (WM.vel && !WM.drag) {
    WM.rot = [WM.rot[0] + WM.vel[0] * dt, Math.max(-85, Math.min(85, WM.rot[1] + WM.vel[1] * dt)), 0];
    const f = Math.pow(0.94, dt / 16.7); WM.vel = [WM.vel[0] * f, WM.vel[1] * f]; if (Math.hypot(...WM.vel) < 0.0008) WM.vel = null; moving = true;
  } else if (WM.spin && !WM.drag) { WM.rot = [WM.rot[0] + 0.004 * dt, WM.rot[1], 0]; moving = true; }
  if (WM.drag) moving = true;
  // the globe's place and size: the middle, or the left with the panel open
  // (on a narrow window the panel comes up from the bottom, so the globe moves up instead)
  const { w, h } = WM.size; const sel = !!ui.world?.sel; const wide = w > 900;
  WM.cx = ease(WM.cx ?? w / 2, sel && wide ? w * 0.23 : w / 2); WM.cy = ease(WM.cy ?? h / 2, sel && !wide ? h * 0.25 : h / 2);
  WM.r = ease(WM.r ?? Math.min(w, h) * 0.44, (sel ? (wide ? Math.min(w * 0.46, h) : Math.min(w, h * 0.5)) : Math.min(w, h)) * 0.44);
  WM.zoom = ease(WM.zoom, WM.zoomT, 0.2);
  // the country under the pointer, once the frame's other work is done
  if (WM.hoverAt && !moving) { const hit = worldHit(WM.hoverAt); const cc = hit?.cc || null; WM.hoverAt = null; if (cc !== WM.hover) { WM.hover = cc; WM.cv.style.cursor = cc ? 'pointer' : 'grab'; WM.cv.title = cc ? ccName(cc) : ''; WM.hi = false; } }
  if (moving) { worldDraw(false); WM.hi = false; WM.raf = requestAnimationFrame(worldStep); }
  // settled: the detailed frame, once it's been still a moment (so it never lands in the middle of a movement)
  else if (!WM.hi) { WM.last = 0; clearTimeout(WM.hiT); WM.hiT = setTimeout(() => { if (!WM.raf && !WM.hi && WM.cv && document.body.contains(WM.cv)) { worldDraw(true); WM.hi = true; } }, 180); }
  else WM.last = 0;
}
function worldProj() {
  const { w, h } = WM.size;
  return d3.geoOrthographic().scale(WM.r * WM.zoom).translate([WM.cx ?? w / 2, WM.cy ?? h / 2]).rotate(WM.rot).clipAngle(90);
}
/** What's under the pointer: a circuit marker (8 px) first, else the country. */
function worldHit(e) {
  const feats = worldFeatures(); if (!feats || !WM.cv) return null;
  const rect = WM.cv.getBoundingClientRect(); const x = e.clientX - rect.left, y = e.clientY - rect.top; const P = worldProj();
  const center = [-WM.rot[0], -WM.rot[1]];
  for (const ci of W.circuits) { if (d3.geoDistance([ci.lon, ci.lat], center) > Math.PI / 2 - 0.05) continue; const p = P([ci.lon, ci.lat]); if (p && Math.hypot(p[0] - x, p[1] - y) < 8) return { cc: ci.cc, circuit: ci.id }; }
  const ll = P.invert([x, y]); if (!ll || d3.geoDistance(ll, center) > Math.PI / 2) return null;
  const f = feats.find(f => f.cc && d3.geoDistance(f.ctr, ll) <= f.rad + 0.02 && d3.geoContains(f, ll)); return f ? { cc: f.cc } : null;
}
function worldDraw(hi) {
  const cv = WM.cv; const feats = hi ? worldFeatures() : worldFeaturesLow(); if (!cv || !feats || !WM.size) return;
  const g = cv.getContext('2d'); const dpr = window.devicePixelRatio || 1; g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const { w, h } = WM.size; g.clearRect(0, 0, w, h);
  const P = worldProj().precision(hi ? 0.9 : 1.2); const path = d3.geoPath(P, g); const r = WM.r * WM.zoom; const cx = WM.cx, cy = WM.cy;
  const primary = WM.primary ||= (getComputedStyle(document.body).getPropertyValue('--team') || '#E10600').trim();
  const data = worldData(career()).by; const sel = ui.world?.sel; const center = [-WM.rot[0], -WM.rot[1]];
  // the glow, the sea, the lines of latitude and longitude
  const glow = g.createRadialGradient(cx, cy, r * 0.92, cx, cy, r * 1.16); glow.addColorStop(0, 'rgba(60,120,255,0.32)'); glow.addColorStop(1, 'rgba(60,120,255,0)'); g.fillStyle = glow; g.fillRect(0, 0, w, h);
  const sea = g.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.1, cx, cy, r); sea.addColorStop(0, '#16233F'); sea.addColorStop(1, '#090E1B');
  g.beginPath(); path({ type: 'Sphere' }); g.fillStyle = sea; g.fill();
  g.beginPath(); path(WM.grat ||= d3.geoGraticule10()); g.strokeStyle = 'rgba(255,255,255,0.06)'; g.lineWidth = 1; g.stroke();
  // the countries in batches: the rest, those with F1 history, the one under the pointer, the one picked
  const groups = [[], [], [], []];
  for (const f of feats) {
    if (d3.geoDistance(f.ctr, center) > Math.PI / 2 + f.rad) continue; // all of it on the far side
    const has = f.cc && data[f.cc] && (data[f.cc].circuits.length || data[f.cc].drivers.length);
    groups[f.cc === sel ? 3 : f.cc && f.cc === WM.hover ? 2 : has ? 1 : 0].push({ f, has });
  }
  const fills = [() => '#1A1F2B', () => primary, (x) => x.has ? mixHexSafe(primary, '#FFFFFF', 0.2) : '#2B3245', () => mixHexSafe(primary, '#FFFFFF', 0.35)];
  g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 0.6;
  groups.forEach((list, k) => {
    if (!list.length) return; g.beginPath(); for (const x of list) path(x.f);
    g.fillStyle = fills[k](list[0]); g.globalAlpha = k === 0 ? 1 : 0.92; g.fill(); g.globalAlpha = 1; g.stroke();
  });
  // the circuits on the near side (bigger as it zooms in)
  const rr0 = Math.min(6, 3.4 + (WM.zoom - 1) * 0.35);
  for (const ci of W.circuits) {
    if (d3.geoDistance([ci.lon, ci.lat], center) > Math.PI / 2 - 0.05) continue; const p = P([ci.lon, ci.lat]); if (!p) continue;
    const rr = sel && ci.cc === sel ? rr0 + 1.4 : rr0;
    g.beginPath(); g.arc(p[0], p[1], rr + 2, 0, Math.PI * 2); g.fillStyle = 'rgba(255,255,255,0.9)'; g.fill();
    g.beginPath(); g.arc(p[0], p[1], rr, 0, Math.PI * 2); g.fillStyle = '#E10600'; g.fill();
  }
  g.beginPath(); path({ type: 'Sphere' }); g.strokeStyle = 'rgba(140,180,255,0.35)'; g.lineWidth = 1.5; g.stroke();
}
const mixHexSafe = (a, b, t) => /^#[0-9a-f]{6}$/i.test(a) ? mixHex(a, b, t) : a;
/** A country picked: the globe turns to it (and zooms in on a small one) and the panel comes in. */
function worldPick(cc, circuit = null) {
  const f = worldFeatures()?.find(x => x.cc === cc); const ci = circuit && W.circuits.find(x => x.id === circuit);
  const [lon, lat] = ci ? [ci.lon, ci.lat] : f ? f.ctr : [0, 0];
  ui.world = { ...(ui.world || {}), sel: cc, tab: circuit ? 'circuits' : (ui.world?.sel === cc ? ui.world.tab : 'overview'), circuit: circuit || null };
  WM.spin = false; WM.vel = null; WM.anim = { from: WM.rot.slice(), to: [-lon, -lat], t0: performance.now(), ms: 1100 };
  while (WM.anim.to[0] - WM.anim.from[0] > 180) WM.anim.to[0] -= 360; while (WM.anim.to[0] - WM.anim.from[0] < -180) WM.anim.to[0] += 360; // the shortest way round
  // the zoom that fits the country: a small one (Monaco, Belgium) close up, a big one (the United States) whole
  if (f) WM.zoomT = Math.max(1, Math.min(7, 0.42 / Math.max(0.02, f.rad)));
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
    <div class="wm ${d ? 'sel' : ''}"><div class="wm-globe" id="wm-globe"></div><div class="wm-zoom"><button class="icon-btn" data-act="wm-zoom" data-v="1.6" title="Zoom in">+</button><button class="icon-btn" data-act="wm-zoom" data-v="0.625" title="Zoom out">−</button><button class="icon-btn" data-act="wm-zoom" data-v="0" title="The whole globe">⟲</button></div>${panel}</div></div>`;
}
