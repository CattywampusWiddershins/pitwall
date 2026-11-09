// Companion server: serves the Pitwall interface to a phone or tablet on the same Wi-Fi and keeps both in sync.
// A device pairs once with the PIN shown in Settings and then holds its own key; the career file stays on this computer.
const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORTS = [8765, 8766, 8767, 8768];
const MAX_BODY = 80 * 1024 * 1024; // photos are stored inside the career data
const STATIC = {
  '/': ['src/index.html', 'text/html; charset=utf-8'],
  '/index.html': ['src/index.html', 'text/html; charset=utf-8'],
  '/styles.css': ['src/styles.css', 'text/css; charset=utf-8'],
  '/data.js': ['src/data.js', 'text/javascript; charset=utf-8'],
  '/reference.js': ['src/reference.js', 'text/javascript; charset=utf-8'],
  '/history.js': ['src/history.js', 'text/javascript; charset=utf-8'],
  '/assets.js': ['src/assets.js', 'text/javascript; charset=utf-8'],
  '/pool.js': ['src/pool.js', 'text/javascript; charset=utf-8'],
  '/pictures.js': ['src/pictures.js', 'text/javascript; charset=utf-8'],
  '/remote.js': ['src/remote.js', 'text/javascript; charset=utf-8'],
  '/manifest.webmanifest': ['src/manifest.webmanifest', 'application/manifest+json'],
  '/icon.png': ['build/icon.png', 'image/png'],
};
// Only the companion copy of the page gets the bridge switched on, the install metadata and a touch-friendly viewport.
const HEAD_EXTRA = `<meta name="pitwall-companion" content="1">
  <link rel="manifest" href="manifest.webmanifest">
  <link rel="apple-touch-icon" href="icon.png">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="theme-color" content="#0B0F17">`;

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const newPin = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');
const newRev = () => crypto.randomBytes(9).toString('base64url');
// The interface files bundled into the Android app; their hash tells the app whether it matches this computer.
// android/build.ps1 hashes the same files in the same order.
// the renderer's files (src/app/, in name order) come first
const appFiles = (root) => { try { return fs.readdirSync(path.join(root, 'src', 'app')).filter(f => f.endsWith('.js')).sort().map(f => 'src/app/' + f); } catch { return []; } };
const BUNDLE = ['src/data.js', 'src/reference.js', 'src/history.js', 'src/assets.js', 'src/pool.js', 'src/pictures.js', 'src/styles.css', 'src/remote.js', 'src/world.js', 'src/vendor/d3-array.min.js', 'src/vendor/d3-geo.min.js', 'src/vendor/topojson-client.min.js', 'src/index.html'];
function bundleHash(root) {
  const h = crypto.createHash('sha256');
  for (const f of [...appFiles(root), ...BUNDLE]) { try { h.update(fs.readFileSync(path.join(root, f))); } catch { } }
  return h.digest('hex').slice(0, 16);
}

function deviceName(ua = '') {
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && /Mobile/.test(ua))) return 'iPad';
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/Android/.test(ua)) return /Mobile/.test(ua) ? 'Android phone' : 'Android tablet';
  if (/Windows/.test(ua)) return 'Windows browser';
  if (/Macintosh/.test(ua)) return 'Mac browser';
  return 'Browser';
}

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.')) out.push(a.address);
  }
  // home networks first; virtual adapters (WSL, VPNs, Hyper-V) tend to sit in other ranges
  const rank = (ip) => ip.startsWith('192.168.') ? 0 : ip.startsWith('10.') ? 1 : ip.startsWith('172.') ? 2 : 3;
  return out.sort((a, b) => rank(a) - rank(b));
}

