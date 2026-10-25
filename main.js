const { app, BrowserWindow, ipcMain, dialog, safeStorage, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const createCompanion = require('./companion');

const dataDir = () => app.getPath('userData');
const dataFile = () => path.join(dataDir(), 'career-data.json');
const settingsFile = () => path.join(dataDir(), 'settings.json');

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
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });
}

ipcMain.handle('data:load', () => { backupOnce(); return { state: readJson(dataFile(), null), rev: companion.rev() }; });
ipcMain.handle('data:save', (_e, { state, baseRev }) => companion.commit(state, baseRev));
ipcMain.handle('data:location', () => dataFile());

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
  });
  companion.autostart();
}
ipcMain.handle('companion:status', () => companion.status());
ipcMain.handle('companion:enable', (_e, on) => companion.setEnabled(on));
ipcMain.handle('companion:new-pin', () => companion.newPin());
ipcMain.handle('companion:forget', (_e, id) => companion.forget(id));

app.whenReady().then(() => {
  setupCompanion();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('before-quit', () => companion && companion.stop());
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
