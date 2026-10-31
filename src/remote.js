/* Companion bridge: stands in for the desktop's window.api on a phone or tablet, so the app works the same and
   saves land in the career file on the computer.
   - In a browser, the page is served by the computer and needs it running.
   - In the Android app, the page is bundled inside the app and a full copy of the career is kept on the device:
     it works with the computer off, and edits made meanwhile are merged in when the two reconnect. */
(function () {
  const meta = document.querySelector('meta[name="pitwall-companion"]');
  if (window.api || !meta) return;
  const android = window.PitwallAndroid;
  const inApp = meta.content === 'app' && !!android;
  const BUILD = document.querySelector('meta[name="pitwall-build"]')?.content || '';
  let base = inApp ? `http://${android.host()}/` : '';
  const me = Math.random().toString(36).slice(2, 10); // tells our own saves apart from other devices'

  const KEY = 'pitwall-companion-key';
  const readKey = () => { if (inApp) return android.getKey() || ''; try { return localStorage.getItem(KEY) || ''; } catch { return ''; } };
  const writeKey = (v) => { if (inApp) return android.setKey(v || ''); try { v ? localStorage.setItem(KEY, v) : localStorage.removeItem(KEY); } catch { } };
  let key = readKey();
  let online = false;

  // the device's own copy (app only): { state, base, baseRev, settings }. `base` is the last version agreed with
  // the computer, so edits made offline can be told apart from the computer's.
  let cache = null;
  if (inApp) { try { cache = JSON.parse(android.readCache() || 'null'); } catch { cache = null; } }
  const saveCache = () => { if (inApp && cache) android.writeCache(JSON.stringify(cache)); };
  // `base` must be a snapshot: the app keeps editing its live state object in place
  const snapshot = (v) => JSON.parse(JSON.stringify(v));

  function overlay(html) {
    let el = document.getElementById('pair');
    if (!el) { el = document.createElement('div'); el.id = 'pair'; el.className = 'pair'; document.body.appendChild(el); }
    el.innerHTML = html; el.hidden = false; return el;
  }
  const hideOverlay = () => { const el = document.getElementById('pair'); if (el) el.hidden = true; };
  function pill(id, cls, html) {
    let el = document.getElementById(id);
    if (!html) { if (el) el.hidden = true; return null; }
    if (!el) { el = document.createElement('div'); el.id = id; document.body.appendChild(el); }
    el.className = cls; el.innerHTML = html; el.hidden = false; return el;
  }
  // The link to the computer: a note for three seconds, which then slides up out of the way, and a thin line along the
  // top of the screen all the time (yellow while the computer is away, green when connected).
  let noteTimer = null;
  const linkState = (text) => {
    const el = pill('link-state', 'link-state', text); clearTimeout(noteTimer);
    if (!el) return;
    el.classList.remove('gone');
    noteTimer = setTimeout(() => { el.classList.add('gone'); noteTimer = setTimeout(() => { el.hidden = true; }, 400); }, 3000);
  };
  const linkLine = (on) => {
    let el = document.getElementById('link-line');
    if (!el) { el = document.createElement('div'); el.id = 'link-line'; el.setAttribute('aria-hidden', 'true'); document.body.appendChild(el); }
    el.className = 'link-line ' + (on ? 'on' : 'off'); el.title = on ? 'Connected to your computer' : 'Your computer is away: changes are kept on this device';
  };
  const say = (msg) => { if (typeof window.toast === 'function') window.toast(msg); };
  const brand = '<div class="brand-mark" style="color:#fff"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M3 17h7l3-10h8M7 12h5"/></svg></div>';

  async function fetchT(url, opts = {}, ms = 15000) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
    try { return await fetch(url, { ...opts, signal: ctl.signal }); } finally { clearTimeout(t); }
  }
  // In the app, calls to the computer go through the native side (see MainActivity.request), which keeps its own
  // connections and timeouts; the WebView's can stay stuck after the computer has been away.
  const waiting = new Map(); let seq = 0; let onEvent = null;
  window.__pw = {
    done(id, status, text) { const w = waiting.get(id); if (w) { waiting.delete(id); clearTimeout(w.t); w.resolve({ status, text }); } },
    event(name, data) { if (onEvent) onEvent(name, data); },
  };
  function native(method, path, body, ms) {
    return new Promise((resolve, reject) => {
      const id = 'r' + (++seq);
      const t = setTimeout(() => { waiting.delete(id); reject(new Error('timeout')); }, ms + 2000);
      waiting.set(id, { t, resolve: (r) => r.status ? resolve(r) : reject(new Error(r.text || 'unreachable')) });
      android.request(id, method, '/' + path, body === undefined ? null : JSON.stringify(body), ms);
    });
  }
  /** One HTTP call to the computer; answers like fetch's Response (status, ok, json()). */
  async function http(method, path, body, ms = 15000) {
    if (inApp) {
      const r = await native(method, path, body, ms);
      return { status: r.status, ok: r.status >= 200 && r.status < 300, json: async () => JSON.parse(r.text || 'null') };
    }
    return fetchT(path, { method, headers: { 'content-type': 'application/json', 'x-pitwall-key': key }, body: body === undefined ? undefined : JSON.stringify(body) }, ms);
  }
  /** Is Pitwall answering on the computer? Also notices when the computer has a newer version than this app. */
  async function reachable() {
    try {
      const r = await http('GET', 'api/hello', undefined, 2500);
      const h = await r.json();
      if (!h.pitwall) return false;
      if (inApp && h.build && BUILD && h.build !== BUILD) appUpdate();
      return true;
    } catch { return false; }
  }

  /**
   * The computer has a newer Pitwall than this app. The app downloads the matching version by itself, then one tap
   * installs it (Android may ask you to confirm; after the first time, Android 12 and later don't). An app from
   * before 3.15 can't install itself, so it gets the download link as before.
   */
  let updateStarted = false;
  function appUpdate() {
    if (!android.canUpdate) { pill('update-note', 'update-note', `Pitwall on your computer has been updated. <a href="${base}app">Install the new version of this app</a>`); return; }
    if (updateStarted) return; updateStarted = true;
    const show = (html) => pill('update-note', 'update-note', html);
    show('A new version of the app is downloading…');
    window.__pw.updateProgress = (pct) => { if (pct >= 0) show(`A new version of the app is downloading… ${pct}%`); };
    window.__pw.updateReady = () => show('A new version of the app is ready. <button class="btn sm primary" data-pw-install>Install</button> <button class="btn sm ghost" data-pw-later>Later</button>');
    window.__pw.updateFailed = (msg) => { updateStarted = false; show(`The app update didn’t work (${String(msg || 'unknown').replace(/[<>&]/g, '')}). <a href="${base}app">Download it instead</a>`); };
    android.downloadUpdate();
  }
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-pw-install]')) { pill('update-note', 'update-note', 'Installing the new version…'); android.installUpdate(); }
    else if (e.target.closest('[data-pw-later]')) pill('update-note', 'update-note', '');
  });

  /** Ask for the PIN shown in the desktop's Settings until it pairs. */
  function pair(message) {
    return new Promise((resolve) => {
      const el = overlay(`<form class="pair-card">${brand}
        <h1>Connect to Pitwall</h1>
        <p class="muted">On your computer, open Pitwall → Settings → Phone & tablet, and enter the 6-digit PIN shown there.</p>
        <input id="pair-pin" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]*" placeholder="000000" aria-label="PIN">
        <p class="pair-err" id="pair-err">${message || ''}</p>
        <button class="btn primary" type="submit">Connect</button>
        ${inApp ? '<button class="btn ghost" type="button" id="pair-other">Use a different computer</button>'
          : /Android/.test(navigator.userAgent) ? '<a class="muted" href="app" style="font-size:13px">Get the Pitwall app for Android</a>' : ''}
      </form>`);
      const input = el.querySelector('#pair-pin');
      setTimeout(() => input.focus(), 50);
      const other = el.querySelector('#pair-other');
      if (other) other.addEventListener('click', () => android.changeComputer());
      el.querySelector('form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const err = el.querySelector('#pair-err'); err.textContent = '';
        try {
          const r = await http('POST', 'api/pair', { pin: input.value.trim() });
          const body = await r.json().catch(() => ({}));
          if (!r.ok) { err.textContent = body.error || 'Could not connect'; input.select(); return; }
          key = body.key; writeKey(key); hideOverlay(); resolve();
        } catch { err.textContent = 'Can’t reach your computer. Is Pitwall open on it?'; }
      });
    });
  }
  /** Nothing saved on this device yet, so the computer is needed once. */
  function waitForComputer() {
    return new Promise((resolve) => {
      const el = overlay(`<div class="pair-card">${brand}
        <h1>Can’t reach your computer</h1>
        <p class="muted">Open Pitwall on your computer and turn on Settings → Phone & tablet. After the first sync, this ${inApp ? 'app' : 'page'} ${inApp ? 'works without the computer' : 'needs the computer running'}.</p>
        <button class="btn primary" type="button" id="wait-retry">Try again</button>
        ${inApp ? '<button class="btn ghost" type="button" id="wait-other">Use a different computer</button>' : ''}
      </div>`);
      const retry = async () => { if (await reachable()) { clearInterval(t); hideOverlay(); resolve(); } };
      const t = setInterval(retry, 4000);
      el.querySelector('#wait-retry').addEventListener('click', retry);
      const other = el.querySelector('#wait-other');
      if (other) other.addEventListener('click', () => android.changeComputer());
    });
  }

  async function call(method, path, body, ms) {
    const r = await http(method, path, body, ms);
    if (r.status === 401) { writeKey(''); key = ''; await pair('This device was disconnected. Enter a new PIN.'); return call(method, path, body, ms); }
    if (r.status === 409) return r.json();
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'HTTP ' + r.status);
    return r.json();
  }

  // the note shows once each time the computer goes away (it used to come back every time the app checked)
  let awayShown = false;
  function goOffline() {
    online = false; linkLine(false);
    if (awayShown) return;
    awayShown = true;
    linkState(inApp ? 'Offline · changes are kept on this device and sync when your computer is back' : 'Reconnecting to your computer…');
    if (inApp) setTimeout(() => { if (!online) android.rediscover(); }, 8000); // maybe the computer's address changed
  }

  function download(name, url) {
    const a = document.createElement('a'); a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
  }
  /** Save text or a data URL: through the Android app when inside it, otherwise as a browser download. */
  function saveAs(name, mime, { text, dataUrl }) {
    if (android) {
      const b64 = dataUrl ? dataUrl.slice(dataUrl.indexOf(',') + 1) : btoa(unescape(encodeURIComponent(text)));
      return android.saveFile(name, mime, b64);
    }
    const url = dataUrl || URL.createObjectURL(new Blob([text], { type: mime }));
    download(name, url);
    if (!dataUrl) setTimeout(() => URL.revokeObjectURL(url), 5000);
    return true;
  }

  window.api = {
    companion: true,
    inApp,
    build: BUILD,
    isOnline: () => online,
    async load() {
      online = await reachable();
      if (online && !key) await pair();
      // with a copy on the device, start from it straight away; the live link then brings in the computer's changes
      if (cache?.state) { if (!online) goOffline(); return { state: cache.state, base: cache.base, rev: cache.baseRev }; }
      if (!online) { await waitForComputer(); online = true; if (!key) await pair(); }
      // never start empty: an empty start would look like a deleted career
      let r = null;
      while (!r) {
        try { r = await call('GET', 'api/state'); if (!r || !r.state) throw new Error('no career data'); }
        catch { r = null; online = false; await waitForComputer(); online = true; }
      }
      if (inApp) { cache = { state: r.state, base: snapshot(r.state), baseRev: r.rev }; saveCache(); }
      return { state: r.state, rev: r.rev };
    },
    async save(state, baseRev) {
      if (inApp) { cache = { ...cache, state }; saveCache(); }
      if (!online) return { queued: true };
      try {
        const r = await call('PUT', 'api/state', { state, baseRev, from: me });
        if (r.conflict) return r;
        if (inApp) { cache.base = snapshot(state); cache.baseRev = r.rev; saveCache(); }
        return { ok: true, rev: r.rev };
      } catch (e) {
        // kept on the device; try again shortly (the live link, not one failed call, decides whether we're offline)
        if (inApp) { setTimeout(() => { if (online && typeof store !== 'undefined') store.save(); }, 5000); return { queued: true }; }
        throw e;
      }
    },
    /** The app took the computer's version as it is (nothing changed here). */
    adopted(state, rev) { if (inApp) { cache = { ...cache, state, base: snapshot(state), baseRev: rev }; saveCache(); } },
    async location() { return 'Saved on your computer'; },
    async exportData(state) {
      return saveAs(`pitwall-backup-${new Date().toISOString().slice(0, 10)}.json`, 'application/json', { text: JSON.stringify(state, null, 2) });
    },
    importData() {
      return new Promise((resolve) => {
        const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
        inp.addEventListener('change', async () => {
          const f = inp.files[0]; if (!f) return resolve(null);
          try { resolve(JSON.parse(await f.text())); } catch { resolve({}); }
        });
        inp.addEventListener('cancel', () => resolve(null));
        inp.click();
      });
    },
    async getSettings() {
      if (!online) return cache?.settings || { hasKey: false, model: '' };
      try { const s = await call('GET', 'api/settings', undefined, 4000); if (inApp) { cache = { ...cache, settings: s }; saveCache(); } return s; }
      catch { return cache?.settings || { hasKey: false, model: '' }; }
    },
    async setSettings(s) { if (!online) throw new Error('Connect to your computer to change AI settings'); return call('POST', 'api/settings', s); },
    async ai(req) { if (!online) return { ok: false, error: 'Your computer is offline, so AI journalists aren’t available' }; return call('POST', 'api/ai', req, 120000); },
    async saveImage(dataUrl, name) { return saveAs(name || 'pitwall-weekend.png', 'image/png', { dataUrl }); },
    async unpair() { try { await call('POST', 'api/unpair', {}); } catch { } writeKey(''); if (inApp) android.changeComputer(); else location.reload(); },
    changeComputer() { if (android) android.changeComputer(); },
    /** Live link: on (re)connecting, and whenever another device saves, hand the app the computer's version. */
    onRemote(cb) {
      const pull = async () => { const r = await call('GET', 'api/state'); cb({ state: r.state, rev: r.rev }); };
      const hello = async () => {
        const was = online; online = true; awayShown = false; linkState(''); linkLine(true);
        reachable();
        try { await pull(); if (!was && inApp) say('Synced with your computer'); } catch { }
      };
      const changed = async (data) => {
        const d = JSON.parse(data || '{}');
        if (d.from === me) return;
        try { await pull(); } catch { }
      };
      if (inApp) {
        // the native side follows the event stream and keeps reconnecting while the computer is away
        onEvent = (name, data) => { if (name === 'hello') hello(); else if (name === 'state') changed(data); else if (name === 'down') goOffline(); };
        android.listen();
        window.pitwallHostChanged = (h) => { base = `http://${h}/`; android.listen(); };
        return;
      }
      let es = null;
      const open = () => {
        if (es) es.close();
        if (!key) return;
        es = new EventSource('api/events?k=' + encodeURIComponent(key));
        es.addEventListener('hello', hello);
        es.addEventListener('state', (e) => changed(e.data));
        es.onerror = () => goOffline();
      };
      open();
      setInterval(() => { if (!es || es.readyState === 2) open(); }, 5000);
      document.addEventListener('visibilitychange', () => { if (!document.hidden && !online) open(); });
    },
  };
})();
