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
  const key = JSON.stringify(spec); _gfxSpecs.set(key, spec);
  const url = _gfxDone.get(gfxSig(spec));
  return `<button class="gfx" data-act="gfx-open" data-gfx="${esc(key)}" title="Open to save the image">${url ? `<img src="${url}" alt="">` : '<span class="spinner"></span>'}</button>`;
}
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
  const what = { standings: spec.kind === 'team' ? 'team-standings' : 'driver-standings', results: { R: 'race', SPR: 'sprint', Q: 'qualifying' }[spec.k], ratings: 'driver-ratings', perm: 'permutations-' + String(spec.who).toLowerCase() }[spec.type];
  ui.modal = { kind: 'card', url, name: `pitwall-${s.year}-r${spec.ri + 1}-${what}.png` };
  modal(`<div class="modal-h"><h2>${esc(r?.name || '')} · ${esc(what.replace(/-/g, ' '))}</h2><button class="icon-btn" data-act="modal-close">${ICON.x}</button></div>
    <div class="modal-b"><img src="${url}" alt="" style="width:100%;max-width:540px;display:block;margin:0 auto;border-radius:6px"></div>
    <div class="modal-f"><span class="muted" style="font-size:12px;margin-right:auto">1080 × 1350 PNG, sized for social posts.</span><button class="btn ghost" data-act="modal-close">Close</button><button class="btn primary" data-act="card-save">Save image</button></div>`);
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
  return { font, text, img, body };
}
/** The frame: dark background, the red stripes either side of the logo slot, and the title. */
async function gfxFrame(g, k, title, { sub = '' } = {}) {
  g.fillStyle = GFX_BG; g.fillRect(0, 0, GFX_W, GFX_H);
  g.save(); g.globalAlpha = 0.06; g.strokeStyle = '#FFFFFF'; g.lineWidth = 3;
  for (let x = -400; x < GFX_W + 400; x += 70) { g.beginPath(); g.moveTo(x, GFX_H); g.lineTo(x + 500, 0); g.stroke(); }
  g.restore();
  g.fillStyle = GFX_RED; g.fillRect(0, 34, 390, 14); g.fillRect(0, 56, 390, 14); g.fillRect(GFX_W - 390, 34, 390, 14); g.fillRect(GFX_W - 390, 56, 390, 14);
  if (!(state.gfxLogo && await k.img(state.gfxLogo, 410, 18, 260, 66))) k.text('PITWALL', GFX_W / 2, 52, { size: 46, weight: 800, align: 'center' });
  k.text(title, GFX_W / 2, 150, { size: 92, weight: 800, align: 'center', max: GFX_W - 80 });
  if (sub) k.text(sub, GFX_W / 2, 214, { size: 30, weight: 600, color: '#B8C0D0', align: 'center', max: GFX_W - 80 });
}
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
function goldFill(g, x, y, w, h) { const gr = g.createLinearGradient(x, y, x, y + h); gr.addColorStop(0, '#F3D98B'); gr.addColorStop(0.5, '#D4AF37'); gr.addColorStop(1, '#B8901E'); return gr; }

async function drawGraphic(spec) {
  const c = career(); const s = c.seasons[spec.si]; if (!s) return null;
  const cv = document.createElement('canvas'); cv.width = GFX_W; cv.height = GFX_H; const g = cv.getContext('2d'); const k = gfxKit(g);
  const ok = await ({ standings: gfxStandings, results: gfxResults, ratings: gfxRatings, perm: gfxPerm }[spec.type])?.(g, k, c, s, spec);
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
    g.font = k.font(54, 800); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(Math.round(x.pts * 10) / 10), xPts + wPts / 2, y + rh / 2 - 2);
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
    k.text(quali ? (n === 0 ? 'POLE' : side(x, n + 1)) : side(x, n + 1), x0 + w - 59, y0 + h - 150, { size: quali ? 22 : 40, weight: 800, color: '#15151E', align: 'center', max: 84 });
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

