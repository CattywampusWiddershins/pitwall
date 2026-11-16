const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  load: () => ipcRenderer.invoke('data:load'),
  save: (state, baseRev) => ipcRenderer.invoke('data:save', { state, baseRev }),
  location: () => ipcRenderer.invoke('data:location'),
  exportData: (state) => ipcRenderer.invoke('data:export', state),
  importData: () => ipcRenderer.invoke('data:import'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (s) => ipcRenderer.invoke('settings:set', s),
  ai: (req) => ipcRenderer.invoke('ai:generate', req),
  saveImage: (dataUrl, name) => ipcRenderer.invoke('image:save', { dataUrl, name }),
  // the real season's results (the Jolpica F1 API, fetched by the main process)
  real: { get: (path) => ipcRenderer.invoke('real:get', path) },
  // new versions, from the GitHub releases
  updates: {
    check: () => ipcRenderer.invoke('update:check'),
    open: (url) => ipcRenderer.invoke('update:open', url),
    download: () => ipcRenderer.invoke('update:download'),
    apply: () => ipcRenderer.invoke('update:apply'),
    onProgress: (cb) => ipcRenderer.on('update:progress', (_e, p) => cb(p)),
  },
  // edits made on a paired phone or tablet
  onRemote: (cb) => ipcRenderer.on('data:remote', (_e, msg) => cb(msg)),
  // F1 25 telemetry (desktop only)
  telemetry: {
    status: () => ipcRenderer.invoke('telemetry:status'),
    configure: (cfg) => ipcRenderer.invoke('telemetry:configure', cfg),
    pending: () => ipcRenderer.invoke('telemetry:pending'),
    ack: (key) => ipcRenderer.invoke('telemetry:ack', key),
    onStatus: (cb) => ipcRenderer.on('telemetry:status', (_e, st) => cb(st)),
    onResult: (cb) => ipcRenderer.on('telemetry:result', (_e, r) => cb(r)),
    live: () => ipcRenderer.invoke('telemetry:live'),
    traces: (uid, idxs) => ipcRenderer.invoke('telemetry:traces', uid, idxs),
    onLive: (cb) => ipcRenderer.on('telemetry:live', (_e, m) => cb(m)),
  },
  // backups kept on this PC
  backups: {
    list: () => ipcRenderer.invoke('backup:list'),
    now: (kind) => ipcRenderer.invoke('backup:now', kind),
    read: (file) => ipcRenderer.invoke('backup:read', file),
    folder: () => ipcRenderer.invoke('backup:folder'),
  },
  // recorded races (Race Replay)
  replays: {
    list: () => ipcRenderer.invoke('replay:list'),
    load: (key) => ipcRenderer.invoke('replay:load', key),
    remove: (key) => ipcRenderer.invoke('replay:remove', key),
  },
  // dev mode (features being tried out) and the race engineer in it
  dev: () => ipcRenderer.invoke('app:dev'),
  // the interface's size (Settings → Look): 0.8 to 1.6, or null to read it
  uiZoom: (z) => ipcRenderer.invoke('ui:zoom', z ?? null),
  // the editor (the car livery's calls answer in dev mode only)
  editor: {
    load: () => ipcRenderer.invoke('editor:load'),
    pickGame: () => ipcRenderer.invoke('editor:pick-game'),
    exportMod: (rgba, name, kind, res) => ipcRenderer.invoke('editor:export', rgba, name, kind, res),
    setTarget: (id) => ipcRenderer.invoke('editor:target', id),
    carLoad: (year) => ipcRenderer.invoke('editor:car-load', year),
    carModel: (year) => ipcRenderer.invoke('editor:car-model', year),
    carExport: (rgba, name, year) => ipcRenderer.invoke('editor:car-export', rgba, name, year),
    show: (dir) => ipcRenderer.invoke('editor:show', dir),
    savePng: (bytes, name) => ipcRenderer.invoke('editor:save-png', bytes, name),
    list: () => ipcRenderer.invoke('editor:list'),
    save: (d) => ipcRenderer.invoke('editor:save', d),
    open: (id) => ipcRenderer.invoke('editor:open', id),
    remove: (id) => ipcRenderer.invoke('editor:remove', id),
    exportDesign: (id, name) => ipcRenderer.invoke('editor:export-design', id, name),
    importDesign: () => ipcRenderer.invoke('editor:import-design'),
  },
  engineer: {
    status: () => ipcRenderer.invoke('engineer:status'),
    install: (kind, id) => ipcRenderer.invoke('engineer:install', kind, id),
    remove: (kind, id) => ipcRenderer.invoke('engineer:remove', kind, id),
    speak: (text, voice, opts) => ipcRenderer.invoke('engineer:speak', text, voice, opts),
    hear: (bytes, prompt, mode) => ipcRenderer.invoke('engineer:hear', bytes, prompt, mode),
    warm: (mode) => ipcRenderer.invoke('engineer:warm', mode),
    record: (x) => ipcRenderer.invoke('engineer:record', x),
    setKey: (acc) => ipcRenderer.invoke('engineer:key', acc),
    onButtons: (cb) => ipcRenderer.on('engineer:buttons', (_e, m) => cb(m)),
    onKey: (cb) => ipcRenderer.on('engineer:key', () => cb()),
    // the radio overlay over the game
    overlay: {
      set: (on) => ipcRenderer.invoke('overlay:set', on),
      edit: (on) => ipcRenderer.invoke('overlay:edit', on),
      reset: () => ipcRenderer.invoke('overlay:reset'),
      show: (payload) => ipcRenderer.send('overlay:show', payload),
      style: (st) => ipcRenderer.send('overlay:style', st),
      onEdited: (cb) => ipcRenderer.on('overlay:edited', () => cb()),
    },
  },
  companion: {
    status: () => ipcRenderer.invoke('companion:status'),
    enable: (on) => ipcRenderer.invoke('companion:enable', on),
    newPin: () => ipcRenderer.invoke('companion:new-pin'),
    forget: (id) => ipcRenderer.invoke('companion:forget', id),
    onStatus: (cb) => ipcRenderer.on('companion:status', (_e, st) => cb(st)),
  },
});
