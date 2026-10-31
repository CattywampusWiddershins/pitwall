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
  return `<button class="gfx" data-act="gfx-open" data-gfx="${esc(key)}" title="Open to save the image">${url ? `<img src="${url}" alt="">` : '<span class="spinner"></span>'}</button>`;
}
/** Registers a spec, for a button that opens its graphic (data-act="gfx-open"). */
function gfxKey(spec) { const key = JSON.stringify(spec); _gfxSpecs.set(key, spec); return key; }
/** Ratings for every driver run taller than the portrait 1080×1350. */
const gfxHeight = (spec) => spec.type === 'ratings' && spec.rows?.length > 10 ? 300 + spec.rows.length * 84 : GFX_H;
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
  const what = { standings: spec.kind === 'team' ? 'team-standings' : 'driver-standings', results: { R: 'race', SPR: 'sprint', Q: 'qualifying', SQ: 'sprint-qualifying' }[spec.k], class: { FP1: 'practice-1', FP2: 'practice-2', FP3: 'practice-3', FP: 'practice' }[spec.k], ratings: spec.season ? 'season-ratings' : spec.span === 'last5' ? 'last-5-ratings' : 'driver-ratings', perm: 'permutations-' + String(spec.who).toLowerCase(), title: spec.mode === 'won' ? (spec.kind === 'team' ? 'constructors-champions' : 'world-champion') : 'title-showdown', award: spec.kind === 'dots' ? 'driver-of-the-season' : 'driver-of-the-day' }[spec.type];
  ui.modal = { kind: 'card', url, name: `pitwall-${s.year}-r${spec.ri + 1}-${what}.png` };
  modal(`<div class="modal-h"><h2>${esc(r?.name || '')} · ${esc(what.replace(/-/g, ' '))}</h2><button class="icon-btn" data-act="modal-close">${ICON.x}</button></div>
    <div class="modal-b"><img src="${url}" alt="" style="width:100%;max-width:540px;display:block;margin:0 auto;border-radius:6px"></div>
    <div class="modal-f"><span class="muted" style="font-size:12px;margin-right:auto">1080 × ${gfxHeight(spec)} PNG${gfxHeight(spec) === GFX_H ? ', sized for social posts' : ''}.</span><button class="btn ghost" data-act="modal-close">Close</button><button class="btn primary" data-act="card-save">Save image</button></div>`);
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
  return { font, text, img, body, disp, wrap };
}
/** The frame: dark background, the red stripes either side of the logo slot, and the title. */
async function gfxFrame(g, k, title, { sub = '' } = {}) {
  const H = g.canvas.height;
  g.fillStyle = GFX_BG; g.fillRect(0, 0, GFX_W, H);
  g.save(); g.globalAlpha = 0.06; g.strokeStyle = '#FFFFFF'; g.lineWidth = 3;
  for (let x = -400 - H * 0.4; x < GFX_W + 400; x += 70) { g.beginPath(); g.moveTo(x, H); g.lineTo(x + H * 0.37, 0); g.stroke(); }
  g.restore();
  g.fillStyle = GFX_RED; g.fillRect(0, 34, 390, 14); g.fillRect(0, 56, 390, 14); g.fillRect(GFX_W - 390, 34, 390, 14); g.fillRect(GFX_W - 390, 56, 390, 14);
  if (!(state.gfxLogo && await k.img(state.gfxLogo, 410, 18, 260, 66))) k.text('PITWALL', GFX_W / 2, 52, { size: 46, weight: 800, align: 'center' });
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
async function gfxBody(c, id) { const b = bodyOf(c, id); return b && await gfxBodyBox(b.url) ? b : null; }
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
  const cv = document.createElement('canvas'); cv.width = GFX_W; cv.height = gfxHeight(spec); const g = cv.getContext('2d'); const k = gfxKit(g);
  if (spec.type === 'award') return gfxAward(c, s, spec.kind, spec.ri);
  if (spec.type === 'title') { const ok = await gfxTitle(g, k, c, s, spec); return ok === false ? null : cv; }
  const ok = await ({ class: gfxClass, standings: gfxStandings, results: gfxResults, ratings: gfxRatings, perm: gfxPerm }[spec.type])?.(g, k, c, s, spec);
  return ok === false ? null : cv;
}

