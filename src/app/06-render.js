/* Pitwall — The page frame: render(), navigation, themes, capitals, pictures. Part of the renderer, split into files that load in order (see index.html). */
'use strict';
/* --------------------------------------------------------------- render */
/* ---------------------------------------------------------------- themes */
function mixHex(a, b, t) {
  const p = (h) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const A = p(a), B = p(b);
  return '#' + A.map((v, i) => hex2(Math.round(v + (B[i] - v) * t))).join('');
}
/** A theme for a team we have no preset for (your own team, or a renamed one): derived from its colours. */
function themeFromTeam(t) {
  return { name: t.name, accent: t.color, accent2: t.color2 || '#FFFFFF', base: mixHex('#090B10', t.color, 0.07) };
}
function teamTheme(c, s, teamId) {
  const t = s?.teams.find(x => x.id === teamId);
  if (teamId === MYTEAM && c?.myTeam) return themeFromTeam(c.myTeam);
  if (D.THEMES[teamId]) return { ...D.THEMES[teamId], accent: t?.color || D.THEMES[teamId].accent };
  return t ? themeFromTeam(t) : D.THEMES.classic;
}
function activeTheme() {
  const pref = state.prefs?.theme || 'auto';
  const c = career(); const s = curSeason();
  if (pref === 'auto') return s ? teamTheme(c, s, s.playerTeamId) : D.THEMES.classic;
  if (pref === MYTEAM) return c?.myTeam ? themeFromTeam(c.myTeam) : D.THEMES.classic;
  return D.THEMES[pref] || D.THEMES.classic;
}
const THEME_VARS = ['--bg', '--panel', '--panel-2', '--panel-3', '--line', '--rail'];
/** Your uploaded fonts: a display face (headings, numbers; regular and bold) and a body face. */
const FONT_SLOTS = [['display', 'Display (headings and numbers)', 400], ['displayBold', 'Display, bold', 700], ['body', 'Body text', 400]];
let sysFonts = null; // fonts installed on this PC, once listed: [{ full, family }]
/** A copy of an installed font's file, as a data URL (for devices that don't have it): null where it can't be read. */
async function localFontData(name) {
  try {
    const list = await window.queryLocalFonts(); const n = name.toLowerCase();
    const f = list.find(x => x.fullName.toLowerCase() === n) || list.find(x => x.family.toLowerCase() === n && /regular|book|normal/i.test(x.style)) || list.find(x => x.family.toLowerCase() === n);
    const blob = f && await f.blob(); if (!blob || blob.size > 3e6) return null;
    return await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => res(null); fr.readAsDataURL(blob); });
  } catch { return null; }
}
function applyFonts() {
  const F = state.fonts || {}; const key = FONT_SLOTS.map(([k]) => (F[k]?.name || F[k]?.local || '') + (F[k]?.data ? '+' : '')).join('|');
  let el = document.getElementById('user-fonts'); if (el?.dataset.key === key) return;
  if (!el) { el = document.createElement('style'); el.id = 'user-fonts'; document.head.appendChild(el); }
  el.dataset.key = key;
  // an uploaded file, or a font installed on this PC (by its full name; its family name works as a fallback). An
  // installed font also carries a copy of its file, so a phone or tablet without it installed still shows it.
  const q = (n) => n.replace(/["\\]/g, '');
  const face = (fam, k, w) => !F[k] ? '' : `@font-face { font-family: "${fam}"; src: ${[F[k].local ? `local("${q(F[k].local)}")` : '', F[k].data ? `url("${F[k].data}")` : ''].filter(Boolean).join(', ')}; font-weight: ${w}; font-display: swap; }`;
  const fallback = (k) => F[k]?.local ? `"${q(F[k].family || F[k].local)}", ` : '';
  const disp = F.display || F.displayBold; const bodyF = F.body;
  el.textContent = [face('PW Display', 'display', '100 599'), face('PW Display', 'displayBold', '600 900'), face('PW Body', 'body', '100 900'),
    `:root { ${disp ? `--font-display: "PW Display", ${fallback('display') || fallback('displayBold')}"Bahnschrift", "Barlow Condensed", sans-serif;` : ''} ${bodyF ? `--font-body: "PW Body", ${fallback('body')}"Segoe UI", system-ui, sans-serif;` : ''} }`].join('\n');
}
function fontsPanel() {
  const F = state.fonts || {};
  return `<div class="panel"><div class="panel-h"><h2>Fonts</h2><span class="muted" style="font-size:12px">Use your own, such as F1’s fonts</span></div><div class="panel-b stack">
    ${FONT_SLOTS.map(([k, l]) => `<div class="row" style="gap:8px"><span style="min-width:240px">${l}</span>${F[k] ? `<span class="muted" style="font-size:12px;font-family:${k === 'body' ? 'var(--font-body)' : 'var(--font-display)'};${k === 'displayBold' ? 'font-weight:700' : ''}">${esc(F[k].local ? `${F[k].local} (installed${F[k].data ? ', copied for your phone' : ''})` : F[k].name)}</span>${F[k].local && !F[k].data ? `<button class="btn sm" data-act="font-embed" data-k="${k}">Copy for your phone</button>` : ''}<button class="btn sm ghost" data-act="font-clear" data-k="${k}">Remove</button>` : `<label class="btn sm">Upload<input type="file" accept=".ttf,.otf,.woff,.woff2,font/*" data-ch="font-upload" data-k="${k}" hidden></label><span class="muted" style="font-size:12px">or</span><input type="text" list="sys-fonts" placeholder="An installed font…" data-ch="font-local" data-k="${k}" style="width:240px">`}</div>`).join('')}
    <datalist id="sys-fonts">${(sysFonts || []).map(x => `<option value="${esc(x.full)}">${esc(x.family)}</option>`).join('')}</datalist>
    <div class="row" style="gap:8px">${sysFonts ? `<span class="muted" style="font-size:12px">${plural(sysFonts.length, 'installed font')} listed: start typing a name to pick one</span>` : `<button class="btn sm ghost" data-act="font-list">List my installed fonts</button><span class="muted" style="font-size:12px">or type a font’s name</span>`}</div>
    <p class="muted" style="font-size:12px;margin:0">F1’s fonts belong to Formula 1, so they can’t come with Pitwall: if you have them, upload the files here (TTF, OTF or WOFF). For the F1 look, use Formula1 Display Regular for display, Formula1 Display Bold for bold, and Titillium Web (free) or Formula1 Display Regular for body text. Fonts are kept with your data, so a paired phone or tablet shows them too (an installed font is copied in when you pick it).</p></div></div>`;
}
function applyTheme() {
  applyFonts();
  const th = activeTheme();
  const st = document.documentElement.style;
  st.setProperty('--team', th.accent);
  st.setProperty('--team-ink', contrastInk(th.accent));
  st.setProperty('--team-2', th.accent2);
  if (!th.base) { THEME_VARS.forEach(v => st.removeProperty(v)); return; }
  // lift the panels from the team's dark base, with a hint of the accent so they read as one palette
  const lift = mixHex('#FFFFFF', th.accent, 0.3);
  const vals = [th.base, mixHex(th.base, lift, 0.045), mixHex(th.base, lift, 0.075), mixHex(th.base, lift, 0.11), mixHex(th.base, lift, 0.155), mixHex(th.base, '#000000', 0.35)];
  THEME_VARS.forEach((v, i) => st.setProperty(v, vals[i]));
}

/*
  F1-style capitals: drivers' surnames, countries and race names show in capitals wherever they appear. It's done on
  the page as it's drawn (text only, never form fields), so the data keeps its normal spelling.
*/
let _caps = { key: null, re: null };
function capsRe() {
  const c = career(); const S = c?.seasons || [];
  const key = `${c?.id}|${S.length}|${S.reduce((a, s) => a + Object.keys(s.drivers || {}).length + (s.calendar || []).length, 0)}|${Object.keys(c?.generated || {}).length}|${c?.customDrivers?.length}|${c?.profile?.last}`;
  if (_caps.key === key) return _caps.re;
  const words = new Set();
  const addName = (n) => { const l = lastName(n); if (l && l.length >= 3 && /^\p{Lu}/u.test(l.replace(/^(de|van|von|di|da|del|der) /, ''))) words.add(l); };
  Object.values(D.DRIVERS || {}).forEach(d => addName(d.name));
  for (const s of S) { Object.values(s.drivers || {}).forEach(d => addName(d.name)); (s.calendar || []).forEach(r => r.name && words.add(r.name)); }
  Object.values(c?.generated || {}).forEach(d => addName(d.name)); (c?.customDrivers || []).forEach(d => addName(d.name));
  if (c?.profile?.last?.length >= 3) words.add(c.profile.last);
  Object.values(D.TRACKS || {}).forEach(x => x.country && words.add(x.country));
  const list = [...words].sort((a, b) => b.length - a.length).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  _caps = { key, re: list.length ? new RegExp(`(?<![\\p{L}])(${list.join('|')})(?![\\p{L}])`, 'gu') : null };
  return _caps.re;
}
const CAPS_SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT']);
function capsNode(n, re) {
  if (n.nodeType === 3) { const p = n.parentNode; if (!p || CAPS_SKIP.has(p.nodeName) || p.closest?.('.no-caps,[contenteditable]')) return; re.lastIndex = 0; const v = n.nodeValue.replace(re, m => m.toUpperCase()); if (v !== n.nodeValue) n.nodeValue = v; return; }
  if (n.nodeType !== 1 || CAPS_SKIP.has(n.nodeName) || n.matches('.no-caps,[contenteditable]')) return;
  const w = document.createTreeWalker(n, NodeFilter.SHOW_TEXT); const all = []; while (w.nextNode()) all.push(w.currentNode); all.forEach(x => capsNode(x, re));
}
if (typeof MutationObserver !== 'undefined') new MutationObserver((muts) => {
  if (state.caps === false) return; let re; try { re = capsRe(); } catch { return; } if (!re) return;
  for (const m of muts) { if (m.type === 'characterData') capsNode(m.target, re); else m.addedNodes.forEach(x => capsNode(x, re)); }
}).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
function render() {
  renderGen++;
  // a real driver's career: the real moves the season has reached
  { const c = career(); if (realDriverOf(c) && applyRealMoves(c, latestSeason())) { renderGen++; store.save(); } }
  { const c = career(); if (c && settleRumours(c)) { renderGen++; store.save(); } }
  syncPlayer();
  applyTheme();
  const main = $('#main');
  const keepScroll = main.dataset.view === viewKey();
  const top = main.scrollTop;
  $('#rail').innerHTML = renderRail();
  $('#topbar').innerHTML = renderTopbar();
  main.innerHTML = (ui.view === 'setup' ? '' : updateNoticeHtml() + gameNoticeHtml()) + renderView();
  main.dataset.view = viewKey();
  if (typeof fillGraphics === 'function') setTimeout(fillGraphics, 0);
  main.scrollTop = keepScroll ? top : 0;
}
const viewKey = () => `${ui.view}|${ui.round}|${ui.session}|${ui.seasonIdx}|${ui.driverId}|${ui.trackId}|${ui.teamId}`;

const NAV = [
  ['dashboard', 'Dashboard', 'home'],
  ['calendar', 'Season', 'flag'],
  ['standings', 'Standings', 'trophy'],
  ['now', 'Current Weekend', 'flag'],
  ['replay', 'Race Replay', 'play'],
  ['performance', 'Performance', 'gauge'],
  ['stories', 'Stories', 'news'],
  ['transfers', 'Transfers', 'swap'],
  ['h2h', 'Head to Head', 'vs'],
  ['stats', 'Career Stats', 'stats'],
  ['drivers', 'Drivers', 'helmet'],
  ['teams', 'Teams', 'garage'],
  ['tracks', 'Circuits', 'track'],
  ['hof', 'Hall of Fame', 'laurel'],
  ['records', 'Records', 'medal'],
  ['media', 'Media', 'mic'],
  ['settings', 'Settings', 'gear'],
];
const navActive = () => ({ forecast: 'standings', weekend: 'calendar', driver: 'drivers', track: 'tracks', team: 'teams', review: 'stats' }[ui.view] || ui.view);
const setNavOpen = (on) => document.body.classList.toggle('nav-open', on);

/** Small screens: a bar with the menu button and the page name; the rail slides in as a drawer. */
function renderTopbar() {
  const c = career();
  const here = NAV.find(n => n[0] === navActive());
  const title = ui.view === 'weekend' && ui.round ? (curSeason()?.calendar.find(r => r.id === ui.round)?.name || 'Weekend') : here ? here[1] : 'Pitwall';
  return `${c ? `<button class="icon-btn menu-btn" data-act="nav-toggle" aria-label="Menu">${ICON.menu}</button>` : ''}
    <div class="brand-mark" style="color:var(--team-ink)">${ICON.logo}</div>
    <div class="topbar-title">${esc(c ? title : 'Pitwall')}</div>`;
}

function renderRail() {
  const c = career();
  const s = curSeason();
  const nav = NAV.map(([id, label, ic]) => [id, label, ICON[ic]]);
  return `
    <div class="brand"><div class="brand-mark" style="color:var(--team-ink)">${ICON.logo}</div><div class="brand-name">PITWALL</div></div>
    ${c ? `<div class="career-pill">
      ${c.myTeam ? `<div class="row" style="gap:8px;flex-wrap:nowrap">${teamBadge(c.myTeam, 28)}<span class="label">My Team · ${esc(c.myTeam.name)}</span></div>` : '<span class="label">Driver Career</span>'}
      ${isPrincipal(c) ? `<span class="who"><span class="n" style="font-size:12px">TP</span>${esc(c.profile.first)} ${esc(c.profile.last)}</span>`
        : `<span class="who">${avatar(c, s, PLAYER, 26)}<span class="n">${esc(s?.drivers?.[PLAYER]?.number ?? c.profile.number)}</span>${esc(c.profile.first)} ${esc(c.profile.last)}</span>`}
      <span class="muted" style="font-size:12px">${esc(s?.teams.find(t => t.id === s.playerTeamId)?.name || '')} · ${s?.year || ''}</span>
    </div>` : ''}
    ${c ? `<nav class="nav">${nav.map(([id, label, ic]) => `<button data-act="nav" data-view="${id}" class="${navActive() === id ? 'active' : ''}">${ic}<span>${label}</span>${id === 'now' && isLive() ? '<i class="live-dot" title="Tracking a race live"></i>' : ''}</button>`).join('')}</nav>` : ''}
    <div class="rail-foot">
      ${state.careers.length > 1 ? `<label class="field"><span>Career save</span><select data-ch="switch-career">${state.careers.map(x => `<option value="${x.id}" ${x.id === state.activeCareerId ? 'selected' : ''}>${esc(x.profile.first)} ${esc(x.profile.last)} · ${x.seasons.length} season${x.seasons.length > 1 ? 's' : ''}</option>`).join('')}</select></label>` : ''}
      <button class="btn ghost sm" data-act="new-career">+ New career</button>
    </div>`;
}

function renderView() {
  if (ui.view === 'setup' || !career()) return renderSetup();
  switch (ui.view) {
    case 'calendar': return renderCalendar();
    case 'weekend': return renderWeekend();
    case 'standings': return renderStandings();
    case 'h2h': return renderH2H();
    case 'stats': return renderStats();
    case 'drivers': return renderDrivers();
    case 'driver': return renderDriver();
    case 'teams': return renderTeams();
    case 'team': return renderTeam();
    case 'forecast': ui.view = 'standings'; ui.standingsTab = 'forecast'; return renderForecast();
    case 'now': return renderCurrentWeekend();
    case 'replay': return renderReplay();
    case 'performance': return renderPerformance();
    case 'stories': return renderStories();
    case 'transfers': return renderTransfers();
    case 'tracks': return renderTracks();
    case 'track': return renderTrack();
    case 'myteam': ui.view = 'dashboard'; return renderDashboard();
    case 'hof': return renderHof();
    case 'records': return renderRecords();
    case 'review': return renderReview();
    case 'media': return renderMedia();
    case 'settings': return renderSettings();
    default: return renderDashboard();
  }
}

function seasonPicker(c, idx, act = 'pick-season') {
  if (c.seasons.length < 2) return '';
  if (c.seasons.length > 5) return `<select class="season-sel" data-ch="season-sel" data-to="${act}" style="width:auto" title="Season">${c.seasons.slice().reverse().map(s => `<option value="${s.index}" ${s.index === idx ? 'selected' : ''}>${s.year}${s.historic === 'sim' ? ' · simulated' : s.historic ? ' · real' : ''}</option>`).join('')}</select>`;
  return `<div class="seg">${c.seasons.map((s, i) => `<button data-act="${act}" data-idx="${i}" class="${i === idx ? 'on' : ''}">${s.year}</button>`).join('')}</div>`;
}

function drvCell(s, id, opts = {}) {
  return `<div class="drv">${avatar(career(), s, id, opts.size || 24)}
    <span class="ab">${esc(dAbbr(s, id))}</span><span class="nm">${esc(opts.name || (s.drivers[id] ? dName(s, id) : id === PLAYER_ID ? dName(s, id) : anyName(id)))}</span>
    ${opts.team ? `<span class="tm">${esc(teamOf(s, id)?.name || '')}</span>` : ''}</div>`;
}

/* --------------------------------------------------------------- pictures */
// Photos and logos. Real drivers and teams share one set across every career: the ones you upload, else the ones
// that come with Pitwall (pictures.js); removing one that came with it keeps it removed (null) until you restore it.
// Your own driver, custom drivers and My Team keep theirs on the career.
const imgStore = () => (state.images ||= { drivers: {}, teams: {} });
const BUILT_IN = typeof DEFAULT_IMAGES === 'undefined' ? {} : DEFAULT_IMAGES;
/** A real driver's or team's picture: kind is drivers, teams or cars. */
function picOf(kind, id) {
  const own = state.images?.[kind];
  if (own && Object.prototype.hasOwnProperty.call(own, id)) return own[id] || null;
  return BUILT_IN[kind]?.[id] || null;
}
/** Sets or removes one: removing a built-in picture remembers that you did. */
function setPic(kind, id, url) {
  const own = (imgStore()[kind] ||= {});
  if (url) own[id] = url; else if (BUILT_IN[kind]?.[id]) own[id] = null; else delete own[id];
}
/** Back to the picture that came with Pitwall. */
const restorePic = (kind, id) => { delete imgStore()[kind]?.[id]; };
const canRestore = (kind, id) => !!BUILT_IN[kind]?.[id] && state.images?.[kind]?.[id] !== undefined && state.images[kind][id] !== BUILT_IN[kind][id];
function driverPhoto(c, id) {
  if (id === PLAYER_ID) return c?.profile.photo || null;
  const cd = c?.customDrivers?.find(x => x.id === id);
  return cd ? cd.photo || null : picOf('drivers', id);
}
function setDriverPhoto(c, id, url) {
  if (id === PLAYER_ID) { c.profile.photo = url; return; }
  const cd = c?.customDrivers?.find(x => x.id === id);
  if (cd) cd.photo = url;
  else setPic('drivers', id, url);
}
const teamLogoUrl = (c, id) => id === MYTEAM ? c?.myTeam?.logo || null : picOf('teams', id);
function initials(name) {
  const w = String(name || '?').replace(/[^\p{L}\s-]/gu, '').split(/[\s-]+/).filter(Boolean);
  return ((w[0]?.[0] || '?') + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase();
}
/** Round driver picture: the uploaded photo, or initials in the team's colours. */
function avatar(c, s, id, size = 28) {
  const col = (s && teamOf(s, id)?.color) || '#5E6A82';
  const url = driverPhoto(c, id);
  const st = `width:${size}px;height:${size}px;--c:${col}`;
  if (url) return `<img class="avatar" src="${esc(url)}" alt="" style="${st}">`;
  const name = id === PLAYER_ID && c ? `${c.profile.first} ${c.profile.last}` : s?.drivers[id]?.name || D.DRIVERS[id]?.name || c?.customDrivers?.find(x => x.id === id)?.name || D.HIST_DRIVERS[id] || id;
  return `<span class="avatar gen" style="${st};color:${contrastInk(col)};font-size:${Math.max(9, Math.round(size * 0.36))}px" aria-hidden="true">${esc(initials(name))}</span>`;
}
/** Team logo: the uploaded one, or a badge in the team's colours. */
function teamLogo(c, t, size = 22) {
  if (!t) return '';
  const bio = D.TEAM_BIO[t.id];
  const meta = t.id === MYTEAM && c?.myTeam ? { ...t, ...c.myTeam } : { ...t, short: bio?.short, color2: bio?.color2 };
  return teamBadge({ ...meta, logo: teamLogoUrl(c, t.id) }, size);
}

function readImage(file, { max = 256, square = false, type = 'image/png' } = {}) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) { reject(new Error('Pick an image file (PNG, JPG, SVG or WebP)')); return; }
    const fr = new FileReader();
    fr.onerror = () => reject(new Error('That file could not be read'));
    fr.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('That image could not be read'));
      img.onload = () => {
        const w0 = img.naturalWidth || max, h0 = img.naturalHeight || max;
        // photos: crop to a square, keeping the top of portrait shots where the face usually is
        const side = Math.min(w0, h0);
        const [sx, sy, sw, sh] = square ? [(w0 - side) / 2, 0, side, side] : [0, 0, w0, h0];
        const k = Math.min(1, max / Math.max(sw, sh));
        const cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(sw * k)); cv.height = Math.max(1, Math.round(sh * k));
        cv.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, cv.width, cv.height);
        resolve(cv.toDataURL(type, 0.9));
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}
const readLogo = (file) => readImage(file, { max: 256 });
const readPhoto = (file) => readImage(file, { max: 220, square: true, type: 'image/webp' });
const readCar = (file) => readImage(file, { max: 1000, type: 'image/webp' });
/** A team's car picture: for the profile banners and the undercut graphic. */
const carPhoto = (c, id) => !id ? null : id === MYTEAM ? c?.myTeam?.car || null : picOf('cars', id) || picOf('cars', teamRoot(id));

