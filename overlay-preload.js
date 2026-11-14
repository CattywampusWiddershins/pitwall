// The radio overlay's window: it only receives the radio graphic to show, and says when you're done moving it.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('overlay', {
  onShow: (cb) => ipcRenderer.on('overlay:show', (_e, p) => cb(p)),
  onEdit: (cb) => ipcRenderer.on('overlay:edit', (_e, on) => cb(on)),
  onStyle: (cb) => ipcRenderer.on('overlay:style', (_e, st) => cb(st)),
  done: () => ipcRenderer.send('overlay:done'),
});
