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
  companion: {
    status: () => ipcRenderer.invoke('companion:status'),
    enable: (on) => ipcRenderer.invoke('companion:enable', on),
    newPin: () => ipcRenderer.invoke('companion:new-pin'),
    forget: (id) => ipcRenderer.invoke('companion:forget', id),
    onStatus: (cb) => ipcRenderer.on('companion:status', (_e, st) => cb(st)),
  },
});