/** Upload / remove controls for a driver photo or team logo. kind: driver | team | setup */
function pictureControls(kind, id, has, label = kind === 'team' ? 'logo' : 'photo') {
  const pk = { driver: 'drivers', team: 'teams', car: 'cars' }[kind];
  return `<label class="btn sm file-btn">${ICON.camera} ${has ? 'Replace' : 'Upload'} ${label}<input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp,image/gif" data-ch="pic-upload" data-kind="${kind}" data-id="${esc(id)}" hidden></label>
    ${has ? `<button class="btn sm ghost danger" data-act="pic-clear" data-kind="${kind}" data-id="${esc(id)}">Remove</button>` : ''}
    ${pk && canRestore(pk, id) ? `<button class="btn sm ghost" data-act="pic-default" data-kind="${pk}" data-id="${esc(id)}" title="The ${label} that comes with Pitwall">Default ${label}</button>` : ''}`;
}
function photoModal(id) { ui.modal = { kind: 'photo', id }; drawPhotoModal(); }
function drawPhotoModal() {
  const c = career(); const s = latestSeason(); const id = ui.modal.id;
  const name = id === PLAYER_ID ? `${c.profile.first} ${c.profile.last}` : allKnownDrivers(c, s)[id]?.name || id;
  const has = !!driverPhoto(c, id);
  modal(`<div class="modal-h"><h2>Add a photo for ${esc(name)}</h2><button class="icon-btn" data-act="modal-close">${ICON.x}</button></div>
    <div class="modal-b"><div class="row" style="gap:18px;flex-wrap:nowrap">${avatar(c, s, id, 96)}
      <div class="stack" style="gap:10px"><p class="muted">Real drivers can be given photos from their profile page. Drivers you create need one from you: a square head-and-shoulders shot works best. Images are cropped to a square and kept in your save file.</p>
      <div class="row">${pictureControls('driver', id, has)}</div>
      <label class="row muted" style="gap:8px">Date of birth <input type="date" data-ch="dob" data-id="${id}" value="${esc(bornOf(c, id) || '')}" style="width:auto"></label>
      <span class="muted" style="font-size:12px">Used for ages and age records such as youngest winner.</span></div></div></div>
    <div class="modal-f"><button class="btn ${has ? 'primary' : 'ghost'}" data-act="modal-close">${has ? 'Done' : 'Skip for now'}</button></div>`);
}
