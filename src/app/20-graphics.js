/* Pitwall — Story graphics: standings, results, ratings and title permutations drawn as F1-style images. Part of the renderer, split into files that load in order (see index.html). */
'use strict';
/*
  Story graphics. Stories carry specs ({ type, si, ri, ... }) for the graphics that go with them; each is drawn on a
  canvas, in portrait 1080×1350, when its story scrolls into view (and kept, so it isn't drawn twice), and a click
  opens it to save. The logo slot at the top takes the image uploaded in Settings → Story graphics (F1's logo can't
  come with Pitwall), else Pitwall's name.
*/
const GFX_W = 1080, GFX_H = 1350;
const GFX_RED = '#E10600', GFX_BG = '#15151E', GFX_ROW = '#1F1F27';
const _gfxSpecs = new Map(); // placeholder key → spec, filled as stories are drawn
const _gfxDone = new Map(); // spec signature → image URL
/** A placeholder for a graphic in a story; it's drawn when it scrolls into view. */
function gfxSlot(spec) {
  const key = gfxKey(spec);
  const url = _gfxDone.get(gfxSig(spec));
  return `<button class="gfx ${spec.type === 'graph' ? 'wide' : ''}" data-act="gfx-open" data-gfx="${esc(key)}" title="Open to save the image">${url ? `<img src="${url}" alt="">` : '<span class="spinner"></span>'}</button>`;
}
/** Graphs are landscape, 1920×1080; everything else 1080 wide. */
const gfxWidth = (spec) => spec.type === 'graph' ? 1920 : GFX_W;
/** Registers a spec, for a button that opens its graphic (data-act="gfx-open"). */
function gfxKey(spec) { const key = JSON.stringify(spec); _gfxSpecs.set(key, spec); return key; }
/** Ratings for every driver run taller than the portrait 1080×1350. */
const gfxHeight = (spec) => spec.type === 'graph' ? 1080 : spec.type === 'ratings' && spec.rows?.length > 10 ? 300 + spec.rows.length * 84 : GFX_H;
const gfxSig = (spec) => JSON.stringify(spec) + ':' + (state.gfxLogo ? state.gfxLogo.length : 0) + ':' + renderGen;
/** After a page is drawn: draw the graphics in view (and the rest as they scroll in). */
let _gfxObs = null;
function fillGraphics() {
  const slots = document.querySelectorAll('.gfx[data-gfx]'); if (!slots.length) return;
  _gfxObs ||= new IntersectionObserver((es) => es.forEach(e => { if (e.isIntersecting) { _gfxObs.unobserve(e.target); drawSlot(e.target); } }), { rootMargin: '300px' });
  slots.forEach(el => { if (!el.querySelector('img')) _gfxObs.observe(el); });
}
async function drawSlot(el) {
  const spec = _gfxSpecs.get(el.dataset.gfx); if (!spec) return;
  try { const url = await gfxURL(spec); if (url) el.innerHTML = `<img src="${url}" alt="">`; else el.remove(); } catch (e) { el.remove(); }
}
async function gfxURL(spec) {
  const sig = gfxSig(spec); const hit = _gfxDone.get(sig); if (hit) return hit;
  const cv = await drawGraphic(spec); if (!cv) return null;
  const url = cv.toDataURL('image/png'); _gfxDone.set(sig, url); if (_gfxDone.size > 80) _gfxDone.delete(_gfxDone.keys().next().value);
  return url;
}
/** Opens a graphic to save it. */
async function gfxModal(key) {
  const spec = _gfxSpecs.get(key); if (!spec) return;
  const url = await gfxURL(spec); if (!url) return;
  const s = career().seasons[spec.si]; const r = activeRounds(s)[spec.ri];
  const what = { standings: spec.kind === 'team' ? 'team-standings' : 'driver-standings', results: { R: 'race', SPR: 'sprint', Q: 'qualifying', SQ: 'sprint-qualifying' }[spec.k], class: { FP1: 'practice-1', FP2: 'practice-2', FP3: 'practice-3', FP: 'practice' }[spec.k], ratings: spec.season ? 'season-ratings' : spec.span === 'last5' ? 'last-5-ratings' : 'driver-ratings', perm: 'permutations-' + String(spec.who).toLowerCase(), title: spec.mode === 'won' ? (spec.kind === 'team' ? 'constructors-champions' : 'world-champion') : 'title-showdown', pole: 'pole', winner: 'winner', h2h: 'head-to-head', leaderboard: 'career-leaderboard', preview: 'preview', season: 'season-preview', calendar: 'calendar', breaking: 'breaking', record: spec.kind === 'milestone' ? 'milestone' : 'record', quote: 'quote', graph: spec.mode === 'laps' ? 'title-lap-by-lap' : 'points-graph', award: spec.kind === 'dots' ? 'driver-of-the-season' : 'driver-of-the-day' }[spec.type];
  ui.modal = { kind: 'card', url, name: `pitwall-${s.year}-r${spec.ri + 1}-${what}.png` };
  modal(`<div class="modal-h"><h2>${['leaderboard', 'h2h'].includes(spec.type) ? '' : `${esc(r?.name || '')} · `}${esc(what.replace(/-/g, ' '))}</h2><button class="icon-btn" data-act="modal-close">${ICON.x}</button></div>
    <div class="modal-b"><img src="${url}" alt="" style="width:100%;max-width:540px;display:block;margin:0 auto;border-radius:6px"></div>
    <div class="modal-f"><span class="muted" style="font-size:12px;margin-right:auto">${gfxWidth(spec)} × ${gfxHeight(spec)} PNG${gfxHeight(spec) === GFX_H ? ', sized for social posts' : ''}.</span><button class="btn ghost" data-act="modal-close">Close</button><button class="btn primary" data-act="card-save">Save image</button></div>`);
}

