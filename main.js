const { app, BrowserWindow, ipcMain, dialog, safeStorage, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const createCompanion = require('./companion');
const createTelemetry = require('./telemetry');
const createReplays = require('./replays');

const dataDir = () => app.getPath('userData');
const dataFile = () => path.join(dataDir(), 'career-data.json');
const settingsFile = () => path.join(dataDir(), 'settings.json');
const telemetryFile = () => path.join(dataDir(), 'telemetry.json');

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')); } catch { return fallback; }
}

function writeJsonAtomic(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

function backupOnce() {
  // Keep a rolling daily backup next to the data file.
  try {
    if (!fs.existsSync(dataFile())) return;
    const day = new Date().toISOString().slice(0, 10);
    const dir = path.join(dataDir(), 'backups');
    fs.mkdirSync(dir, { recursive: true });
    const target = path.join(dir, `career-data-${day}.json`);
    if (!fs.existsSync(target)) fs.copyFileSync(dataFile(), target);
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort();
    while (files.length > 14) fs.unlinkSync(path.join(dir, files.shift()));
  } catch (e) { console.error('backup failed', e); }
}
// Backups made on an event (a race logged, before an import, a new season or a restore, or by hand): the last 20.
const EVENT_KEEP = 20;
function backupEvent(kind) {
  try {
    if (!fs.existsSync(dataFile())) return false;
    const dir = path.join(dataDir(), 'backups'); fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    fs.copyFileSync(dataFile(), path.join(dir, `career-data-${stamp}-${String(kind).replace(/[^a-z]/g, '') || 'manual'}.json`));
    const events = fs.readdirSync(dir).filter(f => /^career-data-\d{4}-\d\d-\d\dT.*\.json$/.test(f)).sort();
    while (events.length > EVENT_KEEP) fs.unlinkSync(path.join(dir, events.shift()));
    return true;
  } catch (e) { console.error('backup failed', e); return false; }
}
function listBackups() {
  const dir = path.join(dataDir(), 'backups');
  try {
    return fs.readdirSync(dir).filter(f => /^career-data-.*\.json$/.test(f)).map(f => {
      const st = fs.statSync(path.join(dir, f)); const m = f.match(/T[\d-]+-([a-z]+)\.json$/);
      return { file: f, at: st.mtime.toISOString(), kind: m ? m[1] : 'daily', bytes: st.size };
    }).sort((a, b) => b.at.localeCompare(a.at));
  } catch { return []; }
}

function getSettings() {
  const s = readJson(settingsFile(), {});
  let apiKey = '';
  if (s.apiKeyEnc && safeStorage.isEncryptionAvailable()) {
    try { apiKey = safeStorage.decryptString(Buffer.from(s.apiKeyEnc, 'base64')); } catch { apiKey = ''; }
  } else if (s.apiKeyPlain) {
    apiKey = s.apiKeyPlain;
  }
  return { apiKey, model: s.model || 'claude-sonnet-5-5' };
}

function saveSettings({ apiKey, model }) {
  const out = { model: model || 'claude-sonnet-5-5' };
  if (apiKey) {
    if (safeStorage.isEncryptionAvailable()) out.apiKeyEnc = safeStorage.encryptString(apiKey).toString('base64');
    else out.apiKeyPlain = apiKey;
  }
  writeJsonAtomic(settingsFile(), out);
  return true;
}

let win = null;
const toWindow = (channel, payload) => { if (win && !win.isDestroyed()) win.webContents.send(channel, payload); };

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#0B0F17',
    title: 'Pitwall',
    icon: path.join(__dirname, 'build', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  // scale the interface with the window: the page fills the width, and a window wider than 1800 (in Windows' own
  // display-scaled pixels) also grows the text and controls, in 5% steps up to 160%
  const fit = () => {
    if (!win || win.isDestroyed()) return;
    const [w] = win.getContentSize();
    win.webContents.setZoomFactor(Math.min(1.6, Math.max(1, Math.round(w / 1800 / 0.05) * 0.05)));
  };
  win.on('resize', fit); win.webContents.on('did-finish-load', fit);
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });
}

