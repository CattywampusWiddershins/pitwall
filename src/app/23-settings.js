/* Pitwall — Settings, career setup and dialogs. Part of the renderer, split into files that load in order (see index.html). */
'use strict';
/* ---------------------------------------------------------------- updates */
// A new version: asked of the GitHub releases when Pitwall starts (and from Settings). Installed Pitwall downloads it
// in the background straight away, then offers a restart; left for later, it installs itself when Pitwall closes. A
// copy that wasn't installed (the old portable one) offers the download instead. The desktop app only.
let updateInfo = null; // { current, configured, latest, newer, notes, page, download, size, canInstall, error, checking, pct, ready, later }
async function checkUpdates(manual = false) {
  if (!window.api?.updates) return;
  updateInfo = { ...(updateInfo || {}), checking: true }; if (manual) render();
  try { updateInfo = { ...(await window.api.updates.check()), ready: updateInfo.ready, later: updateInfo.later }; } catch { updateInfo = { error: 'The check didn’t work' }; }
  if (manual && updateInfo.configured && !updateInfo.newer && !updateInfo.error) toast(`Pitwall ${updateInfo.current} is the latest version`);
  if (updateInfo.newer && updateInfo.canInstall && !updateInfo.ready) downloadUpdate();
  else redrawUpdate(manual);
}
/** Draws the page again for the update, unless you're in the middle of something (typing, a dialog). */
function redrawUpdate(force = false) {
  const a = document.activeElement; if (force || (!$('#modal-root').innerHTML && !(a && a.matches('input, textarea, select')))) render();
}
async function downloadUpdate() {
  const U = updateInfo; if (!U || U.pct != null) return;
  U.pct = 0; if (ui.view === 'settings') redrawUpdate();
  window.api.updates.onProgress?.((p) => { if (updateInfo && !updateInfo.ready) { updateInfo.pct = p.total ? Math.round(p.got / p.total * 100) : 0; const el = document.getElementById('upd-state'); if (el) el.textContent = updState(updateInfo); } });
  const r = await window.api.updates.download().catch(() => ({ ok: false }));
  if (!updateInfo) return;
  if (r?.ok) { updateInfo.ready = true; updateInfo.pct = null; }
  else { updateInfo.pct = null; updateInfo.dlError = r?.error || 'The download failed'; }
  redrawUpdate();
}
const mbOf = (b) => b ? ` (${(b / 1048576).toFixed(0)} MB)` : '';
function updState(U) {
  if (U.checking) return 'Checking…';
  if (!U.current) return '';
  if (U.configured === false) return 'Update checks aren’t set up in this build.';
  if (U.error) return `Couldn’t check: ${U.error}.`;
  if (U.latest == null) return 'No releases published yet.';
  if (!U.newer) return 'You have the latest version.';
  if (U.ready) return `Pitwall ${U.latest} is ready to install.`;
  if (U.pct != null) return `Downloading Pitwall ${U.latest}: ${U.pct}%`;
  if (U.dlError) return `Pitwall ${U.latest} is out, but the download didn’t work (${U.dlError}).`;
  return `Pitwall ${U.latest} is out.`;
}
function updateNoticeHtml() {
  const U = updateInfo; if (!U?.newer) return '';
  const notes = U.notes ? '<button class="btn sm ghost" data-act="update-notes">What’s new</button>' : '';
  if (U.ready && !U.later) return `<div class="callout update-notice"><span><b>Pitwall ${esc(U.latest)} is ready</b> <span class="muted">· restart to update, or it installs when you close Pitwall</span></span>
    <span class="row" style="gap:6px">${notes}<button class="btn sm primary" data-act="update-restart">Restart now</button><button class="btn sm ghost" data-act="update-later">Later</button></span></div>`;
  if (!U.canInstall && state.updateSkip !== U.latest) return `<div class="callout update-notice"><span><b>Pitwall ${esc(U.latest)} is out</b> <span class="muted">· you have ${esc(U.current)}</span></span>
    <span class="row" style="gap:6px">${notes}<button class="btn sm primary" data-act="update-get">Download${mbOf(U.size)}</button><button class="btn sm ghost" data-act="update-skip">Not now</button></span></div>`;
  return '';
}
/** Hardware acceleration: on by default; off only for a graphics driver that draws glitches (it makes drawing slower). */
let displayInfo = null;
function displayPanel() {
  if (!window.api?.display) return '';
  if (!displayInfo) { window.api.display.get().then(d => { displayInfo = d; if (ui.view === 'settings') render(); }).catch(() => {}); return ''; }
  const D2 = displayInfo; const pending = D2.gpu !== D2.running;
  const canvas = D2.canvas ? (/enabled/.test(D2.canvas) ? 'Charts and the globe are drawn on the graphics card.' : 'Charts and the globe are drawn by the processor (slower).') : '';
  return `<div class="panel"><div class="panel-h"><h2>Display</h2><span class="muted" style="font-size:12px">${esc(canvas)}</span></div><div class="panel-b stack" style="gap:8px">
    <label class="row" style="gap:10px"><input type="checkbox" data-ch="display-gpu" ${D2.gpu ? 'checked' : ''}><span><b>Hardware acceleration</b> <span class="muted">(recommended)</span></span></label>
    <p class="muted" style="font-size:12px;margin:0">On, Pitwall draws with the graphics card: the charts, the race replay and the globe run smoothest this way, and it's how Pitwall has always run. Turn it off only if the window shows glitches, flickering or black areas (a graphics driver problem): everything is then drawn by the processor, which is slower.</p>
    ${pending ? `<div class="row" style="gap:8px"><span class="tag next">Restart to apply</span><button class="btn sm primary" data-act="display-restart">Restart now</button></div>` : ''}</div></div>`;
}
function updatesPanel() {
  if (!window.api?.updates) return '';
  const U = updateInfo || {};
  const btns = !U.newer ? '' : U.ready ? '<button class="btn sm primary" data-act="update-restart">Restart now</button>' : !U.canInstall ? `<button class="btn sm primary" data-act="update-get">Download${mbOf(U.size)}</button>` : U.dlError && U.pct == null ? '<button class="btn sm" data-act="update-retry">Try again</button>' : '';
  return `<div class="panel"><div class="panel-h"><h2>Updates</h2><span class="muted" style="font-size:12px">Version ${esc(U.current || '')}</span></div><div class="panel-b stack" style="gap:8px">
    <div class="row" style="gap:8px;flex-wrap:wrap"><span id="upd-state">${esc(updState(U))}</span>${btns}${U.newer && U.notes ? '<button class="btn sm ghost" data-act="update-notes">What’s new</button>' : ''}<button class="btn sm ghost" data-act="update-check" ${U.checking ? 'disabled' : ''}>Check now</button></div>
    <p class="muted" style="font-size:12px;margin:0">Pitwall looks for a new version when it starts and downloads it in the background. Restart when it’s ready, or it installs itself when you close Pitwall. Your careers and settings stay where they are.</p></div></div>`;
}
function updateNotesModal() {
  const U = updateInfo; if (!U) return;
  const btn = U.ready ? '<button class="btn primary" data-act="update-restart">Restart now</button>' : !U.canInstall ? `<button class="btn primary" data-act="update-get">Download${mbOf(U.size)}</button>` : '';
  modal(`<div class="modal-h"><h2>What’s new in Pitwall ${esc(U.latest)}</h2><button class="icon-btn" data-act="modal-close">${ICON.x}</button></div>
    <div class="modal-b"><div style="white-space:pre-wrap;font-size:14px;line-height:1.5">${esc(U.notes || '')}</div>
    <div class="row" style="gap:8px;margin-top:14px">${btn}${U.page ? '<button class="btn ghost" data-act="update-page">Release page</button>' : ''}</div></div>`);
}