// ---- drawing
function gfxKit(g) {
  const css = getComputedStyle(document.documentElement);
  const disp = (css.getPropertyValue('--font-display') || '').trim() || '"Bahnschrift", "Arial Narrow", sans-serif';
  const body = (css.getPropertyValue('--font-body') || '').trim() || disp;
  const font = (size, weight = 700, fam = disp) => `${weight} ${size}px ${fam}`;
  const text = (t, x, y, { size = 32, weight = 700, color = '#FFFFFF', align = 'left', fam = disp, max = 0 } = {}) => {
    let sz = size; g.font = font(sz, weight, fam); if (max) while (sz > 12 && g.measureText(t).width > max) { sz -= 2; g.font = font(sz, weight, fam); }
    g.fillStyle = color; g.textAlign = align; g.textBaseline = 'middle'; g.fillText(t, x, y);
  };
  const img = async (src, x, y, w, h, { cover = false } = {}) => {
    const im = await loadImg(src); if (!im) return false;
    const k = cover ? Math.max(w / im.width, h / im.height) : Math.min(w / im.width, h / im.height); const dw = im.width * k, dh = im.height * k;
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.drawImage(im, x + (w - dw) / 2, y + (cover ? 0 : (h - dh) / 2), dw, dh); g.restore(); return true;
  };
  // up to `lines` lines of text inside `max`, shrinking only the last line's overflow
  const wrap = (t, x, y, { size = 26, weight = 500, color = '#FFFFFF', align = 'left', fam = body, max = 600, lines = 2, lh = 1.3, middle = false } = {}) => {
    g.font = font(size, weight, fam); const out = []; let cur = '';
    for (const w of String(t).split(' ')) { const nx = cur ? cur + ' ' + w : w; if (cur && g.measureText(nx).width > max && out.length < lines - 1) { out.push(cur); cur = w; } else cur = nx; }
    out.push(cur); const y0 = middle ? y - (out.length - 1) * size * lh / 2 : y; // middle: centred on y
    out.forEach((l, i) => text(l, x, y0 + i * size * lh, { size, weight, color, align, fam, max })); return out.length;
  };
  // the story logo (Settings → Story graphics) recoloured to one colour, so one upload suits every background
  const logo = async (x, y, w, h, color = GFX_RED, align = 'center') => {
    const im = state.gfxLogo && await loadImg(state.gfxLogo);
    if (!im) { text('PITWALL', align === 'center' ? x + w / 2 : align === 'right' ? x + w : x, y + h / 2, { size: Math.round(h * 0.7), weight: 800, color, align, max: w }); return; }
    const k = Math.min(w / im.width, h / im.height); const dw = im.width * k, dh = im.height * k;
    const oc = document.createElement('canvas'); oc.width = Math.ceil(dw); oc.height = Math.ceil(dh); const o = oc.getContext('2d');
    o.drawImage(im, 0, 0, dw, dh); o.globalCompositeOperation = 'source-in'; o.fillStyle = color; o.fillRect(0, 0, oc.width, oc.height);
    g.drawImage(oc, align === 'center' ? x + (w - dw) / 2 : align === 'right' ? x + w - dw : x, y + (h - dh) / 2);
  };
  return { font, text, img, body, disp, wrap, logo };
}
/** The usual header: red stripes either side of the logo, in red. */
async function gfxHeader(g, k, W = GFX_W) {
  g.fillStyle = GFX_RED; g.fillRect(0, 34, 390, 14); g.fillRect(0, 56, 390, 14); g.fillRect(W - 390, 34, 390, 14); g.fillRect(W - 390, 56, 390, 14);
  await k.logo(W / 2 - 130, 18, 260, 66);
}
/** The frame: dark background, the red stripes either side of the logo slot, and the title. */
async function gfxFrame(g, k, title, { sub = '' } = {}) {
  const H = g.canvas.height;
  g.fillStyle = GFX_BG; g.fillRect(0, 0, GFX_W, H);
  g.save(); g.globalAlpha = 0.06; g.strokeStyle = '#FFFFFF'; g.lineWidth = 3;
  for (let x = -400 - H * 0.4; x < GFX_W + 400; x += 70) { g.beginPath(); g.moveTo(x, H); g.lineTo(x + H * 0.37, 0); g.stroke(); }
  g.restore();
  await gfxHeader(g, k);
  k.text(title, GFX_W / 2, 150, { size: 92, weight: 800, align: 'center', max: GFX_W - 80 });
  if (sub) k.text(sub, GFX_W / 2, 214, { size: 30, weight: 600, color: '#B8C0D0', align: 'center', max: GFX_W - 80 });
}
/** A rating as the graphics print it: one decimal, but a perfect 10 as 10 (10.0 overflows its box). */
const gfxR = (v) => v >= 9.95 ? '10' : v.toFixed(1);
const gfxLast = (s, id) => lastName(dName(s, id) || id).toUpperCase();
function gfxNat(c, id) { const bio = id === PLAYER_ID ? null : D.DRIVER_BIO[id]; return id === PLAYER_ID ? c.profile.nationality : bio?.nat || c.customDrivers?.find(x => x.id === id)?.nat || null; }
const gfxFlag = (c, id) => { const code = A.nat[gfxNat(c, id)]; const svg = code && A.flags[code]; return svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` : null; };
/** A team's logo in a box (its uploaded one, else its short name). */
async function gfxLogo(g, k, c, team, x, y, w, h, ink) {
  if (!team) return; const url = teamLogoUrl(c, team.id);
  // a soft shadow, so a logo in its team's colour still shows on the team's bar (McLaren's orange on orange)
  g.save(); g.shadowColor = 'rgba(0,0,0,0.45)'; g.shadowBlur = 8; g.shadowOffsetY = 2;
  const drawn = url && await k.img(url, x, y, w, h); g.restore(); if (drawn) return;
  k.text((D.TEAM_BIO[team.id]?.short || team.short || team.name.slice(0, 3)).toUpperCase(), x + w / 2, y + h / 2, { size: Math.round(h * 0.42), weight: 800, color: ink, align: 'center' });
}
const _bodyBox = new Map();
/** A cut-out and the box its visible pixels fill (the transparent margins trimmed). */
async function gfxBodyBox(url) {
  if (_bodyBox.has(url)) return _bodyBox.get(url);
  const im = await loadImg(url); if (!im) return null;
  const w = im.naturalWidth || im.width, h = im.naturalHeight || im.height;
  const sc = Math.min(1, 320 / Math.max(w, h)); const cw = Math.max(1, Math.round(w * sc)), ch = Math.max(1, Math.round(h * sc));
  const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch; const x = cv.getContext('2d'); x.drawImage(im, 0, 0, cw, ch);
  const d = x.getImageData(0, 0, cw, ch).data; let x0 = cw, y0 = ch, x1 = -1, y1 = -1;
  for (let yy = 0; yy < ch; yy++) for (let xx = 0; xx < cw; xx++) if (d[(yy * cw + xx) * 4 + 3] > 24) { if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (yy < y0) y0 = yy; if (yy > y1) y1 = yy; }
  const box = x1 < 0 ? { im, x: 0, y: 0, w, h } : { im, x: x0 / sc, y: y0 / sc, w: (x1 - x0 + 1) / sc, h: (y1 - y0 + 1) / sc };
  _bodyBox.set(url, box); return box;
}
/** The driver's full-body picture if it loads: { url, look }. */
async function gfxBody(c, id, s = curSeason()) { const b = bodyFor(c, id, s); return b && await gfxBodyBox(b.url) ? b : null; }
/**
 * A full-body picture from the top of the head at `top`, scaled so `frac` of the body reaches `bottom` (cut off there),
 * centred on cx, facing the way it was uploaded (never mirrored: the way it faces decides where it stands instead).
 */
async function gfxFigure(g, body, { cx, top, bottom, frac = 0.6 }) {
  const B = body && await gfxBodyBox(body.url); if (!B) return false;
  const sc = (bottom - top) / (B.h * frac); const dw = B.w * sc, dh = B.h * sc;
  g.save(); g.beginPath(); g.rect(0, 0, g.canvas.width, bottom); g.clip();
  g.drawImage(B.im, B.x, B.y, B.w, B.h, cx - dw / 2, top, dw, dh); g.restore(); return true;
}
/**
 * A picture at w×h fading out toward its bottom, and toward one side: left (the share of its width the fade takes
 * from the left edge) or right (from the right edge).
 */
function gfxFaded(im, w, h, { left = 0, right = 0 } = {}) {
  const oc = document.createElement('canvas'); oc.width = Math.ceil(w); oc.height = Math.ceil(h); const o = oc.getContext('2d'); o.drawImage(im, 0, 0, w, h);
  o.globalCompositeOperation = 'destination-in';
  const fv = o.createLinearGradient(0, 0, 0, h); fv.addColorStop(0, 'rgba(0,0,0,0.92)'); fv.addColorStop(0.5, 'rgba(0,0,0,0.8)'); fv.addColorStop(0.82, 'rgba(0,0,0,0.25)'); fv.addColorStop(1, 'rgba(0,0,0,0)'); o.fillStyle = fv; o.fillRect(0, 0, oc.width, oc.height);
  if (left) { const fh = o.createLinearGradient(0, 0, w, 0); fh.addColorStop(0, 'rgba(0,0,0,0)'); fh.addColorStop(left, 'rgba(0,0,0,0.8)'); fh.addColorStop(1, 'rgba(0,0,0,1)'); o.fillStyle = fh; o.fillRect(0, 0, oc.width, oc.height); }
  if (right) { const fh = o.createLinearGradient(w, 0, 0, 0); fh.addColorStop(0, 'rgba(0,0,0,0)'); fh.addColorStop(right, 'rgba(0,0,0,0.8)'); fh.addColorStop(1, 'rgba(0,0,0,1)'); o.fillStyle = fh; o.fillRect(0, 0, oc.width, oc.height); }
  return oc;
}
/** A soft glow of a colour behind a figure. */
function gfxGlow(g, x, y, r, col, a = 0.55) { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, hexA(col, a)); gr.addColorStop(1, hexA(col, 0)); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
function goldFill(g, x, y, w, h) { const gr = g.createLinearGradient(x, y, x, y + h); gr.addColorStop(0, '#F3D98B'); gr.addColorStop(0.5, '#D4AF37'); gr.addColorStop(1, '#B8901E'); return gr; }

async function drawGraphic(spec) {
  const c = career(); const s = c.seasons[spec.si]; if (!s) return null;
  const cv = document.createElement('canvas'); cv.width = gfxWidth(spec); cv.height = gfxHeight(spec); const g = cv.getContext('2d'); const k = gfxKit(g);
  if (spec.type === 'award') return gfxAward(c, s, spec.kind, spec.ri);
  if (spec.type === 'title') { const ok = await gfxTitle(g, k, c, s, spec); return ok === false ? null : cv; }
  const ok = await ({ class: gfxClass, standings: gfxStandings, results: gfxResults, ratings: gfxRatings, perm: gfxPerm, pole: gfxPole, winner: gfxWinner, leaderboard: gfxLeaderboard, h2h: gfxH2H, preview: gfxPreview, calendar: gfxCalendar, breaking: gfxBreaking, record: gfxRecord, quote: gfxQuote, season: gfxSeason, graph: spec.mode === 'laps' ? gfxLapGraph : gfxGraph }[spec.type])?.(g, k, c, s, spec);
  return ok === false ? null : cv;
}

/** Team or driver standings after round ri: the top ten, gold for a champion once the title is settled. */
async function gfxStandings(g, k, c, s, { kind, ri }) {
  const r = activeRounds(s)[ri]; const st = seasonStats(s, ri + 1);
  const team = kind === 'team';
  const rows = (team ? constructorStandings(s, st) : driverStandings(s, st)).slice(0, team ? 12 : 10); // every team: there are rarely more than twelve
  if (!rows.length) return false;
  const prev = ri ? (team ? constructorStandings(s, seasonStats(s, ri)) : driverStandings(s, seasonStats(s, ri))) : null;
  const dec = titleDecision(s, team ? 'team' : 'driver'); const gold = dec && dec.i <= ri;
  await gfxFrame(g, k, team ? 'TEAM STANDINGS' : 'DRIVER STANDINGS');
  // the rows share the room between the title and the footer line, so eleven or twelve teams never run into it
  const y0 = 205, rh = Math.min(99, Math.floor((GFX_H - 110 - y0) / rows.length)), xP = 0, wP = 135, xBar = 135, wBar = team ? 680 : 670, xPts = xBar + wBar, wPts = team ? 200 : 135;
  for (let i = 0; i < rows.length; i++) {
    const x = rows[i]; const y = y0 + i * rh; const tm = team ? x.team : teamAt(s, x.id, ri) || teamOf(s, x.id);
    const col = tm?.color || '#5E6A82'; const ink = contrastInk(col);
    g.fillStyle = GFX_ROW; g.fillRect(xP, y, wP, rh - 4); k.text(String(i + 1), wP / 2, y + rh / 2 - 2, { size: 46, weight: 600, align: 'center', fam: k.body });
    g.fillStyle = col; g.fillRect(xBar, y, wBar, rh - 4);
    if (team) {
      await gfxLogo(g, k, c, tm, xBar + 20, y + 8, 220, rh - 20, ink);
      k.text(tm.name.toUpperCase(), xBar + 270, y + rh / 2 - 2, { size: 40, weight: 800, color: ink, max: wBar - 290 });
    } else {
      await gfxLogo(g, k, c, tm, xBar + 14, y + 18, 120, rh - 40, ink);
      const ph = await headOfAsync(c, x.id, s); if (ph) await k.img(ph, xBar + 150, y, 100, rh - 4, { cover: true });
      k.text(gfxLast(s, x.id), xBar + 270, y + rh / 2 - 2, { size: 44, weight: 800, color: ink, max: wBar - 290 });
    }
    g.fillStyle = GFX_RED; g.fillRect(xPts, y, wPts, rh - 4);
    const champ = gold && i === 0; g.fillStyle = champ ? goldFill(g, xPts, y + 20, wPts, 60) : '#FFFFFF';
    const pt = String(Math.round(x.pts * 10) / 10); let fz = 54; g.font = k.font(fz, 800); while (fz > 24 && g.measureText(pt).width > wPts - 16) g.font = k.font(fz -= 2, 800); // half points (2021's Belgium) run wider
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(pt, xPts + wPts / 2, y + rh / 2 - 2);
    if (!team) {
      g.fillStyle = GFX_ROW; g.fillRect(xPts + wPts, y, GFX_W - xPts - wPts, rh - 4);
      const was = prev ? prev.findIndex(p => p.id === x.id) + 1 : 0; const mv = was ? was - (i + 1) : 0;
      if (mv > 0) { k.text('▲', xPts + wPts + 40, y + rh / 2 - 2, { size: 26, color: '#2FD07A', align: 'center' }); k.text(String(mv), xPts + wPts + 80, y + rh / 2 - 2, { size: 34, weight: 700, align: 'center' }); }
      else if (mv < 0) { k.text('▼', xPts + wPts + 40, y + rh / 2 - 2, { size: 26, color: GFX_RED, align: 'center' }); k.text(String(-mv), xPts + wPts + 80, y + rh / 2 - 2, { size: 34, weight: 700, align: 'center' }); }
      else k.text('-', xPts + wPts + 60, y + rh / 2 - 2, { size: 40, weight: 800, align: 'center' });
    }
  }
  k.text(`POINTS AFTER THE ${r.name.toUpperCase()} GP`, GFX_W / 2, GFX_H - 50, { size: 30, weight: 600, align: 'center', fam: k.body });
}

/** A session's result: the podium (or front row of three), then fourth to tenth. k: R, SPR or Q. */
async function gfxResults(g, k, c, s, { k: key, ri }) {
  const r = activeRounds(s)[ri]; const sd = s.weekends[r.id]?.sessions?.[key]; const res = sd?.results?.filter(x => x.d) || [];
  if (res.length < 3) return false;
  const quali = key === 'Q' || key === 'SQ';
  await gfxFrame(g, k, r.name.toUpperCase(), { sub: { R: 'RACE', SPR: 'SPRINT', Q: 'QUALIFYING', SQ: 'SPRINT QUALIFYING' }[key] });
  const ptsOf = (x, p) => pointsFor(key, p, x.st, x.pts);
  const side = (x, p) => quali ? (p === 1 ? x.lap || '' : x.gap || x.lap || '') : `${ptsOf(x, p)}`;
  // the podium: second, first (taller), third
  const cards = [[1, 40, 300, 300], [0, 380, 250, 320], [2, 740, 300, 300]];
  for (const [n, x0, y0, w] of cards) {
    const x = res[n]; if (!x) continue; const tm = teamAt(s, x.d, ri) || teamOf(s, x.d); const col = tm?.color || '#5E6A82'; const h = n === 0 ? 560 : 480; const ink = contrastInk(col);
    const gr = g.createLinearGradient(x0, y0, x0, y0 + h); gr.addColorStop(0, mixHex(col, '#FFFFFF', 0.15)); gr.addColorStop(1, mixHex(col, '#000000', 0.25)); g.fillStyle = gr; g.fillRect(x0, y0, w, h);
    g.save(); g.globalAlpha = 0.9; k.text(String(n + 1), x0 + 26, y0 + 70, { size: 150, weight: 900, color: '#FFFFFF' }); g.restore();
    const ph = await headOfAsync(c, x.d, s); if (ph) await k.img(ph, x0 + 20, y0 + 70, w - 40, h - 150, { cover: true });
    g.fillStyle = 'rgba(255,255,255,0.92)'; g.fillRect(x0 + w - 104, y0 + h - 180, 90, 80);
    k.text(quali ? (n === 0 ? 'POLE' : side(x, n + 1)) : side(x, n + 1), x0 + w - 59, y0 + h - 150, { size: quali ? 22 : 40, weight: 800, color: '#15151E', align: 'center', max: 74 });
    if (!quali) k.text('PTS', x0 + w - 59, y0 + h - 118, { size: 16, weight: 600, color: '#15151E', align: 'center' });
    g.fillStyle = mixHex(col, '#FFFFFF', 0.2); g.fillRect(x0, y0 + h - 80, w, 80);
    const fl = gfxFlag(c, x.d); if (fl) await k.img(fl, x0 + 16, y0 + h - 60, 54, 40);
    k.text(gfxLast(s, x.d), x0 + (fl ? 82 : 20), y0 + h - 40, { size: 36, weight: 800, color: contrastInk(mixHex(col, '#FFFFFF', 0.2)), max: w - (fl ? 96 : 36) });
  }
  // fourth to tenth
  const tx = 40, tw = GFX_W - 80, ty = 900, rh = 58;
  g.fillStyle = '#FFFFFF'; g.fillRect(tx, ty - 10, tw, rh * Math.min(7, res.length - 3) + 20);
  for (let i = 3; i < Math.min(10, res.length); i++) {
    const x = res[i]; const y = ty + (i - 3) * rh; const tm = teamAt(s, x.d, ri) || teamOf(s, x.d);
    k.text(OUT.includes(x.st) ? x.st : String(i + 1), tx + 40, y + rh / 2, { size: 34, weight: 600, color: '#15151E', align: 'center', fam: k.body });
    const fl = gfxFlag(c, x.d); if (fl) await k.img(fl, tx + 80, y + 14, 40, 30);
    k.text((dName(s, x.d) || x.d).toUpperCase(), tx + 140, y + rh / 2, { size: 30, weight: 700, color: '#15151E', max: 400 });
    await gfxLogo(g, k, c, tm, tx + 560, y + 8, 70, rh - 16, '#15151E');
    k.text((tm?.name || '').toUpperCase(), tx + 650, y + rh / 2, { size: 24, weight: 500, color: '#15151E', max: quali ? 170 : 230, fam: k.body });
    const pv = side(x, i + 1);
    k.text(quali ? pv : `${pv}`, tx + tw - (quali ? 20 : 60), y + rh / 2, { size: quali ? 26 : 34, weight: 700, color: '#15151E', align: 'right', max: 150 });
    if (!quali) k.text(+pv === 1 ? 'PT' : 'PTS', tx + tw - 20, y + rh / 2 + 4, { size: 16, weight: 600, color: '#15151E', align: 'right' });
  }
}

/** A practice session's classification: every driver, the gap to the fastest and laps run (when logged). k: FP1–FP3 or FP. */
async function gfxClass(g, k, c, s, { k: key, ri }) {
  const r = activeRounds(s)[ri]; const res = s.weekends[r.id]?.sessions?.[key]?.results?.filter(x => x.d) || [];
  if (res.length < 3) return false;
  await gfxFrame(g, k, `${r.name.toUpperCase()} GRAND PRIX`, { sub: `${key === 'FP' ? 'PRACTICE' : 'PRACTICE ' + key.slice(2)}  ·  CLASSIFICATION` });
  const laps = res.some(x => +x.laps > 0);
  const best = parseLap(res[0].lap);
  const gapOf = (x, i) => {
    if (OUT.includes(x.st) && !x.lap) return x.st;
    if (i === 0) return x.lap || '';
    if (x.gap) return x.gap.startsWith('+') ? x.gap : `+${x.gap}`;
    const t = parseLap(x.lap); return t != null && best != null ? `+${((t - best) / 1000).toFixed(3)}` : '';
  };
  const X = { pos: 80, name: 140, team: 640, gap: laps ? 810 : 900, laps: 975 }, top = 262;
  g.fillStyle = GFX_RED; g.fillRect(40, top - 8, GFX_W - 80, 6);
  const head = (t, x, align = 'center') => k.text(t, x, top + 20, { size: 20, weight: 600, color: '#9AA0AE', align, fam: k.body });
  head('DRIVER', X.name, 'left'); head('TEAM', X.team); head('GAP TO FASTEST', X.gap); if (laps) head('LAPS', X.laps);
  const y0 = top + 44, rh = Math.min(50, (GFX_H - 40 - y0) / res.length), fs = Math.round(rh * 0.56);
  for (let i = 0; i < res.length; i++) {
    const x = res[i]; const y = y0 + i * rh; const tm = teamAt(s, x.d, ri) || teamOf(s, x.d);
    const ink = i === 0 ? '#15151E' : '#FFFFFF';
    if (i === 0) { g.fillStyle = '#DCDCE0'; g.fillRect(40, y, GFX_W - 80, rh); }
    k.text(String(i + 1), X.pos, y + rh / 2, { size: fs, weight: 700, color: ink, align: 'center' });
    const full = (dName(s, x.d) || x.d).toUpperCase(); const ln = gfxLast(s, x.d); const fn = full.endsWith(ln) ? full.slice(0, full.length - ln.length).trim() : '';
    g.font = k.font(fs, 500, k.body); const fw = fn ? g.measureText(fn + ' ').width : 0;
    if (fn) k.text(fn, X.name, y + rh / 2, { size: fs, weight: 500, color: ink, fam: k.body });
    k.text(ln, X.name + fw, y + rh / 2, { size: fs, weight: 800, color: ink, max: X.team - 60 - X.name - fw });
    await gfxLogo(g, k, c, tm, X.team - 40, y + rh * 0.15, 80, rh * 0.7, ink);
    k.text(gapOf(x, i), X.gap, y + rh / 2, { size: fs, weight: 600, color: ink, align: 'center', fam: k.body });
    if (laps) k.text(String(x.laps || ''), X.laps, y + rh / 2, { size: fs, weight: 600, color: ink, align: 'center', fam: k.body });
  }
}

/** Driver ratings: a race's top ten (or every driver), the season's averages or the last 5 races'. rows: [{ id, rating }] */
async function gfxRatings(g, k, c, s, { ri, rows, season = false, span = '', all = false }) {
  const r = activeRounds(s)[ri]; if (!rows?.length) return false;
  await gfxFrame(g, k, 'DRIVER RATINGS', { sub: season ? `${s.year} SEASON SO FAR  ·  AVERAGE AFTER ROUND ${ri + 1}` : span === 'last5' ? `${s.year}  ·  AVERAGE OVER THE LAST 5 RACES` : `${r.name.toUpperCase()} GRAND PRIX` });
  const n = all ? rows.length : Math.min(10, rows.length);
  const y0 = 250, rh = n > 10 ? 84 : 104, z = rh / 104;
  // the top driver standing beside the list, when there's a full-body picture of them
  const fig = !all && await gfxBody(c, rows[0].id);
  if (fig) { gfxGlow(g, 215, 560, 380, (teamAt(s, rows[0].id, ri) || teamOf(s, rows[0].id))?.color || GFX_RED); await gfxFigure(g, fig, { cx: 215, top: 250, bottom: GFX_H, frac: 0.6 }); }
  const L = fig ? { x: 400, rank: 445, logo: 478, logoW: 92, ph: 582, phW: 80, name: 790, nameMax: 240, pill: 925, pillW: 110 }
    : { x: 30, rank: 90, logo: 150, logoW: 120, ph: 300, phW: 96, name: 640, nameMax: 400, pill: GFX_W - 200, pillW: 140 };
  for (let i = 0; i < n; i++) {
    const x = rows[i]; const y = y0 + i * rh; const tm = teamAt(s, x.id, ri) || teamOf(s, x.id); const col = tm?.color || '#5E6A82'; const ink = contrastInk(col);
    const gr = g.createLinearGradient(L.x, 0, GFX_W - 30, 0); gr.addColorStop(0, mixHex(col, '#0E3A8A', 0.5)); gr.addColorStop(0.35, col); gr.addColorStop(1, mixHex(col, '#000000', 0.25));
    g.fillStyle = gr; g.beginPath(); g.roundRect(L.x, y, GFX_W - 30 - L.x, rh - 12, 14); g.fill();
    const tie = rows.filter(o => o.rating.toFixed(1) === x.rating.toFixed(1)).length > 1;
    const rank = rows.findIndex(o => o.rating.toFixed(1) === x.rating.toFixed(1)) + 1;
    k.text(`${rank}${tie ? '=' : ''}`, L.rank, y + rh / 2 - 6, { size: Math.round(48 * z), weight: 800, color: ink, align: 'center' });
    await gfxLogo(g, k, c, tm, L.logo, y + 16, L.logoW, rh - 44, ink);
    const ph = await headOfAsync(c, x.id, s); if (ph) await k.img(ph, L.ph, y, L.phW, rh - 12, { cover: true });
    k.text(gfxLast(s, x.id), L.name, y + rh / 2 - 6, { size: Math.round(42 * z), weight: 800, color: ink, align: 'center', max: L.nameMax });
    g.fillStyle = '#22D04A'; g.beginPath(); g.roundRect(L.pill, y + 14, L.pillW, rh - 40, 10); g.fill();
    k.text(gfxR(x.rating), L.pill + L.pillW / 2, y + rh / 2 - 6, { size: Math.round(50 * z), weight: 800, color: '#0B1A0B', align: 'center' });
    // the top row's white outline goes over everything in it, the photo included
    if (i === 0) { g.lineWidth = 3; g.strokeStyle = '#FFFFFF'; g.beginPath(); g.roundRect(L.x, y, GFX_W - 30 - L.x, rh - 12, 14); g.stroke(); }
  }
}

/**
 * The permutations a graphic draws, for a stage of round ri: the weekend (''), the sprint on its own ('sprint') or the
 * race after the sprint ('race'). { m, P }.
 */
function gfxPermsFor(s, kind, ri, stage) {
  if (stage === 'sprint') { const m = titleMath(s, kind, ri); return { m, P: sprintPerms(m) }; }
  if (stage === 'race') { const m = titleMath(s, kind, ri, { afterSprint: true }); return { m, P: roundPerms(m) }; }
  const m = titleMath(s, kind, ri); return { m, P: roundPerms(m) };
}
/**
 * One contender's permutations: for each finish of theirs (a driver's place; a team's points from both cars), where
 * each rival has to finish (or the most they may score).
 */
async function gfxPerm(g, k, c, s, { kind, ri, who, stage = '' }) {
  const r = activeRounds(s)[ri]; const { m, P } = gfxPermsFor(s, kind, ri, stage);
  const t = P?.clinch.find(o => o.x.id === who); if (!t?.table?.length) return false;
  const team = kind === 'team'; const byPts = t.table[0].pts != null;
  const tm = team ? s.teams.find(x => x.id === who) : teamAt(s, who, ri) || teamOf(s, who);
  const col = tm?.color || '#5E6A82';
  g.fillStyle = GFX_BG; g.fillRect(0, 0, GFX_W, GFX_H);
  const gr = g.createLinearGradient(0, 0, GFX_W, GFX_H); gr.addColorStop(0, hexA(col, 0.55)); gr.addColorStop(0.7, hexA(col, 0.05)); g.fillStyle = gr; g.fillRect(0, 0, GFX_W, GFX_H);
  await gfxHeader(g, k);
  const name = team ? tm.name.toUpperCase() : gfxLast(s, who);
  // the driver, or a team's two drivers (the second a step behind), standing beside the table
  // the team's better-placed driver stands in front, the teammate a step behind and to the side, a shade darker
  const stT = team ? seasonStats(s, ri) : null;
  const pair = team ? await Promise.all((tm?.drivers || []).filter(Boolean).slice(0, 2).sort((x, y) => (stT[y]?.pts || 0) - (stT[x]?.pts || 0)).map(id => gfxBody(c, id, s))) : [];
  const fig = team ? pair.some(Boolean) : await gfxBody(c, who);
  if (fig) {
    gfxGlow(g, 200, 560, 380, col);
    if (team) { const [a, b] = pair; if (b) { g.save(); g.filter = 'brightness(0.78)'; await gfxFigure(g, b, { cx: a ? 265 : 200, top: 290, bottom: GFX_H, frac: 0.62 }); g.restore(); } if (a) await gfxFigure(g, a, { cx: b ? 150 : 200, top: 250, bottom: GFX_H, frac: 0.6 }); }
    else await gfxFigure(g, fig, { cx: 200, top: 250, bottom: GFX_H, frac: 0.6 });
  }
  const hx = fig ? 725 : GFX_W / 2, hw = fig ? 640 : GFX_W - 80; // the name and the table sit beside the figure
  k.text(P.final ? 'TITLE PERMUTATIONS' : team ? 'CONSTRUCTORS’ TITLE' : 'TITLE DECIDER', GFX_W / 2, 140, { size: 70, weight: 800, align: 'center', max: GFX_W - 80 });
  k.text(`${r.name.toUpperCase()} ${stage === 'sprint' ? 'SPRINT' : 'GRAND PRIX'}  ·  ROUND ${ri + 1}${stage === 'race' ? '  ·  AFTER THE SPRINT' : ''}`, GFX_W / 2, 200, { size: 28, weight: 600, color: '#D0D6E2', align: 'center', max: GFX_W - 80 });
  if (team) await gfxLogo(g, k, c, tm, hx - 160, 236, 320, 70, '#FFFFFF');
  k.text(name, hx, team ? 340 : 290, { size: team ? 72 : 96, weight: 900, align: 'center', max: hw });
  k.text(`${t.x.pts} POINTS  ·  ${t.x.gap ? `${t.x.gap} BEHIND` : m.rows[1] && t.x.pts > m.rows[1].pts ? `${t.x.pts - m.rows[1].pts} AHEAD` : 'LEVEL ON POINTS'}`, hx, team ? 400 : 360, { size: 30, weight: 600, color: '#D0D6E2', align: 'center', max: hw });
  // the table: their result, then each rival's
  const rivals = t.table[0].conds.map(o => o.y).slice(0, 3); const cols = 1 + rivals.length;
  const tx = fig ? 400 : 50, tw = fig ? GFX_W - 430 : GFX_W - 100, cw = tw / cols; let y = team ? 450 : 430; const hh = 96;
  g.fillStyle = GFX_RED; g.fillRect(tx, y, tw, hh);
  k.wrap(`IF ${name} ${byPts ? 'SCORE' : 'FINISHES'}`, tx + cw / 2, y + hh / 2, { size: cw < 200 ? 22 : 26, weight: 800, align: 'center', max: cw - 16, middle: true, lh: 1.15, fam: k.disp });
  rivals.forEach((o, j) => k.wrap(`${team ? o.name.toUpperCase() : gfxLast(s, o.id)} MUST ${byPts ? 'SCORE' : 'FINISH'}`, tx + cw * (j + 1) + cw / 2, y + hh / 2, { size: cw < 200 ? 20 : 24, weight: 800, align: 'center', max: cw - 16, middle: true, lh: 1.15, fam: k.disp }));
  y += hh;
  // a team's points table can run long: the hauls where what the rivals may score changes, at most twelve
  let rows = t.table;
  // a driver's finishes that win it whatever the others do fold into one row: "P3 OR HIGHER", the title across the rivals
  const { sure, rest } = byPts ? { sure: null, rest: rows } : sureSplit(rows);
  if (byPts) { rows = rows.filter((row, i) => i === 0 || i === rows.length - 1 || row.conds.some((o, j) => o.max !== rows[i - 1].conds[j].max)); if (rows.length > 12) rows = rows.filter((_, i) => i % Math.ceil(rows.length / 12) === 0 || i === rows.length - 1); }
  else rows = [...(sure ? [{ ...sure, sure: true }] : []), ...rest].slice(0, 11);
  const rh = Math.min(fig ? 96 : 70, Math.floor((GFX_H - 120 - y) / rows.length));
  const fin = (p, fl, nop) => p >= nop ? 'OUTSIDE THE POINTS' : `P${p}${fl ? ' +FL' : ''}`;
  rows.forEach((row, i) => {
    g.fillStyle = i % 2 ? 'rgba(31,31,39,0.88)' : 'rgba(42,42,52,0.88)'; g.fillRect(tx, y, tw, rh);
    const nop = row.nop || NO_PTS;
    // a team's points sit at the left of the cell and the finishes that make them at the right, both inside it
    if (byPts) {
      k.text(`${row.pts} PTS`, tx + 16, y + rh / 2, { size: Math.min(34, rh * 0.55), weight: 800, max: cw * 0.55 - 16 });
      k.text(`(${row.combo})`, tx + cw - 14, y + rh / 2, { size: Math.min(20, rh * 0.36), weight: 600, color: '#B8C0D0', align: 'right', max: cw * 0.45 - 18, fam: k.body });
    } else if (row.sure && (row.p > 1 || row.fl)) {
      k.text(fin(row.p, row.fl, nop), tx + cw / 2, y + rh / 2 - rh * 0.14, { size: Math.min(36, rh * 0.42), weight: 800, align: 'center', max: cw - 20 });
      k.text('OR HIGHER', tx + cw / 2, y + rh / 2 + rh * 0.24, { size: Math.min(20, rh * 0.24), weight: 700, color: '#D0D6E2', align: 'center', max: cw - 20 });
    } else k.text(fin(row.p, row.fl, nop), tx + cw / 2, y + rh / 2, { size: row.p >= nop ? 24 : 36, weight: 800, align: 'center', max: cw - 20 });
    if (row.sure) {
      // in the team's colour, lifted only when it is too dark to read on the table
      const [cr, cg, cb] = [1, 3, 5].map(n => parseInt(col.slice(n, n + 2), 16)); const lum = 0.299 * cr + 0.587 * cg + 0.114 * cb;
      k.text(`${name} ${team ? 'ARE CHAMPIONS' : 'IS CHAMPION'}`, tx + cw + (tw - cw) / 2, y + rh / 2, { size: 32, weight: 800, color: lum < 70 ? mixHex(col, '#FFFFFF', 0.45) : col, align: 'center', max: tw - cw - 30 });
    } else row.conds.slice(0, 3).forEach((o, j) => {
      const free = byPts ? o.max == null : !o.q;
      const txt = byPts ? (free ? 'ANYTHING' : `${o.max} PTS OR FEWER`) : free ? 'ANYWHERE' : o.q >= nop ? 'OUT OF THE POINTS' : `P${o.q}${o.nofl ? ' (NO FL)' : ''} OR LOWER`;
      k.text(txt, tx + cw * (j + 1) + cw / 2, y + rh / 2, { size: free ? 26 : 28, weight: free ? 600 : 700, color: free ? '#9AE6B4' : '#FFFFFF', align: 'center', max: cw - 20, fam: free ? k.body : undefined });
    });
    y += rh;
  });
  const last = t.table[t.table.length - 1];
  // the final round has no "this weekend" to speak of
  const when = stage === 'sprint' ? ' IN THE SPRINT' : m.left.length === 1 ? '' : ' THIS WEEKEND';
  const foot = byPts ? (last.pts === 0 ? `WHATEVER ${name} SCORE, THE RESULTS ABOVE CAN STILL MAKE THEM CHAMPIONS` : `SCORING FEWER THAN ${last.pts} POINTS, ${name} CAN'T BE CHAMPION${team ? 'S' : ''}${when}`)
    : last.p >= (last.nop || NO_PTS) ? `EVERY FINISH STILL GIVES ${name} A CHANCE, WITH THE RESULTS ABOVE` : `FINISH ${last.fl ? `P${last.p} WITHOUT THE FASTEST LAP` : `P${last.p + 1}`} OR LOWER AND ${name} CAN'T BE CHAMPION${when}`;
  if (fig) k.wrap(foot, tx + tw / 2, GFX_H - 80, { size: 22, weight: 600, color: '#D0D6E2', align: 'center', max: tw - 20 });
  else k.text(foot, GFX_W / 2, GFX_H - 60, { size: 24, weight: 600, color: '#D0D6E2', align: 'center', max: GFX_W - 80, fam: k.body });
}