/*
  Updates: on start (and from Settings) Pitwall asks GitHub for the repository's latest release. A newer version is
  offered in the app with its notes. Installed Pitwall downloads the release's installer, runs it quietly over itself
  and opens again on the new version (careers and settings stay in the user folder); a copy that wasn't installed (the
  old portable one, or run from the source) opens the download instead. The repository is "pitwall.updateRepo" in
  package.json (owner/name); left empty, there's no check.
*/
const installed = () => app.isPackaged && process.platform === 'win32' && !process.env.PORTABLE_EXECUTABLE_FILE;
const UPDATE_REPO = (() => { try { return require('./package.json').pitwall?.updateRepo || ''; } catch { return ''; } })();
const newer = (a, b) => { const p = (v) => String(v).replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0); const x = p(a), y = p(b); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); return false; };
async function checkUpdate() {
  const current = app.getVersion();
  if (!UPDATE_REPO) return { current, configured: false };
  try {
    const res = await fetch(`https://api.github.com/repos/${UPDATE_REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Pitwall' } });
    if (res.status === 404) return { current, configured: true, latest: null };
    if (!res.ok) return { current, configured: true, error: `GitHub said ${res.status}` };
    const r = await res.json(); const latest = String(r.tag_name || '').replace(/^v/, '');
    const exe = (r.assets || []).find(a => /setup.*\.exe$/i.test(a.name)) || (r.assets || []).find(a => /\.exe$/i.test(a.name));
    return { current, configured: true, latest, newer: newer(latest, current), notes: String(r.body || '').slice(0, 4000), page: r.html_url, download: exe?.browser_download_url || r.html_url, size: exe?.size || null,
      canInstall: installed() && !!exe && /setup/i.test(exe.name) };
  } catch (e) { return { current, configured: true, error: 'No connection to GitHub' }; }
}
ipcMain.handle('update:check', () => checkUpdate());
/**
 * The new version, downloaded in the background (reporting progress) as soon as it's found. It goes in when you
 * restart Pitwall from the app, or by itself when you close Pitwall: the installer runs quietly over this version.
 */
/*
  The download comes in four pieces at once, each written into its place in the file. A file just published comes
  slowly from GitHub's servers until they have a copy (a fraction of a megabyte a second on one connection), and four
  connections are four times that. A server that won't send pieces gets it in one go.
*/
const DL_PARTS = 4;
async function readInto(res, fh, pos, onBytes) {
  const reader = res.body.getReader(); let at = pos;
  for (;;) { const { done, value } = await reader.read(); if (done) break; await fh.write(value, 0, value.length, at); at += value.length; onBytes(value.length); }
  return at - pos;
}
async function downloadFile(url, file, size, progress) {
  const H = { 'User-Agent': 'Pitwall' }; let got = 0; const count = (n) => { got += n; progress(got, size || 0); };
  const fh = await fs.promises.open(file, 'w');
  try {
    if (size > 4e6) {
      const step = Math.ceil(size / DL_PARTS); const parts = Array.from({ length: DL_PARTS }, (_, k) => [k * step, Math.min(size, (k + 1) * step) - 1]).filter(([a, b]) => a <= b);
      const first = await fetch(url, { headers: { ...H, Range: `bytes=${parts[0][0]}-${parts[0][1]}` } });
      if (first.status === 206) {
        const whole = +(first.headers.get('content-range') || '').split('/')[1]; if (whole && whole !== size) throw new Error('The download wasn’t the size GitHub listed');
        const sizes = await Promise.all(parts.map(async ([a, b], k) => {
          const res = k === 0 ? first : await fetch(url, { headers: { ...H, Range: `bytes=${a}-${b}` } });
          if (res.status !== 206 || !res.body) throw new Error(`GitHub said ${res.status}`);
          const n = await readInto(res, fh, a, count); if (n !== b - a + 1) throw new Error('The download was incomplete'); return n;
        }));
        if (sizes.reduce((x, y) => x + y, 0) !== size) throw new Error('The download was incomplete');
        return;
      }
      if (!first.ok || !first.body) throw new Error(`GitHub said ${first.status}`);
      await first.body.cancel().catch(() => {});
    }
    // one piece
    const res = await fetch(url, { headers: H }); if (!res.ok || !res.body) throw new Error(`GitHub said ${res.status}`);
    const n = await readInto(res, fh, 0, count); if (size && n !== size) throw new Error('The download was incomplete');
  } catch (err) { await fh.close().catch(() => {}); fs.rmSync(file, { force: true }); throw err; }
  finally { await fh.close().catch(() => {}); }
}
let downloading = null; let ready = null; let applying = false;
ipcMain.handle('update:download', (e) => {
  if (ready) return { ok: true, version: ready.version };
  if (downloading) return downloading;
  downloading = (async () => {
    if (!installed()) return { ok: false };
    const U = await checkUpdate(); if (!U.newer || !U.canInstall) return { ok: false, error: 'No installer in the latest release' };
    const file = path.join(app.getPath('temp'), `Pitwall-Setup-${U.latest}.exe`);
    try {
      if (!(U.size && fs.existsSync(file) && fs.statSync(file).size === U.size)) {
        let last = 0; const progress = (got, total) => { const now = Date.now(); if (now - last > 500 && !e.sender.isDestroyed()) { last = now; e.sender.send('update:progress', { got, total }); } };
        await downloadFile(U.download, file, U.size, progress);
      }
      ready = { file, version: U.latest };
      return { ok: true, version: U.latest };
    } catch (err) { return { ok: false, error: err.message || 'The download failed' }; }
  })().finally(() => { downloading = null; });
  return downloading;
});
const runInstaller = (reopen) => { require('child_process').spawn(ready.file, ['/S', '--updated', ...(reopen ? ['--force-run'] : [])], { detached: true, stdio: 'ignore' }).unref(); };
// Restart now: install and open again on the new version
ipcMain.handle('update:apply', () => { if (!ready) return { ok: false }; applying = true; runInstaller(true); setTimeout(() => app.quit(), 300); return { ok: true }; });
// closing Pitwall with an update downloaded: it goes in quietly, ready for next time
app.on('will-quit', () => { if (ready && !applying) { applying = true; try { runInstaller(false); } catch { } } });
ipcMain.handle('update:open', (_e, url) => { if (/^https:\/\/github\.com\//.test(String(url))) shell.openExternal(url); });
ipcMain.handle('data:load', () => { backupOnce(); return { state: readJson(dataFile(), null), rev: companion.rev() }; });
ipcMain.handle('data:save', (_e, { state, baseRev }) => companion.commit(state, baseRev));
ipcMain.handle('data:location', () => dataFile());
ipcMain.handle('backup:list', () => listBackups());
ipcMain.handle('backup:now', (_e, kind) => backupEvent(kind));
ipcMain.handle('backup:read', (_e, file) => { const f = path.basename(String(file || '')); return /^career-data-.*\.json$/.test(f) ? readJson(path.join(dataDir(), 'backups', f), null) : null; });
ipcMain.handle('backup:folder', () => shell.openPath(path.join(dataDir(), 'backups')));

ipcMain.handle('data:export', async (_e, state) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Export career backup',
    defaultPath: `pitwall-backup-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (canceled || !filePath) return false;
  writeJsonAtomic(filePath, state);
  return true;
});

ipcMain.handle('data:import', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Import career backup',
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile'],
  });
  if (canceled || !filePaths[0]) return null;
  return readJson(filePaths[0], null);
});