/** Team or driver standings after round ri: the top ten, gold for a champion once the title is settled. */
async function gfxStandings(g, k, c, s, { kind, ri }) {
  const r = activeRounds(s)[ri]; const st = seasonStats(s, ri + 1);
  const team = kind === 'team';
  const rows = (team ? constructorStandings(s, st) : driverStandings(s, st)).slice(0, 10);
  if (!rows.length) return false;
  const prev = ri ? (team ? constructorStandings(s, seasonStats(s, ri)) : driverStandings(s, seasonStats(s, ri))) : null;
  const dec = titleDecision(s, team ? 'team' : 'driver'); const gold = dec && dec.i <= ri;
  await gfxFrame(g, k, team ? 'TEAM STANDINGS' : 'DRIVER STANDINGS');
  const y0 = 205, rh = 99, xP = 0, wP = 135, xBar = 135, wBar = team ? 680 : 670, xPts = xBar + wBar, wPts = team ? 200 : 135;
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
      const ph = driverPhoto(c, x.id); if (ph) await k.img(ph, xBar + 150, y, 100, rh - 4, { cover: true });
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
    const ph = driverPhoto(c, x.d); if (ph) await k.img(ph, x0 + 20, y0 + 70, w - 40, h - 150, { cover: true });
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
    const ph = driverPhoto(c, x.id); if (ph) await k.img(ph, L.ph, y, L.phW, rh - 12, { cover: true });
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
  g.fillStyle = GFX_RED; g.fillRect(0, 34, 390, 14); g.fillRect(0, 56, 390, 14); g.fillRect(GFX_W - 390, 34, 390, 14); g.fillRect(GFX_W - 390, 56, 390, 14);
  if (!(state.gfxLogo && await k.img(state.gfxLogo, 410, 18, 260, 66))) k.text('PITWALL', GFX_W / 2, 52, { size: 46, weight: 800, align: 'center' });
  const name = team ? tm.name.toUpperCase() : gfxLast(s, who);
  // the driver, or a team's two drivers (the second a step behind), standing beside the table
  const pair = team ? await Promise.all((tm?.drivers || []).filter(Boolean).slice(0, 2).map(id => gfxBody(c, id))) : [];
  const fig = team ? pair.some(Boolean) : await gfxBody(c, who);
  if (fig) {
    gfxGlow(g, 200, 560, 380, col);
    if (team) { const [a, b] = pair; if (b) await gfxFigure(g, b, { cx: 270, top: 300, bottom: GFX_H, frac: 0.62 }); if (a) await gfxFigure(g, a, { cx: b ? 140 : 200, top: 250, bottom: GFX_H, frac: 0.6 }); }
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
  if (byPts) { rows = rows.filter((row, i) => i === 0 || i === rows.length - 1 || row.conds.some((o, j) => o.max !== rows[i - 1].conds[j].max)); if (rows.length > 12) rows = rows.filter((_, i) => i % Math.ceil(rows.length / 12) === 0 || i === rows.length - 1); }
  else rows = rows.slice(0, 11);
  const rh = Math.min(fig ? 96 : 70, Math.floor((GFX_H - 120 - y) / rows.length));
  rows.forEach((row, i) => {
    g.fillStyle = i % 2 ? 'rgba(31,31,39,0.88)' : 'rgba(42,42,52,0.88)'; g.fillRect(tx, y, tw, rh);
    const nop = row.nop || NO_PTS;
    const head = byPts ? `${row.pts} PTS` : row.p >= nop ? 'OUTSIDE THE POINTS' : `P${row.p}`;
    // a team's points sit at the left of the cell and the finishes that make them at the right, both inside it
    if (byPts) {
      k.text(head, tx + 16, y + rh / 2, { size: Math.min(34, rh * 0.55), weight: 800, max: cw * 0.55 - 16 });
      k.text(`(${row.combo})`, tx + cw - 14, y + rh / 2, { size: Math.min(20, rh * 0.36), weight: 600, color: '#B8C0D0', align: 'right', max: cw * 0.45 - 18, fam: k.body });
    } else k.text(head, tx + cw / 2, y + rh / 2, { size: row.p >= nop ? 24 : 36, weight: 800, align: 'center', max: cw - 20 });
    row.conds.slice(0, 3).forEach((o, j) => {
      const free = byPts ? o.max == null : !o.q;
      const txt = byPts ? (free ? 'ANYTHING' : `${o.max} PTS OR FEWER`) : free ? 'ANYWHERE' : o.q >= nop ? 'OUT OF THE POINTS' : `P${o.q} OR LOWER`;
      k.text(txt, tx + cw * (j + 1) + cw / 2, y + rh / 2, { size: free ? 26 : 28, weight: free ? 600 : 700, color: free ? '#9AE6B4' : '#FFFFFF', align: 'center', max: cw - 20, fam: free ? k.body : undefined });
    });
    y += rh;
  });
  const last = t.table[t.table.length - 1];
  const foot = byPts ? `SCORING FEWER THAN ${last.pts} POINTS, ${name} CAN'T BE CHAMPION${stage === 'sprint' ? ' IN THE SPRINT' : ' THIS WEEKEND'}`
    : last.p >= (last.nop || NO_PTS) ? `EVERY FINISH STILL GIVES ${name} A CHANCE, WITH THE RESULTS ABOVE` : `FINISH P${last.p + 1} OR LOWER AND ${name} CAN'T BE CHAMPION${stage === 'sprint' ? ' IN THE SPRINT' : ' THIS WEEKEND'}`;
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
      g.fillStyle = '#1F1F27'; g.fillRect(p.cx - rad, cy - rad, rad * 2, rad * 2); const ph = driverPhoto(c, p.f.id); if (ph) await k.img(ph, p.cx - rad, cy - rad, rad * 2, rad * 2, { cover: true }); g.restore();
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
  g.fillStyle = GFX_RED; g.fillRect(0, 34, 390, 14); g.fillRect(0, 56, 390, 14); g.fillRect(W - 390, 34, 390, 14); g.fillRect(W - 390, 56, 390, 14);
  if (!(state.gfxLogo && await k.img(state.gfxLogo, 410, 18, 260, 66))) k.text('PITWALL', W / 2, 52, { size: 46, weight: 800, align: 'center' });
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
  g.fillStyle = GFX_RED; g.fillRect(0, 34, 390, 14); g.fillRect(0, 56, 390, 14); g.fillRect(GFX_W - 390, 34, 390, 14); g.fillRect(GFX_W - 390, 56, 390, 14);
  if (!(state.gfxLogo && await k.img(state.gfxLogo, 410, 18, 260, 66))) k.text('PITWALL', GFX_W / 2, 52, { size: 46, weight: 800, align: 'center' });
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
    const p2 = driverPhoto(c, o.id); if (p2) await k.img(p2, X + 120, y, 66, 66, { cover: true });
    k.text(gfxLast(s, o.id), X + 210, y + 33, { size: 34, weight: 800, color: ink, max: CW - 350 });
    g.fillStyle = kind === 'dots' ? goldFill(g, X + CW - 130, y + 10, 110, 46) : '#22D04A'; g.beginPath(); g.roundRect(X + CW - 130, y + 10, 110, 46, 8); g.fill();
    k.text(o.v, X + CW - 75, y + 33, { size: 32, weight: 800, color: '#0B1A0B', align: 'center' });
  }
  return cv;
}