/* --------------------------------------------------------------- settings */
function renderSettings() {
  const c = career(); const s = latestSeason();
  const allIds = Object.keys(allKnownDrivers(c, s)).filter(id => id !== PLAYER_ID);
  const known = allKnownDrivers(c, s);
  return `<div class="page">
    <div class="page-head"><div><h1>Settings</h1><div class="sub">Appearance, career profile, ${s.year} roster and calendar, AI media and your data.</div></div></div>
    ${updatesPanel()}
    ${displayPanel()}
    ${renderLookPicker()}
    ${renderThemePicker(c, s)}
    ${fontsPanel()}
    <div class="panel"><div class="panel-h"><h2>Story graphics</h2><span class="muted" style="font-size:12px">Standings, results, ratings and permutations as images</span></div><div class="panel-b stack" style="gap:10px">
      <div class="row" style="gap:12px;flex-wrap:wrap">${state.gfxLogo ? `<img src="${esc(state.gfxLogo)}" alt="" style="height:40px;max-width:180px;object-fit:contain;background:#15151E;padding:6px 10px;border-radius:6px">` : '<span class="muted" style="font-size:13px">No logo: the graphics show Pitwall’s name at the top.</span>'}
        <label class="btn sm file-btn">${ICON.camera} ${state.gfxLogo ? 'Replace' : 'Upload'} logo<input type="file" accept="image/png,image/svg+xml,image/webp" data-ch="gfx-logo" hidden></label>${state.gfxLogo ? '<button class="btn sm ghost danger" data-act="gfx-logo-clear">Remove</button>' : ''}</div>
      <p class="muted" style="font-size:12px;margin:0">The logo at the top of every story graphic, such as F1’s (it belongs to Formula 1, so it can’t come with Pitwall). A white logo on a transparent background (PNG or SVG) looks best.</p>
      <h3 style="margin-top:6px">Trophies</h3>
      <div class="trophy-row">${[['driver', 'Drivers’ championship'], ['team', 'Constructors’ championship']].map(([k, l]) => `<div class="trophy-slot">${trophyOf(k) ? `<img src="${esc(trophyOf(k))}" alt="">` : '<span class="muted">No trophy</span>'}<b>${l}</b>
        <div class="row" style="gap:6px"><label class="btn sm file-btn">${ICON.camera} ${trophyOf(k) ? 'Replace' : 'Upload'}<input type="file" accept="image/png,image/webp" data-ch="trophy-upload" data-kind="${k}" hidden></label>${trophyOf(k) ? `<button class="btn sm ghost danger" data-act="trophy-clear" data-kind="${k}">Remove</button>` : ''}</div></div>`).join('')}</div>
      <p class="muted" style="font-size:12px;margin:0">Shown on the title showdown, title weekend and champion graphics. Use a cut-out on a transparent background.</p>
      <h3 style="margin-top:6px">Default driver</h3>
      <div class="trophy-row"><div class="trophy-slot">${state.images?.defaultBody?.url ? `<img src="${esc(state.images.defaultBody.url)}" alt="">` : '<span class="muted">None</span>'}<b>Any driver</b><div class="row" style="gap:6px">${fallbackControls('default')}</div></div></div>
      <p class="muted" style="font-size:12px;margin:0">A full-body cut-out used for a driver with no picture whose team has no default driver either (each team's is on its page). Full-body pictures also give drivers without a photo their headshot.</p>
      <details class="body-list"><summary><h3 style="display:inline">Full-body driver pictures</h3> <span class="muted" style="font-size:12px">· ${s.teams.flatMap(t => t.drivers.filter(Boolean)).filter(id => bodyOf(c, id)).length} of ${s.teams.flatMap(t => t.drivers.filter(Boolean)).length} added</span></summary>
        <p class="muted" style="font-size:12px">For the title showdown, permutation, ratings and Driver of the Day graphics. Use a cut-out on a transparent background, head to toe, and say which way the driver faces in it: the graphics mirror them to face where they need.</p>
        <div class="body-grid">${s.teams.flatMap(t => t.drivers.filter(Boolean).map(id => `<div class="body-item">${avatar(c, s, id, 32)}<div style="min-width:0;display:grid;gap:4px"><b>${esc(dName(s, id))}</b><span class="muted" style="font-size:12px">${esc(t.name)}</span>${bodyControls(c, id)}</div></div>`)).join('')}</div>
      </details></div></div>
    ${soundsPanel()}

    <div class="panel"><div class="panel-h"><h2>AI media engine</h2><span class="muted" style="font-size:12px">${settings.hasKey ? 'API key saved' : 'No API key: media sessions use built-in question templates'}</span></div>
      <div class="panel-b stack">
        <p class="muted" style="max-width:72ch">Media sessions can use Claude to write questions and articles. Paste an Anthropic API key from console.anthropic.com. The key is stored encrypted on this computer and is only sent to api.anthropic.com.</p>
        <div class="form-grid">
          <label class="field"><span>API key</span><input type="password" id="set-key" placeholder="${settings.hasKey ? '•••••••• (saved)' : 'sk-ant-…'}"></label>
          <label class="field"><span>Model</span><input type="text" id="set-model" value="${esc(settings.model)}"></label>
        </div>
        <div class="row"><button class="btn primary" data-act="save-ai">Save</button><button class="btn" data-act="test-ai">Test connection</button>${settings.hasKey ? '<button class="btn ghost danger" data-act="clear-key">Remove key</button>' : ''}</div>
      </div></div>

    ${isPrincipal(c) ? `<div class="panel"><div class="panel-h"><h2>Team principal profile</h2><span class="muted" style="font-size:12px">You run the team: the press talks to you as its principal</span></div><div class="panel-b stack">
      <div class="form-grid">
        <label class="field"><span>First name</span><input type="text" id="pf-first" value="${esc(c.profile.first)}"></label>
        <label class="field"><span>Last name</span><input type="text" id="pf-last" value="${esc(c.profile.last)}"></label>
        <label class="field"><span>Nationality</span><input type="text" id="pf-nat" value="${esc(c.profile.nationality)}"></label>
        <label class="field"><span>Date of birth</span><input type="date" id="pf-born" value="${esc(c.profile.born || '')}"></label>
      </div>
      <label class="field"><span>Backstory (used by the media)</span><textarea id="pf-bio">${esc(c.profile.bio || '')}</textarea></label>
      <p class="muted" style="font-size:12px;margin:0">Rivals aren't picked: they come from the rivalry system as title fights and archrivalries develop.</p>
      <div><button class="btn primary" data-act="save-profile">Save profile</button></div>
    </div></div>` : `<div class="panel"><div class="panel-h"><h2>Driver profile</h2></div><div class="panel-b stack">
      <div class="form-grid">
        <label class="field"><span>First name</span><input type="text" id="pf-first" value="${esc(c.profile.first)}"></label>
        <label class="field"><span>Last name</span><input type="text" id="pf-last" value="${esc(c.profile.last)}"></label>
        <label class="field"><span>Abbreviation</span><input type="text" id="pf-abbr" maxlength="3" value="${esc(c.profile.abbr)}"></label>
        <label class="field"><span>Number</span><input type="number" id="pf-number" min="1" max="99" value="${esc(c.profile.number)}"></label>
        <label class="field"><span>Nationality</span><input type="text" id="pf-nat" value="${esc(c.profile.nationality)}"></label>
        <label class="field"><span>Date of birth</span><input type="date" id="pf-born" value="${esc(c.profile.born || '')}"></label>
      </div>
      <label class="field"><span>Backstory (used by the media)</span><textarea id="pf-bio">${esc(c.profile.bio || '')}</textarea></label>
      <p class="muted" style="font-size:12px;margin:0">Rivals aren't picked: they come from the rivalry system as title fights and archrivalries develop.</p>
      <div class="row" style="gap:12px">${avatar(c, s, PLAYER, 48)}${pictureControls('driver', PLAYER, !!c.profile.photo)}</div>
      <div><button class="btn primary" data-act="save-profile">Save profile</button></div>
    </div></div>`}

    <div class="panel"><div class="panel-h"><h2>${s.year} roster</h2><span class="muted" style="font-size:12px">Mirror driver market moves from your save. Changes apply to the ${s.year} season.</span></div>
      <div class="panel-b stack">
        <div class="table-wrap"><table><thead><tr><th>Team</th><th>Seat 1</th><th>Seat 2</th></tr></thead><tbody>
          ${s.teams.map(t => `<tr class="${t.id === s.playerTeamId ? 'me' : ''}"><td><div class="drv"><span class="chip" style="--c:${t.color}"></span><b>${esc(t.name)}</b></div></td>
          ${[0, 1].map(i => t.drivers[i] === PLAYER_ID ? `<td><b>${esc(c.profile.first)} ${esc(c.profile.last)}</b> <span class="muted">(you)</span></td>` : `<td><select data-ch="roster" data-team="${t.id}" data-seat="${i}">${allIds.map(id => `<option value="${id}" ${t.drivers[i] === id ? 'selected' : ''}>${esc(known[id].name)}</option>`).join('')}</select></td>`).join('')}</tr>`).join('')}
        </tbody></table></div>
        <div class="row"><span class="label">Add a driver</span><input type="text" id="nd-name" placeholder="Full name" style="width:200px"><input type="text" id="nd-abbr" placeholder="ABC" maxlength="3" style="width:70px"><input type="number" id="nd-num" placeholder="No." style="width:80px"><label class="row muted" style="gap:6px">Born <input type="date" id="nd-born" style="width:auto"></label><button class="btn sm" data-act="add-driver">Add to pool</button></div>
        ${c.customDrivers?.length ? `<div class="row" style="gap:8px"><span class="label">Your drivers</span>${c.customDrivers.map(d => `<button class="btn sm ghost" data-act="driver-photo" data-id="${d.id}" title="${d.photo ? 'Change' : 'Add'} photo">${avatar(c, s, d.id, 22)} ${esc(d.name)}${d.photo ? '' : ' · add photo'}</button>`).join('')}</div>` : ''}
      </div></div>

    <div class="panel"><div class="panel-h"><h2>${s.year} calendar & format</h2>
      <label class="row muted">Practice sessions <select data-ch="practice" style="width:auto">${[['full', 'Full (FP1, FP2, FP3)'], ['short', 'Short (one session)'], ['none', 'None']].map(([v, l]) => `<option value="${v}" ${s.format.practice === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
      <div class="panel-b tight table-wrap"><table><thead><tr><th>Rnd</th><th>Grand Prix</th><th>Venue</th><th>Sprint</th><th>Included</th><th></th></tr></thead><tbody>
        ${s.calendar.map((r, i) => `<tr style="${r.off ? 'opacity:.45' : ''}"><td class="num muted">${i + 1}</td><td>${esc(r.name)}</td><td class="muted">${esc(r.venue)}</td>
        <td><input type="checkbox" data-ch="cal-sprint" data-i="${i}" ${r.sprint ? 'checked' : ''}></td><td><input type="checkbox" data-ch="cal-on" data-i="${i}" ${r.off ? '' : 'checked'}></td>
        <td><div class="row" style="gap:2px"><button class="icon-btn" data-act="cal-move" data-i="${i}" data-dir="-1" title="Move earlier">${ICON.up}</button><button class="icon-btn" data-act="cal-move" data-i="${i}" data-dir="1" title="Move later">${ICON.down}</button>${r.added && !s.weekends[r.id] ? `<button class="icon-btn" data-act="cal-del" data-i="${i}" title="Remove">${ICON.x}</button>` : ''}</div></td></tr>`).join('')}
      </tbody></table></div>
      <div class="panel-b"><select data-ch="cal-add" style="width:auto"><option value="">+ Add a circuit…</option>${Object.keys(D.TRACKS).filter(id => !s.calendar.some(r => trackOf(r) === id)).map(id => `<option value="${id}">${esc(trackGp(id).name)} · ${esc(D.TRACKS[id].circuit)}${D.TRACKS[id].former ? ' (former)' : ''}</option>`).join('')}</select></div></div>

    ${renderTelemetryPanel()}
    ${renderCompanionPanel()}

    <div class="panel"><div class="panel-h"><h2>Data</h2></div><div class="panel-b stack">
      <p class="muted" id="data-loc">${window.api?.companion === true ? 'Synced live with Pitwall on your computer, where everything is saved (with a daily backup kept for 14 days).' : window.api ? 'Saved automatically on this computer. A daily backup is kept for 14 days.' : 'Running in a browser: data is kept in this browser only.'}</p>
      ${backupsPanel()}
      <div class="row"><button class="btn" data-act="export">Export backup</button><button class="btn" data-act="import">Import backup</button><button class="btn ghost danger" data-act="delete-career">Delete this career</button></div>
    </div></div>
  </div>`;
}
let backupList = null; // the backups on disk, once listed
/** The backups kept on this PC: a daily one (14 days), one after every race logged and before big changes (the last 20). */
function backupsPanel() {
  const B = window.api?.backups; if (!B) return '';
  if (backupList == null) { B.list().then(l => { backupList = l || []; render(); }).catch(() => { backupList = []; }); return '<p class="muted">Looking for backups…</p>'; }
  const KIND = { daily: 'Daily', race: 'After a race', manual: 'Made by you', import: 'Before an import', season: 'Before a new season', restore: 'Before a restore' };
  const mb = (b) => b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`;
  return `<details class="backups"><summary class="row" style="cursor:pointer;gap:8px"><b>Backups</b><span class="muted" style="font-size:12px">${plural(backupList.length, 'backup')} on this PC${backupList[0] ? `, the latest ${esc(ago(backupList[0].at))}` : ''}</span></summary>
    <p class="muted" style="font-size:12px">A daily backup (kept 14 days), one after every race logged from F1 25 and one before an import, a new season or a restore (the last 20 of those). Restoring backs up what you have now first.</p>
    <div class="row" style="gap:8px"><button class="btn sm" data-act="backup-now">Back up now</button><button class="btn sm ghost" data-act="backup-folder">Open the folder</button></div>
    <div class="table-wrap" style="margin-top:8px"><table><tbody>${backupList.slice(0, 25).map(x => `<tr><td>${esc(new Date(x.at).toLocaleString())}</td><td class="muted">${esc(KIND[x.kind] || x.kind)}</td><td class="muted">${mb(x.bytes)}</td><td style="text-align:right"><button class="btn sm ghost" data-act="backup-restore" data-f="${esc(x.file)}">Restore</button></td></tr>`).join('')}</tbody></table></div></details>`;
}
/** A backup of the data as it's saved now (desktop only); quietly does nothing elsewhere. */
async function backupNow(kind) { try { await store.flush?.(); const ok = await window.api?.backups?.now(kind); if (ok) backupList = null; return ok; } catch { return false; } }
const ago = (iso) => {
  if (!iso) return 'never';
  const m = Math.round((Date.now() - new Date(iso)) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : fmtDay(parseDay(iso.slice(0, 10)));
};
/** Desktop: switch the phone/tablet link on, show the address and PIN, manage paired devices. On a device: its link. */
function renderCompanionPanel() {
  if (window.api?.companion === true) {
    const on = window.api.isOnline();
    return `<div class="panel"><div class="panel-h"><h2>${ICON.phone} Phone & tablet</h2><span class="muted" style="font-size:12px">${on ? '<span class="tag done">Connected</span>' : '<span class="tag">Offline</span>'}</span></div><div class="panel-b stack">
      <p class="muted" style="max-width:72ch">${window.api.inApp
        ? `A full copy of your career is kept on this device, so it works with the computer off. Changes sync both ways whenever Pitwall is open on the computer with Phone & tablet on${store.dirty() ? ' · <b style="color:var(--fg)">changes waiting to sync</b>' : ''}.`
        : 'Everything you log here is saved straight to Pitwall on your computer, and changes made there show up here within a second. Keep Pitwall open on the computer while you use this device.'}</p>
      ${window.api.inApp ? `<p class="muted" style="font-size:12px">App version ${esc(window.PitwallAndroid?.version?.() || '')} · interface ${esc(window.api.build)}</p>` : ''}
      <div class="row">${window.api.inApp ? '<button class="btn" data-act="companion-switch">Change computer</button>' : ''}<button class="btn ghost danger" data-act="companion-unpair">Disconnect this device</button></div>
    </div></div>`;
  }
  const C = companion; if (!C) return '';
  const head = `<div class="panel-h"><h2>${ICON.phone} Phone & tablet</h2><span class="muted" style="font-size:12px">${C.running ? `On · ${C.devices.filter(d => d.online).length} connected` : 'Off'}</span></div>`;
  if (!C.running) {
    return `<div class="panel">${head}<div class="panel-b stack">
      <p class="muted" style="max-width:72ch">Log sessions from your Android phone or tablet while you play: it connects to this computer over your home Wi-Fi and has every feature of the desktop app. Nothing goes over the internet.</p>
      ${C.error ? `<div class="callout">${esc(C.error)}</div>` : ''}
      <div><button class="btn primary" data-act="companion-enable" data-on="1">Turn on</button></div>
      <p class="muted" style="font-size:12px">The first time, Windows asks whether Pitwall may use the network. Allow it on <b>private networks</b>.</p>
    </div></div>`;
  }
  const host = (C.urls[0] || '').replace('http://', '');
  return `<div class="panel">${head}<div class="panel-b stack">
    <div class="link-grid">
      <div class="link-step"><span class="label">1 · Get the app</span>
        <p>On your phone or tablet, open Chrome and go to</p>
        <div class="big-code mono">${esc(host)}/app</div>
        <p class="muted" style="font-size:12px">Download and install <b>Pitwall</b>. Android asks you to allow installs from Chrome the first time.</p></div>
      <div class="link-step"><span class="label">2 · Connect</span>
        <p>Open the app and enter this computer’s address</p>
        <div class="big-code mono">${esc(host)}</div>
        ${C.urls.length > 1 ? `<p class="muted" style="font-size:12px">If that doesn’t connect, try: ${C.urls.slice(1).map(u => esc(u.replace('http://', ''))).join(', ')}</p>` : ''}</div>
      <div class="link-step"><span class="label">3 · Enter the PIN</span>
        <p>Each PIN pairs one device</p>
        <div class="big-code pin">${esc(C.pin.slice(0, 3))} ${esc(C.pin.slice(3))}</div>
        <div><button class="btn sm ghost" data-act="companion-pin">New PIN</button></div></div>
    </div>
    ${C.devices.length ? `<div class="table-wrap"><table><thead><tr><th>Paired device</th><th>Status</th><th>Last seen</th><th></th></tr></thead><tbody>
      ${C.devices.map(d => `<tr><td><b>${esc(d.name)}</b> <span class="muted">· paired ${esc(ago(d.added))}</span></td><td>${d.online ? '<span class="tag done">Connected</span>' : '<span class="tag">Offline</span>'}</td><td class="muted">${d.online ? 'now' : esc(ago(d.lastSeen))}</td>
        <td class="num"><button class="btn sm ghost danger" data-act="companion-forget" data-id="${d.id}">Disconnect</button></td></tr>`).join('')}
    </tbody></table></div>` : '<p class="muted">No devices paired yet.</p>'}
    <p class="muted" style="font-size:12px">The app keeps its own copy, so it works with this computer off and syncs when they reconnect. After you update Pitwall here, the app shows a link to install its update.</p>
    <div class="row"><button class="btn" data-act="companion-enable" data-on="0">Turn off</button>${C.devices.length > 1 ? '<button class="btn ghost danger" data-act="companion-forget">Disconnect all</button>' : ''}</div>
  </div></div>`;
}
/** The look of the app (a style), above the team colours it uses. */
function renderLookPicker() {
  const cur = uiStyle();
  return `<div class="panel"><div class="panel-h"><h2>Look</h2><span class="muted" style="font-size:12px">The app's style; the theme below sets its colours</span></div><div class="panel-b">
    <div class="choices look-choices">${UI_STYLES.map(([id, name, note]) => `<button class="choice ${cur === id ? 'on' : ''}" data-act="ui-style" data-v="${id}"><span class="look-mini look-${id}" aria-hidden="true"><i></i><i></i><i></i></span><b>${name}</b><small>${note}</small></button>`).join('')}</div>
  </div></div>`;
}
function renderThemePicker(c, s) {
  const pref = state.prefs?.theme || 'auto';
  const mine = teamTheme(c, s, s.playerTeamId);
  const sw = (th) => `<span class="swatch" style="--a:${th.accent};--b:${th.accent2};--g:${th.base || '#0B0F17'}"><i></i><i></i></span>`;
  const opts = [['auto', { ...mine, name: 'Match my team' }, `Follows whoever you drive for: ${s.teams.find(t => t.id === s.playerTeamId)?.name || ''}`], ['classic', D.THEMES.classic, 'Original Pitwall red']];
  if (c.myTeam) opts.push([MYTEAM, themeFromTeam(c.myTeam), 'Your team’s colours']);
  for (const [id, th] of Object.entries(D.THEMES)) if (id !== 'classic') opts.push([id, th, '']);
  return `<div class="panel"><div class="panel-h"><h2>Theme</h2><span class="muted" style="font-size:12px">Applies to the whole app, on every career</span></div><div class="panel-b">
    <div class="choices theme-choices">${opts.map(([id, th, note]) => `<button class="choice ${pref === id ? 'on' : ''}" data-act="set-theme" data-v="${id}">${sw(th)}<b>${esc(th.name)}</b>${note ? `<small>${esc(note)}</small>` : ''}</button>`).join('')}</div>
  </div></div>`;
}
function allKnownDrivers(c, s) {
  const map = { ...D.DRIVERS };
  for (const cd of c.customDrivers || []) map[cd.id] = cd;
  for (const se of c.seasons) Object.assign(map, se.drivers);
  Object.assign(map, s.drivers);
  return map;
}

/* ------------------------------------------------------------------ setup */
/** The first season a new career offers: this year on the device, never before the history starts. */
const setupStartYear = () => Math.max(HIST_FROM, new Date().getFullYear());
function defaultSetup() {
  const u = {
    year: setupStartYear(), first: '', last: '', abbr: '', number: 27, nationality: '', bio: '',
    teamId: 'williams', seat: 'SAI', extra: '', practice: 'full', rival: '',
    goals: [{ id: uid(), scope: 'team', type: 'constructor_pos', target: 6 }, { id: uid(), scope: 'driver', type: 'beat_teammate' }, { id: uid(), scope: 'driver', type: 'champ_pos', target: 10 }],
    type: 'driver', role: 'principal', newDrivers: [], nd: {},
    team: { name: '', short: '', color: '#00A19B', color2: '#F2F2F2', logo: null, base: '', engine: 'Mercedes', mate: 'BOT', seats: ['PER', 'BOT'] },
  };
  if (u.year > 2026) Object.assign(u, { futureGrid: D.GRID_2026.map(t => ({ ...t, drivers: [...t.drivers] })), futureCal: D.CAL_2026.map(([id, name, venue, sprint]) => ({ id, name, venue, sprint })) });
  return u;
}
/** Inline form for a brand-new driver (used when signing drivers at setup and in transfers). */
function newDriverForm(scope, key, nd) {
  const f = (k, label, type = 'text', extra = '') => `<label class="field"><span>${label}</span><input type="${type}" data-ch="nd-field" data-scope="${scope}" data-key="${key}" data-k="${k}" value="${esc(nd[k] || '')}" ${extra}></label>`;
  return `<div class="nd-form">
    <span class="label">New driver</span>
    <div class="form-grid">${f('name', 'Full name', 'text', 'placeholder="Full name"')}${f('abbr', 'Abbreviation', 'text', 'maxlength="3" placeholder="ABC"')}${f('number', 'Number', 'number', 'min="1" max="99"')}${f('born', 'Date of birth', 'date')}</div>
    <div class="row" style="gap:12px">${nd.photo ? `<img class="avatar" src="${esc(nd.photo)}" alt="" style="width:48px;height:48px">` : ''}${pictureControls('newdriver', `${scope}:${key}`, !!nd.photo)}
      <button class="btn sm primary" data-act="nd-add" data-scope="${scope}" data-key="${key}">Add driver</button><button class="btn sm ghost" data-act="nd-cancel" data-scope="${scope}" data-key="${key}">Cancel</button></div>
  </div>`;
}
const ndDrafts = (scope) => scope === 'setup' ? (ui.setup.nd ||= {}) : (ui.modal.nd ||= {});
/** Any driver's name, wherever Pitwall knows them from. */
const anyName = (id) => id === PLAYER_ID ? 'You' : D.DRIVERS[id]?.name || H.bios[id]?.name || FEEDER[id]?.name || career()?.generated?.[id]?.name || career()?.customDrivers?.find(d => d.id === id)?.name || ui.setup?.newDrivers?.find(d => d.id === id)?.name || id;
/** The grid a new career's first season starts from. */
function setupGrid(u) {
  if (u.year > 2026) return u.futureGrid;
  return templateFor(u.year, u.year === 2025 ? { startYear: 2025, type: u.type, extraTeam2025: u.extra || null } : null).grid.map(t => ({ ...t, drivers: [...t.drivers] }));
}
/** Change a new career's first season: the seat picked must exist on that grid. */
function setupYear(y) {
  const u = ui.setup; u.year = y;
  const grid = setupGrid(Object.assign(u, y > 2026 ? { futureGrid: u.futureGrid || D.GRID_2026.map(t => ({ ...t, drivers: [...t.drivers] })), futureCal: u.futureCal || D.CAL_2026.map(([id, name, venue, sprint]) => ({ id, name, venue, sprint })) } : {}));
  const team = grid.find(t => t.id === u.teamId) || grid[grid.length - 1];
  u.teamId = team.id; if (!team.drivers.includes(u.seat)) u.seat = team.drivers[1] || team.drivers[0];
  if (u.type === 'myteam') { const ids = grid.flatMap(t => t.drivers); u.team.seats = u.team.seats.map((d, i) => ids.includes(d) || u.newDrivers.some(n => n.id === d) ? d : ['PER', 'BOT'][i]); }
  render();
}
function setupBlurb(y) {
  if (y === 2025) return 'Starts in 2025 with the F1 25 grid, plus APXGP or Konnersport if you added one. From season two the grid moves to 2026: Audi takes over Sauber and Cadillac joins.';
  if (y === 2026) return 'Starts in 2026 with the F1 25 2026 Season Pack grid: Audi takes over Sauber and Cadillac joins as the 11th team.';
  if (y > 2026) return `Starts in ${y} on a grid and calendar you lay out. Every real season to ${HIST_TO} is in your career, and the years after it are simulated.`;
  return `Starts in ${y} on the real grid and calendar. Each season after follows real life (the real line-ups and calendar) with your career’s moves on top, up to 2026; after that each season starts with the grid you confirm on the Next Season tab.`;
}
/** A circuit's Grand Prix name and venue, for adding it to a calendar. */
function trackGp(tid) {
  const t = D.TRACKS[tid] || {};
  const cal = [...D.CAL_2026, ...D.CAL_2025].find(([id]) => id === tid);
  const h = Object.values(H.seasons).flatMap(x => x.rounds).find(r => r.id === tid);
  return { id: tid, name: cal?.[1] || h?.name || t.country || tid, venue: cal?.[2] || h?.venue || t.city || '' };
}
/** A driver's age in a year, for drivers picked before the career exists. */
const setupAge = (u, id, year) => { const b = u.newDrivers.find(d => d.id === id)?.born || D.DRIVER_BIO[id]?.born || FEEDER[id]?.bornEst; return b ? year - +b.slice(0, 4) - (b.slice(5) > '03-01' ? 1 : 0) : null; };
/** Too old to race in the first season: the year they turn 44 or later. */
const retiredBy = (u, id) => { const b = id && (u.newDrivers.find(d => d.id === id)?.born || D.DRIVER_BIO[id]?.born || FEEDER[id]?.bornEst); return !!b && u.year - +b.slice(0, 4) >= RETIRE_AGE; };
let _realSkills = null;
/** Pace ratings from the last three real seasons, for picking replacements before a career exists. */
const realSkills = () => _realSkills ||= driverSkills({ seasons: [2023, 2024, 2025].map((y, i) => histSeason(y, i)), customDrivers: [] });
/** Fill one seat of the first season's grid: a driver who is free and young enough (quicker ones more likely), or a new talent. */
function setupFill(u, ti, si) {
  const year = u.year; const on = new Set(u.futureGrid.flatMap(t => t.drivers));
  const skills = realSkills();
  const recent = [2024, 2025].flatMap(y => Object.keys(H.seasons[y].drivers));
  const cands = [...new Set([...recent, ...Object.keys(FEEDER), ...u.newDrivers.map(d => d.id)])].filter(d => !on.has(d) && (setupAge(u, d, year) ?? 25) < 38)
    .map(d => [d, (skills[d] ?? u.newDrivers.find(x => x.id === d)?.skill ?? FEEDER[d]?.skill ?? 90) + ageEffect(setupAge(u, d, year)) + gauss(Math.random) * 60]).sort((a, b) => a[1] - b[1]);
  let pick = cands.length && Math.random() > 0.35 ? cands[Math.floor(Math.random() * Math.min(5, cands.length))][0] : null;
  if (!pick) {
    const g = genDriver(new Set([...u.newDrivers, ...Object.values(FEEDER), ...Object.values(H.bios)].map(x => x.name)), 'F2', year - 1, Math.random);
    u.newDrivers.push(g); pick = g.id;
  }
  u.futureGrid[ti].drivers[si] = pick;
}
/** For a career that starts after 2026: lay out the first season's grid and calendar. */
function futureGridEditor(u) {
  const grid26 = new Set(D.GRID_2026.flatMap(t => t.drivers));
  const raced = Object.keys(H.bios).filter(id => !grid26.has(id)).sort((a, b) => anyName(a).localeCompare(anyName(b)));
  const opt = (id, sel) => `<option value="${id}" ${sel === id ? 'selected' : ''}>${esc(anyName(id))}</option>`;
  const options = (sel) => `<optgroup label="2026 grid">${[...grid26].map(id => opt(id, sel)).join('')}</optgroup>
    ${u.newDrivers.some(d => !d.generated) ? `<optgroup label="Your new drivers">${u.newDrivers.filter(d => !d.generated).map(d => opt(d.id, sel)).join('')}</optgroup>` : ''}
    ${u.newDrivers.some(d => d.generated) ? `<optgroup label="New talent">${u.newDrivers.filter(d => d.generated).map(d => opt(d.id, sel)).join('')}</optgroup>` : ''}
    <optgroup label="F2 & F3 (2024–25)">${Object.keys(FEEDER).map(id => opt(id, sel)).join('')}</optgroup>
    <optgroup label="Raced since ${HIST_FROM}">${raced.map(id => opt(id, sel)).join('')}</optgroup>
    <option value="__new">+ A new driver…</option>`;
  const used = u.futureGrid.flatMap(t => t.drivers);
  const dupes = used.filter((d, i) => d && used.indexOf(d) !== i);
  const onCal = new Set(u.futureCal.map(r => r.track || r.id));
  return `<div class="panel"><div class="panel-h"><h2>The ${u.year} grid</h2><span class="muted" style="font-size:12px">Who drives where in your first season. The simulated years move everyone here.</span></div><div class="panel-b stack">
      ${dupes.length ? `<div class="callout">${esc(listJoin([...new Set(dupes)].map(anyName)))} ${dupes.length > 1 ? 'are' : 'is'} in two seats.</div>` : ''}
      ${(() => { const n = used.filter(d => retiredBy(u, d)).length; return n ? `<div class="callout row" style="justify-content:space-between"><span>${n === 1 ? 'One driver' : numWord(n)[0].toUpperCase() + numWord(n).slice(1) + ' drivers'} will have retired by ${u.year}: nobody races past ${RETIRE_AGE - 1}.</span><button class="btn sm primary" data-act="fg-fill-all">Auto-fill ${n === 1 ? 'the seat' : `all ${n} seats`}</button></div>` : ''; })()}
      <div class="fg-grid">${u.futureGrid.map((t, ti) => `<div class="fg-team" style="--c:${t.color}"><span class="bar"></span>
        <div class="row" style="gap:6px"><input type="text" value="${esc(t.name)}" data-ch="fg-name" data-i="${ti}" title="Team name"><input type="color" value="${esc(t.color)}" data-ch="fg-color" data-i="${ti}" title="Team colour"></div>
        ${[0, 1].map(si => `<select data-ch="fg-seat" data-i="${ti}" data-j="${si}">${options(t.drivers[si])}</select>
          ${retiredBy(u, t.drivers[si]) ? `<div class="fg-retired"><span>Retired by ${u.year}</span><button class="btn sm" data-act="fg-fill" data-i="${ti}" data-j="${si}">Auto-fill</button></div>` : ''}
          ${u.nd['g' + ti + '-' + si] ? newDriverForm('setup', 'g' + ti + '-' + si, u.nd['g' + ti + '-' + si]) : ''}`).join('')}</div>`).join('')}</div>
    </div></div>
    <div class="panel"><div class="panel-h"><h2>The ${u.year} calendar</h2><span class="muted" style="font-size:12px">${u.futureCal.length} rounds · also used for the simulated years</span></div>
      <div class="panel-b tight table-wrap"><table><tbody>${u.futureCal.map((r, i) => `<tr><td class="muted num">${i + 1}</td><td>${countryFlag(D.TRACKS[r.track || r.id]?.country, 12)} <b>${esc(r.name)}</b> <span class="muted">${esc(r.venue)}</span></td>
        <td><label class="check"><input type="checkbox" data-ch="fc-sprint" data-i="${i}" ${r.sprint ? 'checked' : ''}> Sprint</label></td>
        <td><div class="row" style="gap:2px;flex-wrap:nowrap;justify-content:flex-end"><button class="icon-btn" title="Earlier" data-act="fc-move" data-i="${i}" data-dir="-1">${ICON.up}</button><button class="icon-btn" title="Later" data-act="fc-move" data-i="${i}" data-dir="1">${ICON.down}</button><button class="icon-btn" title="Remove" data-act="fc-remove" data-i="${i}">${ICON.x}</button></div></td></tr>`).join('')}</tbody></table></div>
      <div class="panel-b"><select data-ch="fc-add" style="width:auto"><option value="">+ Add a circuit…</option>${Object.keys(D.TRACKS).filter(id => !onCal.has(id)).map(id => `<option value="${id}">${esc(trackGp(id).name)} · ${esc(D.TRACKS[id].circuit)}${D.TRACKS[id].former ? ' (former)' : ''}</option>`).join('')}</select></div>
    </div>`;
}
/** A real driver's career path from a year on: the teams, and when each move came. */
function realPathHtml(id, year) {
  const p = realPath(id, year); if (!p.length) return '';
  const rows = []; for (const x of p) { const lastRow = rows[rows.length - 1]; if (lastRow && lastRow.team === x.team && !x.from) { lastRow.to = x.year; continue; } rows.push({ ...x, to: x.year }); }
  return `<div class="real-path"><span class="label">${esc(anyName(id))}’s real path from ${year}</span><ul class="ms-list">${rows.map(r => `<li><span><b>${r.year}${r.to !== r.year ? '–' + r.to : ''}</b> ${r.team ? esc(r.teamName || r.team) : '<span class="muted">not racing</span>'}${r.from ? ` <span class="muted">· from round ${r.from + 1}${r.round ? ` (${esc(r.round)})` : ''}</span>` : ''}</span></li>`).join('')}</ul>
    <p class="muted" style="font-size:12px;margin:6px 0 0">These moves happen on their own as you log the races. Real data runs to ${HIST_TO}; ${HIST_TO + 1} starts on F1 25’s grid, and after that each season starts with the grid you confirm on the Next Season tab.</p></div>`;
}
function renderSetup() {
  const u = ui.setup ||= defaultSetup();
  u.role ||= 'owner'; u.nd ||= {}; u.newDrivers ||= []; u.team.seats ||= ['PER', 'BOT']; u.year ||= 2025;
  const principal = u.type === 'myteam' && u.role === 'principal';
  const future = u.year > 2026;
  const realAs = u.type === 'driver' && u.as === 'real' && !future;
  if (future) { u.futureGrid ||= D.GRID_2026.map(t => ({ ...t, drivers: [...t.drivers] })); u.futureCal ||= D.CAL_2026.map(([id, name, venue, sprint]) => ({ id, name, venue, sprint })); }
  const grid = setupGrid(u);
  if (!grid.some(t => t.id === u.teamId)) { u.teamId = grid[grid.length - 1].id; u.seat = grid[grid.length - 1].drivers[1]; }
  const gridDrivers = grid.flatMap(t => t.drivers).filter(Boolean);
  const pool = [...gridDrivers.map(id => ({ id, name: anyName(id) })), ...u.newDrivers.map(d => ({ ...d, custom: true })), ...(u.year >= 2025 ? Object.values(FEEDER).map(d => ({ id: d.id, name: `${d.name} (${d.series})` })) : [])];
  const teamCards = grid.map(t => `<div class="choice team-choice ${u.teamId === t.id ? 'on' : ''}" style="--c:${t.color}">
    <span class="bar"></span><div class="inner"><b>${esc(t.name)}</b><small>Replace a driver:</small>
    <div class="row" style="gap:6px">${t.drivers.map(d => `<button class="seat ${u.teamId === t.id && u.seat === d ? 'on' : ''}" data-act="setup-seat" data-team="${t.id}" data-seat="${d}">${esc(anyName(d))}</button>`).join('')}</div></div></div>`).join('');
  const first = !state.careers.some(x => !x.realSeason);
  return `<div class="page" style="max-width:1100px">
    <div class="page-head"><div>${first ? '<span class="label">Welcome to Pitwall</span>' : ''}<h1>${u.single ? 'Single weekend' : 'New career'}</h1><div class="sub">${u.single ? `One weekend in F1 25’s Grand Prix mode, as a driver on the ${u.year} grid: practice, qualifying, Live Race and the debrief, with no championship around it.` : esc(setupBlurb(u.year))}</div></div>
      ${!first ? '<button class="btn ghost" data-act="cancel-setup">Cancel</button>' : ''}</div>

    <div class="panel"><div class="panel-b"><div class="choices">${[['career', 'Career', 'A season, and the seasons after it, in F1 25’s career mode.'], ['single', 'Single weekend', 'One weekend outside any career: pick a year, a driver from that year and a track.']].map(([id, n, b]) => `<button class="choice ${(u.single ? 'single' : 'career') === id ? 'on' : ''}" data-act="setup-single" data-v="${id}"><b>${n}</b><small>${b}</small></button>`).join('')}</div></div></div>
    ${u.single ? singleSetupHtml(u) + '</div>' : ''}${u.single ? '' : `
    <div class="panel"><div class="panel-h"><h2>First season</h2><span class="muted" style="font-size:12px">Every season from ${HIST_FROM} is in your career either way, so you can look back on all of it</span></div><div class="panel-b stack">
      <div class="row" style="gap:10px"><div class="seg year-seg">${Array.from({ length: 2026 - HIST_FROM + 1 }, (_, k) => HIST_FROM + k).map(y => `<button data-act="setup-year" data-v="${y}" class="${u.year === y ? 'on' : ''}">${y}</button>`).join('')}<button data-act="setup-year" data-v="${Math.max(2027, u.year)}" class="${future ? 'on' : ''}">Later…</button></div>
        ${future ? `<label class="row" style="gap:8px">Year <input type="number" min="2027" max="2060" value="${u.year}" data-ch="setup-year" style="width:90px"></label>` : ''}</div>
      ${future ? `<p class="muted" style="margin:0;font-size:13px">Real results run to the end of ${HIST_TO}. ${u.year - 1 > HIST_TO ? `${HIST_TO + 1}${u.year - 1 > HIST_TO + 1 ? `–${u.year - 1}` : ''} will be simulated race by race, with a driver market that ends on the grid you lay out below.` : ''}</p>` : ''}
    </div></div>
    ${future ? futureGridEditor(u) : ''}

    <div class="panel"><div class="panel-h"><h2>Career mode</h2></div><div class="panel-b">
      <div class="choices">${[['driver', 'Driver Career', 'Take a seat at an existing team and work your way up.'], ['myteam', 'My Team', 'Found the 11th team: you own it, run it and drive for it.']].map(([id, n, b]) => `<button class="choice ${u.type === id ? 'on' : ''}" data-act="setup-pick" data-k="type" data-v="${id}"><b>${n}</b><small>${b}</small></button>`).join('')}</div>
    </div></div>

    ${u.type === 'driver' && !future ? `<div class="panel"><div class="panel-h"><h2>Who you race as</h2><span class="muted" style="font-size:12px">F1 25 mods let a career start as any real driver</span></div><div class="panel-b stack">
      <div class="choices">${[['own', 'Your own driver', 'Create a driver and take over a seat.'], ['real', 'A real driver', `Race as someone on the ${u.year} grid. Their real moves happen during and between seasons, as they did in real life.`]].map(([id, n, b]) => `<button class="choice ${(u.as || 'own') === id ? 'on' : ''}" data-act="setup-pick" data-k="as" data-v="${id}"><b>${n}</b><small>${b}</small></button>`).join('')}</div>
      ${realAs ? `<label class="field" style="max-width:360px"><span>Driver</span><select data-ch="setup" data-k="realDriver"><option value="">Pick a driver…</option>${grid.map(t => `<optgroup label="${esc(t.name)}">${t.drivers.filter(Boolean).map(d => `<option value="${d}" ${u.realDriver === d ? 'selected' : ''}>${esc(anyName(d))}</option>`).join('')}</optgroup>`).join('')}</select></label>
        ${u.realDriver && gridDrivers.includes(u.realDriver) ? realPathHtml(u.realDriver, u.year) : ''}` : ''}
    </div></div>` : ''}
    ${u.type === 'myteam' ? `<div class="panel"><div class="panel-h"><h2>Your role</h2></div><div class="panel-b">
      <div class="choices">${[['principal', 'Team Principal', 'You run the team and sign both drivers. This is how My Team works in F1 25.'], ['owner', 'Driver-Owner', 'You own the team and drive for it. Not in F1 25, kept for games that bring it back.']].map(([id, n, b]) => `<button class="choice ${u.role === id ? 'on' : ''}" data-act="setup-pick" data-k="role" data-v="${id}"><b>${n}</b><small>${b}</small></button>`).join('')}</div>
    </div></div>` : ''}

    <div class="panel" ${realAs ? 'hidden' : ''}><div class="panel-h"><h2>${principal ? 'You, the team principal' : 'Your driver'}</h2></div><div class="panel-b stack">
      <div class="form-grid">
        <label class="field"><span>First name</span><input type="text" data-ch="setup" data-k="first" value="${esc(u.first)}" placeholder="Alex"></label>
        <label class="field"><span>Last name</span><input type="text" data-ch="setup" data-k="last" value="${esc(u.last)}" placeholder="Morgan"></label>
        ${principal ? '' : `<label class="field"><span>Abbreviation</span><input type="text" data-ch="setup" data-k="abbr" maxlength="3" value="${esc(u.abbr)}" placeholder="MOR"></label>
        <label class="field"><span>Race number</span><input type="number" data-ch="setup" data-k="number" min="1" max="99" value="${esc(u.number)}"></label>`}
        <label class="field"><span>Nationality</span><input type="text" data-ch="setup" data-k="nationality" value="${esc(u.nationality)}" placeholder="South African"></label>
        <label class="field"><span>Date of birth</span><input type="date" data-ch="setup" data-k="born" value="${esc(u.born || '')}" max="2012-12-31"></label>
      </div>
      ${principal ? '' : `<div class="row" style="gap:14px">
        ${u.photo ? `<img class="avatar" src="${esc(u.photo)}" alt="" style="width:64px;height:64px">` : `<span class="avatar gen" style="width:64px;height:64px;--c:#5E6A82;color:#fff;font-size:22px">${esc(initials(`${u.first} ${u.last}`.trim() || '?'))}</span>`}
        <div class="stack" style="gap:6px"><div class="row">${pictureControls('setup', PLAYER_ID, !!u.photo)}</div><span class="muted" style="font-size:12px">Optional. Used on standings, stories and your profile. A square head-and-shoulders shot works best.</span></div>
      </div>`}
    </div></div>

    ${u.year === 2025 && u.type !== 'myteam' ? `<div class="panel"><div class="panel-h"><h2>11th team</h2><span class="muted" style="font-size:12px">Did you add APXGP or Konnersport to your F1 25 career? They race 2025 only.</span></div><div class="panel-b">${extraPicker(u.extra, 'setup-pick')}</div></div>` : ''}
    ${u.type === 'myteam' ? `<div class="panel"><div class="panel-h"><h2>Your team</h2><span class="muted" style="font-size:12px">${u.year <= 2025 ? 'Your team is the 11th team' : 'Joins the grid as an extra team'}. Everything can be changed later in My Team.</span></div><div class="panel-b stack">
      ${teamIdentityForm(u.team, 'setup')}
      ${principal ? `<div class="form-grid">${[0, 1].map(i => `<label class="field"><span>${i ? 'Second driver' : 'Lead driver'}</span><select data-ch="mt-seat" data-i="${i}">
          ${pool.map(d => `<option value="${d.id}" ${u.team.seats[i] === d.id ? 'selected' : ''}>${esc(d.name)}${d.custom ? ' (new)' : ''}</option>`).join('')}<option value="__new" ${u.nd[i] ? 'selected' : ''}>+ Create a new driver…</option></select></label>`).join('')}</div>
        ${[0, 1].filter(i => u.nd[i]).map(i => newDriverForm('setup', i, u.nd[i])).join('')}
        <p class="muted" style="font-size:13px">The lead driver is the one Pitwall follows on the dashboard, teammate battle and career stats. Signing a driver from another team frees up their seat for a reserve driver.</p>`
      : `<div class="form-grid">
        <label class="field"><span>Teammate</span><select data-ch="mt-field" data-scope="setup" data-k="mate">${[...new Set([...gridDrivers, 'PER', 'BOT'])].map(id => `<option value="${id}" ${u.team.mate === id ? 'selected' : ''}>${esc(anyName(id))}</option>`).join('')}</select></label>
      </div>
      <p class="muted" style="font-size:13px">Signing a driver from another team frees up their seat for a reserve driver.</p>`}
    </div></div>`
    : `<div class="panel" ${realAs ? 'hidden' : ''}><div class="panel-h"><h2>${u.year} team</h2><span class="muted" style="font-size:12px">Pick the seat you took over in-game</span></div><div class="panel-b">
      <div class="choices">${teamCards}</div>
    </div></div>`}

    <div class="panel"><div class="panel-h"><h2>Goals & story</h2></div><div class="panel-b stack">
      ${goalEditor(u.goals, 'setup')}
      <div class="form-grid">
        <label class="field"><span>Practice sessions</span><select data-ch="setup" data-k="practice">${[['full', 'Full (FP1, FP2, FP3)'], ['short', 'Short (one session)'], ['none', 'None']].map(([v, l]) => `<option value="${v}" ${u.practice === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      </div>
      <label class="field"><span>Backstory (optional, used by the media)</span><textarea data-ch="setup" data-k="bio" placeholder="F2 runner-up in 2024, signed after impressing in a Silverstone test…">${esc(u.bio)}</textarea></label>
    </div></div>

    <div class="row" style="justify-content:flex-end"><button class="btn primary" data-act="create-career">${future && u.year - 1 > HIST_TO ? `Simulate to ${u.year} and start` : `Start ${u.year} season`}</button></div>
  </div>`}`;
}
/** Who goals can be set for, and which teams to beat, in the setup or a goals dialog. */
function goalCtx(scope) {
  if (scope === 'setup') {
    const u = ui.setup; const principal = u.type === 'myteam' && u.role === 'principal';
    return { drivers: principal ? u.team.seats.filter(Boolean).map(id => [id, anyName(id)]) : null, teams: setupGrid(u).filter(t => u.type === 'myteam' || t.id !== u.teamId).map(t => [t.id, t.name]) };
  }
  const c = career(); const m = ui.modal; const next = m?.kind === 'next'; const s = curSeason();
  const teams = next ? m.base.teams : s.teams;
  const mine = isPrincipal(c) ? MYTEAM : next ? m.teamId : s.playerTeamId;
  const mt = teams.find(t => t.id === mine);
  return { drivers: isPrincipal(c) ? (mt?.drivers.filter(Boolean) || []).map(id => [id, next ? m.base.drivers[id]?.name || anyName(id) : dName(s, id)]) : null, teams: teams.filter(t => t.id !== mine).map(t => [t.id, t.name]) };
}
/** Team goals and driver goals: in My Team you set them for each of your drivers, in a Driver Career for yourself. */
function goalEditor(goals, scope) {
  const ctx = goalCtx(scope);
  const section = (kind) => {
    const list = goals.filter(g => goalScope(g) === kind);
    const types = D.GOAL_TYPES.filter(x => x.scope === kind || x.scope === 'any');
    return `<div class="stack" style="gap:6px"><span class="label">${kind === 'team' ? 'Team goals' : ctx.drivers ? 'Driver goals' : 'Your goals'}</span>
      ${list.length ? `<div class="table-wrap"><table><tbody>${list.map(g => {
        const gt = D.GOAL_TYPES.find(x => x.id === g.type);
        return `<tr><td><select data-ch="goal-type" data-scope="${scope}" data-id="${g.id}">${types.map(x => `<option value="${x.id}" ${x.id === g.type ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}</select>
          ${g.type === 'custom' ? `<input type="text" style="margin-top:6px" placeholder="Describe the goal" value="${esc(g.text || '')}" data-ch="goal-text" data-scope="${scope}" data-id="${g.id}">` : ''}</td>
          ${kind === 'driver' && ctx.drivers ? `<td style="width:170px"><select data-ch="goal-driver" data-scope="${scope}" data-id="${g.id}">${ctx.drivers.map(([id, n]) => `<option value="${id}" ${g.driver === id ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></td>` : ''}
          <td style="width:170px">${gt?.needsTeam ? `<select data-ch="goal-team" data-scope="${scope}" data-id="${g.id}">${ctx.teams.map(([id, n]) => `<option value="${id}" ${g.team === id ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>`
            : gt?.needsTarget ? `<input type="number" min="0" value="${esc(g.target ?? '')}" data-ch="goal-target" data-scope="${scope}" data-id="${g.id}">` : '<span class="muted">—</span>'}</td>
          <td style="width:40px"><button class="icon-btn" title="Remove goal" data-act="goal-remove" data-scope="${scope}" data-id="${g.id}">${ICON.x}</button></td></tr>`;
      }).join('')}</tbody></table></div>` : ''}
      <div><button class="btn sm" data-act="goal-add" data-scope="${scope}" data-kind="${kind}">+ ${kind === 'team' ? 'Team goal' : ctx.drivers ? 'Driver goal' : 'Goal'}</button></div></div>`;
  };
  return `<div class="stack">${section('team')}${section('driver')}</div>`;
}

/* ------------------------------------------------------------------ modal */
function modal(html, cls = '') {
  $('#modal-root').innerHTML = `<div class="modal-back" data-act="modal-bg"><div class="modal ${cls}" role="dialog" aria-modal="true">${html}</div></div>`;
}
function closeModal() { $('#modal-root').innerHTML = ''; ui.modal = null; setTimeout(flushRemote, 0); }
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, 2600);
}
function confirmBox(title, text, okLabel, onOk) {
  ui.confirmFn = onOk;
  modal(`<div class="modal-h"><h2>${esc(title)}</h2></div><div class="modal-b"><p>${esc(text)}</p></div>
    <div class="modal-f"><button class="btn ghost" data-act="modal-close">Cancel</button><button class="btn primary" data-act="confirm-ok">${esc(okLabel)}</button></div>`);
}

function goalsModal() {
  const s = curSeason();
  ui.modal = { kind: 'goals', goals: clone(s.goals) };
  drawGoalsModal();
}
function drawGoalsModal() {
  const s = curSeason();
  modal(`<div class="modal-h"><h2>${s.year} season goals</h2><button class="icon-btn" data-act="modal-close">${ICON.x}</button></div>
    <div class="modal-b">${goalEditor(ui.modal.goals, 'modal')}</div>
    <div class="modal-f"><button class="btn ghost" data-act="modal-close">Cancel</button><button class="btn primary" data-act="goals-save">Save goals</button></div>`);
}

function nextSeasonModal() {
  const c = career(); const s = latestSeason();
  const index = s.index + 1;
  const base = baseRoster(c, index, s);
  // a move you signed for next season decides where you start; the seat you take is the one your chain freed up
  const myMove = (s.transfers || []).filter(tr => tr.effective === 'next').flatMap(tr => tr.steps).filter(m => m.driver === PLAYER_ID && m.kind === 'move').pop();
  const realTeam = realDriverOf(c) && base.teams.find(t => t.drivers.includes(c.realDriver))?.id;
  const want = realTeam || myMove?.to || s.playerTeamId;
  const keep = base.teams.some(t => t.id === want) ? want : base.teams.some(t => t.id === s.playerTeamId) ? s.playerTeamId : base.teams[0].id;
  const keepTeam = base.teams.find(t => t.id === keep);
  const defaultSeat = myMove && keepTeam.drivers.includes(null) ? null : keepTeam.drivers.find(d => d) || null;
  const was = ui.nextKeep; ui.nextKeep = null;
  // a move already signed for next season settles where you drive: no need to ask
  const settled = !!myMove || !!realTeam || isPrincipal(c);
  ui.modal = { kind: 'next', index, base, teamId: keep, seat: defaultSeat, settled, tab: was?.tab || (settled ? 'grid' : 'seat'), goals: was?.goals || s.goals.map(g => ({ ...g, id: uid(), done: false })) };
  drawNextSeasonModal();
}
function drawNextSeasonModal() {
  const c = career(); const s = latestSeason(); const m = ui.modal;
  const st = seasonStats(s); const ds = driverStandings(s, st); const myPos = ds.find(x => x.id === PLAYER)?.pos;
  const remaining = activeRounds(s).length - roundsDone(s);
  const year = s.year + 1;
  const extraAsk = year === 2025 && c.type !== 'myteam' && c.startYear < 2025 ? `<div><h3 style="margin-bottom:6px">11th team in 2025</h3><p class="muted" style="margin:0 0 10px">Did your F1 25 career add APXGP or Konnersport? They race in 2025 only.</p>${extraPicker(m.extra ?? c.extraTeam2025, 'next-extra')}</div>` : '';
  const apxNote = year === 2026 ? '<div class="callout">The grid moves to the 2026 regulations: Audi replaces Kick Sauber and Cadillac joins as the 11th team. Madrid replaces Imola on the calendar.</div>'
    : templateFor(year) ? `<div class="callout">The ${year} grid and calendar follow real life, with the moves made in your career on top.</div>`
    : '<div class="callout">Past the real data: the season starts with the grid and calendar on the Next Season tab, this season’s grid with only the transfers you confirmed. Nothing is added for you.</div>';
  modal(`<div class="modal-h"><h2>Start the ${year} season</h2><button class="icon-btn" data-act="modal-close">${ICON.x}</button></div>
    <div class="modal-b">
      ${remaining ? `<div class="callout">${remaining} round${remaining > 1 ? 's' : ''} of ${s.year} still unlogged. You can come back and log them later.</div>` : ''}
      <div class="kv"><dt>${s.year} result</dt><dd><b>${myPos ? 'P' + myPos : '–'}</b> in the drivers' championship with ${st[PLAYER]?.pts || 0} points</dd><dt>Champion</dt><dd>${esc(dName(s, ds[0]?.id))}</dd></div>
      ${apxNote}
      ${extraAsk}
      <div class="seg seg-wrap">${[...(m.settled ? [] : [['seat', 'Your seat']]), ['grid', `${year} grid`], ['calendar', 'Calendar'], ['goals', 'Goals']].map(([v, l]) => `<button data-act="next-tab" data-v="${v}" class="${m.tab === v ? 'on' : ''}">${l}</button>`).join('')}</div>
      ${m.tab === 'grid' ? `<div class="stack"><div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:8px"><p class="muted" style="margin:0;font-size:13px">Next season’s line-up with every move signed so far. Tap a driver, or make a new transfer, exactly as on the Transfers page: it takes effect from ${year} and the press reports it.</p><button class="btn sm primary" data-act="next-transfer">New transfer for ${year}</button></div>${gridCards(c, s, nextLineup(c, s).teams, nextLineup(c, s).drivers, { act: 'next-transfer', year })}</div>` : ''}
      ${m.tab === 'calendar' ? `${renderNextSeason(c, s, 'cal')}<p class="muted" style="font-size:12px;margin:0">A calendar never announced, or changed since it was, is announced in the stories when the season starts.</p>` : ''}
      ${m.tab === 'seat' ? `${realDriverOf(c) && m.base.teams.some(t => t.drivers.includes(c.realDriver)) ? `<div><h3 style="margin-bottom:6px">Your ${year} seat</h3><p class="muted" style="margin:0">${esc(m.base.drivers[c.realDriver]?.name || anyName(c.realDriver))} races for <b>${esc(m.base.teams.find(t => t.drivers.includes(c.realDriver)).name)}</b> in ${year}, as in real life${year <= HIST_TO ? ', and any moves during the season happen when they really did' : ''}.</p></div>`
        : realDriverOf(c) ? `<div class="callout">${esc(anyName(c.realDriver))} didn’t start the ${year} season in real life${year > HIST_TO ? ' (or the real data has run out)' : ''}. Pick the seat they take below.</div>` : ''}
      ${realDriverOf(c) && m.base.teams.some(t => t.drivers.includes(c.realDriver)) ? '' : isPrincipal(c) ? `<div><h3 style="margin-bottom:6px">Your ${year} line-up</h3><p class="muted">${esc(m.base.teams.find(t => t.id === MYTEAM)?.drivers.filter(Boolean).map(d => m.base.drivers[d]?.name || d).join(' and ') || 'No drivers signed')}. Sign or release drivers in Transfers.</p></div>` : `<div><h3 style="margin-bottom:10px">Your ${year} seat</h3><div class="choices">${m.base.teams.map(t => `<div class="choice team-choice ${m.teamId === t.id ? 'on' : ''}" style="--c:${t.color}"><span class="bar"></span><div class="inner"><b>${esc(t.name)}</b>
        <div class="row" style="gap:6px">${t.drivers.map((d, i) => `<button class="seat ${m.teamId === t.id && m.seat === d ? 'on' : ''}" data-act="next-seat" data-team="${t.id}" data-seat="${d ?? ''}" data-i="${i}">${d ? esc(m.base.drivers[d]?.name || d) : 'Empty seat'}</button>`).join('')}</div></div></div>`).join('')}</div></div>`}` : ''}
      ${m.tab === 'goals' ? `<div><h3 style="margin-bottom:10px">${year} goals</h3>${goalEditor(m.goals, 'modal')}</div>` : ''}
    </div>
    <div class="modal-f"><button class="btn ghost" data-act="modal-close">Cancel</button><button class="btn primary" data-act="next-confirm">Start ${year}</button></div>`, 'wide');
}

function newMediaModal(roundId) {
  const c = career(); const s = latestSeason();
  const sCur = curSeason();
  const season = roundId ? sCur : s;
  const rounds = activeRounds(season);
  const withR = rounds.filter(r => season.weekends[r.id]?.sessions?.R?.done);
  const withQ = rounds.filter(r => season.weekends[r.id]?.sessions?.Q?.done);
  const defRound = roundId || withR[withR.length - 1]?.id || withQ[withQ.length - 1]?.id || '';
  const ws = (id) => season.weekends[id]?.sessions || {};
  const defKind = roundId ? (ws(roundId).R?.done ? 'race' : ws(roundId).SPR?.done ? 'sprint' : 'quali') : (withR.length ? 'race' : 'preseason');
  ui.modal = { kind: 'media', seasonIdx: season.index, roundId: defRound, mkind: defKind };
  drawMediaModal();
}
function drawMediaModal() {
  const c = career(); const m = ui.modal; const s = c.seasons[m.seasonIdx];
  const needsRound = ['quali', 'sprint', 'race'].includes(m.mkind);
  modal(`<div class="modal-h"><h2>New media session</h2><button class="icon-btn" data-act="modal-close">${ICON.x}</button></div>
    <div class="modal-b">
      <div class="choices">${[['preseason', 'Pre-season media day', 'Expectations, targets and your new team.'], ['quali', 'Post-qualifying', 'Your grid slot and Sunday’s plan.'], ['sprint', 'Post-sprint', 'The sprint result and what it means for Sunday.'], ['race', 'Post-race', 'The result, the battles, the fallout.'], ['midseason', 'Mid-season interview', 'Form, standings and the teammate battle.'], ['endseason', 'End-of-season interview', 'Verdict on the year and what comes next.']].map(([id, n, b]) => `<button class="choice ${m.mkind === id ? 'on' : ''}" data-act="media-kind" data-v="${id}"><b>${n}</b><small>${b}</small></button>`).join('')}</div>
      <div class="form-grid">
        <label class="field"><span>Season</span><select data-ch="media-season">${playedSeasons(c).map(x => `<option value="${x.index}" ${x.index === m.seasonIdx ? 'selected' : ''}>${x.year}</option>`).join('')}</select></label>
        ${needsRound ? `<label class="field"><span>Round</span><select data-ch="media-round">${activeRounds(s).map((r, i) => `<option value="${r.id}" ${r.id === m.roundId ? 'selected' : ''}>R${i + 1} · ${esc(r.name)}</option>`).join('')}</select></label>` : ''}
      </div>
      ${!settings.hasKey ? '<p class="muted" style="font-size:13px">No API key saved, so questions come from the built-in template set. Add a key in Settings for AI-written journalists and articles.</p>' : ''}
    </div>
    <div class="modal-f">${ui.busy ? '<span class="spinner"></span>' : ''}<button class="btn ghost" data-act="modal-close">Cancel</button><button class="btn primary" data-act="media-start" ${ui.busy ? 'disabled' : ''}>Enter the press room</button></div>`);
}