ipcMain.handle('image:save', async (_e, { dataUrl, name }) => {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) return false;
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Save weekend card',
    defaultPath: path.join(app.getPath('pictures'), String(name || 'pitwall-weekend.png').replace(/[^\w.-]+/g, '-')),
    filters: [{ name: 'PNG image', extensions: ['png'] }],
  });
  if (canceled || !filePath) return false;
  fs.writeFileSync(filePath, Buffer.from(m[1], 'base64'));
  return true;
});

ipcMain.handle('settings:get', () => {
  const s = getSettings();
  return { hasKey: !!s.apiKey, model: s.model };
});
ipcMain.handle('settings:set', (_e, payload) => applySettings(payload));

ipcMain.handle('ai:generate', (_e, req) => generate(req));
async function generate({ system, prompt, maxTokens } = {}) {
  const { apiKey, model } = getSettings();
  if (!apiKey) return { ok: false, error: 'no_key' };
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens || 1500,
        system,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = body?.error?.message || `HTTP ${res.status}`;
      return { ok: false, error: msg, status: res.status };
    }
    const text = (body.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    return { ok: true, text };
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) };
  }
}

const applySettings = (payload = {}) => {
  const cur = getSettings();
  return saveSettings({
    apiKey: payload.clearKey ? '' : (payload.apiKey || cur.apiKey),
    model: payload.model || cur.model,
  });
};