/* ---------------------------------------------------------------- title graphics */
const _champ = (se, kind) => roundsDone(se) < activeRounds(se).length ? null : kind === 'team' ? constructorStandings(se)[0]?.team.id : driverStandings(se)[0]?.id;
const _root = (id) => D.TEAM_BIO[id]?.lineage?.[0] || id;
/** Titles a driver (or team) had won before season s, the most anyone had, and how many in a row they come in on. */
function titleTally(c, s, kind, id) {
  const first = c.seasons[0]?.year ?? s.year;
  const real = (x) => (kind === 'team' ? D.TEAM_BIO[_root(x)]?.conTitles : x === PLAYER_ID ? null : D.DRIVER_BIO[x]?.titles || null)?.filter(y => +y < first).length || 0;
  const champs = c.seasons.slice(0, s.index).map(se => _champ(se, kind)).map(x => x && (kind === 'team' ? _root(x) : x));
  const key = kind === 'team' ? _root(id) : id;
  const n = real(id) + champs.filter(x => x === key).length;
  let streak = 0; for (let j = champs.length - 1; j >= 0 && champs[j] === key; j--) streak++;
  const counts = {}; champs.forEach(x => { if (x) counts[x] = (counts[x] || 0) + 1; });
  const pool = kind === 'team' ? Object.keys(D.TEAM_BIO) : Object.keys(D.DRIVER_BIO);
  let record = kind === 'team' ? 16 : 7; // Ferrari's sixteen; Schumacher's and Hamilton's seven
  for (const x of new Set([...pool, ...Object.keys(counts)])) record = Math.max(record, real(x) + (counts[kind === 'team' ? _root(x) : x] || 0));
  return { n, streak, record };
}
const _up = (t) => String(t).toUpperCase();
const _num = (n) => n <= 10 ? _up(numWord(n)) : String(n);
/* --- what makes a drivers' title remarkable, from every champion since 1950 (the Hall of Fame) and the career's */
/** The champions before season s, oldest first: { year, key, team, root } (root: the team's id, career seasons only). */
function titleTimeline(c, s) {
  const first = c.seasons[0]?.year ?? s.year;
  const out = D.CHAMPIONS.filter(([y]) => y < first).map(([year, key, team]) => ({ year, key, team: team || '', root: null }));
  for (const se of c.seasons.slice(0, s.index)) { const id = _champ(se, 'driver'); if (id) { const t = teamOf(se, id); out.push({ year: se.year, key: id, team: t?.name || '', root: t ? _root(t.id) : null, se }); } }
  return out;
}
/**
 * The age record to beat for a title: the youngest to win their nth (or, with oldest, the oldest champion), from the
 * real record book and the career's champions before season s. { name, days, y } or null.
 */
function titleAgeRecord(c, s, TL, n, oldest = false) {
  const real = D.RECORDS.find(x => x.id === (oldest ? 'oldTitle' : `youngTitle${n}`))?.holders?.[0];
  const cands = []; if (real) { const a = ageParts(real.born, parseDay(real.date)); if (a) cands.push({ name: real.name, days: a.days, y: a.y }); }
  const cnt = {};
  for (const x of TL) {
    cnt[x.key] = (cnt[x.key] || 0) + 1; if (!x.se || (!oldest && cnt[x.key] !== n)) continue;
    const d = titleDecision(x.se, 'driver'); const born = bornOf(c, x.key); const a = d && born ? ageParts(born, roundDate(x.se, d.r)) : null;
    if (a) cands.push({ name: x.key === PLAYER_ID ? `${c.profile.first} ${c.profile.last}` : dName(x.se, x.key) || anyName(x.key), days: a.days, y: a.y });
  }
  return cands.sort((a, b) => oldest ? b.days - a.days : a.days - b.days)[0] || null;
}
/**
 * The facts a driver's title would carry (or carries), most remarkable first. Each: { score, won, pre, line, ahead }:
 * won and pre are the graphic's words once it's won and while it's within reach, line and ahead the same in a sentence.
 * Records broken rank highest, then records equalled, then a nation's firsts and long waits, a team's, and titles in a
 * row; the last fact is the plain one (score 0), for a title with nothing remarkable about it.
 */
function driverTitleFacts(c, s, id, ri, rnd = Math.random) {
  const TL = titleTimeline(c, s); const norm = (x) => String(x || '').trim().toLowerCase();
  const natOf = (k) => D.CHAMP_BIO[k]?.nat || gfxNat(c, k) || '';
  const nameOf = (k) => D.CHAMP_BIO[k]?.name || (k === PLAYER_ID ? `${c.profile.first} ${c.profile.last}` : dName(s, k) || anyName(k));
  const nat = natOf(id).trim(), ADJ = _up(nat), L = lastName(dName(s, id) || id), full = dName(s, id) || L;
  const n = TL.filter(x => x.key === id).length + 1;
  // titles in a row: theirs coming in, and the longest anyone has had
  let streak = 0; for (let j = TL.length - 1, yr = s.year - 1; j >= 0 && TL[j].key === id && TL[j].year === yr; j--, yr--) streak++;
  let recS = 0, run = 0; TL.forEach((x, j) => { run = j && TL[j - 1].key === x.key && TL[j - 1].year === x.year - 1 ? run + 1 : 1; recS = Math.max(recS, run); });
  const counts = {}; TL.forEach(x => { counts[x.key] = (counts[x.key] || 0) + 1; });
  const rec = Math.max(0, ...Object.entries(counts).filter(([k]) => k !== id).map(([, v]) => v));
  const recBy = Object.keys(counts).filter(k => k !== id && counts[k] === rec).map(nameOf);
  // their nation's titles: how many, by whom, and how long ago
  const natTL = nat ? TL.filter(x => norm(natOf(x.key)) === norm(nat)) : [];
  const natOthers = [...new Set(natTL.map(x => x.key))].filter(k => k !== id);
  const natBest = Math.max(0, ...natOthers.map(k => counts[k])); const natBestBy = natOthers.filter(k => counts[k] === natBest).map(nameOf);
  const lastNat = natTL[natTL.length - 1];
  // their team's drivers' titles
  const tm = teamAt(s, id, ri) || teamOf(s, id); const tn = norm(tm?.name);
  const ofTeam = (x) => x.root ? x.root === _root(tm?.id) : !!tn && x.team.split('/').map(norm).some(p => p && (tn.includes(p) || p.includes(tn)));
  const teamTL = tm ? TL.filter(ofTeam) : []; const lastTeam = teamTL[teamTL.length - 1]; const TEAM = _up(tm?.name || '');
  const NUM = _num(n), ORD = _up(ordWord(n)), sN = streak + 1, F = [];
  if (n > 1 && n > rec) F.push({ score: 100, won: `FIRST ${NUM}-TIME CHAMPION`, pre: choose(rnd, [`AN HISTORIC ${ORD} AWAITS`, `A RECORD ${ORD} AWAITS`, `THE RECORD BOOK AWAITS`]),
    line: `${L} is the first driver ever to win ${n} world titles, passing ${listJoin(recBy)}.`, ahead: `A title would make ${L} the first driver ever to win ${n}, one more than ${listJoin(recBy)}.` });
  else if (n > 1 && n === rec) F.push({ score: 90, won: `RECORD-EQUALLING ${NUM}-TIME CHAMPION`, pre: choose(rnd, [`A RECORD-EQUALLING ${ORD} AWAITS`, `LEVEL WITH THE GREATEST`]),
    line: `${L} joins ${listJoin(recBy)} on a record ${n} titles.`, ahead: `A title would put ${L} level with ${listJoin(recBy)} on a record ${n}.` });
  // their own long wait: a title five years or more after their last
  const lastMine = TL.filter(x => x.key === id).pop();
  if (lastMine && s.year - lastMine.year >= 5) F.push({ score: 62, won: `FIRST TITLE SINCE ${lastMine.year}`, pre: choose(rnd, [`${_num(s.year - lastMine.year)} YEARS ON`, `ONE MORE, ${s.year - lastMine.year} YEARS LATER`]),
    line: `${L} is champion again ${plural(s.year - lastMine.year, 'year')} after the last title, in ${lastMine.year}.`, ahead: `${L} last won the title in ${lastMine.year}, ${plural(s.year - lastMine.year, 'year')} ago.` });
  // age: the youngest to be champion (a first title only), or the oldest
  const born = bornOf(c, id), when = roundDate(s, activeRounds(s)[ri]); const age = born && when ? ageParts(born, when) : null;
  if (age) {
    const young = n === 1 ? titleAgeRecord(c, s, TL, 1) : null, old = titleAgeRecord(c, s, TL, n, true);
    if (young && age.days < young.days) F.push({ score: 92, won: 'YOUNGEST WORLD CHAMPION', pre: choose(rnd, [`HISTORY AT ${age.y}`, 'THE YOUNGEST EVER?']),
      line: `At ${age.y}, ${L} is the youngest world champion ever, younger than ${young.name} was (${young.y}).`, ahead: `At ${age.y}, ${L} would be the youngest world champion ever, beating ${young.name} (${young.y}).` });
    else if (old && age.days > old.days) F.push({ score: 92, won: 'OLDEST WORLD CHAMPION', pre: choose(rnd, ['AGE IS JUST A NUMBER', `HISTORY AT ${age.y}`]),
      line: `At ${age.y}, ${L} is the oldest world champion ever, older than ${old.name} was (${old.y}).`, ahead: `At ${age.y}, ${L} would be the oldest world champion ever, beating ${old.name} (${old.y}).` });
  }
  if (sN >= 2 && sN > recS) F.push({ score: 95, won: `A RECORD ${_num(sN)} IN A ROW`, pre: `A RECORD ${_num(sN)} IN A ROW AWAITS`,
    line: `No driver had ever won ${sN} titles in a row.`, ahead: `Nobody has won ${sN} titles in a row: the record is ${recS}.` });
  else if (sN >= 2 && sN === recS) F.push({ score: 85, won: `${_num(sN)} IN A ROW · RECORD EQUALLED`, pre: `A RECORD-EQUALLING ${_num(sN)} IN A ROW AWAITS`,
    line: `${sN} titles in a row equals the record.`, ahead: `${sN} in a row would equal the record.` });
  else if (sN >= 2) F.push({ score: 50, won: sN === 2 ? 'BACK-TO-BACK CHAMPION' : `${_num(sN)} IN A ROW`, pre: sN === 2 ? choose(rnd, ['BACK-TO-BACK AWAITS', 'TWO IN A ROW AWAITS']) : `${_num(sN)} IN A ROW AWAITS`,
    line: `It is ${L}’s ${ordWord(sN)} title in a row.`, ahead: `${L} is going for ${numWord(sN)} titles in a row.` });
  if (nat && !natTL.length) F.push({ score: 80, won: `FIRST ${ADJ} WORLD CHAMPION`, pre: choose(rnd, [`CARRYING ${ADJ} HOPES`, `${ADJ} HISTORY AWAITS`, 'A NATION HOLDS ITS BREATH']),
    line: `${L} is the first ${nat} world champion.`, ahead: `No ${nat} driver has ever been world champion.` });
  // a nation with one champion at most (people, not titles: Max's four still leave the Netherlands one champion), on a first title only
  else if (nat && natOthers.length < 2 && n === 1) F.push({ score: 70, won: `${_up(ordWord(natOthers.length + 1))} ${ADJ} WORLD CHAMPION`, pre: choose(rnd, [`CARRYING ${ADJ} HOPES`, `${ADJ} HISTORY AWAITS`]),
    line: `${L} is only the ${ordWord(natOthers.length + 1)} ${nat} world champion, after ${listJoin(natOthers.map(k => `${nameOf(k)} (${TL.filter(x => x.key === k).map(x => x.year).join(', ')})`))}.`,
    ahead: `${L} would be only the ${ordWord(natOthers.length + 1)} ${nat} world champion, after ${listJoin(natOthers.map(nameOf))}.` });
  else if (nat && lastNat && lastNat.key !== id && s.year - lastNat.year >= 15) F.push({ score: 68, won: `FIRST ${ADJ} CHAMPION SINCE ${lastNat.year}`, pre: choose(rnd, [`CARRYING ${ADJ} HOPES`, `A ${s.year - lastNat.year}-YEAR WAIT COULD END`, `${ADJ} GLORY AWAITS`]),
    line: `${L} is the first ${nat} champion since ${nameOf(lastNat.key)} in ${lastNat.year}.`, ahead: `${nat} fans have waited ${s.year - lastNat.year} years, since ${nameOf(lastNat.key)} in ${lastNat.year}.` });
  if (nat && natBest >= 1 && n > natBest && n - 1 <= natBest) F.push({ score: natOthers.length < 2 ? 66 : 60, won: `THE MOST SUCCESSFUL ${ADJ} CHAMPION`, pre: `${ADJ} HISTORY AWAITS`,
    line: `With ${n} titles, ${L} passes ${listJoin(natBestBy)} as the most successful ${nat} champion.`, ahead: `A ${ordWord(n)} title would take ${L} past ${listJoin(natBestBy)} as the most successful ${nat} champion.` });
  if (tm && !teamTL.length) F.push({ score: 75, won: `${TEAM}’S FIRST WORLD CHAMPION`, pre: choose(rnd, [`${TEAM}’S FIRST CROWN AWAITS`, `A FIRST FOR ${TEAM}`]),
    line: `${L} is ${tm.name}’s first world champion.`, ahead: `${tm.name} has never had a world champion.` });
  else if (tm && lastTeam && s.year - lastTeam.year >= 10) F.push({ score: 58, won: `${TEAM}’S FIRST CHAMPION SINCE ${lastTeam.year}`, pre: `${TEAM} DREAMS AGAIN`,
    line: `${L} is ${tm.name}’s first champion since ${nameOf(lastTeam.key)} in ${lastTeam.year}.`, ahead: `${tm.name} has not had a champion since ${nameOf(lastTeam.key)} in ${lastTeam.year}.` });
  F.sort((a, b) => b.score - a.score);
  F.push({ score: 0, won: n === 1 ? 'WORLD CHAMPION' : `${NUM}-TIME WORLD CHAMPION`, pre: n === 1 ? choose(rnd, ['HISTORY AWAITS', 'A FIRST TITLE AWAITS', 'ONE STEP FROM HISTORY']) : choose(rnd, [`A ${ORD} TITLE AWAITS`, n === 2 ? 'A SECOND CROWN AWAITS' : `TITLE NUMBER ${NUM} AWAITS`]),
    line: n === 1 ? `It is ${L}’s first world title.` : `It is ${L}’s ${ordWord(n)} world title.`, ahead: n === 1 ? `${full} is chasing a first world title.` : `${full} is chasing a ${ordWord(n)} title.` });
  return { n, streak, facts: F };
}
/** What a title graphic says: { small, big, sub }. mode pre (it can be won) or won. */
function titleWords(c, s, { kind, ri, stage, mode, ids }) {
  const r = activeRounds(s)[ri]; const team = kind === 'team'; const rnd = seeded(`${s.index}-${r.id}-${kind}-${mode}-${stage}`);
  const where = `${_up(r.name)} ${stage === 'sprint' ? 'SPRINT' : 'GRAND PRIX'}`;
  const nm = (id) => team ? _up(s.teams.find(t => t.id === id)?.name || id) : gfxLast(s, id);
  const full = (id) => team ? nm(id) : _up(dName(s, id) || id);
  // a driver: led by the most remarkable thing about the title, with the next one underneath
  if (!team && (mode === 'won' || ids.length === 1)) {
    const [top, next] = driverTitleFacts(c, s, ids[0], ri, rnd).facts;
    if (mode === 'won') return { small: full(ids[0]), big: top.won, sub: next && next.score ? `${next.won}  ·  ${s.year} WORLD CHAMPION` : `${s.year} FORMULA 1 WORLD CHAMPION  ·  CROWNED IN THE ${where}` };
    return { big: top.pre, sub: `${nm(ids[0])} CAN BE CHAMPION IN THE ${where}` };
  }
  const T = titleTally(c, s, kind, ids[0]);
  if (mode === 'won') {
    const n = T.n + 1;
    const big = team ? (n === 1 ? 'CONSTRUCTORS’ CHAMPIONS' : `${_num(n)}-TIME CONSTRUCTORS’ CHAMPIONS`)
      : n === 1 ? 'WORLD CHAMPION' : n > T.record ? `FIRST ${_num(n)}-TIME CHAMPION` : n === T.record ? `RECORD-EQUALLING ${_num(n)}-TIME CHAMPION` : T.streak >= 1 && choose(rnd, [0, 1]) ? `${_num(T.streak + 1)} IN A ROW` : `${_num(n)}-TIME WORLD CHAMPION`;
    return { small: full(ids[0]), big, sub: `${s.year} FORMULA 1 ${team ? 'CONSTRUCTORS’' : 'WORLD'} CHAMPION${team ? 'S' : ''}  ·  CROWNED IN THE ${where}` };
  }
  if (ids.length > 1) {
    const N = _num(ids.length), who = team ? 'TEAMS' : 'DRIVERS';
    return { big: choose(rnd, [`${N} ${who}. ONE CHAMPION.`, `${N} ${who}. ONE CROWN.`, `${N} ${who}. ONE TITLE.`]), sub: `${where}  ·  ${m_left(s, kind, ri) === 1 ? 'THE FINAL ROUND' : `ROUND ${ri + 1}`}` };
  }
  const n = T.n + 1; const what = team ? ' CONSTRUCTORS’' : '';
  const big = n === 1 ? choose(rnd, ['HISTORY AWAITS', `A FIRST${what} TITLE AWAITS`, 'ONE STEP FROM HISTORY'])
    : !team && n > T.record ? choose(rnd, [`AN HISTORIC ${_up(ordWord(n))} AWAITS`, `A RECORD ${_up(ordWord(n))} AWAITS`])
    : !team && n === T.record ? `A RECORD-EQUALLING ${_up(ordWord(n))} AWAITS`
    : T.streak >= 2 ? choose(rnd, [`${_num(T.streak + 1)} IN A ROW AWAITS`, `A ${_up(ordWord(n))}${what} TITLE AWAITS`])
    : choose(rnd, [`A ${_up(ordWord(n))}${what} TITLE AWAITS`, n === 2 ? 'A SECOND CROWN AWAITS' : `TITLE NUMBER ${_num(n)} AWAITS`]);
  return { big, sub: `${nm(ids[0])} CAN ${team ? 'BE CHAMPIONS' : 'BE CHAMPION'} IN THE ${where}` };
}
const m_left = (s, kind, ri) => titleMath(s, kind, ri).left.length;
/**
 * The title graphic: the contenders under their teams' glow with the trophy in front (pre), or the champion in gold
 * (won). Facing: one driver looks at the trophy; two stand back to back; with three the leader stands in front, a
 * little larger, and the other two face out either side; more go left to right in championship order, all one way,
 * each a little smaller.
 */
