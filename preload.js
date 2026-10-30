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
    onLive: (cb) => ipcRenderer.on('telemetry:live', (_e, m) => cb(m)),
  },
  // recorded races (Race Replay)
  replays: {
    list: () => ipcRenderer.invoke('replay:list'),
    load: (key) => ipcRenderer.invoke('replay:load', key),
    remove: (key) => ipcRenderer.invoke('replay:remove', key),
  },
  companion: {
    status: () => ipcRenderer.invoke('companion:status'),
    enable: (on) => ipcRenderer.invoke('companion:enable', on),
    newPin: () => ipcRenderer.invoke('companion:new-pin'),
    forget: (id) => ipcRenderer.invoke('companion:forget', id),
    onStatus: (cb) => ipcRenderer.on('companion:status', (_e, st) => cb(st)),
  },
});