/** Driver ratings for a race: the top ten. rows: [{ id, rating }] */
async function gfxRatings(g, k, c, s, { ri, rows }) {
  const r = activeRounds(s)[ri]; if (!rows?.length) return false;
  await gfxFrame(g, k, 'DRIVER RATINGS', { sub: `${r.name.toUpperCase()} GRAND PRIX` });
  const y0 = 250, rh = 104;
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const x = rows[i]; const y = y0 + i * rh; const tm = teamAt(s, x.id, ri) || teamOf(s, x.id); const col = tm?.color || '#5E6A82'; const ink = contrastInk(col);
    const gr = g.createLinearGradient(30, 0, GFX_W - 30, 0); gr.addColorStop(0, mixHex(col, '#0E3A8A', 0.5)); gr.addColorStop(0.35, col); gr.addColorStop(1, mixHex(col, '#000000', 0.25));
    g.fillStyle = gr; g.beginPath(); g.roundRect(30, y, GFX_W - 60, rh - 12, 14); g.fill();
    if (i === 0) { g.lineWidth = 3; g.strokeStyle = '#FFFFFF'; g.stroke(); }
    const tie = rows.filter(o => o.rating.toFixed(1) === x.rating.toFixed(1)).length > 1;
    const rank = rows.findIndex(o => o.rating.toFixed(1) === x.rating.toFixed(1)) + 1;
    k.text(`${rank}${tie ? '=' : ''}`, 90, y + rh / 2 - 6, { size: 48, weight: 800, color: ink, align: 'center' });
    await gfxLogo(g, k, c, tm, 150, y + 16, 120, rh - 44, ink);
    const ph = driverPhoto(c, x.id); if (ph) await k.img(ph, 300, y, 96, rh - 12, { cover: true });
    k.text(gfxLast(s, x.id), 640, y + rh / 2 - 6, { size: 42, weight: 800, color: ink, align: 'center', max: 400 });
    g.fillStyle = '#22D04A'; g.beginPath(); g.roundRect(GFX_W - 200, y + 14, 140, rh - 40, 10); g.fill();
    k.text(x.rating.toFixed(1), GFX_W - 130, y + rh / 2 - 6, { size: 50, weight: 800, color: '#0B1A0B', align: 'center' });
  }
}