module.exports = function createCompanion({ root, configFile, readState, writeState, getSettings, setSettings, ai, onRemoteState, onStatus, getLive = () => null }) {
  let cfg = { enabled: false, devices: [] };
  try { cfg = { ...cfg, ...JSON.parse(fs.readFileSync(configFile, 'utf8')) }; } catch { }
  const saveCfg = () => { try { fs.mkdirSync(path.dirname(configFile), { recursive: true }); fs.writeFileSync(configFile, JSON.stringify(cfg, null, 2)); } catch (e) { console.error('companion config', e); } };

  // `rev` names the saved career file's current version; a device sends the rev its edits were based on, so a save
  // made on top of an older copy is refused and merged instead of overwriting. `id` identifies this computer.
  let dirtyCfg = false;
  if (!cfg.rev) { cfg.rev = newRev(); dirtyCfg = true; }
  if (!cfg.id) { cfg.id = crypto.randomBytes(8).toString('hex'); dirtyCfg = true; }
  if (dirtyCfg) saveCfg();

  let server = null, port = null, error = null;
  let pin = newPin();
  const clients = new Set(); // open event streams: { res, device }
  const fails = { n: 0, until: 0 };

  const status = () => ({
    enabled: !!cfg.enabled, running: !!server, port, error, pin,
    urls: port ? lanAddresses().map(ip => `http://${ip}:${port}`) : [],
    devices: cfg.devices.map(d => ({ id: d.id, name: d.name, added: d.added, lastSeen: d.lastSeen, online: [...clients].some(c => c.device.id === d.id) })),
  });
  const changed = () => onStatus && onStatus(status());

  function deviceFor(req, url) {
    const key = req.headers['x-pitwall-key'] || url.searchParams.get('k');
    if (!key) return null;
    const h = sha(key);
    return cfg.devices.find(d => d.hash.length === h.length && crypto.timingSafeEqual(Buffer.from(d.hash), Buffer.from(h))) || null;
  }
  // The Android app runs its own copy of the interface (so it works offline) and calls in from that origin.
  // Requests are authorised by the device key, never by cookies, so any origin may call.
  const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type, x-pitwall-key', 'access-control-allow-methods': 'GET, POST, PUT, OPTIONS', 'access-control-max-age': '600' };
  function send(res, code, body, type = 'application/json; charset=utf-8') {
    res.writeHead(code, { ...CORS, 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
    res.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
  }
  /** Save a new version unless it was edited from an older one (then hand back the current one to merge with). */
  function commit(state, baseRev, from) {
    // a device must say which version it edited; one that never loaded the career can't overwrite it
    if ((baseRev == null && from !== 'desktop') || (baseRev != null && baseRev !== cfg.rev)) return { conflict: true, rev: cfg.rev, state: readState() };
    writeState(state);
    cfg.rev = newRev(); saveCfg();
    broadcast(from);
    if (from !== 'desktop') onRemoteState({ state, rev: cfg.rev });
    return { ok: true, rev: cfg.rev };
  }
  function readBody(req) {
    return new Promise((resolve, reject) => {
      let size = 0; const parts = [];
      req.on('data', (c) => { size += c.length; if (size > MAX_BODY) { reject(new Error('too large')); req.destroy(); } else parts.push(c); });
      req.on('end', () => { try { resolve(parts.length ? JSON.parse(Buffer.concat(parts).toString('utf8')) : {}); } catch (e) { reject(e); } });
      req.on('error', reject);
    });
  }
  function broadcast(from) {
    const msg = `event: state\ndata: ${JSON.stringify({ rev: cfg.rev, from })}\n\n`;
    for (const c of clients) c.res.write(msg);
  }

  async function handle(req, res) {
    const url = new URL(req.url, 'http://x');
    const p = url.pathname;
    // the renderer's own files
    if (req.method === 'GET' && /^\/app\/[\w-]+\.js$/.test(p) && fs.existsSync(path.join(root, 'src', p))) return send(res, 200, fs.readFileSync(path.join(root, 'src', p)), 'text/javascript; charset=utf-8');
    if (req.method === 'GET' && STATIC[p]) {
      const [file, type] = STATIC[p];
      let body;
      try { body = fs.readFileSync(path.join(root, file)); } catch { return send(res, 404, { error: 'not found' }); }
      if (file.endsWith('index.html')) body = body.toString('utf8').replace('<head>', `<head>\n  ${HEAD_EXTRA}`);
      return send(res, 200, body, type);
    }
    if (req.method === 'GET' && (p === '/app' || p === '/pitwall.apk')) {
      // the Android app, built by android/build.ps1
      let apk;
      try { apk = fs.readFileSync(path.join(root, 'build', 'Pitwall.apk')); } catch { return send(res, 404, '<h1>The Android app hasn’t been built yet.</h1><p>Run <code>npm run build:android</code> on the computer.</p>', 'text/html; charset=utf-8'); }
      res.writeHead(200, { 'content-type': 'application/vnd.android.package-archive', 'content-disposition': 'attachment; filename="Pitwall.apk"', 'content-length': apk.length, 'cache-control': 'no-store' });
      return res.end(apk);
    }
    if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
    if (req.method === 'GET' && p === '/api/hello') return send(res, 200, { pitwall: true, name: os.hostname(), id: cfg.id, build: bundleHash(root) });
    if (!p.startsWith('/api/')) return send(res, 404, { error: 'not found' });

    if (p === '/api/pair' && req.method === 'POST') {
      if (Date.now() < fails.until) return send(res, 429, { error: 'Too many wrong PINs. Wait a minute and try again.' });
      const body = await readBody(req);
      if (String(body.pin || '').trim() !== pin) {
        if (++fails.n >= 5) { fails.n = 0; fails.until = Date.now() + 60000; }
        return send(res, 403, { error: 'Wrong PIN' });
      }
      fails.n = 0;
      const key = crypto.randomBytes(32).toString('hex');
      const dev = { id: crypto.randomBytes(6).toString('hex'), name: deviceName(req.headers['user-agent']), hash: sha(key), added: new Date().toISOString(), lastSeen: new Date().toISOString() };
      cfg.devices.push(dev); saveCfg();
      pin = newPin(); // one PIN, one device
      changed();
      return send(res, 200, { key, device: dev.id });
    }

    const dev = deviceFor(req, url);
    if (!dev) return send(res, 401, { error: 'unpaired' });
    dev.lastSeen = new Date().toISOString();

    if (p === '/api/events' && req.method === 'GET') {
      res.writeHead(200, { ...CORS, 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
      res.write(`retry: 2000\nevent: hello\ndata: ${JSON.stringify({ rev: cfg.rev })}\n\n`);
      const c = { res, device: dev };
      clients.add(c); changed();
      const beat = setInterval(() => res.write(': ping\n\n'), 20000);
      req.on('close', () => { clearInterval(beat); clients.delete(c); saveCfg(); changed(); });
      return;
    }
    if (p === '/api/state' && req.method === 'GET') return send(res, 200, { rev: cfg.rev, state: readState() });
    // the race being driven, for a device that opens (or reconnects) mid-race; updates follow on the event stream
    if (p === '/api/live' && req.method === 'GET') return send(res, 200, { live: getLive() });
    if (p === '/api/state' && req.method === 'PUT') {
      const body = await readBody(req);
      if (!body.state || !Array.isArray(body.state.careers)) return send(res, 400, { error: 'not a Pitwall save' });
      const r = commit(body.state, body.baseRev ?? null, String(body.from || 'device'));
      return send(res, r.conflict ? 409 : 200, r);
    }
    if (p === '/api/settings' && req.method === 'GET') { const s = getSettings(); return send(res, 200, { hasKey: !!s.apiKey, model: s.model }); }
    if (p === '/api/settings' && req.method === 'POST') { const body = await readBody(req); return send(res, 200, { ok: setSettings(body) }); }
    if (p === '/api/ai' && req.method === 'POST') { const body = await readBody(req); return send(res, 200, await ai(body)); }
    if (p === '/api/unpair' && req.method === 'POST') {
      cfg.devices = cfg.devices.filter(d => d !== dev); saveCfg(); changed();
      return send(res, 200, { ok: true });
    }
    return send(res, 404, { error: 'not found' });
  }

  function start() {
    if (server) return Promise.resolve(status());
    return new Promise((resolve) => {
      const tryPort = (i) => {
        if (i >= PORTS.length) { error = 'No free port (8765–8768 are all in use)'; changed(); return resolve(status()); }
        const s = http.createServer((req, res) => handle(req, res).catch((e) => { if (!res.headersSent) send(res, 500, { error: String(e.message || e) }); }));
        s.once('error', (e) => { if (e.code === 'EADDRINUSE') tryPort(i + 1); else { error = e.message; changed(); resolve(status()); } });
        s.listen(PORTS[i], '0.0.0.0', () => { server = s; port = PORTS[i]; error = null; changed(); resolve(status()); });
      };
      tryPort(0);
    });
  }
  function stop() {
    for (const c of clients) c.res.end();
    clients.clear();
    if (server) server.close();
    server = null; port = null; changed();
  }

  return {
    status,
    async setEnabled(on) { cfg.enabled = !!on; saveCfg(); if (on) await start(); else stop(); return status(); },
    autostart() { if (cfg.enabled) start(); },
    newPin() { pin = newPin(); changed(); return status(); },
    forget(id) { cfg.devices = id ? cfg.devices.filter(d => d.id !== id) : []; for (const c of [...clients]) if (!cfg.devices.includes(c.device)) { c.res.end(); clients.delete(c); } saveCfg(); changed(); return status(); },
    /** The desktop's own saves go through the same version check as a device's. */
    commit: (state, baseRev) => commit(state, baseRev, 'desktop'),
    rev: () => cfg.rev,
    /** Live Race on the devices: each update from the game goes out on the event stream as it reaches the window. */
    live(m) { if (!clients.size) return; const msg = `event: live
data: ${JSON.stringify(m)}

`; for (const c of clients) c.res.write(msg); },
    stop,
  };
};