// Phone/tablet companion: same interface over the local network, synced through the career file here.
let companion = null;
function setupCompanion() {
  companion = createCompanion({
    root: __dirname,
    configFile: path.join(dataDir(), 'companion.json'),
    readState: () => readJson(dataFile(), null),
    writeState: (state) => writeJsonAtomic(dataFile(), state),
    getSettings,
    setSettings: applySettings,
    ai: generate,
    onRemoteState: (state) => toWindow('data:remote', state),
    onStatus: (st) => toWindow('companion:status', st),
    getLive: () => liveRace,
  });
  companion.autostart();
}
ipcMain.handle('companion:status', () => companion.status());
ipcMain.handle('companion:enable', (_e, on) => companion.setEnabled(on));
ipcMain.handle('companion:new-pin', () => companion.newPin());
ipcMain.handle('companion:forget', (_e, id) => companion.forget(id));

// F1 25 telemetry: finished sessions wait here until the window has logged them (so none is lost while it loads)
let telemetry = null; let pendingResults = [];
const replays = createReplays(dataDir); // every race driven with telemetry on, recorded for Race Replay
let liveRace = null; // the race being driven: its last full ERS profile and your battery now, for a window that (re)loads mid-race
function setupTelemetry() {
  const stashFile = () => path.join(dataDir(), 'telemetry-session.json');
  telemetry = createTelemetry({
    stash: { save: (o) => writeJsonAtomic(stashFile(), o), load: () => readJson(stashFile(), null), clear: () => { try { fs.unlinkSync(stashFile()); } catch { /* none */ } } },
    onResult: (r) => { pendingResults = [...pendingResults.filter(x => x.key !== r.key), r].slice(-20); toWindow('telemetry:result', r); },
    onStatus: (st) => toWindow('telemetry:status', st),
    onLive: (m) => { try { replays.onLive(m); } catch { /* a recording problem never stops the live feed */ } liveRace = m.done ? null : { ...(liveRace?.uid === m.uid ? liveRace : {}), ...m, pack: m.pack || (liveRace?.uid === m.uid ? liveRace.pack : null) }; toWindow('telemetry:live', m); try { companion?.live(m); } catch { /* a phone that's gone never stops the window's feed */ } },
  });
  telemetry.configure(readJson(telemetryFile(), { enabled: false, port: 20778 }));
}
ipcMain.handle('telemetry:status', () => telemetry.status());
ipcMain.handle('replay:list', () => replays.list());
ipcMain.handle('replay:load', (_e, key) => replays.load(key));
ipcMain.handle('replay:remove', (_e, key) => replays.remove(key));
ipcMain.handle('telemetry:configure', (_e, cfg) => { writeJsonAtomic(telemetryFile(), { enabled: !!cfg.enabled, port: +cfg.port || 20778 }); return telemetry.configure(cfg); });
ipcMain.handle('telemetry:pending', () => pendingResults);
ipcMain.handle('telemetry:live', () => liveRace);
ipcMain.handle('telemetry:ack', (_e, key) => { pendingResults = pendingResults.filter(x => x.key !== key); return true; });

app.whenReady().then(() => {
  setupCompanion();
  setupTelemetry();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('before-quit', () => { companion && companion.stop(); telemetry && telemetry.stop(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