/** One contender's permutations for round ri: for each finish of theirs, where each rival has to finish. */
async function gfxPerm(g, k, c, s, { kind, ri, who }) {
  const r = activeRounds(s)[ri]; const m = titleMath(s, kind, ri); const P = roundPerms(m);
  const t = P?.clinch.find(o => o.x.id === who); if (!t?.table?.length) return false;
  const team = kind === 'team'; const tm = team ? s.teams.find(x => x.id === who) : teamAt(s, who, ri) || teamOf(s, who);
  const col = tm?.color || '#5E6A82';
  g.fillStyle = GFX_BG; g.fillRect(0, 0, GFX_W, GFX_H);
  // the contender faded in behind
  const gr = g.createLinearGradient(0, 0, GFX_W, GFX_H); gr.addColorStop(0, hexA(col, 0.55)); gr.addColorStop(0.7, hexA(col, 0.05)); g.fillStyle = gr; g.fillRect(0, 0, GFX_W, GFX_H);
  g.save(); g.globalAlpha = 0.4;
  if (team) { const url = teamLogoUrl(c, who); if (url) await k.img(url, 120, 280, 840, 700); }
  else { const ph = driverPhoto(c, who); if (ph) await k.img(ph, 180, 180, 900, 1000, { cover: true }); }
  g.restore();
  const shade = g.createLinearGradient(0, 600, 0, GFX_H); shade.addColorStop(0, 'rgba(21,21,30,0)'); shade.addColorStop(1, 'rgba(21,21,30,0.95)'); g.fillStyle = shade; g.fillRect(0, 600, GFX_W, GFX_H - 600);
  // the frame on top
  g.fillStyle = GFX_RED; g.fillRect(0, 34, 390, 14); g.fillRect(0, 56, 390, 14); g.fillRect(GFX_W - 390, 34, 390, 14); g.fillRect(GFX_W - 390, 56, 390, 14);
  if (!(state.gfxLogo && await k.img(state.gfxLogo, 410, 18, 260, 66))) k.text('PITWALL', GFX_W / 2, 52, { size: 46, weight: 800, align: 'center' });
  const name = team ? tm.name.toUpperCase() : gfxLast(s, who);
  k.text(P.final ? 'TITLE PERMUTATIONS' : 'TITLE DECIDER', GFX_W / 2, 140, { size: 70, weight: 800, align: 'center' });
  k.text(`${r.name.toUpperCase()} GRAND PRIX  ·  ROUND ${ri + 1}`, GFX_W / 2, 200, { size: 28, weight: 600, color: '#D0D6E2', align: 'center' });
  k.text(name, GFX_W / 2, 290, { size: 96, weight: 900, align: 'center', max: GFX_W - 80 });
  k.text(`${t.x.pts} POINTS  ·  ${t.x.gap ? `${t.x.gap} BEHIND` : m.rows[1] && t.x.pts > m.rows[1].pts ? `${t.x.pts - m.rows[1].pts} AHEAD` : 'LEVEL ON POINTS'}`, GFX_W / 2, 360, { size: 30, weight: 600, color: '#D0D6E2', align: 'center' });
  // the table: their finish, then each rival's
  const rivals = t.table[0].conds.map(o => o.y).slice(0, 3); const cols = 1 + rivals.length;
  const tx = 50, tw = GFX_W - 100, cw = tw / cols; let y = 430; const hh = 96;
  g.fillStyle = GFX_RED; g.fillRect(tx, y, tw, hh);
  k.text(`IF ${name} FINISHES`, tx + cw / 2, y + hh / 2, { size: 26, weight: 800, align: 'center', max: cw - 20 });
  rivals.forEach((o, j) => k.text(`${team ? o.name.toUpperCase() : gfxLast(s, o.id)} MUST FINISH`, tx + cw * (j + 1) + cw / 2, y + hh / 2, { size: 24, weight: 800, align: 'center', max: cw - 20 }));
  y += hh; const rows = t.table.slice(0, 11); const rh = Math.min(70, Math.floor((GFX_H - 120 - y) / rows.length));
  rows.forEach((row, i) => {
    g.fillStyle = i % 2 ? 'rgba(31,31,39,0.88)' : 'rgba(42,42,52,0.88)'; g.fillRect(tx, y, tw, rh);
    k.text(row.p >= NO_PTS ? 'OUTSIDE THE POINTS' : `P${row.p}`, tx + cw / 2, y + rh / 2, { size: row.p >= NO_PTS ? 24 : 36, weight: 800, align: 'center', max: cw - 20 });
    row.conds.slice(0, 3).forEach((o, j) => {
      const txt = !o.q ? 'ANYWHERE' : o.q >= NO_PTS ? 'OUT OF THE POINTS' : `P${o.q} OR LOWER`;
      k.text(txt, tx + cw * (j + 1) + cw / 2, y + rh / 2, { size: !o.q ? 26 : 28, weight: !o.q ? 600 : 700, color: !o.q ? '#9AE6B4' : '#FFFFFF', align: 'center', max: cw - 20, fam: !o.q ? k.body : undefined });
    });
    y += rh;
  });
  const lowest = t.table[t.table.length - 1].p;
  k.text(lowest >= NO_PTS ? `EVERY FINISH STILL GIVES ${name} A CHANCE, WITH THE RESULTS ABOVE` : `FINISH P${lowest + 1} OR LOWER AND ${name} CAN'T BE CHAMPION THIS WEEKEND`, GFX_W / 2, GFX_H - 60, { size: 24, weight: 600, color: '#D0D6E2', align: 'center', max: GFX_W - 80, fam: k.body });
}