async function gfxTitle(g, k, c, s, { kind, ri, stage = '', mode = 'pre', ids = [] }) {
  const r = activeRounds(s)[ri]; if (!r || !ids?.length) return false;
  const team = kind === 'team', won = mode === 'won', W = GFX_W, H = GFX_H;
  const st = seasonStats(s, ri + 1); const dpos = driverStandings(s, st).map(x => x.id);
  // who stands in it: the drivers, or each team's (both for one or two teams, else its leading one)
  let figs = [];
  if (team) { const per = ids.length <= 2 ? 2 : 1; for (const tid of ids) { const t = s.teams.find(x => x.id === tid); (t?.drivers || []).filter(Boolean).sort((a, b) => dpos.indexOf(a) - dpos.indexOf(b)).slice(0, per).forEach(id => figs.push({ id, tm: t })); } }
  else figs = ids.map(id => ({ id, tm: teamAt(s, id, ri) || teamOf(s, id) }));
  figs = figs.slice(0, 5); const n = figs.length;
  // where each stands (cx, top, frac; lay[i] is figs[i]) and the trophy's place. Nobody is mirrored: the way each faces
  // (left, right or center, as uploaded) decides where they stand, and the trophy fills whatever side they leave empty
  // (`side`), else stands in the middle. One driver stands away from the side they look to; two looking apart stand
  // back to back, and with one looking straight ahead the other stands on the side they look to (both centred); two
  // looking the same way (or both straight ahead) overlap to one side, the leader in front and larger; with three the
  // leader is in front and the others take the side they look to; more stand in a row.
  const looks = await Promise.all(figs.map(async f => (await gfxBody(c, f.id))?.look || 'center'));
  let lay, tcx = W / 2, side = null;
  if (n === 1) { side = looks[0] === 'left' ? 'left' : 'right'; lay = [{ cx: side === 'left' ? 710 : 370, top: 130, frac: 0.62 }]; }
  else if (n === 2) {
    const [a, b] = looks; const at = (d) => d === 'left' ? 320 : 760;
    if (a !== b && a !== 'center' && b !== 'center') lay = [{ cx: at(a), top: 150, frac: 0.52 }, { cx: at(b), top: 150, frac: 0.52 }];
    else if (a !== b) { const d = a === 'center' ? b : a, other = at(d === 'left' ? 'right' : 'left'); lay = a === 'center' ? [{ cx: other, top: 150, frac: 0.55 }, { cx: at(d), top: 150, frac: 0.55 }] : [{ cx: at(d), top: 150, frac: 0.55 }, { cx: other, top: 150, frac: 0.55 }]; }
    else { side = a === 'left' ? 'left' : 'right'; lay = side === 'left' ? [{ cx: 650, top: 140, frac: 0.6, front: true }, { cx: 880, top: 225, frac: 0.66 }] : [{ cx: 430, top: 140, frac: 0.6, front: true }, { cx: 200, top: 225, frac: 0.66 }]; }
  }
  else if (n === 3) { // the one looking left takes the left
    const swap = (looks[2] === 'left' && looks[1] !== 'left') || (looks[1] === 'right' && looks[2] !== 'right');
    lay =[{ cx: 540, top: 150, frac: 0.66, front: true }, { cx: swap ? 845 : 235, top: 215, frac: 0.7 }, { cx: swap ? 235 : 845, top: 215, frac: 0.7 }]; }
  // two teams: each pair stands together
  else if (team && n === 4 && ids.length === 2) lay = [{ cx: 175, top: 190, frac: 0.6 }, { cx: 390, top: 160, frac: 0.58 }, { cx: 690, top: 160, frac: 0.58 }, { cx: 905, top: 190, frac: 0.6 }];
  else { lay = figs.map((_, i) => ({ cx: 150 + i * (720 / (n - 1)), top: 140 + i * 28, frac: 0.5 + i * 0.02 })); tcx = 880; }
  if (team) lay.forEach(p => { p.top += 90; }); // room above them for the team's logo
  // the background: night blue with light streaks and gold dots, or gold for the champion
  if (won) { const bg = g.createRadialGradient(W / 2, 420, 50, W / 2, 520, 1000); bg.addColorStop(0, '#8A6A1E'); bg.addColorStop(0.45, '#3A2A0A'); bg.addColorStop(1, '#120D04'); g.fillStyle = bg; }
  else { const bg = g.createLinearGradient(0, 0, W, H); bg.addColorStop(0, '#101634'); bg.addColorStop(0.55, '#0B0F22'); bg.addColorStop(1, '#07080F'); g.fillStyle = bg; }
  g.fillRect(0, 0, W, H);
  g.save(); g.lineWidth = 3;
  for (let i = 0; i < 9; i++) { const x = -200 + i * 170; g.strokeStyle = won ? `rgba(243,217,139,${0.10 + (i % 3) * 0.05})` : i % 3 === 0 ? 'rgba(243,217,139,0.18)' : 'rgba(255,255,255,0.07)'; g.beginPath(); g.moveTo(x, H * 0.75); g.lineTo(x + 700, -50); g.stroke(); }
  g.fillStyle = won ? 'rgba(243,217,139,0.5)' : 'rgba(243,217,139,0.35)';
  for (let yy = 110; yy < 420; yy += 22) for (let xx = W - 300; xx < W; xx += 22) { const d = Math.hypot(W - xx, yy - 110) / 380; if (d < 1) { g.beginPath(); g.arc(xx, yy, 5 * (1 - d), 0, 7); g.fill(); } }
  if (won) { const rnd = seeded(`${s.index}-${ri}-confetti`); for (let i = 0; i < 70; i++) { g.save(); g.translate(rnd() * W, rnd() * H * 0.7); g.rotate(rnd() * 3); g.fillStyle = `rgba(${rnd() < 0.5 ? '243,217,139' : '255,255,255'},${0.35 + rnd() * 0.5})`; g.fillRect(-7, -3, 14, 6); g.restore(); } }
  g.restore();
  // one team: its logo, large and faded behind its drivers (with more teams it would clutter)
  if (team && ids.length === 1) for (const tid of ids) {
    const at = lay.filter((p, i) => figs[i]?.tm?.id === tid); if (!at.length) continue;
    const cx = at.reduce((a, p) => a + p.cx, 0) / at.length, bw = ids.length === 1 ? 1500 : ids.length === 2 ? 760 : 420, bh = ids.length === 1 ? 900 : bw * 0.7, tm = s.teams.find(t => t.id === tid), ly = ids.length === 1 ? 460 : 380; // huge, spilling past the edges
    const lim = teamLogoUrl(c, tid) && await loadImg(teamLogoUrl(c, tid));
    g.save(); g.globalAlpha = 0.26;
    if (lim) { const sc = Math.min(bw / lim.width, bh / lim.height), w = lim.width * sc, h = lim.height * sc; g.drawImage(lim, cx - w / 2, ly - h / 2, w, h); }
    else k.text(_up(D.TEAM_BIO[tid]?.short || tm?.name || ''), cx, ly, { size: bh * 0.5, weight: 900, align: 'center', max: bw });
    g.restore();
  }
  // drivers to one side: the trophy fills the empty side, behind them, fading toward the middle; half cut off by the
  // edge for a group, and for one driver either that or the whole trophy, for variety
  const tro = trophyOf(team ? 'team' : 'driver'); const tim = tro && await loadImg(tro); const trophyLeft = side === 'left';
  if (tim && side) {
    const cut = n > 1 || seeded(`${s.index}-${ri}-${kind}-${mode}-${stage}-${ids.join()}-trophy`)() < 0.5;
    const th = cut ? 1700 : 1240, tw = tim.width * th / tim.height, tr = cut ? W - tw / 2 : W - tw * 0.86, gx = cut ? W - 80 : W - tw * 0.42;
    gfxGlow(g, trophyLeft ? W - gx : gx, cut ? 520 : 560, cut ? 600 : 520, '#F3D98B', won ? 0.4 : 0.22);
    g.drawImage(gfxFaded(tim, tw, th, trophyLeft ? { right: 0.45 } : { left: 0.45 }), trophyLeft ? W - tr - tw : tr, cut ? -20 : 40);
  }
  // spread across the middle: the trophy either rises huge out of the bottom in front of them, half in frame, or towers behind them
  const behind = tim && !side && seeded(`${s.index}-${ri}-${kind}-${mode}-${stage}-${ids.join()}-trophy`)() < 0.5;
  if (behind) {
    const th = 1750, tw = tim.width * th / tim.height;
    gfxGlow(g, tcx, 420, 680, '#F3D98B', won ? 0.45 : 0.3);
    g.save(); g.globalAlpha = 0.8; g.drawImage(gfxFaded(tim, tw, th), tcx - tw / 2, -10); g.restore();
  }
  // the glows, then the drivers (back ones first)
  const order = lay.map((p, i) => ({ ...p, f: figs[i] })).sort((a, b) => (a.front ? 1 : 0) - (b.front ? 1 : 0) || b.top - a.top);
  for (const p of order) gfxGlow(g, p.cx, p.top + 330, n === 1 ? 460 : 380, won ? mixHex(p.f.tm?.color || '#D4AF37', '#F3D98B', 0.6) : p.f.tm?.color || '#5E6A82', won ? 0.6 : 0.55);
  for (const p of order) {
    const body = await gfxBody(c, p.f.id);
    if (body) await gfxFigure(g, body, { cx: p.cx, top: p.top, bottom: H, frac: p.frac });
    else { // no full-body picture: their photo in a ring of the team's colour
      const rad = n === 1 ? 190 : 150, cy = p.top + 260; g.save(); g.beginPath(); g.arc(p.cx, cy, rad + 8, 0, 7); g.fillStyle = p.f.tm?.color || '#5E6A82'; g.fill(); g.beginPath(); g.arc(p.cx, cy, rad, 0, 7); g.clip();
      g.fillStyle = '#1F1F27'; g.fillRect(p.cx - rad, cy - rad, rad * 2, rad * 2); const ph = await headOfAsync(c, p.f.id, s); if (ph) await k.img(ph, p.cx - rad, cy - rad, rad * 2, rad * 2, { cover: true }); g.restore();
    }
  }
  // the lower part darkens for the words
  const fade = g.createLinearGradient(0, 760, 0, 1140); fade.addColorStop(0, won ? 'rgba(18,13,4,0)' : 'rgba(7,8,15,0)'); fade.addColorStop(1, won ? 'rgba(18,13,4,0.96)' : 'rgba(7,8,15,0.96)');
  g.fillStyle = fade; g.fillRect(0, 760, W, 380); g.fillStyle = won ? 'rgba(18,13,4,0.96)' : 'rgba(7,8,15,0.96)'; g.fillRect(0, 1140, W, H - 1140);
  if (tim && !side && !behind) {
    const th = 1400, tw = tim.width * th / tim.height, ty = 700; // the top half in frame, sinking into the words
    gfxGlow(g, tcx, ty + 220, 520, '#F3D98B', won ? 0.4 : 0.25);
    g.drawImage(tim, tcx - tw / 2, ty, tw, th);
    const sink = g.createLinearGradient(0, 1010, 0, 1180); const ink = won ? '18,13,4' : '7,8,15';
    sink.addColorStop(0, `rgba(${ink},0)`); sink.addColorStop(1, `rgba(${ink},0.94)`); g.fillStyle = sink; g.fillRect(0, 1010, W, 170); g.fillStyle = `rgba(${ink},0.94)`; g.fillRect(0, 1180, W, H - 1180);
  }
  // the header, over everything
  await gfxHeader(g, k, W);
  // the words
  const T = titleWords(c, s, { kind, ri, stage, mode, ids });
  if (won) {
    k.text(T.small, W / 2, 1125, { size: 44, weight: 800, align: 'center', max: W - 80 });
    k.text(T.big, W / 2, 1195, { size: 84, weight: 900, color: goldFill(g, 0, 1160, W, 70), align: 'center', max: W - 60 });
    k.text(T.sub, W / 2, 1268, { size: 26, weight: 600, color: '#E8D9AE', align: 'center', max: W - 80, fam: k.body });
  } else {
    k.text(T.big, W / 2, 1150, { size: 78, weight: 900, align: 'center', max: W - 60 });
    k.text(T.sub, W / 2, 1212, { size: 28, weight: 600, color: '#D0D6E2', align: 'center', max: W - 80, fam: k.body });
    // the standings of those still in it
    const m = titleMath(s, kind, ri, stage === 'race' ? { afterSprint: true } : {});
    const rows = m.rows.filter(x => x.alive).slice(0, 4); const bw = Math.min(300, (W - 80 - (rows.length - 1) * 12) / rows.length); let x = (W - (rows.length * bw + (rows.length - 1) * 12)) / 2;
    for (const o of rows) {
      const tm = team ? s.teams.find(t => t.id === o.id) : teamAt(s, o.id, ri) || teamOf(s, o.id); const col = tm?.color || '#5E6A82';
      g.fillStyle = col; g.fillRect(x, 1250, bw - 86, 56); k.text(team ? _up(tm?.name || '') : gfxLast(s, o.id), x + 14, 1278, { size: 26, weight: 800, color: contrastInk(col), max: bw - 112 });
      g.fillStyle = GFX_RED; g.fillRect(x + bw - 86, 1250, 86, 56); k.text(String(Math.round(o.pts * 10) / 10), x + bw - 43, 1278, { size: 28, weight: 800, align: 'center', max: 80 });
      x += bw + 12;
    }
  }
}

