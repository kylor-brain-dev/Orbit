'use strict';
// Loaded into every tab, but exposes an API ONLY to Orbit's own browser:// pages.
// Websites get nothing: no Node, no IPC, no privileged objects.
const { contextBridge, ipcRenderer } = require('electron');
if (location.protocol === 'browser:' && location.host !== 'ui') {
  contextBridge.exposeInMainWorld('orbit', {
    invoke: (c, a) => ipcRenderer.invoke('page', c, a),
    on: (ch, cb) => { if (ch === 'downloads') ipcRenderer.on(ch, (_e, d) => cb(d)); }
  });
}