/*
  Driver of the Day and Driver of the Season, in the same style: their team's colour behind (the driver's photo can come back later),
  their name, the rating (or the number of awards) in its box, the figures behind it, and the runners-up below.
*/
async function gfxAward(c, s, kind, ri) {
  const pick = kind === 'dots' ? driverOfTheSeason(s) : driverOfTheDay(s, ri); if (!pick) return null;
  const cv = document.createElement('canvas'); cv.width = GFX_W; cv.height = GFX_H; const g = cv.getContext('2d'); const k = gfxKit(g);
  const id = pick.id; const rounds = activeRounds(s); const r = rounds[ri];
  const tm = (kind === 'dotd' ? teamAt(s, id, ri) : null) || teamOf(s, id); const col = tm?.color || GFX_RED;
  g.fillStyle = GFX_BG; g.fillRect(0, 0, GFX_W, GFX_H);
  const gr = g.createLinearGradient(0, 0, GFX_W, GFX_H); gr.addColorStop(0, hexA(col, 0.6)); gr.addColorStop(0.75, hexA(col, 0.04)); g.fillStyle = gr; g.fillRect(0, 0, GFX_W, GFX_H);
  const shade = g.createLinearGradient(0, 560, 0, 980); shade.addColorStop(0, 'rgba(21,21,30,0)'); shade.addColorStop(1, 'rgba(21,21,30,1)'); g.fillStyle = shade; g.fillRect(0, 560, GFX_W, 420); g.fillStyle = GFX_BG; g.fillRect(0, 980, GFX_W, GFX_H - 980);
  await gfxHeader(g, k);
  k.text(kind === 'dots' ? 'DRIVER OF THE SEASON' : 'DRIVER OF THE DAY', GFX_W / 2, 140, { size: 76, weight: 800, align: 'center', max: GFX_W - 80 });
  k.text(kind === 'dots' ? `${s.year} FORMULA 1 SEASON${pick.final ? '' : `  ·  AFTER ${roundsDone(s)} OF ${rounds.length} ROUNDS`}` : `${r.name.toUpperCase()} GRAND PRIX  ·  ROUND ${ri + 1} OF ${rounds.length}`, GFX_W / 2, 200, { size: 28, weight: 600, color: '#D0D6E2', align: 'center', max: GFX_W - 80 });
  // with a full-body picture, the driver stands at the left and the card takes the rest
  const fig = await gfxBody(c, id);
  if (fig) { gfxGlow(g, 225, 560, 400, col, 0.5); await gfxFigure(g, fig, { cx: 225, top: 235, bottom: GFX_H, frac: 0.6 }); }
  const X = fig ? 440 : 60, CW = fig ? GFX_W - 40 - 440 : GFX_W - 120;
  if (fig) { g.fillStyle = 'rgba(21,21,30,0.86)'; g.beginPath(); g.roundRect(X - 24, 250, GFX_W - X + 4, GFX_H - 280, 18); g.fill(); } // the card beside them
  // the name and team, and the headline figure
  k.text(lastName(trName(c, s, id)).toUpperCase(), X, fig ? 325 : 690, { size: fig ? 92 : 110, weight: 900, max: fig ? CW : 640 });
  k.text(`${trName(c, s, id).split(' ').slice(0, -1).join(' ').toUpperCase()}  ·  ${(tm?.name || '').toUpperCase()}`, X + 4, fig ? 390 : 770, { size: 30, weight: 600, color: '#D0D6E2', max: fig ? CW : 640, fam: k.body });
  const big = kind === 'dots' ? String(pick.dotd) : gfxR(pick.rating);
  const bx = fig ? X : GFX_W - 330, by = fig ? 430 : 600, bw = fig ? 250 : 270, bh = fig ? 170 : 190;
  g.fillStyle = kind === 'dots' ? goldFill(g, bx, by, bw, bh) : '#22D04A'; g.beginPath(); g.roundRect(bx, by, bw, bh, 18); g.fill();
  k.text(big, bx + bw / 2, by + bh * 0.43, { size: fig ? 104 : 120, weight: 900, color: '#0B1A0B', align: 'center' });
  k.text(kind === 'dots' ? (pick.dotd === 1 ? 'AWARD' : 'AWARDS') : 'RATING', bx + bw / 2, by + bh - 28, { size: 26, weight: 700, color: '#0B1A0B', align: 'center' });
  // the figures
  const tiles = kind === 'dots' ? [['AVERAGE RATING', gfxR(pick.avg)], ['LAST 5', gfxR(pick.last5)], ['RACES RATED', String(pick.list.length)]]
    : [['GRID', pick.grid ? 'P' + pick.grid : '–'], ['FINISH', 'P' + pick.finish], ['CAR PACE', pick.carGap >= 5 ? `+${(pick.carGap / 1000).toFixed(2)}s` : 'FASTEST'], ['QUALIFYING', pick.quali != null ? gfxR(pick.quali) : '–']];
  // beside a figure, four tiles go two by two
  const per = fig && tiles.length > 3 ? 2 : tiles.length, th = fig ? 112 : 130, ty0 = fig ? 640 : 830;
  const tw = (CW - (per - 1) * 16) / per;
  tiles.forEach(([lab, val], j) => { const x = X + (j % per) * (tw + 16), ty = ty0 + Math.floor(j / per) * (th + 14); g.fillStyle = GFX_ROW; g.fillRect(x, ty, tw, th); g.fillStyle = col; g.fillRect(x, ty, tw, 6);
    k.text(lab, x + tw / 2, ty + 38, { size: 22, weight: 700, color: '#A9B2C3', align: 'center', max: tw - 16, fam: k.body });
    k.text(val, x + tw / 2, ty + th - 38, { size: fig ? 48 : 54, weight: 800, color: val === 'P1' ? '#F3D98B' : '#FFFFFF', align: 'center', max: tw - 16 }); });
  const tilesEnd = ty0 + Math.ceil(tiles.length / per) * (th + 14);
  // why, and who else
  const why = kind === 'dots' ? `Driver of the Day in ${listJoin(pick.SR.dotd.filter(x => x.id === id).map(x => x.r.name))}.`
    : pick.reasons.length ? pick.reasons.map(x => x[0].toUpperCase() + x.slice(1)).join(' · ') : `${ordWord(pick.finish)} at the flag`;
  if (fig) k.wrap(why, X, tilesEnd + 24, { size: 24, color: '#D0D6E2', max: CW });
  else k.text(why, GFX_W / 2, 1000, { size: 26, weight: 500, color: '#D0D6E2', align: 'center', max: GFX_W - 100, fam: k.body });
  const others = kind === 'dots' ? Object.values(pick.SR.by).filter(o => o.id !== id && o.dotd).sort((a, b) => b.dotd - a.dotd || b.avg - a.avg).slice(0, 3).map(o => ({ id: o.id, v: String(o.dotd) }))
    : Object.values(raceRatings(s, ri)).filter(x => !x.dnf && x.id !== id).sort((a, b) => b.rating - a.rating).slice(0, 3).map(o => ({ id: o.id, v: gfxR(o.rating) }));
  const oy = fig ? GFX_H - 50 - others.length * 78 - 30 : 1060;
  k.text(kind === 'dots' ? 'RUNNERS-UP' : 'ALSO RATED', X, oy, { size: 24, weight: 800, color: '#A9B2C3', fam: k.body });
  for (let j = 0; j < others.length; j++) {
    const o = others[j]; const y = oy + 25 + j * 78; const t2 = (kind === 'dotd' ? teamAt(s, o.id, ri) : null) || teamOf(s, o.id); const c2 = t2?.color || '#5E6A82'; const ink = contrastInk(c2);
    g.fillStyle = c2; g.beginPath(); g.roundRect(X, y, CW, 66, 10); g.fill();
    await gfxLogo(g, k, c, t2, X + 16, y + 10, 90, 46, ink);
    const p2 = await headOfAsync(c, o.id, s); if (p2) await k.img(p2, X + 120, y, 66, 66, { cover: true });
    k.text(gfxLast(s, o.id), X + 210, y + 33, { size: 34, weight: 800, color: ink, max: CW - 350 });
    g.fillStyle = kind === 'dots' ? goldFill(g, X + CW - 130, y + 10, 110, 46) : '#22D04A'; g.beginPath(); g.roundRect(X + CW - 130, y + 10, 110, 46, 8); g.fill();
    k.text(o.v, X + CW - 75, y + 33, { size: 32, weight: 800, color: '#0B1A0B', align: 'center' });
  }
  return cv;
}

/* ---------------------------------------------------------------- more story graphics */
/*
  Pole, race winner, race preview, calendar, breaking news, records and milestones, quotes and points graphs. They draw
  like F1's own social graphics: the team's colour, the driver's full-body picture, big type. The logo is the story logo,
  recoloured for the background.
*/
/** Diagonal light lines over a box, like the texture on F1's graphics. */
function gfxDiag(g, x, y, w, h, { gap = 90, width = 34, alpha = 0.07, color = '#FFFFFF' } = {}) {
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.globalAlpha = alpha; g.fillStyle = color;
  for (let p = x - h; p < x + w + h; p += gap) { g.beginPath(); g.moveTo(p, y + h); g.lineTo(p + width, y + h); g.lineTo(p + width + h * 0.7, y); g.lineTo(p + h * 0.7, y); g.closePath(); g.fill(); }
  g.restore();
}
const gfxTeamCol = (tm) => tm?.color || '#5E6A82';
/** A colour light enough to carry white type: very pale team colours are darkened a little. */
function gfxDeep(col) { const [r, gg, b] = [1, 3, 5].map(n => parseInt(col.slice(n, n + 2), 16)); const l = 0.299 * r + 0.587 * gg + 0.114 * b; return l > 170 ? mixHex(col, '#000000', 0.35) : col; }
const gfxLum = (col) => { const [r, gg, b] = [1, 3, 5].map(n => parseInt(col.slice(n, n + 2), 16)); return 0.299 * r + 0.587 * gg + 0.114 * b; };
/** Letters spread out: "M A X". */
function gfxSpaced(g, k, t, x, y, { size = 36, weight = 700, color = '#FFFFFF', spacing = 0.6, align = 'center' } = {}) {
  g.font = k.font(size, weight); const sp = size * spacing; const chars = [...String(t)];
  const w = chars.reduce((a, ch) => a + g.measureText(ch).width, 0) + sp * (chars.length - 1);
  let cx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  g.fillStyle = color; g.textAlign = 'left'; g.textBaseline = 'middle';
  for (const ch of chars) { g.fillText(ch, cx, y); cx += g.measureText(ch).width + sp; }
}
/** A driver standing in a graphic, from their full body (or the fallbacks). False when there is no picture at all. */
async function gfxStand(g, c, s, id, o) { const b = await gfxBody(c, id, s); return b ? gfxFigure(g, b, o) : false; }

/** Pole: the team's colour, two white bars, "POLE" across the driver. */
async function gfxPole(g, k, c, s, { ri, k: key = 'Q' }) {
  const r = activeRounds(s)[ri]; const sd = s.weekends[r.id]?.sessions?.[key]; if (!sd?.done) return false;
  const id = (key === 'Q' ? sd.pole : null) ?? sd.results.find(x => !OUT.includes(x.st))?.d; if (!id) return false;
  const tm = teamAt(s, id, ri) || teamOf(s, id); const col = gfxDeep(gfxTeamCol(tm));
  const bg = g.createRadialGradient(380, 500, 60, 380, 600, 1100); bg.addColorStop(0, mixHex(col, '#FFFFFF', 0.18)); bg.addColorStop(0.5, col); bg.addColorStop(1, mixHex(col, '#000000', 0.55));
  g.fillStyle = bg; g.fillRect(0, 0, GFX_W, GFX_H);
  gfxDiag(g, 0, 0, GFX_W, GFX_H, { gap: 150, width: 60, alpha: 0.07 });
  g.fillStyle = '#FFFFFF'; g.fillRect(64, 0, 30, GFX_H); g.fillRect(118, 0, 30, GFX_H); // the two bars
  if (!await gfxStand(g, c, s, id, { cx: 520, top: 150, bottom: GFX_H, frac: 0.6 })) return false;
  const ink = gfxLum(col) > 150 ? '#15151E' : '#FFFFFF';
  k.text(`ROUND ${ri + 1}`, GFX_W - 56, 70, { size: 34, weight: 800, color: ink, align: 'right' });
  k.text(r.venue.toUpperCase(), GFX_W - 56, 110, { size: 28, weight: 600, color: ink, align: 'right', max: 460 });
  const [first, ...rest] = trName(c, s, id).toUpperCase().split(' ');
  gfxSpaced(g, k, first, GFX_W - 60, 560, { size: 30, color: ink, spacing: 0.55, align: 'right' });
  gfxSpaced(g, k, rest.join(' '), GFX_W - 60, 604, { size: 30, color: ink, spacing: 0.55, align: 'right' });
  g.save(); g.shadowColor = 'rgba(0,0,0,0.35)'; g.shadowBlur = 30; k.text('POLE', GFX_W / 2, 1060, { size: 360, weight: 900, color: '#FFFFFF', align: 'center', max: GFX_W - 60 }); g.restore();
  await k.logo(GFX_W - 230, GFX_H - 110, 180, 60, '#FFFFFF', 'right');
}
/** Race winner: team-colour shards, two white lines at the top, the name spread over "WINNER". */
async function gfxWinner(g, k, c, s, { ri, k: key = 'R' }) {
  const r = activeRounds(s)[ri]; const sd = s.weekends[r.id]?.sessions?.[key]; if (!sd?.done) return false;
  const id = sd.results.find(x => !OUT.includes(x.st))?.d; if (!id) return false;
  const tm = teamAt(s, id, ri) || teamOf(s, id); const col = gfxDeep(gfxTeamCol(tm));
  const bg = g.createLinearGradient(0, 0, GFX_W * 0.6, GFX_H); bg.addColorStop(0, mixHex(col, '#FFFFFF', 0.12)); bg.addColorStop(0.55, mixHex(col, '#000000', 0.25)); bg.addColorStop(1, mixHex(col, '#000000', 0.7));
  g.fillStyle = bg; g.fillRect(0, 0, GFX_W, GFX_H);
  // shards
  g.save(); g.fillStyle = 'rgba(255,255,255,0.08)';
  for (const [x, y, w, h] of [[300, 140, 190, 760], [600, -60, 130, 640], [-40, 420, 150, 520], [820, 520, 120, 420]]) { g.beginPath(); g.moveTo(x + h * 0.7, y); g.lineTo(x + h * 0.7 + w, y); g.lineTo(x + w, y + h); g.lineTo(x, y + h); g.closePath(); g.fill(); }
  g.restore();
  g.fillStyle = '#FFFFFF'; g.fillRect(0, 44, 780, 16); g.fillRect(0, 74, 780, 16); // two lines
  await k.logo(GFX_W - 250, 36, 200, 62, '#FFFFFF', 'right');
  if (!await gfxStand(g, c, s, id, { cx: GFX_W / 2, top: 150, bottom: GFX_H, frac: 0.62 })) return false;
  const fade = g.createLinearGradient(0, 760, 0, GFX_H); fade.addColorStop(0, 'rgba(8,8,20,0)'); fade.addColorStop(0.6, 'rgba(8,8,20,0.88)'); fade.addColorStop(1, 'rgba(8,8,20,0.96)'); g.fillStyle = fade; g.fillRect(0, 760, GFX_W, GFX_H - 760);
  const ws = driverRecord(c, id, careerCtxTo(c, s, ri)).tot.wins; // before this race
  gfxSpaced(g, k, trName(c, s, id).toUpperCase(), GFX_W / 2, 1000, { size: 40, weight: 700, spacing: 0.75 });
  k.text(ws === 0 ? 'FIRST WIN' : 'WINNER', GFX_W / 2, 1140, { size: 290, weight: 900, align: 'center', max: GFX_W - 50 });
  gfxSpaced(g, k, `ROUND ${ri + 1}  //  ${r.venue.toUpperCase()}`, GFX_W / 2, 1282, { size: 34, weight: 700, spacing: 0.32 });
}

/**
 * The drivers on a race preview: home drivers first, then the title rivals, the reigning champion, other champions,
 * then the rest at random. Three, or every home driver when there are more than three.
 */
function previewPicks(c, s, ri) {
  const r = activeRounds(s)[ri]; const cc = A.country[D.TRACKS[trackOf(r)]?.country];
  const ses = s.weekends[r.id]?.sessions || {}; const field = (ses.R?.done ? ses.R : ses.Q?.done ? ses.Q : null)?.results.map(x => x.d);
  const grid = field?.length ? field : gridIds(s); const rnd = seeded(`pv-${s.index}-${r.id}`);
  const m = titleMath(s, 'driver', ri); const lead = m.rows[0];
  const home = grid.filter(id => cc && A.nat[gfxNat(c, id)] === cc);
  const rivals = m.rows.filter(x => x.alive && x.pts > 0 && (x === lead || lead.pts - x.pts <= 50)).slice(0, 3).map(x => x.id);
  const prev = c.seasons[s.index - 1]; const champ = prev && roundsDone(prev) === activeRounds(prev).length ? driverStandings(prev)[0]?.id : null;
  const champs = grid.filter(id => titleTally(c, s, 'driver', id).n > 0);
  const rest = grid.slice().sort(() => rnd() - 0.5);
  const out = [];
  const order = ri === 0 ? [champ, ...home, ...champs, ...rest] : [...home, ...rivals, champ, ...champs, ...rest]; // the opener leads with the defending champion
  for (const id of order) if (id && grid.includes(id) && !out.includes(id)) out.push(id);
  return out.slice(0, Math.max(3, home.length + (ri === 0 && champ && !home.includes(champ) ? 1 : 0)));
}
/** Race preview: the picked drivers in front of the host's flag, the Grand Prix's name in glowing gold. */
async function gfxPreview(g, k, c, s, { ri }) {
  const r = activeRounds(s)[ri]; const ids = previewPicks(c, s, ri);
  const bodies = (await Promise.all(ids.map(id => gfxBody(c, id, s)))); const keep = ids.map((id, j) => ({ id, b: bodies[j] })).filter(x => x.b);
  if (keep.length < 3) return false;
  const sky = g.createLinearGradient(0, 0, 0, GFX_H); sky.addColorStop(0, '#E9C27A'); sky.addColorStop(0.45, '#C9925A'); sky.addColorStop(1, '#2A1C16'); g.fillStyle = sky; g.fillRect(0, 0, GFX_W, GFX_H);
  const code = A.country[D.TRACKS[trackOf(r)]?.country]; const svg = code && A.flags[code];
  if (svg) { const im = await loadImg(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`); if (im) { g.save(); g.globalAlpha = 0.4; g.globalCompositeOperation = 'overlay'; const sc = Math.max(GFX_W / im.width, (GFX_H * 0.75) / im.height); g.drawImage(im, (GFX_W - im.width * sc) / 2, 0, im.width * sc, im.height * sc); g.restore(); } }
  // the middle driver a step forward and larger; more than three stand in a row
  const n = keep.length; const order = n === 3 ? [keep[1], keep[2], keep[0]] : keep; // the first pick in the middle
  if (n === 3) {
    await gfxFigure(g, order[0].b, { cx: 190, top: 330, bottom: GFX_H, frac: 0.5 });
    await gfxFigure(g, order[1].b, { cx: GFX_W - 190, top: 330, bottom: GFX_H, frac: 0.5 });
    await gfxFigure(g, order[2].b, { cx: GFX_W / 2, top: 250, bottom: GFX_H, frac: 0.52 });
  } else {
    const step = (GFX_W - 160) / (n - 1);
    for (let j = 0; j < n; j++) await gfxFigure(g, keep[j].b, { cx: 80 + step * j, top: 320 + (j % 2) * 30, bottom: GFX_H, frac: 0.5 });
  }
  const fade = g.createLinearGradient(0, 860, 0, GFX_H); fade.addColorStop(0, 'rgba(20,12,8,0)'); fade.addColorStop(1, 'rgba(20,12,8,0.9)'); g.fillStyle = fade; g.fillRect(0, 860, GFX_W, GFX_H - 860);
  await k.logo(50, 40, 200, 64, '#3A2410', 'left');
  const d = roundDate(s, r);
  gfxSpaced(g, k, `ROUND ${ri + 1}  ·  ${r.venue.toUpperCase()}${d ? `  ·  ${fmtDay(d).toUpperCase()}` : ''}`, GFX_W / 2, 1090, { size: 30, weight: 700, color: '#FFF3D6', spacing: 0.22 });
  const title = `${String(r.name).toUpperCase()} GP`;
  g.save(); g.shadowColor = 'rgba(255,200,90,0.85)'; g.shadowBlur = 60; k.text(title, GFX_W / 2, 1210, { size: 170, weight: 900, color: '#F2C14E', align: 'center', max: GFX_W - 60 }); g.restore();
  g.save(); g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = 14; g.shadowOffsetY = 8; k.text(title, GFX_W / 2, 1210, { size: 170, weight: 900, color: '#F2C14E', align: 'center', max: GFX_W - 60 }); g.restore();
}

/** The calendar, F1-style: a row per round, flag, dates, Grand Prix and venue. New and moved rounds outlined in yellow. */
async function gfxCalendar(g, k, c, s, { year, cal = null, fresh = [] }) {
  const W = GFX_W, H = GFX_H; g.fillStyle = '#F1F1F1'; g.fillRect(0, 0, W, H);
  gfxDiag(g, 0, 0, W, H, { gap: 18, width: 6, alpha: 0.035, color: '#000000' });
  // an announced calendar for a season that doesn't exist yet gets its dates the way a real one would
  const se = c.seasons.find(x => x.year === year) || { year, calendar: (cal || []).map(([id, name, venue, track]) => ({ id, name, venue, track })) }; const rounds = activeRounds(se);
  if (!rounds.length) return false;
  await k.logo(50, 40, 300, 100, GFX_RED, 'left');
  k.text(String(year), 50, 210, { size: 150, weight: 900, color: '#15151E' });
  k.text('CALENDAR', 56, 300, { size: 64, weight: 900, color: '#15151E' });
  const cols = rounds.length > 12 ? 2 : 1, per = Math.ceil(rounds.length / cols); const top = 370, bot = H - 40, gap = 8; const rh = (bot - top - gap * (per - 1)) / per;
  const cw = (W - 100 - (cols - 1) * 20) / cols;
  for (let j = 0; j < rounds.length; j++) {
    const r = rounds[j]; const x = 50 + Math.floor(j / per) * (cw + 20), y = top + (j % per) * (rh + gap);
    g.fillStyle = '#1D1D26'; g.fillRect(x, y, cw, rh); g.fillStyle = GFX_RED; g.fillRect(x, y, 96, rh);
    k.text(`R${j + 1}`, x + 48, y + rh / 2, { size: Math.min(40, rh * 0.5), weight: 900, align: 'center' });
    const code = A.country[D.TRACKS[trackOf(r)]?.country]; const svg = code && A.flags[code];
    if (svg) await k.img(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, x + 110, y + rh * 0.22, 66, rh * 0.56);
    const d = roundDate(se, r); const tx = x + 192;
    k.text(d ? fmtDay(d).toUpperCase() : '', tx, y + rh * 0.24, { size: Math.min(22, rh * 0.24), weight: 600, color: '#CCCCCC', max: cw - 200 });
    k.text(String(r.name).toUpperCase(), tx, y + rh * 0.52, { size: Math.min(32, rh * 0.36), weight: 900, color: GFX_RED, max: cw - 200 });
    k.text(String(r.venue).toUpperCase(), tx, y + rh * 0.8, { size: Math.min(22, rh * 0.24), weight: 700, max: cw - 200 });
    if (fresh.includes(j)) { g.strokeStyle = '#F5C518'; g.lineWidth = 6; g.strokeRect(x + 3, y + 3, cw - 6, rh - 6); }
  }
}

/** Breaking news: a signing, extension, exit or retirement, framed in the colour of the team it's about. */
async function gfxBreaking(g, k, c, s, { tr: trId }) {
  const tr = (s.transfers || []).find(x => x.id === trId); if (!tr) return false; const m0 = tr.steps[0];
  const toT = m0.to && !['free', 'retire', 'pending'].includes(m0.to) ? (s.teams.find(t => t.id === m0.to) || teamMeta(c, m0.to)) : null;
  const fromT = m0.from ? (s.teams.find(t => t.id === m0.from) || teamMeta(c, m0.from)) : null;
  const tm = toT || fromT; const col = gfxDeep(gfxTeamCol(tm));
  const nm = trName(c, s, m0.driver); const start = tr.effective === 'next' ? s.year + 1 : s.year;
  const line = m0.kind === 'extend' ? `Signs on until ${m0.until || start}`
    : m0.to === 'retire' ? (tr.effective === 'next' ? `To retire at the end of the ${s.year} season` : 'Retires with immediate effect')
    : m0.to === 'pending' ? `To leave ${fromT?.name || 'the team'}${tr.effective === 'next' ? ` at the end of ${s.year}` : ''}`
    : m0.to === 'free' ? `Leaves ${fromT?.name || 'the team'}`
    : `Joins ${toT?.name || ''} ${tr.effective === 'next' ? `from ${start}` : 'with immediate effect'}`;
  g.fillStyle = col; g.fillRect(0, 0, GFX_W, GFX_H);
  gfxDiag(g, 0, 0, GFX_W, GFX_H, { gap: 70, width: 22, alpha: 0.12 });
  // the photo panel
  const py = 180, ph = GFX_H - 180 - 230;
  const bg = g.createLinearGradient(0, py, 0, py + ph); bg.addColorStop(0, '#6F7A72'); bg.addColorStop(1, '#2E3530'); g.fillStyle = bg; g.fillRect(0, py, GFX_W, ph);
  g.save(); g.beginPath(); g.rect(0, py, GFX_W, ph); g.clip(); gfxGlow(g, GFX_W / 2, py + ph * 0.55, 520, mixHex(col, '#FFFFFF', 0.3), 0.35);
  const ok = await gfxStand(g, c, s, m0.driver, { cx: GFX_W / 2, top: py + 40, bottom: py + ph, frac: 0.42 }); g.restore();
  if (!ok) return false;
  // the wedges cutting into the photo, textured like the frame
  for (const pts of [[[GFX_W * 0.45, py + ph], [GFX_W, py + ph - 260], [GFX_W, py + ph]], [[GFX_W * 0.7, py], [GFX_W, py], [GFX_W, py + 130]]]) {
    g.save(); g.beginPath(); pts.forEach(([x, y], j) => j ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); g.fillStyle = col; g.fill(); g.clip(); gfxDiag(g, 0, 0, GFX_W, GFX_H, { gap: 70, width: 22, alpha: 0.12 }); g.restore();
  }
  const ink = gfxLum(col) > 150 ? '#15151E' : '#FFFFFF';
  await k.logo(50, 46, 150, 90, ink, 'left');
  k.text('BREAKING', 230, 96, { size: 132, weight: 900, color: ink, max: GFX_W - 280 });
  k.text(nm.toUpperCase(), 50, GFX_H - 160, { size: 96, weight: 900, color: ink, max: GFX_W - 100 });
  k.text(line.toUpperCase(), 50, GFX_H - 80, { size: 44, weight: 600, color: ink, max: GFX_W - 100 });
  // the team's logo sits in the triangle cutting into the photo, above the words
  if (tm) await gfxLogo(g, k, c, tm, GFX_W - 340, py + ph - 175, 300, 150, ink);
}

/** A record or a milestone: a huge number, what it is, who held it before. */
async function gfxRecord(g, k, c, s, { ri, ids, big, what, prev, kind = 'record', share = false }) {
  const tms = ids.map(id => teamAt(s, id, ri) || teamOf(s, id)); const col = gfxTeamCol(tms[0]);
  const ms = kind === 'milestone';
  const bg = g.createLinearGradient(0, 0, GFX_W, GFX_H); bg.addColorStop(0, ms ? '#5A2A00' : '#241A05'); bg.addColorStop(0.7, ms ? '#1A0D02' : '#0F0C05'); g.fillStyle = bg; g.fillRect(0, 0, GFX_W, GFX_H);
  gfxGlow(g, GFX_W * 0.72, 700, 520, col, 0.35);
  if (ids.length > 1) { await gfxStand(g, c, s, ids[1], { cx: GFX_W - 170, top: 420, bottom: GFX_H, frac: 0.55 }); await gfxStand(g, c, s, ids[0], { cx: GFX_W - 400, top: 380, bottom: GFX_H, frac: 0.55 }); }
  else await gfxStand(g, c, s, ids[0], { cx: GFX_W - 270, top: 360, bottom: GFX_H, frac: 0.58 });
  const accent = ms ? '#FFB066' : '#E9C46A';
  await k.logo(50, 36, 200, 60, accent, 'left');
  k.text(ms ? 'MILESTONE' : share ? 'RECORD SHARED' : 'RECORD BROKEN', 56, 140, { size: 38, weight: 800, color: accent });
  const fill = ms ? (() => { const gr = g.createLinearGradient(0, 200, 0, 640); gr.addColorStop(0, '#FFD0A0'); gr.addColorStop(0.6, '#FF8000'); gr.addColorStop(1, '#A04A00'); return gr; })() : goldFill(g, 0, 220, GFX_W, 420);
  k.text(big, 40, 420, { size: 420, weight: 900, color: fill, max: GFX_W * 0.62 });
  k.wrap(what.toUpperCase(), 56, ms ? 800 : 850, { size: ms ? 54 : 66, weight: 900, max: GFX_W * 0.56, lines: ms ? 5 : 3, lh: 1.04, fam: k.disp });
  if (prev) k.wrap(prev, 56, 1120, { size: 28, weight: 600, color: '#D6CFB8', max: GFX_W * 0.56, lines: 4 });
}

/** Quotes: two drivers' words side by side on one graphic (contact, battles, rivals), or one big headline quote. */
async function gfxQuote(g, k, c, s, { ri, kicker, headline, quotes, solo = false }) {
  g.fillStyle = GFX_BG; g.fillRect(0, 0, GFX_W, GFX_H);
  gfxDiag(g, 0, 0, GFX_W, GFX_H, { gap: 80, width: 3, alpha: 0.05 });
  await k.logo(GFX_W - 230, 36, 180, 56, GFX_RED, 'right');
  k.text(String(kicker).toUpperCase(), 54, 120, { size: 32, weight: 800, color: '#FF6B6B', max: GFX_W - 108 });
  const qs = quotes.slice(0, solo ? 1 : 3); const n = qs.length;
  if (solo || qs.length === 1) {
    const q = qs[0]; const tm = teamAt(s, q.id, ri) || teamOf(s, q.id); const col = gfxTeamCol(tm);
    gfxGlow(g, GFX_W - 280, 820, 460, col, 0.45);
    await gfxStand(g, c, s, q.id, { cx: GFX_W - 260, top: 330, bottom: GFX_H, frac: 0.58 });
    k.text('“', 50, 420, { size: 240, weight: 900, color: col, fam: 'Georgia, serif' });
    k.wrap(`${q.text}`.toUpperCase(), 56, 560, { size: 66, weight: 900, max: GFX_W * 0.56, lines: 7, lh: 1.08, fam: k.disp });
    k.text(`${trName(c, s, q.id).toUpperCase()}  ·  ${(tm?.name || '').toUpperCase()}`, 56, GFX_H - 80, { size: 30, weight: 700, color: '#D0D6E2', max: GFX_W * 0.6 });
    return;
  }
  k.wrap(String(headline).toUpperCase(), 54, 200, { size: 62, weight: 900, max: GFX_W - 108, lines: 2, lh: 1.02, fam: k.disp });
  for (let j = 0; j < n; j++) {
    const q = qs[j]; const tm = teamAt(s, q.id, ri) || teamOf(s, q.id); const col = gfxTeamCol(tm); const x0 = j * GFX_W / n, w = GFX_W / n;
    const gr = g.createLinearGradient(0, 420, 0, GFX_H); gr.addColorStop(0, hexA(col, 0)); gr.addColorStop(1, hexA(col, 0.4)); g.fillStyle = gr; g.fillRect(x0, 420, w, GFX_H - 420);
    g.save(); g.beginPath(); g.rect(x0, 0, w, GFX_H); g.clip(); await gfxStand(g, c, s, q.id, { cx: x0 + w / 2, top: 400, bottom: GFX_H, frac: 0.55 }); g.restore();
    const pad = n > 2 ? 16 : 30, bh = n > 2 ? 360 : 280, by = GFX_H - bh - 50; g.fillStyle = 'rgba(0,0,0,0.66)'; g.fillRect(x0 + pad, by, w - pad * 2, bh); g.fillStyle = col; g.fillRect(x0 + pad, by, 10, bh);
    k.text(lastName(trName(c, s, q.id)).toUpperCase(), x0 + pad + 26, by + 44, { size: n > 2 ? 32 : 38, weight: 900, max: w - pad * 2 - 40 });
    k.wrap(`“${q.text}”`, x0 + pad + 26, by + 96, { size: n > 2 ? 23 : 27, weight: 600, max: w - pad * 2 - 44, lines: n > 2 ? 9 : 6, lh: 1.3 });
  }
}

/**
 * A points graph, F1-style: a line per driver in their team's colour (a teammate's dashed), each ending in the name and
 * points. mode decider: those still in contention; review: the top five (or everyone still in it three rounds from
 * the end, if more); rivalry: the gap to the leader over the last five races for the ids given.
 */
async function gfxGraph(g, k, c, s, { ri, mode, ids = [] }) {
  const GFX_W = g.canvas.width, GFX_H = g.canvas.height; // landscape: graphs read better long and flat
  const rounds = activeRounds(s); const upto = mode === 'decider' ? ri : ri + 1; // a decider is drawn going into the round
  const from = mode === 'rivalry' ? Math.max(0, upto - 5) : 0;
  const tot = {}; const pts = (id, i) => tot[id]?.[i] ?? 0;
  for (let i = 0; i < upto; i++) { const st = seasonStats(s, i + 1); for (const id of Object.keys(st)) if (typeof st[id]?.pts === 'number') (tot[id] ||= [])[i] = st[id].pts; }
  let who = ids;
  if (mode === 'decider') who = titleMath(s, 'driver', ri).rows.filter(x => x.alive).map(x => x.id);
  if (mode === 'review') { const fin = titleMath(s, 'driver', rounds.length).rows; const at3 = titleMath(s, 'driver', Math.max(0, rounds.length - 3)).rows.filter(x => x.alive); who = (at3.length > 5 ? at3 : fin.slice(0, 5)).map(x => x.id); }
  if (who.length < 2 || upto - from < 2) return false;
  const xs = Array.from({ length: upto - from }, (_, j) => from + j);
  const lead = Object.fromEntries(xs.map(i => [i, Math.max(...Object.keys(tot).map(id => pts(id, i)))]));
  const val = (id, i) => mode === 'rivalry' ? pts(id, i) - lead[i] : pts(id, i);
  const all = who.flatMap(id => xs.map(i => val(id, i)));
  const ymax = mode === 'rivalry' ? 0 : Math.ceil(Math.max(...all) / 50) * 50, ymin = mode === 'rivalry' ? Math.floor(Math.min(...all, -10) / 10) * 10 : 0;
  g.fillStyle = '#121218'; g.fillRect(0, 0, GFX_W, GFX_H);
  await k.logo(GFX_W - 230, 36, 180, 56, GFX_RED, 'right');
  const R0 = rounds[ri];
  const title = mode === 'decider' ? 'TITLE DECIDER' : mode === 'review' ? `${s.year} SEASON` : 'THE TITLE FIGHT';
  k.text(title, 56, 130, { size: 72, weight: 900, max: GFX_W - 320 });
  k.text(mode === 'decider' ? `${String(R0.name).toUpperCase()} GP · ROUND ${ri + 1} · STILL IN CONTENTION` : mode === 'review' ? 'POINTS THROUGH THE SEASON' : 'GAP TO THE LEADER · LAST FIVE RACES', 56, 196, { size: 28, weight: 600, color: '#B9C0CF', max: GFX_W - 112 });
  const L = 120, Rr = 290, T = 270, B = GFX_H - 130; const px = (j) => L + j * (GFX_W - L - Rr) / (xs.length - 1); const py = (v) => T + (1 - (v - ymin) / ((ymax - ymin) || 1)) * (B - T);
  g.lineWidth = 2; g.strokeStyle = '#2A2A36';
  for (let q = 0; q <= 5; q++) { const v = ymin + (ymax - ymin) * q / 5; g.beginPath(); g.moveTo(L, py(v)); g.lineTo(GFX_W - Rr + 10, py(v)); g.stroke(); k.text(String(Math.round(v)), L - 16, py(v), { size: 24, weight: 700, color: '#8D95A6', align: 'right' }); }
  xs.forEach((i, j) => { if (xs.length <= 8 || j % 3 === 0 || j === xs.length - 1) k.text(mode === 'rivalry' ? (D.TRACKS[trackOf(rounds[i])]?.code || `R${i + 1}`) : `R${i + 1}`, px(j), B + 40, { size: 22, weight: 700, color: '#8D95A6', align: 'center' }); });
  const teamsSeen = {};
  const lines = who.map(id => { const tm = teamAt(s, id, upto - 1) || teamOf(s, id); const col = tm?.color || '#5E6A82'; const dash = !!teamsSeen[tm?.id]; teamsSeen[tm?.id] = 1; return { id, col: gfxLum(col) < 60 ? mixHex(col, '#FFFFFF', 0.4) : col, dash, end: val(id, xs[xs.length - 1]) }; });
  for (const o of lines) {
    g.save(); g.strokeStyle = o.col; g.lineWidth = 7; g.lineJoin = 'round'; g.lineCap = 'round'; if (o.dash) g.setLineDash([18, 12]);
    g.beginPath(); xs.forEach((i, j) => j ? g.lineTo(px(j), py(val(o.id, i))) : g.moveTo(px(j), py(val(o.id, i)))); g.stroke(); g.restore();
  }
  // labels at the end, pushed apart so they never overlap
  const lab = lines.map(o => ({ o, y: py(o.end) })).sort((a, b) => a.y - b.y); for (let j = 1; j < lab.length; j++) if (lab[j].y - lab[j - 1].y < 66) lab[j].y = lab[j - 1].y + 66;
  for (const { o, y } of lab) {
    const x = GFX_W - Rr + 30; g.strokeStyle = o.col; g.lineWidth = 3; g.beginPath(); g.moveTo(px(xs.length - 1), py(o.end)); g.lineTo(x, y); g.stroke();
    g.fillStyle = o.col; g.fillRect(x + 6, y - 28, 8, 56);
    k.text(gfxLast(s, o.id), x + 26, y - 10, { size: 30, weight: 900, max: Rr - 50 });
    k.text(mode === 'rivalry' ? (o.end ? `${o.end} PTS` : 'LEADER') : `${fmtPts(o.end)} PTS`, x + 26, y + 20, { size: 24, weight: 700, color: '#C9CFDC', max: Rr - 50 });
  }
}

/**
 * The title, lap by lap, as a graph (from titleByLap). A weekend only one driver can win it: everyone's points if the
 * race ended on that lap, and a faded gold line where that driver has to be to be champion (his rivals' best plus
 * what's left after this race); sitting on or above it, his line turns gold, and the gold line rides with him. The
 * final race (whoever is ahead at the flag wins): the championship order lap by lap, gold for whoever leads it.
 */
async function gfxLapGraph(g, k, c, s, { ri }) {
  const GFX_W = g.canvas.width, GFX_H = g.canvas.height;
  const T = titleByLap(s, ri); if (!T || T.rows.length < 2) return false;
  const r = activeRounds(s)[ri]; const N = T.rows.length; const ids = T.ids.slice(0, 5);
  const m = titleMath(s, 'driver', ri); const P = !T.final && roundPerms(m);
  const solo = P && P.clinch?.length === 1 ? P.clinch[0].x.id : null;
  const after = m.R - (m.left[0]?.max || 0); // what's left once this race is run
  // where the solo driver must be: his rivals' best plus everything still to come, plus one
  const need = solo ? T.rows.map(row => Math.max(...ids.filter(d => d !== solo).map(d => row.pts[d] ?? 0)) + after + 1) : null;
  const gold = solo ? T.rows.map((row, j) => Math.max(need[j], row.pts[solo])) : null;
  const on = (id, j) => T.final ? T.rows[j].champ === id : id === solo && T.rows[j].pts[solo] >= need[j];
  // the final: the order among the contenders on each lap (the champion of the moment first)
  const rank = T.final ? T.rows.map(row => { const o = ids.slice().sort((a, b) => a === row.champ ? -1 : b === row.champ ? 1 : (row.pts[b] ?? 0) - (row.pts[a] ?? 0)); return Object.fromEntries(o.map((d, q) => [d, q + 1])); }) : null;
  const val = (id, j) => T.final ? rank[j][id] : T.rows[j].pts[id] ?? 0;
  let ymin, ymax;
  if (T.final) { ymin = 1; ymax = ids.length; } else {
    const all = [...ids.flatMap(id => T.rows.map((_, j) => val(id, j))), ...(gold || [])];
    ymin = Math.floor((Math.min(...all) - 5) / 10) * 10; ymax = Math.ceil((Math.max(...all) + 5) / 10) * 10;
  }
  g.fillStyle = '#121218'; g.fillRect(0, 0, GFX_W, GFX_H);
  await k.logo(GFX_W - 230, 36, 180, 56, GFX_RED, 'right');
  k.text('THE TITLE, LAP BY LAP', 56, 130, { size: 72, weight: 900, max: GFX_W - 320 });
  const sub = T.final ? 'CHAMPIONSHIP ORDER IF THE RACE ENDED THERE · GOLD: CHAMPION ON THE ROAD' : solo ? `POINTS IF THE RACE ENDED THERE · GOLD: WHERE ${gfxLast(s, solo)} BECOMES CHAMPION` : 'POINTS IF THE RACE ENDED THERE';
  k.text(`${String(r.name).toUpperCase()} GP · ${sub}`, 56, 196, { size: 28, weight: 600, color: '#B9C0CF', max: GFX_W - 320 });
  const L = 130, Rr = 330, Tp = 270, B = GFX_H - 130;
  const px = (j) => L + j * (GFX_W - L - Rr) / (N - 1);
  const py = (v) => T.final ? Tp + (v - 1) / Math.max(1, ids.length - 1) * (B - Tp) : Tp + (1 - (v - ymin) / ((ymax - ymin) || 1)) * (B - Tp);
  g.lineWidth = 2; g.strokeStyle = '#2A2A36';
  const ticks = T.final ? ids.map((_, q) => q + 1) : Array.from({ length: 6 }, (_, q) => ymin + (ymax - ymin) * q / 5);
  for (const v of ticks) { g.beginPath(); g.moveTo(L, py(v)); g.lineTo(GFX_W - Rr + 10, py(v)); g.stroke(); k.text(T.final ? `P${v}` : String(Math.round(v)), L - 16, py(v), { size: 24, weight: 700, color: '#8D95A6', align: 'right' }); }
  const step = N > 50 ? 10 : N > 25 ? 5 : N > 12 ? 2 : 1;
  for (let j = 0; j < N; j++) if ((j + 1) % step === 0 || j === 0 || j === N - 1) k.text(j === N - 1 ? 'FLAG' : `L${j + 1}`, px(j), B + 40, { size: 22, weight: 700, color: '#8D95A6', align: 'center' });
  const GOLD = '#E3BC4E';
  // the gold line: where the solo driver becomes champion
  if (gold) { g.save(); g.strokeStyle = 'rgba(243,217,139,0.42)'; g.lineWidth = 18; g.lineJoin = 'round'; g.lineCap = 'round'; g.beginPath(); gold.forEach((v, j) => j ? g.lineTo(px(j), py(v)) : g.moveTo(px(j), py(v))); g.stroke(); g.restore(); }
  const seen = {};
  const lines = ids.map(id => { const tm = teamOf(s, id); const col0 = tm?.color || '#5E6A82'; const dash = !!seen[tm?.id]; seen[tm?.id] = 1; return { id, col: gfxLum(col0) < 60 ? mixHex(col0, '#FFFFFF', 0.4) : col0, dash }; });
  // the solo driver (or the contenders in the final) drawn last, so gold sits on top
  for (const o of lines.slice().sort((a, b) => (a.id === solo) - (b.id === solo))) {
    g.save(); g.lineWidth = 7; g.lineJoin = 'round'; g.lineCap = 'round'; if (o.dash) g.setLineDash([18, 12]);
    for (let j = 1; j < N; j++) { g.strokeStyle = on(o.id, j) && on(o.id, j - 1) ? GOLD : on(o.id, j) || on(o.id, j - 1) ? mixHex(o.col, GOLD, 0.5) : o.col; g.beginPath(); g.moveTo(px(j - 1), py(val(o.id, j - 1))); g.lineTo(px(j), py(val(o.id, j))); g.stroke(); }
    g.restore();
  }
  // labels at the end, pushed apart so they never overlap
  const lab = lines.map(o => ({ o, end: val(o.id, N - 1), y: py(val(o.id, N - 1)) })).sort((a, b) => a.y - b.y); for (let j = 1; j < lab.length; j++) if (lab[j].y - lab[j - 1].y < 66) lab[j].y = lab[j - 1].y + 66;
  for (const { o, end, y } of lab) {
    const won = on(o.id, N - 1); const col = won ? GOLD : o.col; const x = GFX_W - Rr + 30;
    g.strokeStyle = col; g.lineWidth = 3; g.beginPath(); g.moveTo(px(N - 1), py(end)); g.lineTo(x, y); g.stroke();
    g.fillStyle = col; g.fillRect(x + 6, y - 28, 8, 56);
    k.text(gfxLast(s, o.id), x + 26, y - 10, { size: 30, weight: 900, max: Rr - 50, color: won ? GOLD : '#FFFFFF' });
    k.text(T.final ? (won ? 'CHAMPION' : `P${end} · ${fmtPts(T.rows[N - 1].pts[o.id] ?? 0)} PTS`) : `${fmtPts(end)} PTS${won ? ' · CHAMPION' : ''}`, x + 26, y + 20, { size: 24, weight: 700, color: '#C9CFDC', max: Rr - 50 });
  }
  if (gold && !on(solo, N - 1)) { const yv = py(gold[N - 1]); k.text(`NEEDED: ${fmtPts(need[N - 1])}`, px(N - 1) - 12, yv - 24, { size: 22, weight: 800, color: GOLD, align: 'right' }); }
}

/** The career leaderboard's top 10, by the column it's sorted on (named in the subtitle), with the stats picked. */
async function gfxLeaderboard(g, k, c, s, { sort, cols, full, rows }) {
  const label = Object.fromEntries(LB_COLS); const what = { titles: 'Most world titles', starts: 'Most Grand Prix starts', wins: 'Most Grand Prix wins', podiums: 'Most podiums', poles: 'Most pole positions', pts: 'Most points' }[sort];
  await gfxFrame(g, k, 'CAREER LEADERBOARD', { sub: `${what.toUpperCase()}  ·  ${full ? 'ENTIRE F1 CAREERS' : 'THIS CAREER ONLY'}  ·  ${s.year}` });
  const order = [sort, ...cols.filter(x => x !== sort)]; const vw = 130; const y0 = 290, rh = Math.floor((GFX_H - 60 - y0) / Math.max(10, rows.length));
  const xs = order.map((_, j) => GFX_W - 30 - (order.length - j) * (vw + 6));
  order.forEach((key, j) => k.text(label[key].toUpperCase(), xs[j] + vw / 2, y0 - 22, { size: 20, weight: 700, color: key === sort ? '#FFFFFF' : '#B8C0D0', align: 'center', max: vw }));
  for (let i = 0; i < rows.length; i++) {
    const x = rows[i]; const y = y0 + i * rh; const tm = x.team ? s.teams.find(t => t.id === x.team) : null; const col = tm?.color || '#3A3F4A'; const ink = tm ? contrastInk(col) : '#FFFFFF';
    g.fillStyle = GFX_ROW; g.fillRect(30, y, 90, rh - 6); k.text(String(i + 1), 75, y + rh / 2 - 3, { size: 40, weight: 600, align: 'center', fam: k.body });
    const bw = xs[0] - 6 - 126; g.fillStyle = col; g.fillRect(126, y, bw, rh - 6);
    if (tm) await gfxLogo(g, k, c, tm, 140, y + 14, 80, rh - 34, ink);
    const ph = await headOfAsync(c, x.id, s); if (ph) await k.img(ph, tm ? 230 : 140, y, 84, rh - 6, { cover: true });
    k.text(lastName(x.name).toUpperCase(), (tm ? 230 : 140) + (ph ? 100 : 0), y + rh / 2 - 3, { size: 40, weight: 800, color: ink, max: bw - 220 });
    order.forEach((key, j) => { g.fillStyle = key === sort ? '#B80500' : GFX_RED; g.fillRect(xs[j], y, vw, rh - 6); k.text(key === 'pts' ? fmtPts(x[key]) : String(x[key] || (key === 'titles' ? '–' : 0)), xs[j] + vw / 2, y + rh / 2 - 3, { size: 38, weight: 800, align: 'center', max: vw - 12 }); });
  }
}

/** Head to head, F1 style: both drivers in their team's colours, the bars meeting in the middle, the better figure bright. */
async function gfxH2H(g, k, c, s, { a, b, scope }) {
  const seasons = scope === 'all' ? c.seasons : [c.seasons[scope === 'cur' ? c.seasons.length - 1 : +scope]];
  const ref = seasons[seasons.length - 1]; const h = h2hCompare(seasons, a, b);
  const ca = teamColor(ref, a), cb0 = teamColor(ref, b); const cb = ca === cb0 ? '#8B97AF' : cb0;
  const [ba, bb] = await Promise.all([gfxBody(c, a, ref), gfxBody(c, b, ref)]); if (!ba || !bb) return false;
  g.fillStyle = GFX_BG; g.fillRect(0, 0, GFX_W, GFX_H);
  for (const [x0, col, dir] of [[0, ca, 1], [GFX_W / 2, cb, -1]]) { const gr = g.createLinearGradient(x0 + (dir > 0 ? 0 : GFX_W / 2), 0, x0 + (dir > 0 ? GFX_W / 2 : 0), 620); gr.addColorStop(0, hexA(col, 0.7)); gr.addColorStop(1, hexA(col, 0)); g.fillStyle = gr; g.fillRect(x0, 0, GFX_W / 2, 640); }
  for (const [body, cx] of [[ba, GFX_W * 0.25], [bb, GFX_W * 0.75]]) { g.save(); g.beginPath(); g.rect(cx - GFX_W / 4, 0, GFX_W / 2, 600); g.clip(); await gfxFigure(g, body, { cx, top: 110, bottom: 600, frac: 0.42 }); g.restore(); }
  const fade = g.createLinearGradient(0, 420, 0, 620); fade.addColorStop(0, 'rgba(21,21,30,0)'); fade.addColorStop(1, 'rgba(21,21,30,1)'); g.fillStyle = fade; g.fillRect(0, 420, GFX_W, 200);
  await k.logo(40, 30, 200, 60, '#FFFFFF', 'left');
  k.text('V', GFX_W / 2, 300, { size: 110, weight: 900, color: GFX_RED, align: 'center' });
  k.text(gfxLast(ref, a), GFX_W * 0.25, 560, { size: 66, weight: 900, align: 'center', max: GFX_W / 2 - 40 });
  k.text(gfxLast(ref, b), GFX_W * 0.75, 560, { size: 66, weight: 900, align: 'center', max: GFX_W / 2 - 40 });
  k.text(scope === 'all' ? 'WHOLE CAREER' : `${ref.year} SEASON`, GFX_W / 2, 620, { size: 26, weight: 700, color: '#B8C0D0', align: 'center' });
  const avgOf = (v) => v.length ? v.reduce((x, y) => x + y, 0) / v.length : null;
  const rows = [['QUALIFYING', h.q[0], h.q[1]], ['RACES', h.r[0], h.r[1]], ['POINTS', h.pts[0], h.pts[1]], ['WINS', h.wins[0], h.wins[1]], ['PODIUMS', h.podiums[0], h.podiums[1]], ['POLES', h.poles[0], h.poles[1]], ['AVG FINISH', avgOf(h.finPos[0]), avgOf(h.finPos[1]), true]];
  const top = 680, rh = (GFX_H - 60 - top) / rows.length;
  rows.forEach(([lab, va, vb, low], j) => {
    const y = top + j * rh + rh / 2; const na = va ?? 0, nb = vb ?? 0; const t = na + nb || 1; const aBetter = va != null && vb != null && va !== vb && (low ? va < vb : va > vb), bBetter = va != null && vb != null && va !== vb && !aBetter;
    const pa = va == null || vb == null ? 0.5 : low ? nb / t : na / t; const bw = 290, mid = GFX_W / 2, gap = 120;
    g.fillStyle = '#2A2A34'; g.fillRect(mid - gap - bw, y - 14, bw, 28); g.fillRect(mid + gap, y - 14, bw, 28);
    g.fillStyle = ca; g.fillRect(mid - gap - bw * pa, y - 14, bw * pa, 28); g.fillStyle = cb; g.fillRect(mid + gap, y - 14, bw * (1 - pa), 28);
    const f = (v) => v == null ? '–' : low ? v.toFixed(1) : fmtPts(v);
    k.text(f(va), mid - gap - bw - 20, y, { size: 44, weight: 800, align: 'right', color: bBetter ? '#7C8293' : '#FFFFFF', max: mid - gap - bw - 50 });
    k.text(f(vb), mid + gap + bw + 20, y, { size: 44, weight: 800, color: aBetter ? '#7C8293' : '#FFFFFF', max: mid - gap - bw - 50 });
    k.text(lab, mid, y, { size: 22, weight: 700, color: '#C9CFDC', align: 'center', max: gap * 2 - 10 });
  });
}

/* ------------------------------------------------------------- the season preview graphic */
/**
 * What the pre-season graphic is about: last year's champion (if still on the grid), the five favourites on form
 * before round 1 (the champion first in the lineup when he's on the grid), the opener and the finale, and the
 * headline, picked from the variants that fit the season.
 */
function seasonGfxData(c, s) {
  const prev = c.seasons[s.index - 1]; const rounds = activeRounds(s); if (!rounds.length) return null;
  const grid = gridIds(s);
  const champ = prev && roundsDone(prev) >= activeRounds(prev).length ? driverStandings(prev)[0]?.id ?? null : null;
  const onGrid = !!champ && grid.includes(champ);
  let top = [];
  try { const Pj = projection(c, s, titleMath(s, 'driver', 0), 0); if (Pj.hasForm) top = Pj.rows.map(x => x.id); } catch { /* no form yet */ }
  if (!top.length) top = grid.slice();
  top = top.filter(d => grid.includes(d));
  const pick = Object.fromEntries(top.map((d, i) => [d, i + 1]));
  const five = (onGrid ? [champ, ...top.filter(d => d !== champ)] : top).slice(0, 5);
  const subject = onGrid ? champ : top[0];
  const titles = (d) => titleTally(c, s, 'driver', d).n;
  const r0 = rounds[0], fin = rounds[rounds.length - 1];
  const name = (d) => lastName(dName(s, d) || d);
  const champName = champ ? (onGrid ? name(champ) : lastName(dName(prev, champ) || refName(champ))) : '';
  const moved = onGrid && prev && teamOf(prev, champ) && teamRoot(teamOf(prev, champ).id) !== teamRoot(teamOf(s, champ)?.id);
  const close = top.length >= 5; // the forecast always has five; the five-way line needs no more than that
  const Y = s.year, n = onGrid ? titles(champ) : 0;
  // the headlines: text (sentence case) and hi (the part drawn in gold / red / bold), with when each fits
  const V = [
    { t: `Who will reign in F1 ${Y}?`, hi: `F1 ${Y}?`, paper: 'reign' },
    { t: `The ${Y} crown: who takes it?`, hi: 'who takes it?', paper: 'crown' },
    { t: `${rounds.length} races. One champion.`, hi: 'One champion.', paper: 'One champion.' },
    close && { t: 'Five contenders. One crown.', hi: 'One crown.', paper: 'One crown.' },
    { t: `The hunt for the ${Y} title`, hi: `${Y} title`, paper: 'hunt' },
    { t: `Lights out on ${Y}`, hi: String(Y), paper: 'Lights out', launch: true },
    { t: `${Y}: it all starts in ${r0.name}`, hi: r0.name, paper: r0.name, launch: true },
    { t: `The road to ${fin.name} starts now`, hi: fin.name, paper: fin.name, launch: true },
    onGrid && pick[champ] === 1 && { t: `Can anyone stop ${champName}?`, hi: `${champName}?`, paper: 'stop', champ: true },
    onGrid && n >= 2 && { t: `${champName} goes for number ${n + 1}`, hi: `number ${n + 1}`, paper: `number ${n + 1}`, champ: true },
    onGrid && pick[champ] !== 1 && { t: `${champName} defends. Who dethrones?`, hi: 'Who dethrones?', paper: 'dethrones', champ: true },
    (!onGrid || (top[0] && !titles(top[0]))) && { t: `A new king in ${Y}?`, hi: 'new king', paper: 'new king' },
    champ && !onGrid && { t: 'Who’s next?', hi: 'next?', paper: 'next?' },
  ].filter(Boolean);
  return { prev, champ, onGrid, subject, top, five, pick, titles, r0, fin, rounds, moved, V, name, Y, sprints: rounds.filter(x => x.sprint).length };
}
const SEASON_STYLES = ['lineup', 'shadow', 'paper', 'split', 'gold', 'lights'];
/** The style and headline for a season: seeded, so a season keeps its graphic; the champion's style gets a champion headline when there is one. */
function seasonGfxPick(c, s, style = null, head = null) {
  const D0 = seasonGfxData(c, s); if (!D0) return null; const set = seasonGfxSet(c, s);
  const st = style || set[0]?.style || 'lineup';
  const hi = head != null && D0.V[head] ? head : set.find(x => x.style === st)?.head ?? 0;
  return { ...D0, style: st, head: D0.V[hi] || D0.V[0] };
}
/**
 * The season's three graphics, as if from three outlets: three different styles, each with its own headline (the
 * champion's style with a champion headline when there is one). Seeded, so a season keeps them. [{ style, head }]
 */
function seasonGfxSet(c, s, n = 3) {
  const D0 = seasonGfxData(c, s); if (!D0) return [];
  const rnd = seeded(`season-gfx-${s.year}-${c.id || ''}`); const styles = SEASON_STYLES.slice();
  for (let i = styles.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [styles[i], styles[j]] = [styles[j], styles[i]]; }
  const used = new Set();
  return styles.slice(0, n).map(st => {
    const fits = D0.V.map((v, i) => ({ v, i })).filter(({ v }) => st === 'shadow' && D0.V.some(x => x.champ) ? v.champ : st === 'lights' ? v.launch || !v.champ : true);
    const free = fits.filter(x => !used.has(x.i)); const pool = free.length ? free : fits;
    const pk = pool[Math.floor(rnd() * pool.length)]; used.add(pk.i); return { style: st, head: pk.i };
  });
}
/** Words laid out over lines, each word in its own style; align left or center. Returns the y after the last line. */
function gfxRich(g, k, words, x, y, { size, max, lh = 1.0, align = 'left', fam = null, weight = 900, lines = 4, breakHi = false, dry = false }) {
  const fnt = (w) => `${w.italic ? 'italic ' : ''}${k.font(size, w.weight ?? weight, w.fam || fam || k.disp)}`;
  // a word too long for a line shrinks the whole headline
  { const widest = Math.max(...words.map(w => { g.font = fnt(w); return g.measureText(w.t).width; })); if (widest > max) size = Math.floor(size * max / widest); }
  const space = () => { g.font = k.font(size, weight, fam || k.disp); return g.measureText(' ').width; };
  const out = [[]]; let wid = 0;
  for (const w of words) { g.font = fnt(w); const ww = g.measureText(w.t).width; const add = out[out.length - 1].length ? space() + ww : ww; if (((breakHi && w.br) || wid + add > max) && out[out.length - 1].length && out.length < lines) { out.push([]); wid = ww; } else wid += add; out[out.length - 1].push({ ...w, ww }); }
  if (dry) return y + out.length * size * lh;
  g.textBaseline = 'alphabetic';
  out.forEach((ln, i) => {
    const lw = ln.reduce((a, w, j) => a + w.ww + (j ? space() : 0), 0); let cx = align === 'center' ? x - lw / 2 : x; const yy = y + size * 0.8 + i * size * lh;
    for (const w of ln) { g.font = fnt(w); g.fillStyle = w.color || '#FFFFFF'; g.textAlign = 'left'; g.fillText(w.t, cx, yy); cx += w.ww + space(); }
  });
  return y + out.length * size * lh;
}
/** A headline as words, the highlighted part in its own style. */
function headWords(h, hiKey, base, hiStyle, upper = true) {
  const t = upper ? h.t.toUpperCase() : h.t; const hi = upper ? (h[hiKey] || h.hi).toUpperCase() : (h[hiKey] || h.hi);
  const at = t.indexOf(hi); const parts = at < 0 ? [[t, false]] : [[t.slice(0, at), false], [hi, true], [t.slice(at + hi.length), false]];
  return parts.flatMap(([p, on]) => p.split(' ').filter(Boolean).map((w, j) => ({ t: w, ...(on ? hiStyle : base), br: on && j === 0 })));
}
/** A cut-out drawn full length: its visible box h tall, centred on cx, feet at bottom. */
async function gfxStandAt(g, url, cx, bottom, h, { filter = null, blend = null, shadow = null } = {}) {
  const B = url && await gfxBodyBox(url); if (!B) return false;
  const sc = h / B.h; const dw = B.w * sc;
  g.save(); if (filter) g.filter = filter; if (blend) g.globalCompositeOperation = blend; if (shadow) { g.shadowColor = shadow; g.shadowBlur = 30; g.shadowOffsetY = 12; }
  g.drawImage(B.im, B.x, B.y, B.w, B.h, cx - dw / 2, bottom - h, dw, h); g.restore(); return true;
}
const pickWord = (P, d) => d === P.champ && P.onGrid ? 'CHAMPION' : `${ordWord(P.pick[d] || 0).toUpperCase()} PICK`;

async function gfxSeason(g, k, c, s, { style, head = null }) {
  const P = seasonGfxPick(c, s, style, head); if (!P) return false;
  const W = GFX_W, H = GFX_H, u = W / 100; const Y = P.Y; const h = P.head;
  // the generic stand-in driver would make the favourites look alike: a driver without a picture is left out
  const bodies = Object.fromEntries(await Promise.all(P.five.map(async d => { const b = await gfxBody(c, d, s); return [d, b && b.fallback !== 'default' ? b.url : null]; })));
  const goldT = goldFill(g, 0, 0, W, H);
  const tm = (d) => teamOf(s, d); const col = (d) => tm(d)?.color || '#5E6A82';

  if (P.style === 'lineup') {
    const bg = g.createRadialGradient(W / 2, 0, 0, W / 2, 0, H * 0.9); bg.addColorStop(0, '#1B2A52'); bg.addColorStop(1, '#0A0F1E'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
    gfxDiag(g, 0, 0, W, H, { gap: 76, width: 7, alpha: 0.05 });
    gfxSpaced(g, k, `FORMULA 1 · ${Y}`, W / 2, 6.2 * u, { size: 28, spacing: 0.5, color: 'rgba(255,255,255,0.75)' });
    const a = h.t.toUpperCase(), hi = h.hi.toUpperCase(), at = a.indexOf(hi); const l1 = at > 0 ? a.slice(0, at).trim() : a, l2 = at > 0 ? a.slice(at).trim() : '';
    k.text(l1, W / 2, 15 * u, { size: 100, weight: 900, align: 'center', max: W - 80 });
    if (l2) k.text(l2, W / 2, 28 * u, { size: 160, weight: 900, align: 'center', max: W - 80, color: goldFill(g, 0, 21 * u, W, 15 * u) });
    const xs = [12, 31, 69, 88]; const order = [P.five[4], P.five[2], P.five[1], P.five[3]];
    for (let j = 0; j < 4; j++) if (order[j]) await gfxStandAt(g, bodies[order[j]], xs[j] * u, H - 17 * u, 62 * u, { shadow: 'rgba(0,0,0,0.6)' });
    await gfxStandAt(g, bodies[P.five[0]], 50 * u, H - 17 * u, 74 * u, { shadow: 'rgba(0,0,0,0.6)' });
    const fl = g.createLinearGradient(0, H - 24 * u, 0, H); fl.addColorStop(0, 'rgba(5,7,13,0)'); fl.addColorStop(0.55, 'rgba(5,7,13,1)'); g.fillStyle = fl; g.fillRect(0, H - 24 * u, W, 24 * u);
    const slots = [P.five[4], P.five[2], P.five[0], P.five[1], P.five[3]];
    slots.forEach((d, j) => { if (!d) return; const x = (3 + 94 * (j + 0.5) / 5) * u; const lead = j === 2;
      k.text(gfxLast(s, d), x, H - 10 * u, { size: 32, weight: 800, align: 'center', max: 18 * u, color: lead ? goldFill(g, 0, H - 12 * u, W, 4 * u) : '#FFFFFF' });
      k.text(pickWord(P, d), x, H - 6.6 * u, { size: 20, weight: 700, align: 'center', color: 'rgba(255,255,255,0.7)' }); });
    await k.logo(4 * u, H - 4.6 * u, 160, 30, 'rgba(255,255,255,0.7)', 'left');
    return true;
  }

  if (P.style === 'shadow') {
    const sc = col(P.subject); const lite = mixHex(sc, '#FFFFFF', 0.35);
    const bg = g.createLinearGradient(0, 0, W * 0.6, H); bg.addColorStop(0, lite); bg.addColorStop(0.32, mixHex(sc, '#000000', 0.45)); bg.addColorStop(0.72, '#111114'); bg.addColorStop(1, '#0A0A0D'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
    gfxGlow(g, 0.7 * W, 0.4 * H, 0.55 * W, '#E9C46A', 0.35);
    const body = bodies[P.subject];
    await gfxStandAt(g, body, W - 22 * u, H + 4 * u, 118 * u, { shadow: 'rgba(0,0,0,0.7)' });
    const end = gfxRich(g, k, headWords(h, 'hi', {}, { color: goldFill(g, 0, 8 * u, W, 50 * u) }), 5 * u, 8 * u, { size: 108, max: 54 * u, lh: 0.95 });
    const left = P.five.filter(d => d !== P.subject).slice(0, 4);
    const sub = P.onGrid ? `The champion starts the defence in ${P.r0.name}. ${cap(numWord(left.length))} drivers want the crown.` : `${P.r0.name} opens a season with no champion on the grid. The favourite starts here.`;
    k.wrap(sub, 5 * u, end + 5 * u, { size: 32, weight: 600, max: 50 * u, lines: 4, lh: 1.3, color: 'rgba(255,255,255,0.88)' });
    const sh = g.createLinearGradient(0, H - 36 * u, 0, H); sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(0.35, 'rgba(0,0,0,0.85)'); sh.addColorStop(1, '#000'); g.fillStyle = sh; g.fillRect(0, H - 36 * u, W, 36 * u);
    gfxSpaced(g, k, P.onGrid ? 'THE CHALLENGERS' : 'THE CONTENDERS', 5 * u, H - 34 * u, { size: 26, spacing: 0.35, align: 'left', color: 'rgba(255,255,255,0.75)' });
    for (let j = 0; j < left.length; j++) {
      const d = left[j]; const x = (5 + j * 22) * u, y = H - 32 * u, w = 18 * u, hh = 25 * u; const ph = await headOfAsync(c, d, s);
      g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(x, y, w, hh); if (ph) await k.img(ph, x, y, w, hh, { cover: true });
      g.fillStyle = col(d); g.fillRect(x, y + hh - 9, w, 9);
      k.text(gfxLast(s, d), x + w / 2, y + hh + 26, { size: 22, weight: 800, align: 'center', max: w });
    }
    await k.logo(W - 4 * u - 160, H - 4.6 * u, 160, 30, 'rgba(255,255,255,0.7)', 'right');
    return true;
  }

  if (P.style === 'paper') {
    const ink = '#111111', red = '#D0262E', serif = 'Georgia, "Times New Roman", serif';
    g.fillStyle = '#F2EEE6'; g.fillRect(0, 0, W, H);
    gfxSpaced(g, k, 'THE PADDOCK REVIEW', 5 * u, 6.2 * u, { size: 24, spacing: 0.3, align: 'left', color: ink });
    gfxSpaced(g, k, `SEASON PREVIEW · ${Y}`, W - 5 * u, 6.2 * u, { size: 24, spacing: 0.3, align: 'right', color: ink });
    g.fillStyle = ink; g.fillRect(5 * u, 8.6 * u, 90 * u, 5);
    const end = gfxRich(g, k, headWords(h, 'paper', { color: ink }, { color: red, italic: true, weight: 700 }, false), 5 * u, 11 * u, { size: 136, max: 90 * u, lh: 0.95, fam: serif, weight: 900, lines: 3 });
    // the champion's car, this year's (a new team's after a move), big and grey like a print photo
    const team = tm(P.subject); const car = team && carPhoto(c, team.id);
    const ty = Math.max(end + 3 * u, 40 * u);
    k.text(`${P.rounds.length} RACES${P.sprints ? `, ${P.sprints} SPRINTS` : ''}`, 5 * u, ty, { size: 38, weight: 800, color: red, max: 40 * u });
    const d0 = roundDate(s, P.r0); const v0 = (P.r0.venue || P.r0.name).split(/[,(]/)[0].trim();
    k.wrap(`It starts in ${v0}${d0 ? ` on ${fmtDay(d0)}` : ''} and ends in ${P.fin.name}.`, 5 * u, ty + 4.6 * u, { size: 30, weight: 600, fam: serif, color: ink, max: 36 * u, lines: 4, lh: 1.3 });
    // the stamp
    g.save(); g.translate(W - 15 * u, ty + 6 * u); g.rotate(-0.21); g.strokeStyle = red; g.lineWidth = 6; g.beginPath(); g.arc(0, 0, 9 * u, 0, Math.PI * 2); g.stroke();
    const stamp = !P.onGrid ? ['THE', 'FAVOURITE’S', 'CAR'] : P.moved ? ['THE', 'CHAMPION’S', 'NEW RIDE'] : ['THE', 'CHAMPION’S', 'CAR'];
    stamp.forEach((t, j) => k.text(t, 0, (j - 1) * 3.4 * u, { size: 30, weight: 900, color: red, align: 'center', max: 15 * u })); g.restore();
    const im = car && await loadImg(car);
    if (im) { const cw = 150 * u, ch = cw * im.height / im.width; g.save(); g.filter = 'grayscale(1) contrast(1.2)'; g.globalCompositeOperation = 'multiply'; g.drawImage(im, 52 * u - cw / 2, H - 6 * u - ch, cw, ch); g.restore(); }
    else await gfxStandAt(g, bodies[P.subject], 50 * u, H, 66 * u, { filter: 'grayscale(1) contrast(1.15)', blend: 'multiply' });
    return true;
  }

  if (P.style === 'split') {
    g.fillStyle = '#111'; g.fillRect(0, 0, W, H);
    const order = [P.five[1], P.five[3], P.five[0], P.five[2], P.five[4]].filter(Boolean); const n = order.length; const cw = W / n, sl = 0.14 * cw, ov = 2.4 * u;
    for (let j = 0; j < n; j++) {
      const d = order[j]; const x0 = j * cw - ov, x1 = (j + 1) * cw + ov; const c0 = col(d);
      g.save(); g.beginPath(); g.moveTo(x0 + sl, 0); g.lineTo(x1, 0); g.lineTo(x1 - sl, H); g.lineTo(x0, H); g.closePath(); g.clip();
      const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, c0); gr.addColorStop(1, mixHex(c0, '#000000', 0.6)); g.fillStyle = gr; g.fillRect(x0, 0, x1 - x0, H);
      await gfxStandAt(g, bodies[d], (x0 + x1) / 2, H - 13 * u, 80 * u); g.restore();
      g.strokeStyle = '#111'; g.lineWidth = 6; g.beginPath(); g.moveTo(x0 + sl, 0); g.lineTo(x0, H); g.stroke();
    }
    const hb = gfxRich(g, k, headWords(h, 'hi', {}, {}), 5 * u, 14 * u, { size: 96, max: 90 * u, lh: 0.98, lines: 3, breakHi: true, dry: true });
    g.fillStyle = 'rgba(8,8,12,0.88)'; g.fillRect(0, 7 * u, W, Math.max(26 * u, hb - 7 * u + 3 * u));
    gfxSpaced(g, k, `THE ${Y} TITLE`, 5 * u, 11.5 * u, { size: 26, spacing: 0.45, align: 'left', color: 'rgba(255,255,255,0.7)' });
    gfxRich(g, k, headWords(h, 'hi', {}, { color: goldFill(g, 0, 14 * u, W, 18 * u) }), 5 * u, 14 * u, { size: 96, max: 90 * u, lh: 0.98, lines: 3, breakHi: true });
    g.fillStyle = '#08080C'; g.fillRect(0, H - 13 * u, W, 13 * u);
    order.forEach((d, j) => { const x = (j + 0.5) * cw; const lead = P.pick[d] === 1 || (d === P.champ && P.onGrid);
      k.text(d === P.champ && P.onGrid ? '★' : String(P.pick[d] || ''), x, H - 8.6 * u, { size: 52, weight: 800, align: 'center', color: lead ? goldFill(g, 0, H - 12 * u, W, 6 * u) : 'rgba(255,255,255,0.35)' });
      k.text(gfxLast(s, d), x, H - 3.6 * u, { size: 30, weight: 800, align: 'center', max: cw - 16, color: lead ? '#E9C46A' : '#FFFFFF' }); });
    return true;
  }

  if (P.style === 'gold') {
    const bg = g.createRadialGradient(W / 2, H * 0.45, 0, W / 2, H * 0.45, W * 0.9); bg.addColorStop(0, '#1A1610'); bg.addColorStop(0.75, '#050505'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
    // the crown
    const cx = W / 2, cy = 13 * u, cw2 = 13 * u, chh = cw2 * 44 / 64; g.save(); g.translate(cx - cw2 / 2, cy); g.scale(cw2 / 64, chh / 44); g.beginPath(); g.moveTo(4, 40); g.lineTo(0, 8); g.lineTo(18, 22); g.lineTo(32, 0); g.lineTo(46, 22); g.lineTo(64, 8); g.lineTo(60, 40); g.closePath(); g.restore(); g.fillStyle = goldFill(g, 0, cy, W, chh); g.fill();
    g.save(); let ys = 430; g.font = k.font(ys, 900); while (ys > 200 && g.measureText(String(Y)).width > 0.9 * W) g.font = k.font(ys -= 10, 900); g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 4; g.strokeStyle = 'rgba(233,196,106,0.55)'; g.strokeText(String(Y), W / 2, 42 * u); g.restore();
    gfxRich(g, k, headWords(h, 'hi', { weight: 300 }, { weight: 900, color: goldFill(g, 0, 60 * u, W, 8 * u) }), W / 2, 61 * u, { size: 62, max: 88 * u, lh: 1.1, align: 'center', lines: 3, breakHi: true });
    P.five.forEach((d, j) => { const y = 79 * u + j * 7.6 * u; const t = tm(d); const nt = P.titles(d);
      k.text(String(j + 1), 14 * u, y, { size: 36, weight: 900, color: '#E9C46A' });
      k.text(dName(s, d) || d, 20 * u, y, { size: 36, weight: 600, max: 40 * u });
      k.text([t?.name, d === P.champ && P.onGrid ? 'champion' : nt ? plural(nt, 'title') : ''].filter(Boolean).join(' · '), 86 * u, y, { size: 30, weight: 400, align: 'right', color: 'rgba(255,255,255,0.6)', max: 26 * u });
      g.fillStyle = 'rgba(233,196,106,0.25)'; g.fillRect(14 * u, y + 3.6 * u, 72 * u, 2); });
    await k.logo(W / 2 - 80, H - 5.4 * u, 160, 30, '#E9C46A', 'center');
    return true;
  }

  // lights out
  const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#0B0B12'); bg.addColorStop(1, '#1A0505'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
  for (let j = 0; j < 5; j++) { const x = (18.5 + j * 15.75) * u, y = 11.5 * u, r = 5.5 * u; gfxGlow(g, x, y, r * 2.4, '#FF1E14', 0.5); const gr = g.createRadialGradient(x - r * 0.25, y - r * 0.3, r * 0.1, x, y, r); gr.addColorStop(0, '#FF6A5F'); gr.addColorStop(0.6, '#C00000'); gr.addColorStop(1, '#600000'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
  gfxRich(g, k, headWords(h, 'hi', {}, { color: '#FF2A20' }), W / 2, 22 * u, { size: 108, max: 90 * u, lh: 0.98, align: 'center', lines: 3, breakHi: true });
  const team = tm(P.subject); const car = team && carPhoto(c, team.id); const im = car && await loadImg(car);
  if (im) { const cw = 108 * u, ch = cw * im.height / im.width; g.save(); g.shadowColor = 'rgba(0,0,0,0.8)'; g.shadowBlur = 40; g.shadowOffsetY = 30; g.drawImage(im, W / 2 - cw / 2, 82 * u - ch / 2, cw, ch); g.restore(); }
  else await gfxStandAt(g, bodies[P.subject], W / 2, H - 22 * u, 66 * u, { shadow: 'rgba(0,0,0,0.7)' });
  g.fillStyle = 'rgba(255,255,255,0.2)'; g.fillRect(5 * u, H - 22 * u, 90 * u, 3);
  const v0 = (P.r0.venue || P.r0.name).split(/[,(]/)[0].trim();
  [[String(P.rounds.length), 'RACES'], [String(P.sprints), 'SPRINTS'], ['R1', v0.toUpperCase()]].forEach(([a, b], j) => { const x = (5 + 90 * (j + 0.5) / 3) * u;
    k.text(a, x, H - 13 * u, { size: 86, weight: 900, align: 'center' }); gfxSpaced(g, k, b, x, H - 6.4 * u, { size: 22, spacing: 0.3, color: 'rgba(255,255,255,0.7)' }); });
  await k.logo(W / 2 - 80, H - 3.6 * u, 160, 26, 'rgba(255,255,255,0.55)', 'center');
  return true;
}
